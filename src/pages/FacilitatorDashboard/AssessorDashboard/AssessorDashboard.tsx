// src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx
// mLab CI v2.1 — matches ViewPortfolio.css aesthetic

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, PenTool,
    Clock, CheckCircle, AlertTriangle, FileText,
    Layers, Terminal, Info,
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
import './AssessorDashboard.css';
import PageHeader from '../../../components/common/PageHeader/PageHeader';

interface PendingTask {
    id: string;
    learnerId: string;
    learnerName: string;
    assessmentId: string;
    title: string;
    status: string;
    submittedAt: string;
    isReturned: boolean;
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
        c.assessorId === store.user?.uid ||
        c.assessorId === myStaffProfile?.id ||
        c.assessorEmail === store.user?.email
    );

    const myCohortIds = myCohorts.map(c => c.id);
    const isAdmin = store.user?.role === 'admin';

    // ── 3. Marking queue ─────────────────────────────────────────────────────
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
                const snap = await getDocs(query(
                    collection(db, 'learner_submissions'),
                    where('status', 'in', ['facilitator_reviewed', 'returned'])
                ));

                const tasks: PendingTask[] = [];

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
                            submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(),
                            isReturned: data.status === 'returned',
                        });
                    }
                });

                tasks.sort((a, b) => {
                    if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1;
                    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
                });

                setPendingTasks(tasks);
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

                {/* ── Header ── */}
                {/* <header className="ad-header">
                    <div>
                        <h1 className="ad-header__title">{pageTitle[currentNav]}</h1>
                        <p className="ad-header__sub">
                            Practitioner: {store.user?.fullName}
                            {isAdmin && <span className="ad-header__sub--admin">(Admin Bypass Active)</span>}
                        </p>
                    </div>
                    <button
                        className="ad-debug-btn"
                        onClick={() => setShowDiagnostics(v => !v)}
                    >
                        <Terminal size={13} />
                        {showDiagnostics ? 'Hide Debug' : 'Debug IDs'}
                    </button>
                </header> */}
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

                            {/* Metrics */}
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
                                <div className="ad-metric-card">
                                    <div className="ad-metric-icon ad-metric-icon--red">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div className="ad-metric-data">
                                        <span className="ad-metric-val">{pendingTasks.filter(t => t.isReturned).length}</span>
                                        <span className="ad-metric-lbl">Moderator Returns</span>
                                    </div>
                                </div>
                            </div>

                            {/* Queue panel */}
                            <div className="ad-panel" style={{ maxWidth: '900px' }}>
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
                                                    <p className="ad-task-title">
                                                        <FileText size={13} /> {task.title}
                                                    </p>
                                                    <p className="ad-task-date">
                                                        <Clock size={12} />
                                                        Waiting since: {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
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


// import React, { useEffect, useState } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import {
//     Users, Calendar, ArrowRight, PenTool,
//     Clock, CheckCircle, AlertTriangle, FileText,
//     User, ShieldCheck, Layers, Terminal, Info, Loader2
// } from 'lucide-react';
// import { Sidebar } from '../../../components/dashboard/Sidebar';
// import { useStore } from '../../../store/useStore';
// import { auth, db } from '../../../lib/firebase';
// import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// import './AssessorDashboard.css';

// interface PendingTask {
//     id: string;
//     learnerId: string;
//     learnerName: string;
//     assessmentId: string;
//     title: string;
//     status: string;
//     submittedAt: string;
//     isReturned: boolean;
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
//     const [loadingTasks, setLoadingTasks] = useState(true);

//     // ─── 1. INITIAL DATA SYNC ──────────────────────────────────────────────
//     useEffect(() => {
//         store.fetchCohorts();
//         store.fetchStaff();
//         store.fetchLearners();
//     }, []);

//     // ─── 2. THE BRIDGE LOGIC (Resolving IDs) ────────────────────────────────
//     const myStaffProfile = store.staff.find(s =>
//         s.authUid === store.user?.uid ||
//         s.email === store.user?.email ||
//         s.id === store.user?.uid
//     );

//     const myCohorts = store.cohorts.filter(c => {
//         const matchByAuthUid = c.assessorId === store.user?.uid;
//         const matchByStaffId = c.assessorId === myStaffProfile?.id;
//         const matchByEmail = c.assessorEmail === store.user?.email;
//         return matchByAuthUid || matchByStaffId || matchByEmail;
//     });

//     const myCohortIds = myCohorts.map(c => c.id);
//     const isAdmin = store.user?.role === 'admin';

//     // ─── 3. MARKING QUEUE FETCHING ──────────────────────────────────────────
//     useEffect(() => {
//         const fetchTasks = async () => {
//             if (!store.user?.uid) return;

//             // Wait until cohorts are actually loaded from the store before deciding we have 0 cohorts
//             if (store.cohorts.length === 0) return;

//             if (!isAdmin && myCohortIds.length === 0) {
//                 console.warn("⚠️ Assessor has no cohorts assigned in the database. Queue will be empty.");
//                 setLoadingTasks(false);
//                 return;
//             }

//             try {
//                 const q = query(
//                     collection(db, 'learner_submissions'),
//                     where('status', 'in', ['facilitator_reviewed', 'returned'])
//                 );

//                 const snap = await getDocs(q);
//                 const tasks: PendingTask[] = [];

//                 console.log(`🔍 Found ${snap.docs.length} scripts waiting for an Assessor in the entire database.`);

//                 snap.docs.forEach(docSnap => {
//                     const data = docSnap.data();

//                     const learner = store.learners.find(l => l.id === data.learnerId);
//                     const subCohortId = data.cohortId || learner?.cohortId;
//                     const learnerName = learner?.fullName || data.learnerDeclaration?.learnerName || 'Unknown Learner';

//                     console.log(`Evaluating Script: ${docSnap.id} | Learner: ${learnerName} | Cohort: ${subCohortId}`);

//                     // Is this script assigned to ME?
//                     if (isAdmin || (subCohortId && myCohortIds.includes(subCohortId))) {
//                         console.log(`✅ MATCH! Adding ${learnerName}'s script to the queue.`);
//                         tasks.push({
//                             id: docSnap.id,
//                             learnerId: data.learnerId,
//                             learnerName: learnerName,
//                             assessmentId: data.assessmentId,
//                             title: data.title || 'Untitled Assessment',
//                             status: data.status,
//                             submittedAt: data.grading?.facilitatorReviewedAt || data.submittedAt || data.assignedAt || new Date().toISOString(),
//                             isReturned: data.status === 'returned'
//                         });
//                     } else {
//                         console.log(`❌ SKIPPED. You are not assigned to Cohort ID: ${subCohortId}`);
//                     }
//                 });

//                 tasks.sort((a, b) => {
//                     if (a.isReturned && !b.isReturned) return -1;
//                     if (!a.isReturned && b.isReturned) return 1;
//                     return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
//                 });

//                 setPendingTasks(tasks);
//             } catch (error) {
//                 console.error("Error fetching marking queue:", error);
//             } finally {
//                 setLoadingTasks(false);
//             }
//         };

//         fetchTasks();
//     }, [store.user?.uid, myCohortIds.length, store.cohorts.length, isAdmin]);

//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             navigate('/login');
//         } catch (error) {
//             console.error('Logout failed', error);
//         }
//     };

//     const getFacilitatorName = (id: string) =>
//         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
//             <Sidebar
//                 role={store.user?.role}
//                 currentNav={currentNav}
//                 setCurrentNav={setCurrentNav as any}
//                 onLogout={handleLogout}
//             />

//             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>

//                 <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e2e8f0' }}>
//                     <div className="header-title">
//                         <h1 className="ad-page-title">
//                             {currentNav === 'dashboard' && 'Assessor Marking Centre'}
//                             {currentNav === 'cohorts' && 'My Assigned Classes'}
//                             {currentNav === 'profile' && 'Assessor Compliance Profile'}
//                         </h1>
//                         <p className="ad-page-sub">Practitioner: {store.user?.fullName} {isAdmin && <span style={{ color: 'var(--mlab-red)', fontWeight: 'bold' }}>(Admin Bypass Active)</span>}</p>
//                     </div>
//                     <button
//                         className="diagnostic-trigger"
//                         onClick={() => setShowDiagnostics(!showDiagnostics)}
//                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
//                     >
//                         <Terminal size={14} /> {showDiagnostics ? 'Hide Debug' : 'Debug IDs'}
//                     </button>
//                 </header>

//                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f8fafc' }}>

//                     {/* ─── DIAGNOSTIC CONSOLE ─── */}
//                     {showDiagnostics && (
//                         <div className="diagnostic-panel animate-fade-in" style={{ background: '#0f172a', color: '#94a3b8', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', borderLeft: '5px solid #3b82f6' }}>
//                             <h4 style={{ color: 'white', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Info size={14} /> System Identity Bridge</h4>
//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
//                                 <div>
//                                     <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px' }}>Auth UID:</label>
//                                     <code style={{ background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.8rem' }}>{store.user?.uid}</code>
//                                 </div>
//                                 <div>
//                                     <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px' }}>Staff ID:</label>
//                                     <code style={{ background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.8rem' }}>{myStaffProfile?.id || 'Not Linked'}</code>
//                                 </div>
//                                 <div style={{ gridColumn: 'span 2' }}>
//                                     <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px' }}>Assigned Cohort IDs:</label>
//                                     <code style={{ background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.8rem' }}>
//                                         {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}
//                                     </code>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ─── TAB 1: DASHBOARD (MARKING QUEUE) ─── */}
//                     {currentNav === 'dashboard' && (
//                         <div className="animate-fade-in">
//                             <div className="ad-metrics-row">
//                                 <div className="ad-metric-card">
//                                     <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Layers size={24} /></div>
//                                     <div className="ad-metric-data">
//                                         <span className="ad-metric-val">{isAdmin ? 'ALL' : myCohorts.length}</span>
//                                         <span className="ad-metric-lbl">Assigned Cohorts</span>
//                                     </div>
//                                 </div>
//                                 <div className="ad-metric-card">
//                                     <div className="ad-metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Clock size={24} /></div>
//                                     <div className="ad-metric-data">
//                                         <span className="ad-metric-val">{pendingTasks.length}</span>
//                                         <span className="ad-metric-lbl">Pending Grading</span>
//                                     </div>
//                                 </div>
//                                 <div className="ad-metric-card">
//                                     <div className="ad-metric-icon" style={{ background: '#ffe4e6', color: '#e11d48' }}><AlertTriangle size={24} /></div>
//                                     <div className="ad-metric-data">
//                                         <span className="ad-metric-val">{pendingTasks.filter(t => t.isReturned).length}</span>
//                                         <span className="ad-metric-lbl">Moderator Returns</span>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="ad-panel" style={{ maxWidth: '900px' }}>
//                                 <div className="ad-panel-header">
//                                     <h2 className="ad-panel-title"><PenTool size={18} /> Marking Queue (To-Do)</h2>
//                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
//                                 </div>

//                                 {loadingTasks ? (
//                                     <div className="ad-state-box"><Loader2 className="spin" size={24} /> Loading marking tasks...</div>
//                                 ) : pendingTasks.length === 0 ? (
//                                     <div className="ad-state-box">
//                                         <CheckCircle size={40} color="#10b981" style={{ marginBottom: '1rem' }} />
//                                         <p style={{ margin: 0, fontWeight: 'bold', color: '#0f172a' }}>All caught up!</p>
//                                         <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>There are no submissions waiting for your review.</p>
//                                         {!isAdmin && myCohortIds.length === 0 && (
//                                             <p style={{ marginTop: '1rem', color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
//                                                 Note: You are not assigned to any cohorts. Contact an administrator.
//                                             </p>
//                                         )}
//                                     </div>
//                                 ) : (
//                                     <div className="ad-task-list">
//                                         {pendingTasks.map(task => (
//                                             <div key={task.id} className={`ad-task-card ${task.isReturned ? 'returned' : ''}`}>
//                                                 <div className="ad-task-info">
//                                                     <div className="ad-task-header">
//                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
//                                                         {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
//                                                     </div>
//                                                     <p className="ad-task-title"><FileText size={14} /> {task.title}</p>
//                                                     <p className="ad-task-date"><Clock size={13} /> Waiting since: {new Date(task.submittedAt).toLocaleDateString()}</p>
//                                                 </div>
//                                                 <button
//                                                     className="ad-grade-btn"
//                                                     onClick={() => navigate(`/portfolio/submission/${task.id}`)}
//                                                 >
//                                                     {task.isReturned ? <><AlertTriangle size={14} /> Fix Return</> : <><PenTool size={14} /> Grade Now</>}
//                                                 </button>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* ─── TAB 2: MY COHORTS ─── */}
//                     {currentNav === 'cohorts' && (
//                         <div className="animate-fade-in">
//                             <h2 className="ld-section-title"><Layers size={16} /> Assigned Cohorts</h2>
//                             <div className="ld-cohort-grid">
//                                 {myCohorts.map(cohort => (
//                                     <div key={cohort.id} className="ld-cohort-card">
//                                         <div className="ld-cohort-card__header">
//                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
//                                             <span className="ld-badge-active">Assessing</span>
//                                         </div>
//                                         <div className="ld-cohort-card__dates">
//                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
//                                         </div>
//                                         <div className="ld-cohort-card__roles">
//                                             <div className="ld-role-row">
//                                                 <div className="ld-role-dot ld-role-dot--blue" />
//                                                 <span className="ld-role-label">Facilitator:</span>
//                                                 <span className="ld-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
//                                             </div>
//                                         </div>
//                                         <div className="ld-cohort-card__footer">
//                                             <button
//                                                 className="ld-portfolio-btn"
//                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
//                                             >
//                                                 View Portfolios <ArrowRight size={13} />
//                                             </button>
//                                         </div>
//                                     </div>
//                                 ))}
//                                 {myCohorts.length === 0 && (
//                                     <div className="ld-empty">
//                                         <Layers size={44} color="#cbd5e1" />
//                                         <span className="ld-empty__title">No Cohorts Assigned</span>
//                                         <p className="ld-empty__desc">The system did not find any cohorts linked to your IDs.</p>
//                                         <button onClick={() => setShowDiagnostics(true)} style={{ color: '#3b82f6', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', marginTop: '10px' }}>Run Debugger</button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* ─── TAB 3: PROFILE ─── */}
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


// // import React, { useEffect, useState } from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import {
// //     Users, Calendar, ArrowRight, PenTool,
// //     Clock, CheckCircle, AlertTriangle, FileText,
// //     User, ShieldCheck, Layers, Terminal, Info, Loader2
// // } from 'lucide-react';
// // import { Sidebar } from '../../../components/dashboard/Sidebar';
// // import { useStore } from '../../../store/useStore';
// // import { auth, db } from '../../../lib/firebase';
// // import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// // import './AssessorDashboard.css';

// // interface PendingTask {
// //     id: string;
// //     learnerId: string;
// //     learnerName: string;
// //     assessmentId: string;
// //     title: string;
// //     status: string;
// //     submittedAt: string;
// //     isReturned: boolean;
// // }

// // export const AssessorDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();

// //     // ─── UI State ──────────────────────────────────────────────────────────
// //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );
// //     const [showDiagnostics, setShowDiagnostics] = useState(false);

// //     // ─── Data State ────────────────────────────────────────────────────────
// //     const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
// //     const [loadingTasks, setLoadingTasks] = useState(true);

// //     // ─── 1. INITIAL DATA SYNC ──────────────────────────────────────────────
// //     useEffect(() => {
// //         store.fetchCohorts();
// //         store.fetchStaff();
// //         store.fetchLearners();
// //     }, []);

// //     // ─── 2. THE BRIDGE LOGIC (Resolving IDs) ────────────────────────────────
// //     // We look for your staff profile by matching your login email or UID
// //     const myStaffProfile = store.staff.find(s =>
// //         s.authUid === store.user?.uid ||
// //         s.email === store.user?.email ||
// //         s.id === store.user?.uid
// //     );

// //     // Filter cohorts using every possible identifier to catch mismatches
// //     const myCohorts = store.cohorts.filter(c => {
// //         const matchByAuthUid = c.assessorId === store.user?.uid;
// //         const matchByStaffId = c.assessorId === myStaffProfile?.id;
// //         const matchByEmail = c.assessorEmail === store.user?.email;
// //         return matchByAuthUid || matchByStaffId || matchByEmail;
// //     });

// //     const myCohortIds = myCohorts.map(c => c.id);

// //     // ─── 3. MARKING QUEUE FETCHING (The Marking Logic) ──────────────────────
// //     useEffect(() => {
// //         const fetchTasks = async () => {
// //             // We only fetch tasks if we have resolved cohorts for this assessor
// //             if (!store.user?.uid || myCohortIds.length === 0) {
// //                 setLoadingTasks(false);
// //                 return;
// //             }

// //             try {
// //                 // Fetch all submitted scripts
// //                 const q = query(collection(db, 'learner_submissions'), where('status', '==', 'submitted'));
// //                 const snap = await getDocs(q);
// //                 const tasks: PendingTask[] = [];

// //                 snap.docs.forEach(docSnap => {
// //                     const data = docSnap.data();
// //                     const learner = store.learners.find(l => l.id === data.learnerId);

// //                     // Only include the task if the learner belongs to one of this assessor's cohorts
// //                     if (learner && myCohortIds.includes(learner.cohortId || '')) {
// //                         tasks.push({
// //                             id: docSnap.id,
// //                             learnerId: data.learnerId,
// //                             learnerName: learner.fullName,
// //                             assessmentId: data.assessmentId,
// //                             title: data.title || 'Untitled Assessment',
// //                             status: data.status,
// //                             submittedAt: data.submittedAt || data.assignedAt,
// //                             isReturned: data.moderation?.outcome === 'Returned'
// //                         });
// //                     }
// //                 });

// //                 // Sort: Prioritize "Returned" tasks, then sort by oldest submission date
// //                 tasks.sort((a, b) => {
// //                     if (a.isReturned && !b.isReturned) return -1;
// //                     if (!a.isReturned && b.isReturned) return 1;
// //                     return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
// //                 });

// //                 setPendingTasks(tasks);
// //             } catch (error) {
// //                 console.error("Error fetching marking queue:", error);
// //             } finally {
// //                 setLoadingTasks(false);
// //             }
// //         };

// //         // Ensure learners are loaded before trying to match them to submissions
// //         if (store.learners.length > 0) fetchTasks();
// //     }, [store.user?.uid, myCohortIds.length, store.learners.length]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         } catch (error) {
// //             console.error('Logout failed', error);
// //         }
// //     };

// //     const getFacilitatorName = (id: string) =>
// //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
// //             <Sidebar
// //                 role={store.user?.role}
// //                 currentNav={currentNav}
// //                 setCurrentNav={setCurrentNav as any}
// //                 onLogout={handleLogout}
// //             />

// //             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>

// //                 <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e2e8f0' }}>
// //                     <div className="header-title">
// //                         <h1 className="ad-page-title">
// //                             {currentNav === 'dashboard' && 'Assessor Marking Centre'}
// //                             {currentNav === 'cohorts' && 'My Assigned Classes'}
// //                             {currentNav === 'profile' && 'Assessor Compliance Profile'}
// //                         </h1>
// //                         <p className="ad-page-sub">Practitioner: {store.user?.fullName}</p>
// //                     </div>
// //                     <button
// //                         className="diagnostic-trigger"
// //                         onClick={() => setShowDiagnostics(!showDiagnostics)}
// //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
// //                     >
// //                         <Terminal size={14} /> {showDiagnostics ? 'Hide Debug' : 'Debug IDs'}
// //                     </button>
// //                 </header>

// //                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f8fafc' }}>

// //                     {/* ─── DIAGNOSTIC CONSOLE (From Codebase 1) ─── */}
// //                     {/* {showDiagnostics && (
// //                         <div className="diagnostic-panel animate-fade-in" style={{ background: '#0f172a', color: '#94a3b8', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', borderLeft: '5px solid #3b82f6' }}>
// //                             <h4 style={{ color: 'white', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Info size={14} /> System Identity Bridge</h4>
// //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
// //                                 <div>
// //                                     <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px' }}>Auth UID:</label>
// //                                     <code style={{ background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.8rem' }}>{store.user?.uid}</code>
// //                                 </div>
// //                                 <div>
// //                                     <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px' }}>Staff ID:</label>
// //                                     <code style={{ background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.8rem' }}>{myStaffProfile?.id || 'Not Linked'}</code>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )} */}

// //                     {/* ─── TAB 1: DASHBOARD (MARKING QUEUE - From Codebase 2) ─── */}
// //                     {currentNav === 'dashboard' && (
// //                         <div className="animate-fade-in">
// //                             <div className="ad-metrics-row">
// //                                 <div className="ad-metric-card">
// //                                     <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Layers size={24} /></div>
// //                                     <div className="ad-metric-data">
// //                                         <span className="ad-metric-val">{myCohorts.length}</span>
// //                                         <span className="ad-metric-lbl">Assigned Cohorts</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ad-metric-card">
// //                                     <div className="ad-metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Clock size={24} /></div>
// //                                     <div className="ad-metric-data">
// //                                         <span className="ad-metric-val">{pendingTasks.length}</span>
// //                                         <span className="ad-metric-lbl">Pending Grading</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ad-metric-card">
// //                                     <div className="ad-metric-icon" style={{ background: '#ffe4e6', color: '#e11d48' }}><AlertTriangle size={24} /></div>
// //                                     <div className="ad-metric-data">
// //                                         <span className="ad-metric-val">{pendingTasks.filter(t => t.isReturned).length}</span>
// //                                         <span className="ad-metric-lbl">Moderator Returns</span>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="ad-panel" style={{ maxWidth: '900px' }}>
// //                                 <div className="ad-panel-header">
// //                                     <h2 className="ad-panel-title"><PenTool size={18} /> Marking Queue (To-Do)</h2>
// //                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
// //                                 </div>

// //                                 {loadingTasks ? (
// //                                     <div className="ad-state-box"><Loader2 className="spin" size={24} /> Loading marking tasks...</div>
// //                                 ) : pendingTasks.length === 0 ? (
// //                                     <div className="ad-state-box">
// //                                         <CheckCircle size={40} color="#10b981" style={{ marginBottom: '1rem' }} />
// //                                         <p style={{ margin: 0, fontWeight: 'bold', color: '#0f172a' }}>All caught up!</p>
// //                                         <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>There are no submissions waiting for your review.</p>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ad-task-list">
// //                                         {pendingTasks.map(task => (
// //                                             <div key={task.id} className={`ad-task-card ${task.isReturned ? 'returned' : ''}`}>
// //                                                 <div className="ad-task-info">
// //                                                     <div className="ad-task-header">
// //                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
// //                                                         {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
// //                                                     </div>
// //                                                     <p className="ad-task-title"><FileText size={14} /> {task.title}</p>
// //                                                     <p className="ad-task-date"><Clock size={13} /> Submitted: {new Date(task.submittedAt).toLocaleDateString()}</p>
// //                                                 </div>
// //                                                 <button
// //                                                     className="ad-grade-btn"
// //                                                     onClick={() => navigate(`/portfolio/submission/${task.id}`)}
// //                                                 >
// //                                                     <PenTool size={14} /> Grade Now
// //                                                 </button>
// //                                             </div>
// //                                         ))}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ─── TAB 2: MY COHORTS (The Grid) ─── */}
// //                     {currentNav === 'cohorts' && (
// //                         <div className="animate-fade-in">
// //                             <h2 className="ld-section-title"><Layers size={16} /> Assigned Cohorts</h2>
// //                             <div className="ld-cohort-grid">
// //                                 {myCohorts.map(cohort => (
// //                                     <div key={cohort.id} className="ld-cohort-card">
// //                                         <div className="ld-cohort-card__header">
// //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// //                                             <span className="ld-badge-active">Assessing</span>
// //                                         </div>
// //                                         <div className="ld-cohort-card__dates">
// //                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
// //                                         </div>
// //                                         <div className="ld-cohort-card__roles">
// //                                             <div className="ld-role-row">
// //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// //                                                 <span className="ld-role-label">Facilitator:</span>
// //                                                 <span className="ld-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
// //                                             </div>
// //                                         </div>
// //                                         <div className="ld-cohort-card__footer">
// //                                             <button
// //                                                 className="ld-portfolio-btn"
// //                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
// //                                             >
// //                                                 View Portfolios <ArrowRight size={13} />
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 ))}
// //                                 {myCohorts.length === 0 && (
// //                                     <div className="ld-empty">
// //                                         <Layers size={44} color="#cbd5e1" />
// //                                         <span className="ld-empty__title">No Cohorts Assigned</span>
// //                                         <p className="ld-empty__desc">The system did not find any cohorts linked to your IDs.</p>
// //                                         <button onClick={() => setShowDiagnostics(true)} style={{ color: '#3b82f6', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', marginTop: '10px' }}>Run Debugger</button>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ─── TAB 3: PROFILE (The Full Integrated View) ─── */}
// //                     {currentNav === 'profile' && (
// //                         <AssessorProfileView
// //                             profile={store.user}
// //                             user={store.user}
// //                             onUpdate={store.updateStaffProfile}
// //                         />
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };


