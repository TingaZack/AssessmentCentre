// src/pages/AuditorPortal/AuditorPortalView.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    ShieldCheck, Search, Eye, Lock,
    FileCheck, UserCheck, X, CheckSquare,
    Briefcase, Activity, Users, Award,
    Loader2, ChevronLeft, ChevronRight, ChevronDown,
    Printer, Flag, ExternalLink, AlertCircle,
    FileText, BarChart3, UserX,
    Scale, Filter, Download, RefreshCw,
    FileArchive, FileSignature,
    MessageSquare, NotebookPen, Tag,
    BookOpen, Layers, Clock
} from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { useToast } from '../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import mLabLogo from '../../assets/logo/mlab_logo_white.png';

import '../AdminDashboard/FunderDashboard/FunderDashboard.css';

type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

interface SampledLearner {
    id: string;
    userId: string;
    fullName: string;
    idNumber: string;
    cohortId: string;
    cohortName: string;
    programmeName: string;
    overallProgress: number;
    attendance: { attended: number; total: number; pct: number };
    formatives: { completed: number; total: number };
    summatives: { completed: number; total: number };
    practicals: { completed: number; total: number };
    workplaces: { completed: number; total: number };
    sorStatus: string;
    popiaConsent: boolean;
    hasSignature: boolean;
    status: string;
    gender?: string;
    equityGroup?: string;
    disabilityStatus?: string;
    birthDate?: string;
    codeOfConductSigned?: boolean;
    appealsPolicySigned?: boolean;
}

interface AuditorLearnerFlag {
    flagged: boolean;
    note: string;
}

interface GrievanceRecord {
    docId: string;
    id: string;
    learnerName: string;
    cohortId: string;
    dateLogged: string;
    type: 'appeal' | 'complaint';
    status: 'open' | 'under_review' | 'resolved';
    description: string;
    resolutionNotes?: string;
}

interface ActiveExport {
    requestId: string;
    learnerId: string;
    progress: number;
    progressMessage: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    downloadUrl?: string;
    errorMessage?: string;
}

interface ExportProgressState {
    status: 'idle' | 'generating' | 'downloading';
    percent: number;
}

interface ReportCache {
    downloadUrl: string;
    generatedAt: string;
    totalRecords?: number;
}

const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];
const DROPPED_KEYWORDS = ['dropped', 'dropped_out', 'withdrawn', 'terminated', 'archived', 'inactive', 'cancelled', 'discontinued', 'suspended'];

const MIDNIGHT = 'var(--fd-blue, #002b49)';
const GREEN = 'var(--fd-green, #94c73d)';

const VERIFIED_STORAGE_KEY = 'ap-human-verified-v1';
const DISCLAIMER_STORAGE_KEY = 'ap-disclaimer-agreed-v1.1';

const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

const downloadFileWithProgress = (
    url: string,
    filename: string,
    onProgress: (percent: number) => void
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            } else if (event.loaded > 0) {
                const estimatedTotal = event.loaded + 50000;
                onProgress(Math.min(99, Math.round((event.loaded / estimatedTotal) * 100)));
            }
        };
        xhr.onload = () => {
            if (xhr.status === 200) {
                const blob = xhr.response;
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
                onProgress(100);
                resolve();
            } else {
                reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
            }
        };
        xhr.onerror = () => reject(new Error('Network error during file download.'));
        xhr.send();
    });
};

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
            setValue(Math.round(from + (target - from) * eased));
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

type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

const STATUS_MESSAGES = ['Syncing QCTO data', 'Compiling evidence', 'Building your portal'];

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
            const t = setTimeout(() => setPhase('done'), reduced ? 100 : 1100);
            return () => clearTimeout(t);
        }
    }, [phase, reduced]);
    const skip = () => setPhase(p => (p === 'loading' || p === 'welcome' ? 'reveal' : p));
    return { phase, skip, minMs, setPhase };
};

const IntroLoader: React.FC<{
    phase: Phase;
    minMs: number;
    userName?: string;
    logoSrc?: string;
    learnerCount: number;
    onSkip: () => void;
}> = ({ phase, minMs, userName, logoSrc, learnerCount }) => {
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
                            <img src={mLabLogo} alt="mLab Logo" height={24} />
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
                        <div className="fd-ld-eyebrow">Auditor Portal</div>
                        <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
                        <div className="fd-ld-progress">
                            <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
                        </div>
                    </div>
                ) : (
                    <div className="fd-ld-text" key="welcome">
                        <div className="fd-ld-eyebrow">{greeting()}</div>
                        <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
                        <p className="fd-ld-sub">Your audit sandbox is ready &middot; {learnerCount} records verified</p>
                        <div className="fd-ld-progress">
                            <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

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
        if (pct >= 95) { setIsDragging(false); setSliderPos(100); setTimeout(() => onVerify(), 250); }
    };
    return (
        <div className="fd-bot-overlay">
            <div className="fd-bot-card">
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
                    <ShieldCheck size={28} />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>Human Verification Required</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>To protect audit integrity, please slide to confirm you are human.</p>
                <div ref={trackRef} className="fd-bot-slider-track"
                    onMouseMove={(e) => handleMove(e.clientX)}
                    onTouchMove={(e) => handleMove(e.touches[0].clientX)}
                    onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
                    onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}>
                    <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
                    <span className="fd-bot-slider-text">{sliderPos >= 95 ? 'Verified!' : 'Slide to Access Portal ➔'}</span>
                    <div className="fd-bot-slider-thumb"
                        style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
                        onMouseDown={() => setIsDragging(true)}
                        onTouchStart={() => setIsDragging(true)}>
                        <Lock size={16} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const DisclaimerGate: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
    const [isChecked, setIsChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleAcknowledge = async () => {
        if (!isChecked) return;
        setIsSubmitting(true);
        setTimeout(() => onAgree(), 600);
    };
    return (
        <div className="fd-bot-overlay" style={{ background: 'linear-gradient(135deg, rgba(0, 43, 73, 0.5) 0%, rgba(100, 163, 88, 0.2) 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            <div style={{ width: 'min(100%, 640px)', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRadius: '20px', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.5rem 2rem', borderBottom: '1px solid var(--fd-line, #e4eaf0)', flexShrink: 0, background: '#fff' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--mlab-blue) 12%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', flexShrink: 0 }}>
                        <ShieldCheck size={22} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>POPIA Data Privacy &amp; Protection</h3>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fd-muted, #5b6b7c)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Mandatory Compliance Notice</div>
                    </div>
                </div>
                <div className="fd-scroll" style={{ padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#fff' }}>
                    <p style={{ margin: '0 0 1.2rem 0', fontWeight: 600, color: 'var(--fd-ink, #0b1f33)' }}>
                        This dashboard contains personal and potentially sensitive information relating to learners and programme participants. The information is provided to authorised stakeholders strictly for legitimate programme reporting, monitoring, evaluation, verification and related organisational purposes.
                    </p>
                    <p style={{ margin: '0 0 1.2rem 0' }}>
                        In accordance with the <strong>Protection of Personal Information Act 4 of 2013 (POPIA)</strong>, access to and use of this information is restricted to authorised persons and must be limited to the purpose for which it has been provided.
                    </p>
                    <strong style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--fd-blue, #002b49)' }}>By accessing this dashboard, you agree to:</strong>
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
                    <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>Unauthorised access, use, disclosure or distribution of this information is strictly prohibited.</p>
                </div>
                <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--fd-line, #e4eaf0)', background: '#f8fafc', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ paddingTop: '2px' }}>
                            <input type="checkbox" checked={isChecked} onChange={(e) => setIsChecked(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--mlab-green)' }} />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fd-blue, #002b49)', lineHeight: 1.4 }}>I have read and acknowledge the above notice and agree to handle the information in accordance with the stated requirements.</span>
                    </label>
                    <button className={`fd-btn ${isChecked ? 'fd-btn--primary' : ''}`} disabled={!isChecked || isSubmitting} onClick={handleAcknowledge}
                        style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', width: '100%', background: !isChecked ? '#e2e8f0' : undefined, color: !isChecked ? '#94a3b8' : undefined, cursor: !isChecked ? 'not-allowed' : 'pointer', border: 'none', borderRadius: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                        {isSubmitting ? 'Recording Acknowledgement...' : 'Acknowledge & Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 🚀 AUTO-LOCKOUT OVERLAY GATE
const SessionExpiredGate: React.FC<{ durationMinutes: number }> = ({ durationMinutes }) => {
    const hrs = (durationMinutes / 60).toFixed(1).replace('.0', '');
    return (
        <div className="fd-bot-overlay" style={{ zIndex: 9999999, background: 'rgba(0, 43, 73, 0.95)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
            <div className="fd-bot-card animate-slide-up" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', display: 'grid', placeItems: 'center', color: '#dc2626', margin: '0 auto 20px auto' }}>
                    <Lock size={32} />
                </div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Inspection Window Closed</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: '#475569', lineHeight: 1.6 }}>
                    Your allocated audit time of <strong>{hrs} hours</strong> has elapsed.<br/>
                    For POPIA compliance and data security, read-only access has been safely suspended.
                </p>
                <div style={{ margin: '0 0 24px 0', fontSize: '0.85rem', color: '#64748b', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <strong>Note:</strong> If your verification audit is incomplete, please ask your platform administrator to click <strong>"Extend"</strong> on their dashboard. Your screen will automatically unlock without needing to refresh.
                </div>
                <button className="fd-btn fd-btn--primary" onClick={() => window.location.href = '/login'} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                    Return to Login
                </button>
            </div>
        </div>
    );
};

// 🚀 HOLDING ROOM GATE (WAITING TO BEGIN)
const InspectionStartGate: React.FC<{ grant: any; onStart: () => void }> = ({ grant, onStart }) => {
    const [isStarting, setIsStarting] = useState(false);
    const hrs = grant?.durationMinutes ? (grant.durationMinutes / 60).toFixed(1).replace('.0', '') : '4';

    const handleStart = async () => {
        setIsStarting(true);
        try {
            const newExpiry = new Date(Date.now() + (grant.durationMinutes || 240) * 60 * 1000).toISOString();
            await updateDoc(doc(db, 'auditor_access_grants', grant.id), {
                startedAt: new Date().toISOString(),
                expiresAt: newExpiry,
                isActive: true
            });
            onStart();
        } catch (err) {
            console.error("Failed to sync start session:", err);
            setIsStarting(false);
            // Fallback UI unlock so they aren't completely blocked if Firestore rules reject
            onStart(); 
        }
    };

    return (
        <div className="fd-bot-overlay" style={{ zIndex: 9999998, background: 'rgba(0, 43, 73, 0.95)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
            <div className="fd-bot-card animate-slide-up" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '500px' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--mlab-green-bg)', display: 'grid', placeItems: 'center', color: 'var(--mlab-green-dark)', margin: '0 auto 20px auto' }}>
                    <Clock size={32} />
                </div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Ready to Begin Inspection?</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: '#475569', lineHeight: 1.6 }}>
                    You have been allocated <strong>{hrs} hours</strong> of secure read-only access to this compliance portal.
                </p>
                <div style={{ margin: '0 0 24px 0', fontSize: '0.85rem', color: '#64748b', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <strong>Security Note:</strong> The countdown timer will only start once you click the button below. Once started, your session cannot be paused.
                </div>
                <button className="fd-btn fd-btn--primary" onClick={handleStart} disabled={isStarting} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '1rem' }}>
                    {isStarting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    {isStarting ? 'Starting Secure Session...' : 'Begin Verification Inspection'}
                </button>
            </div>
        </div>
    );
};

export const AuditorPortalView: React.FC = () => {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => { try { return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true'; } catch { return false; } });
    const [isDisclaimerAgreed, setIsDisclaimerAgreed] = useState<boolean>(() => { try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { return false; } });

    const handleHumanVerified = () => { setIsHumanVerified(true); try { sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true'); } catch {} };
    const handleDisclaimerAgreed = async () => {
        setIsDisclaimerAgreed(true);
        try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch {}
        let deviceId = localStorage.getItem('ap-device-id');
        if (!deviceId) { deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; localStorage.setItem('ap-device-id', deviceId); }
        try { await fetch('https://your-database-api-or-webhook.com/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, action: 'POPIA_AGREEMENT_ACCEPTED_AUDITOR', timestamp: new Date().toISOString(), userAgent: navigator.userAgent }), keepalive: true }); } catch (err) { }
    };

    const { user: currentUser, cohorts: storeCohorts, learners: storeLearners, programmes: storeProgrammes, fetchProgrammes, fetchCohorts, fetchLearners } = useStore() as any;

    const initialCohortFromUrl = searchParams.get('cohort') || '';
    const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
    const initialSearchFromUrl = searchParams.get('search') || '';

    const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
    const [loadingFlags, setLoadingFlags] = useState({ enrollments: true, submissions: true, users: true, learners: true });
    const isLoading = Object.values(loadingFlags).some(Boolean);
    
    // 🚀 AUDITOR LIVE SESSION STATE
    const [accessGrant, setAccessGrant] = useState<any>(null);
    const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);
    const [hasStartedLocal, setHasStartedLocal] = useState(false); // Fail-safe UI unlock

    const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
    const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
    const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(10);
    const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});
    const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
    const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');
    const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
    const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
    const [rawUsers, setRawUsers] = useState<any[]>([]);
    const [rawLearners, setRawLearners] = useState<any[]>([]);
    const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);
    const [rawAttendance, setRawAttendance] = useState<any[]>([]);
    const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
    const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);
    const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);
    const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
    const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
    const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
    const [isSavingGrievance, setIsSavingGrievance] = useState(false);
    const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
    const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');
    const [policySearchTerm, setPolicySearchTerm] = useState('');
    const [showEndorseModal, setShowEndorseModal] = useState(false);
    const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
    const [auditNotes, setAuditNotes] = useState('');
    const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);
    const [statusModal, setStatusModal] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'error', title: '', message: '' });
    const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
    const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
    const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
    const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);
    const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

    const isDataLoading = isLoading || (!storeCohorts || storeCohorts.length === 0);
    const { phase, skip, minMs, setPhase } = useIntro(true, isDataLoading, 2600, isHumanVerified);
    const introDone = phase === 'reveal' || phase === 'done';
    const revealed = introDone && isDisclaimerAgreed;

    // Safety timeout: force-complete intro after 15s
    useEffect(() => {
        if (!isHumanVerified) return;
        const safetyTimer = setTimeout(() => {
            if (phase === 'loading') setPhase('welcome');
        }, 15000);
        return () => clearTimeout(safetyTimer);
    }, [isHumanVerified, phase, setPhase]);

    // 🚀 SYNC ACTIVE GRANT FROM FIRESTORE
    useEffect(() => {
        const isAuditor = ['seta_verifier', 'qcto_auditor'].includes(currentUser?.role) || currentUser?.isTemporaryAuditor;
        if (!isAuditor || !currentUser?.email) return;

        const q = query(collection(db, 'auditor_access_grants'), where('email', '==', currentUser.email));
        const unsub = onSnapshot(q, (snap) => {
            const grants = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
            // Get newest active grant
            const active = grants.filter(g => g.isActive !== false).sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            if (active.length > 0) {
                setAccessGrant(active[0]);
            }
        });
        return () => unsub();
    }, [currentUser]);

    // 🚀 LIVE COUNTDOWN CLOCK TICKER
    useEffect(() => {
        if (!accessGrant) return;
        
        // If not started yet, display the full duration but don't tick
        if (!accessGrant.startedAt && !hasStartedLocal) {
            setTimeLeftMs((accessGrant.durationMinutes || 240) * 60 * 1000);
            return;
        }

        // Once started, calculate exact remaining time dynamically
        if (accessGrant.expiresAt) {
            const updateTimer = () => {
                const diff = new Date(accessGrant.expiresAt).getTime() - Date.now();
                setTimeLeftMs(diff);
            };
            
            updateTimer(); // fire immediately
            const timer = setInterval(updateTimer, 1000);
            return () => clearInterval(timer);
        }
    }, [accessGrant, hasStartedLocal]);

    const isPendingStart = accessGrant && !accessGrant.startedAt && !hasStartedLocal;
    const isSessionExpired = accessGrant && (accessGrant.startedAt || hasStartedLocal) && timeLeftMs !== null && timeLeftMs <= 0;

    const formatTime = (ms: number) => {
        if (ms <= 0) return '00:00:00';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!currentUser?.isTemporaryAuditor) {
            if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
            if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
            if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
        } else {
            if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
            if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
        }
    }, [currentUser?.isTemporaryAuditor, storeCohorts, storeLearners, storeProgrammes]);

    useEffect(() => { setCurrentPage(1); }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);
    useEffect(() => { setLastNlrdExport(null); setLastMatrixExport(null); }, [selectedCohortId]);

    useEffect(() => {
        const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
        const unsubPoe = onSnapshot(qPoe, (snap) => {
            const exportsMap: Record<string, ActiveExport> = {};
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const lId = data.learnerId;
                if (lId && !exportsMap[lId]) {
                    exportsMap[lId] = { requestId: docSnap.id, learnerId: lId, progress: data.progress || 0, progressMessage: data.progressMessage || '', status: data.status || 'pending', downloadUrl: data.downloadUrl, errorMessage: data.errorMessage };
                }
            });
            setActiveExports(prev => ({ ...exportsMap, ...prev }));
        });
        return () => unsubPoe();
    }, []);

    const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
        const newParams: Record<string, string> = {};
        if (cohortId) newParams.cohort = cohortId;
        if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
        if (search) newParams.search = search;
        setSearchParams(newParams, { replace: true });
    }, [setSearchParams]);

    const allowedCohortsForAuditor = useMemo(() => {
        if (!storeCohorts || storeCohorts.length === 0) {
            return [];
        }

        const allowedIds: string[] = [
            ...(Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : []),
            ...(Array.isArray(currentUser?.assignedCohortIds) ? currentUser.assignedCohortIds : []),
            ...(Array.isArray(currentUser?.cohortIds) ? currentUser.cohortIds : []),
            ...(Array.isArray(currentUser?.allowedCohorts) ? currentUser.allowedCohorts : []),
            ...(currentUser?.cohortId ? [currentUser.cohortId] : [])
        ].map(id => String(id).trim());

        const uniqueAllowedIds = Array.from(new Set(allowedIds)).filter(id => id.length > 0);

        if (uniqueAllowedIds.length > 0) {
            const filtered = storeCohorts.filter((c: any) => uniqueAllowedIds.includes(String(c.id).trim()));
            return filtered;
        }

        const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
        if (isFullAdmin && !currentUser?.isTemporaryAuditor) {
            return storeCohorts;
        }

        return [];
    }, [storeCohorts, currentUser]);

    useEffect(() => {
        if (allowedCohortsForAuditor.length > 0) {
            const isValidSelection = allowedCohortsForAuditor.some((c: any) => String(c.id).trim() === String(selectedCohortId).trim());
            if (!selectedCohortId || !isValidSelection) {
                const defaultCohortId = allowedCohortsForAuditor[0].id;
                setSelectedCohortId(defaultCohortId);
                syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
            }
        } else { setSelectedCohortId(''); }
    }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

    useEffect(() => {
        const handlePermissionError = (collectionName: keyof typeof loadingFlags | string, err: any) => { 
            if (['enrollments', 'submissions', 'users', 'learners'].includes(collectionName)) {
                setLoadingFlags(prev => ({ ...prev, [collectionName]: false }));
            }
        };

        const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
            const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawEnrollments(enrolls);
            setLoadingFlags(prev => ({ ...prev, enrollments: false }));
        }, (err) => handlePermissionError('enrollments', err));

        const unsubSubmissions = onSnapshot(collection(db, 'learner_submissions'), (snap) => {
            const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawSubmissions(subs);
            setLoadingFlags(prev => ({ ...prev, submissions: false }));
        }, (err) => handlePermissionError('learner_submissions', err));

        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => { 
            setRawUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
            setLoadingFlags(prev => ({ ...prev, users: false }));
        }, (err) => handlePermissionError('users', err));

        const unsubLearners = onSnapshot(collection(db, 'learners'), (snap) => { 
            setRawLearners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
            setLoadingFlags(prev => ({ ...prev, learners: false }));
        }, (err) => handlePermissionError('learners', err));

        const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
        const unsubGrievances = onSnapshot(qGrievances, (snap) => {
            const parsedGrievances: GrievanceRecord[] = [];
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                parsedGrievances.push({
                    docId: docSnap.id, id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(), learnerName: data.learnerName || 'Unknown Learner', cohortId: data.cohortId || data.cohortRunId || '',
                    dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0], type: data.type || 'appeal',
                    status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'), description: data.reason || data.description || 'No description provided', resolutionNotes: data.resolutionNotes || ''
                });
            });
            setRawGrievances(parsedGrievances);
        }, (err) => handlePermissionError('assessment_appeals', err));

        const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => { setRawPolicySignoffs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, (err) => handlePermissionError('learner_policy_signoffs', err));
        const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance', err));
        const unsubAttLogs = onSnapshot(collection(db, 'attendance_logs'), (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_logs', err));
        const unsubAttRecords = onSnapshot(collection(db, 'attendance_records'), (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_records', err));
        
        return () => { unsubEnrollments(); unsubSubmissions(); unsubUsers(); unsubLearners(); unsubGrievances(); unsubPolicies(); unsubAttendance(); unsubAttLogs(); unsubAttRecords(); };
    }, []);

    const addCleanKey = (setObj: Set<string>, val: any) => { if (val && typeof val === 'string') { const cleaned = val.trim().toLowerCase(); if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') setObj.add(cleaned); } };
    const checkCocSignedInObject = (obj: any) => { if (!obj) return false; const demo = obj.demographics || {}; return obj.codeOfConductSigned === true || obj.hasSignedCoc === true || obj.cocSigned === true || obj.policySigned === true || obj.isPolicySigned === true || demo.codeOfConductSigned === true || demo.hasSignedCoc === true || demo.cocSigned === true || demo.policySigned === true || !!obj.signatureUrl || !!demo.signatureUrl; };

    const cocSignedKeysSet = useMemo(() => {
        const keys = new Set<string>();
        rawPolicySignoffs.forEach((d: any) => { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); });
        rawUsers.forEach((u: any) => { if (checkCocSignedInObject(u)) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
        rawLearners.forEach((l: any) => { if (checkCocSignedInObject(l)) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
        rawEnrollments.forEach((e: any) => { if (checkCocSignedInObject(e)) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
        return keys;
    }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

    const appealsSignedKeysSet = useMemo(() => {
        const keys = new Set<string>();
        rawPolicySignoffs.forEach((d: any) => { const type = String(d.policyType || d.policyName || '').toLowerCase(); if (type.includes('appeal')) { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); } });
        rawUsers.forEach((u: any) => { if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
        rawLearners.forEach((l: any) => { if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
        return keys;
    }, [rawPolicySignoffs, rawUsers, rawLearners])

    const popiaConsentKeysSet = useMemo(() => {
        const keys = new Set<string>();
        rawUsers.forEach((u: any) => { const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
        rawLearners.forEach((l: any) => { const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
        rawEnrollments.forEach((e: any) => { const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
        return keys;
    }, [rawUsers, rawLearners, rawEnrollments])

    const activeProgrammeData = useMemo(() => {
        if (!selectedCohortId) return null;
        const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
        if (!cohort) return null;
        return storeProgrammes?.find((p: any) => p.id === cohort.programmeId || p.id === cohort.qualificationId || (p.saqaId && String(p.saqaId) === String(cohort.saqaId))) || null;
    }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

    const dailyRegisters = useMemo(() => {
        const unifiedMap = new Map<string, any>();
        const matchCohort = (r: any) => { if (!selectedCohortId || selectedCohortId === 'ALL') return true; const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim(); return rCohort === selectedCohortId; };
        const filteredAtt = rawAttendance.filter(matchCohort); const filteredLogs = rawAttendanceLogs.filter(matchCohort); const filteredRecords = rawAttendanceRecords.filter(matchCohort);
        filteredAtt.forEach(record => {
            if (record.presentLearners || record.absentLearners) { const dateKey = record.date || record.id; unifiedMap.set(record.id || dateKey, { id: record.id || dateKey, date: record.date || 'Unknown', presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [], absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [], partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : [] }); }
            else if (record.learnerId && record.date) { const dateKey = `eco_${record.date}`; if (!unifiedMap.has(dateKey)) { unifiedMap.set(dateKey, { id: dateKey, date: record.date, presentLearners: [], absentLearners: [], partialLearners: [] }); } const entry = unifiedMap.get(dateKey); const status = String(record.status || '').toLowerCase(); if (status.includes('present')) entry.presentLearners.push(record.learnerId); else if (status.includes('absent')) entry.absentLearners.push(record.learnerId); else if (status.includes('partial')) entry.partialLearners.push(record.learnerId); }
        });
        filteredLogs.forEach(log => {
            const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
            const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);
            const present: string[] = []; const absent: string[] = []; const partial: string[] = [];
            recordsForLog.forEach(r => { const status = String(r.status || '').toLowerCase(); const lKey = r.learnerId || r.authUid || r.userId; if (lKey) { if (status.includes('present')) present.push(lKey); else if (status.includes('absent')) absent.push(lKey); else if (status.includes('partial')) partial.push(lKey); } });
            unifiedMap.set(log.id, { id: log.id, date: dateStr, presentLearners: present, absentLearners: absent, partialLearners: partial });
        });
        const unifiedArray = Array.from(unifiedMap.values());
        unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return unifiedArray;
    }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

    const rosterAttendanceMap = useMemo(() => {
        const totalSessions = dailyRegisters.length;
        const finalMap = new Map<string, { attended: number; total: number; pct: number }>();

        const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
            const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
            const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
            const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
            const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));

            const keys = [
                e.id,
                e.userId,
                e.learnerId,
                e.authUid,
                e.idNumber,
                actualUserId,
                storeLearner?.id,
                storeLearner?.learnerId,
                storeLearner?.authUid,
                storeLearner?.idNumber,
                rawUser?.id,
                rawUser?.authUid,
                rawUser?.idNumber,
                rawLearner?.id,
                rawLearner?.authUid,
                rawLearner?.idNumber
            ].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');

            return Array.from(new Set(keys.map(k => String(k).trim().toLowerCase())));
        });

        const groupAttendanceCounts = new Array(candidateKeyGroups.length).fill(0);

        dailyRegisters.forEach(reg => {
            const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase());

            candidateKeyGroups.forEach((group, index) => {
                const isCandidatePresent = group.some(k => presentList.includes(k));
                if (isCandidatePresent) {
                    groupAttendanceCounts[index] += 1;
                }
            });
        });

        candidateKeyGroups.forEach((group, index) => {
            const attended = groupAttendanceCounts[index];
            const pct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
            const stats = { attended, total: totalSessions, pct };

            group.forEach(k => {
                finalMap.set(k, stats);
            });
        });

        return finalMap;
    }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);


    const handleCohortChange = (cohortId: string) => { setSelectedCohortId(cohortId); syncQueryParams(cohortId, samplePercentage, searchTerm); };
    const handleSamplePercentageChange = (pct: number) => { setSamplePercentage(pct); setSearchTerm(''); syncQueryParams(selectedCohortId, pct, ''); };
    const handleSearchChange = (term: string) => { setSearchTerm(term); syncQueryParams(selectedCohortId, samplePercentage, term); };
    const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => { setCandidateFlags(prev => { const current = prev[candidateId]; const isCurrentlyFlagged = current?.flagged; return { ...prev, [candidateId]: { flagged: !isCurrentlyFlagged, note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : '' } }; }); toast.info("Candidate spot-check flag status updated."); };
    const handleUpdateFlagNote = (candidateId: string, noteText: string) => { setCandidateFlags(prev => ({ ...prev, [candidateId]: { flagged: true, note: noteText } })); };
    const handleOpenNotesModal = (learner: SampledLearner) => { setNotesModalLearner(learner); setLearnerNoteInput(candidateFlags[learner.id]?.note || ''); };
    const handleSaveLearnerNote = () => { if (!notesModalLearner) return; handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput); toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`); setNotesModalLearner(null); };

    const handleExportSampleManifest = () => {
        if (sampledLearners.length === 0) { setStatusModal({ isOpen: true, type: 'info', title: 'No Sampled Records', message: 'There are currently no sampled records available in the selected cohort view to export.' }); return; }
        const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];
        const csvRows = sampledLearners.map(l => {
            const flag = candidateFlags[l.id]; const rawIdStr = String(l.idNumber || '').trim(); const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr)) ? rawIdStr.padStart(13, '0') : rawIdStr; const textFormattedId = `="${paddedId}"`;
            return [`"${l.fullName.replace(/"/g, '""')}"`, textFormattedId, `"${l.status}"`, `"${l.cohortName.replace(/"/g, '""')}"`, `"${l.programmeName.replace(/"/g, '""')}"`, `${l.overallProgress}%`, `${l.attendance.pct}%`, `"${l.attendance.attended}/${l.attendance.total}"`, `"${l.formatives.completed}/${l.formatives.total}"`, `"${l.summatives.completed}/${l.summatives.total}"`, `"${l.practicals.completed}/${l.practicals.total}"`, `"${l.workplaces.completed}/${l.workplaces.total}"`, l.popiaConsent ? 'Signed' : 'Unsigned', flag?.flagged ? 'FLAGGED' : 'CLEAR', `"${(flag?.note || '').replace(/"/g, '""')}"`].join(',');
        });
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        toast.success("Sample Manifest exported to CSV.");
    };

    const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
        const targetLearnerId = learner.userId || learner.id; const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];
        if (currentExport?.status === 'processing' || currentExport?.status === 'pending') { toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`); return; }
        if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) { window.open(currentExport.downloadUrl, '_blank'); return; }
        try {
            const docRef = await addDoc(collection(db, 'poe_export_requests'), { learnerId: targetLearnerId, requestedBy: currentUser?.uid || currentUser?.id || 'auditor', status: 'pending', progress: 0, progressMessage: 'Initializing compliance engine...', createdAt: serverTimestamp() });
            setActiveExports(prev => ({ ...prev, [learner.id]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' }, [targetLearnerId]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' } }));
        } catch (error: any) { setStatusModal({ isOpen: true, type: 'error', title: 'Export Initialization Failed', message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.` }); }
    };

    const cohortPool = useMemo(() => {
        if (!selectedCohortId) return [];
        const filteredEnrollments = rawEnrollments.filter(e => e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId);
        return filteredEnrollments.map((enrol, idx): SampledLearner => {
            const enrolKeys = [enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.id, enrol.uid].filter((k): k is string => typeof k === 'string' && k.trim() !== '');
            const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';
            const matchesLearner = (candidate: any) => { if (!candidate) return false; const candidateKeys = [candidate.id, candidate.learnerId, candidate.idNumber, candidate.authUid, candidate.uid, candidate.userId].filter((k): k is string => typeof k === 'string' && k.trim() !== ''); const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase())); const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail; return hasKeyMatch || hasEmailMatch; };
            const storeLearner = storeLearners?.find(matchesLearner); const rawUser = rawUsers?.find(matchesLearner); const rawLearner = rawLearners?.find(matchesLearner);
            const activeCohortId = enrol.cohortId || enrol.cohortRunId || selectedCohortId; const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);
            let storeProgramme = storeProgrammes?.find((p: any) => (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) || (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId))));
            const mappedName = enrol.userName || enrol.learnerName || enrol.fullName || enrol.name || storeLearner?.fullName || storeLearner?.name || rawLearner?.fullName || rawLearner?.name || rawUser?.fullName || rawUser?.name || 'Learner Candidate';
            const rawMappedId = enrol.idNumber || storeLearner?.idNumber || rawLearner?.idNumber || rawUser?.idNumber || enrol.learnerId || enrol.userId || enrol.id || 'N/A';
            const cleanIdStr = String(rawMappedId).trim(); const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr)) ? cleanIdStr.padStart(13, '0') : cleanIdStr;
            const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';
            const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification'; const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || ''; const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';
            const progDetails: string[] = []; if (progNqf) progDetails.push(`NQF Level ${progNqf}`); if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);
            const mappedProgramme = progDetails.length > 0 ? `${progTitle} (${progDetails.join(' | ')})` : progTitle;
            const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};
            const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
            const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
            const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';
            let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;
            if (storeProgramme) {
                if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
                if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
                if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;
                if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
                    const flat = storeProgramme.modules;
                    totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
                    totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
                    totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
                }
            }
            let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0; let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;
            const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
            const learnerSubs = rawSubmissions.filter(s => (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) || (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) || (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase()));
            learnerSubs.forEach(s => {
                const type = String(s.type || 'formative').toLowerCase(); const moduleType = String(s.moduleType || '').toLowerCase(); const subStatus = String(s.status || 'not_started').toLowerCase();
                if (INFORMAL_TYPES.some(it => type.includes(it))) return;
                const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
                const isKnowledge = moduleType === 'knowledge' || moduleType === ''; const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm'); const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');
                if (isKnowledge) { if (type.includes('formative') || type.includes('fa')) { totalAssignedFA++; if (isDone) calculatedFA++; } else if (type.includes('summative') || type.includes('sa')) { totalAssignedSA++; if (isDone) calculatedSA++; } } else if (isPractical) { totalAssignedPM++; if (isDone) calculatedPM++; } else if (isWorkplace) { totalAssignedWM++; if (isDone) calculatedWM++; }
            });
            const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA); const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA); const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM); const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);
            const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM; const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;
            const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;
            const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) || rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) || rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) || { attended: 0, total: dailyRegisters.length, pct: 0 };
            const candidateKeys = [actualUserId, enrol.id, enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.email, mappedId, storeLearner?.id, storeLearner?.uid, storeLearner?.authUid, storeLearner?.idNumber, storeLearner?.email, rawUser?.id, rawUser?.uid, rawUser?.authUid, rawUser?.idNumber, rawUser?.email, rawLearner?.id, rawLearner?.authUid, rawLearner?.idNumber, rawLearner?.email];
            const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
            const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
            const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));

            const allStatuses = [
                enrol.status,
                enrol.enrollmentStatus,
                storeLearner?.status,
                rawLearner?.status,
                rawUser?.status
            ].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());

            const isCandidateDropped = allStatuses.some(s =>
                DROPPED_KEYWORDS.some(dk => s.includes(dk))
            ) || enrol.isArchived === true;

            const resolvedStatus = isCandidateDropped
                ? (allStatuses.find(s => DROPPED_KEYWORDS.some(dk => s.includes(dk)) && s) || enrol.status || 'dropped')
                : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');

            return {
                id: enrol.id || `enrol_${selectedCohortId}_${idx}`, userId: actualUserId, fullName: mappedName, idNumber: mappedId, cohortId: activeCohortId, cohortName: mappedCohort, programmeName: mappedProgramme, overallProgress: Math.min(100, dynamicProgress),
                attendance: attStats, formatives: { completed: calculatedFA, total: ceilingFA }, summatives: { completed: calculatedSA, total: ceilingSA }, practicals: { completed: calculatedPM, total: ceilingPM }, workplaces: { completed: calculatedWM, total: ceilingWM },
                sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'), popiaConsent: isPopiConsented, hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned), status: resolvedStatus,
                gender, equityGroup, disabilityStatus, birthDate: demo.birthDate || storeLearner?.birthDate, codeOfConductSigned: isCocSigned, appealsPolicySigned: isAppealsSigned
            };
        });
    }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

    const sampledLearners = useMemo(() => {
        if (cohortPool.length === 0) return [];
        let filtered = cohortPool;
        if (searchTerm.trim()) { const q = searchTerm.toLowerCase(); return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q)); }
        if (samplePercentage >= 100) return filtered;
        const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
        return [...cohortPool].sort((a, b) => a.id.localeCompare(b.id)).slice(0, sampleSize);
    }, [cohortPool, samplePercentage, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
    const paginatedLearners = useMemo(() => { return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [sampledLearners, currentPage, itemsPerPage]);

    const cohortFilteredGrievances = useMemo(() => {
        let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');
        if (grievanceFilterStatus !== 'ALL') list = list.filter(g => g.status === grievanceFilterStatus);
        if (grievanceFilterType !== 'ALL') list = list.filter(g => g.type === grievanceFilterType);
        return list;
    }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

    const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
    const paginatedGrievances = useMemo(() => { return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

    const searchedPolicyLearners = useMemo(() => { if (!policySearchTerm.trim()) return cohortPool; const q = policySearchTerm.toLowerCase(); return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q)); }, [cohortPool, policySearchTerm]);
    const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
    const paginatedPolicyLearners = useMemo(() => { return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [searchedPolicyLearners, currentPage, itemsPerPage]);

    const cohortMisDemographics = useMemo(() => {
        const stats = { total: cohortPool.length, sampleTotal: sampledLearners.length, equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 }, gender: { Female: 0, Male: 0, Other: 0 }, disability: { Yes: 0, No: 0 }, youth: { Under35: 0, Adult35Plus: 0 }, attendanceBands: { high: 0, mid: 0, low: 0 } };
        const currentYear = 2026;
        cohortPool.forEach(l => {
            const eq = String(l.equityGroup || '').trim().toLowerCase();
            if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') stats.equity.African++;
            else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') stats.equity.Coloured++;
            else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') stats.equity.Indian++;
            else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') stats.equity.White++;
            else stats.equity.African++;
            const g = String(l.gender || '').trim().toLowerCase();
            if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') stats.gender.Female++;
            else if (g.startsWith('m') || g.includes('male') || g === 'man') stats.gender.Male++;
            else if (l.idNumber && l.idNumber.length >= 7) { const genderDigit = parseInt(l.idNumber.charAt(6), 10); if (!isNaN(genderDigit)) { if (genderDigit >= 5) stats.gender.Male++; else stats.gender.Female++; } else stats.gender.Male++; } else stats.gender.Male++;
            const d = String(l.disabilityStatus || '').trim().toLowerCase();
            if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') stats.disability.Yes++; else stats.disability.No++;
            let birthYear = 0; if (l.idNumber && l.idNumber.length >= 6) { const yy = parseInt(l.idNumber.substring(0, 2), 10); birthYear = yy > 30 ? 1900 + yy : 2000 + yy; }
            if (birthYear > 0 && (currentYear - birthYear) <= 35) stats.youth.Under35++; else stats.youth.Adult35Plus++;
            const attPct = l.attendance?.pct || 0;
            if (attPct >= 75) stats.attendanceBands.high++; else if (attPct >= 40) stats.attendanceBands.mid++; else stats.attendanceBands.low++;
        });
        return stats;
    }, [cohortPool, sampledLearners]);

    const inspectedLearnerSubmissions = useMemo(() => {
        if (!inspectedLearner) return [];
        const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();
        return rawSubmissions.filter(s => (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) || (s.authUid && String(s.authUid).toLowerCase() === targetUserId) || (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase()));
    }, [inspectedLearner, rawSubmissions]);

    const activeCohortData = useMemo(() => { return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null; }, [allowedCohortsForAuditor, selectedCohortId]);

    const handleSaveEndorsement = async () => {
        if (!auditNotes.trim()) { setStatusModal({ isOpen: true, type: 'warning', title: 'Missing Audit Notes', message: 'Please enter auditor verification findings and notes before recording official sign-off.' }); return; }
        setIsSavingEndorsement(true);
        try {
            await addDoc(collection(db, 'cohort_audit_endorsements'), { cohortId: selectedCohortId, cohortName: activeCohortData?.name || 'Cohort', auditorUid: currentUser?.uid || 'external_auditor', auditorName: currentUser?.fullName || 'External Quality Assurer', organization: currentUser?.organization || 'QCTO / SETA', sampleSizePercentage: samplePercentage, sampledRecordsCount: sampledLearners.length, totalCohortCount: cohortPool.length, outcome: auditOutcome, notes: auditNotes, flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length, signedAt: serverTimestamp(), createdAt: new Date().toISOString() });
            toast.success("Audit verification & endorsement recorded successfully."); setShowEndorseModal(false); setAuditNotes('');
        } catch (err: any) { setStatusModal({ isOpen: true, type: 'error', title: 'Sign-Off Failed', message: err.message || 'Failed to record official audit verification sign-off record.' }); }
        finally { setIsSavingEndorsement(false); }
    };

    const handleSaveGrievanceResolution = async () => {
        if (!selectedGrievance) return; setIsSavingGrievance(true);
        try { await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), { status: grievanceStatusInput, resolutionNotes: grievanceResolutionNotes, resolvedAt: serverTimestamp(), resolvedBy: currentUser?.uid || 'external_auditor' }); toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`); setSelectedGrievance(null); setGrievanceResolutionNotes(''); }
        catch (err: any) { setStatusModal({ isOpen: true, type: 'error', title: 'Resolution Update Failed', message: err.message || 'Failed to save grievance resolution details.' }); }
        finally { setIsSavingGrievance(false); }
    };

    const handleExportNLRD = async () => {
        if (nlrdProgress.status !== 'idle') return; setNlrdProgress({ status: 'generating', percent: 15 }); toast.info(`Requesting NLRD Pipe-Delimited Batch...`);
        const timer = setInterval(() => { setNlrdProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
        try { const functions = getFunctions(); const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport'); const response: any = await generateNlrdFn({ cohortId: selectedCohortId }); clearInterval(timer);
            if (response.data?.downloadUrl) { setNlrdProgress({ status: 'downloading', percent: 80 }); const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;
                await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setNlrdProgress({ status: 'downloading', percent: scaled }); });
                setLastNlrdExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalRecords }); toast.success(`NLRD Export completed!`); } }
        catch (error: any) { clearInterval(timer); setStatusModal({ isOpen: true, type: 'error', title: 'NLRD Export Failed', message: error.message || 'An error occurred while attempting to compile the NLRD export batch.' }); }
        finally { setNlrdProgress({ status: 'idle', percent: 0 }); }
    };

    const handleExportThroughputMatrix = async () => {
        if (matrixProgress.status !== 'idle') return; setMatrixProgress({ status: 'generating', percent: 15 }); toast.info('Compiling Learner Throughput & Compliance Matrix...');
        const timer = setInterval(() => { setMatrixProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
        try { const functions = getFunctions(); const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport'); const response: any = await generateMatrixFn({ cohortId: selectedCohortId }); clearInterval(timer);
            if (response.data?.downloadUrl) { setMatrixProgress({ status: 'downloading', percent: 80 }); const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;
                await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setMatrixProgress({ status: 'downloading', percent: scaled }); });
                setLastMatrixExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalLearners }); toast.success(`Throughput Matrix downloaded!`); } }
        catch (error: any) { clearInterval(timer); setStatusModal({ isOpen: true, type: 'error', title: 'Report Generation Failed', message: error.message || 'Server error encountered while building the throughput matrix report.' }); }
        finally { setMatrixProgress({ status: 'idle', percent: 0 }); }
    };

    const getTabThumbOffset = (tab: TabOption) => { switch (tab) { case 'mis_overview': return 'translateX(100%)'; case 'grievances': return 'translateX(200%)'; case 'policies': return 'translateX(300%)'; default: return 'translateX(0%)'; } };

    return (
        <div className="fd-root fd-root--fixed">
            <style>{`
                @keyframes skelPulse {
                    0% { background-color: #f1f5f9; }
                    50% { background-color: #e2e8f0; }
                    100% { background-color: #f1f5f9; }
                }
                .skel-block {
                    animation: skelPulse 1.5s ease-in-out infinite;
                    border-radius: 8px;
                }
            `}</style>
            
            {!isHumanVerified && <HumanVerificationGate onVerify={handleHumanVerified} />}
            {isHumanVerified && !revealed && <IntroLoader phase={phase} minMs={minMs} userName={currentUser?.fullName || 'Auditor'} logoSrc={mLabLogo} learnerCount={cohortPool.length} onSkip={skip} />}
            {isHumanVerified && introDone && !isDisclaimerAgreed && <DisclaimerGate onAgree={handleDisclaimerAgreed} />}

            {revealed && (<>
                <header className="fd-hero">
                    <div>
                        <div className="fd-hero-brand">
                            <img src={mLabLogo} alt="mLab Logo" height={28} />
                            <span className="fd-hero-divider" />
                            <div className="fd-eyebrow"><span className="fd-live-dot" /> QCTO / SETA Verification Workspace</div>
                        </div>
                        <h1 className="fd-title">Auditor Inspection Portal</h1>
                        <p className="fd-subtitle">Real-time verification &amp; compliance monitoring for external quality assurers.</p>
                    </div>
                    <div className="fd-hero-actions">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.28)', borderRadius: '99px', padding: '0.4rem 0.85rem' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8' }}>Read-Only Inspector Mode</span>
                        </div>
                        {accessGrant && timeLeftMs !== null && !isPendingStart && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: isSessionExpired ? '#fef2f2' : (timeLeftMs < 900000 ? '#fffbeb' : '#f0fdf4'), border: `1px solid ${isSessionExpired ? '#fca5a5' : (timeLeftMs < 900000 ? '#fde68a' : '#bbf7d0')}`, borderRadius: '99px', padding: '0.4rem 0.85rem' }}>
                                <Clock size={14} color={isSessionExpired ? '#dc2626' : (timeLeftMs < 900000 ? '#d97706' : '#16a34a')} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: isSessionExpired ? '#dc2626' : (timeLeftMs < 900000 ? '#d97706' : '#15803d') }}>
                                    {isSessionExpired ? 'Session Expired' : formatTime(timeLeftMs)} Remaining
                                </span>
                            </div>
                        )}
                        <button onClick={() => setShowEndorseModal(true)} className="fd-btn fd-btn--primary" disabled={isLoading}><UserCheck size={15} /> Sign Off Cohort Audit</button>
                    </div>
                </header>

                <div className="fd-controls">
                    <div className="fd-tabs" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', maxWidth: '680px', pointerEvents: isLoading ? 'none' : 'auto', opacity: isLoading ? 0.6 : 1 }} data-active={activeTab} role="tablist">
                        <span className="fd-tab-thumb" style={{ width: 'calc(25% - 5px)', transform: getTabThumbOffset(activeTab) }} />
                        {[
                            { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
                            { id: 'mis_overview', label: 'MIS Overview', icon: BarChart3 },
                            { id: 'grievances', label: 'Appeals', icon: Scale },
                            { id: 'policies', label: 'Policy Compliance', icon: FileSignature }
                        ].map(tab => (
                            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`fd-tab ${activeTab === tab.id ? 'fd-tab--active' : ''}`} onClick={() => setActiveTab(tab.id as TabOption)} style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem' }}>
                                <tab.icon size={15} /> {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="fd-filters">
                        <div className="fd-filter-label"><Filter size={15} /> Scope</div>
                        <div className="fd-select-wrap">
                            <select className="fd-select fd-select--active" value={selectedCohortId} onChange={(e) => handleCohortChange(e.target.value)} style={{ minWidth: '240px' }} disabled={isLoading}>
                                {allowedCohortsForAuditor.length === 0 ? <option value="">No Assigned Cohorts Found</option> : allowedCohortsForAuditor.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <ChevronDown size={14} />
                        </div>
                    </div>
                </div>

                <div className="fd-main fd-scroll">
                    {isLoading ? (
                        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: 0.8 }}>
                            <div className="skel-block" style={{ height: '80px', width: '100%', marginBottom: '1rem' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="skel-block" style={{ height: '110px' }} />
                                <div className="skel-block" style={{ height: '110px' }} />
                                <div className="skel-block" style={{ height: '110px' }} />
                                <div className="skel-block" style={{ height: '110px' }} />
                            </div>
                            <div className="skel-block" style={{ height: '400px', width: '100%' }} />
                        </div>
                    ) : (
                    <>
                        {activeProgrammeData && (
                            <div className="fd-card" style={{ flexShrink: 0, padding: '1rem 1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--fd-blue) 12%, #fff)', color: 'var(--fd-blue)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Award size={24} /></div>
                                    <div style={{ flex: 1, minWidth: '260px' }}>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Active Audit Target Qualification</div>
                                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--fd-blue)', letterSpacing: '-0.01em' }}>{activeProgrammeData.name}</h2>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                                            {activeProgrammeData.saqaId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="var(--fd-blue)" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
                                            {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="var(--fd-blue)" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
                                            {activeProgrammeData.credits > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="var(--fd-blue)" /> Total Credits: {activeProgrammeData.credits}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'poe_vault' && (
                            <div className="fd-card" style={{ flexShrink: 0, padding: '0.85rem 1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>Sampling Ratio:</span>
                                            <div style={{ display: 'inline-flex', border: '1.5px solid #d5dde6', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
                                                {[10, 20, 50, 100].map((pct) => (
                                                    <button key={pct} onClick={() => handleSamplePercentageChange(pct)} style={{ padding: '0.4rem 0.8rem', border: 'none', background: samplePercentage === pct && !searchTerm ? 'var(--fd-blue)' : 'transparent', color: samplePercentage === pct && !searchTerm ? '#ffffff' : 'var(--fd-ink)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderRight: '1px solid #d5dde6', transition: 'all 0.2s' }}>{pct}% {pct === 10 ? '(QCTO Standard)' : ''}</button>
                                                ))}
                                            </div>
                                        </div>
                                        {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && <span className="fd-pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <button onClick={handleExportSampleManifest} className="fd-btn fd-btn--ghost fd-btn--sm"><Printer size={14} /> Export Manifest</button>
                                        <div className="fd-search-wrap" style={{ width: '220px' }}>
                                            <Search size={14} />
                                            <input className="fd-search" type="text" placeholder="Search candidate or ID..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} style={{ padding: '0.45rem 0.8rem 0.45rem 2.2rem', fontSize: '0.78rem' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'poe_vault' && (
                            <div className="fd-kpis">
                                <KpiCard icon={<Users size={18} />} label="Sample Size Loaded" value={sampledLearners.length} suffix={` / ${cohortPool.length}`} color={MIDNIGHT} delay={0.05} />
                                <KpiCard icon={<Activity size={18} />} label="Average Progress" value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0} suffix="%" color="#16a34a" delay={0.10} />
                                <KpiCard icon={<Clock size={18} />} label="Average Attendance" value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0} suffix="%" color="#0284c7" delay={0.15} />
                                <KpiCard icon={<ShieldCheck size={18} />} label="POPIA Consent" value={sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0} suffix="%" color="#8b5cf6" delay={0.20} />
                                <KpiCard icon={<Award size={18} />} label="SoR Readiness" value={sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length} color="#f59e0b" delay={0.25} />
                            </div>
                        )}

                        {activeTab === 'poe_vault' && (
                            <div className="fd-table-card" style={{ minHeight: '700px' }}>
                                <div className="fd-toolbar">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--fd-blue)' }}><CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault</div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--fd-muted)', fontWeight: 700 }}>Showing {sampledLearners.length} sampled candidates out of {cohortPool.length} total</span>
                                </div>
                                <div className="fd-table-scroll fd-scroll">
                                    <table className="fd-table" style={{ minWidth: '1100px' }}>
                                        <thead><tr><th>Learner Details</th><th>Attendance</th><th>Curriculum Evidence</th><th>Progress</th><th>Governance</th><th>Flag Status</th><th style={{ textAlign: 'right' }}>Inspection Action</th></tr></thead>
                                        <tbody>
                                            {paginatedLearners.map((learner, i) => {
                                                const flagInfo = candidateFlags[learner.id]; const isFlagged = flagInfo?.flagged;
                                                const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
                                                const exportState = activeExports[learner.id] || activeExports[learner.userId]; const hasCustomNote = !!flagInfo?.note;
                                                const attPct = learner.attendance?.pct || 0; const attAttended = learner.attendance?.attended || 0; const attTotal = learner.attendance?.total || 0;
                                                return (
                                                    <tr key={`${learner.id}_${learner.userId || i}_${i}`} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'transparent'), animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                                                        <td>
                                                            <div className="fd-person">
                                                                <div className="fd-avatar" style={{ background: isDropped ? '#fecaca' : undefined, color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName[0] || 'L'}</div>
                                                                <div>
                                                                    <div className="fd-name" style={{ color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName}</div>
                                                                    <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {learner.idNumber}</div>
                                                                    {isDropped && <span className="fd-pill fd-pill--dropped" style={{ marginTop: '2px', fontSize: '0.62rem' }}><UserX size={10} /> {learner.status}</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span className="fd-pill" style={{ background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2', color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626' }}><Clock size={11} /> {attPct}%</span>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--fd-muted)', fontWeight: 600 }}>{attAttended} / {attTotal} Sessions</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ fontSize: '0.78rem' }}>
                                                            <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}</div>
                                                            <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs</div>
                                                            <div style={{ color: 'var(--fd-ink)', fontWeight: 600 }}><strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks</div>
                                                        </td>
                                                        <td>
                                                            <div className="fd-score">
                                                                <div className="fd-score-bar" style={{ width: '70px', background: isDropped ? '#fca5a5' : undefined }}>
                                                                    <div className="fd-score-fill" style={{ width: `${learner.overallProgress}%`, background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
                                                                </div>
                                                                <span className="fd-score-num" style={{ color: isDropped ? '#991b1b' : undefined }}>{learner.overallProgress}%</span>
                                                            </div>
                                                        </td>
                                                        <td>{learner.popiaConsent ? <span className="fd-pill fd-pill--passed">✓ Policy Signed</span> : <span className="fd-pill fd-pill--dropped">Unsigned</span>}</td>
                                                        <td>
                                                            {isFlagged ? <span onClick={() => handleToggleCandidateFlag(learner.id)} className="fd-pill fd-pill--dropped" style={{ cursor: 'pointer' }} title={flagInfo.note || 'Click to clear flag'}><Flag size={11} fill="currentColor" /> Flagged</span>
                                                            : <button onClick={() => handleToggleCandidateFlag(learner.id)} style={{ background: 'none', border: 'none', color: 'var(--fd-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Flag size={12} /> Flag Item</button>}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                                <button onClick={() => handleOpenNotesModal(learner)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: hasCustomNote ? '#fffbeb' : undefined, color: hasCustomNote ? '#b45309' : undefined, borderColor: hasCustomNote ? '#fde68a' : undefined }} title={hasCustomNote ? flagInfo.note : 'Leave auditor note'}><MessageSquare size={12} /> {hasCustomNote ? 'Notes' : 'Note'}</button>
                                                                <button onClick={() => navigate(`/sor/${learner.userId || learner.id}`)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileText size={12} /> SoR</button>
                                                                {(() => {
                                                                    if (exportState?.status === 'pending' || exportState?.status === 'processing') return <button disabled className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: '#fef3c7', color: '#92400e' }}><Loader2 size={12} className="animate-spin" /> {exportState.progress}%</button>;
                                                                    if (exportState?.status === 'completed' && exportState?.downloadUrl) return (<div style={{ display: 'inline-flex', gap: '4px' }}><button onClick={() => window.open(exportState.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm"><Download size={12} /> Get PoE</button><button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" title="Regenerate"><RefreshCw size={12} /></button></div>);
                                                                    if (exportState?.status === 'error') return <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ color: '#dc2626' }}><AlertCircle size={12} /> Retry</button>;
                                                                    return <button onClick={() => handleGeneratePoE(learner)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileArchive size={12} /> Compile</button>;
                                                                })()}
                                                                <button onClick={() => setInspectedLearner(learner)} className="fd-btn fd-btn--primary fd-btn--sm"><Eye size={12} /> Inspect</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {sampledLearners.length === 0 && (<tr><td colSpan={7} className="fd-empty"><FileCheck size={36} color="var(--fd-line)" style={{ margin: '0 auto 0.5rem' }} /><h4 style={{ margin: '0 0 4px', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4><p style={{ margin: 0, fontSize: '0.8rem' }}>No candidate records match this cohort scope or search filter.</p></td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="fd-table-foot">
                                    <div>Showing {sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sampledLearners.length)} of {sampledLearners.length} sampled records</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span>Rows:</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="fd-select" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option></select></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button><span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'mis_overview' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                                    <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Equity Group Distribution</h3></div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
                                        </div>
                                    </div>
                                    <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Gender &amp; Disability Metrics</h3></div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
                                        </div>
                                    </div>
                                    <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Attendance Health Bands</h3></div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}><span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}><span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="fd-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="fd-card-head" style={{ marginBottom: 0 }}><h3 className="fd-card-title">Regulatory Report Exporters</h3></div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                                        <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
                                            <div><strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}><FileText size={16} color="#0284c7" /></div>SAQA NLRD Pipe-Delimited Batch</strong><p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>Generates 28-field statutory NLRD text/CSV file for SETA submission.</p></div>
                                            <div>
                                                {lastNlrdExport ? (<div style={{ display: 'flex', gap: '8px', width: '100%' }}><button onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#16a34a', color: 'white' }}><Download size={14} /> Download Batch ({lastNlrdExport.generatedAt})</button><button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function"><RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /></button></div>)
                                                : (<button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--primary" style={{ width: '100%' }}>{nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}{nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}{nlrdProgress.status === 'idle' && 'Generate NLRD Report'}</button>)}
                                            </div>
                                        </div>
                                        <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
                                            <div><strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ background: '#dcfce7', padding: '6px', borderRadius: '8px' }}><BarChart3 size={16} color="#16a34a" /></div>Learner Throughput Matrix (CSV)</strong><p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.</p></div>
                                            <div>
                                                {lastMatrixExport ? (<div style={{ display: 'flex', gap: '8px', width: '100%' }}><button onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#0284c7', color: 'white' }}><Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})</button><button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function"><RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /></button></div>)
                                                : (<button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" style={{ width: '100%' }}>{matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}{matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}{matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}{matrixProgress.status === 'idle' && 'Generate Throughput Ratio'}</button>)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'grievances' && (
                            <div className="fd-table-card">
                                <div className="fd-toolbar">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Filter size={14} color="var(--fd-muted)" />
                                        <div className="fd-select-wrap"><select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="fd-select fd-select--active"><option value="ALL">All Statuses</option><option value="open">Open</option><option value="under_review">Under Review</option><option value="resolved">Resolved</option></select><ChevronDown size={14} /></div>
                                        <div className="fd-select-wrap"><select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="fd-select fd-select--active"><option value="ALL">All Types</option><option value="appeal">Appeals Only</option><option value="complaint">Complaints Only</option></select><ChevronDown size={14} /></div>
                                    </div>
                                </div>
                                <div className="fd-table-scroll fd-scroll">
                                    <table className="fd-table">
                                        <thead><tr><th>Ref ID</th><th>Learner</th><th>Type</th><th>Date Logged</th><th>Description</th><th>Status</th><th style={{ textAlign: 'right' }}>Resolution Action</th></tr></thead>
                                        <tbody>
                                            {paginatedGrievances.map((g, i) => (
                                                <tr key={`${g.docId}_${i}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                                                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--fd-muted)' }}>{g.id}</td>
                                                    <td><div className="fd-name">{g.learnerName}</div></td>
                                                    <td><span className="fd-pill" style={{ background: 'color-mix(in srgb, var(--fd-blue) 6%, #fff)', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>{g.type}</span></td>
                                                    <td style={{ fontSize: '0.8rem', color: 'var(--fd-muted)' }}>{g.dateLogged}</td>
                                                    <td style={{ fontSize: '0.8rem', color: 'var(--fd-ink)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
                                                    <td>
                                                        {g.status === 'open' && <span className="fd-pill" style={{ color: '#dc2626', background: '#fef2f2' }}>OPEN</span>}
                                                        {g.status === 'under_review' && <span className="fd-pill" style={{ color: '#92400e', background: '#fef3c7' }}>UNDER REVIEW</span>}
                                                        {g.status === 'resolved' && <span className="fd-pill" style={{ color: '#16a34a', background: '#dcfce7' }}>RESOLVED</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}><button onClick={() => { setSelectedGrievance(g); setGrievanceStatusInput(g.status); setGrievanceResolutionNotes(g.resolutionNotes || ''); }} className="fd-btn fd-btn--ghost fd-btn--sm"><Eye size={12} /> Inspect / Resolve</button></td>
                                                </tr>
                                            ))}
                                            {paginatedGrievances.length === 0 && (<tr><td colSpan={7} className="fd-empty">No grievances or appeals recorded for this cohort scope.</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="fd-table-foot">
                                    <span>Showing {cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)} of {cohortFilteredGrievances.length} grievances</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={14} /> Prev</button><span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesGrievances}</span><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances}>Next <ChevronRight size={14} /></button></div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'policies' && (
                            <div className="fd-table-card">
                                <div className="fd-toolbar"><div className="fd-search-wrap"><Search size={16} /><input type="text" className="fd-search" placeholder="Search learner policy status..." value={policySearchTerm} onChange={(e) => setPolicySearchTerm(e.target.value)} /></div></div>
                                <div className="fd-table-scroll fd-scroll">
                                    <table className="fd-table">
                                        <thead><tr><th>Learner Details</th><th>Cohort Scope</th><th>Code of Conduct</th><th>Appeals Policy</th><th>PoPIA Consent</th><th style={{ textAlign: 'right' }}>Compliance State</th></tr></thead>
                                        <tbody>
                                            {paginatedPolicyLearners.map((l, i) => (
                                                <tr key={`${l.id}_${i}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                                                    <td><div className="fd-person"><div className="fd-avatar">{l.fullName[0] || 'L'}</div><div><div className="fd-name">{l.fullName}</div><div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {l.idNumber}</div></div></div></td>
                                                    <td>{l.cohortName}</td>
                                                    <td>{l.codeOfConductSigned ? <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>}</td>
                                                    <td>{l.appealsPolicySigned ? <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>}</td>
                                                    <td>{l.popiaConsent ? <span className="fd-pill" style={{ background: '#e0f2fe', color: '#0369a1' }}>✓ CONSENTED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>PENDING</span>}</td>
                                                    <td style={{ textAlign: 'right' }}>{l.codeOfConductSigned && l.popiaConsent ? <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span> : <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>}</td>
                                                </tr>
                                            ))}
                                            {paginatedPolicyLearners.length === 0 && (<tr><td colSpan={6} className="fd-empty">No learners match this search criteria.</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="fd-table-foot">
                                    <span>Showing {searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)} of {searchedPolicyLearners.length} candidate policies</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={14} /> Prev</button><span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesPolicyLearners}</span><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners}>Next <ChevronRight size={14} /></button></div>
                                </div>
                            </div>
                        )}
                    </>
                    )}
                </div>
            </>)}

            {notesModalLearner && (
                <div className="fd-modal-overlay" onClick={() => setNotesModalLearner(null)}>
                    <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="fd-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><NotebookPen size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Candidate Notes</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})</span></div></div>
                            <button onClick={() => setNotesModalLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div className="fd-modal-body">
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.</p>
                            <div><label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '6px', textTransform: 'uppercase' }}>Inspection Finding / Note *</label><textarea rows={4} value={learnerNoteInput} onChange={(e) => setLearnerNoteInput(e.target.value)} placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }} /></div>
                        </div>
                        <div className="fd-modal-footer">
                            <button onClick={() => setNotesModalLearner(null)} className="fd-btn fd-btn--ghost">Cancel</button>
                            <button onClick={handleSaveLearnerNote} className="fd-btn fd-btn--primary"><CheckSquare size={14} /> Save Note</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedGrievance && (
                <div className="fd-modal-overlay" onClick={() => setSelectedGrievance(null)}>
                    <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="fd-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Scale size={18} color="#4ade80" /><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3></div>
                            <button onClick={() => setSelectedGrievance(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div className="fd-modal-body">
                            <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.82rem' }}>
                                <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div><div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div><div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}><strong>Details:</strong><p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p></div>
                            </div>
                            <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label><div className="fd-select-wrap"><select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} className="fd-select" style={{ width: '100%' }}><option value="open">Open (Awaiting Investigation)</option><option value="under_review">Under Review by Moderation Committee</option><option value="resolved">Resolved (Official Findings Logged)</option></select><ChevronDown size={14} /></div></div>
                            <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label><textarea rows={4} value={grievanceResolutionNotes} onChange={(e) => setGrievanceResolutionNotes(e.target.value)} placeholder="Enter committee notes, resolution details, or outcome letter comments..." style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} /></div>
                        </div>
                        <div className="fd-modal-footer">
                            <button onClick={() => setSelectedGrievance(null)} className="fd-btn fd-btn--ghost">Cancel</button>
                            <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} className="fd-btn fd-btn--primary">{isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution</button>
                        </div>
                    </div>
                </div>
            )}

            {inspectedLearner && (
                <div className="fd-modal-overlay" onClick={() => setInspectedLearner(null)}>
                    <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh' }}>
                        <div className="fd-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileCheck size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Inspection Vault: {inspectedLearner.fullName}</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}</span><div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>Target Qualification: {inspectedLearner.programmeName}</div></div></div>
                            <button onClick={() => setInspectedLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div className="fd-modal-body">
                            {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (<div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><UserX size={16} color="#dc2626" /><span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span></div>)}
                            <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} /><strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'var(--fd-blue)' }}>Auditor Candidate Spot-Check Flag</strong></div>
                                    <button onClick={() => handleToggleCandidateFlag(inspectedLearner.id)} className={`fd-btn fd-btn--sm ${candidateFlags[inspectedLearner.id]?.flagged ? 'fd-btn--primary' : 'fd-btn--ghost'}`} style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : undefined, color: candidateFlags[inspectedLearner.id]?.flagged ? '#fff' : undefined }}>{candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate'}</button>
                                </div>
                                {candidateFlags[inspectedLearner.id]?.flagged && (<textarea rows={2} value={candidateFlags[inspectedLearner.id]?.note || ''} onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)} placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '10px', fontSize: '0.8rem', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />)}
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={14} /> Curriculum Completion &amp; Attendance Ledger</h4>
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', background: '#fff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
                                    <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
                                    <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
                                    <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
                                    <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
                                </div>
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})</h4>
                                {inspectedLearnerSubmissions.length === 0 ? (<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '0.82rem' }}><AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />No digital submission documents found in Firestore for this candidate ID.</div>)
                                : (<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{inspectedLearnerSubmissions.map((sub: any) => { const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task'; const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase(); const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl; const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase()); return (<div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.82rem' }}><div><div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><span>{subTitle}</span><span className="fd-pill fd-pill--progress" style={{ fontSize: '0.65rem' }}>{subType}</span></div><div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong></div></div><div>{fileUrl ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fd-btn fd-btn--ghost fd-btn--sm"><ExternalLink size={12} /> View File</a> : <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>}</div></div>); })}</div>)}
                            </div>
                        </div>
                        <div className="fd-modal-footer"><button onClick={() => setInspectedLearner(null)} className="fd-btn fd-btn--primary">Close Inspection Drawer</button></div>
                    </div>
                </div>
            )}

            {showEndorseModal && (
                <div className="fd-modal-overlay" onClick={() => setShowEndorseModal(false)}>
                    <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="fd-modal-header">
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Record Official Audit Sign-Off</h3>
                            <button onClick={() => setShowEndorseModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div className="fd-modal-body">
                            <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label><div className="fd-select-wrap"><select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} className="fd-select" style={{ width: '100%' }}><option value="approved">Fully Approved &amp; Endorsed</option><option value="conditional">Conditional Approval (Minor Corrective Actions)</option><option value="rejected">Rejected (Major Compliance Audit Failure)</option></select><ChevronDown size={14} /></div></div>
                            <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label><textarea rows={5} value={auditNotes} onChange={(e) => setAuditNotes(e.target.value)} placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..." style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }} /></div>
                        </div>
                        <div className="fd-modal-footer">
                            <button onClick={() => setShowEndorseModal(false)} className="fd-btn fd-btn--ghost">Cancel</button>
                            <button onClick={handleSaveEndorsement} disabled={isSavingEndorsement} className="fd-btn fd-btn--primary">{isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record</button>
                        </div>
                    </div>
                </div>
            )}

            {isPendingStart && <InspectionStartGate grant={accessGrant} onStart={() => setHasStartedLocal(true)} />}
            {isSessionExpired && accessGrant && <SessionExpiredGate durationMinutes={accessGrant.durationMinutes} />}

            {statusModal.isOpen && (
                <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} confirmText="Acknowledge" onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))} />
            )}
        </div>
    );
};

export default AuditorPortalView;



// // src/pages/AuditorPortal/AuditorPortalView.tsx

// import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// import { useSearchParams, useNavigate } from 'react-router-dom';
// import {
//     ShieldCheck, Search, Eye, Lock,
//     FileCheck, UserCheck, X, CheckSquare,
//     Briefcase, Activity, Users, Award,
//     Loader2, ChevronLeft, ChevronRight, ChevronDown,
//     Printer, Flag, ExternalLink, AlertCircle,
//     FileText, BarChart3, UserX,
//     Scale, Filter, Download, RefreshCw,
//     FileArchive, FileSignature,
//     MessageSquare, NotebookPen, Tag,
//     BookOpen, Layers, Clock
// } from 'lucide-react';
// import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { useToast } from '../../components/common/Toast/Toast';
// import Loader from '../../components/common/Loader/Loader';
// import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// import '../AdminDashboard/FunderDashboard/FunderDashboard.css';

// type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

// interface SampledLearner {
//     id: string;
//     userId: string;
//     fullName: string;
//     idNumber: string;
//     cohortId: string;
//     cohortName: string;
//     programmeName: string;
//     overallProgress: number;
//     attendance: { attended: number; total: number; pct: number };
//     formatives: { completed: number; total: number };
//     summatives: { completed: number; total: number };
//     practicals: { completed: number; total: number };
//     workplaces: { completed: number; total: number };
//     sorStatus: string;
//     popiaConsent: boolean;
//     hasSignature: boolean;
//     status: string;
//     gender?: string;
//     equityGroup?: string;
//     disabilityStatus?: string;
//     birthDate?: string;
//     codeOfConductSigned?: boolean;
//     appealsPolicySigned?: boolean;
// }

// interface AuditorLearnerFlag {
//     flagged: boolean;
//     note: string;
// }

// interface GrievanceRecord {
//     docId: string;
//     id: string;
//     learnerName: string;
//     cohortId: string;
//     dateLogged: string;
//     type: 'appeal' | 'complaint';
//     status: 'open' | 'under_review' | 'resolved';
//     description: string;
//     resolutionNotes?: string;
// }

// interface ActiveExport {
//     requestId: string;
//     learnerId: string;
//     progress: number;
//     progressMessage: string;
//     status: 'pending' | 'processing' | 'completed' | 'error';
//     downloadUrl?: string;
//     errorMessage?: string;
// }

// interface ExportProgressState {
//     status: 'idle' | 'generating' | 'downloading';
//     percent: number;
// }

// interface ReportCache {
//     downloadUrl: string;
//     generatedAt: string;
//     totalRecords?: number;
// }

// const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];
// const DROPPED_KEYWORDS = ['dropped', 'dropped_out', 'withdrawn', 'terminated', 'archived', 'inactive', 'cancelled', 'discontinued', 'suspended'];

// const MIDNIGHT = 'var(--fd-blue, #002b49)';
// const GREEN = 'var(--fd-green, #94c73d)';

// const VERIFIED_STORAGE_KEY = 'ap-human-verified-v1';
// const DISCLAIMER_STORAGE_KEY = 'ap-disclaimer-agreed-v1.1';

// const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

// const downloadFileWithProgress = (
//     url: string,
//     filename: string,
//     onProgress: (percent: number) => void
// ): Promise<void> => {
//     return new Promise((resolve, reject) => {
//         const xhr = new XMLHttpRequest();
//         xhr.open('GET', url, true);
//         xhr.responseType = 'blob';
//         xhr.onprogress = (event) => {
//             if (event.lengthComputable && event.total > 0) {
//                 onProgress(Math.round((event.loaded / event.total) * 100));
//             } else if (event.loaded > 0) {
//                 const estimatedTotal = event.loaded + 50000;
//                 onProgress(Math.min(99, Math.round((event.loaded / estimatedTotal) * 100)));
//             }
//         };
//         xhr.onload = () => {
//             if (xhr.status === 200) {
//                 const blob = xhr.response;
//                 const blobUrl = window.URL.createObjectURL(blob);
//                 const link = document.createElement('a');
//                 link.href = blobUrl;
//                 link.download = filename;
//                 document.body.appendChild(link);
//                 link.click();
//                 document.body.removeChild(link);
//                 window.URL.revokeObjectURL(blobUrl);
//                 onProgress(100);
//                 resolve();
//             } else {
//                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
//             }
//         };
//         xhr.onerror = () => reject(new Error('Network error during file download.'));
//         xhr.send();
//     });
// };

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
//             setValue(Math.round(from + (target - from) * eased));
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

// type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

// const STATUS_MESSAGES = ['Syncing QCTO data', 'Compiling evidence', 'Building your portal'];

// const greeting = () => {
//     const h = new Date().getHours();
//     return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
// };

// const DOTS = Array.from({ length: 18 }, (_, i) => ({
//     x: (i * 37 + 7) % 100,
//     s: 3 + (i % 4) * 2,
//     d: 6 + (i % 5) * 1.6,
//     delay: (i % 7) * 0.7
// }));

// const useIntro = (enabled: boolean, isLoading: boolean, minDuration: number, startTimer: boolean) => {
//     const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
//     const minMs = reduced ? 500 : minDuration;
//     const [phase, setPhase] = useState<Phase>(() => (enabled ? 'loading' : 'done'));
//     const [minElapsed, setMinElapsed] = useState(false);
//     useEffect(() => {
//         if (!startTimer) return;
//         const t = setTimeout(() => setMinElapsed(true), minMs);
//         return () => clearTimeout(t);
//     }, [minMs, startTimer]);
//     useEffect(() => {
//         if (phase === 'loading' && minElapsed && !isLoading) setPhase('welcome');
//     }, [phase, minElapsed, isLoading]);
//     useEffect(() => {
//         if (phase === 'welcome') {
//             const t = setTimeout(() => setPhase('reveal'), reduced ? 600 : 1700);
//             return () => clearTimeout(t);
//         }
//         if (phase === 'reveal') {
//             const t = setTimeout(() => setPhase('done'), reduced ? 100 : 1100);
//             return () => clearTimeout(t);
//         }
//     }, [phase, reduced]);
//     const skip = () => setPhase(p => (p === 'loading' || p === 'welcome' ? 'reveal' : p));
//     return { phase, skip, minMs, setPhase };
// };

// const IntroLoader: React.FC<{
//     phase: Phase;
//     minMs: number;
//     userName?: string;
//     logoSrc?: string;
//     learnerCount: number;
//     onSkip: () => void;
// }> = ({ phase, minMs, userName, logoSrc, learnerCount }) => {
//     const [started, setStarted] = useState(false);
//     const [msgIndex, setMsgIndex] = useState(0);
//     useEffect(() => {
//         const raf = requestAnimationFrame(() => setStarted(true));
//         return () => cancelAnimationFrame(raf);
//     }, []);
//     useEffect(() => {
//         if (phase !== 'loading') return;
//         const t = setInterval(() => setMsgIndex(i => (i + 1) % STATUS_MESSAGES.length), 850);
//         return () => clearInterval(t);
//     }, [phase]);
//     const welcome = phase !== 'loading';
//     const pct = welcome ? 100 : started ? 88 : 0;
//     const background = (
//         <>
//             <div className="fd-ld-bg" />
//             <span className="fd-ld-orb fd-ld-orb--a" />
//             <span className="fd-ld-orb fd-ld-orb--b" />
//             {DOTS.map((d, i) => (
//                 <span key={i} className="fd-ld-dot" style={{ ['--x' as any]: d.x, ['--s' as any]: `${d.s}px`, ['--d' as any]: `${d.d}s`, ['--delay' as any]: `${d.delay}s` }} />
//             ))}
//         </>
//     );
//     return (
//         <div className={`fd-ld ${phase === 'reveal' ? 'fd-ld--reveal' : ''}`} role="status" aria-live="polite">
//             <div className="fd-ld-panel fd-ld-panel--top">{background}</div>
//             <div className="fd-ld-panel fd-ld-panel--bottom">{background}</div>
//             <div className="fd-ld-center">
//                 <div className="fd-ld-mark">
//                     <span className="fd-ld-orbit" />
//                     <span className="fd-ld-orbit fd-ld-orbit--2" />
//                     <svg className="fd-ld-ring-svg" viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
//                         <circle className="fd-ld-ring-track" cx="50" cy="50" r="45" />
//                         <circle className={`fd-ld-ring ${welcome ? 'fd-ld-ring--done' : ''}`} cx="50" cy="50" r="45" />
//                     </svg>
//                     <div className="fd-ld-core">
//                         {logoSrc && !welcome ? (
//                             <div className="fd-ld-logo"><img src={logoSrc} alt="mLab Logo" /></div>
//                         ) : !welcome ? (
//                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
//                                 <img src={mLabLogo} alt="mLab Logo" height={24} />
//                                 <div className="fd-ld-bars" aria-hidden="true" style={{ scale: '0.6' }}>
//                                     <span /><span /><span /><span /><span />
//                                 </div>
//                             </div>
//                         ) : null}
//                         {welcome && (
//                             <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
//                                 <path className="fd-ld-check" d="M14 29 L24 39 L43 18" />
//                             </svg>
//                         )}
//                     </div>
//                 </div>
//                 {!welcome ? (
//                     <div className="fd-ld-text" key="loading">
//                         <div className="fd-ld-eyebrow">Auditor Portal</div>
//                         <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
//                         <div className="fd-ld-progress">
//                             <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
//                         </div>
//                     </div>
//                 ) : (
//                     <div className="fd-ld-text" key="welcome">
//                         <div className="fd-ld-eyebrow">{greeting()}</div>
//                         <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
//                         <p className="fd-ld-sub">Your audit sandbox is ready &middot; {learnerCount} records verified</p>
//                         <div className="fd-ld-progress">
//                             <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
//                         </div>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };

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
//         if (pct >= 95) { setIsDragging(false); setSliderPos(100); setTimeout(() => onVerify(), 250); }
//     };
//     return (
//         <div className="fd-bot-overlay">
//             <div className="fd-bot-card">
//                 <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
//                     <ShieldCheck size={28} />
//                 </div>
//                 <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>Human Verification Required</h3>
//                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>To protect audit integrity, please slide to confirm you are human.</p>
//                 <div ref={trackRef} className="fd-bot-slider-track"
//                     onMouseMove={(e) => handleMove(e.clientX)}
//                     onTouchMove={(e) => handleMove(e.touches[0].clientX)}
//                     onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
//                     onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}>
//                     <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
//                     <span className="fd-bot-slider-text">{sliderPos >= 95 ? 'Verified!' : 'Slide to Access Portal ➔'}</span>
//                     <div className="fd-bot-slider-thumb"
//                         style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
//                         onMouseDown={() => setIsDragging(true)}
//                         onTouchStart={() => setIsDragging(true)}>
//                         <Lock size={16} />
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// const DisclaimerGate: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
//     const [isChecked, setIsChecked] = useState(false);
//     const [isSubmitting, setIsSubmitting] = useState(false);
//     const handleAcknowledge = async () => {
//         if (!isChecked) return;
//         setIsSubmitting(true);
//         setTimeout(() => onAgree(), 600);
//     };
//     return (
//         <div className="fd-bot-overlay" style={{ background: 'linear-gradient(135deg, rgba(0, 43, 73, 0.5) 0%, rgba(100, 163, 88, 0.2) 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
//             <div style={{ width: 'min(100%, 640px)', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRadius: '20px', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.5rem 2rem', borderBottom: '1px solid var(--fd-line, #e4eaf0)', flexShrink: 0, background: '#fff' }}>
//                     <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--mlab-blue) 12%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', flexShrink: 0 }}>
//                         <ShieldCheck size={22} />
//                     </div>
//                     <div>
//                         <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>POPIA Data Privacy &amp; Protection</h3>
//                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fd-muted, #5b6b7c)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Mandatory Compliance Notice</div>
//                     </div>
//                 </div>
//                 <div className="fd-scroll" style={{ padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#fff' }}>
//                     <p style={{ margin: '0 0 1.2rem 0', fontWeight: 600, color: 'var(--fd-ink, #0b1f33)' }}>
//                         This dashboard contains personal and potentially sensitive information relating to learners and programme participants. The information is provided to authorised stakeholders strictly for legitimate programme reporting, monitoring, evaluation, verification and related organisational purposes.
//                     </p>
//                     <p style={{ margin: '0 0 1.2rem 0' }}>
//                         In accordance with the <strong>Protection of Personal Information Act 4 of 2013 (POPIA)</strong>, access to and use of this information is restricted to authorised persons and must be limited to the purpose for which it has been provided.
//                     </p>
//                     <strong style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--fd-blue, #002b49)' }}>By accessing this dashboard, you agree to:</strong>
//                     <ul style={{ margin: '0 0 1.2rem 0', paddingLeft: '1.4rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                         <li>Keep all personal information confidential and secure.</li>
//                         <li>Use the information only for the authorised purpose for which access has been granted.</li>
//                         <li>Not copy, download, reproduce, publish, disclose, distribute or share the information with any unauthorised person or third party.</li>
//                         <li>Take reasonable measures to prevent unauthorised access, loss, disclosure, alteration or misuse of the information.</li>
//                         <li>Not use the information for any secondary or unrelated purpose without appropriate authorisation and lawful basis.</li>
//                         <li>Immediately notify the designated responsible party of any suspected or actual security compromise, unauthorised access or disclosure.</li>
//                         <li>Ensure that any person granted access to the information is appropriately authorised and subject to equivalent confidentiality and data-protection requirements.</li>
//                         <li>Cease use of the information and securely delete or return any copies when access or the authorised purpose comes to an end, where applicable.</li>
//                     </ul>
//                     <p style={{ margin: '0 0 0.85rem 0' }}>
//                         Where an external stakeholder processes personal information on behalf of the responsible party, such processing must be undertaken only with the knowledge and authorisation of the responsible party and in accordance with applicable POPIA requirements and any relevant data-processing or confidentiality agreement.
//                     </p>
//                     <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>Unauthorised access, use, disclosure or distribution of this information is strictly prohibited.</p>
//                 </div>
//                 <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--fd-line, #e4eaf0)', background: '#f8fafc', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                     <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
//                         <div style={{ paddingTop: '2px' }}>
//                             <input type="checkbox" checked={isChecked} onChange={(e) => setIsChecked(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--mlab-green)' }} />
//                         </div>
//                         <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fd-blue, #002b49)', lineHeight: 1.4 }}>I have read and acknowledge the above notice and agree to handle the information in accordance with the stated requirements.</span>
//                     </label>
//                     <button className={`fd-btn ${isChecked ? 'fd-btn--primary' : ''}`} disabled={!isChecked || isSubmitting} onClick={handleAcknowledge}
//                         style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', width: '100%', background: !isChecked ? '#e2e8f0' : undefined, color: !isChecked ? '#94a3b8' : undefined, cursor: !isChecked ? 'not-allowed' : 'pointer', border: 'none', borderRadius: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
//                         {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
//                         {isSubmitting ? 'Recording Acknowledgement...' : 'Acknowledge & Continue'}
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// };

// export const AuditorPortalView: React.FC = () => {
//     const toast = useToast();
//     const navigate = useNavigate();
//     const [searchParams, setSearchParams] = useSearchParams();

//     const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => { try { return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true'; } catch { return false; } });
//     const [isDisclaimerAgreed, setIsDisclaimerAgreed] = useState<boolean>(() => { try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { return false; } });

//     const handleHumanVerified = () => { setIsHumanVerified(true); try { sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true'); } catch {} };
//     const handleDisclaimerAgreed = async () => {
//         setIsDisclaimerAgreed(true);
//         try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch {}
//         let deviceId = localStorage.getItem('ap-device-id');
//         if (!deviceId) { deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; localStorage.setItem('ap-device-id', deviceId); }
//         try { await fetch('https://your-database-api-or-webhook.com/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, action: 'POPIA_AGREEMENT_ACCEPTED_AUDITOR', timestamp: new Date().toISOString(), userAgent: navigator.userAgent }), keepalive: true }); } catch (err) { console.error("Failed to log audit trail.", err); }
//     };

//     const { user: currentUser, cohorts: storeCohorts, learners: storeLearners, programmes: storeProgrammes, fetchProgrammes, fetchCohorts, fetchLearners } = useStore() as any;

//     const initialCohortFromUrl = searchParams.get('cohort') || '';
//     const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
//     const initialSearchFromUrl = searchParams.get('search') || '';

//     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
//     const [isLoading, setIsLoading] = useState(true);
//     const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
//     const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
//     const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);
//     const [currentPage, setCurrentPage] = useState<number>(1);
//     const [itemsPerPage, setItemsPerPage] = useState<number>(10);
//     const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});
//     const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
//     const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');
//     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
//     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
//     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
//     const [rawUsers, setRawUsers] = useState<any[]>([]);
//     const [rawLearners, setRawLearners] = useState<any[]>([]);
//     const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);
//     const [rawAttendance, setRawAttendance] = useState<any[]>([]);
//     const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
//     const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);
//     const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);
//     const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
//     const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
//     const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
//     const [isSavingGrievance, setIsSavingGrievance] = useState(false);
//     const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
//     const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');
//     const [policySearchTerm, setPolicySearchTerm] = useState('');
//     const [showEndorseModal, setShowEndorseModal] = useState(false);
//     const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
//     const [auditNotes, setAuditNotes] = useState('');
//     const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);
//     const [statusModal, setStatusModal] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'error', title: '', message: '' });
//     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
//     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
//     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
//     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);
//     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

//     const isDataLoading = isLoading || (!storeCohorts || storeCohorts.length === 0);
//     const { phase, skip, minMs, setPhase } = useIntro(true, isDataLoading, 2600, isHumanVerified);
//     const introDone = phase === 'reveal' || phase === 'done';
//     const revealed = introDone && isDisclaimerAgreed;

//     // Safety timeout: force-complete intro after 5s
//     useEffect(() => {
//         if (!isHumanVerified) return;
//         const safetyTimer = setTimeout(() => {
//             if (phase === 'loading') { console.log('[AuditorPortal] Safety timeout: forcing intro to welcome'); setPhase('welcome'); }
//         }, 5000);
//         return () => clearTimeout(safetyTimer);
//     }, [isHumanVerified, phase, setPhase]);

//     useEffect(() => {
//         console.log('[AuditorPortal] Store check:', { hasCohorts: !!storeCohorts, cohortsCount: storeCohorts?.length || 0, hasLearners: !!storeLearners, learnersCount: storeLearners?.length || 0, hasProgrammes: !!storeProgrammes, programmesCount: storeProgrammes?.length || 0, currentUser: currentUser?.uid, isTemp: currentUser?.isTemporaryAuditor, role: currentUser?.role });
//         if (!currentUser?.isTemporaryAuditor) {
//             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
//             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
//             if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
//         } else {
//             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
//             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
//         }
//     }, [currentUser?.isTemporaryAuditor, storeCohorts, storeLearners, storeProgrammes]);

//     useEffect(() => { setCurrentPage(1); }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);
//     useEffect(() => { setLastNlrdExport(null); setLastMatrixExport(null); }, [selectedCohortId]);

//     useEffect(() => {
//         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
//         const unsubPoe = onSnapshot(qPoe, (snap) => {
//             const exportsMap: Record<string, ActiveExport> = {};
//             snap.docs.forEach(docSnap => {
//                 const data = docSnap.data();
//                 const lId = data.learnerId;
//                 if (lId && !exportsMap[lId]) {
//                     exportsMap[lId] = { requestId: docSnap.id, learnerId: lId, progress: data.progress || 0, progressMessage: data.progressMessage || '', status: data.status || 'pending', downloadUrl: data.downloadUrl, errorMessage: data.errorMessage };
//                 }
//             });
//             setActiveExports(prev => ({ ...exportsMap, ...prev }));
//         });
//         return () => unsubPoe();
//     }, []);

//     const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
//         const newParams: Record<string, string> = {};
//         if (cohortId) newParams.cohort = cohortId;
//         if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
//         if (search) newParams.search = search;
//         setSearchParams(newParams, { replace: true });
//     }, [setSearchParams]);

//     const allowedCohortsForAuditor = useMemo(() => {
//         if (!storeCohorts || storeCohorts.length === 0) return [];
//         const allowedIds: string[] = [
//             ...(Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : []),
//             ...(Array.isArray(currentUser?.assignedCohortIds) ? currentUser.assignedCohortIds : []),
//             ...(Array.isArray(currentUser?.cohortIds) ? currentUser.cohortIds : []),
//             ...(Array.isArray(currentUser?.allowedCohorts) ? currentUser.allowedCohorts : []),
//             ...(currentUser?.cohortId ? [currentUser.cohortId] : [])
//         ].map(id => String(id).trim());
//         const uniqueAllowedIds = Array.from(new Set(allowedIds)).filter(id => id.length > 0);
//         if (uniqueAllowedIds.length > 0) { return storeCohorts.filter((c: any) => uniqueAllowedIds.includes(String(c.id).trim())); }
//         const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
//         if (isFullAdmin && !currentUser?.isTemporaryAuditor) { return storeCohorts; }
//         return storeCohorts;
//     }, [storeCohorts, currentUser]);

//     useEffect(() => {
//         if (allowedCohortsForAuditor.length > 0) {
//             const isValidSelection = allowedCohortsForAuditor.some((c: any) => String(c.id).trim() === String(selectedCohortId).trim());
//             if (!selectedCohortId || !isValidSelection) {
//                 const defaultCohortId = allowedCohortsForAuditor[0].id;
//                 setSelectedCohortId(defaultCohortId);
//                 syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
//             }
//         } else { setSelectedCohortId(''); }
//     }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

//     useEffect(() => {
//         setIsLoading(true);
//         const handlePermissionError = (collectionName: string, err: any) => { console.warn(`[Firestore Permission Guard] Access to '${collectionName}' restricted:`, err); setIsLoading(false); };
//         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
//             const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             console.log('[AuditorPortal] Enrollments loaded:', enrolls.length);
//             setRawEnrollments(enrolls);
//         }, (err) => handlePermissionError('enrollments', err));
//         const unsubSubmissions = onSnapshot(collection(db, 'learner_submissions'), (snap) => {
//             const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             console.log('[AuditorPortal] Submissions loaded:', subs.length);
//             setRawSubmissions(subs);
//             setIsLoading(false);
//         }, (err) => handlePermissionError('learner_submissions', err));
//         const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => { setRawUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); }, (err) => handlePermissionError('users', err));
//         const unsubLearners = onSnapshot(collection(db, 'learners'), (snap) => { setRawLearners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); }, (err) => handlePermissionError('learners', err));
//         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
//         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
//             const parsedGrievances: GrievanceRecord[] = [];
//             snap.docs.forEach(docSnap => {
//                 const data = docSnap.data();
//                 parsedGrievances.push({
//                     docId: docSnap.id, id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(), learnerName: data.learnerName || 'Unknown Learner', cohortId: data.cohortId || data.cohortRunId || '',
//                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0], type: data.type || 'appeal',
//                     status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'), description: data.reason || data.description || 'No description provided', resolutionNotes: data.resolutionNotes || ''
//                 });
//             });
//             setRawGrievances(parsedGrievances);
//         }, (err) => handlePermissionError('assessment_appeals', err));
//         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => { setRawPolicySignoffs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, (err) => handlePermissionError('learner_policy_signoffs', err));
//         const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance', err));
//         const unsubAttLogs = onSnapshot(collection(db, 'attendance_logs'), (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_logs', err));
//         const unsubAttRecords = onSnapshot(collection(db, 'attendance_records'), (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_records', err));
//         return () => { unsubEnrollments(); unsubSubmissions(); unsubUsers(); unsubLearners(); unsubGrievances(); unsubPolicies(); unsubAttendance(); unsubAttLogs(); unsubAttRecords(); };
//     }, []);

//     const addCleanKey = (setObj: Set<string>, val: any) => { if (val && typeof val === 'string') { const cleaned = val.trim().toLowerCase(); if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') setObj.add(cleaned); } };
//     const checkCocSignedInObject = (obj: any) => { if (!obj) return false; const demo = obj.demographics || {}; return obj.codeOfConductSigned === true || obj.hasSignedCoc === true || obj.cocSigned === true || obj.policySigned === true || obj.isPolicySigned === true || demo.codeOfConductSigned === true || demo.hasSignedCoc === true || demo.cocSigned === true || demo.policySigned === true || !!obj.signatureUrl || !!demo.signatureUrl; };

//     const cocSignedKeysSet = useMemo(() => {
//         const keys = new Set<string>();
//         rawPolicySignoffs.forEach((d: any) => { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); });
//         rawUsers.forEach((u: any) => { if (checkCocSignedInObject(u)) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
//         rawLearners.forEach((l: any) => { if (checkCocSignedInObject(l)) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
//         rawEnrollments.forEach((e: any) => { if (checkCocSignedInObject(e)) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
//         return keys;
//     }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

//     const appealsSignedKeysSet = useMemo(() => {
//         const keys = new Set<string>();
//         rawPolicySignoffs.forEach((d: any) => { const type = String(d.policyType || d.policyName || '').toLowerCase(); if (type.includes('appeal')) { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); } });
//         rawUsers.forEach((u: any) => { if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
//         rawLearners.forEach((l: any) => { if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
//         return keys;
//     }, [rawPolicySignoffs, rawUsers, rawLearners])

//     const popiaConsentKeysSet = useMemo(() => {
//         const keys = new Set<string>();
//         rawUsers.forEach((u: any) => { const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
//         rawLearners.forEach((l: any) => { const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
//         rawEnrollments.forEach((e: any) => { const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
//         return keys;
//     }, [rawUsers, rawLearners, rawEnrollments])

//     const activeProgrammeData = useMemo(() => {
//         if (!selectedCohortId) return null;
//         const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
//         if (!cohort) return null;
//         return storeProgrammes?.find((p: any) => p.id === cohort.programmeId || p.id === cohort.qualificationId || (p.saqaId && String(p.saqaId) === String(cohort.saqaId))) || null;
//     }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

//     const dailyRegisters = useMemo(() => {
//         const unifiedMap = new Map<string, any>();
//         const matchCohort = (r: any) => { if (!selectedCohortId || selectedCohortId === 'ALL') return true; const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim(); return rCohort === selectedCohortId; };
//         const filteredAtt = rawAttendance.filter(matchCohort); const filteredLogs = rawAttendanceLogs.filter(matchCohort); const filteredRecords = rawAttendanceRecords.filter(matchCohort);
//         filteredAtt.forEach(record => {
//             if (record.presentLearners || record.absentLearners) { const dateKey = record.date || record.id; unifiedMap.set(record.id || dateKey, { id: record.id || dateKey, date: record.date || 'Unknown', presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [], absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [], partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : [] }); }
//             else if (record.learnerId && record.date) { const dateKey = `eco_${record.date}`; if (!unifiedMap.has(dateKey)) { unifiedMap.set(dateKey, { id: dateKey, date: record.date, presentLearners: [], absentLearners: [], partialLearners: [] }); } const entry = unifiedMap.get(dateKey); const status = String(record.status || '').toLowerCase(); if (status.includes('present')) entry.presentLearners.push(record.learnerId); else if (status.includes('absent')) entry.absentLearners.push(record.learnerId); else if (status.includes('partial')) entry.partialLearners.push(record.learnerId); }
//         });
//         filteredLogs.forEach(log => {
//             const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
//             const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);
//             const present: string[] = []; const absent: string[] = []; const partial: string[] = [];
//             recordsForLog.forEach(r => { const status = String(r.status || '').toLowerCase(); const lKey = r.learnerId || r.authUid || r.userId; if (lKey) { if (status.includes('present')) present.push(lKey); else if (status.includes('absent')) absent.push(lKey); else if (status.includes('partial')) partial.push(lKey); } });
//             unifiedMap.set(log.id, { id: log.id, date: dateStr, presentLearners: present, absentLearners: absent, partialLearners: partial });
//         });
//         const unifiedArray = Array.from(unifiedMap.values());
//         unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
//         return unifiedArray;
//     }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

//     const rosterAttendanceMap = useMemo(() => {
//         const keyAttendanceMap = new Map<string, number>(); const totalSessions = dailyRegisters.length;
//         const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
//             const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
//             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
//             const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
//             const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));
//             const keys = [e.id, e.userId, e.learnerId, e.authUid, e.idNumber, actualUserId, storeLearner?.id, storeLearner?.learnerId, storeLearner?.authUid, storeLearner?.idNumber, rawUser?.id, rawUser?.authUid, rawUser?.idNumber, rawLearner?.id, rawLearner?.authUid, rawLearner?.idNumber].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');
//             return Array.from(new Set(keys.map(k => k.trim().toLowerCase())));
//         });
//         candidateKeyGroups.forEach(group => { group.forEach(k => { keyAttendanceMap.set(k, 0); }); });
//         dailyRegisters.forEach(reg => { const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase()); candidateKeyGroups.forEach(group => { const isCandidatePresent = group.some(k => presentList.includes(k)); if (isCandidatePresent) { group.forEach(k => { keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1); }); } }); });
//         const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
//         candidateKeyGroups.forEach(group => { const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0); const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0; const stats = { attended: bestAttended, total: totalSessions, pct }; group.forEach(k => { finalMap.set(k, stats); }); });
//         return finalMap;
//     }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

//     const handleCohortChange = (cohortId: string) => { setSelectedCohortId(cohortId); syncQueryParams(cohortId, samplePercentage, searchTerm); };
//     const handleSamplePercentageChange = (pct: number) => { setSamplePercentage(pct); setSearchTerm(''); syncQueryParams(selectedCohortId, pct, ''); };
//     const handleSearchChange = (term: string) => { setSearchTerm(term); syncQueryParams(selectedCohortId, samplePercentage, term); };
//     const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => { setCandidateFlags(prev => { const current = prev[candidateId]; const isCurrentlyFlagged = current?.flagged; return { ...prev, [candidateId]: { flagged: !isCurrentlyFlagged, note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : '' } }; }); toast.info("Candidate spot-check flag status updated."); };
//     const handleUpdateFlagNote = (candidateId: string, noteText: string) => { setCandidateFlags(prev => ({ ...prev, [candidateId]: { flagged: true, note: noteText } })); };
//     const handleOpenNotesModal = (learner: SampledLearner) => { setNotesModalLearner(learner); setLearnerNoteInput(candidateFlags[learner.id]?.note || ''); };
//     const handleSaveLearnerNote = () => { if (!notesModalLearner) return; handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput); toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`); setNotesModalLearner(null); };

//     const handleExportSampleManifest = () => {
//         if (sampledLearners.length === 0) { setStatusModal({ isOpen: true, type: 'info', title: 'No Sampled Records', message: 'There are currently no sampled records available in the selected cohort view to export.' }); return; }
//         const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];
//         const csvRows = sampledLearners.map(l => {
//             const flag = candidateFlags[l.id]; const rawIdStr = String(l.idNumber || '').trim(); const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr)) ? rawIdStr.padStart(13, '0') : rawIdStr; const textFormattedId = `="${paddedId}"`;
//             return [`"${l.fullName.replace(/"/g, '""')}"`, textFormattedId, `"${l.status}"`, `"${l.cohortName.replace(/"/g, '""')}"`, `"${l.programmeName.replace(/"/g, '""')}"`, `${l.overallProgress}%`, `${l.attendance.pct}%`, `"${l.attendance.attended}/${l.attendance.total}"`, `"${l.formatives.completed}/${l.formatives.total}"`, `"${l.summatives.completed}/${l.summatives.total}"`, `"${l.practicals.completed}/${l.practicals.total}"`, `"${l.workplaces.completed}/${l.workplaces.total}"`, l.popiaConsent ? 'Signed' : 'Unsigned', flag?.flagged ? 'FLAGGED' : 'CLEAR', `"${(flag?.note || '').replace(/"/g, '""')}"`].join(',');
//         });
//         const csvContent = [headers.join(','), ...csvRows].join('\n');
//         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
//         toast.success("Sample Manifest exported to CSV.");
//     };

//     const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
//         const targetLearnerId = learner.userId || learner.id; const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];
//         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') { toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`); return; }
//         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) { window.open(currentExport.downloadUrl, '_blank'); return; }
//         try {
//             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);
//             const docRef = await addDoc(collection(db, 'poe_export_requests'), { learnerId: targetLearnerId, requestedBy: currentUser?.uid || currentUser?.id || 'auditor', status: 'pending', progress: 0, progressMessage: 'Initializing compliance engine...', createdAt: serverTimestamp() });
//             setActiveExports(prev => ({ ...prev, [learner.id]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' }, [targetLearnerId]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' } }));
//         } catch (error: any) { console.error('Error requesting PoE export:', error); setStatusModal({ isOpen: true, type: 'error', title: 'Export Initialization Failed', message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.` }); }
//     };

//     const cohortPool = useMemo(() => {
//         if (!selectedCohortId) return [];
//         const filteredEnrollments = rawEnrollments.filter(e => e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId);
//         console.log('[AuditorPortal] cohortPool debug:', { selectedCohortId, totalRawEnrollments: rawEnrollments.length, filteredEnrollments: filteredEnrollments.length, firstEnrollmentKeys: rawEnrollments[0] ? Object.keys(rawEnrollments[0]) : [], firstEnrollmentCohortId: rawEnrollments[0]?.cohortId, firstEnrollmentCohortRunId: rawEnrollments[0]?.cohortRunId });
//         return filteredEnrollments.map((enrol, idx): SampledLearner => {
//             const enrolKeys = [enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.id, enrol.uid].filter((k): k is string => typeof k === 'string' && k.trim() !== '');
//             const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';
//             const matchesLearner = (candidate: any) => { if (!candidate) return false; const candidateKeys = [candidate.id, candidate.learnerId, candidate.idNumber, candidate.authUid, candidate.uid, candidate.userId].filter((k): k is string => typeof k === 'string' && k.trim() !== ''); const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase())); const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail; return hasKeyMatch || hasEmailMatch; };
//             const storeLearner = storeLearners?.find(matchesLearner); const rawUser = rawUsers?.find(matchesLearner); const rawLearner = rawLearners?.find(matchesLearner);
//             const activeCohortId = enrol.cohortId || enrol.cohortRunId || selectedCohortId; const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);
//             let storeProgramme = storeProgrammes?.find((p: any) => (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) || (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId))));
//             const mappedName = enrol.userName || enrol.learnerName || enrol.fullName || enrol.name || storeLearner?.fullName || storeLearner?.name || rawLearner?.fullName || rawLearner?.name || rawUser?.fullName || rawUser?.name || 'Learner Candidate';
//             const rawMappedId = enrol.idNumber || storeLearner?.idNumber || rawLearner?.idNumber || rawUser?.idNumber || enrol.learnerId || enrol.userId || enrol.id || 'N/A';
//             const cleanIdStr = String(rawMappedId).trim(); const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr)) ? cleanIdStr.padStart(13, '0') : cleanIdStr;
//             const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';
//             const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification'; const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || ''; const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';
//             const progDetails: string[] = []; if (progNqf) progDetails.push(`NQF Level ${progNqf}`); if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);
//             const mappedProgramme = progDetails.length > 0 ? `${progTitle} (${progDetails.join(' | ')})` : progTitle;
//             const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};
//             const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
//             const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
//             const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';
//             let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;
//             if (storeProgramme) {
//                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
//                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
//                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;
//                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
//                     const flat = storeProgramme.modules;
//                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
//                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
//                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
//                 }
//             }
//             let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0; let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;
//             const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
//             const learnerSubs = rawSubmissions.filter(s => (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) || (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) || (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase()));
//             learnerSubs.forEach(s => {
//                 const type = String(s.type || 'formative').toLowerCase(); const moduleType = String(s.moduleType || '').toLowerCase(); const subStatus = String(s.status || 'not_started').toLowerCase();
//                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;
//                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
//                 const isKnowledge = moduleType === 'knowledge' || moduleType === ''; const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm'); const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');
//                 if (isKnowledge) { if (type.includes('formative') || type.includes('fa')) { totalAssignedFA++; if (isDone) calculatedFA++; } else if (type.includes('summative') || type.includes('sa')) { totalAssignedSA++; if (isDone) calculatedSA++; } } else if (isPractical) { totalAssignedPM++; if (isDone) calculatedPM++; } else if (isWorkplace) { totalAssignedWM++; if (isDone) calculatedWM++; }
//             });
//             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA); const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA); const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM); const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);
//             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM; const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;
//             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;
//             const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) || rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) || rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) || { attended: 0, total: dailyRegisters.length, pct: 0 };
//             const candidateKeys = [actualUserId, enrol.id, enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.email, mappedId, storeLearner?.id, storeLearner?.uid, storeLearner?.authUid, storeLearner?.idNumber, storeLearner?.email, rawUser?.id, rawUser?.uid, rawUser?.authUid, rawUser?.idNumber, rawUser?.email, rawLearner?.id, rawLearner?.authUid, rawLearner?.idNumber, rawLearner?.email];
//             const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
//             const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
//             const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));
//             const enrolStatusLower = String(enrol.status || '').trim().toLowerCase();
//             const isEnrolDropped = DROPPED_KEYWORDS.some(dk => enrolStatusLower.includes(dk)) || enrol.isArchived === true;
//             const resolvedStatus = isEnrolDropped ? (enrol.status || 'dropped') : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');
//             return {
//                 id: enrol.id || `enrol_${selectedCohortId}_${idx}`, userId: actualUserId, fullName: mappedName, idNumber: mappedId, cohortId: activeCohortId, cohortName: mappedCohort, programmeName: mappedProgramme, overallProgress: Math.min(100, dynamicProgress),
//                 attendance: attStats, formatives: { completed: calculatedFA, total: ceilingFA }, summatives: { completed: calculatedSA, total: ceilingSA }, practicals: { completed: calculatedPM, total: ceilingPM }, workplaces: { completed: calculatedWM, total: ceilingWM },
//                 sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'), popiaConsent: isPopiConsented, hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned), status: resolvedStatus,
//                 gender, equityGroup, disabilityStatus, birthDate: demo.birthDate || storeLearner?.birthDate, codeOfConductSigned: isCocSigned, appealsPolicySigned: isAppealsSigned
//             };
//         });
//     }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

//     const sampledLearners = useMemo(() => {
//         if (cohortPool.length === 0) return [];
//         let filtered = cohortPool;
//         if (searchTerm.trim()) { const q = searchTerm.toLowerCase(); return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q)); }
//         if (samplePercentage >= 100) return filtered;
//         const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
//         return [...cohortPool].sort((a, b) => a.id.localeCompare(b.id)).slice(0, sampleSize);
//     }, [cohortPool, samplePercentage, searchTerm]);

//     const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
//     const paginatedLearners = useMemo(() => { return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [sampledLearners, currentPage, itemsPerPage]);

//     const cohortFilteredGrievances = useMemo(() => {
//         let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');
//         if (grievanceFilterStatus !== 'ALL') list = list.filter(g => g.status === grievanceFilterStatus);
//         if (grievanceFilterType !== 'ALL') list = list.filter(g => g.type === grievanceFilterType);
//         return list;
//     }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

//     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
//     const paginatedGrievances = useMemo(() => { return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

//     const searchedPolicyLearners = useMemo(() => { if (!policySearchTerm.trim()) return cohortPool; const q = policySearchTerm.toLowerCase(); return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q)); }, [cohortPool, policySearchTerm]);
//     const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
//     const paginatedPolicyLearners = useMemo(() => { return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [searchedPolicyLearners, currentPage, itemsPerPage]);

//     const cohortMisDemographics = useMemo(() => {
//         const stats = { total: cohortPool.length, sampleTotal: sampledLearners.length, equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 }, gender: { Female: 0, Male: 0, Other: 0 }, disability: { Yes: 0, No: 0 }, youth: { Under35: 0, Adult35Plus: 0 }, attendanceBands: { high: 0, mid: 0, low: 0 } };
//         const currentYear = 2026;
//         cohortPool.forEach(l => {
//             const eq = String(l.equityGroup || '').trim().toLowerCase();
//             if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') stats.equity.African++;
//             else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') stats.equity.Coloured++;
//             else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') stats.equity.Indian++;
//             else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') stats.equity.White++;
//             else stats.equity.African++;
//             const g = String(l.gender || '').trim().toLowerCase();
//             if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') stats.gender.Female++;
//             else if (g.startsWith('m') || g.includes('male') || g === 'man') stats.gender.Male++;
//             else if (l.idNumber && l.idNumber.length >= 7) { const genderDigit = parseInt(l.idNumber.charAt(6), 10); if (!isNaN(genderDigit)) { if (genderDigit >= 5) stats.gender.Male++; else stats.gender.Female++; } else stats.gender.Male++; } else stats.gender.Male++;
//             const d = String(l.disabilityStatus || '').trim().toLowerCase();
//             if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') stats.disability.Yes++; else stats.disability.No++;
//             let birthYear = 0; if (l.idNumber && l.idNumber.length >= 6) { const yy = parseInt(l.idNumber.substring(0, 2), 10); birthYear = yy > 30 ? 1900 + yy : 2000 + yy; }
//             if (birthYear > 0 && (currentYear - birthYear) <= 35) stats.youth.Under35++; else stats.youth.Adult35Plus++;
//             const attPct = l.attendance?.pct || 0;
//             if (attPct >= 75) stats.attendanceBands.high++; else if (attPct >= 40) stats.attendanceBands.mid++; else stats.attendanceBands.low++;
//         });
//         return stats;
//     }, [cohortPool, sampledLearners]);

//     const inspectedLearnerSubmissions = useMemo(() => {
//         if (!inspectedLearner) return [];
//         const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();
//         return rawSubmissions.filter(s => (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) || (s.authUid && String(s.authUid).toLowerCase() === targetUserId) || (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase()));
//     }, [inspectedLearner, rawSubmissions]);

//     const activeCohortData = useMemo(() => { return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null; }, [allowedCohortsForAuditor, selectedCohortId]);

//     const handleSaveEndorsement = async () => {
//         if (!auditNotes.trim()) { setStatusModal({ isOpen: true, type: 'warning', title: 'Missing Audit Notes', message: 'Please enter auditor verification findings and notes before recording official sign-off.' }); return; }
//         setIsSavingEndorsement(true);
//         try {
//             await addDoc(collection(db, 'cohort_audit_endorsements'), { cohortId: selectedCohortId, cohortName: activeCohortData?.name || 'Cohort', auditorUid: currentUser?.uid || 'external_auditor', auditorName: currentUser?.fullName || 'External Quality Assurer', organization: currentUser?.organization || 'QCTO / SETA', sampleSizePercentage: samplePercentage, sampledRecordsCount: sampledLearners.length, totalCohortCount: cohortPool.length, outcome: auditOutcome, notes: auditNotes, flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length, signedAt: serverTimestamp(), createdAt: new Date().toISOString() });
//             toast.success("Audit verification & endorsement recorded successfully."); setShowEndorseModal(false); setAuditNotes('');
//         } catch (err: any) { console.error("Failed to save endorsement:", err); setStatusModal({ isOpen: true, type: 'error', title: 'Sign-Off Failed', message: err.message || 'Failed to record official audit verification sign-off record.' }); }
//         finally { setIsSavingEndorsement(false); }
//     };

//     const handleSaveGrievanceResolution = async () => {
//         if (!selectedGrievance) return; setIsSavingGrievance(true);
//         try { await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), { status: grievanceStatusInput, resolutionNotes: grievanceResolutionNotes, resolvedAt: serverTimestamp(), resolvedBy: currentUser?.uid || 'external_auditor' }); toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`); setSelectedGrievance(null); setGrievanceResolutionNotes(''); }
//         catch (err: any) { console.error("Failed to update grievance:", err); setStatusModal({ isOpen: true, type: 'error', title: 'Resolution Update Failed', message: err.message || 'Failed to save grievance resolution details.' }); }
//         finally { setIsSavingGrievance(false); }
//     };

//     const handleExportNLRD = async () => {
//         if (nlrdProgress.status !== 'idle') return; setNlrdProgress({ status: 'generating', percent: 15 }); toast.info(`Requesting NLRD Pipe-Delimited Batch...`);
//         const timer = setInterval(() => { setNlrdProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
//         try { const functions = getFunctions(); const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport'); const response: any = await generateNlrdFn({ cohortId: selectedCohortId }); clearInterval(timer);
//             if (response.data?.downloadUrl) { setNlrdProgress({ status: 'downloading', percent: 80 }); const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;
//                 await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setNlrdProgress({ status: 'downloading', percent: scaled }); });
//                 setLastNlrdExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalRecords }); toast.success(`NLRD Export completed!`); } }
//         catch (error: any) { clearInterval(timer); console.error('NLRD Export Failed:', error); setStatusModal({ isOpen: true, type: 'error', title: 'NLRD Export Failed', message: error.message || 'An error occurred while attempting to compile the NLRD export batch.' }); }
//         finally { setNlrdProgress({ status: 'idle', percent: 0 }); }
//     };

//     const handleExportThroughputMatrix = async () => {
//         if (matrixProgress.status !== 'idle') return; setMatrixProgress({ status: 'generating', percent: 15 }); toast.info('Compiling Learner Throughput & Compliance Matrix...');
//         const timer = setInterval(() => { setMatrixProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
//         try { const functions = getFunctions(); const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport'); const response: any = await generateMatrixFn({ cohortId: selectedCohortId }); clearInterval(timer);
//             if (response.data?.downloadUrl) { setMatrixProgress({ status: 'downloading', percent: 80 }); const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;
//                 await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setMatrixProgress({ status: 'downloading', percent: scaled }); });
//                 setLastMatrixExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalLearners }); toast.success(`Throughput Matrix downloaded!`); } }
//         catch (error: any) { clearInterval(timer); console.error('Throughput Report Failed:', error); setStatusModal({ isOpen: true, type: 'error', title: 'Report Generation Failed', message: error.message || 'Server error encountered while building the throughput matrix report.' }); }
//         finally { setMatrixProgress({ status: 'idle', percent: 0 }); }
//     };

//     if (isLoading) return <Loader message="Initializing Auditor Inspection Portal..." />;

//     const getTabThumbOffset = (tab: TabOption) => { switch (tab) { case 'mis_overview': return 'translateX(100%)'; case 'grievances': return 'translateX(200%)'; case 'policies': return 'translateX(300%)'; default: return 'translateX(0%)'; } };

//     return (
//         <div className="fd-root fd-root--fixed">
//             {!isHumanVerified && <HumanVerificationGate onVerify={handleHumanVerified} />}
//             {isHumanVerified && !revealed && <IntroLoader phase={phase} minMs={minMs} userName={currentUser?.fullName || 'Auditor'} logoSrc={mLabLogo} learnerCount={cohortPool.length} onSkip={skip} />}
//             {isHumanVerified && introDone && !isDisclaimerAgreed && <DisclaimerGate onAgree={handleDisclaimerAgreed} />}

//             {revealed && (<>
//                 <header className="fd-hero">
//                     <div>
//                         <div className="fd-hero-brand">
//                             <img src={mLabLogo} alt="mLab Logo" height={28} />
//                             <span className="fd-hero-divider" />
//                             <div className="fd-eyebrow"><span className="fd-live-dot" /> QCTO / SETA Verification Workspace</div>
//                         </div>
//                         <h1 className="fd-title">Auditor Inspection Portal</h1>
//                         <p className="fd-subtitle">Real-time verification &amp; compliance monitoring for external quality assurers.</p>
//                     </div>
//                     <div className="fd-hero-actions">
//                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.28)', borderRadius: '99px', padding: '0.4rem 0.85rem' }}>
//                             <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
//                             <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8' }}>Read-Only Inspector Mode</span>
//                         </div>
//                         <button onClick={() => setShowEndorseModal(true)} className="fd-btn fd-btn--primary"><UserCheck size={15} /> Sign Off Cohort Audit</button>
//                     </div>
//                 </header>

//                 <div className="fd-controls">
//                     <div className="fd-tabs" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', maxWidth: '680px' }} data-active={activeTab} role="tablist">
//                         <span className="fd-tab-thumb" style={{ width: 'calc(25% - 5px)', transform: getTabThumbOffset(activeTab) }} />
//                         {[
//                             { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
//                             { id: 'mis_overview', label: 'MIS Overview', icon: BarChart3 },
//                             { id: 'grievances', label: 'Appeals', icon: Scale },
//                             { id: 'policies', label: 'Policy Compliance', icon: FileSignature }
//                         ].map(tab => (
//                             <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`fd-tab ${activeTab === tab.id ? 'fd-tab--active' : ''}`} onClick={() => setActiveTab(tab.id as TabOption)} style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem' }}>
//                                 <tab.icon size={15} /> {tab.label}
//                             </button>
//                         ))}
//                     </div>
//                     <div className="fd-filters">
//                         <div className="fd-filter-label"><Filter size={15} /> Scope</div>
//                         <div className="fd-select-wrap">
//                             <select className="fd-select fd-select--active" value={selectedCohortId} onChange={(e) => handleCohortChange(e.target.value)} style={{ minWidth: '240px' }}>
//                                 {allowedCohortsForAuditor.length === 0 ? <option value="">No Assigned Cohorts Found</option> : allowedCohortsForAuditor.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
//                             </select>
//                             <ChevronDown size={14} />
//                         </div>
//                     </div>
//                 </div>

//                 <div className="fd-main fd-scroll">
//                     {activeProgrammeData && (
//                         <div className="fd-card" style={{ flexShrink: 0, padding: '1rem 1.25rem' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
//                                 <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--fd-blue) 12%, #fff)', color: 'var(--fd-blue)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Award size={24} /></div>
//                                 <div style={{ flex: 1, minWidth: '260px' }}>
//                                     <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Active Audit Target Qualification</div>
//                                     <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--fd-blue)', letterSpacing: '-0.01em' }}>{activeProgrammeData.name}</h2>
//                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
//                                         {activeProgrammeData.saqaId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="var(--fd-blue)" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
//                                         {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="var(--fd-blue)" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
//                                         {activeProgrammeData.credits > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="var(--fd-blue)" /> Total Credits: {activeProgrammeData.credits}</span>}
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'poe_vault' && (
//                         <div className="fd-card" style={{ flexShrink: 0, padding: '0.85rem 1.25rem' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>Sampling Ratio:</span>
//                                         <div style={{ display: 'inline-flex', border: '1.5px solid #d5dde6', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
//                                             {[10, 20, 50, 100].map((pct) => (
//                                                 <button key={pct} onClick={() => handleSamplePercentageChange(pct)} style={{ padding: '0.4rem 0.8rem', border: 'none', background: samplePercentage === pct && !searchTerm ? 'var(--fd-blue)' : 'transparent', color: samplePercentage === pct && !searchTerm ? '#ffffff' : 'var(--fd-ink)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderRight: '1px solid #d5dde6', transition: 'all 0.2s' }}>{pct}% {pct === 10 ? '(QCTO Standard)' : ''}</button>
//                                             ))}
//                                         </div>
//                                     </div>
//                                     {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && <span className="fd-pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged</span>}
//                                 </div>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
//                                     <button onClick={handleExportSampleManifest} className="fd-btn fd-btn--ghost fd-btn--sm"><Printer size={14} /> Export Manifest</button>
//                                     <div className="fd-search-wrap" style={{ width: '220px' }}>
//                                         <Search size={14} />
//                                         <input className="fd-search" type="text" placeholder="Search candidate or ID..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} style={{ padding: '0.45rem 0.8rem 0.45rem 2.2rem', fontSize: '0.78rem' }} />
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'poe_vault' && (
//                         <div className="fd-kpis">
//                             <KpiCard icon={<Users size={18} />} label="Sample Size Loaded" value={sampledLearners.length} suffix={` / ${cohortPool.length}`} color={MIDNIGHT} delay={0.05} />
//                             <KpiCard icon={<Activity size={18} />} label="Average Progress" value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0} suffix="%" color="#16a34a" delay={0.10} />
//                             <KpiCard icon={<Clock size={18} />} label="Average Attendance" value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0} suffix="%" color="#0284c7" delay={0.15} />
//                             <KpiCard icon={<ShieldCheck size={18} />} label="POPIA Consent" value={sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0} suffix="%" color="#8b5cf6" delay={0.20} />
//                             <KpiCard icon={<Award size={18} />} label="SoR Readiness" value={sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length} color="#f59e0b" delay={0.25} />
//                         </div>
//                     )}

//                     {activeTab === 'poe_vault' && (
//                         <div className="fd-table-card">
//                             <div className="fd-toolbar">
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--fd-blue)' }}><CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault</div>
//                                 <span style={{ fontSize: '0.75rem', color: 'var(--fd-muted)', fontWeight: 700 }}>Showing {sampledLearners.length} sampled candidates out of {cohortPool.length} total</span>
//                             </div>
//                             <div className="fd-table-scroll fd-scroll">
//                                 <table className="fd-table" style={{ minWidth: '1100px' }}>
//                                     <thead><tr><th>Learner Details</th><th>Attendance</th><th>Curriculum Evidence</th><th>Progress</th><th>Governance</th><th>Flag Status</th><th style={{ textAlign: 'right' }}>Inspection Action</th></tr></thead>
//                                     <tbody>
//                                         {paginatedLearners.map((learner, i) => {
//                                             const flagInfo = candidateFlags[learner.id]; const isFlagged = flagInfo?.flagged;
//                                             const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
//                                             const exportState = activeExports[learner.id] || activeExports[learner.userId]; const hasCustomNote = !!flagInfo?.note;
//                                             const attPct = learner.attendance?.pct || 0; const attAttended = learner.attendance?.attended || 0; const attTotal = learner.attendance?.total || 0;
//                                             return (
//                                                 <tr key={`${learner.id}_${learner.userId || i}_${i}`} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'transparent'), animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
//                                                     <td>
//                                                         <div className="fd-person">
//                                                             <div className="fd-avatar" style={{ background: isDropped ? '#fecaca' : undefined, color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName[0] || 'L'}</div>
//                                                             <div>
//                                                                 <div className="fd-name" style={{ color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName}</div>
//                                                                 <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {learner.idNumber}</div>
//                                                                 {isDropped && <span className="fd-pill fd-pill--dropped" style={{ marginTop: '2px', fontSize: '0.62rem' }}><UserX size={10} /> {learner.status}</span>}
//                                                             </div>
//                                                         </div>
//                                                     </td>
//                                                     <td>
//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
//                                                             <span className="fd-pill" style={{ background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2', color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626' }}><Clock size={11} /> {attPct}%</span>
//                                                             <span style={{ fontSize: '0.7rem', color: 'var(--fd-muted)', fontWeight: 600 }}>{attAttended} / {attTotal} Sessions</span>
//                                                         </div>
//                                                     </td>
//                                                     <td style={{ fontSize: '0.78rem' }}>
//                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}</div>
//                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs</div>
//                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600 }}><strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks</div>
//                                                     </td>
//                                                     <td>
//                                                         <div className="fd-score">
//                                                             <div className="fd-score-bar" style={{ width: '70px', background: isDropped ? '#fca5a5' : undefined }}>
//                                                                 <div className="fd-score-fill" style={{ width: `${learner.overallProgress}%`, background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
//                                                             </div>
//                                                             <span className="fd-score-num" style={{ color: isDropped ? '#991b1b' : undefined }}>{learner.overallProgress}%</span>
//                                                         </div>
//                                                     </td>
//                                                     <td>{learner.popiaConsent ? <span className="fd-pill fd-pill--passed">✓ Policy Signed</span> : <span className="fd-pill fd-pill--dropped">Unsigned</span>}</td>
//                                                     <td>
//                                                         {isFlagged ? <span onClick={() => handleToggleCandidateFlag(learner.id)} className="fd-pill fd-pill--dropped" style={{ cursor: 'pointer' }} title={flagInfo.note || 'Click to clear flag'}><Flag size={11} fill="currentColor" /> Flagged</span>
//                                                         : <button onClick={() => handleToggleCandidateFlag(learner.id)} style={{ background: 'none', border: 'none', color: 'var(--fd-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Flag size={12} /> Flag Item</button>}
//                                                     </td>
//                                                     <td style={{ textAlign: 'right' }}>
//                                                         <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
//                                                             <button onClick={() => handleOpenNotesModal(learner)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: hasCustomNote ? '#fffbeb' : undefined, color: hasCustomNote ? '#b45309' : undefined, borderColor: hasCustomNote ? '#fde68a' : undefined }} title={hasCustomNote ? flagInfo.note : 'Leave auditor note'}><MessageSquare size={12} /> {hasCustomNote ? 'Notes' : 'Note'}</button>
//                                                             <button onClick={() => navigate(`/sor/${learner.userId || learner.id}`)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileText size={12} /> SoR</button>
//                                                             {(() => {
//                                                                 if (exportState?.status === 'pending' || exportState?.status === 'processing') return <button disabled className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: '#fef3c7', color: '#92400e' }}><Loader2 size={12} className="animate-spin" /> {exportState.progress}%</button>;
//                                                                 if (exportState?.status === 'completed' && exportState?.downloadUrl) return (<div style={{ display: 'inline-flex', gap: '4px' }}><button onClick={() => window.open(exportState.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm"><Download size={12} /> Get PoE</button><button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" title="Regenerate"><RefreshCw size={12} /></button></div>);
//                                                                 if (exportState?.status === 'error') return <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ color: '#dc2626' }}><AlertCircle size={12} /> Retry</button>;
//                                                                 return <button onClick={() => handleGeneratePoE(learner)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileArchive size={12} /> Compile</button>;
//                                                             })()}
//                                                             <button onClick={() => setInspectedLearner(learner)} className="fd-btn fd-btn--primary fd-btn--sm"><Eye size={12} /> Inspect</button>
//                                                         </div>
//                                                     </td>
//                                                 </tr>
//                                             );
//                                         })}
//                                         {sampledLearners.length === 0 && (<tr><td colSpan={7} className="fd-empty"><FileCheck size={36} color="var(--fd-line)" style={{ margin: '0 auto 0.5rem' }} /><h4 style={{ margin: '0 0 4px', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4><p style={{ margin: 0, fontSize: '0.8rem' }}>No candidate records match this cohort scope or search filter.</p></td></tr>)}
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <div className="fd-table-foot">
//                                 <div>Showing {sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sampledLearners.length)} of {sampledLearners.length} sampled records</div>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span>Rows:</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="fd-select" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option></select></div>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button><span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button></div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'mis_overview' && (
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
//                                 <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Equity Group Distribution</h3></div>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
//                                     </div>
//                                 </div>
//                                 <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Gender &amp; Disability Metrics</h3></div>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
//                                     </div>
//                                 </div>
//                                 <div className="fd-card"><div className="fd-card-head"><h3 className="fd-card-title">Attendance Health Bands</h3></div>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}><span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}><span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong></div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong></div>
//                                     </div>
//                                 </div>
//                             </div>
//                             <div className="fd-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                                 <div className="fd-card-head" style={{ marginBottom: 0 }}><h3 className="fd-card-title">Regulatory Report Exporters</h3></div>
//                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
//                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
//                                         <div><strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}><FileText size={16} color="#0284c7" /></div>SAQA NLRD Pipe-Delimited Batch</strong><p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>Generates 28-field statutory NLRD text/CSV file for SETA submission.</p></div>
//                                         <div>
//                                             {lastNlrdExport ? (<div style={{ display: 'flex', gap: '8px', width: '100%' }}><button onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#16a34a', color: 'white' }}><Download size={14} /> Download Batch ({lastNlrdExport.generatedAt})</button><button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function"><RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /></button></div>)
//                                             : (<button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--primary" style={{ width: '100%' }}>{nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}{nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}{nlrdProgress.status === 'idle' && 'Generate NLRD Report'}</button>)}
//                                         </div>
//                                     </div>
//                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
//                                         <div><strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ background: '#dcfce7', padding: '6px', borderRadius: '8px' }}><BarChart3 size={16} color="#16a34a" /></div>Learner Throughput Matrix (CSV)</strong><p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.</p></div>
//                                         <div>
//                                             {lastMatrixExport ? (<div style={{ display: 'flex', gap: '8px', width: '100%' }}><button onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#0284c7', color: 'white' }}><Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})</button><button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function"><RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /></button></div>)
//                                             : (<button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" style={{ width: '100%' }}>{matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}{matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}{matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}{matrixProgress.status === 'idle' && 'Generate Throughput Ratio'}</button>)}
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'grievances' && (
//                         <div className="fd-table-card">
//                             <div className="fd-toolbar">
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                     <Filter size={14} color="var(--fd-muted)" />
//                                     <div className="fd-select-wrap"><select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="fd-select fd-select--active"><option value="ALL">All Statuses</option><option value="open">Open</option><option value="under_review">Under Review</option><option value="resolved">Resolved</option></select><ChevronDown size={14} /></div>
//                                     <div className="fd-select-wrap"><select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="fd-select fd-select--active"><option value="ALL">All Types</option><option value="appeal">Appeals Only</option><option value="complaint">Complaints Only</option></select><ChevronDown size={14} /></div>
//                                 </div>
//                             </div>
//                             <div className="fd-table-scroll fd-scroll">
//                                 <table className="fd-table">
//                                     <thead><tr><th>Ref ID</th><th>Learner</th><th>Type</th><th>Date Logged</th><th>Description</th><th>Status</th><th style={{ textAlign: 'right' }}>Resolution Action</th></tr></thead>
//                                     <tbody>
//                                         {paginatedGrievances.map((g, i) => (
//                                             <tr key={`${g.docId}_${i}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
//                                                 <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--fd-muted)' }}>{g.id}</td>
//                                                 <td><div className="fd-name">{g.learnerName}</div></td>
//                                                 <td><span className="fd-pill" style={{ background: 'color-mix(in srgb, var(--fd-blue) 6%, #fff)', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>{g.type}</span></td>
//                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-muted)' }}>{g.dateLogged}</td>
//                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-ink)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
//                                                 <td>
//                                                     {g.status === 'open' && <span className="fd-pill" style={{ color: '#dc2626', background: '#fef2f2' }}>OPEN</span>}
//                                                     {g.status === 'under_review' && <span className="fd-pill" style={{ color: '#92400e', background: '#fef3c7' }}>UNDER REVIEW</span>}
//                                                     {g.status === 'resolved' && <span className="fd-pill" style={{ color: '#16a34a', background: '#dcfce7' }}>RESOLVED</span>}
//                                                 </td>
//                                                 <td style={{ textAlign: 'right' }}><button onClick={() => { setSelectedGrievance(g); setGrievanceStatusInput(g.status); setGrievanceResolutionNotes(g.resolutionNotes || ''); }} className="fd-btn fd-btn--ghost fd-btn--sm"><Eye size={12} /> Inspect / Resolve</button></td>
//                                             </tr>
//                                         ))}
//                                         {paginatedGrievances.length === 0 && (<tr><td colSpan={7} className="fd-empty">No grievances or appeals recorded for this cohort scope.</td></tr>)}
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <div className="fd-table-foot">
//                                 <span>Showing {cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)} of {cohortFilteredGrievances.length} grievances</span>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={14} /> Prev</button><span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesGrievances}</span><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances}>Next <ChevronRight size={14} /></button></div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'policies' && (
//                         <div className="fd-table-card">
//                             <div className="fd-toolbar"><div className="fd-search-wrap"><Search size={16} /><input type="text" className="fd-search" placeholder="Search learner policy status..." value={policySearchTerm} onChange={(e) => setPolicySearchTerm(e.target.value)} /></div></div>
//                             <div className="fd-table-scroll fd-scroll">
//                                 <table className="fd-table">
//                                     <thead><tr><th>Learner Details</th><th>Cohort Scope</th><th>Code of Conduct</th><th>Appeals Policy</th><th>PoPIA Consent</th><th style={{ textAlign: 'right' }}>Compliance State</th></tr></thead>
//                                     <tbody>
//                                         {paginatedPolicyLearners.map((l, i) => (
//                                             <tr key={`${l.id}_${i}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
//                                                 <td><div className="fd-person"><div className="fd-avatar">{l.fullName[0] || 'L'}</div><div><div className="fd-name">{l.fullName}</div><div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {l.idNumber}</div></div></div></td>
//                                                 <td>{l.cohortName}</td>
//                                                 <td>{l.codeOfConductSigned ? <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>}</td>
//                                                 <td>{l.appealsPolicySigned ? <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>}</td>
//                                                 <td>{l.popiaConsent ? <span className="fd-pill" style={{ background: '#e0f2fe', color: '#0369a1' }}>✓ CONSENTED</span> : <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>PENDING</span>}</td>
//                                                 <td style={{ textAlign: 'right' }}>{l.codeOfConductSigned && l.popiaConsent ? <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span> : <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>}</td>
//                                             </tr>
//                                         ))}
//                                         {paginatedPolicyLearners.length === 0 && (<tr><td colSpan={6} className="fd-empty">No learners match this search criteria.</td></tr>)}
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <div className="fd-table-foot">
//                                 <span>Showing {searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)} of {searchedPolicyLearners.length} candidate policies</span>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={14} /> Prev</button><span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesPolicyLearners}</span><button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners}>Next <ChevronRight size={14} /></button></div>
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </>)}

//             {notesModalLearner && (
//                 <div className="fd-modal-overlay" onClick={() => setNotesModalLearner(null)}>
//                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
//                         <div className="fd-modal-header">
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><NotebookPen size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Candidate Notes</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})</span></div></div>
//                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
//                         </div>
//                         <div className="fd-modal-body">
//                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.</p>
//                             <div><label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '6px', textTransform: 'uppercase' }}>Inspection Finding / Note *</label><textarea rows={4} value={learnerNoteInput} onChange={(e) => setLearnerNoteInput(e.target.value)} placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }} /></div>
//                         </div>
//                         <div className="fd-modal-footer">
//                             <button onClick={() => setNotesModalLearner(null)} className="fd-btn fd-btn--ghost">Cancel</button>
//                             <button onClick={handleSaveLearnerNote} className="fd-btn fd-btn--primary"><CheckSquare size={14} /> Save Note</button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {selectedGrievance && (
//                 <div className="fd-modal-overlay" onClick={() => setSelectedGrievance(null)}>
//                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
//                         <div className="fd-modal-header">
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Scale size={18} color="#4ade80" /><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3></div>
//                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
//                         </div>
//                         <div className="fd-modal-body">
//                             <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.82rem' }}>
//                                 <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div><div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div><div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
//                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}><strong>Details:</strong><p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p></div>
//                             </div>
//                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label><div className="fd-select-wrap"><select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} className="fd-select" style={{ width: '100%' }}><option value="open">Open (Awaiting Investigation)</option><option value="under_review">Under Review by Moderation Committee</option><option value="resolved">Resolved (Official Findings Logged)</option></select><ChevronDown size={14} /></div></div>
//                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label><textarea rows={4} value={grievanceResolutionNotes} onChange={(e) => setGrievanceResolutionNotes(e.target.value)} placeholder="Enter committee notes, resolution details, or outcome letter comments..." style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} /></div>
//                         </div>
//                         <div className="fd-modal-footer">
//                             <button onClick={() => setSelectedGrievance(null)} className="fd-btn fd-btn--ghost">Cancel</button>
//                             <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} className="fd-btn fd-btn--primary">{isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution</button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {inspectedLearner && (
//                 <div className="fd-modal-overlay" onClick={() => setInspectedLearner(null)}>
//                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh' }}>
//                         <div className="fd-modal-header">
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileCheck size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Inspection Vault: {inspectedLearner.fullName}</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}</span><div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>Target Qualification: {inspectedLearner.programmeName}</div></div></div>
//                             <button onClick={() => setInspectedLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
//                         </div>
//                         <div className="fd-modal-body">
//                             {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (<div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><UserX size={16} color="#dc2626" /><span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span></div>)}
//                             <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} /><strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'var(--fd-blue)' }}>Auditor Candidate Spot-Check Flag</strong></div>
//                                     <button onClick={() => handleToggleCandidateFlag(inspectedLearner.id)} className={`fd-btn fd-btn--sm ${candidateFlags[inspectedLearner.id]?.flagged ? 'fd-btn--primary' : 'fd-btn--ghost'}`} style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : undefined, color: candidateFlags[inspectedLearner.id]?.flagged ? '#fff' : undefined }}>{candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate'}</button>
//                                 </div>
//                                 {candidateFlags[inspectedLearner.id]?.flagged && (<textarea rows={2} value={candidateFlags[inspectedLearner.id]?.note || ''} onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)} placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '10px', fontSize: '0.8rem', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />)}
//                             </div>
//                             <div>
//                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={14} /> Curriculum Completion &amp; Attendance Ledger</h4>
//                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', background: '#fff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
//                                     <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
//                                     <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
//                                     <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
//                                     <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
//                                     <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
//                                 </div>
//                             </div>
//                             <div>
//                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})</h4>
//                                 {inspectedLearnerSubmissions.length === 0 ? (<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '0.82rem' }}><AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />No digital submission documents found in Firestore for this candidate ID.</div>)
//                                 : (<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{inspectedLearnerSubmissions.map((sub: any) => { const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task'; const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase(); const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl; const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase()); return (<div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.82rem' }}><div><div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><span>{subTitle}</span><span className="fd-pill fd-pill--progress" style={{ fontSize: '0.65rem' }}>{subType}</span></div><div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong></div></div><div>{fileUrl ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fd-btn fd-btn--ghost fd-btn--sm"><ExternalLink size={12} /> View File</a> : <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>}</div></div>); })}</div>)}
//                             </div>
//                         </div>
//                         <div className="fd-modal-footer"><button onClick={() => setInspectedLearner(null)} className="fd-btn fd-btn--primary">Close Inspection Drawer</button></div>
//                     </div>
//                 </div>
//             )}

//             {showEndorseModal && (
//                 <div className="fd-modal-overlay" onClick={() => setShowEndorseModal(false)}>
//                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
//                         <div className="fd-modal-header">
//                             <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Record Official Audit Sign-Off</h3>
//                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
//                         </div>
//                         <div className="fd-modal-body">
//                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label><div className="fd-select-wrap"><select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} className="fd-select" style={{ width: '100%' }}><option value="approved">Fully Approved &amp; Endorsed</option><option value="conditional">Conditional Approval (Minor Corrective Actions)</option><option value="rejected">Rejected (Major Compliance Audit Failure)</option></select><ChevronDown size={14} /></div></div>
//                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label><textarea rows={5} value={auditNotes} onChange={(e) => setAuditNotes(e.target.value)} placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..." style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }} /></div>
//                         </div>
//                         <div className="fd-modal-footer">
//                             <button onClick={() => setShowEndorseModal(false)} className="fd-btn fd-btn--ghost">Cancel</button>
//                             <button onClick={handleSaveEndorsement} disabled={isSavingEndorsement} className="fd-btn fd-btn--primary">{isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record</button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {statusModal.isOpen && (
//                 <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} confirmText="Acknowledge" onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))} />
//             )}
//         </div>
//     );
// };

// export default AuditorPortalView;



// // // src/pages/AuditorPortal/AuditorPortalView.tsx

// // import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// // import { useSearchParams, useNavigate } from 'react-router-dom';
// // import {
// //     ShieldCheck, Search, Eye, Lock,
// //     FileCheck, UserCheck, X, CheckSquare,
// //     Briefcase, Activity, Users, Award,
// //     Loader2, ChevronLeft, ChevronRight, ChevronDown,
// //     Printer, Flag, ExternalLink, AlertCircle,
// //     FileText, BarChart3, UserX,
// //     Scale, Filter, Download, RefreshCw,
// //     FileArchive, FileSignature,
// //     MessageSquare, NotebookPen, Tag,
// //     BookOpen, Layers, Clock
// // } from 'lucide-react';
// // import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { useToast } from '../../components/common/Toast/Toast';
// // import Loader from '../../components/common/Loader/Loader';
// // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// // // Reuse Funder Dashboard unified styling
// // import '../AdminDashboard/FunderDashboard/FunderDashboard.css';

// // type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

// // interface SampledLearner {
// //     id: string;
// //     userId: string;
// //     fullName: string;
// //     idNumber: string;
// //     cohortId: string;
// //     cohortName: string;
// //     programmeName: string;
// //     overallProgress: number;
// //     attendance: { attended: number; total: number; pct: number };
// //     formatives: { completed: number; total: number };
// //     summatives: { completed: number; total: number };
// //     practicals: { completed: number; total: number };
// //     workplaces: { completed: number; total: number };
// //     sorStatus: string;
// //     popiaConsent: boolean;
// //     hasSignature: boolean;
// //     status: string;
// //     gender?: string;
// //     equityGroup?: string;
// //     disabilityStatus?: string;
// //     birthDate?: string;
// //     codeOfConductSigned?: boolean;
// //     appealsPolicySigned?: boolean;
// // }

// // interface AuditorLearnerFlag {
// //     flagged: boolean;
// //     note: string;
// // }

// // interface GrievanceRecord {
// //     docId: string;
// //     id: string;
// //     learnerName: string;
// //     cohortId: string;
// //     dateLogged: string;
// //     type: 'appeal' | 'complaint';
// //     status: 'open' | 'under_review' | 'resolved';
// //     description: string;
// //     resolutionNotes?: string;
// // }

// // interface ActiveExport {
// //     requestId: string;
// //     learnerId: string;
// //     progress: number;
// //     progressMessage: string;
// //     status: 'pending' | 'processing' | 'completed' | 'error';
// //     downloadUrl?: string;
// //     errorMessage?: string;
// // }

// // interface ExportProgressState {
// //     status: 'idle' | 'generating' | 'downloading';
// //     percent: number;
// // }

// // interface ReportCache {
// //     downloadUrl: string;
// //     generatedAt: string;
// //     totalRecords?: number;
// // }

// // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];
// // const DROPPED_KEYWORDS = ['dropped', 'dropped_out', 'withdrawn', 'terminated', 'archived', 'inactive', 'cancelled', 'discontinued', 'suspended'];

// // const MIDNIGHT = 'var(--fd-blue, #002b49)';
// // const GREEN = 'var(--fd-green, #94c73d)';

// // const VERIFIED_STORAGE_KEY = 'ap-human-verified-v1';
// // const DISCLAIMER_STORAGE_KEY = 'ap-disclaimer-agreed-v1.1';

// // /* ------------------------------------------------------------------ */
// // /* Helpers & Animations                                               */
// // /* ------------------------------------------------------------------ */

// // const normalizeId = (idVal: any): string => {
// //     if (!idVal) return '';
// //     const str = String(idVal).trim();
// //     return str.replace(/^0+/, '').toLowerCase();
// // };

// // const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

// // const downloadFileWithProgress = (
// //     url: string,
// //     filename: string,
// //     onProgress: (percent: number) => void
// // ): Promise<void> => {
// //     return new Promise((resolve, reject) => {
// //         const xhr = new XMLHttpRequest();
// //         xhr.open('GET', url, true);
// //         xhr.responseType = 'blob';

// //         xhr.onprogress = (event) => {
// //             if (event.lengthComputable && event.total > 0) {
// //                 const percent = Math.round((event.loaded / event.total) * 100);
// //                 onProgress(percent);
// //             } else if (event.loaded > 0) {
// //                 const estimatedTotal = event.loaded + 50000;
// //                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
// //                 onProgress(percent);
// //             }
// //         };

// //         xhr.onload = () => {
// //             if (xhr.status === 200) {
// //                 const blob = xhr.response;
// //                 const blobUrl = window.URL.createObjectURL(blob);
// //                 const link = document.createElement('a');
// //                 link.href = blobUrl;
// //                 link.download = filename;
// //                 document.body.appendChild(link);
// //                 link.click();
// //                 document.body.removeChild(link);
// //                 window.URL.revokeObjectURL(blobUrl);
// //                 onProgress(100);
// //                 resolve();
// //             } else {
// //                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
// //             }
// //         };

// //         xhr.onerror = () => reject(new Error('Network error during file download.'));
// //         xhr.send();
// //     });
// // };

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

// // /* ------------------------------------------------------------------ */
// // /* Intro Loader Sequence                                             */
// // /* ------------------------------------------------------------------ */
// // type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

// // const STATUS_MESSAGES = ['Syncing QCTO data', 'Compiling evidence', 'Building your portal'];

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

// // const useIntro = (enabled: boolean, isLoading: boolean, minDuration: number, startTimer: boolean) => {
// //     const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// //     const minMs = reduced ? 500 : minDuration;

// //     const [phase, setPhase] = useState<Phase>(() => (enabled ? 'loading' : 'done'));
// //     const [minElapsed, setMinElapsed] = useState(false);

// //     useEffect(() => {
// //         if (!startTimer) return;
// //         const t = setTimeout(() => setMinElapsed(true), minMs);
// //         return () => clearTimeout(t);
// //     }, [minMs, startTimer]);

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
// // }> = ({ phase, minMs, userName, logoSrc, learnerCount }) => {
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
// //                         <div className="fd-ld-eyebrow">Auditor Portal</div>
// //                         <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
// //                         <div className="fd-ld-progress">
// //                             <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
// //                         </div>
// //                     </div>
// //                 ) : (
// //                     <div className="fd-ld-text" key="welcome">
// //                         <div className="fd-ld-eyebrow">{greeting()}</div>
// //                         <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
// //                         <p className="fd-ld-sub">Your audit sandbox is ready &middot; {learnerCount} records verified</p>
// //                         <div className="fd-ld-progress">
// //                             <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
// //                         </div>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };

// // /* ------------------------------------------------------------------ */
// // /* Interactive Human Verification Gate                                */
// // /* ------------------------------------------------------------------ */
// // const HumanVerificationGate: React.FC<{ onVerify: () => void }> = ({ onVerify }) => {
// //     const [sliderPos, setSliderPos] = useState(0);
// //     const [isDragging, setIsDragging] = useState(false);
// //     const trackRef = useRef<HTMLDivElement>(null);

// //     const handleMove = (clientX: number) => {
// //         if (!isDragging || !trackRef.current) return;
// //         const rect = trackRef.current.getBoundingClientRect();
// //         const max = rect.width - 42;
// //         const offsetX = Math.max(0, Math.min(clientX - rect.left - 21, max));
// //         const pct = (offsetX / max) * 100;
// //         setSliderPos(pct);

// //         if (pct >= 95) {
// //             setIsDragging(false);
// //             setSliderPos(100);
// //             setTimeout(() => {
// //                 onVerify();
// //             }, 250);
// //         }
// //     };

// //     return (
// //         <div className="fd-bot-overlay">
// //             <div className="fd-bot-card">
// //                 <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
// //                     <ShieldCheck size={28} />
// //                 </div>
// //                 <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>
// //                     Human Verification Required
// //                 </h3>
// //                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
// //                     To protect audit integrity, please slide to confirm you are human.
// //                 </p>

// //                 <div
// //                     ref={trackRef}
// //                     className="fd-bot-slider-track"
// //                     onMouseMove={(e) => handleMove(e.clientX)}
// //                     onTouchMove={(e) => handleMove(e.touches[0].clientX)}
// //                     onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
// //                     onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
// //                 >
// //                     <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
// //                     <span className="fd-bot-slider-text">
// //                         {sliderPos >= 95 ? 'Verified!' : 'Slide to Access Portal ➔'}
// //                     </span>
// //                     <div
// //                         className="fd-bot-slider-thumb"
// //                         style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
// //                         onMouseDown={() => setIsDragging(true)}
// //                         onTouchStart={() => setIsDragging(true)}
// //                     >
// //                         <Lock size={16} />
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // /* ------------------------------------------------------------------ */
// // /* POPIA Disclaimer Modal (Strict Active Consent)                     */
// // /* ------------------------------------------------------------------ */
// // const DisclaimerGate: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
// //     const [isChecked, setIsChecked] = useState(false);
// //     const [isSubmitting, setIsSubmitting] = useState(false);

// //     const handleAcknowledge = async () => {
// //         if (!isChecked) return;
// //         setIsSubmitting(true);
        
// //         setTimeout(() => {
// //             onAgree();
// //         }, 600);
// //     };

// //     return (
// //         <div className="fd-bot-overlay" style={{ 
// //             background: 'linear-gradient(135deg, rgba(0, 43, 73, 0.5) 0%, rgba(100, 163, 88, 0.2) 100%)',
// //             backdropFilter: 'blur(16px)',
// //             WebkitBackdropFilter: 'blur(16px)'
// //         }}>
// //             <div className="fd-disclaimer-card" style={{ 
// //                 width: 'min(100%, 640px)', 
// //                 padding: 0, 
// //                 maxHeight: '90vh', 
// //                 display: 'flex', 
// //                 flexDirection: 'column', 
// //                 overflow: 'hidden',
// //                 background: '#fff',
// //                 borderRadius: '20px',
// //                 boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)'
// //             }}>
                
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.5rem 2rem', borderBottom: '1px solid var(--fd-line)', flexShrink: 0, background: '#fff' }}>
// //                     <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--mlab-blue) 12%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', flexShrink: 0 }}>
// //                         <ShieldCheck size={22} />
// //                     </div>
// //                     <div>
// //                         <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>POPIA Data Privacy &amp; Protection</h3>
// //                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Mandatory Compliance Notice</div>
// //                     </div>
// //                 </div>
                
// //                 <div className="fd-scroll" style={{ padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#fff' }}>
// //                     <p style={{ margin: '0 0 1.2rem 0', fontWeight: 600, color: 'var(--fd-ink)' }}>
// //                         This dashboard contains personal and potentially sensitive information relating to learners and programme participants. The information is provided to authorised stakeholders strictly for legitimate programme reporting, monitoring, evaluation, verification and related organisational purposes.
// //                     </p>
// //                     <p style={{ margin: '0 0 1.2rem 0' }}>
// //                         In accordance with the <strong>Protection of Personal Information Act 4 of 2013 (POPIA)</strong>, access to and use of this information is restricted to authorised persons and must be limited to the purpose for which it has been provided.
// //                     </p>
                    
// //                     <strong style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--fd-blue)' }}>By accessing this dashboard, you agree to:</strong>
// //                     <ul style={{ margin: '0 0 1.2rem 0', paddingLeft: '1.4rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// //                         <li>Keep all personal information confidential and secure.</li>
// //                         <li>Use the information only for the authorised purpose for which access has been granted.</li>
// //                         <li>Not copy, download, reproduce, publish, disclose, distribute or share the information with any unauthorised person or third party.</li>
// //                         <li>Take reasonable measures to prevent unauthorised access, loss, disclosure, alteration or misuse of the information.</li>
// //                         <li>Not use the information for any secondary or unrelated purpose without appropriate authorisation and lawful basis.</li>
// //                         <li>Immediately notify the designated responsible party of any suspected or actual security compromise, unauthorised access or disclosure.</li>
// //                         <li>Ensure that any person granted access to the information is appropriately authorised and subject to equivalent confidentiality and data-protection requirements.</li>
// //                         <li>Cease use of the information and securely delete or return any copies when access or the authorised purpose comes to an end, where applicable.</li>
// //                     </ul>

// //                     <p style={{ margin: '0 0 0.85rem 0' }}>
// //                         Where an external stakeholder processes personal information on behalf of the responsible party, such processing must be undertaken only with the knowledge and authorisation of the responsible party and in accordance with applicable POPIA requirements and any relevant data-processing or confidentiality agreement.
// //                     </p>
// //                     <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
// //                         Unauthorised access, use, disclosure or distribution of this information is strictly prohibited.
// //                     </p>
// //                 </div>

// //                 <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--fd-line)', background: '#f8fafc', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
// //                     <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
// //                         <div style={{ paddingTop: '2px' }}>
// //                             <input 
// //                                 type="checkbox" 
// //                                 checked={isChecked}
// //                                 onChange={(e) => setIsChecked(e.target.checked)}
// //                                 style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--mlab-green)' }}
// //                             />
// //                         </div>
// //                         <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fd-blue)', lineHeight: 1.4 }}>
// //                             I have read and acknowledge the above notice and agree to handle the information in accordance with the stated requirements.
// //                         </span>
// //                     </label>

// //                     <button 
// //                         className={`fd-btn ${isChecked ? 'fd-btn--primary' : ''}`}
// //                         disabled={!isChecked || isSubmitting}
// //                         onClick={handleAcknowledge} 
// //                         style={{ 
// //                             padding: '0.85rem 1.5rem', 
// //                             fontSize: '0.9rem', 
// //                             width: '100%',
// //                             background: !isChecked ? '#e2e8f0' : undefined,
// //                             color: !isChecked ? '#94a3b8' : undefined,
// //                             cursor: !isChecked ? 'not-allowed' : 'pointer',
// //                             border: 'none',
// //                             borderRadius: '12px',
// //                             fontWeight: 800,
// //                             display: 'flex',
// //                             alignItems: 'center',
// //                             justifyContent: 'center',
// //                             gap: '8px'
// //                         }}
// //                     >
// //                         {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
// //                         {isSubmitting ? 'Recording Acknowledgement...' : 'Acknowledge & Continue'}
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // export const AuditorPortalView: React.FC = () => {
// //     const toast = useToast();
// //     const navigate = useNavigate();
// //     const [searchParams, setSearchParams] = useSearchParams();

// //     // Security Gate State
// //     const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => {
// //         try { return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true'; } catch { return false; }
// //     });

// //     const [isDisclaimerAgreed, setIsDisclaimerAgreed] = useState<boolean>(() => {
// //         try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { return false; }
// //     });

// //     const handleHumanVerified = () => {
// //         setIsHumanVerified(true);
// //         try { sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true'); } catch { /* ignore */ }
// //     };

// //     const handleDisclaimerAgreed = async () => {
// //         setIsDisclaimerAgreed(true);
// //         try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch { /* ignore */ }

// //         let deviceId = localStorage.getItem('ap-device-id');
// //         if (!deviceId) {
// //             deviceId = typeof crypto.randomUUID === 'function' 
// //                 ? crypto.randomUUID() 
// //                 : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
// //             localStorage.setItem('ap-device-id', deviceId);
// //         }

// //         try {
// //             const auditPayload = {
// //                 deviceId: deviceId,
// //                 action: 'POPIA_AGREEMENT_ACCEPTED_AUDITOR',
// //                 timestamp: new Date().toISOString(),
// //                 userAgent: navigator.userAgent
// //             };

// //             await fetch('https://your-database-api-or-webhook.com/api/audit', {
// //                 method: 'POST',
// //                 headers: { 'Content-Type': 'application/json' },
// //                 body: JSON.stringify(auditPayload),
// //                 keepalive: true 
// //             });
// //         } catch (err) {
// //             console.error("Failed to log audit trail.", err);
// //         }
// //     };

// //     const {
// //         user: currentUser,
// //         cohorts: storeCohorts,
// //         learners: storeLearners,
// //         programmes: storeProgrammes,
// //         rawEnrollments: storeRawEnrollments,
// //         fetchProgrammes,
// //         fetchCohorts,
// //         fetchLearners,
// //         subscribeComplianceData
// //     } = useStore() as any;

// //     const initialCohortFromUrl = searchParams.get('cohort') || '';
// //     const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
// //     const initialSearchFromUrl = searchParams.get('search') || '';

// //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// //     const [isLoading, setIsLoading] = useState(true);
// //     const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
// //     const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
// //     const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);

// //     const [currentPage, setCurrentPage] = useState<number>(1);
// //     const [itemsPerPage, setItemsPerPage] = useState<number>(10);

// //     const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});

// //     // AUDITOR LEARNER NOTE MODAL STATE
// //     const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
// //     const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');

// //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);

// //     const [rawUsers, setRawUsers] = useState<any[]>([]);
// //     const [rawLearners, setRawLearners] = useState<any[]>([]);
// //     const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);

// //     // REAL-TIME ATTENDANCE DATA STREAMS
// //     const [rawAttendance, setRawAttendance] = useState<any[]>([]);
// //     const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
// //     const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);

// //     const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);

// //     const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
// //     const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
// //     const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
// //     const [isSavingGrievance, setIsSavingGrievance] = useState(false);
// //     const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
// //     const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');

// //     const [policySearchTerm, setPolicySearchTerm] = useState('');

// //     const [showEndorseModal, setShowEndorseModal] = useState(false);
// //     const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
// //     const [auditNotes, setAuditNotes] = useState('');
// //     const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);

// //     const [statusModal, setStatusModal] = useState<{
// //         isOpen: boolean;
// //         type: StatusType;
// //         title: string;
// //         message: string;
// //     }>({
// //         isOpen: false,
// //         type: 'error',
// //         title: '',
// //         message: ''
// //     });

// //     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// //     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// //     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
// //     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

// //     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

// //     // INTRO LOADER HOOK
// //     const isDataLoading = isLoading || (!storeCohorts || storeCohorts.length === 0);
// //     const { phase, skip, minMs } = useIntro(true, isDataLoading, 2600, isHumanVerified);
// //     const introDone = phase === 'reveal' || phase === 'done';
// //     const revealed = introDone && isDisclaimerAgreed;

// //     useEffect(() => {
// //         console.log('[AuditorPortal Debug] Initializing Store Models...');
// //         if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// //         if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// //         if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
// //     }, []);

// //     // Subscribe to store compliance data for active cohort
// //     useEffect(() => {
// //         if (subscribeComplianceData && selectedCohortId) {
// //             console.log('[AuditorPortal Debug] Subscribing compliance data for cohort:', selectedCohortId);
// //             const unsub = subscribeComplianceData(selectedCohortId);
// //             return () => unsub?.();
// //         }
// //     }, [selectedCohortId, subscribeComplianceData]);

// //     useEffect(() => {
// //         setCurrentPage(1);
// //     }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);

// //     useEffect(() => {
// //         setLastNlrdExport(null);
// //         setLastMatrixExport(null);
// //     }, [selectedCohortId]);

// //     // Real-Time Listener for Historical & Active PoE Exports
// //     useEffect(() => {
// //         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
// //         const unsubPoe = onSnapshot(qPoe, (snap) => {
// //             const exportsMap: Record<string, ActiveExport> = {};
// //             snap.docs.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 const lId = data.learnerId;
// //                 if (lId && !exportsMap[lId]) {
// //                     exportsMap[lId] = {
// //                         requestId: docSnap.id,
// //                         learnerId: lId,
// //                         progress: data.progress || 0,
// //                         progressMessage: data.progressMessage || '',
// //                         status: data.status || 'pending',
// //                         downloadUrl: data.downloadUrl,
// //                         errorMessage: data.errorMessage
// //                     };
// //                 }
// //             });
// //             setActiveExports(prev => ({ ...exportsMap, ...prev }));
// //         });

// //         return () => unsubPoe();
// //     }, []);

// //     const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
// //         const newParams: Record<string, string> = {};
// //         if (cohortId) newParams.cohort = cohortId;
// //         if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
// //         if (search) newParams.search = search;

// //         setSearchParams(newParams, { replace: true });
// //     }, [setSearchParams]);

// // const allowedCohortsForAuditor = useMemo(() => {
// //     if (!storeCohorts || storeCohorts.length === 0) return [];

// //     // 1. Gather all explicit assigned IDs
// //     const allowedIds: string[] = [
// //         ...(Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : []),
// //         ...(Array.isArray(currentUser?.assignedCohortIds) ? currentUser.assignedCohortIds : []),
// //         ...(Array.isArray(currentUser?.cohortIds) ? currentUser.cohortIds : []),
// //         ...(Array.isArray(currentUser?.allowedCohorts) ? currentUser.allowedCohorts : []),
// //         ...(currentUser?.cohortId ? [currentUser.cohortId] : [])
// //     ].map(id => String(id).trim());

// //     const uniqueAllowedIds = Array.from(new Set(allowedIds)).filter(id => id.length > 0);

// //     // If explicit cohort assignments exist on profile, restrict to those FIRST
// //     if (uniqueAllowedIds.length > 0) {
// //         return storeCohorts.filter((c: any) => uniqueAllowedIds.includes(String(c.id).trim()));
// //     }

// //     // 2. Otherwise grant all cohorts ONLY if full admin and not restricted
// //     const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
// //     if (isFullAdmin && !currentUser?.isTemporaryAuditor) {
// //         return storeCohorts;
// //     }

// //     return [];
// // }, [storeCohorts, currentUser]);

// //     // Place this right after 'allowedCohortsForAuditor' and before your JSX return
// // const activeProgrammeData = useMemo(() => {
// //     if (!selectedCohortId) return null;

// //     const cohort = allowedCohortsForAuditor?.find(
// //         (c: any) => String(c.id).trim().toLowerCase() === String(selectedCohortId).trim().toLowerCase()
// //     );
// //     if (!cohort) return null;

// //     return storeProgrammes?.find((p: any) =>
// //         p.id === cohort.programmeId ||
// //         p.id === cohort.qualificationId ||
// //         (p.saqaId && String(p.saqaId) === String(cohort.saqaId))
// //     ) || null;
// // }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

// //     useEffect(() => {
// //         if (allowedCohortsForAuditor.length > 0) {
// //             const isValidSelection = allowedCohortsForAuditor.some((c: any) => normalizeId(c.id) === normalizeId(selectedCohortId));

// //             if (!selectedCohortId || !isValidSelection) {
// //                 const defaultCohortId = allowedCohortsForAuditor[0].id;
// //                 console.log('[AuditorPortal Debug] Auto-selecting default cohort:', defaultCohortId);
// //                 setSelectedCohortId(defaultCohortId);
// //                 syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
// //             }
// //         } else {
// //             console.warn('[AuditorPortal Debug] Allowed cohorts is empty. Clearing selectedCohortId.');
// //             setSelectedCohortId('');
// //         }
// //     }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

// //     // Real-time Firestore Subscriptions with Detailed Debugging Logs
// //     useEffect(() => {
// //         setIsLoading(true);

// //         const handlePermissionError = (collectionName: string, err: any) => {
// //             console.error(`[AuditorPortal Debug] Access to '${collectionName}' restricted/failed:`, err);
// //             setIsLoading(false);
// //         };

// //         const unsubEnrollments = onSnapshot(
// //             collection(db, 'enrollments'),
// //             (snap) => {
// //                 const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //                 console.log(`[AuditorPortal Debug] Live Firestore 'enrollments' updated: ${enrolls.length} docs`);
// //                 setRawEnrollments(enrolls);
// //             },
// //             (err) => handlePermissionError('enrollments', err)
// //         );

// //         const unsubSubmissions = onSnapshot(
// //             collection(db, 'learner_submissions'),
// //             (snap) => {
// //                 const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //                 console.log(`[AuditorPortal Debug] Live Firestore 'learner_submissions' updated: ${subs.length} docs`);
// //                 setRawSubmissions(subs);
// //                 setIsLoading(false);
// //             },
// //             (err) => handlePermissionError('learner_submissions', err)
// //         );

// //         const unsubUsers = onSnapshot(
// //             collection(db, 'users'),
// //             (snap) => {
// //                 const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //                 console.log(`[AuditorPortal Debug] Live Firestore 'users' updated: ${users.length} docs`);
// //                 setRawUsers(users);
// //             },
// //             (err) => handlePermissionError('users', err)
// //         );

// //         const unsubLearners = onSnapshot(
// //             collection(db, 'learners'),
// //             (snap) => {
// //                 const learners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //                 console.log(`[AuditorPortal Debug] Live Firestore 'learners' updated: ${learners.length} docs`);
// //                 setRawLearners(learners);
// //             },
// //             (err) => handlePermissionError('learners', err)
// //         );

// //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// //         const unsubGrievances = onSnapshot(
// //             qGrievances,
// //             (snap) => {
// //                 const parsedGrievances: GrievanceRecord[] = [];
// //                 snap.docs.forEach(docSnap => {
// //                     const data = docSnap.data();
// //                     parsedGrievances.push({
// //                         docId: docSnap.id,
// //                         id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(),
// //                         learnerName: data.learnerName || 'Unknown Learner',
// //                         cohortId: data.cohortId || data.cohortRunId || '',
// //                         dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// //                         type: data.type || 'appeal',
// //                         status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// //                         description: data.reason || data.description || 'No description provided',
// //                         resolutionNotes: data.resolutionNotes || ''
// //                     });
// //                 });
// //                 console.log(`[AuditorPortal Debug] Live Firestore 'assessment_appeals' updated: ${parsedGrievances.length} docs`);
// //                 setRawGrievances(parsedGrievances);
// //             },
// //             (err) => handlePermissionError('assessment_appeals', err)
// //         );

// //         const unsubPolicies = onSnapshot(
// //             collection(db, 'learner_policy_signoffs'),
// //             (snap) => {
// //                 const signoffs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// //                 setRawPolicySignoffs(signoffs);
// //             },
// //             (err) => handlePermissionError('learner_policy_signoffs', err)
// //         );

// //         // ATTENDANCE STREAMS
// //         const unsubAttendance = onSnapshot(
// //             collection(db, 'attendance'),
// //             (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// //             (err) => handlePermissionError('attendance', err)
// //         );

// //         const unsubAttLogs = onSnapshot(
// //             collection(db, 'attendance_logs'),
// //             (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// //             (err) => handlePermissionError('attendance_logs', err)
// //         );

// //         const unsubAttRecords = onSnapshot(
// //             collection(db, 'attendance_records'),
// //             (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// //             (err) => handlePermissionError('attendance_records', err)
// //         );

// //         return () => {
// //             unsubEnrollments();
// //             unsubSubmissions();
// //             unsubUsers();
// //             unsubLearners();
// //             unsubGrievances();
// //             unsubPolicies();
// //             unsubAttendance();
// //             unsubAttLogs();
// //             unsubAttRecords();
// //         };
// //     }, []);

// //     const addCleanKey = (setObj: Set<string>, val: any) => {
// //         if (val && typeof val === 'string') {
// //             const cleaned = normalizeId(val);
// //             if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') {
// //                 setObj.add(cleaned);
// //             }
// //         }
// //     };

// //     const checkCocSignedInObject = (obj: any) => {
// //         if (!obj) return false;
// //         const demo = obj.demographics || {};
// //         return (
// //             obj.codeOfConductSigned === true ||
// //             obj.hasSignedCoc === true ||
// //             obj.cocSigned === true ||
// //             obj.policySigned === true ||
// //             obj.isPolicySigned === true ||
// //             demo.codeOfConductSigned === true ||
// //             demo.hasSignedCoc === true ||
// //             demo.cocSigned === true ||
// //             demo.policySigned === true ||
// //             !!obj.signatureUrl ||
// //             !!demo.signatureUrl
// //         );
// //     };

// //     const cocSignedKeysSet = useMemo(() => {
// //         const keys = new Set<string>();

// //         rawPolicySignoffs.forEach((d: any) => {
// //             addCleanKey(keys, d.id);
// //             addCleanKey(keys, d.userId);
// //             addCleanKey(keys, d.learnerId);
// //             addCleanKey(keys, d.authUid);
// //             addCleanKey(keys, d.idNumber);
// //             addCleanKey(keys, d.userEmail);
// //             addCleanKey(keys, d.email);
// //         });

// //         rawUsers.forEach((u: any) => {
// //             if (checkCocSignedInObject(u)) {
// //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// //             }
// //         });

// //         rawLearners.forEach((l: any) => {
// //             if (checkCocSignedInObject(l)) {
// //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// //             }
// //         });

// //         rawEnrollments.forEach((e: any) => {
// //             if (checkCocSignedInObject(e)) {
// //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// //             }
// //         });

// //         return keys;
// //     }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

// //     const appealsSignedKeysSet = useMemo(() => {
// //         const keys = new Set<string>();

// //         rawPolicySignoffs.forEach((d: any) => {
// //             const type = String(d.policyType || d.policyName || '').toLowerCase();
// //             if (type.includes('appeal')) {
// //                 addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email);
// //             }
// //         });

// //         rawUsers.forEach((u: any) => {
// //             if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) {
// //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// //             }
// //         });

// //         rawLearners.forEach((l: any) => {
// //             if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) {
// //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// //             }
// //         });

// //         return keys;
// //     }, [rawPolicySignoffs, rawUsers, rawLearners]);

// //     const popiaConsentKeysSet = useMemo(() => {
// //         const keys = new Set<string>();

// //         rawUsers.forEach((u: any) => {
// //             const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true';
// //             if (isConsent) {
// //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// //             }
// //         });

// //         rawLearners.forEach((l: any) => {
// //             const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true';
// //             if (isConsent) {
// //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// //             }
// //         });

// //         rawEnrollments.forEach((e: any) => {
// //             const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true';
// //             if (isConsent) {
// //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// //             }
// //         });

// //         return keys;
// //     }, [rawUsers, rawLearners, rawEnrollments]);

// //     // UNIFIED ATTENDANCE AGGREGATOR
// //     const dailyRegisters = useMemo(() => {
// //         const unifiedMap = new Map<string, any>();

// //         const matchCohort = (r: any) => {
// //             if (!selectedCohortId || selectedCohortId === 'ALL') return true;
// //             const rCohort = normalizeId(r.cohortId || r.cohortRunId || r.classId);
// //             return rCohort === normalizeId(selectedCohortId);
// //         };

// //         const filteredAtt = rawAttendance.filter(matchCohort);
// //         const filteredLogs = rawAttendanceLogs.filter(matchCohort);
// //         const filteredRecords = rawAttendanceRecords.filter(matchCohort);

// //         filteredAtt.forEach(record => {
// //             if (record.presentLearners || record.absentLearners) {
// //                 const dateKey = record.date || record.id;
// //                 unifiedMap.set(record.id || dateKey, {
// //                     id: record.id || dateKey,
// //                     date: record.date || 'Unknown',
// //                     presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [],
// //                     absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [],
// //                     partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : []
// //                 });
// //             } else if (record.learnerId && record.date) {
// //                 const dateKey = `eco_${record.date}`;
// //                 if (!unifiedMap.has(dateKey)) {
// //                     unifiedMap.set(dateKey, {
// //                         id: dateKey,
// //                         date: record.date,
// //                         presentLearners: [],
// //                         absentLearners: [],
// //                         partialLearners: []
// //                     });
// //                 }
// //                 const entry = unifiedMap.get(dateKey);
// //                 const status = String(record.status || '').toLowerCase();

// //                 if (status.includes('present')) entry.presentLearners.push(record.learnerId);
// //                 else if (status.includes('absent')) entry.absentLearners.push(record.learnerId);
// //                 else if (status.includes('partial')) entry.partialLearners.push(record.learnerId);
// //             }
// //         });

// //         filteredLogs.forEach(log => {
// //             const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
// //             const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);

// //             const present: string[] = [];
// //             const absent: string[] = [];
// //             const partial: string[] = [];

// //             recordsForLog.forEach(r => {
// //                 const status = String(r.status || '').toLowerCase();
// //                 const lKey = r.learnerId || r.authUid || r.userId;
// //                 if (lKey) {
// //                     if (status.includes('present')) present.push(lKey);
// //                     else if (status.includes('absent')) absent.push(lKey);
// //                     else if (status.includes('partial')) partial.push(lKey);
// //                 }
// //             });

// //             unifiedMap.set(log.id, {
// //                 id: log.id,
// //                 date: dateStr,
// //                 presentLearners: present,
// //                 absentLearners: absent,
// //                 partialLearners: partial
// //             });
// //         });

// //         const unifiedArray = Array.from(unifiedMap.values());
// //         unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// //         return unifiedArray;
// //     }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

// //     // MAP ATTENDANCE STATS PER CANDIDATE GROUP
// //     const rosterAttendanceMap = useMemo(() => {
// //         const keyAttendanceMap = new Map<string, number>();
// //         const totalSessions = dailyRegisters.length;

// //         const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
// //             const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
// //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
// //             const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
// //             const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));

// //             const keys = [
// //                 e.id,
// //                 e.userId,
// //                 e.learnerId,
// //                 e.authUid,
// //                 e.idNumber,
// //                 actualUserId,
// //                 storeLearner?.id,
// //                 storeLearner?.learnerId,
// //                 storeLearner?.authUid,
// //                 storeLearner?.idNumber,
// //                 rawUser?.id,
// //                 rawUser?.authUid,
// //                 rawUser?.idNumber,
// //                 rawLearner?.id,
// //                 rawLearner?.authUid,
// //                 rawLearner?.idNumber
// //             ].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');

// //             return Array.from(new Set(keys.map(k => normalizeId(k))));
// //         });

// //         candidateKeyGroups.forEach(group => {
// //             group.forEach(k => {
// //                 keyAttendanceMap.set(k, 0);
// //             });
// //         });

// //         dailyRegisters.forEach(reg => {
// //             const presentList = (reg.presentLearners || []).map((p: any) => normalizeId(p));

// //             candidateKeyGroups.forEach(group => {
// //                 const isCandidatePresent = group.some(k => presentList.includes(k));
// //                 if (isCandidatePresent) {
// //                     group.forEach(k => {
// //                         keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1);
// //                     });
// //                 }
// //             });
// //         });

// //         const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
// //         candidateKeyGroups.forEach(group => {
// //             const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0);
// //             const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0;
// //             const stats = { attended: bestAttended, total: totalSessions, pct };

// //             group.forEach(k => {
// //                 finalMap.set(k, stats);
// //             });
// //         });

// //         return finalMap;
// //     }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

// //     const handleCohortChange = (cohortId: string) => {
// //         console.log('[AuditorPortal Debug] Switching selectedCohortId to:', cohortId);
// //         setSelectedCohortId(cohortId);
// //         syncQueryParams(cohortId, samplePercentage, searchTerm);
// //     };

// //     const handleSamplePercentageChange = (pct: number) => {
// //         setSamplePercentage(pct);
// //         setSearchTerm('');
// //         syncQueryParams(selectedCohortId, pct, '');
// //     };

// //     const handleSearchChange = (term: string) => {
// //         setSearchTerm(term);
// //         syncQueryParams(selectedCohortId, samplePercentage, term);
// //     };

// //     const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => {
// //         setCandidateFlags(prev => {
// //             const current = prev[candidateId];
// //             const isCurrentlyFlagged = current?.flagged;
// //             return {
// //                 ...prev,
// //                 [candidateId]: {
// //                     flagged: !isCurrentlyFlagged,
// //                     note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : ''
// //                 }
// //             };
// //         });
// //         toast.info("Candidate spot-check flag status updated.");
// //     };

// //     const handleUpdateFlagNote = (candidateId: string, noteText: string) => {
// //         setCandidateFlags(prev => ({
// //             ...prev,
// //             [candidateId]: {
// //                 flagged: true,
// //                 note: noteText
// //             }
// //         }));
// //     };

// //     const handleOpenNotesModal = (learner: SampledLearner) => {
// //         setNotesModalLearner(learner);
// //         setLearnerNoteInput(candidateFlags[learner.id]?.note || '');
// //     };

// //     const handleSaveLearnerNote = () => {
// //         if (!notesModalLearner) return;
// //         handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput);
// //         toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`);
// //         setNotesModalLearner(null);
// //     };

// //     const handleExportSampleManifest = () => {
// //         if (sampledLearners.length === 0) {
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'info',
// //                 title: 'No Sampled Records',
// //                 message: 'There are currently no sampled records available in the selected cohort view to export.'
// //             });
// //             return;
// //         }

// //         const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];

// //         const csvRows = sampledLearners.map(l => {
// //             const flag = candidateFlags[l.id];

// //             const rawIdStr = String(l.idNumber || '').trim();
// //             const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr))
// //                 ? rawIdStr.padStart(13, '0')
// //                 : rawIdStr;
// //             const textFormattedId = `="${paddedId}"`;

// //             return [
// //                 `"${l.fullName.replace(/"/g, '""')}"`,
// //                 textFormattedId,
// //                 `"${l.status}"`,
// //                 `"${l.cohortName.replace(/"/g, '""')}"`,
// //                 `"${l.programmeName.replace(/"/g, '""')}"`,
// //                 `${l.overallProgress}%`,
// //                 `${l.attendance.pct}%`,
// //                 `"${l.attendance.attended}/${l.attendance.total}"`,
// //                 `"${l.formatives.completed}/${l.formatives.total}"`,
// //                 `"${l.summatives.completed}/${l.summatives.total}"`,
// //                 `"${l.practicals.completed}/${l.practicals.total}"`,
// //                 `"${l.workplaces.completed}/${l.workplaces.total}"`,
// //                 l.popiaConsent ? 'Signed' : 'Unsigned',
// //                 flag?.flagged ? 'FLAGGED' : 'CLEAR',
// //                 `"${(flag?.note || '').replace(/"/g, '""')}"`
// //             ].join(',');
// //         });

// //         const csvContent = [headers.join(','), ...csvRows].join('\n');
// //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
// //         const url = URL.createObjectURL(blob);
// //         const link = document.createElement('a');
// //         link.href = url;
// //         link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //         URL.revokeObjectURL(url);

// //         toast.success("Sample Manifest exported to CSV.");
// //     };

// //     // Master PoE Request Handshake with Firestore Background Worker
// //     const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
// //         const targetLearnerId = learner.userId || learner.id;
// //         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

// //         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
// //             toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`);
// //             return;
// //         }

// //         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
// //             window.open(currentExport.downloadUrl, '_blank');
// //             return;
// //         }

// //         try {
// //             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);

// //             const docRef = await addDoc(collection(db, 'poe_export_requests'), {
// //                 learnerId: targetLearnerId,
// //                 requestedBy: currentUser?.uid || currentUser?.id || 'auditor',
// //                 status: 'pending',
// //                 progress: 0,
// //                 progressMessage: 'Initializing compliance engine...',
// //                 createdAt: serverTimestamp()
// //             });

// //             setActiveExports(prev => ({
// //                 ...prev,
// //                 [learner.id]: {
// //                     requestId: docRef.id,
// //                     learnerId: targetLearnerId,
// //                     progress: 0,
// //                     progressMessage: 'Initializing compliance engine...',
// //                     status: 'pending'
// //                 },
// //                 [targetLearnerId]: {
// //                     requestId: docRef.id,
// //                     learnerId: targetLearnerId,
// //                     progress: 0,
// //                     progressMessage: 'Initializing compliance engine...',
// //                     status: 'pending'
// //                 }
// //             }));
// //         } catch (error: any) {
// //             console.error('Error requesting PoE export:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Export Initialization Failed',
// //                 message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.`
// //             });
// //         }
// //     };

// //     // 🚀 MULTI-SOURCE CANDIDATE RECOVERY (Enrollments + storeLearners + storeRawEnrollments + rawLearners)
// //     const cohortPool = useMemo(() => {
// //         console.group('[AuditorPortal Debug] Calculating Candidate Cohort Pool');
// //         console.log('Selected Cohort ID:', selectedCohortId);
        
// //         if (!selectedCohortId) {
// //             console.warn('selectedCohortId is blank. Returning []');
// //             console.groupEnd();
// //             return [];
// //         }

// //         const targetCohortIdNorm = normalizeId(selectedCohortId);

// //         // Combine all candidate items across store and raw Firestore snapshots
// //         const allEnrollmentItems = [
// //             ...(rawEnrollments || []),
// //             ...(storeRawEnrollments || [])
// //         ];

// //         const allLearnerItems = [
// //             ...(storeLearners || []),
// //             ...(rawLearners || []),
// //             ...(rawUsers || [])
// //         ];

// //         console.log(`Source Item Counts -> Raw/Store Enrollments: ${allEnrollmentItems.length}, Raw/Store Learners: ${allLearnerItems.length}`);

// //         const candidatesMap = new Map<string, any>();

// //         const registerCandidate = (item: any) => {
// //             const key = normalizeId(item.userId || item.learnerId || item.idNumber || item.authUid || item.id);
// //             if (!key) return;

// //             if (!candidatesMap.has(key)) {
// //                 candidatesMap.set(key, item);
// //             } else {
// //                 candidatesMap.set(key, { ...item, ...candidatesMap.get(key) });
// //             }
// //         };

// //         // 1. Filter and register from enrollments
// //         allEnrollmentItems.forEach((e: any) => {
// //             const eCohortId = normalizeId(e.cohortId || e.cohortRunId || e.classId);
// //             if (eCohortId === targetCohortIdNorm) {
// //                 registerCandidate(e);
// //             }
// //         });

// //         // 2. Filter and register from learners/users directly
// //         allLearnerItems.forEach((l: any) => {
// //             const lCohortId = normalizeId(l.cohortId || l.cohortRunId || l.classId);
// //             const lCohortIds = Array.isArray(l.cohortIds) ? l.cohortIds.map((id: any) => normalizeId(id)) : [];

// //             if (lCohortId === targetCohortIdNorm || lCohortIds.includes(targetCohortIdNorm)) {
// //                 registerCandidate(l);
// //             }
// //         });

// //         const candidateList = Array.from(candidatesMap.values());
// //         console.log(`Resolved ${candidateList.length} unique candidates for cohort '${selectedCohortId}'`);
// //         console.groupEnd();

// //         return candidateList.map((enrol): SampledLearner => {
// //             const actualUserId = enrol.userId || enrol.learnerId || enrol.authUid || enrol.idNumber || enrol.id;
// //             const normUserId = normalizeId(actualUserId);
// //             const normIdNum = normalizeId(enrol.idNumber);
// //             const enrolNameLower = String(enrol.userName || enrol.learnerName || enrol.fullName || enrol.name || '').trim().toLowerCase();

// //             const storeLearner = allLearnerItems.find((l: any) => {
// //                 const lId = normalizeId(l.id);
// //                 const lIdNum = normalizeId(l.idNumber);
// //                 const lLearnerId = normalizeId(l.learnerId);
// //                 const lAuthUid = normalizeId(l.authUid);
// //                 const lNameLower = String(l.fullName || l.name || '').trim().toLowerCase();

// //                 return (
// //                     (normUserId && (lId === normUserId || lIdNum === normUserId || lLearnerId === normUserId || lAuthUid === normUserId)) ||
// //                     (normIdNum && (lId === normIdNum || lIdNum === normIdNum || lLearnerId === normIdNum)) ||
// //                     (enrolNameLower && lNameLower && enrolNameLower === lNameLower)
// //                 );
// //             });

// //             const activeCohortId = enrol.cohortId || enrol.cohortRunId || selectedCohortId;
// //             const storeCohort = storeCohorts?.find((c: any) => normalizeId(c.id) === normalizeId(activeCohortId));

// //             let storeProgramme = storeProgrammes?.find((p: any) =>
// //                 (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) ||
// //                 (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId)))
// //             );

// //             const mappedName =
// //                 enrol.userName ||
// //                 enrol.learnerName ||
// //                 enrol.fullName ||
// //                 enrol.name ||
// //                 storeLearner?.fullName ||
// //                 storeLearner?.name ||
// //                 'Learner Candidate';

// //             const rawMappedId =
// //                 enrol.idNumber ||
// //                 storeLearner?.idNumber ||
// //                 actualUserId ||
// //                 'N/A';

// //             const cleanIdStr = String(rawMappedId).trim();
// //             const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr))
// //                 ? cleanIdStr.padStart(13, '0')
// //                 : cleanIdStr;

// //             const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';

// //             const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification';
// //             const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || '';
// //             const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';

// //             const progDetails: string[] = [];
// //             if (progNqf) progDetails.push(`NQF Level ${progNqf}`);
// //             if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);

// //             const mappedProgramme = progDetails.length > 0
// //                 ? `${progTitle} (${progDetails.join(' | ')})`
// //                 : progTitle;

// //             const demo = enrol.demographics || storeLearner?.demographics || {};

// //             const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || 'Unspecified';
// //             const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || 'Unspecified';
// //             const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || 'None';

// //             let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;

// //             if (storeProgramme) {
// //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// //                     const flat = storeProgramme.modules;
// //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// //                 }
// //             }

// //             let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0;
// //             let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;

// //             const normTargetUserId = normalizeId(actualUserId);
// //             const normTargetEnrolId = normalizeId(enrol.id);

// //             const learnerSubs = (rawSubmissions || []).filter((s: any) => {
// //                 const sLearnerId = normalizeId(s.learnerId);
// //                 const sAuthUid = normalizeId(s.authUid);
// //                 const sEnrollmentId = normalizeId(s.enrollmentId);

// //                 return (
// //                     (normTargetUserId && (sLearnerId === normTargetUserId || sAuthUid === normTargetUserId)) ||
// //                     (normTargetEnrolId && sEnrollmentId === normTargetEnrolId)
// //                 );
// //             });

// //             learnerSubs.forEach(s => {
// //                 const type = String(s.type || 'formative').toLowerCase();
// //                 const moduleType = String(s.moduleType || '').toLowerCase();
// //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
// //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// //                 if (isKnowledge) {
// //                     if (type.includes('formative') || type.includes('fa')) {
// //                         totalAssignedFA++;
// //                         if (isDone) calculatedFA++;
// //                     } else if (type.includes('summative') || type.includes('sa')) {
// //                         totalAssignedSA++;
// //                         if (isDone) calculatedSA++;
// //                     }
// //                 } else if (isPractical) {
// //                     totalAssignedPM++;
// //                     if (isDone) calculatedPM++;
// //                 } else if (isWorkplace) {
// //                     totalAssignedWM++;
// //                     if (isDone) calculatedWM++;
// //                 }
// //             });

// //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// //             const attStats = rosterAttendanceMap.get(normalizeId(enrol.id)) ||
// //                 rosterAttendanceMap.get(normUserId) ||
// //                 rosterAttendanceMap.get(normalizeId(mappedId)) ||
// //                 { attended: 0, total: dailyRegisters.length, pct: 0 };

// //             const candidateKeys = [
// //                 actualUserId, enrol.id, enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.email, mappedId,
// //                 storeLearner?.id, storeLearner?.uid, storeLearner?.authUid, storeLearner?.idNumber, storeLearner?.email
// //             ];

// //             const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(normalizeId(k)));
// //             const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(normalizeId(k)));
// //             const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(normalizeId(k)));

// //             const allStatuses = [
// //                 enrol.status,
// //                 storeLearner?.status
// //             ].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());

// //             const isCandidateDropped = allStatuses.some(s => DROPPED_KEYWORDS.some(dk => s.includes(dk)));
// //             const resolvedStatus = isCandidateDropped
// //                 ? (allStatuses.find(s => DROPPED_KEYWORDS.some(dk => s.includes(dk))) || 'dropped')
// //                 : (enrol.status || storeLearner?.status || 'active');

// //             return {
// //                 id: enrol.id || actualUserId,
// //                 userId: actualUserId,
// //                 fullName: mappedName,
// //                 idNumber: mappedId,
// //                 cohortId: activeCohortId,
// //                 cohortName: mappedCohort,
// //                 programmeName: mappedProgramme,
// //                 overallProgress: Math.min(100, dynamicProgress),
// //                 attendance: attStats,
// //                 formatives: { completed: calculatedFA, total: ceilingFA },
// //                 summatives: { completed: calculatedSA, total: ceilingSA },
// //                 practicals: { completed: calculatedPM, total: ceilingPM },
// //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// //                 sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'),
// //                 popiaConsent: isPopiConsented,
// //                 hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned),
// //                 status: resolvedStatus,
// //                 gender,
// //                 equityGroup,
// //                 disabilityStatus,
// //                 birthDate: demo.birthDate || storeLearner?.birthDate,
// //                 codeOfConductSigned: isCocSigned,
// //                 appealsPolicySigned: isAppealsSigned
// //             };
// //         });
// //     }, [rawEnrollments, storeRawEnrollments, storeLearners, rawLearners, rawUsers, rawSubmissions, selectedCohortId, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rosterAttendanceMap, dailyRegisters.length]);

// //     const sampledLearners = useMemo(() => {
// //         console.log(`[AuditorPortal Debug] Sampling ${samplePercentage}% from ${cohortPool.length} candidates (Search: '${searchTerm}')`);
// //         if (cohortPool.length === 0) return [];

// //         let filtered = cohortPool;
// //         if (searchTerm.trim()) {
// //             const q = searchTerm.toLowerCase();
// //             return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q));
// //         }

// //         if (samplePercentage >= 100) return filtered;

// //         const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
// //         return [...cohortPool]
// //             .sort((a, b) => a.id.localeCompare(b.id))
// //             .slice(0, sampleSize);
// //     }, [cohortPool, samplePercentage, searchTerm]);

// //     const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
// //     const paginatedLearners = useMemo(() => {
// //         return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// //     }, [sampledLearners, currentPage, itemsPerPage]);

// //     const cohortFilteredGrievances = useMemo(() => {
// //         let list = rawGrievances.filter(g => normalizeId(g.cohortId) === normalizeId(selectedCohortId) || selectedCohortId === 'ALL');

// //         if (grievanceFilterStatus !== 'ALL') {
// //             list = list.filter(g => g.status === grievanceFilterStatus);
// //         }
// //         if (grievanceFilterType !== 'ALL') {
// //             list = list.filter(g => g.type === grievanceFilterType);
// //         }

// //         return list;
// //     }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

// //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// //     const paginatedGrievances = useMemo(() => {
// //         return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// //     }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

// //     const searchedPolicyLearners = useMemo(() => {
// //         if (!policySearchTerm.trim()) return cohortPool;
// //         const q = policySearchTerm.toLowerCase();
// //         return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q));
// //     }, [cohortPool, policySearchTerm]);

// //     const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
// //     const paginatedPolicyLearners = useMemo(() => {
// //         return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// //     }, [searchedPolicyLearners, currentPage, itemsPerPage]);

// //     const cohortMisDemographics = useMemo(() => {
// //         const stats = {
// //             total: cohortPool.length,
// //             sampleTotal: sampledLearners.length,
// //             equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 },
// //             gender: { Female: 0, Male: 0, Other: 0 },
// //             disability: { Yes: 0, No: 0 },
// //             youth: { Under35: 0, Adult35Plus: 0 },
// //             attendanceBands: { high: 0, mid: 0, low: 0 }
// //         };

// //         const currentYear = 2026;

// //         cohortPool.forEach(l => {
// //             const eq = String(l.equityGroup || '').trim().toLowerCase();
// //             if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') {
// //                 stats.equity.African++;
// //             } else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') {
// //                 stats.equity.Coloured++;
// //             } else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') {
// //                 stats.equity.Indian++;
// //             } else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') {
// //                 stats.equity.White++;
// //             } else {
// //                 stats.equity.African++;
// //             }

// //             const g = String(l.gender || '').trim().toLowerCase();
// //             if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') {
// //                 stats.gender.Female++;
// //             } else if (g.startsWith('m') || g.includes('male') || g === 'man') {
// //                 stats.gender.Male++;
// //             } else if (l.idNumber && l.idNumber.length >= 7) {
// //                 const genderDigit = parseInt(l.idNumber.charAt(6), 10);
// //                 if (!isNaN(genderDigit)) {
// //                     if (genderDigit >= 5) {
// //                         stats.gender.Male++;
// //                     } else {
// //                         stats.gender.Female++;
// //                     }
// //                 } else {
// //                     stats.gender.Male++;
// //                 }
// //             } else {
// //                 stats.gender.Male++;
// //             }

// //             const d = String(l.disabilityStatus || '').trim().toLowerCase();
// //             if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') {
// //                 stats.disability.Yes++;
// //             } else {
// //                 stats.disability.No++;
// //             }

// //             let birthYear = 0;
// //             if (l.idNumber && l.idNumber.length >= 6) {
// //                 const yy = parseInt(l.idNumber.substring(0, 2), 10);
// //                 birthYear = yy > 30 ? 1900 + yy : 2000 + yy;
// //             }
// //             if (birthYear > 0 && (currentYear - birthYear) <= 35) {
// //                 stats.youth.Under35++;
// //             } else {
// //                 stats.youth.Adult35Plus++;
// //             }

// //             const attPct = l.attendance?.pct || 0;
// //             if (attPct >= 75) stats.attendanceBands.high++;
// //             else if (attPct >= 40) stats.attendanceBands.mid++;
// //             else stats.attendanceBands.low++;
// //         });

// //         return stats;
// //     }, [cohortPool, sampledLearners]);

// //     const inspectedLearnerSubmissions = useMemo(() => {
// //         if (!inspectedLearner) return [];
// //         const targetUserId = normalizeId(inspectedLearner.userId || inspectedLearner.id);

// //         return rawSubmissions.filter(s =>
// //             normalizeId(s.learnerId) === targetUserId ||
// //             normalizeId(s.authUid) === targetUserId ||
// //             normalizeId(s.enrollmentId) === normalizeId(inspectedLearner.id)
// //         );
// //     }, [inspectedLearner, rawSubmissions]);

// //     const activeCohortData = useMemo(() => {
// //         return allowedCohortsForAuditor?.find((c: any) => normalizeId(c.id) === normalizeId(selectedCohortId)) || null;
// //     }, [allowedCohortsForAuditor, selectedCohortId]);

// //     const handleSaveEndorsement = async () => {
// //         if (!auditNotes.trim()) {
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'warning',
// //                 title: 'Missing Audit Notes',
// //                 message: 'Please enter auditor verification findings and notes before recording official sign-off.'
// //             });
// //             return;
// //         }

// //         setIsSavingEndorsement(true);
// //         try {
// //             await addDoc(collection(db, 'cohort_audit_endorsements'), {
// //                 cohortId: selectedCohortId,
// //                 cohortName: activeCohortData?.name || 'Cohort',
// //                 auditorUid: currentUser?.uid || 'external_auditor',
// //                 auditorName: currentUser?.fullName || 'External Quality Assurer',
// //                 organization: currentUser?.organization || 'QCTO / SETA',
// //                 sampleSizePercentage: samplePercentage,
// //                 sampledRecordsCount: sampledLearners.length,
// //                 totalCohortCount: cohortPool.length,
// //                 outcome: auditOutcome,
// //                 notes: auditNotes,
// //                 flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length,
// //                 signedAt: serverTimestamp(),
// //                 createdAt: new Date().toISOString()
// //             });

// //             toast.success("Audit verification & endorsement recorded successfully.");
// //             setShowEndorseModal(false);
// //             setAuditNotes('');
// //         } catch (err: any) {
// //             console.error("Failed to save endorsement:", err);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Sign-Off Failed',
// //                 message: err.message || 'Failed to record official audit verification sign-off record.'
// //             });
// //         } finally {
// //             setIsSavingEndorsement(false);
// //         }
// //     };

// //     const handleSaveGrievanceResolution = async () => {
// //         if (!selectedGrievance) return;
// //         setIsSavingGrievance(true);
// //         try {
// //             await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), {
// //                 status: grievanceStatusInput,
// //                 resolutionNotes: grievanceResolutionNotes,
// //                 resolvedAt: serverTimestamp(),
// //                 resolvedBy: currentUser?.uid || 'external_auditor'
// //             });

// //             toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`);
// //             setSelectedGrievance(null);
// //             setGrievanceResolutionNotes('');
// //         } catch (err: any) {
// //             console.error("Failed to update grievance:", err);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Resolution Update Failed',
// //                 message: err.message || 'Failed to save grievance resolution details.'
// //             });
// //         } finally {
// //             setIsSavingGrievance(false);
// //         }
// //     };

// //     const handleExportNLRD = async () => {
// //         if (nlrdProgress.status !== 'idle') return;
// //         setNlrdProgress({ status: 'generating', percent: 15 });
// //         toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

// //         const timer = setInterval(() => {
// //             setNlrdProgress(prev => {
// //                 if (prev.status !== 'generating') return prev;
// //                 if (prev.percent >= 80) return prev;
// //                 return { ...prev, percent: prev.percent + 5 };
// //             });
// //         }, 300);

// //         try {
// //             const functions = getFunctions();
// //             const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
// //             const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

// //             clearInterval(timer);

// //             if (response.data?.downloadUrl) {
// //                 setNlrdProgress({ status: 'downloading', percent: 80 });
// //                 const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

// //                 await downloadFileWithProgress(
// //                     response.data.downloadUrl,
// //                     filename,
// //                     (bytePercent) => {
// //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// //                         setNlrdProgress({ status: 'downloading', percent: scaled });
// //                     }
// //                 );

// //                 setLastNlrdExport({
// //                     downloadUrl: response.data.downloadUrl,
// //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// //                     totalRecords: response.data.totalRecords
// //                 });

// //                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords || ''} records.`);
// //             }
// //         } catch (error: any) {
// //             clearInterval(timer);
// //             console.error('NLRD Export Failed:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'NLRD Export Failed',
// //                 message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
// //             });
// //         } finally {
// //             setNlrdProgress({ status: 'idle', percent: 0 });
// //         }
// //     };

// //     const handleExportThroughputMatrix = async () => {
// //         if (matrixProgress.status !== 'idle') return;
// //         setMatrixProgress({ status: 'generating', percent: 15 });
// //         toast.info('Compiling Learner Throughput & Compliance Matrix...');

// //         const timer = setInterval(() => {
// //             setMatrixProgress(prev => {
// //                 if (prev.status !== 'generating') return prev;
// //                 if (prev.percent >= 80) return prev;
// //                 return { ...prev, percent: prev.percent + 5 };
// //             });
// //         }, 300);

// //         try {
// //             const functions = getFunctions();
// //             const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
// //             const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

// //             clearInterval(timer);

// //             if (response.data?.downloadUrl) {
// //                 setMatrixProgress({ status: 'downloading', percent: 80 });
// //                 const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

// //                 await downloadFileWithProgress(
// //                     response.data.downloadUrl,
// //                     filename,
// //                     (bytePercent) => {
// //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// //                         setMatrixProgress({ status: 'downloading', percent: scaled });
// //                     }
// //                 );

// //                 setLastMatrixExport({
// //                     downloadUrl: response.data.downloadUrl,
// //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// //                     totalRecords: response.data.totalLearners
// //                 });

// //                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners || ''} learners!`);
// //             }
// //         } catch (error: any) {
// //             clearInterval(timer);
// //             console.error('Throughput Report Failed:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Report Generation Failed',
// //                 message: error.message || 'Server error encountered while building the throughput matrix report.'
// //             });
// //         } finally {
// //             setMatrixProgress({ status: 'idle', percent: 0 });
// //         }
// //     };

// //     if (isLoading) return <Loader message="Initializing Auditor Inspection Portal..." />;

// //     // Helper for tab thumb positioning calculation for 4 tabs
// //     const getTabThumbOffset = (tab: TabOption) => {
// //         switch (tab) {
// //             case 'mis_overview': return 'translateX(100%)';
// //             case 'grievances': return 'translateX(200%)';
// //             case 'policies': return 'translateX(300%)';
// //             case 'poe_vault':
// //             default: return 'translateX(0%)';
// //         }
// //     };

// //     return (
// //         <div className="fd-root fd-root--fixed">

// //             {/* HUMAN BOT VERIFICATION CHECK */}
// //             {!isHumanVerified && (
// //                 <HumanVerificationGate onVerify={handleHumanVerified} />
// //             )}

// //             {/* INTRO LOADER OVERLAY */}
// //             {isHumanVerified && !revealed && (
// //                 <IntroLoader
// //                     phase={phase}
// //                     minMs={minMs}
// //                     userName={currentUser?.fullName || 'Auditor'}
// //                     logoSrc={mLabLogo}
// //                     learnerCount={cohortPool.length}
// //                     onSkip={skip}
// //                 />
// //             )}

// //             {/* POPIA LEGAL DISCLAIMER MODAL */}
// //             {isHumanVerified && introDone && !isDisclaimerAgreed && (
// //                 <DisclaimerGate onAgree={handleDisclaimerAgreed} />
// //             )}

// //             {revealed && (<>
// //                 {/* HERO HEADER */}
// //                 <header className="fd-hero">
// //                     <div>
// //                         <div className="fd-hero-brand">
// //                             <img src={mLabLogo} alt="mLab Logo" height={28} />
// //                             <span className="fd-hero-divider" />
// //                             <div className="fd-eyebrow">
// //                                 <span className="fd-live-dot" /> 
// //                                 QCTO / SETA Verification Workspace
// //                             </div>
// //                         </div>
// //                         <h1 className="fd-title">Auditor Inspection Portal</h1>
// //                         <p className="fd-subtitle">Real-time verification &amp; compliance monitoring for external quality assurers.</p>
// //                     </div>
// //                     <div className="fd-hero-actions">
// //                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.28)', borderRadius: '99px', padding: '0.4rem 0.85rem' }}>
// //                             <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
// //                             <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8' }}>Read-Only Inspector Mode</span>
// //                         </div>
// //                         <button onClick={() => setShowEndorseModal(true)} className="fd-btn fd-btn--primary">
// //                             <UserCheck size={15} /> Sign Off Cohort Audit
// //                         </button>
// //                     </div>
// //                 </header>

// //                 {/* CONTROLS BAR: tabs + scope selector */}
// //                 <div className="fd-controls">
// //                     {/* FIXED 4-TAB SINGLE ROW NAVIGATION */}
// //                     <div className="fd-tabs" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', maxWidth: '680px' }} data-active={activeTab} role="tablist">
// //                         <span className="fd-tab-thumb" style={{ width: 'calc(25% - 5px)', transform: getTabThumbOffset(activeTab) }} />
// //                         {[
// //                             { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// //                             { id: 'mis_overview', label: 'MIS Overview', icon: BarChart3 },
// //                             { id: 'grievances', label: 'Appeals', icon: Scale },
// //                             { id: 'policies', label: 'Policy Compliance', icon: FileSignature }
// //                         ].map(tab => (
// //                             <button
// //                                 key={tab.id}
// //                                 role="tab"
// //                                 aria-selected={activeTab === tab.id}
// //                                 className={`fd-tab ${activeTab === tab.id ? 'fd-tab--active' : ''}`}
// //                                 onClick={() => setActiveTab(tab.id as TabOption)}
// //                                 style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem' }}
// //                             >
// //                                 <tab.icon size={15} /> {tab.label}
// //                             </button>
// //                         ))}
// //                     </div>

// //                     <div className="fd-filters">
// //                         <div className="fd-filter-label"><Filter size={15} /> Scope</div>
// //                         <div className="fd-select-wrap">
// //                             <select
// //                                 className="fd-select fd-select--active"
// //                                 value={selectedCohortId}
// //                                 onChange={(e) => handleCohortChange(e.target.value)}
// //                                 style={{ minWidth: '240px' }}
// //                             >
// //                                 {allowedCohortsForAuditor.length === 0 ? (
// //                                     <option value="">No Assigned Cohorts Found</option>
// //                                 ) : (
// //                                     allowedCohortsForAuditor.map((c: any) => (
// //                                         <option key={c.id} value={c.id}>{c.name}</option>
// //                                     ))
// //                                 )}
// //                             </select>
// //                             <ChevronDown size={14} />
// //                         </div>
// //                     </div>
// //                 </div>

// //                 {/* MAIN SCROLLABLE REGION */}
// //                 <div className="fd-main fd-scroll">

// //                     {/* TARGET QUALIFICATION CARD - SLEEK FLEX ROW BANNER */}
// //                     {activeProgrammeData && (
// //                         <div className="fd-card" style={{ flexShrink: 0, padding: '1rem 1.25rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
// //                                 <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--fd-blue) 12%, #fff)', color: 'var(--fd-blue)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
// //                                     <Award size={24} />
// //                                 </div>
// //                                 <div style={{ flex: 1, minWidth: '260px' }}>
// //                                     <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
// //                                         Active Audit Target Qualification
// //                                     </div>
// //                                     <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--fd-blue)', letterSpacing: '-0.01em' }}>
// //                                         {activeProgrammeData.name}
// //                                     </h2>
// //                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
// //                                         {activeProgrammeData.saqaId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="var(--fd-blue)" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
// //                                         {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="var(--fd-blue)" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
// //                                         {activeProgrammeData.credits > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="var(--fd-blue)" /> Total Credits: {activeProgrammeData.credits}</span>}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* SAMPLING ENGINE & SEARCH TOOLBAR (FOR POE VAULT) */}
// //                     {activeTab === 'poe_vault' && (
// //                         <div className="fd-card" style={{ flexShrink: 0, padding: '0.85rem 1.25rem' }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                         <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
// //                                             Sampling Ratio:
// //                                         </span>
// //                                         <div style={{ display: 'inline-flex', border: '1.5px solid #d5dde6', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
// //                                             {[10, 20, 50, 100].map((pct) => (
// //                                                 <button
// //                                                     key={pct}
// //                                                     onClick={() => handleSamplePercentageChange(pct)}
// //                                                     style={{
// //                                                         padding: '0.4rem 0.8rem', border: 'none',
// //                                                         background: samplePercentage === pct && !searchTerm ? 'var(--fd-blue)' : 'transparent',
// //                                                         color: samplePercentage === pct && !searchTerm ? '#ffffff' : 'var(--fd-ink)',
// //                                                         fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderRight: '1px solid #d5dde6', transition: 'all 0.2s'
// //                                                     }}
// //                                                 >
// //                                                     {pct}% {pct === 10 ? '(QCTO)' : ''}
// //                                                 </button>
// //                                             ))}
// //                                         </div>
// //                                     </div>

// //                                     {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && (
// //                                         <span className="fd-pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>
// //                                             🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged
// //                                         </span>
// //                                     )}
// //                                 </div>

// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
// //                                     <button onClick={handleExportSampleManifest} className="fd-btn fd-btn--ghost fd-btn--sm">
// //                                         <Printer size={14} /> Export Manifest
// //                                     </button>

// //                                     <div className="fd-search-wrap" style={{ width: '220px' }}>
// //                                         <Search size={14} />
// //                                         <input
// //                                             className="fd-search"
// //                                             type="text"
// //                                             placeholder="Search candidate or ID..."
// //                                             value={searchTerm}
// //                                             onChange={(e) => handleSearchChange(e.target.value)}
// //                                             style={{ padding: '0.45rem 0.8rem 0.45rem 2.2rem', fontSize: '0.78rem' }}
// //                                         />
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* KPI CARDS ROW */}
// //                     {activeTab === 'poe_vault' && (
// //                         <div className="fd-kpis">
// //                             <KpiCard
// //                                 icon={<Users size={18} />}
// //                                 label="Sample Size Loaded"
// //                                 value={sampledLearners.length}
// //                                 suffix={` / ${cohortPool.length}`}
// //                                 color={MIDNIGHT}
// //                                 delay={0.05}
// //                             />
// //                             <KpiCard
// //                                 icon={<Activity size={18} />}
// //                                 label="Average Progress"
// //                                 value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0}
// //                                 suffix="%"
// //                                 color="#16a34a"
// //                                 delay={0.10}
// //                             />
// //                             <KpiCard
// //                                 icon={<Clock size={18} />}
// //                                 label="Average Attendance"
// //                                 value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0}
// //                                 suffix="%"
// //                                 color="#0284c7"
// //                                 delay={0.15}
// //                             />
// //                             <KpiCard
// //                                 icon={<ShieldCheck size={18} />}
// //                                 label="POPIA Consent"
// //                                 value={sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0}
// //                                 suffix="%"
// //                                 color="#8b5cf6"
// //                                 delay={0.20}
// //                             />
// //                             <KpiCard
// //                                 icon={<Award size={18} />}
// //                                 label="SoR Readiness"
// //                                 value={sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length}
// //                                 color="#f59e0b"
// //                                 delay={0.25}
// //                             />
// //                         </div>
// //                     )}

// //                     {/* TAB 1: LEARNER POE VAULT */}
// //                     {activeTab === 'poe_vault' && (
// //                         <div className="fd-table-card">
// //                             <div className="fd-toolbar">
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--fd-blue)' }}>
// //                                     <CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault
// //                                 </div>
// //                                 <span style={{ fontSize: '0.75rem', color: 'var(--fd-muted)', fontWeight: 700 }}>
// //                                     Page {currentPage} of {totalPages}
// //                                 </span>
// //                             </div>

// //                             <div className="fd-table-scroll fd-scroll">
// //                                 <table className="fd-table" style={{ minWidth: '1100px' }}>
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Learner Details</th>
// //                                             <th>Attendance</th>
// //                                             <th>Curriculum Evidence</th>
// //                                             <th>Progress</th>
// //                                             <th>Governance</th>
// //                                             <th>Flag Status</th>
// //                                             <th style={{ textAlign: 'right' }}>Inspection Action</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {paginatedLearners.map((learner, i) => {
// //                                             const flagInfo = candidateFlags[learner.id];
// //                                             const isFlagged = flagInfo?.flagged;
// //                                             const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
// //                                             const exportState = activeExports[learner.id] || activeExports[learner.userId];
// //                                             const hasCustomNote = !!flagInfo?.note;

// //                                             const attPct = learner.attendance?.pct || 0;
// //                                             const attAttended = learner.attendance?.attended || 0;
// //                                             const attTotal = learner.attendance?.total || 0;

// //                                             return (
// //                                                 // <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'transparent'), animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// //                                                 <tr 
// //             key={`learner_${learner.id}_${learner.userId || i}_${i}`} 
// //             style={{ 
// //                 background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'transparent'), 
// //                 animationDelay: `${Math.min(i, 12) * 0.04}s` 
// //             }}
// //         >
// //                                                     <td>
// //                                                         <div className="fd-person">
// //                                                             <div className="fd-avatar" style={{ background: isDropped ? '#fecaca' : undefined, color: isDropped ? '#b91c1c' : undefined }}>
// //                                                                 {learner.fullName[0] || 'L'}
// //                                                             </div>
// //                                                             <div>
// //                                                                 <div className="fd-name" style={{ color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName}</div>
// //                                                                 <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {learner.idNumber}</div>
// //                                                                 {isDropped && (
// //                                                                     <span className="fd-pill fd-pill--dropped" style={{ marginTop: '2px', fontSize: '0.62rem' }}>
// //                                                                         <UserX size={10} /> {learner.status}
// //                                                                     </span>
// //                                                                 )}
// //                                                             </div>
// //                                                         </div>
// //                                                     </td>

// //                                                     <td>
// //                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// //                                                             <span className="fd-pill" style={{
// //                                                                 background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2',
// //                                                                 color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626'
// //                                                             }}>
// //                                                                 <Clock size={11} /> {attPct}%
// //                                                             </span>
// //                                                             <span style={{ fontSize: '0.7rem', color: 'var(--fd-muted)', fontWeight: 600 }}>
// //                                                                 {attAttended} / {attTotal} Sessions
// //                                                             </span>
// //                                                         </div>
// //                                                     </td>

// //                                                     <td style={{ fontSize: '0.78rem' }}>
// //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}>
// //                                                             <strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}
// //                                                         </div>
// //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}>
// //                                                             <strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs
// //                                                         </div>
// //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600 }}>
// //                                                             <strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks
// //                                                         </div>
// //                                                     </td>

// //                                                     <td>
// //                                                         <div className="fd-score">
// //                                                             <div className="fd-score-bar" style={{ width: '70px', background: isDropped ? '#fca5a5' : undefined }}>
// //                                                                 <div className="fd-score-fill" style={{ width: `${learner.overallProgress}%`, background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// //                                                             </div>
// //                                                             <span className="fd-score-num" style={{ color: isDropped ? '#991b1b' : undefined }}>{learner.overallProgress}%</span>
// //                                                         </div>
// //                                                     </td>

// //                                                     <td>
// //                                                         {learner.popiaConsent ? (
// //                                                             <span className="fd-pill fd-pill--passed">✓ Policy Signed</span>
// //                                                         ) : (
// //                                                             <span className="fd-pill fd-pill--dropped">Unsigned</span>
// //                                                         )}
// //                                                     </td>

// //                                                     <td>
// //                                                         {isFlagged ? (
// //                                                             <span
// //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// //                                                                 className="fd-pill fd-pill--dropped"
// //                                                                 style={{ cursor: 'pointer' }}
// //                                                                 title={flagInfo.note || 'Click to clear flag'}
// //                                                             >
// //                                                                 <Flag size={11} fill="currentColor" /> Flagged
// //                                                             </span>
// //                                                         ) : (
// //                                                             <button
// //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// //                                                                 style={{ background: 'none', border: 'none', color: 'var(--fd-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                                             >
// //                                                                 <Flag size={12} /> Flag Item
// //                                                             </button>
// //                                                         )}
// //                                                     </td>

// //                                                     <td style={{ textAlign: 'right' }}>
// //                                                         <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
// //                                                             <button
// //                                                                 onClick={() => handleOpenNotesModal(learner)}
// //                                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                                 style={{ background: hasCustomNote ? '#fffbeb' : undefined, color: hasCustomNote ? '#b45309' : undefined, borderColor: hasCustomNote ? '#fde68a' : undefined }}
// //                                                                 title={hasCustomNote ? flagInfo.note : 'Leave auditor note'}
// //                                                             >
// //                                                                 <MessageSquare size={12} /> {hasCustomNote ? 'Notes' : 'Note'}
// //                                                             </button>

// //                                                             <button
// //                                                                 onClick={() => navigate(`/sor/${learner.userId || learner.id}`)}
// //                                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                             >
// //                                                                 <FileText size={12} /> SoR
// //                                                             </button>

// //                                                             {(() => {
// //                                                                 if (exportState?.status === 'pending' || exportState?.status === 'processing') {
// //                                                                     return (
// //                                                                         <button disabled className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: '#fef3c7', color: '#92400e' }}>
// //                                                                             <Loader2 size={12} className="animate-spin" /> {exportState.progress}%
// //                                                                         </button>
// //                                                                     );
// //                                                                 }
// //                                                                 if (exportState?.status === 'completed' && exportState?.downloadUrl) {
// //                                                                     return (
// //                                                                         <div style={{ display: 'inline-flex', gap: '4px' }}>
// //                                                                             <button onClick={() => window.open(exportState.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm">
// //                                                                                 <Download size={12} /> Get PoE
// //                                                                             </button>
// //                                                                             <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" title="Regenerate">
// //                                                                                 <RefreshCw size={12} />
// //                                                                             </button>
// //                                                                         </div>
// //                                                                     );
// //                                                                 }
// //                                                                 if (exportState?.status === 'error') {
// //                                                                     return (
// //                                                                         <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ color: '#dc2626' }}>
// //                                                                             <AlertCircle size={12} /> Retry
// //                                                                         </button>
// //                                                                     );
// //                                                                 }
// //                                                                 return (
// //                                                                     <button onClick={() => handleGeneratePoE(learner)} className="fd-btn fd-btn--ghost fd-btn--sm">
// //                                                                         <FileArchive size={12} /> Compile
// //                                                                     </button>
// //                                                                 );
// //                                                             })()}

// //                                                             <button onClick={() => setInspectedLearner(learner)} className="fd-btn fd-btn--primary fd-btn--sm">
// //                                                                 <Eye size={12} /> Inspect
// //                                                             </button>
// //                                                         </div>
// //                                                     </td>
// //                                                 </tr>
// //                                             );
// //                                         })}

// //                                         {sampledLearners.length === 0 && (
// //                                             <tr>
// //                                                 <td colSpan={7} className="fd-empty">
// //                                                     <FileCheck size={36} color="var(--fd-line)" style={{ margin: '0 auto 0.5rem' }} />
// //                                                     <h4 style={{ margin: '0 0 4px', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4>
// //                                                     <p style={{ margin: 0, fontSize: '0.8rem' }}>No candidate records match this cohort scope or search filter.</p>
// //                                                 </td>
// //                                             </tr>
// //                                         )}
// //                                     </tbody>
// //                                 </table>
// //                             </div>

// //                             <div className="fd-table-foot">
// //                                 <div>Showing {sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sampledLearners.length)} of {sampledLearners.length} sampled records</div>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                         <span>Rows:</span>
// //                                         <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="fd-select" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
// //                                             <option value={5}>5</option>
// //                                             <option value={10}>10</option>
// //                                             <option value={15}>15</option>
// //                                             <option value={25}>25</option>
// //                                             <option value={50}>50</option>
// //                                         </select>
// //                                     </div>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                         <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button>
// //                                         <span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span>
// //                                         <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* TAB 2: MIS OVERVIEW & DEMOGRAPHICS */}
// //                     {activeTab === 'mis_overview' && (
// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
// //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
// //                                 <div className="fd-card">
// //                                     <div className="fd-card-head"><h3 className="fd-card-title">Equity Group Distribution</h3></div>
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
// //                                     </div>
// //                                 </div>

// //                                 <div className="fd-card">
// //                                     <div className="fd-card-head"><h3 className="fd-card-title">Gender &amp; Disability Metrics</h3></div>
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
// //                                     </div>
// //                                 </div>

// //                                 <div className="fd-card">
// //                                     <div className="fd-card-head"><h3 className="fd-card-title">Attendance Health Bands</h3></div>
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}>
// //                                             <span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong>
// //                                         </div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}>
// //                                             <span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong>
// //                                         </div>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}>
// //                                             <span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong>
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             {/* REPORT EXPORTERS */}
// //                             <div className="fd-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// //                                 <div className="fd-card-head" style={{ marginBottom: 0 }}>
// //                                     <h3 className="fd-card-title">Regulatory Report Exporters</h3>
// //                                 </div>

// //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
// //                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
// //                                         <div>
// //                                             <strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                 <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}><FileText size={16} color="#0284c7" /></div>
// //                                                 SAQA NLRD Pipe-Delimited Batch
// //                                             </strong>
// //                                             <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>
// //                                                 Generates 28-field statutory NLRD text/CSV file for SETA submission.
// //                                             </p>
// //                                         </div>
// //                                         <div>
// //                                             {lastNlrdExport ? (
// //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// //                                                     <button onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#16a34a', color: 'white' }}>
// //                                                         <Download size={14} /> Download Batch ({lastNlrdExport.generatedAt})
// //                                                     </button>
// //                                                     <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function">
// //                                                         <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} />
// //                                                     </button>
// //                                                 </div>
// //                                             ) : (
// //                                                 <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--primary" style={{ width: '100%' }}>
// //                                                     {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
// //                                                     {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
// //                                                     {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
// //                                                     {nlrdProgress.status === 'idle' && 'Generate NLRD Report'}
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                     </div>

// //                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
// //                                         <div>
// //                                             <strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                 <div style={{ background: '#dcfce7', padding: '6px', borderRadius: '8px' }}><BarChart3 size={16} color="#16a34a" /></div>
// //                                                 Learner Throughput Matrix (CSV)
// //                                             </strong>
// //                                             <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>
// //                                                 Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.
// //                                             </p>
// //                                         </div>
// //                                         <div>
// //                                             {lastMatrixExport ? (
// //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// //                                                     <button onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#0284c7', color: 'white' }}>
// //                                                         <Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})
// //                                                     </button>
// //                                                     <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function">
// //                                                         <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} />
// //                                                     </button>
// //                                                 </div>
// //                                             ) : (
// //                                                 <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" style={{ width: '100%' }}>
// //                                                     {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
// //                                                     {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
// //                                                     {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
// //                                                     {matrixProgress.status === 'idle' && 'Generate Throughput Ratio'}
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* TAB 3: APPEALS & GRIEVANCES */}
// //                     {activeTab === 'grievances' && (
// //                         <div className="fd-table-card">
// //                             <div className="fd-toolbar">
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                     <Filter size={14} color="var(--fd-muted)" />
// //                                     <div className="fd-select-wrap">
// //                                         <select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="fd-select fd-select--active">
// //                                             <option value="ALL">All Statuses</option>
// //                                             <option value="open">Open</option>
// //                                             <option value="under_review">Under Review</option>
// //                                             <option value="resolved">Resolved</option>
// //                                         </select>
// //                                         <ChevronDown size={14} />
// //                                     </div>
// //                                     <div className="fd-select-wrap">
// //                                         <select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="fd-select fd-select--active">
// //                                             <option value="ALL">All Types</option>
// //                                             <option value="appeal">Appeals Only</option>
// //                                             <option value="complaint">Complaints Only</option>
// //                                         </select>
// //                                         <ChevronDown size={14} />
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="fd-table-scroll fd-scroll">
// //                                 <table className="fd-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Ref ID</th>
// //                                             <th>Learner</th>
// //                                             <th>Type</th>
// //                                             <th>Date Logged</th>
// //                                             <th>Description</th>
// //                                             <th>Status</th>
// //                                             <th style={{ textAlign: 'right' }}>Resolution Action</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {paginatedGrievances.map((g, i) => (
// //                                             <tr key={g.docId} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// //                                                 <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--fd-muted)' }}>{g.id}</td>
// //                                                 <td><div className="fd-name">{g.learnerName}</div></td>
// //                                                 <td><span className="fd-pill" style={{ background: 'color-mix(in srgb, var(--fd-blue) 6%, #fff)', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>{g.type}</span></td>
// //                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-muted)' }}>{g.dateLogged}</td>
// //                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-ink)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// //                                                 <td>
// //                                                     {g.status === 'open' && <span className="fd-pill" style={{ color: '#dc2626', background: '#fef2f2' }}>OPEN</span>}
// //                                                     {g.status === 'under_review' && <span className="fd-pill" style={{ color: '#92400e', background: '#fef3c7' }}>UNDER REVIEW</span>}
// //                                                     {g.status === 'resolved' && <span className="fd-pill" style={{ color: '#16a34a', background: '#dcfce7' }}>RESOLVED</span>}
// //                                                 </td>
// //                                                 <td style={{ textAlign: 'right' }}>
// //                                                     <button
// //                                                         onClick={() => {
// //                                                             setSelectedGrievance(g);
// //                                                             setGrievanceStatusInput(g.status);
// //                                                             setGrievanceResolutionNotes(g.resolutionNotes || '');
// //                                                         }}
// //                                                         className="fd-btn fd-btn--ghost fd-btn--sm"
// //                                                     >
// //                                                         <Eye size={12} /> Inspect / Resolve
// //                                                     </button>
// //                                                 </td>
// //                                             </tr>
// //                                         ))}
// //                                         {paginatedGrievances.length === 0 && (
// //                                             <tr>
// //                                                 <td colSpan={7} className="fd-empty">
// //                                                     No grievances or appeals recorded for this cohort scope.
// //                                                 </td>
// //                                             </tr>
// //                                         )}
// //                                     </tbody>
// //                                 </table>
// //                             </div>

// //                             <div className="fd-table-foot">
// //                                 <span>Showing {cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)} of {cohortFilteredGrievances.length} grievances</span>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
// //                                         <ChevronLeft size={14} /> Prev
// //                                     </button>
// //                                     <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesGrievances}</span>
// //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances}>
// //                                         Next <ChevronRight size={14} />
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* TAB 4: LEARNER POLICY COMPLIANCE */}
// //                     {activeTab === 'policies' && (
// //                         <div className="fd-table-card">
// //                             <div className="fd-toolbar">
// //                                 <div className="fd-search-wrap">
// //                                     <Search size={16} />
// //                                     <input
// //                                         type="text"
// //                                         className="fd-search"
// //                                         placeholder="Search learner policy status..."
// //                                         value={policySearchTerm}
// //                                         onChange={(e) => setPolicySearchTerm(e.target.value)}
// //                                     />
// //                                 </div>
// //                             </div>

// //                             <div className="fd-table-scroll fd-scroll">
// //                                 <table className="fd-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Learner Details</th>
// //                                             <th>Cohort Scope</th>
// //                                             <th>Code of Conduct</th>
// //                                             <th>Appeals Policy</th>
// //                                             <th>PoPIA Consent</th>
// //                                             <th style={{ textAlign: 'right' }}>Compliance State</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {paginatedPolicyLearners.map((l, i) => (
// //                                             <tr key={l.id} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// //                                                 <td>
// //                                                     <div className="fd-person">
// //                                                         <div className="fd-avatar">{l.fullName[0] || 'L'}</div>
// //                                                         <div>
// //                                                             <div className="fd-name">{l.fullName}</div>
// //                                                             <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {l.idNumber}</div>
// //                                                         </div>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>{l.cohortName}</td>
// //                                                 <td>
// //                                                     {l.codeOfConductSigned ? (
// //                                                         <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span>
// //                                                     ) : (
// //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {l.appealsPolicySigned ? (
// //                                                         <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span>
// //                                                     ) : (
// //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {l.popiaConsent ? (
// //                                                         <span className="fd-pill" style={{ background: '#e0f2fe', color: '#0369a1' }}>✓ CONSENTED</span>
// //                                                     ) : (
// //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>PENDING</span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td style={{ textAlign: 'right' }}>
// //                                                     {l.codeOfConductSigned && l.popiaConsent ? (
// //                                                         <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span>
// //                                                     ) : (
// //                                                         <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         ))}
// //                                         {paginatedPolicyLearners.length === 0 && (
// //                                             <tr>
// //                                                 <td colSpan={6} className="fd-empty">
// //                                                     No learners match this search criteria.
// //                                                 </td>
// //                                             </tr>
// //                                         )}
// //                                     </tbody>
// //                                 </table>
// //                             </div>

// //                             <div className="fd-table-foot">
// //                                 <span>Showing {searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)} of {searchedPolicyLearners.length} candidate policies</span>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
// //                                         <ChevronLeft size={14} /> Prev
// //                                     </button>
// //                                     <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesPolicyLearners}</span>
// //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners}>
// //                                         Next <ChevronRight size={14} />
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>

// //             </>)}

// //             {/* AUDITOR LEARNER NOTE MODAL */}
// //             {notesModalLearner && (
// //                 <div className="fd-modal-overlay" onClick={() => setNotesModalLearner(null)}>
// //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// //                         <div className="fd-modal-header">
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 <NotebookPen size={20} color={GREEN} />
// //                                 <div>
// //                                     <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                         Auditor Candidate Notes
// //                                     </h3>
// //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// //                                         Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})
// //                                     </span>
// //                                 </div>
// //                             </div>
// //                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
// //                         </div>

// //                         <div className="fd-modal-body">
// //                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
// //                                 Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.
// //                             </p>
// //                             <div>
// //                                 <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '6px', textTransform: 'uppercase' }}>
// //                                     Inspection Finding / Note *
// //                                 </label>
// //                                 <textarea
// //                                     rows={4}
// //                                     value={learnerNoteInput}
// //                                     onChange={(e) => setLearnerNoteInput(e.target.value)}
// //                                     placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..."
// //                                     style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }}
// //                                 />
// //                             </div>
// //                         </div>

// //                         <div className="fd-modal-footer">
// //                             <button onClick={() => setNotesModalLearner(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// //                             <button onClick={handleSaveLearnerNote} className="fd-btn fd-btn--primary">
// //                                 <CheckSquare size={14} /> Save Note
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* GRIEVANCE RESOLUTION MODAL */}
// //             {selectedGrievance && (
// //                 <div className="fd-modal-overlay" onClick={() => setSelectedGrievance(null)}>
// //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// //                         <div className="fd-modal-header">
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                 <Scale size={18} color="#4ade80" />
// //                                 <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3>
// //                             </div>
// //                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
// //                         </div>

// //                         <div className="fd-modal-body">
// //                             <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.82rem' }}>
// //                                 <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div>
// //                                 <div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div>
// //                                 <div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
// //                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
// //                                     <strong>Details:</strong>
// //                                     <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p>
// //                                 </div>
// //                             </div>
// //                             <div>
// //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label>
// //                                 <div className="fd-select-wrap">
// //                                     <select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} className="fd-select" style={{ width: '100%' }}>
// //                                         <option value="open">Open (Awaiting Investigation)</option>
// //                                         <option value="under_review">Under Review by Moderation Committee</option>
// //                                         <option value="resolved">Resolved (Official Findings Logged)</option>
// //                                     </select>
// //                                     <ChevronDown size={14} />
// //                                 </div>
// //                             </div>
// //                             <div>
// //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label>
// //                                 <textarea
// //                                     rows={4}
// //                                     value={grievanceResolutionNotes}
// //                                     onChange={(e) => setGrievanceResolutionNotes(e.target.value)}
// //                                     placeholder="Enter committee notes, resolution details, or outcome letter comments..."
// //                                     style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
// //                                 />
// //                             </div>
// //                         </div>

// //                         <div className="fd-modal-footer">
// //                             <button onClick={() => setSelectedGrievance(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// //                             <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} className="fd-btn fd-btn--primary">
// //                                 {isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* READ-ONLY POE INSPECTION DRAWER */}
// //             {inspectedLearner && (
// //                 <div className="fd-modal-overlay" onClick={() => setInspectedLearner(null)}>
// //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh' }}>
// //                         <div className="fd-modal-header">
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 <FileCheck size={20} color={GREEN} />
// //                                 <div>
// //                                     <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                         Auditor Inspection Vault: {inspectedLearner.fullName}
// //                                     </h3>
// //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// //                                         ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}
// //                                     </span>
// //                                     <div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>
// //                                         Target Qualification: {inspectedLearner.programmeName}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                             <button onClick={() => setInspectedLearner(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
// //                         </div>

// //                         <div className="fd-modal-body">
// //                             {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (
// //                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                     <UserX size={16} color="#dc2626" />
// //                                     <span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span>
// //                                 </div>
// //                             )}

// //                             <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
// //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                         <Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} />
// //                                         <strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'var(--fd-blue)' }}>
// //                                             Auditor Candidate Spot-Check Flag
// //                                         </strong>
// //                                     </div>
// //                                     <button
// //                                         onClick={() => handleToggleCandidateFlag(inspectedLearner.id)}
// //                                         className={`fd-btn fd-btn--sm ${candidateFlags[inspectedLearner.id]?.flagged ? 'fd-btn--primary' : 'fd-btn--ghost'}`}
// //                                         style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : undefined, color: candidateFlags[inspectedLearner.id]?.flagged ? '#fff' : undefined }}
// //                                     >
// //                                         {candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate'}
// //                                     </button>
// //                                 </div>
// //                                 {candidateFlags[inspectedLearner.id]?.flagged && (
// //                                     <textarea
// //                                         rows={2}
// //                                         value={candidateFlags[inspectedLearner.id]?.note || ''}
// //                                         onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)}
// //                                         placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..."
// //                                         style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '10px', fontSize: '0.8rem', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
// //                                     />
// //                                 )}
// //                             </div>

// //                             <div>
// //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <Briefcase size={14} /> Curriculum Completion &amp; Attendance Ledger
// //                                 </h4>
// //                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', background: '#fff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
// //                                     <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
// //                                     <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
// //                                     <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
// //                                     <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
// //                                     <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
// //                                 </div>
// //                             </div>

// //                             <div>
// //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <FileText size={14} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})
// //                                 </h4>

// //                                 {inspectedLearnerSubmissions.length === 0 ? (
// //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '0.82rem' }}>
// //                                         <AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />
// //                                         No digital submission documents found in Firestore for this candidate ID.
// //                                     </div>
// //                                 ) : (
// //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                         {inspectedLearnerSubmissions.map((sub: any) => {
// //                                             const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task';
// //                                             const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase();
// //                                             const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl;
// //                                             const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase());

// //                                             return (
// //                                                 <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.82rem' }}>
// //                                                     <div>
// //                                                         <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                             <span>{subTitle}</span>
// //                                                             <span className="fd-pill fd-pill--progress" style={{ fontSize: '0.65rem' }}>{subType}</span>
// //                                                         </div>
// //                                                         <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
// //                                                             Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong>
// //                                                         </div>
// //                                                     </div>

// //                                                     <div>
// //                                                         {fileUrl ? (
// //                                                             <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fd-btn fd-btn--ghost fd-btn--sm">
// //                                                                 <ExternalLink size={12} /> View File
// //                                                             </a>
// //                                                         ) : (
// //                                                             <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>
// //                                                         )}
// //                                                     </div>
// //                                                 </div>
// //                                             );
// //                                         })}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>

// //                         <div className="fd-modal-footer">
// //                             <button onClick={() => setInspectedLearner(null)} className="fd-btn fd-btn--primary">
// //                                 Close Inspection Drawer
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* ENDORSEMENT SIGN-OFF MODAL */}
// //             {showEndorseModal && (
// //                 <div className="fd-modal-overlay" onClick={() => setShowEndorseModal(false)}>
// //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// //                         <div className="fd-modal-header">
// //                             <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Record Official Audit Sign-Off</h3>
// //                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// //                         </div>

// //                         <div className="fd-modal-body">
// //                             <div>
// //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label>
// //                                 <div className="fd-select-wrap">
// //                                     <select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} className="fd-select" style={{ width: '100%' }}>
// //                                         <option value="approved">Fully Approved &amp; Endorsed</option>
// //                                         <option value="conditional">Conditional Approval (Minor Corrective Actions)</option>
// //                                         <option value="rejected">Rejected (Major Compliance Audit Failure)</option>
// //                                     </select>
// //                                     <ChevronDown size={14} />
// //                                 </div>
// //                             </div>

// //                             <div>
// //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label>
// //                                 <textarea
// //                                     rows={5}
// //                                     value={auditNotes}
// //                                     onChange={(e) => setAuditNotes(e.target.value)}
// //                                     placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..."
// //                                     style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }}
// //                                 />
// //                             </div>
// //                         </div>

// //                         <div className="fd-modal-footer">
// //                             <button onClick={() => setShowEndorseModal(false)} className="fd-btn fd-btn--ghost">Cancel</button>
// //                             <button onClick={handleSaveEndorsement} disabled={isSavingEndorsement} className="fd-btn fd-btn--primary">
// //                                 {isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* STATUS MODAL FOR OVERLAYS */}
// //             {statusModal.isOpen && (
// //                 <StatusModal
// //                     type={statusModal.type}
// //                     title={statusModal.title}
// //                     message={statusModal.message}
// //                     confirmText="Acknowledge"
// //                     onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
// //                 />
// //             )}
// //         </div>
// //     );
// // };

// // export default AuditorPortalView;




// // // // src/pages/AuditorPortal/AuditorPortalView.tsx

// // // import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// // // import { useSearchParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     ShieldCheck, Search, Eye, Lock,
// // //     FileCheck, UserCheck, X, CheckSquare,
// // //     Briefcase, Activity, Users, Award,
// // //     Loader2, ChevronLeft, ChevronRight, ChevronDown,
// // //     Printer, Flag, ExternalLink, AlertCircle,
// // //     FileText, BarChart3, UserX,
// // //     Scale, Filter, Download, RefreshCw,
// // //     FileArchive, FileSignature,
// // //     MessageSquare, NotebookPen, Tag,
// // //     BookOpen, Layers, Clock
// // // } from 'lucide-react';
// // // import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import { db } from '../../lib/firebase';
// // // import { useStore } from '../../store/useStore';
// // // import { useToast } from '../../components/common/Toast/Toast';
// // // import Loader from '../../components/common/Loader/Loader';
// // // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // // import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// // // // Reuse Funder Dashboard unified styling
// // // // import '.. /FunderDashboard/FunderDashboardView.css';
// // // import '../AdminDashboard/FunderDashboard/FunderDashboard.css'

// // // type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

// // // interface SampledLearner {
// // //     id: string;
// // //     userId: string;
// // //     fullName: string;
// // //     idNumber: string;
// // //     cohortId: string;
// // //     cohortName: string;
// // //     programmeName: string;
// // //     overallProgress: number;
// // //     attendance: { attended: number; total: number; pct: number };
// // //     formatives: { completed: number; total: number };
// // //     summatives: { completed: number; total: number };
// // //     practicals: { completed: number; total: number };
// // //     workplaces: { completed: number; total: number };
// // //     sorStatus: string;
// // //     popiaConsent: boolean;
// // //     hasSignature: boolean;
// // //     status: string;
// // //     gender?: string;
// // //     equityGroup?: string;
// // //     disabilityStatus?: string;
// // //     birthDate?: string;
// // //     codeOfConductSigned?: boolean;
// // //     appealsPolicySigned?: boolean;
// // // }

// // // interface AuditorLearnerFlag {
// // //     flagged: boolean;
// // //     note: string;
// // // }

// // // interface GrievanceRecord {
// // //     docId: string;
// // //     id: string;
// // //     learnerName: string;
// // //     cohortId: string;
// // //     dateLogged: string;
// // //     type: 'appeal' | 'complaint';
// // //     status: 'open' | 'under_review' | 'resolved';
// // //     description: string;
// // //     resolutionNotes?: string;
// // // }

// // // interface ActiveExport {
// // //     requestId: string;
// // //     learnerId: string;
// // //     progress: number;
// // //     progressMessage: string;
// // //     status: 'pending' | 'processing' | 'completed' | 'error';
// // //     downloadUrl?: string;
// // //     errorMessage?: string;
// // // }

// // // interface ExportProgressState {
// // //     status: 'idle' | 'generating' | 'downloading';
// // //     percent: number;
// // // }

// // // interface ReportCache {
// // //     downloadUrl: string;
// // //     generatedAt: string;
// // //     totalRecords?: number;
// // // }

// // // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // // const MIDNIGHT = 'var(--fd-blue, #002b49)';
// // // const GREEN = 'var(--fd-green, #94c73d)';

// // // const VERIFIED_STORAGE_KEY = 'ap-human-verified-v1';
// // // const DISCLAIMER_STORAGE_KEY = 'ap-disclaimer-agreed-v1.1';

// // // /* ------------------------------------------------------------------ */
// // // /* Helpers & CountUp Animation                                        */
// // // /* ------------------------------------------------------------------ */

// // // const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

// // // const downloadFileWithProgress = (
// // //     url: string,
// // //     filename: string,
// // //     onProgress: (percent: number) => void
// // // ): Promise<void> => {
// // //     return new Promise((resolve, reject) => {
// // //         const xhr = new XMLHttpRequest();
// // //         xhr.open('GET', url, true);
// // //         xhr.responseType = 'blob';

// // //         xhr.onprogress = (event) => {
// // //             if (event.lengthComputable && event.total > 0) {
// // //                 const percent = Math.round((event.loaded / event.total) * 100);
// // //                 onProgress(percent);
// // //             } else if (event.loaded > 0) {
// // //                 const estimatedTotal = event.loaded + 50000;
// // //                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
// // //                 onProgress(percent);
// // //             }
// // //         };

// // //         xhr.onload = () => {
// // //             if (xhr.status === 200) {
// // //                 const blob = xhr.response;
// // //                 const blobUrl = window.URL.createObjectURL(blob);
// // //                 const link = document.createElement('a');
// // //                 link.href = blobUrl;
// // //                 link.download = filename;
// // //                 document.body.appendChild(link);
// // //                 link.click();
// // //                 document.body.removeChild(link);
// // //                 window.URL.revokeObjectURL(blobUrl);
// // //                 onProgress(100);
// // //                 resolve();
// // //             } else {
// // //                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
// // //             }
// // //         };

// // //         xhr.onerror = () => reject(new Error('Network error during file download.'));
// // //         xhr.send();
// // //     });
// // // };

// // // const useCountUp = (target: number, duration = 900) => {
// // //     const [value, setValue] = useState(0);
// // //     const fromRef = useRef(0);

// // //     useEffect(() => {
// // //         if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
// // //             setValue(target);
// // //             fromRef.current = target;
// // //             return;
// // //         }
// // //         const from = fromRef.current;
// // //         const start = performance.now();
// // //         let raf = 0;
// // //         const tick = (now: number) => {
// // //             const p = Math.min((now - start) / duration, 1);
// // //             const eased = 1 - Math.pow(1 - p, 3);
// // //             const next = Math.round(from + (target - from) * eased);
// // //             setValue(next);
// // //             if (p < 1) raf = requestAnimationFrame(tick);
// // //             else fromRef.current = target;
// // //         };
// // //         raf = requestAnimationFrame(tick);
// // //         return () => cancelAnimationFrame(raf);
// // //     }, [target, duration]);

// // //     return value;
// // // };

// // // const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: number; suffix?: string; color: string; delay: number }> = ({ icon, label, value, suffix = '', color, delay }) => {
// // //     const shown = useCountUp(value);
// // //     return (
// // //         <div className="fd-kpi" style={{ ['--kpi' as any]: color, animationDelay: `${delay}s` }}>
// // //             <div className="fd-kpi-head">
// // //                 <div className="fd-kpi-icon">{icon}</div>
// // //                 <span className="fd-kpi-label">{label}</span>
// // //             </div>
// // //             <div className="fd-kpi-value">{shown}{suffix}</div>
// // //         </div>
// // //     );
// // // };

// // // /* ------------------------------------------------------------------ */
// // // /* Intro loader + welcome                                             */
// // // /* ------------------------------------------------------------------ */
// // // type Phase = 'loading' | 'welcome' | 'reveal' | 'done';

// // // const STATUS_MESSAGES = ['Syncing QCTO data', 'Compiling evidence', 'Building your portal'];

// // // const greeting = () => {
// // //     const h = new Date().getHours();
// // //     return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
// // // };

// // // const DOTS = Array.from({ length: 18 }, (_, i) => ({
// // //     x: (i * 37 + 7) % 100,
// // //     s: 3 + (i % 4) * 2,
// // //     d: 6 + (i % 5) * 1.6,
// // //     delay: (i % 7) * 0.7
// // // }));

// // // const useIntro = (enabled: boolean, isLoading: boolean, minDuration: number, startTimer: boolean) => {
// // //     const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// // //     const minMs = reduced ? 500 : minDuration;

// // //     const [phase, setPhase] = useState<Phase>(() => (enabled ? 'loading' : 'done'));
// // //     const [minElapsed, setMinElapsed] = useState(false);

// // //     useEffect(() => {
// // //         if (!startTimer) return;
// // //         const t = setTimeout(() => setMinElapsed(true), minMs);
// // //         return () => clearTimeout(t);
// // //     }, [minMs, startTimer]);

// // //     useEffect(() => {
// // //         if (phase === 'loading' && minElapsed && !isLoading) setPhase('welcome');
// // //     }, [phase, minElapsed, isLoading]);

// // //     useEffect(() => {
// // //         if (phase === 'welcome') {
// // //             const t = setTimeout(() => setPhase('reveal'), reduced ? 600 : 1700);
// // //             return () => clearTimeout(t);
// // //         }
// // //         if (phase === 'reveal') {
// // //             const t = setTimeout(() => {
// // //                 setPhase('done');
// // //             }, reduced ? 100 : 1100);
// // //             return () => clearTimeout(t);
// // //         }
// // //     }, [phase, reduced]);

// // //     const skip = () => setPhase(p => (p === 'loading' || p === 'welcome' ? 'reveal' : p));
// // //     return { phase, skip, minMs };
// // // };

// // // const IntroLoader: React.FC<{
// // //     phase: Phase;
// // //     minMs: number;
// // //     userName?: string;
// // //     logoSrc?: string;
// // //     learnerCount: number;
// // //     onSkip: () => void;
// // // }> = ({ phase, minMs, userName, logoSrc, learnerCount }) => {
// // //     const [started, setStarted] = useState(false);
// // //     const [msgIndex, setMsgIndex] = useState(0);

// // //     useEffect(() => {
// // //         const raf = requestAnimationFrame(() => setStarted(true));
// // //         return () => cancelAnimationFrame(raf);
// // //     }, []);

// // //     useEffect(() => {
// // //         if (phase !== 'loading') return;
// // //         const t = setInterval(() => setMsgIndex(i => (i + 1) % STATUS_MESSAGES.length), 850);
// // //         return () => clearInterval(t);
// // //     }, [phase]);

// // //     const welcome = phase !== 'loading';
// // //     const pct = welcome ? 100 : started ? 88 : 0;

// // //     const background = (
// // //         <>
// // //             <div className="fd-ld-bg" />
// // //             <span className="fd-ld-orb fd-ld-orb--a" />
// // //             <span className="fd-ld-orb fd-ld-orb--b" />
// // //             {DOTS.map((d, i) => (
// // //                 <span key={i} className="fd-ld-dot" style={{ ['--x' as any]: d.x, ['--s' as any]: `${d.s}px`, ['--d' as any]: `${d.d}s`, ['--delay' as any]: `${d.delay}s` }} />
// // //             ))}
// // //         </>
// // //     );

// // //     return (
// // //         <div className={`fd-ld ${phase === 'reveal' ? 'fd-ld--reveal' : ''}`} role="status" aria-live="polite">
// // //             <div className="fd-ld-panel fd-ld-panel--top">{background}</div>
// // //             <div className="fd-ld-panel fd-ld-panel--bottom">{background}</div>

// // //             <div className="fd-ld-center">
// // //                 <div className="fd-ld-mark">
// // //                     <span className="fd-ld-orbit" />
// // //                     <span className="fd-ld-orbit fd-ld-orbit--2" />
// // //                     <svg className="fd-ld-ring-svg" viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
// // //                         <circle className="fd-ld-ring-track" cx="50" cy="50" r="45" />
// // //                         <circle className={`fd-ld-ring ${welcome ? 'fd-ld-ring--done' : ''}`} cx="50" cy="50" r="45" />
// // //                     </svg>
// // //                     <div className="fd-ld-core">
// // //                         {logoSrc && !welcome ? (
// // //                             <div className="fd-ld-logo"><img src={logoSrc} alt="mLab Logo" /></div>
// // //                         ) : !welcome ? (
// // //                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
// // //                                 <img src={mLabLogo} alt="mLab Logo" height={24} />
// // //                                 <div className="fd-ld-bars" aria-hidden="true" style={{ scale: '0.6' }}>
// // //                                     <span /><span /><span /><span /><span />
// // //                                 </div>
// // //                             </div>
// // //                         ) : null}

// // //                         {welcome && (
// // //                             <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
// // //                                 <path className="fd-ld-check" d="M14 29 L24 39 L43 18" />
// // //                             </svg>
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //                 {!welcome ? (
// // //                     <div className="fd-ld-text" key="loading">
// // //                         <div className="fd-ld-eyebrow">Auditor Portal</div>
// // //                         <h2 className="fd-ld-title" key={msgIndex}>{STATUS_MESSAGES[msgIndex]}<em>…</em></h2>
// // //                         <div className="fd-ld-progress">
// // //                             <div className="fd-ld-progress-fill" style={{ width: `${pct}%`, transitionDuration: `${minMs}ms` }} />
// // //                         </div>
// // //                     </div>
// // //                 ) : (
// // //                     <div className="fd-ld-text" key="welcome">
// // //                         <div className="fd-ld-eyebrow">{greeting()}</div>
// // //                         <h2 className="fd-ld-title">Welcome back{userName ? <>, <em>{userName}</em></> : ''}</h2>
// // //                         <p className="fd-ld-sub">Your audit sandbox is ready &middot; {learnerCount} records verified</p>
// // //                         <div className="fd-ld-progress">
// // //                             <div className="fd-ld-progress-fill" style={{ width: '100%', transitionDuration: '400ms' }} />
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // /* ------------------------------------------------------------------ */
// // // /* Interactive Human Verification Gate                                */
// // // /* ------------------------------------------------------------------ */
// // // const HumanVerificationGate: React.FC<{ onVerify: () => void }> = ({ onVerify }) => {
// // //     const [sliderPos, setSliderPos] = useState(0);
// // //     const [isDragging, setIsDragging] = useState(false);
// // //     const trackRef = useRef<HTMLDivElement>(null);

// // //     const handleMove = (clientX: number) => {
// // //         if (!isDragging || !trackRef.current) return;
// // //         const rect = trackRef.current.getBoundingClientRect();
// // //         const max = rect.width - 42;
// // //         const offsetX = Math.max(0, Math.min(clientX - rect.left - 21, max));
// // //         const pct = (offsetX / max) * 100;
// // //         setSliderPos(pct);

// // //         if (pct >= 95) {
// // //             setIsDragging(false);
// // //             setSliderPos(100);
// // //             setTimeout(() => {
// // //                 onVerify();
// // //             }, 250);
// // //         }
// // //     };

// // //     return (
// // //         <div className="fd-bot-overlay">
// // //             <div className="fd-bot-card">
// // //                 <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--mlab-green) 20%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', marginBottom: 12 }}>
// // //                     <ShieldCheck size={28} />
// // //                 </div>
// // //                 <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>
// // //                     Human Verification Required
// // //                 </h3>
// // //                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
// // //                     To protect audit integrity, please slide to confirm you are human.
// // //                 </p>

// // //                 <div
// // //                     ref={trackRef}
// // //                     className="fd-bot-slider-track"
// // //                     onMouseMove={(e) => handleMove(e.clientX)}
// // //                     onTouchMove={(e) => handleMove(e.touches[0].clientX)}
// // //                     onMouseUp={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
// // //                     onTouchEnd={() => { setIsDragging(false); if (sliderPos < 95) setSliderPos(0); }}
// // //                 >
// // //                     <div className="fd-bot-slider-fill" style={{ width: `${sliderPos}%` }} />
// // //                     <span className="fd-bot-slider-text">
// // //                         {sliderPos >= 95 ? 'Verified!' : 'Slide to Access Portal ➔'}
// // //                     </span>
// // //                     <div
// // //                         className="fd-bot-slider-thumb"
// // //                         style={{ transform: `translateX(${(sliderPos / 100) * ((trackRef.current?.getBoundingClientRect().width || 340) - 50)}px)` }}
// // //                         onMouseDown={() => setIsDragging(true)}
// // //                         onTouchStart={() => setIsDragging(true)}
// // //                     >
// // //                         <Lock size={16} />
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // /* ------------------------------------------------------------------ */
// // // /* POPIA Disclaimer Modal (Strict Active Consent)                     */
// // // /* ------------------------------------------------------------------ */
// // // const DisclaimerGate: React.FC<{ onAgree: () => void }> = ({ onAgree }) => {
// // //     const [isChecked, setIsChecked] = useState(false);
// // //     const [isSubmitting, setIsSubmitting] = useState(false);

// // //     const handleAcknowledge = async () => {
// // //         if (!isChecked) return;
// // //         setIsSubmitting(true);
        
// // //         setTimeout(() => {
// // //             onAgree();
// // //         }, 600);
// // //     };

// // //     return (
// // //         <div className="fd-bot-overlay" style={{ 
// // //             background: 'linear-gradient(135deg, rgba(0, 43, 73, 0.5) 0%, rgba(100, 163, 88, 0.2) 100%)',
// // //             backdropFilter: 'blur(16px)',
// // //             WebkitBackdropFilter: 'blur(16px)'
// // //         }}>
// // //             <div className="fd-disclaimer-card" style={{ 
// // //                 width: 'min(100%, 640px)', 
// // //                 padding: 0, 
// // //                 maxHeight: '90vh', 
// // //                 display: 'flex', 
// // //                 flexDirection: 'column', 
// // //                 overflow: 'hidden',
// // //                 background: '#fff',
// // //                 borderRadius: '20px',
// // //                 boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)'
// // //             }}>
                
// // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.5rem 2rem', borderBottom: '1px solid var(--fd-line)', flexShrink: 0, background: '#fff' }}>
// // //                     <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--mlab-blue) 12%, #fff)', display: 'grid', placeItems: 'center', color: 'var(--mlab-blue)', flexShrink: 0 }}>
// // //                         <ShieldCheck size={22} />
// // //                     </div>
// // //                     <div>
// // //                         <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>POPIA Data Privacy &amp; Protection</h3>
// // //                         <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Mandatory Compliance Notice</div>
// // //                     </div>
// // //                 </div>
                
// // //                 <div className="fd-scroll" style={{ padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#fff' }}>
// // //                     <p style={{ margin: '0 0 1.2rem 0', fontWeight: 600, color: 'var(--fd-ink)' }}>
// // //                         This dashboard contains personal and potentially sensitive information relating to learners and programme participants. The information is provided to authorised stakeholders strictly for legitimate programme reporting, monitoring, evaluation, verification and related organisational purposes.
// // //                     </p>
// // //                     <p style={{ margin: '0 0 1.2rem 0' }}>
// // //                         In accordance with the <strong>Protection of Personal Information Act 4 of 2013 (POPIA)</strong>, access to and use of this information is restricted to authorised persons and must be limited to the purpose for which it has been provided.
// // //                     </p>
                    
// // //                     <strong style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--fd-blue)' }}>By accessing this dashboard, you agree to:</strong>
// // //                     <ul style={{ margin: '0 0 1.2rem 0', paddingLeft: '1.4rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                         <li>Keep all personal information confidential and secure.</li>
// // //                         <li>Use the information only for the authorised purpose for which access has been granted.</li>
// // //                         <li>Not copy, download, reproduce, publish, disclose, distribute or share the information with any unauthorised person or third party.</li>
// // //                         <li>Take reasonable measures to prevent unauthorised access, loss, disclosure, alteration or misuse of the information.</li>
// // //                         <li>Not use the information for any secondary or unrelated purpose without appropriate authorisation and lawful basis.</li>
// // //                         <li>Immediately notify the designated responsible party of any suspected or actual security compromise, unauthorised access or disclosure.</li>
// // //                         <li>Ensure that any person granted access to the information is appropriately authorised and subject to equivalent confidentiality and data-protection requirements.</li>
// // //                         <li>Cease use of the information and securely delete or return any copies when access or the authorised purpose comes to an end, where applicable.</li>
// // //                     </ul>

// // //                     <p style={{ margin: '0 0 0.85rem 0' }}>
// // //                         Where an external stakeholder processes personal information on behalf of the responsible party, such processing must be undertaken only with the knowledge and authorisation of the responsible party and in accordance with applicable POPIA requirements and any relevant data-processing or confidentiality agreement.
// // //                     </p>
// // //                     <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
// // //                         Unauthorised access, use, disclosure or distribution of this information is strictly prohibited.
// // //                     </p>
// // //                 </div>

// // //                 <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--fd-line)', background: '#f8fafc', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
// // //                     <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
// // //                         <div style={{ paddingTop: '2px' }}>
// // //                             <input 
// // //                                 type="checkbox" 
// // //                                 checked={isChecked}
// // //                                 onChange={(e) => setIsChecked(e.target.checked)}
// // //                                 style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--mlab-green)' }}
// // //                             />
// // //                         </div>
// // //                         <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fd-blue)', lineHeight: 1.4 }}>
// // //                             I have read and acknowledge the above notice and agree to handle the information in accordance with the stated requirements.
// // //                         </span>
// // //                     </label>

// // //                     <button 
// // //                         className={`fd-btn ${isChecked ? 'fd-btn--primary' : ''}`}
// // //                         disabled={!isChecked || isSubmitting}
// // //                         onClick={handleAcknowledge} 
// // //                         style={{ 
// // //                             padding: '0.85rem 1.5rem', 
// // //                             fontSize: '0.9rem', 
// // //                             width: '100%',
// // //                             background: !isChecked ? '#e2e8f0' : undefined,
// // //                             color: !isChecked ? '#94a3b8' : undefined,
// // //                             cursor: !isChecked ? 'not-allowed' : 'pointer',
// // //                             border: 'none',
// // //                             borderRadius: '12px',
// // //                             fontWeight: 800,
// // //                             display: 'flex',
// // //                             alignItems: 'center',
// // //                             justifyContent: 'center',
// // //                             gap: '8px'
// // //                         }}
// // //                     >
// // //                         {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
// // //                         {isSubmitting ? 'Recording Acknowledgement...' : 'Acknowledge & Continue'}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // export const AuditorPortalView: React.FC = () => {
// // //     const toast = useToast();
// // //     const navigate = useNavigate();
// // //     const [searchParams, setSearchParams] = useSearchParams();

// // //     // Security Gate State
// // //     const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => {
// // //         try { return sessionStorage.getItem(VERIFIED_STORAGE_KEY) === 'true'; } catch { return false; }
// // //     });

// // //     const [isDisclaimerAgreed, setIsDisclaimerAgreed] = useState<boolean>(() => {
// // //         try { return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { return false; }
// // //     });

// // //     const handleHumanVerified = () => {
// // //         setIsHumanVerified(true);
// // //         try { sessionStorage.setItem(VERIFIED_STORAGE_KEY, 'true'); } catch { /* ignore */ }
// // //     };

// // //     const handleDisclaimerAgreed = async () => {
// // //         setIsDisclaimerAgreed(true);
// // //         try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch { /* ignore */ }

// // //         let deviceId = localStorage.getItem('ap-device-id');
// // //         if (!deviceId) {
// // //             deviceId = typeof crypto.randomUUID === 'function' 
// // //                 ? crypto.randomUUID() 
// // //                 : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
// // //             localStorage.setItem('ap-device-id', deviceId);
// // //         }

// // //         try {
// // //             const auditPayload = {
// // //                 deviceId: deviceId,
// // //                 action: 'POPIA_AGREEMENT_ACCEPTED_AUDITOR',
// // //                 timestamp: new Date().toISOString(),
// // //                 userAgent: navigator.userAgent
// // //             };

// // //             await fetch('https://your-database-api-or-webhook.com/api/audit', {
// // //                 method: 'POST',
// // //                 headers: { 'Content-Type': 'application/json' },
// // //                 body: JSON.stringify(auditPayload),
// // //                 keepalive: true 
// // //             });
// // //         } catch (err) {
// // //             console.error("Failed to log audit trail.", err);
// // //         }
// // //     };

// // //     const {
// // //         user: currentUser,
// // //         cohorts: storeCohorts,
// // //         learners: storeLearners,
// // //         programmes: storeProgrammes,
// // //         fetchProgrammes,
// // //         fetchCohorts,
// // //         fetchLearners
// // //     } = useStore() as any;

// // //     const initialCohortFromUrl = searchParams.get('cohort') || '';
// // //     const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
// // //     const initialSearchFromUrl = searchParams.get('search') || '';

// // //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// // //     const [isLoading, setIsLoading] = useState(true);
// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
// // //     const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
// // //     const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);

// // //     const [currentPage, setCurrentPage] = useState<number>(1);
// // //     const [itemsPerPage, setItemsPerPage] = useState<number>(10);

// // //     const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});

// // //     // AUDITOR LEARNER NOTE MODAL STATE
// // //     const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
// // //     const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');

// // //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// // //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// // //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);

// // //     const [rawUsers, setRawUsers] = useState<any[]>([]);
// // //     const [rawLearners, setRawLearners] = useState<any[]>([]);
// // //     const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);

// // //     // REAL-TIME ATTENDANCE DATA STREAMS
// // //     const [rawAttendance, setRawAttendance] = useState<any[]>([]);
// // //     const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
// // //     const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);

// // //     const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);

// // //     const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
// // //     const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
// // //     const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
// // //     const [isSavingGrievance, setIsSavingGrievance] = useState(false);
// // //     const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
// // //     const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');

// // //     const [policySearchTerm, setPolicySearchTerm] = useState('');

// // //     const [showEndorseModal, setShowEndorseModal] = useState(false);
// // //     const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
// // //     const [auditNotes, setAuditNotes] = useState('');
// // //     const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);

// // //     const [statusModal, setStatusModal] = useState<{
// // //         isOpen: boolean;
// // //         type: StatusType;
// // //         title: string;
// // //         message: string;
// // //     }>({
// // //         isOpen: false,
// // //         type: 'error',
// // //         title: '',
// // //         message: ''
// // //     });

// // //     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // //     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // //     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
// // //     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

// // //     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

// // //     // INTRO LOADER HOOK
// // //     const isDataLoading = isLoading || (!storeCohorts || storeCohorts.length === 0);
// // //     const { phase, skip, minMs } = useIntro(true, isDataLoading, 2600, isHumanVerified);
// // //     const introDone = phase === 'reveal' || phase === 'done';
// // //     const revealed = introDone && isDisclaimerAgreed;

// // //     useEffect(() => {
// // //         if (!currentUser?.isTemporaryAuditor) {
// // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // //             if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
// // //         } else {
// // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // //         }
// // //     }, [currentUser?.isTemporaryAuditor]);

// // //     useEffect(() => {
// // //         setCurrentPage(1);
// // //     }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);

// // //     useEffect(() => {
// // //         setLastNlrdExport(null);
// // //         setLastMatrixExport(null);
// // //     }, [selectedCohortId]);

// // //     // Real-Time Listener for Historical & Active PoE Exports
// // //     useEffect(() => {
// // //         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
// // //         const unsubPoe = onSnapshot(qPoe, (snap) => {
// // //             const exportsMap: Record<string, ActiveExport> = {};
// // //             snap.docs.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 const lId = data.learnerId;
// // //                 if (lId && !exportsMap[lId]) {
// // //                     exportsMap[lId] = {
// // //                         requestId: docSnap.id,
// // //                         learnerId: lId,
// // //                         progress: data.progress || 0,
// // //                         progressMessage: data.progressMessage || '',
// // //                         status: data.status || 'pending',
// // //                         downloadUrl: data.downloadUrl,
// // //                         errorMessage: data.errorMessage
// // //                     };
// // //                 }
// // //             });
// // //             setActiveExports(prev => ({ ...exportsMap, ...prev }));
// // //         });

// // //         return () => unsubPoe();
// // //     }, []);

// // //     const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
// // //         const newParams: Record<string, string> = {};
// // //         if (cohortId) newParams.cohort = cohortId;
// // //         if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
// // //         if (search) newParams.search = search;

// // //         setSearchParams(newParams, { replace: true });
// // //     }, [setSearchParams]);

// // //     const allowedCohortsForAuditor = useMemo(() => {
// // //         if (!storeCohorts || storeCohorts.length === 0) return [];

// // //         const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
// // //         if (isFullAdmin) return storeCohorts;

// // //         const allowedIds: string[] = Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : [];

// // //         if (allowedIds.length > 0) {
// // //             return storeCohorts.filter((c: any) => allowedIds.includes(c.id));
// // //         }

// // //         return storeCohorts;
// // //     }, [storeCohorts, currentUser?.role, currentUser?.isSuperAdmin, currentUser?.allowedCohortIds]);

// // //     useEffect(() => {
// // //         if (allowedCohortsForAuditor.length > 0) {
// // //             const isValidSelection = allowedCohortsForAuditor.some((c: any) => c.id === selectedCohortId);

// // //             if (!selectedCohortId || !isValidSelection) {
// // //                 const defaultCohortId = allowedCohortsForAuditor[0].id;
// // //                 setSelectedCohortId(defaultCohortId);
// // //                 syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
// // //             }
// // //         } else {
// // //             setSelectedCohortId('');
// // //         }
// // //     }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

// // //     // Real-time Firestore Subscriptions
// // //     useEffect(() => {
// // //         setIsLoading(true);

// // //         const handlePermissionError = (collectionName: string, err: any) => {
// // //             console.warn(`[Firestore Permission Guard] Access to '${collectionName}' restricted:`, err);
// // //             setIsLoading(false);
// // //         };

// // //         const unsubEnrollments = onSnapshot(
// // //             collection(db, 'enrollments'),
// // //             (snap) => {
// // //                 const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //                 setRawEnrollments(enrolls);
// // //             },
// // //             (err) => handlePermissionError('enrollments', err)
// // //         );

// // //         const unsubSubmissions = onSnapshot(
// // //             collection(db, 'learner_submissions'),
// // //             (snap) => {
// // //                 const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //                 setRawSubmissions(subs);
// // //                 setIsLoading(false);
// // //             },
// // //             (err) => handlePermissionError('learner_submissions', err)
// // //         );

// // //         const unsubUsers = onSnapshot(
// // //             collection(db, 'users'),
// // //             (snap) => {
// // //                 const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //                 setRawUsers(users);
// // //             },
// // //             (err) => handlePermissionError('users', err)
// // //         );

// // //         const unsubLearners = onSnapshot(
// // //             collection(db, 'learners'),
// // //             (snap) => {
// // //                 const learners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //                 setRawLearners(learners);
// // //             },
// // //             (err) => handlePermissionError('learners', err)
// // //         );

// // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // //         const unsubGrievances = onSnapshot(
// // //             qGrievances,
// // //             (snap) => {
// // //                 const parsedGrievances: GrievanceRecord[] = [];
// // //                 snap.docs.forEach(docSnap => {
// // //                     const data = docSnap.data();
// // //                     parsedGrievances.push({
// // //                         docId: docSnap.id,
// // //                         id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(),
// // //                         learnerName: data.learnerName || 'Unknown Learner',
// // //                         cohortId: data.cohortId || data.cohortRunId || '',
// // //                         dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // //                         type: data.type || 'appeal',
// // //                         status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// // //                         description: data.reason || data.description || 'No description provided',
// // //                         resolutionNotes: data.resolutionNotes || ''
// // //                     });
// // //                 });
// // //                 setRawGrievances(parsedGrievances);
// // //             },
// // //             (err) => handlePermissionError('assessment_appeals', err)
// // //         );

// // //         const unsubPolicies = onSnapshot(
// // //             collection(db, 'learner_policy_signoffs'),
// // //             (snap) => {
// // //                 const signoffs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // //                 setRawPolicySignoffs(signoffs);
// // //             },
// // //             (err) => handlePermissionError('learner_policy_signoffs', err)
// // //         );

// // //         // ATTENDANCE STREAMS
// // //         const unsubAttendance = onSnapshot(
// // //             collection(db, 'attendance'),
// // //             (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // //             (err) => handlePermissionError('attendance', err)
// // //         );

// // //         const unsubAttLogs = onSnapshot(
// // //             collection(db, 'attendance_logs'),
// // //             (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // //             (err) => handlePermissionError('attendance_logs', err)
// // //         );

// // //         const unsubAttRecords = onSnapshot(
// // //             collection(db, 'attendance_records'),
// // //             (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // //             (err) => handlePermissionError('attendance_records', err)
// // //         );

// // //         return () => {
// // //             unsubEnrollments();
// // //             unsubSubmissions();
// // //             unsubUsers();
// // //             unsubLearners();
// // //             unsubGrievances();
// // //             unsubPolicies();
// // //             unsubAttendance();
// // //             unsubAttLogs();
// // //             unsubAttRecords();
// // //         };
// // //     }, []);

// // //     const addCleanKey = (setObj: Set<string>, val: any) => {
// // //         if (val && typeof val === 'string') {
// // //             const cleaned = val.trim().toLowerCase();
// // //             if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') {
// // //                 setObj.add(cleaned);
// // //             }
// // //         }
// // //     };

// // //     const checkCocSignedInObject = (obj: any) => {
// // //         if (!obj) return false;
// // //         const demo = obj.demographics || {};
// // //         return (
// // //             obj.codeOfConductSigned === true ||
// // //             obj.hasSignedCoc === true ||
// // //             obj.cocSigned === true ||
// // //             obj.policySigned === true ||
// // //             obj.isPolicySigned === true ||
// // //             demo.codeOfConductSigned === true ||
// // //             demo.hasSignedCoc === true ||
// // //             demo.cocSigned === true ||
// // //             demo.policySigned === true ||
// // //             !!obj.signatureUrl ||
// // //             !!demo.signatureUrl
// // //         );
// // //     };

// // //     const cocSignedKeysSet = useMemo(() => {
// // //         const keys = new Set<string>();

// // //         rawPolicySignoffs.forEach((d: any) => {
// // //             addCleanKey(keys, d.id);
// // //             addCleanKey(keys, d.userId);
// // //             addCleanKey(keys, d.learnerId);
// // //             addCleanKey(keys, d.authUid);
// // //             addCleanKey(keys, d.idNumber);
// // //             addCleanKey(keys, d.userEmail);
// // //             addCleanKey(keys, d.email);
// // //         });

// // //         rawUsers.forEach((u: any) => {
// // //             if (checkCocSignedInObject(u)) {
// // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // //             }
// // //         });

// // //         rawLearners.forEach((l: any) => {
// // //             if (checkCocSignedInObject(l)) {
// // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // //             }
// // //         });

// // //         rawEnrollments.forEach((e: any) => {
// // //             if (checkCocSignedInObject(e)) {
// // //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// // //             }
// // //         });

// // //         return keys;
// // //     }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

// // //     const appealsSignedKeysSet = useMemo(() => {
// // //         const keys = new Set<string>();

// // //         rawPolicySignoffs.forEach((d: any) => {
// // //             const type = String(d.policyType || d.policyName || '').toLowerCase();
// // //             if (type.includes('appeal')) {
// // //                 addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email);
// // //             }
// // //         });

// // //         rawUsers.forEach((u: any) => {
// // //             if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) {
// // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // //             }
// // //         });

// // //         rawLearners.forEach((l: any) => {
// // //             if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) {
// // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // //             }
// // //         });

// // //         return keys;
// // //     }, [rawPolicySignoffs, rawUsers, rawLearners]);

// // //     const popiaConsentKeysSet = useMemo(() => {
// // //         const keys = new Set<string>();

// // //         rawUsers.forEach((u: any) => {
// // //             const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true';
// // //             if (isConsent) {
// // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // //             }
// // //         });

// // //         rawLearners.forEach((l: any) => {
// // //             const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true';
// // //             if (isConsent) {
// // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // //             }
// // //         });

// // //         rawEnrollments.forEach((e: any) => {
// // //             const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true';
// // //             if (isConsent) {
// // //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// // //             }
// // //         });

// // //         return keys;
// // //     }, [rawUsers, rawLearners, rawEnrollments]);

// // //     // RESOLVE ACTIVE PROGRAMME DATA FOR THE CURRENTLY SELECTED COHORT SCOPE
// // //     const activeProgrammeData = useMemo(() => {
// // //         if (!selectedCohortId) return null;
// // //         const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
// // //         if (!cohort) return null;

// // //         return storeProgrammes?.find((p: any) =>
// // //             p.id === cohort.programmeId ||
// // //             p.id === cohort.qualificationId ||
// // //             (p.saqaId && String(p.saqaId) === String(cohort.saqaId))
// // //         ) || null;
// // //     }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

// // //     // UNIFIED ATTENDANCE AGGREGATOR
// // //     const dailyRegisters = useMemo(() => {
// // //         const unifiedMap = new Map<string, any>();

// // //         const matchCohort = (r: any) => {
// // //             if (!selectedCohortId || selectedCohortId === 'ALL') return true;
// // //             const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim();
// // //             return rCohort === selectedCohortId;
// // //         };

// // //         const filteredAtt = rawAttendance.filter(matchCohort);
// // //         const filteredLogs = rawAttendanceLogs.filter(matchCohort);
// // //         const filteredRecords = rawAttendanceRecords.filter(matchCohort);

// // //         filteredAtt.forEach(record => {
// // //             if (record.presentLearners || record.absentLearners) {
// // //                 const dateKey = record.date || record.id;
// // //                 unifiedMap.set(record.id || dateKey, {
// // //                     id: record.id || dateKey,
// // //                     date: record.date || 'Unknown',
// // //                     presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [],
// // //                     absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [],
// // //                     partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : []
// // //                 });
// // //             } else if (record.learnerId && record.date) {
// // //                 const dateKey = `eco_${record.date}`;
// // //                 if (!unifiedMap.has(dateKey)) {
// // //                     unifiedMap.set(dateKey, {
// // //                         id: dateKey,
// // //                         date: record.date,
// // //                         presentLearners: [],
// // //                         absentLearners: [],
// // //                         partialLearners: []
// // //                     });
// // //                 }
// // //                 const entry = unifiedMap.get(dateKey);
// // //                 const status = String(record.status || '').toLowerCase();

// // //                 if (status.includes('present')) entry.presentLearners.push(record.learnerId);
// // //                 else if (status.includes('absent')) entry.absentLearners.push(record.learnerId);
// // //                 else if (status.includes('partial')) entry.partialLearners.push(record.learnerId);
// // //             }
// // //         });

// // //         filteredLogs.forEach(log => {
// // //             const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
// // //             const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);

// // //             const present: string[] = [];
// // //             const absent: string[] = [];
// // //             const partial: string[] = [];

// // //             recordsForLog.forEach(r => {
// // //                 const status = String(r.status || '').toLowerCase();
// // //                 const lKey = r.learnerId || r.authUid || r.userId;
// // //                 if (lKey) {
// // //                     if (status.includes('present')) present.push(lKey);
// // //                     else if (status.includes('absent')) absent.push(lKey);
// // //                     else if (status.includes('partial')) partial.push(lKey);
// // //                 }
// // //             });

// // //             unifiedMap.set(log.id, {
// // //                 id: log.id,
// // //                 date: dateStr,
// // //                 presentLearners: present,
// // //                 absentLearners: absent,
// // //                 partialLearners: partial
// // //             });
// // //         });

// // //         const unifiedArray = Array.from(unifiedMap.values());
// // //         unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// // //         return unifiedArray;
// // //     }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

// // //     // MAP ATTENDANCE STATS PER CANDIDATE GROUP
// // //     const rosterAttendanceMap = useMemo(() => {
// // //         const keyAttendanceMap = new Map<string, number>();
// // //         const totalSessions = dailyRegisters.length;

// // //         const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
// // //             const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
// // //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
// // //             const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
// // //             const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));

// // //             const keys = [
// // //                 e.id,
// // //                 e.userId,
// // //                 e.learnerId,
// // //                 e.authUid,
// // //                 e.idNumber,
// // //                 actualUserId,
// // //                 storeLearner?.id,
// // //                 storeLearner?.learnerId,
// // //                 storeLearner?.authUid,
// // //                 storeLearner?.idNumber,
// // //                 rawUser?.id,
// // //                 rawUser?.authUid,
// // //                 rawUser?.idNumber,
// // //                 rawLearner?.id,
// // //                 rawLearner?.authUid,
// // //                 rawLearner?.idNumber
// // //             ].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');

// // //             return Array.from(new Set(keys.map(k => k.trim().toLowerCase())));
// // //         });

// // //         candidateKeyGroups.forEach(group => {
// // //             group.forEach(k => {
// // //                 keyAttendanceMap.set(k, 0);
// // //             });
// // //         });

// // //         dailyRegisters.forEach(reg => {
// // //             const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase());

// // //             candidateKeyGroups.forEach(group => {
// // //                 const isCandidatePresent = group.some(k => presentList.includes(k));
// // //                 if (isCandidatePresent) {
// // //                     group.forEach(k => {
// // //                         keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1);
// // //                     });
// // //                 }
// // //             });
// // //         });

// // //         const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
// // //         candidateKeyGroups.forEach(group => {
// // //             const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0);
// // //             const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0;
// // //             const stats = { attended: bestAttended, total: totalSessions, pct };

// // //             group.forEach(k => {
// // //                 finalMap.set(k, stats);
// // //             });
// // //         });

// // //         return finalMap;
// // //     }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

// // //     const handleCohortChange = (cohortId: string) => {
// // //         setSelectedCohortId(cohortId);
// // //         syncQueryParams(cohortId, samplePercentage, searchTerm);
// // //     };

// // //     const handleSamplePercentageChange = (pct: number) => {
// // //         setSamplePercentage(pct);
// // //         setSearchTerm('');
// // //         syncQueryParams(selectedCohortId, pct, '');
// // //     };

// // //     const handleSearchChange = (term: string) => {
// // //         setSearchTerm(term);
// // //         syncQueryParams(selectedCohortId, samplePercentage, term);
// // //     };

// // //     const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => {
// // //         setCandidateFlags(prev => {
// // //             const current = prev[candidateId];
// // //             const isCurrentlyFlagged = current?.flagged;
// // //             return {
// // //                 ...prev,
// // //                 [candidateId]: {
// // //                     flagged: !isCurrentlyFlagged,
// // //                     note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : ''
// // //                 }
// // //             };
// // //         });
// // //         toast.info("Candidate spot-check flag status updated.");
// // //     };

// // //     const handleUpdateFlagNote = (candidateId: string, noteText: string) => {
// // //         setCandidateFlags(prev => ({
// // //             ...prev,
// // //             [candidateId]: {
// // //                 flagged: true,
// // //                 note: noteText
// // //             }
// // //         }));
// // //     };

// // //     const handleOpenNotesModal = (learner: SampledLearner) => {
// // //         setNotesModalLearner(learner);
// // //         setLearnerNoteInput(candidateFlags[learner.id]?.note || '');
// // //     };

// // //     const handleSaveLearnerNote = () => {
// // //         if (!notesModalLearner) return;
// // //         handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput);
// // //         toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`);
// // //         setNotesModalLearner(null);
// // //     };

// // //     const handleExportSampleManifest = () => {
// // //         if (sampledLearners.length === 0) {
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'info',
// // //                 title: 'No Sampled Records',
// // //                 message: 'There are currently no sampled records available in the selected cohort view to export.'
// // //             });
// // //             return;
// // //         }

// // //         const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];

// // //         const csvRows = sampledLearners.map(l => {
// // //             const flag = candidateFlags[l.id];

// // //             const rawIdStr = String(l.idNumber || '').trim();
// // //             const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr))
// // //                 ? rawIdStr.padStart(13, '0')
// // //                 : rawIdStr;
// // //             const textFormattedId = `="${paddedId}"`;

// // //             return [
// // //                 `"${l.fullName.replace(/"/g, '""')}"`,
// // //                 textFormattedId,
// // //                 `"${l.status}"`,
// // //                 `"${l.cohortName.replace(/"/g, '""')}"`,
// // //                 `"${l.programmeName.replace(/"/g, '""')}"`,
// // //                 `${l.overallProgress}%`,
// // //                 `${l.attendance.pct}%`,
// // //                 `"${l.attendance.attended}/${l.attendance.total}"`,
// // //                 `"${l.formatives.completed}/${l.formatives.total}"`,
// // //                 `"${l.summatives.completed}/${l.summatives.total}"`,
// // //                 `"${l.practicals.completed}/${l.practicals.total}"`,
// // //                 `"${l.workplaces.completed}/${l.workplaces.total}"`,
// // //                 l.popiaConsent ? 'Signed' : 'Unsigned',
// // //                 flag?.flagged ? 'FLAGGED' : 'CLEAR',
// // //                 `"${(flag?.note || '').replace(/"/g, '""')}"`
// // //             ].join(',');
// // //         });

// // //         const csvContent = [headers.join(','), ...csvRows].join('\n');
// // //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
// // //         const url = URL.createObjectURL(blob);
// // //         const link = document.createElement('a');
// // //         link.href = url;
// // //         link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`);
// // //         document.body.appendChild(link);
// // //         link.click();
// // //         document.body.removeChild(link);
// // //         URL.revokeObjectURL(url);

// // //         toast.success("Sample Manifest exported to CSV.");
// // //     };

// // //     // Master PoE Request Handshake with Firestore Background Worker
// // //     const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
// // //         const targetLearnerId = learner.userId || learner.id;
// // //         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

// // //         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
// // //             toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`);
// // //             return;
// // //         }

// // //         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
// // //             window.open(currentExport.downloadUrl, '_blank');
// // //             return;
// // //         }

// // //         try {
// // //             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);

// // //             const docRef = await addDoc(collection(db, 'poe_export_requests'), {
// // //                 learnerId: targetLearnerId,
// // //                 requestedBy: currentUser?.uid || currentUser?.id || 'auditor',
// // //                 status: 'pending',
// // //                 progress: 0,
// // //                 progressMessage: 'Initializing compliance engine...',
// // //                 createdAt: serverTimestamp()
// // //             });

// // //             setActiveExports(prev => ({
// // //                 ...prev,
// // //                 [learner.id]: {
// // //                     requestId: docRef.id,
// // //                     learnerId: targetLearnerId,
// // //                     progress: 0,
// // //                     progressMessage: 'Initializing compliance engine...',
// // //                     status: 'pending'
// // //                 },
// // //                 [targetLearnerId]: {
// // //                     requestId: docRef.id,
// // //                     learnerId: targetLearnerId,
// // //                     progress: 0,
// // //                     progressMessage: 'Initializing compliance engine...',
// // //                     status: 'pending'
// // //                 }
// // //             }));
// // //         } catch (error: any) {
// // //             console.error('Error requesting PoE export:', error);
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'error',
// // //                 title: 'Export Initialization Failed',
// // //                 message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.`
// // //             });
// // //         }
// // //     };

// // //     // Build Cohort Learner Pool
// // //     const cohortPool = useMemo(() => {
// // //         if (!selectedCohortId) return [];

// // //         const filteredEnrollments = rawEnrollments.filter(e =>
// // //             e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId
// // //         );

// // //         return filteredEnrollments.map((enrol): SampledLearner => {
// // //             const enrolKeys = [
// // //                 enrol.userId,
// // //                 enrol.learnerId,
// // //                 enrol.authUid,
// // //                 enrol.idNumber,
// // //                 enrol.id,
// // //                 enrol.uid
// // //             ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

// // //             const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';

// // //             const matchesLearner = (candidate: any) => {
// // //                 if (!candidate) return false;
// // //                 const candidateKeys = [
// // //                     candidate.id,
// // //                     candidate.learnerId,
// // //                     candidate.idNumber,
// // //                     candidate.authUid,
// // //                     candidate.uid,
// // //                     candidate.userId
// // //                 ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

// // //                 const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase()));
// // //                 const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail;

// // //                 return hasKeyMatch || hasEmailMatch;
// // //             };

// // //             const storeLearner = storeLearners?.find(matchesLearner);
// // //             const rawUser = rawUsers?.find(matchesLearner);
// // //             const rawLearner = rawLearners?.find(matchesLearner);

// // //             const activeCohortId = enrol.cohortId || enrol.cohortRunId;
// // //             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

// // //             let storeProgramme = storeProgrammes?.find((p: any) =>
// // //                 (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) ||
// // //                 (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId)))
// // //             );

// // //             const mappedName =
// // //                 enrol.userName ||
// // //                 enrol.learnerName ||
// // //                 enrol.fullName ||
// // //                 enrol.name ||
// // //                 storeLearner?.fullName ||
// // //                 storeLearner?.name ||
// // //                 rawLearner?.fullName ||
// // //                 rawLearner?.name ||
// // //                 rawUser?.fullName ||
// // //                 rawUser?.name ||
// // //                 'Learner Candidate';

// // //             const rawMappedId =
// // //                 enrol.idNumber ||
// // //                 storeLearner?.idNumber ||
// // //                 rawLearner?.idNumber ||
// // //                 rawUser?.idNumber ||
// // //                 enrol.learnerId ||
// // //                 enrol.userId ||
// // //                 enrol.id ||
// // //                 'N/A';

// // //             const cleanIdStr = String(rawMappedId).trim();
// // //             const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr))
// // //                 ? cleanIdStr.padStart(13, '0')
// // //                 : cleanIdStr;

// // //             const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';

// // //             const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification';
// // //             const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || '';
// // //             const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';

// // //             const progDetails: string[] = [];
// // //             if (progNqf) progDetails.push(`NQF Level ${progNqf}`);
// // //             if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);

// // //             const mappedProgramme = progDetails.length > 0
// // //                 ? `${progTitle} (${progDetails.join(' | ')})`
// // //                 : progTitle;

// // //             const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};

// // //             const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
// // //             const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
// // //             const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';

// // //             let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;

// // //             if (storeProgramme) {
// // //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// // //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// // //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// // //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// // //                     const flat = storeProgramme.modules;
// // //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// // //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// // //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// // //                 }
// // //             }

// // //             let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0;
// // //             let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;

// // //             const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
// // //             const learnerSubs = rawSubmissions.filter(s =>
// // //                 (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
// // //                 (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
// // //                 (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase())
// // //             );

// // //             learnerSubs.forEach(s => {
// // //                 const type = String(s.type || 'formative').toLowerCase();
// // //                 const moduleType = String(s.moduleType || '').toLowerCase();
// // //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// // //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// // //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
// // //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// // //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// // //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// // //                 if (isKnowledge) {
// // //                     if (type.includes('formative') || type.includes('fa')) {
// // //                         totalAssignedFA++;
// // //                         if (isDone) calculatedFA++;
// // //                     } else if (type.includes('summative') || type.includes('sa')) {
// // //                         totalAssignedSA++;
// // //                         if (isDone) calculatedSA++;
// // //                     }
// // //                 } else if (isPractical) {
// // //                     totalAssignedPM++;
// // //                     if (isDone) calculatedPM++;
// // //                 } else if (isWorkplace) {
// // //                     totalAssignedWM++;
// // //                     if (isDone) calculatedWM++;
// // //                 }
// // //             });

// // //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// // //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// // //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// // //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// // //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// // //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// // //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// // //             const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) ||
// // //                 rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) ||
// // //                 rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) ||
// // //                 { attended: 0, total: dailyRegisters.length, pct: 0 };

// // //             const candidateKeys = [
// // //                 actualUserId,
// // //                 enrol.id,
// // //                 enrol.userId,
// // //                 enrol.learnerId,
// // //                 enrol.authUid,
// // //                 enrol.idNumber,
// // //                 enrol.email,
// // //                 mappedId,
// // //                 storeLearner?.id,
// // //                 storeLearner?.uid,
// // //                 storeLearner?.authUid,
// // //                 storeLearner?.idNumber,
// // //                 storeLearner?.email,
// // //                 rawUser?.id,
// // //                 rawUser?.uid,
// // //                 rawUser?.authUid,
// // //                 rawUser?.idNumber,
// // //                 rawUser?.email,
// // //                 rawLearner?.id,
// // //                 rawLearner?.authUid,
// // //                 rawLearner?.idNumber,
// // //                 rawLearner?.email
// // //             ];

// // //             const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
// // //             const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
// // //             const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));

// // //             const allStatuses = [
// // //                 enrol.status,
// // //                 storeLearner?.status,
// // //                 rawLearner?.status,
// // //                 rawUser?.status
// // //             ].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());

// // //             const isCandidateDropped = allStatuses.some(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s));
// // //             const resolvedStatus = isCandidateDropped
// // //                 ? (allStatuses.find(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s)) || 'dropped')
// // //                 : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');

// // //             return {
// // //                 id: enrol.id,
// // //                 userId: actualUserId,
// // //                 fullName: mappedName,
// // //                 idNumber: mappedId,
// // //                 cohortId: activeCohortId,
// // //                 cohortName: mappedCohort,
// // //                 programmeName: mappedProgramme,
// // //                 overallProgress: Math.min(100, dynamicProgress),
// // //                 attendance: attStats,
// // //                 formatives: { completed: calculatedFA, total: ceilingFA },
// // //                 summatives: { completed: calculatedSA, total: ceilingSA },
// // //                 practicals: { completed: calculatedPM, total: ceilingPM },
// // //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// // //                 sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'),
// // //                 popiaConsent: isPopiConsented,
// // //                 hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned),
// // //                 status: resolvedStatus,
// // //                 gender,
// // //                 equityGroup,
// // //                 disabilityStatus,
// // //                 birthDate: demo.birthDate || storeLearner?.birthDate,
// // //                 codeOfConductSigned: isCocSigned,
// // //                 appealsPolicySigned: isAppealsSigned
// // //             };
// // //         });
// // //     }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

// // //     const sampledLearners = useMemo(() => {
// // //         if (cohortPool.length === 0) return [];

// // //         let filtered = cohortPool;
// // //         if (searchTerm.trim()) {
// // //             const q = searchTerm.toLowerCase();
// // //             return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q));
// // //         }

// // //         if (samplePercentage >= 100) return filtered;

// // //         const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
// // //         return [...cohortPool]
// // //             .sort((a, b) => a.id.localeCompare(b.id))
// // //             .slice(0, sampleSize);
// // //     }, [cohortPool, samplePercentage, searchTerm]);

// // //     const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
// // //     const paginatedLearners = useMemo(() => {
// // //         return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // //     }, [sampledLearners, currentPage, itemsPerPage]);

// // //     const cohortFilteredGrievances = useMemo(() => {
// // //         let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');

// // //         if (grievanceFilterStatus !== 'ALL') {
// // //             list = list.filter(g => g.status === grievanceFilterStatus);
// // //         }
// // //         if (grievanceFilterType !== 'ALL') {
// // //             list = list.filter(g => g.type === grievanceFilterType);
// // //         }

// // //         return list;
// // //     }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

// // //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// // //     const paginatedGrievances = useMemo(() => {
// // //         return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // //     }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

// // //     const searchedPolicyLearners = useMemo(() => {
// // //         if (!policySearchTerm.trim()) return cohortPool;
// // //         const q = policySearchTerm.toLowerCase();
// // //         return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q));
// // //     }, [cohortPool, policySearchTerm]);

// // //     const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
// // //     const paginatedPolicyLearners = useMemo(() => {
// // //         return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // //     }, [searchedPolicyLearners, currentPage, itemsPerPage]);

// // //     const cohortMisDemographics = useMemo(() => {
// // //         const stats = {
// // //             total: cohortPool.length,
// // //             sampleTotal: sampledLearners.length,
// // //             equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 },
// // //             gender: { Female: 0, Male: 0, Other: 0 },
// // //             disability: { Yes: 0, No: 0 },
// // //             youth: { Under35: 0, Adult35Plus: 0 },
// // //             attendanceBands: { high: 0, mid: 0, low: 0 }
// // //         };

// // //         const currentYear = 2026;

// // //         cohortPool.forEach(l => {
// // //             const eq = String(l.equityGroup || '').trim().toLowerCase();
// // //             if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') {
// // //                 stats.equity.African++;
// // //             } else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') {
// // //                 stats.equity.Coloured++;
// // //             } else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') {
// // //                 stats.equity.Indian++;
// // //             } else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') {
// // //                 stats.equity.White++;
// // //             } else {
// // //                 stats.equity.African++;
// // //             }

// // //             const g = String(l.gender || '').trim().toLowerCase();
// // //             if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') {
// // //                 stats.gender.Female++;
// // //             } else if (g.startsWith('m') || g.includes('male') || g === 'man') {
// // //                 stats.gender.Male++;
// // //             } else if (l.idNumber && l.idNumber.length >= 7) {
// // //                 const genderDigit = parseInt(l.idNumber.charAt(6), 10);
// // //                 if (!isNaN(genderDigit)) {
// // //                     if (genderDigit >= 5) {
// // //                         stats.gender.Male++;
// // //                     } else {
// // //                         stats.gender.Female++;
// // //                     }
// // //                 } else {
// // //                     stats.gender.Male++;
// // //                 }
// // //             } else {
// // //                 stats.gender.Male++;
// // //             }

// // //             const d = String(l.disabilityStatus || '').trim().toLowerCase();
// // //             if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') {
// // //                 stats.disability.Yes++;
// // //             } else {
// // //                 stats.disability.No++;
// // //             }

// // //             let birthYear = 0;
// // //             if (l.idNumber && l.idNumber.length >= 6) {
// // //                 const yy = parseInt(l.idNumber.substring(0, 2), 10);
// // //                 birthYear = yy > 30 ? 1900 + yy : 2000 + yy;
// // //             }
// // //             if (birthYear > 0 && (currentYear - birthYear) <= 35) {
// // //                 stats.youth.Under35++;
// // //             } else {
// // //                 stats.youth.Adult35Plus++;
// // //             }

// // //             const attPct = l.attendance?.pct || 0;
// // //             if (attPct >= 75) stats.attendanceBands.high++;
// // //             else if (attPct >= 40) stats.attendanceBands.mid++;
// // //             else stats.attendanceBands.low++;
// // //         });

// // //         return stats;
// // //     }, [cohortPool, sampledLearners]);

// // //     const inspectedLearnerSubmissions = useMemo(() => {
// // //         if (!inspectedLearner) return [];
// // //         const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();

// // //         return rawSubmissions.filter(s =>
// // //             (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) ||
// // //             (s.authUid && String(s.authUid).toLowerCase() === targetUserId) ||
// // //             (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase())
// // //         );
// // //     }, [inspectedLearner, rawSubmissions]);

// // //     const activeCohortData = useMemo(() => {
// // //         return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null;
// // //     }, [allowedCohortsForAuditor, selectedCohortId]);

// // //     const handleSaveEndorsement = async () => {
// // //         if (!auditNotes.trim()) {
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'warning',
// // //                 title: 'Missing Audit Notes',
// // //                 message: 'Please enter auditor verification findings and notes before recording official sign-off.'
// // //             });
// // //             return;
// // //         }

// // //         setIsSavingEndorsement(true);
// // //         try {
// // //             await addDoc(collection(db, 'cohort_audit_endorsements'), {
// // //                 cohortId: selectedCohortId,
// // //                 cohortName: activeCohortData?.name || 'Cohort',
// // //                 auditorUid: currentUser?.uid || 'external_auditor',
// // //                 auditorName: currentUser?.fullName || 'External Quality Assurer',
// // //                 organization: currentUser?.organization || 'QCTO / SETA',
// // //                 sampleSizePercentage: samplePercentage,
// // //                 sampledRecordsCount: sampledLearners.length,
// // //                 totalCohortCount: cohortPool.length,
// // //                 outcome: auditOutcome,
// // //                 notes: auditNotes,
// // //                 flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length,
// // //                 signedAt: serverTimestamp(),
// // //                 createdAt: new Date().toISOString()
// // //             });

// // //             toast.success("Audit verification & endorsement recorded successfully.");
// // //             setShowEndorseModal(false);
// // //             setAuditNotes('');
// // //         } catch (err: any) {
// // //             console.error("Failed to save endorsement:", err);
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'error',
// // //                 title: 'Sign-Off Failed',
// // //                 message: err.message || 'Failed to record official audit verification sign-off record.'
// // //             });
// // //         } finally {
// // //             setIsSavingEndorsement(false);
// // //         }
// // //     };

// // //     const handleSaveGrievanceResolution = async () => {
// // //         if (!selectedGrievance) return;
// // //         setIsSavingGrievance(true);
// // //         try {
// // //             await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), {
// // //                 status: grievanceStatusInput,
// // //                 resolutionNotes: grievanceResolutionNotes,
// // //                 resolvedAt: serverTimestamp(),
// // //                 resolvedBy: currentUser?.uid || 'external_auditor'
// // //             });

// // //             toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`);
// // //             setSelectedGrievance(null);
// // //             setGrievanceResolutionNotes('');
// // //         } catch (err: any) {
// // //             console.error("Failed to update grievance:", err);
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'error',
// // //                 title: 'Resolution Update Failed',
// // //                 message: err.message || 'Failed to save grievance resolution details.'
// // //             });
// // //         } finally {
// // //             setIsSavingGrievance(false);
// // //         }
// // //     };

// // //     const handleExportNLRD = async () => {
// // //         if (nlrdProgress.status !== 'idle') return;
// // //         setNlrdProgress({ status: 'generating', percent: 15 });
// // //         toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

// // //         const timer = setInterval(() => {
// // //             setNlrdProgress(prev => {
// // //                 if (prev.status !== 'generating') return prev;
// // //                 if (prev.percent >= 80) return prev;
// // //                 return { ...prev, percent: prev.percent + 5 };
// // //             });
// // //         }, 300);

// // //         try {
// // //             const functions = getFunctions();
// // //             const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
// // //             const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

// // //             clearInterval(timer);

// // //             if (response.data?.downloadUrl) {
// // //                 setNlrdProgress({ status: 'downloading', percent: 80 });
// // //                 const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

// // //                 await downloadFileWithProgress(
// // //                     response.data.downloadUrl,
// // //                     filename,
// // //                     (bytePercent) => {
// // //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// // //                         setNlrdProgress({ status: 'downloading', percent: scaled });
// // //                     }
// // //                 );

// // //                 setLastNlrdExport({
// // //                     downloadUrl: response.data.downloadUrl,
// // //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// // //                     totalRecords: response.data.totalRecords
// // //                 });

// // //                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords || ''} records.`);
// // //             }
// // //         } catch (error: any) {
// // //             clearInterval(timer);
// // //             console.error('NLRD Export Failed:', error);
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'error',
// // //                 title: 'NLRD Export Failed',
// // //                 message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
// // //             });
// // //         } finally {
// // //             setNlrdProgress({ status: 'idle', percent: 0 });
// // //         }
// // //     };

// // //     const handleExportThroughputMatrix = async () => {
// // //         if (matrixProgress.status !== 'idle') return;
// // //         setMatrixProgress({ status: 'generating', percent: 15 });
// // //         toast.info('Compiling Learner Throughput & Compliance Matrix...');

// // //         const timer = setInterval(() => {
// // //             setMatrixProgress(prev => {
// // //                 if (prev.status !== 'generating') return prev;
// // //                 if (prev.percent >= 80) return prev;
// // //                 return { ...prev, percent: prev.percent + 5 };
// // //             });
// // //         }, 300);

// // //         try {
// // //             const functions = getFunctions();
// // //             const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
// // //             const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

// // //             clearInterval(timer);

// // //             if (response.data?.downloadUrl) {
// // //                 setMatrixProgress({ status: 'downloading', percent: 80 });
// // //                 const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

// // //                 await downloadFileWithProgress(
// // //                     response.data.downloadUrl,
// // //                     filename,
// // //                     (bytePercent) => {
// // //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// // //                         setMatrixProgress({ status: 'downloading', percent: scaled });
// // //                     }
// // //                 );

// // //                 setLastMatrixExport({
// // //                     downloadUrl: response.data.downloadUrl,
// // //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// // //                     totalRecords: response.data.totalLearners
// // //                 });

// // //                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners || ''} learners!`);
// // //             }
// // //         } catch (error: any) {
// // //             clearInterval(timer);
// // //             console.error('Throughput Report Failed:', error);
// // //             setStatusModal({
// // //                 isOpen: true,
// // //                 type: 'error',
// // //                 title: 'Report Generation Failed',
// // //                 message: error.message || 'Server error encountered while building the throughput matrix report.'
// // //             });
// // //         } finally {
// // //             setMatrixProgress({ status: 'idle', percent: 0 });
// // //         }
// // //     };

// // //     if (isLoading) return <Loader message="Initializing Auditor Inspection Portal..." />;

// // //     // Helper for tab thumb positioning calculation for 4 tabs
// // //     const getTabThumbOffset = (tab: TabOption) => {
// // //         switch (tab) {
// // //             case 'mis_overview': return 'translateX(100%)';
// // //             case 'grievances': return 'translateX(200%)';
// // //             case 'policies': return 'translateX(300%)';
// // //             case 'poe_vault':
// // //             default: return 'translateX(0%)';
// // //         }
// // //     };

// // //     return (
// // //         <div className="fd-root fd-root--fixed">

// // //             {/* HUMAN BOT VERIFICATION CHECK */}
// // //             {!isHumanVerified && (
// // //                 <HumanVerificationGate onVerify={handleHumanVerified} />
// // //             )}

// // //             {/* INTRO LOADER OVERLAY */}
// // //             {isHumanVerified && !revealed && (
// // //                 <IntroLoader
// // //                     phase={phase}
// // //                     minMs={minMs}
// // //                     userName={currentUser?.fullName || 'Auditor'}
// // //                     logoSrc={mLabLogo}
// // //                     learnerCount={cohortPool.length}
// // //                     onSkip={skip}
// // //                 />
// // //             )}

// // //             {/* POPIA LEGAL DISCLAIMER MODAL */}
// // //             {isHumanVerified && introDone && !isDisclaimerAgreed && (
// // //                 <DisclaimerGate onAgree={handleDisclaimerAgreed} />
// // //             )}

// // //             {revealed && (<>
// // //                 {/* HERO HEADER */}
// // //                 <header className="fd-hero">
// // //                     <div>
// // //                         <div className="fd-hero-brand">
// // //                             <img src={mLabLogo} alt="mLab Logo" height={28} />
// // //                             <span className="fd-hero-divider" />
// // //                             <div className="fd-eyebrow">
// // //                                 <span className="fd-live-dot" /> 
// // //                                 QCTO / SETA Verification Workspace
// // //                             </div>
// // //                         </div>
// // //                         <h1 className="fd-title">Auditor Inspection Portal</h1>
// // //                         <p className="fd-subtitle">Real-time verification &amp; compliance monitoring for external quality assurers.</p>
// // //                     </div>
// // //                     <div className="fd-hero-actions">
// // //                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.28)', borderRadius: '99px', padding: '0.4rem 0.85rem' }}>
// // //                             <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
// // //                             <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8' }}>Read-Only Inspector Mode</span>
// // //                         </div>
// // //                         <button onClick={() => setShowEndorseModal(true)} className="fd-btn fd-btn--primary">
// // //                             <UserCheck size={15} /> Sign Off Cohort Audit
// // //                         </button>
// // //                     </div>
// // //                 </header>

// // //                 {/* CONTROLS BAR: tabs + scope selector */}
// // //                 <div className="fd-controls">
// // //                     {/* FIXED 4-TAB SINGLE ROW NAVIGATION */}
// // //                     <div className="fd-tabs" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '100%', maxWidth: '680px' }} data-active={activeTab} role="tablist">
// // //                         <span className="fd-tab-thumb" style={{ width: 'calc(25% - 5px)', transform: getTabThumbOffset(activeTab) }} />
// // //                         {[
// // //                             { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // //                             { id: 'mis_overview', label: 'MIS Overview', icon: BarChart3 },
// // //                             { id: 'grievances', label: 'Appeals', icon: Scale },
// // //                             { id: 'policies', label: 'Policy Compliance', icon: FileSignature }
// // //                         ].map(tab => (
// // //                             <button
// // //                                 key={tab.id}
// // //                                 role="tab"
// // //                                 aria-selected={activeTab === tab.id}
// // //                                 className={`fd-tab ${activeTab === tab.id ? 'fd-tab--active' : ''}`}
// // //                                 onClick={() => setActiveTab(tab.id as TabOption)}
// // //                                 style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem' }}
// // //                             >
// // //                                 <tab.icon size={15} /> {tab.label}
// // //                             </button>
// // //                         ))}
// // //                     </div>

// // //                     <div className="fd-filters">
// // //                         <div className="fd-filter-label"><Filter size={15} /> Scope</div>
// // //                         <div className="fd-select-wrap">
// // //                             <select
// // //                                 className="fd-select fd-select--active"
// // //                                 value={selectedCohortId}
// // //                                 onChange={(e) => handleCohortChange(e.target.value)}
// // //                                 style={{ minWidth: '240px' }}
// // //                             >
// // //                                 {allowedCohortsForAuditor.length === 0 ? (
// // //                                     <option value="">No Assigned Cohorts Found</option>
// // //                                 ) : (
// // //                                     allowedCohortsForAuditor.map((c: any) => (
// // //                                         <option key={c.id} value={c.id}>{c.name}</option>
// // //                                     ))
// // //                                 )}
// // //                             </select>
// // //                             <ChevronDown size={14} />
// // //                         </div>
// // //                     </div>
// // //                 </div>

// // //                 {/* MAIN SCROLLABLE REGION */}
// // //                 <div className="fd-main fd-scroll">

// // //                     {/* TARGET QUALIFICATION CARD - SLEEK FLEX ROW BANNER */}
// // //                     {activeProgrammeData && (
// // //                         <div className="fd-card" style={{ flexShrink: 0, padding: '1rem 1.25rem' }}>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
// // //                                 <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'color-mix(in srgb, var(--fd-blue) 12%, #fff)', color: 'var(--fd-blue)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
// // //                                     <Award size={24} />
// // //                                 </div>
// // //                                 <div style={{ flex: 1, minWidth: '260px' }}>
// // //                                     <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--fd-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
// // //                                         Active Audit Target Qualification
// // //                                     </div>
// // //                                     <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--fd-blue)', letterSpacing: '-0.01em' }}>
// // //                                         {activeProgrammeData.name}
// // //                                     </h2>
// // //                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
// // //                                         {activeProgrammeData.saqaId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="var(--fd-blue)" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
// // //                                         {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="var(--fd-blue)" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
// // //                                         {activeProgrammeData.credits > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="var(--fd-blue)" /> Total Credits: {activeProgrammeData.credits}</span>}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* SAMPLING ENGINE & SEARCH TOOLBAR (FOR POE VAULT) */}
// // //                     {activeTab === 'poe_vault' && (
// // //                         <div className="fd-card" style={{ flexShrink: 0, padding: '0.85rem 1.25rem' }}>
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                         <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--fd-muted)', letterSpacing: '0.05em' }}>
// // //                                             Sampling Ratio:
// // //                                         </span>
// // //                                         <div style={{ display: 'inline-flex', border: '1.5px solid #d5dde6', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
// // //                                             {[10, 20, 50, 100].map((pct) => (
// // //                                                 <button
// // //                                                     key={pct}
// // //                                                     onClick={() => handleSamplePercentageChange(pct)}
// // //                                                     style={{
// // //                                                         padding: '0.4rem 0.8rem', border: 'none',
// // //                                                         background: samplePercentage === pct && !searchTerm ? 'var(--fd-blue)' : 'transparent',
// // //                                                         color: samplePercentage === pct && !searchTerm ? '#ffffff' : 'var(--fd-ink)',
// // //                                                         fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderRight: '1px solid #d5dde6', transition: 'all 0.2s'
// // //                                                     }}
// // //                                                 >
// // //                                                     {pct}% {pct === 10 ? '(QCTO)' : ''}
// // //                                                 </button>
// // //                                             ))}
// // //                                         </div>
// // //                                     </div>

// // //                                     {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && (
// // //                                         <span className="fd-pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>
// // //                                             🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged
// // //                                         </span>
// // //                                     )}
// // //                                 </div>

// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
// // //                                     <button onClick={handleExportSampleManifest} className="fd-btn fd-btn--ghost fd-btn--sm">
// // //                                         <Printer size={14} /> Export Manifest
// // //                                     </button>

// // //                                     <div className="fd-search-wrap" style={{ width: '220px' }}>
// // //                                         <Search size={14} />
// // //                                         <input
// // //                                             className="fd-search"
// // //                                             type="text"
// // //                                             placeholder="Search candidate or ID..."
// // //                                             value={searchTerm}
// // //                                             onChange={(e) => handleSearchChange(e.target.value)}
// // //                                             style={{ padding: '0.45rem 0.8rem 0.45rem 2.2rem', fontSize: '0.78rem' }}
// // //                                         />
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* KPI CARDS ROW */}
// // //                     {activeTab === 'poe_vault' && (
// // //                         <div className="fd-kpis">
// // //                             <KpiCard
// // //                                 icon={<Users size={18} />}
// // //                                 label="Sample Size Loaded"
// // //                                 value={sampledLearners.length}
// // //                                 suffix={` / ${cohortPool.length}`}
// // //                                 color={MIDNIGHT}
// // //                                 delay={0.05}
// // //                             />
// // //                             <KpiCard
// // //                                 icon={<Activity size={18} />}
// // //                                 label="Average Progress"
// // //                                 value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0}
// // //                                 suffix="%"
// // //                                 color="#16a34a"
// // //                                 delay={0.10}
// // //                             />
// // //                             <KpiCard
// // //                                 icon={<Clock size={18} />}
// // //                                 label="Average Attendance"
// // //                                 value={sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0}
// // //                                 suffix="%"
// // //                                 color="#0284c7"
// // //                                 delay={0.15}
// // //                             />
// // //                             <KpiCard
// // //                                 icon={<ShieldCheck size={18} />}
// // //                                 label="POPIA Consent"
// // //                                 value={sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0}
// // //                                 suffix="%"
// // //                                 color="#8b5cf6"
// // //                                 delay={0.20}
// // //                             />
// // //                             <KpiCard
// // //                                 icon={<Award size={18} />}
// // //                                 label="SoR Readiness"
// // //                                 value={sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length}
// // //                                 color="#f59e0b"
// // //                                 delay={0.25}
// // //                             />
// // //                         </div>
// // //                     )}

// // //                     {/* TAB 1: LEARNER POE VAULT */}
// // //                     {activeTab === 'poe_vault' && (
// // //                         <div className="fd-table-card">
// // //                             <div className="fd-toolbar">
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--fd-blue)' }}>
// // //                                     <CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault
// // //                                 </div>
// // //                                 <span style={{ fontSize: '0.75rem', color: 'var(--fd-muted)', fontWeight: 700 }}>
// // //                                     Page {currentPage} of {totalPages}
// // //                                 </span>
// // //                             </div>

// // //                             <div className="fd-table-scroll fd-scroll">
// // //                                 <table className="fd-table" style={{ minWidth: '1100px' }}>
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Learner Details</th>
// // //                                             <th>Attendance</th>
// // //                                             <th>Curriculum Evidence</th>
// // //                                             <th>Progress</th>
// // //                                             <th>Governance</th>
// // //                                             <th>Flag Status</th>
// // //                                             <th style={{ textAlign: 'right' }}>Inspection Action</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {paginatedLearners.map((learner, i) => {
// // //                                             const flagInfo = candidateFlags[learner.id];
// // //                                             const isFlagged = flagInfo?.flagged;
// // //                                             const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
// // //                                             const exportState = activeExports[learner.id] || activeExports[learner.userId];
// // //                                             const hasCustomNote = !!flagInfo?.note;

// // //                                             const attPct = learner.attendance?.pct || 0;
// // //                                             const attAttended = learner.attendance?.attended || 0;
// // //                                             const attTotal = learner.attendance?.total || 0;

// // //                                             return (
// // //                                                 <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'transparent'), animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// // //                                                     <td>
// // //                                                         <div className="fd-person">
// // //                                                             <div className="fd-avatar" style={{ background: isDropped ? '#fecaca' : undefined, color: isDropped ? '#b91c1c' : undefined }}>
// // //                                                                 {learner.fullName[0] || 'L'}
// // //                                                             </div>
// // //                                                             <div>
// // //                                                                 <div className="fd-name" style={{ color: isDropped ? '#b91c1c' : undefined }}>{learner.fullName}</div>
// // //                                                                 <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {learner.idNumber}</div>
// // //                                                                 {isDropped && (
// // //                                                                     <span className="fd-pill fd-pill--dropped" style={{ marginTop: '2px', fontSize: '0.62rem' }}>
// // //                                                                         <UserX size={10} /> {learner.status}
// // //                                                                     </span>
// // //                                                                 )}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     </td>

// // //                                                     <td>
// // //                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// // //                                                             <span className="fd-pill" style={{
// // //                                                                 background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2',
// // //                                                                 color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626'
// // //                                                             }}>
// // //                                                                 <Clock size={11} /> {attPct}%
// // //                                                             </span>
// // //                                                             <span style={{ fontSize: '0.7rem', color: 'var(--fd-muted)', fontWeight: 600 }}>
// // //                                                                 {attAttended} / {attTotal} Sessions
// // //                                                             </span>
// // //                                                         </div>
// // //                                                     </td>

// // //                                                     <td style={{ fontSize: '0.78rem' }}>
// // //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}>
// // //                                                             <strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}
// // //                                                         </div>
// // //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600, marginBottom: '2px' }}>
// // //                                                             <strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs
// // //                                                         </div>
// // //                                                         <div style={{ color: 'var(--fd-ink)', fontWeight: 600 }}>
// // //                                                             <strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks
// // //                                                         </div>
// // //                                                     </td>

// // //                                                     <td>
// // //                                                         <div className="fd-score">
// // //                                                             <div className="fd-score-bar" style={{ width: '70px', background: isDropped ? '#fca5a5' : undefined }}>
// // //                                                                 <div className="fd-score-fill" style={{ width: `${learner.overallProgress}%`, background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// // //                                                             </div>
// // //                                                             <span className="fd-score-num" style={{ color: isDropped ? '#991b1b' : undefined }}>{learner.overallProgress}%</span>
// // //                                                         </div>
// // //                                                     </td>

// // //                                                     <td>
// // //                                                         {learner.popiaConsent ? (
// // //                                                             <span className="fd-pill fd-pill--passed">✓ Policy Signed</span>
// // //                                                         ) : (
// // //                                                             <span className="fd-pill fd-pill--dropped">Unsigned</span>
// // //                                                         )}
// // //                                                     </td>

// // //                                                     <td>
// // //                                                         {isFlagged ? (
// // //                                                             <span
// // //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// // //                                                                 className="fd-pill fd-pill--dropped"
// // //                                                                 style={{ cursor: 'pointer' }}
// // //                                                                 title={flagInfo.note || 'Click to clear flag'}
// // //                                                             >
// // //                                                                 <Flag size={11} fill="currentColor" /> Flagged
// // //                                                             </span>
// // //                                                         ) : (
// // //                                                             <button
// // //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// // //                                                                 style={{ background: 'none', border: 'none', color: 'var(--fd-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// // //                                                             >
// // //                                                                 <Flag size={12} /> Flag Item
// // //                                                             </button>
// // //                                                         )}
// // //                                                     </td>

// // //                                                     <td style={{ textAlign: 'right' }}>
// // //                                                         <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
// // //                                                             <button
// // //                                                                 onClick={() => handleOpenNotesModal(learner)}
// // //                                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// // //                                                                 style={{ background: hasCustomNote ? '#fffbeb' : undefined, color: hasCustomNote ? '#b45309' : undefined, borderColor: hasCustomNote ? '#fde68a' : undefined }}
// // //                                                                 title={hasCustomNote ? flagInfo.note : 'Leave auditor note'}
// // //                                                             >
// // //                                                                 <MessageSquare size={12} /> {hasCustomNote ? 'Notes' : 'Note'}
// // //                                                             </button>

// // //                                                             <button
// // //                                                                 onClick={() => navigate(`/sor/${learner.userId || learner.id}`)}
// // //                                                                 className="fd-btn fd-btn--ghost fd-btn--sm"
// // //                                                             >
// // //                                                                 <FileText size={12} /> SoR
// // //                                                             </button>

// // //                                                             {(() => {
// // //                                                                 if (exportState?.status === 'pending' || exportState?.status === 'processing') {
// // //                                                                     return (
// // //                                                                         <button disabled className="fd-btn fd-btn--ghost fd-btn--sm" style={{ background: '#fef3c7', color: '#92400e' }}>
// // //                                                                             <Loader2 size={12} className="animate-spin" /> {exportState.progress}%
// // //                                                                         </button>
// // //                                                                     );
// // //                                                                 }
// // //                                                                 if (exportState?.status === 'completed' && exportState?.downloadUrl) {
// // //                                                                     return (
// // //                                                                         <div style={{ display: 'inline-flex', gap: '4px' }}>
// // //                                                                             <button onClick={() => window.open(exportState.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm">
// // //                                                                                 <Download size={12} /> Get PoE
// // //                                                                             </button>
// // //                                                                             <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" title="Regenerate">
// // //                                                                                 <RefreshCw size={12} />
// // //                                                                             </button>
// // //                                                                         </div>
// // //                                                                     );
// // //                                                                 }
// // //                                                                 if (exportState?.status === 'error') {
// // //                                                                     return (
// // //                                                                         <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ color: '#dc2626' }}>
// // //                                                                             <AlertCircle size={12} /> Retry
// // //                                                                         </button>
// // //                                                                     );
// // //                                                                 }
// // //                                                                 return (
// // //                                                                     <button onClick={() => handleGeneratePoE(learner)} className="fd-btn fd-btn--ghost fd-btn--sm">
// // //                                                                         <FileArchive size={12} /> Compile
// // //                                                                     </button>
// // //                                                                 );
// // //                                                             })()}

// // //                                                             <button onClick={() => setInspectedLearner(learner)} className="fd-btn fd-btn--primary fd-btn--sm">
// // //                                                                 <Eye size={12} /> Inspect
// // //                                                             </button>
// // //                                                         </div>
// // //                                                     </td>
// // //                                                 </tr>
// // //                                             );
// // //                                         })}

// // //                                         {sampledLearners.length === 0 && (
// // //                                             <tr>
// // //                                                 <td colSpan={7} className="fd-empty">
// // //                                                     <FileCheck size={36} color="var(--fd-line)" style={{ margin: '0 auto 0.5rem' }} />
// // //                                                     <h4 style={{ margin: '0 0 4px', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4>
// // //                                                     <p style={{ margin: 0, fontSize: '0.8rem' }}>No candidate records match this cohort scope or search filter.</p>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         )}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>

// // //                             <div className="fd-table-foot">
// // //                                 <div>Showing {sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sampledLearners.length)} of {sampledLearners.length} sampled records</div>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                         <span>Rows:</span>
// // //                                         <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="fd-select" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
// // //                                             <option value={5}>5</option>
// // //                                             <option value={10}>10</option>
// // //                                             <option value={15}>15</option>
// // //                                             <option value={25}>25</option>
// // //                                             <option value={50}>50</option>
// // //                                         </select>
// // //                                     </div>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                         <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button>
// // //                                         <span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span>
// // //                                         <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* TAB 2: MIS OVERVIEW & DEMOGRAPHICS */}
// // //                     {activeTab === 'mis_overview' && (
// // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
// // //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
// // //                                 <div className="fd-card">
// // //                                     <div className="fd-card-head"><h3 className="fd-card-title">Equity Group Distribution</h3></div>
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="fd-card">
// // //                                     <div className="fd-card-head"><h3 className="fd-card-title">Gender &amp; Disability Metrics</h3></div>
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="fd-card">
// // //                                     <div className="fd-card-head"><h3 className="fd-card-title">Attendance Health Bands</h3></div>
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}>
// // //                                             <span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong>
// // //                                         </div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--fd-line)', paddingBottom: '6px', color: 'var(--fd-ink)' }}>
// // //                                             <span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong>
// // //                                         </div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}>
// // //                                             <span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong>
// // //                                         </div>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             {/* REPORT EXPORTERS */}
// // //                             <div className="fd-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // //                                 <div className="fd-card-head" style={{ marginBottom: 0 }}>
// // //                                     <h3 className="fd-card-title">Regulatory Report Exporters</h3>
// // //                                 </div>

// // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
// // //                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
// // //                                         <div>
// // //                                             <strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                 <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}><FileText size={16} color="#0284c7" /></div>
// // //                                                 SAQA NLRD Pipe-Delimited Batch
// // //                                             </strong>
// // //                                             <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>
// // //                                                 Generates 28-field statutory NLRD text/CSV file for SETA submission.
// // //                                             </p>
// // //                                         </div>
// // //                                         <div>
// // //                                             {lastNlrdExport ? (
// // //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // //                                                     <button onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#16a34a', color: 'white' }}>
// // //                                                         <Download size={14} /> Download Batch ({lastNlrdExport.generatedAt})
// // //                                                     </button>
// // //                                                     <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function">
// // //                                                         <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} />
// // //                                                     </button>
// // //                                                 </div>
// // //                                             ) : (
// // //                                                 <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--primary" style={{ width: '100%' }}>
// // //                                                     {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
// // //                                                     {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
// // //                                                     {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
// // //                                                     {nlrdProgress.status === 'idle' && 'Generate NLRD Report'}
// // //                                                 </button>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>

// // //                                     <div style={{ border: '1px solid var(--fd-line)', padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
// // //                                         <div>
// // //                                             <strong style={{ fontSize: '0.9rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                 <div style={{ background: '#dcfce7', padding: '6px', borderRadius: '8px' }}><BarChart3 size={16} color="#16a34a" /></div>
// // //                                                 Learner Throughput Matrix (CSV)
// // //                                             </strong>
// // //                                             <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--fd-muted)', lineHeight: 1.5 }}>
// // //                                                 Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.
// // //                                             </p>
// // //                                         </div>
// // //                                         <div>
// // //                                             {lastMatrixExport ? (
// // //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // //                                                     <button onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')} className="fd-btn" style={{ flex: 1, background: '#0284c7', color: 'white' }}>
// // //                                                         <Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})
// // //                                                     </button>
// // //                                                     <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" title="Re-run Cloud Function">
// // //                                                         <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} />
// // //                                                     </button>
// // //                                                 </div>
// // //                                             ) : (
// // //                                                 <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" style={{ width: '100%' }}>
// // //                                                     {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
// // //                                                     {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
// // //                                                     {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
// // //                                                     {matrixProgress.status === 'idle' && 'Generate Throughput Ratio'}
// // //                                                 </button>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* TAB 3: APPEALS & GRIEVANCES */}
// // //                     {activeTab === 'grievances' && (
// // //                         <div className="fd-table-card">
// // //                             <div className="fd-toolbar">
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                     <Filter size={14} color="var(--fd-muted)" />
// // //                                     <div className="fd-select-wrap">
// // //                                         <select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="fd-select fd-select--active">
// // //                                             <option value="ALL">All Statuses</option>
// // //                                             <option value="open">Open</option>
// // //                                             <option value="under_review">Under Review</option>
// // //                                             <option value="resolved">Resolved</option>
// // //                                         </select>
// // //                                         <ChevronDown size={14} />
// // //                                     </div>
// // //                                     <div className="fd-select-wrap">
// // //                                         <select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="fd-select fd-select--active">
// // //                                             <option value="ALL">All Types</option>
// // //                                             <option value="appeal">Appeals Only</option>
// // //                                             <option value="complaint">Complaints Only</option>
// // //                                         </select>
// // //                                         <ChevronDown size={14} />
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="fd-table-scroll fd-scroll">
// // //                                 <table className="fd-table">
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Ref ID</th>
// // //                                             <th>Learner</th>
// // //                                             <th>Type</th>
// // //                                             <th>Date Logged</th>
// // //                                             <th>Description</th>
// // //                                             <th>Status</th>
// // //                                             <th style={{ textAlign: 'right' }}>Resolution Action</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {paginatedGrievances.map((g, i) => (
// // //                                             <tr key={g.docId} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// // //                                                 <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--fd-muted)' }}>{g.id}</td>
// // //                                                 <td><div className="fd-name">{g.learnerName}</div></td>
// // //                                                 <td><span className="fd-pill" style={{ background: 'color-mix(in srgb, var(--fd-blue) 6%, #fff)', color: 'var(--fd-blue)', textTransform: 'uppercase' }}>{g.type}</span></td>
// // //                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-muted)' }}>{g.dateLogged}</td>
// // //                                                 <td style={{ fontSize: '0.8rem', color: 'var(--fd-ink)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // //                                                 <td>
// // //                                                     {g.status === 'open' && <span className="fd-pill" style={{ color: '#dc2626', background: '#fef2f2' }}>OPEN</span>}
// // //                                                     {g.status === 'under_review' && <span className="fd-pill" style={{ color: '#92400e', background: '#fef3c7' }}>UNDER REVIEW</span>}
// // //                                                     {g.status === 'resolved' && <span className="fd-pill" style={{ color: '#16a34a', background: '#dcfce7' }}>RESOLVED</span>}
// // //                                                 </td>
// // //                                                 <td style={{ textAlign: 'right' }}>
// // //                                                     <button
// // //                                                         onClick={() => {
// // //                                                             setSelectedGrievance(g);
// // //                                                             setGrievanceStatusInput(g.status);
// // //                                                             setGrievanceResolutionNotes(g.resolutionNotes || '');
// // //                                                         }}
// // //                                                         className="fd-btn fd-btn--ghost fd-btn--sm"
// // //                                                     >
// // //                                                         <Eye size={12} /> Inspect / Resolve
// // //                                                     </button>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         ))}
// // //                                         {paginatedGrievances.length === 0 && (
// // //                                             <tr>
// // //                                                 <td colSpan={7} className="fd-empty">
// // //                                                     No grievances or appeals recorded for this cohort scope.
// // //                                                 </td>
// // //                                             </tr>
// // //                                         )}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>

// // //                             <div className="fd-table-foot">
// // //                                 <span>Showing {cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)} of {cohortFilteredGrievances.length} grievances</span>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
// // //                                         <ChevronLeft size={14} /> Prev
// // //                                     </button>
// // //                                     <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesGrievances}</span>
// // //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances}>
// // //                                         Next <ChevronRight size={14} />
// // //                                     </button>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* TAB 4: LEARNER POLICY COMPLIANCE */}
// // //                     {activeTab === 'policies' && (
// // //                         <div className="fd-table-card">
// // //                             <div className="fd-toolbar">
// // //                                 <div className="fd-search-wrap">
// // //                                     <Search size={16} />
// // //                                     <input
// // //                                         type="text"
// // //                                         className="fd-search"
// // //                                         placeholder="Search learner policy status..."
// // //                                         value={policySearchTerm}
// // //                                         onChange={(e) => setPolicySearchTerm(e.target.value)}
// // //                                     />
// // //                                 </div>
// // //                             </div>

// // //                             <div className="fd-table-scroll fd-scroll">
// // //                                 <table className="fd-table">
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Learner Details</th>
// // //                                             <th>Cohort Scope</th>
// // //                                             <th>Code of Conduct</th>
// // //                                             <th>Appeals Policy</th>
// // //                                             <th>PoPIA Consent</th>
// // //                                             <th style={{ textAlign: 'right' }}>Compliance State</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {paginatedPolicyLearners.map((l, i) => (
// // //                                             <tr key={l.id} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
// // //                                                 <td>
// // //                                                     <div className="fd-person">
// // //                                                         <div className="fd-avatar">{l.fullName[0] || 'L'}</div>
// // //                                                         <div>
// // //                                                             <div className="fd-name">{l.fullName}</div>
// // //                                                             <div className="fd-email" style={{ fontFamily: 'monospace' }}>ID: {l.idNumber}</div>
// // //                                                         </div>
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>{l.cohortName}</td>
// // //                                                 <td>
// // //                                                     {l.codeOfConductSigned ? (
// // //                                                         <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span>
// // //                                                     ) : (
// // //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {l.appealsPolicySigned ? (
// // //                                                         <span className="fd-pill" style={{ background: '#dcfce7', color: '#15803d' }}>✓ SIGNED</span>
// // //                                                     ) : (
// // //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>UNSIGNED</span>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {l.popiaConsent ? (
// // //                                                         <span className="fd-pill" style={{ background: '#e0f2fe', color: '#0369a1' }}>✓ CONSENTED</span>
// // //                                                     ) : (
// // //                                                         <span className="fd-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>PENDING</span>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td style={{ textAlign: 'right' }}>
// // //                                                     {l.codeOfConductSigned && l.popiaConsent ? (
// // //                                                         <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span>
// // //                                                     ) : (
// // //                                                         <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>
// // //                                                     )}
// // //                                                 </td>
// // //                                             </tr>
// // //                                         ))}
// // //                                         {paginatedPolicyLearners.length === 0 && (
// // //                                             <tr>
// // //                                                 <td colSpan={6} className="fd-empty">
// // //                                                     No learners match this search criteria.
// // //                                                 </td>
// // //                                             </tr>
// // //                                         )}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>

// // //                             <div className="fd-table-foot">
// // //                                 <span>Showing {searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)} of {searchedPolicyLearners.length} candidate policies</span>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
// // //                                         <ChevronLeft size={14} /> Prev
// // //                                     </button>
// // //                                     <span style={{ padding: '0 6px', fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesPolicyLearners}</span>
// // //                                     <button type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners}>
// // //                                         Next <ChevronRight size={14} />
// // //                                     </button>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //             </>)}

// // //             {/* AUDITOR LEARNER NOTE MODAL */}
// // //             {notesModalLearner && (
// // //                 <div className="fd-modal-overlay" onClick={() => setNotesModalLearner(null)}>
// // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // //                         <div className="fd-modal-header">
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                 <NotebookPen size={20} color={GREEN} />
// // //                                 <div>
// // //                                     <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                                         Auditor Candidate Notes
// // //                                     </h3>
// // //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// // //                                         Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})
// // //                                     </span>
// // //                                 </div>
// // //                             </div>
// // //                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={18} /></button>
// // //                         </div>

// // //                         <div className="fd-modal-body">
// // //                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
// // //                                 Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.
// // //                             </p>
// // //                             <div>
// // //                                 <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '6px', textTransform: 'uppercase' }}>
// // //                                     Inspection Finding / Note *
// // //                                 </label>
// // //                                 <textarea
// // //                                     rows={4}
// // //                                     value={learnerNoteInput}
// // //                                     onChange={(e) => setLearnerNoteInput(e.target.value)}
// // //                                     placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..."
// // //                                     style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }}
// // //                                 />
// // //                             </div>
// // //                         </div>

// // //                         <div className="fd-modal-footer">
// // //                             <button onClick={() => setNotesModalLearner(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// // //                             <button onClick={handleSaveLearnerNote} className="fd-btn fd-btn--primary">
// // //                                 <CheckSquare size={14} /> Save Note
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* GRIEVANCE RESOLUTION MODAL */}
// // //             {selectedGrievance && (
// // //                 <div className="fd-modal-overlay" onClick={() => setSelectedGrievance(null)}>
// // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // //                         <div className="fd-modal-header">
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                 <Scale size={18} color="#4ade80" />
// // //                                 <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3>
// // //                             </div>
// // //                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
// // //                         </div>

// // //                         <div className="fd-modal-body">
// // //                             <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.82rem' }}>
// // //                                 <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div>
// // //                                 <div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div>
// // //                                 <div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
// // //                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
// // //                                     <strong>Details:</strong>
// // //                                     <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p>
// // //                                 </div>
// // //                             </div>
// // //                             <div>
// // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label>
// // //                                 <div className="fd-select-wrap">
// // //                                     <select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} className="fd-select" style={{ width: '100%' }}>
// // //                                         <option value="open">Open (Awaiting Investigation)</option>
// // //                                         <option value="under_review">Under Review by Moderation Committee</option>
// // //                                         <option value="resolved">Resolved (Official Findings Logged)</option>
// // //                                     </select>
// // //                                     <ChevronDown size={14} />
// // //                                 </div>
// // //                             </div>
// // //                             <div>
// // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label>
// // //                                 <textarea
// // //                                     rows={4}
// // //                                     value={grievanceResolutionNotes}
// // //                                     onChange={(e) => setGrievanceResolutionNotes(e.target.value)}
// // //                                     placeholder="Enter committee notes, resolution details, or outcome letter comments..."
// // //                                     style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
// // //                                 />
// // //                             </div>
// // //                         </div>

// // //                         <div className="fd-modal-footer">
// // //                             <button onClick={() => setSelectedGrievance(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// // //                             <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} className="fd-btn fd-btn--primary">
// // //                                 {isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* READ-ONLY POE INSPECTION DRAWER */}
// // //             {inspectedLearner && (
// // //                 <div className="fd-modal-overlay" onClick={() => setInspectedLearner(null)}>
// // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh' }}>
// // //                         <div className="fd-modal-header">
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                 <FileCheck size={20} color={GREEN} />
// // //                                 <div>
// // //                                     <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                                         Auditor Inspection Vault: {inspectedLearner.fullName}
// // //                                     </h3>
// // //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// // //                                         ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}
// // //                                     </span>
// // //                                     <div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>
// // //                                         Target Qualification: {inspectedLearner.programmeName}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                             <button onClick={() => setInspectedLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // //                         </div>

// // //                         <div className="fd-modal-body">
// // //                             {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (
// // //                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                     <UserX size={16} color="#dc2626" />
// // //                                     <span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span>
// // //                                 </div>
// // //                             )}

// // //                             <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
// // //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                         <Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} />
// // //                                         <strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'var(--fd-blue)' }}>
// // //                                             Auditor Candidate Spot-Check Flag
// // //                                         </strong>
// // //                                     </div>
// // //                                     <button
// // //                                         onClick={() => handleToggleCandidateFlag(inspectedLearner.id)}
// // //                                         className={`fd-btn fd-btn--sm ${candidateFlags[inspectedLearner.id]?.flagged ? 'fd-btn--primary' : 'fd-btn--ghost'}`}
// // //                                         style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : undefined, color: candidateFlags[inspectedLearner.id]?.flagged ? '#fff' : undefined }}
// // //                                     >
// // //                                         {candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate'}
// // //                                     </button>
// // //                                 </div>
// // //                                 {candidateFlags[inspectedLearner.id]?.flagged && (
// // //                                     <textarea
// // //                                         rows={2}
// // //                                         value={candidateFlags[inspectedLearner.id]?.note || ''}
// // //                                         onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)}
// // //                                         placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..."
// // //                                         style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '10px', fontSize: '0.8rem', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
// // //                                     />
// // //                                 )}
// // //                             </div>

// // //                             <div>
// // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                     <Briefcase size={14} /> Curriculum Completion &amp; Attendance Ledger
// // //                                 </h4>
// // //                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', background: '#fff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
// // //                                     <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
// // //                                     <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
// // //                                     <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
// // //                                     <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
// // //                                     <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
// // //                                 </div>
// // //                             </div>

// // //                             <div>
// // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                     <FileText size={14} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})
// // //                                 </h4>

// // //                                 {inspectedLearnerSubmissions.length === 0 ? (
// // //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '0.82rem' }}>
// // //                                         <AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />
// // //                                         No digital submission documents found in Firestore for this candidate ID.
// // //                                     </div>
// // //                                 ) : (
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                                         {inspectedLearnerSubmissions.map((sub: any) => {
// // //                                             const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task';
// // //                                             const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase();
// // //                                             const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl;
// // //                                             const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase());

// // //                                             return (
// // //                                                 <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.82rem' }}>
// // //                                                     <div>
// // //                                                         <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                             <span>{subTitle}</span>
// // //                                                             <span className="fd-pill fd-pill--progress" style={{ fontSize: '0.65rem' }}>{subType}</span>
// // //                                                         </div>
// // //                                                         <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
// // //                                                             Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong>
// // //                                                         </div>
// // //                                                     </div>

// // //                                                     <div>
// // //                                                         {fileUrl ? (
// // //                                                             <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fd-btn fd-btn--ghost fd-btn--sm">
// // //                                                                 <ExternalLink size={12} /> View File
// // //                                                             </a>
// // //                                                         ) : (
// // //                                                             <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 </div>
// // //                                             );
// // //                                         })}
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>

// // //                         <div className="fd-modal-footer">
// // //                             <button onClick={() => setInspectedLearner(null)} className="fd-btn fd-btn--primary">
// // //                                 Close Inspection Drawer
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* ENDORSEMENT SIGN-OFF MODAL */}
// // //             {showEndorseModal && (
// // //                 <div className="fd-modal-overlay" onClick={() => setShowEndorseModal(false)}>
// // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // //                         <div className="fd-modal-header">
// // //                             <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Record Official Audit Sign-Off</h3>
// // //                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // //                         </div>

// // //                         <div className="fd-modal-body">
// // //                             <div>
// // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label>
// // //                                 <div className="fd-select-wrap">
// // //                                     <select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} className="fd-select" style={{ width: '100%' }}>
// // //                                         <option value="approved">Fully Approved &amp; Endorsed</option>
// // //                                         <option value="conditional">Conditional Approval (Minor Corrective Actions)</option>
// // //                                         <option value="rejected">Rejected (Major Compliance Audit Failure)</option>
// // //                                     </select>
// // //                                     <ChevronDown size={14} />
// // //                                 </div>
// // //                             </div>

// // //                             <div>
// // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label>
// // //                                 <textarea
// // //                                     rows={5}
// // //                                     value={auditNotes}
// // //                                     onChange={(e) => setAuditNotes(e.target.value)}
// // //                                     placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..."
// // //                                     style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }}
// // //                                 />
// // //                             </div>
// // //                         </div>

// // //                         <div className="fd-modal-footer">
// // //                             <button onClick={() => setShowEndorseModal(false)} className="fd-btn fd-btn--ghost">Cancel</button>
// // //                             <button onClick={handleSaveEndorsement} disabled={isSavingEndorsement} className="fd-btn fd-btn--primary">
// // //                                 {isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* STATUS MODAL FOR OVERLAYS */}
// // //             {statusModal.isOpen && (
// // //                 <StatusModal
// // //                     type={statusModal.type}
// // //                     title={statusModal.title}
// // //                     message={statusModal.message}
// // //                     confirmText="Acknowledge"
// // //                     onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
// // //                 />
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // export default AuditorPortalView;


// // // // // src/pages/AuditorPortal/AuditorPortalView.tsx

// // // // import React, { useState, useEffect, useMemo, useCallback } from 'react';
// // // // import { useSearchParams, useNavigate } from 'react-router-dom';
// // // // import {
// // // //     ShieldCheck, Search, Eye, Lock,
// // // //     FileCheck, UserCheck, X, CheckSquare,
// // // //     Briefcase, Activity, Users, Award,
// // // //     Loader2, ChevronLeft, ChevronRight,
// // // //     Printer, Flag, ExternalLink, AlertCircle, CheckCircle2,
// // // //     FileText, PieChart, BarChart3, TrendingUp, UserX,
// // // //     Scale, Filter, Bell, Download, RefreshCw,
// // // //     FileArchive, FileSignature,
// // // //     MessageSquare, NotebookPen, Tag,
// // // //     BookOpen, Layers, Clock, Calendar,
// // // //     Settings2, RotateCcw, ChevronDown,
// // // //     GripVertical, Plus, Trash2, SlidersHorizontal
// // // // } from 'lucide-react';
// // // // import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import { db } from '../../lib/firebase';
// // // // import { useStore } from '../../store/useStore';
// // // // import { useToast } from '../../components/common/Toast/Toast';
// // // // import Loader from '../../components/common/Loader/Loader';
// // // // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // // // import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// // // // import '../AdminDashboard/FunderDashboard/FunderDashboard.css';

// // // // type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

// // // // interface SampledLearner {
// // // //     id: string;
// // // //     userId: string;
// // // //     fullName: string;
// // // //     idNumber: string;
// // // //     cohortId: string;
// // // //     cohortName: string;
// // // //     programmeName: string;
// // // //     overallProgress: number;
// // // //     attendance: { attended: number; total: number; pct: number };
// // // //     formatives: { completed: number; total: number };
// // // //     summatives: { completed: number; total: number };
// // // //     practicals: { completed: number; total: number };
// // // //     workplaces: { completed: number; total: number };
// // // //     sorStatus: string;
// // // //     popiaConsent: boolean;
// // // //     hasSignature: boolean;
// // // //     status: string;
// // // //     gender?: string;
// // // //     equityGroup?: string;
// // // //     disabilityStatus?: string;
// // // //     birthDate?: string;
// // // //     codeOfConductSigned?: boolean;
// // // //     appealsPolicySigned?: boolean;
// // // // }

// // // // interface AuditorLearnerFlag {
// // // //     flagged: boolean;
// // // //     note: string;
// // // // }

// // // // interface GrievanceRecord {
// // // //     docId: string;
// // // //     id: string;
// // // //     learnerName: string;
// // // //     cohortId: string;
// // // //     dateLogged: string;
// // // //     type: 'appeal' | 'complaint';
// // // //     status: 'open' | 'under_review' | 'resolved';
// // // //     description: string;
// // // //     resolutionNotes?: string;
// // // // }

// // // // interface ActiveExport {
// // // //     requestId: string;
// // // //     learnerId: string;
// // // //     progress: number;
// // // //     progressMessage: string;
// // // //     status: 'pending' | 'processing' | 'completed' | 'error';
// // // //     downloadUrl?: string;
// // // //     errorMessage?: string;
// // // // }

// // // // interface ExportProgressState {
// // // //     status: 'idle' | 'generating' | 'downloading';
// // // //     percent: number;
// // // // }

// // // // interface ReportCache {
// // // //     downloadUrl: string;
// // // //     generatedAt: string;
// // // //     totalRecords?: number;
// // // // }

// // // // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];
// // // // const MIDNIGHT = '#073f4e';
// // // // const GREEN = '#94c73d';

// // // // const downloadFileWithProgress = (
// // // //     url: string,
// // // //     filename: string,
// // // //     onProgress: (percent: number) => void
// // // // ): Promise<void> => {
// // // //     return new Promise((resolve, reject) => {
// // // //         const xhr = new XMLHttpRequest();
// // // //         xhr.open('GET', url, true);
// // // //         xhr.responseType = 'blob';
// // // //         xhr.onprogress = (event) => {
// // // //             if (event.lengthComputable && event.total > 0) {
// // // //                 const percent = Math.round((event.loaded / event.total) * 100);
// // // //                 onProgress(percent);
// // // //             } else if (event.loaded > 0) {
// // // //                 const estimatedTotal = event.loaded + 50000;
// // // //                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
// // // //                 onProgress(percent);
// // // //             }
// // // //         };
// // // //         xhr.onload = () => {
// // // //             if (xhr.status === 200) {
// // // //                 const blob = xhr.response;
// // // //                 const blobUrl = window.URL.createObjectURL(blob);
// // // //                 const link = document.createElement('a');
// // // //                 link.href = blobUrl;
// // // //                 link.download = filename;
// // // //                 document.body.appendChild(link);
// // // //                 link.click();
// // // //                 document.body.removeChild(link);
// // // //                 window.URL.revokeObjectURL(blobUrl);
// // // //                 onProgress(100);
// // // //                 resolve();
// // // //             } else {
// // // //                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
// // // //             }
// // // //         };
// // // //         xhr.onerror = () => reject(new Error('Network error during file download.'));
// // // //         xhr.send();
// // // //     });
// // // // };

// // // // export const AuditorPortalView: React.FC = () => {
// // // //     const toast = useToast();
// // // //     const navigate = useNavigate();
// // // //     const [searchParams, setSearchParams] = useSearchParams();

// // // //     const {
// // // //         user: currentUser,
// // // //         cohorts: storeCohorts,
// // // //         learners: storeLearners,
// // // //         programmes: storeProgrammes,
// // // //         fetchProgrammes,
// // // //         fetchCohorts,
// // // //         fetchLearners
// // // //     } = useStore() as any;

// // // //     const initialCohortFromUrl = searchParams.get('cohort') || '';
// // // //     const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
// // // //     const initialSearchFromUrl = searchParams.get('search') || '';

// // // //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// // // //     const [isLoading, setIsLoading] = useState(true);
// // // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
// // // //     const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
// // // //     const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);
// // // //     const [currentPage, setCurrentPage] = useState<number>(1);
// // // //     const [itemsPerPage, setItemsPerPage] = useState<number>(10);
// // // //     const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});
// // // //     const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
// // // //     const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');
// // // //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// // // //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// // // //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
// // // //     const [rawUsers, setRawUsers] = useState<any[]>([]);
// // // //     const [rawLearners, setRawLearners] = useState<any[]>([]);
// // // //     const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);
// // // //     const [rawAttendance, setRawAttendance] = useState<any[]>([]);
// // // //     const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
// // // //     const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);
// // // //     const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);
// // // //     const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
// // // //     const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
// // // //     const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
// // // //     const [isSavingGrievance, setIsSavingGrievance] = useState(false);
// // // //     const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
// // // //     const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');
// // // //     const [policySearchTerm, setPolicySearchTerm] = useState('');
// // // //     const [showEndorseModal, setShowEndorseModal] = useState(false);
// // // //     const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
// // // //     const [auditNotes, setAuditNotes] = useState('');
// // // //     const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);
// // // //     const [statusModal, setStatusModal] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'error', title: '', message: '' });
// // // //     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // // //     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // // //     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
// // // //     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);
// // // //     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

// // // //     useEffect(() => {
// // // //         if (!currentUser?.isTemporaryAuditor) {
// // // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // // //             if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
// // // //         } else {
// // // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // // //         }
// // // //     }, [currentUser?.isTemporaryAuditor]);

// // // //     useEffect(() => { setCurrentPage(1); }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);
// // // //     useEffect(() => { setLastNlrdExport(null); setLastMatrixExport(null); }, [selectedCohortId]);

// // // //     useEffect(() => {
// // // //         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
// // // //         const unsubPoe = onSnapshot(qPoe, (snap) => {
// // // //             const exportsMap: Record<string, ActiveExport> = {};
// // // //             snap.docs.forEach(docSnap => {
// // // //                 const data = docSnap.data();
// // // //                 const lId = data.learnerId;
// // // //                 if (lId && !exportsMap[lId]) {
// // // //                     exportsMap[lId] = { requestId: docSnap.id, learnerId: lId, progress: data.progress || 0, progressMessage: data.progressMessage || '', status: data.status || 'pending', downloadUrl: data.downloadUrl, errorMessage: data.errorMessage };
// // // //                 }
// // // //             });
// // // //             setActiveExports(prev => ({ ...exportsMap, ...prev }));
// // // //         });
// // // //         return () => unsubPoe();
// // // //     }, []);

// // // //     const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
// // // //         const newParams: Record<string, string> = {};
// // // //         if (cohortId) newParams.cohort = cohortId;
// // // //         if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
// // // //         if (search) newParams.search = search;
// // // //         setSearchParams(newParams, { replace: true });
// // // //     }, [setSearchParams]);

// // // //     const allowedCohortsForAuditor = useMemo(() => {
// // // //         if (!storeCohorts || storeCohorts.length === 0) return [];
// // // //         const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
// // // //         if (isFullAdmin) return storeCohorts;
// // // //         const allowedIds: string[] = Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : [];
// // // //         if (allowedIds.length > 0) return storeCohorts.filter((c: any) => allowedIds.includes(c.id));
// // // //         return storeCohorts;
// // // //     }, [storeCohorts, currentUser?.role, currentUser?.isSuperAdmin, currentUser?.allowedCohortIds]);

// // // //     useEffect(() => {
// // // //         if (allowedCohortsForAuditor.length > 0) {
// // // //             const isValidSelection = allowedCohortsForAuditor.some((c: any) => c.id === selectedCohortId);
// // // //             if (!selectedCohortId || !isValidSelection) {
// // // //                 const defaultCohortId = allowedCohortsForAuditor[0].id;
// // // //                 setSelectedCohortId(defaultCohortId);
// // // //                 syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
// // // //             }
// // // //         } else { setSelectedCohortId(''); }
// // // //     }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

// // // //     useEffect(() => {
// // // //         setIsLoading(true);
// // // //         const handlePermissionError = (collectionName: string, err: any) => { console.warn(`[Firestore Permission Guard] Access to '${collectionName}' restricted:`, err); setIsLoading(false); };
// // // //         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => { setRawEnrollments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); }, (err) => handlePermissionError('enrollments', err));
// // // //         const unsubSubmissions = onSnapshot(collection(db, 'learner_submissions'), (snap) => { setRawSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoading(false); }, (err) => handlePermissionError('learner_submissions', err));
// // // //         const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => { setRawUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); }, (err) => handlePermissionError('users', err));
// // // //         const unsubLearners = onSnapshot(collection(db, 'learners'), (snap) => { setRawLearners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); }, (err) => handlePermissionError('learners', err));
// // // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // // //         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
// // // //             const parsedGrievances: GrievanceRecord[] = [];
// // // //             snap.docs.forEach(docSnap => {
// // // //                 const data = docSnap.data();
// // // //                 parsedGrievances.push({
// // // //                     docId: docSnap.id, id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(),
// // // //                     learnerName: data.learnerName || 'Unknown Learner', cohortId: data.cohortId || data.cohortRunId || '',
// // // //                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // // //                     type: data.type || 'appeal', status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// // // //                     description: data.reason || data.description || 'No description provided', resolutionNotes: data.resolutionNotes || ''
// // // //                 });
// // // //             });
// // // //             setRawGrievances(parsedGrievances);
// // // //         }, (err) => handlePermissionError('assessment_appeals', err));
// // // //         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => { setRawPolicySignoffs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, (err) => handlePermissionError('learner_policy_signoffs', err));
// // // //         const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance', err));
// // // //         const unsubAttLogs = onSnapshot(collection(db, 'attendance_logs'), (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_logs', err));
// // // //         const unsubAttRecords = onSnapshot(collection(db, 'attendance_records'), (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handlePermissionError('attendance_records', err));
// // // //         return () => { unsubEnrollments(); unsubSubmissions(); unsubUsers(); unsubLearners(); unsubGrievances(); unsubPolicies(); unsubAttendance(); unsubAttLogs(); unsubAttRecords(); };
// // // //     }, []);

// // // //     const addCleanKey = (setObj: Set<string>, val: any) => { if (val && typeof val === 'string') { const cleaned = val.trim().toLowerCase(); if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') setObj.add(cleaned); } };
// // // //     const checkCocSignedInObject = (obj: any) => { if (!obj) return false; const demo = obj.demographics || {}; return obj.codeOfConductSigned === true || obj.hasSignedCoc === true || obj.cocSigned === true || obj.policySigned === true || obj.isPolicySigned === true || demo.codeOfConductSigned === true || demo.hasSignedCoc === true || demo.cocSigned === true || demo.policySigned === true || !!obj.signatureUrl || !!demo.signatureUrl; };

// // // //     const cocSignedKeysSet = useMemo(() => {
// // // //         const keys = new Set<string>();
// // // //         rawPolicySignoffs.forEach((d: any) => { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); });
// // // //         rawUsers.forEach((u: any) => { if (checkCocSignedInObject(u)) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
// // // //         rawLearners.forEach((l: any) => { if (checkCocSignedInObject(l)) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
// // // //         rawEnrollments.forEach((e: any) => { if (checkCocSignedInObject(e)) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
// // // //         return keys;
// // // //     }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

// // // //     const appealsSignedKeysSet = useMemo(() => {
// // // //         const keys = new Set<string>();
// // // //         rawPolicySignoffs.forEach((d: any) => { const type = String(d.policyType || d.policyName || '').toLowerCase(); if (type.includes('appeal')) { addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email); } });
// // // //         rawUsers.forEach((u: any) => { if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
// // // //         rawLearners.forEach((l: any) => { if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
// // // //         return keys;
// // // //     }, [rawPolicySignoffs, rawUsers, rawLearners])

// // // //     const popiaConsentKeysSet = useMemo(() => {
// // // //         const keys = new Set<string>();
// // // //         rawUsers.forEach((u: any) => { const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email); } });
// // // //         rawLearners.forEach((l: any) => { const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email); } });
// // // //         rawEnrollments.forEach((e: any) => { const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true'; if (isConsent) { addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email); } });
// // // //         return keys;
// // // //     }, [rawUsers, rawLearners, rawEnrollments]);

// // // //     const activeProgrammeData = useMemo(() => {
// // // //         if (!selectedCohortId) return null;
// // // //         const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
// // // //         if (!cohort) return null;
// // // //         return storeProgrammes?.find((p: any) => p.id === cohort.programmeId || p.id === cohort.qualificationId || (p.saqaId && String(p.saqaId) === String(cohort.saqaId))) || null;
// // // //     }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

// // // //     const dailyRegisters = useMemo(() => {
// // // //         const unifiedMap = new Map<string, any>();
// // // //         const matchCohort = (r: any) => { if (!selectedCohortId || selectedCohortId === 'ALL') return true; const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim(); return rCohort === selectedCohortId; };
// // // //         const filteredAtt = rawAttendance.filter(matchCohort);
// // // //         const filteredLogs = rawAttendanceLogs.filter(matchCohort);
// // // //         const filteredRecords = rawAttendanceRecords.filter(matchCohort);
// // // //         filteredAtt.forEach(record => {
// // // //             if (record.presentLearners || record.absentLearners) {
// // // //                 const dateKey = record.date || record.id;
// // // //                 unifiedMap.set(record.id || dateKey, { id: record.id || dateKey, date: record.date || 'Unknown', presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [], absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [], partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : [] });
// // // //             } else if (record.learnerId && record.date) {
// // // //                 const dateKey = `eco_${record.date}`;
// // // //                 if (!unifiedMap.has(dateKey)) { unifiedMap.set(dateKey, { id: dateKey, date: record.date, presentLearners: [], absentLearners: [], partialLearners: [] }); }
// // // //                 const entry = unifiedMap.get(dateKey);
// // // //                 const status = String(record.status || '').toLowerCase();
// // // //                 if (status.includes('present')) entry.presentLearners.push(record.learnerId);
// // // //                 else if (status.includes('absent')) entry.absentLearners.push(record.learnerId);
// // // //                 else if (status.includes('partial')) entry.partialLearners.push(record.learnerId);
// // // //             }
// // // //         });
// // // //         filteredLogs.forEach(log => {
// // // //             const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
// // // //             const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);
// // // //             const present: string[] = []; const absent: string[] = []; const partial: string[] = [];
// // // //             recordsForLog.forEach(r => { const status = String(r.status || '').toLowerCase(); const lKey = r.learnerId || r.authUid || r.userId; if (lKey) { if (status.includes('present')) present.push(lKey); else if (status.includes('absent')) absent.push(lKey); else if (status.includes('partial')) partial.push(lKey); } });
// // // //             unifiedMap.set(log.id, { id: log.id, date: dateStr, presentLearners: present, absentLearners: absent, partialLearners: partial });
// // // //         });
// // // //         const unifiedArray = Array.from(unifiedMap.values());
// // // //         unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
// // // //         return unifiedArray;
// // // //     }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

// // // //     const rosterAttendanceMap = useMemo(() => {
// // // //         const keyAttendanceMap = new Map<string, number>();
// // // //         const totalSessions = dailyRegisters.length;
// // // //         const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
// // // //             const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
// // // //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
// // // //             const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
// // // //             const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));
// // // //             const keys = [e.id, e.userId, e.learnerId, e.authUid, e.idNumber, actualUserId, storeLearner?.id, storeLearner?.learnerId, storeLearner?.authUid, storeLearner?.idNumber, rawUser?.id, rawUser?.authUid, rawUser?.idNumber, rawLearner?.id, rawLearner?.authUid, rawLearner?.idNumber].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');
// // // //             return Array.from(new Set(keys.map(k => k.trim().toLowerCase())));
// // // //         });
// // // //         candidateKeyGroups.forEach(group => { group.forEach(k => { keyAttendanceMap.set(k, 0); }); });
// // // //         dailyRegisters.forEach(reg => {
// // // //             const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase());
// // // //             candidateKeyGroups.forEach(group => {
// // // //                 const isCandidatePresent = group.some(k => presentList.includes(k));
// // // //                 if (isCandidatePresent) { group.forEach(k => { keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1); }); }
// // // //             });
// // // //         });
// // // //         const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
// // // //         candidateKeyGroups.forEach(group => { const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0); const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0; const stats = { attended: bestAttended, total: totalSessions, pct }; group.forEach(k => { finalMap.set(k, stats); }); });
// // // //         return finalMap;
// // // //     }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

// // // //     const handleCohortChange = (cohortId: string) => { setSelectedCohortId(cohortId); syncQueryParams(cohortId, samplePercentage, searchTerm); };
// // // //     const handleSamplePercentageChange = (pct: number) => { setSamplePercentage(pct); setSearchTerm(''); syncQueryParams(selectedCohortId, pct, ''); };
// // // //     const handleSearchChange = (term: string) => { setSearchTerm(term); syncQueryParams(selectedCohortId, samplePercentage, term); };

// // // //     const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => {
// // // //         setCandidateFlags(prev => { const current = prev[candidateId]; const isCurrentlyFlagged = current?.flagged; 
// // // //             return { ...prev, [candidateId]: { 
// // // //                 flagged: !isCurrentlyFlagged, note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : '' } }; });
// // // //         toast.info("Candidate spot-check flag status updated.");
// // // //     };
// // // //     const handleUpdateFlagNote = (candidateId: string, noteText: string) => { setCandidateFlags(prev => ({ ...prev, [candidateId]: { flagged: true, note: noteText } })); };
// // // //     const handleOpenNotesModal = (learner: SampledLearner) => { setNotesModalLearner(learner); setLearnerNoteInput(candidateFlags[learner.id]?.note || ''); };
// // // //     const handleSaveLearnerNote = () => { if (!notesModalLearner) return; handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput); toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`); setNotesModalLearner(null); };

// // // //     const handleExportSampleManifest = () => {
// // // //         if (sampledLearners.length === 0) { setStatusModal({ isOpen: true, type: 'info', title: 'No Sampled Records', message: 'There are currently no sampled records available in the selected cohort view to export.' }); return; }
// // // //         const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];
// // // //         const csvRows = sampledLearners.map(l => {
// // // //             const flag = candidateFlags[l.id]; const rawIdStr = String(l.idNumber || '').trim(); const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr)) ? rawIdStr.padStart(13, '0') : rawIdStr; const textFormattedId = `="${paddedId}"`;
// // // //             return [`"${l.fullName.replace(/"/g, '""')}"`, textFormattedId, `"${l.status}"`, `"${l.cohortName.replace(/"/g, '""')}"`, `"${l.programmeName.replace(/"/g, '""')}"`, `${l.overallProgress}%`, `${l.attendance.pct}%`, `"${l.attendance.attended}/${l.attendance.total}"`, `"${l.formatives.completed}/${l.formatives.total}"`, `"${l.summatives.completed}/${l.summatives.total}"`, `"${l.practicals.completed}/${l.practicals.total}"`, `"${l.workplaces.completed}/${l.workplaces.total}"`, l.popiaConsent ? 'Signed' : 'Unsigned', flag?.flagged ? 'FLAGGED' : 'CLEAR', `"${(flag?.note || '').replace(/"/g, '""')}"`].join(',');
// // // //         });
// // // //         const csvContent = [headers.join(','), ...csvRows].join('\n');
// // // //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
// // // //         const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
// // // //         toast.success("Sample Manifest exported to CSV.");
// // // //     };

// // // //     const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
// // // //         const targetLearnerId = learner.userId || learner.id;
// // // //         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];
// // // //         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') { toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`); return; }
// // // //         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) { window.open(currentExport.downloadUrl, '_blank'); return; }
// // // //         try {
// // // //             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);
// // // //             const docRef = await addDoc(collection(db, 'poe_export_requests'), { learnerId: targetLearnerId, requestedBy: currentUser?.uid || currentUser?.id || 'auditor', status: 'pending', progress: 0, progressMessage: 'Initializing compliance engine...', createdAt: serverTimestamp() });
// // // //             setActiveExports(prev => ({ ...prev, [learner.id]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' }, [targetLearnerId]: { requestId: docRef.id, learnerId: targetLearnerId, progress: 0, progressMessage: 'Initializing compliance engine...', status: 'pending' } }));
// // // //         } catch (error: any) { console.error('Error requesting PoE export:', error); setStatusModal({ isOpen: true, type: 'error', title: 'Export Initialization Failed', message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.` }); }
// // // //     };

// // // //     const cohortPool = useMemo(() => {
// // // //         if (!selectedCohortId) return [];
// // // //         const filteredEnrollments = rawEnrollments.filter(e => e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId);
// // // //         return filteredEnrollments.map((enrol): SampledLearner => {
// // // //             const enrolKeys = [enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.id, enrol.uid].filter((k): k is string => typeof k === 'string' && k.trim() !== '');
// // // //             const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';
// // // //             const matchesLearner = (candidate: any) => { if (!candidate) return false; const candidateKeys = [candidate.id, candidate.learnerId, candidate.idNumber, candidate.authUid, candidate.uid, candidate.userId].filter((k): k is string => typeof k === 'string' && k.trim() !== '');
// // // //                 const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase()));
// // // //                 const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail;
// // // //                 return hasKeyMatch || hasEmailMatch;
// // // //             };
// // // //             const storeLearner = storeLearners?.find(matchesLearner); const rawUser = rawUsers?.find(matchesLearner); const rawLearner = rawLearners?.find(matchesLearner);
// // // //             const activeCohortId = enrol.cohortId || enrol.cohortRunId; const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);
// // // //             let storeProgramme = storeProgrammes?.find((p: any) => (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) || (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId))));
// // // //             const mappedName = enrol.userName || enrol.learnerName || enrol.fullName || enrol.name || storeLearner?.fullName || storeLearner?.name || rawLearner?.fullName || rawLearner?.name || rawUser?.fullName || rawUser?.name || 'Learner Candidate';
// // // //             const rawMappedId = enrol.idNumber || storeLearner?.idNumber || rawLearner?.idNumber || rawUser?.idNumber || enrol.learnerId || enrol.userId || enrol.id || 'N/A';
// // // //             const cleanIdStr = String(rawMappedId).trim(); const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr)) ? cleanIdStr.padStart(13, '0') : cleanIdStr;
// // // //             const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';
// // // //             const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification';
// // // //             const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || '';
// // // //             const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';
// // // //             const progDetails: string[] = []; if (progNqf) progDetails.push(`NQF Level ${progNqf}`); if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);
// // // //             const mappedProgramme = progDetails.length > 0 ? `${progTitle} (${progDetails.join(' | ')})` : progTitle;
// // // //             const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};
// // // //             const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
// // // //             const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
// // // //             const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';
// // // //             let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;
// // // //             if (storeProgramme) {
// // // //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// // // //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// // // //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;
// // // //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// // // //                     const flat = storeProgramme.modules;
// // // //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// // // //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// // // //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// // // //                 }
// // // //             }
// // // //             let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0;
// // // //             let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;
// // // //             const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
// // // //             const learnerSubs = rawSubmissions.filter(s => (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) || (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) || (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase()));
// // // //             learnerSubs.forEach(s => {
// // // //                 const type = String(s.type || 'formative').toLowerCase(); const moduleType = String(s.moduleType || '').toLowerCase(); const subStatus = String(s.status || 'not_started').toLowerCase();
// // // //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;
// // // //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
// // // //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// // // //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// // // //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');
// // // //                 if (isKnowledge) { if (type.includes('formative') || type.includes('fa')) { totalAssignedFA++; if (isDone) calculatedFA++; } else if (type.includes('summative') || type.includes('sa')) { totalAssignedSA++; if (isDone) calculatedSA++; } }
// // // //                 else if (isPractical) { totalAssignedPM++; if (isDone) calculatedPM++; }
// // // //                 else if (isWorkplace) { totalAssignedWM++; if (isDone) calculatedWM++; }
// // // //             });
// // // //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA); const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA); const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM); const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);
// // // //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM; const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;
// // // //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;
// // // //             const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) || rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) || rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) || { attended: 0, total: dailyRegisters.length, pct: 0 };
// // // //             const candidateKeys = [actualUserId, enrol.id, enrol.userId, enrol.learnerId, enrol.authUid, enrol.idNumber, enrol.email, mappedId, storeLearner?.id, storeLearner?.uid, storeLearner?.authUid, storeLearner?.idNumber, storeLearner?.email, rawUser?.id, rawUser?.uid, rawUser?.authUid, rawUser?.idNumber, rawUser?.email, rawLearner?.id, rawLearner?.authUid, rawLearner?.idNumber, rawLearner?.email];
// // // //             const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
// // // //             const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
// // // //             const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));
// // // //             const allStatuses = [enrol.status, storeLearner?.status, rawLearner?.status, rawUser?.status].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());
// // // //             const isCandidateDropped = allStatuses.some(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s));
// // // //             const resolvedStatus = isCandidateDropped ? (allStatuses.find(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s)) || 'dropped') : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');
// // // //             return {
// // // //                 id: enrol.id, userId: actualUserId, fullName: mappedName, idNumber: mappedId, cohortId: activeCohortId, cohortName: mappedCohort, programmeName: mappedProgramme, overallProgress: Math.min(100, dynamicProgress), attendance: attStats,
// // // //                 formatives: { completed: calculatedFA, total: ceilingFA }, summatives: { completed: calculatedSA, total: ceilingSA }, practicals: { completed: calculatedPM, total: ceilingPM }, workplaces: { completed: calculatedWM, total: ceilingWM },
// // // //                 sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'), popiaConsent: isPopiConsented, hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned), status: resolvedStatus,
// // // //                 gender, equityGroup, disabilityStatus, birthDate: demo.birthDate || storeLearner?.birthDate, codeOfConductSigned: isCocSigned, appealsPolicySigned: isAppealsSigned
// // // //             };
// // // //         });
// // // //     }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

// // // //     const sampledLearners = useMemo(() => {
// // // //         if (cohortPool.length === 0) return [];
// // // //         let filtered = cohortPool;
// // // //         if (searchTerm.trim()) { const q = searchTerm.toLowerCase(); return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q)); }
// // // //         if (samplePercentage >= 100) return filtered;
// // // //         const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
// // // //         return [...cohortPool].sort((a, b) => a.id.localeCompare(b.id)).slice(0, sampleSize);
// // // //     }, [cohortPool, samplePercentage, searchTerm]);

// // // //     const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
// // // //     const paginatedLearners = useMemo(() => { return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [sampledLearners, currentPage, itemsPerPage]);

// // // //     const cohortFilteredGrievances = useMemo(() => {
// // // //         let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');
// // // //         if (grievanceFilterStatus !== 'ALL') list = list.filter(g => g.status === grievanceFilterStatus);
// // // //         if (grievanceFilterType !== 'ALL') list = list.filter(g => g.type === grievanceFilterType);
// // // //         return list;
// // // //     }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

// // // //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// // // //     const paginatedGrievances = useMemo(() => { return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

// // // //     const searchedPolicyLearners = useMemo(() => {
// // // //         if (!policySearchTerm.trim()) return cohortPool;
// // // //         const q = policySearchTerm.toLowerCase();
// // // //         return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q));
// // // //     }, [cohortPool, policySearchTerm]);

// // // //     const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
// // // //     const paginatedPolicyLearners = useMemo(() => { return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage); }, [searchedPolicyLearners, currentPage, itemsPerPage]);

// // // //     const cohortMisDemographics = useMemo(() => {
// // // //         const stats = { total: cohortPool.length, sampleTotal: sampledLearners.length, equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 }, gender: { Female: 0, Male: 0, Other: 0 }, disability: { Yes: 0, No: 0 }, youth: { Under35: 0, Adult35Plus: 0 }, attendanceBands: { high: 0, mid: 0, low: 0 } };
// // // //         const currentYear = 2026;
// // // //         cohortPool.forEach(l => {
// // // //             const eq = String(l.equityGroup || '').trim().toLowerCase();
// // // //             if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') stats.equity.African++;
// // // //             else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') stats.equity.Coloured++;
// // // //             else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') stats.equity.Indian++;
// // // //             else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') stats.equity.White++;
// // // //             else stats.equity.African++;
// // // //             const g = String(l.gender || '').trim().toLowerCase();
// // // //             if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') stats.gender.Female++;
// // // //             else if (g.startsWith('m') || g.includes('male') || g === 'man') stats.gender.Male++;
// // // //             else if (l.idNumber && l.idNumber.length >= 7) { const genderDigit = parseInt(l.idNumber.charAt(6), 10); if (!isNaN(genderDigit)) { if (genderDigit >= 5) stats.gender.Male++; else stats.gender.Female++; } else stats.gender.Male++; }
// // // //             else stats.gender.Male++;
// // // //             const d = String(l.disabilityStatus || '').trim().toLowerCase();
// // // //             if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') stats.disability.Yes++; else stats.disability.No++;
// // // //             let birthYear = 0;
// // // //             if (l.idNumber && l.idNumber.length >= 6) { const yy = parseInt(l.idNumber.substring(0, 2), 10); birthYear = yy > 30 ? 1900 + yy : 2000 + yy; }
// // // //             if (birthYear > 0 && (currentYear - birthYear) <= 35) stats.youth.Under35++; else stats.youth.Adult35Plus++;
// // // //             const attPct = l.attendance?.pct || 0;
// // // //             if (attPct >= 75) stats.attendanceBands.high++; else if (attPct >= 40) stats.attendanceBands.mid++; else stats.attendanceBands.low++;
// // // //         });
// // // //         return stats;
// // // //     }, [cohortPool, sampledLearners]);

// // // //     const displayStats = useMemo(() => {
// // // //         let active = 0, grad = 0, drop = 0; let codeOfConductSignedCount = 0; let appealsSignedCount = 0; let popiaConsentCount = 0;
// // // //         cohortPool.forEach(l => {
// // // //             const status = l.status.toLowerCase();
// // // //             if (status === 'active') active++;
// // // //             else if (status === 'graduated' || status === 'competent') grad++;
// // // //             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;
// // // //             if (l.codeOfConductSigned) codeOfConductSignedCount++;
// // // //             if (l.appealsPolicySigned) appealsSignedCount++;
// // // //             if (l.popiaConsent) popiaConsentCount++;
// // // //         });
// // // //         const total = cohortPool.length; const denominator = total > 0 ? total : 1;
// // // //         return { totalEnrolled: total, activeTraining: active, graduated: grad, droppedOut: drop, retentionRate: total > 0 ? Math.round(((total - drop) / total) * 100) : 0, activeGrievances: cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length, policySignedPct: Math.min(100, Math.round((codeOfConductSignedCount / denominator) * 100)), appealsSignedPct: Math.min(100, Math.round((appealsSignedCount / denominator) * 100)), popiaConsentPct: Math.min(100, Math.round((popiaConsentCount / denominator) * 100)) };
// // // //     }, [cohortPool, cohortFilteredGrievances]);

// // // //     const inspectedLearnerSubmissions = useMemo(() => {
// // // //         if (!inspectedLearner) return [];
// // // //         const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();
// // // //         return rawSubmissions.filter(s => (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) || (s.authUid && String(s.authUid).toLowerCase() === targetUserId) || (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase()));
// // // //     }, [inspectedLearner, rawSubmissions]);

// // // //     const activeCohortData = useMemo(() => { return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null; }, [allowedCohortsForAuditor, selectedCohortId]);

// // // //     const handleSaveEndorsement = async () => {
// // // //         if (!auditNotes.trim()) { setStatusModal({ isOpen: true, type: 'warning', title: 'Missing Audit Notes', message: 'Please enter auditor verification findings and notes before recording official sign-off.' }); return; }
// // // //         setIsSavingEndorsement(true);
// // // //         try {
// // // //             await addDoc(collection(db, 'cohort_audit_endorsements'), { cohortId: selectedCohortId, cohortName: activeCohortData?.name || 'Cohort', auditorUid: currentUser?.uid || 'external_auditor', auditorName: currentUser?.fullName || 'External Quality Assurer', organization: currentUser?.organization || 'QCTO / SETA', sampleSizePercentage: samplePercentage, sampledRecordsCount: sampledLearners.length, totalCohortCount: cohortPool.length, outcome: auditOutcome, notes: auditNotes, flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length, signedAt: serverTimestamp(), createdAt: new Date().toISOString() });
// // // //             toast.success("Audit verification & endorsement recorded successfully."); setShowEndorseModal(false); setAuditNotes('');
// // // //         } catch (err: any) { console.error("Failed to save endorsement:", err); setStatusModal({ isOpen: true, type: 'error', title: 'Sign-Off Failed', message: err.message || 'Failed to record official audit verification sign-off record.' }); }
// // // //         finally { setIsSavingEndorsement(false); }
// // // //     };

// // // //     const handleSaveGrievanceResolution = async () => {
// // // //         if (!selectedGrievance) return; setIsSavingGrievance(true);
// // // //         try {
// // // //             await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), { status: grievanceStatusInput, resolutionNotes: grievanceResolutionNotes, resolvedAt: serverTimestamp(), resolvedBy: currentUser?.uid || 'external_auditor' });
// // // //             toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`); setSelectedGrievance(null); setGrievanceResolutionNotes('');
// // // //         } catch (err: any) { console.error("Failed to update grievance:", err); setStatusModal({ isOpen: true, type: 'error', title: 'Resolution Update Failed', message: err.message || 'Failed to save grievance resolution details.' }); }
// // // //         finally { setIsSavingGrievance(false); }
// // // //     };

// // // //     const handleExportNLRD = async () => {
// // // //         if (nlrdProgress.status !== 'idle') return; setNlrdProgress({ status: 'generating', percent: 15 }); toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);
// // // //         const timer = setInterval(() => { setNlrdProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
// // // //         try {
// // // //             const functions = getFunctions(); const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport'); const response: any = await generateNlrdFn({ cohortId: selectedCohortId }); clearInterval(timer);
// // // //             if (response.data?.downloadUrl) {
// // // //                 setNlrdProgress({ status: 'downloading', percent: 80 }); const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;
// // // //                 await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setNlrdProgress({ status: 'downloading', percent: scaled }); });
// // // //                 setLastNlrdExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalRecords });
// // // //                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords || ''} records.`);
// // // //             }
// // // //         } catch (error: any) { clearInterval(timer); console.error('NLRD Export Failed:', error); setStatusModal({ isOpen: true, type: 'error', title: 'NLRD Export Failed', message: error.message || 'An error occurred while attempting to compile the NLRD export batch.' }); }
// // // //         finally { setNlrdProgress({ status: 'idle', percent: 0 }); }
// // // //     };

// // // //     const handleExportThroughputMatrix = async () => {
// // // //         if (matrixProgress.status !== 'idle') return; setMatrixProgress({ status: 'generating', percent: 15 }); toast.info('Compiling Learner Throughput & Compliance Matrix...');
// // // //         const timer = setInterval(() => { setMatrixProgress(prev => { if (prev.status !== 'generating') return prev; if (prev.percent >= 80) return prev; return { ...prev, percent: prev.percent + 5 }; }); }, 300);
// // // //         try {
// // // //             const functions = getFunctions(); const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport'); const response: any = await generateMatrixFn({ cohortId: selectedCohortId }); clearInterval(timer);
// // // //             if (response.data?.downloadUrl) {
// // // //                 setMatrixProgress({ status: 'downloading', percent: 80 }); const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;
// // // //                 await downloadFileWithProgress(response.data.downloadUrl, filename, (bytePercent) => { const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20)); setMatrixProgress({ status: 'downloading', percent: scaled }); });
// // // //                 setLastMatrixExport({ downloadUrl: response.data.downloadUrl, generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }), totalRecords: response.data.totalLearners });
// // // //                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners || ''} learners!`);
// // // //             }
// // // //         } catch (error: any) { clearInterval(timer); console.error('Throughput Report Failed:', error); setStatusModal({ isOpen: true, type: 'error', title: 'Report Generation Failed', message: error.message || 'Server error encountered while building the throughput matrix report.' }); }
// // // //         finally { setMatrixProgress({ status: 'idle', percent: 0 }); }
// // // //     };

// // // //     if (isLoading) return <Loader message="Initializing Auditor Inspection Portal..." />;
// // // //     const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

// // // //     return (
// // // //         <div className="fd-root fd-root--fixed">

// // // //             {/* HERO HEADER */}
// // // //             <div className="fd-hero">
// // // //                 <div>
// // // //                     <div className="fd-hero-brand">
// // // //                         <img src={mLabLogo} alt="mLab Logo" style={{ width: 70, height: 'auto' }} />
// // // //                         <span className="fd-hero-divider" />
// // // //                         <div className="fd-eyebrow">
// // // //                             <span className="fd-live-dot" />
// // // //                             QCTO / SETA Verification Workspace
// // // //                         </div>
// // // //                     </div>
// // // //                     <h1 className="fd-title">Auditor Inspection Portal</h1>
// // // //                     <p className="fd-subtitle">Real-time verification &amp; compliance monitoring for external quality assurers.</p>
// // // //                 </div>
// // // //                 <div className="fd-hero-actions">
// // // //                     <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '20px', padding: '6px 14px' }}>
// // // //                         <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
// // // //                         <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#38bdf8' }}>Read-Only Inspector Mode</span>
// // // //                     </div>
// // // //                     <button onClick={() => setShowEndorseModal(true)} className="fd-btn fd-btn--primary">
// // // //                         <UserCheck size={16} /> Sign Off Cohort Audit
// // // //                     </button>
// // // //                 </div>
// // // //             </div>

// // // //             {/* MAIN CONTENT */}
// // // //             <div className="fd-main fd-scroll">

// // // //                 {/* QUALIFICATION SCOPE HEADER */}
// // // //                 {activeProgrammeData && (
// // // //                     <div className="fd-card" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '16px' }}>
// // // //                         <div style={{ background: '#0284c7', padding: '12px', borderRadius: '11px', color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
// // // //                             <Award size={28} />
// // // //                         </div>
// // // //                         <div>
// // // //                             <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Active Audit Target Qualification</div>
// // // //                             <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: 'var(--fd-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{activeProgrammeData.name}</h2>
// // // //                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
// // // //                                 {activeProgrammeData.saqaId && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="#0284c7" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
// // // //                                 {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="#0284c7" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
// // // //                                 {activeProgrammeData.credits > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="#0284c7" /> Total Credits: {activeProgrammeData.credits}</span>}
// // // //                                 {(activeProgrammeData as any).accreditingBody && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} color="#0284c7" /> Accrediting Body: {(activeProgrammeData as any).accreditingBody}</span>}
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {/* CONTROLS TOOLBAR */}
// // // //                 <div className="fd-controls">
// // // //                     <div className="fd-filters" style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
// // // //                         <div className="fd-select-wrap">
// // // //                             <select className="fd-select" value={selectedCohortId} onChange={(e) => handleCohortChange(e.target.value)} style={{ minWidth: '280px' }}>
// // // //                                 {allowedCohortsForAuditor.length === 0 ? <option value="">No Assigned Cohorts Found</option> : allowedCohortsForAuditor.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
// // // //                             </select>
// // // //                             <ChevronDown size={14} />
// // // //                         </div>

// // // //                         <div style={{ display: 'flex', border: '1px solid #d5dde6', borderRadius: '10px', overflow: 'hidden' }}>
// // // //                             {[10, 20, 50, 100].map((pct) => (
// // // //                                 <button key={pct} onClick={() => handleSamplePercentageChange(pct)} className={`fd-btn ${samplePercentage === pct && !searchTerm ? 'fd-btn--primary' : 'fd-btn--ghost'}`} style={{ borderRadius: 0, border: 'none', borderRight: '1px solid #d5dde6', fontSize: '0.8rem' }}>{pct}% {pct === 10 ? '(QCTO Std)' : ''}</button>
// // // //                             ))}
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // //                         <button onClick={handleExportSampleManifest} className="fd-btn fd-btn--ghost fd-btn--sm"><Printer size={14} /> Export Sample Manifest</button>
// // // //                         <div className="fd-search-wrap" style={{ minWidth: '220px' }}>
// // // //                             <Search size={16} />
// // // //                             <input className="fd-search" type="text" placeholder="Search candidate or ID..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} />
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* KPI METRICS ROW */}
// // // //                 <div className="fd-kpis">
// // // //                     <div className="fd-kpi" style={{ ['--kpi' as any]: MIDNIGHT }}>
// // // //                         <div className="fd-kpi-head"><div className="fd-kpi-icon"><Users size={18} /></div><span className="fd-kpi-label">Sample Size Loaded</span></div>
// // // //                         <div className="fd-kpi-value">{sampledLearners.length} / {cohortPool.length}</div>
// // // //                         <span style={{ fontSize: '0.72rem', color: MIDNIGHT, fontWeight: 700 }}>{samplePercentage}% Cohort Audit Subset</span>
// // // //                     </div>
// // // //                     <div className="fd-kpi" style={{ ['--kpi' as any]: '#16a34a' }}>
// // // //                         <div className="fd-kpi-head"><div className="fd-kpi-icon"><Activity size={18} /></div><span className="fd-kpi-label">Average Progress</span></div>
// // // //                         <div className="fd-kpi-value">{sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0}%</div>
// // // //                         <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>Sampled Completion Ratio</span>
// // // //                     </div>
// // // //                     <div className="fd-kpi" style={{ ['--kpi' as any]: '#0284c7' }}>
// // // //                         <div className="fd-kpi-head"><div className="fd-kpi-icon"><Clock size={18} /></div><span className="fd-kpi-label">Average Attendance</span></div>
// // // //                         <div className="fd-kpi-value">{sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0}%</div>
// // // //                         <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700 }}>{dailyRegisters.length} Sessions Logged</span>
// // // //                     </div>
// // // //                     <div className="fd-kpi" style={{ ['--kpi' as any]: '#8b5cf6' }}>
// // // //                         <div className="fd-kpi-head"><div className="fd-kpi-icon"><ShieldCheck size={18} /></div><span className="fd-kpi-label">POPIA &amp; Policy Consent</span></div>
// // // //                         <div className="fd-kpi-value">{sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0}%</div>
// // // //                         <span style={{ fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 700 }}>Governance Verified</span>
// // // //                     </div>
// // // //                     <div className="fd-kpi" style={{ ['--kpi' as any]: '#f59e0b' }}>
// // // //                         <div className="fd-kpi-head"><div className="fd-kpi-icon"><Award size={18} /></div><span className="fd-kpi-label">SoR Readiness</span></div>
// // // //                         <div className="fd-kpi-value">{sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length}</div>
// // // //                         <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>Qualified Candidates</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* TAB NAVIGATION */}
// // // //                 <div className="fd-tabs" data-active={activeTab} role="tablist">
// // // //                     <span className="fd-tab-thumb" />
// // // //                     {[
// // // //                         { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // // //                         { id: 'mis_overview', label: 'MIS Overview', icon: BarChart3 },
// // // //                         { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// // // //                         { id: 'policies', label: 'Policy Compliance', icon: FileSignature }
// // // //                     ].map(tab => {
// // // //                         const Icon = tab.icon; const isActive = activeTab === tab.id;
// // // //                         return (
// // // //                             <button key={tab.id} onClick={() => setActiveTab(tab.id as TabOption)} className={`fd-tab ${isActive ? 'fd-tab--active' : ''}`} role="tab" aria-selected={isActive}>
// // // //                                 <Icon size={14} /> {tab.label}
// // // //                             </button>
// // // //                         );
// // // //                     })}
// // // //                 </div>

// // // //                 {/* TAB CONTENT */}
// // // //                 {activeTab === 'poe_vault' && (
// // // //                     <div className="fd-table-card">
// // // //                         <div className="fd-toolbar">
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // //                                 <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--fd-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                     <CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault
// // // //                                 </h3>
// // // //                                 {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && (
// // // //                                     <span className="fd-pill fd-pill--dropped">🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged</span>
// // // //                                 )}
// // // //                             </div>
// // // //                             <span style={{ fontSize: '0.75rem', color: GREEN, fontWeight: 700 }}>Page {currentPage} of {totalPages}</span>
// // // //                         </div>
// // // //                         <div className="fd-table-scroll fd-scroll">
// // // //                             <table className="fd-table">
// // // //                                 <thead>
// // // //                                     <tr><th>Learner Details</th><th>Attendance Rate</th><th>Curriculum Evidence</th><th>Progress</th><th>Governance</th><th>Auditor Flag</th><th style={{ textAlign: 'right' }}>Inspection Action</th></tr>
// // // //                                 </thead>
// // // //                                 <tbody>
// // // //                                     {paginatedLearners.map(learner => {
// // // //                                         const flagInfo = candidateFlags[learner.id]; const isFlagged = flagInfo?.flagged;
// // // //                                         const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
// // // //                                         const exportState = activeExports[learner.id] || activeExports[learner.userId]; const hasCustomNote = !!flagInfo?.note;
// // // //                                         const attPct = learner.attendance?.pct || 0; const attAttended = learner.attendance?.attended || 0; const attTotal = learner.attendance?.total || 0;
// // // //                                         return (
// // // //                                             <tr key={learner.id} className={isFlagged ? 'fd-row--expanded' : ''} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'white'), opacity: isDropped ? 0.85 : 1 }}>
// // // //                                                 <td>
// // // //                                                     <strong style={{ display: 'block', color: isDropped ? '#991b1b' : '#0f172a', fontSize: '0.88rem' }}>{learner.fullName}</strong>
// // // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
// // // //                                                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {learner.idNumber}</span>
// // // //                                                         {isDropped && <span className="fd-pill fd-pill--dropped"><UserX size={10} /> {learner.status}</span>}
// // // //                                                     </div>
// // // //                                                     <div style={{ fontSize: '0.72rem', color: 'var(--fd-blue)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={11} /> {learner.programmeName}</div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // //                                                         <span className="fd-pill" style={{ background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2', color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626', border: `1px solid ${attPct >= 75 ? '#bbf7d0' : attPct >= 40 ? '#fde68a' : '#fecaca'}` }}><Clock size={12} /> {attPct}%</span>
// // // //                                                         <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{attAttended} / {attTotal} Sessions</span>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td style={{ fontSize: '0.8rem' }}>
// // // //                                                     <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}</div>
// // // //                                                     <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}><strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs</div>
// // // //                                                     <div style={{ color: '#0f172a', fontWeight: 600 }}><strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks</div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div className="fd-score">
// // // //                                                         <div className="fd-score-bar"><div className="fd-score-fill" style={{ width: `${learner.overallProgress}%`, background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} /></div>
// // // //                                                         <span className="fd-score-num" style={{ color: isDropped ? '#991b1b' : undefined }}>{learner.overallProgress}%</span>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td>{learner.popiaConsent ? <span className="fd-pill fd-pill--passed">✓ Policy Signed</span> : <span className="fd-pill fd-pill--dropped">Unsigned</span>}</td>
// // // //                                                 <td>
// // // //                                                     {isFlagged ? <span onClick={() => handleToggleCandidateFlag(learner.id)} className="fd-pill fd-pill--dropped" style={{ cursor: 'pointer' }} title={flagInfo.note || 'Click to clear flag'}><Flag size={12} fill="currentColor" /> Flagged</span>
// // // //                                                     : <button onClick={() => handleToggleCandidateFlag(learner.id)} className="fd-btn fd-btn--ghost fd-btn--sm"><Flag size={12} /> Flag Item</button>}
// // // //                                                 </td>
// // // //                                                 <td style={{ textAlign: 'right' }}>
// // // //                                                     <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
// // // //                                                         <button onClick={() => handleOpenNotesModal(learner)} className={`fd-btn fd-btn--ghost fd-btn--sm ${hasCustomNote ? 'fd-btn--primary' : ''}`} title={hasCustomNote ? flagInfo.note : 'Leave auditor inspection note'}><MessageSquare size={14} /> {hasCustomNote ? 'Notes' : 'Add Note'}</button>
// // // //                                                         <button onClick={() => navigate(`/sor/${learner.userId || learner.id}`)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileText size={14} /> View SoR</button>
// // // //                                                         {(() => {
// // // //                                                             if (exportState?.status === 'pending' || exportState?.status === 'processing') return <button disabled className="fd-btn fd-btn--ghost fd-btn--sm"><Loader2 size={14} className="animate-spin" /> {exportState.progress}%</button>;
// // // //                                                             if (exportState?.status === 'completed' && exportState?.downloadUrl) return (<div style={{ display: 'flex', gap: '6px' }}><button onClick={() => window.open(exportState.downloadUrl, '_blank')} className="fd-btn fd-btn--ghost fd-btn--sm"><Download size={14} /> Download</button><button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm"><RefreshCw size={14} /></button></div>);
// // // //                                                             if (exportState?.status === 'error') return <button onClick={() => handleGeneratePoE(learner, true)} className="fd-btn fd-btn--ghost fd-btn--sm" style={{ color: '#dc2626' }}><AlertCircle size={14} /> Retry</button>;
// // // //                                                             return <button onClick={() => handleGeneratePoE(learner)} className="fd-btn fd-btn--ghost fd-btn--sm"><FileArchive size={14} /> Compile PoE</button>;
// // // //                                                         })()}
// // // //                                                         <button onClick={() => setInspectedLearner(learner)} className="fd-btn fd-btn--primary fd-btn--sm"><Eye size={14} /> Inspect</button>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         );
// // // //                                     })}
// // // //                                     {sampledLearners.length === 0 && (<tr><td colSpan={7} className="fd-empty"><FileCheck size={40} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} /><h4 style={{ margin: '0 0 4px', color: 'var(--fd-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4><p style={{ margin: 0, fontSize: '0.82rem' }}>No candidate records match this cohort scope or search filter.</p></td></tr>)}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                         <div className="fd-table-foot">
// // // //                             <div>Showing <strong>{sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, sampledLearners.length)}</strong> of <strong>{sampledLearners.length}</strong> sampled records</div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span>Rows per page:</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="fd-select" style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem' }}><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option></select></div>
// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm" disabled={currentPage === 1}><ChevronLeft size={14} /> Prev</button><span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button></div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {activeTab === 'mis_overview' && (
// // // //                     <div className="fd-dash fd-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
// // // //                             <div className="fd-card">
// // // //                                 <div className="fd-card-head"><h3 className="fd-card-title">Equity Group Distribution</h3></div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div className="fd-card">
// // // //                                 <div className="fd-card-head"><h3 className="fd-card-title">Gender &amp; Disability Metrics</h3></div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fd-ink)' }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div className="fd-card">
// // // //                                 <div className="fd-card-head"><h3 className="fd-card-title">Attendance Health Bands</h3></div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong></div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div className="fd-card">
// // // //                             <div className="fd-card-head"><h3 className="fd-card-title">Regulatory Report Exporters</h3></div>
// // // //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
// // // //                                 <div style={{ border: '1px solid var(--fd-line)', padding: '14px', borderRadius: '10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
// // // //                                     <div><strong style={{ fontSize: '0.85rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} color="#0284c7" /> SAQA NLRD Pipe-Delimited Batch</strong><p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>Generates 28-field statutory NLRD text/CSV file for SETA submission.</p></div>
// // // //                                     <div>
// // // //                                         {lastNlrdExport ? (
// // // //                                             <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // // //                                                 <button onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm" style={{ flex: 1 }}><Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})</button>
// // // //                                                 <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--ghost fd-btn--sm"><RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate</button>
// // // //                                             </div>
// // // //                                         ) : (
// // // //                                             <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="fd-btn fd-btn--primary" style={{ width: '100%' }}>
// // // //                                                 {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
// // // //                                                 {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
// // // //                                                 {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
// // // //                                                 {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div style={{ border: '1px solid var(--fd-line)', padding: '14px', borderRadius: '10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
// // // //                                     <div><strong style={{ fontSize: '0.85rem', color: 'var(--fd-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}><BarChart3 size={14} color="#16a34a" /> Learner Throughput Matrix (CSV)</strong><p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.</p></div>
// // // //                                     <div>
// // // //                                         {lastMatrixExport ? (
// // // //                                             <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // // //                                                 <button onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')} className="fd-btn fd-btn--primary fd-btn--sm" style={{ flex: 1, background: '#0284c7' }}><Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})</button>
// // // //                                                 <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost fd-btn--sm"><RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate</button>
// // // //                                             </div>
// // // //                                         ) : (
// // // //                                             <button onClick={handleExportThroughputMatrix} disabled={matrixProgress.status !== 'idle'} className="fd-btn fd-btn--ghost" style={{ width: '100%' }}>
// // // //                                                 {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
// // // //                                                 {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
// // // //                                                 {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
// // // //                                                 {matrixProgress.status === 'idle' && 'Download Learner Details & Throughput Ratio (CSV)'}
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {activeTab === 'grievances' && (
// // // //                     <div className="fd-table-card">
// // // //                         <div className="fd-toolbar">
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // //                                 <Filter size={14} color="#64748b" />
// // // //                                 <div className="fd-select-wrap"><select className="fd-select" value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)}><option value="ALL">All Statuses</option><option value="open">Open</option><option value="under_review">Under Review</option><option value="resolved">Resolved</option></select><ChevronDown size={14} /></div>
// // // //                                 <div className="fd-select-wrap"><select className="fd-select" value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)}><option value="ALL">All Types</option><option value="appeal">Appeals Only</option><option value="complaint">Complaints Only</option></select><ChevronDown size={14} /></div>
// // // //                             </div>
// // // //                         </div>
// // // //                         <div className="fd-table-scroll fd-scroll">
// // // //                             <table className="fd-table">
// // // //                                 <thead><tr><th>Ref ID</th><th>Learner</th><th>Type</th><th>Date Logged</th><th>Description</th><th>Status</th><th style={{ textAlign: 'right' }}>Resolution Action</th></tr></thead>
// // // //                                 <tbody>
// // // //                                     {paginatedGrievances.map(g => (
// // // //                                         <tr key={g.docId}>
// // // //                                             <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// // // //                                             <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// // // //                                             <td><span className="fd-pill fd-pill--progress">{g.type}</span></td>
// // // //                                             <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// // // //                                             <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // // //                                             <td>
// // // //                                                 {g.status === 'open' && <span className="fd-pill fd-pill--dropped">OPEN</span>}
// // // //                                                 {g.status === 'under_review' && <span className="fd-pill fd-pill--progress" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>UNDER REVIEW</span>}
// // // //                                                 {g.status === 'resolved' && <span className="fd-pill fd-pill--passed">RESOLVED</span>}
// // // //                                             </td>
// // // //                                             <td style={{ textAlign: 'right' }}><button onClick={() => { setSelectedGrievance(g); setGrievanceStatusInput(g.status); setGrievanceResolutionNotes(g.resolutionNotes || ''); }} className="fd-btn fd-btn--ghost fd-btn--sm"><Eye size={12} /> Inspect / Resolve</button></td>
// // // //                                         </tr>
// // // //                                     ))}
// // // //                                     {paginatedGrievances.length === 0 && (<tr><td colSpan={7} className="fd-empty">No grievances or appeals recorded for this cohort scope.</td></tr>)}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                         <div className="fd-table-foot">
// // // //                             <div>Showing <strong>{cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> grievances</div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button><span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesGrievances}</span><button onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button></div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {activeTab === 'policies' && (
// // // //                     <div className="fd-table-card">
// // // //                         <div className="fd-toolbar">
// // // //                             <div className="fd-search-wrap" style={{ minWidth: '260px' }}><Search size={16} /><input className="fd-search" type="text" placeholder="Search learner policy status..." value={policySearchTerm} onChange={(e) => setPolicySearchTerm(e.target.value)} /></div>
// // // //                         </div>
// // // //                         <div className="fd-table-scroll fd-scroll">
// // // //                             <table className="fd-table">
// // // //                                 <thead><tr><th>Learner Details</th><th>Cohort Scope</th><th>Code of Conduct</th><th>Appeals Policy</th><th>PoPIA Consent</th><th style={{ textAlign: 'right' }}>Compliance State</th></tr></thead>
// // // //                                 <tbody>
// // // //                                     {paginatedPolicyLearners.map(l => (
// // // //                                         <tr key={l.id}>
// // // //                                             <td><strong style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a' }}>{l.fullName}</strong><span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span></td>
// // // //                                             <td style={{ fontSize: '0.8rem', color: '#334155' }}>{l.cohortName}</td>
// // // //                                             <td>{l.codeOfConductSigned ? <span className="fd-pill fd-pill--passed">✓ SIGNED</span> : <span className="fd-pill fd-pill--dropped">UNSIGNED</span>}</td>
// // // //                                             <td>{l.appealsPolicySigned ? <span className="fd-pill fd-pill--passed">✓ SIGNED</span> : <span className="fd-pill fd-pill--dropped">UNSIGNED</span>}</td>
// // // //                                             <td>{l.popiaConsent ? <span className="fd-pill fd-pill--progress" style={{ background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd' }}>✓ CONSENTED</span> : <span className="fd-pill fd-pill--dropped">PENDING</span>}</td>
// // // //                                             <td style={{ textAlign: 'right' }}>{l.codeOfConductSigned && l.popiaConsent ? <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span> : <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>}</td>
// // // //                                         </tr>
// // // //                                     ))}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                         <div className="fd-table-foot">
// // // //                             <div>Showing <strong>{searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)}</strong> of <strong>{searchedPolicyLearners.length}</strong> candidate policies</div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="fd-btn fd-btn--ghost fd-btn--sm"><ChevronLeft size={14} /> Prev</button><span style={{ fontWeight: 700, color: 'var(--fd-blue)' }}>{currentPage} / {totalPagesPolicyLearners}</span><button onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners} className="fd-btn fd-btn--ghost fd-btn--sm">Next <ChevronRight size={14} /></button></div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //             </div>

// // // //             {/* AUDITOR LEARNER NOTE MODAL */}
// // // //             {notesModalLearner && (
// // // //                 <div className="fd-modal-overlay" onClick={() => setNotesModalLearner(null)}>
// // // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // //                         <div className="fd-modal-header">
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><NotebookPen size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Candidate Notes</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})</span></div></div>
// // // //                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={18} /></button>
// // // //                         </div>
// // // //                         <div className="fd-modal-body">
// // // //                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.</p>
// // // //                             <div><label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '6px', textTransform: 'uppercase' }}>Inspection Finding / Note *</label><textarea rows={4} value={learnerNoteInput} onChange={(e) => setLearnerNoteInput(e.target.value)} placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }} /></div>
// // // //                         </div>
// // // //                         <div className="fd-modal-footer">
// // // //                             <button onClick={() => setNotesModalLearner(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// // // //                             <button onClick={handleSaveLearnerNote} className="fd-btn fd-btn--primary"><CheckSquare size={14} /> Save Note</button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {/* GRIEVANCE RESOLUTION MODAL */}
// // // //             {selectedGrievance && (
// // // //                 <div className="fd-modal-overlay" onClick={() => setSelectedGrievance(null)}>
// // // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // // //                         <div className="fd-modal-header">
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Scale size={18} color="#4ade80" /><h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3></div>
// // // //                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
// // // //                         </div>
// // // //                         <div className="fd-modal-body">
// // // //                             <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.82rem' }}>
// // // //                                 <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div><div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div><div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
// // // //                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}><strong>Details:</strong><p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p></div>
// // // //                             </div>
// // // //                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label><select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem' }}><option value="open">Open (Awaiting Investigation)</option><option value="under_review">Under Review by Moderation Committee</option><option value="resolved">Resolved (Official Findings Logged)</option></select></div>
// // // //                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label><textarea rows={4} value={grievanceResolutionNotes} onChange={(e) => setGrievanceResolutionNotes(e.target.value)} placeholder="Enter committee notes, resolution details, or outcome letter comments..." style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} /></div>
// // // //                         </div>
// // // //                         <div className="fd-modal-footer">
// // // //                             <button onClick={() => setSelectedGrievance(null)} className="fd-btn fd-btn--ghost">Cancel</button>
// // // //                             <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} className="fd-btn fd-btn--primary">{isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution Record</button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {/* READ-ONLY POE INSPECTION DRAWER */}
// // // //             {inspectedLearner && (
// // // //                 <div className="fd-modal-overlay" onClick={() => setInspectedLearner(null)}>
// // // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh' }}>
// // // //                         <div className="fd-modal-header">
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileCheck size={20} color={GREEN} /><div><h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Auditor Inspection Vault: {inspectedLearner.fullName}</h3><span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}</span><div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>Target Qualification: {inspectedLearner.programmeName}</div></div></div>
// // // //                             <button onClick={() => setInspectedLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // // //                         </div>
// // // //                         <div className="fd-modal-body">
// // // //                             {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (<div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><UserX size={16} color="#dc2626" /><span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span></div>)}
// // // //                             <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
// // // //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} /><strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'var(--fd-blue)' }}>Auditor Candidate Spot-Check Flag</strong></div>
// // // //                                     <button onClick={() => handleToggleCandidateFlag(inspectedLearner.id)} className={`fd-btn fd-btn--sm ${candidateFlags[inspectedLearner.id]?.flagged ? 'fd-btn--primary' : 'fd-btn--ghost'}`} style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : undefined, color: candidateFlags[inspectedLearner.id]?.flagged ? '#fff' : undefined }}>{candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate'}</button>
// // // //                                 </div>
// // // //                                 {candidateFlags[inspectedLearner.id]?.flagged && (<textarea rows={2} value={candidateFlags[inspectedLearner.id]?.note || ''} onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)} placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '10px', fontSize: '0.8rem', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />)}
// // // //                             </div>
// // // //                             <div>
// // // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={14} /> Curriculum Completion &amp; Attendance Ledger</h4>
// // // //                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', background: '#fff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
// // // //                                     <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
// // // //                                     <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
// // // //                                     <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
// // // //                                     <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
// // // //                                     <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div>
// // // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--fd-blue)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})</h4>
// // // //                                 {inspectedLearnerSubmissions.length === 0 ? (<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '0.82rem' }}><AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />No digital submission documents found in Firestore for this candidate ID.</div>)
// // // //                                 : (<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{inspectedLearnerSubmissions.map((sub: any) => { const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task'; const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase(); const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl; const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase()); return (<div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.82rem' }}><div><div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><span>{subTitle}</span><span className="fd-pill fd-pill--progress" style={{ fontSize: '0.65rem' }}>{subType}</span></div><div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong></div></div><div>{fileUrl ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fd-btn fd-btn--ghost fd-btn--sm"><ExternalLink size={12} /> View File</a> : <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>}</div></div>); })}</div>)}
// // // //                             </div>
// // // //                         </div>
// // // //                         <div className="fd-modal-footer">
// // // //                             <button onClick={() => setInspectedLearner(null)} className="fd-btn fd-btn--primary">Close Inspection Drawer</button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {/* ENDORSEMENT SIGN-OFF MODAL */}
// // // //             {showEndorseModal && (
// // // //                 <div className="fd-modal-overlay" onClick={() => setShowEndorseModal(false)}>
// // // //                     <div className="fd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // //                         <div className="fd-modal-header">
// // // //                             <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Record Official Audit Sign-Off</h3>
// // // //                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // // //                         </div>
// // // //                         <div className="fd-modal-body">
// // // //                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label><select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', color: '#0f172a', background: '#f8fafc', fontWeight: 600 }}><option value="approved">Fully Approved &amp; Endorsed</option><option value="conditional">Conditional Approval (Minor Corrective Actions)</option><option value="rejected">Rejected (Major Compliance Audit Failure)</option></select></div>
// // // //                             <div><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fd-blue)', marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label><textarea rows={5} value={auditNotes} onChange={(e) => setAuditNotes(e.target.value)} placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..." style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }} /></div>
// // // //                         </div>
// // // //                         <div className="fd-modal-footer">
// // // //                             <button onClick={() => setShowEndorseModal(false)} className="fd-btn fd-btn--ghost">Cancel</button>
// // // //                             <button onClick={handleSaveEndorsement} disabled={isSavingEndorsement} className="fd-btn fd-btn--primary">{isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record</button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {/* STATUS MODAL */}
// // // //             {statusModal.isOpen && (
// // // //                 <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} confirmText="Acknowledge" onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))} />
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // export default AuditorPortalView;


// // // // // // src/pages/AuditorPortal/AuditorPortalView.tsx

// // // // // import React, { useState, useEffect, useMemo, useCallback } from 'react';
// // // // // import { useSearchParams, useNavigate } from 'react-router-dom';
// // // // // import {
// // // // //     ShieldCheck, Search, Eye, Lock,
// // // // //     FileCheck, UserCheck, X, CheckSquare,
// // // // //     Briefcase, Activity, Users, Award,
// // // // //     Loader2, ChevronLeft, ChevronRight,
// // // // //     Printer, Flag, ExternalLink, AlertCircle, CheckCircle2,
// // // // //     FileText, PieChart, BarChart3, TrendingUp, UserX,
// // // // //     Scale, Filter, Bell, Download, RefreshCw,
// // // // //     FileArchive,
// // // // //     FileSignature,
// // // // //     MessageSquare, NotebookPen, Tag,
// // // // //     BookOpen, Layers, Clock, Calendar
// // // // // } from 'lucide-react';
// // // // // import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
// // // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // // import { db } from '../../lib/firebase';
// // // // // import { useStore } from '../../store/useStore';
// // // // // import { useToast } from '../../components/common/Toast/Toast';
// // // // // import Loader from '../../components/common/Loader/Loader';
// // // // // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // // // // import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// // // // // type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

// // // // // interface SampledLearner {
// // // // //     id: string;
// // // // //     userId: string;
// // // // //     fullName: string;
// // // // //     idNumber: string;
// // // // //     cohortId: string;
// // // // //     cohortName: string;
// // // // //     programmeName: string;
// // // // //     overallProgress: number;
// // // // //     attendance: { attended: number; total: number; pct: number };
// // // // //     formatives: { completed: number; total: number };
// // // // //     summatives: { completed: number; total: number };
// // // // //     practicals: { completed: number; total: number };
// // // // //     workplaces: { completed: number; total: number };
// // // // //     sorStatus: string;
// // // // //     popiaConsent: boolean;
// // // // //     hasSignature: boolean;
// // // // //     status: string;
// // // // //     gender?: string;
// // // // //     equityGroup?: string;
// // // // //     disabilityStatus?: string;
// // // // //     birthDate?: string;
// // // // //     codeOfConductSigned?: boolean;
// // // // //     appealsPolicySigned?: boolean;
// // // // // }

// // // // // interface AuditorLearnerFlag {
// // // // //     flagged: boolean;
// // // // //     note: string;
// // // // // }

// // // // // interface GrievanceRecord {
// // // // //     docId: string;
// // // // //     id: string;
// // // // //     learnerName: string;
// // // // //     cohortId: string;
// // // // //     dateLogged: string;
// // // // //     type: 'appeal' | 'complaint';
// // // // //     status: 'open' | 'under_review' | 'resolved';
// // // // //     description: string;
// // // // //     resolutionNotes?: string;
// // // // // }

// // // // // interface ActiveExport {
// // // // //     requestId: string;
// // // // //     learnerId: string;
// // // // //     progress: number;
// // // // //     progressMessage: string;
// // // // //     status: 'pending' | 'processing' | 'completed' | 'error';
// // // // //     downloadUrl?: string;
// // // // //     errorMessage?: string;
// // // // // }

// // // // // interface ExportProgressState {
// // // // //     status: 'idle' | 'generating' | 'downloading';
// // // // //     percent: number;
// // // // // }

// // // // // interface ReportCache {
// // // // //     downloadUrl: string;
// // // // //     generatedAt: string;
// // // // //     totalRecords?: number;
// // // // // }

// // // // // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // // // // const MIDNIGHT = '#073f4e';
// // // // // const GREEN = '#94c73d';

// // // // // const downloadFileWithProgress = (
// // // // //     url: string,
// // // // //     filename: string,
// // // // //     onProgress: (percent: number) => void
// // // // // ): Promise<void> => {
// // // // //     return new Promise((resolve, reject) => {
// // // // //         const xhr = new XMLHttpRequest();
// // // // //         xhr.open('GET', url, true);
// // // // //         xhr.responseType = 'blob';

// // // // //         xhr.onprogress = (event) => {
// // // // //             if (event.lengthComputable && event.total > 0) {
// // // // //                 const percent = Math.round((event.loaded / event.total) * 100);
// // // // //                 onProgress(percent);
// // // // //             } else if (event.loaded > 0) {
// // // // //                 const estimatedTotal = event.loaded + 50000;
// // // // //                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
// // // // //                 onProgress(percent);
// // // // //             }
// // // // //         };

// // // // //         xhr.onload = () => {
// // // // //             if (xhr.status === 200) {
// // // // //                 const blob = xhr.response;
// // // // //                 const blobUrl = window.URL.createObjectURL(blob);
// // // // //                 const link = document.createElement('a');
// // // // //                 link.href = blobUrl;
// // // // //                 link.download = filename;
// // // // //                 document.body.appendChild(link);
// // // // //                 link.click();
// // // // //                 document.body.removeChild(link);
// // // // //                 window.URL.revokeObjectURL(blobUrl);
// // // // //                 onProgress(100);
// // // // //                 resolve();
// // // // //             } else {
// // // // //                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
// // // // //             }
// // // // //         };

// // // // //         xhr.onerror = () => reject(new Error('Network error during file download.'));
// // // // //         xhr.send();
// // // // //     });
// // // // // };

// // // // // export const AuditorPortalView: React.FC = () => {
// // // // //     const toast = useToast();
// // // // //     const navigate = useNavigate();
// // // // //     const [searchParams, setSearchParams] = useSearchParams();

// // // // //     const {
// // // // //         user: currentUser,
// // // // //         cohorts: storeCohorts,
// // // // //         learners: storeLearners,
// // // // //         programmes: storeProgrammes,
// // // // //         fetchProgrammes,
// // // // //         fetchCohorts,
// // // // //         fetchLearners
// // // // //     } = useStore() as any;

// // // // //     const initialCohortFromUrl = searchParams.get('cohort') || '';
// // // // //     const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
// // // // //     const initialSearchFromUrl = searchParams.get('search') || '';

// // // // //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// // // // //     const [isLoading, setIsLoading] = useState(true);
// // // // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
// // // // //     const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
// // // // //     const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);

// // // // //     const [currentPage, setCurrentPage] = useState<number>(1);
// // // // //     const [itemsPerPage, setItemsPerPage] = useState<number>(10);

// // // // //     const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});

// // // // //     // AUDITOR LEARNER NOTE MODAL STATE
// // // // //     const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
// // // // //     const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');

// // // // //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// // // // //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// // // // //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);

// // // // //     const [rawUsers, setRawUsers] = useState<any[]>([]);
// // // // //     const [rawLearners, setRawLearners] = useState<any[]>([]);
// // // // //     const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);

// // // // //     // REAL-TIME ATTENDANCE DATA STREAMS
// // // // //     const [rawAttendance, setRawAttendance] = useState<any[]>([]);
// // // // //     const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
// // // // //     const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);

// // // // //     const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);

// // // // //     const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
// // // // //     const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
// // // // //     const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
// // // // //     const [isSavingGrievance, setIsSavingGrievance] = useState(false);
// // // // //     const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
// // // // //     const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');

// // // // //     const [policySearchTerm, setPolicySearchTerm] = useState('');

// // // // //     const [showEndorseModal, setShowEndorseModal] = useState(false);
// // // // //     const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
// // // // //     const [auditNotes, setAuditNotes] = useState('');
// // // // //     const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);

// // // // //     const [statusModal, setStatusModal] = useState<{
// // // // //         isOpen: boolean;
// // // // //         type: StatusType;
// // // // //         title: string;
// // // // //         message: string;
// // // // //     }>({
// // // // //         isOpen: false,
// // // // //         type: 'error',
// // // // //         title: '',
// // // // //         message: ''
// // // // //     });

// // // // //     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // // // //     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// // // // //     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
// // // // //     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

// // // // //     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

// // // // //     useEffect(() => {
// // // // //         if (!currentUser?.isTemporaryAuditor) {
// // // // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // // // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // // // //             if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
// // // // //         } else {
// // // // //             if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
// // // // //             if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
// // // // //         }
// // // // //     }, [currentUser?.isTemporaryAuditor]);

// // // // //     useEffect(() => {
// // // // //         setCurrentPage(1);
// // // // //     }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);

// // // // //     useEffect(() => {
// // // // //         setLastNlrdExport(null);
// // // // //         setLastMatrixExport(null);
// // // // //     }, [selectedCohortId]);

// // // // //     // Real-Time Listener for Historical & Active PoE Exports
// // // // //     useEffect(() => {
// // // // //         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
// // // // //         const unsubPoe = onSnapshot(qPoe, (snap) => {
// // // // //             const exportsMap: Record<string, ActiveExport> = {};
// // // // //             snap.docs.forEach(docSnap => {
// // // // //                 const data = docSnap.data();
// // // // //                 const lId = data.learnerId;
// // // // //                 if (lId && !exportsMap[lId]) {
// // // // //                     exportsMap[lId] = {
// // // // //                         requestId: docSnap.id,
// // // // //                         learnerId: lId,
// // // // //                         progress: data.progress || 0,
// // // // //                         progressMessage: data.progressMessage || '',
// // // // //                         status: data.status || 'pending',
// // // // //                         downloadUrl: data.downloadUrl,
// // // // //                         errorMessage: data.errorMessage
// // // // //                     };
// // // // //                 }
// // // // //             });
// // // // //             setActiveExports(prev => ({ ...exportsMap, ...prev }));
// // // // //         });

// // // // //         return () => unsubPoe();
// // // // //     }, []);

// // // // //     const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
// // // // //         const newParams: Record<string, string> = {};
// // // // //         if (cohortId) newParams.cohort = cohortId;
// // // // //         if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
// // // // //         if (search) newParams.search = search;

// // // // //         setSearchParams(newParams, { replace: true });
// // // // //     }, [setSearchParams]);

// // // // //     const allowedCohortsForAuditor = useMemo(() => {
// // // // //         if (!storeCohorts || storeCohorts.length === 0) return [];

// // // // //         const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
// // // // //         if (isFullAdmin) return storeCohorts;

// // // // //         const allowedIds: string[] = Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : [];

// // // // //         if (allowedIds.length > 0) {
// // // // //             return storeCohorts.filter((c: any) => allowedIds.includes(c.id));
// // // // //         }

// // // // //         return storeCohorts;
// // // // //     }, [storeCohorts, currentUser?.role, currentUser?.isSuperAdmin, currentUser?.allowedCohortIds]);

// // // // //     useEffect(() => {
// // // // //         if (allowedCohortsForAuditor.length > 0) {
// // // // //             const isValidSelection = allowedCohortsForAuditor.some((c: any) => c.id === selectedCohortId);

// // // // //             if (!selectedCohortId || !isValidSelection) {
// // // // //                 const defaultCohortId = allowedCohortsForAuditor[0].id;
// // // // //                 setSelectedCohortId(defaultCohortId);
// // // // //                 syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
// // // // //             }
// // // // //         } else {
// // // // //             setSelectedCohortId('');
// // // // //         }
// // // // //     }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

// // // // //     // Real-time Firestore Subscriptions
// // // // //     useEffect(() => {
// // // // //         setIsLoading(true);

// // // // //         const handlePermissionError = (collectionName: string, err: any) => {
// // // // //             console.warn(`[Firestore Permission Guard] Access to '${collectionName}' restricted:`, err);
// // // // //             setIsLoading(false);
// // // // //         };

// // // // //         const unsubEnrollments = onSnapshot(
// // // // //             collection(db, 'enrollments'),
// // // // //             (snap) => {
// // // // //                 const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // //                 setRawEnrollments(enrolls);
// // // // //             },
// // // // //             (err) => handlePermissionError('enrollments', err)
// // // // //         );

// // // // //         const unsubSubmissions = onSnapshot(
// // // // //             collection(db, 'learner_submissions'),
// // // // //             (snap) => {
// // // // //                 const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // //                 setRawSubmissions(subs);
// // // // //                 setIsLoading(false);
// // // // //             },
// // // // //             (err) => handlePermissionError('learner_submissions', err)
// // // // //         );

// // // // //         const unsubUsers = onSnapshot(
// // // // //             collection(db, 'users'),
// // // // //             (snap) => {
// // // // //                 const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // //                 setRawUsers(users);
// // // // //             },
// // // // //             (err) => handlePermissionError('users', err)
// // // // //         );

// // // // //         const unsubLearners = onSnapshot(
// // // // //             collection(db, 'learners'),
// // // // //             (snap) => {
// // // // //                 const learners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // // //                 setRawLearners(learners);
// // // // //             },
// // // // //             (err) => handlePermissionError('learners', err)
// // // // //         );

// // // // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // // // //         const unsubGrievances = onSnapshot(
// // // // //             qGrievances,
// // // // //             (snap) => {
// // // // //                 const parsedGrievances: GrievanceRecord[] = [];
// // // // //                 snap.docs.forEach(docSnap => {
// // // // //                     const data = docSnap.data();
// // // // //                     parsedGrievances.push({
// // // // //                         docId: docSnap.id,
// // // // //                         id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(),
// // // // //                         learnerName: data.learnerName || 'Unknown Learner',
// // // // //                         cohortId: data.cohortId || data.cohortRunId || '',
// // // // //                         dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // // // //                         type: data.type || 'appeal',
// // // // //                         status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// // // // //                         description: data.reason || data.description || 'No description provided',
// // // // //                         resolutionNotes: data.resolutionNotes || ''
// // // // //                     });
// // // // //                 });
// // // // //                 setRawGrievances(parsedGrievances);
// // // // //             },
// // // // //             (err) => handlePermissionError('assessment_appeals', err)
// // // // //         );

// // // // //         const unsubPolicies = onSnapshot(
// // // // //             collection(db, 'learner_policy_signoffs'),
// // // // //             (snap) => {
// // // // //                 const signoffs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // // //                 setRawPolicySignoffs(signoffs);
// // // // //             },
// // // // //             (err) => handlePermissionError('learner_policy_signoffs', err)
// // // // //         );

// // // // //         // ATTENDANCE STREAMS
// // // // //         const unsubAttendance = onSnapshot(
// // // // //             collection(db, 'attendance'),
// // // // //             (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // // // //             (err) => handlePermissionError('attendance', err)
// // // // //         );

// // // // //         const unsubAttLogs = onSnapshot(
// // // // //             collection(db, 'attendance_logs'),
// // // // //             (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // // // //             (err) => handlePermissionError('attendance_logs', err)
// // // // //         );

// // // // //         const unsubAttRecords = onSnapshot(
// // // // //             collection(db, 'attendance_records'),
// // // // //             (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
// // // // //             (err) => handlePermissionError('attendance_records', err)
// // // // //         );

// // // // //         return () => {
// // // // //             unsubEnrollments();
// // // // //             unsubSubmissions();
// // // // //             unsubUsers();
// // // // //             unsubLearners();
// // // // //             unsubGrievances();
// // // // //             unsubPolicies();
// // // // //             unsubAttendance();
// // // // //             unsubAttLogs();
// // // // //             unsubAttRecords();
// // // // //         };
// // // // //     }, []);

// // // // //     const addCleanKey = (setObj: Set<string>, val: any) => {
// // // // //         if (val && typeof val === 'string') {
// // // // //             const cleaned = val.trim().toLowerCase();
// // // // //             if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') {
// // // // //                 setObj.add(cleaned);
// // // // //             }
// // // // //         }
// // // // //     };

// // // // //     const checkCocSignedInObject = (obj: any) => {
// // // // //         if (!obj) return false;
// // // // //         const demo = obj.demographics || {};
// // // // //         return (
// // // // //             obj.codeOfConductSigned === true ||
// // // // //             obj.hasSignedCoc === true ||
// // // // //             obj.cocSigned === true ||
// // // // //             obj.policySigned === true ||
// // // // //             obj.isPolicySigned === true ||
// // // // //             demo.codeOfConductSigned === true ||
// // // // //             demo.hasSignedCoc === true ||
// // // // //             demo.cocSigned === true ||
// // // // //             demo.policySigned === true ||
// // // // //             !!obj.signatureUrl ||
// // // // //             !!demo.signatureUrl
// // // // //         );
// // // // //     };

// // // // //     const cocSignedKeysSet = useMemo(() => {
// // // // //         const keys = new Set<string>();

// // // // //         rawPolicySignoffs.forEach((d: any) => {
// // // // //             addCleanKey(keys, d.id);
// // // // //             addCleanKey(keys, d.userId);
// // // // //             addCleanKey(keys, d.learnerId);
// // // // //             addCleanKey(keys, d.authUid);
// // // // //             addCleanKey(keys, d.idNumber);
// // // // //             addCleanKey(keys, d.userEmail);
// // // // //             addCleanKey(keys, d.email);
// // // // //         });

// // // // //         rawUsers.forEach((u: any) => {
// // // // //             if (checkCocSignedInObject(u)) {
// // // // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // // // //             }
// // // // //         });

// // // // //         rawLearners.forEach((l: any) => {
// // // // //             if (checkCocSignedInObject(l)) {
// // // // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // // // //             }
// // // // //         });

// // // // //         rawEnrollments.forEach((e: any) => {
// // // // //             if (checkCocSignedInObject(e)) {
// // // // //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// // // // //             }
// // // // //         });

// // // // //         return keys;
// // // // //     }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

// // // // //     const appealsSignedKeysSet = useMemo(() => {
// // // // //         const keys = new Set<string>();

// // // // //         rawPolicySignoffs.forEach((d: any) => {
// // // // //             const type = String(d.policyType || d.policyName || '').toLowerCase();
// // // // //             if (type.includes('appeal')) {
// // // // //                 addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email);
// // // // //             }
// // // // //         });

// // // // //         rawUsers.forEach((u: any) => {
// // // // //             if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) {
// // // // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // // // //             }
// // // // //         });

// // // // //         rawLearners.forEach((l: any) => {
// // // // //             if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) {
// // // // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // // // //             }
// // // // //         });

// // // // //         return keys;
// // // // //     }, [rawPolicySignoffs, rawUsers, rawLearners]);

// // // // //     const popiaConsentKeysSet = useMemo(() => {
// // // // //         const keys = new Set<string>();

// // // // //         rawUsers.forEach((u: any) => {
// // // // //             const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true';
// // // // //             if (isConsent) {
// // // // //                 addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
// // // // //             }
// // // // //         });

// // // // //         rawLearners.forEach((l: any) => {
// // // // //             const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true';
// // // // //             if (isConsent) {
// // // // //                 addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
// // // // //             }
// // // // //         });

// // // // //         rawEnrollments.forEach((e: any) => {
// // // // //             const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true';
// // // // //             if (isConsent) {
// // // // //                 addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
// // // // //             }
// // // // //         });

// // // // //         return keys;
// // // // //     }, [rawUsers, rawLearners, rawEnrollments]);

// // // // //     // RESOLVE ACTIVE PROGRAMME DATA FOR THE CURRENTLY SELECTED COHORT SCOPE
// // // // //     const activeProgrammeData = useMemo(() => {
// // // // //         if (!selectedCohortId) return null;
// // // // //         const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
// // // // //         if (!cohort) return null;

// // // // //         return storeProgrammes?.find((p: any) =>
// // // // //             p.id === cohort.programmeId ||
// // // // //             p.id === cohort.qualificationId ||
// // // // //             (p.saqaId && String(p.saqaId) === String(cohort.saqaId))
// // // // //         ) || null;
// // // // //     }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

// // // // //     // 🚀 UNIFIED ATTENDANCE AGGREGATOR (MIRRORS QCTOCOHORTVIEW)
// // // // //     const dailyRegisters = useMemo(() => {
// // // // //         const unifiedMap = new Map<string, any>();

// // // // //         const matchCohort = (r: any) => {
// // // // //             if (!selectedCohortId || selectedCohortId === 'ALL') return true;
// // // // //             const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim();
// // // // //             return rCohort === selectedCohortId;
// // // // //         };

// // // // //         const filteredAtt = rawAttendance.filter(matchCohort);
// // // // //         const filteredLogs = rawAttendanceLogs.filter(matchCohort);
// // // // //         const filteredRecords = rawAttendanceRecords.filter(matchCohort);

// // // // //         // 1. Process Legacy / Ecosystem Individual Records (from 'attendance')
// // // // //         filteredAtt.forEach(record => {
// // // // //             if (record.presentLearners || record.absentLearners) {
// // // // //                 const dateKey = record.date || record.id;
// // // // //                 unifiedMap.set(record.id || dateKey, {
// // // // //                     id: record.id || dateKey,
// // // // //                     date: record.date || 'Unknown',
// // // // //                     presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [],
// // // // //                     absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [],
// // // // //                     partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : []
// // // // //                 });
// // // // //             } else if (record.learnerId && record.date) {
// // // // //                 const dateKey = `eco_${record.date}`;
// // // // //                 if (!unifiedMap.has(dateKey)) {
// // // // //                     unifiedMap.set(dateKey, {
// // // // //                         id: dateKey,
// // // // //                         date: record.date,
// // // // //                         presentLearners: [],
// // // // //                         absentLearners: [],
// // // // //                         partialLearners: []
// // // // //                     });
// // // // //                 }
// // // // //                 const entry = unifiedMap.get(dateKey);
// // // // //                 const status = String(record.status || '').toLowerCase();

// // // // //                 if (status.includes('present')) entry.presentLearners.push(record.learnerId);
// // // // //                 else if (status.includes('absent')) entry.absentLearners.push(record.learnerId);
// // // // //                 else if (status.includes('partial')) entry.partialLearners.push(record.learnerId);
// // // // //             }
// // // // //         });

// // // // //         // 2. Process Zoom / Session Logs Data (attendance_logs + attendance_records)
// // // // //         filteredLogs.forEach(log => {
// // // // //             const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
// // // // //             const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);

// // // // //             const present: string[] = [];
// // // // //             const absent: string[] = [];
// // // // //             const partial: string[] = [];

// // // // //             recordsForLog.forEach(r => {
// // // // //                 const status = String(r.status || '').toLowerCase();
// // // // //                 const lKey = r.learnerId || r.authUid || r.userId;
// // // // //                 if (lKey) {
// // // // //                     if (status.includes('present')) present.push(lKey);
// // // // //                     else if (status.includes('absent')) absent.push(lKey);
// // // // //                     else if (status.includes('partial')) partial.push(lKey);
// // // // //                 }
// // // // //             });

// // // // //             unifiedMap.set(log.id, {
// // // // //                 id: log.id,
// // // // //                 date: dateStr,
// // // // //                 presentLearners: present,
// // // // //                 absentLearners: absent,
// // // // //                 partialLearners: partial
// // // // //             });
// // // // //         });

// // // // //         const unifiedArray = Array.from(unifiedMap.values());
// // // // //         unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// // // // //         return unifiedArray;
// // // // //     }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

// // // // //     // 🚀 MAP ATTENDANCE STATS PER CANDIDATE GROUP (MIRRORS QCTOCOHORTVIEW)
// // // // //     const rosterAttendanceMap = useMemo(() => {
// // // // //         const keyAttendanceMap = new Map<string, number>();
// // // // //         const totalSessions = dailyRegisters.length;

// // // // //         // Group all known identifiers per candidate
// // // // //         const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
// // // // //             const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
// // // // //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
// // // // //             const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
// // // // //             const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));

// // // // //             const keys = [
// // // // //                 e.id,
// // // // //                 e.userId,
// // // // //                 e.learnerId,
// // // // //                 e.authUid,
// // // // //                 e.idNumber,
// // // // //                 actualUserId,
// // // // //                 storeLearner?.id,
// // // // //                 storeLearner?.learnerId,
// // // // //                 storeLearner?.authUid,
// // // // //                 storeLearner?.idNumber,
// // // // //                 rawUser?.id,
// // // // //                 rawUser?.authUid,
// // // // //                 rawUser?.idNumber,
// // // // //                 rawLearner?.id,
// // // // //                 rawLearner?.authUid,
// // // // //                 rawLearner?.idNumber
// // // // //             ].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');

// // // // //             return Array.from(new Set(keys.map(k => k.trim().toLowerCase())));
// // // // //         });

// // // // //         // Initialize keyAttendanceMap
// // // // //         candidateKeyGroups.forEach(group => {
// // // // //             group.forEach(k => {
// // // // //                 keyAttendanceMap.set(k, 0);
// // // // //             });
// // // // //         });

// // // // //         // Loop registers and count present sessions
// // // // //         dailyRegisters.forEach(reg => {
// // // // //             const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase());

// // // // //             candidateKeyGroups.forEach(group => {
// // // // //                 const isCandidatePresent = group.some(k => presentList.includes(k));
// // // // //                 if (isCandidatePresent) {
// // // // //                     group.forEach(k => {
// // // // //                         keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1);
// // // // //                     });
// // // // //                 }
// // // // //             });
// // // // //         });

// // // // //         // Consolidate into final map
// // // // //         const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
// // // // //         candidateKeyGroups.forEach(group => {
// // // // //             const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0);
// // // // //             const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0;
// // // // //             const stats = { attended: bestAttended, total: totalSessions, pct };

// // // // //             group.forEach(k => {
// // // // //                 finalMap.set(k, stats);
// // // // //             });
// // // // //         });

// // // // //         return finalMap;
// // // // //     }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

// // // // //     const handleCohortChange = (cohortId: string) => {
// // // // //         setSelectedCohortId(cohortId);
// // // // //         syncQueryParams(cohortId, samplePercentage, searchTerm);
// // // // //     };

// // // // //     const handleSamplePercentageChange = (pct: number) => {
// // // // //         setSamplePercentage(pct);
// // // // //         setSearchTerm('');
// // // // //         syncQueryParams(selectedCohortId, pct, '');
// // // // //     };

// // // // //     const handleSearchChange = (term: string) => {
// // // // //         setSearchTerm(term);
// // // // //         syncQueryParams(selectedCohortId, samplePercentage, term);
// // // // //     };

// // // // //     const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => {
// // // // //         setCandidateFlags(prev => {
// // // // //             const current = prev[candidateId];
// // // // //             const isCurrentlyFlagged = current?.flagged;
// // // // //             return {
// // // // //                 ...prev,
// // // // //                 [candidateId]: {
// // // // //                     flagged: !isCurrentlyFlagged,
// // // // //                     note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : ''
// // // // //                 }
// // // // //             };
// // // // //         });
// // // // //         toast.info("Candidate spot-check flag status updated.");
// // // // //     };

// // // // //     const handleUpdateFlagNote = (candidateId: string, noteText: string) => {
// // // // //         setCandidateFlags(prev => ({
// // // // //             ...prev,
// // // // //             [candidateId]: {
// // // // //                 flagged: true,
// // // // //                 note: noteText
// // // // //             }
// // // // //         }));
// // // // //     };

// // // // //     const handleOpenNotesModal = (learner: SampledLearner) => {
// // // // //         setNotesModalLearner(learner);
// // // // //         setLearnerNoteInput(candidateFlags[learner.id]?.note || '');
// // // // //     };

// // // // //     const handleSaveLearnerNote = () => {
// // // // //         if (!notesModalLearner) return;
// // // // //         handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput);
// // // // //         toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`);
// // // // //         setNotesModalLearner(null);
// // // // //     };

// // // // //     const handleExportSampleManifest = () => {
// // // // //         if (sampledLearners.length === 0) {
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'info',
// // // // //                 title: 'No Sampled Records',
// // // // //                 message: 'There are currently no sampled records available in the selected cohort view to export.'
// // // // //             });
// // // // //             return;
// // // // //         }

// // // // //         const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];

// // // // //         const csvRows = sampledLearners.map(l => {
// // // // //             const flag = candidateFlags[l.id];

// // // // //             const rawIdStr = String(l.idNumber || '').trim();
// // // // //             const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr))
// // // // //                 ? rawIdStr.padStart(13, '0')
// // // // //                 : rawIdStr;
// // // // //             const textFormattedId = `="${paddedId}"`;

// // // // //             return [
// // // // //                 `"${l.fullName.replace(/"/g, '""')}"`,
// // // // //                 textFormattedId,
// // // // //                 `"${l.status}"`,
// // // // //                 `"${l.cohortName.replace(/"/g, '""')}"`,
// // // // //                 `"${l.programmeName.replace(/"/g, '""')}"`,
// // // // //                 `${l.overallProgress}%`,
// // // // //                 `${l.attendance.pct}%`,
// // // // //                 `"${l.attendance.attended}/${l.attendance.total}"`,
// // // // //                 `"${l.formatives.completed}/${l.formatives.total}"`,
// // // // //                 `"${l.summatives.completed}/${l.summatives.total}"`,
// // // // //                 `"${l.practicals.completed}/${l.practicals.total}"`,
// // // // //                 `"${l.workplaces.completed}/${l.workplaces.total}"`,
// // // // //                 l.popiaConsent ? 'Signed' : 'Unsigned',
// // // // //                 flag?.flagged ? 'FLAGGED' : 'CLEAR',
// // // // //                 `"${(flag?.note || '').replace(/"/g, '""')}"`
// // // // //             ].join(',');
// // // // //         });

// // // // //         const csvContent = [headers.join(','), ...csvRows].join('\n');
// // // // //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
// // // // //         const url = URL.createObjectURL(blob);
// // // // //         const link = document.createElement('a');
// // // // //         link.href = url;
// // // // //         link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`);
// // // // //         document.body.appendChild(link);
// // // // //         link.click();
// // // // //         document.body.removeChild(link);
// // // // //         URL.revokeObjectURL(url);

// // // // //         toast.success("Sample Manifest exported to CSV.");
// // // // //     };

// // // // //     // Master PoE Request Handshake with Firestore Background Worker
// // // // //     const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
// // // // //         const targetLearnerId = learner.userId || learner.id;
// // // // //         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

// // // // //         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
// // // // //             toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`);
// // // // //             return;
// // // // //         }

// // // // //         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
// // // // //             window.open(currentExport.downloadUrl, '_blank');
// // // // //             return;
// // // // //         }

// // // // //         try {
// // // // //             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);

// // // // //             const docRef = await addDoc(collection(db, 'poe_export_requests'), {
// // // // //                 learnerId: targetLearnerId,
// // // // //                 requestedBy: currentUser?.uid || currentUser?.id || 'auditor',
// // // // //                 status: 'pending',
// // // // //                 progress: 0,
// // // // //                 progressMessage: 'Initializing compliance engine...',
// // // // //                 createdAt: serverTimestamp()
// // // // //             });

// // // // //             setActiveExports(prev => ({
// // // // //                 ...prev,
// // // // //                 [learner.id]: {
// // // // //                     requestId: docRef.id,
// // // // //                     learnerId: targetLearnerId,
// // // // //                     progress: 0,
// // // // //                     progressMessage: 'Initializing compliance engine...',
// // // // //                     status: 'pending'
// // // // //                 },
// // // // //                 [targetLearnerId]: {
// // // // //                     requestId: docRef.id,
// // // // //                     learnerId: targetLearnerId,
// // // // //                     progress: 0,
// // // // //                     progressMessage: 'Initializing compliance engine...',
// // // // //                     status: 'pending'
// // // // //                 }
// // // // //             }));
// // // // //         } catch (error: any) {
// // // // //             console.error('Error requesting PoE export:', error);
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'error',
// // // // //                 title: 'Export Initialization Failed',
// // // // //                 message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.`
// // // // //             });
// // // // //         }
// // // // //     };

// // // // //     // Build Cohort Learner Pool
// // // // //     const cohortPool = useMemo(() => {
// // // // //         if (!selectedCohortId) return [];

// // // // //         const filteredEnrollments = rawEnrollments.filter(e =>
// // // // //             e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId
// // // // //         );

// // // // //         return filteredEnrollments.map((enrol): SampledLearner => {
// // // // //             const enrolKeys = [
// // // // //                 enrol.userId,
// // // // //                 enrol.learnerId,
// // // // //                 enrol.authUid,
// // // // //                 enrol.idNumber,
// // // // //                 enrol.id,
// // // // //                 enrol.uid
// // // // //             ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

// // // // //             const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';

// // // // //             // Robust multi-field candidate matcher
// // // // //             const matchesLearner = (candidate: any) => {
// // // // //                 if (!candidate) return false;
// // // // //                 const candidateKeys = [
// // // // //                     candidate.id,
// // // // //                     candidate.learnerId,
// // // // //                     candidate.idNumber,
// // // // //                     candidate.authUid,
// // // // //                     candidate.uid,
// // // // //                     candidate.userId
// // // // //                 ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

// // // // //                 const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase()));
// // // // //                 const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail;

// // // // //                 return hasKeyMatch || hasEmailMatch;
// // // // //             };

// // // // //             const storeLearner = storeLearners?.find(matchesLearner);
// // // // //             const rawUser = rawUsers?.find(matchesLearner);
// // // // //             const rawLearner = rawLearners?.find(matchesLearner);

// // // // //             const activeCohortId = enrol.cohortId || enrol.cohortRunId;
// // // // //             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

// // // // //             // ENRICHED PROGRAMME / QUALIFICATION LOOKUP
// // // // //             let storeProgramme = storeProgrammes?.find((p: any) =>
// // // // //                 (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) ||
// // // // //                 (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId)))
// // // // //             );

// // // // //             const mappedName =
// // // // //                 enrol.userName ||
// // // // //                 enrol.learnerName ||
// // // // //                 enrol.fullName ||
// // // // //                 enrol.name ||
// // // // //                 storeLearner?.fullName ||
// // // // //                 storeLearner?.name ||
// // // // //                 rawLearner?.fullName ||
// // // // //                 rawLearner?.name ||
// // // // //                 rawUser?.fullName ||
// // // // //                 rawUser?.name ||
// // // // //                 'Learner Candidate';

// // // // //             const rawMappedId =
// // // // //                 enrol.idNumber ||
// // // // //                 storeLearner?.idNumber ||
// // // // //                 rawLearner?.idNumber ||
// // // // //                 rawUser?.idNumber ||
// // // // //                 enrol.learnerId ||
// // // // //                 enrol.userId ||
// // // // //                 enrol.id ||
// // // // //                 'N/A';

// // // // //             const cleanIdStr = String(rawMappedId).trim();
// // // // //             const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr))
// // // // //                 ? cleanIdStr.padStart(13, '0')
// // // // //                 : cleanIdStr;

// // // // //             const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';

// // // // //             // FULL ENRICHED PROGRAMME NAME BUILDER
// // // // //             const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification';
// // // // //             const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || '';
// // // // //             const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';

// // // // //             const progDetails: string[] = [];
// // // // //             if (progNqf) progDetails.push(`NQF Level ${progNqf}`);
// // // // //             if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);

// // // // //             const mappedProgramme = progDetails.length > 0
// // // // //                 ? `${progTitle} (${progDetails.join(' | ')})`
// // // // //                 : progTitle;

// // // // //             const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};

// // // // //             const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
// // // // //             const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
// // // // //             const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';

// // // // //             let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;

// // // // //             if (storeProgramme) {
// // // // //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// // // // //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// // // // //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// // // // //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// // // // //                     const flat = storeProgramme.modules;
// // // // //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// // // // //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// // // // //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// // // // //                 }
// // // // //             }

// // // // //             let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0;
// // // // //             let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;

// // // // //             const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
// // // // //             const learnerSubs = rawSubmissions.filter(s =>
// // // // //                 (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
// // // // //                 (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
// // // // //                 (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase())
// // // // //             );

// // // // //             learnerSubs.forEach(s => {
// // // // //                 const type = String(s.type || 'formative').toLowerCase();
// // // // //                 const moduleType = String(s.moduleType || '').toLowerCase();
// // // // //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// // // // //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// // // // //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
// // // // //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// // // // //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// // // // //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// // // // //                 if (isKnowledge) {
// // // // //                     if (type.includes('formative') || type.includes('fa')) {
// // // // //                         totalAssignedFA++;
// // // // //                         if (isDone) calculatedFA++;
// // // // //                     } else if (type.includes('summative') || type.includes('sa')) {
// // // // //                         totalAssignedSA++;
// // // // //                         if (isDone) calculatedSA++;
// // // // //                     }
// // // // //                 } else if (isPractical) {
// // // // //                     totalAssignedPM++;
// // // // //                     if (isDone) calculatedPM++;
// // // // //                 } else if (isWorkplace) {
// // // // //                     totalAssignedWM++;
// // // // //                     if (isDone) calculatedWM++;
// // // // //                 }
// // // // //             });

// // // // //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// // // // //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// // // // //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// // // // //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// // // // //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// // // // //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// // // // //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// // // // //             // 🚀 EXTRACT CANDIDATE ATTENDANCE METRICS
// // // // //             const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) ||
// // // // //                 rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) ||
// // // // //                 rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) ||
// // // // //                 { attended: 0, total: dailyRegisters.length, pct: 0 };

// // // // //             const candidateKeys = [
// // // // //                 actualUserId,
// // // // //                 enrol.id,
// // // // //                 enrol.userId,
// // // // //                 enrol.learnerId,
// // // // //                 enrol.authUid,
// // // // //                 enrol.idNumber,
// // // // //                 enrol.email,
// // // // //                 mappedId,
// // // // //                 storeLearner?.id,
// // // // //                 storeLearner?.uid,
// // // // //                 storeLearner?.authUid,
// // // // //                 storeLearner?.idNumber,
// // // // //                 storeLearner?.email,
// // // // //                 rawUser?.id,
// // // // //                 rawUser?.uid,
// // // // //                 rawUser?.authUid,
// // // // //                 rawUser?.idNumber,
// // // // //                 rawUser?.email,
// // // // //                 rawLearner?.id,
// // // // //                 rawLearner?.authUid,
// // // // //                 rawLearner?.idNumber,
// // // // //                 rawLearner?.email
// // // // //             ];

// // // // //             const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
// // // // //             const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
// // // // //             const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));

// // // // //             // 🚀 ROBUST DROPOUT & WITHDRAWAL RESOLUTION ENGINE
// // // // //             const allStatuses = [
// // // // //                 enrol.status,
// // // // //                 storeLearner?.status,
// // // // //                 rawLearner?.status,
// // // // //                 rawUser?.status
// // // // //             ].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());

// // // // //             const isCandidateDropped = allStatuses.some(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s));
// // // // //             const resolvedStatus = isCandidateDropped
// // // // //                 ? (allStatuses.find(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s)) || 'dropped')
// // // // //                 : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');

// // // // //             return {
// // // // //                 id: enrol.id,
// // // // //                 userId: actualUserId,
// // // // //                 fullName: mappedName,
// // // // //                 idNumber: mappedId,
// // // // //                 cohortId: activeCohortId,
// // // // //                 cohortName: mappedCohort,
// // // // //                 programmeName: mappedProgramme,
// // // // //                 overallProgress: Math.min(100, dynamicProgress),
// // // // //                 attendance: attStats,
// // // // //                 formatives: { completed: calculatedFA, total: ceilingFA },
// // // // //                 summatives: { completed: calculatedSA, total: ceilingSA },
// // // // //                 practicals: { completed: calculatedPM, total: ceilingPM },
// // // // //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// // // // //                 sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'),
// // // // //                 popiaConsent: isPopiConsented,
// // // // //                 hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned),
// // // // //                 status: resolvedStatus,
// // // // //                 gender,
// // // // //                 equityGroup,
// // // // //                 disabilityStatus,
// // // // //                 birthDate: demo.birthDate || storeLearner?.birthDate,
// // // // //                 codeOfConductSigned: isCocSigned,
// // // // //                 appealsPolicySigned: isAppealsSigned
// // // // //             };
// // // // //         });
// // // // //     }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

// // // // //     const sampledLearners = useMemo(() => {
// // // // //         if (cohortPool.length === 0) return [];

// // // // //         let filtered = cohortPool;
// // // // //         if (searchTerm.trim()) {
// // // // //             const q = searchTerm.toLowerCase();
// // // // //             return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q));
// // // // //         }

// // // // //         if (samplePercentage >= 100) return filtered;

// // // // //         const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
// // // // //         return [...cohortPool]
// // // // //             .sort((a, b) => a.id.localeCompare(b.id))
// // // // //             .slice(0, sampleSize);
// // // // //     }, [cohortPool, samplePercentage, searchTerm]);

// // // // //     const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
// // // // //     const paginatedLearners = useMemo(() => {
// // // // //         return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // // // //     }, [sampledLearners, currentPage, itemsPerPage]);

// // // // //     const cohortFilteredGrievances = useMemo(() => {
// // // // //         let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');

// // // // //         if (grievanceFilterStatus !== 'ALL') {
// // // // //             list = list.filter(g => g.status === grievanceFilterStatus);
// // // // //         }
// // // // //         if (grievanceFilterType !== 'ALL') {
// // // // //             list = list.filter(g => g.type === grievanceFilterType);
// // // // //         }

// // // // //         return list;
// // // // //     }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

// // // // //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// // // // //     const paginatedGrievances = useMemo(() => {
// // // // //         return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // // // //     }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

// // // // //     const searchedPolicyLearners = useMemo(() => {
// // // // //         if (!policySearchTerm.trim()) return cohortPool;
// // // // //         const q = policySearchTerm.toLowerCase();
// // // // //         return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q));
// // // // //     }, [cohortPool, policySearchTerm]);

// // // // //     const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
// // // // //     const paginatedPolicyLearners = useMemo(() => {
// // // // //         return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
// // // // //     }, [searchedPolicyLearners, currentPage, itemsPerPage]);

// // // // //     const cohortMisDemographics = useMemo(() => {
// // // // //         const stats = {
// // // // //             total: cohortPool.length,
// // // // //             sampleTotal: sampledLearners.length,
// // // // //             equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 },
// // // // //             gender: { Female: 0, Male: 0, Other: 0 },
// // // // //             disability: { Yes: 0, No: 0 },
// // // // //             youth: { Under35: 0, Adult35Plus: 0 },
// // // // //             attendanceBands: { high: 0, mid: 0, low: 0 }
// // // // //         };

// // // // //         const currentYear = 2026;

// // // // //         cohortPool.forEach(l => {
// // // // //             // 1. EQUITY GROUP / RACE PARSING
// // // // //             const eq = String(l.equityGroup || '').trim().toLowerCase();
// // // // //             if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') {
// // // // //                 stats.equity.African++;
// // // // //             } else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') {
// // // // //                 stats.equity.Coloured++;
// // // // //             } else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') {
// // // // //                 stats.equity.Indian++;
// // // // //             } else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') {
// // // // //                 stats.equity.White++;
// // // // //             } else {
// // // // //                 stats.equity.African++;
// // // // //             }

// // // // //             // 2. GENDER PARSING
// // // // //             const g = String(l.gender || '').trim().toLowerCase();
// // // // //             if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') {
// // // // //                 stats.gender.Female++;
// // // // //             } else if (g.startsWith('m') || g.includes('male') || g === 'man') {
// // // // //                 stats.gender.Male++;
// // // // //             } else if (l.idNumber && l.idNumber.length >= 7) {
// // // // //                 const genderDigit = parseInt(l.idNumber.charAt(6), 10);
// // // // //                 if (!isNaN(genderDigit)) {
// // // // //                     if (genderDigit >= 5) {
// // // // //                         stats.gender.Male++;
// // // // //                     } else {
// // // // //                         stats.gender.Female++;
// // // // //                     }
// // // // //                 } else {
// // // // //                     stats.gender.Male++;
// // // // //                 }
// // // // //             } else {
// // // // //                 stats.gender.Male++;
// // // // //             }

// // // // //             // 3. DISABILITY STATUS
// // // // //             const d = String(l.disabilityStatus || '').trim().toLowerCase();
// // // // //             if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') {
// // // // //                 stats.disability.Yes++;
// // // // //             } else {
// // // // //                 stats.disability.No++;
// // // // //             }

// // // // //             // 4. YOUTH STATUS (<35 YEARS)
// // // // //             let birthYear = 0;
// // // // //             if (l.idNumber && l.idNumber.length >= 6) {
// // // // //                 const yy = parseInt(l.idNumber.substring(0, 2), 10);
// // // // //                 birthYear = yy > 30 ? 1900 + yy : 2000 + yy;
// // // // //             }
// // // // //             if (birthYear > 0 && (currentYear - birthYear) <= 35) {
// // // // //                 stats.youth.Under35++;
// // // // //             } else {
// // // // //                 stats.youth.Adult35Plus++;
// // // // //             }

// // // // //             // 5. ATTENDANCE BANDS
// // // // //             const attPct = l.attendance?.pct || 0;
// // // // //             if (attPct >= 75) stats.attendanceBands.high++;
// // // // //             else if (attPct >= 40) stats.attendanceBands.mid++;
// // // // //             else stats.attendanceBands.low++;
// // // // //         });

// // // // //         return stats;
// // // // //     }, [cohortPool, sampledLearners]);

// // // // //     // FULLY DECOUPLED INDEPENDENT CALCULATION FOR POLICIES & CONSENTS
// // // // //     const displayStats = useMemo(() => {
// // // // //         let active = 0, grad = 0, drop = 0;
// // // // //         let codeOfConductSignedCount = 0;
// // // // //         let appealsSignedCount = 0;
// // // // //         let popiaConsentCount = 0;

// // // // //         cohortPool.forEach(l => {
// // // // //             const status = l.status.toLowerCase();
// // // // //             if (status === 'active') active++;
// // // // //             else if (status === 'graduated' || status === 'competent') grad++;
// // // // //             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

// // // // //             if (l.codeOfConductSigned) codeOfConductSignedCount++;
// // // // //             if (l.appealsPolicySigned) appealsSignedCount++;
// // // // //             if (l.popiaConsent) popiaConsentCount++;
// // // // //         });

// // // // //         const total = cohortPool.length;
// // // // //         const denominator = total > 0 ? total : 1;

// // // // //         return {
// // // // //             totalEnrolled: total,
// // // // //             activeTraining: active,
// // // // //             graduated: grad,
// // // // //             droppedOut: drop,
// // // // //             retentionRate: total > 0 ? Math.round(((total - drop) / total) * 100) : 0,
// // // // //             activeGrievances: cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length,
// // // // //             policySignedPct: Math.min(100, Math.round((codeOfConductSignedCount / denominator) * 100)),
// // // // //             appealsSignedPct: Math.min(100, Math.round((appealsSignedCount / denominator) * 100)),
// // // // //             popiaConsentPct: Math.min(100, Math.round((popiaConsentCount / denominator) * 100))
// // // // //         };
// // // // //     }, [cohortPool, cohortFilteredGrievances]);

// // // // //     const inspectedLearnerSubmissions = useMemo(() => {
// // // // //         if (!inspectedLearner) return [];
// // // // //         const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();

// // // // //         return rawSubmissions.filter(s =>
// // // // //             (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) ||
// // // // //             (s.authUid && String(s.authUid).toLowerCase() === targetUserId) ||
// // // // //             (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase())
// // // // //         );
// // // // //     }, [inspectedLearner, rawSubmissions]);

// // // // //     const activeCohortData = useMemo(() => {
// // // // //         return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null;
// // // // //     }, [allowedCohortsForAuditor, selectedCohortId]);

// // // // //     const handleSaveEndorsement = async () => {
// // // // //         if (!auditNotes.trim()) {
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'warning',
// // // // //                 title: 'Missing Audit Notes',
// // // // //                 message: 'Please enter auditor verification findings and notes before recording official sign-off.'
// // // // //             });
// // // // //             return;
// // // // //         }

// // // // //         setIsSavingEndorsement(true);
// // // // //         try {
// // // // //             await addDoc(collection(db, 'cohort_audit_endorsements'), {
// // // // //                 cohortId: selectedCohortId,
// // // // //                 cohortName: activeCohortData?.name || 'Cohort',
// // // // //                 auditorUid: currentUser?.uid || 'external_auditor',
// // // // //                 auditorName: currentUser?.fullName || 'External Quality Assurer',
// // // // //                 organization: currentUser?.organization || 'QCTO / SETA',
// // // // //                 sampleSizePercentage: samplePercentage,
// // // // //                 sampledRecordsCount: sampledLearners.length,
// // // // //                 totalCohortCount: cohortPool.length,
// // // // //                 outcome: auditOutcome,
// // // // //                 notes: auditNotes,
// // // // //                 flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length,
// // // // //                 signedAt: serverTimestamp(),
// // // // //                 createdAt: new Date().toISOString()
// // // // //             });

// // // // //             toast.success("Audit verification & endorsement recorded successfully.");
// // // // //             setShowEndorseModal(false);
// // // // //             setAuditNotes('');
// // // // //         } catch (err: any) {
// // // // //             console.error("Failed to save endorsement:", err);
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'error',
// // // // //                 title: 'Sign-Off Failed',
// // // // //                 message: err.message || 'Failed to record official audit verification sign-off record.'
// // // // //             });
// // // // //         } finally {
// // // // //             setIsSavingEndorsement(false);
// // // // //         }
// // // // //     };

// // // // //     const handleSaveGrievanceResolution = async () => {
// // // // //         if (!selectedGrievance) return;
// // // // //         setIsSavingGrievance(true);
// // // // //         try {
// // // // //             await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), {
// // // // //                 status: grievanceStatusInput,
// // // // //                 resolutionNotes: grievanceResolutionNotes,
// // // // //                 resolvedAt: serverTimestamp(),
// // // // //                 resolvedBy: currentUser?.uid || 'external_auditor'
// // // // //             });

// // // // //             toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`);
// // // // //             setSelectedGrievance(null);
// // // // //             setGrievanceResolutionNotes('');
// // // // //         } catch (err: any) {
// // // // //             console.error("Failed to update grievance:", err);
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'error',
// // // // //                 title: 'Resolution Update Failed',
// // // // //                 message: err.message || 'Failed to save grievance resolution details.'
// // // // //             });
// // // // //         } finally {
// // // // //             setIsSavingGrievance(false);
// // // // //         }
// // // // //     };

// // // // //     // SAQA NLRD EXPORTER
// // // // //     const handleExportNLRD = async () => {
// // // // //         if (nlrdProgress.status !== 'idle') return;
// // // // //         setNlrdProgress({ status: 'generating', percent: 15 });
// // // // //         toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

// // // // //         const timer = setInterval(() => {
// // // // //             setNlrdProgress(prev => {
// // // // //                 if (prev.status !== 'generating') return prev;
// // // // //                 if (prev.percent >= 80) return prev;
// // // // //                 return { ...prev, percent: prev.percent + 5 };
// // // // //             });
// // // // //         }, 300);

// // // // //         try {
// // // // //             const functions = getFunctions();
// // // // //             const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
// // // // //             const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

// // // // //             clearInterval(timer);

// // // // //             if (response.data?.downloadUrl) {
// // // // //                 setNlrdProgress({ status: 'downloading', percent: 80 });
// // // // //                 const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

// // // // //                 await downloadFileWithProgress(
// // // // //                     response.data.downloadUrl,
// // // // //                     filename,
// // // // //                     (bytePercent) => {
// // // // //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// // // // //                         setNlrdProgress({ status: 'downloading', percent: scaled });
// // // // //                     }
// // // // //                 );

// // // // //                 setLastNlrdExport({
// // // // //                     downloadUrl: response.data.downloadUrl,
// // // // //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// // // // //                     totalRecords: response.data.totalRecords
// // // // //                 });

// // // // //                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords || ''} records.`);
// // // // //             }
// // // // //         } catch (error: any) {
// // // // //             clearInterval(timer);
// // // // //             console.error('NLRD Export Failed:', error);
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'error',
// // // // //                 title: 'NLRD Export Failed',
// // // // //                 message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
// // // // //             });
// // // // //         } finally {
// // // // //             setNlrdProgress({ status: 'idle', percent: 0 });
// // // // //         }
// // // // //     };

// // // // //     // THROUGHPUT MATRIX EXPORTER
// // // // //     const handleExportThroughputMatrix = async () => {
// // // // //         if (matrixProgress.status !== 'idle') return;
// // // // //         setMatrixProgress({ status: 'generating', percent: 15 });
// // // // //         toast.info('Compiling Learner Throughput & Compliance Matrix...');

// // // // //         const timer = setInterval(() => {
// // // // //             setMatrixProgress(prev => {
// // // // //                 if (prev.status !== 'generating') return prev;
// // // // //                 if (prev.percent >= 80) return prev;
// // // // //                 return { ...prev, percent: prev.percent + 5 };
// // // // //             });
// // // // //         }, 300);

// // // // //         try {
// // // // //             const functions = getFunctions();
// // // // //             const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
// // // // //             const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

// // // // //             clearInterval(timer);

// // // // //             if (response.data?.downloadUrl) {
// // // // //                 setMatrixProgress({ status: 'downloading', percent: 80 });
// // // // //                 const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

// // // // //                 await downloadFileWithProgress(
// // // // //                     response.data.downloadUrl,
// // // // //                     filename,
// // // // //                     (bytePercent) => {
// // // // //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// // // // //                         setMatrixProgress({ status: 'downloading', percent: scaled });
// // // // //                     }
// // // // //                 );

// // // // //                 setLastMatrixExport({
// // // // //                     downloadUrl: response.data.downloadUrl,
// // // // //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// // // // //                     totalRecords: response.data.totalLearners
// // // // //                 });

// // // // //                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners || ''} learners!`);
// // // // //             }
// // // // //         } catch (error: any) {
// // // // //             clearInterval(timer);
// // // // //             console.error('Throughput Report Failed:', error);
// // // // //             setStatusModal({
// // // // //                 isOpen: true,
// // // // //                 type: 'error',
// // // // //                 title: 'Report Generation Failed',
// // // // //                 message: error.message || 'Server error encountered while building the throughput matrix report.'
// // // // //             });
// // // // //         } finally {
// // // // //             setMatrixProgress({ status: 'idle', percent: 0 });
// // // // //         }
// // // // //     };

// // // // //     if (isLoading) {
// // // // //         return <Loader message="Initializing Auditor Inspection Portal..." />;
// // // // //     }

// // // // //     const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

// // // // //     return (
// // // // //         <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>

// // // // //             <style dangerouslySetInnerHTML={{
// // // // //                 __html: `
// // // // //                 .mav-topbar { background: ${MIDNIGHT}; padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid ${GREEN}; flex-shrink: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px); }
// // // // //                 .mav-brand { display: flex; align-items: center; gap: 14px; }
// // // // //                 .mav-topbar-title { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255, 255, 255, 0.45); padding-left: 14px; border-left: 1px solid rgba(255, 255, 255, 0.15); }
// // // // //                 .mav-secure-pill { display: flex; align-items: center; gap: 7px; background: rgba(148, 199, 61, 0.1); border: 1px solid rgba(148, 199, 61, 0.25); border-radius: 20px; padding: 6px 14px; }
// // // // //                 .mav-secure-dot { width: 7px; height: 7px; border-radius: 50%; background: ${GREEN}; display: inline-block; }
// // // // //                 .mav-secure-txt { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${GREEN}; }
                
// // // // //                 .ap-table-wrap { flex: 1; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); min-height: 0; }
// // // // //                 .ap-table-scroll { flex: 1; overflow-y: auto; min-height: 0; }
// // // // //                 .ap-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
// // // // //                 .ap-table th { position: sticky; top: 0; z-index: 10; background: ${MIDNIGHT}; color: #ffffff; padding: 12px 18px; font-family: var(--font-heading); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; border-bottom: 3px solid ${GREEN}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
// // // // //                 .ap-table td { padding: 12px 18px; border-bottom: 1px solid #e2e8f0; color: #0f172a; vertical-align: middle; }
// // // // //                 .ap-table tr:hover td { background-color: #f8fafc; }
                
// // // // //                 .ap-filter-select { height: 28px; border: 1px solid #cbd5e1; background: #ffffff; padding: 0 8px; font-size: 0.75rem; color: ${MIDNIGHT}; font-weight: 700; outline: none; border-radius: 4px; }
// // // // //                 .ap-tab-btn { padding: 12px 18px; background: transparent; border: none; font-weight: 800; font-size: 0.8rem; font-family: var(--font-heading); text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; outline: none; }
// // // // //                 `
// // // // //             }} />

// // // // //             {/* TOPBAR */}
// // // // //             <header className="mav-topbar">
// // // // //                 <div className="mav-brand">
// // // // //                     <img src={mLabLogo} alt="mLab Logo" style={{ width: 70, height: 'auto' }} />
// // // // //                     <span className="mav-topbar-title">QCTO / SETA Verification Workspace</span>
// // // // //                 </div>
// // // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // // //                     <div className="mav-secure-pill">
// // // // //                         <span className="mav-secure-dot" style={{ background: '#38bdf8' }} />
// // // // //                         <span className="mav-secure-txt" style={{ color: '#38bdf8' }}>Read-Only Inspector Mode</span>
// // // // //                     </div>
// // // // //                     <button
// // // // //                         onClick={() => setShowEndorseModal(true)}
// // // // //                         style={{ background: GREEN, color: MIDNIGHT, border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
// // // // //                     >
// // // // //                         <UserCheck size={16} /> Sign Off Cohort Audit
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </header>

// // // // //             {/* BODY WRAPPER */}
// // // // //             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px', maxWidth: '1600px', width: '100%', margin: '0 auto', boxSizing: 'border-box', minHeight: 0, overflow: 'hidden' }}>

// // // // //                 {/* DEDICATED QUALIFICATION SCOPE HEADER */}
// // // // //                 {activeProgrammeData && (
// // // // //                     <div style={{ flexShrink: 0, background: '#f0f9ff', border: '1px solid #bae6fd', padding: '20px 24px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 4px rgba(2, 132, 199, 0.05)' }}>
// // // // //                         <div style={{ background: '#0284c7', padding: '12px', borderRadius: '8px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // // //                             <Award size={28} />
// // // // //                         </div>
// // // // //                         <div>
// // // // //                             <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
// // // // //                                 Active Audit Target Qualification
// // // // //                             </div>
// // // // //                             <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
// // // // //                                 {activeProgrammeData.name}
// // // // //                             </h2>
// // // // //                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
// // // // //                                 {activeProgrammeData.saqaId && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="#0284c7" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
// // // // //                                 {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="#0284c7" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
// // // // //                                 {activeProgrammeData.credits > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="#0284c7" /> Total Credits: {activeProgrammeData.credits}</span>}
// // // // //                                 {(activeProgrammeData as any).accreditingBody && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} color="#0284c7" /> Accrediting Body: {(activeProgrammeData as any).accreditingBody}</span>}
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}

// // // // //                 {/* CONTROLS & SAMPLING TOOLBAR */}
// // // // //                 <div style={{ flexShrink: 0, background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px 20px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
// // // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>

// // // // //                         {/* COHORT SCOPE DROPDOWN */}
// // // // //                         <div>
// // // // //                             <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
// // // // //                                 Assigned Cohort Scope ({allowedCohortsForAuditor.length} Permitted)
// // // // //                             </label>
// // // // //                             <select
// // // // //                                 value={selectedCohortId}
// // // // //                                 onChange={(e) => handleCohortChange(e.target.value)}
// // // // //                                 style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', background: '#ffffff', outline: 'none', minWidth: '280px' }}
// // // // //                             >
// // // // //                                 {allowedCohortsForAuditor.length === 0 ? (
// // // // //                                     <option value="" style={{ color: '#0f172a', background: '#ffffff' }}>No Assigned Cohorts Found</option>
// // // // //                                 ) : (
// // // // //                                     allowedCohortsForAuditor.map((c: any) => (
// // // // //                                         <option key={c.id} value={c.id} style={{ color: '#0f172a', background: '#ffffff' }}>{c.name}</option>
// // // // //                                     ))
// // // // //                                 )}
// // // // //                             </select>
// // // // //                         </div>

// // // // //                         {/* SAMPLING RATIO BUTTONS */}
// // // // //                         <div>
// // // // //                             <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
// // // // //                                 Sampling Engine Size
// // // // //                             </label>
// // // // //                             <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
// // // // //                                 {[10, 20, 50, 100].map((pct) => (
// // // // //                                     <button
// // // // //                                         key={pct}
// // // // //                                         onClick={() => handleSamplePercentageChange(pct)}
// // // // //                                         style={{
// // // // //                                             padding: '8px 14px',
// // // // //                                             border: 'none',
// // // // //                                             background: samplePercentage === pct && !searchTerm ? MIDNIGHT : '#ffffff',
// // // // //                                             color: samplePercentage === pct && !searchTerm ? '#ffffff' : '#475569',
// // // // //                                             fontWeight: 800,
// // // // //                                             fontSize: '0.8rem',
// // // // //                                             cursor: 'pointer',
// // // // //                                             borderRight: '1px solid #cbd5e1'
// // // // //                                         }}
// // // // //                                     >
// // // // //                                         {pct}% {pct === 10 ? '(QCTO Standard)' : ''}
// // // // //                                     </button>
// // // // //                                 ))}
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
// // // // //                         <button
// // // // //                             onClick={handleExportSampleManifest}
// // // // //                             style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: MIDNIGHT, padding: '8px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
// // // // //                             title="Export CSV of sampled candidates for audit file"
// // // // //                         >
// // // // //                             <Printer size={14} /> Export Sample Manifest
// // // // //                         </button>

// // // // //                         <div style={{ position: 'relative', minWidth: '220px' }}>
// // // // //                             <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
// // // // //                             <input
// // // // //                                 type="text"
// // // // //                                 placeholder="Search candidate or ID..."
// // // // //                                 value={searchTerm}
// // // // //                                 onChange={(e) => handleSearchChange(e.target.value)}
// // // // //                                 style={{
// // // // //                                     width: '100%',
// // // // //                                     padding: '8px 12px 8px 36px',
// // // // //                                     border: '1px solid #cbd5e1',
// // // // //                                     borderRadius: '6px',
// // // // //                                     fontSize: '0.85rem',
// // // // //                                     outline: 'none',
// // // // //                                     boxSizing: 'border-box',
// // // // //                                     background: '#ffffff',
// // // // //                                     color: '#0f172a'
// // // // //                                 }}
// // // // //                             />
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 {/* METRICS SUMMARY ROW WITH ATTENDANCE KPI */}
// // // // //                 <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '16px' }}>
// // // // //                     <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: `5px solid ${MIDNIGHT}` }}>
// // // // //                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <Users size={14} color={MIDNIGHT} /> Sample Size Loaded
// // // // //                         </span>
// // // // //                         <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>{sampledLearners.length} / {cohortPool.length}</div>
// // // // //                         <span style={{ fontSize: '0.72rem', color: MIDNIGHT, fontWeight: 700 }}>{samplePercentage}% Cohort Audit Subset</span>
// // // // //                     </div>

// // // // //                     <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #16a34a' }}>
// // // // //                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <Activity size={14} color="#16a34a" /> Average Progress
// // // // //                         </span>
// // // // //                         <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
// // // // //                             {sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0}%
// // // // //                         </div>
// // // // //                         <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>Sampled Completion Ratio</span>
// // // // //                     </div>

// // // // //                     {/* ATTENDANCE KPI CARD */}
// // // // //                     <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #0284c7' }}>
// // // // //                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <Clock size={14} color="#0284c7" /> Average Attendance
// // // // //                         </span>
// // // // //                         <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
// // // // //                             {sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0}%
// // // // //                         </div>
// // // // //                         <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700 }}>{dailyRegisters.length} Sessions Logged</span>
// // // // //                     </div>

// // // // //                     <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #8b5cf6' }}>
// // // // //                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <ShieldCheck size={14} color="#8b5cf6" /> POPIA &amp; Policy Consent
// // // // //                         </span>
// // // // //                         <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
// // // // //                             {sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0}%
// // // // //                         </div>
// // // // //                         <span style={{ fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 700 }}>Governance Verified</span>
// // // // //                     </div>

// // // // //                     <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #f59e0b' }}>
// // // // //                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <Award size={14} color="#f59e0b" /> SoR Readiness
// // // // //                         </span>
// // // // //                         <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
// // // // //                             {sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length}
// // // // //                         </div>
// // // // //                         <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>Qualified Candidates</span>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 {/* MULTI-TABBED NAVIGATION BAR */}
// // // // //                 <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1', flexShrink: 0, marginBottom: '12px' }}>
// // // // //                     {[
// // // // //                         { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // // // //                         { id: 'mis_overview', label: 'MIS Overview & Demographics', icon: BarChart3 },
// // // // //                         { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// // // // //                         { id: 'policies', label: 'Learner Policy Compliance', icon: FileSignature }
// // // // //                     ].map(tab => {
// // // // //                         const Icon = tab.icon;
// // // // //                         const isActive = activeTab === tab.id;
// // // // //                         return (
// // // // //                             <button
// // // // //                                 key={tab.id}
// // // // //                                 onClick={() => setActiveTab(tab.id as TabOption)}
// // // // //                                 className="ap-tab-btn"
// // // // //                                 style={{
// // // // //                                     borderBottom: isActive ? `3px solid ${MIDNIGHT}` : '3px solid transparent',
// // // // //                                     color: isActive ? MIDNIGHT : '#64748b'
// // // // //                                 }}
// // // // //                             >
// // // // //                                 <Icon size={14} /> {tab.label}
// // // // //                             </button>
// // // // //                         );
// // // // //                     })}
// // // // //                 </div>

// // // // //                 {/* TAB CONTENT CONTAINER */}
// // // // //                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

// // // // //                     {/* TAB 1: LEARNER POE VAULT */}
// // // // //                     {activeTab === 'poe_vault' && (
// // // // //                         <div className="ap-table-wrap">
// // // // //                             <div style={{ padding: '12px 20px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
// // // // //                                 <h3 style={{ margin: 0, fontSize: '0.9rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                     <CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault
// // // // //                                 </h3>
// // // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // // //                                     {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && (
// // // // //                                         <span style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fecaca', fontWeight: 800 }}>
// // // // //                                             🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged
// // // // //                                         </span>
// // // // //                                     )}
// // // // //                                     <span style={{ fontSize: '0.75rem', color: GREEN, fontWeight: 700 }}>
// // // // //                                         Page {currentPage} of {totalPages}
// // // // //                                     </span>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div className="ap-table-scroll">
// // // // //                                 <table className="ap-table">
// // // // //                                     <thead>
// // // // //                                         <tr>
// // // // //                                             <th>Learner Details</th>
// // // // //                                             <th>Attendance Rate</th>
// // // // //                                             <th>Curriculum Evidence</th>
// // // // //                                             <th>Progress</th>
// // // // //                                             <th>Governance</th>
// // // // //                                             <th>Auditor Flag</th>
// // // // //                                             <th style={{ textAlign: 'right' }}>Inspection Action</th>
// // // // //                                         </tr>
// // // // //                                     </thead>
// // // // //                                     <tbody>
// // // // //                                         {paginatedLearners.map(learner => {
// // // // //                                             const flagInfo = candidateFlags[learner.id];
// // // // //                                             const isFlagged = flagInfo?.flagged;
// // // // //                                             const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
// // // // //                                             const exportState = activeExports[learner.id] || activeExports[learner.userId];
// // // // //                                             const hasCustomNote = !!flagInfo?.note;

// // // // //                                             const attPct = learner.attendance?.pct || 0;
// // // // //                                             const attAttended = learner.attendance?.attended || 0;
// // // // //                                             const attTotal = learner.attendance?.total || 0;

// // // // //                                             return (
// // // // //                                                 <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'white'), opacity: isDropped ? 0.85 : 1 }}>
// // // // //                                                     <td>
// // // // //                                                         <strong style={{ display: 'block', color: isDropped ? '#991b1b' : '#0f172a', fontSize: '0.88rem' }}>{learner.fullName}</strong>
// // // // //                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
// // // // //                                                             <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {learner.idNumber}</span>
// // // // //                                                             {isDropped && (
// // // // //                                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
// // // // //                                                                     <UserX size={10} /> {learner.status}
// // // // //                                                                 </span>
// // // // //                                                             )}
// // // // //                                                         </div>
// // // // //                                                         <div style={{ fontSize: '0.72rem', color: 'var(--mlab-blue)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                             <Award size={11} /> {learner.programmeName}
// // // // //                                                         </div>
// // // // //                                                     </td>

// // // // //                                                     {/* ATTENDANCE COLUMN IN VAULT TABLE */}
// // // // //                                                     <td>
// // // // //                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // // //                                                             <span style={{
// // // // //                                                                 display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content',
// // // // //                                                                 padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800,
// // // // //                                                                 background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2',
// // // // //                                                                 color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626',
// // // // //                                                                 border: `1px solid ${attPct >= 75 ? '#bbf7d0' : attPct >= 40 ? '#fde68a' : '#fecaca'}`
// // // // //                                                             }}>
// // // // //                                                                 <Clock size={12} /> {attPct}%
// // // // //                                                             </span>
// // // // //                                                             <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
// // // // //                                                                 {attAttended} / {attTotal} Sessions
// // // // //                                                             </span>
// // // // //                                                         </div>
// // // // //                                                     </td>

// // // // //                                                     <td style={{ fontSize: '0.8rem' }}>
// // // // //                                                         <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}>
// // // // //                                                             <strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}
// // // // //                                                         </div>
// // // // //                                                         <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}>
// // // // //                                                             <strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs
// // // // //                                                         </div>
// // // // //                                                         <div style={{ color: '#0f172a', fontWeight: 600 }}>
// // // // //                                                             <strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks
// // // // //                                                         </div>
// // // // //                                                     </td>

// // // // //                                                     <td>
// // // // //                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
// // // // //                                                             <div style={{ flex: 1, height: '8px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
// // // // //                                                                 <div style={{ width: `${learner.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// // // // //                                                             </div>
// // // // //                                                             <strong style={{ fontSize: '0.8rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{learner.overallProgress}%</strong>
// // // // //                                                         </div>
// // // // //                                                     </td>

// // // // //                                                     <td>
// // // // //                                                         {learner.popiaConsent ? (
// // // // //                                                             <span style={{ color: '#16a34a', fontSize: '0.72rem', fontWeight: 800, background: '#dcfce7', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                                 ✓ Policy Signed
// // // // //                                                             </span>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 800, background: '#fef2f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                                 Unsigned
// // // // //                                                             </span>
// // // // //                                                         )}
// // // // //                                                     </td>

// // // // //                                                     <td>
// // // // //                                                         {isFlagged ? (
// // // // //                                                             <span
// // // // //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// // // // //                                                                 style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 800, background: '#fef2f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
// // // // //                                                                 title={flagInfo.note || 'Click to clear flag'}
// // // // //                                                             >
// // // // //                                                                 <Flag size={12} fill="#dc2626" /> Flagged
// // // // //                                                             </span>
// // // // //                                                         ) : (
// // // // //                                                             <button
// // // // //                                                                 onClick={() => handleToggleCandidateFlag(learner.id)}
// // // // //                                                                 style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// // // // //                                                             >
// // // // //                                                                 <Flag size={12} /> Flag Item
// // // // //                                                             </button>
// // // // //                                                         )}
// // // // //                                                     </td>

// // // // //                                                     <td style={{ textAlign: 'right' }}>
// // // // //                                                         <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
// // // // //                                                             {/* AUDITOR NOTE MODAL BUTTON */}
// // // // //                                                             <button
// // // // //                                                                 onClick={() => handleOpenNotesModal(learner)}
// // // // //                                                                 style={{
// // // // //                                                                     background: hasCustomNote ? '#fffbeb' : '#f8fafc',
// // // // //                                                                     color: hasCustomNote ? '#b45309' : '#475569',
// // // // //                                                                     border: `1px solid ${hasCustomNote ? '#fde68a' : '#cbd5e1'}`,
// // // // //                                                                     padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.15s'
// // // // //                                                                 }}
// // // // //                                                                 title={hasCustomNote ? flagInfo.note : 'Leave auditor inspection note'}
// // // // //                                                             >
// // // // //                                                                 <MessageSquare size={14} color={hasCustomNote ? '#b45309' : '#64748b'} />
// // // // //                                                                 {hasCustomNote ? 'Notes' : 'Add Note'}
// // // // //                                                             </button>

// // // // //                                                             {/* VIEW SOR BUTTON */}
// // // // //                                                             <button
// // // // //                                                                 onClick={() => navigate(`/sor/${learner.userId || learner.id}`)}
// // // // //                                                                 style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
// // // // //                                                             >
// // // // //                                                                 <FileText size={14} /> View SoR
// // // // //                                                             </button>

// // // // //                                                             {/* DYNAMIC COMPILE POE BUTTON & EXPORT ENGINE INTEGRATION */}
// // // // //                                                             {(() => {
// // // // //                                                                 if (exportState?.status === 'pending' || exportState?.status === 'processing') {
// // // // //                                                                     return (
// // // // //                                                                         <button disabled style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                                                             <Loader2 size={14} className="animate-spin" /> {exportState.progress}%
// // // // //                                                                         </button>
// // // // //                                                                     );
// // // // //                                                                 }
// // // // //                                                                 if (exportState?.status === 'completed' && exportState?.downloadUrl) {
// // // // //                                                                     return (
// // // // //                                                                         <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// // // // //                                                                             <button
// // // // //                                                                                 onClick={() => window.open(exportState.downloadUrl, '_blank')}
// // // // //                                                                                 style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // // // //                                                                                 title="Download existing PoE"
// // // // //                                                                             >
// // // // //                                                                                 <Download size={14} /> Download
// // // // //                                                                             </button>
// // // // //                                                                             <button
// // // // //                                                                                 onClick={() => handleGeneratePoE(learner, true)}
// // // // //                                                                                 style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // // // //                                                                                 title="Regenerate PoE"
// // // // //                                                                             >
// // // // //                                                                                 <RefreshCw size={14} />
// // // // //                                                                             </button>
// // // // //                                                                         </div>
// // // // //                                                                     );
// // // // //                                                                 }
// // // // //                                                                 if (exportState?.status === 'error') {
// // // // //                                                                     return (
// // // // //                                                                         <button
// // // // //                                                                             onClick={() => handleGeneratePoE(learner, true)}
// // // // //                                                                             style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// // // // //                                                                         >
// // // // //                                                                             <AlertCircle size={14} /> Retry PoE
// // // // //                                                                         </button>
// // // // //                                                                     );
// // // // //                                                                 }
// // // // //                                                                 return (
// // // // //                                                                     <button
// // // // //                                                                         onClick={() => handleGeneratePoE(learner)}
// // // // //                                                                         style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
// // // // //                                                                     >
// // // // //                                                                         <FileArchive size={14} /> Compile PoE
// // // // //                                                                     </button>
// // // // //                                                                 );
// // // // //                                                             })()}

// // // // //                                                             {/* INSPECT FULL POE DRAWER BUTTON */}
// // // // //                                                             <button
// // // // //                                                                 onClick={() => setInspectedLearner(learner)}
// // // // //                                                                 style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
// // // // //                                                             >
// // // // //                                                                 <Eye size={14} /> Inspect Full PoE
// // // // //                                                             </button>
// // // // //                                                         </div>
// // // // //                                                     </td>
// // // // //                                                 </tr>
// // // // //                                             );
// // // // //                                         })}

// // // // //                                         {sampledLearners.length === 0 && (
// // // // //                                             <tr>
// // // // //                                                 <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b', background: '#ffffff' }}>
// // // // //                                                     <FileCheck size={40} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
// // // // //                                                     <h4 style={{ margin: '0 0 4px', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4>
// // // // //                                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>No candidate records match this cohort scope or search filter.</p>
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         )}
// // // // //                                     </tbody>
// // // // //                                 </table>
// // // // //                             </div>

// // // // //                             <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap', gap: '10px' }}>
// // // // //                                 <div>Showing <strong>{sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, sampledLearners.length)}</strong> of <strong>{sampledLearners.length}</strong> sampled records</div>
// // // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                         <span>Rows per page:</span>
// // // // //                                         <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} style={{ height: '28px', border: '1px solid #cbd5e1', background: '#ffffff', padding: '0 6px', fontSize: '0.75rem', color: MIDNIGHT, fontWeight: 700, borderRadius: '4px', outline: 'none', cursor: 'pointer' }}>
// // // // //                                             <option value={5}>5</option>
// // // // //                                             <option value={10}>10</option>
// // // // //                                             <option value={15}>15</option>
// // // // //                                             <option value={25}>25</option>
// // // // //                                             <option value={50}>50</option>
// // // // //                                         </select>
// // // // //                                     </div>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                             <ChevronLeft size={14} /> Prev
// // // // //                                         </button>
// // // // //                                         <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPages}</span>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                             Next <ChevronRight size={14} />
// // // // //                                         </button>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {/* TAB 2: MIS OVERVIEW & DEMOGRAPHICS */}
// // // // //                     {activeTab === 'mis_overview' && (
// // // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
// // // // //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
// // // // //                                 <div style={{ border: '1px solid #cbd5e1', padding: '16px', background: 'white', borderRadius: '8px' }}>
// // // // //                                     <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Equity Group Distribution</h4>
// // // // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', background: '#ffffff' }}>
// // // // //                                     <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Gender &amp; Disability Metrics</h4>
// // // // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 {/* ATTENDANCE COMPLIANCE HEALTH BREAKDOWN CARD */}
// // // // //                                 <div style={{ border: '1px solid #cbd5e1', color: MIDNIGHT, borderRadius: '8px', padding: '16px', background: '#ffffff' }}>
// // // // //                                     <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Attendance Health Bands</h4>
// // // // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
// // // // //                                             <span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong>
// // // // //                                         </div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
// // // // //                                             <span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong>
// // // // //                                         </div>
// // // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // // // //                                             <span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong>
// // // // //                                         </div>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             {/* REPORT EXPORTERS */}
// // // // //                             <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // // // //                                 <h4 style={{ margin: 0, fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                     <BarChart3 size={16} color={MIDNIGHT} /> Regulatory Report Exporters
// // // // //                                 </h4>

// // // // //                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

// // // // //                                     {/* SAQA NLRD REPORT EXPORTER */}
// // // // //                                     <div style={{ border: '1px solid #cbd5e1', padding: '14px', borderRadius: '6px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
// // // // //                                         <div>
// // // // //                                             <strong style={{ fontSize: '0.85rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                                 <FileText size={14} color="#0284c7" /> SAQA NLRD Pipe-Delimited Batch
// // // // //                                             </strong>
// // // // //                                             <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
// // // // //                                                 Generates 28-field statutory NLRD text/CSV file for SETA submission.
// // // // //                                             </p>
// // // // //                                         </div>

// // // // //                                         <div>
// // // // //                                             {lastNlrdExport ? (
// // // // //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // // // //                                                     <button
// // // // //                                                         onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
// // // // //                                                         style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
// // // // //                                                     >
// // // // //                                                         <Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})
// // // // //                                                     </button>
// // // // //                                                     <button
// // // // //                                                         onClick={handleExportNLRD}
// // // // //                                                         disabled={nlrdProgress.status !== 'idle'}
// // // // //                                                         style={{ background: '#f1f5f9', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
// // // // //                                                         title="Re-run Cloud Function to compile fresh data"
// // // // //                                                     >
// // // // //                                                         <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
// // // // //                                                     </button>
// // // // //                                                 </div>
// // // // //                                             ) : (
// // // // //                                                 <button
// // // // //                                                     onClick={handleExportNLRD}
// // // // //                                                     disabled={nlrdProgress.status !== 'idle'}
// // // // //                                                     style={{ width: '100%', background: MIDNIGHT, color: 'white', border: 'none', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
// // // // //                                                 >
// // // // //                                                     {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
// // // // //                                                     {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
// // // // //                                                     {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
// // // // //                                                     {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
// // // // //                                                 </button>
// // // // //                                             )}
// // // // //                                         </div>
// // // // //                                     </div>

// // // // //                                     {/* THROUGHPUT MATRIX EXPORTER */}
// // // // //                                     <div style={{ border: '1px solid #cbd5e1', padding: '14px', borderRadius: '6px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
// // // // //                                         <div>
// // // // //                                             <strong style={{ fontSize: '0.85rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                                 <BarChart3 size={14} color="#16a34a" /> Learner Throughput Matrix (CSV)
// // // // //                                             </strong>
// // // // //                                             <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
// // // // //                                                 Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.
// // // // //                                             </p>
// // // // //                                         </div>

// // // // //                                         <div>
// // // // //                                             {lastMatrixExport ? (
// // // // //                                                 <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// // // // //                                                     <button
// // // // //                                                         onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')}
// // // // //                                                         style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
// // // // //                                                     >
// // // // //                                                         <Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})
// // // // //                                                     </button>
// // // // //                                                     <button
// // // // //                                                         onClick={handleExportThroughputMatrix}
// // // // //                                                         disabled={matrixProgress.status !== 'idle'}
// // // // //                                                         style={{ background: '#f1f5f9', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
// // // // //                                                         title="Re-run Cloud Function to compile fresh data"
// // // // //                                                     >
// // // // //                                                         <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
// // // // //                                                     </button>
// // // // //                                                 </div>
// // // // //                                             ) : (
// // // // //                                                 <button
// // // // //                                                     onClick={handleExportThroughputMatrix}
// // // // //                                                     disabled={matrixProgress.status !== 'idle'}
// // // // //                                                     style={{ width: '100%', background: '#ffffff', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
// // // // //                                                 >
// // // // //                                                     {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
// // // // //                                                     {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
// // // // //                                                     {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
// // // // //                                                     {matrixProgress.status === 'idle' && 'Download Learner Details & Throughput Ratio (CSV)'}
// // // // //                                                 </button>
// // // // //                                             )}
// // // // //                                         </div>
// // // // //                                     </div>

// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {/* TAB 3: APPEALS & GRIEVANCES */}
// // // // //                     {activeTab === 'grievances' && (
// // // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
// // // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // // //                                     <Filter size={14} color="#64748b" />
// // // // //                                     <select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="ap-filter-select">
// // // // //                                         <option value="ALL">All Statuses</option>
// // // // //                                         <option value="open">Open</option>
// // // // //                                         <option value="under_review">Under Review</option>
// // // // //                                         <option value="resolved">Resolved</option>
// // // // //                                     </select>
// // // // //                                     <select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="ap-filter-select">
// // // // //                                         <option value="ALL">All Types</option>
// // // // //                                         <option value="appeal">Appeals Only</option>
// // // // //                                         <option value="complaint">Complaints Only</option>
// // // // //                                     </select>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div className="ap-table-wrap">
// // // // //                                 <div className="ap-table-scroll">
// // // // //                                     <table className="ap-table">
// // // // //                                         <thead>
// // // // //                                             <tr>
// // // // //                                                 <th>Ref ID</th>
// // // // //                                                 <th>Learner</th>
// // // // //                                                 <th>Type</th>
// // // // //                                                 <th>Date Logged</th>
// // // // //                                                 <th>Description</th>
// // // // //                                                 <th>Status</th>
// // // // //                                                 <th style={{ textAlign: 'right' }}>Resolution Action</th>
// // // // //                                             </tr>
// // // // //                                         </thead>
// // // // //                                         <tbody>
// // // // //                                             {paginatedGrievances.map(g => (
// // // // //                                                 <tr key={g.docId}>
// // // // //                                                     <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// // // // //                                                     <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// // // // //                                                     <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
// // // // //                                                     <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// // // // //                                                     <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // // // //                                                     <td>
// // // // //                                                         {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>OPEN</span>}
// // // // //                                                         {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a' }}>UNDER REVIEW</span>}
// // // // //                                                         {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>RESOLVED</span>}
// // // // //                                                     </td>
// // // // //                                                     <td style={{ textAlign: 'right' }}>
// // // // //                                                         <button
// // // // //                                                             onClick={() => {
// // // // //                                                                 setSelectedGrievance(g);
// // // // //                                                                 setGrievanceStatusInput(g.status);
// // // // //                                                                 setGrievanceResolutionNotes(g.resolutionNotes || '');
// // // // //                                                             }}
// // // // //                                                             style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// // // // //                                                         >
// // // // //                                                             <Eye size={12} /> Inspect / Resolve
// // // // //                                                         </button>
// // // // //                                                     </td>
// // // // //                                                 </tr>
// // // // //                                             ))}
// // // // //                                             {paginatedGrievances.length === 0 && (
// // // // //                                                 <tr>
// // // // //                                                     <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
// // // // //                                                         No grievances or appeals recorded for this cohort scope.
// // // // //                                                     </td>
// // // // //                                                 </tr>
// // // // //                                             )}
// // // // //                                         </tbody>
// // // // //                                     </table>
// // // // //                                 </div>

// // // // //                                 <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
// // // // //                                     <div>Showing <strong>{cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> grievances</div>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
// // // // //                                             <ChevronLeft size={14} /> Prev
// // // // //                                         </button>
// // // // //                                         <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPagesGrievances}</span>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPagesGrievances ? 'not-allowed' : 'pointer' }}>
// // // // //                                             Next <ChevronRight size={14} />
// // // // //                                         </button>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {/* TAB 4: LEARNER POLICY COMPLIANCE */}
// // // // //                     {activeTab === 'policies' && (
// // // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
// // // // //                                 <div style={{ position: 'relative', minWidth: '260px' }}>
// // // // //                                     <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
// // // // //                                     <input
// // // // //                                         type="text"
// // // // //                                         placeholder="Search learner policy status..."
// // // // //                                         value={policySearchTerm}
// // // // //                                         onChange={(e) => setPolicySearchTerm(e.target.value)}
// // // // //                                         style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', background: '#ffffff' }}
// // // // //                                     />
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div className="ap-table-wrap">
// // // // //                                 <div className="ap-table-scroll">
// // // // //                                     <table className="ap-table">
// // // // //                                         <thead>
// // // // //                                             <tr>
// // // // //                                                 <th>Learner Details</th>
// // // // //                                                 <th>Cohort Scope</th>
// // // // //                                                 <th>Code of Conduct</th>
// // // // //                                                 <th>Appeals Policy</th>
// // // // //                                                 <th>PoPIA Consent</th>
// // // // //                                                 <th style={{ textAlign: 'right' }}>Compliance State</th>
// // // // //                                             </tr>
// // // // //                                         </thead>
// // // // //                                         <tbody>
// // // // //                                             {paginatedPolicyLearners.map(l => (
// // // // //                                                 <tr key={l.id}>
// // // // //                                                     <td>
// // // // //                                                         <strong style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a' }}>{l.fullName}</strong>
// // // // //                                                         <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
// // // // //                                                     </td>
// // // // //                                                     <td style={{ fontSize: '0.8rem', color: '#334155' }}>{l.cohortName}</td>
// // // // //                                                     <td>
// // // // //                                                         {l.codeOfConductSigned ? (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>✓ SIGNED</span>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>UNSIGNED</span>
// // // // //                                                         )}
// // // // //                                                     </td>
// // // // //                                                     <td>
// // // // //                                                         {l.appealsPolicySigned ? (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>✓ SIGNED</span>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>UNSIGNED</span>
// // // // //                                                         )}
// // // // //                                                     </td>
// // // // //                                                     <td>
// // // // //                                                         {l.popiaConsent ? (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bae6fd' }}>✓ CONSENTED</span>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>PENDING</span>
// // // // //                                                         )}
// // // // //                                                     </td>
// // // // //                                                     <td style={{ textAlign: 'right' }}>
// // // // //                                                         {l.codeOfConductSigned && l.popiaConsent ? (
// // // // //                                                             <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>
// // // // //                                                         )}
// // // // //                                                     </td>
// // // // //                                                 </tr>
// // // // //                                             ))}
// // // // //                                         </tbody>
// // // // //                                     </table>
// // // // //                                 </div>

// // // // //                                 <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
// // // // //                                     <div>Showing <strong>{searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)}</strong> of <strong>{searchedPolicyLearners.length}</strong> candidate policies</div>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
// // // // //                                             <ChevronLeft size={14} /> Prev
// // // // //                                         </button>
// // // // //                                         <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPagesPolicyLearners}</span>
// // // // //                                         <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPagesPolicyLearners ? 'not-allowed' : 'pointer' }}>
// // // // //                                             Next <ChevronRight size={14} />
// // // // //                                         </button>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     )}

// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* AUDITOR LEARNER NOTE MODAL */}
// // // // //             {notesModalLearner && (
// // // // //                 <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
// // // // //                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '550px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
// // // // //                         <div style={{ padding: '18px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // // //                                 <NotebookPen size={20} color={GREEN} />
// // // // //                                 <div>
// // // // //                                     <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // // //                                         Auditor Candidate Notes
// // // // //                                     </h3>
// // // // //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// // // // //                                         Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})
// // // // //                                     </span>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={18} /></button>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // // //                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
// // // // //                                 Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.
// // // // //                             </p>

// // // // //                             <div>
// // // // //                                 <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '6px', textTransform: 'uppercase' }}>Inspection Finding / Note *</label>
// // // // //                                 <textarea
// // // // //                                     rows={4}
// // // // //                                     value={learnerNoteInput}
// // // // //                                     onChange={(e) => setLearnerNoteInput(e.target.value)}
// // // // //                                     placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..."
// // // // //                                     style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }}
// // // // //                                 />
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// // // // //                             <button onClick={() => setNotesModalLearner(null)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
// // // // //                             <button onClick={handleSaveLearnerNote} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                 <CheckSquare size={14} /> Save Note
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {/* GRIEVANCE RESOLUTION MODAL */}
// // // // //             {selectedGrievance && (
// // // // //                 <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
// // // // //                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '600px', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
// // // // //                         <div style={{ padding: '16px 20px', background: MIDNIGHT, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                 <Scale size={18} color="#4ade80" />
// // // // //                                 <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3>
// // // // //                             </div>
// // // // //                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={18} /></button>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // // //                             <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.82rem' }}>
// // // // //                                 <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div>
// // // // //                                 <div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div>
// // // // //                                 <div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
// // // // //                                 <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
// // // // //                                     <strong>Details:</strong>
// // // // //                                     <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div>
// // // // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label>
// // // // //                                 <select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}>
// // // // //                                     <option value="open">Open (Awaiting Investigation)</option>
// // // // //                                     <option value="under_review">Under Review by Moderation Committee</option>
// // // // //                                     <option value="resolved">Resolved (Official Findings Logged)</option>
// // // // //                                 </select>
// // // // //                             </div>

// // // // //                             <div>
// // // // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label>
// // // // //                                 <textarea
// // // // //                                     rows={4}
// // // // //                                     value={grievanceResolutionNotes}
// // // // //                                     onChange={(e) => setGrievanceResolutionNotes(e.target.value)}
// // // // //                                     placeholder="Enter committee notes, resolution details, or outcome letter comments..."
// // // // //                                     style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
// // // // //                                 />
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// // // // //                             <button onClick={() => setSelectedGrievance(null)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px 16px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
// // // // //                             <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                 {isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution Record
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {/* READ-ONLY POE INSPECTION DRAWER */}
// // // // //             {inspectedLearner && (
// // // // //                 <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
// // // // //                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '850px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>

// // // // //                         {/* MODAL HEADER */}
// // // // //                         <div style={{ padding: '18px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
// // // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // // //                                 <FileCheck size={20} color={GREEN} />
// // // // //                                 <div>
// // // // //                                     <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // // //                                         Auditor Inspection Vault: {inspectedLearner.fullName}
// // // // //                                     </h3>
// // // // //                                     <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
// // // // //                                         ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}
// // // // //                                     </span>
// // // // //                                     <div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>
// // // // //                                         Target Qualification: {inspectedLearner.programmeName}
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                             <button onClick={() => setInspectedLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // // // //                         </div>

// // // // //                         {/* MODAL BODY */}
// // // // //                         <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

// // // // //                             {/* DROPOUT WARNING BANNER IF APPLICABLE */}
// // // // //                             {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (
// // // // //                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                     <UserX size={16} color="#dc2626" />
// // // // //                                     <span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span>
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             {/* SPOT-CHECK FLAGGING TOOL FOR THIS CANDIDATE */}
// // // // //                             <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
// // // // //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                         <Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} />
// // // // //                                         <strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : MIDNIGHT }}>
// // // // //                                             Auditor Candidate Spot-Check Flag
// // // // //                                         </strong>
// // // // //                                     </div>
// // // // //                                     <button
// // // // //                                         onClick={() => handleToggleCandidateFlag(inspectedLearner.id)}
// // // // //                                         style={{
// // // // //                                             background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'white',
// // // // //                                             color: candidateFlags[inspectedLearner.id]?.flagged ? 'white' : '#475569',
// // // // //                                             border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer'
// // // // //                                         }}
// // // // //                                     >
// // // // //                                         {candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate for Review'}
// // // // //                                     </button>
// // // // //                                 </div>

// // // // //                                 {candidateFlags[inspectedLearner.id]?.flagged && (
// // // // //                                     <textarea
// // // // //                                         rows={2}
// // // // //                                         value={candidateFlags[inspectedLearner.id]?.note || ''}
// // // // //                                         onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)}
// // // // //                                         placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..."
// // // // //                                         style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '0.8rem', background: 'white', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
// // // // //                                     />
// // // // //                                 )}
// // // // //                             </div>

// // // // //                             {/* MILESTONE SUMMARY LEDGER WITH ATTENDANCE SUMMARY */}
// // // // //                             <div>
// // // // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: MIDNIGHT, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                     <Briefcase size={14} color={MIDNIGHT} /> Curriculum Completion &amp; Attendance Ledger
// // // // //                                 </h4>
// // // // //                                 <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', background: '#ffffff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
// // // // //                                     <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
// // // // //                                     <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
// // // // //                                     <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
// // // // //                                     <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
// // // // //                                     <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             {/* ITEMIZED SUBMISSION FILE LIST */}
// // // // //                             <div>
// // // // //                                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: MIDNIGHT, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                                     <FileText size={14} color={MIDNIGHT} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})
// // // // //                                 </h4>

// // // // //                                 {inspectedLearnerSubmissions.length === 0 ? (
// // // // //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '0.82rem' }}>
// // // // //                                         <AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />
// // // // //                                         No digital submission documents found in Firestore for this candidate ID.
// // // // //                                     </div>
// // // // //                                 ) : (
// // // // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // //                                         {inspectedLearnerSubmissions.map((sub: any) => {
// // // // //                                             const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task';
// // // // //                                             const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase();
// // // // //                                             const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl;
// // // // //                                             const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase());

// // // // //                                             return (
// // // // //                                                 <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }}>
// // // // //                                                     <div>
// // // // //                                                         <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                                             <span>{subTitle}</span>
// // // // //                                                             <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>{subType}</span>
// // // // //                                                         </div>
// // // // //                                                         <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
// // // // //                                                             Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong>
// // // // //                                                         </div>
// // // // //                                                     </div>

// // // // //                                                     <div>
// // // // //                                                         {fileUrl ? (
// // // // //                                                             <a
// // // // //                                                                 href={fileUrl}
// // // // //                                                                 target="_blank"
// // // // //                                                                 rel="noopener noreferrer"
// // // // //                                                                 style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// // // // //                                                             >
// // // // //                                                                 <ExternalLink size={12} /> View File
// // // // //                                                             </a>
// // // // //                                                         ) : (
// // // // //                                                             <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>
// // // // //                                                         )}
// // // // //                                                     </div>
// // // // //                                                 </div>
// // // // //                                             );
// // // // //                                         })}
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         {/* MODAL FOOTER */}
// // // // //                         <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
// // // // //                             <button onClick={() => setInspectedLearner(null)} style={{ background: MIDNIGHT, color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'opacity 0.2s' }}>
// // // // //                                 Close Inspection Drawer
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {/* ENDORSEMENT SIGN-OFF MODAL */}
// // // // //             {showEndorseModal && (
// // // // //                 <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
// // // // //                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '550px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
// // // // //                         <div style={{ padding: '20px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                             <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Record Official Audit Sign-Off</h3>
// // // // //                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
// // // // //                             <div>
// // // // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label>
// // // // //                                 <select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', color: '#0f172a', background: '#f8fafc', fontWeight: 600 }}>
// // // // //                                     <option value="approved">Fully Approved &amp; Endorsed</option>
// // // // //                                     <option value="conditional">Conditional Approval (Minor Corrective Actions)</option>
// // // // //                                     <option value="rejected">Rejected (Major Compliance Audit Failure)</option>
// // // // //                                 </select>
// // // // //                             </div>

// // // // //                             <div>
// // // // //                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label>
// // // // //                                 <textarea
// // // // //                                     rows={5}
// // // // //                                     value={auditNotes}
// // // // //                                     onChange={(e) => setAuditNotes(e.target.value)}
// // // // //                                     placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..."
// // // // //                                     style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }}
// // // // //                                 />
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
// // // // //                             <button onClick={() => setShowEndorseModal(false)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
// // // // //                             <button
// // // // //                                 onClick={handleSaveEndorsement}
// // // // //                                 disabled={isSavingEndorsement}
// // // // //                                 style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
// // // // //                             >
// // // // //                                 {isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {/* STATUS MODAL FOR ERROR & WARNING OVERLAYS */}
// // // // //             {statusModal.isOpen && (
// // // // //                 <StatusModal
// // // // //                     type={statusModal.type}
// // // // //                     title={statusModal.title}
// // // // //                     message={statusModal.message}
// // // // //                     confirmText="Acknowledge"
// // // // //                     onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
// // // // //                 />
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };