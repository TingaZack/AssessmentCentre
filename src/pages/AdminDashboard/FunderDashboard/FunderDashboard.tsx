// src/pages/AdminDashboard/FunderDashboard/FunderDashboard.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    LayoutDashboard,
    Table as TableIcon,
    Download,
    Filter,
    ChevronDown,
    ChevronRight,
    Users,
    Search,
    Settings2,
    RotateCcw,
    Venus,
    Mars,
    Briefcase,
    Loader2,
    Info,
    CheckCircle2,
    XCircle,
    SlidersHorizontal,
    Eye,
    EyeOff,
    X,
    Check,
    Plus,
    Trash2,
    MinusCircle,
    GripVertical,
    ShieldCheck,
    Lock,
} from 'lucide-react';
import {
    PieChart, Pie, Cell,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useSheetData } from '../../../services/useSheetData';

// GOOGLE SHEET PUBLISHED CSV URL
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTLUYX9T5uy5LWs3Wt_HoCj4nr0LhMAo3x5cyI4G2V4O7B1NJNAyIauCN-ZqbVlW3kCVKlnWlCU9F9/pub?gid=0&single=true&output=csv';

const GREEN = 'var(--mlab-green, #94c73d)';
const BLUE = 'var(--mlab-blue, #002b49)';
const RED = '#ef4444';
const CHART_COLORS = ['#94c73d', '#002b49', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

import './FunderDashboard.css';

export interface WidgetConfig {
    id: string;
    title: string;
    enabled: boolean;
    chartType: 'bar' | 'horizontal_bar' | 'pie' | 'donut';
    metricKey: string;
    compareKey?: string;
}

export interface FilterConfig {
    id: string;
    columnKey: string;
    label: string;
    enabled: boolean;
}

export interface KpiConfig {
    id: string;
    label: string;
    type: 'total' | 'percentage' | 'count';
    columnKey: string;
    targetValue?: string;
    color: string;
    enabled: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'widget_status', title: 'Programme Status', enabled: true, chartType: 'bar', metricKey: 'status', compareKey: 'none' },
    { id: 'widget_gender', title: 'Participant Demographics', enabled: true, chartType: 'donut', metricKey: 'gender', compareKey: 'none' },
    { id: 'widget_pathway', title: 'Pathway Distribution', enabled: true, chartType: 'horizontal_bar', metricKey: 'pathway', compareKey: 'none' },
    { id: 'widget_readiness', title: 'Work Readiness Status', enabled: true, chartType: 'pie', metricKey: 'readiness', compareKey: 'none' },
];

const DEFAULT_FILTERS: FilterConfig[] = [
    { id: 'filter_gender', columnKey: 'gender', label: 'Gender', enabled: true },
    { id: 'filter_pathway', columnKey: 'pathway', label: 'Pathway', enabled: true },
    { id: 'filter_readiness', columnKey: 'readiness', label: 'Work-Readiness', enabled: true },
];

const DEFAULT_KPIS: KpiConfig[] = [
    { id: 'kpi_total', label: 'Total Cohort', type: 'total', columnKey: '', color: '#38bdf8', enabled: true },
    { id: 'kpi_female', label: 'Female Representation', type: 'percentage', columnKey: 'gender', targetValue: 'F', color: '#ec4899', enabled: true },
    { id: 'kpi_readiness', label: 'Overall Work-Readiness', type: 'percentage', columnKey: 'readiness', targetValue: 'Placement Ready', color: '#94c73d', enabled: true },
    { id: 'kpi_male', label: 'Male Representation', type: 'percentage', columnKey: 'gender', targetValue: 'M', color: '#3b82f6', enabled: true },
];

const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
    person: true,
    pathway: true,
    status: true,
    readiness: true,
    finalScore: true,
};

const VERIFIED_STORAGE_KEY = 'fd-human-verified-v1';
// Versioning this key to v1.1 guarantees everyone will see it, even if they bypassed earlier versions
const DISCLAIMER_STORAGE_KEY = 'fd-disclaimer-agreed-v1.1';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const useCountUp = (target: number, duration = 900) => {
    const [value, setValue] = useState(0);
    const fromRef = useRef(0);

    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            setValue(target);
            fromRef.current = target;
            return;
        }
        const from = fromRef.current;
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const next = Math.round(from + (target - from) * eased);
            setValue(next);
            if (p < 1) raf = requestAnimationFrame(tick);
            else fromRef.current = target;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return value;
};

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: number; suffix?: string; color: string; delay: number }> = ({ icon, label, value, suffix = '', color, delay }) => {
    const shown = useCountUp(value);
    return (
        <div className="fd-kpi" style={{ ['--kpi' as any]: color, animationDelay: `${delay}s` }}>
            <div className="fd-kpi-head">
                <div className="fd-kpi-icon">{icon}</div>
                <span className="fd-kpi-label">{label}</span>
            </div>
            <div className="fd-kpi-value">{shown}{suffix}</div>
        </div>
    );
};

const FilterSelect: React.FC<{ value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }> = ({ value, onChange, children, label }) => (
    <div className="fd-select-wrap">
        <select
            aria-label={label}
            className={`fd-select ${value !== 'All' ? 'fd-select--active' : ''}`}
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            {children}
        </select>
        <ChevronDown size={14} />
    </div>
);

const tooltipStyle = {
    borderRadius: '12px',
    border: '1px solid #e4eaf0',
    boxShadow: '0 12px 28px -12px rgba(0,43,73,0.35)',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    fontSize: '12px'
};

const statusPill = (status: string) =>
    status === 'Passed' ? 'fd-pill--passed' : status === 'Dropped Out' ? 'fd-pill--dropped' : 'fd-pill--progress';

const scoreColor = (s: number) => (s >= 70 ? GREEN : s >= 40 ? '#f59e0b' : RED);

/* ------------------------------------------------------------------ */
/* Intro loader + welcome                                             */
/* ------------------------------------------------------------------ */
type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

const STATUS_MESSAGES = ['Syncing cohort data', 'Crunching the numbers', 'Building your dashboard'];

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const DOTS = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 37 + 7) % 100,
    s: 3 + (i % 4) * 2,
    d: 6 + (i % 5) * 1.6,
    delay: (i % 7) * 0.7
}));

const useIntro = (enabled: boolean, isLoading: boolean, minDuration: number, startTimer: boolean) => {
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const minMs = reduced ? 500 : minDuration;

    const [phase, setPhase] = useState<Phase>(() => (enabled ? 'loading' : 'done'));
    const [minElapsed, setMinElapsed] = useState(false);

    useEffect(() => {
        if (!startTimer) return;
        const t = setTimeout(() => setMinElapsed(true), minMs);
        return () => clearTimeout(t);
    }, [minMs, startTimer]);

    useEffect(() => {
        if (phase === 'loading' && minElapsed && !isLoading) setPhase('welcome');
    }, [phase, minElapsed, isLoading]);

    useEffect(() => {
        if (phase === 'welcome') {
            const t = setTimeout(() => setPhase('reveal'), reduced ? 600 : 1700);
            return () => clearTimeout(t);
        }
        if (phase === 'reveal') {
            const t = setTimeout(() => {
                setPhase('done');
            }, reduced ? 100 : 1100);
            return () => clearTimeout(t);
        }
    }, [phase, reduced]);

    const skip = () => setPhase(p => (p === 'loading' || p === 'welcome' ? 'reveal' : p));
    return { phase, skip, minMs };
};