// // // import React, { useEffect, useState } from 'react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import { signOut } from 'firebase/auth';
// // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // import {
// // //     Users, Calendar, ArrowRight, PenTool,
// // //     Clock, CheckCircle, AlertTriangle, FileText,
// // //     User, ShieldCheck, Layers, Terminal, Info
// // // } from 'lucide-react';
// // // import { Sidebar } from '../../../components/dashboard/Sidebar';
// // // import { useStore } from '../../../store/useStore';
// // // import { auth, db } from '../../../lib/firebase';
// // // import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';
// // // import './AssessorDashboard.css';

// // // export const AssessorDashboard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();
// // //     const store = useStore();

// // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
// // //         (location.state as any)?.activeTab || 'dashboard'
// // //     );

// // //     const [pendingTasksCount, setPendingTasksCount] = useState(0);
// // //     const [showDiagnostics, setShowDiagnostics] = useState(false);

// // //     // ─── 1. INITIAL DATA SYNC ──────────────────────────────────────────────
// // //     useEffect(() => {
// // //         store.fetchCohorts();
// // //         store.fetchStaff();
// // //         store.fetchLearners();
// // //     }, []);

// // //     // ─── 2. THE BRIDGE LOGIC (Resolving IDs) ────────────────────────────────
// // //     // We look for your staff profile by matching your login email or UID
// // //     const myStaffProfile = store.staff.find(s =>
// // //         s.authUid === store.user?.uid ||
// // //         s.email === store.user?.email ||
// // //         s.id === store.user?.uid
// // //     );

