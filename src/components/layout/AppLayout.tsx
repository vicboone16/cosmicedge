import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BottomNav } from "./BottomNav";
import { CosmicBackground } from "./CosmicBackground";
import { PropDrawerProvider } from "@/hooks/use-prop-drawer";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-admin";
import { useMemo } from "react";
import { User, LogIn, Moon, Settings, Users, LogOut, Shield, Sparkles, FlaskConical, Telescope, Calculator, BarChart3, HelpCircle, MessageCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  const envRef = useMemo(() => {
    try {
      const url = import.meta.env.VITE_SUPABASE_URL || "";
      return new URL(url).hostname.split(".")[0];
    } catch { return "unknown"; }
  }, []);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";
  const isPublished =
    window.location.hostname.includes("lovable.app") ||
    window.location.hostname.includes("novabehavior.com") ||
    window.location.hostname.includes("cosmicedge");
  // LIVE = published domain with matching project id; TEST = everything else
  const isLive = isPublished && envRef === projectId;
  const refLabel = isLive ? "LIVE" : "TEST";

  // Query pending friend requests for badge
  const { data: pendingCount } = useQuery({
    queryKey: ["pending-friend-requests", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("addressee_id", user.id)
        .eq("status", "pending");
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Unread conversation count — single RPC call instead of N+1 loop
  const { data: unreadMsgCount } = useQuery({
    queryKey: ["unread-messages", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await (supabase as any).rpc("get_unread_conversation_count");
      return (data as number) || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
  return (
    <div className="min-h-screen bg-background star-field overflow-x-hidden">
      <CosmicBackground />
      {/* Top header with profile dropdown */}
      <div className="fixed top-0 right-0 z-50 p-3 safe-area-top safe-area-right flex items-center gap-2">
        {/* Messages icon */}
        {user && (
          <button
            onClick={() => navigate("/messages")}
            className="relative h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/30 transition-colors shadow-md"
            aria-label="Messages"
          >
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            {!!unreadMsgCount && unreadMsgCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {unreadMsgCount > 9 ? "9+" : unreadMsgCount}
              </span>
            )}
          </button>
        )}
        {/* Profile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/30 transition-colors shadow-md"
              aria-label="Menu"
            >
              {user ? (
                <span className="text-xs font-bold text-primary">
                  {(user.user_metadata?.display_name || user.email || "U")[0].toUpperCase()}
                </span>
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
              {!!pendingCount && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 z-[60] bg-popover border-border">
            {user ? (
              <>
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/friends")} className="gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Friends
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/messages")} className="gap-2 cursor-pointer">
                  <MessageCircle className="h-4 w-4" />
                  Messages
                  {!!unreadMsgCount && unreadMsgCount > 0 && (
                    <span className="ml-auto text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                      {unreadMsgCount}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/signal-lab")} className="gap-2 cursor-pointer">
                  <FlaskConical className="h-4 w-4" />
                  Signal Lab
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/transits")} className="gap-2 cursor-pointer">
                  <Telescope className="h-4 w-4" />
                  Celestial Insights
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/clv")} className="gap-2 cursor-pointer">
                  <Calculator className="h-4 w-4" />
                  CLV Calculator
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/analytics")} className="gap-2 cursor-pointer">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/faq")} className="gap-2 cursor-pointer">
                  <HelpCircle className="h-4 w-4" />
                  Help & FAQ
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/subscription")} className="gap-2 cursor-pointer">
                  <Sparkles className="h-4 w-4" />
                  Subscription
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2 cursor-pointer">
                      <Shield className="h-4 w-4" />
                      Admin
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/machina")} className="gap-2 cursor-pointer">
                      <FlaskConical className="h-4 w-4" />
                      Machina Lab
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/admin/tt-edge")} className="gap-2 cursor-pointer">
                      <Sparkles className="h-4 w-4" />
                      TT Edge Lab
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => { await signOut(); navigate("/"); }}
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => navigate("/auth")} className="gap-2 cursor-pointer">
                  <LogIn className="h-4 w-4" />
                  Sign In / Sign Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Environment badge — admin only */}
      {isAdmin && (
        <div className="fixed top-0 left-0 z-50 p-3 safe-area-top safe-area-left">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold border ${
            isLive
              ? "bg-emerald-950/80 text-emerald-400 border-emerald-700"
              : "bg-red-950/80 text-red-400 border-red-700"
          }`}>
            {refLabel}
            <span className="opacity-60">{envRef.slice(0, 6)}</span>
          </span>
        </div>
      )}
      <PropDrawerProvider>
        <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ willChange: "opacity, transform" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </PropDrawerProvider>
      <BottomNav />
    </div>
  );
}
