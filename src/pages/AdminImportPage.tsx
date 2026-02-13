import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AdminImportPage() {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const importSchedule = async () => {
    setLoading(true);
    addLog("Fetching schedule CSV...");
    try {
      const res = await fetch("/data/schedule-2025-26.csv");
      const csvText = await res.text();
      const lines = csvText.trim().split("\n");
      addLog(`Loaded ${lines.length - 1} rows from CSV`);

      const { data, error } = await supabase.functions.invoke("import-sdio-bulk", {
        body: { action: "schedule", league: "NBA", csv_text: csvText },
      });

      if (error) {
        addLog(`❌ Error: ${error.message}`);
      } else {
        addLog(`✅ Inserted: ${data.inserted}, Skipped: ${data.skipped}`);
        if (data.errors?.length) {
          data.errors.forEach((e: string) => addLog(`  ⚠️ ${e}`));
        }
      }
    } catch (e: any) {
      addLog(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Data Import Admin</h1>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={importSchedule} disabled={loading}>
          {loading ? "Importing..." : "Import 2025-26 Schedule"}
        </Button>
      </div>

      <Card className="p-4 bg-muted/30 max-h-96 overflow-y-auto">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {log.length ? log.join("\n") : "No activity yet. Click a button above to start importing."}
        </pre>
      </Card>
    </div>
  );
}