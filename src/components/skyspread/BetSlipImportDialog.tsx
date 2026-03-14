import { useState, useRef } from "react";
import { Upload, Link, Edit3, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useBetSlips } from "@/hooks/use-bet-slips";
import { toast } from "@/hooks/use-toast";
import { SlipIntentSelector, type SlipIntent } from "@/components/skyspread/SlipOptimizer";

type ImportMode = "link" | "screenshot" | "manual";

interface ManualPick {
  player_name: string;
  stat_type: string;
  line: string;
  direction: "over" | "under";
}

const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.86;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to process image"));
    img.src = dataUrl;
  });

const toOptimizedBase64 = async (file: File): Promise<string> => {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    const raw = dataUrl.split(",")[1] || "";
    return raw;
  }

  context.drawImage(image, 0, 0, width, height);

  const optimizedDataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  return optimizedDataUrl.split(",")[1] || "";
};

export default function BetSlipImportDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("link");
  const [url, setUrl] = useState("");
  const [book, setBook] = useState("prizepicks");
  const [entryType, setEntryType] = useState("power");
  const [stake, setStake] = useState("");
  const [payout, setPayout] = useState("");
  const [intentState, setIntentState] = useState<SlipIntent>("thinking");
  const [manualPicks, setManualPicks] = useState<ManualPick[]>([
    { player_name: "", stat_type: "", line: "", direction: "over" },
  ]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { importSlip } = useBetSlips();

  const addManualPick = () => {
    setManualPicks(prev => [...prev, { player_name: "", stat_type: "", line: "", direction: "over" }]);
  };

  const updatePick = (idx: number, field: keyof ManualPick, value: string) => {
    setManualPicks(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const removePick = (idx: number) => {
    setManualPicks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      e.target.value = "";
      return;
    }

    try {
      const base64 = await toOptimizedBase64(file);
      if (!base64) {
        throw new Error("Could not read screenshot");
      }

      importSlip.mutate({
        mode: "screenshot",
        image_base64: base64,
        book,
        entry_type: entryType,
        stake: parseFloat(stake) || 0,
        payout: parseFloat(payout) || 0,
        intent_state: intentState,
      }, {
        onSuccess: () => setOpen(false),
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Could not process screenshot",
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleSubmit = () => {
    if (mode === "link") {
      if (!url.trim()) {
        toast({ title: "Enter a share link", variant: "destructive" });
        return;
      }
      importSlip.mutate({ mode: "link", url, book, intent_state: intentState }, {
        onSuccess: () => { setOpen(false); setUrl(""); },
      });
    } else if (mode === "manual") {
      const validPicks = manualPicks.filter(p => p.player_name && p.stat_type && p.line);
      if (validPicks.length === 0) {
        toast({ title: "Add at least one pick", variant: "destructive" });
        return;
      }
      importSlip.mutate({
        mode: "manual",
        manual_picks: validPicks.map(p => ({
          player_name: p.player_name,
          stat_type: p.stat_type,
          line: parseFloat(p.line),
          direction: p.direction,
        })),
        book,
        entry_type: entryType,
        stake: parseFloat(stake) || 0,
        payout: parseFloat(payout) || 0,
        intent_state: intentState,
      }, {
        onSuccess: () => {
          setOpen(false);
          setManualPicks([{ player_name: "", stat_type: "", line: "", direction: "over" }]);
        },
      });
    }
  };

  const isPending = importSlip.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />
          Import Slip
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Import Bet Slip</DialogTitle>
        </DialogHeader>

        {/* Intent selector */}
        <SlipIntentSelector value={intentState} onChange={setIntentState} />

        {/* Mode tabs */}
        <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg">
          {([
            { key: "link" as const, label: "Paste Link", icon: Link },
            { key: "screenshot" as const, label: "Screenshot", icon: Upload },
            { key: "manual" as const, label: "Manual", icon: Edit3 },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-colors",
                mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Book</Label>
            <select
              value={book}
              onChange={e => setBook(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="prizepicks">PrizePicks</option>
              <option value="underdog">Underdog</option>
              <option value="draftkings">DraftKings</option>
              <option value="fanduel">FanDuel</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Entry Type</Label>
            <select
              value={entryType}
              onChange={e => setEntryType(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="power">Power</option>
              <option value="flex">Flex</option>
              <option value="goblin">Goblin</option>
              <option value="demons">Demons</option>
              <option value="parlay">Parlay</option>
              <option value="straight">Straight</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Stake ($)</Label>
            <Input type="number" value={stake} onChange={e => setStake(e.target.value)} placeholder="10" className="text-xs h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Payout ($)</Label>
            <Input type="number" value={payout} onChange={e => setPayout(e.target.value)} placeholder="50" className="text-xs h-9" />
          </div>
        </div>

        {/* Mode-specific content */}
        {mode === "link" && (
          <div className="space-y-2">
            <Label className="text-[10px]">Share Link</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://app.prizepicks.com/entry/..."
              className="text-xs h-9"
            />
            <p className="text-[10px] text-muted-foreground">
              Paste a PrizePicks, Underdog, or other share link
            </p>
          </div>
        )}

        {mode === "screenshot" && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isPending}
              className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 hover:border-primary/50 transition-colors"
            >
              {isPending ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {isPending ? "Processing screenshot..." : "Tap to upload screenshot"}
              </span>
            </button>
            <p className="text-[10px] text-muted-foreground text-center">
              AI will extract picks from the image
            </p>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-3">
            <Label className="text-[10px]">Picks</Label>
            {manualPicks.map((pick, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-secondary/30 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">Pick {idx + 1}</span>
                  {manualPicks.length > 1 && (
                    <button onClick={() => removePick(idx)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <Input
                  value={pick.player_name}
                  onChange={e => updatePick(idx, "player_name", e.target.value)}
                  placeholder="Player name"
                  className="text-xs h-8"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    value={pick.stat_type}
                    onChange={e => updatePick(idx, "stat_type", e.target.value)}
                    placeholder="Stat (pts)"
                    className="text-xs h-8"
                  />
                  <Input
                    type="number"
                    value={pick.line}
                    onChange={e => updatePick(idx, "line", e.target.value)}
                    placeholder="Line"
                    className="text-xs h-8"
                  />
                  <select
                    value={pick.direction}
                    onChange={e => updatePick(idx, "direction", e.target.value as "over" | "under")}
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="over">Over</option>
                    <option value="under">Under</option>
                  </select>
                </div>
              </div>
            ))}
            <button
              onClick={addManualPick}
              className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              + Add Pick
            </button>
          </div>
        )}

        {/* Submit */}
        {mode !== "screenshot" && (
          <Button onClick={handleSubmit} disabled={isPending} className="w-full gap-1.5">
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Importing..." : "Import Slip"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
