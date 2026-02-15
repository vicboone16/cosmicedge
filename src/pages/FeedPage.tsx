import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Trash2, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface FeedPost {
  id: string;
  user_id: string;
  content: string | null;
  bet_id: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string; username: string };
  bet?: { selection: string; odds: number; market_type: string; home_team: string; away_team: string } | null;
  comments: FeedComment[];
}

interface FeedComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { display_name: string; avatar_url: string };
}

const FeedPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadFeed();
  }, [user]);

  const loadFeed = async () => {
    if (!user) return;

    const { data: feedPosts } = await supabase
      .from("feed_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50) as any;

    if (!feedPosts || feedPosts.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(feedPosts.map((p: any) => p.user_id))] as string[];
    const { data: profiles } = await supabase
      .rpc("get_public_profiles", { user_ids: userIds }) as any;

    const profileMap = new Map((profiles as any[] || []).map((p: any) => [p.user_id, p]));

    // Get bet data for posts with bet_id
    const betIds = feedPosts.filter((p: any) => p.bet_id).map((p: any) => p.bet_id);
    let betMap = new Map();
    if (betIds.length > 0) {
      const { data: bets } = await supabase
        .from("bets")
        .select("id, selection, odds, market_type, home_team, away_team")
        .in("id", betIds);
      betMap = new Map((bets || []).map(b => [b.id, b]));
    }

    // Get comments for all posts
    const postIds = feedPosts.map((p: any) => p.id);
    const { data: allComments } = await supabase
      .from("feed_comments")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: true }) as any;

    // Get comment author profiles
    const commentUserIds = [...new Set((allComments || []).map((c: any) => c.user_id))] as string[];
    let commentProfileMap = new Map();
    if (commentUserIds.length > 0) {
      const { data: commentProfiles } = await supabase
        .rpc("get_public_profiles", { user_ids: commentUserIds }) as any;
      commentProfileMap = new Map((commentProfiles as any[] || []).map((p: any) => [p.user_id, p]));
    }

    const commentsByPost = new Map<string, FeedComment[]>();
    (allComments || []).forEach((c: any) => {
      if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
      commentsByPost.get(c.post_id)!.push({ ...c, profile: commentProfileMap.get(c.user_id) });
    });

    const enriched = feedPosts.map((p: any) => ({
      ...p,
      profile: profileMap.get(p.user_id),
      bet: p.bet_id ? betMap.get(p.bet_id) : null,
      comments: commentsByPost.get(p.id) || [],
    }));

    setPosts(enriched);
    setLoading(false);
  };

  const createPost = async () => {
    if (!newPost.trim() || !user || posting) return;
    if (newPost.length > 140) {
      toast({ title: "Too long", description: "Posts are limited to 140 characters.", variant: "destructive" });
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("feed_posts").insert({
      user_id: user.id,
      content: newPost.trim(),
    } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setNewPost(""); loadFeed(); }
    setPosting(false);
  };

  const deletePost = async (postId: string) => {
    await supabase.from("feed_posts").delete().eq("id", postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const addComment = async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!content || !user) return;
    await supabase.from("feed_comments").insert({
      post_id: postId,
      user_id: user.id,
      content,
    } as any);
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));
    loadFeed();
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.max(1, Math.floor((now.getTime() - d.getTime()) / 60000))}m`;
    if (diffH < 24) return `${Math.floor(diffH)}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold font-display tracking-tight">Feed</h1>
        </div>
      </header>

      <div className="px-4 space-y-4">
        {/* Compose */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value.slice(0, 140))}
            placeholder="What's on your mind? 🎯"
            className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-none"
          />
          <div className="flex items-center justify-between">
            <span className={`text-[10px] ${newPost.length > 130 ? "text-destructive" : "text-muted-foreground"}`}>
              {newPost.length}/140
            </span>
            <button
              onClick={createPost}
              disabled={!newPost.trim() || posting}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {posting ? "..." : "Post"}
            </button>
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">No posts yet</p>
            <p className="text-xs text-muted-foreground">Be the first to share something with your friends!</p>
          </div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="cosmic-card rounded-xl p-4 space-y-3">
              {/* Author header */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(post.user_id === user?.id ? "/profile" : `/user/${post.user_id}`)}
                  className="flex items-center gap-2 min-w-0"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {post.profile?.avatar_url ? (
                      <img src={post.profile.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                    ) : (
                      <span className="text-primary font-bold text-xs">
                        {(post.profile?.display_name || "?")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{post.profile?.display_name || "User"}</p>
                    {post.profile?.username && <p className="text-[10px] text-muted-foreground">@{post.profile.username}</p>}
                  </div>
                </button>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatTime(post.created_at)}</span>
                {post.user_id === user?.id && (
                  <button onClick={() => deletePost(post.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Content */}
              {post.content && <p className="text-sm">{post.content}</p>}

              {/* Shared bet */}
              {post.bet && (
                <div className="bg-secondary rounded-lg p-3 border border-border">
                  <p className="text-xs font-medium">{post.bet.selection}</p>
                  <p className="text-[10px] text-muted-foreground">{post.bet.home_team} vs {post.bet.away_team} · {post.bet.market_type}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    {post.bet.odds > 0 ? `+${post.bet.odds}` : post.bet.odds}
                  </p>
                </div>
              )}

              {/* Comments */}
              <div className="border-t border-border pt-2 space-y-2">
                <button
                  onClick={() => setExpandedComments(prev => {
                    const next = new Set(prev);
                    next.has(post.id) ? next.delete(post.id) : next.add(post.id);
                    return next;
                  })}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {post.comments.length > 0 ? `${post.comments.length} comment${post.comments.length > 1 ? "s" : ""}` : "Comment"}
                </button>

                {expandedComments.has(post.id) && (
                  <>
                    {post.comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2 pl-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          {c.profile?.avatar_url ? (
                            <img src={c.profile.avatar_url} className="h-6 w-6 rounded-full object-cover" alt="" />
                          ) : (
                            <span className="text-primary font-bold text-[9px]">
                              {(c.profile?.display_name || "?")[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px]">
                            <span className="font-medium">{c.profile?.display_name || "User"}</span>
                            <span className="text-muted-foreground ml-1">{formatTime(c.created_at)}</span>
                          </p>
                          <p className="text-xs">{c.content}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pl-2">
                      <input
                        type="text"
                        value={commentInputs[post.id] || ""}
                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addComment(post.id)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => addComment(post.id)}
                        disabled={!commentInputs[post.id]?.trim()}
                        className="text-primary disabled:opacity-50 p-1"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FeedPage;
