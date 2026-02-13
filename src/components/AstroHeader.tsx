import { Moon, ArrowDown, Orbit } from "lucide-react";

// Client-side moon phase + retrograde calculator (no API needed)
function getMoonPhase(): { name: string; emoji: string; illumination: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Simplified synodic month calculation
  const lp = 2551443; // lunar period in seconds
  const newMoon = new Date(1970, 0, 7, 20, 35, 0).getTime() / 1000;
  const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;

  const dayInCycle = phase * 29.53;
  let name = "";
  let emoji = "";

  if (dayInCycle < 1.85) { name = "New Moon"; emoji = "🌑"; }
  else if (dayInCycle < 5.53) { name = "Waxing Crescent"; emoji = "🌒"; }
  else if (dayInCycle < 9.22) { name = "First Quarter"; emoji = "🌓"; }
  else if (dayInCycle < 12.91) { name = "Waxing Gibbous"; emoji = "🌔"; }
  else if (dayInCycle < 16.61) { name = "Full Moon"; emoji = "🌕"; }
  else if (dayInCycle < 20.30) { name = "Waning Gibbous"; emoji = "🌖"; }
  else if (dayInCycle < 23.99) { name = "Last Quarter"; emoji = "🌗"; }
  else if (dayInCycle < 27.68) { name = "Waning Crescent"; emoji = "🌘"; }
  else { name = "New Moon"; emoji = "🌑"; }

  return { name, emoji, illumination: Math.round(phase * 100) };
}

// Approximate retrograde periods for 2025-2026
function getRetrogradePlanets(): string[] {
  const now = new Date();
  const retrogrades: string[] = [];

  // Mercury retrogrades 2026 (approximate)
  const mercuryRetros = [
    [new Date("2026-01-25"), new Date("2026-02-15")],
    [new Date("2026-05-20"), new Date("2026-06-12")],
    [new Date("2026-09-13"), new Date("2026-10-05")],
  ];
  for (const [start, end] of mercuryRetros) {
    if (now >= start && now <= end) retrogrades.push("Mercury ℞");
  }

  // Venus retrograde 2026
  if (now >= new Date("2026-03-02") && now <= new Date("2026-04-13")) {
    retrogrades.push("Venus ℞");
  }

  // Mars retrograde
  if (now >= new Date("2025-12-06") && now <= new Date("2026-02-24")) {
    retrogrades.push("Mars ℞");
  }

  // Jupiter retrograde 2026
  if (now >= new Date("2026-07-14") && now <= new Date("2026-11-10")) {
    retrogrades.push("Jupiter ℞");
  }

  // Saturn retrograde 2026
  if (now >= new Date("2026-06-08") && now <= new Date("2026-10-24")) {
    retrogrades.push("Saturn ℞");
  }

  return retrogrades;
}

export function AstroHeader() {
  const moon = getMoonPhase();
  const retrogrades = getRetrogradePlanets();

  return (
    <div className="celestial-gradient rounded-xl p-3 mx-4 mt-2 mb-1">
      <div className="flex items-center justify-between">
        {/* Moon Phase */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{moon.emoji}</span>
          <div>
            <p className="text-xs font-semibold text-foreground">{moon.name}</p>
            <p className="text-[10px] text-muted-foreground">Current Lunar Phase</p>
          </div>
        </div>

        {/* Retrogrades */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {retrogrades.length > 0 ? (
            retrogrades.map((r) => (
              <span key={r} className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-semibold text-cosmic-indigo">
                {r}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-cosmic-green font-medium flex items-center gap-1">
              <Orbit className="h-3 w-3" />
              All Direct
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
