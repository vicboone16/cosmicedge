import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Import players from CSV — two modes:
 *   1. "roster" — full player records (Name, Team, Position, League, BirthDate, BirthPlace)
 *   2. "birthtime" — update existing players (Name, League, BirthTime, BirthPlace)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "roster"; // "roster" | "birthtime"
    const leagueOverride = (formData.get("league") as string) || "";

    if (!file) throw new Error("No file uploaded");

    // Input validation: file size limit (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Maximum 10MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("CSV must have header + data rows");

    // Input validation: row count limit
    const MAX_ROWS = 50000;
    if (lines.length > MAX_ROWS) {
      return new Response(JSON.stringify({ error: `Too many rows. Maximum ${MAX_ROWS}.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the actual header row — skip title rows that don't look like headers
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const rowCols = lines[i].split(",").map((h: string) => h.trim().replace(/"/g, "").toLowerCase());
      if (rowCols.some((h: string) => ["name", "player", "playername"].includes(h))) {
        headerIdx = i;
        break;
      }
    }
    console.log(`[import-players-csv] Header row index: ${headerIdx}, line: ${lines[headerIdx]}`);

    const headers = lines[headerIdx].split(",").map((h) => h.trim().replace(/"/g, ""));
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    // Column index finder
    const col = (names: string[]): number =>
      lowerHeaders.findIndex((h) => names.includes(h));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Parse CSV rows (simple — handles quoted commas)
    function parseRow(line: string): string[] {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    }

    if (mode === "roster") {
      // ── Roster import ──
      const nameIdx = col(["name", "player", "playername"]);
      const teamIdx = col(["team", "teamabbr", "team_abbr"]);
      const posIdx = col(["position", "pos"]);
      const leagueIdx = col(["league", "sport"]);
      const bdIdx = col(["birthdate", "birth_date", "dob", "dateofbirth"]);
      const bpIdx = col(["birthplace", "birth_place", "birthcity", "birth_city"]);
      const btIdx = col(["birthtime", "birth_time"]);
      const extIdx = col(["externalid", "external_id", "playerid", "player_id"]);

      if (nameIdx === -1) throw new Error("CSV must have a Name column");

      const records: any[] = [];
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const vals = parseRow(lines[i]);
        let name = vals[nameIdx];
        if (!name) continue;
        // Normalize "Last, First" → "First Last"
        if (name.includes(",")) {
          name = name.split(",").map((s: string) => s.trim()).reverse().join(" ");
        }

        const league = leagueOverride || (leagueIdx !== -1 ? vals[leagueIdx]?.toUpperCase() : "") || "NBA";
        const record: any = {
          name,
          league,
          team: teamIdx !== -1 ? vals[teamIdx] || null : null,
          position: posIdx !== -1 ? vals[posIdx] || null : null,
          birth_date: bdIdx !== -1 ? vals[bdIdx] || null : null,
          birth_place: bpIdx !== -1 ? vals[bpIdx] || null : null,
          birth_time: btIdx !== -1 ? vals[btIdx] || null : null,
          natal_data_quality: bdIdx !== -1 && vals[bdIdx] ? (btIdx !== -1 && vals[btIdx] ? "A" : "B") : "C",
        };
        if (extIdx !== -1 && vals[extIdx]) record.external_id = vals[extIdx];
        records.push(record);
      }

      // Batch upsert — match on name+league for records without external_id
      const BATCH = 100;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        
        // Split: records with external_id upsert on external_id; others match on name+league
        const withExt = batch.filter((r: any) => r.external_id);
        const withoutExt = batch.filter((r: any) => !r.external_id);

        if (withExt.length > 0) {
          const { error } = await supabase
            .from("players")
            .upsert(withExt, { onConflict: "external_id", ignoreDuplicates: false });
          if (error) errors.push(`Ext batch ${i}: ${error.message}`);
          else inserted += withExt.length;
        }

        // For records without external_id, check if player exists by name+league
        for (const rec of withoutExt) {
          const { data: existing } = await supabase
            .from("players")
            .select("id")
            .eq("name", rec.name)
            .eq("league", rec.league)
            .maybeSingle();

          if (existing) {
            const updateData: any = {};
            if (rec.team) updateData.team = rec.team;
            if (rec.position) updateData.position = rec.position;
            if (rec.birth_date) updateData.birth_date = rec.birth_date;
            if (rec.birth_place) updateData.birth_place = rec.birth_place;
            if (rec.birth_time) updateData.birth_time = rec.birth_time;
            if (rec.natal_data_quality) updateData.natal_data_quality = rec.natal_data_quality;

            if (Object.keys(updateData).length > 0) {
              const { error } = await supabase.from("players").update(updateData).eq("id", existing.id);
              if (error) errors.push(`Update ${rec.name}: ${error.message}`);
              else updated++;
            } else {
              skipped++;
            }
          } else {
            const { error } = await supabase.from("players").insert(rec);
            if (error) errors.push(`Insert ${rec.name}: ${error.message}`);
            else inserted++;
          }
        }
      }
    } else if (mode === "birthtime") {
      // ── Birth data update mode — BirthTime is optional; BirthDate and BirthPlace are also accepted ──
      const nameIdx = col(["name", "player", "playername"]);
      const leagueIdx = col(["league", "sport"]);
      const btIdx = col(["birthtime", "birth_time", "time", "time of birth"]);
      const bdIdx = col(["birthdate", "birth_date", "dob", "dateofbirth", "date of birth", "born", "birthday"]);
      const bpIdx = col(["birthplace", "birth_place", "birthcity", "birth_city", "city", "place of birth", "hometown"]);

      // Log what columns were detected
      console.log(`[import-players-csv] birthtime mode — headers: ${JSON.stringify(lowerHeaders)}`);
      console.log(`[import-players-csv] nameIdx=${nameIdx}, leagueIdx=${leagueIdx}, btIdx=${btIdx}, bdIdx=${bdIdx}, bpIdx=${bpIdx}`);

      if (nameIdx === -1) {
        throw new Error("CSV must have a Name column");
      }

      // Helper: parse long-form date like "September 27, 1999" → "1999-09-27"
      function parseBirthDate(raw: string | null): string | null {
        if (!raw) return null;
        const trimmed = raw.trim();
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        // Try long-form: "Month D, YYYY" or "Month DD, YYYY"
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        }
        return trimmed; // fallback — pass through as-is
      }

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const vals = parseRow(lines[i]);
        let name = vals[nameIdx];
        if (!name) { skipped++; continue; }
        // Normalize "Last, First" → "First Last"
        if (name.includes(",")) {
          name = name.split(",").map((s: string) => s.trim()).reverse().join(" ");
        }

        const birthTime = btIdx !== -1 ? (vals[btIdx] || null) : null;
        const birthDate = parseBirthDate(bdIdx !== -1 ? (vals[bdIdx] || null) : null);
        const birthPlace = bpIdx !== -1 ? (vals[bpIdx] || null) : null;

        // Skip row only if absolutely nothing to update
        if (!birthTime && !birthDate && !birthPlace) { skipped++; continue; }

        // Determine league — require explicit source, no silent NBA default
        const leagueFromCsv = leagueIdx !== -1 ? vals[leagueIdx]?.toUpperCase().trim() : "";
        const league = leagueOverride || leagueFromCsv;
        if (!league) {
          errors.push(`${name}: no League column in CSV and no league override specified`);
          skipped++;
          continue;
        }

        const updateData: any = {};
        if (birthTime) updateData.birth_time = birthTime;
        if (birthDate) updateData.birth_date = birthDate;
        if (birthPlace) updateData.birth_place = birthPlace;

        // Compute quality: A = has time, B = has date only, C = no date
        if (birthTime) {
          updateData.natal_data_quality = "A";
        } else if (birthDate) {
          updateData.natal_data_quality = "B";
        }
        // If only birth_place, don't downgrade existing quality — skip quality field

        const { data, error } = await supabase
          .from("players")
          .update(updateData)
          .eq("name", name)
          .eq("league", league)
          .select("id");

        if (error) {
          errors.push(`${name}: ${error.message}`);
        } else if (!data || data.length === 0) {
          errors.push(`${name}: not found in ${league}`);
          skipped++;
        } else {
          updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, updated, skipped, errors: errors.slice(0, 20), total: lines.length - 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("import-players-csv error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
