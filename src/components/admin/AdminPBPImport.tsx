import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const ALL_TEAMS: Record<string, Record<string, string>> = {
  NFL: {
    ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens",
    BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears",
    CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys",
    DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
    HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
    KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers",
    LAR: "Los Angeles Rams", MIA: "Miami Dolphins", MIN: "Minnesota Vikings",
    NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
    NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
    SF: "San Francisco 49ers", SEA: "Seattle Seahawks", TB: "Tampa Bay Buccaneers",
    TEN: "Tennessee Titans", WAS: "Washington Commanders",
  },
  NBA: {
    ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
    CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
    DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
    GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
    LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
    MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
    NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
    ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
    POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
    TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
  },
  NHL: {
    ANA: "Anaheim Ducks", BOS: "Boston Bruins", BUF: "Buffalo Sabres",
    CGY: "Calgary Flames", CAR: "Carolina Hurricanes", CHI: "Chicago Blackhawks",
    COL: "Colorado Avalanche", CBJ: "Columbus Blue Jackets", DAL: "Dallas Stars",
    DET: "Detroit Red Wings", EDM: "Edmonton Oilers", FLA: "Florida Panthers",
    LAK: "Los Angeles Kings", MIN: "Minnesota Wild", MTL: "Montreal Canadiens",
    NSH: "Nashville Predators", NJD: "New Jersey Devils", NYI: "New York Islanders",
    NYR: "New York Rangers", OTT: "Ottawa Senators", PHI: "Philadelphia Flyers",
    PIT: "Pittsburgh Penguins", SJS: "San Jose Sharks", SEA: "Seattle Kraken",
    STL: "St. Louis Blues", TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs",
    UTA: "Utah Mammoth", VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights",
    WSH: "Washington Capitals", WPG: "Winnipeg Jets",
  },
  MLB: {
    ARI: "Arizona Diamondbacks", ATL: "Atlanta Braves", BAL: "Baltimore Orioles",
    BOS: "Boston Red Sox", CHC: "Chicago Cubs", CHW: "Chicago White Sox",
    CIN: "Cincinnati Reds", CLE: "Cleveland Guardians", COL: "Colorado Rockies",
    DET: "Detroit Tigers", HOU: "Houston Astros", KCR: "Kansas City Royals",
    LAA: "Los Angeles Angels", LAD: "Los Angeles Dodgers", MIA: "Miami Marlins",
    MIL: "Milwaukee Brewers", MIN: "Minnesota Twins", NYM: "New York Mets",
    NYY: "New York Yankees", OAK: "Oakland Athletics", PHI: "Philadelphia Phillies",
    PIT: "Pittsburgh Pirates", SDP: "San Diego Padres", SFG: "San Francisco Giants",
    SEA: "Seattle Mariners", STL: "St. Louis Cardinals", TBR: "Tampa Bay Rays",
    TEX: "Texas Rangers", TOR: "Toronto Blue Jays", WSN: "Washington Nationals",
  },
};

interface ImportResult {
  status: string;
  game_id?: string;
  awayAbbr?: string;
  homeAbbr?: string;
  awayName?: string;
  homeName?: string;
  plays_imported?: number;
  quarters?: number;
  final_score?: string;
  game_created?: boolean;
  matches?: any[];
  playCount?: number;
  quarterScores?: any[];
  error?: string;
}

