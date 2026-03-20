import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, ShieldCheck,
    CheckCircle, FileText,
    Layers, Info, Award, Clock, Activity
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import PageHeader from '../../../components/common/PageHeader/PageHeader';

import './ModeratorDashboard.css';
import { ModeratorProfileView } from '../ModeratorProfileView/ModeratorProfileView';

interface PendingQATask {
    id: string;
    learnerId: string;
    learnerName: string;
    assessmentId: string;
    title: string;
    status: string;
    gradedAt: string;
    assessorName: string;
    assessorTimeSpent?: number;
    assessorStartedAt?: string;
}

export const ModeratorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<PendingQATask[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);

    // ── 1. Initial data sync ─────────────────────────────────────────────────
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, []);

    // ── 2. ID bridge logic ───────────────────────────────────────────────────
    const myStaffProfile = store.staff.find(s =>
        s.authUid === store.user?.uid ||
        s.email === store.user?.email ||
        s.id === store.user?.uid
    );

    const myCohorts = store.cohorts.filter(c =>
        c.moderatorId === store.user?.uid ||
        c.moderatorId === myStaffProfile?.id ||
        (c as any).moderatorEmail === store.user?.email
    );

    const myCohortIds = myCohorts.map(c => c.id);
    const isAdmin = store.user?.role === 'admin';

    // ── 3. QA Queue (Only fetches 'graded' scripts) ──────────────────────────
    useEffect(() => {
        const fetchTasks = async () => {
            if (!store.user?.uid) return;
            if (store.cohorts.length === 0) return;

            if (!isAdmin && myCohortIds.length === 0) {
                console.warn('Moderator has no cohorts assigned — queue will be empty.');
                setLoadingTasks(false);
                return;
            }

            try {
                // Moderators ONLY review scripts that have been officially 'graded' by an Assessor
                const snap = await getDocs(query(
                    collection(db, 'learner_submissions'),
                    where('status', '==', 'graded')
                ));

                const tasks: PendingQATask[] = [];

                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const learner = store.learners.find(l => l.id === data.learnerId);
                    const subCohortId = data.cohortId || learner?.cohortId;
                    const learnerName = learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner';

                    if (isAdmin || (subCohortId && myCohortIds.includes(subCohortId))) {
                        tasks.push({
                            id: docSnap.id,
                            learnerId: data.learnerId,
                            learnerName,
                            assessmentId: data.assessmentId,
                            title: data.title || 'Untitled Assessment',
                            status: data.status,
                            gradedAt: data.grading?.gradedAt || new Date().toISOString(),
                            assessorName: data.grading?.assessorName || 'Unknown Assessor',
                            assessorTimeSpent: data.grading?.assessorTimeSpent,
                            assessorStartedAt: data.grading?.assessorStartedAt
                        });
                    }
                });

                // Oldest graded scripts first
                tasks.sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime());

                setPendingTasks(tasks);
            } catch (err) {
                console.error('Error fetching QA queue:', err);
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

    const getAssessorName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const formatTimeSpent = (seconds?: number) => {
        if (seconds === undefined || seconds === null) return '—';
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

    // Calculate Average Assessor Processing Time
    const avgAssessorTime = pendingTasks.length > 0
        ? pendingTasks.reduce((sum, task) => sum + (task.assessorTimeSpent || 0), 0) / pendingTasks.length
        : 0;

    const pageTitle: Record<string, string> = {
        dashboard: 'Internal QA Moderation Centre',
        cohorts: 'My Assigned QA Classes',
        profile: 'Moderator Compliance Profile',
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
                    eyebrow="Moderator Portal"
                    description={`Practitioner: ${store.user?.fullName || 'Unknown User'}${isAdmin ? ' (Admin Bypass Active)' : ''}`}
                />

                <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

                    {/* ── Diagnostic console ── */}
                    {showDiagnostics && (
                        <div className="md-diagnostic md-animate">
                            <h4 className="md-diagnostic__heading">
                                <Info size={14} /> System Identity Bridge
                            </h4>
                            <div className="md-diagnostic__grid">
                                <div className="md-diagnostic__item">
                                    <span className="md-diagnostic__label">Auth UID</span>
                                    <code className="md-diagnostic__code">{store.user?.uid}</code>
                                </div>
                                <div className="md-diagnostic__item">
                                    <span className="md-diagnostic__label">Staff ID</span>
                                    <code className="md-diagnostic__code">{myStaffProfile?.id || 'Not Linked'}</code>
                                </div>
                                <div className="md-diagnostic__item md-diagnostic__item--full">
                                    <span className="md-diagnostic__label">Assigned Cohort IDs</span>
                                    <code className="md-diagnostic__code">
                                        {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════
                        TAB 1 — QA QUEUE
                    ════════════════════════════════════════ */}
                    {currentNav === 'dashboard' && (
                        <div className="md-animate">

                            {/* Metrics */}
                            <div className="md-metrics-row">
                                <div className="md-metric-card">
                                    <div className="md-metric-icon md-metric-icon--blue">
                                        <Layers size={24} />
                                    </div>
                                    <div className="md-metric-data">
                                        <span className="md-metric-val">{isAdmin ? 'ALL' : myCohorts.length}</span>
                                        <span className="md-metric-lbl">QA Cohorts</span>
                                    </div>
                                </div>
                                <div className="md-metric-card">
                                    <div className="md-metric-icon md-metric-icon--amber">
                                        <ShieldCheck size={24} />
                                    </div>
                                    <div className="md-metric-data">
                                        <span className="md-metric-val">{pendingTasks.length}</span>
                                        <span className="md-metric-lbl">Pending Moderation</span>
                                    </div>
                                </div>
                                <div className="md-metric-card" style={{ borderLeftColor: '#073f4e' }}>
                                    <div className="md-metric-icon" style={{ background: '#e2e8f0', color: '#073f4e' }}>
                                        <Activity size={24} />
                                    </div>
                                    <div className="md-metric-data">
                                        <span className="md-metric-val" style={{ fontSize: '1.5rem', marginTop: '5px' }}>{formatTimeSpent(avgAssessorTime)}</span>
                                        <span className="md-metric-lbl">Avg Assessor Marking Time</span>
                                    </div>
                                </div>
                            </div>

                            {/* Queue panel */}
                            <div className="md-panel" style={{ maxWidth: '1000px' }}>
                                <div className="md-panel-header">
                                    <h2 className="md-panel-title">
                                        <ShieldCheck size={16} /> Moderation Queue
                                    </h2>
                                    <span className="md-panel-badge">{pendingTasks.length} items</span>
                                </div>

                                {loadingTasks ? (
                                    <div className="md-state-box">
                                        <div className="md-spinner" />
                                        Loading QA tasks…
                                    </div>
                                ) : pendingTasks.length === 0 ? (
                                    <div className="md-state-box">
                                        <CheckCircle size={44} color="var(--mlab-green)" />
                                        <span className="md-state-box__title">QA Caught Up</span>
                                        <p className="md-state-box__sub">No graded submissions are waiting for your verification.</p>
                                        {!isAdmin && myCohortIds.length === 0 && (
                                            <p className="md-state-box__warn">
                                                You are not assigned to any cohorts as a Moderator. Contact an administrator.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="md-task-list">
                                        {pendingTasks.map(task => (
                                            <div key={task.id} className="md-task-card">
                                                <div className="md-task-info">
                                                    <div className="md-task-header">
                                                        <h4 className="md-task-learner">{task.learnerName}</h4>
                                                    </div>
                                                    <p className="md-task-title" style={{ marginBottom: '8px' }}>
                                                        <FileText size={13} /> {task.title}
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                        <p className="md-task-date">
                                                            <Award size={12} color="var(--mlab-red)" />
                                                            Graded by <strong>{task.assessorName}</strong>
                                                        </p>
                                                        <p className="md-task-date">
                                                            <Clock size={12} color="#64748b" />
                                                            {new Date(task.gradedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </p>
                                                        {task.assessorTimeSpent !== undefined && (
                                                            <p className="md-task-date" style={{ color: '#073f4e', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                                                <Activity size={11} />
                                                                <strong>{formatTimeSpent(task.assessorTimeSpent)}</strong> active
                                                                {task.assessorStartedAt && ` (${formatCalendarSpread(task.assessorStartedAt, task.gradedAt)} spread)`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    className="md-grade-btn"
                                                    onClick={() => navigate(`/portfolio/submission/${task.id}`)}
                                                >
                                                    <ShieldCheck size={13} /> Perform QA
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
                        <div className="md-animate">
                            <h2 className="md-section-title">
                                <Layers size={16} /> Assigned QA Cohorts
                            </h2>

                            <div className="md-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="md-cohort-card">
                                        <div className="md-cohort-card__header">
                                            <h3 className="md-cohort-card__name">{cohort.name}</h3>
                                            <span className="md-badge md-badge--active">QA Active</span>
                                        </div>

                                        <div className="md-cohort-card__dates">
                                            <Calendar size={13} />
                                            {cohort.startDate} — {cohort.endDate}
                                        </div>

                                        <div className="md-cohort-card__roles">
                                            <div className="md-role-row">
                                                <div className="md-role-dot md-role-dot--red" />
                                                <span className="md-role-label">Assessor:</span>
                                                <span className="md-role-name" style={{ color: 'var(--mlab-red)' }}>{getAssessorName(cohort.assessorId)}</span>
                                            </div>
                                        </div>

                                        <div className="md-cohort-card__footer">
                                            <button
                                                className="md-portfolio-btn"
                                                onClick={() => navigate(`/cohorts/${cohort.id}`)}
                                            >
                                                View Portfolios <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {myCohorts.length === 0 && (
                                    <div className="md-empty">
                                        <div className="md-empty__icon"><Layers size={44} color="var(--mlab-green)" /></div>
                                        <span className="md-empty__title">No Cohorts Assigned</span>
                                        <p className="md-empty__sub">No cohorts were found linked to your QA account.</p>
                                        <button
                                            className="md-empty__link"
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
                        <ModeratorProfileView
                            user={store.user}
                            onUpdate={store.updateStaffProfile}
                        />
                    )}

                </div>
            </main>
        </div>
    );
};

