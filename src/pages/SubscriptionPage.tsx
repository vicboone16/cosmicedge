import { useRevenueCat } from "@/hooks/use-revenuecat";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Crown,
  Sparkles,
  ArrowLeft,
  Loader2,
  RefreshCcw,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

export default function SubscriptionPage() {
  const {
    ready,
    customerInfo,
    isPremium,
    tier,
    refreshCustomerInfo,
    loading,
  } = useRevenueCat();
  const navigate = useNavigate();

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const activeEntitlements = customerInfo
    ? Object.entries(customerInfo.entitlements.active)
    : [];

  const allSubscriptions = customerInfo?.activeSubscriptions
    ? Array.from(customerInfo.activeSubscriptions)
    : [];

  return (
    <div className="max-w-lg mx-auto p-4 pt-16 space-y-6 pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="text-center space-y-2">
        {isPremium ? (
          <Crown className="h-10 w-10 text-primary mx-auto" />
        ) : (
          <Sparkles className="h-10 w-10 text-muted-foreground mx-auto" />
        )}
        <h1 className="text-2xl font-bold">Subscription</h1>
        <Badge variant={isPremium ? "default" : "secondary"} className="text-sm">
          {isPremium ? "Premium" : "Free Tier"}
        </Badge>
      </div>

      {/* Active Entitlements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entitlements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeEntitlements.length > 0 ? (
            activeEntitlements.map(([id, ent]) => (
              <div key={id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{id}</p>
                  {ent.expirationDate && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {format(new Date(ent.expirationDate), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Active
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No active entitlements</p>
          )}
        </CardContent>
      </Card>

      {/* Active Subscriptions */}
      {allSubscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allSubscriptions.map((sub, i) => (
              <div key={i} className="text-sm text-muted-foreground">
                {String(sub)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Management */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {customerInfo?.managementURL && (
            <a
              href={customerInfo.managementURL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full gap-2">
                <ExternalLink className="h-4 w-4" />
                Manage Subscription
              </Button>
            </a>
          )}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={refreshCustomerInfo}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh Status
          </Button>

          <Separator />

          {!isPremium && (
            <Button className="w-full gap-2" onClick={() => navigate("/paywall")}>
              <Sparkles className="h-4 w-4" />
              Upgrade to Premium
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Customer ID for support */}
      {customerInfo && (
        <p className="text-[10px] text-muted-foreground text-center">
          Customer ID: {customerInfo.originalAppUserId}
        </p>
      )}
    </div>
  );
}