// // //     // Filter cohorts using every possible identifier to catch mismatches
// // //     const myCohorts = store.cohorts.filter(c => {
// // //         const matchByAuthUid = c.assessorId === store.user?.uid;
// // //         const matchByStaffId = c.assessorId === myStaffProfile?.id;
// // //         const matchByEmail = c.assessorEmail === store.user?.email; // optional extra check
// // //         return matchByAuthUid || matchByStaffId || matchByEmail;
// // //     });

// // //     const myCohortIds = myCohorts.map(c => c.id);

// // //     // ─── 3. METRICS FETCHING ──────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const fetchMetrics = async () => {
// // //             if (!store.user?.uid || myCohortIds.length === 0) return;
// // //             try {
// // //                 const q = query(
// // //                     collection(db, 'learner_submissions'),
// // //                     where('status', '==', 'submitted')
// // //                 );
// // //                 const snap = await getDocs(q);

// // //                 // Only count tasks belonging to the assessor's cohorts
// // //                 const myTasks = snap.docs.filter(docSnap => {
// // //                     const data = docSnap.data();
// // //                     const learner = store.learners.find(l => l.id === data.learnerId);
// // //                     return learner && myCohortIds.includes(learner.cohortId || '');
// // //                 });

// // //                 setPendingTasksCount(myTasks.length);
// // //             } catch (err) {
// // //                 console.error("Metrics sync error:", err);
// // //             }
// // //         };
// // //         fetchMetrics();
// // //     }, [myCohortIds.length, store.user?.uid, store.learners.length]);

