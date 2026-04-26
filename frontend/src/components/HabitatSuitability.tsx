import { useState, useEffect, useRef } from 'react';
import {
  Map,
  Thermometer,
  CloudRain,
  Mountain,
  Trees,
  Leaf,
  Target,
  MapPin,
  ImageIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ResultsCard } from '@/components/shared/ResultsCard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AlertBadge } from '@/components/shared/AlertBadge';
import {
  predictHabitatSuitability,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { HabitatPrediction } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import L from 'leaflet';

const SPECIES_LIST = ['Tiger', 'Elephant', 'Lion', 'Deer', 'Bear', 'Wolf', 'Fox', 'Hare', 'Boar'];
const REGIONS = [
  'Himalayas',
  'Western Ghats',
  'Northeast',
  'Dry Forests',
  'Central India',
  'Sundarbans',
  'Ranthambore',
  'Kaziranga',
];

const INDIA_CENTER: L.LatLngExpression = [20.59, 78.96];
const INDIA_GEOJSON_URL =
  'https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea01ca62ea5112/raw/e388c4cae20aa53cb5090210a42ebb9b765c0a36/india_states.geojson';

const REGION_DATA: Record<string, { center: [number, number]; species: string[]; suitability: string }> = {
  Himalayas: { center: [30.5, 79.0], species: ['Bear', 'Wolf', 'Deer'], suitability: 'High' },
  'Western Ghats': { center: [12.0, 76.0], species: ['Tiger', 'Elephant', 'Deer'], suitability: 'High' },
  Northeast: { center: [26.0, 93.0], species: ['Elephant', 'Tiger', 'Deer'], suitability: 'Medium' },
  'Dry Forests': { center: [20.0, 78.0], species: ['Lion', 'Deer', 'Boar'], suitability: 'Medium' },
  'Central India': { center: [22.0, 80.0], species: ['Tiger', 'Bear', 'Boar'], suitability: 'High' },
  Sundarbans: { center: [21.8, 88.9], species: ['Tiger', 'Deer'], suitability: 'High' },
  Ranthambore: { center: [26.0, 76.5], species: ['Tiger', 'Bear', 'Deer'], suitability: 'High' },
  Kaziranga: { center: [26.6, 93.4], species: ['Elephant', 'Tiger', 'Deer'], suitability: 'High' },
};

function getSuitabilityColor(suitability: string): string {
  switch (suitability) {
    case 'High':
      return '#16a34a';
    case 'Medium':
      return '#ca8a04';
    default:
      return '#dc2626';
  }
}

function HabitatSuitabilityMap({
  result,
  region,
}: {
  result: HabitatPrediction | null;
  region: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = mapRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: INDIA_CENTER,
      zoom: 5,
      scrollWheelZoom: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    fetch(INDIA_GEOJSON_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((geojson) => {
        if (geojson && mapInstanceRef.current) {
          L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
            style: {
              color: 'hsl(var(--border))',
              weight: 1.5,
              fillColor: 'hsl(var(--muted))',
              fillOpacity: 0.15,
            },
          }).addTo(mapInstanceRef.current);
        }
      })
      .catch(() => { });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current);
    }
    const layer = L.layerGroup().addTo(map);
    markersLayerRef.current = layer;

    Object.entries(REGION_DATA).forEach(([regionName, data]) => {
      const isPredictedRegion = result != null && region === regionName;
      const suitability = isPredictedRegion ? result.suitability : data.suitability;
      const color = getSuitabilityColor(suitability);
      const marker = L.circleMarker(data.center as L.LatLngExpression, {
        radius: isPredictedRegion ? 14 : 10,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: isPredictedRegion ? 3 : 2,
      });
      const popupContent = isPredictedRegion
        ? `<div class="text-sm">
            <p class="font-semibold">${regionName} (your prediction)</p>
            <p class="text-muted-foreground">Species: ${result.species}</p>
            <p class="text-muted-foreground">Suitability: <strong>${result.suitability}</strong></p>
            <p class="text-xs text-muted-foreground">Confidence: ${result.confidence.toFixed(1)}%</p>
          </div>`
        : `<div class="text-sm">
            <p class="font-medium">${regionName}</p>
            <p class="text-muted-foreground">Typical suitability: ${data.suitability}</p>
            <p class="text-xs text-muted-foreground">Species: ${data.species.join(', ')}</p>
          </div>`;
      marker.bindPopup(popupContent, { className: 'habitat-popup' }).addTo(layer);
    });
  }, [result, region]);

  return <div ref={mapRef} className="h-full w-full rounded-lg z-0 min-h-[400px]" />;
}

