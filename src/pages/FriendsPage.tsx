import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus, Check, X, ArrowLeft, Users, Clock, Sparkles, Phone, MessageCircle, Rss } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

interface FriendProfile {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  share_astro: boolean;
  bio: string | null;
  phone: string | null;
}

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  profile: FriendProfile;
}

const FriendsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"friends" | "requests" | "search" | "suggested">("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [sentRequests, setSentRequests] = useState<Friendship[]>([]);
  const [suggested, setSuggested] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [existingFriendIds, setExistingFriendIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadFriends();
    loadSuggested();
  }, [user]);

  const loadFriends = async () => {
    if (!user) return;
    const { data: fships } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`) as any;

    if (!fships || fships.length === 0) {
      setFriends([]);
      setPendingRequests([]);
      setExistingFriendIds(new Set());
      return;
    }

    const friendIds = fships.map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    setExistingFriendIds(new Set(friendIds));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, sun_sign, moon_sign, rising_sign, share_astro, bio" as any)
      .in("user_id", friendIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const enriched = fships.map((f: any) => {
      const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      return { ...f, profile: profileMap.get(friendId) || { user_id: friendId, username: null, display_name: "Unknown", avatar_url: null, sun_sign: null, moon_sign: null, rising_sign: null, share_astro: false, bio: null, phone: null } };
    });

    setFriends(enriched.filter((f: any) => f.status === "accepted"));
    setPendingRequests(enriched.filter((f: any) => f.status === "pending" && f.addressee_id === user.id));
    setSentRequests(enriched.filter((f: any) => f.status === "pending" && f.requester_id === user.id));
  };

  const loadSuggested = async () => {
    if (!user) return;
    // Fetch profiles that share their picks or astro data (public-ish profiles)
    // Exclude self and existing friends
    const { data: fships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`) as any;

    const connectedIds = new Set<string>([user.id]);
    (fships || []).forEach((f: any) => {
      connectedIds.add(f.requester_id);
      connectedIds.add(f.addressee_id);
    });

    // Get users who share picks or astro (public profiles)
    const { data: publicProfiles } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, sun_sign, moon_sign, rising_sign, share_astro, share_picks, bio" as any)
      .or("share_picks.eq.true,share_astro.eq.true")
      .limit(50);

    const filtered = ((publicProfiles as any[]) || [])
      .filter((p: any) => !connectedIds.has(p.user_id))
      .slice(0, 20) as unknown as FriendProfile[];

    setSuggested(filtered);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    setLoading(true);
    const q = searchQuery.trim().toLowerCase();
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, sun_sign, moon_sign, rising_sign, share_astro, bio" as any)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("user_id", user.id)
      .limit(20);
    setSearchResults((data as any[]) || []);
    setLoading(false);
  };

  const sendRequest = async (targetUserId: string) => {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: targetUserId,
      status: "pending",
    } as any);
    if (error) {
      if (error.code === "23505") toast({ title: "Already sent", description: "Friend request already exists." });
      else toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Request sent!" });
      setSearchResults(prev => prev.filter(p => p.user_id !== targetUserId));
      setSuggested(prev => prev.filter(p => p.user_id !== targetUserId));
      setExistingFriendIds(prev => new Set([...prev, targetUserId]));
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from("friendships").update({ status: "accepted" } as any).eq("id", friendshipId);
    toast({ title: "Friend added!" });
    loadFriends();
  };

  const declineRequest = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    toast({ title: "Request declined" });
    loadFriends();
  };

  const removeFriend = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    toast({ title: "Friend removed" });
    loadFriends();
  };

  const UserCard = ({ profile: p, actions, clickable = false }: { profile: FriendProfile; actions: React.ReactNode; clickable?: boolean }) => (
    <div className="cosmic-card rounded-xl p-4 flex items-center gap-3">
      <div
        className={`flex items-center gap-3 flex-1 min-w-0 ${clickable ? "cursor-pointer" : ""}`}
        onClick={clickable ? () => navigate(`/user/${p.user_id}`) : undefined}
      >
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
          {p.avatar_url ? <img src={p.avatar_url} className="h-10 w-10 rounded-full object-cover" /> : (p.display_name || p.username || "?")[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{p.display_name || p.username || "User"}</p>
          {p.username && <p className="text-[10px] text-muted-foreground">@{p.username}</p>}
          {p.share_astro && (p.sun_sign || p.moon_sign || p.rising_sign) && (
            <div className="flex items-center gap-1.5 mt-1">
              {p.sun_sign && <span className="text-[10px] text-cosmic-gold">☉ {SIGN_SYMBOLS[p.sun_sign]}</span>}
              {p.moon_sign && <span className="text-[10px] text-muted-foreground">☽ {SIGN_SYMBOLS[p.moon_sign]}</span>}
              {p.rising_sign && <span className="text-[10px] text-muted-foreground">⬆ {SIGN_SYMBOLS[p.rising_sign]}</span>}
            </div>
          )}
        </div>
      </div>
      {actions}
    </div>
  );

  const tabs = [
    { key: "friends" as const, label: "Friends", icon: Users, count: friends.length },
    { key: "requests" as const, label: "Requests", icon: Clock, count: pendingRequests.length + sentRequests.length },
    { key: "suggested" as const, label: "Suggested", icon: Sparkles, count: suggested.length },
    { key: "search" as const, label: "Find", icon: Search },
  ];

  return (
    <div className="min-h-screen pb-24">
       <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft className="h-5 w-5 text-muted-foreground" /></button>
          <h1 className="text-xl font-bold font-display tracking-tight">Friends</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => navigate("/feed")} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors">
              <Rss className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => navigate("/messages")} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex rounded-xl bg-secondary p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`text-[9px] px-1 py-0.5 rounded-full ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-border text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-2">
        {/* Search Tab */}
        {tab === "search" && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by username or name..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button onClick={handleSearch} disabled={loading} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {loading ? "..." : "Search"}
              </button>
            </div>
            {searchResults.length === 0 && searchQuery && !loading && (
              <p className="text-sm text-muted-foreground text-center py-8">No users found</p>
            )}
            {searchResults.map(p => (
              <UserCard key={p.user_id} profile={p} actions={
                existingFriendIds.has(p.user_id) ? (
                  <span className="text-[10px] text-muted-foreground">Added</span>
                ) : (
                  <button onClick={() => sendRequest(p.user_id)} className="shrink-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1">
                    <UserPlus className="h-3 w-3" /> Add
                  </button>
                )
              } />
            ))}
          </>
        )}

        {/* Suggested Tab */}
        {tab === "suggested" && (
          suggested.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">No suggestions yet</p>
              <p className="text-xs text-muted-foreground">As more users join and share their profiles, suggestions will appear here.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">People with public profiles you might want to connect with</p>
              {suggested.map(p => (
                <UserCard key={p.user_id} profile={p} actions={
                  existingFriendIds.has(p.user_id) ? (
                    <span className="text-[10px] text-muted-foreground">Sent</span>
                  ) : (
                    <button onClick={() => sendRequest(p.user_id)} className="shrink-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1">
                      <UserPlus className="h-3 w-3" /> Add
                    </button>
                  )
                } />
              ))}
            </>
          )
        )}

        {/* Requests Tab */}
        {tab === "requests" && (
          pendingRequests.length === 0 && sentRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending requests</p>
          ) : (
            <>
              {pendingRequests.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Received</p>
                  {pendingRequests.map(f => (
                    <UserCard key={f.id} profile={f.profile} actions={
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => acceptRequest(f.id)} className="bg-primary text-primary-foreground p-2 rounded-lg hover:opacity-90"><Check className="h-4 w-4" /></button>
                        <button onClick={() => declineRequest(f.id)} className="bg-secondary text-muted-foreground p-2 rounded-lg hover:bg-accent"><X className="h-4 w-4" /></button>
                      </div>
                    } />
                  ))}
                </>
              )}
              {sentRequests.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium mb-2 mt-4">Sent</p>
                  {sentRequests.map(f => (
                    <UserCard key={f.id} profile={f.profile} actions={
                      <span className="text-[10px] text-muted-foreground italic">Pending</span>
                    } />
                  ))}
                </>
              )}
            </>
          )
        )}

        {/* Friends Tab */}
        {tab === "friends" && (
          friends.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Users className="h-12 w-12 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">No friends yet</p>
              <button onClick={() => setTab("suggested")} className="text-sm text-primary hover:underline">See suggested connections</button>
            </div>
          ) : friends.map(f => (
            <UserCard key={f.id} profile={f.profile} clickable actions={
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/user/${f.profile.user_id}`); }} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors">
                  <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            } />
          ))
        )}
      </div>
    </div>
  );
};

export default FriendsPage;