// // //     const handleLogout = async () => {
// // //         await signOut(auth);
// // //         navigate('/login');
// // //     };

// // //     const getFacilitatorName = (id: string) =>
// // //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // //     return (
// // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
// // //             <Sidebar
// // //                 role={store.user?.role}
// // //                 currentNav={currentNav}
// // //                 setCurrentNav={setCurrentNav as any}
// // //                 onLogout={handleLogout}
// // //             />

// // //             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>
// // //                 <header className="dashboard-header">
// // //                     <div className="header-title">
// // //                         <h1 className="ad-page-title">
// // //                             {currentNav === 'dashboard' && 'Assessor Marking Centre'}
// // //                             {currentNav === 'cohorts' && 'My Assigned Classes'}
// // //                             {currentNav === 'profile' && 'Assessor Compliance Profile'}
// // //                         </h1>
// // //                         <p className="ad-page-sub">Practitioner: {store.user?.fullName}</p>
// // //                     </div>
// // //                     <button
// // //                         className="diagnostic-trigger"
// // //                         onClick={() => setShowDiagnostics(!showDiagnostics)}
// // //                     >
// // //                         <Terminal size={14} /> {showDiagnostics ? 'Hide Debug' : 'Debug IDs'}
// // //                     </button>
// // //                 </header>

