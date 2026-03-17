import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, Lock, Star, Eye, EyeOff, ChevronRight, LogOut, Users, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ProfileInputField } from "@/components/profile/ProfileInputField";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { PublicProfilePreview } from "@/components/profile/PublicProfilePreview";

const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

interface ProfileData {
  username: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
  bio: string;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  share_astro: boolean;
  share_picks: boolean;
  avatar_url: string;
}

const SignSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <option value="">Select...</option>
      {SIGNS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
);

const ProfilePage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData>({
    username: "", first_name: "", last_name: "", display_name: "",
    phone: "", bio: "", sun_sign: "", moon_sign: "", rising_sign: "",
    share_astro: false, share_picks: false, avatar_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            username: data.username || "",
            first_name: (data as any).first_name || "",
            last_name: (data as any).last_name || "",
            display_name: data.display_name || "",
            phone: (data as any).phone || "",
            bio: (data as any).bio || "",
            sun_sign: (data as any).sun_sign || "",
            moon_sign: (data as any).moon_sign || "",
            rising_sign: (data as any).rising_sign || "",
            share_astro: (data as any).share_astro || false,
            share_picks: (data as any).share_picks || false,
            avatar_url: data.avatar_url || "",
          });
        }
        setLoading(false);
      });
  }, [user, navigate]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: profile.username || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        display_name: profile.display_name || null,
        phone: profile.phone || null,
        bio: profile.bio || null,
        sun_sign: profile.sun_sign || null,
        moon_sign: profile.moon_sign || null,
        rising_sign: profile.rising_sign || null,
        share_astro: profile.share_astro,
        share_picks: profile.share_picks,
      } as any)
      .eq("user_id", user.id);

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Username taken", description: "That username is already in use.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Profile saved", description: "Your changes have been saved." });
    }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Mismatch", description: "Passwords don't match.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated" });
      setShowPasswordChange(false);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  if (previewMode) {
    return <PublicProfilePreview profile={profile} userId={user!.id} onClose={() => setPreviewMode(false)} />;
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft className="h-5 w-5 text-muted-foreground" /></button>
          <h1 className="text-xl font-bold font-display tracking-tight">Profile</h1>
          <button
            onClick={() => setPreviewMode(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            View as others
          </button>
        </div>
        <p className="text-xs text-muted-foreground ml-9">Manage your account & astro identity</p>
      </header>

      <div className="px-4 space-y-4">
        {/* Avatar Upload */}
        <div className="flex justify-center py-2">
          <AvatarUpload
            userId={user!.id}
            avatarUrl={profile.avatar_url}
            displayName={profile.display_name || profile.first_name || ""}
            onUploaded={(url) => setProfile(p => ({ ...p, avatar_url: url }))}
          />
        </div>
        {/* Account Info */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Account</p>
          <ProfileInputField icon={User} label="Username" value={profile.username} onChange={(v) => setProfile(p => ({ ...p, username: v.replace(/[^a-zA-Z0-9_]/g, "") }))} placeholder="CosmicEdge_User" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileInputField icon={User} label="First Name" value={profile.first_name} onChange={(v) => setProfile(p => ({ ...p, first_name: v }))} />
            <ProfileInputField icon={User} label="Last Name" value={profile.last_name} onChange={(v) => setProfile(p => ({ ...p, last_name: v }))} />
          </div>
          <ProfileInputField icon={User} label="Display Name" value={profile.display_name} onChange={(v) => setProfile(p => ({ ...p, display_name: v }))} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="email" value={user?.email || ""} disabled className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-muted-foreground cursor-not-allowed" />
            </div>
          </div>
          <ProfileInputField icon={Phone} label="Phone Number" value={profile.phone} onChange={(v) => setProfile(p => ({ ...p, phone: v }))} placeholder="+1 (555) 123-4567" type="tel" />
        </div>

        {/* Bio */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Bio</p>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
            maxLength={200}
            placeholder="Tell others about your betting style..."
            className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px] resize-none"
          />
          <p className="text-[10px] text-muted-foreground text-right">{profile.bio.length}/200</p>
        </div>

        {/* Astro Identity */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Astro Identity</p>
            <Star className="h-4 w-4 text-cosmic-gold" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SignSelect label="☉ Sun" value={profile.sun_sign} onChange={(v) => setProfile(p => ({ ...p, sun_sign: v }))} />
            <SignSelect label="☽ Moon" value={profile.moon_sign} onChange={(v) => setProfile(p => ({ ...p, moon_sign: v }))} />
            <SignSelect label="⬆ Rising" value={profile.rising_sign} onChange={(v) => setProfile(p => ({ ...p, rising_sign: v }))} />
          </div>
        </div>

        {/* Privacy */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Privacy</p>
          <button
            onClick={() => setProfile(p => ({ ...p, share_astro: !p.share_astro }))}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              {profile.share_astro ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              <span className="text-sm">Share Sun / Moon / Rising with friends</span>
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors ${profile.share_astro ? "bg-primary" : "bg-border"} relative`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${profile.share_astro ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </button>
          <button
            onClick={() => setProfile(p => ({ ...p, share_picks: !p.share_picks }))}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              {profile.share_picks ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              <span className="text-sm">Share bets & tracked props with friends</span>
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors ${profile.share_picks ? "bg-primary" : "bg-border"} relative`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${profile.share_picks ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        {/* Security */}
        <div className="cosmic-card rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Security</p>
          <button
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Change Password</span>
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showPasswordChange ? "rotate-90" : ""}`} />
          </button>
          {showPasswordChange && (
            <div className="space-y-3 pt-2">
              <ProfileInputField icon={Lock} label="New Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" />
              <ProfileInputField icon={Lock} label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
              <button onClick={handlePasswordChange} className="w-full bg-secondary text-foreground font-medium py-2.5 rounded-xl hover:bg-accent transition-colors text-sm">
                Update Password
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={() => navigate("/friends")}
            className="w-full cosmic-card rounded-xl p-4 flex items-center gap-3 text-left hover:border-primary/20 transition-all"
          >
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Friends</p>
              <p className="text-xs text-muted-foreground">Find & connect with other users</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>

          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="w-full cosmic-card rounded-xl p-4 flex items-center gap-3 text-left text-destructive hover:border-destructive/20 transition-all"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
