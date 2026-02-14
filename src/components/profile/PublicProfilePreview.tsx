import { useState, useEffect } from "react";
import { ArrowLeft, Eye, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface ProfileData {
  display_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  share_astro: boolean;
  share_picks: boolean;
}

interface PublicProfilePreviewProps {
  profile: ProfileData;
  userId: string;
  onClose: () => void;
}

interface BetSummary {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  roi: number;
}

export function PublicProfilePreview({ profile, userId, onClose }: PublicProfilePreviewProps) {
  const [betSummary, setBetSummary] = useState<BetSummary>({ total: 0, wins: 0, losses: 0, pending: 0, roi: 0 });
  const [recentBets, setRecentBets] = useState<any[]>([]);

  useEffect(() => {
    const fetchBets = async () => {
      const { data: bets } = await supabase
        .from("bets")
        .select("id, market_type, selection, odds, result, stake_amount, payout, home_team, away_team, game_date, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (bets) {
        const wins = bets.filter(b => b.result === "win").length;
        const losses = bets.filter(b => b.result === "loss").length;
        const pending = bets.filter(b => !b.result || b.result === "pending").length;
        const totalStaked = bets.reduce((s, b) => s + (b.stake_amount || 0), 0);
        const totalPayout = bets.filter(b => b.result === "win").reduce((s, b) => s + (b.payout || 0), 0);
        const roi = totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : 0;

        setBetSummary({ total: bets.length, wins, losses, pending, roi });
        setRecentBets(bets.slice(0, 5));
      }
    };
    fetchBets();
  }, [userId]);

  const initials = profile.display_name
    ? profile.display_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onClose} className="p-1"><ArrowLeft className="h-5 w-5 text-muted-foreground" /></button>
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-primary" />
            <h1 className="text-xl font-bold font-display tracking-tight">Public Preview</h1>
          </div>
        </div>
        <p className="text-xs text-muted-foreground ml-9">How others see your profile</p>
      </header>

      <div className="px-4 space-y-4">
        {/* Hero card */}
        <div className="cosmic-card rounded-xl p-6 flex flex-col items-center gap-3 celestial-gradient">
          <Avatar className="h-24 w-24 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
            <AvatarImage src={profile.avatar_url} alt={profile.display_name} />
            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-lg font-bold font-display">{profile.display_name || "Anonymous"}</h2>
            {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
          </div>
          {profile.bio && <p className="text-sm text-center text-muted-foreground max-w-xs">{profile.bio}</p>}
        </div>

        {/* Astro Identity */}
        {profile.share_astro && (profile.sun_sign || profile.moon_sign || profile.rising_sign) && (
          <div className="cosmic-card rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Astro Identity</p>
            <div className="grid grid-cols-3 gap-3">
              {profile.sun_sign && (
                <div className="astro-badge rounded-xl p-3 text-center">
                  <p className="text-lg">☉</p>
                  <p className="text-xs font-medium">{profile.sun_sign}</p>
                </div>
              )}
              {profile.moon_sign && (
                <div className="astro-badge rounded-xl p-3 text-center">
                  <p className="text-lg">☽</p>
                  <p className="text-xs font-medium">{profile.moon_sign}</p>
                </div>
              )}
              {profile.rising_sign && (
                <div className="astro-badge rounded-xl p-3 text-center">
                  <p className="text-lg">⬆</p>
                  <p className="text-xs font-medium">{profile.rising_sign}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Betting stats */}
        {profile.share_picks && (
          <>
            <div className="cosmic-card rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Betting Record</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold font-display">{betSummary.total}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-display text-cosmic-green">{betSummary.wins}</p>
                  <p className="text-[10px] text-muted-foreground">Wins</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-display text-destructive">{betSummary.losses}</p>
                  <p className="text-[10px] text-muted-foreground">Losses</p>
                </div>
                <div>
                  <p className={`text-lg font-bold font-display ${betSummary.roi >= 0 ? "text-cosmic-green" : "text-destructive"}`}>
                    {betSummary.roi >= 0 ? "+" : ""}{betSummary.roi.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">ROI</p>
                </div>
              </div>
            </div>

            {recentBets.length > 0 && (
              <div className="cosmic-card rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Recent Picks</p>
                <div className="space-y-2">
                  {recentBets.map(bet => (
                    <div key={bet.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        {bet.result === "win" ? (
                          <TrendingUp className="h-3.5 w-3.5 text-cosmic-green" />
                        ) : bet.result === "loss" ? (
                          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{bet.selection}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {bet.home_team} vs {bet.away_team} · {bet.market_type}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {bet.odds > 0 ? `+${bet.odds}` : bet.odds}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!profile.share_picks && !profile.share_astro && (
          <div className="cosmic-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">This user hasn't shared any additional info yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