// // //                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f8fafc' }}>

// // //                     {/* ─── DIAGNOSTIC CONSOLE ─── */}
// // //                     {showDiagnostics && (
// // //                         <div className="diagnostic-panel animate-fade-in">
// // //                             <h4><Info size={14} /> System Identity Bridge</h4>
// // //                             <div className="diag-grid">
// // //                                 <div className="diag-item">
// // //                                     <label>Auth UID (User Collection):</label>
// // //                                     <code>{store.user?.uid}</code>
// // //                                 </div>
// // //                                 <div className="diag-item">
// // //                                     <label>Staff Profile ID (Staff Collection):</label>
// // //                                     <code>{myStaffProfile?.id || 'NOT FOUND'}</code>
// // //                                 </div>
// // //                                 <div className="diag-item">
// // //                                     <label>Total Global Cohorts:</label>
// // //                                     <code>{store.cohorts.length}</code>
// // //                                 </div>
// // //                                 <div className="diag-item">
// // //                                     <label>Matched for you:</label>
// // //                                     <code style={{ color: myCohorts.length > 0 ? '#16a34a' : '#ef4444' }}>
// // //                                         {myCohorts.length} Cohorts
// // //                                     </code>
// // //                                 </div>
// // //                             </div>
// // //                             <p className="diag-note">
// // //                                 Tip: In Firebase, check the <code>cohorts</code> collection. The <code>assessorId</code> field
// // //                                 must match either the Auth UID or the Staff Profile ID shown above.
// // //                             </p>
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 1: DASHBOARD OVERVIEW ─── */}
// // //                     {currentNav === 'dashboard' && (
// // //                         <div className="animate-fade-in">
// // //                             <div className="ad-metrics-row">
// // //                                 <div className="ad-metric-card">
// // //                                     <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Layers size={24} /></div>
// // //                                     <div className="ad-metric-data">
// // //                                         <span className="ad-metric-val">{myCohorts.length}</span>
// // //                                         <span className="ad-metric-lbl">Active Cohorts</span>
// // //                                     </div>
// // //                                 </div>
// // //                                 <div className="ad-metric-card">
// // //                                     <div className="ad-metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}><PenTool size={24} /></div>
// // //                                     <div className="ad-metric-data">
// // //                                         <span className="ad-metric-val">{pendingTasksCount}</span>
// // //                                         <span className="ad-metric-lbl">Items to Grade</span>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="ad-panel" style={{ marginTop: '2rem', textAlign: 'center', padding: '4rem' }}>
// // //                                 <div className="ad-state-icon">
// // //                                     {pendingTasksCount > 0 ? <AlertTriangle size={48} color="#d97706" /> : <CheckCircle size={48} color="#16a34a" />}
// // //                                 </div>
// // //                                 <h3>{pendingTasksCount > 0 ? 'Submissions Awaiting Review' : 'Marking Queue Clear'}</h3>
// // //                                 <p>Navigate to "My Classes" to start assessing learner portfolios.</p>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 2: COHORTS GRID ─── */}
// // //                     {currentNav === 'cohorts' && (
// // //                         <div className="animate-fade-in">
// // //                             <h2 className="ld-section-title"><Layers size={16} /> Assigned Cohorts</h2>
// // //                             <div className="ld-cohort-grid">
// // //                                 {myCohorts.map(cohort => (
// // //                                     <div key={cohort.id} className="ld-cohort-card">
// // //                                         <div className="ld-cohort-card__header">
// // //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// // //                                             <span className="ld-badge-active">Assessing</span>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__dates">
// // //                                             <Calendar size={13} />
// // //                                             {cohort.startDate} — {cohort.endDate}
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__roles">
// // //                                             <div className="ld-role-row">
// // //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// // //                                                 <span className="ld-role-label">Facilitator:</span>
// // //                                                 <span className="ld-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
// // //                                             </div>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__footer">
// // //                                             <button
// // //                                                 className="ld-portfolio-btn"
// // //                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
// // //                                             >
// // //                                                 Audit Portfolios <ArrowRight size={13} />
// // //                                             </button>
// // //                                         </div>
// // //                                     </div>
// // //                                 ))}

