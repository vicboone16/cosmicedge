import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Users, Lightbulb, ShieldAlert, Activity } from "lucide-react";

export interface BulletItem {
  text: string;
  tag?: string;
  priority?: number;
}

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
  confidence: { level: string; rationale: string };
  volatility: { level: string; rationale: string };
  disclaimers: string[];
  follow_up_questions?: string[];
}

const TAG_COLORS: Record<string, string> = {
  transits: "bg-purple-500/20 text-purple-300",
  natal: "bg-blue-500/20 text-blue-300",
  aspects: "bg-indigo-500/20 text-indigo-300",
  combustion: "bg-red-500/20 text-red-300",
  injury_risk: "bg-orange-500/20 text-orange-300",
  chemistry: "bg-pink-500/20 text-pink-300",
  role_usage: "bg-teal-500/20 text-teal-300",
  matchup: "bg-amber-500/20 text-amber-300",
  location: "bg-green-500/20 text-green-300",
  market: "bg-cyan-500/20 text-cyan-300",
  other: "bg-muted text-muted-foreground",
};

const LEVEL_COLORS: Record<string, string> = {
  low: "bg-green-500/20 text-green-300 border-green-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  high: "bg-red-500/20 text-red-300 border-red-500/30",
};

function BulletList({ items, icon: Icon }: { items: BulletItem[]; icon: React.ElementType }) {
  if (!items?.length) return null;
  const sorted = [...items].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
  return (
    <ul className="space-y-1.5">
      {sorted.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/90">
          <Icon className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/70" />
          <span className="flex-1">
            {item.text}
            {item.tag && (
              <span className={cn("ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[8px] font-semibold", TAG_COLORS[item.tag] || TAG_COLORS.other)}>
                {item.tag}
              </span>
            )}
          </span>
        </li>
      ))}
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

export default function AstraStructuredResponse({ data }: { data: AstraResponse }) {
  return (
    <div className="space-y-3">
      {/* Narrative */}
      <div className="cosmic-card rounded-xl p-4">
        <p className="text-xs leading-relaxed text-foreground/90">
          {data.answer.narrative}
        </p>
        {data.answer.summary && (
          <p className="mt-2 text-[10px] italic text-primary/80 border-t border-border/50 pt-2">
            {data.answer.summary}
          </p>
        )}
      </div>

      {/* Confidence & Volatility badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <LevelBadge label="Confidence" level={data.confidence.level} />
        <LevelBadge label="Volatility" level={data.volatility.level} />
      </div>

      {/* Takeaways sections */}
      {data.takeaways.strengtheners?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-green-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> What would strengthen this read
          </h4>
          <BulletList items={data.takeaways.strengtheners} icon={TrendingUp} />
        </div>
      )}

      {data.takeaways.weakeners?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-red-400 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> What would weaken this read
          </h4>
          <BulletList items={data.takeaways.weakeners} icon={TrendingDown} />
        </div>
      )}

      {data.takeaways.team_vs_player?.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-blue-400 flex items-center gap-1">
            <Users className="h-3 w-3" /> Team vs Player lens
          </h4>
          <BulletList items={data.takeaways.team_vs_player} icon={Users} />
        </div>
      )}

      {data.takeaways.actionable_next_steps && data.takeaways.actionable_next_steps.length > 0 && (
        <div className="cosmic-card rounded-xl p-3 space-y-1.5">
          <h4 className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Next steps
          </h4>
          <BulletList items={data.takeaways.actionable_next_steps} icon={Lightbulb} />
        </div>
      )}

      {/* Confidence & Volatility rationale */}
      <div className="cosmic-card rounded-xl p-3 space-y-1.5">
        <h4 className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" /> Analysis
        </h4>
        <p className="text-[10px] text-foreground/70 leading-relaxed">
          <span className="font-semibold text-foreground/80">Confidence:</span> {data.confidence.rationale}
        </p>
        <p className="text-[10px] text-foreground/70 leading-relaxed">
          <span className="font-semibold text-foreground/80">Volatility:</span> {data.volatility.rationale}
        </p>
      </div>

      {/* Follow-up questions */}
      {data.follow_up_questions && data.follow_up_questions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.follow_up_questions.map((q, i) => (
            <span key={i} className="text-[9px] px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              {q}
            </span>
          ))}
        </div>
      )}

      {/* Disclaimers */}
      {data.disclaimers?.length > 0 && (
        <div className="flex items-start gap-1.5 pt-1">
          <ShieldAlert className="h-3 w-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
            {data.disclaimers.join(" ")}
          </p>
        </div>
      )}
    </div>
  );
}
