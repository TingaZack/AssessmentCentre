// src/components/dashboard/Sidebar/Sidebar.tsx

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, BookOpen, UserCheck,
    Settings, LogOut, Layers, ShieldCheck,
    GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2,
    Award, Key,
    Calendar
} from 'lucide-react';
import type { UserRole } from '../../../types/auth.types';
import { useStore } from '../../../store/useStore';
import { NotificationBell } from '../../common/NotificationBell/NotificationBell';
import './Sidebar.css';

import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

interface SidebarProps {
    role?: UserRole;
    currentNav?: string;
    setCurrentNav?: (nav: any) => void;
    onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const { settings } = useStore();
    const user = useStore((state) => state.user);
    const activeRole = role || user?.role;

    // ─── DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
    const getMenuItems = () => {
        switch (activeRole) {
            case 'admin':
                const adminMenu = [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
                    { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
                    { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
                    { id: 'attendance', label: 'Attendance Hub', icon: Calendar, path: '/admin' },
                    { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
                    { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/admin' },
                    { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
                    { id: 'workplaces', label: 'Workplaces', icon: Building2, path: '/admin' },
                    { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
                    { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
                    { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/admin' },
                ];

                if ((user as any)?.isSuperAdmin === true) {
                    adminMenu.splice(adminMenu.length - 1, 0, {
                        id: 'access',
                        label: 'Access Control',
                        icon: Key,
                        path: '/admin'
                    });
                }
                return adminMenu;
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
                    { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
                    { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
                ];
            case 'learner':
                return [
                    { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
                    { id: 'certificates', label: 'My Certificates', icon: Award, path: '/portal' },
                ];
            default:
                return [];
        }
    };

    const menuItems = getMenuItems();

    const handleNavigation = (item: any) => {
        if (setCurrentNav) {
            setCurrentNav(item.id);
            navigate(item.path, { state: { activeTab: item.id }, replace: true });
        } else {
            navigate(item.path);
        }
    };

    return (
        <aside className="sidebar">
            {/* BRANDING HEADER WITH NOTIFICATION BELL */}
            <div className="sidebar-header">
                <div className="sidebar-brand-stack">
                    <img height={45} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                    {activeRole !== 'learner' && (
                        <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
                    )}
                </div>
                {/* {user && (
                    <div className="sidebar-notif-wrapper">
                        <NotificationBell />
                    </div>
                )} */}
            </div>

            {/* NAVIGATION MENU */}
            <nav className="sidebar-nav">
                {menuItems.map((item) => {
                    const Icon = item.icon;
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

            {/* FOOTER ACTIONS */}
            <div className="sidebar-footer">
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
                <button className="nav-item" style={{ color: '#ef4444' }} onClick={onLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};



// // src/components/dashboard/Sidebar/Sidebar.tsx

// import React from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import {
//     LayoutDashboard, Users, BookOpen, UserCheck,
//     Settings, LogOut, Layers, ShieldCheck,
//     GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2,
//     Award, Key
// } from 'lucide-react';
// import type { UserRole } from '../../../types/auth.types';
// import { useStore } from '../../../store/useStore';
// import './Sidebar.css';

// import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

// interface SidebarProps {
//     role?: UserRole;
//     currentNav?: string;
//     setCurrentNav?: (nav: any) => void;
//     onLogout: () => void;
// }

// export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout }) => {
//     const navigate = useNavigate();
//     const location = useLocation();

//     const { settings } = useStore();
//     const user = useStore((state) => state.user);
//     const activeRole = role || user?.role;

//     // ─── DEFINE MENUS BASED ON ROLE ──────────────────────────────────────
//     const getMenuItems = () => {
//         switch (activeRole) {
//             case 'admin':
//                 const adminMenu = [
//                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
//                     { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
//                     { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
//                     { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
//                     { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/admin' },
//                     { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
//                     { id: 'workplaces', label: 'Workplaces', icon: Building2, path: '/admin' },
//                     { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
//                     { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
//                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/admin' },
//                 ];

//                 // SUPER ADMIN ONLY: Inject 'Access Control' right above 'My Profile'
//                 // This ensures completely zero visibility for standard admins
//                 if ((user as any)?.isSuperAdmin === true) {
//                     adminMenu.splice(adminMenu.length - 1, 0, {
//                         id: 'access',
//                         label: 'Access Control',
//                         icon: Key,
//                         path: '/admin'
//                     });
//                 }

//                 return adminMenu;
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
//                     { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
//                     // Facilitators use nested routes (App.tsx sub-routes), so /profile is correct here
//                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
//                 ];
//             case 'learner':
//                 return [
//                     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
//                     { id: 'certificates', label: 'My Certificates', icon: Award, path: '/portal' },
//                 ];
//             default:
//                 return [];
//         }
//     };

//     const menuItems = getMenuItems();

//     // ─── SMART NAVIGATION HANDLER ────────────────────────────────────────
//     const handleNavigation = (item: any) => {
//         if (setCurrentNav) {
//             // Updates the parent state (e.g., AdminDashboard's currentNav)
//             setCurrentNav(item.id);
//             // Navigates to the base path and passes the tab ID in state
//             navigate(item.path, { state: { activeTab: item.id }, replace: true });
//         } else {
//             navigate(item.path);
//         }
//     };

//     return (
//         <aside
//             className="sidebar"
//             style={{
//                 display: 'flex',
//                 flexDirection: 'column',
//                 height: '100%',
//                 overflow: 'hidden'
//             }}
//         >
//             {/* BRANDING HEADER */}
//             <div className="sidebar-header" style={{ flexShrink: 0 }}>
//                 <img height={50} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
//                 {activeRole !== 'learner' && (
//                     <div className="sidebar-role-tag">{activeRole?.toUpperCase()}</div>
//                 )}
//             </div>

//             {/* NAVIGATION MENU */}
//             <nav
//                 className="sidebar-nav"
//                 style={{
//                     flex: 1,
//                     overflowY: 'auto',
//                     display: 'flex',
//                     flexDirection: 'column'
//                 }}
//             >
//                 {menuItems.map((item) => {
//                     const Icon = item.icon;
//                     // Check if current state ID matches OR if we are on a specific sub-route
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

//             {/* FOOTER ACTIONS */}
//             <div className="sidebar-footer" style={{ flexShrink: 0, marginTop: 'auto' }}>
//                 <button
//                     className={`nav-item ${currentNav === 'settings' || location.pathname === '/settings' ? 'active' : ''}`}
//                     onClick={() => {
//                         if (setCurrentNav) setCurrentNav('settings');
//                         navigate('/settings');
//                     }}
//                 >
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