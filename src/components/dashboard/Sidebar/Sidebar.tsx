// src/components/dashboard/Sidebar/Sidebar.tsx

import React from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
    LayoutDashboard, Users, BookOpen, UserCheck,
    Settings, LogOut, Layers, ShieldCheck,
    GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2,
    Award, Key, Calendar, Globe, CalendarCheck, MessageSquare, Bug
} from 'lucide-react';
import type { UserRole } from '../../../types/auth.types';
import { useStore } from '../../../store/useStore';
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
    const [searchParams] = useSearchParams();

    const { settings } = useStore();
    const user = useStore((state) => state.user);

    const activeRole = (role || user?.role || '').toLowerCase();

    const isAssistant = ['assistant_facilitator', 'support_facilitator', 'supportfacilitator'].includes(activeRole);

    const getMenuItems = () => {
        if (isAssistant) {
            return [
                { id: 'dashboard', label: 'Cohort Overview', icon: LayoutDashboard, path: '/facilitator' },
                { id: 'attendance', label: 'Attendance Hub', icon: Users, path: '/facilitator/attendance' },
                { id: 'assessments', label: 'Portfolio Tracking', icon: ClipboardList, path: '/facilitator/assessments' },
                { id: 'coaching', label: 'Support Sessions', icon: MessageSquare, path: '/facilitator' },
                { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
            ];
        }

        switch (activeRole) {
            case 'admin':
            case 'assistant_admin':
            case 'super_admin':
            case 'superadmin': {
                const currentUser = user as any;

                // 🚀 SUPER ADMIN DETECTION (Checks boolean flag or role string)
                const isSuperAdmin = currentUser?.isSuperAdmin === true ||
                    activeRole === 'super_admin' ||
                    activeRole === 'superadmin';

                const privs = currentUser?.privileges || {};
                const hasPrivilegesObject = currentUser?.privileges && Object.keys(currentUser.privileges).length > 0;

                // 🚀 ROBUST PRIVILEGE HELPER: Defaults to TRUE unless explicitly set to FALSE
                const hasPriv = (key: string) => {
                    if (isSuperAdmin) return true;
                    if (!hasPrivilegesObject) return true;
                    return privs[key] !== false;
                };

                const secondary = Array.isArray(currentUser?.secondaryRoles) ? currentUser.secondaryRoles : [];
                const hasAssessorRights = isSuperAdmin || currentUser?.canMarkAssessments === true || secondary.includes('assessor');

                // DYNAMIC RBAC FILTERING
                const adminMenu = [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
                    hasPriv('directory') && { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
                    hasPriv('learners') && { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
                    hasPriv('attendance') && { id: 'attendance', label: 'Attendance Hub', icon: Calendar, path: '/admin' },
                    hasPriv('ecosystem') && { id: 'ecosystem', label: 'Ecosystem & Events', icon: Globe, path: '/admin' },
                    hasPriv('qualifications') && { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
                    hasPriv('assessments') && { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/admin' },
                    hasPriv('surveys') && { id: 'surveys', label: 'Surveys & Feedback', icon: ClipboardList, path: '/admin' },
                    (isSuperAdmin || hasAssessorRights) && { id: 'marking', label: 'Marking Suite', icon: CheckSquare, path: '/marking' },
                    hasPriv('staff') && { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
                    hasPriv('workplaces') && { id: 'workplaces', label: 'Workplaces', icon: Building2, path: '/admin' },
                    hasPriv('cohorts') && { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
                    hasPriv('cohorts') && { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/admin' },
                    hasPriv('studio') && { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin' },
                    { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/admin' },
                ].filter(Boolean);

                if (isSuperAdmin) {
                    const profileIndex = adminMenu.findIndex(item => (item as any).id === 'profile');
                    adminMenu.splice(profileIndex, 0,
                        { id: 'access', label: 'Access Control', icon: Key, path: '/admin' },
                        { id: 'crashes', label: 'Bug Tracker', icon: Bug, path: '/admin' }
                    );
                }
                return adminMenu;
            }

            case 'assessor':
                return [
                    { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
                    { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
                    { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/marking' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
                ];

            case 'moderator':
                return [
                    { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
                    { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
                ];

            case 'facilitator': {
                const facUser = user as any;
                const facHasMarking = facUser?.isSuperAdmin || facUser?.canMarkAssessments === true || facUser?.secondaryRoles?.includes('assessor');

                return [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
                    { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator/attendance' },
                    { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator/assessments' },
                    { id: 'surveys', label: 'Surveys & Feedback', icon: ClipboardList, path: '/admin' },
                    facHasMarking && { id: 'marking', label: 'Marking Suite', icon: CheckSquare, path: '/marking' },
                    { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/facilitator' },
                    { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
                    { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
                ].filter(Boolean);
            }

            case 'learner':
                return [
                    { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
                    { id: 'attendance', label: 'Attendance Log', icon: CalendarCheck, path: '/portal' },
                    { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
                    { id: 'certificates', label: 'My Certificates', icon: Award, path: '/portal' },
                ];

            default:
                return [];
        }
    };

    const menuItems = getMenuItems();

    const activeTabId = currentNav || searchParams.get('tab') || 'dashboard';

    const checkIsActive = (item: any) => {
        const isCurrentBasePage = location.pathname === item.path || (location.pathname === '/' && item.path === '/portal');
        if (isCurrentBasePage) {
            return activeTabId === item.id;
        }

        if (item.path !== '/admin' && item.path !== '/facilitator' && item.path !== '/portal') {
            return location.pathname.startsWith(item.path);
        }

        return false;
    };

    const handleNavigation = (item: any) => {
        if (item.path !== '/admin' && item.path !== '/facilitator' && item.path !== '/portal') {
            navigate(item.path);
            return;
        }

        if (location.pathname === item.path || location.pathname === `${item.path}/`) {
            if (setCurrentNav) setCurrentNav(item.id);
            return;
        }

        const newParams = new URLSearchParams();
        if (item.id !== 'dashboard') newParams.set('tab', item.id);
        const queryString = newParams.toString();
        navigate(queryString ? `${item.path}?${queryString}` : item.path, { replace: true });
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-brand-stack">
                    <img height={45} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                    {activeRole !== 'learner' && (
                        <div className="sidebar-role-tag">
                            {isAssistant ? 'ASSISTANT FACILITATOR' : activeRole?.replace('_', ' ').toUpperCase()}
                        </div>
                    )}
                </div>
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item: any) => {
                    const Icon = item.icon;
                    const isActive = checkIsActive(item);

                    return (
                        <button key={item.id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => handleNavigation(item)}>
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                {(!['admin', 'assistant_admin'].includes(activeRole || '') || (user as any)?.isSuperAdmin || (user as any)?.privileges?.settings) && (
                    <button className={`nav-item ${currentNav === 'settings' || location.pathname === '/settings' ? 'active' : ''}`} onClick={() => { if (setCurrentNav) setCurrentNav('settings'); navigate('/settings'); }}>
                        <Settings size={20} />
                        <span>Settings</span>
                    </button>
                )}

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
// import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
// import {
//     LayoutDashboard, Users, BookOpen, UserCheck,
//     Settings, LogOut, Layers, ShieldCheck,
//     GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2,
//     Award, Key, Calendar, Globe, CalendarCheck, MessageSquare, Bug
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
//     const [searchParams] = useSearchParams();

//     const { settings } = useStore();
//     const user = useStore((state) => state.user);

//     const activeRole = role || user?.role;

//     const isAssistant = ['assistant_facilitator', 'support_facilitator', 'supportFacilitator'].includes(activeRole || '');

//     const getMenuItems = () => {
//         // Intercept Assistant variants before the main switch
//         if (isAssistant) {
//             return [
//                 { id: 'dashboard', label: 'Cohort Overview', icon: LayoutDashboard, path: '/facilitator' },
//                 { id: 'attendance', label: 'Attendance Hub', icon: Users, path: '/facilitator/attendance' },
//                 { id: 'assessments', label: 'Portfolio Tracking', icon: ClipboardList, path: '/facilitator/assessments' },
//                 { id: 'coaching', label: 'Support Sessions', icon: MessageSquare, path: '/facilitator' },
//                 { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
//             ];
//         }

//         switch (activeRole) {
//             case 'admin':
//             case 'assistant_admin': {
//                 const currentUser = user as any;
//                 const isSuperAdmin = currentUser?.isSuperAdmin === true;
//                 const privs = currentUser?.privileges || {};
//                 const secondary = Array.isArray(currentUser?.secondaryRoles) ? currentUser.secondaryRoles : [];
//                 const hasAssessorRights = isSuperAdmin || currentUser?.canMarkAssessments === true || secondary.includes('assessor');

//                 // DYNAMIC RBAC FILTERING
//                 const adminMenu = [
//                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
//                     (isSuperAdmin || privs.directory) && { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
//                     (isSuperAdmin || privs.learners) && { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
//                     (isSuperAdmin || privs.attendance) && { id: 'attendance', label: 'Attendance Hub', icon: Calendar, path: '/admin' },
//                     (isSuperAdmin || privs.ecosystem) && { id: 'ecosystem', label: 'Ecosystem & Events', icon: Globe, path: '/admin' },
//                     (isSuperAdmin || privs.qualifications) && { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
//                     (isSuperAdmin || privs.assessments) && { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/admin' },
//                     (isSuperAdmin || hasAssessorRights) && { id: 'marking', label: 'Marking Suite', icon: CheckSquare, path: '/marking' },
//                     (isSuperAdmin || privs.staff) && { id: 'staff', label: 'Staff Management', icon: UserCheck, path: '/admin' },
//                     (isSuperAdmin || privs.workplaces) && { id: 'workplaces', label: 'Workplaces', icon: Building2, path: '/admin' },
//                     (isSuperAdmin || privs.cohorts) && { id: 'cohorts', label: 'Cohorts (Classes)', icon: Layers, path: '/admin' },
//                     (isSuperAdmin || privs.cohorts) && { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/admin' },
//                     (isSuperAdmin || privs.studio) && { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin' },
//                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/admin' },
//                 ].filter(Boolean);

//                 if (isSuperAdmin) {
//                     const profileIndex = adminMenu.findIndex(item => (item as any).id === 'profile');
//                     adminMenu.splice(profileIndex, 0,
//                         { id: 'access', label: 'Access Control', icon: Key, path: '/admin' },
//                         { id: 'crashes', label: 'Bug Tracker', icon: Bug, path: '/admin' }
//                     );
//                 }
//                 return adminMenu;
//             }

//             case 'assessor':
//                 return [
//                     { id: 'dashboard', label: 'Marking Queue', icon: CheckSquare, path: '/marking' },
//                     { id: 'cohorts', label: 'My Cohorts', icon: Layers, path: '/marking' },
//                     { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/marking' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/marking' },
//                 ];

//             case 'moderator':
//                 return [
//                     { id: 'dashboard', label: 'QA Queue', icon: ShieldCheck, path: '/moderation' },
//                     { id: 'cohorts', label: 'Cohorts', icon: Layers, path: '/moderation' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/moderation' },
//                 ];

//             case 'facilitator': {
//                 const facUser = user as any;
//                 const facHasMarking = facUser?.isSuperAdmin || facUser?.canMarkAssessments === true || facUser?.secondaryRoles?.includes('assessor');

//                 return [
//                     { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/facilitator' },
//                     { id: 'attendance', label: 'Attendance', icon: Users, path: '/facilitator/attendance' },
//                     { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/facilitator/assessments' },
//                     facHasMarking && { id: 'marking', label: 'Marking Suite', icon: CheckSquare, path: '/marking' },
//                     { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/facilitator' },
//                     { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/admin/studio' },
//                     { id: 'profile', label: 'My Profile', icon: UserCircle, path: '/facilitator/profile' },
//                 ].filter(Boolean);
//             }

//             case 'learner':
//                 return [
//                     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard, path: '/portal' },
//                     { id: 'attendance', label: 'Attendance Log', icon: CalendarCheck, path: '/portal' },
//                     { id: 'profile', label: 'My Profile', icon: User, path: '/portal' },
//                     { id: 'certificates', label: 'My Certificates', icon: Award, path: '/portal' },
//                 ];

//             default:
//                 return [];
//         }
//     };

//     const menuItems = getMenuItems();

//     // 🚀 DYNAMIC ACTIVE TAB EVALUATOR
//     const activeTabId = currentNav || searchParams.get('tab') || 'dashboard';

//     const checkIsActive = (item: any) => {
//         // 1. If item is a tab on the current base page (e.g. /portal or /admin)
//         const isCurrentBasePage = location.pathname === item.path || (location.pathname === '/' && item.path === '/portal');
//         if (isCurrentBasePage) {
//             return activeTabId === item.id;
//         }

//         // 2. If item navigates to a standalone distinct route (e.g. /marking or /admin/studio)
//         if (item.path !== '/admin' && item.path !== '/facilitator' && item.path !== '/portal') {
//             return location.pathname.startsWith(item.path);
//         }

//         return false;
//     };

//     const handleNavigation = (item: any) => {
//         // If navigating to a standalone distinct route outside current base page
//         if (item.path !== '/admin' && item.path !== '/facilitator' && item.path !== '/portal') {
//             navigate(item.path);
//             return;
//         }

//         // If staying on current page base path, update tab URL parameter
//         if (location.pathname === item.path || location.pathname === `${item.path}/`) {
//             if (setCurrentNav) setCurrentNav(item.id);
//             return;
//         }

//         const newParams = new URLSearchParams();
//         if (item.id !== 'dashboard') newParams.set('tab', item.id);
//         const queryString = newParams.toString();
//         navigate(queryString ? `${item.path}?${queryString}` : item.path, { replace: true });
//     };

//     return (
//         <aside className="sidebar">
//             <div className="sidebar-header">
//                 <div className="sidebar-brand-stack">
//                     <img height={45} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
//                     {activeRole !== 'learner' && (
//                         <div className="sidebar-role-tag">
//                             {isAssistant ? 'ASSISTANT FACILITATOR' : activeRole?.replace('_', ' ').toUpperCase()}
//                         </div>
//                     )}
//                 </div>
//             </div>

//             <nav className="sidebar-nav">
//                 {menuItems.map((item: any) => {
//                     const Icon = item.icon;
//                     const isActive = checkIsActive(item);

//                     return (
//                         <button key={item.id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => handleNavigation(item)}>
//                             <Icon size={20} />
//                             <span>{item.label}</span>
//                         </button>
//                     );
//                 })}
//             </nav>

//             <div className="sidebar-footer">
//                 {(!['admin', 'assistant_admin'].includes(activeRole || '') || (user as any)?.isSuperAdmin || (user as any)?.privileges?.settings) && (
//                     <button className={`nav-item ${currentNav === 'settings' || location.pathname === '/settings' ? 'active' : ''}`} onClick={() => { if (setCurrentNav) setCurrentNav('settings'); navigate('/settings'); }}>
//                         <Settings size={20} />
//                         <span>Settings</span>
//                     </button>
//                 )}

//                 <button className="nav-item" style={{ color: '#ef4444' }} onClick={onLogout}>
//                     <LogOut size={20} />
//                     <span>Logout</span>
//                 </button>
//             </div>
//         </aside>
//     );
// };