import { Outlet, useNavigate } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { User, LogIn } from "lucide-react";

export function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background star-field">
      {/* Top header with profile avatar */}
      <div className="fixed top-0 right-0 z-50 p-3 safe-area-top">
        <button
          onClick={() => navigate(user ? "/profile" : "/auth")}
          className="h-9 w-9 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/30 transition-colors shadow-sm"
          aria-label={user ? "Profile" : "Sign in"}
        >
          {user ? (
            <span className="text-xs font-bold text-primary">
              {(user.user_metadata?.display_name || user.email || "U")[0].toUpperCase()}
            </span>
          ) : (
            <LogIn className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <main className="pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