// // //                                 {myCohorts.length === 0 && (
// // //                                     <div className="ld-empty">
// // //                                         <Layers size={44} color="#cbd5e1" />
// // //                                         <span className="ld-empty__title">No Cohorts Found</span>
// // //                                         <p className="ld-empty__desc">The system did not find any cohorts linked to your IDs.</p>
// // //                                         <button
// // //                                             onClick={() => setShowDiagnostics(true)}
// // //                                             style={{ marginTop: '1rem', color: 'var(--mlab-blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}
// // //                                         >
// // //                                             Run ID Diagnostics
// // //                                         </button>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 3: COMPLIANCE PROFILE ─── */}
// // //                     {currentNav === 'profile' && (
// // //                         <AssessorProfileView
// // //                             profile={store.user}
// // //                             user={store.user}
// // //                             onUpdate={store.updateStaffProfile}
// // //                         />
// // //                     )}
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };


// // // // import React, { useEffect, useState } from 'react';
// // // // import { useNavigate, useLocation } from 'react-router-dom';
// // // // import { signOut } from 'firebase/auth';
// // // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // // import {
// // // //     Users, Calendar, ArrowRight, PenTool,
// // // //     Clock, CheckCircle, AlertTriangle, FileText,
// // // //     User, ShieldCheck
// // // // } from 'lucide-react';
// // // // import { Sidebar } from '../../../components/dashboard/Sidebar';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { auth, db } from '../../../lib/firebase';
// // // // import './AssessorDashboard.css';

