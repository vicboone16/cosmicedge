import { useState, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, Calculator, TrendingUp, Shield, Zap, RefreshCw } from "lucide-react";

// ── Betting math ──────────────────────────────────────────────────────────────

function toDecimal(american: number): number {
  if (!isFinite(american) || american === 0) return 1;
  return american >= 100 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

function toAmerican(decimal: number): number {
  if (decimal < 1.01) return -10000;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function impliedPct(american: number): number {
  return (1 / toDecimal(american)) * 100;
}

function calcEV(american: number, trueProb: number): number {
  const d = toDecimal(american);
  return trueProb * (d - 1) - (1 - trueProb);
}

function calcKelly(american: number, trueProb: number): number {
  const d = toDecimal(american);
  const b = d - 1;
  return Math.max(0, (b * trueProb - (1 - trueProb)) / b);
}

// ── CSV utilities ─────────────────────────────────────────────────────────────

function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let inQ = false, cell = "";
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if ((ch === "," || ch === "\t") && !inQ) { cols.push(cell.trim()); cell = ""; continue; }
    cell += ch;
  }
  cols.push(cell.trim());
  return cols;
}

function parseCSV(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = splitCSVLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

type ColMap = Record<"game"|"market"|"selection"|"line"|"odds"|"stake"|"result"|"notes"|"date", string>;

function autoMap(headers: string[]): ColMap {
  const find = (...keys: string[]) =>
    headers.find(h => keys.some(k => h.toLowerCase().includes(k))) ?? "";
  return {
    game:      find("game", "matchup", "event", "fixture"),
    market:    find("market", "type", "bet type", "category"),
    selection: find("selection", "pick", "team", "player", "side"),
    line:      find("line", "spread", "handicap", "total"),
    odds:      find("odds", "price", "ml", "moneyline"),
    stake:     find("stake", "wager", "unit", "amount", "risk", "bet"),
    result:    find("result", "outcome", "w/l", "won", "status"),
    notes:     find("note", "comment", "reason", "why"),
    date:      find("date", "time", "datetime", "game date"),
  };
}

function normaliseResult(val: string): { result: string; status: string } | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "-") return null;
  if (["w", "win", "won", "1", "yes"].includes(v)) return { result: "win", status: "settled" };
  if (["l", "loss", "lost", "0", "no"].includes(v)) return { result: "loss", status: "settled" };
  if (["p", "push", "tie", "draw"].includes(v)) return { result: "push", status: "settled" };
  return null;
}

// ── Quick-parse natural input ─────────────────────────────────────────────────

interface QuickParsed {
  selection: string;
  line: string;
  odds: string;
  stake: string;
  market: string;
}

