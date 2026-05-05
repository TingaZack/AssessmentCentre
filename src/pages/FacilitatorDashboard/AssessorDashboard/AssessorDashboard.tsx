
// src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, PenTool, Clock, CheckCircle, AlertTriangle,
    FileText, Layers, Info, User, Activity, Timer, Users, Search,
    ChevronRight, LayoutDashboard, UserCircle
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

    const pageTitle = currentNav === 'dashboard' ? 'Marking Centre' : currentNav === 'cohorts' ? 'My Assigned Classes' : 'Compliance Profile';
    const PageIcon = currentNav === 'dashboard' ? LayoutDashboard : currentNav === 'cohorts' ? Layers : UserCircle;

    return (
        <div className="ad-layout">
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
                            <div className="ad-kpi-grid">
                                <StatCard icon={<Layers size={20} />} title="Assigned Cohorts" value={isAdmin ? 'ALL' : myCohorts.length} borderColor="var(--mlab-blue)" />
                                <StatCard icon={<Clock size={20} />} title="Pending Grading" value={pendingTasks.length} borderColor="var(--mlab-amber)" />
                                <StatCard icon={<Activity size={20} />} title="Incoming: Avg Pre-Mark" value={formatTimeSpent(avgFacilitatorTime)} borderColor="#0ea5e9" />
                                <StatCard icon={<Timer size={20} />} title="My Avg Marking Pace" value={formatTimeSpent(avgAssessorTime)} borderColor="#ef4444" />
                            </div>

                            {/* Marking queue */}
                            <div className="ad-panel">
                                <div className="ad-panel-header">
                                    <h2 className="ad-panel-title"><PenTool size={15} /> Urgent Marking Queue</h2>
                                    <span className="ad-panel-badge">{pendingTasks.length} items</span>
                                </div>

                                {loadingTasks ? (
                                    <div className="ad-state-box"><div className="ad-spinner" />Loading marking tasks…</div>
                                ) : pendingTasks.length === 0 ? (
                                    <div className="ad-state-box">
                                        <CheckCircle size={44} color="var(--mlab-green)" />
                                        <span className="ad-state-box__title">All Caught Up</span>
                                        <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
                                        {!isAdmin && myCohortIds.length === 0 && (
                                            <p className="ad-state-box__warn">You are not assigned to any cohorts. Contact an administrator.</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="ad-task-list">
                                        {pendingTasks.map(task => (
                                            <div key={task.id} className={`ad-task-card${task.isReturned ? ' returned' : ''}`}>
                                                <div className="ad-task-info">
                                                    <div className="ad-task-header">
                                                        <h4 className="ad-task-learner">{task.learnerName}</h4>
                                                        {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
                                                    </div>
                                                    <p className="ad-task-title">
                                                        <FileText size={13} /> {task.title}
                                                    </p>
                                                    <div className="ad-task-meta">
                                                        <span className="ad-task-date">
                                                            <User size={12} /> Pre-Marked by <strong>{task.facilitatorName}</strong>
                                                        </span>
                                                        <span className="ad-task-date">
                                                            <Clock size={12} />
                                                            {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {task.facilitatorTimeSpent !== undefined && task.facilitatorTimeSpent > 0 && (
                                                            <span className="ad-task-meta__time-chip">
                                                                <Activity size={11} />
                                                                <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
                                                                {task.facilitatorStartedAt && ` · ${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="ad-task-actions">
                                                    <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${task.learnerId}`)} title="View Portfolio">
                                                        <Layers size={13} />
                                                    </button>
                                                    <button className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`} onClick={() => navigate(`/portfolio/submission/${task.id}`)}>
                                                        {task.isReturned ? <><AlertTriangle size={13} /> Fix Return</> : <><PenTool size={13} /> Grade Now</>}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

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



// // // src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import {
// //     Calendar, ArrowRight, PenTool, Clock, CheckCircle, AlertTriangle,
// //     FileText, Layers, Info, User, Activity, Timer, Users, Search,
// //     ChevronRight, LayoutDashboard, UserCircle
// // } from 'lucide-react';
// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // import { useStore } from '../../../store/useStore';
// // import { auth, db } from '../../../lib/firebase';
// // import './AssessorDashboard.css';
// // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// // import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// // import StatCard from '../../../components/common/StatCard/StatCard';

// // interface PendingTask {
// //     id: string; learnerId: string; learnerName: string; assessmentId: string;
// //     title: string; status: string; submittedAt: string; isReturned: boolean;
// //     facilitatorName: string; facilitatorTimeSpent?: number; facilitatorStartedAt?: string;
// // }

// // interface LearnerStat {
// //     id: string; enrollmentId: string; fullName: string; idNumber: string;
// //     cohortName: string; cohortId: string;
// //     completedAssessments: number; totalAssessments: number; needsGrading: number;
// // }

// // export const AssessorDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();

// //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );
// //     const [showDiagnostics, setShowDiagnostics] = useState(false);
// //     const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
// //     const [historicalTasks, setHistoricalTasks] = useState<any[]>([]);
// //     const [learnerStats, setLearnerStats] = useState<LearnerStat[]>([]);
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [loadingTasks, setLoadingTasks] = useState(true);

// //     useEffect(() => {
// //         store.fetchCohorts();
// //         store.fetchStaff();
// //         store.fetchLearners();
// //     }, []);

// //     const myStaffProfile = store.staff.find(s =>
// //         s.authUid === store.user?.uid || s.email === store.user?.email || s.id === store.user?.uid
// //     );
// //     const myCohorts = store.cohorts.filter(c =>
// //         c.assessorId === store.user?.uid || c.assessorId === myStaffProfile?.id || c.assessorEmail === store.user?.email
// //     );
// //     const myCohortIds = myCohorts.map(c => c.id);
// //     const isAdmin = store.user?.role === 'admin';

// //     useEffect(() => {
// //         const fetchTasksAndStats = async () => {
// //             if (!store.user?.uid || store.cohorts.length === 0) return;
// //             if (!isAdmin && myCohortIds.length === 0) { setLoadingTasks(false); return; }

// //             try {
// //                 const snap = await getDocs(query(collection(db, 'learner_submissions'),
// //                     where('status', 'in', ['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'])
// //                 ));

// //                 const pTasks: PendingTask[] = [];
// //                 const hTasks: any[] = [];
// //                 const lStatsMap: Record<string, LearnerStat> = {};

// //                 store.learners.forEach(l => {
// //                     if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
// //                         const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
// //                         lStatsMap[l.id] = { id: l.id, enrollmentId: l.enrollmentId || l.id, fullName: l.fullName, idNumber: l.idNumber || 'N/A', cohortName: cName, cohortId: l.cohortId || 'Unassigned', completedAssessments: 0, totalAssessments: 0, needsGrading: 0 };
// //                     }
// //                 });

// //                 snap.docs.forEach(docSnap => {
// //                     const data = docSnap.data();
// //                     if (!isAdmin && !(data.cohortId && myCohortIds.includes(data.cohortId))) return;
// //                     if (lStatsMap[data.learnerId]) {
// //                         lStatsMap[data.learnerId].totalAssessments += 1;
// //                         if (['graded', 'moderated', 'appealed'].includes(data.status)) lStatsMap[data.learnerId].completedAssessments += 1;
// //                         if (['facilitator_reviewed', 'returned'].includes(data.status)) lStatsMap[data.learnerId].needsGrading += 1;
// //                     }
// //                     if (['facilitator_reviewed', 'returned'].includes(data.status)) {
// //                         const learner = store.learners.find(l => l.id === data.learnerId);
// //                         pTasks.push({ id: docSnap.id, learnerId: data.learnerId, learnerName: learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner', assessmentId: data.assessmentId, title: data.title || 'Untitled Assessment', status: data.status, submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(), isReturned: data.status === 'returned', facilitatorName: data.grading?.facilitatorName || 'Facilitator', facilitatorTimeSpent: data.grading?.facilitatorTimeSpent, facilitatorStartedAt: data.grading?.facilitatorStartedAt });
// //                     } else if (['graded', 'moderated'].includes(data.status)) {
// //                         if ((isAdmin || data.grading?.gradedBy === store.user?.uid) && data.grading?.assessorTimeSpent) hTasks.push(data);
// //                     }
// //                 });

// //                 pTasks.sort((a, b) => { if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1; return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(); });
// //                 setPendingTasks(pTasks);
// //                 setHistoricalTasks(hTasks);
// //                 setLearnerStats(Object.values(lStatsMap).sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));
// //             } catch (err) { console.error('Error fetching marking queue:', err); }
// //             finally { setLoadingTasks(false); }
// //         };
// //         fetchTasksAndStats();
// //     }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

// //     const handleLogout = async () => {
// //         try { await signOut(auth); navigate('/login'); }
// //         catch (err) { console.error('Logout failed', err); }
// //     };

// //     const getFacilitatorName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     const formatTimeSpent = (seconds?: number) => {
// //         if (!seconds) return '—';
// //         const m = Math.floor(seconds / 60);
// //         if (m === 0) return '< 1m';
// //         const h = Math.floor(m / 60);
// //         return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
// //     };

// //     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
// //         if (!startStr || !endStr) return null;
// //         const diffH = (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60);
// //         if (diffH < 1) return '< 1 hr';
// //         if (diffH < 24) return `${Math.floor(diffH)} hrs`;
// //         return `${Math.floor(diffH / 24)} days`;
// //     };

// //     const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent && t.facilitatorTimeSpent > 0);
// //     const avgFacilitatorTime = facTasksWithTime.length > 0
// //         ? facTasksWithTime.reduce((s, t) => s + (t.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length : 0;
// //     const avgAssessorTime = historicalTasks.length > 0
// //         ? historicalTasks.reduce((s, t) => s + (t.grading.assessorTimeSpent || 0), 0) / historicalTasks.length : 0;

// //     const filteredLearners = useMemo(() => {
// //         if (!searchTerm) return learnerStats;
// //         const t = searchTerm.toLowerCase();
// //         return learnerStats.filter(l => l.fullName.toLowerCase().includes(t) || l.idNumber.toLowerCase().includes(t) || l.cohortName.toLowerCase().includes(t));
// //     }, [learnerStats, searchTerm]);

// //     const pageTitle = currentNav === 'dashboard' ? 'Marking Centre' : currentNav === 'cohorts' ? 'My Assigned Classes' : 'Compliance Profile';
// //     const PageIcon = currentNav === 'dashboard' ? LayoutDashboard : currentNav === 'cohorts' ? Layers : UserCircle;

// //     return (
// //         <div className="ad-layout">
// //             <Sidebar role={store.user?.role} currentNav={currentNav} setCurrentNav={setCurrentNav as any} onLogout={handleLogout} />

// //             <main className="ad-main">

// //                 {/* ── PAGE HEADER ── */}
// //                 <header className="ad-header">
// //                     <div className="ad-header__left">
// //                         <div className="ad-header__icon-wrap">
// //                             <PageIcon size={22} />
// //                         </div>
// //                         <div className="ad-header__text">
// //                             <span className="ad-header__eyebrow">Assessor Portal</span>
// //                             <h1 className="ad-header__title">{pageTitle}</h1>
// //                             <p className="ad-header__sub">
// //                                 Practitioner: {store.user?.fullName || 'Unknown User'}
// //                                 {isAdmin && <span className="ad-header__admin-tag">Admin Bypass</span>}
// //                             </p>
// //                         </div>
// //                     </div>
// //                     <div className="ad-header__right">
// //                         <NotificationBell />
// //                     </div>
// //                 </header>

// //                 <div className="ad-content">

// //                     {/* ── Diagnostics ── */}
// //                     {showDiagnostics && (
// //                         <div className="ad-diagnostic ad-animate">
// //                             <h4 className="ad-diagnostic__heading"><Info size={14} /> System Identity Bridge</h4>
// //                             <div className="ad-diagnostic__grid">
// //                                 <div className="ad-diagnostic__item">
// //                                     <span className="ad-diagnostic__label">Auth UID</span>
// //                                     <code className="ad-diagnostic__code">{store.user?.uid}</code>
// //                                 </div>
// //                                 <div className="ad-diagnostic__item">
// //                                     <span className="ad-diagnostic__label">Staff ID</span>
// //                                     <code className="ad-diagnostic__code">{myStaffProfile?.id || 'Not Linked'}</code>
// //                                 </div>
// //                                 <div className="ad-diagnostic__item ad-diagnostic__item--full">
// //                                     <span className="ad-diagnostic__label">Assigned Cohort IDs</span>
// //                                     <code className="ad-diagnostic__code">{myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}</code>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ══ TAB 1: MARKING QUEUE ══ */}
// //                     {currentNav === 'dashboard' && (
// //                         <div className="ad-dashboard animate-fade-in">

// //                             {/* KPI ribbon */}
// //                             <div className="ad-kpi-grid">
// //                                 <StatCard icon={<Layers size={20} />} title="Assigned Cohorts" value={isAdmin ? 'ALL' : myCohorts.length} borderColor="var(--mlab-blue)" />
// //                                 <StatCard icon={<Clock size={20} />} title="Pending Grading" value={pendingTasks.length} borderColor="var(--mlab-amber)" />
// //                                 <StatCard icon={<Activity size={20} />} title="Incoming: Avg Pre-Mark" value={formatTimeSpent(avgFacilitatorTime)} borderColor="#0ea5e9" />
// //                                 <StatCard icon={<Timer size={20} />} title="My Avg Marking Pace" value={formatTimeSpent(avgAssessorTime)} borderColor="#ef4444" />
// //                             </div>

// //                             {/* Marking queue */}
// //                             <div className="ad-panel">
// //                                 <div className="ad-panel-header">
// //                                     <h2 className="ad-panel-title"><PenTool size={15} /> Urgent Marking Queue</h2>
// //                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
// //                                 </div>

// //                                 {loadingTasks ? (
// //                                     <div className="ad-state-box"><div className="ad-spinner" />Loading marking tasks…</div>
// //                                 ) : pendingTasks.length === 0 ? (
// //                                     <div className="ad-state-box">
// //                                         <CheckCircle size={44} color="var(--mlab-green)" />
// //                                         <span className="ad-state-box__title">All Caught Up</span>
// //                                         <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
// //                                         {!isAdmin && myCohortIds.length === 0 && (
// //                                             <p className="ad-state-box__warn">You are not assigned to any cohorts. Contact an administrator.</p>
// //                                         )}
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ad-task-list">
// //                                         {pendingTasks.map(task => (
// //                                             <div key={task.id} className={`ad-task-card${task.isReturned ? ' returned' : ''}`}>
// //                                                 <div className="ad-task-info">
// //                                                     <div className="ad-task-header">
// //                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
// //                                                         {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
// //                                                     </div>
// //                                                     <p className="ad-task-title">
// //                                                         <FileText size={13} /> {task.title}
// //                                                     </p>
// //                                                     <div className="ad-task-meta">
// //                                                         <span className="ad-task-date">
// //                                                             <User size={12} /> Pre-Marked by <strong>{task.facilitatorName}</strong>
// //                                                         </span>
// //                                                         <span className="ad-task-date">
// //                                                             <Clock size={12} />
// //                                                             {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
// //                                                         </span>
// //                                                         {task.facilitatorTimeSpent !== undefined && task.facilitatorTimeSpent > 0 && (
// //                                                             <span className="ad-task-meta__time-chip">
// //                                                                 <Activity size={11} />
// //                                                                 <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
// //                                                                 {task.facilitatorStartedAt && ` · ${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread`}
// //                                                             </span>
// //                                                         )}
// //                                                     </div>
// //                                                 </div>
// //                                                 <div className="ad-task-actions">
// //                                                     <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${task.learnerId}`)} title="View Portfolio">
// //                                                         <Layers size={13} />
// //                                                     </button>
// //                                                     <button className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`} onClick={() => navigate(`/portfolio/submission/${task.id}`)}>
// //                                                         {task.isReturned ? <><AlertTriangle size={13} /> Fix Return</> : <><PenTool size={13} /> Grade Now</>}
// //                                                     </button>
// //                                                 </div>
// //                                             </div>
// //                                         ))}
// //                                     </div>
// //                                 )}
// //                             </div>

// //                             {/* Learner overview */}
// //                             <div className="ad-panel">
// //                                 <div className="ad-overview-header">
// //                                     <h2 className="ad-panel-title"><Users size={15} /> Learner Progress Overview</h2>
// //                                     <div className="ad-overview-search">
// //                                         <Search size={14} className="ad-overview-search__icon" />
// //                                         <input
// //                                             type="text"
// //                                             className="ad-overview-search__input"
// //                                             placeholder="Search learners…"
// //                                             value={searchTerm}
// //                                             onChange={e => setSearchTerm(e.target.value)}
// //                                         />
// //                                     </div>
// //                                 </div>

// //                                 <div className="mlab-table-wrap">
// //                                     <table className="mlab-table">
// //                                         <thead>
// //                                             <tr>
// //                                                 <th>Learner Name</th>
// //                                                 <th>ID Number</th>
// //                                                 <th>Class</th>
// //                                                 <th>Assessor Progress</th>
// //                                                 <th className="ad-th--right">Actions</th>
// //                                             </tr>
// //                                         </thead>
// //                                         <tbody>
// //                                             {filteredLearners.length === 0 ? (
// //                                                 <tr>
// //                                                     <td colSpan={5} className="ad-td--empty">
// //                                                         No learners found in your assigned cohorts.
// //                                                     </td>
// //                                                 </tr>
// //                                             ) : filteredLearners.map(l => {
// //                                                 const pct = l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0;
// //                                                 const isDone = l.completedAssessments === l.totalAssessments && l.totalAssessments > 0;
// //                                                 return (
// //                                                     <tr key={l.id}>
// //                                                         <td>
// //                                                             <div className="ad-learner-name-cell">
// //                                                                 <div className="ad-learner-avatar">{l.fullName.charAt(0)}</div>
// //                                                                 <span className="ad-learner-name">{l.fullName}</span>
// //                                                                 {l.needsGrading > 0 && (
// //                                                                     <span className="ad-to-grade-badge">{l.needsGrading} To Grade</span>
// //                                                                 )}
// //                                                             </div>
// //                                                         </td>
// //                                                         <td><span className="ad-id-number">{l.idNumber}</span></td>
// //                                                         <td><span className="ad-cohort-label">{l.cohortName}</span></td>
// //                                                         <td>
// //                                                             <div className="ad-progress-cell">
// //                                                                 <div className="ad-progress-track">
// //                                                                     <div className={`ad-progress-fill${isDone ? ' ad-progress-fill--done' : ''}`} style={{ width: `${pct}%` }} />
// //                                                                 </div>
// //                                                                 <span className="ad-progress-fraction">{l.completedAssessments} / {l.totalAssessments}</span>
// //                                                             </div>
// //                                                         </td>
// //                                                         <td className="ad-td--right">
// //                                                             <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}>
// //                                                                 View PoE <ChevronRight size={13} />
// //                                                             </button>
// //                                                         </td>
// //                                                     </tr>
// //                                                 );
// //                                             })}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ══ TAB 2: COHORTS ══ */}
// //                     {currentNav === 'cohorts' && (
// //                         <div className="animate-fade-in">
// //                             <h2 className="ad-section-title"><Layers size={16} /> Assigned Cohorts</h2>
// //                             <div className="ad-cohort-grid">
// //                                 {myCohorts.map(cohort => (
// //                                     <div key={cohort.id} className="ad-cohort-card">
// //                                         <div className="ad-cohort-card__header">
// //                                             <h3 className="ad-cohort-card__name">{cohort.name}</h3>
// //                                             <span className="ad-badge ad-badge--active">Assessing</span>
// //                                         </div>
// //                                         <div className="ad-cohort-card__dates">
// //                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
// //                                         </div>
// //                                         <div className="ad-cohort-card__roles">
// //                                             <div className="ad-role-row">
// //                                                 <div className="ad-role-dot ad-role-dot--blue" />
// //                                                 <span className="ad-role-label">Facilitator:</span>
// //                                                 <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
// //                                             </div>
// //                                         </div>
// //                                         <div className="ad-cohort-card__footer">
// //                                             <button className="ad-portfolio-btn" onClick={() => navigate(`/cohorts/${cohort.id}`)}>
// //                                                 View Portfolios <ArrowRight size={13} />
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 ))}
// //                                 {myCohorts.length === 0 && (
// //                                     <div className="ad-empty">
// //                                         <div className="ad-empty__icon"><Layers size={36} /></div>
// //                                         <span className="ad-empty__title">No Cohorts Assigned</span>
// //                                         <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
// //                                         <button className="ad-empty__link" onClick={() => setShowDiagnostics(true)}>Run ID Diagnostics</button>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ══ TAB 3: PROFILE ══ */}
// //                     {currentNav === 'profile' && (
// //                         <AssessorProfileView profile={store.user} user={store.user} onUpdate={store.updateStaffProfile} />
// //                     )}

// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };


// // src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

// import React, { useEffect, useState, useMemo } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import {
//     Calendar, ArrowRight, PenTool,
//     Clock, CheckCircle, AlertTriangle, FileText,
//     Layers, Info, User, Activity, Timer, Users, Search, ChevronRight, LayoutDashboard, UserCircle
// } from 'lucide-react';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { useStore } from '../../../store/useStore';
// import { auth, db } from '../../../lib/firebase';
// import './AssessorDashboard.css';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// import StatCard from '../../../components/common/StatCard/StatCard';

// interface PendingTask {
//     id: string;
//     learnerId: string;
//     learnerName: string;
//     assessmentId: string;
//     title: string;
//     status: string;
//     submittedAt: string;
//     isReturned: boolean;
//     facilitatorName: string;
//     facilitatorTimeSpent?: number;
//     facilitatorStartedAt?: string;
// }

// interface LearnerStat {
//     id: string;
//     enrollmentId: string;
//     fullName: string;
//     idNumber: string;
//     cohortName: string;
//     cohortId: string;
//     completedAssessments: number;
//     totalAssessments: number;
//     needsGrading: number;
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

//     // ── Initial data sync ─────────────────────────────────────────────────
//     useEffect(() => {
//         store.fetchCohorts();
//         store.fetchStaff();
//         store.fetchLearners();
//     }, []);

//     // ── ID bridge logic ───────────────────────────────────────────────────
//     const myStaffProfile = store.staff.find(s =>
//         s.authUid === store.user?.uid ||
//         s.email === store.user?.email ||
//         s.id === store.user?.uid
//     );

//     const myCohorts = store.cohorts.filter(c =>
//         c.assessorId === store.user?.uid ||
//         c.assessorId === myStaffProfile?.id ||
//         c.assessorEmail === store.user?.email
//     );

//     const myCohortIds = myCohorts.map(c => c.id);
//     const isAdmin = store.user?.role === 'admin';

//     // ── Marking Queue & Historical Data ───────────────────────────────────
//     useEffect(() => {
//         const fetchTasksAndStats = async () => {
//             if (!store.user?.uid) return;
//             if (store.cohorts.length === 0) return;

//             if (!isAdmin && myCohortIds.length === 0) {
//                 console.warn('Assessor has no cohorts assigned — queue will be empty.');
//                 setLoadingTasks(false);
//                 return;
//             }

//             try {
//                 // 1. Fetch Marking Queue
//                 const snap = await getDocs(query(
//                     collection(db, 'learner_submissions'),
//                     where('status', 'in', ['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'])
//                 ));

//                 const pTasks: PendingTask[] = [];
//                 const hTasks: any[] = [];

//                 // Track learner progress
//                 const lStatsMap: Record<string, LearnerStat> = {};

//                 // Initialize Learner Map
//                 store.learners.forEach(l => {
//                     if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
//                         const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
//                         lStatsMap[l.id] = {
//                             id: l.id,
//                             enrollmentId: l.enrollmentId || l.id,
//                             fullName: l.fullName,
//                             idNumber: l.idNumber || 'N/A',
//                             cohortName: cName,
//                             cohortId: l.cohortId || 'Unassigned',
//                             completedAssessments: 0,
//                             totalAssessments: 0,
//                             needsGrading: 0
//                         };
//                     }
//                 });

//                 snap.docs.forEach(docSnap => {
//                     const data = docSnap.data();
//                     const subCohortId = data.cohortId;
//                     const learnerId = data.learnerId;

//                     if (isAdmin || (subCohortId && myCohortIds.includes(subCohortId))) {

//                         // Update Learner Stats
//                         if (lStatsMap[learnerId]) {
//                             lStatsMap[learnerId].totalAssessments += 1;
//                             if (['graded', 'moderated', 'appealed'].includes(data.status)) {
//                                 lStatsMap[learnerId].completedAssessments += 1;
//                             }
//                             if (['facilitator_reviewed', 'returned'].includes(data.status)) {
//                                 lStatsMap[learnerId].needsGrading += 1;
//                             }
//                         }

//                         // Queue Logic
//                         if (['facilitator_reviewed', 'returned'].includes(data.status)) {
//                             const learner = store.learners.find(l => l.id === learnerId);
//                             pTasks.push({
//                                 id: docSnap.id,
//                                 learnerId: learnerId,
//                                 learnerName: learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner',
//                                 assessmentId: data.assessmentId,
//                                 title: data.title || 'Untitled Assessment',
//                                 status: data.status,
//                                 submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(),
//                                 isReturned: data.status === 'returned',
//                                 facilitatorName: data.grading?.facilitatorName || 'Facilitator',
//                                 facilitatorTimeSpent: data.grading?.facilitatorTimeSpent,
//                                 facilitatorStartedAt: data.grading?.facilitatorStartedAt
//                             });
//                         }
//                         else if (['graded', 'moderated'].includes(data.status)) {
//                             if (isAdmin || data.grading?.gradedBy === store.user?.uid) {
//                                 if (data.grading?.assessorTimeSpent) {
//                                     hTasks.push(data);
//                                 }
//                             }
//                         }
//                     }
//                 });

//                 pTasks.sort((a, b) => {
//                     if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1;
//                     return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
//                 });

//                 setPendingTasks(pTasks);
//                 setHistoricalTasks(hTasks);
//                 setLearnerStats(Object.values(lStatsMap).sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));

//             } catch (err) {
//                 console.error('Error fetching marking queue:', err);
//             } finally {
//                 setLoadingTasks(false);
//             }
//         };

//         fetchTasksAndStats();
//     }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

//     const handleLogout = async () => {
//         try { await signOut(auth); navigate('/login'); }
//         catch (err) { console.error('Logout failed', err); }
//     };

//     const getFacilitatorName = (id: string) =>
//         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     // ── 4. Time Formatting Helpers ───────────────────────────────────────────
//     const formatTimeSpent = (seconds?: number) => {
//         if (seconds === undefined || seconds === null || seconds === 0) return '—';
//         const m = Math.floor(seconds / 60);
//         if (m === 0) return '< 1m';
//         const h = Math.floor(m / 60);
//         if (h > 0) {
//             const remM = m % 60;
//             return `${h}h ${remM}m`;
//         }
//         return `${m}m`;
//     };

//     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
//         if (!startStr || !endStr) return null;
//         const start = new Date(startStr).getTime();
//         const end = new Date(endStr).getTime();
//         const diffHours = (end - start) / (1000 * 60 * 60);

//         if (diffHours < 24) {
//             if (diffHours < 1) return '< 1 hr';
//             return `${Math.floor(diffHours)} hrs`;
//         }
//         return `${Math.floor(diffHours / 24)} days`;
//     };

//     // ── 5. Analytics Math ────────────────────────────────────────────────────
//     const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent !== undefined && t.facilitatorTimeSpent > 0);
//     const avgFacilitatorTime = facTasksWithTime.length > 0
//         ? facTasksWithTime.reduce((sum, task) => sum + (task.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length
//         : 0;

//     const avgAssessorTime = historicalTasks.length > 0
//         ? historicalTasks.reduce((sum, task) => sum + (task.grading.assessorTimeSpent || 0), 0) / historicalTasks.length
//         : 0;

//     const filteredLearners = useMemo(() => {
//         if (!searchTerm) return learnerStats;
//         const term = searchTerm.toLowerCase();
//         return learnerStats.filter(l =>
//             l.fullName.toLowerCase().includes(term) ||
//             l.idNumber.toLowerCase().includes(term) ||
//             l.cohortName.toLowerCase().includes(term)
//         );
//     }, [learnerStats, searchTerm]);

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
//             <Sidebar
//                 role={store.user?.role}
//                 currentNav={currentNav}
//                 setCurrentNav={setCurrentNav as any}
//                 onLogout={handleLogout}
//             />

//             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--mlab-bg)' }}>

//                 {/* ── STANDARD HEADER ── */}
//                 <div style={{ padding: '1.5rem 2rem', background: 'white', borderBottom: '1px solid var(--mlab-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                     <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
//                         <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--mlab-blue-light)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                             {currentNav === 'dashboard' && <LayoutDashboard size={24} />}
//                             {currentNav === 'cohorts' && <Layers size={24} />}
//                             {currentNav === 'profile' && <UserCircle size={24} />}
//                         </div>
//                         <div>
//                             <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', marginBottom: '2px' }}>
//                                 Assessor Portal
//                             </span>
//                             <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
//                                 {currentNav === 'dashboard' && 'Marking Centre'}
//                                 {currentNav === 'cohorts' && 'My Assigned Classes'}
//                                 {currentNav === 'profile' && 'Compliance Profile'}
//                             </h1>
//                             <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                 Practitioner: {store.user?.fullName || 'Unknown User'}{isAdmin ? ' (Admin Bypass Active)' : ''}
//                             </p>
//                         </div>
//                     </div>
//                     <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <NotificationBell />
//                     </div>
//                 </div>

//                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

//                     {/* ── Diagnostic console ── */}
//                     {showDiagnostics && (
//                         <div className="ad-diagnostic ad-animate">
//                             <h4 className="ad-diagnostic__heading">
//                                 <Info size={14} /> System Identity Bridge
//                             </h4>
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
//                                     <code className="ad-diagnostic__code">
//                                         {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}
//                                     </code>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ════════════════════════════════════════
//                         TAB 1 — MARKING QUEUE
//                     ════════════════════════════════════════ */}
//                     {currentNav === 'dashboard' && (
//                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

//                             {/* ── KPI RIBBON ── */}
//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
//                                 <StatCard icon={<Layers size={20} />} title="Assigned Cohorts" value={isAdmin ? 'ALL' : myCohorts.length} borderColor="var(--mlab-blue)" />
//                                 <StatCard icon={<Clock size={20} />} title="Pending Grading" value={pendingTasks.length} borderColor="var(--mlab-amber)" />
//                                 <StatCard icon={<Activity size={20} />} title="Incoming: Avg Pre-Mark" value={formatTimeSpent(avgFacilitatorTime)} borderColor="#0ea5e9" />
//                                 <StatCard icon={<Timer size={20} />} title="My Avg Marking Pace" value={formatTimeSpent(avgAssessorTime)} borderColor="#ef4444" />
//                             </div>

//                             {/* Queue panel */}
//                             <div className="ad-panel" style={{ maxWidth: '1200px' }}>
//                                 <div className="ad-panel-header">
//                                     <h2 className="ad-panel-title">
//                                         <PenTool size={16} /> Urgent Marking Queue
//                                     </h2>
//                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
//                                 </div>

//                                 {loadingTasks ? (
//                                     <div className="ad-state-box">
//                                         <div className="ad-spinner" />
//                                         Loading marking tasks…
//                                     </div>
//                                 ) : pendingTasks.length === 0 ? (
//                                     <div className="ad-state-box">
//                                         <CheckCircle size={44} color="var(--mlab-green)" />
//                                         <span className="ad-state-box__title">All Caught Up</span>
//                                         <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
//                                         {!isAdmin && myCohortIds.length === 0 && (
//                                             <p className="ad-state-box__warn">
//                                                 You are not assigned to any cohorts. Contact an administrator.
//                                             </p>
//                                         )}
//                                     </div>
//                                 ) : (
//                                     <div className="ad-task-list">
//                                         {pendingTasks.map(task => (
//                                             <div
//                                                 key={task.id}
//                                                 className={`ad-task-card${task.isReturned ? ' returned' : ''}`}
//                                             >
//                                                 <div className="ad-task-info">
//                                                     <div className="ad-task-header">
//                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
//                                                         {task.isReturned && (
//                                                             <span className="ad-task-tag danger">Mod. Returned</span>
//                                                         )}
//                                                     </div>
//                                                     <p className="ad-task-title" style={{ marginBottom: '8px' }}>
//                                                         <FileText size={13} /> {task.title}
//                                                     </p>
//                                                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                                                         <p className="ad-task-date">
//                                                             <User size={12} color="#0284c7" />
//                                                             Pre-Marked by <strong>{task.facilitatorName}</strong>
//                                                         </p>
//                                                         <p className="ad-task-date">
//                                                             <Clock size={12} color="#64748b" />
//                                                             Waiting since: {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: "2-digit", minute: "2-digit", })}
//                                                         </p>
//                                                         {task.facilitatorTimeSpent !== undefined && (
//                                                             <p className="ad-task-date" style={{ color: '#073f4e', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
//                                                                 <Activity size={11} />
//                                                                 <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
//                                                                 {task.facilitatorStartedAt && ` (${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread)`}
//                                                             </p>
//                                                         )}
//                                                     </div>
//                                                 </div>
//                                                 <div style={{ display: 'flex', gap: '10px' }}>
//                                                     <button
//                                                         className="mlab-btn mlab-btn--ghost mlab-btn--sm"
//                                                         onClick={() => navigate(`/portfolio/${task.learnerId}`)}
//                                                         title="View Full Portfolio"
//                                                     >
//                                                         <Layers size={13} />
//                                                     </button>
//                                                     <button
//                                                         className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`}
//                                                         onClick={() => navigate(`/portfolio/submission/${task.id}`)}
//                                                     >
//                                                         {task.isReturned
//                                                             ? <><AlertTriangle size={13} /> Fix Return</>
//                                                             : <><PenTool size={13} /> Grade Now</>
//                                                         }
//                                                     </button>
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 )}
//                             </div>

//                             {/* Learner Overview Panel */}
//                             <div className="ad-panel" style={{ maxWidth: '1200px' }}>
//                                 <div className="ad-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', padding: '16px 24px' }}>
//                                     <h2 className="ad-panel-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <Users size={16} /> Learner Progress Overview
//                                     </h2>
//                                     <div className="mlab-search" style={{ margin: 0, minWidth: '250px', background: 'white' }}>
//                                         <Search size={14} color="var(--mlab-grey)" />
//                                         <input
//                                             type="text"
//                                             placeholder="Search learners..."
//                                             value={searchTerm}
//                                             onChange={e => setSearchTerm(e.target.value)}
//                                             style={{ background: 'transparent', border: 'none', outline: 'none', paddingLeft: '8px', fontSize: '0.85rem', width: '100%' }}
//                                         />
//                                     </div>
//                                 </div>

//                                 <div className="mlab-table-wrap">
//                                     <table className="mlab-table">
//                                         <thead>
//                                             <tr>
//                                                 <th>Learner Name</th>
//                                                 <th>ID Number</th>
//                                                 <th>Assigned Class</th>
//                                                 <th>Assessor Progress</th>
//                                                 <th style={{ textAlign: 'right' }}>Actions</th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {filteredLearners.length === 0 ? (
//                                                 <tr>
//                                                     <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--mlab-grey)' }}>
//                                                         No learners found in your assigned cohorts.
//                                                     </td>
//                                                 </tr>
//                                             ) : (
//                                                 filteredLearners.map(l => (
//                                                     <tr key={l.id}>
//                                                         <td>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                 <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--mlab-blue-light)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
//                                                                     {l.fullName.charAt(0)}
//                                                                 </div>
//                                                                 <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{l.fullName}</span>
//                                                                 {l.needsGrading > 0 && (
//                                                                     <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold' }}>
//                                                                         {l.needsGrading} To Grade
//                                                                     </span>
//                                                                 )}
//                                                             </div>
//                                                         </td>
//                                                         <td><span style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>{l.idNumber}</span></td>
//                                                         <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>{l.cohortName}</span></td>
//                                                         <td>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                 <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
//                                                                     <div
//                                                                         style={{
//                                                                             height: '100%',
//                                                                             background: l.completedAssessments === l.totalAssessments && l.totalAssessments > 0 ? 'var(--mlab-green)' : 'var(--mlab-blue)',
//                                                                             width: `${l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0}%`
//                                                                         }}
//                                                                     />
//                                                                 </div>
//                                                                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', minWidth: '40px' }}>
//                                                                     {l.completedAssessments} / {l.totalAssessments}
//                                                                 </span>
//                                                             </div>
//                                                         </td>
//                                                         <td style={{ textAlign: 'right' }}>
//                                                             <button
//                                                                 className="mlab-btn mlab-btn--ghost mlab-btn--sm"
//                                                                 onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}
//                                                             >
//                                                                 View PoE <ChevronRight size={14} />
//                                                             </button>
//                                                         </td>
//                                                     </tr>
//                                                 ))
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ════════════════════════════════════════
//                         TAB 2 — MY COHORTS
//                     ════════════════════════════════════════ */}
//                     {currentNav === 'cohorts' && (
//                         <div className="animate-fade-in">
//                             <h2 className="ad-section-title">
//                                 <Layers size={16} /> Assigned Cohorts
//                             </h2>

//                             <div className="ad-cohort-grid">
//                                 {myCohorts.map(cohort => (
//                                     <div key={cohort.id} className="ad-cohort-card">
//                                         <div className="ad-cohort-card__header">
//                                             <h3 className="ad-cohort-card__name">{cohort.name}</h3>
//                                             <span className="ad-badge ad-badge--active">Assessing</span>
//                                         </div>

//                                         <div className="ad-cohort-card__dates">
//                                             <Calendar size={13} />
//                                             {cohort.startDate} — {cohort.endDate}
//                                         </div>

//                                         <div className="ad-cohort-card__roles">
//                                             <div className="ad-role-row">
//                                                 <div className="ad-role-dot ad-role-dot--blue" />
//                                                 <span className="ad-role-label">Facilitator:</span>
//                                                 <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
//                                             </div>
//                                         </div>

//                                         <div className="ad-cohort-card__footer">
//                                             <button
//                                                 className="ad-portfolio-btn"
//                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
//                                             >
//                                                 View Portfolios <ArrowRight size={13} />
//                                             </button>
//                                         </div>
//                                     </div>
//                                 ))}

//                                 {myCohorts.length === 0 && (
//                                     <div className="ad-empty">
//                                         <div className="ad-empty__icon"><Layers size={44} color="var(--mlab-green)" /></div>
//                                         <span className="ad-empty__title">No Cohorts Assigned</span>
//                                         <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
//                                         <button
//                                             className="ad-empty__link"
//                                             onClick={() => setShowDiagnostics(true)}
//                                         >
//                                             Run ID Diagnostics
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* ════════════════════════════════════════
//                         TAB 3 — PROFILE
//                     ════════════════════════════════════════ */}
//                     {currentNav === 'profile' && (
//                         <AssessorProfileView
//                             profile={store.user}
//                             user={store.user}
//                             onUpdate={store.updateStaffProfile}
//                         />
//                     )}

//                 </div>
//             </main>
//         </div>
//     );
// };


// // // // // src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

// // // // import React, { useEffect, useState, useMemo } from 'react';
// // // // import { useNavigate, useLocation } from 'react-router-dom';
// // // // import { signOut } from 'firebase/auth';
// // // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // // import {
// // // //     Calendar, ArrowRight, PenTool,
// // // //     Clock, CheckCircle, AlertTriangle, FileText,
// // // //     Layers, Info, User, Activity, Timer, Users, Search, ChevronRight
// // // // } from 'lucide-react';
// // // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { auth, db } from '../../../lib/firebase';
// // // // import './AssessorDashboard.css';
// // // // import PageHeader from '../../../components/common/PageHeader/PageHeader';
// // // // import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';

// // // // interface PendingTask {
// // // //     id: string;
// // // //     learnerId: string;
// // // //     learnerName: string;
// // // //     assessmentId: string;
// // // //     title: string;
// // // //     status: string;
// // // //     submittedAt: string;
// // // //     isReturned: boolean;
// // // //     facilitatorName: string;
// // // //     facilitatorTimeSpent?: number;
// // // //     facilitatorStartedAt?: string;
// // // // }

// // // // interface LearnerStat {
// // // //     id: string;
// // // //     enrollmentId: string;
// // // //     fullName: string;
// // // //     idNumber: string;
// // // //     cohortName: string;
// // // //     cohortId: string;
// // // //     completedAssessments: number;
// // // //     totalAssessments: number;
// // // //     needsGrading: number;
// // // // }

// // // // export const AssessorDashboard: React.FC = () => {
// // // //     const navigate = useNavigate();
// // // //     const location = useLocation();
// // // //     const store = useStore();

// // // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
// // // //         (location.state as any)?.activeTab || 'dashboard'
// // // //     );
// // // //     const [showDiagnostics, setShowDiagnostics] = useState(false);
// // // //     const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
// // // //     const [historicalTasks, setHistoricalTasks] = useState<any[]>([]);
// // // //     const [learnerStats, setLearnerStats] = useState<LearnerStat[]>([]);
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [loadingTasks, setLoadingTasks] = useState(true);

// // // //     // ── Initial data sync ─────────────────────────────────────────────────
// // // //     useEffect(() => {
// // // //         store.fetchCohorts();
// // // //         store.fetchStaff();
// // // //         store.fetchLearners();
// // // //     }, []);

// // // //     // ── ID bridge logic ───────────────────────────────────────────────────
// // // //     const myStaffProfile = store.staff.find(s =>
// // // //         s.authUid === store.user?.uid ||
// // // //         s.email === store.user?.email ||
// // // //         s.id === store.user?.uid
// // // //     );

// // // //     const myCohorts = store.cohorts.filter(c =>
// // // //         c.assessorId === store.user?.uid ||
// // // //         c.assessorId === myStaffProfile?.id ||
// // // //         c.assessorEmail === store.user?.email
// // // //     );

// // // //     const myCohortIds = myCohorts.map(c => c.id);
// // // //     const isAdmin = store.user?.role === 'admin';

// // // //     // ── Marking Queue & Historical Data ───────────────────────────────────
// // // //     useEffect(() => {
// // // //         const fetchTasksAndStats = async () => {
// // // //             if (!store.user?.uid) return;
// // // //             if (store.cohorts.length === 0) return;

// // // //             if (!isAdmin && myCohortIds.length === 0) {
// // // //                 console.warn('Assessor has no cohorts assigned — queue will be empty.');
// // // //                 setLoadingTasks(false);
// // // //                 return;
// // // //             }

// // // //             try {
// // // //                 // 1. Fetch Marking Queue
// // // //                 const snap = await getDocs(query(
// // // //                     collection(db, 'learner_submissions'),
// // // //                     where('status', 'in', ['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'])
// // // //                 ));

// // // //                 const pTasks: PendingTask[] = [];
// // // //                 const hTasks: any[] = [];

// // // //                 // Track learner progress
// // // //                 const lStatsMap: Record<string, LearnerStat> = {};

// // // //                 // Initialize Learner Map
// // // //                 store.learners.forEach(l => {
// // // //                     if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
// // // //                         const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
// // // //                         lStatsMap[l.id] = {
// // // //                             id: l.id,
// // // //                             enrollmentId: l.enrollmentId || l.id,
// // // //                             fullName: l.fullName,
// // // //                             idNumber: l.idNumber || 'N/A',
// // // //                             cohortName: cName,
// // // //                             cohortId: l.cohortId || 'Unassigned',
// // // //                             completedAssessments: 0,
// // // //                             totalAssessments: 0,
// // // //                             needsGrading: 0
// // // //                         };
// // // //                     }
// // // //                 });

// // // //                 snap.docs.forEach(docSnap => {
// // // //                     const data = docSnap.data();
// // // //                     const subCohortId = data.cohortId;
// // // //                     const learnerId = data.learnerId;

// // // //                     if (isAdmin || (subCohortId && myCohortIds.includes(subCohortId))) {

// // // //                         // Update Learner Stats
// // // //                         if (lStatsMap[learnerId]) {
// // // //                             lStatsMap[learnerId].totalAssessments += 1;
// // // //                             if (['graded', 'moderated', 'appealed'].includes(data.status)) {
// // // //                                 lStatsMap[learnerId].completedAssessments += 1;
// // // //                             }
// // // //                             if (['facilitator_reviewed', 'returned'].includes(data.status)) {
// // // //                                 lStatsMap[learnerId].needsGrading += 1;
// // // //                             }
// // // //                         }

// // // //                         // Queue Logic
// // // //                         if (['facilitator_reviewed', 'returned'].includes(data.status)) {
// // // //                             const learner = store.learners.find(l => l.id === learnerId);
// // // //                             pTasks.push({
// // // //                                 id: docSnap.id,
// // // //                                 learnerId: learnerId,
// // // //                                 learnerName: learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner',
// // // //                                 assessmentId: data.assessmentId,
// // // //                                 title: data.title || 'Untitled Assessment',
// // // //                                 status: data.status,
// // // //                                 submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(),
// // // //                                 isReturned: data.status === 'returned',
// // // //                                 facilitatorName: data.grading?.facilitatorName || 'Facilitator',
// // // //                                 facilitatorTimeSpent: data.grading?.facilitatorTimeSpent,
// // // //                                 facilitatorStartedAt: data.grading?.facilitatorStartedAt
// // // //                             });
// // // //                         }
// // // //                         else if (['graded', 'moderated'].includes(data.status)) {
// // // //                             if (isAdmin || data.grading?.gradedBy === store.user?.uid) {
// // // //                                 if (data.grading?.assessorTimeSpent) {
// // // //                                     hTasks.push(data);
// // // //                                 }
// // // //                             }
// // // //                         }
// // // //                     }
// // // //                 });

// // // //                 pTasks.sort((a, b) => {
// // // //                     if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1;
// // // //                     return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
// // // //                 });

// // // //                 setPendingTasks(pTasks);
// // // //                 setHistoricalTasks(hTasks);
// // // //                 setLearnerStats(Object.values(lStatsMap).sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));

// // // //             } catch (err) {
// // // //                 console.error('Error fetching marking queue:', err);
// // // //             } finally {
// // // //                 setLoadingTasks(false);
// // // //             }
// // // //         };

// // // //         fetchTasksAndStats();
// // // //     }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

// // // //     const handleLogout = async () => {
// // // //         try { await signOut(auth); navigate('/login'); }
// // // //         catch (err) { console.error('Logout failed', err); }
// // // //     };

// // // //     const getFacilitatorName = (id: string) =>
// // // //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // // //     // ── 4. Time Formatting Helpers ───────────────────────────────────────────
// // // //     const formatTimeSpent = (seconds?: number) => {
// // // //         if (seconds === undefined || seconds === null || seconds === 0) return '—';
// // // //         const m = Math.floor(seconds / 60);
// // // //         if (m === 0) return '< 1m';
// // // //         const h = Math.floor(m / 60);
// // // //         if (h > 0) {
// // // //             const remM = m % 60;
// // // //             return `${h}h ${remM}m`;
// // // //         }
// // // //         return `${m}m`;
// // // //     };

// // // //     const formatCalendarSpread = (startStr?: string, endStr?: string) => {
// // // //         if (!startStr || !endStr) return null;
// // // //         const start = new Date(startStr).getTime();
// // // //         const end = new Date(endStr).getTime();
// // // //         const diffHours = (end - start) / (1000 * 60 * 60);

// // // //         if (diffHours < 24) {
// // // //             if (diffHours < 1) return '< 1 hr';
// // // //             return `${Math.floor(diffHours)} hrs`;
// // // //         }
// // // //         return `${Math.floor(diffHours / 24)} days`;
// // // //     };

// // // //     // ── 5. Analytics Math ────────────────────────────────────────────────────
// // // //     const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent !== undefined && t.facilitatorTimeSpent > 0);
// // // //     const avgFacilitatorTime = facTasksWithTime.length > 0
// // // //         ? facTasksWithTime.reduce((sum, task) => sum + (task.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length
// // // //         : 0;

// // // //     const avgAssessorTime = historicalTasks.length > 0
// // // //         ? historicalTasks.reduce((sum, task) => sum + (task.grading.assessorTimeSpent || 0), 0) / historicalTasks.length
// // // //         : 0;

// // // //     const pageTitle: Record<string, string> = {
// // // //         dashboard: 'Assessor Marking Centre',
// // // //         cohorts: 'My Assigned Classes',
// // // //         profile: 'Assessor Compliance Profile',
// // // //     };

// // // //     const filteredLearners = useMemo(() => {
// // // //         if (!searchTerm) return learnerStats;
// // // //         const term = searchTerm.toLowerCase();
// // // //         return learnerStats.filter(l =>
// // // //             l.fullName.toLowerCase().includes(term) ||
// // // //             l.idNumber.toLowerCase().includes(term) ||
// // // //             l.cohortName.toLowerCase().includes(term)
// // // //         );
// // // //     }, [learnerStats, searchTerm]);

// // // //     return (
// // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
// // // //             <Sidebar
// // // //                 role={store.user?.role}
// // // //                 currentNav={currentNav}
// // // //                 setCurrentNav={setCurrentNav as any}
// // // //                 onLogout={handleLogout}
// // // //             />

// // // //             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>

// // // //                 <PageHeader
// // // //                     title={pageTitle[currentNav]}
// // // //                     eyebrow="Assessor Portal"
// // // //                     description={`Practitioner: ${store.user?.fullName || 'Unknown User'}${isAdmin ? ' (Admin Bypass Active)' : ''}`}
// // // //                 />

// // // //                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

// // // //                     {/* ── Diagnostic console ── */}
// // // //                     {showDiagnostics && (
// // // //                         <div className="ad-diagnostic ad-animate">
// // // //                             <h4 className="ad-diagnostic__heading">
// // // //                                 <Info size={14} /> System Identity Bridge
// // // //                             </h4>
// // // //                             <div className="ad-diagnostic__grid">
// // // //                                 <div className="ad-diagnostic__item">
// // // //                                     <span className="ad-diagnostic__label">Auth UID</span>
// // // //                                     <code className="ad-diagnostic__code">{store.user?.uid}</code>
// // // //                                 </div>
// // // //                                 <div className="ad-diagnostic__item">
// // // //                                     <span className="ad-diagnostic__label">Staff ID</span>
// // // //                                     <code className="ad-diagnostic__code">{myStaffProfile?.id || 'Not Linked'}</code>
// // // //                                 </div>
// // // //                                 <div className="ad-diagnostic__item ad-diagnostic__item--full">
// // // //                                     <span className="ad-diagnostic__label">Assigned Cohort IDs</span>
// // // //                                     <code className="ad-diagnostic__code">
// // // //                                         {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}
// // // //                                     </code>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ════════════════════════════════════════
// // // //                         TAB 1 — MARKING QUEUE
// // // //                     ════════════════════════════════════════ */}
// // // //                     {currentNav === 'dashboard' && (
// // // //                         <div className="ad-animate" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

// // // //                             <div className="ad-metrics-row">
// // // //                                 <div className="ad-metric-card">
// // // //                                     <div className="ad-metric-icon ad-metric-icon--blue">
// // // //                                         <Layers size={24} />
// // // //                                     </div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val">{isAdmin ? 'ALL' : myCohorts.length}</span>
// // // //                                         <span className="ad-metric-lbl">Assigned Cohorts</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="ad-metric-card">
// // // //                                     <div className="ad-metric-icon ad-metric-icon--amber">
// // // //                                         <Clock size={24} />
// // // //                                     </div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val">{pendingTasks.length}</span>
// // // //                                         <span className="ad-metric-lbl">Pending Grading</span>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="ad-metric-card" style={{ borderLeftColor: '#0ea5e9' }}>
// // // //                                     <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}>
// // // //                                         <Activity size={24} />
// // // //                                     </div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val" style={{ fontSize: '1.5rem', marginTop: '5px' }}>{formatTimeSpent(avgFacilitatorTime)}</span>
// // // //                                         <span className="ad-metric-lbl">Incoming: Avg Pre-Mark</span>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="ad-metric-card" style={{ borderLeftColor: '#ef4444' }}>
// // // //                                     <div className="ad-metric-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
// // // //                                         <Timer size={24} />
// // // //                                     </div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val" style={{ fontSize: '1.5rem', marginTop: '5px', color: '#ef4444' }}>{formatTimeSpent(avgAssessorTime)}</span>
// // // //                                         <span className="ad-metric-lbl">My Avg Marking Pace</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* Queue panel */}
// // // //                             <div className="ad-panel" style={{ maxWidth: '1200px' }}>
// // // //                                 <div className="ad-panel-header">
// // // //                                     <h2 className="ad-panel-title">
// // // //                                         <PenTool size={16} /> Urgent Marking Queue
// // // //                                     </h2>
// // // //                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
// // // //                                 </div>

// // // //                                 {loadingTasks ? (
// // // //                                     <div className="ad-state-box">
// // // //                                         <div className="ad-spinner" />
// // // //                                         Loading marking tasks…
// // // //                                     </div>
// // // //                                 ) : pendingTasks.length === 0 ? (
// // // //                                     <div className="ad-state-box">
// // // //                                         <CheckCircle size={44} color="var(--mlab-green)" />
// // // //                                         <span className="ad-state-box__title">All Caught Up</span>
// // // //                                         <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
// // // //                                         {!isAdmin && myCohortIds.length === 0 && (
// // // //                                             <p className="ad-state-box__warn">
// // // //                                                 You are not assigned to any cohorts. Contact an administrator.
// // // //                                             </p>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 ) : (
// // // //                                     <div className="ad-task-list">
// // // //                                         {pendingTasks.map(task => (
// // // //                                             <div
// // // //                                                 key={task.id}
// // // //                                                 className={`ad-task-card${task.isReturned ? ' returned' : ''}`}
// // // //                                             >
// // // //                                                 <div className="ad-task-info">
// // // //                                                     <div className="ad-task-header">
// // // //                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
// // // //                                                         {task.isReturned && (
// // // //                                                             <span className="ad-task-tag danger">Mod. Returned</span>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                     <p className="ad-task-title" style={{ marginBottom: '8px' }}>
// // // //                                                         <FileText size={13} /> {task.title}
// // // //                                                     </p>
// // // //                                                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // // //                                                         <p className="ad-task-date">
// // // //                                                             <User size={12} color="#0284c7" />
// // // //                                                             Pre-Marked by <strong>{task.facilitatorName}</strong>
// // // //                                                         </p>
// // // //                                                         <p className="ad-task-date">
// // // //                                                             <Clock size={12} color="#64748b" />
// // // //                                                             Waiting since: {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: "2-digit", minute: "2-digit", })}
// // // //                                                         </p>
// // // //                                                         {task.facilitatorTimeSpent !== undefined && (
// // // //                                                             <p className="ad-task-date" style={{ color: '#073f4e', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
// // // //                                                                 <Activity size={11} />
// // // //                                                                 <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
// // // //                                                                 {task.facilitatorStartedAt && ` (${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread)`}
// // // //                                                             </p>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 </div>
// // // //                                                 <div style={{ display: 'flex', gap: '10px' }}>
// // // //                                                     <button
// // // //                                                         className="mlab-btn mlab-btn--ghost mlab-btn--sm"
// // // //                                                         onClick={() => navigate(`/portfolio/${task.learnerId}`)}
// // // //                                                         title="View Full Portfolio"
// // // //                                                     >
// // // //                                                         <Layers size={13} />
// // // //                                                     </button>
// // // //                                                     <button
// // // //                                                         className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`}
// // // //                                                         onClick={() => navigate(`/portfolio/submission/${task.id}`)}
// // // //                                                     >
// // // //                                                         {task.isReturned
// // // //                                                             ? <><AlertTriangle size={13} /> Fix Return</>
// // // //                                                             : <><PenTool size={13} /> Grade Now</>
// // // //                                                         }
// // // //                                                     </button>
// // // //                                                 </div>
// // // //                                             </div>
// // // //                                         ))}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>

// // // //                             {/* Learner Overview Panel */}
// // // //                             <div className="ad-panel" style={{ maxWidth: '1200px' }}>
// // // //                                 <div className="ad-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
// // // //                                     <h2 className="ad-panel-title">
// // // //                                         <Users size={16} /> Learner Progress Overview
// // // //                                     </h2>
// // // //                                     <div className="mlab-search" style={{ margin: 0, minWidth: '250px' }}>
// // // //                                         <Search size={14} color="var(--mlab-grey)" />
// // // //                                         <input
// // // //                                             type="text"
// // // //                                             placeholder="Search learners..."
// // // //                                             value={searchTerm}
// // // //                                             onChange={e => setSearchTerm(e.target.value)}
// // // //                                             style={{ background: 'transparent', border: 'none', outline: 'none', paddingLeft: '8px', fontSize: '0.85rem', width: '100%' }}
// // // //                                         />
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="mlab-table-wrap">
// // // //                                     <table className="mlab-table">
// // // //                                         <thead>
// // // //                                             <tr>
// // // //                                                 <th>Learner Name</th>
// // // //                                                 <th>ID Number</th>
// // // //                                                 <th>Assigned Class</th>
// // // //                                                 <th>Assessor Progress</th>
// // // //                                                 <th style={{ textAlign: 'right' }}>Actions</th>
// // // //                                             </tr>
// // // //                                         </thead>
// // // //                                         <tbody>
// // // //                                             {filteredLearners.length === 0 ? (
// // // //                                                 <tr>
// // // //                                                     <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--mlab-grey)' }}>
// // // //                                                         No learners found in your assigned cohorts.
// // // //                                                     </td>
// // // //                                                 </tr>
// // // //                                             ) : (
// // // //                                                 filteredLearners.map(l => (
// // // //                                                     <tr key={l.id}>
// // // //                                                         <td>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                                                 <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--mlab-blue-light)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
// // // //                                                                     {l.fullName.charAt(0)}
// // // //                                                                 </div>
// // // //                                                                 <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{l.fullName}</span>
// // // //                                                                 {l.needsGrading > 0 && (
// // // //                                                                     <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold' }}>
// // // //                                                                         {l.needsGrading} To Grade
// // // //                                                                     </span>
// // // //                                                                 )}
// // // //                                                             </div>
// // // //                                                         </td>
// // // //                                                         <td><span style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>{l.idNumber}</span></td>
// // // //                                                         <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>{l.cohortName}</span></td>
// // // //                                                         <td>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                                                 <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// // // //                                                                     <div
// // // //                                                                         style={{
// // // //                                                                             height: '100%',
// // // //                                                                             background: l.completedAssessments === l.totalAssessments && l.totalAssessments > 0 ? 'var(--mlab-green)' : 'var(--mlab-blue)',
// // // //                                                                             width: `${l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0}%`
// // // //                                                                         }}
// // // //                                                                     />
// // // //                                                                 </div>
// // // //                                                                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', minWidth: '40px' }}>
// // // //                                                                     {l.completedAssessments} / {l.totalAssessments}
// // // //                                                                 </span>
// // // //                                                             </div>
// // // //                                                         </td>
// // // //                                                         <td style={{ textAlign: 'right' }}>
// // // //                                                             <button
// // // //                                                                 className="mlab-btn mlab-btn--ghost mlab-btn--sm"
// // // //                                                                 onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}
// // // //                                                             >
// // // //                                                                 View PoE <ChevronRight size={14} />
// // // //                                                             </button>
// // // //                                                         </td>
// // // //                                                     </tr>
// // // //                                                 ))
// // // //                                             )}
// // // //                                         </tbody>
// // // //                                     </table>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ════════════════════════════════════════
// // // //                         TAB 2 — MY COHORTS
// // // //                     ════════════════════════════════════════ */}
// // // //                     {currentNav === 'cohorts' && (
// // // //                         <div className="ad-animate">
// // // //                             <h2 className="ad-section-title">
// // // //                                 <Layers size={16} /> Assigned Cohorts
// // // //                             </h2>

// // // //                             <div className="ad-cohort-grid">
// // // //                                 {myCohorts.map(cohort => (
// // // //                                     <div key={cohort.id} className="ad-cohort-card">
// // // //                                         <div className="ad-cohort-card__header">
// // // //                                             <h3 className="ad-cohort-card__name">{cohort.name}</h3>
// // // //                                             <span className="ad-badge ad-badge--active">Assessing</span>
// // // //                                         </div>

// // // //                                         <div className="ad-cohort-card__dates">
// // // //                                             <Calendar size={13} />
// // // //                                             {cohort.startDate} — {cohort.endDate}
// // // //                                         </div>

// // // //                                         <div className="ad-cohort-card__roles">
// // // //                                             <div className="ad-role-row">
// // // //                                                 <div className="ad-role-dot ad-role-dot--blue" />
// // // //                                                 <span className="ad-role-label">Facilitator:</span>
// // // //                                                 <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
// // // //                                             </div>
// // // //                                         </div>

// // // //                                         <div className="ad-cohort-card__footer">
// // // //                                             <button
// // // //                                                 className="ad-portfolio-btn"
// // // //                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
// // // //                                             >
// // // //                                                 View Portfolios <ArrowRight size={13} />
// // // //                                             </button>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 ))}

// // // //                                 {myCohorts.length === 0 && (
// // // //                                     <div className="ad-empty">
// // // //                                         <div className="ad-empty__icon"><Layers size={44} color="var(--mlab-green)" /></div>
// // // //                                         <span className="ad-empty__title">No Cohorts Assigned</span>
// // // //                                         <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
// // // //                                         <button
// // // //                                             className="ad-empty__link"
// // // //                                             onClick={() => setShowDiagnostics(true)}
// // // //                                         >
// // // //                                             Run ID Diagnostics
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ════════════════════════════════════════
// // // //                         TAB 3 — PROFILE
// // // //                     ════════════════════════════════════════ */}
// // // //                     {currentNav === 'profile' && (
// // // //                         <AssessorProfileView
// // // //                             profile={store.user}
// // // //                             user={store.user}
// // // //                             onUpdate={store.updateStaffProfile}
// // // //                         />
// // // //                     )}

// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };