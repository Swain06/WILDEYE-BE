import { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { getAnalyticsWildlife, getAnalyticsPoaching, getAnalyticsFire } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Colour palettes ────────────────────────────────────────────────────────
const LINE_COLORS = ['#4ade80', '#60a5fa', '#f97316', '#a78bfa', '#f472b6', '#facc15', '#34d399', '#fb923c'];
const PIE_COLORS: Record<string, string> = {
    Pending: '#f59e0b',
    Confirmed: '#ef4444',
    Reviewed: '#3b82f6',
    'False Positive': '#9ca3af',
};
const RISK_COLORS: Record<string, string> = {
    Low: '#4ade80',
    Medium: '#facc15',
    High: '#f97316',
    Critical: '#ef4444',
};

// ── Types ──────────────────────────────────────────────────────────────────
interface WildlifeAnalytics {
    bySpecies: { species: string; count: number }[];
    byMonth: Record<string, number | string>[];
}
interface PoachingAnalytics {
    byStatus: { status: string; count: number }[];
    byMonth: { month: string; count: number }[];
}
interface FireAnalytics {
    byRiskLevel: { riskLevel: string; count: number }[];
    byMonth: Record<string, number | string>[];
}

// ── Stat box ───────────────────────────────────────────────────────────────
function StatBox({ icon, value, label, trend, color }: { icon: string; value: string | number; label: string; trend?: string; color?: string }) {
    return (
        <div className="group relative flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/40 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-white/60 hover:shadow-xl dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color || 'from-primary/20 to-emerald-400/20'} text-2xl transition-transform duration-300 group-hover:scale-110`}>
                {icon}
            </div>
            <div className="mt-2 space-y-1">
                <p className="text-3xl font-black tracking-tight text-foreground">{value}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            </div>
            {trend && (
                <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-bold text-success">
                    {trend}
                </div>
            )}
        </div>
    );
}

// ── Card wrapper ───────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, className }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn(
            "flex flex-col rounded-3xl border border-white/20 bg-white/40 p-8 shadow-sm backdrop-blur-md transition-all duration-500 hover:shadow-2xl dark:border-white/10 dark:bg-white/5",
            className
        )}>
            <div className="mb-8">
                <h3 className="text-xl font-bold tracking-tight text-foreground">{title}</h3>
                <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex-1 min-h-[300px]">
                {children}
            </div>
        </div>
    );
}

// ── Custom Pie label ───────────────────────────────────────────────────────
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number; innerRadius: number;
    outerRadius: number; percent: number; name: string;
}) => {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

// ── Main component ─────────────────────────────────────────────────────────
export function Analytics() {
    const [wildlife, setWildlife] = useState<WildlifeAnalytics>({ bySpecies: [], byMonth: [] });
    const [poaching, setPoaching] = useState<PoachingAnalytics>({ byStatus: [], byMonth: [] });
    const [fire, setFire] = useState<FireAnalytics>({ byRiskLevel: [], byMonth: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([getAnalyticsWildlife(), getAnalyticsPoaching(), getAnalyticsFire()])
            .then(([w, p, f]) => {
                setWildlife(w);
                setPoaching(p);
                setFire(f);
            })
            .catch(() => toast({ title: 'Failed to load analytics', variant: 'destructive' }))
            .finally(() => setLoading(false));
    }, []);

    // ── Summary stats ──────────────────────────────────────────────────────
    const totalWildlife = wildlife.bySpecies.reduce((s, x) => s + x.count, 0);
    const totalPoaching = poaching.byStatus.reduce((s, x) => s + x.count, 0);
    const activeFire = fire.byRiskLevel
        .filter(r => r.riskLevel === 'High' || r.riskLevel === 'Critical')
        .reduce((s, x) => s + x.count, 0);
    const topSpecies = wildlife.bySpecies[0] ?? null;

    // ── Line chart species keys ───────────────────────────────────────────
    const speciesKeys = wildlife.bySpecies.slice(0, 5).map(s => s.species);

    if (loading) {
        return (
            <div className="flex flex-col h-[70vh] items-center justify-center gap-4">
                <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground animate-pulse">Analyzing satellite data...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent px-6 py-12 lg:px-12 animate-fade-in">
            <div className="mx-auto max-w-7xl">
                <header className="mb-12 space-y-2">
                    <h1 className="text-4xl font-black tracking-tight lg:text-5xl">
                        Conservation <span className="text-gradient">Insights</span>
                    </h1>
                    <p className="max-w-2xl text-lg font-medium text-muted-foreground">
                        Real-time analytics and predictive modeling for global wildlife protection.
                    </p>
                </header>

                {/* Stat strip */}
                <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatBox
                        icon="🐾"
                        value={totalWildlife.toLocaleString()}
                        label="Total Detections"
                        trend="+12%"
                        color="from-emerald-400/20 to-teal-500/20"
                    />
                    <StatBox
                        icon="🚨"
                        value={totalPoaching}
                        label="Poaching Alerts"
                        trend="-5%"
                        color="from-rose-400/20 to-orange-500/20"
                    />
                    <StatBox
                        icon="🔥"
                        value={activeFire}
                        label="Active Hotspots"
                        color="from-orange-400/20 to-red-500/20"
                    />
                    <StatBox
                        icon="🏆"
                        value={topSpecies ? topSpecies.species : '—'}
                        label={`Most Detected (${topSpecies?.count || 0})`}
                        color="from-blue-400/20 to-indigo-500/20"
                    />
                </div>

                {/* Chart grid */}
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

                    {/* Card 1 — Species bar */}
                    <ChartCard
                        title="Wildlife Density by Species"
                        subtitle="Comparative analysis of identified species populations"
                        className="animate-slide-up"
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={wildlife.bySpecies} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis
                                    dataKey="species"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                        backgroundColor: 'rgba(255,255,255,0.9)',
                                        backdropFilter: 'blur(4px)'
                                    }}
                                />
                                <Bar dataKey="count" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {/* Card 2 — Detections over time */}
                    <ChartCard
                        title="Activity Trends"
                        subtitle="Temporal distribution of wildlife movement patterns"
                        className="animate-slide-up [animation-delay:100ms]"
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={wildlife.byMonth} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                        backgroundColor: 'rgba(255,255,255,0.9)',
                                        backdropFilter: 'blur(4px)'
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 20 }} />
                                {speciesKeys.map((sp, i) => (
                                    <Line
                                        key={sp}
                                        type="monotone"
                                        dataKey={sp}
                                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                        strokeWidth={3}
                                        dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {/* Card 3 — Poaching status pie */}
                    <ChartCard
                        title="Threat Status"
                        subtitle="Distribution of poaching alert verification outcomes"
                        className="animate-slide-up [animation-delay:200ms]"
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={poaching.byStatus}
                                    dataKey="count"
                                    nameKey="status"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    labelLine={false}
                                    label={renderPieLabel}
                                >
                                    {poaching.byStatus.map((entry) => (
                                        <Cell
                                            key={entry.status}
                                            fill={PIE_COLORS[entry.status] ?? '#a8a29e'}
                                            stroke="none"
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                    }}
                                />
                                <Legend
                                    iconType="circle"
                                    layout="vertical"
                                    align="right"
                                    verticalAlign="middle"
                                    wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingLeft: 20 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {/* Card 4 — Fire risk stacked bar */}
                    <ChartCard
                        title="Risk Forecast"
                        subtitle="Monthly environmental hazard risk assessment"
                        className="animate-slide-up [animation-delay:300ms]"
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={fire.byMonth} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 600, fill: 'currentColor' }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 20 }} />
                                {['Low', 'Medium', 'High', 'Critical'].map(r => (
                                    <Bar
                                        key={r}
                                        dataKey={r}
                                        stackId="risk"
                                        fill={RISK_COLORS[r]}
                                        radius={r === 'Critical' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        barSize={40}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            </div>
        </div>
    );
}