export default function AdminPBPImport() {
  const [league, setLeague] = useState("NFL");
  const [gameDate, setGameDate] = useState("");
  const [awayOverride, setAwayOverride] = useState("");
  const [homeOverride, setHomeOverride] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [detectedTeams, setDetectedTeams] = useState<{ away: string; home: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pendingMatches, setPendingMatches] = useState<any[] | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setPendingMatches(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);

      // Try to auto-detect teams from headers
      const awayMatch = text.match(/aria-label="([^"]+)"[^>]*data-stat="pbp_score_aw"/);
      const homeMatch = text.match(/aria-label="([^"]+)"[^>]*data-stat="pbp_score_hm"/);
      if (awayMatch && homeMatch) {
        setDetectedTeams({ away: awayMatch[1], home: homeMatch[1] });
      } else {
        setDetectedTeams(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const importMutation = useMutation({
    mutationFn: async (selectedGameId?: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await supabase.functions.invoke("import-pbp-html", {
        body: {
          html: fileContent,
          league,
          away_override: awayOverride && awayOverride !== "__auto__" ? awayOverride : undefined,
          home_override: homeOverride && homeOverride !== "__auto__" ? homeOverride : undefined,
          game_date: gameDate || undefined,
          game_id: selectedGameId === "__create_new__" ? undefined : selectedGameId || undefined,
        },
      });

      if (resp.error) throw new Error(resp.error.message);
      return resp.data as ImportResult;
    },
    onSuccess: (data) => {
      if (data.status === "multiple_matches") {
        setPendingMatches(data.matches);
        toast({ title: "Multiple games found", description: "Please select the correct game below." });
      } else {
        setResult(data);
        setPendingMatches(null);
        toast({
          title: "PBP imported!",
          description: `${data.plays_imported} plays, ${data.quarters} quarters. Score: ${data.final_score}`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const teams = ALL_TEAMS[league] || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Play-by-Play Import</h2>
        <Badge variant="outline" className="text-[9px]">Sports Reference HTML</Badge>
      </div>

      {/* League + Date */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">League</label>
          <Select value={league} onValueChange={(v) => { setLeague(v); setAwayOverride(""); setHomeOverride(""); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NFL">NFL</SelectItem>
              <SelectItem value="NBA">NBA</SelectItem>
              <SelectItem value="NHL">NHL</SelectItem>
              <SelectItem value="MLB">MLB</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Game Date</label>
          <Input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="h-9 text-xs" />
        </div>
      </div>

      {/* File upload */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Upload File (.xls / .html)</label>
        <div className="mt-1">
          <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {fileName || "Click to select Sports Reference PBP file"}
            </span>
            <input
              type="file"
              accept=".xls,.html,.htm,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {/* Detected teams */}
      {detectedTeams && (
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Auto-detected teams</p>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">{detectedTeams.away} (Away)</Badge>
            <span className="text-xs text-muted-foreground">@</span>
            <Badge variant="secondary" className="text-xs">{detectedTeams.home} (Home)</Badge>
          </div>
        </Card>
      )}

      {/* Manual team overrides */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Away Team Override</label>
          <Select value={awayOverride} onValueChange={setAwayOverride}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Auto-detect" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Auto-detect</SelectItem>
              {Object.entries(teams).sort((a, b) => a[1].localeCompare(b[1])).map(([abbr, name]) => (
                <SelectItem key={abbr} value={abbr}>{abbr} – {name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Home Team Override</label>
          <Select value={homeOverride} onValueChange={setHomeOverride}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Auto-detect" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Auto-detect</SelectItem>
              {Object.entries(teams).sort((a, b) => a[1].localeCompare(b[1])).map(([abbr, name]) => (
                <SelectItem key={abbr} value={abbr}>{abbr} – {name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Import button */}
      <Button
        onClick={() => importMutation.mutate(undefined)}
        disabled={!fileContent || importMutation.isPending}
        className="w-full gap-2"
      >
        {importMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
        ) : (
          <><Upload className="h-4 w-4" /> Import Play-by-Play</>
        )}
      </Button>

      {/* Multiple matches - user picks */}
      {pendingMatches && (
        <Card className="p-3 space-y-2">
          <p className="text-xs font-medium text-foreground flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            Multiple games found — select one:
          </p>
          {pendingMatches.map((m: any) => (
            <Button
              key={m.id}
              variant="outline"
              size="sm"
              className="w-full text-xs justify-start"
              onClick={() => importMutation.mutate(m.id)}
              disabled={importMutation.isPending}
            >
              {new Date(m.start_time).toLocaleString()} — {m.status}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => importMutation.mutate("__create_new__")}
            disabled={importMutation.isPending}
          >
            Create new game instead
          </Button>
        </Card>
      )}

      {/* Success result */}
      {result && result.status === "success" && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Import Complete</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Matchup</span>
            <span className="font-medium">{result.awayAbbr} @ {result.homeAbbr}</span>
            <span className="text-muted-foreground">Final Score</span>
            <span className="font-medium">{result.final_score}</span>
            <span className="text-muted-foreground">Plays</span>
            <span className="font-medium">{result.plays_imported}</span>
            <span className="text-muted-foreground">Quarters</span>
            <span className="font-medium">{result.quarters}</span>
            <span className="text-muted-foreground">Game</span>
            <span className="font-medium">{result.game_created ? "Created new" : "Matched existing"}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
