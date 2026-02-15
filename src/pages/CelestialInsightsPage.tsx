import { Star, Moon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TransitsContent from "@/components/celestial/TransitsContent";
import CosmicCalendarContent from "@/components/celestial/CosmicCalendarContent";

const CelestialInsightsPage = () => {
  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-2 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-display">Celestial Insights</h1>
        </div>
        <Tabs defaultValue="transits" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="transits" className="flex-1 gap-1.5">
              <Star className="h-3.5 w-3.5" />
              Daily Transits
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-1 gap-1.5">
              <Moon className="h-3.5 w-3.5" />
              Cosmic Calendar
            </TabsTrigger>
          </TabsList>

          <div className="-mx-4 border-t-0">
            <TabsContent value="transits" className="mt-0">
              <TransitsContent />
            </TabsContent>
            <TabsContent value="calendar" className="mt-0">
              <CosmicCalendarContent />
            </TabsContent>
          </div>
        </Tabs>
      </header>
    </div>
  );
};

export default CelestialInsightsPage;
