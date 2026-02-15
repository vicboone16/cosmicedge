import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PublicProfilePreview } from "@/components/profile/PublicProfilePreview";

const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendship, setFriendship] = useState<any>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .rpc("get_public_profiles", { user_ids: [userId] })
      .then(({ data }) => {
        setProfile(data && data.length > 0 ? data[0] : null);
        setLoading(false);
      });

    // Check if we're friends
    if (user) {
      supabase
        .from("friendships")
        .select("*")
        .eq("status", "accepted")
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .maybeSingle()
        .then(({ data }) => setFriendship(data));
    }
  }, [userId, user]);

  const startConversation = async () => {
    if (!user || !userId) return;
    
    // Check for existing 1-on-1 conversation
    const { data: myConvos } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id) as any;
    
    if (myConvos && myConvos.length > 0) {
      const convoIds = myConvos.map((c: any) => c.conversation_id);
      const { data: sharedConvos } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId)
        .in("conversation_id", convoIds) as any;
      
      if (sharedConvos && sharedConvos.length > 0) {
        // Check if any are 1-on-1
        for (const sc of sharedConvos) {
          const { data: convo } = await supabase
            .from("conversations")
            .select("id, is_group")
            .eq("id", sc.conversation_id)
            .eq("is_group", false)
            .maybeSingle() as any;
          if (convo) {
            navigate(`/messages/${convo.id}`);
            return;
          }
        }
      }
    }
    
    // Create new conversation
    const { data: newConvo } = await supabase
      .from("conversations")
      .insert({ created_by: user.id, is_group: false } as any)
      .select("id")
      .single() as any;
    
    if (newConvo) {
      await supabase.from("conversation_members").insert([
        { conversation_id: newConvo.id, user_id: user.id },
        { conversation_id: newConvo.id, user_id: userId },
      ] as any);
      navigate(`/messages/${newConvo.id}`);
    }
  };

  const removeFriend = async () => {
    if (!friendship) return;
    await supabase.from("friendships").delete().eq("id", friendship.id);
    toast({ title: "Friend removed" });
    setFriendship(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-muted-foreground">Profile not found</p>
      <button onClick={() => navigate(-1)} className="text-primary text-sm">Go back</button>
    </div>
  );

  const profileData = {
    display_name: profile.display_name || "",
    username: profile.username || "",
    bio: (profile as any).bio || "",
    avatar_url: profile.avatar_url || "",
    sun_sign: (profile as any).sun_sign || "",
    moon_sign: (profile as any).moon_sign || "",
    rising_sign: (profile as any).rising_sign || "",
    share_astro: (profile as any).share_astro || false,
    share_picks: (profile as any).share_picks || false,
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold font-display tracking-tight">
            {profileData.display_name || profileData.username || "Profile"}
          </h1>
          <button
              onClick={startConversation}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Message
            </button>
        </div>
      </header>

      {/* Reuse the public profile view but without the header/close button */}
      <div className="px-4 space-y-4">
        {/* Hero card */}
        <div className="cosmic-card rounded-xl p-6 flex flex-col items-center gap-3 celestial-gradient">
          <div className="h-24 w-24 rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-background overflow-hidden bg-primary/10 flex items-center justify-center">
            {profileData.avatar_url ? (
              <img src={profileData.avatar_url} className="h-full w-full object-cover" alt="" />
            ) : (
              <span className="text-primary text-2xl font-semibold">
                {(profileData.display_name || profileData.username || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold font-display">{profileData.display_name || "Anonymous"}</h2>
            {profileData.username && <p className="text-sm text-muted-foreground">@{profileData.username}</p>}
          </div>
          {profileData.bio && <p className="text-sm text-center text-muted-foreground max-w-xs">{profileData.bio}</p>}
        </div>

        {/* Astro Identity */}
        {profileData.share_astro && (profileData.sun_sign || profileData.moon_sign || profileData.rising_sign) && (
          <div className="cosmic-card rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Astro Identity</p>
            <div className="grid grid-cols-3 gap-3">
              {profileData.sun_sign && <div className="astro-badge rounded-xl p-3 text-center"><p className="text-lg">☉</p><p className="text-xs font-medium">{profileData.sun_sign}</p></div>}
              {profileData.moon_sign && <div className="astro-badge rounded-xl p-3 text-center"><p className="text-lg">☽</p><p className="text-xs font-medium">{profileData.moon_sign}</p></div>}
              {profileData.rising_sign && <div className="astro-badge rounded-xl p-3 text-center"><p className="text-lg">⬆</p><p className="text-xs font-medium">{profileData.rising_sign}</p></div>}
            </div>
          </div>
        )}

        {/* Betting stats - only if they share picks */}
        {profileData.share_picks && <BettingStats userId={userId!} />}

        {!profileData.share_picks && !profileData.share_astro && (
          <div className="cosmic-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">This user hasn't shared any additional info yet.</p>
          </div>
        )}

        {/* Remove Friend - bottom center with confirmation */}
        {friendship && (
          <div className="flex justify-center pt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors">
                  <UserMinus className="h-3.5 w-3.5" />
                  Remove Friend
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove friend?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove {profileData.display_name || profileData.username || "this person"} from your friends? You can always send a new friend request later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={removeFriend} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remove Friend
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
};

function BettingStats({ userId }: { userId: string }) {
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, roi: 0 });
  const [recentBets, setRecentBets] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("bets")
      .select("id, market_type, selection, odds, result, stake_amount, payout, home_team, away_team, game_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data: bets }) => {
        if (!bets) return;
        const wins = bets.filter(b => b.result === "win").length;
        const losses = bets.filter(b => b.result === "loss").length;
        const totalStaked = bets.reduce((s, b) => s + (b.stake_amount || 0), 0);
        const totalPayout = bets.filter(b => b.result === "win").reduce((s, b) => s + (b.payout || 0), 0);
        const roi = totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : 0;
        setStats({ total: bets.length, wins, losses, roi });
        setRecentBets(bets.slice(0, 5));
      });
  }, [userId]);

  return (
    <>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Betting Record</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-lg font-bold font-display">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
          <div><p className="text-lg font-bold font-display text-cosmic-green">{stats.wins}</p><p className="text-[10px] text-muted-foreground">Wins</p></div>
          <div><p className="text-lg font-bold font-display text-destructive">{stats.losses}</p><p className="text-[10px] text-muted-foreground">Losses</p></div>
          <div><p className={`text-lg font-bold font-display ${stats.roi >= 0 ? "text-cosmic-green" : "text-destructive"}`}>{stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground">ROI</p></div>
        </div>
      </div>
      {recentBets.length > 0 && (
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Recent Picks</p>
          <div className="space-y-2">
            {recentBets.map(bet => (
              <div key={bet.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium">{bet.selection}</p>
                  <p className="text-[10px] text-muted-foreground">{bet.home_team} vs {bet.away_team} · {bet.market_type}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{bet.odds > 0 ? `+${bet.odds}` : bet.odds}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default UserProfilePage;
