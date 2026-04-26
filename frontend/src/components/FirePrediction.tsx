import { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Thermometer,
  Droplets,
  Wind,
  Leaf,
  Calendar,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ResultsCard } from '@/components/shared/ResultsCard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AlertBadge } from '@/components/shared/AlertBadge';
import {
  predictFireRisk,
  predictFireRiskFromImage,
  listFireHotspots,
} from '@/lib/api';
import { ImageInputToggle } from '@/components/ImageInputToggle';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { FirePrediction, FireHotspot } from '@/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import L from 'leaflet';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const INDIA_CENTER: L.LatLngExpression = [20.59, 78.96];
const INDIA_GEOJSON_URL =
  'https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea01ca62ea5112/raw/e388c4cae20aa53cb5090210a42ebb9b765c0a36/india_states.geojson';

function getHotspotColor(riskLevel: FireHotspot['riskLevel']): string {
  switch (riskLevel) {
    case 'Critical':
      return '#dc2626';
    case 'High':
      return '#ea580c';
    case 'Medium':
      return '#ca8a04';
    default:
      return '#16a34a';
  }
}

function FireHotspotMap({ hotspots }: { hotspots: FireHotspot[] }) {
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

    hotspots.forEach((hotspot) => {
      const color = getHotspotColor(hotspot.riskLevel);
      const marker = L.circleMarker([hotspot.location.lat, hotspot.location.lon], {
        radius: 10,
        color,
        fillColor: color,
        fillOpacity: 0.7,
        weight: 2,
      });
      marker
        .bindPopup(
          `<div class="text-sm">
            <p class="font-medium">${hotspot.location.name}</p>
            <p class="text-muted-foreground">Risk: ${hotspot.riskLevel} · ${(hotspot.probability * 100).toFixed(0)}%</p>
            <p class="text-xs text-muted-foreground">${formatDistanceToNow(new Date(hotspot.timestamp), { addSuffix: true })}</p>
          </div>`,
          { className: 'fire-hotspot-popup' }
        )
        .addTo(layer);
    });
  }, [hotspots]);

  return <div ref={mapRef} className="h-full w-full rounded-lg z-0 min-h-[400px]" />;
}

