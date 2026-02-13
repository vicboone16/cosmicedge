import { Trophy } from "lucide-react";

const Results = () => {
  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-cosmic-gold" />
          <h1 className="text-xl font-bold font-display tracking-tight">Results</h1>
        </div>
        <p className="text-xs text-muted-foreground">Bet history & calibration</p>
      </header>
      <div className="px-4 py-8">
        <div className="cosmic-card rounded-xl p-8 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Results tracking coming in Phase 7</p>
        </div>
      </div>
    </div>
  );
};

export default Results;
