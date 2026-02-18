import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Eye, Database, Trash2, Mail, Lock, Globe, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const dataTypes = [
  {
    category: "Contact Information",
    items: ["Email address"],
    linkedToIdentity: true,
    usedForTracking: false,
    purpose: "Account creation & authentication",
  },
  {
    category: "Identifiers",
    items: ["User ID"],
    linkedToIdentity: true,
    usedForTracking: false,
    purpose: "Session management & personalization",
  },
  {
    category: "Usage Data",
    items: ["Feature interactions", "Settings & preferences", "Bets & picks recorded"],
    linkedToIdentity: true,
    usedForTracking: false,
    purpose: "App functionality & personalization",
  },
  {
    category: "Diagnostics",
    items: ["Crash data", "Performance metrics"],
    linkedToIdentity: false,
    usedForTracking: false,
    purpose: "App stability & improvement",
  },
];

const sections = [
  {
    number: "1",
    icon: Database,
    title: "Information We Collect",
    content: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>We collect only the information necessary to provide Cosmic Edge services:</p>
        <ul className="space-y-1.5 list-disc list-inside ml-2">
          <li><strong className="text-foreground/80">Account data:</strong> Email address and display name provided during registration.</li>
          <li><strong className="text-foreground/80">Usage data:</strong> Features you interact with, app settings, and bets or picks you record within the app.</li>
          <li><strong className="text-foreground/80">Diagnostics:</strong> Anonymized crash reports and performance metrics used solely to fix bugs and improve the app.</li>
        </ul>
        <p>We do <strong className="text-foreground/80">not</strong> collect health data, financial data, precise location, contacts, photos, microphone, or camera access.</p>
      </div>
    ),
  },
  {
    number: "2",
    icon: Eye,
    title: "How We Use Your Information",
    content: (
      <ul className="space-y-1.5 list-disc list-inside ml-2 text-muted-foreground leading-relaxed">
        <li>To create and manage your account</li>
        <li>To provide, maintain, and improve our services</li>
        <li>To personalize your experience and surface relevant astrological insights</li>
        <li>To send account-related transactional notifications (not marketing without explicit consent)</li>
        <li>To monitor stability, fix bugs, and prevent abuse</li>
        <li>To comply with legal obligations</li>
      </ul>
    ),
  },
  {
    number: "3",
    icon: Lock,
    title: "Data Storage & Security",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Your data is stored using AES-256 encryption at rest and TLS 1.2+ in transit via enterprise-grade cloud infrastructure. We enforce row-level access controls so your data is only readable by you. We do not sell, rent, or trade your personal data to any third party.
      </p>
    ),
  },
  {
    number: "4",
    icon: Globe,
    title: "Third-Party Services",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        We may integrate with third-party providers for authentication and payment processing. These providers operate under their own privacy policies and are contractually prohibited from using your data for their own advertising or marketing purposes. We do not share personally identifiable information with any advertiser.
      </p>
    ),
  },
  {
    number: "5",
    icon: ShieldCheck,
    title: "Cookies & Local Storage",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        We use browser local storage and session storage solely to maintain your authenticated session and user preferences (e.g., league filters, timezone settings). We do not use third-party advertising cookies or cross-site tracking technology of any kind.
      </p>
    ),
  },
  {
    number: "6",
    icon: Trash2,
    title: "Your Rights & Data Deletion",
    content: (
      <div className="space-y-2 text-muted-foreground leading-relaxed">
        <p>You have the right at any time to:</p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li><strong className="text-foreground/80">Access</strong> your personal data</li>
          <li><strong className="text-foreground/80">Correct</strong> inaccurate information via account settings</li>
          <li><strong className="text-foreground/80">Delete</strong> your account and all associated data by contacting us</li>
          <li><strong className="text-foreground/80">Export</strong> a copy of your data upon request</li>
          <li><strong className="text-foreground/80">Opt out</strong> of non-essential communications</li>
        </ul>
        <p>Data deletion requests are processed within 30 days.</p>
      </div>
    ),
  },
  {
    number: "7",
    icon: AlertTriangle,
    title: "Children's Privacy",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Cosmic Edge is intended for users aged 18 and older. We do not knowingly collect or solicit personal information from anyone under the age of 18. If we learn that we have collected personal data from a minor, we will delete that information immediately. If you believe a minor has provided us with information, please contact us at{" "}
        <a href="mailto:privacy@cosmicedge.app" className="text-primary hover:underline">privacy@cosmicedge.app</a>.
      </p>
    ),
  },
  {
    number: "8",
    icon: Mail,
    title: "Changes to This Policy",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        We may update this Privacy Policy from time to time. Material changes will be communicated by updating the "Last updated" date at the top of this page and, where appropriate, via an in-app notification. Continued use of the app after changes are posted constitutes your acceptance of the revised policy.
      </p>
    ),
  },
];

export default function PrivacyPage() {
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

        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground mb-2">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: February 18, 2026</p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Cosmic Edge ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains what data we collect, why we collect it, and how we safeguard your information when you use our application.
            </p>
          </div>

          {/* Apple-style Data Nutrition Label */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">App Privacy Details</h2>
              <Badge variant="outline" className="text-[10px] ml-auto">Apple App Store</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              The following summarizes the data practices of Cosmic Edge as required for App Store publication.
            </p>

            <div className="space-y-3">
              {dataTypes.map((dt) => (
                <div key={dt.category} className="rounded-xl bg-muted/30 border border-border/50 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{dt.category}</p>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Badge
                        variant={dt.linkedToIdentity ? "default" : "outline"}
                        className="text-[9px] px-1.5 py-0"
                      >
                        {dt.linkedToIdentity ? "Linked to you" : "Not linked"}
                      </Badge>
                      <Badge
                        variant={dt.usedForTracking ? "destructive" : "outline"}
                        className="text-[9px] px-1.5 py-0"
                      >
                        {dt.usedForTracking ? "Used for tracking" : "Not tracked"}
                      </Badge>
                    </div>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {dt.items.map((item) => (
                      <li key={item} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-primary/60 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground/70 italic">Purpose: {dt.purpose}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground/60 border-t border-border/40 pt-3">
              We do not use any data for third-party advertising. No data is sold to data brokers.
            </p>
          </div>

          {/* Policy Sections */}
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.number} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h2 className="text-base font-semibold text-foreground">
                    {section.number}. {section.title}
                  </h2>
                </div>
                <div className="pl-9">
                  {section.content}
                </div>
              </section>
            );
          })}

          {/* Contact */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">9. Contact Us</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed text-sm">
              For privacy requests, data deletion, or any questions about this policy, contact us at:
            </p>
            <a
              href="mailto:privacy@cosmicedge.app"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              privacy@cosmicedge.app
            </a>
          </div>

          <p className="text-[11px] text-muted-foreground/50 text-center pb-4">
            Cosmic Edge · cosmicedge.lovable.app · © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