const IntroLoader: React.FC<{
    phase: Phase;
    minMs: number;
    userName?: string;
    logoSrc?: string;
    learnerCount: number;
    onSkip: () => void;
}> = ({ phase, minMs, userName, logoSrc, learnerCount, onSkip }) => {
    const [started, setStarted] = useState(false);
    const [msgIndex, setMsgIndex] = useState(0);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setStarted(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    useEffect(() => {
        if (phase !== 'loading') return;
        const t = setInterval(() => setMsgIndex(i => (i + 1) % STATUS_MESSAGES.length), 850);
        return () => clearInterval(t);
    }, [phase]);

    const welcome = phase !== 'loading';
    const pct = welcome ? 100 : started ? 88 : 0;

    const background = (
        <>
            <div className="fd-ld-bg" />
            <span className="fd-ld-orb fd-ld-orb--a" />
            <span className="fd-ld-orb fd-ld-orb--b" />
            {DOTS.map((d, i) => (
                <span key={i} className="fd-ld-dot" style={{ ['--x' as any]: d.x, ['--s' as any]: `${d.s}px`, ['--d' as any]: `${d.d}s`, ['--delay' as any]: `${d.delay}s` }} />
            ))}
        </>
    );

    return (
        <div className={`fd-ld ${phase === 'reveal' ? 'fd-ld--reveal' : ''}`} role="status" aria-live="polite">
            <div className="fd-ld-panel fd-ld-panel--top">{background}</div>
            <div className="fd-ld-panel fd-ld-panel--bottom">{background}</div>

            <div className="fd-ld-center">
                <div className="fd-ld-mark">
                    <span className="fd-ld-orbit" />
                    <span className="fd-ld-orbit fd-ld-orbit--2" />
                    <svg className="fd-ld-ring-svg" viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
                        <circle className="fd-ld-ring-track" cx="50" cy="50" r="45" />
                        <circle className={`fd-ld-ring ${welcome ? 'fd-ld-ring--done' : ''}`} cx="50" cy="50" r="45" />
                    </svg>
                    <div className="fd-ld-core">
                        {logoSrc && !welcome ? (
                            <div className="fd-ld-logo"><img src={logoSrc} alt="mLab Logo" /></div>
                        ) : !welcome ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <img src={mLabLogo} alt="mLab Logo" height={24} />
                                <div className="fd-ld-bars" aria-hidden="true" style={{ scale: '0.6' }}>
                                    <span /><span /><span /><span /><span />
                                </div>
                            </div>
                        ) : null}

                        {welcome && (
                            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
                                <path className="fd-ld-check" d="M14 29 L24 39 L43 18" />
                            </svg>
                        )}
                    </div>
                </div>

                {!welcome ? (
                    <div className="fd-ld-text" key="loading">
                        <div className="fd-ld-eyebrow">Cohort analytics</div>
                        <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
                        <div className="fd-ld-progress">
                            <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
                        </div>
                    </div>
                ) : (
                    <div className="fd-ld-text" key="welcome">
                        <div className="fd-ld-eyebrow">{greeting()}</div>
                        <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
                        <p className="fd-ld-sub">Your insights are ready &middot; {learnerCount} learners synced</p>
                        <div className="fd-ld-progress">
                            <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Interactive Human Verification Gate                                */
/* ------------------------------------------------------------------ */
const HumanVerificationGate: React.FC<{ onVerify: () => void }> = ({ onVerify }) => {
    const [sliderPos, setSliderPos] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
        if (!isDragging || !trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const max = rect.width - 42;
        const offsetX = Math.max(0, Math.min(clientX - rect.left - 21, max));
        const pct = (offsetX / max) * 100;
        setSliderPos(pct);

        if (pct >= 95) {
            setIsDragging(false);
            setSliderPos(100);
            setTimeout(() => {
                onVerify();
            }, 250);
        }
    };

    return (
        <div className="fd-bot-overlay">
            <div className="fd-bot-card">
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
                    <ShieldCheck size={28} />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>
                    Human Verification Required
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
                    To protect cohort analytics, please slide to confirm you are human.
                </p>

                <div
                    ref={trackRef}
                    className="fd-bot-slider-track"
                    onMouseMove={(e) => handleMove(e.clientX)}
                    onTouchMove={(e) => handleMove(e.touches[0].clientX)}
                    onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
                    onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
                >
                    <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
                    <span className="fd-bot-slider-text">
                        {sliderPos >= 95 ? 'Verified!' : 'Slide to Access Dashboard ➔'}
                    </span>
                    <div
                        className="fd-bot-slider-thumb"
                        style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
                        onMouseDown={() => setIsDragging(true)}
                        onTouchStart={() => setIsDragging(true)}
                    >
                        <Lock size={16} />
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* POPIA Disclaimer Modal (Strict Active Consent)                     */
/* ------------------------------------------------------------------ */
const DisclaimerGate: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
    const [isChecked, setIsChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAcknowledge = async () => {
        if (!isChecked) return;
        setIsSubmitting(true);

        // This is where your Firestore/Backend call will go.
        // E.g., await logAgreementToFirestore(deviceId, ip, userAgent...);

        // Simulating a brief network request for UX feedback
        setTimeout(() => {
            onAgree();
        }, 600);
    };

    return (
        <div className="fd-bot-overlay" style={{
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)'
        }}>
            <div className="fd-disclaimer-card" style={{
                width: 'min(100%, 640px)',
                padding: 0,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#fff',
                borderRadius: '20px',
                boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)'
            }}>

                {/* FIXED HEADER */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.5rem 2rem', borderBottom: '1px solid var(--fd-line)', flexShrink: 0, background: '#fff' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--mlab-blue) 12%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', flexShrink: 0 }}>
                        <ShieldCheck size={22} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>POPIA Data Privacy &amp; Protection</h3>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Mandatory Compliance Notice</div>
                    </div>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="fd-scroll" style={{ padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#fff' }}>
                    <p style={{ margin: '0 0 1.2rem 0', fontWeight: 600, color: 'var(--fd-ink)' }}>
                        This dashboard contains personal and potentially sensitive information relating to learners and programme participants. The information is provided to authorised stakeholders strictly for legitimate programme reporting, monitoring, evaluation, verification and related organisational purposes.
                    </p>
                    <p style={{ margin: '0 0 1.2rem 0' }}>
                        In accordance with the <strong>Protection of Personal Information Act 4 of 2013 (POPIA)</strong>, access to and use of this information is restricted to authorised persons and must be limited to the purpose for which it has been provided.
                    </p>

                    <strong style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--fd-blue)' }}>By accessing this dashboard, you agree to:</strong>
                    <ul style={{ margin: '0 0 1.2rem 0', paddingLeft: '1.4rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <li>Keep all personal information confidential and secure.</li>
                        <li>Use the information only for the authorised purpose for which access has been granted.</li>
                        <li>Not copy, download, reproduce, publish, disclose, distribute or share the information with any unauthorised person or third party.</li>
                        <li>Take reasonable measures to prevent unauthorised access, loss, disclosure, alteration or misuse of the information.</li>
                        <li>Not use the information for any secondary or unrelated purpose without appropriate authorisation and lawful basis.</li>
                        <li>Immediately notify the designated responsible party of any suspected or actual security compromise, unauthorised access or disclosure.</li>
                        <li>Ensure that any person granted access to the information is appropriately authorised and subject to equivalent confidentiality and data-protection requirements.</li>
                        <li>Cease use of the information and securely delete or return any copies when access or the authorised purpose comes to an end, where applicable.</li>
                    </ul>

                    <p style={{ margin: '0 0 0.85rem 0' }}>
                        Where an external stakeholder processes personal information on behalf of the responsible party, such processing must be undertaken only with the knowledge and authorisation of the responsible party and in accordance with applicable POPIA requirements and any relevant data-processing or confidentiality agreement.
                    </p>
                    <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
                        Unauthorised access, use, disclosure or distribution of this information is strictly prohibited.
                    </p>
                </div>

                {/* FIXED FOOTER WITH ACTIVE CONSENT */}
                <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--fd-line)', background: '#f8fafc', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ paddingTop: '2px' }}>
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => setIsChecked(e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--mlab-green)' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fd-blue)', lineHeight: 1.4 }}>
                            I have read and acknowledge the above notice and agree to handle the information in accordance with the stated requirements.
                        </span>
                    </label>

                    <button
                        className={`fd-btn ${isChecked ? 'fd-btn--primary' : ''}`}
                        disabled={!isChecked || isSubmitting}
                        onClick={handleAcknowledge}
                        style={{
                            padding: '0.85rem 1.5rem',
                            fontSize: '0.9rem',
                            width: '100%',
                            background: !isChecked ? '#e2e8f0' : undefined,
                            color: !isChecked ? '#94a3b8' : undefined,
                            cursor: !isChecked ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                        {isSubmitting ? 'Recording Acknowledgement...' : 'Acknowledge & Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */
interface FunderDashboardViewProps {
    fullScreen?: boolean;
    userName?: string;
    logoSrc?: string;
    isLoading?: boolean;
    showIntro?: boolean;
    introMinDuration?: number;
}

export const FunderDashboardView: React.FC<FunderDashboardViewProps> = ({
    fullScreen = true,
    userName,
    logoSrc,
    isLoading = false,
    showIntro = true,
    introMinDuration = 2600
}) => {
    // REACT ROUTER URL SEARCH PARAMS PERSISTENCE
    const [searchParams, setSearchParams] = useSearchParams();

    // Human Verification Check State
    const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => {
        try { return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true'; } catch { return false; }
    });

    // POPIA Disclaimer Check State
    const [isDisclaimerAgreed, setIsDisclaimerAgreed] = useState<boolean>(() => {
        try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { return false; }
    });

    const handleHumanVerified = () => {
        setIsHumanVerified(true);
        try { sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true'); } catch { /* ignore */ }
    };

    const handleDisclaimerAgreed = async () => {
        setIsDisclaimerAgreed(true);
        try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch { /* ignore */ }

        let deviceId = localStorage.getItem('fd-device-id');
        if (!deviceId) {
            deviceId = typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            localStorage.setItem('fd-device-id', deviceId);
        }

        try {
            const auditPayload = {
                deviceId: deviceId,
                action: 'POPIA_AGREEMENT_ACCEPTED',
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            };

            await fetch('https://your-database-api-or-webhook.com/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(auditPayload),
                keepalive: true
            });
        } catch (err) {
            console.error("Failed to log audit trail, but user is permitted to proceed.", err);
        }
    };

    // Live Google Sheets Data Hook
    const { data: rawSheetData, loading: sheetLoading, error, refetch } = useSheetData(GOOGLE_SHEET_CSV_URL);

    // Intro Loader State Sync. Wait for verification and data to finish loading.
    const isDataLoading = isLoading || sheetLoading;
    const { phase, skip, minMs } = useIntro(showIntro, isDataLoading, introMinDuration, isHumanVerified);

    // The final dashboard is revealed ONLY if the loader is done AND the disclaimer is agreed.
    const introDone = phase === 'reveal' || phase === 'done';
    const revealed = introDone && isDisclaimerAgreed;

    // State derived directly from URL Query Params
    const activeTab = (searchParams.get('tab') as 'dashboard' | 'roster') || 'dashboard';
    const searchTerm = searchParams.get('search') || '';
    const currentPage = parseInt(searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(searchParams.get('pageSize') || '15', 10) || 15;
    const chartsParam = searchParams.get('charts') || '';
    const filtersParam = searchParams.get('filters') || '';
    const kpisParam = searchParams.get('kpis') || '';
    const orderParam = searchParams.get('order') || '';

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Dynamic Columns State
    const [showColumnDropdown, setShowColumnDropdown] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(DEFAULT_COLUMN_VISIBILITY);

    // Layout Customizer Modal & Config States
    const [showCustomizeModal, setShowCustomizeModal] = useState(false);

    // Parse widgetsConfig from URL or localStorage/default
    const [widgetsConfig, setWidgetsConfig] = useState<WidgetConfig[]>(() => {
        if (chartsParam) {
            try { return JSON.parse(decodeURIComponent(chartsParam)); } catch (err) { /* ignore */ }
        }
        const saved = localStorage.getItem('funder_dashboard_config_v2');
        return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    });

    // Parse filtersConfig from URL or localStorage/default
    const [filtersConfig, setFiltersConfig] = useState<FilterConfig[]>(() => {
        if (filtersParam) {
            try { return JSON.parse(decodeURIComponent(filtersParam)); } catch (err) { /* ignore */ }
        }
        const saved = localStorage.getItem('funder_dashboard_filters_v1');
        return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
    });

    // Parse kpisConfig from URL or localStorage/default
    const [kpisConfig, setKpisConfig] = useState<KpiConfig[]>(() => {
        if (kpisParam) {
            try { return JSON.parse(decodeURIComponent(kpisParam)); } catch (err) { /* ignore */ }
        }
        const saved = localStorage.getItem('funder_dashboard_kpis_v1');
        return saved ? JSON.parse(saved) : DEFAULT_KPIS;
    });

    // Individual Edit Popover State
    const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

    // Drag and Drop States
    const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
    const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

    // Sync Widget Order from URL Query Param if present
    const orderedWidgets = useMemo(() => {
        if (!orderParam) return widgetsConfig;
        const orderIds = orderParam.split(',').filter(Boolean);
        const map = new Map(widgetsConfig.map(w => [w.id, w]));
        const sorted: WidgetConfig[] = [];

        orderIds.forEach(id => {
            if (map.has(id)) {
                sorted.push(map.get(id)!);
                map.delete(id);
            }
        });

        // Append any remaining widgets not explicitly in URL
        map.forEach(w => sorted.push(w));
        return sorted;
    }, [widgetsConfig, orderParam]);

    // Helper to cleanly update query parameters in URL bar
    const updateQuery = (updates: Record<string, string | number | null | undefined>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, val]) => {
                if (
                    val === null ||
                    val === undefined ||
                    val === '' ||
                    val === 'All' ||
                    (key === 'tab' && val === 'dashboard') ||
                    (key === 'page' && val === 1) ||
                    (key === 'pageSize' && val === 15)
                ) {
                    next.delete(key);
                } else {
                    next.set(key, String(val));
                }
            });
            return next;
        }, { replace: true });
    };

    const setActiveTab = (tab: 'dashboard' | 'roster') => updateQuery({ tab });
    const setSearchTerm = (v: string) => updateQuery({ search: v, page: 1 });
    const setCurrentPage = (updater: number | ((p: number) => number)) => {
        const nextPg = typeof updater === 'function' ? updater(currentPage) : updater;
        updateQuery({ page: nextPg });
    };
    const setPageSize = (size: number) => updateQuery({ pageSize: size, page: 1 });

    // Save configs to LocalStorage & URL
    useEffect(() => {
        localStorage.setItem('funder_dashboard_config_v2', JSON.stringify(widgetsConfig));
        localStorage.setItem('funder_dashboard_filters_v1', JSON.stringify(filtersConfig));
        localStorage.setItem('funder_dashboard_kpis_v1', JSON.stringify(kpisConfig));

        updateQuery({
            charts: encodeURIComponent(JSON.stringify(widgetsConfig)),
            filters: encodeURIComponent(JSON.stringify(filtersConfig)),
            kpis: encodeURIComponent(JSON.stringify(kpisConfig))
        });
    }, [widgetsConfig, filtersConfig, kpisConfig]);

    // Detect ALL columns found in Google Sheets data
    const allSheetColumns = useMemo(() => {
        if (rawSheetData.length === 0) return ['gender', 'pathway', 'status', 'readiness'];
        const firstRow = rawSheetData[0];
        const keys = Object.keys(firstRow).filter(k => k !== 'id' && k !== 'firstName' && k !== 'lastName' && k !== 'email');
        return Array.from(new Set(['gender', 'pathway', 'readiness', 'status', ...keys]));
    }, [rawSheetData]);

    // Helper to get unique string values for any column key
    const getUniqueColumnValues = (colKey: string): string[] => {
        if (!colKey || rawSheetData.length === 0) return [];
        const set = new Set<string>();
        rawSheetData.forEach(item => {
            let val = item[colKey];
            if ((colKey === 'readiness' || colKey === 'Overall Readiness') && (!val || val === 'N/A')) {
                val = item['readiness'] || item['Overall Readiness'];
            }
            if (val !== undefined && val !== null && val !== '') {
                let strVal = String(val).trim();
                if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
                else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
                else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';
                set.add(strVal);
            }
        });
        return Array.from(set).sort();
    };

    // Extract dynamic headers from sheet data for extra table columns
    const dynamicSheetHeaders = useMemo(() => {
        if (rawSheetData.length === 0) return [];
        return Object.keys(rawSheetData[0]).filter(k =>
            !['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'].includes(k)
        );
    }, [rawSheetData]);

    // Toggle row expansion
    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedRows(newSet);
    };

    // Dynamic Multi-Filter Logic
    const filteredData = useMemo(() => {
        return rawSheetData.filter(learner => {
            return filtersConfig.filter(f => f.enabled).every(f => {
                const paramVal = searchParams.get(`f_${f.columnKey}`) || 'All';
                if (paramVal === 'All') return true;

                let learnerVal = learner[f.columnKey];
                if (f.columnKey === 'readiness' && (!learnerVal || learnerVal === 'N/A')) {
                    learnerVal = learner['Overall Readiness'] || learner['readiness'];
                }

                let strVal = (learnerVal === null || learnerVal === undefined || learnerVal === '') ? 'N/A' : String(learnerVal).trim();
                if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
                else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
                else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

                return strVal === paramVal;
            });
        });
    }, [rawSheetData, filtersConfig, searchParams]);

    // Roster search box
    const rosterData = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return filteredData;
        return filteredData.filter(l =>
            `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
        );
    }, [filteredData, searchTerm]);

    // Paginated Roster Data
    const paginatedRoster = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return rosterData.slice(start, start + pageSize);
    }, [rosterData, currentPage, pageSize]);

    const totalPages = Math.ceil(rosterData.length / pageSize) || 1;

    const activeFilterParamsCount = filtersConfig.filter(f => f.enabled && (searchParams.get(`f_${f.columnKey}`) || 'All') !== 'All').length;
    const filtersActive = activeFilterParamsCount > 0 || searchTerm !== '';

    const resetFilters = () => {
        const updates: Record<string, string> = { search: '', page: '1' };
        filtersConfig.forEach(f => {
            updates[`f_${f.columnKey}`] = 'All';
        });
        updateQuery(updates);
    };

    // CSV Export
    const handleExport = () => {
        const activeCols = Object.keys(columnVisibility).filter(k => columnVisibility[k]);
        const header = activeCols.map(c => c.toUpperCase());

        const rows = filteredData.map(l => {
            return activeCols.map(col => {
                if (col === 'person') return `${l.firstName} ${l.lastName}`;
                if (col === 'pathway') return l.pathway;
                if (col === 'status') return l.status;
                if (col === 'readiness') return l.readiness;
                if (col === 'finalScore') return l.finalScore;
                return l[col] || '';
            });
        });

        const csv = [header, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cohort-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Calculate Custom KPI Values
    const getKpiCalculatedValue = (kpi: KpiConfig): { num: number; suffix: string } => {
        const total = filteredData.length;
        if (total === 0) return { num: 0, suffix: kpi.type === 'percentage' ? '%' : '' };

        if (kpi.type === 'total') {
            return { num: total, suffix: '' };
        }

        const matchCount = filteredData.filter(d => {
            let val = d[kpi.columnKey];
            if (kpi.columnKey === 'readiness' && (!val || val === 'N/A')) {
                val = d['Overall Readiness'] || d['readiness'];
            }
            let strVal = String(val || '').trim();
            if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
            else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
            else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

            return strVal === kpi.targetValue;
        }).length;

        if (kpi.type === 'count') {
            return { num: matchCount, suffix: '' };
        }

        const pct = Math.round((matchCount / total) * 100);
        return { num: pct, suffix: '%' };
    };

    // Fully Dynamic Metric & Comparison Aggregator for ANY column
    const getChartDataForMetric = (metricKey: string, compareKey?: string) => {
        if (!metricKey || filteredData.length === 0) return { data: [], compareCategories: [] };

        if (compareKey && compareKey !== 'none' && compareKey !== metricKey) {
            const map: Record<string, Record<string, number>> = {};
            const categoriesSet = new Set<string>();

            filteredData.forEach(item => {
                const primaryVal = String(item[metricKey] || 'N/A').trim() || 'N/A';
                const compareVal = String(item[compareKey] || 'N/A').trim() || 'N/A';

                categoriesSet.add(compareVal);
                if (!map[primaryVal]) map[primaryVal] = {};
                map[primaryVal][compareVal] = (map[primaryVal][compareVal] || 0) + 1;
            });

            const compareCategories = Array.from(categoriesSet);
            const data = Object.entries(map).map(([primaryVal, subCounts]) => {
                const row: Record<string, any> = { name: primaryVal };
                compareCategories.forEach(cat => {
                    row[cat] = subCounts[cat] || 0;
                });
                return row;
            });

            return { data, compareCategories };
        }

        const counts: Record<string, number> = {};
        filteredData.forEach(item => {
            const rawVal = item[metricKey];
            const val = (rawVal === null || rawVal === undefined || rawVal === '') ? 'N/A' : String(rawVal).trim();
            counts[val] = (counts[val] || 0) + 1;
        });

        const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
        return { data, compareCategories: [] };
    };

    // Drag & Drop Handlers
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedWidgetId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverWidgetId !== targetId) setDragOverWidgetId(targetId);
    };

    const handleDragLeave = (e: React.DragEvent, targetId: string) => {
        if (dragOverWidgetId === targetId) setDragOverWidgetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        setDragOverWidgetId(null);

        if (!draggedWidgetId || draggedWidgetId === targetId) {
            setDraggedWidgetId(null);
            return;
        }

        const currentList = [...orderedWidgets];
        const dragIndex = currentList.findIndex(w => w.id === draggedWidgetId);
        const dropIndex = currentList.findIndex(w => w.id === targetId);

        if (dragIndex < 0 || dropIndex < 0) {
            setDraggedWidgetId(null);
            return;
        }

        const itemToMove = currentList[dragIndex];
        currentList.splice(dragIndex, 1);
        currentList.splice(dropIndex, 0, itemToMove);

        setWidgetsConfig(currentList);
        setDraggedWidgetId(null);

        const newOrderString = currentList.map(w => w.id).join(',');
        updateQuery({ order: newOrderString });
    };

    const toggleColumnVisibility = (colKey: string) => {
        setColumnVisibility(prev => ({ ...prev, [colKey]: !prev[colKey] }));
    };

    const updateWidgetType = (widgetId: string, chartType: WidgetConfig['chartType']) => {
        setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, chartType } : w));
    };

    const updateWidgetMetric = (widgetId: string, metricKey: string) => {
        setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, metricKey } : w));
    };

    const updateWidgetCompareKey = (widgetId: string, compareKey: string) => {
        setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, compareKey } : w));
    };

    const updateWidgetTitle = (widgetId: string, title: string) => {
        setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, title } : w));
    };

    const toggleWidgetEnabled = (widgetId: string) => {
        setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, enabled: !w.enabled } : w));
    };

    const addCustomWidget = () => {
        const newWidget: WidgetConfig = {
            id: `widget_custom_${Date.now()}`,
            title: `Custom Analysis ${widgetsConfig.length + 1}`,
            enabled: true,
            chartType: 'bar',
            metricKey: allSheetColumns[0] || 'gender',
            compareKey: 'none'
        };
        const newList = [...widgetsConfig, newWidget];
        setWidgetsConfig(newList);
        updateQuery({ order: newList.map(w => w.id).join(',') });
    };

    const deleteWidget = (widgetId: string) => {
        const newList = widgetsConfig.filter(w => w.id !== widgetId);
        setWidgetsConfig(newList);
        updateQuery({ order: newList.map(w => w.id).join(',') });
    };

    // Filter Builder Functions
    const addFilter = () => {
        const col = allSheetColumns[0] || 'gender';
        const newFilter: FilterConfig = {
            id: `filter_${Date.now()}`,
            columnKey: col,
            label: col.charAt(0).toUpperCase() + col.slice(1),
            enabled: true
        };
        setFiltersConfig(prev => [...prev, newFilter]);
    };

    const updateFilterColumn = (filterId: string, colKey: string) => {
        setFiltersConfig(prev => prev.map(f => f.id === filterId ? {
            ...f,
            columnKey: colKey,
            label: colKey.charAt(0).toUpperCase() + colKey.slice(1)
        } : f));
    };

    const toggleFilterEnabled = (filterId: string) => {
        setFiltersConfig(prev => prev.map(f => f.id === filterId ? { ...f, enabled: !f.enabled } : f));
    };

    const deleteFilter = (filterId: string) => {
        setFiltersConfig(prev => prev.filter(f => f.id !== filterId));
    };

    // KPI Builder Functions
    const addKpi = () => {
        const newKpi: KpiConfig = {
            id: `kpi_custom_${Date.now()}`,
            label: `Custom Metric ${kpisConfig.length + 1}`,
            type: 'count',
            columnKey: allSheetColumns[0] || 'gender',
            targetValue: 'F',
            color: CHART_COLORS[kpisConfig.length % CHART_COLORS.length],
            enabled: true
        };
        setKpisConfig(prev => [...prev, newKpi]);
    };

    const updateKpi = (kpiId: string, updates: Partial<KpiConfig>) => {
        setKpisConfig(prev => prev.map(k => k.id === kpiId ? { ...k, ...updates } : k));
    };

    const deleteKpi = (kpiId: string) => {
        setKpisConfig(prev => prev.filter(k => k.id !== kpiId));
    };

    const hiddenDetailKeys = ['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'];

    return (
        <div className={`fd-root ${fullScreen ? 'fd-root--fixed' : ''}`}>
            {/* HUMAN BOT VERIFICATION CHECK */}
            {!isHumanVerified && (
                <HumanVerificationGate onVerify={handleHumanVerified} />
            )}

            {/* INTRO LOADER OVERLAY - Only starts sequence when user is verified */}
            {isHumanVerified && !introDone && (
                <IntroLoader
                    phase={phase}
                    minMs={minMs}
                    userName={userName}
                    logoSrc={logoSrc}
                    learnerCount={rawSheetData.length}
                    onSkip={skip}
                />
            )}

            {/* POPIA LEGAL DISCLAIMER MODAL */}
            {isHumanVerified && introDone && !isDisclaimerAgreed && (
                <DisclaimerGate onAgree={handleDisclaimerAgreed} />
            )}

            {revealed && (<>

                {/* HERO HEADER */}
                <div className="fd-hero">
                    <div>
                        <div className="fd-hero-brand">
                            {logoSrc ? <img src={logoSrc} alt="mLab Logo" height={28} /> : <img src={mLabLogo} alt="mLab Logo" height={28} />}
                            <span className="fd-hero-divider" />
                            <div className="fd-eyebrow">
                                <span className="fd-live-dot" />
                                {sheetLoading ? 'Syncing spreadsheet...' : 'Live cohort data'}
                            </div>
                        </div>
                        <h1 className="fd-title">Cohort Analytics &amp; Reporting</h1>
                        <p className="fd-subtitle">Real-time insights synced from centralized GIZ spreadsheets.</p>
                    </div>
                    <div className="fd-hero-actions">
                        <button className="fd-btn fd-btn--glass" onClick={handleExport} title="Export filtered records and visible columns to CSV">
                            <Download size={14} /> Export report (CSV)
                        </button>
                        <button className="fd-btn fd-btn--glass" onClick={refetch} disabled={sheetLoading} title="Pull latest data from Google Sheets">
                            <RotateCcw size={14} className={sheetLoading ? 'animate-spin' : ''} /> Refetch
                        </button>
                        <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(true)} title="Customize layout, cards, and chart types">
                            <Settings2 size={14} /> Customize layout
                        </button>
                    </div>
                </div>

                {/* CONTROLS BAR (fixed): tabs + dynamic filters */}
                <div className="fd-controls">

                    {/* TAB NAVIGATION */}
                    <div className="fd-tabs" data-active={activeTab} role="tablist">
                        <span className="fd-tab-thumb" />
                        <button
                            role="tab"
                            aria-selected={activeTab === 'dashboard'}
                            className={`fd-tab ${activeTab === 'dashboard' ? 'fd-tab--active' : ''}`}
                            onClick={() => setActiveTab('dashboard')}
                        >
                            <LayoutDashboard size={16} /> Analytics dashboard
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'roster'}
                            className={`fd-tab ${activeTab === 'roster' ? 'fd-tab--active' : ''}`}
                            onClick={() => setActiveTab('roster')}
                        >
                            <TableIcon size={16} /> Learner roster
                        </button>
                    </div>

                    {/* DYNAMIC FILTERS BAR */}
                    <div className="fd-filters">
                        <div className="fd-filter-label"><Filter size={15} /> Filters</div>

                        {filtersConfig.filter(f => f.enabled).map(f => {
                            const val = searchParams.get(`f_${f.columnKey}`) || 'All';
                            const options = getUniqueColumnValues(f.columnKey);

                            return (
                                <FilterSelect
                                    key={f.id}
                                    label={`Filter by ${f.label}`}
                                    value={val}
                                    onChange={v => updateQuery({ [`f_${f.columnKey}`]: v, page: 1 })}
                                >
                                    <option value="All">All {f.label.toLowerCase()}s</option>
                                    {options.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </FilterSelect>
                            );
                        })}

                        {filtersActive && (
                            <div className="fd-chip">
                                Showing {filteredData.length} of {rawSheetData.length} records
                                <button onClick={resetFilters}><RotateCcw size={11} /> Reset</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* MAIN REGION */}
                <div className="fd-main fd-scroll">

                    {sheetLoading && (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--mlab-blue)' }} />
                            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Fetching live data from Google Sheets...</div>
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c', fontSize: '0.85rem' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {!sheetLoading && (
                        <>
                            {/* TAB CONTENT: DASHBOARD */}
                            {activeTab === 'dashboard' && (
                                <div className={`fd-dash ${draggedWidgetId ? 'fd-dash--dragging' : ''}`}>

                                    {/* DYNAMIC KPI CARDS */}
                                    <div className="fd-kpis">
                                        {kpisConfig.filter(k => k.enabled).map((kpi, idx) => {
                                            const { num, suffix } = getKpiCalculatedValue(kpi);
                                            const icon = kpi.columnKey === 'gender' ? (kpi.targetValue === 'M' ? <Mars size={18} /> : <Venus size={18} />) :
                                                kpi.columnKey === 'readiness' ? <Briefcase size={18} /> : <Users size={18} />;

                                            return (
                                                <KpiCard
                                                    key={kpi.id}
                                                    icon={icon}
                                                    label={kpi.label}
                                                    value={num}
                                                    suffix={suffix}
                                                    color={kpi.color}
                                                    delay={0.05 + idx * 0.05}
                                                />
                                            );
                                        })}
                                    </div>

                                    {/* DRAGGABLE CHARTS GRID */}
                                    <div className="fd-charts-scroll fd-scroll">
                                        <div className="fd-charts">
                                            {orderedWidgets.filter(w => w.enabled).map((widget, index) => {
                                                const { data: chartData, compareCategories } = getChartDataForMetric(widget.metricKey, widget.compareKey);
                                                const isEditingThis = editingWidgetId === widget.id;
                                                const isDraggingThis = draggedWidgetId === widget.id;
                                                const isDragOverThis = dragOverWidgetId === widget.id;
                                                const hasComparison = compareCategories.length > 0;

                                                return (
                                                    <div
                                                        key={widget.id}
                                                        className={`fd-card ${isDraggingThis ? 'fd-card--dragging' : ''} ${isDragOverThis ? 'fd-card--drag-over' : ''}`}
                                                        style={{ animationDelay: `${0.3 + index * 0.06}s` }}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, widget.id)}
                                                        onDragOver={(e) => handleDragOver(e, widget.id)}
                                                        onDragLeave={(e) => handleDragLeave(e, widget.id)}
                                                        onDrop={(e) => handleDrop(e, widget.id)}
                                                    >
                                                        <div className="fd-card-head">
                                                            <div className="fd-card-title-wrap">
                                                                <span className="fd-drag-handle" title="Click & Drag to reorder card">
                                                                    <GripVertical size={16} />
                                                                </span>
                                                                <h3 className="fd-card-title">
                                                                    {widget.title}
                                                                    {hasComparison && (
                                                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                                            (vs. {widget.compareKey})
                                                                        </span>
                                                                    )}
                                                                </h3>
                                                            </div>

                                                            <div style={{ position: 'relative' }}>
                                                                <button
                                                                    className="fd-btn fd-btn--ghost fd-btn--sm"
                                                                    onClick={() => setEditingWidgetId(isEditingThis ? null : widget.id)}
                                                                >
                                                                    Edit <ChevronDown size={12} />
                                                                </button>

                                                                {/* INLINE EDIT POPOVER */}
                                                                {isEditingThis && (
                                                                    <div className="fd-popover">
                                                                        <div className="fd-popover-title">Chart Type</div>
                                                                        <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'bar')}>
                                                                            <span>Vertical Bar</span> {widget.chartType === 'bar' && <Check size={14} color={GREEN} />}
                                                                        </div>
                                                                        <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'horizontal_bar')}>
                                                                            <span>Horizontal Bar</span> {widget.chartType === 'horizontal_bar' && <Check size={14} color={GREEN} />}
                                                                        </div>
                                                                        <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'pie')}>
                                                                            <span>Pie Chart</span> {widget.chartType === 'pie' && <Check size={14} color={GREEN} />}
                                                                        </div>
                                                                        <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'donut')}>
                                                                            <span>Donut Chart</span> {widget.chartType === 'donut' && <Check size={14} color={GREEN} />}
                                                                        </div>

                                                                        <div className="fd-popover-title" style={{ marginTop: '8px' }}>Column to Analyze</div>
                                                                        {allSheetColumns.map(col => (
                                                                            <div key={col} className="fd-popover-item" onClick={() => updateWidgetMetric(widget.id, col)}>
                                                                                <span>{col}</span> {widget.metricKey === col && <Check size={14} color={GREEN} />}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="fd-chart">
                                                            <div className="fd-chart-inner">
                                                                <ResponsiveContainer width="100%" height="100%">
                                                                    {widget.chartType === 'bar' ? (
                                                                        <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4eaf0" />
                                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
                                                                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
                                                                            <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
                                                                            {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

                                                                            {hasComparison ? (
                                                                                compareCategories.map((cat, catIdx) => (
                                                                                    <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[6, 6, 0, 0]} />
                                                                                ))
                                                                            ) : (
                                                                                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={900}>
                                                                                    {chartData.map((_, i) => (
                                                                                        <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                                                    ))}
                                                                                </Bar>
                                                                            )}
                                                                        </BarChart>
                                                                    ) : widget.chartType === 'horizontal_bar' ? (
                                                                        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4eaf0" />
                                                                            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
                                                                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#0b1f33', fontWeight: 600 }} />
                                                                            <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
                                                                            {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

                                                                            {hasComparison ? (
                                                                                compareCategories.map((cat, catIdx) => (
                                                                                    <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[0, 6, 6, 0]} barSize={20} />
                                                                                ))
                                                                            ) : (
                                                                                <Bar dataKey="value" fill={BLUE} radius={[0, 8, 8, 0]} barSize={28} animationDuration={900} />
                                                                            )}
                                                                        </BarChart>
                                                                    ) : (
                                                                        <PieChart>
                                                                            <Pie
                                                                                data={chartData}
                                                                                cx="50%"
                                                                                cy="46%"
                                                                                innerRadius={widget.chartType === 'donut' ? 62 : 0}
                                                                                outerRadius={92}
                                                                                paddingAngle={widget.chartType === 'donut' ? 3 : 0}
                                                                                cornerRadius={widget.chartType === 'donut' ? 6 : 0}
                                                                                dataKey="value"
                                                                                stroke="#fff"
                                                                                strokeWidth={2}
                                                                                animationDuration={900}
                                                                            >
                                                                                {chartData.map((_, i) => (
                                                                                    <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                                                ))}
                                                                            </Pie>
                                                                            <RechartsTooltip contentStyle={tooltipStyle} />
                                                                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                                                        </PieChart>
                                                                    )}
                                                                </ResponsiveContainer>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB CONTENT: ROSTER TABLE */}
                            {activeTab === 'roster' && (
                                <div className="fd-table-card">

                                    <div className="fd-toolbar">
                                        <div className="fd-search-wrap">
                                            <Search size={15} />
                                            <input
                                                className="fd-search"
                                                type="text"
                                                placeholder="Search learners by name or email..."
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                aria-label="Search learners"
                                            />
                                        </div>

                                        {/* COLUMNS DROPDOWN TOGGLE */}
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                className="fd-btn fd-btn--ghost"
                                                onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                                            >
                                                Columns <ChevronDown size={14} />
                                            </button>

                                            {showColumnDropdown && (
                                                <div className="fd-popover" style={{ minWidth: '240px' }}>
                                                    <div className="fd-popover-title">Toggle Table Columns</div>
                                                    <div className="fd-popover-item" onClick={() => toggleColumnVisibility('person')}>
                                                        <span>Learner Name / Email</span>
                                                        {columnVisibility.person ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                    </div>
                                                    <div className="fd-popover-item" onClick={() => toggleColumnVisibility('pathway')}>
                                                        <span>Pathway</span>
                                                        {columnVisibility.pathway ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                    </div>
                                                    <div className="fd-popover-item" onClick={() => toggleColumnVisibility('status')}>
                                                        <span>Status</span>
                                                        {columnVisibility.status ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                    </div>
                                                    <div className="fd-popover-item" onClick={() => toggleColumnVisibility('readiness')}>
                                                        <span>Readiness</span>
                                                        {columnVisibility.readiness ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                    </div>
                                                    <div className="fd-popover-item" onClick={() => toggleColumnVisibility('finalScore')}>
                                                        <span>Final Score</span>
                                                        {columnVisibility.finalScore ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                    </div>

                                                    {/* Dynamic Headers from Google Sheet */}
                                                    {dynamicSheetHeaders.length > 0 && (
                                                        <>
                                                            <div className="fd-popover-title" style={{ marginTop: '8px' }}>Google Sheet Extra Columns</div>
                                                            {dynamicSheetHeaders.map(colKey => (
                                                                <div key={colKey} className="fd-popover-item" onClick={() => toggleColumnVisibility(colKey)}>
                                                                    <span>{colKey}</span>
                                                                    {columnVisibility[colKey] ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="fd-table-scroll fd-scroll">
                                        <table className="fd-table">
                                            <thead>
                                                <tr>
                                                    {columnVisibility.person && <th>Learner</th>}
                                                    {columnVisibility.pathway && <th>Pathway</th>}
                                                    {columnVisibility.status && <th>Status</th>}
                                                    {columnVisibility.readiness && <th>Readiness</th>}
                                                    {columnVisibility.finalScore && <th style={{ textAlign: 'right' }}>Final score</th>}

                                                    {/* Dynamic headers toggled ON */}
                                                    {dynamicSheetHeaders.map(colKey => (
                                                        columnVisibility[colKey] && <th key={colKey}>{colKey}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedRoster.map((learner, i) => {
                                                    const isExpanded = expandedRows.has(learner.id);
                                                    const visibleColsCount = Object.keys(columnVisibility).filter(k => columnVisibility[k]).length;

                                                    return (
                                                        <React.Fragment key={learner.id}>
                                                            <tr
                                                                onClick={() => toggleRow(learner.id)}
                                                                className={isExpanded ? 'fd-row--expanded' : ''}
                                                                style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                                                            >
                                                                {columnVisibility.person && (
                                                                    <td>
                                                                        <div className="fd-person">
                                                                            <ChevronRight size={16} className="fd-row-chevron" />
                                                                            <div className="fd-avatar">{learner.firstName[0] || 'L'}{(learner.lastName[0] || '')}</div>
                                                                            <div>
                                                                                <div className="fd-name">{learner.firstName} {learner.lastName}</div>
                                                                                <div className="fd-email">{learner.email}</div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                                {columnVisibility.pathway && <td>{learner.pathway}</td>}
                                                                {columnVisibility.status && <td><span className={`fd-pill ${statusPill(learner.status)}`}>{learner.status}</span></td>}
                                                                {columnVisibility.readiness && <td>{learner.readiness}</td>}
                                                                {columnVisibility.finalScore && (
                                                                    <td>
                                                                        <div className="fd-score">
                                                                            <div className="fd-score-bar">
                                                                                <div className="fd-score-fill" style={{ width: `${Math.min(100, learner.finalScore)}%`, background: scoreColor(learner.finalScore) }} />
                                                                            </div>
                                                                            <span className="fd-score-num">{learner.finalScore}%</span>
                                                                        </div>
                                                                    </td>
                                                                )}

                                                                {/* Dynamic extra column values */}
                                                                {dynamicSheetHeaders.map(colKey => {
                                                                    let displayValue = (learner[colKey] === '' || learner[colKey] === null || learner[colKey] === undefined) ? 'N/A' : String(learner[colKey]).trim();

                                                                    if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
                                                                    else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
                                                                    else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

                                                                    return columnVisibility[colKey] && (
                                                                        <td key={colKey}>{displayValue}</td>
                                                                    );
                                                                })}
                                                            </tr>

                                                            {/* EXPANDED ROW DETAILS ACCORDION */}
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan={visibleColsCount} style={{ padding: 0, border: 'none' }}>
                                                                        <div className="fd-expanded-panel">
                                                                            <div className="fd-expanded-inner">
                                                                                <div className="fd-expanded-header">
                                                                                    <Info size={16} /> Complete Dataset Record
                                                                                </div>
                                                                                <div className="fd-expanded-grid">
                                                                                    {Object.entries(learner).map(([key, value]) => {
                                                                                        if (hiddenDetailKeys.includes(key)) return null;

                                                                                        let displayValue = (value === '' || value === null || value === undefined) ? 'N/A' : String(value).trim();

                                                                                        if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
                                                                                        else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
                                                                                        else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

                                                                                        return (
                                                                                            <div key={key} className="fd-expanded-item">
                                                                                                <span className="fd-expanded-label">{key}</span>
                                                                                                <span className="fd-expanded-value">
                                                                                                    {displayValue === 'Passed' || displayValue === 'Attended' ? (
                                                                                                        <span style={{ color: '#15803d', background: '#e8f5d0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                                            <CheckCircle2 size={13} /> {displayValue}
                                                                                                        </span>
                                                                                                    ) : displayValue === 'Failed' || displayValue === 'Did not Attended' ? (
                                                                                                        <span style={{ color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                                            <XCircle size={13} /> {displayValue}
                                                                                                        </span>
                                                                                                    ) : displayValue === 'Not Attempted' ? (
                                                                                                        <span style={{ color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                                            <MinusCircle size={13} /> Not Attempted
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        displayValue
                                                                                                    )}
                                                                                                </span>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {rosterData.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="fd-empty">
                                                            No learners match the current filter criteria.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* PAGINATION CONTROLS */}
                                    <div className="fd-table-foot">
                                        <span>
                                            Showing {rosterData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, rosterData.length)} of {rosterData.length} records
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <select
                                                value={pageSize}
                                                onChange={e => setPageSize(Number(e.target.value))}
                                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                                            >
                                                <option value={10}>10 per page</option>
                                                <option value={15}>15 per page</option>
                                                <option value={25}>25 per page</option>
                                                <option value={50}>50 per page</option>
                                                <option value={100}>100 per page</option>
                                            </select>

                                            <button
                                                className="fd-btn fd-btn--ghost fd-btn--sm"
                                                disabled={currentPage <= 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            >
                                                Previous
                                            </button>
                                            <span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span>
                                            <button
                                                className="fd-btn fd-btn--ghost fd-btn--sm"
                                                disabled={currentPage >= totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                </div>

            </>)}

            {/* ENHANCED CUSTOMIZE LAYOUT MODAL */}
            {showCustomizeModal && (
                <div className="fd-modal-overlay" onClick={() => setShowCustomizeModal(false)}>
                    <div className="fd-modal" onClick={e => e.stopPropagation()}>
                        <div className="fd-modal-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                                <SlidersHorizontal size={18} /> Customize Funder Dashboard &amp; Analytics
                            </div>
                            <button onClick={() => setShowCustomizeModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="fd-modal-body">
                            {/* 1. FILTER BAR CUSTOMIZER */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
                                        Filter Bar Dropdowns
                                    </div>
                                    <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addFilter} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
                                        <Plus size={14} /> Add Filter Dropdown
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filtersConfig.map(f => (
                                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '10px' }}>
                                            <input type="checkbox" checked={f.enabled} onChange={() => toggleFilterEnabled(f.id)} title="Toggle Filter Visibility" />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fd-blue)', minWidth: '90px' }}>{f.label}:</span>
                                            <select
                                                value={f.columnKey}
                                                onChange={e => updateFilterColumn(f.id, e.target.value)}
                                                style={{ flex: 1, padding: '4px 8px', background: 'transparent', color: 'var(--mlab-blue)', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                                            >
                                                {allSheetColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                            <button onClick={() => deleteFilter(f.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. KPI FLAT STATS BUILDER */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
                                        KPI Summary Cards
                                    </div>
                                    <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addKpi} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
                                        <Plus size={14} /> Add KPI Card
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {kpisConfig.map(kpi => (
                                        <div key={kpi.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input type="checkbox" checked={kpi.enabled} onChange={e => updateKpi(kpi.id, { enabled: e.target.checked })} />
                                                <input
                                                    type="text"
                                                    value={kpi.label}
                                                    onChange={e => updateKpi(kpi.id, { label: e.target.value })}
                                                    placeholder="KPI Label..."
                                                    style={{ flex: 1, padding: '4px 8px', background: 'transparent', color: 'var(--mlab-blue)', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, }}
                                                />
                                                <input
                                                    type="color"
                                                    value={kpi.color}
                                                    onChange={e => updateKpi(kpi.id, { color: e.target.value })}
                                                    style={{ width: '28px', background: 'transparent', color: 'var(--mlab-blue)', height: '28px', border: 'none', cursor: 'pointer' }}
                                                />
                                                <button onClick={() => deleteKpi(kpi.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Calculation</label>
                                                    <select
                                                        value={kpi.type}
                                                        onChange={e => updateKpi(kpi.id, { type: e.target.value as any })}
                                                        style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                                    >
                                                        <option value="total">Total Records Count</option>
                                                        <option value="percentage">% Matching Condition</option>
                                                        <option value="count">Count Matching Condition</option>
                                                    </select>
                                                </div>

                                                {kpi.type !== 'total' && (
                                                    <>
                                                        <div>
                                                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Column Key</label>
                                                            <select
                                                                value={kpi.columnKey}
                                                                onChange={e => updateKpi(kpi.id, { columnKey: e.target.value })}
                                                                style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                                            >
                                                                {allSheetColumns.map(col => (
                                                                    <option key={col} value={col}>{col}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Target Match Value</label>
                                                            <select
                                                                value={kpi.targetValue || ''}
                                                                onChange={e => updateKpi(kpi.id, { targetValue: e.target.value })}
                                                                style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                                                            >
                                                                {getUniqueColumnValues(kpi.columnKey).map(val => (
                                                                    <option key={val} value={val}>{val}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 3. CHART WIDGET BUILDER SECTION */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
                                        Custom Analytics Charts
                                    </div>
                                    <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addCustomWidget} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
                                        <Plus size={14} /> Add Analytics Chart
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {orderedWidgets.map(w => (
                                        <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input type="checkbox" checked={w.enabled} onChange={() => toggleWidgetEnabled(w.id)} title="Toggle Card Visibility" />
                                                <input
                                                    type="text"
                                                    value={w.title}
                                                    onChange={e => updateWidgetTitle(w.id, e.target.value)}
                                                    placeholder="Chart Title..."
                                                    style={{ flex: 1, background: 'transparent', color: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 700 }}
                                                />
                                                <button onClick={() => deleteWidget(w.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }} title="Delete Chart">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                                                {/* METRIC COLUMN SELECTOR */}
                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Primary Column</label>
                                                    <select
                                                        value={w.metricKey}
                                                        onChange={e => updateWidgetMetric(w.id, e.target.value)}
                                                        style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                                                    >
                                                        {allSheetColumns.map(col => (
                                                            <option key={col} value={col}>{col}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* COMPARISON METRIC SELECTOR */}
                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Compare With (Optional)</label>
                                                    <select
                                                        value={w.compareKey || 'none'}
                                                        onChange={e => updateWidgetCompareKey(w.id, e.target.value)}
                                                        style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                                                    >
                                                        <option value="none">-- None (Single Column) --</option>
                                                        {allSheetColumns.filter(c => c !== w.metricKey).map(col => (
                                                            <option key={col} value={col}>vs. {col}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* VISUALIZATION TYPE SELECTOR */}
                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Chart Type</label>
                                                    <select
                                                        value={w.chartType}
                                                        onChange={e => updateWidgetType(w.id, e.target.value as any)}
                                                        style={{ width: '100%', background: 'transparent', color: 'var(--mlab-blue)', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                                                    >
                                                        <option value="bar">Vertical Bar</option>
                                                        <option value="horizontal_bar">Horizontal Bar</option>
                                                        <option value="pie">Pie Chart</option>
                                                        <option value="donut">Donut Chart</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="fd-modal-footer">
                            <button className="fd-btn fd-btn--ghost" onClick={() => {
                                setWidgetsConfig(DEFAULT_WIDGETS);
                                setFiltersConfig(DEFAULT_FILTERS);
                                setKpisConfig(DEFAULT_KPIS);
                                updateQuery({ charts: null, filters: null, kpis: null, order: null });
                            }}>
                                Reset to Default
                            </button>
                            <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(false)}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FunderDashboardView;




// // src/pages/AdminDashboard/FunderDashboard/FunderDashboardView.tsx

// import React, { useState, useMemo, useEffect, useRef } from 'react';
// import { useSearchParams } from 'react-router-dom';
// import {
//     LayoutDashboard,
//     Table as TableIcon,
//     Download,
//     Filter,
//     ChevronDown,
//     ChevronRight,
//     Users,
//     GraduationCap,
//     AlertTriangle,
//     Search,
//     Settings2,
//     RotateCcw,
//     Venus,
//     Mars,
//     Briefcase,
//     Loader2,
//     Info,
//     CheckCircle2,
//     XCircle,
//     SlidersHorizontal,
//     Eye,
//     EyeOff,
//     X,
//     Check,
//     Plus,
//     Trash2,
//     MinusCircle,
//     GripVertical,
//     ShieldCheck,
//     Lock
// } from 'lucide-react';
// import {
//     PieChart, Pie, Cell,
//     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
// } from 'recharts';
// import { useSheetData } from '../../../services/useSheetData';

// // GOOGLE SHEET PUBLISHED CSV URL
// const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTLUYX9T5uy5LWs3Wt_HoCj4nr0LhMAo3x5cyI4G2V4O7B1NJNAyIauCN-ZqbVlW3kCVKlnWlCU9F9/pub?gid=0&single=true&output=csv';

// const GREEN = 'var(--mlab-green, #94c73d)';
// const BLUE = 'var(--mlab-blue, #002b49)';
// const RED = '#ef4444';
// const CHART_COLORS = ['#94c73d', '#002b49', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

// export interface WidgetConfig {
//     id: string;
//     title: string;
//     enabled: boolean;
//     chartType: 'bar' | 'horizontal_bar' | 'pie' | 'donut';
//     metricKey: string;
//     compareKey?: string;
// }

// export interface FilterConfig {
//     id: string;
//     columnKey: string;
//     label: string;
//     enabled: boolean;
// }

// export interface KpiConfig {
//     id: string;
//     label: string;
//     type: 'total' | 'percentage' | 'count';
//     columnKey: string;
//     targetValue?: string;
//     color: string;
//     enabled: boolean;
// }

// const DEFAULT_WIDGETS: WidgetConfig[] = [
//     { id: 'widget_status', title: 'Programme Status', enabled: true, chartType: 'bar', metricKey: 'status', compareKey: 'none' },
//     { id: 'widget_gender', title: 'Participant Demographics', enabled: true, chartType: 'donut', metricKey: 'gender', compareKey: 'none' },
//     { id: 'widget_pathway', title: 'Pathway Distribution', enabled: true, chartType: 'horizontal_bar', metricKey: 'pathway', compareKey: 'none' },
//     { id: 'widget_readiness', title: 'Work Readiness Status', enabled: true, chartType: 'pie', metricKey: 'readiness', compareKey: 'none' },
// ];

// const DEFAULT_FILTERS: FilterConfig[] = [
//     { id: 'filter_gender', columnKey: 'gender', label: 'Gender', enabled: true },
//     { id: 'filter_pathway', columnKey: 'pathway', label: 'Pathway', enabled: true },
//     { id: 'filter_readiness', columnKey: 'readiness', label: 'Work-Readiness', enabled: true },
// ];

// const DEFAULT_KPIS: KpiConfig[] = [
//     { id: 'kpi_total', label: 'Total Active', type: 'total', columnKey: '', color: '#38bdf8', enabled: true },
//     { id: 'kpi_female', label: 'Female Representation', type: 'percentage', columnKey: 'gender', targetValue: 'F', color: '#ec4899', enabled: true },
//     { id: 'kpi_readiness', label: 'Overall Work-Readiness', type: 'percentage', columnKey: 'readiness', targetValue: 'Placement Ready', color: '#94c73d', enabled: true },
//     { id: 'kpi_male', label: 'Male Representation', type: 'percentage', columnKey: 'gender', targetValue: 'M', color: '#3b82f6', enabled: true },
// ];

// const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
//     person: true,
//     pathway: true,
//     status: true,
//     readiness: true,
//     finalScore: true,
// };

// const VERIFIED_STORAGE_KEY = 'fd-human-verified-v1';

// /* ------------------------------------------------------------------ */
// /* Scoped Styles                                                       */
// /* ------------------------------------------------------------------ */
// const styles = `
// @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

// .fd-root {
//     --fd-blue: var(--mlab-blue, #002b49);
//     --fd-green: var(--mlab-green, #94c73d);
//     --fd-ink: #0b1f33;
//     --fd-muted: #5b6b7c;
//     --fd-line: #e4eaf0;
//     display: flex;
//     flex-direction: column;
//     position: relative;
//     width: 100%;
//     height: 100%;
//     min-height: 0;
//     overflow: hidden;
//     background:
//         radial-gradient(900px 420px at 50% -120px, color-mix(in srgb, var(--fd-blue) 10%, transparent), transparent 70%),
//         radial-gradient(500px 300px at 100% 100%, color-mix(in srgb, var(--fd-green) 14%, transparent), transparent 70%),
//         #f3f6f9;
//     font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
//     color: var(--fd-ink);
// }
// .fd-root *, .fd-root *::before, .fd-root *::after { box-sizing: border-box; }
// .fd-root--fixed { position: fixed; inset: 0; height: 100dvh; z-index: 10; }

// .fd-scroll { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--fd-blue) 35%, transparent) transparent; }
// .fd-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
// .fd-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fd-blue) 30%, transparent); border-radius: 8px; }
// .fd-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--fd-blue) 55%, transparent); }

// /* ---------- Hero header ---------- */
// .fd-hero {
//     position: relative;
//     overflow: hidden;
//     flex-shrink: 0;
//     z-index: 3;
//     padding: 1.05rem 1.5rem 1.2rem;
//     color: #fff;
//     display: flex;
//     justify-content: space-between;
//     align-items: flex-end;
//     flex-wrap: wrap;
//     gap: 1rem;
//     background:
//         radial-gradient(420px 220px at 90% 0%, color-mix(in srgb, var(--fd-green) 38%, transparent), transparent 65%),
//         linear-gradient(135deg, var(--fd-blue) 0%, color-mix(in srgb, var(--fd-blue) 82%, #000) 100%);
//     box-shadow: 0 10px 30px -18px rgba(0, 43, 73, 0.6);
//     animation: fd-fade 0.5s ease both;
// }
// .fd-hero::before {
//     content: '';
//     position: absolute;
//     inset: 0;
//     background-image:
//         linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
//         linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
//     background-size: 28px 28px;
//     mask-image: radial-gradient(ellipse at 70% 30%, #000 10%, transparent 70%);
//     -webkit-mask-image: radial-gradient(ellipse at 70% 30%, #000 10%, transparent 70%);
//     animation: fd-grid-drift 18s linear infinite;
// }
// .fd-hero::after {
//     content: '';
//     position: absolute;
//     left: 0; right: 0; bottom: 0;
//     height: 4px;
//     background: linear-gradient(90deg, var(--fd-green), color-mix(in srgb, var(--fd-green) 40%, #fff), var(--fd-green));
//     background-size: 200% 100%;
//     animation: fd-shimmer-line 4s linear infinite;
// }
// .fd-hero > * { position: relative; z-index: 1; }

// .fd-hero-brand {
//     display: flex;
//     align-items: center;
//     gap: 14px;
//     margin-bottom: 4px;
// }
// .fd-hero-divider {
//     width: 1px;
//     height: 22px;
//     background: rgba(255, 255, 255, 0.25);
// }

// .fd-eyebrow {
//     display: inline-flex; align-items: center; gap: 8px;
//     font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
//     color: rgba(255,255,255,0.75);
// }
// .fd-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fd-green); animation: fd-blink 2.2s ease-in-out infinite; }
// .fd-title { margin: 0; font-size: clamp(1.2rem, 2.4vw, 1.6rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
// .fd-subtitle { margin: 4px 0 0; font-size: 0.85rem; color: rgba(255,255,255,0.72); font-weight: 500; }
// .fd-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }

// /* ---------- Buttons ---------- */
// .fd-btn {
//     display: inline-flex; align-items: center; justify-content: center; gap: 8px;
//     padding: 0.65rem 1rem;
//     border-radius: 12px;
//     border: 1px solid transparent;
//     font: inherit; font-size: 0.8rem; font-weight: 700;
//     cursor: pointer;
//     transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.2s ease, border-color 0.2s ease, filter 0.18s ease;
// }
// .fd-btn:hover:not(:disabled) { transform: translateY(-2px); }
// .fd-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
// .fd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
// .fd-btn--primary { background: var(--fd-green); color: var(--fd-blue); box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--fd-green) 90%, #000); }
// .fd-btn--primary:hover { filter: brightness(1.05); }
// .fd-btn--glass { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.28); backdrop-filter: blur(6px); }
// .fd-btn--glass:hover { background: rgba(255,255,255,0.18); }
// .fd-btn--ghost { background: #fff; color: var(--fd-blue); border-color: var(--fd-line); }
// .fd-btn--ghost:hover:not(:disabled) { border-color: var(--fd-blue); }
// .fd-btn--sm { padding: 0.4rem 0.7rem; font-size: 0.72rem; border-radius: 99px; }

// /* ---------- Controls bar (fixed): tabs + filters ---------- */
// .fd-controls {
//     flex-shrink: 0;
//     z-index: 2;
//     display: flex; align-items: center; gap: 0.9rem 1.25rem; flex-wrap: wrap;
//     padding: 0.65rem 1.5rem;
//     background: rgba(255,255,255,0.92);
//     backdrop-filter: blur(10px);
//     border-bottom: 1px solid var(--fd-line);
//     animation: fd-rise 0.55s 0.12s ease both;
// }
// .fd-filters {
//     flex: 1; min-width: 0;
//     display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
// }
// .fd-filter-label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fd-muted); }
// .fd-filter-label svg { color: var(--fd-blue); }
// .fd-select-wrap { position: relative; }
// .fd-select {
//     appearance: none; -webkit-appearance: none;
//     padding: 0.55rem 2rem 0.55rem 0.9rem;
//     border: 1.5px solid #d5dde6;
//     border-radius: 10px;
//     background: #f8fafc;
//     font: inherit; font-size: 0.8rem; font-weight: 600; color: var(--fd-ink);
//     cursor: pointer; outline: none;
//     transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
// }
// .fd-select:hover { background: #fff; }
// .fd-select:focus { border-color: var(--fd-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 28%, transparent); background: #fff; }
// .fd-select--active { border-color: var(--fd-blue); background: color-mix(in srgb, var(--fd-blue) 6%, #fff); }
// .fd-select-wrap svg { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--fd-muted); }
// .fd-chip {
//     margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
//     padding: 0.3rem 0.4rem 0.3rem 0.8rem;
//     border-radius: 999px;
//     font-size: 0.74rem; font-weight: 700; color: var(--fd-blue);
//     background: color-mix(in srgb, var(--fd-green) 20%, #fff);
//     border: 1px solid color-mix(in srgb, var(--fd-green) 45%, #fff);
//     animation: fd-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
// }
// .fd-chip button {
//     display: inline-flex; align-items: center; gap: 4px;
//     border: none; background: var(--fd-blue); color: #fff;
//     padding: 0.25rem 0.6rem; border-radius: 999px;
//     font: inherit; font-size: 0.7rem; font-weight: 700; cursor: pointer;
//     transition: transform 0.15s ease;
// }
// .fd-chip button:hover { transform: scale(1.05); }

// /* ---------- Segmented tabs ---------- */
// .fd-tabs {
//     position: relative;
//     display: inline-grid;
//     grid-template-columns: 1fr 1fr;
//     flex-shrink: 0;
//     padding: 5px;
//     background: #eef2f6;
//     border-radius: 14px;
//     max-width: 100%;
// }
// .fd-tab-thumb {
//     position: absolute;
//     top: 5px; bottom: 5px; left: 5px;
//     width: calc(50% - 5px);
//     border-radius: 10px;
//     background: var(--fd-blue);
//     box-shadow: 0 8px 18px -8px var(--fd-blue);
//     transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
// }
// .fd-tabs[data-active='roster'] .fd-tab-thumb { transform: translateX(100%); }
// .fd-tab {
//     position: relative; z-index: 1;
//     display: inline-flex; align-items: center; justify-content: center; gap: 8px;
//     padding: 0.7rem 1.3rem;
//     border: none; background: transparent;
//     font: inherit; font-size: 0.8rem; font-weight: 700;
//     color: var(--fd-muted);
//     cursor: pointer; white-space: nowrap;
//     transition: color 0.25s ease;
// }
// .fd-tab--active { color: #fff; }
// .fd-tab--active svg { color: var(--fd-green); }

// /* ---------- Main region ---------- */
// .fd-main {
//     flex: 1; min-height: 0;
//     display: flex; flex-direction: column; gap: 1.1rem;
//     padding: 1.1rem 1.5rem 1.25rem;
//     overflow-y: auto;
// }
// .fd-dash { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1.1rem; }

// /* ---------- KPI cards ---------- */
// .fd-kpis { flex-shrink: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
// .fd-kpi {
//     position: relative; overflow: hidden;
//     padding: 1.15rem 1.2rem;
//     background: #fff;
//     border: 1px solid var(--fd-line);
//     border-radius: 18px;
//     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
//     transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
//     animation: fd-rise 0.55s ease both;
// }
// .fd-kpi::before {
//     content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
//     background: var(--kpi, var(--fd-green));
// }
// .fd-kpi::after {
//     content: ''; position: absolute; right: -30px; top: -30px; width: 110px; height: 110px; border-radius: 50%;
//     background: radial-gradient(circle, color-mix(in srgb, var(--kpi, var(--fd-green)) 22%, transparent), transparent 70%);
//     transition: transform 0.4s ease;
// }
// .fd-kpi:hover { transform: translateY(-4px); box-shadow: 0 20px 40px -22px rgba(0, 43, 73, 0.4); border-color: color-mix(in srgb, var(--kpi, var(--fd-green)) 50%, #fff); }
// .fd-kpi:hover::after { transform: scale(1.25); }
// .fd-kpi-head { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
// .fd-kpi-icon {
//     width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
//     color: var(--fd-blue);
//     background: color-mix(in srgb, var(--kpi, var(--fd-green)) 18%, #fff);
//     transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
// }
// .fd-kpi:hover .fd-kpi-icon { background: var(--fd-blue); color: var(--fd-green); transform: scale(1.08) rotate(-4deg); }
// .fd-kpi-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fd-muted); }
// .fd-kpi-value { position: relative; z-index: 1; font-size: 2.2rem; line-height: 1; font-weight: 800; letter-spacing: -0.03em; color: var(--fd-ink); font-variant-numeric: tabular-nums; }

// /* ---------- Chart cards & Drag-and-Drop ---------- */
// .fd-charts-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: -0.5rem; padding: 0.5rem; }
// .fd-charts {
//     display: grid;
//     grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
//     grid-auto-rows: minmax(290px, 1fr);
//     gap: 1.1rem;
//     min-height: 100%;
// }

// .fd-dash--dragging .fd-chart { pointer-events: none !important; }

// .fd-card {
//     background: #fff;
//     border: 1px solid var(--fd-line);
//     border-radius: 20px;
//     padding: 1.1rem 1.25rem 1rem;
//     display: flex; flex-direction: column; min-height: 0;
//     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
//     transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
//     animation: fd-rise 0.6s ease both;
//     position: relative;
// }
// .fd-card:hover { transform: translateY(-3px); box-shadow: 0 24px 44px -26px rgba(0, 43, 73, 0.4); }
// .fd-card--dragging { opacity: 0.35; border: 2px dashed var(--fd-green) !important; transform: scale(0.98); }
// .fd-card--drag-over { border: 2px solid var(--fd-green) !important; box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 30%, transparent) !important; }

// .fd-card-head { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 10px; }
// .fd-card-title-wrap { display: flex; align-items: center; gap: 8px; }
// .fd-drag-handle { display: inline-flex; align-items: center; cursor: grab; color: #94a3b8; transition: color 0.2s ease; padding: 2px; }
// .fd-drag-handle:hover { color: var(--fd-blue); }
// .fd-drag-handle:active { cursor: grabbing; }

// .fd-card-title { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 0.95rem; font-weight: 800; letter-spacing: -0.01em; color: var(--fd-blue); }
// .fd-card-title::before { content: ''; width: 4px; height: 18px; border-radius: 2px; background: var(--fd-green); }
// .fd-chart { position: relative; flex: 1; min-height: 200px; }
// .fd-chart-inner { position: absolute; inset: 0; }
// .fd-chart .recharts-surface { overflow: visible; }

// /* ---------- Human Bot Check Modal ---------- */
// .fd-bot-overlay {
//     position: fixed; inset: 0; z-index: 200;
//     background: linear-gradient(135deg, rgba(0, 43, 73, 0.92) 0%, rgba(11, 31, 51, 0.96) 100%);
//     backdrop-filter: blur(12px);
//     display: grid; place-items: center; padding: 20px;
//     animation: fd-fade 0.3s ease;
// }
// .fd-bot-card {
//     background: #fff; border-radius: 24px; width: min(100%, 420px);
//     padding: 2.2rem 2rem; display: flex; flex-direction: column; align-items: center; text-align: center;
//     box-shadow: 0 25px 60px -15px rgba(0,0,0,0.5); border: 1px solid var(--fd-line);
//     animation: fd-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
// }
// .fd-bot-slider-track {
//     width: 100%; height: 50px; background: #f1f5f9; border-radius: 999px;
//     position: relative; overflow: hidden; border: 1px solid #cbd5e1;
//     margin: 1.5rem 0 1rem 0; display: flex; align-items: center; padding: 4px;
//     user-select: none;
// }
// .fd-bot-slider-text {
//     position: absolute; inset: 0; display: grid; place-items: center;
//     font-size: 0.78rem; font-weight: 800; color: #64748b; letter-spacing: 0.04em; pointer-events: none;
// }
// .fd-bot-slider-thumb {
//     width: 42px; height: 42px; border-radius: 50%; background: var(--fd-blue);
//     color: var(--fd-green); display: grid; place-items: center;
//     cursor: grab; transition: background-color 0.2s ease, transform 0.1s ease;
//     box-shadow: 0 4px 12px rgba(0,43,73,0.3); z-index: 2;
// }
// .fd-bot-slider-thumb:active { cursor: grabbing; scale: 1.05; }
// .fd-bot-slider-fill {
//     position: absolute; left: 0; top: 0; bottom: 0;
//     background: color-mix(in srgb, var(--fd-green) 35%, transparent);
//     border-radius: 999px 0 0 999px; pointer-events: none;
// }

// /* ---------- Roster table ---------- */
// .fd-table-card {
//     background: #fff;
//     border: 1px solid var(--fd-line);
//     border-radius: 20px;
//     overflow: hidden;
//     flex: 1; min-height: 320px;
//     display: flex; flex-direction: column;
//     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
//     animation: fd-rise 0.5s ease both;
// }
// .fd-toolbar {
//     flex-shrink: 0;
//     display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
//     padding: 1rem 1.1rem;
//     border-bottom: 1px solid var(--fd-line);
//     background: linear-gradient(180deg, #fbfcfd, #f5f8fa);
//     position: relative;
// }
// .fd-search-wrap { position: relative; width: min(100%, 320px); }
// .fd-search-wrap svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; transition: color 0.2s ease; }
// .fd-search-wrap:focus-within svg { color: var(--fd-blue); }
// .fd-search {
//     width: 100%;
//     padding: 0.65rem 1rem 0.65rem 2.4rem;
//     border-radius: 12px;
//     border: 1.5px solid #d5dde6;
//     background: #fff;
//     font: inherit; font-size: 0.82rem; color: var(--fd-ink); outline: none;
//     transition: border-color 0.2s ease, box-shadow 0.2s ease;
// }
// .fd-search::placeholder { color: #94a3b8; }
// .fd-search:focus { border-color: var(--fd-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 28%, transparent); }
// .fd-table-scroll { flex: 1; min-height: 0; overflow: auto; }
// .fd-table { width: 100%; min-width: 680px; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
// .fd-table th {
//     padding: 0.9rem 1.1rem;
//     font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
//     color: var(--fd-muted);
//     background: #f8fafc;
//     border-bottom: 1px solid var(--fd-line);
//     position: sticky; top: 0; z-index: 1;
// }
// .fd-table td { padding: 0.9rem 1.1rem; border-bottom: 1px solid #f0f3f6; color: #334155; vertical-align: middle; }
// .fd-table tbody tr { transition: background-color 0.2s ease; cursor: pointer; }
// .fd-table tbody tr:hover { background: color-mix(in srgb, var(--fd-green) 8%, #fff); }

// .fd-row--expanded td { border-bottom: none; background: color-mix(in srgb, var(--fd-blue) 3%, #fff); }

// .fd-person { display: flex; align-items: center; gap: 12px; }
// .fd-avatar {
//     flex-shrink: 0; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
//     font-size: 0.78rem; font-weight: 800; color: var(--fd-green);
//     background: linear-gradient(135deg, var(--fd-blue), color-mix(in srgb, var(--fd-blue) 70%, #2563eb));
//     transition: transform 0.2s ease;
// }
// .fd-table tbody tr:hover .fd-avatar { transform: scale(1.08) rotate(-3deg); }
// .fd-name { font-weight: 700; color: var(--fd-ink); }
// .fd-email { font-size: 0.75rem; color: var(--fd-muted); }

// .fd-row-chevron {
//     color: #94a3b8;
//     transition: transform 0.2s ease, color 0.2s ease;
// }
// .fd-row--expanded .fd-row-chevron {
//     transform: rotate(90deg);
//     color: var(--fd-blue);
// }

// .fd-expanded-panel {
//     padding: 0 1.1rem 1.5rem 1.1rem;
//     background: color-mix(in srgb, var(--fd-blue) 3%, #fff);
//     border-bottom: 1px solid #f0f3f6;
//     animation: fd-fade 0.3s ease;
// }
// .fd-expanded-inner {
//     background: #fff;
//     border: 1px solid var(--fd-line);
//     border-radius: 12px;
//     padding: 1.5rem;
//     box-shadow: 0 4px 12px rgba(0, 43, 73, 0.05);
// }
// .fd-expanded-header {
//     display: flex;
//     align-items: center;
//     gap: 8px;
//     font-size: 0.9rem;
//     font-weight: 800;
//     color: var(--fd-blue);
//     margin-bottom: 1rem;
//     padding-bottom: 0.8rem;
//     border-bottom: 1px dashed var(--fd-line);
// }
// .fd-expanded-grid {
//     display: grid;
//     grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
//     gap: 1.2rem;
// }
// .fd-expanded-item {
//     display: flex;
//     flex-direction: column;
//     gap: 4px;
// }
// .fd-expanded-label {
//     font-size: 0.68rem;
//     font-weight: 800;
//     color: #94a3b8;
//     text-transform: uppercase;
//     letter-spacing: 0.05em;
// }
// .fd-expanded-value {
//     font-size: 0.82rem;
//     font-weight: 600;
//     color: var(--fd-ink);
//     word-break: break-word;
// }

// .fd-pill { display: inline-flex; align-items: center; gap: 6px; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
// .fd-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
// .fd-pill--passed { background: #e8f5d0; color: #3f6b0a; }
// .fd-pill--dropped { background: #fee2e2; color: #b42318; }
// .fd-pill--progress { background: color-mix(in srgb, var(--fd-blue) 9%, #fff); color: var(--fd-blue); }

// .fd-score { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
// .fd-score-bar { width: 70px; height: 6px; border-radius: 999px; background: #e9eef3; overflow: hidden; }
// .fd-score-fill { height: 100%; border-radius: 999px; transform-origin: left; animation: fd-grow 0.9s 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
// .fd-score-num { min-width: 52px; text-align: right; font-weight: 800; color: var(--fd-blue); font-variant-numeric: tabular-nums; }
// .fd-empty { padding: 3rem 1rem; text-align: center; color: #94a3b8; font-weight: 600; }
// .fd-table-foot {
//     flex-shrink: 0;
//     display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
//     padding: 0.85rem 1.1rem;
//     border-top: 1px solid var(--fd-line);
//     background: #f8fafc;
//     font-size: 0.75rem; font-weight: 600; color: var(--fd-muted);
// }

// /* POPOVER MENUS & MODALS */
// .fd-popover {
//     position: absolute; right: 0; top: calc(100% + 8px); z-index: 50;
//     background: #fff; border: 1px solid var(--fd-line); border-radius: 14px;
//     padding: 12px; min-width: 220px; max-height: 380px; overflow-y: auto;
//     box-shadow: 0 16px 36px -12px rgba(0,43,73,0.3);
//     animation: fd-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
//     scrollbar-width: thin;
//     scrollbar-color: color-mix(in srgb, var(--fd-blue) 35%, transparent) transparent;
// }
// .fd-popover::-webkit-scrollbar { width: 6px; }
// .fd-popover::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fd-blue) 30%, transparent); border-radius: 6px; }

// .fd-popover-title {
//     font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--fd-muted);
//     padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--fd-line);
// }
// .fd-popover-item {
//     display: flex; align-items: center; justify-content: space-between; gap: 8px;
//     padding: 6px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;
//     transition: background-color 0.15s ease;
// }
// .fd-popover-item:hover { background: #f1f5f9; }

// /* MODAL OVERLAY */
// .fd-modal-overlay {
//     position: fixed; inset: 0; z-index: 100;
//     background: rgba(11, 31, 51, 0.6); backdrop-filter: blur(6px);
//     display: grid; place-items: center; padding: 20px;
//     animation: fd-fade 0.25s ease;
// }
// .fd-modal {
//     background: #fff; border-radius: 20px; width: min(100%, 720px); max-height: 88vh;
//     display: flex; flex-direction: column; overflow: hidden;
//     box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35);
// }
// .fd-modal-header {
//     padding: 1.25rem 1.5rem; background: var(--fd-blue); color: #fff;
//     display: flex; justify-content: space-between; align-items: center;
// }
// .fd-modal-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; }
// .fd-modal-footer {
//     padding: 1rem 1.5rem; background: #f8fafc; border-top: 1px solid var(--fd-line);
//     display: flex; justify-content: space-between; align-items: center;
// }

// /* ---------- Keyframes ---------- */
// @keyframes fd-fade { from { opacity: 0; } to { opacity: 1; } }
// @keyframes fd-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
// @keyframes fd-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
// @keyframes fd-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
// @keyframes fd-grid-drift { to { background-position: 28px 28px, 28px 28px; } }
// @keyframes fd-shimmer-line { to { background-position: -200% 0; } }
// @keyframes fd-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
// `;

// /* ------------------------------------------------------------------ */
// /* Helpers                                                             */
// /* ------------------------------------------------------------------ */
// const useCountUp = (target: number, duration = 900) => {
//     const [value, setValue] = useState(0);
//     const fromRef = useRef(0);

//     useEffect(() => {
//         if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
//             setValue(target);
//             fromRef.current = target;
//             return;
//         }
//         const from = fromRef.current;
//         const start = performance.now();
//         let raf = 0;
//         const tick = (now: number) => {
//             const p = Math.min((now - start) / duration, 1);
//             const eased = 1 - Math.pow(1 - p, 3);
//             const next = Math.round(from + (target - from) * eased);
//             setValue(next);
//             if (p < 1) raf = requestAnimationFrame(tick);
//             else fromRef.current = target;
//         };
//         raf = requestAnimationFrame(tick);
//         return () => cancelAnimationFrame(raf);
//     }, [target, duration]);

//     return value;
// };

// const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: number; suffix?: string; color: string; delay: number }> = ({ icon, label, value, suffix = '', color, delay }) => {
//     const shown = useCountUp(value);
//     return (
//         <div className="fd-kpi" style={{ ['--kpi' as any]: color, animationDelay: `${delay}s` }}>
//             <div className="fd-kpi-head">
//                 <div className="fd-kpi-icon">{icon}</div>
//                 <span className="fd-kpi-label">{label}</span>
//             </div>
//             <div className="fd-kpi-value">{shown}{suffix}</div>
//         </div>
//     );
// };

// const FilterSelect: React.FC<{ value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }> = ({ value, onChange, children, label }) => (
//     <div className="fd-select-wrap">
//         <select
//             aria-label={label}
//             className={`fd-select ${value !== 'All' ? 'fd-select--active' : ''}`}
//             value={value}
//             onChange={e => onChange(e.target.value)}
//         >
//             {children}
//         </select>
//         <ChevronDown size={14} />
//     </div>
// );

// const tooltipStyle = {
//     borderRadius: '12px',
//     border: '1px solid #e4eaf0',
//     boxShadow: '0 12px 28px -12px rgba(0,43,73,0.35)',
//     fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
//     fontSize: '12px'
// };

// const statusPill = (status: string) =>
//     status === 'Passed' ? 'fd-pill--passed' : status === 'Dropped Out' ? 'fd-pill--dropped' : 'fd-pill--progress';

// const scoreColor = (s: number) => (s >= 70 ? GREEN : s >= 40 ? '#f59e0b' : RED);

// /* ------------------------------------------------------------------ */
// /* Interactive Human Verification Gate                                */
// /* ------------------------------------------------------------------ */
// const HumanVerificationGate: React.FC<{ onVerify: () => void }> = ({ onVerify }) => {
//     const [sliderPos, setSliderPos] = useState(0);
//     const [isDragging, setIsDragging] = useState(false);
//     const trackRef = useRef<HTMLDivElement>(null);

//     const handleMove = (clientX: number) => {
//         if (!isDragging || !trackRef.current) return;
//         const rect = trackRef.current.getBoundingClientRect();
//         const max = rect.width - 42;
//         const offsetX = Math.max(0, Math.min(clientX - rect.left - 21, max));
//         const pct = (offsetX / max) * 100;
//         setSliderPos(pct);

//         if (pct >= 95) {
//             setIsDragging(false);
//             setSliderPos(100);
//             setTimeout(() => {
//                 onVerify();
//             }, 250);
//         }
//     };

//     return (
//         <div className="fd-bot-overlay">
//             <div className="fd-bot-card">
//                 <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
//                     <ShieldCheck size={28} />
//                 </div>
//                 <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>
//                     Human Verification Required
//                 </h3>
//                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
//                     To protect cohort analytics, please slide to confirm you are human.
//                 </p>

//                 <div
//                     ref={trackRef}
//                     className="fd-bot-slider-track"
//                     onMouseMove={(e) => handleMove(e.clientX)}
//                     onTouchMove={(e) => handleMove(e.touches[0].clientX)}
//                     onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
//                     onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
//                 >
//                     <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
//                     <span className="fd-bot-slider-text">
//                         {sliderPos >= 95 ? 'Verified!' : 'Slide to Access Dashboard ➔'}
//                     </span>
//                     <div
//                         className="fd-bot-slider-thumb"
//                         style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
//                         onMouseDown={() => setIsDragging(true)}
//                         onTouchStart={() => setIsDragging(true)}
//                     >
//                         <Lock size={16} />
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// /* ------------------------------------------------------------------ */
// /* Main Component                                                      */
// /* ------------------------------------------------------------------ */
// interface FunderDashboardViewProps {
//     fullScreen?: boolean;
//     userName?: string;
//     logoSrc?: string;
//     isLoading?: boolean;
//     showIntro?: boolean;
//     introMinDuration?: number;
// }

// export const FunderDashboardView: React.FC<FunderDashboardViewProps> = ({
//     fullScreen = true,
//     userName,
//     logoSrc,
//     isLoading = false,
//     showIntro = true,
//     introMinDuration = 2600
// }) => {
//     // REACT ROUTER URL SEARCH PARAMS PERSISTENCE
//     const [searchParams, setSearchParams] = useSearchParams();

//     // Human Verification Check State
//     const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => {
//         try {
//             return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true';
//         } catch {
//             return false;
//         }
//     });

//     const handleHumanVerified = () => {
//         setIsHumanVerified(true);
//         try {
//             sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true');
//         } catch { /* ignore */ }
//     };

//     // Live Google Sheets Data Hook
//     const { data: rawSheetData, loading: sheetLoading, error, refetch } = useSheetData(GOOGLE_SHEET_CSV_URL);

//     // State derived directly from URL Query Params
//     const activeTab = (searchParams.get('tab') as 'dashboard' | 'roster') || 'dashboard';
//     const searchTerm = searchParams.get('search') || '';
//     const currentPage = parseInt(searchParams.get('page') || '1', 10) || 1;
//     const pageSize = parseInt(searchParams.get('pageSize') || '15', 10) || 15;
//     const chartsParam = searchParams.get('charts') || '';
//     const filtersParam = searchParams.get('filters') || '';
//     const kpisParam = searchParams.get('kpis') || '';

//     const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

//     // Dynamic Columns State
//     const [showColumnDropdown, setShowColumnDropdown] = useState(false);
//     const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(DEFAULT_COLUMN_VISIBILITY);

//     // Layout Customizer Modal & Config States
//     const [showCustomizeModal, setShowCustomizeModal] = useState(false);

//     // Parse widgetsConfig from URL or localStorage/default
//     const [widgetsConfig, setWidgetsConfig] = useState<WidgetConfig[]>(() => {
//         if (chartsParam) {
//             try { return JSON.parse(decodeURIComponent(chartsParam)); } catch (err) { /* ignore */ }
//         }
//         const saved = localStorage.getItem('funder_dashboard_config_v2');
//         return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
//     });

//     // Parse filtersConfig from URL or localStorage/default
//     const [filtersConfig, setFiltersConfig] = useState<FilterConfig[]>(() => {
//         if (filtersParam) {
//             try { return JSON.parse(decodeURIComponent(filtersParam)); } catch (err) { /* ignore */ }
//         }
//         const saved = localStorage.getItem('funder_dashboard_filters_v1');
//         return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
//     });

//     // Parse kpisConfig from URL or localStorage/default
//     const [kpisConfig, setKpisConfig] = useState<KpiConfig[]>(() => {
//         if (kpisParam) {
//             try { return JSON.parse(decodeURIComponent(kpisParam)); } catch (err) { /* ignore */ }
//         }
//         const saved = localStorage.getItem('funder_dashboard_kpis_v1');
//         return saved ? JSON.parse(saved) : DEFAULT_KPIS;
//     });

//     // Individual Edit Popover State
//     const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

//     // Drag and Drop States
//     const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
//     const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

//     // Helper to cleanly update query parameters in URL bar
//     const updateQuery = (updates: Record<string, string | number | null | undefined>) => {
//         setSearchParams(prev => {
//             const next = new URLSearchParams(prev);
//             Object.entries(updates).forEach(([key, val]) => {
//                 if (
//                     val === null ||
//                     val === undefined ||
//                     val === '' ||
//                     val === 'All' ||
//                     (key === 'tab' && val === 'dashboard') ||
//                     (key === 'page' && val === 1) ||
//                     (key === 'pageSize' && val === 15)
//                 ) {
//                     next.delete(key);
//                 } else {
//                     next.set(key, String(val));
//                 }
//             });
//             return next;
//         }, { replace: true });
//     };

//     const setActiveTab = (tab: 'dashboard' | 'roster') => updateQuery({ tab });
//     const setSearchTerm = (v: string) => updateQuery({ search: v, page: 1 });
//     const setCurrentPage = (updater: number | ((p: number) => number)) => {
//         const nextPg = typeof updater === 'function' ? updater(currentPage) : updater;
//         updateQuery({ page: nextPg });
//     };
//     const setPageSize = (size: number) => updateQuery({ pageSize: size, page: 1 });

//     // Save configs to LocalStorage & URL
//     useEffect(() => {
//         localStorage.setItem('funder_dashboard_config_v2', JSON.stringify(widgetsConfig));
//         localStorage.setItem('funder_dashboard_filters_v1', JSON.stringify(filtersConfig));
//         localStorage.setItem('funder_dashboard_kpis_v1', JSON.stringify(kpisConfig));

//         updateQuery({
//             charts: encodeURIComponent(JSON.stringify(widgetsConfig)),
//             filters: encodeURIComponent(JSON.stringify(filtersConfig)),
//             kpis: encodeURIComponent(JSON.stringify(kpisConfig))
//         });
//     }, [widgetsConfig, filtersConfig, kpisConfig]);

//     // Detect ALL columns found in Google Sheets data
//     const allSheetColumns = useMemo(() => {
//         if (rawSheetData.length === 0) return ['gender', 'pathway', 'status', 'readiness'];
//         const firstRow = rawSheetData[0];
//         const keys = Object.keys(firstRow).filter(k => k !== 'id' && k !== 'firstName' && k !== 'lastName' && k !== 'email');
//         return Array.from(new Set(['gender', 'pathway', 'readiness', 'status', ...keys]));
//     }, [rawSheetData]);

//     // Helper to get unique string values for any column key
//     const getUniqueColumnValues = (colKey: string): string[] => {
//         if (!colKey || rawSheetData.length === 0) return [];
//         const set = new Set<string>();
//         rawSheetData.forEach(item => {
//             let val = item[colKey];
//             if ((colKey === 'readiness' || colKey === 'Overall Readiness') && (!val || val === 'N/A')) {
//                 val = item['readiness'] || item['Overall Readiness'];
//             }
//             if (val !== undefined && val !== null && val !== '') {
//                 let strVal = String(val).trim();
//                 if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
//                 else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
//                 else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';
//                 set.add(strVal);
//             }
//         });
//         return Array.from(set).sort();
//     };

//     // Extract dynamic headers from sheet data for extra table columns
//     const dynamicSheetHeaders = useMemo(() => {
//         if (rawSheetData.length === 0) return [];
//         return Object.keys(rawSheetData[0]).filter(k =>
//             !['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'].includes(k)
//         );
//     }, [rawSheetData]);

//     // Toggle row expansion
//     const toggleRow = (id: string) => {
//         const newSet = new Set(expandedRows);
//         if (newSet.has(id)) newSet.delete(id);
//         else newSet.add(id);
//         setExpandedRows(newSet);
//     };

//     // Dynamic Multi-Filter Logic
//     const filteredData = useMemo(() => {
//         return rawSheetData.filter(learner => {
//             return filtersConfig.filter(f => f.enabled).every(f => {
//                 const paramVal = searchParams.get(`f_${f.columnKey}`) || 'All';
//                 if (paramVal === 'All') return true;

//                 let learnerVal = learner[f.columnKey];
//                 if (f.columnKey === 'readiness' && (!learnerVal || learnerVal === 'N/A')) {
//                     learnerVal = learner['Overall Readiness'] || learner['readiness'];
//                 }

//                 let strVal = (learnerVal === null || learnerVal === undefined || learnerVal === '') ? 'N/A' : String(learnerVal).trim();
//                 if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
//                 else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
//                 else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

//                 return strVal === paramVal;
//             });
//         });
//     }, [rawSheetData, filtersConfig, searchParams]);

//     // Roster search box
//     const rosterData = useMemo(() => {
//         const q = searchTerm.trim().toLowerCase();
//         if (!q) return filteredData;
//         return filteredData.filter(l =>
//             `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
//         );
//     }, [filteredData, searchTerm]);

//     // Paginated Roster Data
//     const paginatedRoster = useMemo(() => {
//         const start = (currentPage - 1) * pageSize;
//         return rosterData.slice(start, start + pageSize);
//     }, [rosterData, currentPage, pageSize]);

//     const totalPages = Math.ceil(rosterData.length / pageSize) || 1;

//     const activeFilterParamsCount = filtersConfig.filter(f => f.enabled && (searchParams.get(`f_${f.columnKey}`) || 'All') !== 'All').length;
//     const filtersActive = activeFilterParamsCount > 0 || searchTerm !== '';

//     const resetFilters = () => {
//         const updates: Record<string, string> = { search: '', page: '1' };
//         filtersConfig.forEach(f => {
//             updates[`f_${f.columnKey}`] = 'All';
//         });
//         updateQuery(updates);
//     };

//     // CSV Export
//     const handleExport = () => {
//         const activeCols = Object.keys(columnVisibility).filter(k => columnVisibility[k]);
//         const header = activeCols.map(c => c.toUpperCase());

//         const rows = filteredData.map(l => {
//             return activeCols.map(col => {
//                 if (col === 'person') return `${l.firstName} ${l.lastName}`;
//                 if (col === 'pathway') return l.pathway;
//                 if (col === 'status') return l.status;
//                 if (col === 'readiness') return l.readiness;
//                 if (col === 'finalScore') return l.finalScore;
//                 return l[col] || '';
//             });
//         });

//         const csv = [header, ...rows]
//             .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
//             .join('\n');

//         const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
//         const url = URL.createObjectURL(blob);
//         const a = document.createElement('a');
//         a.href = url;
//         a.download = `cohort-report-${new Date().toISOString().slice(0, 10)}.csv`;
//         a.click();
//         URL.revokeObjectURL(url);
//     };

//     // Calculate Custom KPI Values
//     const getKpiCalculatedValue = (kpi: KpiConfig): { num: number; suffix: string } => {
//         const total = filteredData.length;
//         if (total === 0) return { num: 0, suffix: kpi.type === 'percentage' ? '%' : '' };

//         if (kpi.type === 'total') {
//             return { num: total, suffix: '' };
//         }

//         const matchCount = filteredData.filter(d => {
//             let val = d[kpi.columnKey];
//             if (kpi.columnKey === 'readiness' && (!val || val === 'N/A')) {
//                 val = d['Overall Readiness'] || d['readiness'];
//             }
//             let strVal = String(val || '').trim();
//             if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
//             else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
//             else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

//             return strVal === kpi.targetValue;
//         }).length;

//         if (kpi.type === 'count') {
//             return { num: matchCount, suffix: '' };
//         }

//         const pct = Math.round((matchCount / total) * 100);
//         return { num: pct, suffix: '%' };
//     };

//     // Fully Dynamic Metric & Comparison Aggregator for ANY column
//     const getChartDataForMetric = (metricKey: string, compareKey?: string) => {
//         if (!metricKey || filteredData.length === 0) return { data: [], compareCategories: [] };

//         if (compareKey && compareKey !== 'none' && compareKey !== metricKey) {
//             const map: Record<string, Record<string, number>> = {};
//             const categoriesSet = new Set<string>();

//             filteredData.forEach(item => {
//                 const primaryVal = String(item[metricKey] || 'N/A').trim() || 'N/A';
//                 const compareVal = String(item[compareKey] || 'N/A').trim() || 'N/A';

//                 categoriesSet.add(compareVal);
//                 if (!map[primaryVal]) map[primaryVal] = {};
//                 map[primaryVal][compareVal] = (map[primaryVal][compareVal] || 0) + 1;
//             });

//             const compareCategories = Array.from(categoriesSet);
//             const data = Object.entries(map).map(([primaryVal, subCounts]) => {
//                 const row: Record<string, any> = { name: primaryVal };
//                 compareCategories.forEach(cat => {
//                     row[cat] = subCounts[cat] || 0;
//                 });
//                 return row;
//             });

//             return { data, compareCategories };
//         }

//         const counts: Record<string, number> = {};
//         filteredData.forEach(item => {
//             const rawVal = item[metricKey];
//             const val = (rawVal === null || rawVal === undefined || rawVal === '') ? 'N/A' : String(rawVal).trim();
//             counts[val] = (counts[val] || 0) + 1;
//         });

//         const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
//         return { data, compareCategories: [] };
//     };

//     // Drag & Drop Handlers
//     const handleDragStart = (e: React.DragEvent, id: string) => {
//         setDraggedWidgetId(id);
//         e.dataTransfer.effectAllowed = 'move';
//         e.dataTransfer.setData('text/plain', id);
//     };

//     const handleDragOver = (e: React.DragEvent, targetId: string) => {
//         e.preventDefault();
//         e.dataTransfer.dropEffect = 'move';
//         if (dragOverWidgetId !== targetId) setDragOverWidgetId(targetId);
//     };

//     const handleDragLeave = (e: React.DragEvent, targetId: string) => {
//         if (dragOverWidgetId === targetId) setDragOverWidgetId(null);
//     };

//     const handleDrop = (e: React.DragEvent, targetId: string) => {
//         e.preventDefault();
//         setDragOverWidgetId(null);

//         if (!draggedWidgetId || draggedWidgetId === targetId) {
//             setDraggedWidgetId(null);
//             return;
//         }

//         const currentList = [...widgetsConfig];
//         const dragIndex = currentList.findIndex(w => w.id === draggedWidgetId);
//         const dropIndex = currentList.findIndex(w => w.id === targetId);

//         if (dragIndex < 0 || dropIndex < 0) {
//             setDraggedWidgetId(null);
//             return;
//         }

//         const itemToMove = currentList[dragIndex];
//         currentList.splice(dragIndex, 1);
//         currentList.splice(dropIndex, 0, itemToMove);

//         setWidgetsConfig(currentList);
//         setDraggedWidgetId(null);
//     };

//     const toggleColumnVisibility = (colKey: string) => {
//         setColumnVisibility(prev => ({ ...prev, [colKey]: !prev[colKey] }));
//     };

//     const updateWidgetType = (widgetId: string, chartType: WidgetConfig['chartType']) => {
//         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, chartType } : w));
//     };

//     const updateWidgetMetric = (widgetId: string, metricKey: string) => {
//         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, metricKey } : w));
//     };

//     const updateWidgetCompareKey = (widgetId: string, compareKey: string) => {
//         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, compareKey } : w));
//     };

//     const updateWidgetTitle = (widgetId: string, title: string) => {
//         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, title } : w));
//     };

//     const toggleWidgetEnabled = (widgetId: string) => {
//         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, enabled: !w.enabled } : w));
//     };

//     const addCustomWidget = () => {
//         const newWidget: WidgetConfig = {
//             id: `widget_custom_${Date.now()}`,
//             title: `Custom Analysis ${widgetsConfig.length + 1}`,
//             enabled: true,
//             chartType: 'bar',
//             metricKey: allSheetColumns[0] || 'gender',
//             compareKey: 'none'
//         };
//         setWidgetsConfig(prev => [...prev, newWidget]);
//     };

//     const deleteWidget = (widgetId: string) => {
//         setWidgetsConfig(prev => prev.filter(w => w.id !== widgetId));
//     };

//     // Filter Builder Functions
//     const addFilter = () => {
//         const col = allSheetColumns[0] || 'gender';
//         const newFilter: FilterConfig = {
//             id: `filter_${Date.now()}`,
//             columnKey: col,
//             label: col.charAt(0).toUpperCase() + col.slice(1),
//             enabled: true
//         };
//         setFiltersConfig(prev => [...prev, newFilter]);
//     };

//     const updateFilterColumn = (filterId: string, colKey: string) => {
//         setFiltersConfig(prev => prev.map(f => f.id === filterId ? {
//             ...f,
//             columnKey: colKey,
//             label: colKey.charAt(0).toUpperCase() + colKey.slice(1)
//         } : f));
//     };

//     const toggleFilterEnabled = (filterId: string) => {
//         setFiltersConfig(prev => prev.map(f => f.id === filterId ? { ...f, enabled: !f.enabled } : f));
//     };

//     const deleteFilter = (filterId: string) => {
//         setFiltersConfig(prev => prev.filter(f => f.id !== filterId));
//     };

//     // KPI Builder Functions
//     const addKpi = () => {
//         const newKpi: KpiConfig = {
//             id: `kpi_custom_${Date.now()}`,
//             label: `Custom Metric ${kpisConfig.length + 1}`,
//             type: 'count',
//             columnKey: allSheetColumns[0] || 'gender',
//             targetValue: 'F',
//             color: CHART_COLORS[kpisConfig.length % CHART_COLORS.length],
//             enabled: true
//         };
//         setKpisConfig(prev => [...prev, newKpi]);
//     };

//     const updateKpi = (kpiId: string, updates: Partial<KpiConfig>) => {
//         setKpisConfig(prev => prev.map(k => k.id === kpiId ? { ...k, ...updates } : k));
//     };

//     const deleteKpi = (kpiId: string) => {
//         setKpisConfig(prev => prev.filter(k => k.id !== kpiId));
//     };

//     const hiddenDetailKeys = ['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'];

//     return (
//         <div className={`fd-root ${fullScreen ? 'fd-root--fixed' : ''}`}>
//             <style>{styles}</style>

//             {/* HUMAN BOT VERIFICATION CHECK */}
//             {!isHumanVerified && (
//                 <HumanVerificationGate onVerify={handleHumanVerified} />
//             )}

//             {/* HERO HEADER */}
//             <div className="fd-hero">
//                 <div>
//                     <div className="fd-hero-brand">
//                         {logoSrc ? <img src={logoSrc} alt="mLab Logo" height={28} /> : <img src={mLabLogo} alt="mLab Logo" height={28} />}
//                         <span className="fd-hero-divider" />
//                         <div className="fd-eyebrow">
//                             <span className="fd-live-dot" />
//                             {sheetLoading ? 'Syncing spreadsheet...' : 'Live cohort data'}
//                         </div>
//                     </div>
//                     <h1 className="fd-title">Cohort Analytics &amp; Reporting</h1>
//                     <p className="fd-subtitle">Real-time insights synced from centralized GIZ spreadsheets.</p>
//                 </div>
//                 <div className="fd-hero-actions">
//                     <button className="fd-btn fd-btn--glass" onClick={handleExport} title="Export filtered records and visible columns to CSV">
//                         <Download size={14} /> Export report (CSV)
//                     </button>
//                     <button className="fd-btn fd-btn--glass" onClick={refetch} disabled={sheetLoading} title="Pull latest data from Google Sheets">
//                         <RotateCcw size={14} className={sheetLoading ? 'animate-spin' : ''} /> Refetch
//                     </button>
//                     <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(true)} title="Customize layout, cards, and chart types">
//                         <Settings2 size={14} /> Customize layout
//                     </button>
//                 </div>
//             </div>

//             {/* CONTROLS BAR (fixed): tabs + dynamic filters */}
//             <div className="fd-controls">

//                 {/* TAB NAVIGATION */}
//                 <div className="fd-tabs" data-active={activeTab} role="tablist">
//                     <span className="fd-tab-thumb" />
//                     <button
//                         role="tab"
//                         aria-selected={activeTab === 'dashboard'}
//                         className={`fd-tab ${activeTab === 'dashboard' ? 'fd-tab--active' : ''}`}
//                         onClick={() => setActiveTab('dashboard')}
//                     >
//                         <LayoutDashboard size={16} /> Analytics dashboard
//                     </button>
//                     <button
//                         role="tab"
//                         aria-selected={activeTab === 'roster'}
//                         className={`fd-tab ${activeTab === 'roster' ? 'fd-tab--active' : ''}`}
//                         onClick={() => setActiveTab('roster')}
//                     >
//                         <TableIcon size={16} /> Learner roster
//                     </button>
//                 </div>

//                 {/* DYNAMIC FILTERS BAR */}
//                 <div className="fd-filters">
//                     <div className="fd-filter-label"><Filter size={15} /> Filters</div>

//                     {filtersConfig.filter(f => f.enabled).map(f => {
//                         const val = searchParams.get(`f_${f.columnKey}`) || 'All';
//                         const options = getUniqueColumnValues(f.columnKey);

//                         return (
//                             <FilterSelect
//                                 key={f.id}
//                                 label={`Filter by ${f.label}`}
//                                 value={val}
//                                 onChange={v => updateQuery({ [`f_${f.columnKey}`]: v, page: 1 })}
//                             >
//                                 <option value="All">All {f.label.toLowerCase()}s</option>
//                                 {options.map(opt => (
//                                     <option key={opt} value={opt}>{opt}</option>
//                                 ))}
//                             </FilterSelect>
//                         );
//                     })}

//                     {filtersActive && (
//                         <div className="fd-chip">
//                             Showing {filteredData.length} of {rawSheetData.length} records
//                             <button onClick={resetFilters}><RotateCcw size={11} /> Reset</button>
//                         </div>
//                     )}
//                 </div>
//             </div>

//             {/* MAIN REGION */}
//             <div className="fd-main fd-scroll">

//                 {sheetLoading && (
//                     <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
//                         <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--mlab-blue)' }} />
//                         <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Fetching live data from Google Sheets...</div>
//                     </div>
//                 )}

//                 {error && (
//                     <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c', fontSize: '0.85rem' }}>
//                         ⚠️ {error}
//                     </div>
//                 )}

//                 {!sheetLoading && (
//                     <>
//                         {/* TAB CONTENT: DASHBOARD */}
//                         {activeTab === 'dashboard' && (
//                             <div className={`fd-dash ${draggedWidgetId ? 'fd-dash--dragging' : ''}`}>

//                                 {/* DYNAMIC KPI CARDS */}
//                                 <div className="fd-kpis">
//                                     {kpisConfig.filter(k => k.enabled).map((kpi, idx) => {
//                                         const { num, suffix } = getKpiCalculatedValue(kpi);
//                                         const icon = kpi.columnKey === 'gender' ? (kpi.targetValue === 'M' ? <Mars size={18} /> : <Venus size={18} />) :
//                                             kpi.columnKey === 'readiness' ? <Briefcase size={18} /> : <Users size={18} />;

//                                         return (
//                                             <KpiCard
//                                                 key={kpi.id}
//                                                 icon={icon}
//                                                 label={kpi.label}
//                                                 value={num}
//                                                 suffix={suffix}
//                                                 color={kpi.color}
//                                                 delay={0.05 + idx * 0.05}
//                                             />
//                                         );
//                                     })}
//                                 </div>

//                                 {/* DRAGGABLE CHARTS GRID */}
//                                 <div className="fd-charts-scroll fd-scroll">
//                                     <div className="fd-charts">
//                                         {widgetsConfig.filter(w => w.enabled).map((widget, index) => {
//                                             const { data: chartData, compareCategories } = getChartDataForMetric(widget.metricKey, widget.compareKey);
//                                             const isEditingThis = editingWidgetId === widget.id;
//                                             const isDraggingThis = draggedWidgetId === widget.id;
//                                             const isDragOverThis = dragOverWidgetId === widget.id;
//                                             const hasComparison = compareCategories.length > 0;

//                                             return (
//                                                 <div
//                                                     key={widget.id}
//                                                     className={`fd-card ${isDraggingThis ? 'fd-card--dragging' : ''} ${isDragOverThis ? 'fd-card--drag-over' : ''}`}
//                                                     style={{ animationDelay: `${0.3 + index * 0.06}s` }}
//                                                     draggable
//                                                     onDragStart={(e) => handleDragStart(e, widget.id)}
//                                                     onDragOver={(e) => handleDragOver(e, widget.id)}
//                                                     onDragLeave={(e) => handleDragLeave(e, widget.id)}
//                                                     onDrop={(e) => handleDrop(e, widget.id)}
//                                                 >
//                                                     <div className="fd-card-head">
//                                                         <div className="fd-card-title-wrap">
//                                                             <span className="fd-drag-handle" title="Click & Drag to reorder card">
//                                                                 <GripVertical size={16} />
//                                                             </span>
//                                                             <h3 className="fd-card-title">
//                                                                 {widget.title}
//                                                                 {hasComparison && (
//                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
//                                                                         (vs. {widget.compareKey})
//                                                                     </span>
//                                                                 )}
//                                                             </h3>
//                                                         </div>

//                                                         <div style={{ position: 'relative' }}>
//                                                             <button
//                                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
//                                                                 onClick={() => setEditingWidgetId(isEditingThis ? null : widget.id)}
//                                                             >
//                                                                 Edit <ChevronDown size={12} />
//                                                             </button>

//                                                             {/* INLINE EDIT POPOVER */}
//                                                             {isEditingThis && (
//                                                                 <div className="fd-popover">
//                                                                     <div className="fd-popover-title">Chart Type</div>
//                                                                     <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'bar')}>
//                                                                         <span>Vertical Bar</span> {widget.chartType === 'bar' && <Check size={14} color={GREEN} />}
//                                                                     </div>
//                                                                     <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'horizontal_bar')}>
//                                                                         <span>Horizontal Bar</span> {widget.chartType === 'horizontal_bar' && <Check size={14} color={GREEN} />}
//                                                                     </div>
//                                                                     <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'pie')}>
//                                                                         <span>Pie Chart</span> {widget.chartType === 'pie' && <Check size={14} color={GREEN} />}
//                                                                     </div>
//                                                                     <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'donut')}>
//                                                                         <span>Donut Chart</span> {widget.chartType === 'donut' && <Check size={14} color={GREEN} />}
//                                                                     </div>

//                                                                     <div className="fd-popover-title" style={{ marginTop: '8px' }}>Column to Analyze</div>
//                                                                     {allSheetColumns.map(col => (
//                                                                         <div key={col} className="fd-popover-item" onClick={() => updateWidgetMetric(widget.id, col)}>
//                                                                             <span>{col}</span> {widget.metricKey === col && <Check size={14} color={GREEN} />}
//                                                                         </div>
//                                                                     ))}
//                                                                 </div>
//                                                             )}
//                                                         </div>
//                                                     </div>

//                                                     <div className="fd-chart">
//                                                         <div className="fd-chart-inner">
//                                                             <ResponsiveContainer width="100%" height="100%">
//                                                                 {widget.chartType === 'bar' ? (
//                                                                     <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
//                                                                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4eaf0" />
//                                                                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
//                                                                         <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
//                                                                         <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
//                                                                         {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

//                                                                         {hasComparison ? (
//                                                                             compareCategories.map((cat, catIdx) => (
//                                                                                 <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[6, 6, 0, 0]} />
//                                                                             ))
//                                                                         ) : (
//                                                                             <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={900}>
//                                                                                 {chartData.map((_, i) => (
//                                                                                     <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
//                                                                                 ))}
//                                                                             </Bar>
//                                                                         )}
//                                                                     </BarChart>
//                                                                 ) : widget.chartType === 'horizontal_bar' ? (
//                                                                     <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
//                                                                         <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4eaf0" />
//                                                                         <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
//                                                                         <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#0b1f33', fontWeight: 600 }} />
//                                                                         <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
//                                                                         {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

//                                                                         {hasComparison ? (
//                                                                             compareCategories.map((cat, catIdx) => (
//                                                                                 <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[0, 6, 6, 0]} barSize={20} />
//                                                                             ))
//                                                                         ) : (
//                                                                             <Bar dataKey="value" fill={BLUE} radius={[0, 8, 8, 0]} barSize={28} animationDuration={900} />
//                                                                         )}
//                                                                     </BarChart>
//                                                                 ) : (
//                                                                     <PieChart>
//                                                                         <Pie
//                                                                             data={chartData}
//                                                                             cx="50%"
//                                                                             cy="46%"
//                                                                             innerRadius={widget.chartType === 'donut' ? 62 : 0}
//                                                                             outerRadius={92}
//                                                                             paddingAngle={widget.chartType === 'donut' ? 3 : 0}
//                                                                             cornerRadius={widget.chartType === 'donut' ? 6 : 0}
//                                                                             dataKey="value"
//                                                                             stroke="#fff"
//                                                                             strokeWidth={2}
//                                                                             animationDuration={900}
//                                                                         >
//                                                                             {chartData.map((_, i) => (
//                                                                                 <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
//                                                                             ))}
//                                                                         </Pie>
//                                                                         <RechartsTooltip contentStyle={tooltipStyle} />
//                                                                         <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
//                                                                     </PieChart>
//                                                                 )}
//                                                             </ResponsiveContainer>
//                                                         </div>
//                                                     </div>

//                                                 </div>
//                                             )
//                                         })}
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* TAB CONTENT: ROSTER TABLE */}
//                         {activeTab === 'roster' && (
//                             <div className="fd-table-card">

//                                 <div className="fd-toolbar">
//                                     <div className="fd-search-wrap">
//                                         <Search size={15} />
//                                         <input
//                                             className="fd-search"
//                                             type="text"
//                                             placeholder="Search learners by name or email..."
//                                             value={searchTerm}
//                                             onChange={e => setSearchTerm(e.target.value)}
//                                             aria-label="Search learners"
//                                         />
//                                     </div>

//                                     {/* COLUMNS DROPDOWN TOGGLE */}
//                                     <div style={{ position: 'relative' }}>
//                                         <button
//                                             className="fd-btn fd-btn--ghost"
//                                             onClick={() => setShowColumnDropdown(!showColumnDropdown)}
//                                         >
//                                             Columns <ChevronDown size={14} />
//                                         </button>

//                                         {showColumnDropdown && (
//                                             <div className="fd-popover" style={{ minWidth: '240px' }}>
//                                                 <div className="fd-popover-title">Toggle Table Columns</div>
//                                                 <div className="fd-popover-item" onClick={() => toggleColumnVisibility('person')}>
//                                                     <span>Learner Name / Email</span>
//                                                     {columnVisibility.person ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                 </div>
//                                                 <div className="fd-popover-item" onClick={() => toggleColumnVisibility('pathway')}>
//                                                     <span>Pathway</span>
//                                                     {columnVisibility.pathway ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                 </div>
//                                                 <div className="fd-popover-item" onClick={() => toggleColumnVisibility('status')}>
//                                                     <span>Status</span>
//                                                     {columnVisibility.status ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                 </div>
//                                                 <div className="fd-popover-item" onClick={() => toggleColumnVisibility('readiness')}>
//                                                     <span>Readiness</span>
//                                                     {columnVisibility.readiness ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                 </div>
//                                                 <div className="fd-popover-item" onClick={() => toggleColumnVisibility('finalScore')}>
//                                                     <span>Final Score</span>
//                                                     {columnVisibility.finalScore ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                 </div>

//                                                 {/* Dynamic Headers from Google Sheet */}
//                                                 {dynamicSheetHeaders.length > 0 && (
//                                                     <>
//                                                         <div className="fd-popover-title" style={{ marginTop: '8px' }}>Google Sheet Extra Columns</div>
//                                                         {dynamicSheetHeaders.map(colKey => (
//                                                             <div key={colKey} className="fd-popover-item" onClick={() => toggleColumnVisibility(colKey)}>
//                                                                 <span>{colKey}</span>
//                                                                 {columnVisibility[colKey] ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
//                                                             </div>
//                                                         ))}
//                                                     </>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>

//                                 <div className="fd-table-scroll fd-scroll">
//                                     <table className="fd-table">
//                                         <thead>
//                                             <tr>
//                                                 {columnVisibility.person && <th>Learner</th>}
//                                                 {columnVisibility.pathway && <th>Pathway</th>}
//                                                 {columnVisibility.status && <th>Status</th>}
//                                                 {columnVisibility.readiness && <th>Readiness</th>}
//                                                 {columnVisibility.finalScore && <th style={{ textAlign: 'right' }}>Final score</th>}

//                                                 {dynamicSheetHeaders.map(colKey => (
//                                                     columnVisibility[colKey] && <th key={colKey}>{colKey}</th>
//                                                 ))}
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {paginatedRoster.map((learner, i) => {
//                                                 const isExpanded = expandedRows.has(learner.id);
//                                                 const visibleColsCount = Object.keys(columnVisibility).filter(k => columnVisibility[k]).length;

//                                                 return (
//                                                     <React.Fragment key={learner.id}>
//                                                         <tr
//                                                             onClick={() => toggleRow(learner.id)}
//                                                             className={isExpanded ? 'fd-row--expanded' : ''}
//                                                             style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
//                                                         >
//                                                             {columnVisibility.person && (
//                                                                 <td>
//                                                                     <div className="fd-person">
//                                                                         <ChevronRight size={16} className="fd-row-chevron" />
//                                                                         <div className="fd-avatar">{learner.firstName[0] || 'L'}{(learner.lastName[0] || '')}</div>
//                                                                         <div>
//                                                                             <div className="fd-name">{learner.firstName} {learner.lastName}</div>
//                                                                             <div className="fd-email">{learner.email}</div>
//                                                                         </div>
//                                                                     </div>
//                                                                 </td>
//                                                             )}
//                                                             {columnVisibility.pathway && <td>{learner.pathway}</td>}
//                                                             {columnVisibility.status && <td><span className={`fd-pill ${statusPill(learner.status)}`}>{learner.status}</span></td>}
//                                                             {columnVisibility.readiness && <td>{learner.readiness}</td>}
//                                                             {columnVisibility.finalScore && (
//                                                                 <td>
//                                                                     <div className="fd-score">
//                                                                         <div className="fd-score-bar">
//                                                                             <div className="fd-score-fill" style={{ width: `${Math.min(100, learner.finalScore)}%`, background: scoreColor(learner.finalScore) }} />
//                                                                         </div>
//                                                                         <span className="fd-score-num">{learner.finalScore}%</span>
//                                                                     </div>
//                                                                 </td>
//                                                             )}

//                                                             {/* Dynamic extra column values */}
//                                                             {dynamicSheetHeaders.map(colKey => {
//                                                                 let displayValue = (learner[colKey] === '' || learner[colKey] === null || learner[colKey] === undefined) ? 'N/A' : String(learner[colKey]).trim();

//                                                                 if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
//                                                                 else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
//                                                                 else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

//                                                                 return columnVisibility[colKey] && (
//                                                                     <td key={colKey}>{displayValue}</td>
//                                                                 );
//                                                             })}
//                                                         </tr>

//                                                         {/* EXPANDED ROW DETAILS ACCORDION */}
//                                                         {isExpanded && (
//                                                             <tr>
//                                                                 <td colSpan={visibleColsCount} style={{ padding: 0, border: 'none' }}>
//                                                                     <div className="fd-expanded-panel">
//                                                                         <div className="fd-expanded-inner">
//                                                                             <div className="fd-expanded-header">
//                                                                                 <Info size={16} /> Complete Dataset Record
//                                                                             </div>
//                                                                             <div className="fd-expanded-grid">
//                                                                                 {Object.entries(learner).map(([key, value]) => {
//                                                                                     if (hiddenDetailKeys.includes(key)) return null;

//                                                                                     let displayValue = (value === '' || value === null || value === undefined) ? 'N/A' : String(value).trim();

//                                                                                     if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
//                                                                                     else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
//                                                                                     else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

//                                                                                     return (
//                                                                                         <div key={key} className="fd-expanded-item">
//                                                                                             <span className="fd-expanded-label">{key}</span>
//                                                                                             <span className="fd-expanded-value">
//                                                                                                 {displayValue === 'Passed' || displayValue === 'Attended' ? (
//                                                                                                     <span style={{ color: '#15803d', background: '#e8f5d0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                                                                                         <CheckCircle2 size={13} /> {displayValue}
//                                                                                                     </span>
//                                                                                                 ) : displayValue === 'Failed' || displayValue === 'Did not Attended' ? (
//                                                                                                     <span style={{ color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                                                                                         <XCircle size={13} /> {displayValue}
//                                                                                                     </span>
//                                                                                                 ) : displayValue === 'Not Attempted' ? (
//                                                                                                     <span style={{ color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                                                                                         <MinusCircle size={13} /> Not Attempted
//                                                                                                     </span>
//                                                                                                 ) : (
//                                                                                                     displayValue
//                                                                                                 )}
//                                                                                             </span>
//                                                                                         </div>
//                                                                                     );
//                                                                                 })}
//                                                                             </div>
//                                                                         </div>
//                                                                     </div>
//                                                                 </td>
//                                                             </tr>
//                                                         )}
//                                                     </React.Fragment>
//                                                 );
//                                             })}
//                                             {rosterData.length === 0 && (
//                                                 <tr>
//                                                     <td colSpan={5} className="fd-empty">
//                                                         No learners match the current filter criteria.
//                                                     </td>
//                                                 </tr>
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>

//                                 {/* PAGINATION CONTROLS */}
//                                 <div className="fd-table-foot">
//                                     <span>
//                                         Showing {rosterData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, rosterData.length)} of {rosterData.length} records
//                                     </span>
//                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                         <select
//                                             value={pageSize}
//                                             onChange={e => setPageSize(Number(e.target.value))}
//                                             style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
//                                         >
//                                             <option value={10}>10 per page</option>
//                                             <option value={15}>15 per page</option>
//                                             <option value={25}>25 per page</option>
//                                             <option value={50}>50 per page</option>
//                                             <option value={100}>100 per page</option>
//                                         </select>

//                                         <button
//                                             className="fd-btn fd-btn--ghost fd-btn--sm"
//                                             disabled={currentPage <= 1}
//                                             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                                         >
//                                             Previous
//                                         </button>
//                                         <span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span>
//                                         <button
//                                             className="fd-btn fd-btn--ghost fd-btn--sm"
//                                             disabled={currentPage >= totalPages}
//                                             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                                         >
//                                             Next
//                                         </button>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}
//                     </>
//                 )}

//             </div>


//             {/* ENHANCED CUSTOMIZE LAYOUT MODAL */}
//             {
//                 showCustomizeModal && (
//                     <div className="fd-modal-overlay" onClick={() => setShowCustomizeModal(false)}>
//                         <div className="fd-modal" onClick={e => e.stopPropagation()}>
//                             <div className="fd-modal-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
//                                     <SlidersHorizontal size={18} /> Customize Funder Dashboard &amp; Analytics
//                                 </div>
//                                 <button onClick={() => setShowCustomizeModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
//                                     <X size={18} />
//                                 </button>
//                             </div>

//                             <div className="fd-modal-body">
//                                 {/* 1. FILTER BAR CUSTOMIZER */}
//                                 <div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
//                                         <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
//                                             Filter Bar Dropdowns
//                                         </div>
//                                         <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addFilter} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
//                                             <Plus size={14} /> Add Filter Dropdown
//                                         </button>
//                                     </div>

//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                         {filtersConfig.map(f => (
//                                             <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '10px' }}>
//                                                 <input type="checkbox" checked={f.enabled} onChange={() => toggleFilterEnabled(f.id)} title="Toggle Filter Visibility" />
//                                                 <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fd-blue)', minWidth: '90px' }}>{f.label}:</span>
//                                                 <select
//                                                     value={f.columnKey}
//                                                     onChange={e => updateFilterColumn(f.id, e.target.value)}
//                                                     style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
//                                                 >
//                                                     {allSheetColumns.map(col => (
//                                                         <option key={col} value={col}>{col}</option>
//                                                     ))}
//                                                 </select>
//                                                 <button onClick={() => deleteFilter(f.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
//                                                     <Trash2 size={15} />
//                                                 </button>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 </div>

//                                 {/* 2. KPI FLAT STATS BUILDER */}
//                                 <div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
//                                         <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
//                                             KPI Summary Cards
//                                         </div>
//                                         <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addKpi} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
//                                             <Plus size={14} /> Add KPI Card
//                                         </button>
//                                     </div>

//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                                         {kpisConfig.map(kpi => (
//                                             <div key={kpi.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                     <input type="checkbox" checked={kpi.enabled} onChange={e => updateKpi(kpi.id, { enabled: e.target.checked })} />
//                                                     <input
//                                                         type="text"
//                                                         value={kpi.label}
//                                                         onChange={e => updateKpi(kpi.id, { label: e.target.value })}
//                                                         placeholder="KPI Label..."
//                                                         style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fd-blue)' }}
//                                                     />
//                                                     <input
//                                                         type="color"
//                                                         value={kpi.color}
//                                                         onChange={e => updateKpi(kpi.id, { color: e.target.value })}
//                                                         style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer' }}
//                                                     />
//                                                     <button onClick={() => deleteKpi(kpi.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
//                                                         <Trash2 size={15} />
//                                                     </button>
//                                                 </div>

//                                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
//                                                     <div>
//                                                         <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Calculation</label>
//                                                         <select
//                                                             value={kpi.type}
//                                                             onChange={e => updateKpi(kpi.id, { type: e.target.value as any })}
//                                                             style={{ width: '100%', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
//                                                         >
//                                                             <option value="total">Total Records Count</option>
//                                                             <option value="percentage">% Matching Condition</option>
//                                                             <option value="count">Count Matching Condition</option>
//                                                         </select>
//                                                     </div>

//                                                     {kpi.type !== 'total' && (
//                                                         <>
//                                                             <div>
//                                                                 <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Column Key</label>
//                                                                 <select
//                                                                     value={kpi.columnKey}
//                                                                     onChange={e => updateKpi(kpi.id, { columnKey: e.target.value })}
//                                                                     style={{ width: '100%', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
//                                                                 >
//                                                                     {allSheetColumns.map(col => (
//                                                                         <option key={col} value={col}>{col}</option>
//                                                                     ))}
//                                                                 </select>
//                                                             </div>

//                                                             <div>
//                                                                 <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Target Match Value</label>
//                                                                 <select
//                                                                     value={kpi.targetValue || ''}
//                                                                     onChange={e => updateKpi(kpi.id, { targetValue: e.target.value })}
//                                                                     style={{ width: '100%', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
//                                                                 >
//                                                                     {getUniqueColumnValues(kpi.columnKey).map(val => (
//                                                                         <option key={val} value={val}>{val}</option>
//                                                                     ))}
//                                                                 </select>
//                                                             </div>
//                                                         </>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 </div>

//                                 {/* 3. CHART WIDGET BUILDER SECTION */}
//                                 <div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
//                                         <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
//                                             Custom Analytics Charts
//                                         </div>
//                                         <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addCustomWidget} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
//                                             <Plus size={14} /> Add Analytics Chart
//                                         </button>
//                                     </div>

//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                                         {widgetsConfig.map(w => (
//                                             <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                     <input type="checkbox" checked={w.enabled} onChange={() => toggleWidgetEnabled(w.id)} title="Toggle Card Visibility" />
//                                                     <input
//                                                         type="text"
//                                                         value={w.title}
//                                                         onChange={e => updateWidgetTitle(w.id, e.target.value)}
//                                                         placeholder="Chart Title..."
//                                                         style={{ flex: 1, padding: '4px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 700 }}
//                                                     />
//                                                     <button onClick={() => deleteWidget(w.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }} title="Delete Chart">
//                                                         <Trash2 size={16} />
//                                                     </button>
//                                                 </div>

//                                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
//                                                     <div>
//                                                         <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Primary Column</label>
//                                                         <select
//                                                             value={w.metricKey}
//                                                             onChange={e => updateWidgetMetric(w.id, e.target.value)}
//                                                             style={{ width: '100%', padding: '5px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
//                                                         >
//                                                             {allSheetColumns.map(col => (
//                                                                 <option key={col} value={col}>{col}</option>
//                                                             ))}
//                                                         </select>
//                                                     </div>

//                                                     <div>
//                                                         <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Compare With (Optional)</label>
//                                                         <select
//                                                             value={w.compareKey || 'none'}
//                                                             onChange={e => updateWidgetCompareKey(w.id, e.target.value)}
//                                                             style={{ width: '100%', padding: '5px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
//                                                         >
//                                                             <option value="none">-- None (Single Column) --</option>
//                                                             {allSheetColumns.filter(c => c !== w.metricKey).map(col => (
//                                                                 <option key={col} value={col}>vs. {col}</option>
//                                                             ))}
//                                                         </select>
//                                                     </div>

//                                                     <div>
//                                                         <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Chart Type</label>
//                                                         <select
//                                                             value={w.chartType}
//                                                             onChange={e => updateWidgetType(w.id, e.target.value as any)}
//                                                             style={{ width: '100%', color: 'var(--mlab-blue)', background: 'transparent', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
//                                                         >
//                                                             <option value="bar">Vertical Bar</option>
//                                                             <option value="horizontal_bar">Horizontal Bar</option>
//                                                             <option value="pie">Pie Chart</option>
//                                                             <option value="donut">Donut Chart</option>
//                                                         </select>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="fd-modal-footer">
//                                 <button className="fd-btn fd-btn--ghost" onClick={() => {
//                                     setWidgetsConfig(DEFAULT_WIDGETS);
//                                     setFiltersConfig(DEFAULT_FILTERS);
//                                     setKpisConfig(DEFAULT_KPIS);
//                                     updateQuery({ charts: null, filters: null, kpis: null });
//                                 }}>
//                                     Reset to Default
//                                 </button>
//                                 <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(false)}>
//                                     Done
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                 )
//             }
//         </div >
//     );
// };

// export default FunderDashboardView;


// // // src/pages/AdminDashboard/FunderDashboard/FunderDashboardView.tsx

// // import React, { useState, useMemo, useEffect, useRef } from 'react';
// // import { useSearchParams } from 'react-router-dom';
// // import {
// //     LayoutDashboard,
// //     Table as TableIcon,
// //     Download,
// //     Filter,
// //     ChevronDown,
// //     ChevronRight,
// //     Users,
// //     GraduationCap,
// //     AlertTriangle,
// //     Search,
// //     Settings2,
// //     RotateCcw,
// //     Venus,
// //     Mars,
// //     Briefcase,
// //     Loader2,
// //     Info,
// //     CheckCircle2,
// //     XCircle,
// //     SlidersHorizontal,
// //     Eye,
// //     EyeOff,
// //     X,
// //     Check,
// //     Plus,
// //     Trash2,
// //     MinusCircle,
// //     GripVertical,
// //     Activity
// // } from 'lucide-react';
// // import {
// //     PieChart, Pie, Cell,
// //     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
// // } from 'recharts';
// // import { useSheetData } from '../../../services/useSheetData';

// // // GOOGLE SHEET PUBLISHED CSV URL
// // const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTLUYX9T5uy5LWs3Wt_HoCj4nr0LhMAo3x5cyI4G2V4O7B1NJNAyIauCN-ZqbVlW3kCVKlnWlCU9F9/pub?gid=0&single=true&output=csv';

// // const GREEN = 'var(--mlab-green, #94c73d)';
// // const BLUE = 'var(--mlab-blue, #002b49)';
// // const RED = '#ef4444';
// // const CHART_COLORS = ['#94c73d', '#002b49', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// // import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

// // export interface WidgetConfig {
// //     id: string;
// //     title: string;
// //     enabled: boolean;
// //     chartType: 'bar' | 'horizontal_bar' | 'pie' | 'donut';
// //     metricKey: string;
// //     compareKey?: string;
// // }

// // export interface FilterConfig {
// //     id: string;
// //     columnKey: string;
// //     label: string;
// //     enabled: boolean;
// // }

// // export interface KpiConfig {
// //     id: string;
// //     label: string;
// //     type: 'total' | 'percentage' | 'count';
// //     columnKey: string;
// //     targetValue?: string;
// //     color: string;
// //     enabled: boolean;
// // }

// // const DEFAULT_WIDGETS: WidgetConfig[] = [
// //     { id: 'widget_status', title: 'Programme Status', enabled: true, chartType: 'bar', metricKey: 'status', compareKey: 'none' },
// //     { id: 'widget_gender', title: 'Participant Demographics', enabled: true, chartType: 'donut', metricKey: 'gender', compareKey: 'none' },
// //     { id: 'widget_pathway', title: 'Pathway Distribution', enabled: true, chartType: 'horizontal_bar', metricKey: 'pathway', compareKey: 'none' },
// //     { id: 'widget_readiness', title: 'Work Readiness Status', enabled: true, chartType: 'pie', metricKey: 'readiness', compareKey: 'none' },
// // ];

// // const DEFAULT_FILTERS: FilterConfig[] = [
// //     { id: 'filter_gender', columnKey: 'gender', label: 'Gender', enabled: true },
// //     { id: 'filter_pathway', columnKey: 'pathway', label: 'Pathway', enabled: true },
// //     { id: 'filter_readiness', columnKey: 'readiness', label: 'Work-Readiness', enabled: true },
// // ];

// // const DEFAULT_KPIS: KpiConfig[] = [
// //     { id: 'kpi_total', label: 'Total Active', type: 'total', columnKey: '', color: '#38bdf8', enabled: true },
// //     { id: 'kpi_female', label: 'Female Representation', type: 'percentage', columnKey: 'gender', targetValue: 'F', color: '#ec4899', enabled: true },
// //     { id: 'kpi_readiness', label: 'Overall Work-Readiness', type: 'percentage', columnKey: 'readiness', targetValue: 'Placement Ready', color: '#94c73d', enabled: true },
// //     { id: 'kpi_male', label: 'Male Representation', type: 'percentage', columnKey: 'gender', targetValue: 'M', color: '#3b82f6', enabled: true },
// // ];

// // const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
// //     person: true,
// //     pathway: true,
// //     status: true,
// //     readiness: true,
// //     finalScore: true,
// // };

// // /* ------------------------------------------------------------------ */
// // /* Scoped Styles                                                       */
// // /* ------------------------------------------------------------------ */
// // const styles = `
// // @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

// // .fd-root {
// //     --fd-blue: var(--mlab-blue, #002b49);
// //     --fd-green: var(--mlab-green, #94c73d);
// //     --fd-ink: #0b1f33;
// //     --fd-muted: #5b6b7c;
// //     --fd-line: #e4eaf0;
// //     display: flex;
// //     flex-direction: column;
// //     position: relative;
// //     width: 100%;
// //     height: 100%;
// //     min-height: 0;
// //     overflow: hidden;
// //     background:
// //         radial-gradient(900px 420px at 50% -120px, color-mix(in srgb, var(--fd-blue) 10%, transparent), transparent 70%),
// //         radial-gradient(500px 300px at 100% 100%, color-mix(in srgb, var(--fd-green) 14%, transparent), transparent 70%),
// //         #f3f6f9;
// //     font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
// //     color: var(--fd-ink);
// // }
// // .fd-root *, .fd-root *::before, .fd-root *::after { box-sizing: border-box; }
// // .fd-root--fixed { position: fixed; inset: 0; height: 100dvh; z-index: 10; }

// // .fd-scroll { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--fd-blue) 35%, transparent) transparent; }
// // .fd-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
// // .fd-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fd-blue) 30%, transparent); border-radius: 8px; }
// // .fd-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--fd-blue) 55%, transparent); }

// // /* ---------- Hero header ---------- */
// // .fd-hero {
// //     position: relative;
// //     overflow: hidden;
// //     flex-shrink: 0;
// //     z-index: 3;
// //     padding: 1.05rem 1.5rem 1.2rem;
// //     color: #fff;
// //     display: flex;
// //     justify-content: space-between;
// //     align-items: flex-end;
// //     flex-wrap: wrap;
// //     gap: 1rem;
// //     background:
// //         radial-gradient(420px 220px at 90% 0%, color-mix(in srgb, var(--fd-green) 38%, transparent), transparent 65%),
// //         linear-gradient(135deg, var(--fd-blue) 0%, color-mix(in srgb, var(--fd-blue) 82%, #000) 100%);
// //     box-shadow: 0 10px 30px -18px rgba(0, 43, 73, 0.6);
// //     animation: fd-fade 0.5s ease both;
// // }
// // .fd-hero::before {
// //     content: '';
// //     position: absolute;
// //     inset: 0;
// //     background-image:
// //         linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
// //         linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
// //     background-size: 28px 28px;
// //     mask-image: radial-gradient(ellipse at 70% 30%, #000 10%, transparent 70%);
// //     -webkit-mask-image: radial-gradient(ellipse at 70% 30%, #000 10%, transparent 70%);
// //     animation: fd-grid-drift 18s linear infinite;
// // }
// // .fd-hero::after {
// //     content: '';
// //     position: absolute;
// //     left: 0; right: 0; bottom: 0;
// //     height: 4px;
// //     background: linear-gradient(90deg, var(--fd-green), color-mix(in srgb, var(--fd-green) 40%, #fff), var(--fd-green));
// //     background-size: 200% 100%;
// //     animation: fd-shimmer-line 4s linear infinite;
// // }
// // .fd-hero > * { position: relative; z-index: 1; }

// // .fd-hero-brand {
// //     display: flex;
// //     align-items: center;
// //     gap: 14px;
// //     margin-bottom: 4px;
// // }
// // .fd-hero-divider {
// //     width: 1px;
// //     height: 22px;
// //     background: rgba(255, 255, 255, 0.25);
// // }

// // .fd-eyebrow {
// //     display: inline-flex; align-items: center; gap: 8px;
// //     font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
// //     color: rgba(255,255,255,0.75);
// // }
// // .fd-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fd-green); animation: fd-blink 2.2s ease-in-out infinite; }
// // .fd-title { margin: 0; font-size: clamp(1.2rem, 2.4vw, 1.6rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
// // .fd-subtitle { margin: 4px 0 0; font-size: 0.85rem; color: rgba(255,255,255,0.72); font-weight: 500; }
// // .fd-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }

// // /* ---------- Buttons ---------- */
// // .fd-btn {
// //     display: inline-flex; align-items: center; justify-content: center; gap: 8px;
// //     padding: 0.65rem 1rem;
// //     border-radius: 12px;
// //     border: 1px solid transparent;
// //     font: inherit; font-size: 0.8rem; font-weight: 700;
// //     cursor: pointer;
// //     transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.2s ease, border-color 0.2s ease, filter 0.18s ease;
// // }
// // .fd-btn:hover:not(:disabled) { transform: translateY(-2px); }
// // .fd-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
// // .fd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
// // .fd-btn--primary { background: var(--fd-green); color: var(--fd-blue); box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--fd-green) 90%, #000); }
// // .fd-btn--primary:hover { filter: brightness(1.05); }
// // .fd-btn--glass { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.28); backdrop-filter: blur(6px); }
// // .fd-btn--glass:hover { background: rgba(255,255,255,0.18); }
// // .fd-btn--ghost { background: #fff; color: var(--fd-blue); border-color: var(--fd-line); }
// // .fd-btn--ghost:hover:not(:disabled) { border-color: var(--fd-blue); }
// // .fd-btn--sm { padding: 0.4rem 0.7rem; font-size: 0.72rem; border-radius: 99px; }

// // /* ---------- Controls bar (fixed): tabs + filters ---------- */
// // .fd-controls {
// //     flex-shrink: 0;
// //     z-index: 2;
// //     display: flex; align-items: center; gap: 0.9rem 1.25rem; flex-wrap: wrap;
// //     padding: 0.65rem 1.5rem;
// //     background: rgba(255,255,255,0.92);
// //     backdrop-filter: blur(10px);
// //     border-bottom: 1px solid var(--fd-line);
// //     animation: fd-rise 0.55s 0.12s ease both;
// // }
// // .fd-filters {
// //     flex: 1; min-width: 0;
// //     display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
// // }
// // .fd-filter-label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fd-muted); }
// // .fd-filter-label svg { color: var(--fd-blue); }
// // .fd-select-wrap { position: relative; }
// // .fd-select {
// //     appearance: none; -webkit-appearance: none;
// //     padding: 0.55rem 2rem 0.55rem 0.9rem;
// //     border: 1.5px solid #d5dde6;
// //     border-radius: 10px;
// //     background: #f8fafc;
// //     font: inherit; font-size: 0.8rem; font-weight: 600; color: var(--fd-ink);
// //     cursor: pointer; outline: none;
// //     transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
// // }
// // .fd-select:hover { background: #fff; }
// // .fd-select:focus { border-color: var(--fd-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 28%, transparent); background: #fff; }
// // .fd-select--active { border-color: var(--fd-blue); background: color-mix(in srgb, var(--fd-blue) 6%, #fff); }
// // .fd-select-wrap svg { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--fd-muted); }
// // .fd-chip {
// //     margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
// //     padding: 0.3rem 0.4rem 0.3rem 0.8rem;
// //     border-radius: 999px;
// //     font-size: 0.74rem; font-weight: 700; color: var(--fd-blue);
// //     background: color-mix(in srgb, var(--fd-green) 20%, #fff);
// //     border: 1px solid color-mix(in srgb, var(--fd-green) 45%, #fff);
// //     animation: fd-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
// // }
// // .fd-chip button {
// //     display: inline-flex; align-items: center; gap: 4px;
// //     border: none; background: var(--fd-blue); color: #fff;
// //     padding: 0.25rem 0.6rem; border-radius: 999px;
// //     font: inherit; font-size: 0.7rem; font-weight: 700; cursor: pointer;
// //     transition: transform 0.15s ease;
// // }
// // .fd-chip button:hover { transform: scale(1.05); }

// // /* ---------- Segmented tabs ---------- */
// // .fd-tabs {
// //     position: relative;
// //     display: inline-grid;
// //     grid-template-columns: 1fr 1fr;
// //     flex-shrink: 0;
// //     padding: 5px;
// //     background: #eef2f6;
// //     border-radius: 14px;
// //     max-width: 100%;
// // }
// // .fd-tab-thumb {
// //     position: absolute;
// //     top: 5px; bottom: 5px; left: 5px;
// //     width: calc(50% - 5px);
// //     border-radius: 10px;
// //     background: var(--fd-blue);
// //     box-shadow: 0 8px 18px -8px var(--fd-blue);
// //     transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
// // }
// // .fd-tabs[data-active='roster'] .fd-tab-thumb { transform: translateX(100%); }
// // .fd-tab {
// //     position: relative; z-index: 1;
// //     display: inline-flex; align-items: center; justify-content: center; gap: 8px;
// //     padding: 0.7rem 1.3rem;
// //     border: none; background: transparent;
// //     font: inherit; font-size: 0.8rem; font-weight: 700;
// //     color: var(--fd-muted);
// //     cursor: pointer; white-space: nowrap;
// //     transition: color 0.25s ease;
// // }
// // .fd-tab--active { color: #fff; }
// // .fd-tab--active svg { color: var(--fd-green); }

// // /* ---------- Main region ---------- */
// // .fd-main {
// //     flex: 1; min-height: 0;
// //     display: flex; flex-direction: column; gap: 1.1rem;
// //     padding: 1.1rem 1.5rem 1.25rem;
// //     overflow-y: auto;
// // }
// // .fd-dash { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1.1rem; }

// // /* ---------- KPI cards ---------- */
// // .fd-kpis { flex-shrink: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
// // .fd-kpi {
// //     position: relative; overflow: hidden;
// //     padding: 1.15rem 1.2rem;
// //     background: #fff;
// //     border: 1px solid var(--fd-line);
// //     border-radius: 18px;
// //     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
// //     transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
// //     animation: fd-rise 0.55s ease both;
// // }
// // .fd-kpi::before {
// //     content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
// //     background: var(--kpi, var(--fd-green));
// // }
// // .fd-kpi::after {
// //     content: ''; position: absolute; right: -30px; top: -30px; width: 110px; height: 110px; border-radius: 50%;
// //     background: radial-gradient(circle, color-mix(in srgb, var(--kpi, var(--fd-green)) 22%, transparent), transparent 70%);
// //     transition: transform 0.4s ease;
// // }
// // .fd-kpi:hover { transform: translateY(-4px); box-shadow: 0 20px 40px -22px rgba(0, 43, 73, 0.4); border-color: color-mix(in srgb, var(--kpi, var(--fd-green)) 50%, #fff); }
// // .fd-kpi:hover::after { transform: scale(1.25); }
// // .fd-kpi-head { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
// // .fd-kpi-icon {
// //     width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
// //     color: var(--fd-blue);
// //     background: color-mix(in srgb, var(--kpi, var(--fd-green)) 18%, #fff);
// //     transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
// // }
// // .fd-kpi:hover .fd-kpi-icon { background: var(--fd-blue); color: var(--fd-green); transform: scale(1.08) rotate(-4deg); }
// // .fd-kpi-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fd-muted); }
// // .fd-kpi-value { position: relative; z-index: 1; font-size: 2.2rem; line-height: 1; font-weight: 800; letter-spacing: -0.03em; color: var(--fd-ink); font-variant-numeric: tabular-nums; }

// // /* ---------- Chart cards & Drag-and-Drop ---------- */
// // .fd-charts-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: -0.5rem; padding: 0.5rem; }
// // .fd-charts {
// //     display: grid;
// //     grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
// //     grid-auto-rows: minmax(290px, 1fr);
// //     gap: 1.1rem;
// //     min-height: 100%;
// // }

// // .fd-dash--dragging .fd-chart { pointer-events: none !important; }

// // .fd-card {
// //     background: #fff;
// //     border: 1px solid var(--fd-line);
// //     border-radius: 20px;
// //     padding: 1.1rem 1.25rem 1rem;
// //     display: flex; flex-direction: column; min-height: 0;
// //     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
// //     transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
// //     animation: fd-rise 0.6s ease both;
// //     position: relative;
// // }
// // .fd-card:hover { transform: translateY(-3px); box-shadow: 0 24px 44px -26px rgba(0, 43, 73, 0.4); }
// // .fd-card--dragging { opacity: 0.35; border: 2px dashed var(--fd-green) !important; transform: scale(0.98); }
// // .fd-card--drag-over { border: 2px solid var(--fd-green) !important; box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 30%, transparent) !important; }

// // .fd-card-head { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 10px; }
// // .fd-card-title-wrap { display: flex; align-items: center; gap: 8px; }
// // .fd-drag-handle { display: inline-flex; align-items: center; cursor: grab; color: #94a3b8; transition: color 0.2s ease; padding: 2px; }
// // .fd-drag-handle:hover { color: var(--fd-blue); }
// // .fd-drag-handle:active { cursor: grabbing; }

// // .fd-card-title { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 0.95rem; font-weight: 800; letter-spacing: -0.01em; color: var(--fd-blue); }
// // .fd-card-title::before { content: ''; width: 4px; height: 18px; border-radius: 2px; background: var(--fd-green); }
// // .fd-chart { position: relative; flex: 1; min-height: 200px; }
// // .fd-chart-inner { position: absolute; inset: 0; }
// // .fd-chart .recharts-surface { overflow: visible; }

// // /* ---------- Roster table ---------- */
// // .fd-table-card {
// //     background: #fff;
// //     border: 1px solid var(--fd-line);
// //     border-radius: 20px;
// //     overflow: hidden;
// //     flex: 1; min-height: 320px;
// //     display: flex; flex-direction: column;
// //     box-shadow: 0 1px 2px rgba(0, 43, 73, 0.05);
// //     animation: fd-rise 0.5s ease both;
// // }
// // .fd-toolbar {
// //     flex-shrink: 0;
// //     display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
// //     padding: 1rem 1.1rem;
// //     border-bottom: 1px solid var(--fd-line);
// //     background: linear-gradient(180deg, #fbfcfd, #f5f8fa);
// //     position: relative;
// // }
// // .fd-search-wrap { position: relative; width: min(100%, 320px); }
// // .fd-search-wrap svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; transition: color 0.2s ease; }
// // .fd-search-wrap:focus-within svg { color: var(--fd-blue); }
// // .fd-search {
// //     width: 100%;
// //     padding: 0.65rem 1rem 0.65rem 2.4rem;
// //     border-radius: 12px;
// //     border: 1.5px solid #d5dde6;
// //     background: #fff;
// //     font: inherit; font-size: 0.82rem; color: var(--fd-ink); outline: none;
// //     transition: border-color 0.2s ease, box-shadow 0.2s ease;
// // }
// // .fd-search::placeholder { color: #94a3b8; }
// // .fd-search:focus { border-color: var(--fd-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fd-green) 28%, transparent); }
// // .fd-table-scroll { flex: 1; min-height: 0; overflow: auto; }
// // .fd-table { width: 100%; min-width: 680px; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
// // .fd-table th {
// //     padding: 0.9rem 1.1rem;
// //     font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
// //     color: var(--fd-muted);
// //     background: #f8fafc;
// //     border-bottom: 1px solid var(--fd-line);
// //     position: sticky; top: 0; z-index: 1;
// // }
// // .fd-table td { padding: 0.9rem 1.1rem; border-bottom: 1px solid #f0f3f6; color: #334155; vertical-align: middle; }
// // .fd-table tbody tr { transition: background-color 0.2s ease; cursor: pointer; }
// // .fd-table tbody tr:hover { background: color-mix(in srgb, var(--fd-green) 8%, #fff); }

// // .fd-row--expanded td { border-bottom: none; background: color-mix(in srgb, var(--fd-blue) 3%, #fff); }

// // .fd-person { display: flex; align-items: center; gap: 12px; }
// // .fd-avatar {
// //     flex-shrink: 0; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
// //     font-size: 0.78rem; font-weight: 800; color: var(--fd-green);
// //     background: linear-gradient(135deg, var(--fd-blue), color-mix(in srgb, var(--fd-blue) 70%, #2563eb));
// //     transition: transform 0.2s ease;
// // }
// // .fd-table tbody tr:hover .fd-avatar { transform: scale(1.08) rotate(-3deg); }
// // .fd-name { font-weight: 700; color: var(--fd-ink); }
// // .fd-email { font-size: 0.75rem; color: var(--fd-muted); }

// // .fd-row-chevron {
// //     color: #94a3b8;
// //     transition: transform 0.2s ease, color 0.2s ease;
// // }
// // .fd-row--expanded .fd-row-chevron {
// //     transform: rotate(90deg);
// //     color: var(--fd-blue);
// // }

// // .fd-expanded-panel {
// //     padding: 0 1.1rem 1.5rem 1.1rem;
// //     background: color-mix(in srgb, var(--fd-blue) 3%, #fff);
// //     border-bottom: 1px solid #f0f3f6;
// //     animation: fd-fade 0.3s ease;
// // }
// // .fd-expanded-inner {
// //     background: #fff;
// //     border: 1px solid var(--fd-line);
// //     border-radius: 12px;
// //     padding: 1.5rem;
// //     box-shadow: 0 4px 12px rgba(0, 43, 73, 0.05);
// // }
// // .fd-expanded-header {
// //     display: flex;
// //     align-items: center;
// //     gap: 8px;
// //     font-size: 0.9rem;
// //     font-weight: 800;
// //     color: var(--fd-blue);
// //     margin-bottom: 1rem;
// //     padding-bottom: 0.8rem;
// //     border-bottom: 1px dashed var(--fd-line);
// // }
// // .fd-expanded-grid {
// //     display: grid;
// //     grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
// //     gap: 1.2rem;
// // }
// // .fd-expanded-item {
// //     display: flex;
// //     flex-direction: column;
// //     gap: 4px;
// // }
// // .fd-expanded-label {
// //     font-size: 0.68rem;
// //     font-weight: 800;
// //     color: #94a3b8;
// //     text-transform: uppercase;
// //     letter-spacing: 0.05em;
// // }
// // .fd-expanded-value {
// //     font-size: 0.82rem;
// //     font-weight: 600;
// //     color: var(--fd-ink);
// //     word-break: break-word;
// // }

// // .fd-pill { display: inline-flex; align-items: center; gap: 6px; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
// // .fd-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
// // .fd-pill--passed { background: #e8f5d0; color: #3f6b0a; }
// // .fd-pill--dropped { background: #fee2e2; color: #b42318; }
// // .fd-pill--progress { background: color-mix(in srgb, var(--fd-blue) 9%, #fff); color: var(--fd-blue); }

// // .fd-score { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
// // .fd-score-bar { width: 70px; height: 6px; border-radius: 999px; background: #e9eef3; overflow: hidden; }
// // .fd-score-fill { height: 100%; border-radius: 999px; transform-origin: left; animation: fd-grow 0.9s 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
// // .fd-score-num { min-width: 52px; text-align: right; font-weight: 800; color: var(--fd-blue); font-variant-numeric: tabular-nums; }
// // .fd-empty { padding: 3rem 1rem; text-align: center; color: #94a3b8; font-weight: 600; }
// // .fd-table-foot {
// //     flex-shrink: 0;
// //     display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
// //     padding: 0.85rem 1.1rem;
// //     border-top: 1px solid var(--fd-line);
// //     background: #f8fafc;
// //     font-size: 0.75rem; font-weight: 600; color: var(--fd-muted);
// // }

// // /* POPOVER MENUS & MODALS */
// // .fd-popover {
// //     position: absolute; right: 0; top: calc(100% + 8px); z-index: 50;
// //     background: #fff; border: 1px solid var(--fd-line); border-radius: 14px;
// //     padding: 12px; min-width: 220px; max-height: 380px; overflow-y: auto;
// //     box-shadow: 0 16px 36px -12px rgba(0,43,73,0.3);
// //     animation: fd-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
// //     scrollbar-width: thin;
// //     scrollbar-color: color-mix(in srgb, var(--fd-blue) 35%, transparent) transparent;
// // }
// // .fd-popover::-webkit-scrollbar { width: 6px; }
// // .fd-popover::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fd-blue) 30%, transparent); border-radius: 6px; }

// // .fd-popover-title {
// //     font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--fd-muted);
// //     padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--fd-line);
// // }
// // .fd-popover-item {
// //     display: flex; align-items: center; justify-content: space-between; gap: 8px;
// //     padding: 6px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;
// //     transition: background-color 0.15s ease;
// // }
// // .fd-popover-item:hover { background: #f1f5f9; }

// // /* MODAL OVERLAY */
// // .fd-modal-overlay {
// //     position: fixed; inset: 0; z-index: 100;
// //     background: rgba(11, 31, 51, 0.6); backdrop-filter: blur(6px);
// //     display: grid; place-items: center; padding: 20px;
// //     animation: fd-fade 0.25s ease;
// // }
// // .fd-modal {
// //     background: #fff; border-radius: 20px; width: min(100%, 720px); max-height: 88vh;
// //     display: flex; flex-direction: column; overflow: hidden;
// //     box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35);
// // }
// // .fd-modal-header {
// //     padding: 1.25rem 1.5rem; background: var(--fd-blue); color: #fff;
// //     display: flex; justify-content: space-between; align-items: center;
// // }
// // .fd-modal-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; }
// // .fd-modal-footer {
// //     padding: 1rem 1.5rem; background: #f8fafc; border-top: 1px solid var(--fd-line);
// //     display: flex; justify-content: space-between; align-items: center;
// // }

// // /* ---------- Intro loader / welcome ---------- */
// // .fd-ld { position: absolute; inset: 0; z-index: 100; overflow: hidden; color: #fff; }
// // .fd-ld-panel { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; transition: transform 1s cubic-bezier(0.77, 0, 0.18, 1); will-change: transform; }
// // .fd-ld-panel--top { top: 0; }
// // .fd-ld-panel--bottom { bottom: 0; }
// // .fd-ld--reveal .fd-ld-panel--top { transform: translateY(-101%); }
// // .fd-ld--reveal .fd-ld-panel--bottom { transform: translateY(101%); }
// // .fd-ld-bg {
// //     position: absolute; left: 0; right: 0; height: 200%;
// //     background:
// //         radial-gradient(520px 320px at 88% 12%, color-mix(in srgb, var(--fd-green) 34%, transparent), transparent 65%),
// //         radial-gradient(480px 300px at 8% 92%, color-mix(in srgb, var(--fd-green) 22%, transparent), transparent 65%),
// //         linear-gradient(135deg, var(--fd-blue) 0%, color-mix(in srgb, var(--fd-blue) 78%, #000) 100%);
// // }
// // .fd-ld-panel--top .fd-ld-bg { top: 0; }
// // .fd-ld-panel--bottom .fd-ld-bg { bottom: 0; }
// // .fd-ld-bg::before {
// //     content: ''; position: absolute; inset: 0;
// //     background-image:
// //         linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
// //         linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
// //     background-size: 32px 32px;
// //     mask-image: radial-gradient(ellipse at center, #000 15%, transparent 72%);
// //     -webkit-mask-image: radial-gradient(ellipse at center, #000 15%, transparent 72%);
// //     animation: fd-grid-drift 14s linear infinite;
// // }
// // .fd-ld-panel--top::after, .fd-ld-panel--bottom::before {
// //     content: ''; position: absolute; left: 0; right: 0; height: 3px; z-index: 2;
// //     background: linear-gradient(90deg, transparent, var(--fd-green), color-mix(in srgb, var(--fd-green) 40%, #fff), var(--fd-green), transparent);
// //     box-shadow: 0 0 22px 2px color-mix(in srgb, var(--fd-green) 70%, transparent);
// //     animation: fd-ld-seam 1.2s 0.2s ease both;
// // }
// // .fd-ld-panel--top::after { bottom: 0; }
// // .fd-ld-panel--bottom::before { top: 0; }

// // .fd-ld-orb { position: absolute; border-radius: 50%; filter: blur(46px); opacity: 0.5; animation: fd-ld-float 9s ease-in-out infinite; pointer-events: none; z-index: 1; }
// // .fd-ld-orb--a { width: 340px; height: 340px; left: -80px; top: 12%; background: color-mix(in srgb, var(--fd-green) 55%, transparent); }
// // .fd-ld-orb--b { width: 420px; height: 420px; right: -120px; bottom: 6%; background: color-mix(in srgb, #2b8cd6 45%, transparent); animation-delay: -4s; }
// // .fd-ld-dot {
// //     position: absolute; bottom: -12px; left: calc(var(--x) * 1%);
// //     width: var(--s); height: var(--s); border-radius: 50%;
// //     background: var(--fd-green); opacity: 0; z-index: 1; pointer-events: none;
// //     animation: fd-ld-dot var(--d) var(--delay) linear infinite;
// // }

// // .fd-ld-center {
// //     position: absolute; inset: 0; z-index: 3;
// //     display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.6rem;
// //     padding: 1.5rem; text-align: center;
// //     transition: opacity 0.45s ease, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
// // }
// // .fd-ld--reveal .fd-ld-center { opacity: 0; transform: scale(1.08); pointer-events: none; }

// // .fd-ld-mark { position: relative; width: 148px; height: 148px; display: grid; place-items: center; animation: fd-pop 0.7s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
// // .fd-ld-orbit { position: absolute; inset: -22px; border-radius: 50%; border: 1px dashed rgba(255,255,255,0.22); animation: fd-ld-spin 22s linear infinite; }
// // .fd-ld-orbit--2 { inset: -44px; border-color: rgba(148,199,61,0.28); animation-duration: 34s; animation-direction: reverse; }
// // .fd-ld-orbit::after { content: ''; position: absolute; top: -4px; left: 50%; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--fd-green); box-shadow: 0 0 14px var(--fd-green); }
// // .fd-ld-ring-svg { position: absolute; inset: 0; transform: rotate(-90deg); }
// // .fd-ld-ring-track { fill: none; stroke: rgba(255,255,255,0.14); stroke-width: 5; }
// // .fd-ld-ring { fill: none; stroke: var(--fd-green); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 96 283; transform-origin: 50% 50%; animation: fd-ld-spin 1.3s linear infinite; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--fd-green) 80%, transparent)); transition: stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
// // .fd-ld-ring--done { stroke-dasharray: 283 0; animation: none; }
// // .fd-ld-core { position: relative; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.08); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.16); }
// // .fd-ld-logo { background: #fff; border-radius: 14px; padding: 8px 12px; box-shadow: 0 10px 24px rgba(0,0,0,0.3); }
// // .fd-ld-logo img { display: block; height: 26px; max-width: 64px; object-fit: contain; }
// // .fd-ld-bars { display: flex; align-items: flex-end; gap: 5px; height: 42px; transition: opacity 0.25s ease, transform 0.25s ease; }
// // .fd-ld-bars--hide { opacity: 0; transform: scale(0.6); position: absolute; }
// // .fd-ld-bars span { width: 7px; height: 100%; border-radius: 4px; background: var(--fd-green); transform-origin: bottom; transform: scaleY(0.3); animation: fd-ld-bar 1.1s ease-in-out infinite alternate; }
// // .fd-ld-bars span:nth-child(1) { animation-delay: 0s; }
// // .fd-ld-bars span:nth-child(2) { animation-delay: 0.18s; background: #fff; }
// // .fd-ld-bars span:nth-child(3) { animation-delay: 0.36s; }
// // .fd-ld-bars span:nth-child(4) { animation-delay: 0.18s; background: #fff; }
// // .fd-ld-bars span:nth-child(5) { animation-delay: 0.72s; }
// // .fd-ld-check { position: absolute; fill: none; stroke: var(--fd-green); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60; stroke-dashoffset: 60; animation: fd-ld-draw 0.55s 0.25s cubic-bezier(0.65, 0, 0.35, 1) forwards; }

// // .fd-ld-text { min-height: 7.2rem; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0.5rem; max-width: 520px; }
// // .fd-ld-eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.7); animation: fd-rise 0.5s ease both; }
// // .fd-ld-title { margin: 0; font-size: clamp(1.4rem, 4vw, 2.3rem); font-weight: 800; letter-spacing: -0.025em; line-height: 1.15; animation: fd-rise 0.55s 0.05s ease both; }
// // .fd-ld-title em { font-style: normal; color: var(--fd-green); }
// // .fd-ld-sub { margin: 0; font-size: 0.92rem; color: rgba(255,255,255,0.75); font-weight: 500; animation: fd-rise 0.55s 0.15s ease both; }
// // .fd-ld-progress { width: min(260px, 70vw); height: 5px; border-radius: 999px; background: rgba(255,255,255,0.14); overflow: hidden; margin-top: 0.4rem; }
// // .fd-ld-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--fd-green), color-mix(in srgb, var(--fd-green) 45%, #fff)); box-shadow: 0 0 12px color-mix(in srgb, var(--fd-green) 80%, transparent); transition-property: width; transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
// // .fd-ld-skip {
// //     position: absolute; z-index: 4; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
// //     padding: 0.5rem 1rem; border-radius: 999px;
// //     border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85);
// //     font: inherit; font-size: 0.75rem; font-weight: 700; cursor: pointer; backdrop-filter: blur(6px);
// //     opacity: 0; animation: fd-fade 0.5s 1.2s ease forwards;
// //     transition: background-color 0.2s ease, color 0.2s ease;
// // }
// // .fd-ld-skip:hover { background: rgba(255,255,255,0.18); color: #fff; }
// // .fd-ld--reveal .fd-ld-skip { opacity: 0 !important; pointer-events: none; }

// // /* ---------- Keyframes ---------- */
// // @keyframes fd-ld-spin { to { transform: rotate(360deg); } }
// // @keyframes fd-ld-bar { from { transform: scaleY(0.25); } to { transform: scaleY(1); } }
// // @keyframes fd-ld-draw { to { stroke-dashoffset: 0; } }
// // @keyframes fd-ld-float { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.12); } }
// // @keyframes fd-ld-dot { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 0.8; } 85% { opacity: 0.5; } 100% { transform: translateY(-105vh); opacity: 0; } }
// // @keyframes fd-ld-seam { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
// // @keyframes fd-fade { from { opacity: 0; } to { opacity: 1; } }
// // @keyframes fd-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
// // @keyframes fd-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
// // @keyframes fd-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
// // @keyframes fd-grid-drift { to { background-position: 28px 28px, 28px 28px; } }
// // @keyframes fd-shimmer-line { to { background-position: -200% 0; } }
// // @keyframes fd-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

// // @media (max-width: 760px) {
// //     .fd-hero, .fd-controls, .fd-main { padding-left: 1rem; padding-right: 1rem; }
// //     .fd-dash { flex: none; }
// //     .fd-charts-scroll { flex: none; overflow: visible; }
// //     .fd-charts { min-height: 0; }
// //     .fd-table-card { flex: none; min-height: 420px; }
// // }
// // @media (max-width: 560px) {
// //     .fd-chip { margin-left: 0; }
// //     .fd-tabs { display: grid; width: 100%; }
// //     .fd-tab { padding: 0.7rem 0.6rem; font-size: 0.74rem; }
// // }

// // @media (prefers-reduced-motion: reduce) {
// //     .fd-root *, .fd-root *::before, .fd-root *::after {
// //         animation-duration: 0.01ms !important;
// //         animation-delay: 0ms !important;
// //         animation-iteration-count: 1 !important;
// //         transition-duration: 0.01ms !important;
// //     }
// // }
// // `;

// // /* ------------------------------------------------------------------ */
// // /* Helpers                                                             */
// // /* ------------------------------------------------------------------ */
// // const useCountUp = (target: number, duration = 900) => {
// //     const [value, setValue] = useState(0);
// //     const fromRef = useRef(0);

// //     useEffect(() => {
// //         if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
// //             setValue(target);
// //             fromRef.current = target;
// //             return;
// //         }
// //         const from = fromRef.current;
// //         const start = performance.now();
// //         let raf = 0;
// //         const tick = (now: number) => {
// //             const p = Math.min((now - start) / duration, 1);
// //             const eased = 1 - Math.pow(1 - p, 3);
// //             const next = Math.round(from + (target - from) * eased);
// //             setValue(next);
// //             if (p < 1) raf = requestAnimationFrame(tick);
// //             else fromRef.current = target;
// //         };
// //         raf = requestAnimationFrame(tick);
// //         return () => cancelAnimationFrame(raf);
// //     }, [target, duration]);

// //     return value;
// // };

// // const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: number; suffix?: string; color: string; delay: number }> = ({ icon, label, value, suffix = '', color, delay }) => {
// //     const shown = useCountUp(value);
// //     return (
// //         <div className="fd-kpi" style={{ ['--kpi' as any]: color, animationDelay: `${delay}s` }}>
// //             <div className="fd-kpi-head">
// //                 <div className="fd-kpi-icon">{icon}</div>
// //                 <span className="fd-kpi-label">{label}</span>
// //             </div>
// //             <div className="fd-kpi-value">{shown}{suffix}</div>
// //         </div>
// //     );
// // };

// // const FilterSelect: React.FC<{ value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }> = ({ value, onChange, children, label }) => (
// //     <div className="fd-select-wrap">
// //         <select
// //             aria-label={label}
// //             className={`fd-select ${value !== 'All' ? 'fd-select--active' : ''}`}
// //             value={value}
// //             onChange={e => onChange(e.target.value)}
// //         >
// //             {children}
// //         </select>
// //         <ChevronDown size={14} />
// //     </div>
// // );

// // const tooltipStyle = {
// //     borderRadius: '12px',
// //     border: '1px solid #e4eaf0',
// //     boxShadow: '0 12px 28px -12px rgba(0,43,73,0.35)',
// //     fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
// //     fontSize: '12px'
// // };

// // const statusPill = (status: string) =>
// //     status === 'Passed' ? 'fd-pill--passed' : status === 'Dropped Out' ? 'fd-pill--dropped' : 'fd-pill--progress';

// // const scoreColor = (s: number) => (s >= 70 ? GREEN : s >= 40 ? '#f59e0b' : RED);

// // /* ------------------------------------------------------------------ */
// // /* Intro loader + welcome                                             */
// // /* ------------------------------------------------------------------ */
// // type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

// // const STATUS_MESSAGES = ['Syncing cohort data', 'Crunching the numbers', 'Building your dashboard'];

// // const greeting = () => {
// //     const h = new Date().getHours();
// //     return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
// // };

// // const DOTS = Array.from({ length: 18 }, (_, i) => ({
// //     x: (i * 37 + 7) % 100,
// //     s: 3 + (i % 4) * 2,
// //     d: 6 + (i % 5) * 1.6,
// //     delay: (i % 7) * 0.7
// // }));

// // const useIntro = (enabled: boolean, isLoading: boolean, minDuration: number) => {
// //     const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// //     const minMs = reduced ? 500 : minDuration;

// //     const [phase, setPhase] = useState<Phase>(() => (enabled ? 'loading' : 'done'));
// //     const [minElapsed, setMinElapsed] = useState(false);

// //     useEffect(() => {
// //         const t = setTimeout(() => setMinElapsed(true), minMs);
// //         return () => clearTimeout(t);
// //     }, [minMs]);

// //     useEffect(() => {
// //         if (phase === 'loading' && minElapsed && !isLoading) setPhase('welcome');
// //     }, [phase, minElapsed, isLoading]);

// //     useEffect(() => {
// //         if (phase === 'welcome') {
// //             const t = setTimeout(() => setPhase('reveal'), reduced ? 600 : 1700);
// //             return () => clearTimeout(t);
// //         }
// //         if (phase === 'reveal') {
// //             const t = setTimeout(() => {
// //                 setPhase('done');
// //             }, reduced ? 100 : 1100);
// //             return () => clearTimeout(t);
// //         }
// //     }, [phase, reduced]);

// //     const skip = () => setPhase(p => (p === 'loading' || p === 'welcome' ? 'reveal' : p));
// //     return { phase, skip, minMs };
// // };

// // const IntroLoader: React.FC<{
// //     phase: Phase;
// //     minMs: number;
// //     userName?: string;
// //     logoSrc?: string;
// //     learnerCount: number;
// //     onSkip: () => void;
// // }> = ({ phase, minMs, userName, logoSrc, learnerCount, onSkip }) => {
// //     const [started, setStarted] = useState(false);
// //     const [msgIndex, setMsgIndex] = useState(0);

// //     useEffect(() => {
// //         const raf = requestAnimationFrame(() => setStarted(true));
// //         return () => cancelAnimationFrame(raf);
// //     }, []);

// //     useEffect(() => {
// //         if (phase !== 'loading') return;
// //         const t = setInterval(() => setMsgIndex(i => (i + 1) % STATUS_MESSAGES.length), 850);
// //         return () => clearInterval(t);
// //     }, [phase]);

// //     const welcome = phase !== 'loading';
// //     const pct = welcome ? 100 : started ? 88 : 0;

// //     const background = (
// //         <>
// //             <div className="fd-ld-bg" />
// //             <span className="fd-ld-orb fd-ld-orb--a" />
// //             <span className="fd-ld-orb fd-ld-orb--b" />
// //             {DOTS.map((d, i) => (
// //                 <span key={i} className="fd-ld-dot" style={{ ['--x' as any]: d.x, ['--s' as any]: `${d.s}px`, ['--d' as any]: `${d.d}s`, ['--delay' as any]: `${d.delay}s` }} />
// //             ))}
// //         </>
// //     );

// //     return (
// //         <div className={`fd-ld ${phase === 'reveal' ? 'fd-ld--reveal' : ''}`} role="status" aria-live="polite">
// //             <div className="fd-ld-panel fd-ld-panel--top">{background}</div>
// //             <div className="fd-ld-panel fd-ld-panel--bottom">{background}</div>

// //             <div className="fd-ld-center">
// //                 <div className="fd-ld-mark">
// //                     <span className="fd-ld-orbit" />
// //                     <span className="fd-ld-orbit fd-ld-orbit--2" />
// //                     <svg className="fd-ld-ring-svg" viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
// //                         <circle className="fd-ld-ring-track" cx="50" cy="50" r="45" />
// //                         <circle className={`fd-ld-ring ${welcome ? 'fd-ld-ring--done' : ''}`} cx="50" cy="50" r="45" />
// //                     </svg>
// //                     <div className="fd-ld-core">
// //                         {logoSrc && !welcome ? (
// //                             <div className="fd-ld-logo"><img src={logoSrc} alt="mLab Logo" /></div>
// //                         ) : !welcome ? (
// //                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
// //                                 <img src={mLabLogo} alt="mLab Logo" height={24} />
// //                                 <div className="fd-ld-bars" aria-hidden="true" style={{ scale: '0.6' }}>
// //                                     <span /><span /><span /><span /><span />
// //                                 </div>
// //                             </div>
// //                         ) : null}

// //                         {welcome && (
// //                             <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
// //                                 <path className="fd-ld-check" d="M14 29 L24 39 L43 18" />
// //                             </svg>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {!welcome ? (
// //                     <div className="fd-ld-text" key="loading">
// //                         <div className="fd-ld-eyebrow">Cohort analytics</div>
// //                         <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
// //                         <div className="fd-ld-progress">
// //                             <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
// //                         </div>
// //                     </div>
// //                 ) : (
// //                     <div className="fd-ld-text" key="welcome">
// //                         <div className="fd-ld-eyebrow">{greeting()}</div>
// //                         <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
// //                         <p className="fd-ld-sub">Your insights are ready &middot; {learnerCount} learners synced</p>
// //                         <div className="fd-ld-progress">
// //                             <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
// //                         </div>
// //                         <img src={mLabLogo} alt="mLab Logo" style={{ height: 60 }} />
// //                     </div>
// //                 )}
// //             </div>

// //             <button className="fd-ld-skip" onClick={onSkip}>Skip intro</button>
// //         </div>
// //     );
// // };

// // /* ------------------------------------------------------------------ */
// // /* Main Component                                                      */
// // /* ------------------------------------------------------------------ */
// // interface FunderDashboardViewProps {
// //     fullScreen?: boolean;
// //     userName?: string;
// //     logoSrc?: string;
// //     isLoading?: boolean;
// //     showIntro?: boolean;
// //     introMinDuration?: number;
// // }

// // export const FunderDashboardView: React.FC<FunderDashboardViewProps> = ({
// //     fullScreen = true,
// //     userName,
// //     logoSrc,
// //     isLoading = false,
// //     showIntro = true,
// //     introMinDuration = 2600
// // }) => {
// //     // REACT ROUTER URL SEARCH PARAMS PERSISTENCE
// //     const [searchParams, setSearchParams] = useSearchParams();

// //     // Live Google Sheets Data Hook
// //     const { data: rawSheetData, loading: sheetLoading, error, refetch } = useSheetData(GOOGLE_SHEET_CSV_URL);

// //     // Intro Loader State Sync
// //     const isDataLoading = isLoading || sheetLoading;
// //     const { phase, skip, minMs } = useIntro(showIntro, isDataLoading, introMinDuration);
// //     const revealed = phase === 'reveal' || phase === 'done';

// //     // State derived directly from URL Query Params
// //     const activeTab = (searchParams.get('tab') as 'dashboard' | 'roster') || 'dashboard';
// //     const searchTerm = searchParams.get('search') || '';
// //     const currentPage = parseInt(searchParams.get('page') || '1', 10) || 1;
// //     const pageSize = parseInt(searchParams.get('pageSize') || '15', 10) || 15;
// //     const chartsParam = searchParams.get('charts') || '';
// //     const filtersParam = searchParams.get('filters') || '';
// //     const kpisParam = searchParams.get('kpis') || '';

// //     const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

// //     // Dynamic Columns State
// //     const [showColumnDropdown, setShowColumnDropdown] = useState(false);
// //     const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(DEFAULT_COLUMN_VISIBILITY);

// //     // Layout Customizer Modal & Config States
// //     const [showCustomizeModal, setShowCustomizeModal] = useState(false);

// //     // Parse widgetsConfig from URL or localStorage/default
// //     const [widgetsConfig, setWidgetsConfig] = useState<WidgetConfig[]>(() => {
// //         if (chartsParam) {
// //             try { return JSON.parse(decodeURIComponent(chartsParam)); } catch (err) { /* ignore */ }
// //         }
// //         const saved = localStorage.getItem('funder_dashboard_config_v2');
// //         return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
// //     });

// //     // Parse filtersConfig from URL or localStorage/default
// //     const [filtersConfig, setFiltersConfig] = useState<FilterConfig[]>(() => {
// //         if (filtersParam) {
// //             try { return JSON.parse(decodeURIComponent(filtersParam)); } catch (err) { /* ignore */ }
// //         }
// //         const saved = localStorage.getItem('funder_dashboard_filters_v1');
// //         return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
// //     });

// //     // Parse kpisConfig from URL or localStorage/default
// //     const [kpisConfig, setKpisConfig] = useState<KpiConfig[]>(() => {
// //         if (kpisParam) {
// //             try { return JSON.parse(decodeURIComponent(kpisParam)); } catch (err) { /* ignore */ }
// //         }
// //         const saved = localStorage.getItem('funder_dashboard_kpis_v1');
// //         return saved ? JSON.parse(saved) : DEFAULT_KPIS;
// //     });

// //     // Individual Edit Popover State
// //     const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

// //     // Drag and Drop States
// //     const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
// //     const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

// //     // Helper to cleanly update query parameters in URL bar
// //     const updateQuery = (updates: Record<string, string | number | null | undefined>) => {
// //         setSearchParams(prev => {
// //             const next = new URLSearchParams(prev);
// //             Object.entries(updates).forEach(([key, val]) => {
// //                 if (
// //                     val === null ||
// //                     val === undefined ||
// //                     val === '' ||
// //                     val === 'All' ||
// //                     (key === 'tab' && val === 'dashboard') ||
// //                     (key === 'page' && val === 1) ||
// //                     (key === 'pageSize' && val === 15)
// //                 ) {
// //                     next.delete(key);
// //                 } else {
// //                     next.set(key, String(val));
// //                 }
// //             });
// //             return next;
// //         }, { replace: true });
// //     };

// //     const setActiveTab = (tab: 'dashboard' | 'roster') => updateQuery({ tab });
// //     const setSearchTerm = (v: string) => updateQuery({ search: v, page: 1 });
// //     const setCurrentPage = (updater: number | ((p: number) => number)) => {
// //         const nextPg = typeof updater === 'function' ? updater(currentPage) : updater;
// //         updateQuery({ page: nextPg });
// //     };
// //     const setPageSize = (size: number) => updateQuery({ pageSize: size, page: 1 });

// //     // Save configs to LocalStorage & URL
// //     useEffect(() => {
// //         localStorage.setItem('funder_dashboard_config_v2', JSON.stringify(widgetsConfig));
// //         localStorage.setItem('funder_dashboard_filters_v1', JSON.stringify(filtersConfig));
// //         localStorage.setItem('funder_dashboard_kpis_v1', JSON.stringify(kpisConfig));

// //         updateQuery({
// //             charts: encodeURIComponent(JSON.stringify(widgetsConfig)),
// //             filters: encodeURIComponent(JSON.stringify(filtersConfig)),
// //             kpis: encodeURIComponent(JSON.stringify(kpisConfig))
// //         });
// //     }, [widgetsConfig, filtersConfig, kpisConfig]);

// //     // Detect ALL columns found in Google Sheets data
// //     const allSheetColumns = useMemo(() => {
// //         if (rawSheetData.length === 0) return ['gender', 'pathway', 'status', 'readiness'];
// //         const firstRow = rawSheetData[0];
// //         const keys = Object.keys(firstRow).filter(k => k !== 'id' && k !== 'firstName' && k !== 'lastName' && k !== 'email');
// //         return Array.from(new Set(['gender', 'pathway', 'readiness', 'status', ...keys]));
// //     }, [rawSheetData]);

// //     // Helper to get unique string values for any column key
// //     const getUniqueColumnValues = (colKey: string): string[] => {
// //         if (!colKey || rawSheetData.length === 0) return [];
// //         const set = new Set<string>();
// //         rawSheetData.forEach(item => {
// //             let val = item[colKey];
// //             if ((colKey === 'readiness' || colKey === 'Overall Readiness') && (!val || val === 'N/A')) {
// //                 val = item['readiness'] || item['Overall Readiness'];
// //             }
// //             if (val !== undefined && val !== null && val !== '') {
// //                 let strVal = String(val).trim();
// //                 if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
// //                 else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
// //                 else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';
// //                 set.add(strVal);
// //             }
// //         });
// //         return Array.from(set).sort();
// //     };

// //     // Extract dynamic headers from sheet data for extra table columns
// //     const dynamicSheetHeaders = useMemo(() => {
// //         if (rawSheetData.length === 0) return [];
// //         return Object.keys(rawSheetData[0]).filter(k =>
// //             !['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'].includes(k)
// //         );
// //     }, [rawSheetData]);

// //     // Toggle row expansion
// //     const toggleRow = (id: string) => {
// //         const newSet = new Set(expandedRows);
// //         if (newSet.has(id)) newSet.delete(id);
// //         else newSet.add(id);
// //         setExpandedRows(newSet);
// //     };

// //     // Dynamic Multi-Filter Logic
// //     const filteredData = useMemo(() => {
// //         return rawSheetData.filter(learner => {
// //             return filtersConfig.filter(f => f.enabled).every(f => {
// //                 const paramVal = searchParams.get(`f_${f.columnKey}`) || 'All';
// //                 if (paramVal === 'All') return true;

// //                 let learnerVal = learner[f.columnKey];
// //                 if (f.columnKey === 'readiness' && (!learnerVal || learnerVal === 'N/A')) {
// //                     learnerVal = learner['Overall Readiness'] || learner['readiness'];
// //                 }

// //                 let strVal = (learnerVal === null || learnerVal === undefined || learnerVal === '') ? 'N/A' : String(learnerVal).trim();
// //                 if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
// //                 else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
// //                 else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

// //                 return strVal === paramVal;
// //             });
// //         });
// //     }, [rawSheetData, filtersConfig, searchParams]);

// //     // Roster search box
// //     const rosterData = useMemo(() => {
// //         const q = searchTerm.trim().toLowerCase();
// //         if (!q) return filteredData;
// //         return filteredData.filter(l =>
// //             `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
// //         );
// //     }, [filteredData, searchTerm]);

// //     // Paginated Roster Data
// //     const paginatedRoster = useMemo(() => {
// //         const start = (currentPage - 1) * pageSize;
// //         return rosterData.slice(start, start + pageSize);
// //     }, [rosterData, currentPage, pageSize]);

// //     const totalPages = Math.ceil(rosterData.length / pageSize) || 1;

// //     const activeFilterParamsCount = filtersConfig.filter(f => f.enabled && (searchParams.get(`f_${f.columnKey}`) || 'All') !== 'All').length;
// //     const filtersActive = activeFilterParamsCount > 0 || searchTerm !== '';

// //     const resetFilters = () => {
// //         const updates: Record<string, string> = { search: '', page: '1' };
// //         filtersConfig.forEach(f => {
// //             updates[`f_${f.columnKey}`] = 'All';
// //         });
// //         updateQuery(updates);
// //     };

// //     // CSV Export
// //     const handleExport = () => {
// //         const activeCols = Object.keys(columnVisibility).filter(k => columnVisibility[k]);
// //         const header = activeCols.map(c => c.toUpperCase());

// //         const rows = filteredData.map(l => {
// //             return activeCols.map(col => {
// //                 if (col === 'person') return `${l.firstName} ${l.lastName}`;
// //                 if (col === 'pathway') return l.pathway;
// //                 if (col === 'status') return l.status;
// //                 if (col === 'readiness') return l.readiness;
// //                 if (col === 'finalScore') return l.finalScore;
// //                 return l[col] || '';
// //             });
// //         });

// //         const csv = [header, ...rows]
// //             .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
// //             .join('\n');

// //         const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
// //         const url = URL.createObjectURL(blob);
// //         const a = document.createElement('a');
// //         a.href = url;
// //         a.download = `cohort-report-${new Date().toISOString().slice(0, 10)}.csv`;
// //         a.click();
// //         URL.revokeObjectURL(url);
// //     };

// //     // Calculate Custom KPI Values
// //     const getKpiCalculatedValue = (kpi: KpiConfig): { num: number; suffix: string } => {
// //         const total = filteredData.length;
// //         if (total === 0) return { num: 0, suffix: kpi.type === 'percentage' ? '%' : '' };

// //         if (kpi.type === 'total') {
// //             return { num: total, suffix: '' };
// //         }

// //         const matchCount = filteredData.filter(d => {
// //             let val = d[kpi.columnKey];
// //             if (kpi.columnKey === 'readiness' && (!val || val === 'N/A')) {
// //                 val = d['Overall Readiness'] || d['readiness'];
// //             }
// //             let strVal = String(val || '').trim();
// //             if (strVal === '100' || strVal === '100.0') strVal = 'Passed';
// //             else if (strVal === '1' || strVal === '1.0') strVal = 'Failed';
// //             else if (strVal === '0' || strVal === '0.0') strVal = 'Not Attempted';

// //             return strVal === kpi.targetValue;
// //         }).length;

// //         if (kpi.type === 'count') {
// //             return { num: matchCount, suffix: '' };
// //         }

// //         const pct = Math.round((matchCount / total) * 100);
// //         return { num: pct, suffix: '%' };
// //     };

// //     // Fully Dynamic Metric & Comparison Aggregator for ANY column
// //     const getChartDataForMetric = (metricKey: string, compareKey?: string) => {
// //         if (!metricKey || filteredData.length === 0) return { data: [], compareCategories: [] };

// //         if (compareKey && compareKey !== 'none' && compareKey !== metricKey) {
// //             const map: Record<string, Record<string, number>> = {};
// //             const categoriesSet = new Set<string>();

// //             filteredData.forEach(item => {
// //                 const primaryVal = String(item[metricKey] || 'N/A').trim() || 'N/A';
// //                 const compareVal = String(item[compareKey] || 'N/A').trim() || 'N/A';

// //                 categoriesSet.add(compareVal);
// //                 if (!map[primaryVal]) map[primaryVal] = {};
// //                 map[primaryVal][compareVal] = (map[primaryVal][compareVal] || 0) + 1;
// //             });

// //             const compareCategories = Array.from(categoriesSet);
// //             const data = Object.entries(map).map(([primaryVal, subCounts]) => {
// //                 const row: Record<string, any> = { name: primaryVal };
// //                 compareCategories.forEach(cat => {
// //                     row[cat] = subCounts[cat] || 0;
// //                 });
// //                 return row;
// //             });

// //             return { data, compareCategories };
// //         }

// //         const counts: Record<string, number> = {};
// //         filteredData.forEach(item => {
// //             const rawVal = item[metricKey];
// //             const val = (rawVal === null || rawVal === undefined || rawVal === '') ? 'N/A' : String(rawVal).trim();
// //             counts[val] = (counts[val] || 0) + 1;
// //         });

// //         const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
// //         return { data, compareCategories: [] };
// //     };

// //     // Drag & Drop Handlers
// //     const handleDragStart = (e: React.DragEvent, id: string) => {
// //         setDraggedWidgetId(id);
// //         e.dataTransfer.effectAllowed = 'move';
// //         e.dataTransfer.setData('text/plain', id);
// //     };

// //     const handleDragOver = (e: React.DragEvent, targetId: string) => {
// //         e.preventDefault();
// //         e.dataTransfer.dropEffect = 'move';
// //         if (dragOverWidgetId !== targetId) setDragOverWidgetId(targetId);
// //     };

// //     const handleDragLeave = (e: React.DragEvent, targetId: string) => {
// //         if (dragOverWidgetId === targetId) setDragOverWidgetId(null);
// //     };

// //     const handleDrop = (e: React.DragEvent, targetId: string) => {
// //         e.preventDefault();
// //         setDragOverWidgetId(null);

// //         if (!draggedWidgetId || draggedWidgetId === targetId) {
// //             setDraggedWidgetId(null);
// //             return;
// //         }

// //         const currentList = [...widgetsConfig];
// //         const dragIndex = currentList.findIndex(w => w.id === draggedWidgetId);
// //         const dropIndex = currentList.findIndex(w => w.id === targetId);

// //         if (dragIndex < 0 || dropIndex < 0) {
// //             setDraggedWidgetId(null);
// //             return;
// //         }

// //         const itemToMove = currentList[dragIndex];
// //         currentList.splice(dragIndex, 1);
// //         currentList.splice(dropIndex, 0, itemToMove);

// //         setWidgetsConfig(currentList);
// //         setDraggedWidgetId(null);
// //     };

// //     const toggleColumnVisibility = (colKey: string) => {
// //         setColumnVisibility(prev => ({ ...prev, [colKey]: !prev[colKey] }));
// //     };

// //     const updateWidgetType = (widgetId: string, chartType: WidgetConfig['chartType']) => {
// //         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, chartType } : w));
// //     };

// //     const updateWidgetMetric = (widgetId: string, metricKey: string) => {
// //         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, metricKey } : w));
// //     };

// //     const updateWidgetCompareKey = (widgetId: string, compareKey: string) => {
// //         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, compareKey } : w));
// //     };

// //     const updateWidgetTitle = (widgetId: string, title: string) => {
// //         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, title } : w));
// //     };

// //     const toggleWidgetEnabled = (widgetId: string) => {
// //         setWidgetsConfig(prev => prev.map(w => w.id === widgetId ? { ...w, enabled: !w.enabled } : w));
// //     };

// //     const addCustomWidget = () => {
// //         const newWidget: WidgetConfig = {
// //             id: `widget_custom_${Date.now()}`,
// //             title: `Custom Analysis ${widgetsConfig.length + 1}`,
// //             enabled: true,
// //             chartType: 'bar',
// //             metricKey: allSheetColumns[0] || 'gender',
// //             compareKey: 'none'
// //         };
// //         setWidgetsConfig(prev => [...prev, newWidget]);
// //     };

// //     const deleteWidget = (widgetId: string) => {
// //         setWidgetsConfig(prev => prev.filter(w => w.id !== widgetId));
// //     };

// //     // Filter Builder Functions
// //     const addFilter = () => {
// //         const col = allSheetColumns[0] || 'gender';
// //         const newFilter: FilterConfig = {
// //             id: `filter_${Date.now()}`,
// //             columnKey: col,
// //             label: col.charAt(0).toUpperCase() + col.slice(1),
// //             enabled: true
// //         };
// //         setFiltersConfig(prev => [...prev, newFilter]);
// //     };

// //     const updateFilterColumn = (filterId: string, colKey: string) => {
// //         setFiltersConfig(prev => prev.map(f => f.id === filterId ? {
// //             ...f,
// //             columnKey: colKey,
// //             label: colKey.charAt(0).toUpperCase() + colKey.slice(1)
// //         } : f));
// //     };

// //     const toggleFilterEnabled = (filterId: string) => {
// //         setFiltersConfig(prev => prev.map(f => f.id === filterId ? { ...f, enabled: !f.enabled } : f));
// //     };

// //     const deleteFilter = (filterId: string) => {
// //         setFiltersConfig(prev => prev.filter(f => f.id !== filterId));
// //     };

// //     // KPI Builder Functions
// //     const addKpi = () => {
// //         const newKpi: KpiConfig = {
// //             id: `kpi_custom_${Date.now()}`,
// //             label: `Custom Metric ${kpisConfig.length + 1}`,
// //             type: 'count',
// //             columnKey: allSheetColumns[0] || 'gender',
// //             targetValue: 'F',
// //             color: CHART_COLORS[kpisConfig.length % CHART_COLORS.length],
// //             enabled: true
// //         };
// //         setKpisConfig(prev => [...prev, newKpi]);
// //     };

// //     const updateKpi = (kpiId: string, updates: Partial<KpiConfig>) => {
// //         setKpisConfig(prev => prev.map(k => k.id === kpiId ? { ...k, ...updates } : k));
// //     };

// //     const deleteKpi = (kpiId: string) => {
// //         setKpisConfig(prev => prev.filter(k => k.id !== kpiId));
// //     };

// //     const hiddenDetailKeys = ['id', 'firstName', 'lastName', 'email', 'gender', 'pathway', 'status', 'readiness', 'finalScore'];

// //     return (
// //         <div className={`fd-root ${fullScreen ? 'fd-root--fixed' : ''}`}>
// //             <style>{styles}</style>

// //             {/* INTRO LOADER OVERLAY */}
// //             {phase !== 'done' && (
// //                 <IntroLoader
// //                     phase={phase}
// //                     minMs={minMs}
// //                     userName={userName}
// //                     logoSrc={logoSrc}
// //                     learnerCount={rawSheetData.length}
// //                     onSkip={skip}
// //                 />
// //             )}

// //             {revealed && (<>

// //                 {/* HERO HEADER */}
// //                 <div className="fd-hero">
// //                     <div>
// //                         <div className="fd-hero-brand">
// //                             {logoSrc ? <img src={logoSrc} alt="mLab Logo" height={28} /> : <img src={mLabLogo} alt="mLab Logo" height={28} />}
// //                             <span className="fd-hero-divider" />
// //                             <div className="fd-eyebrow">
// //                                 <span className="fd-live-dot" />
// //                                 {sheetLoading ? 'Syncing spreadsheet...' : 'Live cohort data'}
// //                             </div>
// //                         </div>
// //                         <h1 className="fd-title">Cohort Analytics &amp; Reporting</h1>
// //                         <p className="fd-subtitle">Real-time insights synced from centralized GIZ spreadsheets.</p>
// //                     </div>
// //                     <div className="fd-hero-actions">
// //                         <button className="fd-btn fd-btn--glass" onClick={handleExport} title="Export filtered records and visible columns to CSV">
// //                             <Download size={14} /> Export report (CSV)
// //                         </button>
// //                         <button className="fd-btn fd-btn--glass" onClick={refetch} disabled={sheetLoading} title="Pull latest data from Google Sheets">
// //                             <RotateCcw size={14} className={sheetLoading ? 'animate-spin' : ''} /> Refetch
// //                         </button>
// //                         <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(true)} title="Customize layout, cards, and chart types">
// //                             <Settings2 size={14} /> Customize layout
// //                         </button>
// //                     </div>
// //                 </div>

// //                 {/* CONTROLS BAR (fixed): tabs + dynamic filters */}
// //                 <div className="fd-controls">

// //                     {/* TAB NAVIGATION */}
// //                     <div className="fd-tabs" data-active={activeTab} role="tablist">
// //                         <span className="fd-tab-thumb" />
// //                         <button
// //                             role="tab"
// //                             aria-selected={activeTab === 'dashboard'}
// //                             className={`fd-tab ${activeTab === 'dashboard' ? 'fd-tab--active' : ''}`}
// //                             onClick={() => setActiveTab('dashboard')}
// //                         >
// //                             <LayoutDashboard size={16} /> Analytics dashboard
// //                         </button>
// //                         <button
// //                             role="tab"
// //                             aria-selected={activeTab === 'roster'}
// //                             className={`fd-tab ${activeTab === 'roster' ? 'fd-tab--active' : ''}`}
// //                             onClick={() => setActiveTab('roster')}
// //                         >
// //                             <TableIcon size={16} /> Learner roster
// //                         </button>
// //                     </div>

// //                     {/* DYNAMIC FILTERS BAR */}
// //                     <div className="fd-filters">
// //                         <div className="fd-filter-label"><Filter size={15} /> Filters</div>

// //                         {filtersConfig.filter(f => f.enabled).map(f => {
// //                             const val = searchParams.get(`f_${f.columnKey}`) || 'All';
// //                             const options = getUniqueColumnValues(f.columnKey);

// //                             return (
// //                                 <FilterSelect
// //                                     key={f.id}
// //                                     label={`Filter by ${f.label}`}
// //                                     value={val}
// //                                     onChange={v => updateQuery({ [`f_${f.columnKey}`]: v, page: 1 })}
// //                                 >
// //                                     <option value="All">All {f.label.toLowerCase()}s</option>
// //                                     {options.map(opt => (
// //                                         <option key={opt} value={opt}>{opt}</option>
// //                                     ))}
// //                                 </FilterSelect>
// //                             );
// //                         })}

// //                         {filtersActive && (
// //                             <div className="fd-chip">
// //                                 Showing {filteredData.length} of {rawSheetData.length} records
// //                                 <button onClick={resetFilters}><RotateCcw size={11} /> Reset</button>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {/* MAIN REGION */}
// //                 <div className="fd-main fd-scroll">

// //                     {sheetLoading && (
// //                         <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
// //                             <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--mlab-blue)' }} />
// //                             <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Fetching live data from Google Sheets...</div>
// //                         </div>
// //                     )}

// //                     {error && (
// //                         <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c', fontSize: '0.85rem' }}>
// //                             ⚠️ {error}
// //                         </div>
// //                     )}

// //                     {!sheetLoading && (
// //                         <>
// //                             {/* TAB CONTENT: DASHBOARD */}
// //                             {activeTab === 'dashboard' && (
// //                                 <div className={`fd-dash ${draggedWidgetId ? 'fd-dash--dragging' : ''}`}>

// //                                     {/* DYNAMIC KPI CARDS */}
// //                                     <div className="fd-kpis">
// //                                         {kpisConfig.filter(k => k.enabled).map((kpi, idx) => {
// //                                             const { num, suffix } = getKpiCalculatedValue(kpi);
// //                                             const icon = kpi.columnKey === 'gender' ? (kpi.targetValue === 'M' ? <Mars size={18} /> : <Venus size={18} />) :
// //                                                 kpi.columnKey === 'readiness' ? <Briefcase size={18} /> : <Users size={18} />;

// //                                             return (
// //                                                 <KpiCard
// //                                                     key={kpi.id}
// //                                                     icon={icon}
// //                                                     label={kpi.label}
// //                                                     value={num}
// //                                                     suffix={suffix}
// //                                                     color={kpi.color}
// //                                                     delay={0.05 + idx * 0.05}
// //                                                 />
// //                                             );
// //                                         })}
// //                                     </div>

// //                                     {/* DRAGGABLE CHARTS GRID */}
// //                                     <div className="fd-charts-scroll fd-scroll">
// //                                         <div className="fd-charts">
// //                                             {widgetsConfig.filter(w => w.enabled).map((widget, index) => {
// //                                                 const { data: chartData, compareCategories } = getChartDataForMetric(widget.metricKey, widget.compareKey);
// //                                                 const isEditingThis = editingWidgetId === widget.id;
// //                                                 const isDraggingThis = draggedWidgetId === widget.id;
// //                                                 const isDragOverThis = dragOverWidgetId === widget.id;
// //                                                 const hasComparison = compareCategories.length > 0;

// //                                                 return (
// //                                                     <div
// //                                                         key={widget.id}
// //                                                         className={`fd-card ${isDraggingThis ? 'fd-card--dragging' : ''} ${isDragOverThis ? 'fd-card--drag-over' : ''}`}
// //                                                         style={{ animationDelay: `${0.3 + index * 0.06}s` }}
// //                                                         draggable
// //                                                         onDragStart={(e) => handleDragStart(e, widget.id)}
// //                                                         onDragOver={(e) => handleDragOver(e, widget.id)}
// //                                                         onDragLeave={(e) => handleDragLeave(e, widget.id)}
// //                                                         onDrop={(e) => handleDrop(e, widget.id)}
// //                                                     >
// //                                                         <div className="fd-card-head">
// //                                                             <div className="fd-card-title-wrap">
// //                                                                 <span className="fd-drag-handle" title="Click & Drag to reorder card">
// //                                                                     <GripVertical size={16} />
// //                                                                 </span>
// //                                                                 <h3 className="fd-card-title">
// //                                                                     {widget.title}
// //                                                                     {hasComparison && (
// //                                                                         <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
// //                                                                             (vs. {widget.compareKey})
// //                                                                         </span>
// //                                                                     )}
// //                                                                 </h3>
// //                                                             </div>

// //                                                             <div style={{ position: 'relative' }}>
// //                                                                 <button
// //                                                                     className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                                     onClick={() => setEditingWidgetId(isEditingThis ? null : widget.id)}
// //                                                                 >
// //                                                                     Edit <ChevronDown size={12} />
// //                                                                 </button>

// //                                                                 {/* INLINE EDIT POPOVER */}
// //                                                                 {isEditingThis && (
// //                                                                     <div className="fd-popover">
// //                                                                         <div className="fd-popover-title">Chart Type</div>
// //                                                                         <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'bar')}>
// //                                                                             <span>Vertical Bar</span> {widget.chartType === 'bar' && <Check size={14} color={GREEN} />}
// //                                                                         </div>
// //                                                                         <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'horizontal_bar')}>
// //                                                                             <span>Horizontal Bar</span> {widget.chartType === 'horizontal_bar' && <Check size={14} color={GREEN} />}
// //                                                                         </div>
// //                                                                         <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'pie')}>
// //                                                                             <span>Pie Chart</span> {widget.chartType === 'pie' && <Check size={14} color={GREEN} />}
// //                                                                         </div>
// //                                                                         <div className="fd-popover-item" onClick={() => updateWidgetType(widget.id, 'donut')}>
// //                                                                             <span>Donut Chart</span> {widget.chartType === 'donut' && <Check size={14} color={GREEN} />}
// //                                                                         </div>

// //                                                                         <div className="fd-popover-title" style={{ marginTop: '8px' }}>Column to Analyze</div>
// //                                                                         {allSheetColumns.map(col => (
// //                                                                             <div key={col} className="fd-popover-item" onClick={() => updateWidgetMetric(widget.id, col)}>
// //                                                                                 <span>{col}</span> {widget.metricKey === col && <Check size={14} color={GREEN} />}
// //                                                                             </div>
// //                                                                         ))}
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         </div>

// //                                                         <div className="fd-chart">
// //                                                             <div className="fd-chart-inner">
// //                                                                 <ResponsiveContainer width="100%" height="100%">
// //                                                                     {widget.chartType === 'bar' ? (
// //                                                                         <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
// //                                                                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4eaf0" />
// //                                                                             <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
// //                                                                             <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
// //                                                                             <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
// //                                                                             {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

// //                                                                             {hasComparison ? (
// //                                                                                 compareCategories.map((cat, catIdx) => (
// //                                                                                     <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[6, 6, 0, 0]} />
// //                                                                                 ))
// //                                                                             ) : (
// //                                                                                 <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={900}>
// //                                                                                     {chartData.map((_, i) => (
// //                                                                                         <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
// //                                                                                     ))}
// //                                                                                 </Bar>
// //                                                                             )}
// //                                                                         </BarChart>
// //                                                                     ) : widget.chartType === 'horizontal_bar' ? (
// //                                                                         <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
// //                                                                             <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4eaf0" />
// //                                                                             <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5b6b7c' }} />
// //                                                                             <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#0b1f33', fontWeight: 600 }} />
// //                                                                             <RechartsTooltip cursor={{ fill: 'rgba(148,199,61,0.12)' }} contentStyle={tooltipStyle} />
// //                                                                             {hasComparison && <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />}

// //                                                                             {hasComparison ? (
// //                                                                                 compareCategories.map((cat, catIdx) => (
// //                                                                                     <Bar key={cat} dataKey={cat} fill={CHART_COLORS[catIdx % CHART_COLORS.length]} radius={[0, 6, 6, 0]} barSize={20} />
// //                                                                                 ))
// //                                                                             ) : (
// //                                                                                 <Bar dataKey="value" fill={BLUE} radius={[0, 8, 8, 0]} barSize={28} animationDuration={900} />
// //                                                                             )}
// //                                                                         </BarChart>
// //                                                                     ) : (
// //                                                                         <PieChart>
// //                                                                             <Pie
// //                                                                                 data={chartData}
// //                                                                                 cx="50%"
// //                                                                                 cy="46%"
// //                                                                                 innerRadius={widget.chartType === 'donut' ? 62 : 0}
// //                                                                                 outerRadius={92}
// //                                                                                 paddingAngle={widget.chartType === 'donut' ? 3 : 0}
// //                                                                                 cornerRadius={widget.chartType === 'donut' ? 6 : 0}
// //                                                                                 dataKey="value"
// //                                                                                 stroke="#fff"
// //                                                                                 strokeWidth={2}
// //                                                                                 animationDuration={900}
// //                                                                             >
// //                                                                                 {chartData.map((_, i) => (
// //                                                                                     <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
// //                                                                                 ))}
// //                                                                             </Pie>
// //                                                                             <RechartsTooltip contentStyle={tooltipStyle} />
// //                                                                             <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
// //                                                                         </PieChart>
// //                                                                     )}
// //                                                                 </ResponsiveContainer>
// //                                                             </div>
// //                                                         </div>
// //                                                     </div>
// //                                                 );
// //                                             })}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             {/* TAB CONTENT: ROSTER TABLE */}
// //                             {activeTab === 'roster' && (
// //                                 <div className="fd-table-card">

// //                                     <div className="fd-toolbar">
// //                                         <div className="fd-search-wrap">
// //                                             <Search size={15} />
// //                                             <input
// //                                                 className="fd-search"
// //                                                 type="text"
// //                                                 placeholder="Search learners by name or email..."
// //                                                 value={searchTerm}
// //                                                 onChange={e => setSearchTerm(e.target.value)}
// //                                                 aria-label="Search learners"
// //                                             />
// //                                         </div>

// //                                         {/* COLUMNS DROPDOWN TOGGLE */}
// //                                         <div style={{ position: 'relative' }}>
// //                                             <button
// //                                                 className="fd-btn fd-btn--ghost"
// //                                                 onClick={() => setShowColumnDropdown(!showColumnDropdown)}
// //                                             >
// //                                                 Columns <ChevronDown size={14} />
// //                                             </button>

// //                                             {showColumnDropdown && (
// //                                                 <div className="fd-popover" style={{ minWidth: '240px' }}>
// //                                                     <div className="fd-popover-title">Toggle Table Columns</div>
// //                                                     <div className="fd-popover-item" onClick={() => toggleColumnVisibility('person')}>
// //                                                         <span>Learner Name / Email</span>
// //                                                         {columnVisibility.person ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                     </div>
// //                                                     <div className="fd-popover-item" onClick={() => toggleColumnVisibility('pathway')}>
// //                                                         <span>Pathway</span>
// //                                                         {columnVisibility.pathway ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                     </div>
// //                                                     <div className="fd-popover-item" onClick={() => toggleColumnVisibility('status')}>
// //                                                         <span>Status</span>
// //                                                         {columnVisibility.status ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                     </div>
// //                                                     <div className="fd-popover-item" onClick={() => toggleColumnVisibility('readiness')}>
// //                                                         <span>Readiness</span>
// //                                                         {columnVisibility.readiness ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                     </div>
// //                                                     <div className="fd-popover-item" onClick={() => toggleColumnVisibility('finalScore')}>
// //                                                         <span>Final Score</span>
// //                                                         {columnVisibility.finalScore ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                     </div>

// //                                                     {/* Dynamic Headers from Google Sheet */}
// //                                                     {dynamicSheetHeaders.length > 0 && (
// //                                                         <>
// //                                                             <div className="fd-popover-title" style={{ marginTop: '8px' }}>Google Sheet Extra Columns</div>
// //                                                             {dynamicSheetHeaders.map(colKey => (
// //                                                                 <div key={colKey} className="fd-popover-item" onClick={() => toggleColumnVisibility(colKey)}>
// //                                                                     <span>{colKey}</span>
// //                                                                     {columnVisibility[colKey] ? <Eye size={14} color={GREEN} /> : <EyeOff size={14} color="#94a3b8" />}
// //                                                                 </div>
// //                                                             ))}
// //                                                         </>
// //                                                     )}
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </div>

// //                                     <div className="fd-table-scroll fd-scroll">
// //                                         <table className="fd-table">
// //                                             <thead>
// //                                                 <tr>
// //                                                     {columnVisibility.person && <th>Learner</th>}
// //                                                     {columnVisibility.pathway && <th>Pathway</th>}
// //                                                     {columnVisibility.status && <th>Status</th>}
// //                                                     {columnVisibility.readiness && <th>Readiness</th>}
// //                                                     {columnVisibility.finalScore && <th style={{ textAlign: 'right' }}>Final score</th>}

// //                                                     {dynamicSheetHeaders.map(colKey => (
// //                                                         columnVisibility[colKey] && <th key={colKey}>{colKey}</th>
// //                                                     ))}
// //                                                 </tr>
// //                                             </thead>
// //                                             <tbody>
// //                                                 {paginatedRoster.map((learner, i) => {
// //                                                     const isExpanded = expandedRows.has(learner.id);
// //                                                     const visibleColsCount = Object.keys(columnVisibility).filter(k => columnVisibility[k]).length;

// //                                                     return (
// //                                                         <React.Fragment key={learner.id}>
// //                                                             <tr
// //                                                                 onClick={() => toggleRow(learner.id)}
// //                                                                 className={isExpanded ? 'fd-row--expanded' : ''}
// //                                                                 style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
// //                                                             >
// //                                                                 {columnVisibility.person && (
// //                                                                     <td>
// //                                                                         <div className="fd-person">
// //                                                                             <ChevronRight size={16} className="fd-row-chevron" />
// //                                                                             <div className="fd-avatar">{learner.firstName[0] || 'L'}{(learner.lastName[0] || '')}</div>
// //                                                                             <div>
// //                                                                                 <div className="fd-name">{learner.firstName} {learner.lastName}</div>
// //                                                                                 <div className="fd-email">{learner.email}</div>
// //                                                                             </div>
// //                                                                         </div>
// //                                                                     </td>
// //                                                                 )}
// //                                                                 {columnVisibility.pathway && <td>{learner.pathway}</td>}
// //                                                                 {columnVisibility.status && <td><span className={`fd-pill ${statusPill(learner.status)}`}>{learner.status}</span></td>}
// //                                                                 {columnVisibility.readiness && <td>{learner.readiness}</td>}
// //                                                                 {columnVisibility.finalScore && (
// //                                                                     <td>
// //                                                                         <div className="fd-score">
// //                                                                             <div className="fd-score-bar">
// //                                                                                 <div className="fd-score-fill" style={{ width: `${Math.min(100, learner.finalScore)}%`, background: scoreColor(learner.finalScore) }} />
// //                                                                             </div>
// //                                                                             <span className="fd-score-num">{learner.finalScore}%</span>
// //                                                                         </div>
// //                                                                     </td>
// //                                                                 )}

// //                                                                 {/* Dynamic extra column values */}
// //                                                                 {dynamicSheetHeaders.map(colKey => {
// //                                                                     let displayValue = (learner[colKey] === '' || learner[colKey] === null || learner[colKey] === undefined) ? 'N/A' : String(learner[colKey]).trim();

// //                                                                     if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
// //                                                                     else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
// //                                                                     else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

// //                                                                     return columnVisibility[colKey] && (
// //                                                                         <td key={colKey}>{displayValue}</td>
// //                                                                     );
// //                                                                 })}
// //                                                             </tr>

// //                                                             {/* EXPANDED ROW DETAILS ACCORDION */}
// //                                                             {isExpanded && (
// //                                                                 <tr>
// //                                                                     <td colSpan={visibleColsCount} style={{ padding: 0, border: 'none' }}>
// //                                                                         <div className="fd-expanded-panel">
// //                                                                             <div className="fd-expanded-inner">
// //                                                                                 <div className="fd-expanded-header">
// //                                                                                     <Info size={16} /> Complete Dataset Record
// //                                                                                 </div>
// //                                                                                 <div className="fd-expanded-grid">
// //                                                                                     {Object.entries(learner).map(([key, value]) => {
// //                                                                                         if (hiddenDetailKeys.includes(key)) return null;

// //                                                                                         let displayValue = (value === '' || value === null || value === undefined) ? 'N/A' : String(value).trim();

// //                                                                                         if (displayValue === '100' || displayValue === '100.0') displayValue = 'Passed';
// //                                                                                         else if (displayValue === '1' || displayValue === '1.0') displayValue = 'Failed';
// //                                                                                         else if (displayValue === '0' || displayValue === '0.0') displayValue = 'Not Attempted';

// //                                                                                         return (
// //                                                                                             <div key={key} className="fd-expanded-item">
// //                                                                                                 <span className="fd-expanded-label">{key}</span>
// //                                                                                                 <span className="fd-expanded-value">
// //                                                                                                     {displayValue === 'Passed' || displayValue === 'Attended' ? (
// //                                                                                                         <span style={{ color: '#15803d', background: '#e8f5d0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// //                                                                                                             <CheckCircle2 size={13} /> {displayValue}
// //                                                                                                         </span>
// //                                                                                                     ) : displayValue === 'Failed' || displayValue === 'Did not Attended' ? (
// //                                                                                                         <span style={{ color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// //                                                                                                             <XCircle size={13} /> {displayValue}
// //                                                                                                         </span>
// //                                                                                                     ) : displayValue === 'Not Attempted' ? (
// //                                                                                                         <span style={{ color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// //                                                                                                             <MinusCircle size={13} /> Not Attempted
// //                                                                                                         </span>
// //                                                                                                     ) : (
// //                                                                                                         displayValue
// //                                                                                                     )}
// //                                                                                                 </span>
// //                                                                                             </div>
// //                                                                                         );
// //                                                                                     })}
// //                                                                                 </div>
// //                                                                             </div>
// //                                                                         </div>
// //                                                                     </td>
// //                                                                 </tr>
// //                                                             )}
// //                                                         </React.Fragment>
// //                                                     );
// //                                                 })}
// //                                                 {rosterData.length === 0 && (
// //                                                     <tr>
// //                                                         <td colSpan={5} className="fd-empty">
// //                                                             No learners match the current filter criteria.
// //                                                         </td>
// //                                                     </tr>
// //                                                 )}
// //                                             </tbody>
// //                                         </table>
// //                                     </div>

// //                                     {/* PAGINATION CONTROLS */}
// //                                     <div className="fd-table-foot">
// //                                         <span>
// //                                             Showing {rosterData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, rosterData.length)} of {rosterData.length} records
// //                                         </span>
// //                                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                             <select
// //                                                 value={pageSize}
// //                                                 onChange={e => setPageSize(Number(e.target.value))}
// //                                                 style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
// //                                             >
// //                                                 <option value={10}>10 per page</option>
// //                                                 <option value={15}>15 per page</option>
// //                                                 <option value={25}>25 per page</option>
// //                                                 <option value={50}>50 per page</option>
// //                                                 <option value={100}>100 per page</option>
// //                                             </select>

// //                                             <button
// //                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                 disabled={currentPage <= 1}
// //                                                 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// //                                             >
// //                                                 Previous
// //                                             </button>
// //                                             <span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span>
// //                                             <button
// //                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                 disabled={currentPage >= totalPages}
// //                                                 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
// //                                             >
// //                                                 Next
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             )}
// //                         </>
// //                     )}

// //                 </div>

// //             </>)}

// //             {/* ENHANCED CUSTOMIZE LAYOUT MODAL */}
// //             {showCustomizeModal && (
// //                 <div className="fd-modal-overlay" onClick={() => setShowCustomizeModal(false)}>
// //                     <div className="fd-modal" onClick={e => e.stopPropagation()}>
// //                         <div className="fd-modal-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
// //                                 <SlidersHorizontal size={18} /> Customize Funder Dashboard &amp; Analytics
// //                             </div>
// //                             <button onClick={() => setShowCustomizeModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
// //                                 <X size={18} />
// //                             </button>
// //                         </div>

// //                         <div className="fd-modal-body">
// //                             {/* 1. FILTER BAR CUSTOMIZER */}
// //                             <div>
// //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
// //                                     <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
// //                                         Filter Bar Dropdowns
// //                                     </div>
// //                                     <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addFilter} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
// //                                         <Plus size={14} /> Add Filter Dropdown
// //                                     </button>
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                     {filtersConfig.map(f => (
// //                                         <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '10px' }}>
// //                                             <input type="checkbox" checked={f.enabled} onChange={() => toggleFilterEnabled(f.id)} title="Toggle Filter Visibility" />
// //                                             <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fd-blue)', minWidth: '90px' }}>{f.label}:</span>
// //                                             <select
// //                                                 value={f.columnKey}
// //                                                 onChange={e => updateFilterColumn(f.id, e.target.value)}
// //                                                 style={{ flex: 1, color: 'var(--mlab-blue)', background: 'transparent', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
// //                                             >
// //                                                 {allSheetColumns.map(col => (
// //                                                     <option key={col} value={col}>{col}</option>
// //                                                 ))}
// //                                             </select>
// //                                             <button onClick={() => deleteFilter(f.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
// //                                                 <Trash2 size={15} />
// //                                             </button>
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>

// //                             {/* 2. KPI FLAT STATS BUILDER */}
// //                             <div>
// //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
// //                                     <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
// //                                         KPI Summary Cards
// //                                     </div>
// //                                     <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addKpi} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
// //                                         <Plus size={14} /> Add KPI Card
// //                                     </button>
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
// //                                     {kpisConfig.map(kpi => (
// //                                         <div key={kpi.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                 <input type="checkbox" checked={kpi.enabled} onChange={e => updateKpi(kpi.id, { enabled: e.target.checked })} />
// //                                                 <input
// //                                                     type="text"
// //                                                     value={kpi.label}
// //                                                     onChange={e => updateKpi(kpi.id, { label: e.target.value })}
// //                                                     placeholder="KPI Label..."
// //                                                     style={{ flex: 1, color: 'var(--mlab-blue)', background: 'transparent', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fd-blue)' }}
// //                                                 />
// //                                                 <input
// //                                                     type="color"
// //                                                     value={kpi.color}
// //                                                     onChange={e => updateKpi(kpi.id, { color: e.target.value })}
// //                                                     style={{ width: '28px', color: 'var(--mlab-blue)', background: 'transparent', height: '28px', border: 'none', background: 'none', cursor: 'pointer' }}
// //                                                 />
// //                                                 <button onClick={() => deleteKpi(kpi.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}>
// //                                                     <Trash2 size={15} />
// //                                                 </button>
// //                                             </div>

// //                                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
// //                                                 <div>
// //                                                     <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Calculation</label>
// //                                                     <select
// //                                                         value={kpi.type}
// //                                                         onChange={e => updateKpi(kpi.id, { type: e.target.value as any })}
// //                                                         style={{ width: '100%', color: 'var(--mlab-blue)', background: 'transparent', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
// //                                                     >
// //                                                         <option value="total">Total Records Count</option>
// //                                                         <option value="percentage">% Matching Condition</option>
// //                                                         <option value="count">Count Matching Condition</option>
// //                                                     </select>
// //                                                 </div>

// //                                                 {kpi.type !== 'total' && (
// //                                                     <>
// //                                                         <div>
// //                                                             <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Column Key</label>
// //                                                             <select
// //                                                                 value={kpi.columnKey}
// //                                                                 onChange={e => updateKpi(kpi.id, { columnKey: e.target.value })}
// //                                                                 style={{ width: '100%', color: 'var(--mlab-blue)', background: 'transparent', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
// //                                                             >
// //                                                                 {allSheetColumns.map(col => (
// //                                                                     <option key={col} value={col}>{col}</option>
// //                                                                 ))}
// //                                                             </select>
// //                                                         </div>

// //                                                         <div>
// //                                                             <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fd-muted)' }}>Target Match Value</label>
// //                                                             <select
// //                                                                 value={kpi.targetValue || ''}
// //                                                                 onChange={e => updateKpi(kpi.id, { targetValue: e.target.value })}
// //                                                                 style={{ width: '100%', color: 'var(--mlab-blue)', background: 'transparent', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
// //                                                             >
// //                                                                 {getUniqueColumnValues(kpi.columnKey).map(val => (
// //                                                                     <option key={val} value={val}>{val}</option>
// //                                                                 ))}
// //                                                             </select>
// //                                                         </div>
// //                                                     </>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>

// //                             {/* 3. CHART WIDGET BUILDER SECTION */}
// //                             <div>
// //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
// //                                     <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
// //                                         Custom Analytics Charts
// //                                     </div>
// //                                     <button className="fd-btn fd-btn--ghost fd-btn--sm" onClick={addCustomWidget} style={{ color: 'var(--fd-blue)', borderColor: 'var(--fd-green)' }}>
// //                                         <Plus size={14} /> Add Analytics Chart
// //                                     </button>
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// //                                     {widgetsConfig.map(w => (
// //                                         <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: '#f8fafc', border: '1px solid var(--fd-line)', borderRadius: '12px' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                 <input type="checkbox" checked={w.enabled} onChange={() => toggleWidgetEnabled(w.id)} title="Toggle Card Visibility" />
// //                                                 <input
// //                                                     type="text"
// //                                                     value={w.title}
// //                                                     onChange={e => updateWidgetTitle(w.id, e.target.value)}
// //                                                     placeholder="Chart Title..."
// //                                                     style={{ flex: 1, padding: '4px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 700 }}
// //                                                 />
// //                                                 <button onClick={() => deleteWidget(w.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }} title="Delete Chart">
// //                                                     <Trash2 size={16} />
// //                                                 </button>
// //                                             </div>

// //                                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
// //                                                 <div>
// //                                                     <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Primary Column</label>
// //                                                     <select
// //                                                         value={w.metricKey}
// //                                                         onChange={e => updateWidgetMetric(w.id, e.target.value)}
// //                                                         style={{ width: '100%', padding: '5px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
// //                                                     >
// //                                                         {allSheetColumns.map(col => (
// //                                                             <option key={col} value={col}>{col}</option>
// //                                                         ))}
// //                                                     </select>
// //                                                 </div>

// //                                                 <div>
// //                                                     <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Compare With (Optional)</label>
// //                                                     <select
// //                                                         value={w.compareKey || 'none'}
// //                                                         onChange={e => updateWidgetCompareKey(w.id, e.target.value)}
// //                                                         style={{ width: '100%', padding: '5px 8px', color: 'var(--mlab-blue)', background: 'transparent', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
// //                                                     >
// //                                                         <option value="none">-- None (Single Column) --</option>
// //                                                         {allSheetColumns.filter(c => c !== w.metricKey).map(col => (
// //                                                             <option key={col} value={col}>vs. {col}</option>
// //                                                         ))}
// //                                                     </select>
// //                                                 </div>

// //                                                 <div>
// //                                                     <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--fd-muted)', display: 'block', marginBottom: '3px' }}>Chart Type</label>
// //                                                     <select
// //                                                         value={w.chartType}
// //                                                         onChange={e => updateWidgetType(w.id, e.target.value as any)}
// //                                                         style={{ width: '100%', color: 'var(--mlab-blue)', background: 'transparent', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
// //                                                     >
// //                                                         <option value="bar">Vertical Bar</option>
// //                                                         <option value="horizontal_bar">Horizontal Bar</option>
// //                                                         <option value="pie">Pie Chart</option>
// //                                                         <option value="donut">Donut Chart</option>
// //                                                     </select>
// //                                                 </div>
// //                                             </div>
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         <div className="fd-modal-footer">
// //                             <button className="fd-btn fd-btn--ghost" onClick={() => {
// //                                 setWidgetsConfig(DEFAULT_WIDGETS);
// //                                 setFiltersConfig(DEFAULT_FILTERS);
// //                                 setKpisConfig(DEFAULT_KPIS);
// //                                 updateQuery({ charts: null, filters: null, kpis: null });
// //                             }}>
// //                                 Reset to Default
// //                             </button>
// //                             <button className="fd-btn fd-btn--primary" onClick={() => setShowCustomizeModal(false)}>
// //                                 Done
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // export default FunderDashboardView;