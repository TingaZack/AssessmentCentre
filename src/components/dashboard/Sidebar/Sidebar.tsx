// src/components/dashboard/Sidebar/Sidebar.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
    LayoutDashboard, Users, BookOpen, UserCheck,
    Settings, LogOut, Layers, ShieldCheck,
    GraduationCap, ClipboardList, CheckSquare, User, UserCircle, Building2,
    Award, Key, Calendar, Globe, CalendarCheck, MessageSquare, Bug, HelpCircle
} from 'lucide-react';
import type { UserRole } from '../../../types/auth.types';
import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import './Sidebar.css';

import mLabLogo from '../../../assets/logo/mlab_logo_white.png';

interface SidebarProps {
    role?: UserRole;
    currentNav?: string;
    setCurrentNav?: (nav: any) => void;
    onLogout: () => void;
    alerts?: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({ role, currentNav, setCurrentNav, onLogout, alerts }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        settings,
        staff = [],
        cohorts = [],
        learners = [],
        fetchStaff,
        fetchCohorts,
        fetchLearners
    } = useStore();
    const user = useStore((state) => state.user);

    const activeRole = (role || user?.role || '').toLowerCase();
    const isAssistant = ['assistant_facilitator', 'support_facilitator', 'supportfacilitator'].includes(activeRole);

    const tabbedBasePaths = ['/admin', '/facilitator', '/portal', '/marking', '/moderation'];

    const urlTab = searchParams.get('tab');
    const activeTabId = urlTab || currentNav || 'dashboard';

    const [internalCoachingAlerts, setInternalCoachingAlerts] = useState(0);

    // Hydrate store datasets if missing
    useEffect(() => {
        if (staff.length === 0 && fetchStaff) fetchStaff();
        if (cohorts.length === 0 && fetchCohorts) fetchCohorts();
        if (learners.length === 0 && fetchLearners) fetchLearners();
    }, [staff.length, cohorts.length, learners.length, fetchStaff, fetchCohorts, fetchLearners]);

    // Real-time Coaching Alert Listener with Detailed Debug Logging
    useEffect(() => {
        if (!user?.uid) return;

        // console.group('🔍 SIDEBAR COACHING BADGE DEBUGGER');
        // console.log('1. User Auth UID:', user.uid);
        // console.log('2. User Email:', user.email);
        // console.log('3. Store Staff Array Length:', staff.length);
        // console.log('4. Store Cohorts Array Length:', cohorts.length);
        // console.log('5. Store Learners Array Length:', learners.length);

        const myStaffDoc = staff.find(s => s.authUid === user?.uid || s.email === user?.email || s.id === user?.uid);
        const myStaffId = myStaffDoc?.id;
        console.log('6. Resolved Staff Doc ID:', myStaffId);

        const isSuperAdmin = (user as any)?.isSuperAdmin === true || activeRole.includes('super');
        const isAdmin = activeRole.includes('admin');
        const isStaffUser = ['admin', 'assistant_admin', 'super_admin', 'superadmin', 'facilitator', 'assistant_facilitator', 'assessor', 'moderator'].includes(activeRole) || isSuperAdmin;

        const myCohortIds = cohorts
            .filter(c =>
                c.facilitatorId === user.uid || c.facilitatorId === myStaffId ||
                c.supportFacilitatorId === user.uid || c.supportFacilitatorId === myStaffId ||
                c.assessorId === user.uid || c.assessorId === myStaffId
            )
            .map(c => c.id);
        console.log('7. Resolved Assigned Cohort IDs:', myCohortIds);

        // Map both Document ID and South African ID Number for all learners in my cohorts
        const myLearnerIdentifiers = new Set<string>();
        learners.forEach(l => {
            if (l.cohortId && myCohortIds.includes(l.cohortId)) {
                if (l.id) myLearnerIdentifiers.add(l.id);
                if (l.idNumber) myLearnerIdentifiers.add(l.idNumber);
                if ((l as any).learnerId) myLearnerIdentifiers.add((l as any).learnerId);
            }
        });
        console.log('8. Resolved Learner Identifier Set Size:', myLearnerIdentifiers.size);

        const q = query(
            collection(db, 'coaching_sessions'),
            where('status', 'in', ['requested', 'pending_notes', 'scheduled'])
        );

        const unsub = onSnapshot(q, (snap) => {
            console.log('9. Raw Snapshot Docs Count:', snap.docs.length);
            let count = 0;
            const nowMs = Date.now();

            snap.docs.forEach((docSnap, i) => {
                const data = docSnap.data();
                const facId = data.facilitatorId;
                const assId = data.assessorId;
                const hostId = data.hostId;
                const learnerId = data.learnerId;
                const hostEmail = (data.hostEmail || data.facilitatorEmail || '').toLowerCase();
                const cohortId = data.cohortId;

                // Precision relevance check matching class allocations & direct assignments
                const isRelevantToUser = isStaffUser ? (
                    isSuperAdmin ||
                    isAdmin ||
                    facId === user.uid || (myStaffId && facId === myStaffId) ||
                    assId === user.uid || (myStaffId && assId === myStaffId) ||
                    hostId === user.uid || (myStaffId && hostId === myStaffId) ||
                    (hostEmail && user.email && hostEmail === user.email.toLowerCase()) ||
                    (cohortId && myCohortIds.includes(cohortId)) ||
                    (learnerId && myLearnerIdentifiers.has(learnerId))
                ) : (
                    data.learnerId === user.uid || (user.email && data.learnerEmail?.toLowerCase() === user.email.toLowerCase())
                );

                const isPast = new Date(data.dateTime).getTime() < nowMs;
                const needsLink = !data.meetLink || data.requiresManualLink;
                const isActionRequired = data.status === 'pending_notes' || data.status === 'requested' || (data.status === 'scheduled' && (isPast || needsLink));

                console.group(`Session #${i + 1} (${docSnap.id}): ${data.topic || 'Untitled'}`);
                console.log('Status:', data.status);
                console.log('IDs -> facilitatorId:', facId, '| assessorId:', assId, '| hostId:', hostId, '| learnerId:', learnerId);
                console.log('cohortId:', cohortId);
                console.log('Is Relevant to User?:', isRelevantToUser);
                console.log('Is Action Required?:', isActionRequired);
                console.log('Included in Badge Count?:', isRelevantToUser && isActionRequired);
                console.groupEnd();

                if (isRelevantToUser && isActionRequired) count++;
            });

            console.log('10. FINAL CALCULATED BADGE COUNT:', count);
            console.groupEnd();

            setInternalCoachingAlerts(count);
        }, (err) => {
            console.error("Coaching alerts listener error:", err);
            console.groupEnd();
        });

        return () => unsub();
    }, [user?.uid, user?.email, staff.length, cohorts.length, learners.length, activeRole]);

