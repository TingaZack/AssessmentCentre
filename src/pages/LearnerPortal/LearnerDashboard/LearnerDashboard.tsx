// src/pages/LearnerPortal/LearnerDashboard.tsx
// Styled to align with mLab Corporate Identity Brand Guide 2019
// All visual styling lives in LearnerDashboard.css

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import './LearnerDashboard.css';

const LearnerDashboard: React.FC = () => {
    const navigate  = useNavigate();
    const location  = useLocation();
    const store     = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, [store.fetchCohorts, store.fetchStaff, store.fetchLearners]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    // ─── Data ─────────────────────────────────────────────────────────────────
    const myLearnerProfile = store.learners.find(l =>
        l.authUid === store.user?.uid || l.email === store.user?.email
    );

    const myCohorts = store.cohorts.filter(c =>
        c.id === myLearnerProfile?.cohortId ||
        c.learnerIds?.includes(myLearnerProfile?.id || '')
    );

    const getStaffName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar
                role={store.user?.role}
                currentNav={currentNav}
                setCurrentNav={setCurrentNav}
                onLogout={handleLogout}
            />

            <main className="main-wrapper" style={{ width: '100%' }}>
                <header className="dashboard-header">
                    <div className="header-title">
                        <h1 className="ld-page-title">
                            {currentNav === 'dashboard' && 'My Active Classes'}
                            {currentNav === 'profile'   && 'My Personal Profile'}
                        </h1>
                        <p className="ld-page-sub">
                            Welcome back, {store.user?.fullName || 'Learner'}
                        </p>
                    </div>
                </header>

                <div className="admin-content">

                    {/* ── Dashboard Tab ────────────────────────────────────── */}
                    {currentNav === 'dashboard' && (
                        <div className="ld-animate">

                            <h2 className="ld-section-title">
                                <Layers size={16} /> Active Cohorts
                            </h2>

                            <div className="ld-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="ld-cohort-card">

                                        {/* Card Header */}
                                        <div className="ld-cohort-card__header">
                                            <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                            <span className="ld-badge-active">Active</span>
                                        </div>

                                        {/* Date Range */}
                                        <div className="ld-cohort-card__dates">
                                            <Calendar size={13} />
                                            {cohort.startDate} — {cohort.endDate}
                                        </div>

                                        {/* Staff Roles */}
                                        <div className="ld-cohort-card__roles">
                                            <div className="ld-role-row">
                                                <div className="ld-role-dot ld-role-dot--blue" />
                                                <span className="ld-role-label">Facilitator:</span>
                                                <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
                                            </div>
                                            <div className="ld-role-row">
                                                <div className="ld-role-dot ld-role-dot--red" />
                                                <span className="ld-role-label">Assessor:</span>
                                                <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
                                            </div>
                                        </div>

                                        {/* Footer CTA */}
                                        <div className="ld-cohort-card__footer">
                                            <button
                                                className="ld-portfolio-btn"
                                                onClick={() => navigate(`/sor/${myLearnerProfile?.id}`)}
                                            >
                                                Open Portfolio <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Empty State */}
                                {myCohorts.length === 0 && (
                                    <div className="ld-empty">
                                        <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                        <span className="ld-empty__title">No Classes Found</span>
                                        <p className="ld-empty__desc">
                                            You haven't been assigned to a class yet.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Profile Tab ──────────────────────────────────────── */}
                    {currentNav === 'profile' && (
                        <LearnerProfileView
                            profile={myLearnerProfile}
                            user={store.user}
                            onUpdate={store.updateLearner}
                        />
                    )}

                </div>
            </main>
        </div>
    );
};

export default LearnerDashboard;



// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { signOut } from "firebase/auth";
// import {
//     Calendar,
//     BookOpen,
//     Layers,
//     User as UserIcon,
//     Mail,
//     Fingerprint,
//     GraduationCap,
// } from "lucide-react";
// import "./LearnerDashboard.css";
// import { useStore } from "../../../store/useStore";
// import { auth } from "../../../lib/firebase";
// import { Sidebar } from "../../../components/dashboard/Sidebar";
// export const LearnerDashboard: React.FC = () => {
//     const {
//         user,
//         cohorts,
//         staff,
//         learners,
//         fetchCohorts,
//         fetchStaff,
//         fetchLearners,
//     } = useStore();
//     const navigate = useNavigate();

//     // State to manage navigation within the dashboard
//     const [currentNav, setCurrentNav] = useState<"dashboard" | "profile">(
//         "dashboard",
//     );

//     useEffect(() => {
//         fetchCohorts();
//         fetchStaff();
//         fetchLearners();
//     }, [fetchCohorts, fetchStaff, fetchLearners]);

//     const handleLogout = async () => {
//         await signOut(auth);
//         navigate("/login");
//     };

//     // Find the learner profile using the linked authUid or email bridge
//     const myLearnerProfile = learners.find(
//         (l) => l.authUid === user?.uid || l.email === user?.email,
//     );

//     // Filter cohorts where the learner is either explicitly assigned by ID or linked via the cohortId field
//     const myCohorts = cohorts.filter(
//         (c) =>
//             c.id === myLearnerProfile?.cohortId ||
//             c.learnerIds?.includes(myLearnerProfile?.id || ""),
//     );

//     const getStaffName = (id: string) =>
//         staff.find((s) => s.id === id)?.fullName || "Unassigned";

//     return (
//         <div className="dashboard-container">
//             <Sidebar
//                 currentNav={currentNav}
//                 setCurrentNav={setCurrentNav}
//                 onLogout={handleLogout}
//             />

//             <main className="main-wrapper" style={{ width: "100%" }}>
//                 <header className="dashboard-header">
//                     <div className="header-title">
//                         <h1>Learner Dashboard</h1>
//                         <p>Manage your courses and assessments</p>
//                     </div>
//                 </header>

//                 <div className="admin-content">
//                     {currentNav === "dashboard" && (
//                         <div className="dashboard-view animate-fade-in">
//                             <header className="view-header">
//                                 <div className="header-text">
//                                     <h1>My Active Classes</h1>
//                                     <p>
//                                         Welcome back, <strong>{user?.fullName}</strong>. Select a
//                                         class to view your portfolio and assessments.
//                                     </p>
//                                 </div>
//                             </header>

//                             <div className="mlab-cohort-grid">
//                                 {myCohorts.map((cohort) => (
//                                     <div
//                                         key={cohort.id}
//                                         className="mlab-cohort-card learner-card"
//                                     >
//                                         <div className="mlab-cohort-card__header">
//                                             <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
//                                             <span className="status-badge active">In Progress</span>
//                                         </div>

//                                         <div className="mlab-cohort-card__dates">
//                                             <Calendar size={14} />
//                                             <span>
//                                                 {cohort.startDate} — {cohort.endDate}
//                                             </span>
//                                         </div>

//                                         <div className="mlab-cohort-card__roles">
//                                             <div className="mlab-role-row">
//                                                 <div className="mlab-role-dot mlab-role-dot--blue" />
//                                                 <span className="mlab-role-label">Facilitator:</span>
//                                                 <span className="mlab-role-name">
//                                                     {getStaffName(cohort.facilitatorId)}
//                                                 </span>
//                                             </div>
//                                             <div className="mlab-role-row">
//                                                 <div className="mlab-role-dot mlab-role-dot--red" />
//                                                 <span className="mlab-role-label">Assessor:</span>
//                                                 <span className="mlab-role-name">
//                                                     {getStaffName(cohort.assessorId)}
//                                                 </span>
//                                             </div>
//                                         </div>

//                                         <div className="mlab-cohort-card__footer">
//                                             <button
//                                                 className="mlab-btn mlab-btn--blue w-full"
//                                                 onClick={() => navigate(`/sor/${myLearnerProfile?.id}`)}
//                                             >
//                                                 <BookOpen size={16} /> Open My Portfolio
//                                             </button>
//                                         </div>
//                                     </div>
//                                 ))}

//                                 {myCohorts.length === 0 && (
//                                     <div className="mlab-cohort-empty">
//                                         <Layers size={48} />
//                                         <p className="mlab-cohort-empty__title">
//                                             No Classes Assigned
//                                         </p>
//                                         <p className="mlab-cohort-empty__desc">
//                                             You are not currently enrolled in any active cohorts.
//                                         </p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {currentNav === "profile" && (
//                         <div className="dashboard-view animate-fade-in">
//                             <header className="view-header">
//                                 <div className="header-text">
//                                     <h1>Personal Profile</h1>
//                                     <p>Your registered information and qualification details.</p>
//                                 </div>
//                             </header>

//                             <div className="profile-card">
//                                 <div className="profile-card__main">
//                                     <div className="profile-avatar">
//                                         <UserIcon size={40} />
//                                     </div>
//                                     <div className="profile-info">
//                                         <h2>{user?.fullName}</h2>
//                                         <div className="profile-badge">LEARNER ACCOUNT</div>
//                                     </div>
//                                 </div>

//                                 <div className="profile-details-grid">
//                                     <div className="detail-item">
//                                         <div className="detail-label">
//                                             <Mail size={14} /> Email Address
//                                         </div>
//                                         <div className="detail-value">{user?.email}</div>
//                                     </div>

//                                     <div className="detail-item">
//                                         <div className="detail-label">
//                                             <Fingerprint size={14} /> ID / National ID
//                                         </div>
//                                         <div className="detail-value">
//                                             {myLearnerProfile?.idNumber || "Not available"}
//                                         </div>
//                                     </div>

//                                     <div className="detail-item">
//                                         <div className="detail-label">
//                                             <GraduationCap size={14} /> Qualification
//                                         </div>
//                                         <div className="detail-value">
//                                             {myLearnerProfile?.qualification?.name ||
//                                                 "Qualification not yet assigned"}
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div className="profile-footer-note">
//                                     <p>
//                                         To update your email or ID number, please contact your
//                                         administrator.
//                                     </p>
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </main>

//             {/* <Sidebar
//                 role={user?.role} 
//                 currentNav={currentNav} 
//                 setCurrentNav={setCurrentNav} 
//                 onLogout={handleLogout} 
//             />

//             <main className="main-content">

//                 {currentNav === 'dashboard' && (
//                     <div className="dashboard-view animate-fade-in">
//                         <header className="view-header">
//                             <div className="header-text">
//                                 <h1>My Active Classes</h1>
//                                 <p>Welcome back, <strong>{user?.fullName}</strong>. Select a class to view your portfolio and assessments.</p>
//                             </div>
//                         </header>

//                         <div className="mlab-cohort-grid">
//                             {myCohorts.map(cohort => (
//                                 <div key={cohort.id} className="mlab-cohort-card learner-card">
//                                     <div className="mlab-cohort-card__header">
//                                         <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
//                                         <span className="status-badge active">In Progress</span>
//                                     </div>

//                                     <div className="mlab-cohort-card__dates">
//                                         <Calendar size={14} />
//                                         <span>{cohort.startDate} — {cohort.endDate}</span>
//                                     </div>

//                                     <div className="mlab-cohort-card__roles">
//                                         <div className="mlab-role-row">
//                                             <div className="mlab-role-dot mlab-role-dot--blue" />
//                                             <span className="mlab-role-label">Facilitator:</span>
//                                             <span className="mlab-role-name">{getStaffName(cohort.facilitatorId)}</span>
//                                         </div>
//                                         <div className="mlab-role-row">
//                                             <div className="mlab-role-dot mlab-role-dot--red" />
//                                             <span className="mlab-role-label">Assessor:</span>
//                                             <span className="mlab-role-name">{getStaffName(cohort.assessorId)}</span>
//                                         </div>
//                                     </div>

//                                     <div className="mlab-cohort-card__footer">
//                                         <button
//                                             className="mlab-btn mlab-btn--blue w-full"
//                                             onClick={() => navigate(`/sor/${myLearnerProfile?.id}`)}
//                                         >
//                                             <BookOpen size={16} /> Open My Portfolio
//                                         </button>
//                                     </div>
//                                 </div>
//                             ))}

//                             {myCohorts.length === 0 && (
//                                 <div className="mlab-cohort-empty">
//                                     <Layers size={48} />
//                                     <p className="mlab-cohort-empty__title">No Classes Assigned</p>
//                                     <p className="mlab-cohort-empty__desc">
//                                         You are not currently enrolled in any active cohorts.
//                                     </p>
//                                 </div>
//                             )}
//                         </div>
//                     </div>
//                 )}


//                 {currentNav === 'profile' && (
//                     <div className="dashboard-view animate-fade-in">
//                         <header className="view-header">
//                             <div className="header-text">
//                                 <h1>Personal Profile</h1>
//                                 <p>Your registered information and qualification details.</p>
//                             </div>
//                         </header>

//                         <div className="profile-card">
//                             <div className="profile-card__main">
//                                 <div className="profile-avatar">
//                                     <UserIcon size={40} />
//                                 </div>
//                                 <div className="profile-info">
//                                     <h2>{user?.fullName}</h2>
//                                     <div className="profile-badge">LEARNER ACCOUNT</div>
//                                 </div>
//                             </div>

//                             <div className="profile-details-grid">
//                                 <div className="detail-item">
//                                     <div className="detail-label"><Mail size={14} /> Email Address</div>
//                                     <div className="detail-value">{user?.email}</div>
//                                 </div>
                                
//                                 <div className="detail-item">
//                                     <div className="detail-label"><Fingerprint size={14} /> ID / National ID</div>
//                                     <div className="detail-value">
//                                         {myLearnerProfile?.idNumber || 'Not available'}
//                                     </div>
//                                 </div>

//                                 <div className="detail-item">
//                                     <div className="detail-label"><GraduationCap size={14} /> Qualification</div>
//                                     <div className="detail-value">
//                                         {myLearnerProfile?.qualification?.name || 'Qualification not yet assigned'}
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="profile-footer-note">
//                                 <p>To update your email or ID number, please contact your administrator.</p>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </main> */}
//         </div>
//     );
// };

// // import React, { useState, useEffect } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import {
// //     Calendar,
// //     BookOpen,
// //     Layers,
// //     User as UserIcon,
// //     Mail,
// //     Fingerprint,
// //     GraduationCap
// // } from 'lucide-react';
// // import './LearnerDashboard.css'; // Ensure this contains the layout styles
// // import { useStore } from '../../../store/useStore';
// // import { auth } from '../../../lib/firebase';
// // import { Sidebar } from '../../../components/dashboard/Sidebar';

// // export const LearnerDashboard: React.FC = () => {
// //     const { user, cohorts, staff, learners, fetchCohorts, fetchStaff, fetchLearners } = useStore();
// //     const navigate = useNavigate();

// //     // State to manage navigation within the dashboard
// //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile'>('dashboard');

// //     useEffect(() => {
// //         fetchCohorts();
// //         fetchStaff();
// //         fetchLearners();
// //     }, [fetchCohorts, fetchStaff, fetchLearners]);

// //     const handleLogout = async () => {
// //         await signOut(auth);
// //         navigate('/login');
// //     };

// //     // Find the learner profile using the linked authUid or email bridge
// //     const myLearnerProfile = learners.find(l => l.authUid === user?.uid || l.email === user?.email);

// //     // Filter cohorts where the learner is either explicitly assigned by ID or linked via the cohortId field
// //     const myCohorts = cohorts.filter(c =>
// //         c.id === myLearnerProfile?.cohortId ||
// //         c.learnerIds?.includes(myLearnerProfile?.id || '')
// //     );

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     return (
// //         <div className="dashboard-container">
// //             {/* ─── SHARED SIDEBAR ─── */}
// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav={currentNav}
// //                 setCurrentNav={setCurrentNav}
// //                 onLogout={handleLogout}
// //             />

// //             <main className="main-content">
// //                 {/* ─── CLASSES VIEW ─── */}
// //                 {currentNav === 'dashboard' && (
// //                     <div className="dashboard-view animate-fade-in">
// //                         <header className="view-header">
// //                             <div className="header-text">
// //                                 <h1>My Active Classes</h1>
// //                                 <p>Welcome back, <strong>{user?.fullName}</strong>. Select a class to view your portfolio and assessments.</p>
// //                             </div>
// //                         </header>

// //                         <div className="mlab-cohort-grid">
// //                             {myCohorts.map(cohort => (
// //                                 <div key={cohort.id} className="mlab-cohort-card learner-card">
// //                                     <div className="mlab-cohort-card__header">
// //                                         <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
// //                                         <span className="status-badge active">In Progress</span>
// //                                     </div>

// //                                     <div className="mlab-cohort-card__dates">
// //                                         <Calendar size={14} />
// //                                         <span>{cohort.startDate} — {cohort.endDate}</span>
// //                                     </div>

// //                                     <div className="mlab-cohort-card__roles">
// //                                         <div className="mlab-role-row">
// //                                             <div className="mlab-role-dot mlab-role-dot--blue" />
// //                                             <span className="mlab-role-label">Facilitator:</span>
// //                                             <span className="mlab-role-name">{getStaffName(cohort.facilitatorId)}</span>
// //                                         </div>
// //                                         <div className="mlab-role-row">
// //                                             <div className="mlab-role-dot mlab-role-dot--red" />
// //                                             <span className="mlab-role-label">Assessor:</span>
// //                                             <span className="mlab-role-name">{getStaffName(cohort.assessorId)}</span>
// //                                         </div>
// //                                     </div>

// //                                     <div className="mlab-cohort-card__footer">
// //                                         <button
// //                                             className="mlab-btn mlab-btn--blue w-full"
// //                                             onClick={() => navigate(`/sor/${myLearnerProfile?.id}`)}
// //                                         >
// //                                             <BookOpen size={16} /> Open My Portfolio
// //                                         </button>
// //                                     </div>
// //                                 </div>
// //                             ))}

// //                             {myCohorts.length === 0 && (
// //                                 <div className="mlab-cohort-empty">
// //                                     <Layers size={48} />
// //                                     <p className="mlab-cohort-empty__title">No Classes Assigned</p>
// //                                     <p className="mlab-cohort-empty__desc">
// //                                         You are not currently enrolled in any active cohorts.
// //                                     </p>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* ─── PROFILE VIEW ─── */}
// //                 {currentNav === 'profile' && (
// //                     <div className="dashboard-view animate-fade-in">
// //                         <header className="view-header">
// //                             <div className="header-text">
// //                                 <h1>Personal Profile</h1>
// //                                 <p>Your registered information and qualification details.</p>
// //                             </div>
// //                         </header>

// //                         <div className="profile-card">
// //                             <div className="profile-card__main">
// //                                 <div className="profile-avatar">
// //                                     <UserIcon size={40} />
// //                                 </div>
// //                                 <div className="profile-info">
// //                                     <h2>{user?.fullName}</h2>
// //                                     <div className="profile-badge">LEARNER ACCOUNT</div>
// //                                 </div>
// //                             </div>

// //                             <div className="profile-details-grid">
// //                                 <div className="detail-item">
// //                                     <div className="detail-label"><Mail size={14} /> Email Address</div>
// //                                     <div className="detail-value">{user?.email}</div>
// //                                 </div>

// //                                 <div className="detail-item">
// //                                     <div className="detail-label"><Fingerprint size={14} /> ID / National ID</div>
// //                                     <div className="detail-value">
// //                                         {myLearnerProfile?.idNumber || 'Not available'}
// //                                     </div>
// //                                 </div>

// //                                 <div className="detail-item">
// //                                     <div className="detail-label"><GraduationCap size={14} /> Qualification</div>
// //                                     <div className="detail-value">
// //                                         {myLearnerProfile?.qualification?.name || 'Qualification not yet assigned'}
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="profile-footer-note">
// //                                 <p>To update your email or ID number, please contact your administrator.</p>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )}
// //             </main>
// //         </div>
// //     );
// // };

// // // import React, { useState, useEffect } from 'react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { LayoutDashboard, BookOpen, User, LogOut, Calendar, Layers } from 'lucide-react';
// // // import { signOut } from 'firebase/auth';
// // // import { useStore } from '../../../store/useStore';
// // // import { auth } from '../../../lib/firebase';
// // // import { Sidebar } from '../../../components/dashboard/Sidebar';
// // // export const LearnerDashboard: React.FC = () => {
// // //     // ✅ Added `learners` and `fetchLearners` here
// // //     const { user, cohorts, staff, learners, fetchCohorts, fetchStaff, fetchLearners } = useStore();
// // //     const navigate = useNavigate();
// // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile'>('dashboard');

// // //     useEffect(() => {
// // //         fetchCohorts();
// // //         fetchStaff();
// // //         fetchLearners(); // ✅ Fetch the learners collection so we can verify their profile
// // //     }, [fetchCohorts, fetchStaff, fetchLearners]);

// // //     const handleLogout = async () => {
// // //         await signOut(auth);
// // //         navigate('/login');
// // //     };

// // //     // 1. Find the logged-in user's specific Learner Profile (matching by email)
// // //     const myLearnerProfile = learners.find(l => l.email === user?.email);

// // //     // 2. 🚀 Filter cohorts by verifying BOTH the learner's profile cohortId AND the cohort's learnerIds array
// // //     const myCohorts = cohorts.filter(c =>
// // //         c.id === myLearnerProfile?.cohortId ||
// // //         c.learnerIds?.includes(myLearnerProfile?.id || '')
// // //     );

// // //     // Helper to get staff names
// // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // //     return (
// // //         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>

// // //             {/* --- SIDEBAR --- */}
// // //             <Sidebar
// // //             <aside style={{ width: '250px', background: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
// // //                 <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
// // //                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
// // //                         <span style={{ color: '#3b82f6' }}>m</span>
// // //                         <span style={{ color: '#0f172a' }}>lab</span>
// // //                     </div>
// // //                 </div>

// // //                 <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // //                     <button
// // //                         onClick={() => setCurrentNav('dashboard')}
// // //                         style={{
// // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: 'none',
// // //                             background: currentNav === 'dashboard' ? '#eff6ff' : 'transparent',
// // //                             color: currentNav === 'dashboard' ? '#3b82f6' : '#64748b',
// // //                             borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%', textAlign: 'left',
// // //                             transition: 'all 0.2s'
// // //                         }}
// // //                     >
// // //                         <LayoutDashboard size={20} /> My Classes
// // //                     </button>

// // //                     <button
// // //                         onClick={() => setCurrentNav('profile')}
// // //                         style={{
// // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: 'none',
// // //                             background: currentNav === 'profile' ? '#eff6ff' : 'transparent',
// // //                             color: currentNav === 'profile' ? '#3b82f6' : '#64748b',
// // //                             borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%', textAlign: 'left',
// // //                             transition: 'all 0.2s'
// // //                         }}
// // //                     >
// // //                         <User size={20} /> My Profile
// // //                     </button>
// // //                 </nav>

// // //                 <div style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
// // //                     <button
// // //                         onClick={handleLogout}
// // //                         style={{
// // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem',
// // //                             border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold'
// // //                         }}
// // //                     >
// // //                         <LogOut size={20} /> Sign Out
// // //                     </button>
// // //                 </div>
// // //             </aside>

// // //             {/* --- MAIN CONTENT AREA --- */}
// // //             <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

// // //                 {/* ─── DASHBOARD / CLASSES TAB ─── */}
// // //                 {currentNav === 'dashboard' && (
// // //                     <div style={{ maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>

// // //                         <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // //                             <div>
// // //                                 <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.8rem' }}>Welcome back, {user?.fullName}!</h1>
// // //                                 <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>Here are the classes you are currently enrolled in.</p>
// // //                             </div>
// // //                         </header>

// // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
// // //                             {myCohorts.map(cohort => (
// // //                                 <div
// // //                                     key={cohort.id}
// // //                                     style={{
// // //                                         background: 'white', borderRadius: '12px', padding: '1.5rem',
// // //                                         boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderTop: '4px solid #3b82f6',
// // //                                         display: 'flex', flexDirection: 'column'
// // //                                     }}
// // //                                 >
// // //                                     <div style={{ marginBottom: '1rem' }}>
// // //                                         <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b', fontSize: '1.25rem' }}>{cohort.name}</h2>
// // //                                         <span style={{ display: 'inline-block', background: '#ecfdf5', color: '#10b981', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold' }}>
// // //                                             Active Class
// // //                                         </span>
// // //                                     </div>

// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
// // //                                         <Calendar size={16} />
// // //                                         <span>{cohort.startDate} — {cohort.endDate}</span>
// // //                                     </div>

// // //                                     <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // //                                             <span style={{ color: '#64748b' }}>Facilitator:</span>
// // //                                             <span style={{ fontWeight: '500', color: '#1e293b' }}>{getStaffName(cohort.facilitatorId)}</span>
// // //                                         </div>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // //                                             <span style={{ color: '#64748b' }}>Assessor:</span>
// // //                                             <span style={{ fontWeight: '500', color: '#1e293b' }}>{getStaffName(cohort.assessorId)}</span>
// // //                                         </div>
// // //                                     </div>

// // //                                     {/* Action Button: Uses the Learner's Document ID for the SOR URL! */}
// // //                                     <button
// // //                                         onClick={() => navigate(`/sor/${myLearnerProfile?.id}`)}
// // //                                         style={{
// // //                                             marginTop: 'auto', width: '100%', padding: '0.75rem', borderRadius: '6px',
// // //                                             background: '#3b82f6', color: 'white', border: 'none', fontWeight: 'bold',
// // //                                             cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
// // //                                             transition: 'background 0.2s'
// // //                                         }}
// // //                                     >
// // //                                         <BookOpen size={16} />
// // //                                         Open Portfolio
// // //                                     </button>
// // //                                 </div>
// // //                             ))}

// // //                             {/* Empty State if not enrolled in anything */}
// // //                             {myCohorts.length === 0 && (
// // //                                 <div style={{ gridColumn: '1 / -1', background: 'white', padding: '4rem 2rem', textAlign: 'center', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
// // //                                     <Layers size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
// // //                                     <h3 style={{ color: '#1e293b', marginBottom: '0.5rem' }}>No Active Classes</h3>
// // //                                     <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
// // //                                         You have not been assigned to any cohorts yet. Please contact your facilitator or administrator if you believe this is a mistake.
// // //                                     </p>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* ─── PROFILE TAB ─── */}
// // //                 {currentNav === 'profile' && (
// // //                     <div style={{ maxWidth: '900px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
// // //                         <header style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // //                             <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.8rem' }}>My Profile</h1>
// // //                             <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>Manage your personal information</p>
// // //                         </header>

// // //                         <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
// // //                                 <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
// // //                                     <User size={40} />
// // //                                 </div>
// // //                                 <div>
// // //                                     <h2 style={{ margin: 0, color: '#1e293b' }}>{user?.fullName}</h2>
// // //                                     <p style={{ margin: '0.25rem 0 0 0', color: '#64748b' }}>{user?.email}</p>
// // //                                     <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.25rem 0.75rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Learner</span>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Bonus: Show their National ID if available */}
// // //                             {myLearnerProfile && (
// // //                                 <>
// // //                                     <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '2rem 0' }} />
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // //                                         <div>
// // //                                             <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>ID Number / National ID</label>
// // //                                             <div style={{ fontWeight: '500', color: '#1e293b' }}>{myLearnerProfile.idNumber || myLearnerProfile.id}</div>
// // //                                         </div>
// // //                                         <div>
// // //                                             <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>Qualification</label>
// // //                                             <div style={{ fontWeight: '500', color: '#1e293b' }}>{myLearnerProfile.qualification?.name || 'Pending'}</div>
// // //                                         </div>
// // //                                     </div>
// // //                                 </>
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </main>
// // //         </div>
// // //     );
// // // };

// // // // import React, { useState } from 'react';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import { LayoutDashboard, BookOpen, User, LogOut } from 'lucide-react';
// // // // import { signOut } from 'firebase/auth';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { auth } from '../../../lib/firebase';
// // // // export const LearnerDashboard: React.FC = () => {
// // // //     const { user } = useStore();
// // // //     const navigate = useNavigate();
// // // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile'>('dashboard');

// // // //     const handleLogout = async () => {
// // // //         await signOut(auth);
// // // //         navigate('/login');
// // // //     };

// // // //     return (
// // // //         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>

// // // //             {/* --- SIDEBAR --- */}
// // // //             <aside style={{ width: '250px', background: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
// // // //                 <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
// // // //                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
// // // //                         <span style={{ color: '#3b82f6' }}>m</span>
// // // //                         <span style={{ color: '#0f172a' }}>lab</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // // //                     <button
// // // //                         onClick={() => setCurrentNav('dashboard')}
// // // //                         style={{
// // // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: 'none',
// // // //                             background: currentNav === 'dashboard' ? '#eff6ff' : 'transparent',
// // // //                             color: currentNav === 'dashboard' ? '#3b82f6' : '#64748b',
// // // //                             borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%', textAlign: 'left',
// // // //                             transition: 'all 0.2s'
// // // //                         }}
// // // //                     >
// // // //                         <LayoutDashboard size={20} /> Dashboard
// // // //                     </button>

// // // //                     <button
// // // //                         onClick={() => navigate(`/sor/${user?.uid}`)}
// // // //                         style={{
// // // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: 'none',
// // // //                             background: 'transparent', color: '#64748b',
// // // //                             borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%', textAlign: 'left',
// // // //                             transition: 'all 0.2s'
// // // //                         }}
// // // //                     >
// // // //                         <BookOpen size={20} /> My Portfolio
// // // //                     </button>

// // // //                     <button
// // // //                         onClick={() => setCurrentNav('profile')}
// // // //                         style={{
// // // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: 'none',
// // // //                             background: currentNav === 'profile' ? '#eff6ff' : 'transparent',
// // // //                             color: currentNav === 'profile' ? '#3b82f6' : '#64748b',
// // // //                             borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%', textAlign: 'left',
// // // //                             transition: 'all 0.2s'
// // // //                         }}
// // // //                     >
// // // //                         <User size={20} /> My Profile
// // // //                     </button>
// // // //                 </nav>

// // // //                 <div style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
// // // //                     <button
// // // //                         onClick={handleLogout}
// // // //                         style={{
// // // //                             display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem',
// // // //                             border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold'
// // // //                         }}
// // // //                     >
// // // //                         <LogOut size={20} /> Sign Out
// // // //                     </button>
// // // //                 </div>
// // // //             </aside>

// // // //             {/* --- MAIN CONTENT AREA --- */}
// // // //             <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>

// // // //                 {/* DASHBOARD TAB */}
// // // //                 {currentNav === 'dashboard' && (
// // // //                     <div style={{ maxWidth: '900px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
// // // //                         <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // // //                             <div>
// // // //                                 <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.8rem' }}>Welcome back, {user?.fullName}!</h1>
// // // //                                 <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>Learner Portal Overview</p>
// // // //                             </div>
// // // //                         </header>

// // // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
// // // //                             {/* PORTFOLIO CARD */}
// // // //                             <div
// // // //                                 onClick={() => navigate(`/sor/${user?.uid}`)}
// // // //                                 style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', borderTop: '4px solid #3b82f6' }}
// // // //                                 onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)'; }}
// // // //                                 onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
// // // //                             >
// // // //                                 <div style={{ background: '#eff6ff', width: '50px', height: '50px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', marginBottom: '1.5rem' }}>
// // // //                                     <BookOpen size={24} />
// // // //                                 </div>
// // // //                                 <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>My Portfolio</h2>
// // // //                                 <p style={{ margin: 0, color: '#64748b', lineHeight: '1.5' }}>View your Statement of Results, modules, and access your active assignments.</p>
// // // //                             </div>

// // // //                             {/* PROFILE CARD */}
// // // //                             <div
// // // //                                 onClick={() => setCurrentNav('profile')}
// // // //                                 style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', borderTop: '4px solid #10b981' }}
// // // //                                 onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)'; }}
// // // //                                 onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
// // // //                             >
// // // //                                 <div style={{ background: '#ecfdf5', width: '50px', height: '50px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '1.5rem' }}>
// // // //                                     <User size={24} />
// // // //                                 </div>
// // // //                                 <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>My Profile</h2>
// // // //                                 <p style={{ margin: 0, color: '#64748b', lineHeight: '1.5' }}>Update your personal details, email, and contact information.</p>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {/* PROFILE TAB */}
// // // //                 {currentNav === 'profile' && (
// // // //                     <div style={{ maxWidth: '900px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
// // // //                         <header style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // // //                             <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.8rem' }}>My Profile</h1>
// // // //                             <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>Manage your personal information</p>
// // // //                         </header>

// // // //                         <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
// // // //                                 <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
// // // //                                     <User size={40} />
// // // //                                 </div>
// // // //                                 <div>
// // // //                                     <h2 style={{ margin: 0, color: '#1e293b' }}>{user?.fullName}</h2>
// // // //                                     <p style={{ margin: '0.25rem 0 0 0', color: '#64748b' }}>{user?.email}</p>
// // // //                                     <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.25rem 0.75rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Learner</span>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '2rem 0' }} />
// // // //                             <p style={{ color: '#64748b', fontStyle: 'italic' }}>Detailed profile editing features coming soon...</p>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };

// // // // // import React from 'react';
// // // // // import { useNavigate } from 'react-router-dom';
// // // // // import { BookOpen, Award, User, LogOut } from 'lucide-react';
// // // // // import { signOut } from 'firebase/auth';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import { auth } from '../../../lib/firebase';

// // // // // export const LearnerDashboard: React.FC = () => {
// // // // //     const { user } = useStore();
// // // // //     const navigate = useNavigate();

// // // // //     const handleLogout = async () => {
// // // // //         await signOut(auth);
// // // // //         navigate('/login');
// // // // //     };

// // // // //     return (
// // // // //         <div style={{ background: '#f8fafc', padding: '2rem', fontFamily: 'system-ui, sans-serif', position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
// // // // //             <div style={{ background: 'red' }}>

// // // // //                 {/* HEADER */}
// // // // //                 <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// // // // //                     <div>
// // // // //                         <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.8rem' }}>Welcome back, {user?.fullName}!</h1>
// // // // //                         <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>Learner Portal</p>
// // // // //                     </div>
// // // // //                     <button
// // // // //                         onClick={handleLogout}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', cursor: 'pointer', color: '#64748b', fontWeight: 'bold' }}
// // // // //                     >
// // // // //                         <LogOut size={16} /> Sign Out
// // // // //                     </button>
// // // // //                 </header>

// // // // //                 {/* QUICK ACTIONS GRID */}
// // // // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>

// // // // //                     {/* PORTFOLIO CARD */}
// // // // //                     <div
// // // // //                         onClick={() => navigate(`/sor/${user?.uid}`)}
// // // // //                         style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 0.2s', borderTop: '4px solid #3b82f6' }}
// // // // //                         onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
// // // // //                         onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
// // // // //                     >
// // // // //                         <div style={{ background: '#eff6ff', width: '50px', height: '50px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', marginBottom: '1.5rem' }}>
// // // // //                             <BookOpen size={24} />
// // // // //                         </div>
// // // // //                         <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>My Portfolio</h2>
// // // // //                         <p style={{ margin: 0, color: '#64748b', lineHeight: '1.5' }}>View your Statement of Results, modules, and access your active assignments.</p>
// // // // //                     </div>

// // // // //                     {/* PROFILE/SETTINGS CARD (Placeholder for future) */}
// // // // //                     <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderTop: '4px solid #10b981', opacity: 0.7 }}>
// // // // //                         <div style={{ background: '#ecfdf5', width: '50px', height: '50px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '1.5rem' }}>
// // // // //                             <User size={24} />
// // // // //                         </div>
// // // // //                         <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>My Profile</h2>
// // // // //                         <p style={{ margin: 0, color: '#64748b', lineHeight: '1.5' }}>Update your personal details and contact information. (Coming soon)</p>
// // // // //                     </div>

// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };
