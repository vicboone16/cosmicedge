import { useRef, useEffect, useState } from "react";
import { useRevenueCat } from "@/hooks/use-revenuecat";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Crown, Check, Loader2, ArrowLeft, AlertCircle } from "lucide-react";

export default function PaywallPage() {
  const {
    ready,
    offerings,
    isPremium,
    tier,
    purchasePackage,
    presentPaywall,
    loading,
    error,
    customerInfo,
  } = useRevenueCat();
  const navigate = useNavigate();
  const paywallContainerRef = useRef<HTMLDivElement>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [useCustomPaywall, setUseCustomPaywall] = useState(true);
  const [paywallError, setPaywallError] = useState<string | null>(null);

  // If already premium, show status
  if (isPremium) {
    return (
      <div className="max-w-md mx-auto p-4 pt-16 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="text-center">
            <Crown className="h-12 w-12 text-primary mx-auto mb-2" />
            <CardTitle className="text-xl">You're a Premium Member!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Badge variant="default" className="text-sm px-4 py-1">
              <Sparkles className="h-3 w-3 mr-1" />
              CosmicEdge Premium Active
            </Badge>
            <p className="text-sm text-muted-foreground">
              You have full access to all premium features.
            </p>
            {customerInfo?.managementURL && (
              <a
                href={customerInfo.managementURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Manage Subscription
              </a>
            )}
            <Button variant="outline" onClick={() => navigate("/")} className="w-full mt-4">
              Back to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentOffering = offerings?.current;
  const packages = currentOffering?.availablePackages ?? [];

  const handlePurchase = async (pkg: any) => {
    setPurchasing(true);
    setPaywallError(null);
    try {
      const info = await purchasePackage(pkg);
      if (info && info.entitlements.active["CosmicEdge Premium"]) {
        navigate("/");
      }
    } catch {
      setPaywallError("Purchase failed. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handlePresentPaywall = async () => {
    if (!paywallContainerRef.current) return;
    setPaywallError(null);
    try {
      await presentPaywall(paywallContainerRef.current);
    } catch {
      setPaywallError("Could not load paywall. Showing manual options.");
      setUseCustomPaywall(true);
    }
  };

  const getPackageLabel = (identifier: string) => {
    const labels: Record<string, { label: string; badge?: string }> = {
      monthly: { label: "Monthly" },
      yearly: { label: "Yearly", badge: "Best Value" },
      lifetime: { label: "Lifetime", badge: "One-Time" },
      "$rc_monthly": { label: "Monthly" },
      "$rc_annual": { label: "Yearly", badge: "Best Value" },
      "$rc_lifetime": { label: "Lifetime", badge: "One-Time" },
    };
    return labels[identifier] || { label: identifier };
  };

  const features = [
    "Advanced astrological analysis",
    "Unlimited game predictions",
    "Player prop insights",
    "Transit modifiers & horary charts",
    "Priority data updates",
    "Ad-free experience",
  ];

  return (
    <div className="max-w-lg mx-auto p-4 pt-16 space-y-6 pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {/* Header */}
      <div className="text-center space-y-2">
        <Sparkles className="h-10 w-10 text-primary mx-auto" />
        <h1 className="text-2xl font-bold">Unlock CosmicEdge Premium</h1>
        <p className="text-muted-foreground text-sm">
          Elevate your cosmic sports analytics experience
        </p>
      </div>

      {/* Features */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Error */}
      {(error || paywallError) && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || paywallError}
        </div>
      )}

      {/* RevenueCat managed paywall container */}
      <div ref={paywallContainerRef} id="paywall-container" />

      {/* Toggle between RC paywall and custom */}
      <div className="flex gap-2 justify-center">
        <Button
          variant={useCustomPaywall ? "default" : "outline"}
          size="sm"
          onClick={() => setUseCustomPaywall(true)}
        >
          View Plans
        </Button>
        <Button
          variant={!useCustomPaywall ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setUseCustomPaywall(false);
            handlePresentPaywall();
          }}
        >
          Quick Checkout
        </Button>
      </div>

      {/* Custom package cards */}
      {useCustomPaywall && packages.length > 0 && (
        <div className="space-y-3">
          {packages.map((pkg) => {
            const { label, badge } = getPackageLabel(pkg.identifier);
            const product = pkg.webBillingProduct;
            return (
              <Card
                key={pkg.identifier}
                className="relative overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => !purchasing && handlePurchase(pkg)}
              >
                {badge && (
                  <Badge className="absolute top-3 right-3 text-[10px]">
                    {badge}
                  </Badge>
                )}
                <CardContent className="pt-5 pb-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{label}</p>
                    {product && (
                      <p className="text-sm text-muted-foreground">
                        {product.title || product.identifier}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {product?.currentPrice ? (
                      <p className="font-bold text-lg">
                        {product.currentPrice.formattedPrice}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Loading...</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {useCustomPaywall && packages.length === 0 && (
        <p className="text-center text-muted-foreground text-sm">
          No packages available. Please configure offerings in your RevenueCat dashboard.
        </p>
      )}

      {purchasing && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
