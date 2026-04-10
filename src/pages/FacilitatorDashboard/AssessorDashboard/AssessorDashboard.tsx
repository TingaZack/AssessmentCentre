// src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, PenTool,
    Clock, CheckCircle, AlertTriangle, FileText,
    Layers, Info, User, Activity, Timer
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import './AssessorDashboard.css';
import PageHeader from '../../../components/common/PageHeader/PageHeader';
import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';

interface PendingTask {
    id: string;
    learnerId: string;
    learnerName: string;
    assessmentId: string;
    title: string;
    status: string;
    submittedAt: string;
    isReturned: boolean;
    facilitatorName: string;
    facilitatorTimeSpent?: number;
    facilitatorStartedAt?: string;
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

    const [loadingTasks, setLoadingTasks] = useState(true);

    // ── Initial data sync ─────────────────────────────────────────────────
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, []);

    // ── ID bridge logic ───────────────────────────────────────────────────
    const myStaffProfile = store.staff.find(s =>
        s.authUid === store.user?.uid ||
        s.email === store.user?.email ||
        s.id === store.user?.uid
    );

    const myCohorts = store.cohorts.filter(c =>
        c.assessorId === store.user?.uid ||
        c.assessorId === myStaffProfile?.id ||
        c.assessorEmail === store.user?.email
    );

    const myCohortIds = myCohorts.map(c => c.id);
    const isAdmin = store.user?.role === 'admin';

    // ── Marking Queue & Historical Data ───────────────────────────────────
    useEffect(() => {
        const fetchTasks = async () => {
            if (!store.user?.uid) return;
            if (store.cohorts.length === 0) return;

            if (!isAdmin && myCohortIds.length === 0) {
                console.warn('Assessor has no cohorts assigned — queue will be empty.');
                setLoadingTasks(false);
                return;
            }

            try {
                // Query BOTH pending and completed scripts in one go
                const snap = await getDocs(query(
                    collection(db, 'learner_submissions'),
                    where('status', 'in', ['facilitator_reviewed', 'returned', 'graded', 'moderated'])
                ));

                const pTasks: PendingTask[] = [];
                const hTasks: any[] = [];

                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const learner = store.learners.find(l => l.id === data.learnerId);
                    const subCohortId = data.cohortId || learner?.cohortId;
                    const learnerName = learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner';

                    if (isAdmin || (subCohortId && myCohortIds.includes(subCohortId))) {

                        // 1. If it's pending review or returned, it goes into the To-Do Queue
                        if (['facilitator_reviewed', 'returned'].includes(data.status)) {
                            pTasks.push({
                                id: docSnap.id,
                                learnerId: data.learnerId,
                                learnerName,
                                assessmentId: data.assessmentId,
                                title: data.title || 'Untitled Assessment',
                                status: data.status,
                                submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(),
                                isReturned: data.status === 'returned',
                                facilitatorName: data.grading?.facilitatorName || 'Facilitator',
                                facilitatorTimeSpent: data.grading?.facilitatorTimeSpent,
                                facilitatorStartedAt: data.grading?.facilitatorStartedAt
                            });
                        }

                        // 2. If it's already graded, check if THIS assessor graded it, and save for historical math
                        else if (['graded', 'moderated'].includes(data.status)) {
                            if (isAdmin || data.grading?.gradedBy === store.user?.uid) {
                                if (data.grading?.assessorTimeSpent) {
                                    hTasks.push(data);
                                }
                            }
                        }
                    }
                });

                pTasks.sort((a, b) => {
                    if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1;
                    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
                });

                setPendingTasks(pTasks);
                setHistoricalTasks(hTasks);
            } catch (err) {
                console.error('Error fetching marking queue:', err);
            } finally {
                setLoadingTasks(false);
            }
        };

        fetchTasks();
    }, [store.user?.uid, myCohortIds.length, store.cohorts.length, isAdmin]);

    const handleLogout = async () => {
        try { await signOut(auth); navigate('/login'); }
        catch (err) { console.error('Logout failed', err); }
    };

    const getFacilitatorName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    // ── 4. Time Formatting Helpers ───────────────────────────────────────────
    const formatTimeSpent = (seconds?: number) => {
        if (seconds === undefined || seconds === null || seconds === 0) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        if (h > 0) {
            const remM = m % 60;
            return `${h}h ${remM}m`;
        }
        return `${m}m`;
    };

    const formatCalendarSpread = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return null;
        const start = new Date(startStr).getTime();
        const end = new Date(endStr).getTime();
        const diffHours = (end - start) / (1000 * 60 * 60);

        if (diffHours < 24) {
            if (diffHours < 1) return '< 1 hr';
            return `${Math.floor(diffHours)} hrs`;
        }
        return `${Math.floor(diffHours / 24)} days`;
    };

    // ── 5. Analytics Math ────────────────────────────────────────────────────

    // Average Incoming Time (Facilitator's effort on current pending tasks)
    const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent !== undefined && t.facilitatorTimeSpent > 0);
    const avgFacilitatorTime = facTasksWithTime.length > 0
        ? facTasksWithTime.reduce((sum, task) => sum + (task.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length
        : 0;

    // Average Historical Time (Assessor's own historical pace on completed tasks)
    const avgAssessorTime = historicalTasks.length > 0
        ? historicalTasks.reduce((sum, task) => sum + (task.grading.assessorTimeSpent || 0), 0) / historicalTasks.length
        : 0;

    const pageTitle: Record<string, string> = {
        dashboard: 'Assessor Marking Centre',
        cohorts: 'My Assigned Classes',
        profile: 'Assessor Compliance Profile',
    };

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
            <Sidebar
                role={store.user?.role}
                currentNav={currentNav}
                setCurrentNav={setCurrentNav as any}
                onLogout={handleLogout}
            />

            <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>

                <PageHeader
                    title={pageTitle[currentNav]}
                    eyebrow="Assessor Portal"
                    description={`Practitioner: ${store.user?.fullName || 'Unknown User'}${isAdmin ? ' (Admin Bypass Active)' : ''}`}
                />

                <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

                    {/* ── Diagnostic console ── */}
                    {showDiagnostics && (
                        <div className="ad-diagnostic ad-animate">
                            <h4 className="ad-diagnostic__heading">
                                <Info size={14} /> System Identity Bridge
                            </h4>
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
                                    <code className="ad-diagnostic__code">
                                        {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════
                        TAB 1 — MARKING QUEUE
                    ════════════════════════════════════════ */}
                    {currentNav === 'dashboard' && (
                        <div className="ad-animate">

                            <div className="ad-metrics-row">
                                <div className="ad-metric-card">
                                    <div className="ad-metric-icon ad-metric-icon--blue">
                                        <Layers size={24} />
                                    </div>
                                    <div className="ad-metric-data">
                                        <span className="ad-metric-val">{isAdmin ? 'ALL' : myCohorts.length}</span>
                                        <span className="ad-metric-lbl">Assigned Cohorts</span>
                                    </div>
                                </div>
                                <div className="ad-metric-card">
                                    <div className="ad-metric-icon ad-metric-icon--amber">
                                        <Clock size={24} />
                                    </div>
                                    <div className="ad-metric-data">
                                        <span className="ad-metric-val">{pendingTasks.length}</span>
                                        <span className="ad-metric-lbl">Pending Grading</span>
                                    </div>
                                </div>

                                {/* Incoming Time (Facilitator) */}
                                <div className="ad-metric-card" style={{ borderLeftColor: '#0ea5e9' }}>
                                    <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}>
                                        <Activity size={24} />
                                    </div>
                                    <div className="ad-metric-data">
                                        <span className="ad-metric-val" style={{ fontSize: '1.5rem', marginTop: '5px' }}>{formatTimeSpent(avgFacilitatorTime)}</span>
                                        <span className="ad-metric-lbl">Incoming: Avg Pre-Mark</span>
                                    </div>
                                </div>

                                {/* Historical Time (Assessor's Own Pace) */}
                                <div className="ad-metric-card" style={{ borderLeftColor: '#ef4444' }}>
                                    <div className="ad-metric-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                                        <Timer size={24} />
                                    </div>
                                    <div className="ad-metric-data">
                                        <span className="ad-metric-val" style={{ fontSize: '1.5rem', marginTop: '5px', color: '#ef4444' }}>{formatTimeSpent(avgAssessorTime)}</span>
                                        <span className="ad-metric-lbl">My Avg Marking Pace</span>
                                    </div>
                                </div>
                            </div>

                            {/* Queue panel */}
                            <div className="ad-panel" style={{ maxWidth: '1000px' }}>
                                <div className="ad-panel-header">
                                    <h2 className="ad-panel-title">
                                        <PenTool size={16} /> Marking Queue
                                    </h2>
                                    <span className="ad-panel-badge">{pendingTasks.length} items</span>
                                </div>

                                {loadingTasks ? (
                                    <div className="ad-state-box">
                                        <div className="ad-spinner" />
                                        Loading marking tasks…
                                    </div>
                                ) : pendingTasks.length === 0 ? (
                                    <div className="ad-state-box">
                                        <CheckCircle size={44} color="var(--mlab-green)" />
                                        <span className="ad-state-box__title">All Caught Up</span>
                                        <p className="ad-state-box__sub">No submissions are waiting for your review.</p>
                                        {!isAdmin && myCohortIds.length === 0 && (
                                            <p className="ad-state-box__warn">
                                                You are not assigned to any cohorts. Contact an administrator.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="ad-task-list">
                                        {pendingTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={`ad-task-card${task.isReturned ? ' returned' : ''}`}
                                            >
                                                <div className="ad-task-info">
                                                    <div className="ad-task-header">
                                                        <h4 className="ad-task-learner">{task.learnerName}</h4>
                                                        {task.isReturned && (
                                                            <span className="ad-task-tag danger">Mod. Returned</span>
                                                        )}
                                                    </div>
                                                    <p className="ad-task-title" style={{ marginBottom: '8px' }}>
                                                        <FileText size={13} /> {task.title}
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                        <p className="ad-task-date">
                                                            <User size={12} color="#0284c7" />
                                                            Pre-Marked by <strong>{task.facilitatorName}</strong>
                                                        </p>
                                                        <p className="ad-task-date">
                                                            <Clock size={12} color="#64748b" />
                                                            Waiting since: {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: "2-digit", minute: "2-digit", })}
                                                        </p>
                                                        {task.facilitatorTimeSpent !== undefined && (
                                                            <p className="ad-task-date" style={{ color: '#073f4e', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                                                <Activity size={11} />
                                                                <strong>{formatTimeSpent(task.facilitatorTimeSpent)}</strong> active
                                                                {task.facilitatorStartedAt && ` (${formatCalendarSpread(task.facilitatorStartedAt, task.submittedAt)} spread)`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    className={`ad-grade-btn${task.isReturned ? ' fix' : ''}`}
                                                    onClick={() => navigate(`/portfolio/submission/${task.id}`)}
                                                >
                                                    {task.isReturned
                                                        ? <><AlertTriangle size={13} /> Fix Return</>
                                                        : <><PenTool size={13} /> Grade Now</>
                                                    }
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════
                        TAB 2 — MY COHORTS
                    ════════════════════════════════════════ */}
                    {currentNav === 'cohorts' && (
                        <div className="ad-animate">
                            <h2 className="ad-section-title">
                                <Layers size={16} /> Assigned Cohorts
                            </h2>

                            <div className="ad-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="ad-cohort-card">
                                        <div className="ad-cohort-card__header">
                                            <h3 className="ad-cohort-card__name">{cohort.name}</h3>
                                            <span className="ad-badge ad-badge--active">Assessing</span>
                                        </div>

                                        <div className="ad-cohort-card__dates">
                                            <Calendar size={13} />
                                            {cohort.startDate} — {cohort.endDate}
                                        </div>

                                        <div className="ad-cohort-card__roles">
                                            <div className="ad-role-row">
                                                <div className="ad-role-dot ad-role-dot--blue" />
                                                <span className="ad-role-label">Facilitator:</span>
                                                <span className="ad-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
                                            </div>
                                        </div>

                                        <div className="ad-cohort-card__footer">
                                            <button
                                                className="ad-portfolio-btn"
                                                onClick={() => navigate(`/cohorts/${cohort.id}`)}
                                            >
                                                View Portfolios <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {myCohorts.length === 0 && (
                                    <div className="ad-empty">
                                        <div className="ad-empty__icon"><Layers size={44} color="var(--mlab-green)" /></div>
                                        <span className="ad-empty__title">No Cohorts Assigned</span>
                                        <p className="ad-empty__sub">No cohorts were found linked to your account IDs.</p>
                                        <button
                                            className="ad-empty__link"
                                            onClick={() => setShowDiagnostics(true)}
                                        >
                                            Run ID Diagnostics
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════
                        TAB 3 — PROFILE
                    ════════════════════════════════════════ */}
                    {currentNav === 'profile' && (
                        <AssessorProfileView
                            profile={store.user}
                            user={store.user}
                            onUpdate={store.updateStaffProfile}
                        />
                    )}

                </div>
            </main>
        </div>
    );
};
