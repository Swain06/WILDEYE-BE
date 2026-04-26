import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PawPrint,
  Flame,
  Map,
  Shield,
  Activity,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/shared/StatCard';
import { AlertBadge } from '@/components/shared/AlertBadge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { listDetections, listFireHotspots, listPoachingAlerts } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import type { ActivityEvent } from '@/types';

const HABITAT_REGIONS_COUNT = 8; // Himalayas, Western Ghats, Northeast, Dry Forests, Central India, Sundarbans, Ranthambore, Kaziranga

const modules = [
  {
    title: 'Wildlife Detection',
    description: 'AI-powered animal detection using YOLOv8 for real-time wildlife monitoring',
    icon: PawPrint,
    path: '/wildlife',
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Habitat Mapping',
    description: 'Random Forest model to predict habitat suitability for various species',
    icon: Map,
    path: '/habitat',
    color: 'bg-success/10 text-success',
  },
  {
    title: 'Fire Prediction',
    description: 'XGBoost/LSTM models for early forest fire risk assessment',
    icon: Flame,
    path: '/fire',
    color: 'bg-accent/10 text-accent',
  },
  {
    title: 'Poaching Detection',
    description: 'CNN-based suspicious activity detection to prevent poaching',
    icon: Shield,
    path: '/poaching',
    color: 'bg-destructive/10 text-destructive',
  },
];

