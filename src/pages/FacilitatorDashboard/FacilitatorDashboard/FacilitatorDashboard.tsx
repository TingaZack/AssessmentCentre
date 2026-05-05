// src/pages/FacilitatorDashboard/FacilitatorDashboard.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store/useStore';
import {
    Users,
    ArrowRight,
    ClipboardCheck,
    Calendar,
    Layers,
    Plus,
    Activity,
    Clock,
    FileEdit,
    LayoutDashboard,
    GraduationCap,
    UserCircle,
    HeartHandshake
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { AttendanceHistoryList } from '../AttendanceRegister/AttendanceHistoryList';
import { AssessmentManager } from '../AssessmentManager/AssessmentManager';
import { FacilitatorProfileView } from '../FacilitatorProfileView/FacilitatorProfileView';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';

import '../../AdminDashboard/AdminDashboard.css';

import './FacilitatorDashboard.css';
import StatCard from '../../../components/common/StatCard/StatCard';

export const FacilitatorDashboard: React.FC = () => {
    const {
        user,
        cohorts,
        learners,
        programmes,
        staff,
        employers,
        fetchCohorts,
        fetchLearners,
        fetchProgrammes,
        fetchStaff,
        fetchEmployers,
        updateStaffProfile
    } = useStore();

    const navigate = useNavigate();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

    const [stats, setStats] = useState({
        avgMarkingTime: null as number | null,
        totalMarked: 0,
        pendingMarking: 0,
        awaitingSignoff: 0,
        pendingByCohort: {} as Record<string, number>
    });

    useEffect(() => {
        const path = location.pathname;
        if (path.includes('/profile')) setActiveTab('profile');
        else if (path.includes('/attendance') && !path.includes('/', 22)) setActiveTab('history');
        else if (path.includes('/assessments')) setActiveTab('assessments');
        else setActiveTab('dashboard');
    }, [location.pathname]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (activeTab === 'dashboard' && learners.length === 0) fetchLearners();
        if (activeTab === 'assessments' && programmes.length === 0) fetchProgrammes();
        if (activeTab === 'profile') {
            if (employers.length === 0) fetchEmployers();
            if (staff.length === 0) fetchStaff();
        }
    }, [activeTab, fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers, cohorts.length, learners.length, programmes.length, employers.length, staff.length]);

    // CO-FACILITATION LOGIC: Include classes where they are Primary OR Support
    const myCohorts = useMemo(() => {
        return cohorts.filter(c =>
            (c.facilitatorId === user?.uid || c.supportFacilitatorId === user?.uid) &&
            !c.isArchived
        );
    }, [cohorts, user]);

    useEffect(() => {
        const fetchDashboardStats = async () => {
            if (!user?.uid) return;
            try {
                const markedQuery = query(collection(db, 'learner_submissions'), where('grading.facilitatorId', '==', user.uid));
                const markedSnap = await getDocs(markedQuery);

                let totalTime = 0;
                let timeTrackedCount = 0;
                markedSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.grading?.facilitatorTimeSpent > 0) {
                        totalTime += data.grading.facilitatorTimeSpent;
                        timeTrackedCount++;
                    }
                });

                const calculatedAvgTime = timeTrackedCount > 0 ? totalTime / timeTrackedCount : 0;

                let pendingCount = 0;
                let signoffCount = 0;
                const cohortPendingMap: Record<string, number> = {};
                const cohortIds = myCohorts.map(c => c.id);

                if (cohortIds.length > 0) {
                    const chunks = [];
                    for (let i = 0; i < cohortIds.length; i += 10) chunks.push(cohortIds.slice(i, i + 10));

                    for (const chunk of chunks) {
                        const pendingQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'submitted'));
                        const pSnap = await getDocs(pendingQ);
                        pendingCount += pSnap.size;
                        pSnap.forEach(doc => {
                            const cid = doc.data().cohortId;
                            if (cid) cohortPendingMap[cid] = (cohortPendingMap[cid] || 0) + 1;
                        });

                        const signoffQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'awaiting_learner_signoff'));
                        signoffCount += (await getDocs(signoffQ)).size;
                    }
                }

                setStats({
                    avgMarkingTime: calculatedAvgTime,
                    totalMarked: markedSnap.size,
                    pendingMarking: pendingCount,
                    awaitingSignoff: signoffCount,
                    pendingByCohort: cohortPendingMap
                });
            } catch (error) {
                console.error("Failed to fetch dashboard stats:", error);
            }
        };

        if (activeTab === 'dashboard') fetchDashboardStats();
    }, [user?.uid, activeTab, myCohorts]);

    const formatTimeSpent = (seconds?: number | null) => {
        if (!seconds) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
    };

    return (
        <div className="wm-root animate-fade-in" style={{ padding: 16, paddingBottom: '5%' }}>

            {/* ── PAGE HEADER (Matching Admin Dashboard Standard) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon">
                        {activeTab === 'dashboard' && <LayoutDashboard size={22} />}
                        {activeTab === 'history' && <ClipboardCheck size={22} />}
                        {activeTab === 'profile' && <UserCircle size={22} />}
                        {activeTab === 'assessments' && <FileEdit size={22} />}
                    </div>
                    <div>
                        <h1 className="wm-page-header__title">
                            {activeTab === 'dashboard' && 'My Cohorts'}
                            {activeTab === 'history' && 'Attendance History'}
                            {activeTab === 'profile' && 'My Profile'}
                            {activeTab === 'assessments' && 'Assessment Manager'}
                        </h1>
                        <p className="wm-page-header__desc">
                            {activeTab === 'dashboard' && 'View and manage your assigned cohorts and active classes.'}
                            {activeTab === 'history' && 'Review past attendance registers and session records.'}
                            {activeTab === 'profile' && 'View and update your facilitator profile and contact info.'}
                            {activeTab === 'assessments' && 'Create and manage assessments for your assigned learners.'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {activeTab === 'assessments' && (
                        <button className="mlab-btn mlab-btn--primary" onClick={() => navigate('/facilitator/assessments/builder')}>
                            <Plus size={16} /> New Assessment
                        </button>
                    )}
                    <NotificationBell />
                </div>
            </div>

            <div className="admin-content">
                {activeTab === 'dashboard' && (
                    <div className="animate-fade-in">

                        {/* ── KPI RIBBON (Matching Admin Standard) ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                            <StatCard icon={<FileEdit size={20} />} title="Awaiting Pre-Marking" value={stats.pendingMarking} borderColor="var(--mlab-amber)" />
                            <StatCard icon={<Clock size={20} />} title="Pending Signatures" value={stats.awaitingSignoff} borderColor="var(--mlab-grey)" />
                            <StatCard icon={<ClipboardCheck size={20} />} title="Lifetime Scripts" value={stats.totalMarked} borderColor="var(--mlab-green)" />
                            <StatCard icon={<Layers size={20} />} title="Active Classes" value={myCohorts.length} borderColor="var(--mlab-blue)" />
                            <StatCard icon={<Users size={20} />} title="Total Learners" value={myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)} borderColor="var(--mlab-blue)" />
                            <StatCard icon={<Activity size={20} />} title="Avg Pre-Mark Pace" value={formatTimeSpent(stats.avgMarkingTime)} borderColor="#8b5cf6" />
                        </div>

                        {/* ── COHORT GRID ── */}
                        <section className="list-view">
                            <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                <Layers size={20} /> Your Assigned Cohorts
                            </h3>

                            <div className="ld-cohort-grid">
                                {myCohorts.length > 0 ? myCohorts.map(cohort => {
                                    const pendingCount = stats.pendingByCohort[cohort.id] || 0;
                                    // CHECK IF THEY ARE PRIMARY OR SUPPORT
                                    const isSupport = cohort.supportFacilitatorId === user?.uid;

                                    return (
                                        <div key={cohort.id} className="ld-cohort-card">
                                            <div className="ld-cohort-card__header">
                                                <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                                {pendingCount > 0 ? (
                                                    <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <FileEdit size={10} /> {pendingCount} To Mark
                                                    </span>
                                                ) : isSupport ? (
                                                    <span className="mlab-badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <HeartHandshake size={10} /> Support
                                                    </span>
                                                ) : (
                                                    <span className="ld-badge-active">Facilitating</span>
                                                )}
                                            </div>
                                            <div className="ld-cohort-card__dates"><Calendar size={13} /> {cohort.startDate} — {cohort.endDate}</div>
                                            <div className="ld-cohort-card__roles">
                                                <div className="ld-role-row">
                                                    <div className="ld-role-dot ld-role-dot--blue" />
                                                    <span className="ld-role-label">Enrolled Learners:</span>
                                                    <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
                                                </div>
                                            </div>
                                            <div className="ld-cohort-card__footer">
                                                <button className="ld-attendance-btn" onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}>
                                                    <ClipboardCheck size={14} /> Register
                                                </button>
                                                <button className="ld-portfolio-btn" onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                                    View Class <ArrowRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="f-empty-state">
                                        <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                        <p style={{ fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
                                        <p>You have not been assigned to facilitate any classes yet.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'history' && <div className="animate-fade-in"><AttendanceHistoryList facilitatorId={user?.uid} /></div>}
                {activeTab === 'assessments' && <AssessmentManager />}
                {activeTab === 'profile' && <div className="animate-fade-in"><FacilitatorProfileView profile={user} user={user} onUpdate={updateStaffProfile} /></div>}
            </div>
        </div>
    );
};



// // src/pages/FacilitatorDashboard/FacilitatorDashboard.tsx

// import React, { useEffect, useMemo, useState } from 'react';
// import { useStore } from '../../store/useStore';
// import {
//     Users,
//     ArrowRight,
//     ClipboardCheck,
//     Calendar,
//     Layers,
//     Plus,
//     Activity,
//     Clock,
//     FileEdit,
//     CheckCircle
// } from 'lucide-react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { AttendanceHistoryList } from './AttendanceRegister/AttendanceHistoryList';
// import { AssessmentManager } from './AssessmentManager/AssessmentManager';
// import { FacilitatorProfileView } from './FacilitatorProfileView/FacilitatorProfileView';
// import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// import '../AdminDashboard/AdminDashboard.css';
// import './FacilitatorDashboard.css'; // 👈 Powers the new stat cards

// export const FacilitatorDashboard: React.FC = () => {

//     const {
//         user,
//         cohorts,
//         learners,
//         programmes,
//         staff,
//         employers,
//         fetchCohorts,
//         fetchLearners,
//         fetchProgrammes,
//         fetchStaff,
//         fetchEmployers,
//         updateStaffProfile
//     } = useStore();

//     const navigate = useNavigate();
//     const location = useLocation();

//     // Internal state to control the view, synced with URL
//     const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

//     // ─── STATE FOR FACILITATOR ANALYTICS ───
//     const [stats, setStats] = useState({
//         avgMarkingTime: null as number | null,
//         totalMarked: 0,
//         pendingMarking: 0,
//         awaitingSignoff: 0,
//         pendingByCohort: {} as Record<string, number>
//     });

//     // ─── SYNC TABS WITH URL ───────────────────────────────────────────────────
//     useEffect(() => {
//         const path = location.pathname;
//         if (path.includes('/profile')) {
//             setActiveTab('profile');
//         } else if (path.includes('/attendance') && !path.includes('/', 22)) {
//             setActiveTab('history');
//         } else if (path.includes('/assessments')) {
//             setActiveTab('assessments');
//         } else {
//             setActiveTab('dashboard');
//         }
//     }, [location.pathname]);

//     // ─── SMART DATA HYDRATION ────────────────────────────────────────────────
//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (activeTab === 'dashboard' && learners.length === 0) fetchLearners();
//         if (activeTab === 'assessments' && programmes.length === 0) fetchProgrammes();
//         if (activeTab === 'profile') {
//             if (employers.length === 0) fetchEmployers();
//             if (staff.length === 0) fetchStaff();
//         }
//     }, [
//         activeTab,
//         fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers,
//         cohorts.length, learners.length, programmes.length, employers.length, staff.length
//     ]);

//     // ─── FILTER COHORTS ───────────────────────────────────────────────────────
//     const myCohorts = useMemo(() => {
//         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
//     }, [cohorts, user]);

//     // ─── FETCH ADVANCED METRICS ───────────────────────────────────────────────
//     useEffect(() => {
//         const fetchDashboardStats = async () => {
//             if (!user?.uid) return;
//             try {
//                 // 1. Historical Marking Stats
//                 const markedQuery = query(
//                     collection(db, 'learner_submissions'),
//                     where('grading.facilitatorId', '==', user.uid)
//                 );
//                 const markedSnap = await getDocs(markedQuery);

//                 let totalTime = 0;
//                 let timeTrackedCount = 0;

//                 markedSnap.forEach(doc => {
//                     const data = doc.data();
//                     if (data.grading?.facilitatorTimeSpent && data.grading.facilitatorTimeSpent > 0) {
//                         totalTime += data.grading.facilitatorTimeSpent;
//                         timeTrackedCount++;
//                     }
//                 });

//                 const calculatedAvgTime = timeTrackedCount > 0 ? totalTime / timeTrackedCount : 0;

//                 // 2. Pending Actions (Based on assigned cohorts)
//                 let pendingCount = 0;
//                 let signoffCount = 0;
//                 const cohortPendingMap: Record<string, number> = {};

//                 const cohortIds = myCohorts.map(c => c.id);

//                 if (cohortIds.length > 0) {
//                     const chunks = [];
//                     for (let i = 0; i < cohortIds.length; i += 10) {
//                         chunks.push(cohortIds.slice(i, i + 10));
//                     }

//                     for (const chunk of chunks) {
//                         const pendingQ = query(
//                             collection(db, 'learner_submissions'),
//                             where('cohortId', 'in', chunk),
//                             where('status', '==', 'submitted')
//                         );
//                         const pSnap = await getDocs(pendingQ);
//                         pendingCount += pSnap.size;

//                         pSnap.forEach(doc => {
//                             const cid = doc.data().cohortId;
//                             if (cid) {
//                                 cohortPendingMap[cid] = (cohortPendingMap[cid] || 0) + 1;
//                             }
//                         });

//                         const signoffQ = query(
//                             collection(db, 'learner_submissions'),
//                             where('cohortId', 'in', chunk),
//                             where('status', '==', 'awaiting_learner_signoff')
//                         );
//                         signoffCount += (await getDocs(signoffQ)).size;
//                     }
//                 }

//                 setStats({
//                     avgMarkingTime: calculatedAvgTime,
//                     totalMarked: markedSnap.size,
//                     pendingMarking: pendingCount,
//                     awaitingSignoff: signoffCount,
//                     pendingByCohort: cohortPendingMap
//                 });

//             } catch (error) {
//                 console.error("Failed to fetch dashboard stats:", error);
//             }
//         };

//         if (activeTab === 'dashboard') {
//             fetchDashboardStats();
//         }
//     }, [user?.uid, activeTab, myCohorts]);

//     const formatTimeSpent = (seconds?: number | null) => {
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

//     return (
//         <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

//             {/* MOBILE HEADER */}
//             <div className="admin-mobile-header" style={{ margin: '-16px -16px 16px -16px' }}>
//                 <div className="admin-mobile-header-left">
//                     <div className="admin-mobile-title">Facilitator Portal</div>
//                 </div>
//                 <div className="admin-mobile-header-right">
//                     <NotificationBell />
//                 </div>
//             </div>

//             {/* DESKTOP DASHBOARD HEADER */}
//             <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
//                 <div className="header-title">
//                     <h1>
//                         {activeTab === 'dashboard' && 'My Cohorts'}
//                         {activeTab === 'history' && 'Attendance History'}
//                         {activeTab === 'profile' && 'My Profile'}
//                         {activeTab === 'assessments' && 'Assessment Manager'}
//                     </h1>
//                     <p>
//                         {activeTab === 'dashboard' && 'View and manage your assigned cohorts.'}
//                         {activeTab === 'history' && 'Review past attendance registers.'}
//                         {activeTab === 'profile' && 'View and update your profile information.'}
//                         {activeTab === 'assessments' && 'Create and manage assessments for your learners.'}
//                     </p>
//                 </div>

//                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '4px' }}>
//                     {activeTab === 'assessments' && (
//                         <button
//                             className="mlab-btn mlab-btn--primary"
//                             style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
//                             onClick={() => navigate('/facilitator/assessments/builder')}
//                         >
//                             <Plus size={16} /> New Assessment
//                         </button>
//                     )}
//                     <NotificationBell />
//                 </div>
//             </header>

//             <div className="admin-content">

//                 {/* VIEW: ACTIVE COHORTS (Dashboard) */}
//                 {activeTab === 'dashboard' && (
//                     <div className="animate-fade-in">

//                         {/* ADVANCED METRICS GRID */}
//                         <div className="fd-stats-grid">

//                             {/* Outstanding Marking */}
//                             <div className="fd-stat-card fd-stat-card--amber">
//                                 <div className="fd-stat-icon">
//                                     <FileEdit size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Awaiting Pre-Marking</span>
//                                     <span className="fd-stat-value">{stats.pendingMarking}</span>
//                                 </div>
//                             </div>

//                             {/* Awaiting Learner Sign-off */}
//                             <div className="fd-stat-card fd-stat-card--slate">
//                                 <div className="fd-stat-icon">
//                                     <Clock size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Pending Signatures</span>
//                                     <span className="fd-stat-value">{stats.awaitingSignoff}</span>
//                                 </div>
//                             </div>

//                             {/* Total Marked All-Time */}
//                             <div className="fd-stat-card fd-stat-card--green">
//                                 <div className="fd-stat-icon">
//                                     <ClipboardCheck size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Lifetime Scripts Handled</span>
//                                     <span className="fd-stat-value">{stats.totalMarked}</span>
//                                 </div>
//                             </div>

//                             {/* Active Classes */}
//                             <div className="fd-stat-card fd-stat-card--blue">
//                                 <div className="fd-stat-icon">
//                                     <Layers size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Active Classes</span>
//                                     <span className="fd-stat-value">{myCohorts.length}</span>
//                                 </div>
//                             </div>

//                             {/* Total Learners */}
//                             <div className="fd-stat-card fd-stat-card--emerald">
//                                 <div className="fd-stat-icon">
//                                     <Users size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Total Learners Enrolled</span>
//                                     <span className="fd-stat-value">
//                                         {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
//                                     </span>
//                                 </div>
//                             </div>

//                             {/* Facilitator Historical Time Metric */}
//                             <div className="fd-stat-card fd-stat-card--purple">
//                                 <div className="fd-stat-icon">
//                                     <Activity size={22} />
//                                 </div>
//                                 <div className="fd-stat-info">
//                                     <span className="fd-stat-label">Avg Pre-Mark Pace</span>
//                                     <span className="fd-stat-value">
//                                         {formatTimeSpent(stats.avgMarkingTime)}
//                                     </span>
//                                 </div>
//                             </div>

//                         </div>

//                         {/* COHORT GRID */}
//                         <section className="list-view">
//                             <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                                 <Layers size={20} /> Your Assigned Cohorts
//                             </h3>

//                             <div className="ld-cohort-grid">
//                                 {myCohorts.length > 0 ? myCohorts.map(cohort => {
//                                     const pendingCount = stats.pendingByCohort[cohort.id] || 0;

//                                     return (
//                                         <div key={cohort.id} className="ld-cohort-card">
//                                             <div className="ld-cohort-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
//                                                 <h3 className="ld-cohort-card__name" style={{ margin: 0 }}>{cohort.name}</h3>

//                                                 {pendingCount > 0 ? (
//                                                     <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
//                                                         <FileEdit size={10} /> {pendingCount} To Mark
//                                                     </span>
//                                                 ) : (
//                                                     <span className="ld-badge-active" style={{ whiteSpace: 'nowrap' }}>Facilitating</span>
//                                                 )}
//                                             </div>

//                                             <div className="ld-cohort-card__dates">
//                                                 <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
//                                             </div>

//                                             <div className="ld-cohort-card__roles">
//                                                 <div className="ld-role-row">
//                                                     <div className="ld-role-dot ld-role-dot--blue" />
//                                                     <span className="ld-role-label">Enrolled Learners:</span>
//                                                     <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
//                                                 </div>
//                                             </div>

//                                             <div className="ld-cohort-card__footer">
//                                                 <button
//                                                     className="ld-attendance-btn"
//                                                     onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
//                                                 >
//                                                     <ClipboardCheck size={14} /> Register
//                                                 </button>
//                                                 <button
//                                                     className="ld-portfolio-btn"
//                                                     onClick={() => navigate(`/cohorts/${cohort.id}`)}
//                                                 >
//                                                     View Class <ArrowRight size={14} />
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     );
//                                 }) : (
//                                     <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
//                                         <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
//                                         <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
//                                         <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
//                                     </div>
//                                 )}
//                             </div>
//                         </section>
//                     </div>
//                 )}

//                 {/* VIEW: ATTENDANCE HISTORY */}
//                 {activeTab === 'history' && (
//                     <div className="animate-fade-in">
//                         <AttendanceHistoryList facilitatorId={user?.uid} />
//                     </div>
//                 )}

//                 {/* VIEW: ASSESSMENTS */}
//                 {activeTab === 'assessments' && (
//                     <AssessmentManager />
//                 )}

//                 {/* VIEW: PROFILE */}
//                 {activeTab === 'profile' && (
//                     <div className="animate-fade-in">
//                         <FacilitatorProfileView
//                             profile={user}
//                             user={user}
//                             onUpdate={updateStaffProfile}
//                         />
//                     </div>
//                 )}
//             </div>
//         </main>
//     );
// };



// // // src/pages/FacilitatorDashboard/FacilitatorDashboard.tsx

// // import React, { useEffect, useMemo, useState } from 'react';
// // import { useStore } from '../../store/useStore';
// // import {
// //     Users,
// //     ArrowRight,
// //     ClipboardCheck,
// //     Calendar,
// //     Layers,
// //     Plus,
// //     Activity
// // } from 'lucide-react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import { AttendanceHistoryList } from './AttendanceRegister/AttendanceHistoryList';
// // import { AssessmentManager } from './AssessmentManager/AssessmentManager';
// // import { FacilitatorProfileView } from './FacilitatorProfileView/FacilitatorProfileView';
// // import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// // import '../AdminDashboard/AdminDashboard.css';
// // import './FacilitatorDashboard.css';

// // export const FacilitatorDashboard: React.FC = () => {

// //     const {
// //         user,
// //         cohorts,
// //         learners,
// //         programmes,
// //         staff,
// //         employers,
// //         fetchCohorts,
// //         fetchLearners,
// //         fetchProgrammes,
// //         fetchStaff,
// //         fetchEmployers,
// //         updateStaffProfile
// //     } = useStore();

// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Internal state to control the view, synced with URL
// //     const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

// //     // State for Facilitator Analytics
// //     const [avgMarkingTime, setAvgMarkingTime] = useState<number | null>(null);

// //     // ─── SYNC TABS WITH URL ───────────────────────────────────────────────────
// //     useEffect(() => {
// //         const path = location.pathname;
// //         if (path.includes('/profile')) {
// //             setActiveTab('profile');
// //         } else if (path.includes('/attendance') && !path.includes('/', 22)) {
// //             // Checks for generic attendance list, excludes specific cohort IDs
// //             setActiveTab('history');
// //         } else if (path.includes('/assessments')) {
// //             setActiveTab('assessments');
// //         } else {
// //             setActiveTab('dashboard');
// //         }
// //     }, [location.pathname]);

// //     // ─── SMART DATA HYDRATION ────────────────────────────────────────────────
// //     // This ensures data is fetched only once and then cached in the global store.
// //     useEffect(() => {
// //         // Cohorts are needed almost everywhere, so fetch if missing
// //         if (cohorts.length === 0) fetchCohorts();

// //         if (activeTab === 'dashboard') {
// //             if (learners.length === 0) fetchLearners();
// //         }

// //         if (activeTab === 'assessments') {
// //             if (programmes.length === 0) fetchProgrammes();
// //         }

// //         if (activeTab === 'profile') {
// //             if (employers.length === 0) fetchEmployers();
// //             if (staff.length === 0) fetchStaff();
// //         }
// //     }, [
// //         activeTab,
// //         fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers,
// //         cohorts.length, learners.length, programmes.length, employers.length, staff.length
// //     ]);

// //     // ─── FILTER COHORTS ───────────────────────────────────────────────────────
// //     const myCohorts = useMemo(() => {
// //         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
// //     }, [cohorts, user]);

// //     // ─── FETCH HISTORICAL MARKING DATA ────────────────────────────────────────
// //     useEffect(() => {
// //         const fetchHistoricalTime = async () => {
// //             if (!user?.uid) return;
// //             try {
// //                 // Fetch all scripts that THIS facilitator has marked
// //                 const q = query(
// //                     collection(db, 'learner_submissions'),
// //                     where('grading.facilitatorId', '==', user.uid)
// //                 );
// //                 const snap = await getDocs(q);

// //                 let totalTime = 0;
// //                 let count = 0;

// //                 snap.forEach(doc => {
// //                     const data = doc.data();
// //                     if (data.grading?.facilitatorTimeSpent && data.grading.facilitatorTimeSpent > 0) {
// //                         totalTime += data.grading.facilitatorTimeSpent;
// //                         count++;
// //                     }
// //                 });

// //                 if (count > 0) {
// //                     setAvgMarkingTime(totalTime / count);
// //                 } else {
// //                     setAvgMarkingTime(0);
// //                 }

// //             } catch (error) {
// //                 console.error("Failed to fetch historical marking times:", error);
// //             }
// //         };

// //         if (activeTab === 'dashboard') {
// //             fetchHistoricalTime();
// //         }
// //     }, [user?.uid, activeTab]);

// //     // Format seconds into readable text
// //     const formatTimeSpent = (seconds?: number | null) => {
// //         if (seconds === undefined || seconds === null || seconds === 0) return '—';
// //         const m = Math.floor(seconds / 60);
// //         if (m === 0) return '< 1m';
// //         const h = Math.floor(m / 60);
// //         if (h > 0) {
// //             const remM = m % 60;
// //             return `${h}h ${remM}m`;
// //         }
// //         return `${m}m`;
// //     };

// //     return (
// //         <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

// //             {/* MOBILE HEADER (Visible only on mobile/tablet via AdminDashboard.css) */}
// //             <div className="admin-mobile-header" style={{ margin: '-16px -16px 16px -16px' }}>
// //                 <div className="admin-mobile-header-left">
// //                     <div className="admin-mobile-title">Facilitator Portal</div>
// //                 </div>
// //                 <div className="admin-mobile-header-right">
// //                     <NotificationBell />
// //                 </div>
// //             </div>

// //             {/* DESKTOP DASHBOARD HEADER */}
// //             <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
// //                 <div className="header-title">
// //                     <h1>
// //                         {activeTab === 'dashboard' && 'My Cohorts'}
// //                         {activeTab === 'history' && 'Attendance History'}
// //                         {activeTab === 'profile' && 'My Profile'}
// //                         {activeTab === 'assessments' && 'Assessment Manager'}
// //                     </h1>
// //                     <p>
// //                         {activeTab === 'dashboard' && 'View and manage your assigned cohorts.'}
// //                         {activeTab === 'history' && 'Review past attendance registers.'}
// //                         {activeTab === 'profile' && 'View and update your profile information.'}
// //                         {activeTab === 'assessments' && 'Create and manage assessments for your learners.'}
// //                     </p>
// //                 </div>

// //                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '4px' }}>
// //                     {/* Action button rendering for assessments tab */}
// //                     {activeTab === 'assessments' && (
// //                         <button
// //                             className="mlab-btn mlab-btn--primary"
// //                             style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
// //                             onClick={() => navigate('/facilitator/assessments/builder')}
// //                         >
// //                             <Plus size={16} /> New Assessment
// //                         </button>
// //                     )}
// //                     <NotificationBell />
// //                 </div>
// //             </header>

// //             <div className="admin-content">

// //                 {/* VIEW: ACTIVE COHORTS (Dashboard) */}
// //                 {activeTab === 'dashboard' && (
// //                     <div className="animate-fade-in">

// //                         {/* Metrics Row */}
// //                         <div className="f-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
// //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
// //                                 <div className="f-stat-icon blue" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                                     <Layers size={24} />
// //                                 </div>
// //                                 <div className="stat-info">
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Active Classes</label>
// //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{myCohorts.length}</div>
// //                                 </div>
// //                             </div>

// //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
// //                                 <div className="f-stat-icon green" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                                     <Users size={24} />
// //                                 </div>
// //                                 <div className="stat-info">
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Learners</label>
// //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
// //                                         {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             {/* Facilitator Historical Time Metric */}
// //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid #0ea5e9' }}>
// //                                 <div className="f-stat-icon" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                                     <Activity size={24} />
// //                                 </div>
// //                                 <div className="stat-info">
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>My Avg Pre-Mark Pace</label>
// //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0ea5e9', fontFamily: 'var(--font-heading)' }}>
// //                                         {formatTimeSpent(avgMarkingTime)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {/* COHORT GRID */}
// //                         <section className="list-view">
// //                             <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// //                                 <Layers size={20} /> Your Assigned Cohorts
// //                             </h3>

// //                             <div className="ld-cohort-grid">
// //                                 {myCohorts.length > 0 ? myCohorts.map(cohort => (
// //                                     <div key={cohort.id} className="ld-cohort-card">
// //                                         <div className="ld-cohort-card__header">
// //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// //                                             <span className="ld-badge-active">Facilitating</span>
// //                                         </div>

// //                                         <div className="ld-cohort-card__dates">
// //                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
// //                                         </div>

// //                                         <div className="ld-cohort-card__roles">
// //                                             <div className="ld-role-row">
// //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// //                                                 <span className="ld-role-label">Enrolled Learners:</span>
// //                                                 <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
// //                                             </div>
// //                                         </div>

// //                                         <div className="ld-cohort-card__footer">
// //                                             <button
// //                                                 className="ld-attendance-btn"
// //                                                 onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
// //                                             >
// //                                                 <ClipboardCheck size={14} /> Register
// //                                             </button>
// //                                             <button
// //                                                 className="ld-portfolio-btn"
// //                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
// //                                             >
// //                                                 View Class <ArrowRight size={14} />
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 )) : (
// //                                     <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
// //                                         <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
// //                                         <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
// //                                         <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </section>
// //                     </div>
// //                 )}

// //                 {/* VIEW: ATTENDANCE HISTORY */}
// //                 {activeTab === 'history' && (
// //                     <div className="animate-fade-in">
// //                         <AttendanceHistoryList facilitatorId={user?.uid} />
// //                     </div>
// //                 )}

// //                 {/* VIEW: ASSESSMENTS */}
// //                 {activeTab === 'assessments' && (
// //                     <AssessmentManager />
// //                 )}

// //                 {/* VIEW: PROFILE */}
// //                 {activeTab === 'profile' && (
// //                     <div className="animate-fade-in">
// //                         <FacilitatorProfileView
// //                             profile={user}
// //                             user={user}
// //                             onUpdate={updateStaffProfile}
// //                         />
// //                     </div>
// //                 )}
// //             </div>
// //         </main>
// //     );
// // };



// // // // src/pages/FacilitatorDashboard/FacilitatorDashboard.tsx

// // // import React, { useEffect, useMemo, useState } from 'react';
// // // import { useStore } from '../../store/useStore';
// // // import {
// // //     Users,
// // //     ArrowRight,
// // //     ClipboardCheck,
// // //     Calendar,
// // //     Layers,
// // //     Plus,
// // //     Activity
// // // } from 'lucide-react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // import { db } from '../../lib/firebase';
// // // import { AttendanceHistoryList } from './AttendanceRegister/AttendanceHistoryList';
// // // import { AssessmentManager } from './AssessmentManager/AssessmentManager';
// // // import { FacilitatorProfileView } from './FacilitatorProfileView/FacilitatorProfileView';
// // // import '../AdminDashboard/AdminDashboard.css';
// // // import './FacilitatorDashboard.css';

// // // export const FacilitatorDashboard: React.FC = () => {

// // //     const {
// // //         user,
// // //         cohorts,
// // //         learners,
// // //         programmes,
// // //         staff,
// // //         employers,
// // //         fetchCohorts,
// // //         fetchLearners,
// // //         fetchProgrammes,
// // //         fetchStaff,
// // //         fetchEmployers,
// // //         updateStaffProfile
// // //     } = useStore();

// // //     const navigate = useNavigate();
// // //     const location = useLocation();

// // //     // Internal state to control the view, synced with URL
// // //     const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

// // //     // State for Facilitator Analytics
// // //     const [avgMarkingTime, setAvgMarkingTime] = useState<number | null>(null);

// // //     // ─── SYNC TABS WITH URL ───────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const path = location.pathname;
// // //         if (path.includes('/profile')) {
// // //             setActiveTab('profile');
// // //         } else if (path.includes('/attendance') && !path.includes('/', 22)) {
// // //             // Checks for generic attendance list, excludes specific cohort IDs
// // //             setActiveTab('history');
// // //         } else if (path.includes('/assessments')) {
// // //             setActiveTab('assessments');
// // //         } else {
// // //             setActiveTab('dashboard');
// // //         }
// // //     }, [location.pathname]);

// // //     // ─── SMART DATA HYDRATION ────────────────────────────────────────────────
// // //     // This ensures data is fetched only once and then cached in the global store.
// // //     useEffect(() => {
// // //         // Cohorts are needed almost everywhere, so fetch if missing
// // //         if (cohorts.length === 0) fetchCohorts();

// // //         if (activeTab === 'dashboard') {
// // //             if (learners.length === 0) fetchLearners();
// // //         }

// // //         if (activeTab === 'assessments') {
// // //             if (programmes.length === 0) fetchProgrammes();
// // //         }

// // //         if (activeTab === 'profile') {
// // //             if (employers.length === 0) fetchEmployers();
// // //             if (staff.length === 0) fetchStaff();
// // //         }
// // //     }, [
// // //         activeTab,
// // //         fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers,
// // //         cohorts.length, learners.length, programmes.length, employers.length, staff.length
// // //     ]);

// // //     // ─── FILTER COHORTS ───────────────────────────────────────────────────────
// // //     const myCohorts = useMemo(() => {
// // //         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
// // //     }, [cohorts, user]);

// // //     // ─── FETCH HISTORICAL MARKING DATA ────────────────────────────────────────
// // //     useEffect(() => {
// // //         const fetchHistoricalTime = async () => {
// // //             if (!user?.uid) return;
// // //             try {
// // //                 // Fetch all scripts that THIS facilitator has marked
// // //                 const q = query(
// // //                     collection(db, 'learner_submissions'),
// // //                     where('grading.facilitatorId', '==', user.uid)
// // //                 );
// // //                 const snap = await getDocs(q);

// // //                 let totalTime = 0;
// // //                 let count = 0;

// // //                 snap.forEach(doc => {
// // //                     const data = doc.data();
// // //                     if (data.grading?.facilitatorTimeSpent && data.grading.facilitatorTimeSpent > 0) {
// // //                         totalTime += data.grading.facilitatorTimeSpent;
// // //                         count++;
// // //                     }
// // //                 });

// // //                 if (count > 0) {
// // //                     setAvgMarkingTime(totalTime / count);
// // //                 } else {
// // //                     setAvgMarkingTime(0);
// // //                 }

// // //             } catch (error) {
// // //                 console.error("Failed to fetch historical marking times:", error);
// // //             }
// // //         };

// // //         if (activeTab === 'dashboard') {
// // //             fetchHistoricalTime();
// // //         }
// // //     }, [user?.uid, activeTab]);

// // //     // Format seconds into readable text
// // //     const formatTimeSpent = (seconds?: number | null) => {
// // //         if (seconds === undefined || seconds === null || seconds === 0) return '—';
// // //         const m = Math.floor(seconds / 60);
// // //         if (m === 0) return '< 1m';
// // //         const h = Math.floor(m / 60);
// // //         if (h > 0) {
// // //             const remM = m % 60;
// // //             return `${h}h ${remM}m`;
// // //         }
// // //         return `${m}m`;
// // //     };

// // //     return (
// // //         <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

// // //             {/* ADMIN ALIGNED DASHBOARD HEADER */}
// // //             <header className="dashboard-header">
// // //                 <div className="header-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
// // //                     <div>
// // //                         <h1>
// // //                             {activeTab === 'dashboard' && 'My Cohorts'}
// // //                             {activeTab === 'history' && 'Attendance History'}
// // //                             {activeTab === 'profile' && 'My Profile'}
// // //                             {activeTab === 'assessments' && 'Assessment Manager'}
// // //                         </h1>
// // //                         <p>
// // //                             {activeTab === 'dashboard' && 'View and manage your assigned cohorts.'}
// // //                             {activeTab === 'history' && 'Review past attendance registers.'}
// // //                             {activeTab === 'profile' && 'View and update your profile information.'}
// // //                             {activeTab === 'assessments' && 'Create and manage assessments for your learners.'}
// // //                         </p>
// // //                     </div>
// // //                     {/* Action button rendering for assessments tab */}
// // //                     {activeTab === 'assessments' && (
// // //                         <button
// // //                             className="mlab-btn mlab-btn--primary"
// // //                             style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
// // //                             onClick={() => navigate('/facilitator/assessments/builder')}
// // //                         >
// // //                             <Plus size={16} /> New Assessment
// // //                         </button>
// // //                     )}
// // //                 </div>
// // //             </header>

// // //             <div className="admin-content">

// // //                 {/* VIEW: ACTIVE COHORTS (Dashboard) */}
// // //                 {activeTab === 'dashboard' && (
// // //                     <div className="animate-fade-in">

// // //                         {/* Metrics Row */}
// // //                         <div className="f-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
// // //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
// // //                                 <div className="f-stat-icon blue" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                                     <Layers size={24} />
// // //                                 </div>
// // //                                 <div className="stat-info">
// // //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Active Classes</label>
// // //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{myCohorts.length}</div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
// // //                                 <div className="f-stat-icon green" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                                     <Users size={24} />
// // //                                 </div>
// // //                                 <div className="stat-info">
// // //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Learners</label>
// // //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
// // //                                         {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Facilitator Historical Time Metric */}
// // //                             <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid #0ea5e9' }}>
// // //                                 <div className="f-stat-icon" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                                     <Activity size={24} />
// // //                                 </div>
// // //                                 <div className="stat-info">
// // //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>My Avg Pre-Mark Pace</label>
// // //                                     <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0ea5e9', fontFamily: 'var(--font-heading)' }}>
// // //                                         {formatTimeSpent(avgMarkingTime)}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                         {/* COHORT GRID */}
// // //                         <section className="list-view">
// // //                             <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // //                                 <Layers size={20} /> Your Assigned Cohorts
// // //                             </h3>

// // //                             <div className="ld-cohort-grid">
// // //                                 {myCohorts.length > 0 ? myCohorts.map(cohort => (
// // //                                     <div key={cohort.id} className="ld-cohort-card">
// // //                                         <div className="ld-cohort-card__header">
// // //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// // //                                             <span className="ld-badge-active">Facilitating</span>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__dates">
// // //                                             <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__roles">
// // //                                             <div className="ld-role-row">
// // //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// // //                                                 <span className="ld-role-label">Enrolled Learners:</span>
// // //                                                 <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
// // //                                             </div>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__footer">
// // //                                             <button
// // //                                                 className="ld-attendance-btn"
// // //                                                 onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
// // //                                             >
// // //                                                 <ClipboardCheck size={14} /> Register
// // //                                             </button>
// // //                                             <button
// // //                                                 className="ld-portfolio-btn"
// // //                                                 onClick={() => navigate(`/cohorts/${cohort.id}`)}
// // //                                             >
// // //                                                 View Class <ArrowRight size={14} />
// // //                                             </button>
// // //                                         </div>
// // //                                     </div>
// // //                                 )) : (
// // //                                     <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
// // //                                         <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
// // //                                         <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
// // //                                         <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </section>
// // //                     </div>
// // //                 )}

// // //                 {/* VIEW: ATTENDANCE HISTORY */}
// // //                 {activeTab === 'history' && (
// // //                     <div className="animate-fade-in">
// // //                         <AttendanceHistoryList facilitatorId={user?.uid} />
// // //                     </div>
// // //                 )}

// // //                 {/* VIEW: ASSESSMENTS */}
// // //                 {activeTab === 'assessments' && (
// // //                     <AssessmentManager />
// // //                 )}

// // //                 {/* VIEW: PROFILE */}
// // //                 {activeTab === 'profile' && (
// // //                     <div className="animate-fade-in">
// // //                         <FacilitatorProfileView
// // //                             profile={user}
// // //                             user={user}
// // //                             onUpdate={updateStaffProfile}
// // //                         />
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </main>
// // //     );
// // // };
