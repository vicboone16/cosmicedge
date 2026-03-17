import { useState, useMemo, useEffect } from "react";
import { Clock, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { getPlanetaryHourAt, getDayRuler } from "@/lib/planetary-hours";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PlayerData {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  birth_date: string | null;
}

interface Props {
  startTime: string;
  venueLat: number | null;
  awayPlayers?: PlayerData[];
  homePlayers?: PlayerData[];
  awayAbbr?: string;
  homeAbbr?: string;
  selectedPlayer?: PlayerData | null;
  onSelectPlayer?: (player: PlayerData | null) => void;
}

const PLANETS = [
  { name: "Sun", symbol: "☉", speed: 0.9856 },
  { name: "Moon", symbol: "☽", speed: 13.176 },
  { name: "Mercury", symbol: "☿", speed: 1.383 },
  { name: "Venus", symbol: "♀", speed: 1.2 },
  { name: "Mars", symbol: "♂", speed: 0.524 },
  { name: "Jupiter", symbol: "♃", speed: 0.083 },
  { name: "Saturn", symbol: "♄", speed: 0.034 },
];

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_SYMBOLS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

type ChartView = "transit" | "astrocartography" | "none";

// Compute approximate planetary positions for a given time
function computeTransitPositions(time: Date) {
  const J2000 = new Date("2000-01-01T12:00:00Z").getTime();
  const daysSinceJ2000 = (time.getTime() - J2000) / 86400000;

  // Base ecliptic longitudes (approximate for J2000)
  const baseLongitudes = [280.46, 218.32, 252.25, 181.98, 355.43, 34.35, 49.94];

  return PLANETS.map((p, i) => {
    const longitude = (baseLongitudes[i] + p.speed * daysSinceJ2000) % 360;
    const normalizedLong = longitude < 0 ? longitude + 360 : longitude;
    const signIndex = Math.floor(normalizedLong / 30);
    const degree = Math.round(normalizedLong % 30);
    return {
      ...p,
      longitude: normalizedLong,
      sign: SIGNS[signIndex],
      signSymbol: SIGN_SYMBOLS[signIndex],
      degree,
    };
  });
}

// Compute aspects between two sets of positions
function computeAspects(
  positions: ReturnType<typeof computeTransitPositions>,
  natalPositions?: ReturnType<typeof computeTransitPositions>
) {
  const ASPECT_DEFS = [
    { name: "Conjunction", symbol: "☌", angle: 0, orb: 8, nature: "neutral" as const },
    { name: "Sextile", symbol: "⚹", angle: 60, orb: 6, nature: "harmonious" as const },
    { name: "Square", symbol: "□", angle: 90, orb: 7, nature: "challenging" as const },
    { name: "Trine", symbol: "△", angle: 120, orb: 8, nature: "harmonious" as const },
    { name: "Opposition", symbol: "☍", angle: 180, orb: 8, nature: "challenging" as const },
  ];

  const aspects: {
    planet1: string; symbol1: string;
    planet2: string; symbol2: string;
    aspect: string; aspectSymbol: string;
    nature: "harmonious" | "challenging" | "neutral";
    orb: number; exact: boolean;
  }[] = [];

  const targetPositions = natalPositions || positions;
  const startIdx = natalPositions ? 0 : 0;

  for (let i = 0; i < positions.length; i++) {
    const jStart = natalPositions ? 0 : i + 1;
    for (let j = jStart; j < targetPositions.length; j++) {
      if (!natalPositions && i === j) continue;
      const diff = Math.abs(positions[i].longitude - targetPositions[j].longitude);
      const angle = diff > 180 ? 360 - diff : diff;

      for (const asp of ASPECT_DEFS) {
        const orbDiff = Math.abs(angle - asp.angle);
        if (orbDiff <= asp.orb) {
          aspects.push({
            planet1: positions[i].name,
            symbol1: positions[i].symbol,
            planet2: targetPositions[j].name,
            symbol2: targetPositions[j].symbol,
            aspect: asp.name,
            aspectSymbol: asp.symbol,
            nature: asp.nature,
            orb: Math.round(orbDiff * 10) / 10,
            exact: orbDiff < 1,
          });
          break;
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb).slice(0, 12);
}

// Compute natal positions from birth date (noon chart)
function computeNatalPositions(birthDate: string) {
  const d = new Date(birthDate + "T12:00:00");
  return computeTransitPositions(d);
}

// Mini-phrase component for transit insight
function TransitInsightPhrase({
  planetaryHour,
  offsetMinutes,
  aspects,
  selectedPlayer,
}: {
  planetaryHour: ReturnType<typeof getPlanetaryHourAt>;
  offsetMinutes: number;
  aspects: ReturnType<typeof computeAspects>;
  selectedPlayer: PlayerData | null;
}) {
  const phrase = useMemo(() => {
    const harmonious = aspects.filter(a => a.nature === "harmonious");
    const challenging = aspects.filter(a => a.nature === "challenging");
    const exact = aspects.filter(a => a.exact);

    if (selectedPlayer) {
      if (harmonious.length > challenging.length) {
        return `✦ ${selectedPlayer.name} has favorable transits — expect enhanced performance`;
      } else if (challenging.length > harmonious.length) {
        return `⚠ ${selectedPlayer.name} faces transit resistance — watch for inconsistency`;
      }
      return `◎ ${selectedPlayer.name}'s transits are neutral — standard output expected`;
    }

    if (exact.length > 0) {
      const e = exact[0];
      if (e.nature === "harmonious") return `✦ Exact ${e.aspect}: ${e.planet1}–${e.planet2} — scoring energy amplified`;
      if (e.nature === "challenging") return `⚠ Exact ${e.aspect}: ${e.planet1}–${e.planet2} — tension and volatility rise`;
      return `☌ Exact conjunction: ${e.planet1}–${e.planet2} — intense, unpredictable energy`;
    }

    if (!planetaryHour) return null;

    const planet = planetaryHour.planet;
    const phrases: Record<string, string> = {
      Sun: "☉ Sun Hour — bold plays and high-scoring runs favored",
      Moon: "☽ Moon Hour — emotional swings, crowd energy impacts momentum",
      Mars: "♂ Mars Hour — aggressive defense, fast breaks, physicality",
      Mercury: "☿ Mercury Hour — quick passing, turnovers possible, transition game",
      Jupiter: "♃ Jupiter Hour — expansion, high totals, generous scoring",
      Venus: "♀ Venus Hour — finesse shooting, smooth ball movement",
      Saturn: "♄ Saturn Hour — discipline wins, grind-it-out, low scoring",
    };
    return phrases[planet] || null;
  }, [planetaryHour, aspects, selectedPlayer, offsetMinutes]);

  if (!phrase) return null;

  return (
    <div className="text-center py-1.5 px-3 rounded-lg bg-primary/5 border border-primary/10">
      <p className="text-[10px] text-primary/80 font-medium leading-relaxed">{phrase}</p>
    </div>
  );
}

export function TransitScrubber({ startTime, venueLat, awayPlayers, homePlayers, awayAbbr, homeAbbr, selectedPlayer: controlledPlayer, onSelectPlayer }: Props) {
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [chartView, setChartView] = useState<ChartView>("transit");
  const [showAspects, setShowAspects] = useState(true);
  const [internalSelectedPlayer, setInternalSelectedPlayer] = useState<PlayerData | null>(null);
  const [expandedView, setExpandedView] = useState(false);

  // Use controlled player if provided, otherwise use internal state
  const selectedPlayer = controlledPlayer !== undefined ? controlledPlayer : internalSelectedPlayer;
  const setSelectedPlayer = (p: PlayerData | null) => {
    if (onSelectPlayer) onSelectPlayer(p);
    else setInternalSelectedPlayer(p);
  };

  // Auto-expand player panel when a player is selected externally
  useEffect(() => {
    if (controlledPlayer) setExpandedView(true);
  }, [controlledPlayer]);


  const gameStart = useMemo(() => new Date(startTime), [startTime]);
  const currentTime = useMemo(() => {
    return new Date(gameStart.getTime() + offsetMinutes * 60 * 1000);
  }, [gameStart, offsetMinutes]);

  const lat = venueLat || 40.7;
  const planetaryHour = useMemo(() => getPlanetaryHourAt(currentTime, lat), [currentTime, lat]);
  const dayRuler = useMemo(() => getDayRuler(currentTime), [currentTime]);

  // Current transit positions
  const transitPositions = useMemo(() => computeTransitPositions(currentTime), [currentTime]);

  // Selected player natal positions
  const natalPositions = useMemo(() => {
    if (!selectedPlayer?.birth_date) return null;
    return computeNatalPositions(selectedPlayer.birth_date);
  }, [selectedPlayer]);

  // Compute aspects based on view
  const aspects = useMemo(() => {
    if (natalPositions) {
      // Transit-to-natal aspects
      return computeAspects(transitPositions, natalPositions);
    }
    // Transit-to-transit aspects
    return computeAspects(transitPositions);
  }, [transitPositions, natalPositions]);

  const formatLabel = (min: number) => {
    if (min === 0) return "Tip-off";
    if (min < 0) return `${Math.abs(min)}m before`;
    return `+${min}m`;
  };

  const toggleChartView = () => {
    const views: ChartView[] = ["transit", "astrocartography", "none"];
    const idx = views.indexOf(chartView);
    setChartView(views[(idx + 1) % views.length]);
  };

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Transit Scrubber
        {/* Toggle button */}
        <button
          onClick={toggleChartView}
          className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors astro-badge rounded-full px-2 py-0.5"
        >
          {chartView === "none" ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {chartView === "transit" ? "Transits" : chartView === "astrocartography" ? "AstroCarto" : "Hidden"}
        </button>
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

        {/* Transit Insight Mini-Phrase */}
        <TransitInsightPhrase
          planetaryHour={planetaryHour}
          offsetMinutes={offsetMinutes}
          aspects={aspects}
          selectedPlayer={selectedPlayer}
        />

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

        {/* Chart View */}
        {chartView !== "none" && (
          <>
            {chartView === "transit" && (
              <>
                {/* Planet positions grid */}
                <div className="grid grid-cols-7 gap-1">
                  {transitPositions.map((p) => (
                    <div key={p.name} className="text-center">
                      <span className="text-sm">{p.symbol}</span>
                      <p className="text-[9px] text-foreground font-medium">{p.signSymbol}</p>
                      <p className="text-[8px] text-muted-foreground">{p.degree}° {p.sign.slice(0, 3)}</p>
                    </div>
                  ))}
                </div>

                {/* Selected player natal overlay */}
                {selectedPlayer && natalPositions && (
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-[10px] font-semibold text-cosmic-indigo mb-2">
                      {selectedPlayer.name} — Natal Positions (noon chart)
                    </p>
                    <div className="grid grid-cols-7 gap-1">
                      {natalPositions.map((p) => (
                        <div key={`natal-${p.name}`} className="text-center opacity-70">
                          <span className="text-sm">{p.symbol}</span>
                          <p className="text-[9px] text-cosmic-lavender font-medium">{p.signSymbol}</p>
                          <p className="text-[8px] text-muted-foreground">{p.degree}° {p.sign.slice(0, 3)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {chartView === "astrocartography" && (
              <div className="celestial-gradient rounded-lg p-3">
                <p className="text-[10px] font-semibold text-foreground mb-1">Astrocartography at Venue</p>
                <p className="text-[9px] text-muted-foreground mb-2">
                  Lat: {lat.toFixed(2)}° · {format(currentTime, "h:mm a")}
                </p>
                {/* Simplified line indicator */}
                <div className="space-y-1">
                  {transitPositions.slice(0, 5).map((p) => {
                    // Approximate MC/IC/ASC/DSC crossings based on longitude
                    const mcAngle = Math.abs((p.longitude - (currentTime.getUTCHours() * 15)) % 360);
                    const isMC = mcAngle < 15 || mcAngle > 345;
                    const isIC = Math.abs(mcAngle - 180) < 15;
                    const isASC = Math.abs(mcAngle - 90) < 20;
                    const isDSC = Math.abs(mcAngle - 270) < 20;
                    const crossing = isMC ? "MC" : isIC ? "IC" : isASC ? "ASC" : isDSC ? "DSC" : null;

                    return crossing ? (
                      <div key={p.name} className="flex items-center gap-2">
                        <span className="text-sm w-5">{p.symbol}</span>
                        <span className="text-[10px] font-semibold text-foreground">{p.name}</span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-semibold",
                          crossing === "MC" ? "bg-cosmic-gold/20 text-cosmic-gold" :
                          crossing === "IC" ? "bg-cosmic-cyan/20 text-cosmic-cyan" :
                          crossing === "ASC" ? "bg-cosmic-green/20 text-cosmic-green" :
                          "bg-cosmic-red/20 text-cosmic-red"
                        )}>
                          {crossing} line
                        </span>
                      </div>
                    ) : null;
                  })}
                  {transitPositions.slice(0, 5).every((p) => {
                    const mcAngle = Math.abs((p.longitude - (currentTime.getUTCHours() * 15)) % 360);
                    return !(mcAngle < 15 || mcAngle > 345 || Math.abs(mcAngle - 180) < 15 || Math.abs(mcAngle - 90) < 20 || Math.abs(mcAngle - 270) < 20);
                  }) && (
                    <p className="text-[9px] text-muted-foreground italic">No major planetary lines cross the venue at this time.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Aspects section */}
        <div className="border-t border-border/50 pt-3">
          <button
            onClick={() => setShowAspects(!showAspects)}
            className="flex items-center justify-between w-full mb-2"
          >
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
              {selectedPlayer ? `Transits to ${selectedPlayer.name}` : "Active Aspects"}
            </p>
            {showAspects ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>

          {showAspects && (
            <div className="space-y-1">
              {aspects.length === 0 && (
                <p className="text-[9px] text-muted-foreground italic">No major aspects within orb.</p>
              )}
              {aspects.map((a, i) => (
                <div key={i} className={cn(
                  "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg",
                  a.exact ? "bg-primary/10" : "bg-secondary/50",
                  a.nature === "harmonious" ? "text-cosmic-green" :
                  a.nature === "challenging" ? "text-cosmic-red" :
                  "text-cosmic-gold"
                )}>
                  <span>{a.symbol1}</span>
                  <span className="font-semibold">{a.aspectSymbol}</span>
                  <span>{a.symbol2}</span>
                  <span className="text-muted-foreground ml-1">
                    {a.planet1} {a.aspect} {a.planet2}
                  </span>
                  <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                    {a.orb}° {a.exact ? "✦ exact" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player selector */}
        {(awayPlayers?.length || homePlayers?.length) ? (
          <div className="border-t border-border/50 pt-3">
            <button
              onClick={() => setExpandedView(!expandedView)}
              className="flex items-center justify-between w-full mb-2"
            >
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                Player Charts {selectedPlayer ? `· ${selectedPlayer.name}` : ""}
              </p>
              {expandedView ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>

            {expandedView && (
              <div className="grid grid-cols-2 gap-2">
                {/* Away team */}
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">{awayAbbr}</p>
                  <div className="space-y-1">
                    {awayPlayers?.slice(0, 8).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : p)}
                        className={cn(
                          "w-full text-left text-[10px] px-2 py-1.5 rounded-lg transition-colors",
                          selectedPlayer?.id === p.id
                            ? "bg-primary/20 text-primary font-semibold"
                            : "bg-secondary/30 text-foreground hover:bg-secondary/60"
                        )}
                      >
                        {p.name}
                        {p.birth_date && (
                          <span className="text-[8px] text-muted-foreground ml-1">
                            {SIGN_SYMBOLS[Math.floor((new Date(p.birth_date + "T12:00:00").getMonth() + new Date(p.birth_date + "T12:00:00").getDate() / 30) % 12)]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Home team */}
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">{homeAbbr}</p>
                  <div className="space-y-1">
                    {homePlayers?.slice(0, 8).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : p)}
                        className={cn(
                          "w-full text-left text-[10px] px-2 py-1.5 rounded-lg transition-colors",
                          selectedPlayer?.id === p.id
                            ? "bg-primary/20 text-primary font-semibold"
                            : "bg-secondary/30 text-foreground hover:bg-secondary/60"
                        )}
                      >
                        {p.name}
                        {p.birth_date && (
                          <span className="text-[8px] text-muted-foreground ml-1">
                            {SIGN_SYMBOLS[Math.floor((new Date(p.birth_date + "T12:00:00").getMonth() + new Date(p.birth_date + "T12:00:00").getDate() / 30) % 12)]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedPlayer && (
              <button
                onClick={() => setSelectedPlayer(null)}
                className="text-[10px] text-primary hover:underline mt-2"
              >
                Clear selection
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
