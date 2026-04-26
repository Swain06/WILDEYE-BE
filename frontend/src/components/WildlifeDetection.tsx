import { useState, useEffect, useRef } from 'react';
import { PawPrint, Search, Download, Clock, MapPin, Filter, Microscope, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileUpload } from '@/components/shared/FileUpload';
import { ResultsCard } from '@/components/shared/ResultsCard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AlertBadge } from '@/components/shared/AlertBadge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImageInputToggle } from '@/components/ImageInputToggle';
import { ModeSelector, type DetectionMode } from '@/components/ModeSelector';
import { createDetections, listDetections, predictMovement, explainDetection, ensembleDetect, type MovementPredictionResponse, type GradCAMResponse, type EnsembleResult } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Detection, WildlifeDetectionResult } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function WildlifeDetection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<WildlifeDetectionResult | null>(null);
  const [detectionHistory, setDetectionHistory] = useState<Detection[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [speciesFilter, setSpeciesFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [prediction, setPrediction] = useState<MovementPredictionResponse | null>(null);
  const [predictingSpecies, setPredictingSpecies] = useState('All');
  const [isPredicting, setIsPredicting] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Ensemble state
  const [useEnsemble, setUseEnsemble] = useState(false);
  const [ensembleResult, setEnsembleResult] = useState<EnsembleResult | null>(null);

  // Grad-CAM state
  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainData, setExplainData] = useState<GradCAMResponse | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainItem, setExplainItem] = useState<Detection | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('normal');


  // Species from model (Roboflow trail-camera-animal-detection): unique from history, "All" first
  const speciesOptions = [
    'All',
    ...Array.from(new Set(detectionHistory.map((d) => d.species).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
  ];

  useEffect(() => {
    listDetections({ limit: 100 })
      .then((res) => setDetectionHistory(res.items))
      .catch(() => toast({ title: 'Failed to load history', description: 'Could not fetch detection history', variant: 'destructive' }))
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleFileSelect = (file: File, previewUrl: string) => {
    setSelectedFile(file);
    setImagePreview(previewUrl);
    setResult(null);
  };

  const handleDetect = async () => {
    if (!selectedFile) {
      toast({ title: 'No image selected', description: 'Please upload an image first', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setEnsembleResult(null);
    setResult(null);

    try {
      if (useEnsemble) {
        const ensRes = await ensembleDetect({
          image: selectedFile,
          location_name: locationName.trim() || undefined,
          lat: latitude !== '' ? parseFloat(latitude) : undefined,
          lon: longitude !== '' ? parseFloat(longitude) : undefined,
        });
        setEnsembleResult(ensRes);
        toast({
          title: 'Ensemble Complete',
          description: `${ensRes.total_models_run} models ran · ${ensRes.detections.length} species found · ${ensRes.high_confidence.length} high-confidence`,
        });
      } else {
        const detectionResult = await createDetections({
          image: selectedFile,
          location_name: locationName.trim() || undefined,
          lat: latitude !== '' ? parseFloat(latitude) : undefined,
          lon: longitude !== '' ? parseFloat(longitude) : undefined,
          mode: detectionMode,
        });

        // Use enhanced image for highlighting if available
        const displayUrl = detectionResult.enhancedImageUrl || imagePreview;

        const detectionsWithPreview = detectionResult.detections.map(d => ({
          ...d,
          imageUrl: displayUrl || undefined,
        }));
        setResult({
          detections: detectionsWithPreview,
          timestamp: detectionResult.timestamp,
          location: detectionResult.location,
          enhancedImageUrl: detectionResult.enhancedImageUrl,
        });
        setDetectionHistory(prev => [...detectionsWithPreview, ...prev]);
        toast({
          title: 'Detection Complete',
          description: `Found ${detectionResult.detections.length} wildlife species ${detectionMode !== 'normal' ? 'with enhancement' : ''}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Detection Failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };


  const exportToCSV = () => {
    const headers = ['ID', 'Species', 'Confidence', 'Timestamp', 'Location'];
    const rows = filteredDetections.map(d => [
      d.id,
      d.species,
      d.confidence.toFixed(1) + '%',
      new Date(d.timestamp).toLocaleString(),
      d.location.name,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wildlife_detections_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: 'Export Complete', description: 'CSV file downloaded' });
  };

  const filteredDetections = detectionHistory.filter(d => {
    const matchesSpecies = speciesFilter === 'All' || d.species === speciesFilter;
    const matchesSearch =
      d.location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.species.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSpecies && matchesSearch;
  });

  const bboxToPercent = (bbox: [number, number, number, number]) => {
    if (!imageDimensions) return { left: 0, top: 0, width: 100, height: 100 };
    const [x1, y1, x2, y2] = bbox;
    const { w, h } = imageDimensions;
    return {
      left: (x1 / w) * 100,
      top: (y1 / h) * 100,
      width: ((x2 - x1) / w) * 100,
      height: ((y2 - y1) / h) * 100,
    };
  };

  const handlePredictMovement = async () => {
    if (predictingSpecies === 'All') {
      toast({ title: 'Select a species', description: 'Please select a specific species to predict movement', variant: 'destructive' });
      return;
    }

    setIsPredicting(true);
    try {
      const res = await predictMovement(predictingSpecies);
      setPrediction(res);
      if (res.prediction) {
        toast({ title: 'Prediction Ready', description: res.prediction.message });
      } else {
        toast({ title: 'Not enough data', description: res.message || 'Need more historical data' });
      }
    } catch (err) {
      toast({ title: 'Prediction Failed', description: 'Could not fetch movement prediction', variant: 'destructive' });
    } finally {
      setIsPredicting(false);
    }
  };

  const handleExplain = async (detection: Detection) => {
    setExplainItem(detection);
    setExplainData(null);
    setExplainError(null);
    setExplainLoading(true);
    setExplainModalOpen(true);
    try {
      const res = await explainDetection(detection.id);
      setExplainData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Grad-CAM failed';
      setExplainError(msg);
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <PawPrint className="h-8 w-8 text-primary" />
          Wildlife Detection
        </h1>
        <p className="mt-2 text-muted-foreground">
          Detect animals on the fly using Open Images V7 (YOLOv8). Includes Tiger, Lion, Leopard, Cheetah, Elephant, Giraffe, Zebra, Bear, Deer, Monkey, Panda, and 60+ other animal classes. No custom model required.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Upload Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Image</CardTitle>
              <CardDescription>
                Upload a camera trap image for wildlife detection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageInputToggle
                onFileSelected={handleFileSelect}
                label="Detection Image"
                className="mb-2"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Location / camera trap name (optional)
                </label>
                <Input
                  placeholder="e.g. North Trail Cam 1"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Latitude (optional)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 29.53"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    step="any"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Longitude (optional)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 78.77"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    step="any"
                  />
                </div>
              </div>

              <ModeSelector
                value={detectionMode}
                onChange={setDetectionMode}
              />
              <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 bg-muted/30">
                <div className="space-y-0.5">
                  <label htmlFor="ensemble-toggle" className="text-sm font-medium cursor-pointer select-none flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    Ensemble Mode
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">slower · more accurate</span>
                  </label>
                  <p className="text-xs text-muted-foreground">Runs 3 models and combines votes for higher accuracy — may take 10–15 seconds</p>
                </div>
                <button
                  id="ensemble-toggle"
                  role="switch"
                  aria-checked={useEnsemble}
                  onClick={() => setUseEnsemble(v => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${useEnsemble ? 'bg-primary' : 'bg-input'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ${useEnsemble ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleDetect}
                disabled={!selectedFile || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">{useEnsemble ? 'Running Ensemble…' : 'Analyzing…'}</span>
                  </>
                ) : (
                  <>
                    <PawPrint className="mr-2 h-5 w-5" />
                    {useEnsemble ? 'Run Ensemble Detection' : 'Detect Wildlife'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>


          {result && !ensembleResult && (
            <ResultsCard title="Detection Results" icon={PawPrint} variant="success">
              <div className="space-y-4">
                {result.enhancedImageUrl && (
                  <div className="flex gap-2">
                    {detectionMode === 'night' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                        🌙 Night enhanced
                      </span>
                    )}
                    {detectionMode === 'thermal' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">
                        🌡️ Thermal enhanced
                      </span>
                    )}
                  </div>
                )}

                {imagePreview && (
                  <div className="relative w-fit max-w-full overflow-hidden rounded-lg">
                    <img
                      ref={imageRef}
                      src={result.detections[0]?.imageUrl || imagePreview}
                      alt="Detection result"
                      className="max-w-full object-contain"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                    />
                    <div className="absolute inset-0">
                      {result.detections.map((det) => {
                        const pct = bboxToPercent(det.bbox);
                        return (
                          <div
                            key={det.id}
                            className="absolute border-2 border-accent rounded"
                            style={{
                              left: `${pct.left}%`,
                              top: `${pct.top}%`,
                              width: `${pct.width}%`,
                              height: `${pct.height}%`,
                            }}
                          >
                            <span className="absolute -top-6 left-0 rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                              {det.species} ({det.confidence.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-semibold">Detected Species:</h4>
                  {result.detections.map((det) => (
                    <div
                      key={det.id}
                      className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <PawPrint className="h-5 w-5 text-primary" />
                        <span className="font-medium">{det.species}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="font-semibold text-success">
                          {det.confidence.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDistanceToNow(new Date(det.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ResultsCard>
          )}

          {ensembleResult && (
            <ResultsCard title="Ensemble Results" icon={PawPrint} variant="success">
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
                  <span className="text-base">⚡</span>
                  <span>
                    <span className="font-semibold">{ensembleResult.total_models_run} models</span> ran ·{' '}
                    <span className="font-semibold">{ensembleResult.detections.length}</span> species found ·{' '}
                    <span className="font-semibold text-success">{ensembleResult.high_confidence.length}</span> high-confidence
                  </span>
                </div>

                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Ensemble detection input"
                    className="max-w-full rounded-lg object-contain"
                  />
                )}

                <div className="space-y-2">
                  <h4 className="font-semibold">Detected Species:</h4>
                  {ensembleResult.detections.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No wildlife detected by any model.</p>
                  ) : (
                    ensembleResult.detections.map((det) => (
                      <div
                        key={det.species}
                        className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <PawPrint className="h-5 w-5 text-primary" />
                          <span className="font-medium">{det.species}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className="font-semibold text-success text-sm">
                            {det.confidence.toFixed(1)}%
                          </span>
                          {det.agreed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400">
                              ✓ {det.votes}/{det.total_models} models agreed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              ⚠ {det.votes}/{det.total_models} models detected
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </ResultsCard>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Detection History</CardTitle>
                  <CardDescription>
                    {filteredDetections.length} detections recorded
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by location or species..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filter species" />
                  </SelectTrigger>
                  <SelectContent>
                    {speciesOptions.map((species) => (
                      <SelectItem key={species} value={species}>
                        {species}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="max-h-[500px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Species</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">XAI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Loading history…
                        </TableCell>
                      </TableRow>
                    ) : filteredDetections.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No detections yet. Upload an image and run detection.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDetections.map((detection) => (
                        <TableRow key={detection.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <PawPrint className="h-4 w-4 text-primary" />
                              {detection.species}
                            </div>
                          </TableCell>
                          <TableCell>
                            <AlertBadge
                              status={detection.confidence >= 90 ? 'High' : detection.confidence >= 75 ? 'Medium' : 'Low'}
                            />
                            <span className="ml-2 text-sm">
                              {detection.confidence.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {detection.location.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(detection.timestamp), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExplain(detection)}
                              title="Explain this detection with Grad-CAM"
                              className="text-primary hover:text-primary"
                            >
                              <Microscope className="h-4 w-4 mr-1" />
                              Explain
                            </Button>
                          </TableCell>
                        </TableRow>
                      )))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Movement Prediction (YOLO + LSTM)</CardTitle>
                <CardDescription>Predict where the species is likely to appear in the next frame based on recent historical movements</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Select value={predictingSpecies} onValueChange={setPredictingSpecies}>
                    <SelectTrigger className="flex-1">
                      <PawPrint className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Select species to predict" />
                    </SelectTrigger>
                    <SelectContent>
                      {speciesOptions.filter(s => s !== 'All').map((species) => (
                        <SelectItem key={species} value={species}>
                          {species}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handlePredictMovement} disabled={isPredicting || predictingSpecies === 'All'}>
                    {isPredicting ? <LoadingSpinner size="sm" /> : 'Predict Next Movement'}
                  </Button>
                </div>

                {prediction?.prediction ? (
                  <div className="rounded-xl border bg-card p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-lg font-bold text-primary">{prediction.species} Forecast</h4>
                      <div className="rounded-full bg-success/10 px-3 py-1 text-sm font-semibold text-success">
                        {Math.round(prediction.prediction.confidence * 100)}% Confidence
                      </div>
                    </div>
                    <p className="mb-6 text-lg font-medium text-foreground italic">
                      "{prediction.prediction.message}"
                    </p>

                    {prediction.history && (
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Timeline</h5>
                        <div className="space-y-2">
                          {prediction.history.slice(0, 5).map((h, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm">
                              <div className="h-2 w-2 rounded-full bg-primary/40" />
                              <span className="text-muted-foreground">
                                {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="font-medium">{h.location.name}</span>
                              <span className="ml-auto text-xs opacity-70">{(h.confidence).toFixed(1)}% conf</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : prediction && !prediction.prediction ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
                    <Clock className="mb-2 h-8 w-8 opacity-20" />
                    <p>{prediction.message || "Not enough data for this species"}</p>
                    <p className="text-xs opacity-60 mt-1">Need at least 3 detections in history</p>
                  </div>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
                    <PawPrint className="mb-2 h-8 w-8 opacity-20" />
                    <p>Select a species and click predict</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative aspect-video w-full max-w-sm rounded-lg border-2 border-primary/20 bg-slate-950 overflow-hidden">
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="border border-primary/30" />
                    ))}
                  </div>

                  {prediction?.prediction && (
                    <div
                      className="absolute rounded bg-success/40 border-2 border-success animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.5)]"
                      style={{
                        left: `${(prediction.prediction.predicted_x - prediction.prediction.predicted_w / 2) * 100}%`,
                        top: `${(prediction.prediction.predicted_y - prediction.prediction.predicted_h / 2) * 100}%`,
                        width: `${prediction.prediction.predicted_w * 100}%`,
                        height: `${prediction.prediction.predicted_h * 100}%`,
                      }}
                    >
                      <div className="absolute -top-6 left-0 rounded bg-success px-2 py-0.5 text-[10px] font-bold text-white uppercase whitespace-nowrap">
                        Predicted Next {prediction.species}
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                    <div className="h-full w-px bg-primary" />
                    <div className="w-full h-px bg-primary absolute" />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Camera Frame Prediction Matrix (3x3)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={explainModalOpen} onOpenChange={setExplainModalOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Microscope className="h-5 w-5 text-primary" />
              AI Explanation
              {explainItem && (
                <span className="ml-1 text-muted-foreground font-normal text-sm">— {explainItem.species}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {explainLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-muted-foreground">Running Grad-CAM analysis… this may take a few seconds</p>
            </div>
          )}

          {explainError && !explainLoading && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Explanation unavailable</p>
                <p className="text-sm mt-1 opacity-80">{explainError}</p>
              </div>
            </div>
          )}

          {explainData && !explainLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Original Image</p>
                  {explainItem?.imageUrl ? (
                    <img
                      src={explainItem.imageUrl}
                      alt="Original detection image"
                      className="w-full rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
                      No image available
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grad-CAM Heatmap</p>
                  <img
                    src={`data:image/png;base64,${explainData.gradcam_image}`}
                    alt="Grad-CAM heatmap overlay"
                    className="w-full rounded-lg border object-cover"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model Explanation</p>
                <p className="text-sm leading-relaxed">{explainData.explanation}</p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground text-xs uppercase tracking-wider">Attention Legend:</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-6 rounded-sm bg-red-500 inline-block" />
                  Red = high attention
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-6 rounded-sm bg-yellow-400 inline-block" />
                  Yellow = medium attention
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-6 rounded-sm bg-blue-500 inline-block" />
                  Blue = low attention
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}
