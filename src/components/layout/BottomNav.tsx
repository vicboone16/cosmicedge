import { CalendarDays, Star, Crosshair, TrendingUp, Compass, Sparkles, Command } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", icon: CalendarDays, label: "Slate", requiresAuth: false },
  { to: "/transits", icon: Compass, label: "Celestial", requiresAuth: true },
  { to: "/nexus", icon: Command, label: "Nexus", requiresAuth: true },
  { to: "/predictions", icon: TrendingUp, label: "Predictions", requiresAuth: true },
  { to: "/skyspread", icon: Crosshair, label: "SkySpread", requiresAuth: true },
  { to: "/astra", icon: Sparkles, label: "Astra AI", requiresAuth: true },
];

export function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/85 backdrop-blur-xl safe-area-bottom safe-area-x shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-around h-[4.25rem] max-w-lg mx-auto px-1 sm:px-2">
        {navItems.map(({ to, icon: Icon, label, requiresAuth }) => {
          if (requiresAuth && !user) {
            return (
              <button
                key={to}
                onClick={() => navigate("/auth")}
                className="flex flex-col items-center gap-0.5 px-1 sm:px-2 py-2 rounded-lg text-muted-foreground/50 min-w-0"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-medium truncate">{label}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-1 sm:px-2 py-2 rounded-lg transition-all duration-200 min-w-0",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon className="h-[1.35rem] w-[1.35rem]" />
                    {isActive && (
                      <div className="absolute -inset-1 rounded-full bg-primary/20 blur-sm -z-10" />
                    )}
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-medium truncate">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