export function FirePrediction() {
  const [latitude, setLatitude] = useState('22.5');
  const [longitude, setLongitude] = useState('78.5');
  const [temperature, setTemperature] = useState([32]);
  const [humidity, setHumidity] = useState([45]);
  const [windSpeed, setWindSpeed] = useState([15]);
  const [ndvi, setNdvi] = useState([0.5]);
  const [month, setMonth] = useState('March');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<FirePrediction | null>(null);
  const [hotspots, setHotspots] = useState<FireHotspot[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);


  const fetchHotspots = async () => {
    try {
      const { items } = await listFireHotspots({ limit: 100 });
      setHotspots(items);
    } catch {
      setHotspots([]);
    } finally {
      setHotspotsLoading(false);
    }
  };

  useEffect(() => {
    fetchHotspots();
  }, []);

  const handleFileSelect = (file: File, previewUrl: string) => {
    setImageFile(file);
    setImagePreview(previewUrl);
    setResult(null);
  };


  const handlePredict = async () => {
    setIsProcessing(true);
    try {
      const prediction = await predictFireRisk({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        temperature: temperature[0],
        humidity: humidity[0],
        windSpeed: windSpeed[0],
        ndvi: ndvi[0],
        month,
      });
      setResult(prediction);
      await fetchHotspots();
      toast({
        title: 'Prediction Complete',
        description: `Fire risk level: ${prediction.riskLevel}`,
        variant: prediction.riskLevel === 'Critical' || prediction.riskLevel === 'High' ? 'destructive' : 'default',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prediction failed';
      toast({ title: 'Prediction Failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePredictFromImage = async () => {
    if (!imageFile) {
      toast({ title: 'No image selected', description: 'Upload an image first', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const prediction = await predictFireRiskFromImage({
        image: imageFile,
        latitude: parseFloat(latitude) || undefined,
        longitude: parseFloat(longitude) || undefined,
      });
      setResult(prediction);
      await fetchHotspots();
      toast({
        title: 'Prediction Complete',
        description: `Fire risk: ${prediction.riskLevel} (${(prediction.probability * 100).toFixed(0)}%)`,
        variant: prediction.riskLevel === 'Critical' || prediction.riskLevel === 'High' ? 'destructive' : 'default',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prediction failed';
      toast({ title: 'Prediction Failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Critical':
        return 'text-destructive';
      case 'High':
        return 'text-accent';
      case 'Medium':
        return 'text-warning';
      default:
        return 'text-success';
    }
  };

  const getRiskBgColor = (risk: string) => {
    switch (risk) {
      case 'Critical':
        return 'bg-destructive/20';
      case 'High':
        return 'bg-accent/20';
      case 'Medium':
        return 'bg-warning/20';
      default:
        return 'bg-success/20';
    }
  };

  const filteredHotspots = hotspots.filter(
    (h) => riskFilter === 'All' || h.riskLevel === riskFilter
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Flame className="h-8 w-8 text-accent" />
          Forest Fire Prediction
        </h1>
        <p className="mt-2 text-muted-foreground">
          Predict fire risk levels using XGBoost/LSTM models and real-time environmental data
        </p>
      </div>

      <Tabs defaultValue="predict" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="predict">Predict Risk</TabsTrigger>
          <TabsTrigger value="hotspots">Fire Hotspots</TabsTrigger>
        </TabsList>

        <TabsContent value="predict" className="space-y-6">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Environmental Conditions</CardTitle>
                <CardDescription>
                  Enter current conditions to predict fire risk
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Latitude
                    </Label>
                    <Input
                      type="number"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="e.g., 22.5"
                      step="0.001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Longitude
                    </Label>
                    <Input
                      type="number"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="e.g., 78.5"
                      step="0.001"
                    />
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
                      max={50}
                      min={0}
                      step={1}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-primary" />
                        Humidity
                      </Label>
                      <span className="text-sm font-medium">{humidity[0]}%</span>
                    </div>
                    <Slider
                      value={humidity}
                      onValueChange={setHumidity}
                      max={100}
                      min={0}
                      step={5}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Wind className="h-4 w-4 text-muted-foreground" />
                        Wind Speed
                      </Label>
                      <span className="text-sm font-medium">{windSpeed[0]} km/h</span>
                    </div>
                    <Slider
                      value={windSpeed}
                      onValueChange={setWindSpeed}
                      max={60}
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

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Month
                    </Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <Flame className="mr-2 h-5 w-5" />
                      Predict Fire Risk
                    </>
                  )}
                </Button>

                <div className="border-t pt-6 mt-6">
                  <p className="text-sm font-medium mb-3">Or predict from image (CNN model)</p>
                  <ImageInputToggle
                    onFileSelected={handleFileSelect}
                    label="Forest Image"
                    className="mb-3"
                  />
                  <Button
                    className="w-full mt-2"
                    variant="outline"
                    size="lg"
                    onClick={handlePredictFromImage}
                    disabled={!imageFile || isProcessing}
                  >
                    <Flame className="mr-2 h-5 w-5" />
                    Predict from Image
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {result && (
              <div className="space-y-6">
                <ResultsCard
                  title="Fire Risk Assessment"
                  icon={Flame}
                  variant={
                    result.riskLevel === 'Critical' || result.riskLevel === 'High'
                      ? 'danger'
                      : result.riskLevel === 'Medium'
                        ? 'warning'
                        : 'success'
                  }
                >
                  <div className="space-y-6">
                    {/* Risk Gauge */}
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-3">Risk Level</p>
                      <div
                        className={`inline-flex items-center justify-center rounded-full px-8 py-4 text-3xl font-bold ${getRiskBgColor(
                          result.riskLevel
                        )} ${getRiskColor(result.riskLevel)}`}
                      >
                        {result.riskLevel === 'Critical' && <AlertTriangle className="mr-2 h-8 w-8" />}
                        {result.riskLevel}
                      </div>
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">Fire Probability</p>
                        <p className="text-4xl font-bold">{(result.probability * 100).toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Probability Gauge Bar */}
                    <div className="space-y-2">
                      <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${result.probability > 0.7
                            ? 'bg-destructive'
                            : result.probability > 0.5
                              ? 'bg-accent'
                              : result.probability > 0.3
                                ? 'bg-warning'
                                : 'bg-success'
                            }`}
                          style={{ width: `${result.probability * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Low</span>
                        <span>Medium</span>
                        <span>High</span>
                        <span>Critical</span>
                      </div>
                    </div>

                    {/* 7-Day Forecast */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        7-Day Risk Forecast
                      </p>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={result.forecast}>
                            <defs>
                              <linearGradient id="fireGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="day"
                              tickFormatter={(d) => `Day ${d}`}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis
                              domain={[0, 1]}
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="rounded-lg bg-popover p-2 shadow-lg border">
                                      <p className="font-medium">Day {payload[0].payload.day}</p>
                                      <p className="text-sm text-muted-foreground">
                                        Risk: {(payload[0].value as number * 100).toFixed(1)}%
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="probability"
                              stroke="hsl(var(--accent))"
                              fill="url(#fireGradient)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-sm font-medium mb-2">Recommendations</p>
                      <p className="text-sm text-muted-foreground">{result.recommendations}</p>
                    </div>
                  </div>
                </ResultsCard>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="hotspots" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Map Area */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Fire Hotspot Map</CardTitle>
                    <CardDescription>Current fire risk zones across regions</CardDescription>
                  </div>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-[150px]">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Levels</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {hotspotsLoading ? (
                  <div className="flex items-center justify-center h-[400px] rounded-lg border bg-muted/20">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <div className="relative h-[400px] rounded-lg border overflow-hidden bg-muted/20">
                    <FireHotspotMap hotspots={filteredHotspots} />
                  </div>
                )}

                {/* Legend */}
                <div className="mt-4 flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-destructive" />
                    <span>Critical</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-accent" />
                    <span>High</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-warning" />
                    <span>Medium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-success" />
                    <span>Low</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Alerts */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Active Alerts ({filteredHotspots.length})
              </h3>
              {!hotspotsLoading && filteredHotspots.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No fire alerts yet. Run a prediction (Predict Risk or Predict from Image) to save hotspots here.
                </p>
              )}
              {filteredHotspots.map((hotspot) => (
                <Card
                  key={hotspot.id}
                  className={`transition-all ${hotspot.riskLevel === 'Critical'
                    ? 'border-destructive/50 bg-destructive/5'
                    : hotspot.riskLevel === 'High'
                      ? 'border-accent/50 bg-accent/5'
                      : ''
                    }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{hotspot.location.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Probability: {(hotspot.probability * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(hotspot.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                      <AlertBadge status={hotspot.riskLevel} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}
