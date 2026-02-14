import { Settings, Sliders, Star, MapPin, Shield, LogIn, LogOut, User, Globe, Upload, FileSpreadsheet, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTimezone } from "@/hooks/use-timezone";
import { useIsAdmin } from "@/hooks/use-admin";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useRef } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { userTimezone, updateTimezone } = useTimezone();
  const { isAdmin } = useIsAdmin();
  const [csvLeague, setCsvLeague] = useState("NBA");
  const [csvDataType, setCsvDataType] = useState("games");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Settings state
  const [statWeight, setStatWeight] = useState(40);
  const [marketWeight, setMarketWeight] = useState(35);
  const [astroWeight, setAstroWeight] = useState(25);
  const [horaryRules, setHoraryRules] = useState({
    voidOfCourse: true,
    combustion: true,
    retrograde: true,
    receptionDignity: true,
  });
  const [houseSystem, setHouseSystem] = useState("Placidus");
  const [orbSize, setOrbSize] = useState("standard");
  const [travelFactors, setTravelFactors] = useState(true);
  const [astrocarto, setAstrocarto] = useState(true);

  const timezones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf("timeZone") as string[];
    } catch {
      return ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "UTC"];
    }
  }, []);

  const toggleSection = (key: string) => {
    setExpandedSection(prev => prev === key ? null : key);
  };

  const sections = [
    {
      key: "scoring",
      icon: Sliders,
      title: "Scoring Weights",
      desc: "Adjust stat vs market vs astro blend",
      content: (
        <div className="space-y-4 pt-3">
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Statistical</span><span className="text-primary font-medium">{statWeight}%</span></div>
            <Slider value={[statWeight]} onValueChange={([v]) => { setStatWeight(v); setMarketWeight(Math.min(100 - v - astroWeight, 100 - v)); }} max={100} step={5} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Market / Odds</span><span className="text-primary font-medium">{marketWeight}%</span></div>
            <Slider value={[marketWeight]} onValueChange={([v]) => { setMarketWeight(v); setAstroWeight(Math.max(0, 100 - statWeight - v)); }} max={100 - statWeight} step={5} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Astrological</span><span className="text-primary font-medium">{astroWeight}%</span></div>
            <Slider value={[astroWeight]} onValueChange={([v]) => { setAstroWeight(v); setMarketWeight(Math.max(0, 100 - statWeight - v)); }} max={100 - statWeight} step={5} />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">Total: {statWeight + marketWeight + astroWeight}%</p>
        </div>
      ),
    },
    {
      key: "horary",
      icon: Star,
      title: "Horary Ruleset",
      desc: "Toggle traditional rules to apply",
      content: (
        <div className="space-y-3 pt-3">
          {([
            { key: "voidOfCourse", label: "Void of Course Moon" },
            { key: "combustion", label: "Combustion (within 8° of Sun)" },
            { key: "retrograde", label: "Retrograde significators" },
            { key: "receptionDignity", label: "Reception & Essential Dignity" },
          ] as const).map(rule => (
            <div key={rule.key} className="flex items-center justify-between">
              <span className="text-sm">{rule.label}</span>
              <Switch
                checked={horaryRules[rule.key]}
                onCheckedChange={(v) => setHoraryRules(prev => ({ ...prev, [rule.key]: v }))}
              />
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "astrology",
      icon: Star,
      title: "Astrology Settings",
      desc: "House system, orb sizes",
      content: (
        <div className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">House System</label>
            <Select value={houseSystem} onValueChange={setHouseSystem}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Placidus", "Whole Sign", "Koch", "Equal", "Regiomontanus", "Campanus"].map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Orb Sizes</label>
            <Select value={orbSize} onValueChange={setOrbSize}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tight" className="text-xs">Tight (±3°)</SelectItem>
                <SelectItem value="standard" className="text-xs">Standard (±6°)</SelectItem>
                <SelectItem value="wide" className="text-xs">Wide (±10°)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ),
    },
    {
      key: "location",
      icon: MapPin,
      title: "Location & Cartography",
      desc: "Travel factors, astrocartography",
      content: (
        <div className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Include travel factors</span>
            <Switch checked={travelFactors} onCheckedChange={setTravelFactors} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Astrocartography overlay</span>
            <Switch checked={astrocarto} onCheckedChange={setAstrocarto} />
          </div>
          <p className="text-[10px] text-muted-foreground">When enabled, predictions factor in team travel distance, time zone shifts, and planetary lines crossing the venue.</p>
        </div>
      ),
    },
    {
      key: "gambling",
      icon: Shield,
      title: "Responsible Gambling",
      desc: "Resources and disclaimers",
      content: (
        <div className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cosmic Edge is an entertainment and research tool. All astrological and statistical analyses are for informational purposes only and do not constitute financial or gambling advice.
          </p>
          <div className="space-y-2">
            <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">
              National Council on Problem Gambling
            </a>
            <a href="https://www.1800gambler.net" target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">
              1-800-GAMBLER
            </a>
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">
              BeGambleAware.org
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground">If you or someone you know has a gambling problem, call 1-800-522-4700.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold font-display tracking-tight">Settings</h1>
        </div>
        <p className="text-xs text-muted-foreground">Configure your Cosmic Edge experience</p>
      </header>
      <div className="px-4 py-4 space-y-2">
        {/* Auth section */}
        {user ? (
          <div className="cosmic-card rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{user.email}</p>
                <p className="text-[10px] text-muted-foreground">Signed in</p>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); }}
              className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="w-full cosmic-card rounded-xl p-4 flex items-center gap-4 text-left transition-all hover:border-primary/20"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <LogIn className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Log In / Sign Up</p>
              <p className="text-xs text-muted-foreground">Required for SkySpread & Live Board</p>
            </div>
          </button>
        )}

        {/* Timezone selector */}
        <div className="cosmic-card rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Timezone</p>
              <p className="text-xs text-muted-foreground">Game times & planetary hours adjust to your zone</p>
            </div>
          </div>
          <Select
            value={userTimezone}
            onValueChange={(tz) => updateTimezone.mutate(tz)}
          >
            <SelectTrigger className="w-full h-9 text-xs">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz} className="text-xs">
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* CSV Import section - Admin only */}
        {isAdmin && (
          <div className="cosmic-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Import Historical Data</p>
                <p className="text-xs text-muted-foreground">Upload CSV files to populate past seasons</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={csvLeague} onValueChange={setCsvLeague}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="League" /></SelectTrigger>
                  <SelectContent>
                    {["NBA", "NFL", "MLB", "NHL"].map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={csvDataType} onValueChange={setCsvDataType}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Data type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="games" className="text-xs">Games & Scores</SelectItem>
                    <SelectItem value="odds" className="text-xs">Odds</SelectItem>
                    <SelectItem value="player_stats" className="text-xs">Player Stats</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImporting(true);
                setImportProgress(10);
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("league", csvLeague);
                  formData.append("data_type", csvDataType);
                  setImportProgress(30);
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-historical-csv`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                      },
                      body: formData,
                    }
                  );
                  setImportProgress(80);
                  const result = await res.json();
                  setImportProgress(100);
                  if (result.success) {
                    toast({ title: "Import complete", description: `${result.rows_inserted} rows inserted, ${result.rows_skipped} skipped` });
                  } else {
                    toast({ title: "Import failed", description: result.error, variant: "destructive" });
                  }
                } catch (err: any) {
                  toast({ title: "Import error", description: err.message, variant: "destructive" });
                } finally {
                  setImporting(false);
                  setImportProgress(0);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }} />
              {importing && <Progress value={importProgress} className="h-2" />}
              <button
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium py-2.5 transition-colors disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Importing…" : "Choose CSV File & Import"}
              </button>
            </div>
          </div>
        )}

        {/* Expandable settings sections */}
        {sections.map(({ key, icon: Icon, title, desc, content }) => (
          <div key={key} className="cosmic-card rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection(key)}
              className="w-full p-4 flex items-center gap-4 text-left transition-all hover:border-primary/20"
            >
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === key ? "rotate-90" : ""}`} />
            </button>
            {expandedSection === key && (
              <div className="px-4 pb-4">
                {content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
