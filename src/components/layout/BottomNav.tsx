import { CalendarDays, Star, Crosshair, TrendingUp, History, Sparkles } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", icon: CalendarDays, label: "Slate", requiresAuth: false },
  { to: "/transits", icon: Star, label: "Celestial", requiresAuth: true },
  { to: "/props", icon: TrendingUp, label: "Props", requiresAuth: true },
  { to: "/skyspread", icon: Crosshair, label: "SkySpread", requiresAuth: true },
  { to: "/historical", icon: History, label: "History", requiresAuth: true },
  { to: "/astra", icon: Sparkles, label: "Astra", requiresAuth: true },
];

export function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/80 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map(({ to, icon: Icon, label, requiresAuth }) => {
          if (requiresAuth && !user) {
            return (
              <button
                key={to}
                onClick={() => navigate("/auth")}
                className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-muted-foreground/50"
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all duration-200",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {isActive && (
                      <div className="absolute -inset-1 rounded-full bg-primary/20 blur-sm -z-10" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
