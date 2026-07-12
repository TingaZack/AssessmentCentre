// src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, PenTool, Clock, CheckCircle, AlertTriangle,
    FileText, Layers, Info, User, Activity, Timer, Users, Search,
    ChevronRight, LayoutDashboard, UserCircle, ChevronUp, ChevronDown,
    Filter, BookOpen, CheckCircle2
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import './AssessorDashboard.css';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
import StatCard from '../../../components/common/StatCard/StatCard';

interface PendingTask {
    id: string; learnerId: string; learnerName: string; assessmentId: string;
    title: string; status: string; submittedAt: string; isReturned: boolean;
    facilitatorName: string; facilitatorTimeSpent?: number; facilitatorStartedAt?: string;
}

interface LearnerStat {
    id: string; enrollmentId: string; fullName: string; idNumber: string;
    cohortName: string; cohortId: string;
    completedAssessments: number; totalAssessments: number; needsGrading: number;
}

export const AssessorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
    const [historicalTasks, setHistoricalTasks] = useState<any[]>([]);
    const [learnerStats, setLearnerStats] = useState<LearnerStat[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingTasks, setLoadingTasks] = useState(true);

    // 🚀 MASTER ACCORDION & FILTERS
    const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(true);
    const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'returned' | 'pending'>('all');
    const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

    const toggleAssessmentAccordion = (id: string) => {
        setExpandedAssessments(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, []);

    const myStaffProfile = store.staff.find(s =>
        s.authUid === store.user?.uid || s.email === store.user?.email || s.id === store.user?.uid
    );
    const myCohorts = store.cohorts.filter(c =>
        c.assessorId === store.user?.uid || c.assessorId === myStaffProfile?.id || c.assessorEmail === store.user?.email
    );
    const myCohortIds = myCohorts.map(c => c.id);
    const isAdmin = store.user?.role === 'admin';

    useEffect(() => {
        const fetchTasksAndStats = async () => {
            if (!store.user?.uid || store.cohorts.length === 0) return;
            if (!isAdmin && myCohortIds.length === 0) { setLoadingTasks(false); return; }

            try {
                const snap = await getDocs(query(collection(db, 'learner_submissions'),
                    where('status', 'in', ['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'])
                ));

                const pTasks: PendingTask[] = [];
                const hTasks: any[] = [];
                const lStatsMap: Record<string, LearnerStat> = {};

                store.learners.forEach(l => {
                    if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
                        const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
                        lStatsMap[l.id] = { id: l.id, enrollmentId: l.enrollmentId || l.id, fullName: l.fullName, idNumber: l.idNumber || 'N/A', cohortName: cName, cohortId: l.cohortId || 'Unassigned', completedAssessments: 0, totalAssessments: 0, needsGrading: 0 };
                    }
                });

                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (!isAdmin && !(data.cohortId && myCohortIds.includes(data.cohortId))) return;
                    if (lStatsMap[data.learnerId]) {
                        lStatsMap[data.learnerId].totalAssessments += 1;
                        if (['graded', 'moderated', 'appealed'].includes(data.status)) lStatsMap[data.learnerId].completedAssessments += 1;
                        if (['facilitator_reviewed', 'returned'].includes(data.status)) lStatsMap[data.learnerId].needsGrading += 1;
                    }
                    if (['facilitator_reviewed', 'returned'].includes(data.status)) {
                        const learner = store.learners.find(l => l.id === data.learnerId);
                        pTasks.push({ id: docSnap.id, learnerId: data.learnerId, learnerName: learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner', assessmentId: data.assessmentId, title: data.title || 'Untitled Assessment', status: data.status, submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(), isReturned: data.status === 'returned', facilitatorName: data.grading?.facilitatorName || 'Facilitator', facilitatorTimeSpent: data.grading?.facilitatorTimeSpent, facilitatorStartedAt: data.grading?.facilitatorStartedAt });
                    } else if (['graded', 'moderated'].includes(data.status)) {
                        if ((isAdmin || data.grading?.gradedBy === store.user?.uid) && data.grading?.assessorTimeSpent) hTasks.push(data);
                    }
                });

                pTasks.sort((a, b) => { if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1; return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(); });
                setPendingTasks(pTasks);
                setHistoricalTasks(hTasks);
                setLearnerStats(Object.values(lStatsMap).sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));
            } catch (err) { console.error('Error fetching marking queue:', err); }
            finally { setLoadingTasks(false); }
        };
        fetchTasksAndStats();
    }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

    const handleLogout = async () => {
        try { await signOut(auth); navigate('/login'); }
        catch (err) { console.error('Logout failed', err); }
    };

    const getFacilitatorName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const formatTimeSpent = (seconds?: number) => {
        if (!seconds) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
    };

    const formatCalendarSpread = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return null;
        const diffH = (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60);
        if (diffH < 1) return '< 1 hr';
        if (diffH < 24) return `${Math.floor(diffH)} hrs`;
        return `${Math.floor(diffH / 24)} days`;
    };

    const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent && t.facilitatorTimeSpent > 0);
    const avgFacilitatorTime = facTasksWithTime.length > 0
        ? facTasksWithTime.reduce((s, t) => s + (t.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length : 0;
    const avgAssessorTime = historicalTasks.length > 0
        ? historicalTasks.reduce((s, t) => s + (t.grading.assessorTimeSpent || 0), 0) / historicalTasks.length : 0;

    const filteredLearners = useMemo(() => {
        if (!searchTerm) return learnerStats;
        const t = searchTerm.toLowerCase();
        return learnerStats.filter(l => l.fullName.toLowerCase().includes(t) || l.idNumber.toLowerCase().includes(t) || l.cohortName.toLowerCase().includes(t));
    }, [learnerStats, searchTerm]);

    // 🚀 Upgraded Data Model for the Assessor Operations Center
    const assessmentStatsMap = useMemo(() => {
        const map = new Map<string, {
            assessmentId: string,
            title: string,
            returned: PendingTask[],
            pending: PendingTask[],
            graded: any[]
        }>();

        // Map Pending and Returned
        pendingTasks.forEach(task => {
            if (!map.has(task.assessmentId)) {
                map.set(task.assessmentId, { assessmentId: task.assessmentId, title: task.title, returned: [], pending: [], graded: [] });
            }
            if (task.isReturned) {
                map.get(task.assessmentId)!.returned.push(task);
            } else {
                map.get(task.assessmentId)!.pending.push(task);
            }
        });

        // Map Graded History
        historicalTasks.forEach(task => {
            if (!map.has(task.assessmentId)) {
                map.set(task.assessmentId, { assessmentId: task.assessmentId, title: task.title || 'Unknown Assessment', returned: [], pending: [], graded: [] });
            }
            map.get(task.assessmentId)!.graded.push(task);
        });

        // Only show assessments that require action (pending or returned) or have history
        return Array.from(map.values()).filter(a => a.pending.length > 0 || a.returned.length > 0 || a.graded.length > 0);
    }, [pendingTasks, historicalTasks]);

    // 🚀 Derived Sub-lists for Filtering
    const filteredAssessments = useMemo(() => {
        if (assessmentFilter === 'returned') return assessmentStatsMap.filter(a => a.returned.length > 0);
        if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
        return assessmentStatsMap;
    }, [assessmentStatsMap, assessmentFilter]);

    const totalReturned = assessmentStatsMap.reduce((acc, curr) => acc + curr.returned.length, 0);
    const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

    const pageTitle = currentNav === 'dashboard' ? 'Marking Centre' : currentNav === 'cohorts' ? 'My Assigned Classes' : 'Compliance Profile';
    const PageIcon = currentNav === 'dashboard' ? LayoutDashboard : currentNav === 'cohorts' ? Layers : UserCircle;

    return (
        <div className="ad-layout">
            {/* Global Keyframes for the Live Dot Ping Animation */}
            <style>{`
                @keyframes live-dot-ping {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { transform: scale(1.2); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `}</style>

            <Sidebar role={store.user?.role} currentNav={currentNav} setCurrentNav={setCurrentNav as any} onLogout={handleLogout} />

            <main className="ad-main">

                {/* ── PAGE HEADER ── */}
                <header className="ad-header">
                    <div className="ad-header__left">
                        <div className="ad-header__icon-wrap">
                            <PageIcon size={22} />
                        </div>
                        <div className="ad-header__text">
                            <span className="ad-header__eyebrow">Assessor Portal</span>
                            <h1 className="ad-header__title">{pageTitle}</h1>
                            <p className="ad-header__sub">
                                Practitioner: {store.user?.fullName || 'Unknown User'}
                                {isAdmin && <span className="ad-header__admin-tag">Admin Bypass</span>}
                            </p>
                        </div>
                    </div>
                    <div className="ad-header__right">
                        <NotificationBell />
                    </div>
                </header>

                <div className="ad-content">

                    {/* ── Diagnostics ── */}
                    {showDiagnostics && (
                        <div className="ad-diagnostic ad-animate">
                            <h4 className="ad-diagnostic__heading"><Info size={14} /> System Identity Bridge</h4>
                            <div className="ad-diagnostic__grid">
                                <div className="ad-diagnostic__item">
                                    <span className="ad-diagnostic__label">Auth UID</span>
                                    <code className="ad-diagnostic__code">{store.user?.uid}</code>
                                </div>
                                <div className="ad-diagnostic__item">
                                    <span className="ad-diagnostic__label">Staff ID</span>
                                    <code className="ad-diagnostic__code">{myStaffProfile?.id || 'Not Linked'}</code>
                                </div>
                                <div className="ad-diagnostic__item ad-diagnostic__item--full">
                                    <span className="ad-diagnostic__label">Assigned Cohort IDs</span>
                                    <code className="ad-diagnostic__code">{myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}</code>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ══ TAB 1: MARKING QUEUE ══ */}
                    {currentNav === 'dashboard' && (
                        <div className="ad-dashboard animate-fade-in">

                            {/* KPI ribbon */}
                            <div className="ad-kpi-grid" style={{ marginBottom: '2rem' }}>
                                <StatCard icon={<Layers size={20} />} title="Assigned Cohorts" value={isAdmin ? 'ALL' : myCohorts.length} borderColor="var(--mlab-blue)" />
                                <StatCard icon={<Clock size={20} />} title="Pending Grading" value={pendingTasks.length} borderColor="var(--mlab-amber)" />
                                <StatCard icon={<Activity size={20} />} title="Incoming: Avg Pre-Mark" value={formatTimeSpent(avgFacilitatorTime)} borderColor="#0ea5e9" />
                                <StatCard icon={<Timer size={20} />} title="My Avg Marking Pace" value={formatTimeSpent(avgAssessorTime)} borderColor="#ef4444" />
                            </div>

                            {/* 🚀 MASTER ASSESSMENTS ACCORDION */}
                            {!loadingTasks && assessmentStatsMap.length > 0 && (
                                <div style={{ marginBottom: '2rem', background: 'white', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.3s ease' }}>

                                    {/* MASTER HEADER */}
                                    <div
                                        onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '1px solid #cbd5e1' : 'none' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                            <div style={{ background: '#ea580c', color: 'white', padding: '12px', borderRadius: '8px' }}>
                                                <PenTool size={24} />
                                            </div>
                                            <div>
                                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grading Operations Center</h2>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>{assessmentStatsMap.length} Active Assessments</span>

                                                    {totalReturned > 0 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #fca5a5', boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)' }}>
                                                            <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                            {totalReturned} QA Returned
                                                        </span>
                                                    )}

                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, background: '#ffedd5', color: '#c2410c', padding: '4px 10px', borderRadius: '12px', border: '1px solid #fed7aa' }}>
                                                        <Clock size={10} /> {totalPending} Awaiting Marking
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ color: '#64748b' }}>
                                            {isAssessmentsExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                        </div>
                                    </div>

                                    {/* EXPANDED CONTENT */}
                                    {isAssessmentsExpanded && (
                                        <div className="animate-slide-down" style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '0 0 8px 8px' }}>

                                            {/* Filters */}
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
                                                <button onClick={() => setAssessmentFilter('all')} style={{ background: assessmentFilter === 'all' ? '#ea580c' : 'white', color: assessmentFilter === 'all' ? 'white' : '#64748b', border: `1px solid ${assessmentFilter === 'all' ? '#ea580c' : '#cbd5e1'}`, padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>All Operations</button>
                                                <button onClick={() => setAssessmentFilter('returned')} style={{ background: assessmentFilter === 'returned' ? '#ef4444' : 'white', color: assessmentFilter === 'returned' ? 'white' : '#64748b', border: `1px solid ${assessmentFilter === 'returned' ? '#ef4444' : '#cbd5e1'}`, padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>QA Returned Only</button>
                                                <button onClick={() => setAssessmentFilter('pending')} style={{ background: assessmentFilter === 'pending' ? '#ea580c' : 'white', color: assessmentFilter === 'pending' ? 'white' : '#64748b', border: `1px solid ${assessmentFilter === 'pending' ? '#ea580c' : '#cbd5e1'}`, padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Awaiting Marking Only</button>
                                            </div>

                                            {/* Flat List */}
                                            {filteredAssessments.length === 0 ? (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                                    No assessments match this filter.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    {filteredAssessments.map(exam => {
                                                        const isExpanded = expandedAssessments.has(exam.assessmentId);
                                                        const hasReturned = exam.returned.length > 0;
                                                        const hasPending = exam.pending.length > 0;

                                                        return (
                                                            <div key={exam.assessmentId} className="animate-fade-in" style={{
                                                                background: '#ffffff',
                                                                border: hasReturned ? '1px solid #fca5a5' : hasPending ? '1px solid #fed7aa' : '1px solid #cbd5e1',
                                                                borderRadius: '8px',
                                                                overflow: 'hidden',
                                                                boxShadow: hasReturned ? '0 4px 12px rgba(239, 68, 68, 0.15)' : '0 1px 2px rgba(0,0,0,0.02)',
                                                                transition: 'all 0.3s ease'
                                                            }}>
                                                                <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none', background: isExpanded ? '#f8fafc' : '#ffffff' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                                                        <div style={{ background: hasReturned ? '#fef2f2' : hasPending ? '#fff7ed' : '#f8fafc', padding: '8px', borderRadius: '50%', color: hasReturned ? '#ef4444' : hasPending ? '#ea580c' : '#94a3b8' }}>
                                                                            <BookOpen size={16} />
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '0.95rem', fontWeight: 700 }}>{exam.title}</h3>
                                                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                                {hasReturned && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #fca5a5' }}>
                                                                                        <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                        {exam.returned.length} Returned (Action Reqd)
                                                                                    </span>
                                                                                )}
                                                                                {hasPending && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #fed7aa' }}>
                                                                                        <Clock size={10} /> {exam.pending.length} Awaiting Marking
                                                                                    </span>
                                                                                )}
                                                                                {exam.graded.length > 0 && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>
                                                                                        <CheckCircle2 size={10} /> {exam.graded.length} Graded
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ color: '#94a3b8', paddingLeft: '1rem' }}>
                                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                    </div>
                                                                </div>

                                                                {isExpanded && (
                                                                    <div style={{ padding: '1.25rem', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                                                        {/* Returned Submissions Array */}
                                                                        {exam.returned.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontSize: '0.75rem', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Urgent Fixes (Moderator Returned)</h4>
                                                                                <div className="ad-task-list">
                                                                                    {exam.returned.map(task => (
                                                                                        <div key={task.id} className="ad-task-card returned">
                                                                                            <div className="ad-task-info">
                                                                                                <div className="ad-task-header">
                                                                                                    <h4 className="ad-task-learner">{task.learnerName}</h4>
                                                                                                    <span className="ad-task-tag danger">Mod. Returned</span>
                                                                                                </div>
                                                                                                <p className="ad-task-title"><FileText size={13} /> {task.title}</p>
                                                                                            </div>
                                                                                            <div className="ad-task-actions">
                                                                                                <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${task.learnerId}`)} title="View Portfolio">
                                                                                                    <Layers size={13} />
                                                                                                </button>
                                                                                                <button className="ad-grade-btn fix" onClick={() => navigate(`/portfolio/submission/${task.id}`)}>
                                                                                                    <AlertTriangle size={13} /> Fix Return
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Pending Submissions Array */}
                                                                        {exam.pending.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: hasReturned ? '10px' : '0' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontSize: '0.75rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Awaiting Marking</h4>
                                                                                <div className="ad-task-list">
                                                                                    {exam.pending.map(task => (
                                                                                        <div key={task.id} className="ad-task-card">
                                                                                            <div className="ad-task-info">
                                                                                                <div className="ad-task-header">
                                                                                                    <h4 className="ad-task-learner">{task.learnerName}</h4>
                                                                                                </div>
                                                                                                <p className="ad-task-title"><FileText size={13} /> {task.title}</p>
                                                                                                <div className="ad-task-meta">
                                                                                                    <span className="ad-task-date">
                                                                                                        <User size={12} /> Pre-Marked by <strong>{task.facilitatorName}</strong>
                                                                                                    </span>
                                                                                                    <span className="ad-task-date">
                                                                                                        <Clock size={12} /> {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                                                    </span>
                                                                                                    {task.facilitatorTimeSpent !== undefined && task.facilitatorTimeSpent > 0 && (
                                                                                                        <span className="ad-task-meta__time-chip">
                                                                                                            <Activity size={11} /> <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="ad-task-actions">
                                                                                                <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${task.learnerId}`)} title="View Portfolio">
                                                                                                    <Layers size={13} />
                                                                                                </button>
                                                                                                <button className="ad-grade-btn" onClick={() => navigate(`/portfolio/submission/${task.id}`)}>
                                                                                                    <PenTool size={13} /> Grade Now
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Fallback for when queue is empty */}
                            {!loadingTasks && assessmentStatsMap.length === 0 && (
                                <div className="ad-panel">
                                    <div className="ad-state-box">
                                        <CheckCircle size={44} color="var(--mlab-green)" />
                                        <span className="ad-state-box__title">All Caught Up</span>
                                        <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
                                        {!isAdmin && myCohortIds.length === 0 && (
                                            <p className="ad-state-box__warn">You are not assigned to any cohorts. Contact an administrator.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {loadingTasks && (
                                <div className="ad-panel">
                                    <div className="ad-state-box"><div className="ad-spinner" />Loading marking tasks…</div>
                                </div>
                            )}

                            {/* Learner overview */}
                            <div className="ad-panel">
                                <div className="ad-overview-header">
                                    <h2 className="ad-panel-title"><Users size={15} /> Learner Progress Overview</h2>
                                    <div className="ad-overview-search">
                                        <Search size={14} className="ad-overview-search__icon" />
                                        <input
                                            type="text"
                                            className="ad-overview-search__input"
                                            placeholder="Search learners…"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="mlab-table-wrap">
                                    <table className="mlab-table">
                                        <thead>
                                            <tr>
                                                <th>Learner Name</th>
                                                <th>ID Number</th>
                                                <th>Class</th>
                                                <th>Assessor Progress</th>
                                                <th className="ad-th--right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="ad-td--empty">
                                                        No learners found in your assigned cohorts.
                                                    </td>
                                                </tr>
                                            ) : filteredLearners.map(l => {
                                                const pct = l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0;
                                                const isDone = l.completedAssessments === l.totalAssessments && l.totalAssessments > 0;
                                                return (
                                                    <tr key={l.id}>
                                                        <td>
                                                            <div className="ad-learner-name-cell">
                                                                <div className="ad-learner-avatar">{l.fullName.charAt(0)}</div>
                                                                <span className="ad-learner-name">{l.fullName}</span>
                                                                {l.needsGrading > 0 && (
                                                                    <span className="ad-to-grade-badge">{l.needsGrading} To Grade</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td><span className="ad-id-number">{l.idNumber}</span></td>
                                                        <td><span className="ad-cohort-label">{l.cohortName}</span></td>
                                                        <td>
                                                            <div className="ad-progress-cell">
                                                                <div className="ad-progress-track">
                                                                    <div className={`ad-progress-fill${isDone ? ' ad-progress-fill--done' : ''}`} style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="ad-progress-fraction">{l.completedAssessments} / {l.totalAssessments}</span>
                                                            </div>
                                                        </td>
                                                        <td className="ad-td--right">
                                                            <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}>
                                                                View PoE <ChevronRight size={13} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ══ TAB 2: COHORTS ══ */}
                    {currentNav === 'cohorts' && (
                        <div className="animate-fade-in">
                            <h2 className="ad-section-title"><Layers size={16} /> Assigned Cohorts</h2>
                            <div className="ad-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="ad-cohort-card">
                                        <div className="ad-cohort-card__header">
                                            <h3 className="ad-cohort-card__name">{cohort.name}</h3>
                                            <span className="ad-badge ad-badge--active">Assessing</span>
                                        </div>
                                        <div className="ad-cohort-card__dates">
                                            <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
                                        </div>
                                        <div className="ad-cohort-card__roles">
                                            <div className="ad-role-row">
                                                <div className="ad-role-dot ad-role-dot--blue" />
                                                <span className="ad-role-label">Facilitator:</span>
                                                <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
                                            </div>
                                        </div>
                                        <div className="ad-cohort-card__footer">
                                            <button className="ad-portfolio-btn" onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                                View Portfolios <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {myCohorts.length === 0 && (
                                    <div className="ad-empty">
                                        <div className="ad-empty__icon"><Layers size={36} /></div>
                                        <span className="ad-empty__title">No Cohorts Assigned</span>
                                        <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
                                        <button className="ad-empty__link" onClick={() => setShowDiagnostics(true)}>Run ID Diagnostics</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══ TAB 3: PROFILE ══ */}
                    {currentNav === 'profile' && (
                        <AssessorProfileView profile={store.user} user={store.user} onUpdate={store.updateStaffProfile} />
                    )}

                </div>
            </main>
        </div>
    );
};




// // src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

// import React, { useEffect, useState, useMemo } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import {
//     Calendar, ArrowRight, PenTool, Clock, CheckCircle, AlertTriangle,
//     FileText, Layers, Info, User, Activity, Timer, Users, Search,
//     ChevronRight, LayoutDashboard, UserCircle
// } from 'lucide-react';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { useStore } from '../../../store/useStore';
// import { auth, db } from '../../../lib/firebase';
// import './AssessorDashboard.css';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// import StatCard from '../../../components/common/StatCard/StatCard';

// interface PendingTask {
//     id: string; learnerId: string; learnerName: string; assessmentId: string;
//     title: string; status: string; submittedAt: string; isReturned: boolean;
//     facilitatorName: string; facilitatorTimeSpent?: number; facilitatorStartedAt?: string;
// }

// interface LearnerStat {
//     id: string; enrollmentId: string; fullName: string; idNumber: string;
//     cohortName: string; cohortId: string;
//     completedAssessments: number; totalAssessments: number; needsGrading: number;
// }

// export const AssessorDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();

//     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );
//     const [showDiagnostics, setShowDiagnostics] = useState(false);
//     const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
//     const [historicalTasks, setHistoricalTasks] = useState<any[]>([]);
//     const [learnerStats, setLearnerStats] = useState<LearnerStat[]>([]);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [loadingTasks, setLoadingTasks] = useState(true);

//     useEffect(() => {
//         store.fetchCohorts();
//         store.fetchStaff();
//         store.fetchLearners();
//     }, []);

//     const myStaffProfile = store.staff.find(s =>
//         s.authUid === store.user?.uid || s.email === store.user?.email || s.id === store.user?.uid
//     );
//     const myCohorts = store.cohorts.filter(c =>
//         c.assessorId === store.user?.uid || c.assessorId === myStaffProfile?.id || c.assessorEmail === store.user?.email
//     );
//     const myCohortIds = myCohorts.map(c => c.id);
//     const isAdmin = store.user?.role === 'admin';

//     useEffect(() => {
//         const fetchTasksAndStats = async () => {
//             if (!store.user?.uid || store.cohorts.length === 0) return;
//             if (!isAdmin && myCohortIds.length === 0) { setLoadingTasks(false); return; }

//             try {
//                 const snap = await getDocs(query(collection(db, 'learner_submissions'),
//                     where('status', 'in', ['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'])
//                 ));

//                 const pTasks: PendingTask[] = [];
//                 const hTasks: any[] = [];
//                 const lStatsMap: Record<string, LearnerStat> = {};

//                 store.learners.forEach(l => {
//                     if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
//                         const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
//                         lStatsMap[l.id] = { id: l.id, enrollmentId: l.enrollmentId || l.id, fullName: l.fullName, idNumber: l.idNumber || 'N/A', cohortName: cName, cohortId: l.cohortId || 'Unassigned', completedAssessments: 0, totalAssessments: 0, needsGrading: 0 };
//                     }
//                 });

//                 snap.docs.forEach(docSnap => {
//                     const data = docSnap.data();
//                     if (!isAdmin && !(data.cohortId && myCohortIds.includes(data.cohortId))) return;
//                     if (lStatsMap[data.learnerId]) {
//                         lStatsMap[data.learnerId].totalAssessments += 1;
//                         if (['graded', 'moderated', 'appealed'].includes(data.status)) lStatsMap[data.learnerId].completedAssessments += 1;
//                         if (['facilitator_reviewed', 'returned'].includes(data.status)) lStatsMap[data.learnerId].needsGrading += 1;
//                     }
//                     if (['facilitator_reviewed', 'returned'].includes(data.status)) {
//                         const learner = store.learners.find(l => l.id === data.learnerId);
//                         pTasks.push({ id: docSnap.id, learnerId: data.learnerId, learnerName: learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner', assessmentId: data.assessmentId, title: data.title || 'Untitled Assessment', status: data.status, submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(), isReturned: data.status === 'returned', facilitatorName: data.grading?.facilitatorName || 'Facilitator', facilitatorTimeSpent: data.grading?.facilitatorTimeSpent, facilitatorStartedAt: data.grading?.facilitatorStartedAt });
//                     } else if (['graded', 'moderated'].includes(data.status)) {
//                         if ((isAdmin || data.grading?.gradedBy === store.user?.uid) && data.grading?.assessorTimeSpent) hTasks.push(data);
//                     }
//                 });

//                 pTasks.sort((a, b) => { if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1; return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(); });
//                 setPendingTasks(pTasks);
//                 setHistoricalTasks(hTasks);
//                 setLearnerStats(Object.values(lStatsMap).sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));
//             } catch (err) { console.error('Error fetching marking queue:', err); }
//             finally { setLoadingTasks(false); }
//         };
//         fetchTasksAndStats();
//     }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

//     const handleLogout = async () => {
//         try { await signOut(auth); navigate('/login'); }
//         catch (err) { console.error('Logout failed', err); }
//     };

//     const getFacilitatorName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     const formatTimeSpent = (seconds?: number) => {
//         if (!seconds) return '—';
//         const m = Math.floor(seconds / 60);
//         if (m === 0) return '< 1m';
//         const h = Math.floor(m / 60);
//         return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
//     };

//     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
//         if (!startStr || !endStr) return null;
//         const diffH = (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60);
//         if (diffH < 1) return '< 1 hr';
//         if (diffH < 24) return `${Math.floor(diffH)} hrs`;
//         return `${Math.floor(diffH / 24)} days`;
//     };

//     const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent && t.facilitatorTimeSpent > 0);
//     const avgFacilitatorTime = facTasksWithTime.length > 0
//         ? facTasksWithTime.reduce((s, t) => s + (t.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length : 0;
//     const avgAssessorTime = historicalTasks.length > 0
//         ? historicalTasks.reduce((s, t) => s + (t.grading.assessorTimeSpent || 0), 0) / historicalTasks.length : 0;

//     const filteredLearners = useMemo(() => {
//         if (!searchTerm) return learnerStats;
//         const t = searchTerm.toLowerCase();
//         return learnerStats.filter(l => l.fullName.toLowerCase().includes(t) || l.idNumber.toLowerCase().includes(t) || l.cohortName.toLowerCase().includes(t));
//     }, [learnerStats, searchTerm]);

//     const pageTitle = currentNav === 'dashboard' ? 'Marking Centre' : currentNav === 'cohorts' ? 'My Assigned Classes' : 'Compliance Profile';
//     const PageIcon = currentNav === 'dashboard' ? LayoutDashboard : currentNav === 'cohorts' ? Layers : UserCircle;

//     return (
//         <div className="ad-layout">
//             <Sidebar role={store.user?.role} currentNav={currentNav} setCurrentNav={setCurrentNav as any} onLogout={handleLogout} />

//             <main className="ad-main">

//                 {/* ── PAGE HEADER ── */}
//                 <header className="ad-header">
//                     <div className="ad-header__left">
//                         <div className="ad-header__icon-wrap">
//                             <PageIcon size={22} />
//                         </div>
//                         <div className="ad-header__text">
//                             <span className="ad-header__eyebrow">Assessor Portal</span>
//                             <h1 className="ad-header__title">{pageTitle}</h1>
//                             <p className="ad-header__sub">
//                                 Practitioner: {store.user?.fullName || 'Unknown User'}
//                                 {isAdmin && <span className="ad-header__admin-tag">Admin Bypass</span>}
//                             </p>
//                         </div>
//                     </div>
//                     <div className="ad-header__right">
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="ad-content">

//                     {/* ── Diagnostics ── */}
//                     {showDiagnostics && (
//                         <div className="ad-diagnostic ad-animate">
//                             <h4 className="ad-diagnostic__heading"><Info size={14} /> System Identity Bridge</h4>
//                             <div className="ad-diagnostic__grid">
//                                 <div className="ad-diagnostic__item">
//                                     <span className="ad-diagnostic__label">Auth UID</span>
//                                     <code className="ad-diagnostic__code">{store.user?.uid}</code>
//                                 </div>
//                                 <div className="ad-diagnostic__item">
//                                     <span className="ad-diagnostic__label">Staff ID</span>
//                                     <code className="ad-diagnostic__code">{myStaffProfile?.id || 'Not Linked'}</code>
//                                 </div>
//                                 <div className="ad-diagnostic__item ad-diagnostic__item--full">
//                                     <span className="ad-diagnostic__label">Assigned Cohort IDs</span>
//                                     <code className="ad-diagnostic__code">{myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}</code>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ══ TAB 1: MARKING QUEUE ══ */}
//                     {currentNav === 'dashboard' && (
//                         <div className="ad-dashboard animate-fade-in">

//                             {/* KPI ribbon */}
//                             <div className="ad-kpi-grid">
//                                 <StatCard icon={<Layers size={20} />} title="Assigned Cohorts" value={isAdmin ? 'ALL' : myCohorts.length} borderColor="var(--mlab-blue)" />
//                                 <StatCard icon={<Clock size={20} />} title="Pending Grading" value={pendingTasks.length} borderColor="var(--mlab-amber)" />
//                                 <StatCard icon={<Activity size={20} />} title="Incoming: Avg Pre-Mark" value={formatTimeSpent(avgFacilitatorTime)} borderColor="#0ea5e9" />
//                                 <StatCard icon={<Timer size={20} />} title="My Avg Marking Pace" value={formatTimeSpent(avgAssessorTime)} borderColor="#ef4444" />
//                             </div>

//                             {/* Marking queue */}
//                             <div className="ad-panel">
//                                 <div className="ad-panel-header">
//                                     <h2 className="ad-panel-title"><PenTool size={15} /> Urgent Marking Queue</h2>
//                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
//                                 </div>

//                                 {loadingTasks ? (
//                                     <div className="ad-state-box"><div className="ad-spinner" />Loading marking tasks…</div>
//                                 ) : pendingTasks.length === 0 ? (
//                                     <div className="ad-state-box">
//                                         <CheckCircle size={44} color="var(--mlab-green)" />
//                                         <span className="ad-state-box__title">All Caught Up</span>
//                                         <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
//                                         {!isAdmin && myCohortIds.length === 0 && (
//                                             <p className="ad-state-box__warn">You are not assigned to any cohorts. Contact an administrator.</p>
//                                         )}
//                                     </div>
//                                 ) : (
//                                     <div className="ad-task-list">
//                                         {pendingTasks.map(task => (
//                                             <div key={task.id} className={`ad-task-card${task.isReturned ? ' returned' : ''}`}>
//                                                 <div className="ad-task-info">
//                                                     <div className="ad-task-header">
//                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
//                                                         {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
//                                                     </div>
//                                                     <p className="ad-task-title">
//                                                         <FileText size={13} /> {task.title}
//                                                     </p>
//                                                     <div className="ad-task-meta">
//                                                         <span className="ad-task-date">
//                                                             <User size={12} /> Pre-Marked by <strong>{task.facilitatorName}</strong>
//                                                         </span>
//                                                         <span className="ad-task-date">
//                                                             <Clock size={12} />
//                                                             {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
//                                                         </span>
//                                                         {task.facilitatorTimeSpent !== undefined && task.facilitatorTimeSpent > 0 && (
//                                                             <span className="ad-task-meta__time-chip">
//                                                                 <Activity size={11} />
//                                                                 <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
//                                                                 {task.facilitatorStartedAt && ` · ${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread`}
//                                                             </span>
//                                                         )}
//                                                     </div>
//                                                 </div>
//                                                 <div className="ad-task-actions">
//                                                     <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${task.learnerId}`)} title="View Portfolio">
//                                                         <Layers size={13} />
//                                                     </button>
//                                                     <button className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`} onClick={() => navigate(`/portfolio/submission/${task.id}`)}>
//                                                         {task.isReturned ? <><AlertTriangle size={13} /> Fix Return</> : <><PenTool size={13} /> Grade Now</>}
//                                                     </button>
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 )}
//                             </div>

//                             {/* Learner overview */}
//                             <div className="ad-panel">
//                                 <div className="ad-overview-header">
//                                     <h2 className="ad-panel-title"><Users size={15} /> Learner Progress Overview</h2>
//                                     <div className="ad-overview-search">
//                                         <Search size={14} className="ad-overview-search__icon" />
//                                         <input
//                                             type="text"
//                                             className="ad-overview-search__input"
//                                             placeholder="Search learners…"
//                                             value={searchTerm}
//                                             onChange={e => setSearchTerm(e.target.value)}
//                                         />
//                                     </div>
//                                 </div>

//                                 <div className="mlab-table-wrap">
//                                     <table className="mlab-table">
//                                         <thead>
//                                             <tr>
//                                                 <th>Learner Name</th>
//                                                 <th>ID Number</th>
//                                                 <th>Class</th>
//                                                 <th>Assessor Progress</th>
//                                                 <th className="ad-th--right">Actions</th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {filteredLearners.length === 0 ? (
//                                                 <tr>
//                                                     <td colSpan={5} className="ad-td--empty">
//                                                         No learners found in your assigned cohorts.
//                                                     </td>
//                                                 </tr>
//                                             ) : filteredLearners.map(l => {
//                                                 const pct = l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0;
//                                                 const isDone = l.completedAssessments === l.totalAssessments && l.totalAssessments > 0;
//                                                 return (
//                                                     <tr key={l.id}>
//                                                         <td>
//                                                             <div className="ad-learner-name-cell">
//                                                                 <div className="ad-learner-avatar">{l.fullName.charAt(0)}</div>
//                                                                 <span className="ad-learner-name">{l.fullName}</span>
//                                                                 {l.needsGrading > 0 && (
//                                                                     <span className="ad-to-grade-badge">{l.needsGrading} To Grade</span>
//                                                                 )}
//                                                             </div>
//                                                         </td>
//                                                         <td><span className="ad-id-number">{l.idNumber}</span></td>
//                                                         <td><span className="ad-cohort-label">{l.cohortName}</span></td>
//                                                         <td>
//                                                             <div className="ad-progress-cell">
//                                                                 <div className="ad-progress-track">
//                                                                     <div className={`ad-progress-fill${isDone ? ' ad-progress-fill--done' : ''}`} style={{ width: `${pct}%` }} />
//                                                                 </div>
//                                                                 <span className="ad-progress-fraction">{l.completedAssessments} / {l.totalAssessments}</span>
//                                                             </div>
//                                                         </td>
//                                                         <td className="ad-td--right">
//                                                             <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}>
//                                                                 View PoE <ChevronRight size={13} />
//                                                             </button>
//                                                         </td>
//                                                     </tr>
//                                                 );
//                                             })}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ══ TAB 2: COHORTS ══ */}
//                     {currentNav === 'cohorts' && (
//                         <div className="animate-fade-in">
//                             <h2 className="ad-section-title"><Layers size={16} /> Assigned Cohorts</h2>
//                             <div className="ad-cohort-grid">
//                                 {myCohorts.map(cohort => (
//                                     <div key={cohort.id} className="ad-cohort-card">
//                                         <div className="ad-cohort-card__header">
//                                             <h3 className="ad-cohort-card__name">{cohort.name}</h3>
//                                             <span className="ad-badge ad-badge--active">Assessing</span>
//                                         </div>
//                                         <div className="ad-cohort-card__dates">
//                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
//                                         </div>
//                                         <div className="ad-cohort-card__roles">
//                                             <div className="ad-role-row">
//                                                 <div className="ad-role-dot ad-role-dot--blue" />
//                                                 <span className="ad-role-label">Facilitator:</span>
//                                                 <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
//                                             </div>
//                                         </div>
//                                         <div className="ad-cohort-card__footer">
//                                             <button className="ad-portfolio-btn" onClick={() => navigate(`/cohorts/${cohort.id}`)}>
//                                                 View Portfolios <ArrowRight size={13} />
//                                             </button>
//                                         </div>
//                                     </div>
//                                 ))}
//                                 {myCohorts.length === 0 && (
//                                     <div className="ad-empty">
//                                         <div className="ad-empty__icon"><Layers size={36} /></div>
//                                         <span className="ad-empty__title">No Cohorts Assigned</span>
//                                         <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
//                                         <button className="ad-empty__link" onClick={() => setShowDiagnostics(true)}>Run ID Diagnostics</button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* ══ TAB 3: PROFILE ══ */}
//                     {currentNav === 'profile' && (
//                         <AssessorProfileView profile={store.user} user={store.user} onUpdate={store.updateStaffProfile} />
//                     )}

//                 </div>
//             </main>
//         </div>
//     );
// };


