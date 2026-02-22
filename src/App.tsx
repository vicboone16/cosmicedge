import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/use-auth";
import { RevenueCatProvider } from "@/hooks/use-revenuecat";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import SplashScreen from "@/components/SplashScreen";
import { initErrorCapture } from "@/lib/error-capture";
import { logger, rotateCorrelationId } from "@/lib/logger";

// Critical path: eager load
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";

// Lazy load all non-critical pages
const GameDetail = lazy(() => import("./pages/GameDetail"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const PlayerPage = lazy(() => import("./pages/PlayerPage"));
const CelestialInsightsPage = lazy(() => import("./pages/CelestialInsightsPage"));
const Results = lazy(() => import("./pages/Results"));
const Analytics = lazy(() => import("./pages/Analytics"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SkySpreadPage = lazy(() => import("./pages/SkySpreadPage"));
const PlayerPropsPage = lazy(() => import("./pages/PlayerPropsPage"));
const TrendsPage = lazy(() => import("./pages/TrendsPage"));
const NexusPage = lazy(() => import("./pages/NexusPage"));
const CLVCalculatorPage = lazy(() => import("./pages/CLVCalculatorPage"));
const AstraPage = lazy(() => import("./pages/AstraPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FeedPage = lazy(() => import("./pages/FeedPage"));
const AdminImportPage = lazy(() => import("./pages/AdminImportPage"));
const AdminGamesPage = lazy(() => import("./pages/AdminGamesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const PaywallPage = lazy(() => import("./pages/PaywallPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const AppStorePrivacyScript = lazy(() => import("./pages/AppStorePrivacyScript"));

// Bootstrap global error capture immediately
initErrorCapture();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    if (sessionStorage.getItem("splash_shown")) return false;
    return true;
  });

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem("splash_shown", "1");
    setShowSplash(false);
  }, []);

  // Rotate correlation ID on each app mount (new user session)
  useEffect(() => {
    rotateCorrelationId();
    logger.info("app:mounted", { route: window.location.pathname });
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RevenueCatProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route element={<AppLayout />}>
                  {/* All routes require auth */}
                  <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
                  <Route path="/game/:id" element={<RequireAuth><GameDetail /></RequireAuth>} />
                  <Route path="/team/:league/:abbr" element={<RequireAuth><TeamPage /></RequireAuth>} />
                  <Route path="/player/:id" element={<RequireAuth><PlayerPage /></RequireAuth>} />
                  <Route path="/transits" element={<RequireAuth><CelestialInsightsPage /></RequireAuth>} />
                  <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
                  <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
                  <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                  <Route path="/calendar" element={<Navigate to="/transits" replace />} />
                  <Route path="/skyspread" element={<RequireAuth><SkySpreadPage /></RequireAuth>} />
                  <Route path="/live-board" element={<Navigate to="/skyspread" replace />} />
                  <Route path="/trends" element={<RequireAuth><TrendsPage /></RequireAuth>} />
                  <Route path="/props" element={<RequireAuth><PlayerPropsPage /></RequireAuth>} />
                  <Route path="/historical" element={<Navigate to="/nexus" replace />} />
                  <Route path="/nexus" element={<RequireAuth><NexusPage /></RequireAuth>} />
                  <Route path="/clv" element={<RequireAuth><CLVCalculatorPage /></RequireAuth>} />
                  <Route path="/astra" element={<RequireAuth><AstraPage /></RequireAuth>} />
                  <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                  <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />
                  <Route path="/user/:userId" element={<RequireAuth><UserProfilePage /></RequireAuth>} />
                  <Route path="/messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
                  <Route path="/messages/:conversationId" element={<RequireAuth><ChatPage /></RequireAuth>} />
                  <Route path="/feed" element={<RequireAuth><FeedPage /></RequireAuth>} />
                  <Route path="/admin/import" element={<RequireAuth><AdminImportPage /></RequireAuth>} />
                  <Route path="/admin/games" element={<RequireAuth><AdminGamesPage /></RequireAuth>} />
                  <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
                  <Route path="/paywall" element={<RequireAuth><PaywallPage /></RequireAuth>} />
                  <Route path="/subscription" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
                </Route>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/app-store-privacy" element={<AppStorePrivacyScript />} />
                <Route path="/health" element={<HealthPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