export function HabitatSuitability() {
  const [species, setSpecies] = useState('Tiger');
  const [region, setRegion] = useState('Western Ghats');
  const [temperature, setTemperature] = useState([25]);
  const [rainfall, setRainfall] = useState([1500]);
  const [elevation, setElevation] = useState([800]);
  const [forestCover, setForestCover] = useState([65]);
  const [ndvi, setNdvi] = useState([0.6]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<HabitatPrediction | null>(null);


  const handlePredict = async () => {
    setIsProcessing(true);
    try {
      const prediction = await predictHabitatSuitability({
        species,
        region,
        temperature: temperature[0],
        rainfall: rainfall[0],
        elevation: elevation[0],
        forestCover: forestCover[0],
        ndvi: ndvi[0],
      });
      setResult(prediction);
      toast({
        title: 'Prediction Complete',
        description: `Habitat suitability for ${species}: ${prediction.suitability}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prediction failed';
      toast({ title: 'Prediction Failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };


  const getFactorScore = (factor: string): number => {
    switch (factor) {
      case 'Optimal':
      case 'Sufficient':
      case 'Suitable':
      case 'Good':
      case 'Healthy':
        return 100;
      case 'Moderate':
        return 70;
      case 'Suboptimal':
      case 'Low':
        return 40;
      case 'Unsuitable':
      case 'Poor':
        return 20;
      default:
        return 50;
    }
  };

  const getFactorColor = (score: number): string => {
    if (score >= 80) return 'hsl(var(--success))';
    if (score >= 50) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const chartData = result
    ? [
      { name: 'Temperature', score: getFactorScore(result.factors.temperature), label: result.factors.temperature },
      { name: 'Rainfall', score: getFactorScore(result.factors.rainfall), label: result.factors.rainfall },
      { name: 'Elevation', score: getFactorScore(result.factors.elevation), label: result.factors.elevation },
      { name: 'Forest', score: getFactorScore(result.factors.forestCover), label: result.factors.forestCover },
      { name: 'NDVI', score: getFactorScore(result.factors.ndvi), label: result.factors.ndvi },
    ]
    : [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Map className="h-8 w-8 text-success" />
          Habitat Suitability Mapping
        </h1>
        <p className="mt-2 text-muted-foreground">
          Predict habitat suitability for various wildlife species using Random Forest model
        </p>
      </div>

      <Tabs defaultValue="predict" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="predict">Predict Suitability</TabsTrigger>
          <TabsTrigger value="maps">View Maps</TabsTrigger>
        </TabsList>

        <TabsContent value="predict" className="space-y-6">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Environmental Parameters</CardTitle>
                <CardDescription>
                  Enter habitat conditions to predict species suitability
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Species</Label>
                    <Select value={species} onValueChange={setSpecies}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIES_LIST.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-accent" />
                        Temperature
                      </Label>
                      <span className="text-sm font-medium">{temperature[0]}°C</span>
                    </div>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      max={45}
                      min={0}
                      step={1}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <CloudRain className="h-4 w-4 text-primary" />
                        Rainfall
                      </Label>
                      <span className="text-sm font-medium">{rainfall[0]} mm</span>
                    </div>
                    <Slider
                      value={rainfall}
                      onValueChange={setRainfall}
                      max={3000}
                      min={0}
                      step={50}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Mountain className="h-4 w-4 text-secondary" />
                        Elevation
                      </Label>
                      <span className="text-sm font-medium">{elevation[0]} m</span>
                    </div>
                    <Slider
                      value={elevation}
                      onValueChange={setElevation}
                      max={8000}
                      min={0}
                      step={100}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Trees className="h-4 w-4 text-success" />
                        Forest Cover
                      </Label>
                      <span className="text-sm font-medium">{forestCover[0]}%</span>
                    </div>
                    <Slider
                      value={forestCover}
                      onValueChange={setForestCover}
                      max={100}
                      min={0}
                      step={5}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Leaf className="h-4 w-4 text-success" />
                        NDVI
                      </Label>
                      <span className="text-sm font-medium">{ndvi[0].toFixed(2)}</span>
                    </div>
                    <Slider
                      value={ndvi}
                      onValueChange={setNdvi}
                      max={1}
                      min={0}
                      step={0.05}
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePredict}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Target className="mr-2 h-5 w-5" />
                      Predict Suitability
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            {result && (
              <div className="space-y-6">
                <ResultsCard
                  title="Prediction Results"
                  icon={Map}
                  variant={
                    result.suitability === 'High'
                      ? 'success'
                      : result.suitability === 'Medium'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  <div className="space-y-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">Habitat Suitability</p>
                      <div
                        className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-2xl font-bold ${result.suitability === 'High'
                          ? 'bg-success/20 text-success'
                          : result.suitability === 'Medium'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-destructive/20 text-destructive'
                          }`}
                      >
                        {result.suitability}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Confidence: <span className="font-semibold">{result.confidence.toFixed(1)}%</span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Environmental Factors Breakdown:</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical">
                            <XAxis type="number" domain={[0, 100]} />
                            <YAxis type="category" dataKey="name" width={80} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="rounded-lg bg-popover p-2 shadow-lg border">
                                      <p className="font-medium">{payload[0].payload.name}</p>
                                      <p className="text-sm text-muted-foreground">
                                        Status: {payload[0].payload.label}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                              {chartData.map((entry, index) => (
                                <Cell key={index} fill={getFactorColor(entry.score)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </ResultsCard>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="maps" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Habitat Suitability Map</CardTitle>
                <CardDescription>
                  {result
                    ? `Your prediction for ${result.species} in ${region}: ${result.suitability} (${result.confidence.toFixed(1)}% confidence)`
                    : 'Run a prediction on the first tab to plot suitability on the map. All regions show typical suitability until you predict.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-[450px] rounded-lg overflow-hidden border bg-muted/20">
                  <HabitatSuitabilityMap result={result} region={region} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-green-600 bg-green-500/80" />
                    <span>High Suitability</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-amber-600 bg-amber-500/80" />
                    <span>Medium Suitability</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-red-600 bg-red-500/80" />
                    <span>Low Suitability</span>
                  </div>
                  {result && (
                    <div className="flex items-center gap-2 ml-auto">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">Larger marker = your prediction ({region})</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h3 className="font-semibold">Regions</h3>
              {REGIONS.map((regionName) => {
                const data = REGION_DATA[regionName];
                const isYourPrediction = result != null && region === regionName;
                const suitability = isYourPrediction ? result.suitability : data.suitability;
                return (
                  <Card
                    key={regionName}
                    className={`transition-all ${isYourPrediction ? 'ring-2 ring-primary border-primary/50' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{regionName}</h4>
                        {isYourPrediction ? (
                          <span className="text-xs font-medium text-primary">Your prediction</span>
                        ) : null}
                        <AlertBadge status={suitability as 'High' | 'Medium' | 'Low'} />
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {isYourPrediction && result ? (
                          <p>
                            <strong>{result.species}</strong> · {result.confidence.toFixed(1)}% confidence
                          </p>
                        ) : (
                          <>
                            <p>Typical suitability: {data.suitability}</p>
                            <p className="mt-1">Species: {data.species.join(', ')}</p>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div >
  );
}
