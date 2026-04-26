import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    suggestions?: string[];
}

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const INITIAL_SUGGESTIONS = [
    'How many animals were detected this week?',
    'Are there any active poaching alerts?',
    'Which zones have high fire risk?',
];

function getFollowUpSuggestions(text: string): string[] {
    const t = text.toLowerCase();
    if (/tiger|elephant|leopard|species|animal|wildlife/.test(t))
        return ['Show me a breakdown by species', 'Where were they spotted?'];
    if (/poach|alert|suspicious/.test(t))
        return ['What is the current alert status?', 'Show alerts from this week'];
    if (/fire|risk|smoke/.test(t))
        return ['Which zones are most at risk?', 'Show fire trend this month'];
    return ['Give me a full summary', 'What needs my attention today?'];
}

// ── Typing indicator ───────────────────────────────────────────────────────
function TypingDots() {
    return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                />
            ))}
        </div>
    );
}

// ── Suggestion chip ────────────────────────────────────────────────────────
function Chip({ text, onClick }: { text: string; onClick: () => void }) {
    const [hover, setHover] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'inline-block', padding: '5px 12px', borderRadius: 20,
                border: '1px solid #22c55e', background: hover ? '#22c55e' : 'transparent',
                color: hover ? '#fff' : '#22c55e', fontSize: 12, cursor: 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
        >
            {text}
        </button>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Focus input when opening
    useEffect(() => {
        if (open) {
            setHasUnread(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        const userMsg: Message = { role: 'user', content: trimmed, timestamp: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            // Build history for backend (last 10 pairs = 20 messages, excluding current)
            const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed, history }),
            });

            const data = await res.json();
            const responseText: string = data.response ?? 'No response received.';
            const suggestions = getFollowUpSuggestions(responseText);

            const assistantMsg: Message = {
                role: 'assistant',
                content: responseText,
                timestamp: new Date(),
                suggestions,
            };

            setMessages((prev) => [...prev, assistantMsg]);
            if (!open) setHasUnread(true);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Connection error. Please try again.', timestamp: new Date() },
            ]);
        } finally {
            setLoading(false);
        }
    }, [messages, loading, open]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearHistory = () => setMessages([]);

    const fmt = (d: Date) =>
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ── Styles ──────────────────────────────────────────────────────────────
    const BUBBLE_SIZE = 56;
    const PANEL_W = 360;
    const PANEL_H = 500;

    return (
        <>
            <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cw-scroll::-webkit-scrollbar { width: 4px; }
        .cw-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

            {/* Floating bubble */}
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Open Ranger Assistant"
                style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
                    width: BUBBLE_SIZE, height: BUBBLE_SIZE, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    border: 'none', cursor: 'pointer', fontSize: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(22,163,74,0.45)',
                    transition: 'transform 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
                🤖
                {hasUnread && !open && (
                    <span style={{
                        position: 'absolute', top: 0, right: 0, width: 14, height: 14,
                        borderRadius: '50%', background: '#ef4444', border: '2px solid #fff',
                    }} />
                )}
            </button>

            {/* Chat panel */}
            {open && (
                <div
                    style={{
                        position: 'fixed', bottom: BUBBLE_SIZE + 32, right: 24, zIndex: 9998,
                        width: PANEL_W, height: PANEL_H,
                        background: '#0f172a', borderRadius: 16,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', animation: 'fadeIn 0.2s ease',
                        border: '1px solid #1e293b',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>🌿</span>
                            <div>
                                <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 15 }}>Ranger Assistant</p>
                                <p style={{ margin: 0, color: '#bbf7d0', fontSize: 11 }}>Built by WildEye</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={clearHistory}
                                title="Clear history"
                                style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                                    width: 30, height: 30, cursor: 'pointer', color: '#fff', fontSize: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >🗑</button>
                            <button
                                onClick={() => setOpen(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                                    width: 30, height: 30, cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >×</button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div
                        className="cw-scroll"
                        style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
                    >
                        {/* Initial suggestion chips */}
                        {messages.length === 0 && !loading && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 24 }}>
                                <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', margin: 0 }}>
                                    Ask me anything about your wildlife data 🌿
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                                    {INITIAL_SUGGESTIONS.map((s) => (
                                        <Chip key={s} text={s} onClick={() => sendMessage(s)} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Message bubbles */}
                        {messages.map((msg, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{
                                    maxWidth: '82%',
                                    background: msg.role === 'user' ? '#16a34a' : '#1e293b',
                                    color: '#f1f5f9', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    padding: '10px 14px', fontSize: 13.5, lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}>
                                    {msg.content}
                                </div>
                                <span style={{ fontSize: 10, color: '#475569', marginTop: 3, paddingInline: 4 }}>
                                    {fmt(msg.timestamp)}
                                </span>
                                {/* Follow-up suggestions */}
                                {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                        {msg.suggestions.map((s) => (
                                            <Chip key={s} text={s} onClick={() => sendMessage(s)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <div style={{ background: '#1e293b', borderRadius: '16px 16px 16px 4px' }}>
                                    <TypingDots />
                                </div>
                            </div>
                        )}

                        <div ref={endRef} />
                    </div>

                    {/* Input bar */}
                    <div style={{
                        padding: '10px 12px', borderTop: '1px solid #1e293b',
                        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
                        background: '#0f172a',
                    }}>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask the Ranger Assistant..."
                            disabled={loading}
                            style={{
                                flex: 1, background: '#1e293b', border: '1px solid #334155',
                                borderRadius: 10, padding: '9px 13px', color: '#f1f5f9',
                                fontSize: 13.5, outline: 'none',
                                opacity: loading ? 0.6 : 1,
                            }}
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={loading || !input.trim()}
                            style={{
                                background: input.trim() && !loading ? '#16a34a' : '#334155',
                                border: 'none', borderRadius: 10, width: 38, height: 38,
                                cursor: input.trim() && !loading ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 17, transition: 'background 0.15s', flexShrink: 0,
                            }}
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
