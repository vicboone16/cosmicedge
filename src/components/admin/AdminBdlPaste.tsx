import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ClipboardPaste, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PERIOD_OPTIONS = [
  { value: "full", label: "Full Game" },
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
  { value: "1H", label: "1st Half" },
  { value: "2H", label: "2nd Half" },
  { value: "OT", label: "OT1" },
  { value: "OT2", label: "OT2" },
];

interface BdlStatRow {
  id: number;
  min: string;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  pf: number;
  pts: number;
  plus_minus: number;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
    team_id: number;
  };
  team: {
    id: number;
    abbreviation: string;
  };
  game: {
    id: number;
    date: string;
    status: string;
    home_team_score: number;
    visitor_team_score: number;
    datetime: string;
    home_q1: number | null;
    home_q2: number | null;
    home_q3: number | null;
    home_q4: number | null;
    visitor_q1: number | null;
    visitor_q2: number | null;
    visitor_q3: number | null;
    visitor_q4: number | null;
    home_team_id: number;
    visitor_team_id: number;
  };
}

export default function AdminBdlPaste() {
  const [raw, setRaw] = useState("");
  const [period, setPeriod] = useState("full");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const ingest = async () => {
    setLoading(true);
    setLog([]);
    const lines: string[] = [];

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Invalid JSON");
      }

      const items: BdlStatRow[] = Array.isArray(parsed)
        ? parsed
        : parsed.data && Array.isArray(parsed.data)
        ? parsed.data
        : [];

      if (items.length === 0) throw new Error("No stat rows found in JSON");
      lines.push(`Parsed ${items.length} stat rows`);

      // Group by game
      const gameMap = new Map<number, BdlStatRow[]>();
      for (const item of items) {
        const gid = item.game.id;
        if (!gameMap.has(gid)) gameMap.set(gid, []);
        gameMap.get(gid)!.push(item);
      }

      for (const [bdlGameId, rows] of gameMap) {
        const g = rows[0].game;
        const gameDate = g.date || g.datetime?.split("T")[0];

        // Determine home/away abbreviations
        const homeTeamId = g.home_team_id;
        const visitorTeamId = g.visitor_team_id;
        const homeAbbr = rows.find(r => r.team.id === homeTeamId)?.team.abbreviation;
        const awayAbbr = rows.find(r => r.team.id === visitorTeamId)?.team.abbreviation;

        if (!homeAbbr || !awayAbbr) {
          lines.push(`⚠ Could not determine home/away abbreviations for BDL game ${bdlGameId}`);
          continue;
        }

        lines.push(`\nGame: ${awayAbbr} @ ${homeAbbr} (${gameDate})`);

        // Find internal game
        const { data: dbGame } = await supabase
          .from("games")
          .select("id")
          .eq("league", "NBA")
          .eq("home_abbr", homeAbbr)
          .eq("away_abbr", awayAbbr)
          .gte("start_time", gameDate + "T00:00:00Z")
          .lte("start_time", (gameDate + "T23:59:59Z"))
          .maybeSingle();

        // Also try ±1 day
        let gameKey = dbGame?.id;
        if (!gameKey) {
          const nextDay = new Date(gameDate + "T12:00:00Z");
          nextDay.setDate(nextDay.getDate() + 1);
          const prevDay = new Date(gameDate + "T12:00:00Z");
          prevDay.setDate(prevDay.getDate() - 1);

          const { data: fuzzy } = await supabase
            .from("games")
            .select("id")
            .eq("league", "NBA")
            .eq("home_abbr", homeAbbr)
            .eq("away_abbr", awayAbbr)
            .gte("start_time", prevDay.toISOString().split("T")[0] + "T00:00:00Z")
            .lte("start_time", nextDay.toISOString().split("T")[0] + "T23:59:59Z")
            .maybeSingle();
          gameKey = fuzzy?.id;
        }

        if (!gameKey) {
          lines.push(`  ⚠ No matching game found in DB`);
          continue;
        }

        // Update game scores + status
        const status = g.status?.toLowerCase() === "final" ? "final" : g.status?.toLowerCase() || "scheduled";
        await supabase.from("games").update({
          home_score: g.home_team_score,
          away_score: g.visitor_team_score,
          status,
          updated_at: new Date().toISOString(),
        }).eq("id", gameKey);
        lines.push(`  ✅ Scores: ${homeAbbr} ${g.home_team_score} - ${awayAbbr} ${g.visitor_team_score} (${status})`);

        // Quarter scores
        const quarters = [
          { q: 1, h: g.home_q1, a: g.visitor_q1 },
          { q: 2, h: g.home_q2, a: g.visitor_q2 },
          { q: 3, h: g.home_q3, a: g.visitor_q3 },
          { q: 4, h: g.home_q4, a: g.visitor_q4 },
        ].filter(x => x.h != null && x.a != null);

        for (const q of quarters) {
          await supabase.from("game_quarters").upsert({
            game_id: gameKey,
            quarter: q.q,
            home_score: q.h,
            away_score: q.a,
          }, { onConflict: "game_id,quarter" });
        }
        if (quarters.length) lines.push(`  ✅ ${quarters.length} quarter scores`);

        // Player stats
        let playerCount = 0;
        let createdPlayers = 0;
        for (const row of rows) {
          const playerName = `${row.player.first_name} ${row.player.last_name}`.trim();
          if (!playerName) continue;

          const teamAbbr = row.team.abbreviation;

          // Find or create player
          let { data: pl } = await supabase
            .from("players")
            .select("id")
            .eq("name", playerName)
            .eq("league", "NBA")
            .maybeSingle();

          if (!pl) {
            const { data: newPl } = await supabase.from("players").insert({
              name: playerName,
              team: teamAbbr,
              position: row.player.position || "",
              league: "NBA",
            }).select("id").single();
            pl = newPl;
            createdPlayers++;
          }

          if (!pl) continue;

          const minutes = row.min ? parseFloat(row.min) : 0;

          await supabase.from("player_game_stats").upsert({
            player_id: pl.id,
            game_id: gameKey,
            team_abbr: teamAbbr,
            period,
            points: row.pts ?? 0,
            rebounds: row.reb ?? 0,
            assists: row.ast ?? 0,
            steals: row.stl ?? 0,
            blocks: row.blk ?? 0,
            turnovers: row.turnover ?? 0,
            minutes,
            fg_made: row.fgm ?? 0,
            fg_attempted: row.fga ?? 0,
            three_made: row.fg3m ?? 0,
            three_attempted: row.fg3a ?? 0,
            ft_made: row.ftm ?? 0,
            ft_attempted: row.fta ?? 0,
            off_rebounds: row.oreb ?? 0,
            def_rebounds: row.dreb ?? 0,
            plus_minus: row.plus_minus ?? 0,
          }, { onConflict: "player_id,game_id,period" });
          playerCount++;
        }
        lines.push(`  ✅ ${playerCount} player stats${createdPlayers > 0 ? ` (${createdPlayers} new players created)` : ""}`);
      }

      toast.success(`Ingestion complete: ${gameMap.size} game(s)`);
    } catch (e: any) {
      lines.push(`❌ ${e.message}`);
      toast.error(e.message);
    } finally {
      setLog(lines);
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
        <ClipboardPaste className="h-4 w-4 text-primary" />
        BDL JSON Paste Ingestion
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Paste raw BDL <code>/v1/stats</code> JSON output. Auto-resolves games, creates missing players, upserts box scores + quarter scores.
      </p>
      <Textarea
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder='Paste BDL JSON here... { "data": [...] }'
        className="h-32 text-xs font-mono mb-3"
      />
      <div className="flex items-center gap-3 mb-3">
        <Button size="sm" onClick={ingest} disabled={loading || !raw.trim()}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3 w-3 mr-1.5" />}
          {loading ? "Ingesting…" : "Ingest Box Scores"}
        </Button>
        {raw.trim() && (
          <Badge variant="outline" className="text-[10px]">
            {(raw.match(/"id":/g) || []).length} potential rows
          </Badge>
        )}
      </div>
      {log.length > 0 && (
        <div className="bg-secondary/30 rounded-lg p-3 max-h-64 overflow-y-auto">
          {log.map((line, i) => (
            <p key={i} className="text-[10px] text-foreground font-mono whitespace-pre-wrap">{line}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
