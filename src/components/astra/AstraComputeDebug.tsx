import { useState } from "react";
import { cn } from "@/lib/utils";
import { Bug, Send, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface DebugStep {
  step: string;
  status: string;
  result?: any;
}

interface DebugResult {
  question: string;
  intent: { intent: string; entities: any; reasoning: string };
  player: any;
  formula: any;
  variables: Record<string, number>;
  computeResult: any;
  steps: DebugStep[];
}

interface ComputeResponse {
  success: boolean;
  compute_blocked?: boolean;
  block_reason?: string;
  answer: string;
  computed_value: number | null;
  formula_used: any;
  variables_used: Record<string, number>;
  sanity_violations?: string[];
  data_source: string | null;
  data_rows: number;
  intent: string;
  player: any;
  fallback_info: string[] | null;
  debug?: DebugResult;
}

const STEP_LABELS: Record<string, string> = {
  intent_detection: "Intent Detection",
  entity_resolution: "Entity Resolution",
  formula_retrieval: "Formula Retrieval",
  scorecard_retrieval: "Scorecard Data",
  player_stats_retrieval: "Player Stats",
  model_predictions_retrieval: "Model Predictions",
  glossary_retrieval: "Glossary Lookup",
  computation: "Computation",
  narrative_generation: "Narrative Generation",
};

const INTENT_COLORS: Record<string, string> = {
  formula_compute: "bg-primary/20 text-primary border-primary/30",
  stat_lookup: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  model_output: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  glossary: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  explanation: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  general_chat: "bg-muted text-muted-foreground border-border",
};

function StepRow({ step }: { step: DebugStep }) {
  const [open, setOpen] = useState(false);
  const hasResult = step.result != null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors text-left">
          {step.status === "done" ? (
            <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
          ) : step.status === "running" ? (
            <Loader2 className="h-3 w-3 text-primary animate-spin flex-shrink-0" />
          ) : (
            <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
          )}
          <span className="text-[11px] font-medium text-foreground flex-1">
            {STEP_LABELS[step.step] || step.step}
          </span>
          {hasResult && (
            open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      {hasResult && (
        <CollapsibleContent>
          <pre className="text-[9px] text-muted-foreground bg-secondary/30 rounded-md p-2 ml-5 mb-1 overflow-x-auto max-h-32 overflow-y-auto">
            {JSON.stringify(step.result, null, 2)}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export default function AstraComputeDebug() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ComputeResponse | null>(null);
  const [debugData, setDebugData] = useState<DebugResult | null>(null);

  const runTest = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    setDebugData(null);

    try {
      const { data, error } = await supabase.functions.invoke("astra-compute", {
        body: { question: question.trim(), debug: true },
      });

      if (error) throw error;
      setResponse(data);
      setDebugData(data.debug || null);
    } catch (e) {
      console.error("Debug test error:", e);
      setResponse({
        success: false,
        answer: e instanceof Error ? e.message : "Unknown error",
        computed_value: null,
        formula_used: null,
        variables_used: {},
        data_source: null,
        data_rows: 0,
        intent: "error",
        player: null,
        fallback_info: ["Edge function error"],
      });
    } finally {
      setLoading(false);
    }
  };

  const EXAMPLE_QUESTIONS = [
    "What is the PIE for LeBron James?",
    "What is the edge score for Jokic rebounds?",
    "Show me the momentum multiplier for Brunson assists",
    "Explain how the projection was built",
    "What is the current prediction for Tatum points?",
    "What does edge score mean?",
  ];

  return (
    <div className="space-y-4">
      <div className="cosmic-card rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Astra Compute Debug</h3>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-bold bg-amber-500/10 text-amber-400 border-amber-500/20">
            Admin
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Test Astra's retrieval + compute pipeline. Shows intent detection, formula selection, data retrieval, and computation.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runTest()}
          placeholder="Enter test question..."
          className="flex-1 text-xs h-9"
        />
        <Button onClick={runTest} disabled={loading || !question.trim()} size="sm" className="gap-1.5 h-9">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Test
        </Button>
      </div>

      {/* Example questions */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => setQuestion(q)}
            className="text-[9px] px-2 py-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Results */}
      {response && (
        <div className="space-y-3">
          {/* Compute Blocked Banner */}
          {response.compute_blocked && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs font-bold text-red-400">Compute Blocked</span>
              </div>
              <p className="text-[10px] text-red-300">{response.block_reason}</p>
            </div>
          )}

          {/* Sanity Violations */}
          {response.sanity_violations && response.sanity_violations.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400">Sanity Violations ({response.sanity_violations.length})</span>
              </div>
              {response.sanity_violations.map((v: string, i: number) => (
                <p key={i} className="text-[10px] text-amber-300 font-mono">• {v}</p>
              ))}
            </div>
          )}

          {/* Intent */}
          <div className="cosmic-card rounded-xl p-3 space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Detected Intent</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-bold border", INTENT_COLORS[response.intent] || INTENT_COLORS.general_chat)}>
                {response.intent}
              </Badge>
              {response.player && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-secondary text-foreground border-border">
                  {response.player.name} ({response.player.team})
                </Badge>
              )}
            </div>
            {debugData?.intent?.reasoning && (
              <p className="text-[10px] text-muted-foreground italic">{debugData.intent.reasoning}</p>
            )}
            {debugData?.intent?.entities && (
              <pre className="text-[9px] text-muted-foreground bg-secondary/30 rounded-md p-2 overflow-x-auto">
                {JSON.stringify(debugData.intent.entities, null, 2)}
              </pre>
            )}
          </div>

          {/* Pipeline Steps */}
          {debugData?.steps && (
            <div className="cosmic-card rounded-xl p-3 space-y-1">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Pipeline Steps</h4>
              {debugData.steps.map((step, i) => (
                <StepRow key={i} step={step} />
              ))}
            </div>
          )}

          {/* Formula */}
          {response.formula_used && (
            <div className="cosmic-card rounded-xl p-3 space-y-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Selected Formula</h4>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{response.formula_used.name}</p>
                {response.formula_used.text && (
                  <p className="text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1">{response.formula_used.text}</p>
                )}
                {response.formula_used.plain_english && (
                  <p className="text-[10px] text-muted-foreground italic">{response.formula_used.plain_english}</p>
                )}
              </div>
            </div>
          )}

          {/* Variables */}
          {Object.keys(response.variables_used || {}).length > 0 && (
            <div className="cosmic-card rounded-xl p-3 space-y-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Retrieved Variables ({Object.keys(response.variables_used).length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {Object.entries(response.variables_used).slice(0, 30).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[10px] bg-secondary/30 rounded px-2 py-1">
                    <span className="font-mono text-muted-foreground truncate">{k}</span>
                    <span className="font-bold text-foreground tabular-nums ml-1">
                      {typeof v === "number" ? v.toFixed(2) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
              {response.data_source && (
                <p className="text-[9px] text-muted-foreground">
                  Source: {response.data_source} ({response.data_rows} rows)
                </p>
              )}
            </div>
          )}

          {/* Computed Output */}
          <div className="cosmic-card rounded-xl p-3 space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Computed Output</h4>
            {response.computed_value != null ? (
              <div className="text-center py-2">
                <p className="text-3xl font-bold text-primary tabular-nums">{response.computed_value}</p>
                {debugData?.computeResult?.computation && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">{debugData.computeResult.computation}</p>
                )}
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground italic">No deterministic computation performed</p>
                {debugData?.computeResult?.missingVars?.length > 0 && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Missing: {debugData.computeResult.missingVars.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Fallback Info */}
          {response.fallback_info && response.fallback_info.length > 0 && (
            <div className="cosmic-card rounded-xl p-3 border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Fallback / Missing Data</h4>
              </div>
              {response.fallback_info.map((info, i) => (
                <p key={i} className="text-[10px] text-muted-foreground">• {info}</p>
              ))}
            </div>
          )}

          {/* Final Astra Response */}
          <div className="cosmic-card rounded-xl p-3 space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Final Astra Response</h4>
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap bg-secondary/20 rounded-lg p-3">
              {response.answer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
