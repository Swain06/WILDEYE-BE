import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Dashboard } from "@/components/Dashboard";
import { WildlifeDetection } from "@/components/WildlifeDetection";
import { HabitatSuitability } from "@/components/HabitatSuitability";
import { FirePrediction } from "@/components/FirePrediction";
import { PoachingDetection } from "@/components/PoachingDetection";
import NotFound from "./pages/NotFound";
import { MapView } from "./pages/MapView";
import { Analytics } from "./pages/Analytics";
import { ChatWidget } from "@/components/ChatWidget";
import { News } from "./pages/News";
import { SatelliteDashboard } from "./pages/SatelliteDashboard";
import CarbonEstimator from "./pages/CarbonEstimator";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Navbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wildlife" element={<WildlifeDetection />} />
            <Route path="/habitat" element={<HabitatSuitability />} />
            <Route path="/fire" element={<FirePrediction />} />
            <Route path="/poaching" element={<PoachingDetection />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/satellite" element={<SatelliteDashboard />} />
            <Route path="/carbon" element={<CarbonEstimator />} />
            <Route path="/news" element={<News />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <ChatWidget />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
