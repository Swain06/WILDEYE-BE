import { useState, useEffect, useCallback } from 'react';
import { Search, ExternalLink, RefreshCw, Newspaper, MapPin, AlertTriangle, Tag } from 'lucide-react';

interface Entities {
    animals: string[];
    weapons: string[];
    organizations: string[];
}

interface Article {
    title: string;
    description: string;
    url: string;
    imageUrl: string;
    source: string;
    publishedAt: string;
    category: string;
    threatLevel: 'High' | 'Medium' | 'Low';
    location: string;
    entities: Entities;
}

const CATEGORIES = [
    { label: 'All', keywords: [] },
    { label: 'Poaching', keywords: ['poaching'] },
    { label: 'Law Enforcement', keywords: ['law enforcement'] },
    { label: 'Rescue', keywords: ['rescue'] },
    { label: 'Conservation', keywords: ['conservation'] },
    { label: 'General', keywords: ['general'] },
];

const THREAT_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    High: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
    Medium: { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
    Low: { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
    Poaching: { bg: '#dc2626', color: '#fff' },
    'Law Enforcement': { bg: '#1d4ed8', color: '#fff' },
    Rescue: { bg: '#0891b2', color: '#fff' },
    Conservation: { bg: '#16a34a', color: '#fff' },
    General: { bg: '#6b7280', color: '#fff' },
};

function formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    });
}

export function News() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const fetchNews = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/news');
            const data = await res.json();
            setArticles(data.articles || []);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('Failed to fetch news:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchNews(); }, [fetchNews]);

    useEffect(() => {
        const interval = setInterval(fetchNews, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchNews]);

    const filtered = articles.filter((a) => {
        const text = `${a.title} ${a.description}`.toLowerCase();
        const matchesSearch = search === '' || text.includes(search.toLowerCase());
        const matchesCategory =
            activeCategory === 'All' || a.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    const highCount = articles.filter((a) => a.threatLevel === 'High').length;

    return (
        <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 1360, margin: '0 auto' }}>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <Newspaper style={{ width: 30, height: 30, color: '#16a34a' }} />
                    <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Wildlife News & Awareness</h1>
                    {highCount > 0 && (
                        <span style={{
                            background: '#dc2626', color: '#fff',
                            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                        }}>
                            {highCount} High Threat
                        </span>
                    )}
                </div>
                <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>
                    AI-filtered wildlife crime & conservation intelligence ·{' '}
                    <span style={{ fontSize: 12 }}>Updated: {lastRefresh.toLocaleTimeString()}</span>
                </p>
            </div>

            {/* Search + Refresh */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                    <Search style={{
                        position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                        width: 15, height: 15, color: '#9ca3af',
                    }} />
                    <input
                        type="text"
                        placeholder="Search wildlife crime news..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '9px 12px 9px 34px',
                            borderRadius: 10, border: '1.5px solid #d1fae5',
                            background: 'var(--background, #fff)', color: 'inherit',
                            fontSize: 14, outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>
                <button
                    onClick={fetchNews}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '9px 16px', borderRadius: 10,
                        border: '1.5px solid #d1fae5', background: 'transparent',
                        color: '#16a34a', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    }}
                >
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    Refresh
                </button>
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
                {CATEGORIES.map((cat) => {
                    const cc = CATEGORY_COLORS[cat.label] || CATEGORY_COLORS['General'];
                    const isActive = activeCategory === cat.label;
                    return (
                        <button
                            key={cat.label}
                            onClick={() => setActiveCategory(cat.label)}
                            style={{
                                padding: '5px 15px', borderRadius: 20, border: 'none',
                                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                transition: 'all 0.2s',
                                background: isActive ? cc.bg : '#f0fdf4',
                                color: isActive ? cc.color : '#16a34a',
                                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                            }}
                        >
                            {cat.label}
                            {' '}
                            <span style={{ opacity: 0.7, fontSize: 11 }}>
                                ({cat.label === 'All' ? articles.length : articles.filter(a => a.category === cat.label).length})
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                    <div style={{
                        width: 44, height: 44, border: '4px solid #d1fae5',
                        borderTopColor: '#16a34a', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                    <Newspaper style={{ width: 44, height: 44, marginBottom: 14, opacity: 0.35 }} />
                    <p style={{ margin: 0, fontSize: 16 }}>No articles found</p>
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                        {articles.length > 0 ? 'Try adjusting your search or category.' : 'Add NEWS_API_KEY to backend/.env to enable live news.'}
                    </p>
                </div>
            )}

            {/* Stats bar */}
            {!loading && articles.length > 0 && (
                <div style={{
                    display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap',
                }}>
                    {(['High', 'Medium', 'Low'] as const).map((level) => {
                        const tc = THREAT_COLORS[level];
                        const count = articles.filter((a) => a.threatLevel === level).length;
                        return (
                            <div key={level} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 16px', borderRadius: 10,
                                background: tc.bg, border: `1.5px solid ${tc.border}`,
                            }}>
                                <AlertTriangle style={{ width: 14, height: 14, color: tc.color }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: tc.color }}>{level} Threat</span>
                                <span style={{ fontSize: 13, color: tc.color, fontWeight: 800 }}>{count}</span>
                            </div>
                        );
                    })}
                    <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
                        Showing {filtered.length} of {articles.length} articles
                    </div>
                </div>
            )}

            {/* Grid */}
            {!loading && filtered.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
                    gap: 22,
                }}>
                    {filtered.map((article, idx) => (
                        <NewsCard key={idx} article={article} />
                    ))}
                </div>
            )}
        </div>
    );
}

