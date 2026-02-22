import { Outlet, useNavigate } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-admin";
import { User, LogIn, Moon, Settings, Users, LogOut, Shield, Sparkles } from "lucide-react";
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
  return (
    <div className="min-h-screen bg-background star-field">
      {/* Top header with profile dropdown */}
      <div className="fixed top-0 right-0 z-50 p-3 safe-area-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-9 w-9 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/30 transition-colors shadow-sm"
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
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/subscription")} className="gap-2 cursor-pointer">
                  <Sparkles className="h-4 w-4" />
                  Subscription
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2 cursor-pointer">
                    <Shield className="h-4 w-4" />
                    Admin
                  </DropdownMenuItem>
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
      <main className="pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
