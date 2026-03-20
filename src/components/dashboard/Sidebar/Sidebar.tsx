// src/components/dashboard/Sidebar/Sidebar.tsx

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, BookOpen, UserCheck,
    Settings, LogOut, Layers, ShieldCheck,
    GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2
} from 'lucide-react';
import type { UserRole } from '../../../types/auth.types';
import { useStore } from '../../../store/useStore';
import './Sidebar.css';

interface SidebarProps {
    role?: UserRole;
    currentNav?: string;
    setCurrentNav?: (nav: any) => void;
    onLogout: () => void;
}

import mLabLogo from '../../../assets/logo/mlab_logo.png';

export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Fetch the user from the global store to guarantee we always know the role
    const user = useStore((state) => state.user);
    const activeRole = role || user?.role;

    // ─── 1. DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
    const getMenuItems = () => {
        switch (activeRole) {
            case 'admin':
                return [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
                    // Master Directory (The Humans)
                    { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
                    // Enrollments (The Academic Records)
                    { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
                    { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
                    { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
                    // 🚀 NEW: Workplaces & Mentors
                    { id: 'workplaces', label: 'Workplaces', icon: Building2, path: '/admin' },
                    { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
                ];
            case 'assessor':
                return [
                    { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
                    { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
                ];
            case 'moderator':
                return [
                    { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
                    { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
                ];
            case 'facilitator':
                return [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
                    { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator/attendance' },
                    { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator/assessments' },
                    { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
                ];
            case 'learner':
                return [
                    { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
                ];
            default:
                return [];
        }
    };

    const menuItems = getMenuItems();

    // ─── 2. SMART NAVIGATION HANDLER ────────────────────────────────────────
    const handleNavigation = (item: any) => {
        if (setCurrentNav) {
            // Used by Assessor & Admin (Tab switching without unmounting the whole page)
            setCurrentNav(item.id);
            // Silently update the URL state to persist across refreshes without breaking Roles
            navigate(item.path, { state: { activeTab: item.id }, replace: true });
        } else {
            // Used by Facilitator (Standard URL navigation through <Outlet />)
            navigate(item.path);
        }
    };

    return (
        <aside className="sidebar">

            {/* ─── BRANDING HEADER ─── */}
            <div className="sidebar-header">
                <img src={mLabLogo} height={50} alt="mLab Logo" />
                {activeRole !== 'learner' && (
                    <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
                )}
            </div>

            {/* ─── NAVIGATION MENU ─── */}
            <nav className="sidebar-nav">
                {menuItems.map((item) => {
                    const Icon = item.icon;

                    // It's active if currentNav matches the ID, OR if currentNav is missing but the URL matches the path
                    const isActive = currentNav === item.id || (!currentNav && location.pathname === item.path);

                    return (
                        <button
                            key={item.id}
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => handleNavigation(item)}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* ─── FOOTER ACTIONS ─── */}
            <div className="sidebar-footer">
                {/* 🚀 SETTINGS NAVIGATION WIRED UP */}
                <button
                    className={`nav-item ${currentNav === 'settings' || location.pathname === '/settings' ? 'active' : ''}`}
                    onClick={() => {
                        if (setCurrentNav) setCurrentNav('settings');
                        navigate('/settings');
                    }}
                >
                    <Settings size={20} />
                    <span>Settings</span>
                </button>
                <button
                    className="nav-item"
                    style={{ color: '#ef4444' }}
                    onClick={onLogout}
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>

        </aside>
    );
};




// import React from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import {
//     LayoutDashboard, Users, BookOpen, UserCheck,
//     Settings, LogOut, Layers, ShieldCheck,
//     GraduationCap, ClipboardList, CheckSquare, User, UserCircle
// } from 'lucide-react';
// import type { UserRole } from '../../types/auth.types';
// import { useStore } from '../../store/useStore';

// interface SidebarProps {
//     role?: UserRole;
//     currentNav?: string;
//     setCurrentNav?: (nav: any) => void;
//     onLogout: () => void;
// }

// export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
//     const navigate = useNavigate();
//     const location = useLocation();

//     // Fetch the user from the global store to guarantee we always know the role
//     const user = useStore((state) => state.user);
//     const activeRole = role || user?.role;

//     // ─── 1. DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
//     const getMenuItems = () => {
//         switch (activeRole) {
//             case 'admin':
//                 return [
//                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
//                     // 🚀 NEW: Master Directory (The Humans)
//                     { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
//                     // 🚀 UPDATED: Enrollments (The Academic Records)
//                     { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
//                     { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
//                     { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
//                     { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
//                 ];
//             case 'assessor':
//                 return [
//                     { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
//                     { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
//                 ];
//             case 'moderator':
//                 return [
//                     { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
//                     { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
//                 ];
//             case 'facilitator':
//                 return [
//                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
//                     { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator/attendance' },
//                     { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator/assessments' },
//                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
//                 ];
//             case 'learner':
//                 return [
//                     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
//                 ];
//             default:
//                 return [];
//         }
//     };

//     const menuItems = getMenuItems();

//     // ─── 2. SMART NAVIGATION HANDLER ────────────────────────────────────────
//     const handleNavigation = (item: any) => {
//         if (setCurrentNav) {
//             // Used by Assessor & Admin (Tab switching without unmounting the whole page)
//             setCurrentNav(item.id);
//             // Silently update the URL state to persist across refreshes without breaking Roles
//             navigate(item.path, { state: { activeTab: item.id }, replace: true });
//         } else {
//             // Used by Facilitator (Standard URL navigation through <Outlet />)
//             navigate(item.path);
//         }
//     };

//     return (
//         <aside className="sidebar">

//             {/* ─── BRANDING HEADER ─── */}
//             <div className="sidebar-header">
//                 <div className="sidebar-logo">
//                     <span className="m">m</span><span className="lab">lab</span>
//                 </div>
//                 {activeRole !== 'learner' && (
//                     <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
//                 )}
//             </div>

//             {/* ─── NAVIGATION MENU ─── */}
//             <nav className="sidebar-nav">
//                 {menuItems.map((item) => {
//                     const Icon = item.icon;

//                     // It's active if currentNav matches the ID, OR if currentNav is missing but the URL matches the path
//                     const isActive = currentNav === item.id || (!currentNav && location.pathname === item.path);

//                     return (
//                         <button
//                             key={item.id}
//                             className={`nav-item ${isActive ? 'active' : ''}`}
//                             onClick={() => handleNavigation(item)}
//                         >
//                             <Icon size={20} />
//                             <span>{item.label}</span>
//                         </button>
//                     );
//                 })}
//             </nav>

//             {/* ─── FOOTER ACTIONS ─── */}
//             <div className="sidebar-footer">
//                 <button className="nav-item">
//                     <Settings size={20} />
//                     <span>Settings</span>
//                 </button>
//                 <button
//                     className="nav-item"
//                     style={{ color: '#ef4444' }}
//                     onClick={onLogout}
//                 >
//                     <LogOut size={20} />
//                     <span>Logout</span>
//                 </button>
//             </div>

//         </aside>
//     );
// };


// // import React from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import {
// //     LayoutDashboard, Users, BookOpen, UserCheck,
// //     Settings, LogOut, Layers, ShieldCheck,
// //     GraduationCap, ClipboardList, CheckSquare, User, UserCircle
// // } from 'lucide-react';
// // import type { UserRole } from '../../types/auth.types';
// // import { useStore } from '../../store/useStore';

// // interface SidebarProps {
// //     role?: UserRole;
// //     currentNav?: string;
// //     setCurrentNav?: (nav: any) => void;
// //     onLogout: () => void;
// // }

// // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Fetch the user from the global store to guarantee we always know the role
// //     const user = useStore((state) => state.user);
// //     const activeRole = role || user?.role;

// //     // ─── 1. DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
// //     const getMenuItems = () => {
// //         switch (activeRole) {
// //             case 'admin':
// //                 return [
// //                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
// //                     { id: 'learners', label: 'Learner Results', icon: Users, path: '/admin' },
// //                     { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
// //                     { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
// //                     { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
// //                 ];
// //             case 'assessor':
// //                 return [
// //                     { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
// //                     { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
// //                 ];
// //             case 'moderator':
// //                 return [
// //                     { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
// //                     { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
// //                 ];
// //             case 'facilitator':
// //                 return [
// //                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
// //                     { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator/attendance' },
// //                     { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator/assessments' },
// //                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
// //                 ];
// //             case 'learner':
// //                 return [
// //                     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
// //                 ];
// //             default:
// //                 return [];
// //         }
// //     };

// //     const menuItems = getMenuItems();

// //     // ─── 2. SMART NAVIGATION HANDLER ────────────────────────────────────────
// //     const handleNavigation = (item: any) => {
// //         if (setCurrentNav) {
// //             // Used by Assessor & Admin (Tab switching without unmounting the whole page)
// //             setCurrentNav(item.id);
// //             // Silently update the URL state to persist across refreshes without breaking Roles
// //             navigate(item.path, { state: { activeTab: item.id }, replace: true });
// //         } else {
// //             // Used by Facilitator (Standard URL navigation through <Outlet />)
// //             navigate(item.path);
// //         }
// //     };

// //     return (
// //         <aside className="sidebar">

// //             {/* ─── BRANDING HEADER ─── */}
// //             <div className="sidebar-header">
// //                 <div className="sidebar-logo">
// //                     <span className="m">m</span><span className="lab">lab</span>
// //                 </div>
// //                 {activeRole !== 'learner' && (
// //                     <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
// //                 )}
// //             </div>

// //             {/* ─── NAVIGATION MENU ─── */}
// //             <nav className="sidebar-nav">
// //                 {menuItems.map((item) => {
// //                     const Icon = item.icon;

// //                     // It's active if currentNav matches the ID, OR if currentNav is missing but the URL matches the path
// //                     const isActive = currentNav === item.id || (!currentNav && location.pathname === item.path);

// //                     return (
// //                         <button
// //                             key={item.id}
// //                             className={`nav-item ${isActive ? 'active' : ''}`}
// //                             onClick={() => handleNavigation(item)}
// //                         >
// //                             <Icon size={20} />
// //                             <span>{item.label}</span>
// //                         </button>
// //                     );
// //                 })}
// //             </nav>

// //             {/* ─── FOOTER ACTIONS ─── */}
// //             <div className="sidebar-footer">
// //                 <button className="nav-item">
// //                     <Settings size={20} />
// //                     <span>Settings</span>
// //                 </button>
// //                 <button
// //                     className="nav-item"
// //                     style={{ color: '#ef4444' }}
// //                     onClick={onLogout}
// //                 >
// //                     <LogOut size={20} />
// //                     <span>Logout</span>
// //                 </button>
// //             </div>

// //         </aside>
// //     );
// // };




// // import React from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import {
// //     LayoutDashboard, Users, BookOpen, UserCheck,
// //     Settings, LogOut, Layers, ShieldCheck,
// //     GraduationCap, ClipboardList, CheckSquare, User,
// //     UserCircle
// // } from 'lucide-react';
// // import type { UserRole } from '../../types/auth.types';
// // import { useStore } from '../../store/useStore';

// // interface SidebarProps {
// //     role?: UserRole;
// //     currentNav?: string;
// //     setCurrentNav?: (nav: any) => void;
// //     onLogout: () => void;
// // }

// // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Fetch the user from the global store to guarantee we always know the role
// //     const user = useStore((state) => state.user);
// //     const activeRole = role || user?.role;

// //     // ─── 1. DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
// //     const getMenuItems = () => {
// //         switch (activeRole) {
// //             case 'admin':
// //                 return [
// //                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
// //                     { id: 'learners', label: 'Learner Results', icon: Users, path: '/admin' },
// //                     { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
// //                     { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
// //                     { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
// //                 ];
// //             case 'assessor':
// //                 return [
// //                     { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
// //                     { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
// //                 ];
// //             case 'moderator':
// //                 return [
// //                     { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
// //                     { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
// //                 ];
// //             case 'facilitator':
// //                 return [
// //                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
// //                     { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator' },
// //                     { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator' },
// //                     { id: 'profile', label: 'My Profile', icon: UserCircle },
// //                 ];
// //             case 'learner':
// //                 return [
// //                     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
// //                     { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
// //                 ];
// //             default:
// //                 return [];
// //         }
// //     };

// //     // const menuItems = [
// //     //     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard },
// //     //     { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
// //     //     { id: 'profile', label: 'My Profile', icon: UserCircle },
// //     //     { id: 'assessments', label: 'Assessments', icon: BookOpen },
// //     // ];


// //     const menuItems = getMenuItems();

// //     // ─── 2. SMART NAVIGATION HANDLER ────────────────────────────────────────
// //     const handleNavigation = (item: any) => {
// //         if (setCurrentNav) {
// //             // Change tab immediately
// //             setCurrentNav(item.id);
// //             // Silently update the URL state to persist across refreshes without breaking Roles
// //             navigate(item.path, { state: { activeTab: item.id }, replace: true });
// //         } else {
// //             // Standard navigation
// //             navigate(item.path);
// //         }
// //     };

// //     return (
// //         <aside className="sidebar">

// //             {/* ─── BRANDING HEADER (Restored to original mlab style) ─── */}
// //             <div className="sidebar-header">
// //                 <div className="sidebar-logo">
// //                     <span className="m">m</span><span className="lab">lab</span>
// //                 </div>
// //                 {activeRole !== 'learner' && (
// //                     <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
// //                 )}
// //             </div>

// //             {/* ─── NAVIGATION MENU ─── */}
// //             <nav className="sidebar-nav">
// //                 {menuItems.map((item) => {
// //                     const Icon = item.icon;
// //                     // It's active if currentNav matches, OR if currentNav is missing but the URL matches
// //                     const isActive = currentNav === item.id || (!currentNav && location.pathname === item.path);

// //                     return (
// //                         <button
// //                             key={item.id}
// //                             className={`nav-item ${isActive ? 'active' : ''}`}
// //                             onClick={() => handleNavigation(item)}
// //                         >
// //                             <Icon size={20} />
// //                             <span>{item.label}</span>
// //                         </button>
// //                     );
// //                 })}
// //             </nav>

// //             {/* ─── FOOTER ACTIONS ─── */}
// //             <div className="sidebar-footer">
// //                 <button className="nav-item">
// //                     <Settings size={20} />
// //                     <span>Settings</span>
// //                 </button>
// //                 <button
// //                     className="nav-item"
// //                     style={{ color: '#ef4444' }}
// //                     onClick={onLogout}
// //                 >
// //                     <LogOut size={20} />
// //                     <span>Logout</span>
// //                 </button>
// //             </div>

// //         </aside>
// //     );
// // };



// // // import React from 'react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import {
// // //     LayoutDashboard, Users, BookOpen, UserCircle,
// // //     Settings, LogOut, PenTool, Layers, ShieldCheck,
// // //     GraduationCap, ClipboardList
// // // } from 'lucide-react';
// // // import type { UserRole } from '../../types/auth.types';

// // // interface SidebarProps {
// // //     role?: UserRole;
// // //     currentNav?: string;
// // //     setCurrentNav?: (nav: string) => void;
// // //     onLogout: () => void;
// // // }

// // // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();

// // //     // ─── 1. DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
// // //     const getMenuItems = () => {
// // //         switch (role) {
// // //             case 'admin':
// // //                 return [
// // //                     { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
// // //                     { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/admin' },
// // //                     { id: 'staff', label: 'Staff Management', icon: UserCircle, path: '/admin' },
// // //                     { id: 'programmes', label: 'Programmes', icon: BookOpen, path: '/admin' },
// // //                 ];
// // //             case 'assessor':
// // //                 return [
// // //                     { id: 'dashboard', label: 'Marking Queue', icon: PenTool, path: '/marking' },
// // //                     { id: 'cohorts', label: 'My Classes', icon: Users, path: '/marking' },
// // //                     { id: 'profile', label: 'Compliance', icon: ShieldCheck, path: '/marking' },
// // //                 ];
// // //             case 'moderator':
// // //                 return [
// // //                     { id: 'dashboard', label: 'QA Dashboard', icon: LayoutDashboard, path: '/moderation' },
// // //                     { id: 'cohorts', label: 'Audits', icon: ClipboardList, path: '/moderation' },
// // //                     { id: 'profile', label: 'Compliance', icon: ShieldCheck, path: '/moderation' },
// // //                 ];
// // //             case 'facilitator':
// // //                 return [
// // //                     { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/facilitator' },
// // //                     { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator' },
// // //                     { id: 'assessments', label: 'Assessments', icon: PenTool, path: '/facilitator' },
// // //                 ];
// // //             case 'learner':
// // //                 return [
// // //                     { id: 'dashboard', label: 'My Learning', icon: GraduationCap, path: '/portal' },
// // //                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/portal' },
// // //                 ];
// // //             default:
// // //                 return [];
// // //         }
// // //     };

// // //     const menuItems = getMenuItems();

// // //     // ─── 2. SMART NAVIGATION HANDLER ────────────────────────────────────────
// // //     const handleNavigation = (item: any) => {
// // //         // If the dashboard passed a `setCurrentNav` function (like Assessor Dashboard does),
// // //         // we change the TAB instead of changing the URL to prevent Role kicks.
// // //         if (setCurrentNav) {
// // //             setCurrentNav(item.id);
// // //             // Optionally update the URL state so it persists on refresh without changing the base path
// // //             navigate(item.path, { state: { activeTab: item.id }, replace: true });
// // //         } else {
// // //             // Standard URL navigation
// // //             navigate(item.path);
// // //         }
// // //     };

// // //     return (
// // //         <aside className="sidebar" style={{ width: '250px', color: '#f1f5f9', display: 'flex', flexDirection: 'column', height: '100vh' }}>

// // //             {/* Branding */}
// // //             <div className="sidebar-header" style={{ padding: '2rem 1.5rem', borderBottom: '1px solid #1e293b' }}>
// // //                 <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // //                     <ShieldCheck size={24} color="var(--mlab-blue)" />
// // //                     {role === 'admin' ? 'QCTO Admin' : role?.toUpperCase()}
// // //                 </h2>
// // //             </div>

// // //             {/* Navigation Menu */}
// // //             <nav className="sidebar-nav" style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // //                 {menuItems.map((item) => {
// // //                     const Icon = item.icon;
// // //                     // Check if it's active via the tab state OR the URL path
// // //                     const isActive = currentNav === item.id || (!currentNav && location.pathname === item.path);

// // //                     return (
// // //                         <button
// // //                             key={item.id}
// // //                             onClick={() => handleNavigation(item)}
// // //                             style={{
// // //                                 display: 'flex',
// // //                                 alignItems: 'center',
// // //                                 gap: '0.75rem',
// // //                                 padding: '0.75rem 1rem',
// // //                                 background: isActive ? 'var(--mlab-blue)' : 'transparent',
// // //                                 color: isActive ? 'white' : '#cbd5e1',
// // //                                 border: 'none',
// // //                                 borderRadius: '8px',
// // //                                 cursor: 'pointer',
// // //                                 fontSize: '0.95rem',
// // //                                 fontWeight: isActive ? 'bold' : 'normal',
// // //                                 transition: 'all 0.2s ease',
// // //                                 textAlign: 'left',
// // //                                 width: '100%'
// // //                             }}
// // //                             onMouseEnter={(e) => {
// // //                                 if (!isActive) e.currentTarget.style.background = '#1e293b';
// // //                             }}
// // //                             onMouseLeave={(e) => {
// // //                                 if (!isActive) e.currentTarget.style.background = 'transparent';
// // //                             }}
// // //                         >
// // //                             <Icon size={18} />
// // //                             {item.label}
// // //                         </button>
// // //                     );
// // //                 })}
// // //             </nav>

// // //             {/* Footer Actions */}
// // //             <div className="sidebar-footer" style={{ padding: '1.5rem 1rem', borderTop: '1px solid #1e293b' }}>
// // //                 <button
// // //                     onClick={onLogout}
// // //                     style={{
// // //                         display: 'flex',
// // //                         alignItems: 'center',
// // //                         gap: '0.75rem',
// // //                         padding: '0.75rem 1rem',
// // //                         background: 'transparent',
// // //                         color: '#ef4444',
// // //                         border: 'none',
// // //                         borderRadius: '8px',
// // //                         cursor: 'pointer',
// // //                         fontSize: '0.95rem',
// // //                         fontWeight: 'bold',
// // //                         width: '100%',
// // //                         textAlign: 'left'
// // //                     }}
// // //                     onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
// // //                     onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
// // //                 >
// // //                     <LogOut size={18} />
// // //                     Secure Logout
// // //                 </button>
// // //             </div>
// // //         </aside>
// // //     );
// // // };



// // // // import React from 'react';
// // // // import {
// // // //     Users, BookOpen, Settings, LogOut, Layers,
// // // //     UserCheck, LayoutDashboard, User, CheckSquare,
// // // //     ShieldCheck, ClipboardList
// // // // } from 'lucide-react';
// // // // import type { UserRole } from '../../types/auth.types';

// // // // interface SidebarProps {
// // // //     role?: UserRole;
// // // //     currentNav: string;
// // // //     setCurrentNav: (nav: string) => void;
// // // //     onLogout: () => void;
// // // // }

// // // // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {

// // // //     // ─── OPTION 1: THE ASSESSOR MENU ──────────────────────────────────────────
// // // //     if (role === 'assessor') {
// // // //         return (
// // // //             <aside className="sidebar">
// // // //                 <div className="sidebar-header">
// // // //                     <div className="sidebar-logo"><span className="m">m</span>lab</div>
// // // //                     <div className="sidebar-role-tag">ASSESSOR</div>
// // // //                 </div>
// // // //                 <nav className="sidebar-nav">
// // // //                     <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // // //                         <CheckSquare size={20} /> <span>Marking Queue</span>
// // // //                     </button>
// // // //                     <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // //                         <Layers size={20} /> <span>My Cohorts</span>
// // // //                     </button>
// // // //                     <button className={`nav-item ${currentNav === 'profile' ? 'active' : ''}`} onClick={() => setCurrentNav('profile')}>
// // // //                         <User size={20} /> <span>My Profile</span>
// // // //                     </button>
// // // //                 </nav>
// // // //                 <SidebarFooter onLogout={onLogout} />
// // // //             </aside>
// // // //         );
// // // //     }

// // // //     // ─── OPTION 2: THE LEARNER MENU ────────────────────────────────────────────
// // // //     if (role === 'learner') {
// // // //         return (
// // // //             <aside className="sidebar">
// // // //                 <div className="sidebar-header">
// // // //                     <div className="sidebar-logo"><span className="m">m</span>lab</div>
// // // //                 </div>
// // // //                 <nav className="sidebar-nav">
// // // //                     <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // // //                         <LayoutDashboard size={20} /> <span>My Classes</span>
// // // //                     </button>
// // // //                     <button className={`nav-item ${currentNav === 'profile' ? 'active' : ''}`} onClick={() => setCurrentNav('profile')}>
// // // //                         <User size={20} /> <span>My Profile</span>
// // // //                     </button>
// // // //                 </nav>
// // // //                 <SidebarFooter onLogout={onLogout} />
// // // //             </aside>
// // // //         );
// // // //     }

// // // //     // ─── OPTION 3: THE MODERATOR MENU ──────────────────────────────────────────
// // // //     if (role === 'moderator') {
// // // //         return (
// // // //             <aside className="sidebar">
// // // //                 <div className="sidebar-header">
// // // //                     <div className="sidebar-logo"><span className="m">m</span>lab</div>
// // // //                     <div className="sidebar-role-tag">MODERATOR</div>
// // // //                 </div>
// // // //                 <nav className="sidebar-nav">
// // // //                     <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // // //                         <ShieldCheck size={20} /> <span>QA Queue</span>
// // // //                     </button>
// // // //                     <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // //                         <Layers size={20} /> <span>Cohorts</span>
// // // //                     </button>
// // // //                     <button className={`nav-item ${currentNav === 'profile' ? 'active' : ''}`} onClick={() => setCurrentNav('profile')}>
// // // //                         <User size={20} /> <span>My Profile</span>
// // // //                     </button>
// // // //                 </nav>
// // // //                 <SidebarFooter onLogout={onLogout} />
// // // //             </aside>
// // // //         );
// // // //     }

// // // //     // ─── OPTION 4: THE ADMIN / FACILITATOR MENU (Default) ──────────────────────
// // // //     return (
// // // //         <aside className="sidebar">
// // // //             <div className="sidebar-header">
// // // //                 <div className="sidebar-logo"><span className="m">m</span>lab</div>
// // // //                 <div className="sidebar-role-tag">{role?.toUpperCase()}</div>
// // // //             </div>

// // // //             <nav className="sidebar-nav">
// // // //                 <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // // //                     <LayoutDashboard size={20} /> <span>Overview</span>
// // // //                 </button>
// // // //                 <button className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`} onClick={() => setCurrentNav('learners')}>
// // // //                     <Users size={20} /> <span>Learner Results</span>
// // // //                 </button>
// // // //                 <button className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`} onClick={() => setCurrentNav('qualifications')}>
// // // //                     <BookOpen size={20} /> <span>Qualifications</span>
// // // //                 </button>
// // // //                 {role === 'admin' && (
// // // //                     <button className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`} onClick={() => setCurrentNav('staff')}>
// // // //                         <UserCheck size={20} /> <span>Staff Management</span>
// // // //                     </button>
// // // //                 )}
// // // //                 <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // //                     <Layers size={20} /> <span>Cohorts</span>
// // // //                 </button>
// // // //                 {role === 'facilitator' && (
// // // //                     <button className={`nav-item ${currentNav === 'assessments' ? 'active' : ''}`} onClick={() => setCurrentNav('assessments')}>
// // // //                         <ClipboardList size={20} /> <span>Assessments</span>
// // // //                     </button>
// // // //                 )}
// // // //             </nav>
// // // //             <SidebarFooter onLogout={onLogout} />
// // // //         </aside>
// // // //     );
// // // // };

// // // // // Internal helper for the footer to keep code DRY
// // // // const SidebarFooter = ({ onLogout }: { onLogout: () => void }) => (
// // // //     <div className="sidebar-footer">
// // // //         <button className="nav-item"><Settings size={20} /> <span>Settings</span></button>
// // // //         <button className="nav-item" style={{ color: '#ef4444' }} onClick={onLogout}>
// // // //             <LogOut size={20} /> <span>Logout</span>
// // // //         </button>
// // // //     </div>
// // // // );


// // // // // import React from 'react';
// // // // // import { Users, BookOpen, Settings, LogOut, Layers, UserCheck, LayoutDashboard, User } from 'lucide-react';
// // // // // import type { UserRole } from '../../types/auth.types';

// // // // // interface SidebarProps {
// // // // //     role?: UserRole; // Added role as an optional prop
// // // // //     currentNav: string;
// // // // //     setCurrentNav: (nav: any) => void;
// // // // //     onLogout: () => void;
// // // // // }

// // // // // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
// // // // //     // Determine if we are looking at a learner view
// // // // //     const isLearner = role === 'learner';

// // // // //     return (
// // // // //         <aside className="sidebar">
// // // // //             <div className="sidebar-header">
// // // // //                 <div className="sidebar-logo">
// // // // //                     <span className="m">m</span><span className="lab">lab</span>
// // // // //                 </div>
// // // // //             </div>

// // // // //             <nav className="sidebar-nav">
// // // // //                 {/* Dashboard / Classes Link */}
// // // // //                 <button
// // // // //                     className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`}
// // // // //                     onClick={() => setCurrentNav('dashboard')}
// // // // //                 >
// // // // //                     <LayoutDashboard size={20} />
// // // // //                     <span>{isLearner ? 'My Classes' : 'Overview'}</span>
// // // // //                 </button>

// // // // //                 {/* Conditional Rendering based on Role */}
// // // // //                 {!isLearner ? (
// // // // //                     <>
// // // // //                         {/* Admin / Staff Navigation */}
// // // // //                         <button className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`} onClick={() => setCurrentNav('learners')}>
// // // // //                             <Users size={20} /> <span>Learner Results</span>
// // // // //                         </button>
// // // // //                         <button className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`} onClick={() => setCurrentNav('qualifications')}>
// // // // //                             <BookOpen size={20} /> <span>Qualifications</span>
// // // // //                         </button>
// // // // //                         <button className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`} onClick={() => setCurrentNav('staff')}>
// // // // //                             <UserCheck size={20} /> <span>Staff Management</span>
// // // // //                         </button>
// // // // //                         <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // // //                             <Layers size={20} /> <span>Cohorts (Classes)</span>
// // // // //                         </button>
// // // // //                     </>
// // // // //                 ) : (
// // // // //                     <>
// // // // //                         {/* Learner Navigation */}
// // // // //                         <button
// // // // //                             className={`nav-item ${currentNav === 'profile' ? 'active' : ''}`}
// // // // //                             onClick={() => setCurrentNav('profile')}
// // // // //                         >
// // // // //                             <User size={20} /> <span>My Profile</span>
// // // // //                         </button>
// // // // //                     </>
// // // // //                 )}
// // // // //             </nav>

// // // // //             <div className="sidebar-footer">
// // // // //                 <button className="nav-item"><Settings size={20} /> <span>Settings</span></button>
// // // // //                 <button className="nav-item" style={{ color: '#ef4444' }} onClick={onLogout}>
// // // // //                     <LogOut size={20} /> <span>Logout</span>
// // // // //                 </button>
// // // // //             </div>
// // // // //         </aside>
// // // // //     );
// // // // // };

// // // // // // // import React from 'react';
// // // // // // // import {
// // // // // // //     Users, BookOpen, Settings, LogOut, Layers,
// // // // // // //     UserCheck, LayoutDashboard, User
// // // // // // // } from 'lucide-react';

// // // // // // // interface SidebarProps {
// // // // // // //     role?: string; // Add role here
// // // // // // //     currentNav: string;
// // // // // // //     setCurrentNav: (nav: any) => void;
// // // // // // //     onLogout: () => void;
// // // // // // // }

// // // // // // // export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
// // // // // // //     const isLearner = role === 'learner';

// // // // // // //     return (
// // // // // // //         <aside className="sidebar">
// // // // // // //             <div className="sidebar-header">
// // // // // // //                 <div className="sidebar-logo">
// // // // // // //                     <span className="m">m</span><span className="lab">lab</span>
// // // // // // //                 </div>
// // // // // // //             </div>

// // // // // // //             <nav className="sidebar-nav">
// // // // // // //                 {/* --- Shared / Role Specific Items --- */}
// // // // // // //                 <button
// // // // // // //                     className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`}
// // // // // // //                     onClick={() => setCurrentNav('dashboard')}
// // // // // // //                 >
// // // // // // //                     <LayoutDashboard size={20} />
// // // // // // //                     <span>{isLearner ? 'My Classes' : 'Overview'}</span>
// // // // // // //                 </button>

// // // // // // //                 {!isLearner ? (
// // // // // // //                     <>
// // // // // // //                         {/* --- Admin Only Items --- */}
// // // // // // //                         <button className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`} onClick={() => setCurrentNav('learners')}>
// // // // // // //                             <Users size={20} /> <span>Learner Results</span>
// // // // // // //                         </button>
// // // // // // //                         <button className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`} onClick={() => setCurrentNav('qualifications')}>
// // // // // // //                             <BookOpen size={20} /> <span>Qualifications</span>
// // // // // // //                         </button>
// // // // // // //                         <button className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`} onClick={() => setCurrentNav('staff')}>
// // // // // // //                             <UserCheck size={20} /> <span>Staff Management</span>
// // // // // // //                         </button>
// // // // // // //                         <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // // // // //                             <Layers size={20} /> <span>Cohorts (Classes)</span>
// // // // // // //                         </button>
// // // // // // //                     </>
// // // // // // //                 ) : (
// // // // // // //                     <>
// // // // // // //                         {/* --- Learner Only Items --- */}
// // // // // // //                         <button
// // // // // // //                             className={`nav-item ${currentNav === 'profile' ? 'active' : ''}`}
// // // // // // //                             onClick={() => setCurrentNav('profile')}
// // // // // // //                         >
// // // // // // //                             <User size={20} /> <span>My Profile</span>
// // // // // // //                         </button>
// // // // // // //                     </>
// // // // // // //                 )}
// // // // // // //             </nav>

// // // // // // //             <div className="sidebar-footer">
// // // // // // //                 <button className="nav-item"><Settings size={20} /> <span>Settings</span></button>
// // // // // // //                 <button
// // // // // // //                     className="nav-item"
// // // // // // //                     style={{ color: '#ef4444' }}
// // // // // // //                     onClick={onLogout}
// // // // // // //                 >
// // // // // // //                     <LogOut size={20} /> <span>Logout</span>
// // // // // // //                 </button>
// // // // // // //             </div>
// // // // // // //         </aside>
// // // // // // //     );
// // // // // // // };


// // // // // // import React from 'react';
// // // // // // import { Users, BookOpen, Settings, LogOut, Layers, UserCheck, LayoutDashboard } from 'lucide-react';

// // // // // // interface SidebarProps {
// // // // // //     currentNav: string;
// // // // // //     setCurrentNav: (nav: any) => void; // Using 'any' for brevity, strictly use the union type
// // // // // //     onLogout: () => void;
// // // // // // }

// // // // // // export const Sidebar: React.FC<SidebarProps> = ({ currentNav, setCurrentNav, onLogout }) => {
// // // // // //     return (
// // // // // //         <aside className="sidebar">
// // // // // //             <div className="sidebar-header">
// // // // // //                 <div className="sidebar-logo">
// // // // // //                     <span className="m">m</span><span className="lab">lab</span>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //             <nav className="sidebar-nav">
// // // // // //                 <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // // // // //                     <LayoutDashboard size={20} /> <span>Overview</span>
// // // // // //                 </button>
// // // // // //                 <button className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`} onClick={() => setCurrentNav('learners')}>
// // // // // //                     <Users size={20} /> <span>Learner Results</span>
// // // // // //                 </button>
// // // // // //                 <button className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`} onClick={() => setCurrentNav('qualifications')}>
// // // // // //                     <BookOpen size={20} /> <span>Qualifications</span>
// // // // // //                 </button>
// // // // // //                 <button className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`} onClick={() => setCurrentNav('staff')}>
// // // // // //                     <UserCheck size={20} /> <span>Staff Management</span>
// // // // // //                 </button>
// // // // // //                 <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // // // // //                     <Layers size={20} /> <span>Cohorts (Classes)</span>
// // // // // //                 </button>
// // // // // //             </nav>
// // // // // //             <div className="sidebar-footer">
// // // // // //                 <button className="nav-item"><Settings size={20} /> <span>Settings</span></button>
// // // // // //                 <button className="nav-item" style={{ color: '#ef4444' }} onClick={onLogout}><LogOut size={20} /> <span>Logout</span></button>
// // // // // //             </div>
// // // // // //         </aside>
// // // // // //     );
// // // // // // };