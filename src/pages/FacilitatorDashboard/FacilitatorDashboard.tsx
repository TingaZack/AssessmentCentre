import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
    BookOpen,
    Users,
    ArrowRight,
    ClipboardCheck,
    Calendar,
    Layers,
    Plus,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AttendanceHistoryList } from './AttendanceRegister/AttendanceHistoryList';
import './FacilitatorDashboard.css';
import { AssessmentManager } from './AssessmentManager/AssessmentManager';
// 🚀 NEW: Import the profile view
import { FacilitatorProfileView } from './FacilitatorProfileView/FacilitatorProfileView';
import PageHeader from '../../components/common/PageHeader/PageHeader';

export const FacilitatorDashboard: React.FC = () => {
    // We need updateStaffProfile to allow the profile view to save changes
    const { user, cohorts, fetchCohorts, updateStaffProfile } = useStore();
    const navigate = useNavigate();
    const location = useLocation();

    // Internal state to control the view, synced with URL
    const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

    // 1. SYNC TABS WITH URL
    useEffect(() => {
        const path = location.pathname;
        if (path.includes('/profile')) {
            setActiveTab('profile');
        } else if (path.includes('/attendance') && !path.includes('/', 22)) {
            // Checks for generic attendance list, excludes specific cohort IDs
            setActiveTab('history');
        } else if (path.includes('/assessments')) {
            setActiveTab('assessments');
        } else {
            setActiveTab('dashboard');
        }
    }, [location.pathname]);

    // 2. FETCH DATA
    useEffect(() => {
        fetchCohorts();
    }, [fetchCohorts]);

    // 3. FILTER COHORTS
    const myCohorts = useMemo(() => {
        return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
    }, [cohorts, user]);

    return (
        <div className="dashboard-content">
            {/* <header className="dashboard-header" style={{ marginBottom: '2rem' }}>
                <div className="header-title">
                    <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
                        Welcome, {user?.fullName || 'Facilitator'}
                    </h1>
                    <p style={{ margin: 0, color: '#64748b' }}>Manage your assigned cohorts, take registers, and pre-mark scripts.</p>
                </div>
            </header> */}

            <PageHeader
                eyebrow="Facilitator Portal"
                title={activeTab === 'dashboard' ? 'My Cohorts' : activeTab === 'history' ? 'Attendance History' : activeTab === 'profile' ? 'My Profile' : 'Assessments'}
                description={activeTab === 'dashboard' ? 'View and manage your assigned cohorts.' : activeTab === 'history' ? 'Review past attendance registers.' : activeTab === 'profile' ? 'View and update your profile information.' : 'Create and manage assessments for your learners.'}
                actions={
                    <>
                        {activeTab === 'assessments' && <PageHeader.Btn
                            variant="primary"
                            icon={<Plus size={15} />}
                            onClick={() => { }}
                        >
                            New Assessment
                        </PageHeader.Btn>}
                    </>
                }
            />

            {/* VIEW: ACTIVE COHORTS (Dashboard) */}
            {activeTab === 'dashboard' && (
                <div className="animate-fade-in">

                    {/* Metrics Row */}
                    <div className="f-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div className="f-stat-icon blue" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Layers size={24} />
                            </div>
                            <div className="stat-info">
                                <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Active Classes</label>
                                <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{myCohorts.length}</div>
                            </div>
                        </div>

                        <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div className="f-stat-icon green" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={24} />
                            </div>
                            <div className="stat-info">
                                <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Learners</label>
                                <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
                                    {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COHORT GRID */}
                    <section className="list-view">
                        <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={20} /> Your Assigned Cohorts
                        </h3>

                        <div className="ld-cohort-grid">
                            {myCohorts.length > 0 ? myCohorts.map(cohort => (
                                <div key={cohort.id} className="ld-cohort-card">
                                    <div className="ld-cohort-card__header">
                                        <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                        <span className="ld-badge-active">Facilitating</span>
                                    </div>

                                    <div className="ld-cohort-card__dates">
                                        <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
                                    </div>

                                    <div className="ld-cohort-card__roles">
                                        <div className="ld-role-row">
                                            <div className="ld-role-dot ld-role-dot--blue" />
                                            <span className="ld-role-label">Enrolled Learners:</span>
                                            <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
                                        </div>
                                    </div>

                                    <div className="ld-cohort-card__footer">
                                        <button
                                            className="ld-attendance-btn"
                                            onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
                                        >
                                            <ClipboardCheck size={14} /> Register
                                        </button>
                                        <button
                                            className="ld-portfolio-btn"
                                            onClick={() => navigate(`/cohorts/${cohort.id}`)}
                                        >
                                            View Class <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
                                    <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                    <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
                                    <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* VIEW: ATTENDANCE HISTORY */}
            {activeTab === 'history' && (
                <div className="animate-fade-in">
                    <AttendanceHistoryList facilitatorId={user?.uid} />
                </div>
            )}

            {/* VIEW: ASSESSMENTS */}
            {activeTab === 'assessments' && (
                <AssessmentManager />
            )}

            {/* 🚀 NEW: VIEW PROFILE */}
            {activeTab === 'profile' && (
                <div className="animate-fade-in">
                    {/* Ensure updateStaffProfile is passed so changes can be saved to Firestore */}
                    <FacilitatorProfileView
                        profile={user}
                        user={user}
                        onUpdate={updateStaffProfile}
                    />
                </div>
            )}
        </div>
    );
};



// import React, { useEffect, useMemo, useState } from 'react';
// import { useStore } from '../../store/useStore';
// import {
//     BookOpen,
//     Users,
//     ArrowRight,
//     ClipboardCheck,
//     Calendar,
//     Layers,
//     UserCircle,
//     History
// } from 'lucide-react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { AttendanceHistoryList } from './AttendanceHistoryList';
// import './FacilitatorDashboard.css';
// import { AssessmentManager } from './AssessmentManager';

// export const FacilitatorDashboard: React.FC = () => {
//     const { user, cohorts, fetchCohorts } = useStore();
//     const navigate = useNavigate();
//     const location = useLocation();

//     // Internal state to control the view, synced with URL
//     const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

//     // 1. SYNC TABS WITH URL
//     useEffect(() => {
//         const path = location.pathname;
//         if (path.includes('/profile')) {
//             setActiveTab('profile');
//         } else if (path.includes('/attendance') && !path.includes('/', 22)) {
//             // Checks for generic attendance list, excludes specific cohort IDs
//             setActiveTab('history');
//         } else if (path.includes('/assessments')) {
//             setActiveTab('assessments');
//         } else {
//             setActiveTab('dashboard');
//         }
//     }, [location.pathname]);

//     // 2. FETCH DATA
//     useEffect(() => {
//         fetchCohorts();
//     }, [fetchCohorts]);

//     // 3. FILTER COHORTS
//     const myCohorts = useMemo(() => {
//         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
//     }, [cohorts, user]);

//     return (
//         <div className="dashboard-content" style={{ width: '100vh', position: 'relative', top: 0, left: 0, right: 0, bottom: 0 }}>
//             <header className="dashboard-header" style={{ marginBottom: '2rem' }}>
//                 <div className="header-title">
//                     <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
//                         Welcome, {user?.fullName || 'Facilitator'}
//                     </h1>
//                     <p style={{ margin: 0, color: '#64748b' }}>Manage your assigned cohorts, take registers, and pre-mark scripts.</p>
//                 </div>
//             </header>

//             {/* VIEW: ACTIVE COHORTS (Dashboard) */}
//             {activeTab === 'dashboard' && (
//                 <div className="animate-fade-in">

//                     {/* Metrics Row */}
//                     <div className="f-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
//                         <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
//                             <div className="f-stat-icon blue" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                 <Layers size={24} />
//                             </div>
//                             <div className="stat-info">
//                                 <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Active Classes</label>
//                                 <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{myCohorts.length}</div>
//                             </div>
//                         </div>

//                         <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
//                             <div className="f-stat-icon green" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                 <Users size={24} />
//                             </div>
//                             <div className="stat-info">
//                                 <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Learners</label>
//                                 <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
//                                     {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
//                                 </div>
//                             </div>
//                         </div>
//                     </div>

//                     {/* 🚀 NEW: COHORT GRID (Replacing the old table) */}
//                     <section className="list-view">
//                         <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                             <Layers size={20} /> Your Assigned Cohorts
//                         </h3>

//                         <div className="ld-cohort-grid">
//                             {myCohorts.length > 0 ? myCohorts.map(cohort => (
//                                 <div key={cohort.id} className="ld-cohort-card">
//                                     <div className="ld-cohort-card__header">
//                                         <h3 className="ld-cohort-card__name">{cohort.name}</h3>
//                                         <span className="ld-badge-active">Facilitating</span>
//                                     </div>

//                                     <div className="ld-cohort-card__dates">
//                                         <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
//                                     </div>

//                                     <div className="ld-cohort-card__roles">
//                                         <div className="ld-role-row">
//                                             <div className="ld-role-dot ld-role-dot--blue" />
//                                             <span className="ld-role-label">Enrolled Learners:</span>
//                                             <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
//                                         </div>
//                                     </div>

//                                     <div className="ld-cohort-card__footer">
//                                         <button
//                                             className="ld-attendance-btn"
//                                             onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
//                                         >
//                                             <ClipboardCheck size={14} /> Register
//                                         </button>
//                                         <button
//                                             className="ld-portfolio-btn"
//                                             // onClick={() => navigate(`/facilitator/cohort/${cohort.id}`)}
//                                             onClick={() => navigate(`/cohorts/${cohort.id}`)}
//                                         >
//                                             View Class <ArrowRight size={14} />
//                                         </button>
//                                         {/* <button
//                                             className="ld-portfolio-btn"
//                                             onClick={() => navigate(`/facilitator/cohort/${cohort.id}/portfolio`)}
//                                         >
//                                             View Class <ArrowRight size={14} />
//                                         </button> */}
//                                     </div>
//                                 </div>
//                             )) : (
//                                 <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
//                                     <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
//                                     <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
//                                     <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
//                                 </div>
//                             )}
//                         </div>
//                     </section>
//                 </div>
//             )}

//             {/* VIEW: ATTENDANCE HISTORY */}
//             {activeTab === 'history' && (
//                 <div className="animate-fade-in">
//                     <AttendanceHistoryList facilitatorId={user?.uid} />
//                 </div>
//             )}

//             {/* VIEW: ASSESSMENTS */}
//             {activeTab === 'assessments' && (
//                 <AssessmentManager />
//             )}

//             {/* VIEW: PROFILE */}
//             {activeTab === 'profile' && (
//                 <div className="animate-fade-in">
//                     <div className="f-profile-card">
//                         <h3 className="section-title">My Profile</h3>
//                         <div className="profile-details-grid" style={{ background: 'white', color: 'black', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
//                             <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '1.5rem' }}>
//                                 <div>
//                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Full Name</label>
//                                     <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{user?.fullName}</div>
//                                 </div>
//                                 <div>
//                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Email Address</label>
//                                     <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{user?.email}</div>
//                                 </div>
//                                 <div>
//                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>System Role</label>
//                                     <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600 }}>
//                                         {user?.role?.toUpperCase()}
//                                     </div>
//                                 </div>
//                             </div>
//                             {user?.signatureUrl ? (
//                                 <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
//                                     <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: '#334155' }}>Registered Digital Signature</label>
//                                     <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'inline-block' }}>
//                                         <img src={user.signatureUrl} alt="Signature" style={{ maxHeight: '80px', display: 'block' }} />
//                                     </div>
//                                     <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0 0 0' }}>Used for verifying attendance registers and pre-marking scripts.</p>
//                                 </div>
//                             ) : (
//                                 <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#9f1239' }}>
//                                     <strong>Missing Signature:</strong> You have not uploaded a digital signature yet. Please contact an administrator.
//                                 </div>
//                             )}
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };


// // import React, { useEffect, useMemo, useState } from 'react';
// // import { useStore } from '../../store/useStore';
// // import {
// //     BookOpen,
// //     Users,
// //     ArrowRight,
// //     ClipboardCheck,
// // } from 'lucide-react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { AttendanceHistoryList } from './AttendanceHistoryList';
// // import './FacilitatorDashboard.css';
// // import { AssessmentManager } from './AssessmentManager';

// // export const FacilitatorDashboard: React.FC = () => {
// //     const { user, cohorts, fetchCohorts } = useStore();
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Internal state to control the view, synced with URL
// //     const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

// //     // 1. SYNC TABS WITH URL
// //     // This ensures that when you click the Sidebar, the correct content loads
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

// //     // 2. FETCH DATA
// //     useEffect(() => {
// //         fetchCohorts();
// //     }, [fetchCohorts]);

// //     // 3. FILTER COHORTS
// //     const myCohorts = useMemo(() => {
// //         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
// //     }, [cohorts, user]);

// //     // // 4. NAVIGATION HANDLER
// //     // const handleTabSwitch = (tab: 'dashboard' | 'history' | 'profile') => {
// //     //     if (tab === 'dashboard') navigate('/facilitator/dashboard');
// //     //     if (tab === 'history') navigate('/facilitator/attendance');
// //     //     if (tab === 'profile') navigate('/facilitator/profile');
// //     // };

// //     return (
// //         <div className="dashboard-content">
// //             <header className="dashboard-header" style={{ marginBottom: '2rem' }}>
// //                 <div className="header-title">
// //                     <h1>Welcome, {user?.fullName || 'Facilitator'}</h1>
// //                     <p>Manage your assigned cohorts and track learner progress.</p>
// //                 </div>
// //             </header>

// //             {/* TOP TAB NAVIGATION */}
// //             {/* These tabs mirror the sidebar but provide quick access within the workspace */}
// //             {/* <div className="f-tabs" style={tabContainerStyle}>
// //                 <button
// //                     className={`f-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
// //                     onClick={() => handleTabSwitch('dashboard')}
// //                     style={tabButtonStyle(activeTab === 'dashboard')}
// //                 >
// //                     <LayoutDashboard size={18} />
// //                     My Active Cohorts
// //                 </button>
// //                 <button
// //                     className={`f-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
// //                     onClick={() => handleTabSwitch('history')}
// //                     style={tabButtonStyle(activeTab === 'history')}
// //                 >
// //                     <History size={18} />
// //                     Attendance History
// //                 </button>
// //                 <button
// //                     className={`f-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
// //                     onClick={() => handleTabSwitch('profile')}
// //                     style={tabButtonStyle(activeTab === 'profile')}
// //                 >
// //                     <UserCircle size={18} />
// //                     My Profile
// //                 </button>
// //             </div> */}

// //             {/* VIEW: ACTIVE COHORTS (Dashboard) */}
// //             {activeTab === 'dashboard' && (
// //                 <div className="animate-fade-in">
// //                     <div className="f-stats-grid">
// //                         <div className="stat-card">
// //                             <div className="f-stat-icon blue">
// //                                 <BookOpen size={24} />
// //                             </div>
// //                             <div className="stat-info">
// //                                 <label>Active Classes</label>
// //                                 <div className="value">{myCohorts.length}</div>
// //                             </div>
// //                         </div>
// //                         <div className="stat-card">
// //                             <div className="f-stat-icon green">
// //                                 <Users size={24} />
// //                             </div>
// //                             <div className="stat-info">
// //                                 <label>Total Learners</label>
// //                                 <div className="value">
// //                                     {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <section className="list-view">
// //                         <h3 className="section-title">Your Assigned Cohorts</h3>
// //                         <div className="f-table-container">
// //                             {myCohorts.length > 0 ? (
// //                                 <table className="f-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Cohort Name</th>
// //                                             <th>Start Date</th>
// //                                             <th>End Date</th>
// //                                             <th>Learners</th>
// //                                             <th style={{ textAlign: 'right' }}>Actions</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {myCohorts.map((cohort) => (
// //                                             <tr key={cohort.id}>
// //                                                 <td className="f-col-name">{cohort.name}</td>
// //                                                 <td className="f-col-date">{cohort.startDate}</td>
// //                                                 <td className="f-col-date">{cohort.endDate}</td>
// //                                                 <td>
// //                                                     <span className="f-badge">
// //                                                         <Users size={14} style={{ marginRight: '6px' }} />
// //                                                         {cohort.learnerIds?.length || 0}
// //                                                     </span>
// //                                                 </td>
// //                                                 <td className="f-col-actions">
// //                                                     <button
// //                                                         className="btn btn-outline small"
// //                                                         onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
// //                                                         title="Mark Attendance"
// //                                                     >
// //                                                         <ClipboardCheck size={16} /> Attendance
// //                                                     </button>
// //                                                     <button
// //                                                         className="btn btn-primary small"
// //                                                         onClick={() => navigate(`/facilitator/cohort/${cohort.id}`)}
// //                                                     >
// //                                                         View Class <ArrowRight size={16} />
// //                                                     </button>
// //                                                 </td>
// //                                             </tr>
// //                                         ))}
// //                                     </tbody>
// //                                 </table>
// //                             ) : (
// //                                 <div className="f-empty-state" style={{ border: 'none', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
// //                                     <p>No active cohorts assigned to your profile.</p>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     </section>
// //                 </div>
// //             )}

// //             {/* VIEW: ATTENDANCE HISTORY */}
// //             {activeTab === 'history' && (
// //                 <div className="animate-fade-in">
// //                     <AttendanceHistoryList facilitatorId={user?.uid} />
// //                 </div>
// //             )}

// //             {activeTab === 'assessments' && (
// //                 <AssessmentManager />
// //             )}

// //             {/* VIEW: PROFILE */}
// //             {activeTab === 'profile' && (
// //                 <div className="animate-fade-in">
// //                     <div className="f-profile-card">
// //                         <h3 className="section-title">My Profile</h3>
// //                         <div className="profile-details-grid" style={{ background: 'white', color: 'black', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
// //                             <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '1.5rem' }}>
// //                                 <div>
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Full Name</label>
// //                                     <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{user?.fullName}</div>
// //                                 </div>
// //                                 <div>
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Email Address</label>
// //                                     <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{user?.email}</div>
// //                                 </div>
// //                                 <div>
// //                                     <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>System Role</label>
// //                                     <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600 }}>
// //                                         {user?.role?.toUpperCase()}
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             {user?.signatureUrl ? (
// //                                 <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
// //                                     <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: '#334155' }}>Registered Digital Signature</label>
// //                                     <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'inline-block' }}>
// //                                         <img src={user.signatureUrl} alt="Signature" style={{ maxHeight: '80px', display: 'block' }} />
// //                                     </div>
// //                                     <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>Used for verifying attendance registers.</p>
// //                                 </div>
// //                             ) : (
// //                                 <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fecaca', color: '#9f1239' }}>
// //                                     <strong>Missing Signature:</strong> You have not uploaded a digital signature yet. Please contact an administrator.
// //                                 </div>
// //                             )}
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // // --- INLINE STYLES FOR TABS ---

// // // const tabContainerStyle: React.CSSProperties = {
// // //     display: 'flex',
// // //     gap: '2rem',
// // //     marginBottom: '2rem',
// // //     borderBottom: '1px solid #e2e8f0'
// // // };

// // // const tabButtonStyle = (isActive: boolean): React.CSSProperties => ({
// // //     padding: '1rem 0',
// // //     background: 'none',
// // //     border: 'none',
// // //     borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
// // //     color: isActive ? '#2563eb' : '#64748b',
// // //     fontWeight: 600,
// // //     fontSize: '0.95rem',
// // //     cursor: 'pointer',
// // //     display: 'flex',
// // //     alignItems: 'center',
// // //     gap: '8px',
// // //     transition: 'all 0.2s ease',
// // //     outline: 'none'
// // // });


// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { useStore } from '../../store/useStore';
// // // import { BookOpen, Users, ArrowRight, ClipboardCheck } from 'lucide-react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { auth } from '../../lib/firebase';
// // // import { signOut } from 'firebase/auth';
// // // import './FacilitatorDashboard.css';

// // // export const FacilitatorDashboard: React.FC = () => {
// // //     const { user, cohorts, fetchCohorts, setUser } = useStore();
// // //     const navigate = useNavigate();
// // //     const [currentNav, setCurrentNav] = useState('dashboard');

// // //     useEffect(() => {
// // //         fetchCohorts();
// // //     }, [fetchCohorts]);

// // //     const myCohorts = useMemo(() => {
// // //         return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
// // //     }, [cohorts, user]);

// // //     const handleLogout = async () => {
// // //         await signOut(auth);
// // //         setUser(null);
// // //         navigate('/login');
// // //     };

// // //     return (
// // //         <div className="admin-layout">
// // //             {/* <FacilitatorSidebar
// // //                 currentNav={currentNav}
// // //                 onNavChange={setCurrentNav}
// // //                 onLogout={handleLogout}
// // //             /> */}

// // //             <main className="main-wrapper">
// // //                 <header className="dashboard-header">
// // //                     <div className="header-title">
// // //                         <h1>Welcome, {user?.fullName || 'Facilitator'}</h1>
// // //                         <p>Manage your assigned cohorts and track learner progress.</p>
// // //                     </div>
// // //                 </header>

// // //                 <div className="admin-content">
// // //                     {currentNav === 'dashboard' && (
// // //                         <>
// // //                             <div className="f-stats-grid">
// // //                                 <div className="stat-card">
// // //                                     <div className="f-stat-icon blue">
// // //                                         <BookOpen size={24} />
// // //                                     </div>
// // //                                     <div className="stat-info">
// // //                                         <label>Active Classes</label>
// // //                                         <div className="value">{myCohorts.length}</div>
// // //                                     </div>
// // //                                 </div>
// // //                                 <div className="stat-card">
// // //                                     <div className="f-stat-icon green">
// // //                                         <Users size={24} />
// // //                                     </div>
// // //                                     <div className="stat-info">
// // //                                         <label>Total Learners</label>
// // //                                         <div className="value">
// // //                                             {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
// // //                                         </div>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Assigned Cohorts Section */}
// // //                             <section className="list-view">
// // //                                 <h3 className="section-title">Your Assigned Cohorts</h3>

// // //                                 <div className="f-table-container">
// // //                                     {myCohorts.length > 0 ? (
// // //                                         <table className="f-table">
// // //                                             <thead>
// // //                                                 <tr>
// // //                                                     <th>Cohort Name</th>
// // //                                                     <th>Start Date</th>
// // //                                                     <th>End Date</th>
// // //                                                     <th>Learners</th>
// // //                                                     <th style={{ textAlign: 'right' }}>Actions</th>
// // //                                                 </tr>
// // //                                             </thead>
// // //                                             <tbody>
// // //                                                 {myCohorts.map((cohort) => (
// // //                                                     <tr key={cohort.id}>
// // //                                                         <td className="f-col-name">{cohort.name}</td>
// // //                                                         <td className="f-col-date">{cohort.startDate}</td>
// // //                                                         <td className="f-col-date">{cohort.endDate}</td>
// // //                                                         <td>
// // //                                                             <span className="f-badge">
// // //                                                                 <Users size={14} style={{ marginRight: '6px' }} />
// // //                                                                 {cohort.learnerIds?.length || 0}
// // //                                                             </span>
// // //                                                         </td>
// // //                                                         <td className="f-col-actions">
// // //                                                             <button
// // //                                                                 className="btn btn-outline small"
// // //                                                                 onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
// // //                                                                 title="Mark Attendance"
// // //                                                             >
// // //                                                                 <ClipboardCheck size={16} /> Attendance
// // //                                                             </button>
// // //                                                             <button
// // //                                                                 className="btn btn-primary small"
// // //                                                                 onClick={() => navigate(`/facilitator/cohort/${cohort.id}`)}
// // //                                                             >
// // //                                                                 View Class <ArrowRight size={16} />
// // //                                                             </button>
// // //                                                         </td>
// // //                                                     </tr>
// // //                                                 ))}
// // //                                             </tbody>
// // //                                         </table>
// // //                                     ) : (
// // //                                         <div className="f-empty-state" style={{ border: 'none' }}>
// // //                                             <p>No active cohorts assigned to your profile.</p>
// // //                                         </div>
// // //                                     )}
// // //                                 </div>
// // //                             </section>
// // //                         </>
// // //                     )}

// // //                     {currentNav === 'attendance' && (
// // //                         <div className="f-empty-state">
// // //                             <h3>Attendance Module</h3>
// // //                             <p>Select a cohort from the dashboard to log daily attendance.</p>
// // //                         </div>
// // //                     )}

// // //                     {currentNav === 'profile' && (
// // //                         <div className="f-profile-card">
// // //                             <h3>My Profile</h3>
// // //                             <p><strong>Name:</strong> {user?.fullName}</p>
// // //                             <p><strong>Email:</strong> {user?.email}</p>
// // //                             <p><strong>Role:</strong> {user?.role}</p>
// // //                             {user?.signatureUrl && (
// // //                                 <div style={{ marginTop: '1rem' }}>
// // //                                     <label>Registered Digital Signature:</label>
// // //                                     <img src={user.signatureUrl} alt="Signature" className="f-signature-preview" />
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };