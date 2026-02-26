import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Users, Lightbulb, ShieldAlert, Activity,
  BarChart3, Zap, Target, Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/* ── Types ── */

export interface BulletItem {
  text: string;
  tag?: string;
  priority?: number;
}

// Legacy v1 shape (backward compat)
export interface AstraResponse {
  version: string;
  mode: string;
  query: { text: string; category: string };
  answer: { narrative: string; tone: string; summary?: string };
  takeaways: {
    strengtheners: BulletItem[];
    weakeners: BulletItem[];
    team_vs_player: BulletItem[];
    actionable_next_steps?: BulletItem[];
  };
  confidence: { level: string; rationale: string } | string;
  volatility: { level: string; rationale: string } | string;
  disclaimers: string[];
  follow_up_questions?: string[];
}

// New v2 CosmicEdge shape
export interface QuantModel {
  model_id: string;
  scope: string;
  metrics: { name: string; value: number | string; unit?: string; window?: string }[];
  signal: { direction: string; strength: string; score: number };
  summary: string;
}

export interface CosmicEdgeResponse {
  version: string;
  delivery_mode: string;
  context: {
    query: { text: string; category: string };
    entities: Record<string, any>;
  };
  astro: {
    answer: { narrative: string; summary: string; tone: string };
    takeaways: {
      strengtheners: BulletItem[];
      weakeners: BulletItem[];
      team_vs_player: BulletItem[];
    };
    confidence: string;
    volatility: string;
    follow_up_questions?: string[];
  };
  quant: {
    market_snapshot: { market_type: string; line?: number; odds_american?: number; implied_prob?: number };
    models: QuantModel[];
    verdict: { quant_score: number; edge_assessment: string; notes: string };
  };
  signals: {
    astro: { lean: string; strength: string };
    quant: { lean: string; edge: string };
    blend: { decision: string; confidence: string; volatility: string; astro_weight_used: number; explain?: string };
  };
  preferences: {
    emphasis: { astro_weight: number };
    visibility: { default_user: string; admin: string };
  };
  disclaimers: string[];
}

/* ── Helpers ── */

const TAG_COLORS: Record<string, string> = {
  transits: "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
  natal: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  aspects: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  location: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
  chemistry: "bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30",
  role_usage: "bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
  matchup: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  injury_news: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  market: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  stats: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30",
  combustion: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
  injury_risk: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

const LEVEL_COLORS: Record<string, string> = {
  low: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
  medium: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  high: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
};

const DECISION_COLORS: Record<string, string> = {
  support: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40",
  fade: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
  neutral: "bg-muted text-muted-foreground border-border",
  watchlist: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
};

const SIGNAL_ICONS: Record<string, string> = {
  supports: "↑", conflicts: "↓", neutral: "→",
  support: "✓", fade: "✗", watchlist: "◉",
};

function TagPill({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-block px-1.5 py-0.5 rounded-full text-[8px] font-semibold border transition-all cursor-pointer",
        TAG_COLORS[tag] || TAG_COLORS.other,
        active && "ring-1 ring-primary scale-105 shadow-sm shadow-primary/20",
        !active && "opacity-80 hover:opacity-100"
      )}
    >
      {tag.replace(/_/g, " ")}
    </button>
  );
}

