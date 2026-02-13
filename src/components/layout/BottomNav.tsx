import { CalendarDays, Star, Crosshair, Zap, TrendingUp, History } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: CalendarDays, label: "Slate" },
  { to: "/transits", icon: Star, label: "Transits" },
  { to: "/props", icon: TrendingUp, label: "Props" },
  { to: "/historical", icon: History, label: "History" },
  { to: "/live-board", icon: Zap, label: "Live" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/80 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200",
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
        ))}
      </div>
    </nav>
  );
}
