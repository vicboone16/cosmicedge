import { CalendarDays, Crosshair, TrendingUp, Compass, Sparkles, Command } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="border-t border-white/[0.07] bg-background/82 backdrop-blur-3xl shadow-[0_-1px_0_0_rgba(255,255,255,0.04),0_-12px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-stretch justify-around h-[4.5rem] max-w-lg mx-auto px-1 sm:px-2 safe-area-x">
          {navItems.map(({ to, icon: Icon, label, requiresAuth }) => {
            if (requiresAuth && !user) {
              return (
                <button
                  key={to}
                  onClick={() => navigate("/auth")}
                  className="relative flex flex-col items-center justify-center gap-0.5 px-1 sm:px-2 min-w-0 flex-1 text-muted-foreground/30"
                >
                  <Icon className="h-[1.25rem] w-[1.25rem] shrink-0" />
                  <span className="text-[9px] sm:text-[10px] font-medium tracking-wide truncate">
                    {label}
                  </span>
                </button>
              );
            }

            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center justify-center gap-[3px] px-1 sm:px-2 min-w-0 flex-1 transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground/50 hover:text-muted-foreground/80"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Spring-animated top bar indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="bottom-nav-indicator"
                        className="absolute top-0 inset-x-0 h-[2px] rounded-b-full bg-gradient-to-r from-primary/60 via-primary to-primary/60"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      />
                    )}

                    {/* Icon with subtle active glow capsule */}
                    <div className="relative flex items-center justify-center">
                      {isActive && (
                        <div className="absolute inset-[-5px] rounded-[10px] bg-primary/12 dark:bg-primary/10" />
                      )}
                      <Icon
                        className={cn(
                          "relative h-[1.25rem] w-[1.25rem] shrink-0 transition-transform duration-200",
                          isActive && "scale-[1.08]"
                        )}
                        strokeWidth={isActive ? 2.1 : 1.8}
                      />
                    </div>

                    <span
                      className={cn(
                        "text-[9px] sm:text-[10px] font-medium tracking-wide truncate transition-all duration-200",
                        isActive ? "opacity-100 font-semibold" : "opacity-45"
                      )}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
