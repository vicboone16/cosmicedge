import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const copyText = (text: string, setCopied: (v: boolean) => void) => {
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-3 bg-card">{children}</div>}
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border/60 p-3">
        <p className="flex-1 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 mt-0.5"
          onClick={() => copyText(value, setCopied)}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
      </div>
    </div>
  );
}

function DataRow({ category, types, linkedToIdentity, tracking }: {
  category: string; types: string[]; linkedToIdentity: boolean; tracking: boolean
}) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{category}</p>
        <div className="flex gap-1.5">
          <Badge variant={linkedToIdentity ? "default" : "secondary"} className="text-[9px] px-1.5">
            {linkedToIdentity ? "✓ Linked to Identity" : "Not Linked"}
          </Badge>
          <Badge variant={tracking ? "destructive" : "outline"} className="text-[9px] px-1.5">
            {tracking ? "Tracking" : "No Tracking"}
          </Badge>
        </div>
      </div>
      <ul className="text-xs text-muted-foreground space-y-0.5">
        {types.map(t => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-primary/50" />{t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AppStorePrivacyScript() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold font-display text-foreground">App Store Privacy Script</h1>
              <Badge variant="outline" className="text-xs">iOS Submission</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Use this as your reference when completing the Privacy section in App Store Connect. Copy each field directly into the submission form.
            </p>
          </div>

          {/* Step 1 — App Information */}
          <Section title="Step 1 — App Information" defaultOpen>
            <CopyBlock label="App Name" value="Cosmic Edge" />
            <CopyBlock label="Subtitle (optional, 30 chars max)" value="AI Sports Astrology & Picks" />
            <CopyBlock
              label="Description (up to 4000 chars)"
              value={`Cosmic Edge is an AI-powered sports analytics app that blends astrological insights with real-time odds, player props, and statistical trends — helping you make smarter, more informed picks.

Key Features:
• Live game odds & player props across NBA, NHL, NFL, and MLB
• AI-powered analysis via Astra — our proprietary sports astrology engine
• Transit & natal chart overlays for teams and players
• SkySpread bankroll tracker and bet journal
• Trends, CLV calculator, and historical data explorer
• Social feed to share picks with friends
• Cosmic Calendar with planetary hour forecasts

Cosmic Edge is designed for adult sports enthusiasts who enjoy blending data-driven analysis with astrological timing. All content is for entertainment and informational purposes only. Please gamble responsibly.`}
            />
            <CopyBlock
              label="Keywords (100 chars max, comma-separated)"
              value="sports betting,astrology,NBA odds,player props,AI picks,sports analytics,horoscope,CLV,trends"
            />
            <CopyBlock label="Support URL" value="https://cosmicedge.lovable.app/privacy" />
            <CopyBlock label="Privacy Policy URL" value="https://cosmicedge.lovable.app/privacy" />
            <CopyBlock label="Marketing URL (optional)" value="https://cosmicedge.lovable.app" />
          </Section>

          {/* Step 2 — Age Rating */}
          <Section title="Step 2 — Age Rating">
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
              <p className="text-sm font-semibold text-warning mb-1">Recommended Rating: 17+</p>
              <p className="text-xs text-muted-foreground">This app references gambling/betting concepts and is intended for adults only.</p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Answer the questionnaire as follows:</p>
              <div className="space-y-1.5">
                {[
                  ["Cartoon or Fantasy Violence", "None"],
                  ["Realistic Violence", "None"],
                  ["Sexual Content", "None"],
                  ["Nudity", "None"],
                  ["Profanity or Crude Humor", "None"],
                  ["Mature/Suggestive Themes", "None"],
                  ["Horror/Fear Themes", "None"],
                  ["Gambling and Contests", "Simulated Gambling (select this)"],
                  ["Alcohol, Tobacco, or Drug Use", "None"],
                  ["Medical/Treatment Info", "None"],
                ].map(([label, answer]) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-border/30 last:border-0">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Badge
                      variant={answer === "None" ? "outline" : "default"}
                      className="text-[10px]"
                    >{answer}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Step 3 — App Privacy (Nutrition Label) */}
          <Section title="Step 3 — App Privacy (Nutrition Label)" defaultOpen>
            <p className="text-xs text-muted-foreground">
              In App Store Connect → App Privacy → Data Types, declare the following. Select <strong className="text-foreground">No</strong> when asked "Does your app collect data?" for any type not listed.
            </p>

            <div className="space-y-2">
              <DataRow
                category="Contact Info — Email Address"
                types={["Collected: Yes", "Used for: App Functionality, Account Management"]}
                linkedToIdentity={true}
                tracking={false}
              />
              <DataRow
                category="Identifiers — User ID"
                types={["Collected: Yes", "Used for: App Functionality, Analytics"]}
                linkedToIdentity={true}
                tracking={false}
              />
              <DataRow
                category="Usage Data — Product Interaction"
                types={["Feature interactions", "App settings & preferences", "Bets/picks recorded"]}
                linkedToIdentity={true}
                tracking={false}
              />
              <DataRow
                category="Diagnostics — Crash Data"
                types={["Crash logs", "Performance metrics"]}
                linkedToIdentity={false}
                tracking={false}
              />
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
              <p className="text-xs font-semibold text-primary">Data NOT Collected — Select "No" for all of these:</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {["Health & Fitness", "Financial Info", "Location", "Sensitive Info", "Contacts", "Browsing History", "Search History", "Photos/Videos", "Audio Data"].map(item => (
                  <Badge key={item} variant="outline" className="text-[10px]">{item}</Badge>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Tracking Question</p>
              <p className="text-xs text-muted-foreground">
                When asked <em>"Does your app use data for tracking?"</em> — select <strong className="text-foreground">No</strong>. Cosmic Edge does not track users across apps or websites owned by other companies.
              </p>
            </div>
          </Section>

          {/* Step 4 — Review Notes */}
          <Section title="Step 4 — App Review Notes">
            <CopyBlock
              label="Notes for Apple Review Team (required for apps referencing gambling)"
              value={`Cosmic Edge is an AI-powered sports analytics and astrological insights app for adult sports enthusiasts. The app presents odds data, player statistics, and AI-generated picks for informational and entertainment purposes only.

The app does not facilitate real-money wagering, financial transactions, or direct integration with any sportsbook. Users may log their own personal bets manually as a journal/tracker — no funds are transferred within the app.

The "SkySpread" feature is a personal bankroll tracker, similar to a spreadsheet or journal, not a betting platform.

Test Account (if required):
Email: [your test email]
Password: [your test password]

The app requires account creation to access features. All sports data is sourced from publicly available APIs. The astrology/transit data is provided for entertainment purposes only.

We confirm this app complies with Apple's guidelines for apps that reference gambling content (4.3.0) and is appropriate for users 17+.`}
            />
          </Section>

          {/* Step 5 — Categories */}
          <Section title="Step 5 — Categories & Pricing">
            <CopyBlock label="Primary Category" value="Sports" />
            <CopyBlock label="Secondary Category" value="Entertainment" />
            <CopyBlock label="Pricing" value="Free (with in-app purchases if applicable)" />
            <CopyBlock label="Availability" value="All countries and regions (or restrict as needed)" />
          </Section>

          {/* Disclaimer */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">⚠️ Important Before Submitting</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Replace the test account placeholder in the Review Notes with real credentials.</li>
              <li>Ensure your Privacy Policy URL (<code className="text-primary">cosmicedge.lovable.app/privacy</code>) is publicly accessible before submission.</li>
              <li>Apple may request clarification on the gambling/betting reference — the Review Notes above address this proactively.</li>
              <li>Consider adding a "For entertainment purposes only" disclaimer on any page that shows odds or picks.</li>
              <li>Verify your Apple Developer account has a signed Paid Applications agreement even for free apps.</li>
            </ul>
          </div>

          <p className="text-[11px] text-muted-foreground/50 text-center pb-4">
            Cosmic Edge · iOS App Store Submission Reference · Feb 2026
          </p>
        </div>
      </div>
    </div>
  );
}
