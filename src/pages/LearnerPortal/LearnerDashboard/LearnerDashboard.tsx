// src/pages/LearnerPortal/LearnerDashboard/LearnerDashboard.tsx

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X, Award, Download,
    GraduationCap, Clock, BookOpen, CheckCircle, Shield,
    Hexagon, Search, Filter, ChevronDown, ChevronUp, Zap,
    AlertCircle, Loader2, History, PlayCircle, XCircle,
    TrendingUp, AlertTriangle, Globe, MapPin, CheckCircle2,
    Target, Info, ClipboardList, HelpCircle, Send, ExternalLink,
    Tag, FileText
} from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import { createPortal } from 'react-dom';
import moment from 'moment';
import './LearnerDashboard.css';
import { LearnerAttendanceView } from '../LearnerAttendanceView/LearnerAttendanceView';
import { LearnerWorkplaceLogModal } from '../../../components/views/LearnerWorkplaceLogModal/LearnerWorkplaceLogModal';
import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
import LearnerProfileView from './LearnerProfileView/LearnerProfileView';
import { WelcomeGamificationPopup } from './WelcomeGamificationPopup';

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
type SortType = 'newest' | 'oldest' | 'name';
const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : new Date(ts);

type Band = { min: number; max: number; color: string; bg: string; border: string; label: string };

