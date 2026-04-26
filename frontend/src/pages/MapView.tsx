/**
 * MapView — pure Leaflet (no react-leaflet dependency).
 * Attaches the map to a <div> ref on mount and tears it down on unmount.
 * This avoids any react-leaflet / React version compatibility issues.
 */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
    getMapData,
    getMigrationCorridor,
    getSatelliteFires,
    type MapDataResponse,
    type WildlifeMarker,
    type PoachingMarker,
    type FireMarker,
    type MigrationResponse,
    type SatelliteFire,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// Fix broken default Leaflet marker icons in Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
L.Marker.prototype.options.icon = L.icon({ iconUrl, shadowUrl: iconShadow });

// ── colours ───────────────────────────────────────────────────────────────
const COLORS = { wildlife: '#22c55e', poaching: '#ef4444', fire: '#f97316' };
const RISK_COLORS: Record<string, string> = {
    Low: '#22c55e', Medium: '#eab308', High: '#f97316', Critical: '#ef4444',
};
const STATUS_COLORS: Record<string, string> = {
    Pending: '#f97316', Reviewed: '#eab308',
    Confirmed: '#ef4444', 'False Positive': '#6b7280',
};
const SATELLITE_COLORS: Record<string, { color: string; radius: number }> = {
    Extreme: { color: '#7f1d1d', radius: 18 },
    Critical: { color: '#ef4444', radius: 14 },
    High: { color: '#f87171', radius: 10 },
    Medium: { color: '#fb923c', radius: 7 },
    Low: { color: '#facc15', radius: 5 },
};

function fmtTime(ts: string) {
    try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); }
    catch { return ts || '—'; }
}

function badgeHtml(label: string, color: string) {
    return `<span style="background:${color};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">${label}</span>`;
}

function wildlifePopup(w: WildlifeMarker) {
    return `
    <div style="font-family:sans-serif;min-width:180px">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px">🐾 ${w.species}</p>
      <p style="font-size:11px;color:#6b7280;margin:0 0 6px">${fmtTime(w.timestamp)}</p>
      <p style="font-size:12px;margin:0 0 4px">Confidence: <strong>${w.confidence.toFixed(1)}%</strong></p>
      ${w.imageUrl ? `<img src="${w.imageUrl}" style="width:100%;border-radius:6px;margin-top:6px;max-height:130px;object-fit:cover" alt="wildlife"/>` : ''}
    </div>`;
}