function BulletList({ items, icon: Icon, activeTag, onTagClick }: {
  items: BulletItem[];
  icon: React.ElementType;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}) {
  if (!items?.length) return null;
  const sorted = [...items].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
  return (
    <ul className="space-y-1.5">
      {sorted.map((item, i) => {
        const dimmed = activeTag && item.tag !== activeTag;
        return (
          <li key={i} className={cn("flex items-start gap-2 text-[11px] leading-relaxed text-foreground/90 transition-opacity", dimmed && "opacity-30")}>
            <Icon className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/70" />
            <span className="flex-1">
              {item.text}
              {item.tag && (
                <span className="ml-1.5 inline-block">
                  <TagPill tag={item.tag} active={activeTag === item.tag} onClick={() => onTagClick(item.tag!)} />
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LevelBadge({ label, level }: { label: string; level: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border", LEVEL_COLORS[level] || LEVEL_COLORS.medium)}>
      {label}: {level}
    </span>
  );
}

/* ── Signal Chip ── */

function SignalChip({ label, decision, explain }: { label: string; decision: string; explain?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border", DECISION_COLORS[decision] || DECISION_COLORS.neutral)}>
      <span>{SIGNAL_ICONS[decision] || "•"}</span>
      <span>{label}: {decision.toUpperCase()}</span>
      {explain && <span className="font-normal opacity-70 ml-1">— {explain}</span>}
    </div>
  );
}

/* ── Quant Models Panel ── */

function QuantModelsPanel({ models, verdict }: { models: QuantModel[]; verdict: any }) {
  const [expanded, setExpanded] = useState(false);

  if (!models?.length) return null;

  const supportCount = models.filter(m => m.signal?.direction === "supports").length;
  const conflictCount = models.filter(m => m.signal?.direction === "conflicts").length;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button className="w-full cosmic-card rounded-xl p-3 flex items-center justify-between hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Quant Models</span>
            <span className="text-[9px] text-muted-foreground">
              {supportCount}↑ {conflictCount}↓ · Score: {verdict?.quant_score > 0 ? "+" : ""}{verdict?.quant_score?.toFixed(2)}
            </span>
          </div>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="cosmic-card rounded-b-xl border-t-0 -mt-1 p-3 space-y-2">
          {models.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className={cn(
                "w-4 text-center font-bold",
                m.signal?.direction === "supports" ? "text-green-400" :
                m.signal?.direction === "conflicts" ? "text-red-400" : "text-muted-foreground"
              )}>
                {SIGNAL_ICONS[m.signal?.direction] || "→"}
              </span>
              <span className="font-semibold text-foreground min-w-[80px]">{m.model_id.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground flex-1 truncate">{m.summary}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[8px] font-bold",
                m.signal?.strength === "strong" ? "bg-primary/20 text-primary" :
                m.signal?.strength === "medium" ? "bg-amber-500/20 text-amber-300" :
                "bg-muted text-muted-foreground"
              )}>
                {m.signal?.score > 0 ? "+" : ""}{m.signal?.score?.toFixed(2)}
              </span>
            </div>
          ))}
          {verdict?.notes && (
            <p className="text-[9px] text-muted-foreground/70 border-t border-border/50 pt-1.5 mt-1">
              {verdict.notes}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Narrative Block with staggered sentence reveal ── */

function NarrativeBlock({ narrative, summary, compact }: { narrative: string; summary?: string; compact?: boolean }) {
  const sentences = narrative.split(/(?<=[.!?])\s+/).filter(Boolean);
  const PREVIEW = 4; // sentences visible before "Read more"
  const isLong = sentences.length > PREVIEW;
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const prevNarrative = useRef<string>("");

  useEffect(() => {
    if (narrative === prevNarrative.current) return;
    prevNarrative.current = narrative;
    setVisibleCount(0);
    const shown = expanded ? sentences.length : Math.min(sentences.length, PREVIEW);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= shown) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, [narrative, expanded]);

  const displaySentences = (expanded ? sentences : sentences.slice(0, PREVIEW)).slice(0, visibleCount);

  return (
    <div className="cosmic-card rounded-xl p-4 space-y-1.5">
      {displaySentences.map((sentence, i) => (
        <p
          key={i}
          style={{ animationDelay: `${i * 80}ms` }}
          className={cn(
            "leading-relaxed text-foreground/90 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both",
            compact ? "text-xs" : "text-[13px]"
          )}
        >
          {sentence}
        </p>
      ))}
      {isLong && visibleCount >= Math.min(sentences.length, PREVIEW) && (
        <button
          onClick={() => {
            setExpanded(e => !e);
            setVisibleCount(0);
          }}
          className="text-[10px] text-primary hover:underline mt-0.5"
        >
          {expanded ? "Show less" : `Read more (${sentences.length - PREVIEW} more)`}
        </button>
      )}
      {summary && (
        <p className="mt-2 text-[10px] italic text-primary/80 border-t border-border/50 pt-2">
          {summary}
        </p>
      )}
    </div>
  );
}

/* ── Main Component ── */

// Detect if data is v2 CosmicEdge
function isCosmicEdge(data: any): data is CosmicEdgeResponse {
  return data?.version?.startsWith("2") || !!data?.signals?.blend;
}

// Normalize legacy v1 AstraResponse to get confidence/volatility level strings
function getLevel(val: any): string {
  if (typeof val === "string") return val;
  if (val?.level) return val.level;
  return "medium";
}

export default function AstraStructuredResponse({ data, compact, onFollowUpClick }: { data: AstraResponse | CosmicEdgeResponse; compact?: boolean; onFollowUpClick?: (question: string) => void }) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const handleTagClick = (tag: string) => {
    setActiveTag(prev => prev === tag ? null : tag);
  };

  // Normalize: extract astro section from either v1 or v2
  const isV2 = isCosmicEdge(data);
  const astro = isV2 ? (data as CosmicEdgeResponse).astro : null;
  const quant = isV2 ? (data as CosmicEdgeResponse).quant : null;
  const signals = isV2 ? (data as CosmicEdgeResponse).signals : null;

  // Common fields
  const narrative = astro?.answer?.narrative || (data as AstraResponse).answer?.narrative || "";
  const summary = astro?.answer?.summary || (data as AstraResponse).answer?.summary || "";
  const takeaways = astro?.takeaways || (data as AstraResponse).takeaways;
  const confidence = astro?.confidence || getLevel((data as AstraResponse).confidence);
  const volatility = astro?.volatility || getLevel((data as AstraResponse).volatility);
  const disclaimers = isV2 ? (data as CosmicEdgeResponse).disclaimers : (data as AstraResponse).disclaimers;
  const followUps = astro?.follow_up_questions || (data as AstraResponse).follow_up_questions;

  // Collect tags
  const allTags = new Set<string>();
  const sections = [
    takeaways?.strengtheners || [],
    takeaways?.weakeners || [],
    takeaways?.team_vs_player || [],
    (takeaways as any)?.actionable_next_steps || [],
  ];
  sections.forEach(s => s.forEach((item: BulletItem) => { if (item.tag) allTags.add(item.tag); }));

  return (
    <div className="space-y-3">
      {/* Signal chips (v2 only) */}
      {signals?.blend && (
        <div className="flex flex-wrap gap-2">
          <SignalChip label="Blend" decision={signals.blend.decision} explain={signals.blend.explain} />
          <SignalChip label="Astro" decision={signals.astro?.lean || "neutral"} />
          {signals.quant?.lean !== "neutral" && (
            <SignalChip label="Quant" decision={signals.quant.lean} />
          )}
        </div>
      )}

      {/* Narrative — staggered sentence reveal */}
      <NarrativeBlock narrative={narrative} summary={summary} compact={compact} />


      {/* Confidence & Volatility badges + Tag filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <LevelBadge label="Confidence" level={typeof confidence === "string" ? confidence : (confidence as any)?.level || "medium"} />
        <LevelBadge label="Volatility" level={typeof volatility === "string" ? volatility : (volatility as any)?.level || "medium"} />
        {signals?.blend && (
          <span className="text-[8px] text-muted-foreground/60">
            Astro weight: {((signals.blend.astro_weight_used || 0.5) * 100).toFixed(0)}%
          </span>
        )}
        {activeTag && (
          <button
            onClick={() => setActiveTag(null)}
            className="text-[8px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* Tag filter chips */}
      {allTags.size > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {Array.from(allTags).map(tag => (
            <TagPill key={tag} tag={tag} active={activeTag === tag} onClick={() => handleTagClick(tag)} />
          ))}
        </div>
      )}

      {/* Quant Models (v2 only) */}
      {quant?.models && quant.models.length > 0 && (
        <QuantModelsPanel models={quant.models} verdict={quant.verdict} />
      )}

      {/* Takeaways */}
      {takeaways?.strengtheners?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> What would strengthen this read
          </h4>
          <BulletList items={takeaways.strengtheners} icon={TrendingUp} activeTag={activeTag} onTagClick={handleTagClick} />
        </div>
      )}

      {takeaways?.weakeners?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> What would weaken this read
          </h4>
          <BulletList items={takeaways.weakeners} icon={TrendingDown} activeTag={activeTag} onTagClick={handleTagClick} />
        </div>
      )}

      {takeaways?.team_vs_player?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Users className="h-3 w-3" /> Team vs Player lens
          </h4>
          <BulletList items={takeaways.team_vs_player} icon={Users} activeTag={activeTag} onTagClick={handleTagClick} />
        </div>
      )}

      {(takeaways as any)?.actionable_next_steps?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Next steps
          </h4>
          <BulletList items={(takeaways as any).actionable_next_steps} icon={Lightbulb} activeTag={activeTag} onTagClick={handleTagClick} />
        </div>
      )}

      {/* Analysis rationale */}
      {!compact && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> Analysis
          </h4>
          {quant?.verdict && (
            <p className="text-[10px] text-foreground/70 leading-relaxed">
              <span className="font-semibold text-foreground/80">Quant Edge:</span> {quant.verdict.edge_assessment.replace(/_/g, " ")} (score: {quant.verdict.quant_score > 0 ? "+" : ""}{quant.verdict.quant_score?.toFixed(2)})
            </p>
          )}
          {signals?.blend?.explain && (
            <p className="text-[10px] text-foreground/70 leading-relaxed">
              <span className="font-semibold text-foreground/80">Blend:</span> {signals.blend.explain}
            </p>
          )}
        </div>
      )}

      {/* Follow-up questions — only in chat context where onFollowUpClick is wired up */}
      {onFollowUpClick && followUps && followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {followUps.map((q, i) => (
            <button
              key={i}
              onClick={() => onFollowUpClick(q)}
              className="text-[9px] px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-left hover:bg-primary/20 hover:border-primary/40 cursor-pointer transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Disclaimers */}
      {disclaimers?.length > 0 && (
        <div className="flex items-start gap-1.5 pt-1">
          <ShieldAlert className="h-3 w-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
            {disclaimers.join(" ")}
          </p>
        </div>
      )}
    </div>
  );
}
