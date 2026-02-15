import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

interface AlertSetupDialogProps {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
}

const ALERT_TYPES = [
  { value: "game_final", label: "Game Final", description: "Notify when the game ends" },
  { value: "score_change", label: "Score Change", description: "Notify on score updates" },
  { value: "line_move", label: "Line Move", description: "Alert if spread moves past threshold" },
  { value: "quarter_end", label: "Quarter/Period End", description: "Alert at end of period" },
];

export function AlertSetupDialog({ gameId, homeTeam, awayTeam }: AlertSetupDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [alertType, setAlertType] = useState("game_final");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);

  const needsThreshold = alertType === "line_move" || alertType === "quarter_end";

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("alerts").insert({
        user_id: user.id,
        game_id: gameId,
        alert_type: alertType,
        threshold: needsThreshold && threshold ? parseFloat(threshold) : null,
        message: `Alert for ${awayTeam} @ ${homeTeam}`,
      } as any);

      if (error) throw error;
      toast({ title: "Alert created", description: `You'll be notified for ${ALERT_TYPES.find(t => t.value === alertType)?.label}` });
      setOpen(false);
      setAlertType("game_final");
      setThreshold("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          <span className="text-xs">Set Alert</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Set Alert — {awayTeam} @ {homeTeam}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Alert Type</label>
            <Select value={alertType} onValueChange={setAlertType}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALERT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    <div>
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground ml-1">— {t.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsThreshold && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {alertType === "line_move" ? "Spread threshold (e.g. -5)" : "Quarter number"}
              </label>
              <Input
                type="number"
                step={alertType === "line_move" ? "0.5" : "1"}
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                placeholder={alertType === "line_move" ? "-5" : "4"}
                className="text-xs"
              />
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full text-xs">
            {saving ? "Creating..." : "Create Alert"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
