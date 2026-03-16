import { CalendarDays, Star, Crosshair, TrendingUp, Compass, Sparkles, Command } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", icon: CalendarDays, label: "Slate", requiresAuth: false },
  { to: "/command-center", icon: Command, label: "Command", requiresAuth: true },
  { to: "/nexus", icon: Compass, label: "Nexus", requiresAuth: true },
  { to: "/props", icon: TrendingUp, label: "Props", requiresAuth: true },
  { to: "/skyspread", icon: Crosshair, label: "SkySpread", requiresAuth: true },
  { to: "/astra", icon: Sparkles, label: "Astra AI", requiresAuth: true },
];

export function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/85 backdrop-blur-xl safe-area-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-around h-[4.25rem] max-w-lg mx-auto px-2">
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
                    <Icon className="h-[1.35rem] w-[1.35rem]" />
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
