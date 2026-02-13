import { Settings, Sliders, Star, MapPin, Shield, LogIn, LogOut, User, Globe } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTimezone } from "@/hooks/use-timezone";
import { useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { userTimezone, updateTimezone } = useTimezone();

  const timezones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf("timeZone") as string[];
    } catch {
      return ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "UTC"];
    }
  }, []);

  const sections = [
    { icon: Sliders, title: "Scoring Weights", desc: "Adjust stat vs market vs astro blend" },
    { icon: Star, title: "Horary Ruleset", desc: "Toggle traditional rules to apply" },
    { icon: Star, title: "Astrology Settings", desc: "House system, orb sizes" },
    { icon: MapPin, title: "Location & Cartography", desc: "Travel factors, astrocartography" },
    { icon: Shield, title: "Responsible Gambling", desc: "Resources and disclaimers" },
  ];

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold font-display tracking-tight">Settings</h1>
        </div>
        <p className="text-xs text-muted-foreground">Configure your Cosmic Edge experience</p>
      </header>
      <div className="px-4 py-4 space-y-2">
        {/* Auth section */}
        {user ? (
          <div className="cosmic-card rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{user.email}</p>
                <p className="text-[10px] text-muted-foreground">Signed in</p>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); }}
              className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="w-full cosmic-card rounded-xl p-4 flex items-center gap-4 text-left transition-all hover:border-primary/20"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <LogIn className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Log In / Sign Up</p>
              <p className="text-xs text-muted-foreground">Required for SkySpread & Live Board</p>
            </div>
          </button>
        )}

        {/* Timezone selector */}
        <div className="cosmic-card rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Timezone</p>
              <p className="text-xs text-muted-foreground">Game times & planetary hours adjust to your zone</p>
            </div>
          </div>
          <Select
            value={userTimezone}
            onValueChange={(tz) => updateTimezone.mutate(tz)}
          >
            <SelectTrigger className="w-full h-9 text-xs">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz} className="text-xs">
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sections.map(({ icon: Icon, title, desc }) => (
          <button
            key={title}
            className="w-full cosmic-card rounded-xl p-4 flex items-center gap-4 text-left transition-all hover:border-primary/20"
          >
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
