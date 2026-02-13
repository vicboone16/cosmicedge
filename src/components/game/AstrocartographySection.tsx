import { useQuery } from "@tanstack/react-query";
import { Globe, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  gameId: string;
  players: { id: string; name: string; team: string | null }[];
  venueLat: number | null;
  venueLng: number | null;
  homeAbbr: string;
  awayAbbr: string;
}

interface AstrocartoResult {
  success: boolean;
  result?: any;
  error?: string;
}

function PlayerAstrocarto({ playerId, playerName, team, venueLat, venueLng }: {
  playerId: string; playerName: string; team: string; venueLat: number; venueLng: number;
}) {
  const { data, isLoading, error } = useQuery<AstrocartoResult>({
    queryKey: ["astrocarto", playerId, venueLat, venueLng],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode: "astrocartography",
        entity_id: playerId,
        entity_type: "player",
        lat: String(venueLat),
        lng: String(venueLng),
      });
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?${params}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!resp.ok) return { success: false, error: "API unavailable" };
      return resp.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground">{playerName}</span>
      </div>
    );
  }

  const result = data?.result;
  if (!result || data?.error) return null;

  // Extract planetary lines or angular data
  const lines = result?.planetary_lines || result?.angular_planets || result?.lines || [];
  const proximity = result?.closest_line || result?.proximity;
  const influence = result?.influence_summary || result?.summary;

  if (!lines?.length && !proximity && !influence) return null;

  return (
    <div className="cosmic-card rounded-lg p-2.5 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-foreground">{playerName}</p>
        <span className="text-[8px] text-primary font-bold">{team}</span>
      </div>
      {Array.isArray(lines) && lines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lines.slice(0, 4).map((line: any, i: number) => {
            const planet = line.planet || line.name || `Line ${i + 1}`;
            const angle = line.angle || line.type || "";
            const distance = line.distance_degrees ?? line.orb ?? null;
            const isClose = distance !== null && Math.abs(distance) < 2;
            return (
              <span
                key={i}
                className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded font-medium",
                  isClose ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {planet} {angle} {distance !== null ? `${distance.toFixed(1)}°` : ""}
              </span>
            );
          })}
        </div>
      )}
      {proximity && (
        <p className="text-[9px] text-muted-foreground">
          Closest: {typeof proximity === "string" ? proximity : JSON.stringify(proximity)}
        </p>
      )}
      {influence && (
        <p className="text-[9px] text-muted-foreground italic">{influence}</p>
      )}
    </div>
  );
}

export function AstrocartographySection({ gameId, players, venueLat, venueLng, homeAbbr, awayAbbr }: Props) {
  if (!venueLat || !venueLng || players.length === 0) return null;

  // Only show top 6 players (3 per team) to limit API calls
  const homePlayers = players.filter((p) => p.team === homeAbbr).slice(0, 3);
  const awayPlayers = players.filter((p) => p.team === awayAbbr).slice(0, 3);
  const selectedPlayers = [...awayPlayers, ...homePlayers];

  if (selectedPlayers.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5" />
        Astrocartography at Venue
      </h3>
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-2">
        <MapPin className="h-3 w-3" />
        <span>{venueLat.toFixed(2)}°, {venueLng.toFixed(2)}°</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {selectedPlayers.map((p) => (
          <PlayerAstrocarto
            key={p.id}
            playerId={p.id}
            playerName={p.name}
            team={p.team || ""}
            venueLat={venueLat}
            venueLng={venueLng}
          />
        ))}
      </div>
    </section>
  );
}