    useEffect(() => {
        const targetTab = urlTab || 'dashboard';
        if (setCurrentNav && currentNav !== targetTab) {
            setCurrentNav(targetTab);
        }
    }, [urlTab, currentNav, setCurrentNav]);

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

                const isSuperAdmin = currentUser?.isSuperAdmin === true ||
                    activeRole === 'super_admin' ||
                    activeRole === 'superadmin';

                const privs = currentUser?.privileges || {};
                const hasPrivilegesObject = currentUser?.privileges && Object.keys(currentUser.privileges).length > 0;

                const hasPriv = (key: string) => {
                    if (isSuperAdmin) return true;
                    if (!hasPrivilegesObject) return true;
                    return privs[key] !== false;
                };

                const secondary = Array.isArray(currentUser?.secondaryRoles) ? currentUser.secondaryRoles : [];
                const hasAssessorRights = isSuperAdmin || currentUser?.canMarkAssessments === true || secondary.includes('assessor');

                const adminMenu = [
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
                    hasPriv('directory') && { id: 'directory', label: 'Master Directory', icon: Users, path: '/admin' },
                    hasPriv('learners') && { id: 'learners', label: 'Course Enrollments', icon: GraduationCap, path: '/admin' },
                    hasPriv('attendance') && { id: 'attendance', label: 'Attendance Hub', icon: Calendar, path: '/admin' },
                    hasPriv('ecosystem') && { id: 'ecosystem', label: 'Ecosystem & Events', icon: Globe, path: '/admin' },
                    hasPriv('qualifications') && { id: 'qualifications', label: 'Qualifications', icon: BookOpen, path: '/admin' },
                    hasPriv('assessments') && { id: 'assessments', label: 'Assessments', icon: ClipboardList, path: '/admin' },
                    hasPriv('surveys') && { id: 'surveys', label: 'Surveys & Feedback', icon: HelpCircle, path: '/admin' },
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
                    { id: 'surveys', label: 'Surveys & Feedback', icon: HelpCircle, path: '/facilitator' },
                    facHasMarking && { id: 'marking', label: 'Marking Suite', icon: CheckSquare, path: '/marking' },
                    { id: 'coaching', label: 'Coaching Schedule', icon: MessageSquare, path: '/facilitator' },
                    { id: 'studio', label: 'Certificate Studio', icon: Award, path: '/facilitator' },
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

    const checkIsActive = (item: any) => {
        const isCurrentBasePage = location.pathname === item.path || (location.pathname === '/' && item.path === '/portal');
        if (isCurrentBasePage) {
            return activeTabId === item.id;
        }

        if (!tabbedBasePaths.includes(item.path)) {
            return location.pathname.startsWith(item.path);
        }

        return false;
    };

    const handleNavigation = (item: any) => {
        if (!tabbedBasePaths.includes(item.path)) {
            navigate(item.path);
            return;
        }

        const isSameBasePage = location.pathname === item.path || location.pathname === `${item.path}/`;

        if (setCurrentNav) {
            setCurrentNav(item.id);
        }

        if (isSameBasePage) {
            setSearchParams((prev) => {
                prev.set('tab', item.id);
                return prev;
            }, { replace: true });
        } else {
            const newParams = new URLSearchParams();
            newParams.set('tab', item.id);
            navigate(`${item.path}?${newParams.toString()}`, { replace: true });
        }
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

                    const alertCount = item.id === 'coaching'
                        ? (alerts?.coaching ?? internalCoachingAlerts)
                        : (alerts?.[item.id] || 0);

                    return (
                        <button key={item.id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => handleNavigation(item)} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <Icon size={20} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>

                            {alertCount > 0 && (
                                <span style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    lineHeight: 1,
                                    flexShrink: 0,
                                    marginLeft: '8px'
                                }}>
                                    {alertCount > 99 ? '99+' : alertCount}
                                </span>
                            )}
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