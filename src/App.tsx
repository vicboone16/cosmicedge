import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import GameDetail from "./pages/GameDetail";
import TeamPage from "./pages/TeamPage";
import PlayerPage from "./pages/PlayerPage";
import TransitsPage from "./pages/TransitsPage";
import Results from "./pages/Results";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";
import CosmicCalendar from "./pages/CosmicCalendar";
import SkySpreadPage from "./pages/SkySpreadPage";
import LiveBoardPage from "./pages/LiveBoardPage";
import PlayerPropsPage from "./pages/PlayerPropsPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/game/:id" element={<GameDetail />} />
              <Route path="/team/:abbr" element={<TeamPage />} />
              <Route path="/player/:id" element={<PlayerPage />} />
              <Route path="/transits" element={<TransitsPage />} />
              <Route path="/results" element={<Results />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/calendar" element={<CosmicCalendar />} />
              <Route path="/skyspread" element={<SkySpreadPage />} />
              <Route path="/live-board" element={<LiveBoardPage />} />
              <Route path="/props" element={<PlayerPropsPage />} />
            </Route>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
