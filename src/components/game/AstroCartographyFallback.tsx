/**
 * Astrocartography Fallback — Location Advantage Insight
 * Shows even when player roster data is unavailable.
 * Uses team_astro data (city rulers, founded locations) to determine
 * which team the venue astrologically favors.
 */
import { useQuery } from "@tanstack/react-query";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  homeAbbr: string;
  awayAbbr: string;
  venue: string | null;
  venueLat: number | null;
  venueLng: number | null;
  hasPlayerSection: boolean; // if true, the player-level section already rendered
}

const PLANET_AFFINITIES: Record<string, { element: string; regions: string }> = {
  Sun: { element: "Fire", regions: "favorable in warm/southern latitudes" },
  Moon: { element: "Water", regions: "strongest near coasts and northern latitudes" },
  Mars: { element: "Fire", regions: "energizes desert and high-altitude venues" },
  Venus: { element: "Earth", regions: "harmonizes with temperate, green-city venues" },
  Mercury: { element: "Air", regions: "boosts in urban tech-hub cities" },
  Jupiter: { element: "Fire", regions: "expansive energy in large-market arenas" },
  Saturn: { element: "Earth", regions: "grinding energy in cold-weather cities" },
};

function getLocationInsight(
  homeTeam: any, awayTeam: any,
  venueLat: number, venueLng: number,
  homeAbbr: string, awayAbbr: string,
): { favors: string; reason: string; detail: string } {
  let homeScore = 0;
  let awayScore = 0;
  const reasons: string[] = [];

  // Home court inherent advantage
  homeScore += 2;
  reasons.push(`${homeAbbr} has home court`);

  // City ruler alignment with venue latitude
  if (homeTeam?.city_ruler && PLANET_AFFINITIES[homeTeam.city_ruler]) {
    const aff = PLANET_AFFINITIES[homeTeam.city_ruler];
    // Home team's city ruler is naturally in its home venue
    homeScore += 1;
    reasons.push(`${homeAbbr} city ruler ${homeTeam.city_ruler} ${aff.regions}`);
  }

  // Away team travel — check if away team's city latitude is very different (long-distance travel)
  if (awayTeam?.founded_lat && venueLat) {
    const latDiff = Math.abs(awayTeam.founded_lat - venueLat);
    if (latDiff > 15) {
      homeScore += 1;
      reasons.push(`${awayAbbr} traveling ${latDiff.toFixed(0)}° latitude — fatigue factor`);
    }
  }

  // Element vs venue region
  const isCoastal = venueLng < -115 || venueLng > -75;
  const isNorthern = venueLat > 40;
  const isSouthern = venueLat < 33;

  if (homeTeam?.element === "Water" && isCoastal) {
    homeScore += 1;
    reasons.push(`${homeAbbr}'s Water element resonates with coastal venue`);
  }
  if (awayTeam?.element === "Water" && isCoastal) {
    awayScore += 1;
    reasons.push(`${awayAbbr}'s Water element finds comfort in coastal venue`);
  }
  if (homeTeam?.element === "Fire" && isSouthern) {
    homeScore += 1;
    reasons.push(`${homeAbbr}'s Fire element amplified at southern latitude`);
  }
  if (awayTeam?.element === "Fire" && isSouthern) {
    awayScore += 1;
    reasons.push(`${awayAbbr}'s Fire element benefits from southern latitude`);
  }
  if (homeTeam?.element === "Earth" && isNorthern) {
    homeScore += 1;
    reasons.push(`${homeAbbr}'s Earth element strengthened at northern venue`);
  }
  if (awayTeam?.element === "Earth" && isNorthern) {
    awayScore += 1;
    reasons.push(`${awayAbbr}'s Earth element benefits from northern venue`);
  }

  const diff = homeScore - awayScore;
  if (diff > 2) return {
    favors: homeAbbr,
    reason: `Location strongly favors ${homeAbbr}`,
    detail: reasons.slice(0, 3).join(". ") + ".",
  };
  if (diff > 0) return {
    favors: homeAbbr,
    reason: `Location slightly favors ${homeAbbr}`,
    detail: reasons.slice(0, 3).join(". ") + ".",
  };
  if (diff < -1) return {
    favors: awayAbbr,
    reason: `Rare: location favors visiting ${awayAbbr}`,
    detail: reasons.slice(0, 3).join(". ") + ".",
  };
  return {
    favors: "Neutral",
    reason: "No clear astrological location advantage",
    detail: reasons.slice(0, 2).join(". ") + ".",
  };
}

export function AstroCartographyFallback({ homeAbbr, awayAbbr, venue, venueLat, venueLng, hasPlayerSection }: Props) {
  const { data: teamAstro, isLoading } = useQuery({
    queryKey: ["astrocarto-fallback", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet, city_ruler, founded_lat, founded_lng, founded_city")
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  // Don't render if no lat/lng
  if (!venueLat || !venueLng) return null;

  // If the player section already rendered, skip the fallback header
  if (hasPlayerSection) return null;

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Astrocartography — Venue Influence
        </h3>
        <div className="cosmic-card rounded-xl p-4 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const homeTeam = teamAstro?.find(t => t.team_abbr === homeAbbr);
  const awayTeam = teamAstro?.find(t => t.team_abbr === awayAbbr);

  if (!homeTeam && !awayTeam) return null;

  const insight = getLocationInsight(homeTeam, awayTeam, venueLat, venueLng, homeAbbr, awayAbbr);

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Astrocartography — Venue Influence
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        {venue && (
          <p className="text-[10px] text-muted-foreground">
            📍 {venue} ({venueLat.toFixed(1)}°N, {Math.abs(venueLng).toFixed(1)}°W)
          </p>
        )}

        {/* Location advantage card */}
        <div className={cn(
          "rounded-lg px-3 py-3",
          insight.favors === homeAbbr ? "bg-cosmic-green/8 border border-cosmic-green/20" :
          insight.favors === awayAbbr ? "bg-primary/8 border border-primary/20" :
          "bg-secondary/30 border border-border/30",
        )}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className={cn(
              "h-3.5 w-3.5",
              insight.favors === homeAbbr ? "text-cosmic-green" :
              insight.favors === awayAbbr ? "text-primary" :
              "text-muted-foreground",
            )} />
            <p className={cn(
              "text-[10px] font-bold",
              insight.favors === homeAbbr ? "text-cosmic-green" :
              insight.favors === awayAbbr ? "text-primary" :
              "text-muted-foreground",
            )}>
              {insight.reason}
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground leading-relaxed ml-5">
            {insight.detail}
          </p>
        </div>

        {/* Team city rulers */}
        {(homeTeam?.city_ruler || awayTeam?.city_ruler) && (
          <div className="flex gap-3">
            {awayTeam?.city_ruler && (
              <div className="flex-1 bg-secondary/20 rounded-lg px-2.5 py-2">
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider">{awayAbbr} City Ruler</p>
                <p className="text-[10px] font-semibold text-foreground">{awayTeam.city_ruler}</p>
                {awayTeam.founded_city && (
                  <p className="text-[8px] text-muted-foreground">{awayTeam.founded_city}</p>
                )}
              </div>
            )}
            {homeTeam?.city_ruler && (
              <div className="flex-1 bg-secondary/20 rounded-lg px-2.5 py-2">
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider">{homeAbbr} City Ruler</p>
                <p className="text-[10px] font-semibold text-foreground">{homeTeam.city_ruler}</p>
                {homeTeam.founded_city && (
                  <p className="text-[8px] text-muted-foreground">{homeTeam.founded_city}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