function NewsCard({ article }: { article: Article }) {
    const [hovered, setHovered] = useState(false);
    const tc = THREAT_COLORS[article.threatLevel];
    const cc = CATEGORY_COLORS[article.category] || CATEGORY_COLORS['General'];

    const allEntities = [
        ...article.entities.animals,
        ...article.entities.weapons,
        ...article.entities.organizations,
    ].slice(0, 5);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 14, overflow: 'hidden',
                background: 'var(--card, #fff)',
                border: `1.5px solid ${hovered ? tc.border : '#e7f7ee'}`,
                boxShadow: hovered ? '0 12px 32px rgba(22,163,74,0.14)' : '0 2px 10px rgba(0,0,0,0.06)',
                transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column',
            }}
        >
            {/* Image */}
            <div style={{ position: 'relative', height: 175, overflow: 'hidden', flexShrink: 0 }}>
                {article.imageUrl ? (
                    <img
                        src={article.imageUrl}
                        alt={article.title}
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        style={{
                            width: '100%', height: '100%', objectFit: 'cover',
                            transform: hovered ? 'scale(1.05)' : 'scale(1)',
                            transition: 'transform 0.3s ease',
                        }}
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        background: 'linear-gradient(135deg, #166534, #15803d)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Newspaper style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.4)' }} />
                    </div>
                )}

                {/* Threat badge */}
                <span style={{
                    position: 'absolute', top: 10, right: 10,
                    background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                    borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 9px',
                }}>
                    ⚠ {article.threatLevel}
                </span>

                {/* Category badge */}
                <span style={{
                    position: 'absolute', top: 10, left: 10,
                    background: cc.bg, color: cc.color,
                    borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 9px',
                }}>
                    {article.category}
                </span>
            </div>

            {/* Content */}
            <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>

                {/* Location */}
                {article.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                        <MapPin style={{ width: 12, height: 12, color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{article.location}</span>
                    </div>
                )}

                {/* Title */}
                <h3 style={{
                    margin: '0 0 8px', fontSize: 14, fontWeight: 700, lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                    {article.title}
                </h3>

                {/* Description */}
                {article.description && (
                    <p style={{
                        margin: '0 0 12px', fontSize: 12.5, color: '#6b7280', lineHeight: 1.6,
                        display: '-webkit-box', WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1,
                    }}>
                        {article.description}
                    </p>
                )}

                {/* Entity tags */}
                {allEntities.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                        <Tag style={{ width: 12, height: 12, color: '#9ca3af', flexShrink: 0, alignSelf: 'center' }} />
                        {allEntities.map((entity, i) => (
                            <span key={i} style={{
                                fontSize: 11, background: '#f0fdf4', color: '#15803d',
                                border: '1px solid #bbf7d0', borderRadius: 10, padding: '2px 8px',
                            }}>
                                {entity}
                            </span>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                    <div>
                        <span style={{ fontSize: 11, color: '#9ca3af', display: 'block' }}>{article.source}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(article.publishedAt)}</span>
                    </div>
                    <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 13px', borderRadius: 8,
                            background: hovered ? '#16a34a' : '#f0fdf4',
                            color: hovered ? '#fff' : '#16a34a',
                            fontSize: 12, fontWeight: 600, textDecoration: 'none',
                            border: '1.5px solid #16a34a', transition: 'all 0.2s',
                        }}
                    >
                        Read More <ExternalLink style={{ width: 11, height: 11 }} />
                    </a>
                </div>
            </div>
        </div>
    );
}
