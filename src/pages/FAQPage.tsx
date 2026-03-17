import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Search, Sparkles, TrendingUp, Target, Zap, BarChart3, FlaskConical, Cpu, Bell, Shield, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

interface FAQItem {
  q: string;
  a: string;
  related?: { label: string; route: string }[];
}

interface FAQCategory {
  title: string;
  icon: typeof HelpCircle;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    title: "Getting Started",
    icon: Sparkles,
    items: [
      { q: "What is CosmicEdge?", a: "CosmicEdge is an AI-powered sports analysis platform that combines traditional statistical modeling with astrological insights to surface betting edges, prop projections, and live game intelligence.", related: [{ label: "Slate / Home", route: "/" }] },
      { q: "Where do I start?", a: "Start on the Slate (home page) to browse today's games. Tap any game card for full matchup analysis, props, and live watch mode. Use Astra AI to ask natural language questions about bets and matchups.", related: [{ label: "Astra AI", route: "/astra" }] },
      { q: "What do the different sections do?", a: "Slate = daily games. Astra = AI chat + methodology. SkySpread = bet tracking. Nexus = intelligence hub with Command Center, players, teams, and trends. Signal Lab = edge detection." },
    ],
  },
  {
    title: "Astra AI",
    icon: Sparkles,
    items: [
      { q: "How do I use Astra?", a: "Type natural questions in the chat — 'Should I take LeBron over 25.5 points?' or 'Run my model on Brunson assists'. Astra routes through decision engines, compute pipelines, and astrology interpreters automatically.", related: [{ label: "Astra AI", route: "/astra" }] },
      { q: "What powers Astra's answers?", a: "Three layers: (1) Decision Engine for bet assessment, (2) Compute Pipeline for statistical projections, (3) Astro Interpreter for celestial context. See the Celestial Engines tab for all formulas." },
      { q: "What are the engine tabs for?", a: "About CosmicEdge = overview. Cosmic Lexicon = astrology glossary. Celestial Engines = formula reference. Behind the Stars = methodology and approach." },
    ],
  },
  {
    title: "Props & Predictions",
    icon: TrendingUp,
    items: [
      { q: "How do projections work?", a: "A 10-step pipeline: season average + recent form + momentum + usage + matchup + pace + game script + astro overlay → final μ (projection). Edge = μ minus sportsbook line.", related: [{ label: "Machina Reference", route: "/machina" }] },
      { q: "What does 'edge score' mean?", a: "Edge Score (v11) = 100 × (P_model - P_implied) × environment_multiplier × astro_multiplier. Higher score = stronger model conviction. 65+ is elite tier." },
      { q: "Why are live props sometimes missing?", a: "Live props require: (1) game in progress, (2) BDL/provider data feed active, (3) readiness pipeline satisfied. Check back once the game tips off." },
      { q: "What is hit rate?", a: "Percentage of recent games where a player exceeded (Over) or stayed under (Under) a specific line. L10 = last 10 games." },
    ],
  },
  {
    title: "Slips & Tracking",
    icon: Target,
    items: [
      { q: "How do tracked props work?", a: "Tap the target icon on any prop to track it. CosmicEdge syncs live stat values and auto-settles when the game ends. View all tracked props in SkySpread → Tracked tab.", related: [{ label: "SkySpread", route: "/skyspread" }] },
      { q: "How do I import a slip?", a: "In SkySpread → Slips tab, use the import dialog. Paste your slip details or screenshot text and the parser will extract legs automatically." },
      { q: "What is the Slip Optimizer?", a: "Analyzes your parlay legs for correlation risk, suggests replacements for weak legs, and provides hedge recommendations based on live game state." },
    ],
  },
  {
    title: "Nexus & Trends",
    icon: Compass,
    items: [
      { q: "What is Nexus?", a: "The central intelligence hub. Command Center shows your personalized Astra pulse, trap alerts, opportunity feed, and best markets. Players and Teams tabs provide deep research.", related: [{ label: "Nexus", route: "/nexus" }] },
      { q: "How do trends work?", a: "Trends compares player prop lines against recent game logs to find hit-rate streaks, momentum shifts, and over/under edges. Data refreshes every 60 seconds.", related: [{ label: "Trends", route: "/trends" }] },
      { q: "What is Signal Lab?", a: "An advanced edge detector that surfaces over-streaks, momentum plays, usage shifts, defense matchups, and astro-boosted props from the model overlay pipeline.", related: [{ label: "Signal Lab", route: "/signal-lab" }] },
    ],
  },
  {
    title: "Engines & Formulas",
    icon: Cpu,
    items: [
      { q: "What are the engines?", a: "NebulaProp (core distribution), PacePulse (game environment), TransitLift (astro), Monte Carlo (simulation), Edge Score, Volatility, Matchup, Usage engines. Each handles one layer of the prediction." },
      { q: "What do the constants mean?", a: "μ = projected mean, σ = standard deviation, L = line, P = probability, k = calibration constant (1.5), Δ = edge (μ-L), z = standardized edge (Δ/σ), w = factor weight.", related: [{ label: "Formula Reference", route: "/machina" }] },
      { q: "Can I build custom models?", a: "Yes — in Machina → Builder tab. Select factors, adjust weights, and save. Run predictions in the AI Studio tab, or backtest against historical data." },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { q: "How do notifications work?", a: "Configure alert categories in Settings → Notifications. Choose from game start, score changes, tracked prop hits, slip updates, and more. Set a throttle to avoid being overwhelmed." },
      { q: "Will I get push notifications?", a: "Push notification delivery (iOS/Android) is being prepared. In-app notification preferences are ready now — once push is enabled, your preferences will apply automatically." },
    ],
  },
  {
    title: "Admin & Diagnostics",
    icon: Shield,
    items: [
      { q: "What surfaces are admin-only?", a: "Machina Lab (model building + engines), Diagnostics Drawers, Game Manager, Import tools, and Manual Stats Entry. These require admin role verification." },
      { q: "What is runtime vs docs?", a: "Runtime Active = the engine runs automatically on live data. Documentation Only = explains the formula but doesn't execute it in real-time. Check each engine's status badge." },
    ],
  },
];

export default function FAQPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<string | null>(null);

  const filtered = search
    ? FAQ_DATA.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : FAQ_DATA;

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display">Help & FAQ</h1>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">Everything you need to know about CosmicEdge</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions..." className="pl-8 h-8 text-xs" />
        </div>
      </header>

      <div className="px-4 py-4 space-y-5">
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <HelpCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No matching questions found</p>
          </div>
        )}

        {filtered.map(cat => {
          const Icon = cat.icon;
          return (
            <section key={cat.title}>
              <h2 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2 uppercase tracking-widest">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {cat.title}
              </h2>
              <div className="space-y-1">
                {cat.items.map((item, i) => {
                  const key = `${cat.title}-${i}`;
                  const isOpen = expandedIdx === key;
                  return (
                    <div key={key} className="cosmic-card rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedIdx(isOpen ? null : key)}
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-medium text-foreground pr-2">{item.q}</span>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{item.a}</p>
                          {item.related && item.related.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] text-muted-foreground/70">Go to:</span>
                              {item.related.map(r => (
                                <button key={r.route} onClick={() => navigate(r.route)} className="text-[9px] text-primary hover:underline font-medium">
                                  {r.label} →
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
