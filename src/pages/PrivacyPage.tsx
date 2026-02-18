import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground mb-2">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: February 18, 2026</p>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            Cosmic Edge ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our application.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect information you provide directly to us, such as when you create an account, including your email address and display name. We also collect usage data such as the features you interact with, settings you configure, and bets or picks you record within the app.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc list-inside">
              <li>To provide, maintain, and improve our services</li>
              <li>To personalize your experience and surface relevant astrological insights</li>
              <li>To send account-related notifications (not marketing without consent)</li>
              <li>To monitor usage patterns and fix bugs</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Data Storage & Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely using industry-standard encryption. We use Lovable Cloud infrastructure, which provides enterprise-grade security controls. We do not sell your personal data to third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may use third-party services for analytics and payment processing. These providers have their own privacy policies and we encourage you to review them. We do not share your personally identifiable information with advertisers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Cookies & Local Storage</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use browser local storage and session storage to maintain your session state and preferences (e.g., league filters, timezone settings). We do not use tracking cookies for advertising purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access, update, or delete your personal information at any time through your account settings. You may also request a full export of your data by contacting us directly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cosmic Edge is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with their data, please contact us immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any significant changes by updating the date at the top of this page. Continued use of the app after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">9. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions or concerns about this Privacy Policy, please contact us at{" "}
              <a href="mailto:privacy@cosmicedge.app" className="text-primary hover:underline">
                privacy@cosmicedge.app
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