export function Dashboard() {
  const [statsLoading, setStatsLoading] = useState(true);
  const [wildlifeTotal, setWildlifeTotal] = useState<number>(0);
  const [fireTotal, setFireTotal] = useState<number>(0);
  const [poaching24h, setPoaching24h] = useState<number>(0);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const [det, fire, poach] = await Promise.all([
          listDetections({ limit: 1 }),
          listFireHotspots({ limit: 1 }),
          listPoachingAlerts({ limit: 100 }),
        ]);
        if (cancelled) return;
        setWildlifeTotal(det.total);
        setFireTotal(fire.total);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const last24h = poach.items.filter((a) => new Date(a.timestamp).getTime() >= oneDayAgo);
        setPoaching24h(last24h.length);
      } catch {
        if (!cancelled) {
          setWildlifeTotal(0);
          setFireTotal(0);
          setPoaching24h(0);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchActivity() {
      try {
        const [detRes, fireRes, poachRes] = await Promise.all([
          listDetections({ limit: 5 }),
          listFireHotspots({ limit: 5 }),
          listPoachingAlerts({ limit: 5 }),
        ]);
        if (cancelled) return;
        const events: ActivityEvent[] = [];
        detRes.items.forEach((d) => {
          events.push({
            id: d.id,
            type: 'wildlife',
            title: `${d.species} detected`,
            description: `${d.species} at ${d.location?.name ?? 'Unknown location'} (${d.confidence.toFixed(0)}% confidence)`,
            timestamp: d.timestamp,
            severity: 'info',
          });
        });
        fireRes.items.forEach((h) => {
          events.push({
            id: h.id,
            type: 'fire',
            title: `Fire risk: ${h.riskLevel}`,
            description: `${h.location?.name ?? 'Unknown'} — ${(h.probability * 100).toFixed(0)}% risk`,
            timestamp: h.timestamp,
            severity: h.riskLevel === 'Critical' || h.riskLevel === 'High' ? 'warning' : 'info',
          });
        });
        poachRes.items.forEach((p) => {
          events.push({
            id: p.id,
            type: 'poaching',
            title: p.isSuspicious ? 'Suspicious activity' : 'Alert reviewed',
            description: `${p.location?.name ?? 'Unknown'}${p.detectedObjects?.length ? ` — ${p.detectedObjects.join(', ')}` : ''}`,
            timestamp: p.timestamp,
            severity: p.isSuspicious ? 'danger' : 'info',
          });
        });
        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivityEvents(events.slice(0, 10));
      } catch {
        if (!cancelled) setActivityEvents([]);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    }
    fetchActivity();
    return () => {
      cancelled = true;
    };
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'wildlife':
        return PawPrint;
      case 'fire':
        return Flame;
      case 'poaching':
        return Shield;
      case 'habitat':
        return Map;
      default:
        return Activity;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'warning':
        return 'text-warning';
      case 'danger':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-background py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtNi42MjcgMC0xMiA1LjM3My0xMiAxMnM1LjM3MyAxMiAxMiAxMiAxMi01LjM3MyAxMi0xMi01LjM3My0xMi0xMi0xMnptMCAxOGMtMy4zMTQgMC02LTIuNjg2LTYtNnMyLjY4Ni02IDYtNiA2IDIuNjg2IDYgNi0yLjY4NiA2LTYgNnoiIGZpbGw9IiMyRDUwMTYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvZz48L3N2Zz4=')] opacity-40" />
        <div className="container relative mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/20 px-4 py-2">
              <PawPrint className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">AI-Powered Conservation</span>
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
              <span className="text-primary">WildEye</span>
              <br />
              <span className="text-foreground/80">Wildlife Conservation Platform</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
              Leveraging advanced AI and machine learning to protect endangered wildlife,
              predict forest fires, and prevent poaching activities across India's national parks.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild>
                <Link to="/wildlife">
                  <PawPrint className="mr-2 h-5 w-5" />
                  Start Detection
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/fire">
                  <Flame className="mr-2 h-5 w-5" />
                  View Fire Alerts
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto -mt-8 px-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Wildlife Detections"
            value={statsLoading ? '—' : wildlifeTotal.toLocaleString()}
            icon={PawPrint}
            description="Total animals detected"
          />
          <StatCard
            title="Active Fire Alerts"
            value={statsLoading ? '—' : String(fireTotal)}
            icon={Flame}
            description="Regions under monitoring"
            variant={fireTotal > 0 ? 'warning' : undefined}
          />
          <StatCard
            title="Poaching Alerts (24h)"
            value={statsLoading ? '—' : String(poaching24h)}
            icon={Shield}
            description="Suspicious activities"
            variant={poaching24h > 0 ? 'danger' : undefined}
          />
          <StatCard
            title="Habitat Regions"
            value={String(HABITAT_REGIONS_COUNT)}
            icon={Map}
            description="Areas mapped"
            variant="success"
          />
        </div>
      </section>

      {/* Modules Grid */}
      <section className="container mx-auto px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Conservation Modules</h2>
            <p className="text-muted-foreground">
              Access our AI-powered tools for wildlife protection
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {modules.map((module) => (
            <Link key={module.path} to={module.path}>
              <Card className="group h-full transition-all hover:shadow-lg hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`rounded-xl p-3 ${module.color}`}>
                      <module.icon className="h-6 w-6" />
                    </div>
                    <TrendingUp className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <CardTitle className="mt-4">{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" className="group-hover:bg-primary/10">
                    Open Module →
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="container mx-auto px-4 pb-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Recent Activity</h2>
          <p className="text-muted-foreground">Latest events from wildlife, fire, and poaching modules</p>
        </div>
        <Card>
          <CardContent className="p-0">
            {activityLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <LoadingSpinner size="sm" />
                <span>Loading activity…</span>
              </div>
            ) : activityEvents.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Activity className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>No recent activity yet.</p>
                <p className="text-sm mt-1">Run detections, fire predictions, or poaching analysis to see events here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activityEvents.map((event) => {
                  const Icon = getEventIcon(event.type);
                  return (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className={`rounded-lg p-2 ${getSeverityColor(event.severity)} bg-current/10`}>
                        <Icon className={`h-5 w-5 ${getSeverityColor(event.severity)}`} />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{event.title}</p>
                          {event.severity === 'warning' && (
                            <AlertBadge status="Medium" />
                          )}
                          {event.severity === 'danger' && (
                            <AlertBadge status="High" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {(() => {
                          const date = new Date(event.timestamp);
                          return isNaN(date.getTime()) ? 'Recently' : formatDistanceToNow(date, { addSuffix: true });
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <PawPrint className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">WildEye</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                AI-powered wildlife conservation platform protecting endangered species across India.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Quick Links</h3>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li><Link to="/wildlife" className="hover:text-primary">Wildlife Detection</Link></li>
                <li><Link to="/habitat" className="hover:text-primary">Habitat Mapping</Link></li>
                <li><Link to="/fire" className="hover:text-primary">Fire Prediction</Link></li>
                <li><Link to="/poaching" className="hover:text-primary">Poaching Detection</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">SDG Goals</h3>
              <div className="mt-2 flex gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/20 text-success font-bold">
                  13
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary font-bold">
                  15
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Climate Action & Life on Land
              </p>
            </div>
          </div>
          <div className="mt-8 border-t pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} WildEye Conservation Platform. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
