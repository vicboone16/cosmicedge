import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import SplashScreen from "@/components/SplashScreen";
import Index from "./pages/Index";
import GameDetail from "./pages/GameDetail";
import TeamPage from "./pages/TeamPage";
import PlayerPage from "./pages/PlayerPage";
import CelestialInsightsPage from "./pages/CelestialInsightsPage";
import Results from "./pages/Results";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";

import SkySpreadPage from "./pages/SkySpreadPage";
import LiveBoardPage from "./pages/LiveBoardPage";
import PlayerPropsPage from "./pages/PlayerPropsPage";
import TrendsPage from "./pages/TrendsPage";
import HistoricalPage from "./pages/HistoricalPage";
import NexusPage from "./pages/NexusPage";
import CLVCalculatorPage from "./pages/CLVCalculatorPage";
import AstraPage from "./pages/AstraPage";
import ProfilePage from "./pages/ProfilePage";
import FriendsPage from "./pages/FriendsPage";
import UserProfilePage from "./pages/UserProfilePage";
import MessagesPage from "./pages/MessagesPage";
import ChatPage from "./pages/ChatPage";
import FeedPage from "./pages/FeedPage";
import AuthPage from "./pages/AuthPage";
import AdminImportPage from "./pages/AdminImportPage";
import AdminGamesPage from "./pages/AdminGamesPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";
import PrivacyPage from "./pages/PrivacyPage";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session
    if (sessionStorage.getItem("splash_shown")) return false;
    return true;
  });

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem("splash_shown", "1");
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <BrowserRouter>
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
              </Route>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