const SCORE_BANDS: Band[] = [
    { min: -99999, max: 49, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Novice' },
    { min: 50, max: 69, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Developing' },
    { min: 70, max: 84, color: '#0284c7', bg: '#e0f2fe', border: '#bae6fd', label: 'Committed' },
    { min: 85, max: 94, color: GREEN, bg: '#f0fdf4', border: '#bbf7d0', label: 'Pro' },
    { min: 95, max: 100, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', label: 'Elite' },
];

const STREAK_BANDS: Band[] = [
    { min: 0, max: 2, color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Warming up' },
    { min: 3, max: 6, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Habit forming' },
    { min: 7, max: 13, color: '#0284c7', bg: '#e0f2fe', border: '#bae6fd', label: 'On a roll' },
    { min: 14, max: 20, color: GREEN, bg: '#f0fdf4', border: '#bbf7d0', label: 'Unstoppable' },
    { min: 21, max: 9999, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', label: 'Legend 🏆' },
];

const COMMENTARIES = [
    { min: -99999, max: 49, icon: '⚠️', bg: '#fef2f2', border: '#fecaca', color: '#991b1b', text: <><strong>Your score needs attention.</strong> Acknowledge your topics on time and attend sessions consistently to get back on track.</> },
    { min: 50, max: 69, icon: '📈', bg: '#fffbeb', border: '#fde68a', color: '#92400e', text: <><strong>You&apos;re making progress — keep the momentum.</strong> A few more consistent weeks will push you into the high-performer band.</> },
    { min: 70, max: 84, icon: '⚡', bg: '#e0f2fe', border: '#bae6fd', color: '#075985', text: <><strong>Solid commitment.</strong> You&apos;re in the top tier. Stay on top of acknowledgements and you&apos;ll hit the high-performer threshold soon.</> },
    { min: 85, max: 94, icon: '🏅', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', text: <><strong>Excellent standing.</strong> You&apos;re a high performer. Keep your streak alive and maintain full acknowledgement compliance.</> },
    { min: 95, max: 100, icon: '🌟', bg: '#f5f3ff', border: '#ddd6fe', color: '#4c1d95', text: <><strong>Elite performance — outstanding.</strong> You are in the top percentile of all mLab learners. A model for your cohort.</> },
];

const STREAK_COMMENTARY = [
    { min: 0, max: 0, text: 'Start your first acknowledgement to light your streak.' },
    { min: 1, max: 2, text: "Good start — keep acknowledging daily to build momentum." },
    { min: 3, max: 6, text: "A growing streak shows you're developing consistency." },
    { min: 7, max: 13, text: "Over a week on fire 🔥 — consistency is becoming a habit." },
    { min: 14, max: 20, text: "Two weeks! Your streak puts you ahead of most learners." },
    { min: 21, max: 9999, text: "Legendary consistency — you are in the top tier of all cohorts." },
];

const getBand = (bands: Band[], val: number) => bands.find(b => val >= b.min && val <= b.max) ?? bands[0];
const RING_C = 2 * Math.PI * 32;

function ProfessionalismWidget({ pScore, pStreak }: { pScore: number; pStreak: number; }) {
    const ringRef = useRef<SVGCircleElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const [showExplainer, setShowExplainer] = useState(false);

    const displayScore = Math.round(pScore);
    const visualScore = Math.max(0, Math.min(100, displayScore));
    const streak = Math.max(0, Math.round(pStreak));

    const scoreBand = getBand(SCORE_BANDS, displayScore);
    const streakBand = getBand(STREAK_BANDS, streak);
    const commentary = COMMENTARIES.find(c => displayScore >= c.min && displayScore <= c.max) ?? COMMENTARIES[0];
    const streakNote = STREAK_COMMENTARY.find(b => streak >= b.min && streak <= b.max) ?? STREAK_COMMENTARY[0];
    const nextBand = SCORE_BANDS.find(b => b.min > displayScore);

    useEffect(() => {
        const offset = RING_C - (RING_C * visualScore / 100);
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(offset);
        if (barRef.current) barRef.current.style.width = `${visualScore}%`;
    }, [visualScore]);

    const flameSize = streak >= 21 ? 32 : streak >= 14 ? 28 : streak >= 7 ? 24 : 20;

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderRadius: '0', width: '100%', marginBottom: '2rem', position: 'relative' }}>
            {showExplainer && createPortal(
                <div className="lfm-overlay" onClick={() => setShowExplainer(false)} style={{ zIndex: 9999999 }}>
                    <div className="lfm-modal" style={{ maxWidth: '460px', borderRadius: '0' }} onClick={e => e.stopPropagation()}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><Target size={18} color="var(--mlab-green)" /> Performance Matrix</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowExplainer(false)}><X size={20} /></button>
                        </div>
                        <div className="lfm-body" style={{ padding: '1.5rem', gap: '1rem' }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>How Your Score Works</p>
                            <div style={{ background: '#f8fafc', padding: '1.25rem', border: '1px solid var(--mlab-border)' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--mlab-blue)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    <Award size={16} color="#0284c7" /> Professionalism Score
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>Your baseline score starts at <strong>100</strong>. You lose points if you miss classes, leave action items overdue, or ignore unacknowledged tasks.</p>
                            </div>
                            <div style={{ background: '#fffbeb', padding: '1.25rem', border: '1px solid #fde68a' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', color: '#b45309', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    🔥 Active Streak
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: 1.6 }}>Your streak grows for every consecutive day you stay up to date.</p>
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => setShowExplainer(false)} style={{ width: '100%', justifyContent: 'center' }}>I Understand</button>
                        </div>
                    </div>
                </div>, document.body
            )}
            <button onClick={() => setShowExplainer(true)} title="How this works" style={{ background: 'rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', padding: '8px' }} onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; }} onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}>
                <Info size={16} color="var(--mlab-blue)" />
            </button>
            <div style={{ width: '6px', background: scoreBand.color }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem', borderRight: '1px solid var(--mlab-border)', minWidth: '260px' }}>
                <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 72 72" width={72} height={72} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                        <circle cx={36} cy={36} r={32} fill="none" stroke="#f1f5f9" strokeWidth={5} />
                        <circle ref={ringRef} cx={36} cy={36} r={32} fill="none" stroke={scoreBand.color} strokeWidth={5} strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={RING_C} style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1) .1s' }} />
                    </svg>
                    <div style={{ zIndex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: scoreBand.color, lineHeight: 1 }}>{displayScore}</div>
                        <div style={{ fontSize: 10, color: 'var(--mlab-grey)' }}>/ 100</div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, color: 'var(--mlab-grey)' }}>Professionalism</span>
                    <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '0', overflow: 'hidden' }}>
                        <div ref={barRef} style={{ height: '100%', width: 0, background: scoreBand.color, transition: 'width 1.4s ease .2s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--mlab-grey)', textAlign: 'left', marginTop: 1, marginBottom: 1 }}>{nextBand ? `${nextBand.min - displayScore} pts to ${nextBand.label}` : 'Maximum level'}</div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: scoreBand.color, background: scoreBand.bg, padding: '2px 8px', border: `1px solid ${scoreBand.border}`, width: 'fit-content' }}>{scoreBand.label}</span>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', borderRight: '1px solid var(--mlab-border)', minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '50px', height: '50px', background: streakBand.bg, border: `1px solid ${streakBand.border}`, borderRadius: '50%' }}>
                    <span style={{ fontSize: flameSize, animation: 'flamePulse 2s ease-in-out infinite' }}>🔥</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, color: 'var(--mlab-grey)' }}>Active Streak</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: streakBand.color, lineHeight: 1 }}>{streak} <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>days</span></div>
                </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '1.5rem', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', background: commentary.bg, border: `1px solid ${commentary.border}`, padding: '1rem', width: '100%' }}>
                    <span style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{commentary.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.85rem', color: commentary.color, lineHeight: 1.5 }}>{commentary.text}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{streakNote.text}</span>
                    </div>
                </div>
            </div>
            <style>{`@keyframes flamePulse { 0%, 100% { transform: scaleY(1) scaleX(1); } 50% { transform: scaleY(1.08) scaleX(0.95); } }`}</style>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// INBOX COMPONENT
// ════════════════════════════════════════════════════════════════════════════
interface InboxProps { profileId: string; logs: any[]; absenceDates: string[]; pendingSurveysCount?: number; onNavigateToSurveys?: () => void; }
const LearnerActionInbox: React.FC<InboxProps> = ({ profileId, logs, absenceDates, pendingSurveysCount = 0, onNavigateToSurveys }) => {
    const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
    const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [logToConfirm, setLogToConfirm] = useState<any | null>(null);
    const [now, setNow] = useState(new Date());
    const toast = useToast();

    useEffect(() => { const interval = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(interval); }, []);

    const pendingLogs = useMemo(() => logs.filter(log => !log.acknowledgedBy?.includes(profileId)).sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(a.deadlineAt).getTime()), [logs, profileId]);
    const historyLogs = useMemo(() => logs.filter(log => log.acknowledgedBy?.includes(profileId)).sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()), [logs, profileId]);
    const groupedLogs = useMemo(() => {
        const activeList = viewMode === 'pending' ? pendingLogs : historyLogs;
        const groups: Record<string, any[]> = {};
        activeList.forEach(log => {
            const code = log.moduleCode || 'General';
            if (!groups[code]) groups[code] = [];
            groups[code].push(log);
        });
        return groups;
    }, [pendingLogs, historyLogs, viewMode]);

    useEffect(() => {
        if (Object.keys(groupedLogs).length > 0) setExpandedModules(new Set(Object.keys(groupedLogs)));
        else setExpandedModules(new Set());
    }, [groupedLogs, viewMode]);

    const toggleModuleAccordion = (moduleCode: string) => {
        setExpandedModules(prev => { const next = new Set(prev); if (next.has(moduleCode)) next.delete(moduleCode); else next.add(moduleCode); return next; });
    };

    const executeAcknowledge = async () => {
        if (!logToConfirm) return;
        setAcknowledgingId(logToConfirm.id);
        try {
            const ackFn = httpsCallable(getFunctions(), 'acknowledgeCurriculumTopic');
            await ackFn({ logId: logToConfirm.id, learnerId: profileId });
            toast.success("Topic Acknowledged! Keep up the momentum.");
            setLogToConfirm(null);
        } catch (error) {
            toast.error("Failed to acknowledge. Please try again.");
            setLogToConfirm(null);
        } finally { setAcknowledgingId(null); }
    };

    const formatTimeLeft = (deadlineIso: string) => {
        const total = new Date(deadlineIso).getTime() - now.getTime();
        if (total <= 0) return "Overdue";
        const h = Math.floor(total / (1000 * 60 * 60));
        const m = Math.floor((total / 1000 / 60) % 60);
        if (h > 24) return `${Math.floor(h / 24)} days left`;
        return `${h}h ${m}m left`;
    };

    return (
        <>
            {logToConfirm && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type={absenceDates.includes(logToConfirm.coveredAt) ? "warning" : "info"}
                        title={absenceDates.includes(logToConfirm.coveredAt) ? "Catch-up Confirmation" : "Confirm Delivery"}
                        message={absenceDates.includes(logToConfirm.coveredAt) ? `You were absent on ${new Date(logToConfirm.coveredAt).toLocaleDateString('en-ZA')}. By clicking confirm, you officially declare that you have reviewed the materials for "${logToConfirm.topicTitle}" and are now up to date.` : `By clicking confirm, you officially acknowledge that your facilitator delivered the training for "${logToConfirm.topicTitle}" on ${new Date(logToConfirm.coveredAt).toLocaleDateString('en-ZA')}.`}
                        onCancel={() => setLogToConfirm(null)}
                        onClose={executeAcknowledge}
                        confirmText={acknowledgingId === logToConfirm.id ? "Confirming..." : "Yes, I Confirm"}
                    />
                </div>, document.body
            )}

            {/* PENDING SURVEY ALERT BANNER IN ACTION INBOX */}
            {pendingSurveysCount > 0 && viewMode === 'pending' && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', padding: '12px 16px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ClipboardList size={18} color="#b45309" />
                        <div>
                            <strong style={{ color: '#b45309', fontSize: '0.85rem', display: 'block' }}>You have {pendingSurveysCount} pending survey feedback form(s)</strong>
                            <span style={{ color: '#78350f', fontSize: '0.75rem' }}>Your feedback directly helps shape teaching, pacing, and program quality.</span>
                        </div>
                    </div>
                    {onNavigateToSurveys && (
                        <button onClick={onNavigateToSurveys} className="mlab-btn mlab-btn--sm" style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: 0, textTransform: 'uppercase' }}>
                            Complete Surveys <ArrowRight size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                        </button>
                    )}
                </div>
            )}

            <div style={{ borderRadius: '0', overflow: 'hidden', marginBottom: '1.5rem', background: 'white', border: '1px solid var(--mlab-border)' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc' }}>
                    <button onClick={() => setViewMode('pending')} style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: `3px solid ${viewMode === 'pending' ? '#f59e0b' : 'transparent'}`, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, color: viewMode === 'pending' ? '#d97706' : 'var(--mlab-grey)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                        <Zap size={16} /> Pending Actions <span style={{ background: viewMode === 'pending' ? '#f59e0b' : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingLogs.length}</span>
                    </button>
                    <button onClick={() => setViewMode('history')} style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: `3px solid ${viewMode === 'history' ? GREEN : 'transparent'}`, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, color: viewMode === 'history' ? '#166534' : 'var(--mlab-grey)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                        <History size={16} /> History <span style={{ background: viewMode === 'history' ? GREEN : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{historyLogs.length}</span>
                    </button>
                </div>
                <div style={{ padding: '1.5rem', background: viewMode === 'pending' ? '#fffbeb' : '#f0fdf4' }}>
                    {viewMode === 'pending' && pendingLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <CheckCircle size={48} color={GREEN} style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>Inbox Zero!</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>You are all caught up. No pending curriculum topics to acknowledge.</p>
                        </div>
                    )}
                    {viewMode === 'history' && historyLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <History size={48} color="var(--mlab-grey-light)" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>No History Yet</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>Topics you acknowledge will appear here as a permanent record.</p>
                        </div>
                    )}
                    {((viewMode === 'pending' && pendingLogs.length > 0) || (viewMode === 'history' && historyLogs.length > 0)) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {viewMode === 'pending' && (
                                <p style={{ color: '#b45309', fontSize: '0.85rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px', background: '#fef3c7', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                    <AlertCircle size={16} /> You have pending curriculum topics to review. Acknowledge them below to stay compliant.
                                </p>
                            )}
                            {Object.keys(groupedLogs).map(modCode => {
                                const logs = groupedLogs[modCode];
                                const moduleName = logs[0].moduleName || 'Unnamed Module';
                                const isOpen = expandedModules.has(modCode);
                                const headerColor = viewMode === 'pending' ? '#d97706' : '#15803d';
                                const headerBg = viewMode === 'pending' ? '#fef3c7' : '#dcfce7';

                                return (
                                    <div key={modCode} style={{ background: 'white', borderRadius: '0', border: `1px solid ${viewMode === 'pending' ? '#fde68a' : '#bbf7d0'}`, overflow: 'hidden' }}>
                                        <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottom: isOpen ? `1px solid ${viewMode === 'pending' ? '#fde68a' : '#bbf7d0'}` : 'none', background: headerBg, padding: '12px 16px' }} onClick={() => toggleModuleAccordion(modCode)}>
                                            <Layers size={16} color={headerColor} />
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: headerColor, fontWeight: 700 }}>{modCode} <span style={{ fontWeight: 400, opacity: 0.8 }}>{moduleName}</span></span></div>
                                            {isOpen ? <ChevronUp size={16} color={headerColor} /> : <ChevronDown size={16} color={headerColor} />}
                                        </div>
                                        {isOpen && (
                                            <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                                                <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                    <tbody>
                                                        {logs.map(log => {
                                                            const timeDiff = new Date(log.deadlineAt).getTime() - now.getTime();
                                                            const isExpired = viewMode === 'pending' && timeDiff <= 0;
                                                            const isUrgent = viewMode === 'pending' && !isExpired && timeDiff < (12 * 60 * 60 * 1000);
                                                            const isMissed = absenceDates.includes(log.coveredAt);
                                                            let rowBg = 'white';
                                                            if (viewMode === 'pending') { if (isExpired) rowBg = '#fee2e2'; else if (isMissed) rowBg = '#fff1f2'; else if (isUrgent) rowBg = '#fef3c7'; }
                                                            return (
                                                                <tr key={log.id} style={{ background: rowBg, borderBottom: '1px solid var(--mlab-border)' }}>
                                                                    <td style={{ padding: '16px' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                {isMissed && viewMode === 'pending' && <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>Missed Day</span>}
                                                                                <span style={{ fontWeight: 600, color: MIDNIGHT, fontSize: '0.85rem' }}>{log.topicCode ? `${log.topicCode}: ` : ''}{log.topicTitle}</span>
                                                                            </div>
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '4px' }}>Delivered: {log.coveredAt ? new Date(log.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</span>
                                                                            {isMissed && viewMode === 'pending' && (
                                                                                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', border: '1px dashed #fda4af' }}>
                                                                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.7rem', textTransform: 'uppercase', color: '#be123c', display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} /> Catch-up Materials</h5>
                                                                                    {log.catchUpNotes ? <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#475569' }}>{log.catchUpNotes}</p> : <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', fontStyle: 'italic', color: '#94a3b8' }}>No notes provided by facilitator.</p>}
                                                                                    {log.videoLink && <a href={log.videoLink} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#e11d48', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', background: '#ffe4e6', padding: '4px 10px', borderRadius: '4px' }}><PlayCircle size={14} /> Watch Recording</a>}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ textAlign: 'right', width: '220px', padding: '16px' }}>
                                                                        {viewMode === 'pending' ? (
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: isExpired ? '#b91c1c' : (isUrgent ? '#d97706' : '#64748b'), fontSize: '0.75rem', fontWeight: 700 }}><Clock size={12} /> {formatTimeLeft(log.deadlineAt)}</div>
                                                                                <button className="mlab-btn mlab-btn--sm" style={{ background: isExpired ? '#dc2626' : (isMissed ? '#e11d48' : GREEN), color: (isExpired || isMissed) ? 'white' : MIDNIGHT, border: 'none', padding: '6px 12px' }} onClick={() => setLogToConfirm(log)} disabled={acknowledgingId === log.id}>{acknowledgingId === log.id ? <Loader2 size={14} className="lfm-spin" /> : (isMissed ? "Caught Up" : "Acknowledge")}</button>
                                                                            </div>
                                                                        ) : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}><CheckCircle size={12} /> Acknowledged</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
const LearnerDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates' | 'attendance'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [activeDashTab, setActiveDashTab] = useState<'programmes' | 'tasks' | 'events' | 'surveys'>('programmes');

    const [academicProfile, setAcademicProfile] = useState<any>(null);
    const [learnerEnrollments, setLearnerEnrollments] = useState<any[]>([]);
    const [allCurriculumLogs, setAllCurriculumLogs] = useState<any[]>([]);
    const [absenceDates, setAbsenceDates] = useState<any[]>([]);

    const [showWorkplaceLogModal, setShowWorkplaceLogModal] = useState(false);
    const [activeEditLog, setActiveEditLog] = useState<any>(null);

    const [myScans, setMyScans] = useState<any[]>([]);
    const [virtualAttendance, setVirtualAttendance] = useState<any[]>([]);
    const [historicalScans, setHistoricalScans] = useState<any[]>([]);
    const [myWorkplaceLogs, setMyWorkplaceLogs] = useState<any[]>([]);

    const [eventCheckins, setEventCheckins] = useState<any[]>([]);
    const [allEcosystemEvents, setAllEcosystemEvents] = useState<any[]>([]);
    const [eventSearch, setEventSearch] = useState('');

    // 🚀 LEARNER SURVEY & ASSESSMENT STATES
    const [allSurveys, setAllSurveys] = useState<any[]>([]);
    const [mySurveyResponses, setMySurveyResponses] = useState<any[]>([]);
    const [cohortAssessments, setCohortAssessments] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [showStreakLostModal, setShowStreakLostModal] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showKPIs, setShowKPIs] = useState(true);

    const [cohortSearch, setCohortSearch] = useState('');
    const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
    const [cohortSort, setCohortSort] = useState<SortType>('newest');
    const [showCohortFilters, setShowCohortFilters] = useState(false);

    const [certSearch, setCertSearch] = useState('');
    const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
    const [certSort, setCertSort] = useState<SortType>('newest');
    const [showCertFilters, setShowCertFilters] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    const cleanDateKey = (d: any) => {
        if (!d) return '';
        const str = String(d).trim();
        return str.split('T')[0];
    };

    // 🚀 MASTER STREAM HOISTING ENGINE
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();

        if (!store.user?.uid) {
            return;
        }

        let unsubscribeProfile: () => void;
        let unsubscribeScans: () => void;
        let unsubscribeVirtualRecords: () => void;
        let unsubscribeVirtualLogs: () => void;
        let unsubscribeWorklogs: () => void;

        const setupLiveProfile = async () => {
            setIsLoading(true);
            try {
                let profileDocRef = null;

                const qUid = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));
                const snapUid = await getDocs(qUid);

                if (!snapUid.empty) {
                    profileDocRef = doc(db, 'learners', snapUid.docs[0].id);
                } else if (store.user?.email) {
                    const qEmail = query(collection(db, 'learners'), where('email', '==', store.user.email));
                    const snapEmail = await getDocs(qEmail);

                    if (!snapEmail.empty) {
                        profileDocRef = doc(db, 'learners', snapEmail.docs[0].id);
                        await updateDoc(profileDocRef, { authUid: store.user!.uid });
                    }
                }

                if (!profileDocRef) {
                    setIsLoading(false);
                    return;
                }

                unsubscribeProfile = onSnapshot(profileDocRef, async (profileSnap: any) => {
                    const processProfileData = async () => {
                        if (!profileSnap.exists()) return;

                        const profileData = profileSnap.data();
                        const finalProfileId = profileSnap.id;
                        const profile: any = { id: finalProfileId, ...profileData };

                        setAcademicProfile((prev: any) => {
                            if (prev && prev.professionalismStreak > 0 && profile.professionalismStreak === 0) {
                                setShowStreakLostModal(true);
                            }
                            else if (!prev && profile.professionalismStreak === 0 && profile.professionalismScore < 100) {
                                const localKey = `streak_loss_seen_${finalProfileId}_${profile.professionalismScore}`;
                                if (!localStorage.getItem(localKey)) {
                                    setShowStreakLostModal(true);
                                    localStorage.setItem(localKey, 'true');
                                }
                            }
                            return {
                                ...profile,
                                employerId: prev?.employerId || profile.employerId || null,
                                mentorId: prev?.mentorId || profile.mentorId || null
                            };
                        });

                        const possibleIdentities = Array.from(new Set([
                            finalProfileId,
                            profile.idNumber,
                            profile.learnerId,
                            profile.authUid
                        ].filter(Boolean)));

                        const enrolQ = query(
                            collection(db, 'enrollments'),
                            where('learnerId', 'in', possibleIdentities),
                            where('status', 'in', ['active', 'in-progress', 'transferred', 'bootcamp', 'completed'])
                        );

                        const snapEnrol = await getDocs(enrolQ);
                        let enrolls: any[] = snapEnrol.docs.map(d => ({ id: d.id, ...d.data() }));

                        if (enrolls.length === 0) {
                            let activeCohortId = profile.cohortId;

                            if (!activeCohortId && store.cohorts) {
                                const foundCohort = store.cohorts.find(c => c.learnerIds?.some(id => possibleIdentities.includes(id)));
                                if (foundCohort) activeCohortId = foundCohort.id;
                            }

                            if (activeCohortId) {
                                enrolls = [{
                                    id: `synthetic_${finalProfileId}`,
                                    learnerId: finalProfileId,
                                    cohortId: activeCohortId,
                                    status: 'active',
                                    qualification: profile.qualification || null
                                }];
                            }
                        }

                        setLearnerEnrollments(enrolls);

                        if (enrolls.length > 0) {
                            let activeEnrollment: any = enrolls.find((e: any) => ['active', 'in-progress'].includes(e.status)) || enrolls[0];
                            const hasWE = activeEnrollment.workExperienceModules && activeEnrollment.workExperienceModules.length > 0;

                            if (!hasWE) {
                                try {
                                    const cohortDocRef = doc(db, 'cohorts', activeEnrollment.cohortId);
                                    const cohortSnap = await getDoc(cohortDocRef);
                                    let masterProgrammeId = activeEnrollment.programmeId;

                                    if (cohortSnap.exists()) {
                                        masterProgrammeId = cohortSnap.data().programmeId || masterProgrammeId;
                                    }

                                    if (masterProgrammeId) {
                                        const progSnap = await getDoc(doc(db, 'programmes', masterProgrammeId));

                                        if (progSnap.exists()) {
                                            const progData = progSnap.data();
                                            activeEnrollment.workExperienceModules = progData.workExperienceModules || [];
                                            activeEnrollment.practicalModules = progData.practicalModules || [];
                                            activeEnrollment.knowledgeModules = progData.knowledgeModules || [];
                                        }
                                    }
                                } catch (healError) { }
                            }

                            setAcademicProfile((prev: any) => prev ? {
                                ...prev,
                                workExperienceModules: activeEnrollment.workExperienceModules || [],
                                practicalModules: activeEnrollment.practicalModules || [],
                                knowledgeModules: activeEnrollment.knowledgeModules || [],
                                qualification: activeEnrollment.qualification || prev.qualification
                            } : prev);
                        }

                        const possibleScanIds = Array.from(new Set([finalProfileId, profile.idNumber].filter(Boolean)));
                        const cohortIdsArray = Array.from(new Set(enrolls.map((e: any) => e.cohortId).filter(Boolean)));
                        if (profile.cohortId) cohortIdsArray.push(profile.cohortId);

                        // 1. FETCH ABSENCES & HISTORICAL SCANS FROM 'attendance'
                        if (cohortIdsArray.length > 0) {
                            const qAtt = query(collection(db, 'attendance'), where('cohortId', 'in', Array.from(new Set(cohortIdsArray))));
                            const snapAtt = await getDocs(qAtt);

                            const missed: any[] = [];
                            const pastPresents: any[] = [];

                            snapAtt.docs.forEach(d => {
                                const attData = d.data();
                                const isAbsent = attData.absentLearners?.includes(profile.id) || attData.absentLearners?.includes(profile.idNumber);
                                const isPresent = attData.presentLearners?.includes(profile.id) || attData.presentLearners?.includes(profile.idNumber);

                                if (isAbsent) {
                                    missed.push({ date: attData.date, cohortId: attData.cohortId || '', cohortName: attData.cohortName || '' });
                                } else if (isPresent) {
                                    const scanRecord = attData.scans?.[profile.id] || attData.scans?.[profile.idNumber];
                                    const fallbackCheckIn = new Date(`${attData.date}T08:00:00`).getTime();
                                    const fallbackCheckOut = new Date(`${attData.date}T16:00:00`).getTime();

                                    pastPresents.push({
                                        id: `${attData.cohortId}_${attData.date}`,
                                        dateString: attData.date,
                                        cohortId: attData.cohortId,
                                        cohortName: attData.cohortName,
                                        checkInAt: scanRecord?.checkInAt || fallbackCheckIn,
                                        lunchOutAt: scanRecord?.lunchOutAt || null,
                                        lunchInAt: scanRecord?.lunchInAt || null,
                                        checkOutAt: scanRecord?.checkOutAt || fallbackCheckOut
                                    });
                                }
                            });

                            setAbsenceDates(missed);
                            setHistoricalScans(pastPresents);
                        }

                        // 2. FETCH VIRTUAL LOGS & METADATA MAP
                        let logsMetaMap = new Map<string, any>();
                        let rawRecords: any[] = [];
                        let rawLogs: any[] = [];

                        const learnerIdNum = String(profile.idNumber || '').trim();
                        const learnerProfileId = String(finalProfileId || '').trim();
                        const userEmail = String(profile.email || store.user?.email || '').toLowerCase().trim();
                        const userName = String(profile.fullName || store.user?.fullName || '').toLowerCase().trim();

                        const logsQ = collection(db, 'attendance_logs');
                        unsubscribeVirtualLogs = onSnapshot(logsQ, (logsSnap) => {
                            logsMetaMap.clear();
                            rawLogs = [];

                            logsSnap.docs.forEach(docSnap => {
                                const data = docSnap.data();
                                const dateStr = cleanDateKey(data.sessionDate || data.date);

                                const link = data.sessionZoomLink || data.zoomLink || data.videoLink ||
                                    data.recordingLink || data.recordingUrl || data.zoomUrl ||
                                    data.videoUrl || data.sessionRecordingUrl || data.link || '';

                                const meta = {
                                    sessionTitle: data.sessionTitle || data.topicTitle || data.title || '',
                                    sessionDescription: data.sessionDescription || data.description || '',
                                    sessionZoomLink: link
                                };

                                logsMetaMap.set(docSnap.id, meta);

                                if (data.cohortId && dateStr) {
                                    logsMetaMap.set(`${data.cohortId}_${dateStr}`, meta);
                                }

                                if (dateStr) {
                                    logsMetaMap.set(dateStr, meta);
                                }

                                if (data.rawZoomData && Array.isArray(data.rawZoomData)) {
                                    const match = data.rawZoomData.find((z: any) => {
                                        const zId = String(z.idNumber || z.learnerId || z.id || '').trim();
                                        const zEmail = String(z.email || '').toLowerCase().trim();
                                        const zName = String(z.name || '').toLowerCase().trim();

                                        if (learnerIdNum && zId && zId === learnerIdNum) return true;
                                        if (learnerProfileId && zId && zId === learnerProfileId) return true;
                                        if (userEmail && zEmail && zEmail === userEmail) return true;
                                        if (userName && zName && zName === userName) return true;

                                        return false;
                                    });

                                    if (match) {
                                        const actual = Number(match.duration) || 0;
                                        const expected = Number(data.expectedDuration) || 120;
                                        const pct = expected > 0 ? (actual / expected) * 100 : 0;

                                        let vStatus = 'Absent';
                                        if (pct >= 80) vStatus = 'Present';
                                        else if (pct >= 20) vStatus = 'Partial';

                                        rawLogs.push({
                                            id: docSnap.id,
                                            cohortId: data.cohortId,
                                            sessionDate: dateStr,
                                            actualDuration: actual,
                                            expectedDuration: expected,
                                            status: vStatus,
                                            ...meta
                                        });
                                    }
                                }
                            });

                            combineVirtualSources();
                        });

                        if (possibleScanIds.length > 0) {
                            const recQ = query(collection(db, 'attendance_records'), where('learnerId', 'in', possibleScanIds));
                            unsubscribeVirtualRecords = onSnapshot(recQ, (recSnap) => {
                                rawRecords = recSnap.docs.map(d => {
                                    const data = d.data();
                                    const dateStr = cleanDateKey(data.sessionDate || data.dateString || data.date);
                                    const cohortId = data.cohortId || '';

                                    const meta = logsMetaMap.get(data.attendanceLogId) ||
                                        logsMetaMap.get(`${cohortId}_${dateStr}`) ||
                                        logsMetaMap.get(dateStr) || {};

                                    const link = data.sessionZoomLink || data.zoomLink || data.videoLink ||
                                        data.recordingLink || data.recordingUrl || meta.sessionZoomLink || '';

                                    return {
                                        id: d.id,
                                        cohortId: cohortId,
                                        sessionDate: dateStr,
                                        actualDuration: Number(data.actualDuration) || 0,
                                        expectedDuration: Number(data.expectedDuration) || 120,
                                        status: data.status || 'Present',
                                        sessionTitle: data.sessionTitle || data.topicTitle || data.title || meta.sessionTitle || '',
                                        sessionDescription: data.sessionDescription || data.description || meta.sessionDescription || '',
                                        sessionZoomLink: link
                                    };
                                });

                                combineVirtualSources();
                            });
                        }

                        const combineVirtualSources = () => {
                            const map = new Map();
                            [...rawRecords, ...rawLogs].forEach(item => {
                                const dateStr = cleanDateKey(item.sessionDate);
                                const key = `${dateStr}_${item.cohortId}`;
                                const meta = logsMetaMap.get(item.id) ||
                                    logsMetaMap.get(`${item.cohortId}_${dateStr}`) ||
                                    logsMetaMap.get(dateStr) || {};

                                const link = item.sessionZoomLink || meta.sessionZoomLink || '';

                                const enrichedItem = {
                                    ...item,
                                    sessionDate: dateStr,
                                    sessionTitle: item.sessionTitle || meta.sessionTitle || '',
                                    sessionDescription: item.sessionDescription || meta.sessionDescription || '',
                                    sessionZoomLink: link
                                };

                                if (!map.has(key)) {
                                    map.set(key, enrichedItem);
                                } else {
                                    const existing = map.get(key);
                                    map.set(key, {
                                        ...existing,
                                        ...enrichedItem,
                                        sessionTitle: enrichedItem.sessionTitle || existing.sessionTitle,
                                        sessionDescription: enrichedItem.sessionDescription || existing.sessionDescription,
                                        sessionZoomLink: enrichedItem.sessionZoomLink || existing.sessionZoomLink
                                    });
                                }
                            });
                            const mergedVirtual = Array.from(map.values());
                            setVirtualAttendance(mergedVirtual);
                        };

                        if (possibleScanIds.length > 0) {
                            const scansQ = query(collection(db, 'live_attendance_scans'), where('learnerId', 'in', possibleScanIds));
                            unsubscribeScans = onSnapshot(scansQ, (snapScans) => {
                                setMyScans(snapScans.docs.map(d => ({ id: d.id, ...d.data() })));
                            });

                            const worklogsQ = query(collection(db, 'workplace_logs'), where('learnerId', 'in', possibleScanIds));
                            unsubscribeWorklogs = onSnapshot(worklogsQ, (snapLogs) => {
                                setMyWorkplaceLogs(snapLogs.docs.map(d => ({ id: d.id, ...d.data() })));
                            });
                        }

                        setIsLoading(false);
                    };

                    processProfileData();
                });

            } catch (error) {
                console.error('❌ Critical outer error in setupLiveProfile:', error);
                setIsLoading(false);
            }
        };

        setupLiveProfile();

        return () => {
            if (unsubscribeProfile) unsubscribeProfile();
            if (unsubscribeScans) unsubscribeScans();
            if (unsubscribeVirtualRecords) unsubscribeVirtualRecords();
            if (unsubscribeVirtualLogs) unsubscribeVirtualLogs();
            if (unsubscribeWorklogs) unsubscribeWorklogs();
        };
    }, [store.user?.uid]);

    useEffect(() => {
        if (!academicProfile?.id) return;
        const possibleIds = [academicProfile.id, ...learnerEnrollments.map(e => e.id)];
        const placementQ = query(collection(db, 'placements'), where('learnerId', 'in', possibleIds));

        const unsubscribe = onSnapshot(placementQ, (snapPlacement) => {
            if (!snapPlacement.empty) {
                const activeDocs = snapPlacement.docs.map(d => d.data()).filter(p => {
                    const status = String(p.status || '').toLowerCase();
                    return status.includes('active') || status.includes('pending');
                });

                if (activeDocs.length > 0) {
                    const placementData = activeDocs[0];
                    setAcademicProfile((prev: any) => prev ? {
                        ...prev,
                        employerId: placementData.employerId,
                        mentorId: placementData.mentorId || placementData.assignedMentorId
                    } : prev);
                    return;
                }
            }
            setAcademicProfile((prev: any) => prev ? { ...prev, employerId: null, mentorId: null } : prev);
        });

        return () => unsubscribe();
    }, [academicProfile?.id, learnerEnrollments]);

    useEffect(() => {
        if (!store.user?.email) return;
        const checkinsQ = query(collection(db, 'event_checkins'), where('guestEmail', '==', store.user.email.toLowerCase()));
        const unsubCheckins = onSnapshot(checkinsQ, (snap) => setEventCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const eventsQ = query(collection(db, 'events'));
        const unsubEvents = onSnapshot(eventsQ, (snap) => setAllEcosystemEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubCheckins(); unsubEvents(); };
    }, [store.user?.email]);

    // 🚀 LISTEN TO ALL ACTIVE SURVEYS & LEARNER SUBMISSIONS
    useEffect(() => {
        if (!academicProfile?.id) return;

        // Fetch survey templates
        const unsubSurveys = onSnapshot(collection(db, 'surveys'), (snap) => {
            setAllSurveys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Fetch learner survey responses with rule-safety fallback
        const fetchResponses = async () => {
            const currentUid = auth.currentUser?.uid || store.user?.uid;
            if (!currentUid) return;

            try {
                const qResponses = query(
                    collection(db, 'survey_responses'),
                    where('learnerId', '==', currentUid)
                );
                const snap = await getDocs(qResponses);
                setMySurveyResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err: any) {
                console.warn("Learner survey responses query bypassed:", err.message);
            }
        };

        fetchResponses();

        return () => {
            unsubSurveys();
        };
    }, [academicProfile?.id, store.user?.uid]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const myCohorts = useMemo(() => {
        if (!store.cohorts) return [];
        const enrolledCohortIds = new Set(learnerEnrollments.map(e => e.cohortId));
        if (academicProfile?.cohortId) enrolledCohortIds.add(academicProfile.cohortId);
        return store.cohorts.filter(c => enrolledCohortIds.has(c.id));
    }, [learnerEnrollments, store.cohorts, academicProfile?.cohortId]);

    // 🚀 FETCH ASSESSMENTS FOR MY COHORTS TO ENRICH ASSESSMENT SURVEY METADATA
    useEffect(() => {
        if (!myCohorts || myCohorts.length === 0) return;
        const cohortIds = Array.from(new Set(myCohorts.map(c => c.id)));

        const qAss = query(collection(db, 'assessments'), where('cohortId', 'in', cohortIds));
        const unsubAss = onSnapshot(qAss, (snap) => {
            setCohortAssessments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => unsubAss();
    }, [myCohorts]);

    // MAP OF ASSESSMENTS & LINKED SURVEYS
    const assessmentMap = useMemo(() => {
        const map = new Map<string, any>();
        cohortAssessments.forEach(a => {
            map.set(a.id, a);
            if (a.surveyId) {
                map.set(`survey_${a.surveyId}`, a);
            }
        });
        return map;
    }, [cohortAssessments]);

    // 🚀 STRICT COHORT & ASSESSMENT SPECIFIC ASSIGNED SURVEYS (GENERAL/GLOBAL EXCLUDED)
    const assignedSurveys = useMemo(() => {
        if (!myCohorts || myCohorts.length === 0) return [];
        const myCohortIds = new Set(myCohorts.map(c => c.id));

        return allSurveys.filter(survey => {
            if (survey.isActive === false) return false;

            const targetCohortIds = survey.cohortIds || [];

            // STRICT MATCH 1: Explicitly assigned to one of the learner's cohorts (Excludes general 'ALL' / empty)
            const isCohortMatch = targetCohortIds.some((id: string) => myCohortIds.has(id)) ||
                (survey.cohortId && myCohortIds.has(survey.cohortId));

            // STRICT MATCH 2: Explicitly linked to an assessment belonging to one of the learner's cohorts
            const isAssessmentMatch = Boolean(survey.assessmentId && assessmentMap.has(survey.assessmentId));
            const isLinkedToAssessment = assessmentMap.has(`survey_${survey.id}`);

            return isCohortMatch || isAssessmentMatch || isLinkedToAssessment;
        }).map(survey => {
            const linkedAssessment = survey.assessmentId ? assessmentMap.get(survey.assessmentId) : assessmentMap.get(`survey_${survey.id}`);

            const isAssessmentSurvey = Boolean(survey.assessmentId || linkedAssessment);

            return {
                ...survey,
                isAssessmentSurvey,
                moduleNumber: linkedAssessment?.moduleInfo?.moduleNumber || linkedAssessment?.moduleNumber || 'Module',
                moduleTitle: linkedAssessment?.moduleInfo?.moduleTitle || linkedAssessment?.title || linkedAssessment?.moduleTitle || null,
                assessmentTitle: linkedAssessment?.title || null
            };
        });
    }, [allSurveys, myCohorts, assessmentMap]);

    const pendingSurveysList = useMemo(() => {
        const completedSurveyIds = new Set(mySurveyResponses.map(r => r.surveyId));
        return assignedSurveys.filter(s => !completedSurveyIds.has(s.id));
    }, [assignedSurveys, mySurveyResponses]);

    const completedSurveysList = useMemo(() => {
        const responseMap = new Map(mySurveyResponses.map(r => [r.surveyId, r]));
        return assignedSurveys.filter(s => responseMap.has(s.id)).map(s => ({
            ...s,
            response: responseMap.get(s.id)
        }));
    }, [assignedSurveys, mySurveyResponses]);

    const pendingSurveysCount = pendingSurveysList.length;

    const myAttendedEvents = useMemo(() => {
        const checkinMap = new Map();
        eventCheckins.forEach(c => checkinMap.set(c.eventId, c));

        return allEcosystemEvents
            .filter(e => checkinMap.has(e.id))
            .map(e => ({ ...e, checkinData: checkinMap.get(e.id) }))
            .sort((a, b) => {
                const timeA = getSafeTime(a.checkinData.timestamp);
                const timeB = getSafeTime(b.checkinData.timestamp);
                return timeB.getTime() - timeA.getTime();
            });
    }, [eventCheckins, allEcosystemEvents]);

    const filteredEcosystemEvents = useMemo(() => {
        if (!eventSearch.trim()) return myAttendedEvents;
        const lower = eventSearch.toLowerCase();
        return myAttendedEvents.filter(e =>
            e.eventName?.toLowerCase().includes(lower) ||
            e.location?.toLowerCase().includes(lower) ||
            e.eventType?.toLowerCase().includes(lower)
        );
    }, [myAttendedEvents, eventSearch]);

    useEffect(() => {
        if (!academicProfile?.id || myCohorts.length === 0) return;
        const cohortIds = myCohorts.map(c => c.id);
        const logsRef = collection(db, 'curriculum_logs');
        const q = query(logsRef, where('cohortId', 'in', cohortIds));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setAllCurriculumLogs(logs);
        });
        return () => unsubscribe();
    }, [academicProfile?.id, myCohorts]);

    const inboxHealth = useMemo(() => {
        if (!academicProfile?.id) return { ack: 0, pending: 0, overdue: 0, total: 0 };
        let ack = 0, pending = 0, overdue = 0;
        const nowTime = new Date().getTime();

        allCurriculumLogs.forEach(log => {
            if (log.acknowledgedBy?.includes(academicProfile.id)) {
                ack++;
            } else {
                if (new Date(log.deadlineAt).getTime() > nowTime) pending++;
                else overdue++;
            }
        });
        return { ack, pending, overdue, total: allCurriculumLogs.length };
    }, [allCurriculumLogs, academicProfile?.id]);

    const eventStats = useMemo(() => {
        let masterclass = 0, hackathon = 0, workshop = 0;
        myAttendedEvents.forEach(e => {
            const type = (e.eventType || '').toLowerCase();
            if (type.includes('masterclass')) masterclass++;
            else if (type.includes('hackathon')) hackathon++;
            else workshop++;
        });
        return { masterclass, hackathon, workshop, total: myAttendedEvents.length };
    }, [myAttendedEvents]);

    const pendingCount = inboxHealth.pending + inboxHealth.overdue;

    const formattedScanHistory = useMemo(() => {
        const daysMap = new Map();
        const allScans = [...myScans, ...historicalScans];

        allScans.forEach(scan => {
            if (!daysMap.has(scan.dateString)) {
                daysMap.set(scan.dateString, scan);
            } else {
                const existing = daysMap.get(scan.dateString);
                daysMap.set(scan.dateString, {
                    ...existing,
                    checkInAt: Math.min(existing.checkInAt || Infinity, scan.checkInAt || Infinity),
                    checkOutAt: scan.checkOutAt ? Math.max(existing.checkOutAt || 0, scan.checkOutAt) : existing.checkOutAt,
                    lunchOutAt: scan.lunchOutAt || existing.lunchOutAt,
                    lunchInAt: scan.lunchInAt || existing.lunchInAt
                });
            }
        });
        return Array.from(daysMap.values()).sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());
    }, [myScans, historicalScans]);

    const resolvedAbsenceDates = useMemo(() => {
        if (!absenceDates) return [];
        return absenceDates.map((abs: any) => {
            if (typeof abs === 'string') return { date: abs, cohortName: 'Unknown Class', cohortId: '' };
            const relatedCohort = store.cohorts?.find(c => c.id === abs.cohortId);
            if (relatedCohort?.name) return { date: abs.date, cohortName: relatedCohort.name, cohortId: abs.cohortId };
            if (abs.cohortName) return { date: abs.date, cohortName: abs.cohortName, cohortId: abs.cohortId };
            return { date: abs.date, cohortName: 'Unknown Class', cohortId: abs.cohortId };
        });
    }, [absenceDates, store.cohorts]);

    const absenceDateStrings = useMemo(() => resolvedAbsenceDates.map(a => a.date), [resolvedAbsenceDates]);

    const attendanceStats = useMemo(() => {
        const physicalPresents = formattedScanHistory.length;
        const virtualPresents = virtualAttendance.filter(r => r.status === 'Present').length;
        const virtualPartials = virtualAttendance.filter(r => r.status === 'Partial').length;
        const virtualAbsents = virtualAttendance.filter(r => r.status === 'Absent').length;
        const physicalAbsents = resolvedAbsenceDates.length;

        const fullPresent = physicalPresents + virtualPresents;
        const partial = virtualPartials;
        const absent = physicalAbsents + virtualAbsents;
        const total = fullPresent + partial + absent;

        const effectiveScore = total === 0 ? 100 : Math.round(((fullPresent + (partial * 0.5)) / total) * 100);

        return {
            present: fullPresent + partial,
            fullPresent,
            physicalPresents,
            virtualPresents,
            partial,
            absent,
            physicalAbsents,
            virtualAbsents,
            total,
            effectiveScore
        };
    }, [formattedScanHistory, resolvedAbsenceDates, virtualAttendance]);

    const attendancePercentage = attendanceStats.effectiveScore;

    const getStaffName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const filteredCohorts = useMemo(() => {
        let result = [...myCohorts];
        if (cohortSearch.trim()) {
            const searchLower = cohortSearch.toLowerCase();
            result = result.filter(c => c.name?.toLowerCase().includes(searchLower) || getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower));
        }
        const today = new Date();
        if (cohortFilter === 'active') {
            result = result.filter(c => {
                const start = new Date(c.startDate);
                const end = new Date(c.endDate);
                return start <= today && end >= today;
            });
        } else if (cohortFilter === 'completed') {
            result = result.filter(c => new Date(c.endDate) < today);
        } else if (cohortFilter === 'upcoming') {
            result = result.filter(c => new Date(c.startDate) > today);
        }
        result.sort((a, b) => {
            if (cohortSort === 'name') return a.name?.localeCompare(b.name);
            const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
            const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
            return dateA.getTime() - dateB.getTime();
        });
        return result;
    }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

    const filteredCertificates = useMemo(() => {
        const certs = academicProfile?.certificates || [];
        let result = [...certs];
        if (certSearch.trim()) {
            const searchLower = certSearch.toLowerCase();
            result = result.filter((c: any) => c.type?.toLowerCase().includes(searchLower) || c.courseName?.toLowerCase().includes(searchLower));
        }
        if (certFilter !== 'all') {
            result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
        }
        result.sort((a: any, b: any) => {
            if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
            const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
            const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
            return dateA.getTime() - dateB.getTime();
        });
        return result;
    }, [academicProfile?.certificates, certSearch, certFilter, certSort]);

    const pageTitle = currentNav === 'dashboard' ? 'My Dashboard' : currentNav === 'certificates' ? 'My Certificates' : currentNav === 'attendance' ? 'Compliance Hub' : 'My Profile';
    const pageSub = currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` : currentNav === 'certificates' ? 'Official certificates issued to your profile' : currentNav === 'attendance' ? 'Track your compliance matrix and hardware log status' : 'Manage your personal details and account';

    const clearCohortFilters = () => { setCohortSearch(''); setCohortFilter('all'); setCohortSort('newest'); };
    const clearCertFilters = () => { setCertSearch(''); setCertFilter('all'); setCertSort('newest'); };

    const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
    const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

    const pScore = academicProfile?.professionalismScore ?? 100;
    const pStreak = academicProfile?.professionalismStreak ?? 0;

    const [showWelcomeAnim, setShowWelcomeAnim] = useState(false);

    useEffect(() => {
        if (!isLoading && store.user) {
            if (pendingCount > 0) {
                const timer = setTimeout(() => {
                    setShowWelcomeAnim(true);
                }, 500);
                return () => clearTimeout(timer);
            }
        }
    }, [isLoading, pendingCount, store.user]);

    const handleWelcomeDismiss = () => {
        setShowWelcomeAnim(false);
        setActiveDashTab('tasks');
    };

    if (isLoading) {
        return (
            <div className="admin-layout learner-layout">
                <div className="ld-loading">
                    <Hexagon size={40} className="ld-loading__icon spin" />
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--mlab-green)" />
                        <stop offset="100%" stopColor="var(--mlab-green-dark)" />
                    </linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="100%" stopColor="#475569" />
                    </linearGradient>
                </defs>
            </svg>

            {showWorkplaceLogModal && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <LearnerWorkplaceLogModal
                        learner={academicProfile}
                        existingLog={activeEditLog}
                        onClose={() => {
                            setShowWorkplaceLogModal(false);
                            setActiveEditLog(null);
                        }}
                    />
                </div>,
                document.body
            )}

            {showStreakLostModal && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="warning"
                        title="🔥 Streak Lost!"
                        message="Your Professionalism Streak has been reset to 0 because you failed to acknowledge a curriculum topic on time, or you were marked absent. It is critical to stay up to date with your Action Inbox to remain compliant. Let's start building that streak back up today!"
                        onClose={() => setShowStreakLostModal(false)}
                        confirmText="I Understand"
                    />
                </div>,
                document.body
            )}

            <div className="admin-layout learner-layout">
                <header className="ld-mobile-header">
                    <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu size={20} />
                    </button>
                    <div className="ld-mobile-brand">
                        <span className="ld-mobile-brand__logo">mLab</span>
                        <span className="ld-mobile-brand__sub">Learner Portal</span>
                    </div>
                </header>

                {isMobileMenuOpen && (
                    <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
                )}

                <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
                    <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={20} />
                    </button>
                    <Sidebar
                        role={store.user?.role}
                        currentNav={currentNav}
                        setCurrentNav={setCurrentNav as any}
                        onLogout={handleLogout}
                    />
                </div>

                {showWelcomeAnim && (
                    <WelcomeGamificationPopup
                        userName={store.user?.fullName || 'Learner'}
                        score={pScore}
                        pendingCount={pendingCount}
                        onDismiss={handleWelcomeDismiss}
                    />
                )}

                <main className="main-wrapper">
                    <div className="dashboard-header dashboard-header--compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="header-title">
                            <div className="header-badge">
                                <Shield size={12} />
                                <span>Verified</span>
                            </div>
                            <h1>{pageTitle}</h1>
                            <p>{pageSub}</p>
                        </div>
                    </div>

                    <div className="admin-content">

                        {currentNav === 'dashboard' && (
                            <div className="ld-animate">

                                <ProfessionalismWidget pScore={pScore} pStreak={pStreak} />

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
                                    <button
                                        onClick={() => setShowKPIs(!showKPIs)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            background: 'transparent', border: 'none', color: 'var(--mlab-grey)',
                                            fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700,
                                            textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
                                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
                                    >
                                        {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
                                    </button>
                                </div>

                                {showKPIs && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }} className="animate-slide-down">
                                        <ModuleProgressCard
                                            type="Active Cohorts"
                                            data={{ total: myCohorts.length, logged: myCohorts.filter(c => !c.isArchived).length }}
                                        />

                                        <ModuleProgressCard
                                            type="Pending Marking"
                                            data={{
                                                total: inboxHealth.total,
                                                logged: inboxHealth.ack,
                                                subValue: `${inboxHealth.total} Topics`,
                                                segments: [
                                                    { label: 'Acknowledged', value: inboxHealth.ack, color: '#16a34a' },
                                                    { label: 'Pending', value: inboxHealth.pending, color: '#f59e0b' },
                                                    { label: 'Overdue', value: inboxHealth.overdue, color: '#dc2626' }
                                                ]
                                            }}
                                        />

                                        <ModuleProgressCard
                                            type="Attendance Ratio"
                                            data={{
                                                total: attendanceStats.total,
                                                logged: attendanceStats.fullPresent,
                                                subValue: `${attendanceStats.effectiveScore}% Compliance`,
                                                segments: [
                                                    { label: 'Present', value: attendanceStats.fullPresent, color: '#16a34a' },
                                                    { label: 'Partial', value: attendanceStats.partial, color: '#f59e0b' },
                                                    { label: 'Absent', value: attendanceStats.absent, color: '#dc2626' }
                                                ]
                                            }}
                                        />

                                        <ModuleProgressCard
                                            type="Web3 Certificates"
                                            data={{ total: filteredCertificates.length, logged: filteredCertificates.length }}
                                        />

                                        <ModuleProgressCard
                                            type="Pipeline Activation"
                                            orientation="landscape"
                                            data={{
                                                total: allEcosystemEvents.length,
                                                logged: myAttendedEvents.length,
                                                subValue: "Ecosystem Engagement",
                                                lines: [
                                                    { label: 'Masterclasses', value: eventStats.masterclass, total: eventStats.total, color: '#8b5cf6', bg: '#f3e8ff' },
                                                    { label: 'Hackathons', value: eventStats.hackathon, total: eventStats.total, color: '#f59e0b', bg: '#fef3c7' },
                                                    { label: 'Workshops & Events', value: eventStats.workshop, total: eventStats.total, color: '#0ea5e9', bg: '#e0f2fe' }
                                                ]
                                            }}
                                        />
                                    </div>
                                )}

                                {/* MAIN DASHBOARD SUB-TAB NAVIGATION */}
                                <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--mlab-border)', marginBottom: '1.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                    <button
                                        onClick={() => setActiveDashTab('programmes')}
                                        className='button'
                                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeDashTab === 'programmes' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeDashTab === 'programmes' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeDashTab === 'programmes' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                    >
                                        <Layers size={16} /> My Programmes
                                    </button>

                                    <button
                                        onClick={() => setActiveDashTab('tasks')}
                                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeDashTab === 'tasks' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeDashTab === 'tasks' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeDashTab === 'tasks' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                    >
                                        <Zap size={16} /> Action Required
                                        {pendingCount > 0 && (
                                            <span style={{ background: '#dc2626', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '2px' }}>
                                                {pendingCount}
                                            </span>
                                        )}
                                    </button>

                                    {/* 🚀 SURVEYS & FEEDBACK TAB WITH AMBER BADGE */}
                                    <button
                                        onClick={() => setActiveDashTab('surveys')}
                                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeDashTab === 'surveys' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeDashTab === 'surveys' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeDashTab === 'surveys' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                    >
                                        <ClipboardList size={16} /> Surveys & Feedback
                                        {pendingSurveysCount > 0 && (
                                            <span style={{ background: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '2px' }}>
                                                {pendingSurveysCount}
                                            </span>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setActiveDashTab('events')}
                                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeDashTab === 'events' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeDashTab === 'events' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeDashTab === 'events' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                    >
                                        <Globe size={16} /> Ecosystem Events
                                        {myAttendedEvents.length > 0 && (
                                            <span style={{ background: activeDashTab === 'events' ? '#e0e7ff' : '#f1f5f9', color: activeDashTab === 'events' ? '#3730a3' : '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '2px' }}>
                                                {myAttendedEvents.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {activeDashTab === 'tasks' && (
                                    <div className="animate-fade-in">
                                        <LearnerActionInbox
                                            profileId={academicProfile.id}
                                            logs={allCurriculumLogs}
                                            absenceDates={absenceDateStrings}
                                            pendingSurveysCount={pendingSurveysCount}
                                            onNavigateToSurveys={() => setActiveDashTab('surveys')}
                                        />
                                    </div>
                                )}

                                {/* 🚀 STRICT COHORT SURVEYS & FEEDBACK TAB CONTENT */}
                                {activeDashTab === 'surveys' && (
                                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div className="ld-section-header">
                                            <h2 className="ld-section-title">
                                                <ClipboardList size={16} /> Assigned Survey & Feedback Forms
                                                <span className="ld-count-badge">{assignedSurveys.length}</span>
                                            </h2>
                                        </div>

                                        <div style={{ border: '1px solid var(--mlab-border)', background: '#fff', borderRadius: 0 }}>
                                            <div className="mlab-table-wrap">
                                                {assignedSurveys.length === 0 ? (
                                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <HelpCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>No Cohort Surveys Assigned</h3>
                                                        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>There are currently no active feedback forms assigned strictly to your class or assessments.</p>
                                                    </div>
                                                ) : (
                                                    <table className="mlab-table" style={{ margin: 0 }}>
                                                        <thead style={{ background: '#f8fafc' }}>
                                                            <tr>
                                                                <th style={{ color: 'var(--mlab-blue)' }}>Category</th>
                                                                <th style={{ color: 'var(--mlab-blue)' }}>Module / Scope</th>
                                                                <th style={{ color: 'var(--mlab-blue)' }}>Survey Title</th>
                                                                <th style={{ color: 'var(--mlab-blue)' }}>Questions</th>
                                                                <th style={{ color: 'var(--mlab-blue)' }}>Status</th>
                                                                <th style={{ textAlign: 'right', color: 'var(--mlab-blue)' }}>Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {assignedSurveys.map(survey => {
                                                                const isCompleted = mySurveyResponses.some(r => r.surveyId === survey.id);

                                                                return (
                                                                    <tr key={survey.id} style={{ background: isCompleted ? '#f8fafc' : '#fff' }}>
                                                                        {/* CATEGORY BADGE */}
                                                                        <td>
                                                                            {survey.isAssessmentSurvey ? (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                    <Tag size={10} /> Assessment Evaluation
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                    <Layers size={10} /> Cohort Feedback
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* MODULE TITLE AND NUMBER */}
                                                                        <td>
                                                                            {survey.isAssessmentSurvey ? (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                    <strong style={{ fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>
                                                                                        {survey.moduleNumber}
                                                                                    </strong>
                                                                                    {survey.moduleTitle && (
                                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                                                                            {survey.moduleTitle}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                                    Class Feedback Form
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* SURVEY TITLE & DESC */}
                                                                        <td>
                                                                            <strong style={{ color: 'var(--mlab-blue)', fontSize: '0.9rem', display: 'block' }}>{survey.title}</strong>
                                                                            {survey.description && (
                                                                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', maxWidth: '280px', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {survey.description}
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* QUESTIONS COUNT */}
                                                                        <td>
                                                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{survey.questions?.length || 0} Questions</span>
                                                                        </td>

                                                                        {/* STATUS */}
                                                                        <td>
                                                                            {isCompleted ? (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                    <CheckCircle size={10} /> Completed
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                    <AlertCircle size={10} /> Pending
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* ACTION BUTTON */}
                                                                        <td style={{ textAlign: 'right' }}>
                                                                            <button
                                                                                className="mlab-btn mlab-btn--sm"
                                                                                style={{
                                                                                    background: isCompleted ? '#f1f5f9' : GREEN,
                                                                                    color: isCompleted ? '#475569' : MIDNIGHT,
                                                                                    border: isCompleted ? '1px solid #cbd5e1' : 'none',
                                                                                    padding: '6px 12px',
                                                                                    fontWeight: 700,
                                                                                    fontSize: '0.72rem',
                                                                                    borderRadius: 0
                                                                                }}
                                                                                onClick={() => window.open(`/survey/${survey.id}`, '_blank')}
                                                                            >
                                                                                {isCompleted ? <><ExternalLink size={12} /> View Form</> : <><Send size={12} /> Take Survey</>}
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeDashTab === 'programmes' && (
                                    <div className="animate-fade-in">
                                        <div className="ld-section-header">
                                            <h2 className="ld-section-title">
                                                <Layers size={16} /> Active Cohorts
                                                <span className="ld-count-badge">{filteredCohorts.length}</span>
                                            </h2>
                                            <div className="ld-search-filter-bar">
                                                <div className="ld-search-box">
                                                    <Search size={16} className="ld-search-icon" />
                                                    <input type="text" placeholder="Search programmes..." value={cohortSearch} onChange={(e) => setCohortSearch(e.target.value)} className="ld-search-input" />
                                                    {cohortSearch && <button className="ld-clear-btn" onClick={() => setCohortSearch('')}><XCircle size={14} /></button>}
                                                </div>
                                                <button className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setShowCohortFilters(!showCohortFilters)}>
                                                    <Filter size={16} /><span>Filter</span>{hasActiveCohortFilters && <span className="ld-filter-dot" />}<ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
                                                </button>
                                            </div>
                                        </div>

                                        {showCohortFilters && (
                                            <div className="ld-filter-panel">
                                                <div className="ld-filter-group">
                                                    <label>Status</label>
                                                    <div className="ld-filter-chips">
                                                        {[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'completed', label: 'Completed' }].map((f) => (
                                                            <button key={f.key} className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`} onClick={() => setCohortFilter(f.key as FilterType)}>{f.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="ld-filter-group">
                                                    <label>Sort By</label>
                                                    <select value={cohortSort} onChange={(e) => setCohortSort(e.target.value as SortType)} className="ld-filter-select">
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="name">Name A-Z</option>
                                                    </select>
                                                </div>
                                                {hasActiveCohortFilters && (
                                                    <button className="ld-clear-filters" onClick={clearCohortFilters}><XCircle size={14} /> Clear All</button>
                                                )}
                                            </div>
                                        )}

                                        <div className="ld-cohort-grid">
                                            {filteredCohorts.map((cohort, index) => (
                                                <div key={cohort.id} className="ld-cohort-card" style={{ animationDelay: `${index * 0.08}s`, borderRadius: '0', height: 320, display: 'flex' }}>
                                                    <div className="ld-cohort-card__header" style={{ flex: 1 }}>
                                                        <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                                        <span className="ld-badge ld-badge--active">Active</span>
                                                    </div>
                                                    <div className="ld-cohort-card__dates">
                                                        <Calendar size={12} /><span>{cohort.startDate} — {cohort.endDate}</span>
                                                    </div>
                                                    <div className="ld-cohort-card__roles">
                                                        <div className="ld-role-row">
                                                            <div className="ld-role-dot ld-role-dot--blue" />
                                                            <span className="ld-role-label">Facilitator</span>
                                                            <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
                                                        </div>
                                                        <div className="ld-role-row">
                                                            <div className="ld-role-dot ld-role-dot--red" />
                                                            <span className="ld-role-label">Assessor</span>
                                                            <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
                                                        </div>
                                                        <div className="ld-role-row">
                                                            <div className="ld-role-dot ld-role-dot--green" />
                                                            <span className="ld-role-label">Moderator</span>
                                                            <span className="ld-role-name">{cohort.moderatorId ? getStaffName(cohort.moderatorId) : 'Unassigned'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="ld-cohort-card__footer">
                                                        <button
                                                            className="ld-btn ld-btn--primary"
                                                            style={{ borderRadius: '0' }}
                                                            onClick={() => navigate(`/portfolio/${academicProfile?.id}?cohortId=${cohort.id}`, { state: { cohortId: cohort.id } })}
                                                        >
                                                            <span>Portfolio</span><ArrowRight size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {filteredCohorts.length === 0 && (
                                                <div className="ld-empty">
                                                    <div className="ld-empty__icon"><Search size={32} strokeWidth={1.5} /></div>
                                                    <span className="ld-empty__title">No Active Enrollments</span>
                                                    <p className="ld-empty__desc">You are currently not enrolled in any active classes. If you believe this is an error, please contact administration.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeDashTab === 'events' && (
                                    <div className="animate-fade-in">
                                        <div className="ld-section-header">
                                            <h2 className="ld-section-title">
                                                <Globe size={16} /> Event History
                                                <span className="ld-count-badge">{filteredEcosystemEvents.length}</span>
                                            </h2>
                                            <div className="ld-search-filter-bar">
                                                <div className="ld-search-box">
                                                    <Search size={16} className="ld-search-icon" />
                                                    <input type="text" placeholder="Search events, venues..." value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} className="ld-search-input" />
                                                    {eventSearch && <button className="ld-clear-btn" onClick={() => setEventSearch('')}><XCircle size={14} /></button>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="ld-cohort-grid">
                                            {filteredEcosystemEvents.map((event, index) => {
                                                const checkinTime = getSafeTime(event.checkinData.timestamp);
                                                return (
                                                    <div key={`${event.id}-${index}`} className="ld-cohort-card" style={{ animationDelay: `${index * 0.08}s`, borderRadius: '0' }}>
                                                        <div className="ld-cohort-card__header">
                                                            <h3 className="ld-cohort-card__name" style={{ color: 'var(--mlab-blue)' }}>{event.eventName}</h3>
                                                            {event.eventType && <span className="ld-badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: '0' }}>{event.eventType}</span>}
                                                        </div>
                                                        <div className="ld-cohort-card__roles" style={{ marginTop: '1rem', flex: 1 }}>
                                                            <div className="ld-role-row">
                                                                <Calendar size={13} color="var(--mlab-grey)" />
                                                                <span className="ld-role-label">Event Date</span>
                                                                <span className="ld-role-name">{moment(event.date).format('D MMM YYYY')}</span>
                                                            </div>
                                                            <div className="ld-role-row">
                                                                <MapPin size={13} color="var(--mlab-grey)" />
                                                                <span className="ld-role-label">Location</span>
                                                                <span className="ld-role-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{event.location.split(',')[0]}</span>
                                                            </div>
                                                            <div className="ld-role-row">
                                                                <Clock size={13} color="var(--mlab-green-dark)" />
                                                                <span className="ld-role-label">Checked In</span>
                                                                <span className="ld-role-name" style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>{moment(checkinTime).format('h:mm A')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredEcosystemEvents.length === 0 && (
                                                <div className="ld-empty" style={{ gridColumn: '1 / -1', borderRadius: 0 }}>
                                                    <div className="ld-empty__icon"><Globe size={32} strokeWidth={1.5} /></div>
                                                    <span className="ld-empty__title">No Events Found</span>
                                                    <p className="ld-empty__desc">{eventSearch ? `No events match your search for "${eventSearch}".` : "You haven't checked into any ecosystem events yet. Join an upcoming Hackathon or Masterclass to build your profile!"}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════ VIEW 2: ISOLATED ATTENDANCE HUB ════ */}
                        {currentNav === 'attendance' && (
                            <LearnerAttendanceView
                                formattedScanHistory={formattedScanHistory || []}
                                virtualAttendance={virtualAttendance || []}
                                absenceDates={resolvedAbsenceDates || []}
                                attendancePercentage={`${attendancePercentage}%`}
                                cohorts={myCohorts || []}
                                workplaceLogs={myWorkplaceLogs}
                                learnerHasEmployer={!!academicProfile?.employerId}
                                onOpenLogModal={(selectedLog) => {
                                    if (selectedLog && selectedLog.id) {
                                        setActiveEditLog(selectedLog);
                                    } else {
                                        setActiveEditLog(null);
                                    }
                                    setShowWorkplaceLogModal(true);
                                }}
                            />
                        )}

                        {/* ════ VIEW 3: ACCOUNT PROFILE EDITOR ════ */}
                        {currentNav === 'profile' && (
                            <LearnerProfileView
                                profile={academicProfile}
                                user={store.user}
                                onUpdate={store.updateLearner}
                            />
                        )}

                        {/* ════ VIEW 4: SECURED BLOCKCHAIN ACCREDITATIONS ════ */}
                        {currentNav === 'certificates' && (
                            <div className="ld-animate">
                                <div className="ld-section-header">
                                    <h2 className="ld-section-title">
                                        <Award size={16} /> Issued Certificates
                                        <span className="ld-count-badge">{filteredCertificates.length}</span>
                                    </h2>
                                    <div className="ld-search-filter-bar">
                                        <div className="ld-search-box">
                                            <Search size={16} className="ld-search-icon" />
                                            <input type="text" placeholder="Search certificates..." value={certSearch} onChange={(e) => setCertSearch(e.target.value)} className="ld-search-input" />
                                            {certSearch && <button className="ld-clear-btn" onClick={() => setCertSearch('')}><XCircle size={14} /></button>}
                                        </div>
                                        <button className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`} onClick={() => setShowCertFilters(!showCertFilters)}>
                                            <Filter size={16} /><span>Filter</span>{hasActiveCertFilters && <span className="ld-filter-dot" />}<ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
                                        </button>
                                    </div>
                                </div>
                                {showCertFilters && (
                                    <div className="ld-filter-panel">
                                        <div className="ld-filter-group">
                                            <label>Type</label>
                                            <div className="ld-filter-chips">
                                                {[{ key: 'all', label: 'All Types' }, { key: 'certificate', label: 'Certificate' }, { key: 'statement', label: 'Statement' }].map((f) => (
                                                    <button key={f.key} className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`} onClick={() => setCertFilter(f.key as any)}>{f.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="ld-filter-group">
                                            <label>Sort By</label>
                                            <select value={certSort} onChange={(e) => setCertSort(e.target.value as SortType)} className="ld-filter-select">
                                                <option value="newest">Newest First</option>
                                                <option value="oldest">Oldest First</option>
                                                <option value="name">Name A-Z</option>
                                            </select>
                                        </div>
                                        {hasActiveCertFilters && <button className="ld-clear-filters" onClick={clearCertFilters}><XCircle size={14} /> Clear All</button>}
                                    </div>
                                )}
                                {filteredCertificates.length === 0 ? (
                                    <div className="ld-empty ld-empty--large">
                                        <div className="ld-empty__icon">{certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}</div>
                                        <span className="ld-empty__title">{certSearch ? 'No Results Found' : 'No Certificates Yet'}</span>
                                        <p className="ld-empty__desc">{certSearch ? `No certificates match "${certSearch}"` : 'Certificates appear here after programme completion.'}</p>
                                        {hasActiveCertFilters && certSearch && <button className="ld-btn ld-btn--ghost ld-btn--sm" onClick={clearCertFilters}><XCircle size={14} /> Clear All Filters</button>}
                                    </div>
                                ) : (
                                    <div className="ld-cohort-grid">
                                        {filteredCertificates.map((cert: any, index: number) => (
                                            <div key={cert.id} className="ld-cohort-card ld-cert-card" style={{ animationDelay: `${index * 0.08}s`, borderRadius: '0' }}>
                                                <div className="ld-cohort-card__header">
                                                    <div className="ld-cert-card__icon-wrap" style={{ borderRadius: '0' }}><Award size={18} /></div>
                                                    <div className="ld-cert-card__title-group">
                                                        <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
                                                    </div>
                                                    <span className="ld-badge ld-badge--issued" style={{ borderRadius: '0' }}>Issued</span>
                                                </div>
                                                <div className="ld-cohort-card__roles">
                                                    <div className="ld-role-row">
                                                        <BookOpen size={12} /><span className="ld-role-label">Programme</span><span className="ld-role-name">{cert.courseName}</span>
                                                    </div>
                                                    <div className="ld-role-row">
                                                        <Calendar size={12} /><span className="ld-role-label">Issued</span><span className="ld-role-name">{new Date(cert.issueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                    <div className="ld-role-row">
                                                        <CheckCircle size={12} /><span className="ld-role-label">Status</span><span className="ld-role-name ld-role-name--success">Valid</span>
                                                    </div>
                                                </div>
                                                <div className="ld-cohort-card__footer">
                                                    <button className="ld-btn ld-btn--download" style={{ borderRadius: '0' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                        <Download size={14} /><span>Download PDF</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default LearnerDashboard;