function quickParse(text: string): QuickParsed {
  const out: QuickParsed = { selection: "", line: "", odds: "", stake: "", market: "" };
  const oddsMatch = text.match(/([+-]\d{3,4})(?:\b|$)/);
  if (oddsMatch) { out.odds = oddsMatch[1]; text = text.replace(oddsMatch[0], "").trim(); }
  const stakeMatch = text.match(/\$?(\d+(?:\.\d+)?)\s*(?:unit|u\b|\$)?/i);
  if (stakeMatch && Number(stakeMatch[1]) <= 5000) { out.stake = stakeMatch[1]; text = text.replace(stakeMatch[0], "").trim(); }
  const spreadMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:pts?|points?)?/);
  if (spreadMatch && Math.abs(Number(spreadMatch[1])) <= 40) { out.line = spreadMatch[1]; text = text.replace(spreadMatch[0], "").trim(); }
  out.selection = text.trim();
  if (/over|under|o\/u|total/i.test(out.selection)) out.market = "total";
  else if (out.line) out.market = "spread";
  else if (out.odds) out.market = "moneyline";
  return out;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="cosmic-card rounded-xl p-3 text-center">
      <p className={cn("text-base font-bold font-display tabular-nums", color ?? "text-foreground")}>{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Single Bet Calculator ─────────────────────────────────────────────────────

function SingleBetCalc({ userId, onQuickFill }: { userId: string; onQuickFill?: QuickParsed | null }) {
  const qc = useQueryClient();
  const [stake, setStake] = useState(onQuickFill?.stake ?? "100");
  const [odds, setOdds] = useState(onQuickFill?.odds ?? "-110");
  const [selection, setSelection] = useState(onQuickFill?.selection ?? "");
  const [market, setMarket] = useState(onQuickFill?.market ?? "moneyline");
  const [line, setLine] = useState(onQuickFill?.line ?? "");
  const [saving, setSaving] = useState(false);

  const s = Number(stake) || 0;
  const o = parseInt(odds, 10) || -110;
  const dec = toDecimal(o);
  const win = s * (dec - 1);
  const ret = s * dec;
  const imp = impliedPct(o);

  const handleSave = async () => {
    if (!selection.trim() || !s || !o) { toast({ title: "Fill in selection + odds + stake" }); return; }
    setSaving(true);
    const { error } = await supabase.from("bets").insert({
      user_id: userId,
      selection: selection.trim(),
      market_type: market || "moneyline",
      line: line ? parseFloat(line) : null,
      odds: o,
      stake_amount: s,
      status: "open",
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Bet saved to ledger ✓" });
    qc.invalidateQueries({ queryKey: ["skyspread-bets"] });
    setSelection(""); setStake("100"); setOdds("-110"); setLine("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Selection / Team / Player</Label>
          <Input placeholder="e.g. Lakers, LeBron James points" value={selection} onChange={e => setSelection(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Market</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={market} onChange={e => setMarket(e.target.value)}
          >
            <option value="moneyline">Moneyline</option>
            <option value="spread">Spread</option>
            <option value="total">Total (O/U)</option>
            <option value="prop">Player Prop</option>
            <option value="parlay">Parlay</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Line {market === "spread" ? "(e.g. -5.5)" : market === "total" ? "(e.g. 224.5)" : "(optional)"}</Label>
          <Input placeholder={market === "spread" ? "-5.5" : market === "total" ? "224.5" : "—"} value={line} onChange={e => setLine(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Odds (American)</Label>
          <Input placeholder="-110" value={odds} onChange={e => setOdds(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Stake ($)</Label>
          <Input type="number" min="0" placeholder="100" value={stake} onChange={e => setStake(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatBox label="To Win" value={`$${win.toFixed(2)}`} color="text-cosmic-green" />
        <StatBox label="Return" value={`$${ret.toFixed(2)}`} />
        <StatBox label="Implied" value={`${imp.toFixed(1)}%`} sub="book prob" />
        <StatBox label="ROI" value={`${((win / Math.max(s, 0.01)) * 100).toFixed(0)}%`} />
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" /> : <Plus className="h-3.5 w-3.5 mr-2" />}
        {saving ? "Saving…" : "Save to Ledger"}
      </Button>
    </div>
  );
}

// ── Parlay Builder ────────────────────────────────────────────────────────────

function ParlayBuilder({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [legs, setLegs] = useState([
    { id: 1, name: "", odds: "-110" },
    { id: 2, name: "", odds: "-110" },
  ]);
  const [stake, setStake] = useState("20");
  const [saving, setSaving] = useState(false);
  const nextId = useRef(3);

  const addLeg = () => { setLegs(l => [...l, { id: nextId.current++, name: "", odds: "-110" }]); };
  const removeLeg = (id: number) => { setLegs(l => l.filter(x => x.id !== id)); };
  const updateLeg = (id: number, field: "name" | "odds", val: string) =>
    setLegs(l => l.map(x => x.id === id ? { ...x, [field]: val } : x));

  const combinedDecimal = useMemo(
    () => legs.reduce((acc, leg) => acc * toDecimal(parseInt(leg.odds, 10) || -110), 1),
    [legs]
  );
  const combinedAmerican = toAmerican(combinedDecimal);
  const s = Number(stake) || 0;
  const payout = s * combinedDecimal;
  const impliedP = (1 / combinedDecimal) * 100;

  const handleSave = async () => {
    if (!s) { toast({ title: "Enter a stake" }); return; }
    setSaving(true);
    const legNames = legs.filter(l => l.name.trim()).map(l => l.name.trim()).join(" + ") || "Parlay";
    const { error } = await supabase.from("bets").insert({
      user_id: userId,
      selection: legNames,
      market_type: "parlay",
      odds: combinedAmerican,
      stake_amount: s,
      status: "open",
      notes: legs.map(l => `${l.name || "Leg"}: ${l.odds}`).join(" | "),
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Parlay saved to ledger ✓" });
    qc.invalidateQueries({ queryKey: ["skyspread-bets"] });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {legs.map((leg, i) => (
          <div key={leg.id} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-bold w-4 shrink-0">L{i + 1}</span>
            <Input
              placeholder="Selection / team / player"
              value={leg.name}
              onChange={e => updateLeg(leg.id, "name", e.target.value)}
              className="flex-1 text-sm"
            />
            <Input
              placeholder="-110"
              value={leg.odds}
              onChange={e => updateLeg(leg.id, "odds", e.target.value)}
              className="w-20 text-sm tabular-nums"
            />
            {legs.length > 2 && (
              <button onClick={() => removeLeg(leg.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addLeg} className="text-[11px] text-primary flex items-center gap-1 hover:opacity-80">
        <Plus className="h-3 w-3" /> Add Leg
      </button>

      <div className="space-y-1.5">
        <Label className="text-xs">Stake ($)</Label>
        <Input type="number" min="0" value={stake} onChange={e => setStake(e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Legs" value={String(legs.length)} />
        <StatBox
          label="Combined"
          value={combinedAmerican > 0 ? `+${combinedAmerican}` : String(combinedAmerican)}
          color="text-cosmic-cyan"
        />
        <StatBox label="Payout" value={`$${payout.toFixed(2)}`} color="text-cosmic-green" />
        <StatBox label="Implied" value={`${impliedP.toFixed(1)}%`} />
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" /> : <Zap className="h-3.5 w-3.5 mr-2" />}
        {saving ? "Saving…" : "Save Parlay to Ledger"}
      </Button>
    </div>
  );
}

// ── EV / Kelly Calculator ─────────────────────────────────────────────────────

function EVCalculator() {
  const [odds, setOdds] = useState("-110");
  const [trueProb, setTrueProb] = useState("52");
  const [bankroll, setBankroll] = useState("1000");

  const o = parseInt(odds, 10) || -110;
  const p = Math.min(99, Math.max(1, Number(trueProb))) / 100;
  const bank = Number(bankroll) || 1000;

  const evPct = calcEV(o, p) * 100;
  const kellyPct = calcKelly(o, p) * 100;
  const halfKelly = kellyPct / 2;
  const kellyStake = bank * (halfKelly / 100);
  const bookImplied = impliedPct(o);
  const edge = p * 100 - bookImplied;

  const evColor = evPct > 0 ? "text-cosmic-green" : "text-cosmic-red";
  const edgeColor = edge > 0 ? "text-cosmic-green" : "text-cosmic-red";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Odds (American)</Label>
          <Input placeholder="-110" value={odds} onChange={e => setOdds(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Your True Probability (%)</Label>
          <Input type="number" min="1" max="99" placeholder="52" value={trueProb} onChange={e => setTrueProb(e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Bankroll ($) — for Kelly sizing</Label>
          <Input type="number" min="0" placeholder="1000" value={bankroll} onChange={e => setBankroll(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Expected Value" value={`${evPct > 0 ? "+" : ""}${evPct.toFixed(2)}%`} color={evColor} sub="per $ risked" />
        <StatBox label="Your Edge" value={`${edge > 0 ? "+" : ""}${edge.toFixed(2)}%`} color={edgeColor} sub="vs book" />
        <StatBox label="Book Implied" value={`${bookImplied.toFixed(1)}%`} sub="vig-inclusive" />
        <StatBox label="Half-Kelly Stake" value={`$${kellyStake.toFixed(2)}`} color="text-cosmic-gold" sub={`${halfKelly.toFixed(1)}% bankroll`} />
      </div>

      {evPct > 0 ? (
        <div className="rounded-lg p-3 bg-cosmic-green/10 border border-cosmic-green/20 text-[11px] text-cosmic-green">
          <strong>+EV Bet.</strong> At {trueProb}% true probability you have a {edge.toFixed(1)}% edge. Recommended stake: ${kellyStake.toFixed(0)} (half-Kelly).
        </div>
      ) : (
        <div className="rounded-lg p-3 bg-cosmic-red/10 border border-cosmic-red/20 text-[11px] text-cosmic-red">
          <strong>–EV Bet.</strong> The book's implied probability ({bookImplied.toFixed(1)}%) exceeds your estimated {trueProb}%. Skip or reduce stake.
        </div>
      )}
    </div>
  );
}

// ── Hedge Calculator ──────────────────────────────────────────────────────────

function HedgeCalculator() {
  const [origOdds, setOrigOdds] = useState("+200");
  const [origStake, setOrigStake] = useState("50");
  const [hedgeOdds, setHedgeOdds] = useState("-150");

  const oO = parseInt(origOdds, 10) || 200;
  const oS = Number(origStake) || 0;
  const hO = parseInt(hedgeOdds, 10) || -150;

  const origWin = oS * (toDecimal(oO) - 1);
  const hedgeDec = toDecimal(hO);

  // Lock-in: both scenarios equal → H = origTotalReturn / hedgeDec
  const origTotal = oS * toDecimal(oO);
  const hedgeStake = origTotal / hedgeDec;
  const guaranteedProfit = origWin - hedgeStake;
  const profitIfOrig = origWin - hedgeStake;
  const profitIfHedge = hedgeStake * (hedgeDec - 1) - oS;

  // Middle: max both win (not possible with binary outcomes, but show both-win scenario)
  const bothWinProfit = origWin + hedgeStake * (hedgeDec - 1);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground">
          Enter your original bet and the current available odds to hedge. The calculator finds the exact stake to guarantee equal profit regardless of outcome.
        </p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Bet</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Odds (American)</Label>
            <Input placeholder="+200" value={origOdds} onChange={e => setOrigOdds(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stake ($)</Label>
            <Input type="number" min="0" placeholder="50" value={origStake} onChange={e => setOrigStake(e.target.value)} />
          </div>
        </div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hedge Odds (available now)</p>
        <div className="space-y-1.5">
          <Label className="text-xs">Odds (American)</Label>
          <Input placeholder="-150" value={hedgeOdds} onChange={e => setHedgeOdds(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Hedge Stake" value={`$${hedgeStake.toFixed(2)}`} color="text-cosmic-cyan" sub="place this amount" />
        <StatBox
          label="Guaranteed Profit"
          value={`${guaranteedProfit >= 0 ? "+" : ""}$${guaranteedProfit.toFixed(2)}`}
          color={guaranteedProfit >= 0 ? "text-cosmic-green" : "text-cosmic-red"}
          sub="either outcome"
        />
        <StatBox label="If Original Wins" value={`+$${profitIfOrig.toFixed(2)}`} color="text-cosmic-green" />
        <StatBox
          label="If Hedge Wins"
          value={`${profitIfHedge >= 0 ? "+" : ""}$${profitIfHedge.toFixed(2)}`}
          color={profitIfHedge >= 0 ? "text-cosmic-green" : "text-cosmic-red"}
        />
      </div>

      {guaranteedProfit < 0 && (
        <div className="rounded-lg p-3 bg-cosmic-gold/10 border border-cosmic-gold/20 text-[11px] text-cosmic-gold">
          <strong>No risk-free hedge available</strong> at these odds. Hedging still reduces your maximum loss to ${Math.abs(profitIfHedge).toFixed(2)}.
        </div>
      )}
    </div>
  );
}

// ── CSV / Spreadsheet Import ──────────────────────────────────────────────────

function CSVImport({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [colMap, setColMap] = useState<ColMap | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    const result = parseCSV(raw);
    if (!result.headers.length) { toast({ title: "No data found", description: "Check your CSV format — need a header row." }); return; }
    setParsed(result);
    setColMap(autoMap(result.headers));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setRaw(ev.target?.result as string ?? ""); };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsed || !colMap) return;
    setImporting(true);
    const inserts: any[] = [];

    for (const row of parsed.rows) {
      const oddsRaw = colMap.odds ? row[colMap.odds]?.replace(/[^0-9+\-]/g, "") : "";
      const oddsNum = parseInt(oddsRaw, 10);
      const stakeNum = colMap.stake ? parseFloat(row[colMap.stake]?.replace(/[^0-9.]/g, "")) : NaN;
      const lineNum = colMap.line ? parseFloat(row[colMap.line]?.replace(/[^0-9.\-+]/g, "")) : NaN;
      const resultInfo = colMap.result ? normaliseResult(row[colMap.result] ?? "") : null;

      if (!oddsNum && !row[colMap.selection ?? ""]) continue;

      const game = colMap.game ? row[colMap.game] ?? "" : "";
      const [awayTeam, homeTeam] = game.includes("@")
        ? game.split("@").map(s => s.trim())
        : game.includes(" vs ")
        ? game.split(" vs ").map(s => s.trim())
        : ["", ""];

      inserts.push({
        user_id: userId,
        selection: colMap.selection ? (row[colMap.selection] || game || "Import") : game || "Import",
        market_type: colMap.market ? (row[colMap.market]?.toLowerCase() || "moneyline") : "moneyline",
        line: isNaN(lineNum) ? null : lineNum,
        odds: isNaN(oddsNum) ? null : oddsNum,
        stake_amount: isNaN(stakeNum) ? null : stakeNum,
        away_team: awayTeam || null,
        home_team: homeTeam || null,
        notes: colMap.notes ? row[colMap.notes] || null : null,
        result: resultInfo?.result ?? null,
        status: resultInfo?.status ?? "open",
        settled_at: resultInfo ? new Date().toISOString() : null,
      });
    }

    if (!inserts.length) { setImporting(false); toast({ title: "Nothing to import", description: "Check column mapping — no valid rows found." }); return; }

    const CHUNK = 50;
    let errors = 0;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const { error } = await supabase.from("bets").insert(inserts.slice(i, i + CHUNK));
      if (error) errors++;
    }

    setImporting(false);
    if (errors) {
      toast({ title: `Partial import`, description: `${inserts.length - errors * CHUNK} rows saved, ${errors} batches failed.`, variant: "destructive" });
    } else {
      toast({ title: `${inserts.length} bets imported ✓` });
      qc.invalidateQueries({ queryKey: ["skyspread-bets"] });
      setRaw(""); setParsed(null); setColMap(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Paste CSV text directly from your spreadsheet (Ctrl+A → Ctrl+C in Google Sheets), or upload a .csv file. Column headers are auto-detected.
      </p>

      {/* File upload */}
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} className="hidden" />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Upload CSV / TSV
        </Button>
        {raw && <span className="text-[10px] text-muted-foreground">{raw.split("\n").length} lines loaded</span>}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Or paste CSV / spreadsheet data here</Label>
        <Textarea
          rows={6}
          placeholder={"Date,Game,Selection,Market,Line,Odds,Stake,Result,Notes\n2025-01-10,LAL @ BOS,Lakers,spread,-5.5,-110,50,W,Good spot"}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          className="font-mono text-[11px]"
        />
      </div>

      <Button variant="outline" size="sm" onClick={handleParse} disabled={!raw.trim()} className="w-full">
        Preview & Map Columns
      </Button>

      {/* Column mapper */}
      {parsed && colMap && (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Column Mapping ({parsed.rows.length} rows detected)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(colMap) as (keyof ColMap)[]).map(field => (
              <div key={field} className="space-y-1">
                <Label className="text-[10px] capitalize">{field}</Label>
                <select
                  className="w-full h-7 rounded border border-input bg-background px-2 text-[11px]"
                  value={colMap[field]}
                  onChange={e => setColMap(m => m ? { ...m, [field]: e.target.value } : m)}
                >
                  <option value="">— skip —</option>
                  {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview first 5 rows */}
          <div className="overflow-x-auto rounded-lg border border-border/30">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-muted/50">
                  {parsed.headers.map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-border/20">
                    {parsed.headers.map(h => (
                      <td key={h} className="px-2 py-1 text-muted-foreground/80 whitespace-nowrap max-w-[120px] truncate">
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 5 && (
              <p className="text-center text-[9px] text-muted-foreground/50 py-1 border-t border-border/20">
                +{parsed.rows.length - 5} more rows
              </p>
            )}
          </div>

          <Button onClick={handleImport} disabled={importing} className="w-full">
            {importing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" />Importing…</>
              : <><Upload className="h-3.5 w-3.5 mr-2" />Import {parsed.rows.length} Bets to Ledger</>
            }
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

const TOOLS = [
  { key: "single",  label: "Bet Calc",  icon: Calculator },
  { key: "parlay",  label: "Parlay",    icon: Zap },
  { key: "ev",      label: "EV/Kelly",  icon: TrendingUp },
  { key: "hedge",   label: "Hedge",     icon: Shield },
  { key: "import",  label: "Import",    icon: Upload },
] as const;

type ToolKey = typeof TOOLS[number]["key"];

interface BetCalculatorTabProps {
  userId: string;
}

export function BetCalculatorTab({ userId }: BetCalculatorTabProps) {
  const [tool, setTool] = useState<ToolKey>("single");
  const [quickText, setQuickText] = useState("");
  const [quickFill, setQuickFill] = useState<QuickParsed | null>(null);

  const handleQuick = () => {
    if (!quickText.trim()) return;
    const parsed = quickParse(quickText);
    setQuickFill(parsed);
    setTool("single");
    setQuickText("");
  };

  return (
    <div className="space-y-4">
      {/* Quick-parse input */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Quick Entry — describe what you want to bet</Label>
        <div className="flex gap-2">
          <Input
            placeholder='e.g. "Lakers -5.5 -110 $50" or "Celtics ML +130"'
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleQuick()}
            className="flex-1"
          />
          <Button size="sm" onClick={handleQuick} disabled={!quickText.trim()}>
            Fill
          </Button>
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {TOOLS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTool(key)}
            className={cn(
              "flex-1 min-w-fit flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap",
              tool === key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tool panels */}
      <div className="cosmic-card rounded-xl p-4">
        {tool === "single" && <SingleBetCalc userId={userId} onQuickFill={quickFill} />}
        {tool === "parlay"  && <ParlayBuilder userId={userId} />}
        {tool === "ev"      && <EVCalculator />}
        {tool === "hedge"   && <HedgeCalculator />}
        {tool === "import"  && <CSVImport userId={userId} />}
      </div>
    </div>
  );
}
