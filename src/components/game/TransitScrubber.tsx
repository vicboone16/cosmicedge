import { useState, useMemo } from "react";
import { Clock } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { getPlanetaryHourAt, getDayRuler } from "@/lib/planetary-hours";
import { format } from "date-fns";

interface Props {
  startTime: string;
  venueLat: number | null;
}

const PLANETS_IN_ORDER = [
  { name: "Sun", symbol: "☉" },
  { name: "Moon", symbol: "☽" },
  { name: "Mercury", symbol: "☿" },
  { name: "Venus", symbol: "♀" },
  { name: "Mars", symbol: "♂" },
  { name: "Jupiter", symbol: "♃" },
  { name: "Saturn", symbol: "♄" },
];

export function TransitScrubber({ startTime, venueLat }: Props) {
  // Slider range: -120 min to +240 min from game start (2h before to 4h after)
  const [offsetMinutes, setOffsetMinutes] = useState(0);

  const gameStart = useMemo(() => new Date(startTime), [startTime]);
  const currentTime = useMemo(() => {
    return new Date(gameStart.getTime() + offsetMinutes * 60 * 1000);
  }, [gameStart, offsetMinutes]);

  const lat = venueLat || 40.7;
  const planetaryHour = useMemo(() => getPlanetaryHourAt(currentTime, lat), [currentTime, lat]);
  const dayRuler = useMemo(() => getDayRuler(currentTime), [currentTime]);

  // Simplified transit positions (visual approximation)
  const transitPositions = useMemo(() => {
    // In a real implementation, these would come from an ephemeris
    // For now, show planetary hour information at the scrubbed time
    const hour = currentTime.getHours();
    return PLANETS_IN_ORDER.map((p, i) => {
      const baseAngle = (hour * 15 + i * 51.43) % 360; // Spread across zodiac
      const signIndex = Math.floor(baseAngle / 30);
      const degree = Math.round(baseAngle % 30);
      const signs = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
      const signNames = ["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"];
      return {
        ...p,
        sign: signs[signIndex],
        signName: signNames[signIndex],
        degree,
      };
    });
  }, [currentTime]);

  const formatLabel = (min: number) => {
    if (min === 0) return "Tip-off";
    if (min < 0) return `${Math.abs(min)}m before`;
    return `+${min}m`;
  };

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Transit Scrubber
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-4">
        {/* Time display */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {format(currentTime, "h:mm a")}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatLabel(offsetMinutes)}</p>
          </div>
          <div className="text-right">
            {planetaryHour && (
              <p className="text-xs font-medium text-foreground">
                <span className="text-sm">{planetaryHour.symbol}</span> {planetaryHour.planet} Hour
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Day of {dayRuler.symbol} {dayRuler.planet}
            </p>
          </div>
        </div>

        {/* Slider */}
        <div className="space-y-1">
          <Slider
            value={[offsetMinutes]}
            onValueChange={([v]) => setOffsetMinutes(v)}
            min={-120}
            max={240}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>-2h</span>
            <span>Tip-off</span>
            <span>+2h</span>
            <span>+4h</span>
          </div>
        </div>

        {/* Planet positions */}
        <div className="grid grid-cols-7 gap-1">
          {transitPositions.map((p) => (
            <div key={p.name} className="text-center">
              <span className="text-sm">{p.symbol}</span>
              <p className="text-[9px] text-foreground font-medium">{p.sign}</p>
              <p className="text-[8px] text-muted-foreground">{p.degree}° {p.signName}</p>
            </div>
          ))}
        </div>

        <p className="text-[9px] text-muted-foreground italic text-center">
          ⚠ Approximate positions — connect ephemeris API for precision
        </p>
      </div>
    </section>
  );
}
