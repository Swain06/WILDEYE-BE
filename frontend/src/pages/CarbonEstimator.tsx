import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Flame,
    Wind,
    Trees,
    Car,
    Plane,
    Home,
    Info,
    RefreshCw,
    History,
    FileText,
    TrendingUp,
    MapPin,
    Calendar,
    Clock
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    Legend
} from 'recharts';
import {
    createCarbonEstimate,
    listCarbonEstimates,
    type CarbonEstimate,
    type CarbonEstimatesResponse,
    type CarbonEstimateRequest
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const FOREST_TYPES = [
    { value: 'tropical_rainforest', label: 'Tropical Rainforest' },
    { value: 'tropical_dry_forest', label: 'Tropical Dry Forest' },
    { value: 'temperate_forest', label: 'Temperate Forest' },
    { value: 'boreal_forest', label: 'Boreal Forest' },
    { value: 'savanna_woodland', label: 'Savanna/Woodland' },
    { value: 'shrubland', label: 'Shrubland' },
    { value: 'grassland', label: 'Grassland' },
    { value: 'peat', label: 'Peatland' },
    { value: 'mangrove', label: 'Mangrove' },
    { value: 'default', label: 'Other/Default' },
];

export default function CarbonEstimator() {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [result, setResult] = useState<CarbonEstimate | null>(null);
    const [history, setHistory] = useState<CarbonEstimatesResponse | null>(null);

    // Form state
    const [burnedArea, setBurnedArea] = useState<number>(0);
    const [forestType, setForestType] = useState<string>('default');
    const [frp, setFrp] = useState<number>(0);
    const [duration, setDuration] = useState<number>(6);
    const [lat, setLat] = useState<number>(0);
    const [lng, setLng] = useState<number>(0);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const frpParam = searchParams.get('frp');
        const latParam = searchParams.get('lat');
        const lngParam = searchParams.get('lng');
        const dateParam = searchParams.get('date');

        if (frpParam) setFrp(parseFloat(frpParam));
        if (latParam) setLat(parseFloat(latParam));
        if (lngParam) setLng(parseFloat(lngParam));
        if (dateParam) setDate(dateParam);

        fetchHistory();

        // Auto-run if FRP is provided
        if (frpParam) {
            handleCalculate(parseFloat(frpParam), parseFloat(latParam || '0'), parseFloat(lngParam || '0'), dateParam || date);
        }
    }, [searchParams]);

    const fetchHistory = async () => {
        try {
            const data = await listCarbonEstimates();
            setHistory(data);
        } catch (err) {
            console.error('Failed to fetch history', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleCalculate = async (
        overrideFrp?: number,
        overrideLat?: number,
        overrideLng?: number,
        overrideDate?: string
    ) => {
        setLoading(true);
        try {
            const req: CarbonEstimateRequest = {
                burned_area_ha: burnedArea,
                forest_type: forestType,
                frp_mw: overrideFrp ?? frp,
                duration_hours: duration,
                lat: overrideLat ?? lat,
                lng: overrideLng ?? lng,
                fire_date: overrideDate ?? date
            };

            const data = await createCarbonEstimate(req);
            setResult(data);
            fetchHistory();
            toast({
                title: "Calculation Complete",
                description: `Estimated \${data.emissions.co2_equivalent.toLocaleString()} tonnes of CO2-equivalent.`,
            });
        } catch (err) {
            toast({
                title: "Calculation Failed",
                description: "Ensure all fields are valid.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const chartData = result ? [
        { name: 'CO2', value: result.emissions.co2_tonnes, fill: '#ef4444' },
        { name: 'CH4 (eq)', value: result.emissions.ch4_tonnes * 28, fill: '#f97316' },
        { name: 'N2O (eq)', value: result.emissions.n2o_tonnes * 265, fill: '#eab308' },
    ] : [];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 dark:bg-slate-950/50">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground">
                            <Wind className="h-8 w-8 text-primary" />
                            Carbon Emission Estimator
                        </h1>
                        <p className="mt-1 text-muted-foreground">Quantifying the atmospheric impact of regional forest fires</p>
                    </div>
                </div>

                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Input Form Column */}
                    <div className="space-y-6">
                        <Card className="glass border-none shadow-sm h-fit">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    Fire Parameters
                                </CardTitle>
                                <CardDescription>Enter known data or auto-estimate from FRP</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="forest_type">Forest Type</Label>
                                    <Select value={forestType} onValueChange={setForestType}>
                                        <SelectTrigger id="forest_type" className="rounded-xl border-border/50">
                                            <SelectValue placeholder="Select forest type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FOREST_TYPES.map(type => (
                                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="burned_area">Burned Area (Hectares)</Label>
                                    <div className="relative">
                                        <Input
                                            id="burned_area"
                                            type="number"
                                            value={burnedArea || ''}
                                            onChange={(e) => setBurnedArea(parseFloat(e.target.value) || 0)}
                                            placeholder="Leave 0 to estimate from FRP"
                                            className="rounded-xl border-border/50 pl-10"
                                        />
                                        <Flame className="absolute left-3 top-3 h-4 w-4 text-orange-500" />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">1 hectare = 10,000 sq meters</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="frp">Fire Radiative Power (MW)</Label>
                                    <div className="relative">
                                        <Input
                                            id="frp"
                                            type="number"
                                            value={frp || ''}
                                            onChange={(e) => setFrp(parseFloat(e.target.value) || 0)}
                                            placeholder="Optional, helps precision"
                                            className="rounded-xl border-border/50 pl-10"
                                        />
                                        <TrendingUp className="absolute left-3 top-3 h-4 w-4 text-primary" />
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Duration (Hours): <span className="font-bold text-primary">{duration}h</span></Label>
                                    </div>
                                    <Slider
                                        value={[duration]}
                                        onValueChange={(vals) => setDuration(vals[0])}
                                        max={72}
                                        min={1}
                                        step={1}
                                        className="py-4"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="lat">Latitude</Label>
                                        <Input
                                            id="lat"
                                            type="number"
                                            value={lat || ''}
                                            onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                                            className="rounded-xl border-border/50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lng">Longitude</Label>
                                        <Input
                                            id="lng"
                                            type="number"
                                            value={lng || ''}
                                            onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                                            className="rounded-xl border-border/50"
                                        />
                                    </div>
                                </div>

                                <Button
                                    onClick={() => handleCalculate()}
                                    disabled={loading}
                                    className="w-full rounded-xl py-6 font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? (
                                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Calculating...</>
                                    ) : (
                                        'Calculate Emissions'
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {result && (
                            <Card className="glass border-none shadow-sm bg-primary/5">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Info className="h-4 w-4" />
                                        Methodology Note
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Calculated using {result.methodology}. Biomass density for <b>{result.forest_type}</b> is estimated at {result.biomass_density} t/ha with a combustion factor of {result.combustion_factor}.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Results Column */}
                    <div className="lg:col-span-2 space-y-8">
                        {result ? (
                            <>
                                {/* Stats Grid */}
                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="glass border-none shadow-sm overflow-hidden group">
                                        <div className="p-6 bg-gradient-to-br from-red-500/10 to-orange-500/10 h-full">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400">Total emissions</span>
                                                <Flame className="h-5 w-5 text-red-500 group-hover:animate-bounce" />
                                            </div>
                                            <div className="text-4xl font-black">{result.emissions.co2_tonnes.toLocaleString()}</div>
                                            <div className="text-sm font-semibold text-muted-foreground">Tonnes of CO₂</div>
                                        </div>
                                    </Card>

                                    <Card className="glass border-none shadow-sm overflow-hidden group">
                                        <div className="p-6 bg-gradient-to-br from-primary/10 to-blue-500/10 h-full">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-black uppercase tracking-widest text-primary">Global Impact</span>
                                                <TrendingUp className="h-5 w-5 text-primary group-hover:scale-125 transition-transform" />
                                            </div>
                                            <div className="text-4xl font-black text-primary">{result.emissions.co2_equivalent.toLocaleString()}</div>
                                            <div className="text-sm font-semibold text-muted-foreground">Tonnes CO₂-equivalent</div>
                                        </div>
                                    </Card>

                                    <Card className="glass border-none shadow-sm overflow-hidden h-full">
                                        <div className="p-6 flex flex-col justify-between h-full">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl">
                                                    <Car className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                                                </div>
                                                <div>
                                                    <div className="text-2xl font-black">≈ {result.context.equivalent_cars_yearly.toLocaleString()}</div>
                                                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cars driven for a year</div>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="glass border-none shadow-sm overflow-hidden h-full">
                                        <div className="p-6 flex flex-col justify-between h-full">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-2xl">
                                                    <Trees className="h-6 w-6 text-green-600 dark:text-green-400" />
                                                </div>
                                                <div>
                                                    <div className="text-2xl font-black">≈ {result.context.trees_needed_to_offset.toLocaleString()}</div>
                                                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trees needed to offset (1 yr)</div>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </div>

                                {/* Stacked Chart & Table */}
                                <div className="grid gap-8 md:grid-cols-5">
                                    <div className="md:col-span-2">
                                        <Card className="glass border-none shadow-sm h-full">
                                            <CardHeader>
                                                <CardTitle className="text-base">Impact Breakdown</CardTitle>
                                                <CardDescription>CO₂ vs other greenhouse gases</CardDescription>
                                            </CardHeader>
                                            <CardContent className="h-[250px] p-0 pb-6">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[{ name: 'Total', ...chartData.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.value }), {}) }]} layout="vertical">
                                                        <XAxis type="number" hide />
                                                        <YAxis type="category" dataKey="name" hide />
                                                        <Tooltip
                                                            cursor={{ fill: 'transparent' }}
                                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                                                        />
                                                        <Bar dataKey="CO2" stackId="a" fill="#ef4444" radius={[4, 0, 0, 4]} barSize={60} />
                                                        <Bar dataKey="CH4 (eq)" stackId="a" fill="#f97316" barSize={60} />
                                                        <Bar dataKey="N2O (eq)" stackId="a" fill="#eab308" radius={[0, 4, 4, 0]} barSize={60} />
                                                        <Legend verticalAlign="bottom" height={36} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </CardContent>
                                        </Card>
                                    </div>
                                    <div className="md:col-span-3">
                                        <Card className="glass border-none shadow-sm h-full">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Gas</TableHead>
                                                        <TableHead>Tonnes</TableHead>
                                                        <TableHead className="text-right">CO₂ Eq</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell className="font-medium">Carbon Dioxide (CO₂)</TableCell>
                                                        <TableCell>{result.emissions.co2_tonnes.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-bold">{result.emissions.co2_tonnes.toLocaleString()}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell className="font-medium">Methane (CH₄)</TableCell>
                                                        <TableCell>{result.emissions.ch4_tonnes.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-bold">{(result.emissions.ch4_tonnes * 28).toLocaleString()}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell className="font-medium">Nitrous Oxide (N₂O)</TableCell>
                                                        <TableCell>{result.emissions.n2o_tonnes.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-bold">{(result.emissions.n2o_tonnes * 265).toLocaleString()}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </Card>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[500px] bg-slate-100/30 dark:bg-slate-900/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
                                <div className="bg-primary/10 p-6 rounded-full mb-6">
                                    <Flame className="h-12 w-12 text-primary animate-pulse" />
                                </div>
                                <h3 className="text-2xl font-bold mb-2">Ready to Estimate</h3>
                                <p className="text-muted-foreground max-w-md mx-auto">
                                    Fill in the fire parameters or click a fire event on the map to see the atmospheric carbon impact.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* History Table */}
                <div className="mt-12">
                    <Card className="glass border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5 text-primary" />
                                    Estimate Registry
                                </CardTitle>
                                <CardDescription>All previously recorded fire emission estimates</CardDescription>
                            </div>
                            {history && (
                                <div className="text-right">
                                    <div className="text-2xl font-black text-primary">{history.total_co2_equivalent.toLocaleString()}</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total CO₂ Eq Produced</div>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Area (ha)</TableHead>
                                            <TableHead>CO₂ (t)</TableHead>
                                            <TableHead>CO₂ Eq (t)</TableHead>
                                            <TableHead className="text-right">Cars/Yr</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {historyLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">Loading history...</TableCell>
                                            </TableRow>
                                        ) : history?.estimates.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">No estimates recorded yet.</TableCell>
                                            </TableRow>
                                        ) : (
                                            history?.estimates.map((est) => (
                                                <TableRow key={est.id}>
                                                    <TableCell className="font-medium whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            {est.fire_date}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="capitalize">{est.forest_type.replace(/_/g, ' ')}</TableCell>
                                                    <TableCell>{est.burned_area_ha.toLocaleString()}</TableCell>
                                                    <TableCell>{est.emissions.co2_tonnes.toLocaleString()}</TableCell>
                                                    <TableCell className="font-bold text-primary">{est.emissions.co2_equivalent.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-xs font-bold">
                                                            {est.context.equivalent_cars_yearly}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                    {history && history.estimates.length > 0 && (
                                        <tfoot className="bg-slate-50 dark:bg-slate-900/50">
                                            <TableRow>
                                                <TableCell colSpan={4} className="font-black text-right">TOTAL IMPACT</TableCell>
                                                <TableCell className="font-black text-primary">{history.total_co2_equivalent.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-black">
                                                    {history.estimates.reduce((acc, curr) => acc + curr.context.equivalent_cars_yearly, 0).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        </tfoot>
                                    )}
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
