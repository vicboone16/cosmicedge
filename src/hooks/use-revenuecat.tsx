import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Purchases, type CustomerInfo, type Offerings, type Package, PurchasesError, ErrorCode } from "@revenuecat/purchases-js";
import { useAuth } from "@/hooks/use-auth";
import { logger } from "@/lib/logger";

// ─── Constants ────────────────────────────────────────────────
// RevenueCat public API key — safe for client-side use (not a secret key).
// See: https://www.revenuecat.com/docs/api-keys
const RC_API_KEY = import.meta.env.VITE_REVENUECAT_API_KEY || "";
const ENTITLEMENT_ID = "CosmicEdge Premium";

export type SubscriptionTier = "free" | "premium";

interface RevenueCatContextType {
  /** Whether the SDK is ready */
  ready: boolean;
  /** Current customer info from RevenueCat */
  customerInfo: CustomerInfo | null;
  /** Available offerings */
  offerings: Offerings | null;
  /** Whether the user has the Premium entitlement */
  isPremium: boolean;
  /** Current subscription tier */
  tier: SubscriptionTier;
  /** Refresh customer info manually */
  refreshCustomerInfo: () => Promise<void>;
  /** Purchase a specific package */
  purchasePackage: (pkg: Package, htmlTarget?: HTMLElement | null) => Promise<CustomerInfo | null>;
  /** Present the RevenueCat-managed paywall */
  presentPaywall: (htmlTarget: HTMLElement, offeringId?: string) => Promise<void>;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
}

const RevenueCatContext = createContext<RevenueCatContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────
export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<Offerings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasesInstance, setPurchasesInstance] = useState<Purchases | null>(null);

  // Configure SDK when user is available
  useEffect(() => {
    if (!user) {
      setReady(false);
      setCustomerInfo(null);
      setOfferings(null);
      setPurchasesInstance(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Use Supabase user ID as the RevenueCat app user ID
        const appUserId = user!.id;

        const purchases = Purchases.configure({
          apiKey: RC_API_KEY,
          appUserId,
        });

        if (cancelled) return;
        setPurchasesInstance(purchases);

        // Fetch customer info and offerings in parallel
        const [info, offs] = await Promise.all([
          purchases.getCustomerInfo(),
          purchases.getOfferings(),
        ]);

        if (cancelled) return;

        setCustomerInfo(info);
        setOfferings(offs);
        setReady(true);

        logger.info("revenuecat:configured", {
          userId: appUserId,
          hasEntitlements: Object.keys(info.entitlements.active).length > 0,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to initialize RevenueCat";
        setError(message);
        logger.error("revenuecat:init-error", { error: message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ─── Refresh customer info ──────────────────────────────────
  const refreshCustomerInfo = useCallback(async () => {
    if (!purchasesInstance) return;
    try {
      const info = await purchasesInstance.getCustomerInfo();
      setCustomerInfo(info);
    } catch (err) {
      logger.error("revenuecat:refresh-error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [purchasesInstance]);

  // ─── Purchase a package ─────────────────────────────────────
  const purchasePackageFn = useCallback(
    async (pkg: Package, htmlTarget?: HTMLElement | null): Promise<CustomerInfo | null> => {
      if (!purchasesInstance) {
        setError("RevenueCat not initialized");
        return null;
      }

      try {
        setError(null);
        const purchaseParams: any = { rcPackage: pkg };
        if (htmlTarget) {
          purchaseParams.htmlTarget = htmlTarget;
        }
        const { customerInfo: newInfo } = await purchasesInstance.purchase(purchaseParams);
        setCustomerInfo(newInfo);

        logger.info("revenuecat:purchase-success", {
          packageId: pkg.identifier,
          entitlements: Object.keys(newInfo.entitlements.active),
        });

        return newInfo;
      } catch (err) {
        if (err instanceof PurchasesError && err.errorCode === ErrorCode.UserCancelledError) {
          logger.info("revenuecat:purchase-cancelled");
          return null;
        }
        const message = err instanceof Error ? err.message : "Purchase failed";
        setError(message);
        logger.error("revenuecat:purchase-error", { error: message });
        return null;
      }
    },
    [purchasesInstance]
  );

  // ─── Present RevenueCat-managed paywall ─────────────────────
  const presentPaywallFn = useCallback(
    async (htmlTarget: HTMLElement, offeringId?: string) => {
      if (!purchasesInstance) {
        setError("RevenueCat not initialized");
        return;
      }

      try {
        setError(null);
        const params: any = { htmlTarget };

        if (offeringId && offerings) {
          const offering = offerings.all[offeringId];
          if (offering) {
            params.offering = offering;
          }
        }

        const result = await purchasesInstance.presentPaywall(params);
        logger.info("revenuecat:paywall-completed", { result });

        // Refresh customer info after paywall interaction
        await refreshCustomerInfo();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Paywall error";
        setError(message);
        logger.error("revenuecat:paywall-error", { error: message });
      }
    },
    [purchasesInstance, offerings, refreshCustomerInfo]
  );

  // ─── Derived state ─────────────────────────────────────────
  const isPremium = !!customerInfo?.entitlements.active[ENTITLEMENT_ID];
  const tier: SubscriptionTier = isPremium ? "premium" : "free";

  return (
    <RevenueCatContext.Provider
      value={{
        ready,
        customerInfo,
        offerings,
        isPremium,
        tier,
        refreshCustomerInfo,
        purchasePackage: purchasePackageFn,
        presentPaywall: presentPaywallFn,
        loading,
        error,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────
export function useRevenueCat() {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) throw new Error("useRevenueCat must be used inside RevenueCatProvider");
  return ctx;
}

// ─── Convenience hook for entitlement gating ──────────────────
export function useEntitlement(entitlementId: string = ENTITLEMENT_ID) {
  const { customerInfo, loading } = useRevenueCat();
  const isActive = !!customerInfo?.entitlements.active[entitlementId];
  return { isActive, loading };
}