// // // // interface PendingTask {
// // // //     id: string;
// // // //     learnerId: string;
// // // //     learnerName: string;
// // // //     assessmentId: string;
// // // //     title: string;
// // // //     status: string;
// // // //     submittedAt: string;
// // // //     isReturned: boolean;
// // // // }

// // // // export const AssessorDashboard: React.FC = () => {
// // // //     const navigate = useNavigate();
// // // //     const location = useLocation();
// // // //     const store = useStore();

// // // //     // ─── Navigation State (Portfolios removed) ────────────────────────────────
// // // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile'>(
// // // //         (location.state as any)?.activeTab || 'dashboard'
// // // //     );

// // // //     const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
// // // //     const [loadingTasks, setLoadingTasks] = useState(true);

// // // //     useEffect(() => {
// // // //         store.fetchCohorts();
// // // //         store.fetchStaff();
// // // //         store.fetchLearners();
// // // //     }, [store.fetchCohorts, store.fetchStaff, store.fetchLearners]);

// // // //     // ─── Data Logic ──────────────────────────────────────────────────────────
// // // //     const myCohorts = store.cohorts.filter(c => c.assessorId === store.user?.uid);
// // // //     const myCohortIds = myCohorts.map(c => c.id);

// // // //     useEffect(() => {
// // // //         const fetchTasks = async () => {
// // // //             if (!store.user?.uid || myCohortIds.length === 0) {
// // // //                 setLoadingTasks(false);
// // // //                 return;
// // // //             }

// // // //             try {
// // // //                 const q = query(collection(db, 'learner_submissions'), where('status', '==', 'submitted'));
// // // //                 const snap = await getDocs(q);
// // // //                 const tasks: PendingTask[] = [];

// // // //                 snap.docs.forEach(docSnap => {
// // // //                     const data = docSnap.data();
// // // //                     const learner = store.learners.find(l => l.id === data.learnerId);

// // // //                     if (learner && myCohortIds.includes(learner.cohortId || '')) {
// // // //                         tasks.push({
// // // //                             id: docSnap.id,
// // // //                             learnerId: data.learnerId,
// // // //                             learnerName: learner.fullName,
// // // //                             assessmentId: data.assessmentId,
// // // //                             title: data.title || 'Untitled Assessment',
// // // //                             status: data.status,
// // // //                             submittedAt: data.submittedAt || data.assignedAt,
// // // //                             isReturned: data.moderation?.outcome === 'Returned'
// // // //                         });
// // // //                     }
// // // //                 });

// // // //                 tasks.sort((a, b) => {
// // // //                     if (a.isReturned && !b.isReturned) return -1;
// // // //                     if (!a.isReturned && b.isReturned) return 1;
// // // //                     return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
// // // //                 });

// // // //                 setPendingTasks(tasks);
// // // //             } catch (error) {
// // // //                 console.error("Error fetching tasks:", error);
// // // //             } finally {
// // // //                 setLoadingTasks(false);
// // // //             }
// // // //         };

// // // //         if (store.learners.length > 0) fetchTasks();
// // // //     }, [store.user?.uid, myCohortIds.length, store.learners.length]);

// // // //     const handleLogout = async () => {
// // // //         try {
// // // //             await signOut(auth);
// // // //             navigate('/login');
// // // //         } catch (error) {
// // // //             console.error('Logout failed', error);
// // // //         }
// // // //     };

// // // //     const getFacilitatorName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // // //     return (
// // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
// // // //             <Sidebar
// // // //                 role={store.user?.role}
// // // //                 currentNav={currentNav}
// // // //                 setCurrentNav={setCurrentNav as any}
// // // //                 onLogout={handleLogout}
// // // //             />

// // // //             <main className="main-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>

