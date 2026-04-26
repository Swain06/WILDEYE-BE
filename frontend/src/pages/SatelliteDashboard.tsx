import { useState, useEffect } from 'react';
import {
    Satellite,
    Flame,
    Zap,
    Clock,
    TrendingUp,
    AlertTriangle,
    MapPin,
    Calendar
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    Cell,
    Legend
} from 'recharts';
import {
    getSatelliteFiresSummary,
    getSatelliteFiresHistory,
    type SatelliteFiresSummary,
    type SatelliteFiresHistory
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

const SEVERITY_COLORS: Record<string, string> = {
    Extreme: '#7f1d1d',
    Critical: '#ef4444',
    High: '#f87171',
    Medium: '#fb923c',
    Low: '#facc15',
};

export function SatelliteDashboard() {
    const [summary, setSummary] = useState<SatelliteFiresSummary | null>(null);
    const [history, setHistory] = useState<SatelliteFiresHistory | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [sumRes, histRes] = await Promise.all([
                    getSatelliteFiresSummary(),
                    getSatelliteFiresHistory(7)
                ]);
                setSummary(sumRes);
                setHistory(histRes);
            } catch (err) {
                toast({
                    title: "Satellite sync failed",
                    description: "Could not fetch satellite analytics. Check NASA FIRMS API status.",
                    variant: "destructive"
                });
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Event listener for Carbon Estimator triggers from Map
    useEffect(() => {
        const handleCalculateCarbon = (e: any) => {
            const frp = e.detail;
            const estimate = (frp * 1.6).toFixed(2);
            toast({
                title: "Carbon Emission Estimate",
                description: `Based on FRP of ${frp} MW, estimated emissions: ${estimate} tonnes CO2/hr (Part B Placeholder)`,
            });
        };
        window.addEventListener('calculate-carbon', handleCalculateCarbon);
        return () => window.removeEventListener('calculate-carbon', handleCalculateCarbon);
    }, []);

    if (loading) {
        return (
            <div className="flex h-[calc(100vh-80px)] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Satellite className="h-12 w-12 animate-bounce text-primary" />
                    <p className="font-semibold text-muted-foreground">Syncing orbital data...</p>
                </div>
            </div>
        );
    }

    const severityData = summary ? Object.entries(summary.by_severity).map(([name, value]) => ({
        name,
        value,
        fill: SEVERITY_COLORS[name] || '#ccc'
    })) : [];

    // Sort severity for chart Low -> Extreme
    const severityOrder = ['Low', 'Medium', 'High', 'Critical', 'Extreme'];
    severityData.sort((a, b) => severityOrder.indexOf(a.name) - severityOrder.indexOf(b.name));

    const extremeCount = (summary?.by_severity['Extreme'] || 0) + (summary?.by_severity['Critical'] || 0);

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 dark:bg-slate-950/50">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground">
                            <Satellite className="h-8 w-8 text-primary" />
                            Satellite Intelligence
                        </h1>
                        <p className="mt-1 text-muted-foreground">Real-time wildfire monitoring via NASA FIRMS (MODIS + VIIRS)</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                        </span>
                        LIVE FEED ACTIVE
                    </div>
                </div>

                {/* Section 1 - Summary Cards */}
                <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="glass border-none shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Total Fires</CardTitle>
                            <Flame className="h-4 w-4 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black">{summary?.total_fires || 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">Detections in last 24h</p>
                        </CardContent>
                    </Card>

                    <Card className="glass border-none shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">High Risk</CardTitle>
                            <AlertTriangle className={`h-4 w-4 ${extremeCount > 0 ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-3xl font-black ${extremeCount > 0 ? 'text-red-500' : ''}`}>{extremeCount}</div>
                            <p className="text-xs text-muted-foreground mt-1">Extreme & Critical zones</p>
                        </CardContent>
                    </Card>

                    <Card className="glass border-none shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Peak Intensity</CardTitle>
                            <Zap className="h-4 w-4 text-yellow-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black">{summary?.hottest_fire?.frp || 0} <span className="text-lg font-medium">MW</span></div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {summary?.hottest_fire ? `${summary.hottest_fire.lat.toFixed(2)}, ${summary.hottest_fire.lng.toFixed(2)}` : 'System stable'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="glass border-none shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Last Sync</CardTitle>
                            <Clock className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black">
                                {summary?.last_updated ? new Date(summary.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {summary?.last_updated ? new Date(summary.last_updated).toLocaleDateString() : 'Syncing...'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                    {/* Section 2 - Severity Breakdown */}
                    <Card className="glass border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                Severity Breakdown
                            </CardTitle>
                            <CardDescription>Distribution of active fires by intensity level</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={severityData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="name" fontSize={12} fontWeight={600} />
                                    <YAxis fontSize={12} stroke="#94a3b8" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                                        cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                                        {severityData.map((entry, index) => (
                                            <Cell key={`cell-\${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Section 3 - 7-day Trend */}
                    <Card className="glass border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-primary" />
                                7-Day Activity Trend
                            </CardTitle>
                            <CardDescription>Daily detections and average fire intensity (FRP)</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={history?.history || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="date" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                                    <YAxis yAxisId="left" fontSize={11} stroke="#fb923c" />
                                    <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#ef4444" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Line
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="count"
                                        name="Detections"
                                        stroke="#fb923c"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: '#fb923c', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="avg_frp"
                                        name="Avg FRP (MW)"
                                        stroke="#ef4444"
                                        strokeWidth={3}
                                        strokeDasharray="5 5"
                                        dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