function poachingPopup(p: PoachingMarker) {
    return `
    <div style="font-family:sans-serif;min-width:180px">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px">🚨 Poaching Alert</p>
      <p style="font-size:11px;color:#6b7280;margin:0 0 6px">${fmtTime(p.timestamp)}</p>
      <div style="margin-bottom:6px">${badgeHtml(p.status, STATUS_COLORS[p.status] ?? '#6b7280')}</div>
      <p style="font-size:12px;margin:0 0 4px">Confidence: <strong>${p.confidence.toFixed(1)}%</strong></p>
      ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;border-radius:6px;margin-top:6px;max-height:130px;object-fit:cover" alt="poaching"/>` : ''}
    </div>`;
}

function firePopup(f: FireMarker) {
    return `
    <div style="font-family:sans-serif;min-width:160px">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px">🔥 Fire Hotspot</p>
      <p style="font-size:11px;color:#6b7280;margin:0 0 6px">${fmtTime(f.timestamp)}</p>
      <div style="margin-bottom:6px">${badgeHtml(f.riskLevel, RISK_COLORS[f.riskLevel] ?? COLORS.fire)}</div>
      <p style="font-size:12px;margin:0 0 12px">Risk: <strong>${(f.probability * 100).toFixed(1)}%</strong></p>
      
      <button 
        onclick="window.dispatchEvent(new CustomEvent('calculate-carbon', { 
          detail: { 
            frp: 0, 
            lat: ${f.lat}, 
            lng: ${f.lng}, 
            date: '${f.timestamp}' 
          } 
        }))"
        style="width:100%;background:#111827;color:white;border:none;border-radius:6px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s"
        onmouseover="this.style.background='#374151'" 
        onmouseout="this.style.background='#111827'"
      >
        Calculate Carbon Emissions
      </button>
    </div>`;
}

function satelliteFirePopup(f: SatelliteFire) {
    const s = SATELLITE_COLORS[f.severity] ?? SATELLITE_COLORS.Low;
    return `
    <div style="font-family:sans-serif;min-width:200px;padding:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:800;font-size:15px;color:#1f2937">🛰️ Satellite Fire</span>
        ${badgeHtml(f.severity, s.color)}
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;background:#f9fafb;padding:8px;border-radius:6px">
        <div>
          <p style="font-size:9px;color:#9ca3af;text-transform:uppercase;margin:0">FRP</p>
          <p style="font-size:13px;font-weight:700;color:#374151;margin:0">${f.frp} MW</p>
        </div>
        <div>
          <p style="font-size:9px;color:#9ca3af;text-transform:uppercase;margin:0">Brightness</p>
          <p style="font-size:13px;font-weight:700;color:#374151;margin:0">${f.brightness} K</p>
        </div>
        <div>
          <p style="font-size:9px;color:#9ca3af;text-transform:uppercase;margin:0">Satellite</p>
          <p style="font-size:13px;font-weight:700;color:#374151;margin:0">${f.satellite}</p>
        </div>
        <div>
          <p style="font-size:9px;color:#9ca3af;text-transform:uppercase;margin:0">Detected</p>
          <p style="font-size:11px;font-weight:600;color:#374151;margin:0">${f.acq_date}</p>
        </div>
      </div>
      
      <div style="font-size:11px;color:#6b7280;margin-bottom:12px;display:flex;align-items:center;gap:4px">
        <span>Time: ${f.acq_time}</span> • <span>${f.daynight === 'D' ? '☀️ Day' : '🌙 Night'}</span>
      </div>

      <button 
        onclick="window.dispatchEvent(new CustomEvent('calculate-carbon', { 
          detail: { 
            frp: ${f.frp}, 
            lat: ${f.lat}, 
            lng: ${f.lng}, 
            date: '${f.acq_date}' 
          } 
        }))"
        style="width:100%;background:#111827;color:white;border:none;border-radius:6px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s"
        onmouseover="this.style.background='#374151'" 
        onmouseout="this.style.background='#111827'"
      >
        Calculate Carbon Emissions
      </button>
    </div>`;
}

// ── Layer toggle UI ───────────────────────────────────────────────────────
interface LayerState { wildlife: boolean; poaching: boolean; fire: boolean; heatmap: boolean; migration: boolean; satellite: boolean }

interface TogglePanelProps {
    layers: LayerState;
    counts: { wildlife: number; poaching: number; fire: number; satellite: number };
    lastUpdated?: string;
    onToggle: (k: keyof LayerState) => void;
    speciesList: string[];
    selectedSpecies: string;
    onSpeciesChange: (s: string) => void;
    onShowMigration: () => void;
    migrationLoading: boolean;
}

function TogglePanel({ layers, counts, onToggle, speciesList, selectedSpecies, onSpeciesChange, onShowMigration, migrationLoading }: TogglePanelProps) {
    const items: { key: keyof LayerState; label: string; color: string; count?: number }[] = [
        { key: 'wildlife', label: 'Wildlife Detections', color: COLORS.wildlife, count: counts.wildlife },
        { key: 'poaching', label: 'Poaching Alerts', color: COLORS.poaching, count: counts.poaching },
        { key: 'fire', label: 'Fire Hotspots', color: COLORS.fire, count: counts.fire },
        { key: 'satellite', label: 'Satellite Fires', color: '#7f1d1d', count: counts.satellite },
        { key: 'heatmap', label: 'Wildlife Heatmap', color: '#a855f7' },
        { key: 'migration', label: 'Migration Corridor', color: '#f59e0b' },
    ];
    return (
        <div style={{
            position: 'absolute', top: 80, right: 16, zIndex: 1000,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
            borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            padding: '14px 18px', minWidth: 260, border: '1px solid rgba(0,0,0,0.08)',
        }}>
            <p style={{ fontWeight: 700, fontSize: 11, marginBottom: 12, color: '#6b7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Layer Controls
            </p>
            {items.map(({ key, label, color, count }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={layers[key]} onChange={() => onToggle(key)}
                        style={{ accentColor: color, width: 15, height: 15, cursor: 'pointer' }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', fontWeight: 500 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                        {label}
                        {count !== undefined && (
                            <span style={{ fontSize: 11, color: count === 0 ? '#9ca3af' : '#6b7280', fontWeight: 400 }}>
                                {count === 0 ? '(0)' : `(${count})`}
                            </span>
                        )}
                    </span>
                </label>
            ))}

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontWeight: 700, fontSize: 11, marginBottom: 10, color: '#6b7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Migration Tracker
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <select
                        value={selectedSpecies}
                        onChange={(e) => onSpeciesChange(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb',
                            fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none'
                        }}
                    >
                        <option value="">Select Species</option>
                        {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                        onClick={onShowMigration}
                        disabled={!selectedSpecies || migrationLoading}
                        style={{
                            width: '100%', padding: '8px', borderRadius: 8, background: '#f59e0b',
                            color: '#fff', fontSize: 12, fontWeight: 700, border: 'none',
                            cursor: (!selectedSpecies || migrationLoading) ? 'not-allowed' : 'pointer',
                            opacity: (!selectedSpecies || migrationLoading) ? 0.6 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        {migrationLoading ? 'Analyzing Corridor…' : 'Analyze Migration'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MigrationInsightsPanel({ data }: { data: MigrationResponse }) {
    if (!data.insights) return null;
    const { insights } = data;
    return (
        <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
            borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            padding: '20px 24px', minWidth: 500, border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', gap: 24, pointerEvents: 'auto'
        }}>
            <div style={{ borderRight: '1px solid #f3f4f6', paddingRight: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6 }}>Species Patterns</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>{data.species}</p>
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{data.total_sightings} recorded sightings</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', flex: 1 }}>
                <div>
                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Dominant Flow</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>{insights.dominant_direction}</p>
                </div>
                <div>
                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Avg. Speed</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>{insights.avg_speed_kmph} km/h</p>
                </div>
                <div>
                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Peak Activity</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>{insights.most_active_period}</p>
                </div>
                <div>
                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Est. Territory</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>{insights.estimated_range_km2} km²</p>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────
export function MapView() {
    const navigate = useNavigate();
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Leaflet layer groups
    const wildlifeGroupRef = useRef<L.LayerGroup | null>(null);
    const poachingGroupRef = useRef<L.LayerGroup | null>(null);
    const fireGroupRef = useRef<L.LayerGroup | null>(null);
    const satelliteGroupRef = useRef<L.LayerGroup | null>(null);
    const migrationGroupRef = useRef<L.LayerGroup | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heatLayerRef = useRef<any>(null);

    const [data, setData] = useState<MapDataResponse>({ wildlife: [], poaching: [], fire: [] });
    const [satelliteFires, setSatelliteFires] = useState<SatelliteFire[]>([]);
    const [loading, setLoading] = useState(true);
    const [layers, setLayers] = useState<LayerState>({
        wildlife: true, poaching: true, fire: true, heatmap: true, migration: true, satellite: true
    });

    // Migration state
    const [speciesList, setSpeciesList] = useState<string[]>([]);
    const [selectedSpecies, setSelectedSpecies] = useState('');
    const [migrationData, setMigrationData] = useState<MigrationResponse | null>(null);
    const [migrationLoading, setMigrationLoading] = useState(false);

    // ── 0. Event listener for carbon estimator ──────────────────────────────
    useEffect(() => {
        const handleCarbon = (e: any) => {
            const { frp, lat, lng, date } = e.detail;
            navigate(`/carbon?frp=\${frp}&lat=\${lat}&lng=\${lng}&date=\${date}`);
        };
        window.addEventListener('calculate-carbon', handleCarbon);
        return () => window.removeEventListener('calculate-carbon', handleCarbon);
    }, [navigate]);

    // ── 1. Mount the map once ───────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
            center: [29.53, 79.05],
            zoom: 6,
            zoomControl: false, // moving it to bottom right for cleaner UI
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(map);

        wildlifeGroupRef.current = L.layerGroup().addTo(map);
        poachingGroupRef.current = L.layerGroup().addTo(map);
        fireGroupRef.current = L.layerGroup().addTo(map);
        satelliteGroupRef.current = L.layerGroup().addTo(map);
        migrationGroupRef.current = L.layerGroup().addTo(map);

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // ── 2. Fetch data once ──────────────────────────────────────────────────
    useEffect(() => {
        import('leaflet.heat').catch(() => { });

        getMapData()
            .then(res => {
                setData(res);
                const species = Array.from(new Set(res.wildlife.map(w => w.species))).sort() as string[];
                setSpeciesList(species);
            })
            .catch(() => toast({ title: 'Map data unavailable', description: 'Could not fetch markers', variant: 'destructive' }))
            .finally(() => setLoading(false));

        getSatelliteFires()
            .then(res => setSatelliteFires(res.fires))
            .catch(() => toast({ title: 'Satellite data unavailable', description: 'Could not fetch FIRMS data', variant: 'destructive' }));
    }, []);

    // ── 3. Draw markers whenever data changes ───────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Wildlife
        wildlifeGroupRef.current?.clearLayers();
        data.wildlife.forEach(w => {
            L.circleMarker([w.lat, w.lng], { radius: 7, fillColor: COLORS.wildlife, fillOpacity: 0.8, color: '#fff', weight: 1.5 })
                .bindPopup(wildlifePopup(w), { maxWidth: 280 })
                .addTo(wildlifeGroupRef.current!);
        });

        // Poaching
        poachingGroupRef.current?.clearLayers();
        data.poaching.forEach(p => {
            L.circleMarker([p.lat, p.lng], { radius: 7, fillColor: COLORS.poaching, fillOpacity: 0.8, color: '#fff', weight: 1.5 })
                .bindPopup(poachingPopup(p), { maxWidth: 280 })
                .addTo(poachingGroupRef.current!);
        });

        // Fire
        fireGroupRef.current?.clearLayers();
        data.fire.forEach(f => {
            L.circleMarker([f.lat, f.lng], { radius: 7, fillColor: COLORS.fire, fillOpacity: 0.8, color: '#fff', weight: 1.5 })
                .bindPopup(firePopup(f), { maxWidth: 260 })
                .addTo(fireGroupRef.current!);
        });

        // Satellite Fires
        satelliteGroupRef.current?.clearLayers();
        satelliteFires.forEach(f => {
            const s = SATELLITE_COLORS[f.severity] ?? SATELLITE_COLORS.Low;
            L.circleMarker([f.lat, f.lng], {
                radius: s.radius,
                fillColor: s.color,
                fillOpacity: 0.8,
                color: '#fff',
                weight: 2
            })
                .bindPopup(satelliteFirePopup(f), { maxWidth: 300 })
                .addTo(satelliteGroupRef.current!);
        });

        // Heatmap
        const L_any = L as any;
        if (L_any.heatLayer && data.wildlife.length > 0) {
            if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
            heatLayerRef.current = L_any.heatLayer(
                data.wildlife.map((w: WildlifeMarker) => [w.lat, w.lng, 0.7]),
                {
                    radius: 25, blur: 15, maxZoom: 12,
                    gradient: { 0.4: '#22c55e', 0.6: '#eab308', 0.8: '#f97316', 1.0: '#ef4444' }
                }
            );
            if (layers.heatmap) heatLayerRef.current.addTo(map);
        }
    }, [data, layers.heatmap]);

    // ── 4. Toggle layer visibility ──────────────────────────────────────────
    const toggleLayer = useCallback((key: keyof LayerState) => {
        setLayers(prev => {
            const next = { ...prev, [key]: !prev[key] };
            const map = mapRef.current;
            if (!map) return next;

            const groups: Partial<Record<keyof LayerState, L.LayerGroup | null>> = {
                wildlife: wildlifeGroupRef.current,
                poaching: poachingGroupRef.current,
                fire: fireGroupRef.current,
                satellite: satelliteGroupRef.current,
                migration: migrationGroupRef.current,
            };

            const group = groups[key];
            if (group) {
                if (next[key]) group.addTo(map); else map.removeLayer(group);
            }
            if (key === 'heatmap' && heatLayerRef.current) {
                if (next.heatmap) heatLayerRef.current.addTo(map);
                else map.removeLayer(heatLayerRef.current);
            }
            return next;
        });
    }, []);

    // ── 5. Migration Logic ──────────────────────────────────────────────────
    const handleShowMigration = async () => {
        if (!selectedSpecies) return;
        setMigrationLoading(true);
        try {
            const res = await getMigrationCorridor(selectedSpecies);
            setMigrationData(res);

            const group = migrationGroupRef.current;
            if (group && mapRef.current) {
                group.clearLayers();

                if (res.corridor.length > 0) {
                    const latlngs = res.corridor.map(p => [p.lat, p.lng] as L.LatLngExpression);

                    // Draw Polyline
                    L.polyline(latlngs, { color: '#f59e0b', weight: 4, opacity: 0.8, dashArray: '8, 8' })
                        .addTo(group);

                    // Add Numbered Markers
                    res.corridor.forEach(p => {
                        const markerHtml = `
                          <div style="
                            background: #f59e0b; color: white; border: 2px solid white;
                            width: 22px; height: 22px; border-radius: 50%;
                            display: flex; align-items: center; justify-content: center;
                            font-size: 10px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.3)
                          ">
                            ${p.sequence}
                          </div>
                        `;

                        L.marker([p.lat, p.lng], {
                            icon: L.divIcon({
                                html: markerHtml,
                                className: '',
                                iconSize: [22, 22],
                                iconAnchor: [11, 11]
                            })
                        }).addTo(group);
                    });

                    // Ensure layer is visible
                    if (!layers.migration) toggleLayer('migration');

                    // Center map on corridor
                    const bounds = L.latLngBounds(latlngs);
                    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
                }
            }
        } catch (err) {
            toast({ title: 'Migration analysis failed', description: String(err), variant: 'destructive' });
        } finally {
            setMigrationLoading(false);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {/* Loading overlay */}
            {loading && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 2000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(4px)'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: 32, height: 32, border: '3px solid #e5e7eb',
                            borderTopColor: '#22c55e', borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
                        }} />
                        <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Syncing map assets…</p>
                    </div>
                </div>
            )}

            <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#f8fafc' }} />

            <TogglePanel
                layers={layers}
                counts={{
                    wildlife: data.wildlife.length,
                    poaching: data.poaching.length,
                    fire: data.fire.length,
                    satellite: satelliteFires.length
                }}
                onToggle={toggleLayer}
                speciesList={speciesList}
                selectedSpecies={selectedSpecies}
                onSpeciesChange={setSelectedSpecies}
                onShowMigration={handleShowMigration}
                migrationLoading={migrationLoading}
            />

            {migrationData && layers.migration && (
                <MigrationInsightsPanel data={migrationData} />
            )}

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