// // // //                 <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e2e8f0' }}>
// // // //                     <div className="header-title">
// // // //                         <h1 className="ad-page-title">
// // // //                             {currentNav === 'dashboard' && 'Assessor Marking Centre'}
// // // //                             {currentNav === 'cohorts' && 'My Assigned Classes'}
// // // //                             {currentNav === 'profile' && 'Assessor Compliance Profile'}
// // // //                         </h1>
// // // //                         <p className="ad-page-sub">
// // // //                             Welcome back, Assessor {store.user?.fullName}
// // // //                         </p>
// // // //                     </div>
// // // //                 </header>

// // // //                 <div className="admin-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#f8fafc' }}>

// // // //                     {/* ── TAB 1: DASHBOARD (MARKING QUEUE) ── */}
// // // //                     {currentNav === 'dashboard' && (
// // // //                         <div className="animate-fade-in">
// // // //                             <div className="ad-metrics-row">
// // // //                                 <div className="ad-metric-card">
// // // //                                     <div className="ad-metric-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Users size={24} /></div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val">{myCohorts.length}</span>
// // // //                                         <span className="ad-metric-lbl">Assigned Cohorts</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="ad-metric-card">
// // // //                                     <div className="ad-metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Clock size={24} /></div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val">{pendingTasks.length}</span>
// // // //                                         <span className="ad-metric-lbl">Pending Grading</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="ad-metric-card">
// // // //                                     <div className="ad-metric-icon" style={{ background: '#ffe4e6', color: '#e11d48' }}><AlertTriangle size={24} /></div>
// // // //                                     <div className="ad-metric-data">
// // // //                                         <span className="ad-metric-val">{pendingTasks.filter(t => t.isReturned).length}</span>
// // // //                                         <span className="ad-metric-lbl">Moderator Returns</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="ad-panel" style={{ maxWidth: '900px' }}>
// // // //                                 <div className="ad-panel-header">
// // // //                                     <h2 className="ad-panel-title"><PenTool size={18} /> Marking Queue (To-Do)</h2>
// // // //                                     <span className="ad-panel-badge">{pendingTasks.length} items</span>
// // // //                                 </div>

// // // //                                 {loadingTasks ? (
// // // //                                     <div className="ad-state-box"><div className="ad-spinner" /> Loading tasks...</div>
// // // //                                 ) : pendingTasks.length === 0 ? (
// // // //                                     <div className="ad-state-box">
// // // //                                         <CheckCircle size={40} color="#10b981" style={{ marginBottom: '1rem' }} />
// // // //                                         <p style={{ margin: 0, fontWeight: 'bold', color: '#0f172a' }}>All caught up!</p>
// // // //                                         <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>There are no submissions waiting for your review.</p>
// // // //                                     </div>
// // // //                                 ) : (
// // // //                                     <div className="ad-task-list">
// // // //                                         {pendingTasks.map(task => (
// // // //                                             <div key={task.id} className={`ad-task-card ${task.isReturned ? 'returned' : ''}`}>
// // // //                                                 <div className="ad-task-info">
// // // //                                                     <div className="ad-task-header">
// // // //                                                         <h4 className="ad-task-learner">{task.learnerName}</h4>
// // // //                                                         {task.isReturned && <span className="ad-task-tag danger">Mod. Returned</span>}
// // // //                                                     </div>
// // // //                                                     <p className="ad-task-title"><FileText size={14} /> {task.title}</p>
// // // //                                                     <p className="ad-task-date"><Clock size={13} /> Submitted: {new Date(task.submittedAt).toLocaleDateString()}</p>
// // // //                                                 </div>
// // // //                                                 <button
// // // //                                                     className="ad-grade-btn"
// // // //                                                     onClick={() => navigate(`/portfolio/submission/${task.id}`)}
// // // //                                                 >
// // // //                                                     <PenTool size={14} /> Grade Now
// // // //                                                 </button>
// // // //                                             </div>
// // // //                                         ))}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ── TAB 2: MY COHORTS (Access Portfolios here) ── */}
// // // //                     {currentNav === 'cohorts' && (
// // // //                         <div className="animate-fade-in">
// // // //                             <div className="ad-cohort-grid">
// // // //                                 {myCohorts.map(cohort => (
// // // //                                     <div key={cohort.id} className="ad-cohort-card">
// // // //                                         <div className="ad-cohort-card__header">
// // // //                                             <h3 className="ad-cohort-card__name">{cohort.name}</h3>
// // // //                                             <span className="ad-badge-active">Active</span>
// // // //                                         </div>
// // // //                                         <div className="ad-cohort-card__dates">
// // // //                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
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
// // // //                                         <Users size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // //                                         <span className="ad-empty__title">No Classes Assigned</span>
// // // //                                         <p className="ad-empty__desc">You have not been assigned as an Assessor to any cohorts yet.</p>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ── TAB 3: PROFILE ── */}
// // // //                     {currentNav === 'profile' && (
// // // //                         <div className="animate-fade-in ad-panel" style={{ maxWidth: '600px' }}>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
// // // //                                 <div style={{ width: '64px', height: '64px', background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //                                     <User size={32} color="#94a3b8" />
// // // //                                 </div>
// // // //                                 <div>
// // // //                                     <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{store.user?.fullName}</h2>
// // // //                                     <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                         <ShieldCheck size={14} /> Verified QCTO Assessor
// // // //                                     </span>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="ad-fg">
// // // //                                 <label>Email Address</label>
// // // //                                 <input type="text" className="ad-input" value={store.user?.email || ''} readOnly disabled />
// // // //                             </div>
// // // //                             <div className="ad-fg">
// // // //                                 <label>SETA Assessor Registration Number</label>
// // // //                                 <input type="text" className="ad-input" placeholder="e.g. SETA-ASS-12345" />
// // // //                                 <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>Required for compliance sign-offs.</small>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };