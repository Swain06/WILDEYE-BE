import { useState, useEffect, useRef } from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  MapPin,
  Check,
  X,
  Eye,
  Filter,
  Search,
  Settings,
  Bell,
  Save,
  Mail,
  Phone,
  ChevronDown,
  Play,
  StopCircle,
  Camera,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImageInputToggle } from '@/components/ImageInputToggle';
import { ModeSelector, type DetectionMode } from '@/components/ModeSelector';
import { ResultsCard } from '@/components/shared/ResultsCard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AlertBadge } from '@/components/shared/AlertBadge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  createPoachingAnalysis,
  listPoachingAlerts,
  updatePoachingAlertStatus,
  detectPoachingBase64,
  type PoachingStatus,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { PoachingAlert, AlertConfig } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = ['All', 'Pending', 'Reviewed', 'Confirmed', 'False Positive'];

export function PoachingDetection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PoachingAlert | null>(null);
  const [alerts, setAlerts] = useState<PoachingAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AlertConfig>({
    emailRecipients: 'ranger@wildlife.org, admin@park.gov',
    smsRecipients: '+91 98765 43210',
    confidenceThreshold: 75,
  });
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('wildeye_telegram') === 'true'; } catch { return false; }
  });
  const [emailEnabled, setEmailEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('wildeye_email_alerts') !== 'false'; } catch { return true; }
  });
  const [captureMode, setCaptureMode] = useState<DetectionMode>('normal');



  const toggleTelegram = () => setTelegramEnabled(prev => {
    const next = !prev;
    try { localStorage.setItem('wildeye_telegram', String(next)); } catch { /* ignore */ }
    return next;
  });
  const toggleEmail = () => setEmailEnabled(prev => {
    const next = !prev;
    try { localStorage.setItem('wildeye_email_alerts', String(next)); } catch { /* ignore */ }
    return next;
  });

  useEffect(() => {
    listPoachingAlerts({ limit: 100 })
      .then((res) => setAlerts(res.items))
      .catch(() =>
        toast({
          title: 'Failed to load alerts',
          description: 'Could not fetch poaching alert history',
          variant: 'destructive',
        }),
      )
      .finally(() => setAlertsLoading(false));
  }, []);

  const handleFileSelect = (file: File, previewUrl: string) => {
    setSelectedFile(file);
    setImagePreview(previewUrl);
    setResult(null);
  };


  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast({ title: 'No image selected', description: 'Please upload an image first', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const analysisResult = await createPoachingAnalysis({
        image: selectedFile,
        confidence: config.confidenceThreshold,
        location_name: locationName.trim() || undefined,
        lat: latitude !== '' ? parseFloat(latitude) : undefined,
        lon: longitude !== '' ? parseFloat(longitude) : undefined,
        enable_telegram: telegramEnabled,
        enable_email: emailEnabled,
        mode: captureMode,
      });

      // After successful detection, if mode was enabled, show the enhanced image in result
      const displayResult: PoachingAlert = {
        ...analysisResult,
        imageUrl: analysisResult.imageUrl || imagePreview || undefined,
      };

      setResult(displayResult);
      setAlerts((prev) => [displayResult, ...prev]);

      if (analysisResult.isSuspicious) {
        toast({
          title: 'Suspicious Activity Detected!',
          description: `Confidence: ${analysisResult.confidence.toFixed(1)}% - Alert sent ${captureMode !== 'normal' ? 'using ' + captureMode + ' enhancement' : ''}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Analysis Complete',
          description: `No suspicious activity detected ${captureMode !== 'normal' ? 'even with ' + captureMode + ' enhancement' : ''}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      toast({ title: 'Analysis Failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };


  const updateAlertStatus = (alertId: string, newStatus: PoachingStatus) => {
    updatePoachingAlertStatus(alertId, newStatus)
      .then((updated) => {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, status: updated.status } : a)),
        );
        toast({
          title: 'Status Updated',
          description: `Alert marked as ${newStatus}`,
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Update failed';
        toast({ title: 'Update Failed', description: message, variant: 'destructive' });
      });
  };

  const saveConfig = () => {
    toast({
      title: 'Settings Saved',
      description: 'Alert configuration has been updated',
    });
    setShowConfig(false);
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesStatus = statusFilter === 'All' || alert.status === statusFilter;
    const matchesSearch =
      alert.location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Shield className="h-8 w-8 text-destructive" />
            Poaching Detection
          </h1>
          <p className="mt-2 text-muted-foreground">
            AI-powered surveillance to detect and prevent poaching activities
          </p>
        </div>
        <Button
          variant={showConfig ? 'default' : 'outline'}
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings className="mr-2 h-4 w-4" />
          Alert Settings
        </Button>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <Card className="mb-8 animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alert Configuration
            </CardTitle>
            <CardDescription>Configure alert recipients and thresholds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Recipients
                </Label>
                <Input
                  value={config.emailRecipients}
                  onChange={(e) => setConfig({ ...config, emailRecipients: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  SMS Recipients
                </Label>
                <Input
                  value={config.smsRecipients}
                  onChange={(e) => setConfig({ ...config, smsRecipients: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Confidence Threshold for Alerts</Label>
                <span className="text-sm font-medium">{config.confidenceThreshold}%</span>
              </div>
              <Slider
                value={[config.confidenceThreshold]}
                onValueChange={([val]) => setConfig({ ...config, confidenceThreshold: val })}
                min={50}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Only send alerts when confidence exceeds this threshold
              </p>
            </div>
            <Button onClick={saveConfig}>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Detection Pane */}
        <div className="space-y-6">
          <Tabs defaultValue="upload" className="w-full">
            <TabsContent value="upload" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload Surveillance Image</CardTitle>
                  <CardDescription>
                    Upload camera trap or drone footage for poaching detection
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ImageInputToggle
                    onFileSelected={handleFileSelect}
                    label="Surveillance Image"
                    className="mb-2"
                  />

                  <ModeSelector
                    value={captureMode}
                    onChange={setCaptureMode}
                    className="py-2"
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Location name (optional)
                    </label>
                    <Input
                      placeholder="e.g. South Perimeter Gate"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Latitude (optional)</label>
                      <Input
                        type="number"
                        placeholder="e.g. 26.02"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        step="any"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Longitude (optional)</label>
                      <Input
                        type="number"
                        placeholder="e.g. 76.50"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        step="any"
                      />
                    </div>
                  </div>
                  {/* Telegram toggle */}
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium flex items-center gap-2 cursor-pointer" htmlFor="tg-toggle">
                        📨 Telegram Alerts
                      </label>
                      <p className="text-xs text-muted-foreground">Send alert to Telegram on high-confidence detection</p>
                    </div>
                    <button
                      id="tg-toggle"
                      role="switch"
                      aria-checked={telegramEnabled}
                      onClick={toggleTelegram}
                      style={{
                        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: telegramEnabled ? '#22c55e' : '#e2e8f0',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: telegramEnabled ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: 'white',
                        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                  {/* Email Alerts toggle */}
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium flex items-center gap-2 cursor-pointer" htmlFor="email-toggle">
                        📧 Email Alerts
                      </label>
                      <p className="text-xs text-muted-foreground">Send Gmail alert on high-confidence detection</p>
                    </div>
                    <button
                      id="email-toggle"
                      role="switch"
                      aria-checked={emailEnabled}
                      onClick={toggleEmail}
                      style={{
                        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: emailEnabled ? '#22c55e' : '#e2e8f0',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: emailEnabled ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: 'white',
                        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleAnalyze}
                    disabled={!selectedFile || isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">
                          {captureMode !== 'normal' ? `Enhancing & Analyzing...` : 'Analyzing...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-5 w-5" />
                        Analyze for Poaching
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
        </div>


        {/* Results Section */}
        {result && (
          <ResultsCard
            title="Analysis Results"
            icon={Shield}
            variant={result.isSuspicious ? 'danger' : 'success'}
          >
            <div className="space-y-4">
              {/* Preview */}
              {imagePreview && (
                <div className="space-y-4">
                  {result.processedImageUrl && result.mode !== 'normal' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Original Capture</span>
                          <div className="relative rounded-lg overflow-hidden border border-muted-foreground/10 aspect-[4/3]">
                            <img
                              src={result.imageUrl}
                              alt="Original"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <p className="text-center text-[10px] text-muted-foreground italic">Standard Input</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                            {result.mode === 'thermal' ? '🌡️ Thermal Enhanced' : '🌙 Night Enhanced'}
                          </span>
                          <div className="relative rounded-lg overflow-hidden border-2 border-primary/20 aspect-[4/3] shadow-inner">
                            <img
                              src={result.processedImageUrl}
                              alt="Enhanced"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                          </div>
                          <p className="text-center text-[10px] text-primary font-medium italic">processed output</p>
                        </div>
                      </div>
                      <div className="relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border-2 border-border p-1.5 rounded-full z-10">
                          <Search className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="h-px w-full bg-border" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-lg overflow-hidden">
                      <img
                        src={result.imageUrl || imagePreview}
                        alt="Analysis result"
                        className="w-full object-contain"
                      />
                      {result.isSuspicious && (
                        <div className="absolute top-2 right-2">
                          <AlertBadge status="High" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Status Badges */}
              <div className="flex gap-2">
                {result.mode === 'thermal' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">
                    🌡️ Thermal Mode
                  </span>
                )}
                {result.mode === 'night' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    🌙 Night Mode
                  </span>
                )}
              </div>

              {/* Status */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Suspicious Activity</p>
                  <p
                    className={`text-2xl font-bold ${result.isSuspicious ? 'text-destructive' : 'text-success'
                      }`}
                  >
                    {result.isSuspicious ? 'YES' : 'NO'}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Confidence</p>
                  <p className="text-2xl font-bold">{result.confidence.toFixed(1)}%</p>
                </div>
              </div>

              {/* Alert Status */}
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <span className="text-sm font-medium">Alert Status</span>
                <span
                  className={`flex items-center gap-2 text-sm font-semibold ${result.alertSent ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                >
                  {result.alertSent ? (
                    <>
                      <Bell className="h-4 w-4" />
                      Alert Sent
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      No Alert
                    </>
                  )}
                </span>
              </div>

              {/* Detected Objects */}
              {result.detectedObjects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Detected Objects:</p>
                  <div className="flex flex-wrap gap-2">
                    {result.detectedObjects.map((obj) => (
                      <span
                        key={obj}
                        className="rounded-full bg-destructive/20 px-3 py-1 text-sm font-medium text-destructive"
                      >
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {result.location.name}
              </div>
            </div>
          </ResultsCard>
        )}
      </div>

      {/* Alerts Table */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Alert History</CardTitle>
                <CardDescription>
                  {filteredAlerts.length} alerts recorded
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-4 flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by ID or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="max-h-[500px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alert ID</TableHead>
                    <TableHead>Mode/Source</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Loading alerts…
                      </TableCell>
                    </TableRow>
                  ) : filteredAlerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No alerts yet. Upload an image and run analysis.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAlerts.map((alert) => (
                      <TableRow key={alert.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setResult(alert)}>
                        <TableCell>
                          <div className="font-medium font-mono text-xs">{alert.id.slice(0, 8)}...</div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                            <MapPin className="h-3 w-3" />
                            {alert.location.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {alert.mode === 'thermal' && <span className="text-orange-500" title="Thermal Enhanced">🌡️</span>}
                            {alert.mode === 'night' && <span className="text-blue-500" title="Night Vision Enhanced">🌙</span>}
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">{alert.mode || 'normal'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-medium ${alert.confidence >= 80
                              ? 'text-destructive'
                              : alert.confidence >= 60
                                ? 'text-warning'
                                : 'text-muted-foreground'
                              }`}
                          >
                            {alert.confidence.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <AlertBadge status={alert.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {alert.status === 'Pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateAlertStatus(alert.id, 'Reviewed')}
                                  title="Mark as Reviewed"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => updateAlertStatus(alert.id, 'Confirmed')}
                                  title="Confirm Alert"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateAlertStatus(alert.id, 'False Positive')}
                                  title="Mark as False Positive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {alert.status === 'Reviewed' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => updateAlertStatus(alert.id, 'Confirmed')}
                                  title="Confirm Alert"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateAlertStatus(alert.id, 'False Positive')}
                                  title="Mark as False Positive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
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
  );
}
