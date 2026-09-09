// src/pages/AdminDashboard/AdminDashboard.tsx

import React, { useEffect, useState, useTransition } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, writeBatch, updateDoc, collection } from 'firebase/firestore';
import { Menu, X, ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { useStore, type StaffMember } from '../../store/useStore';
import type { DashboardLearner, ProgrammeTemplate, Cohort, Employer } from '../../types';

// --- CORE DASHBOARD COMPONENTS ---
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';
import { AdminProfileView } from './AdminProfileView/AdminProfileView';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { AccessManager } from './AccessManager/AccessManager';
import { SystemCrashesManager } from './SystemCrashesManager/SystemCrashesManager';
import { SurveyManager } from './SurveyManager/SurveyManager';

// --- ENTITY MANAGEMENT VIEWS ---
import { StaffView } from '../../components/views/StaffView/StaffView';
import { CohortsView } from '../../components/views/CohortsView/CohortsView';
import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
import { LearnersView } from '../../components/views/LearnersView/LearnersView';
import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView/LearnerDirectoryView';
import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { CertificateStudio } from './CertificateStudio/CertificateStudio';
import { AssessorProfileView } from '../FacilitatorDashboard/AssessorProfileView/AssessorProfileView';
import { AdminInterviewStudioView } from './AdminInterviewStudioView/AdminInterviewStudioView';

// --- MODALS & UTILS ---
import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
import { StaffFormModal } from '../../components/admin/StaffFormModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';
import { StatusModal } from '../../components/common/StatusModal/StatusModal';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// --- APP MODULES ---
import { AttendanceHistoryList } from '../FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList';
import { EcosystemDashboard } from '../../components/admin/EcosystemDashboard/EcosystemDashboard';
import { WorkplaceHub } from '../../components/views/WorkplaceHub/WorkplaceHub';
import { CoachingScheduleView } from '../../components/views/CoachingScheduleView/CoachingScheduleView';
import { CompanyInsightsView } from '../../components/admin/WorkplacesManager/CompanyInsightsView/CompanyInsightsView';

import './AdminDashboard.css';

type NavTabs = 'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' |
    'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'crashes' |
    'assessments' | 'settings' | 'attendance' | 'ecosystem' | 'company-profile' | 'coaching' | 'surveys' | 'interview-studio';

export const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const store = useStore();
    const { user, setUser } = store;
    const toast = useToast();

    const [searchParams, setSearchParams] = useSearchParams();
    const currentNav = (searchParams.get('tab') as NavTabs) || 'dashboard';

    const employerIdParam = searchParams.get('employerId');

    const [isPending, startTransition] = useTransition();

    const setCurrentNav = (tab: NavTabs) => {
        startTransition(() => {
            setSearchParams(prev => {
                const params = new URLSearchParams(prev);
                if (tab === 'dashboard') {
                    params.delete('tab');
                } else {
                    params.set('tab', tab);
                }
                params.delete('view');
                if (tab !== 'company-profile') {
                    params.delete('employerId');
                }
                return params;
            }, { replace: true });

            if (tab !== 'staff') setViewingStaffProfile(null);
            if (tab !== 'company-profile') setSelectedCompanyForInsights(null);
        });
    };

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [selectedCompanyForInsights, setSelectedCompanyForInsights] = useState<Employer | null>(null);
    const [viewingStaffProfile, setViewingStaffProfile] = useState<StaffMember | null>(null);

    const activeCompanyForInsights = selectedCompanyForInsights || store.employers.find((e: Employer) => e.id === employerIdParam);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    useEffect(() => {
        const handleOpenInsights = (e: any) => {
            setSelectedCompanyForInsights(e.detail);
            startTransition(() => {
                setSearchParams(prev => {
                    const params = new URLSearchParams(prev);
                    params.set('tab', 'company-profile');
                    params.set('employerId', e.detail.id);
                    return params;
                }, { replace: true });
            });
        };
        window.addEventListener('openCompanyInsights', handleOpenInsights);
        return () => window.removeEventListener('openCompanyInsights', handleOpenInsights);
    }, [setSearchParams]);

    // Modal States
    const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
    const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
    const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

    const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);
    const [learnerToInvite, setLearnerToInvite] = useState<DashboardLearner | null>(null);
    const [showNoEmailAlert, setShowNoEmailAlert] = useState(false);
    const [isInviting, setIsInviting] = useState(false);

    const [showProgModal, setShowProgModal] = useState(false);
    const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
    const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

    const [showStaffModal, setShowStaffModal] = useState(false);
    const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
    const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

    const [showCohortModal, setShowCohortModal] = useState(false);
    const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
    const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

    // Smart Data Loader
    useEffect(() => {
        const currentUser = user as any;
        const isSuper = currentUser?.isSuperAdmin === true;
        const privs = currentUser?.privileges || {};

        const load = (dataArray: any[], fetcher: Function) => {
            if (!dataArray || dataArray.length === 0) fetcher();
        };

        if (currentNav === 'dashboard') {
            if (isSuper || privs.learners) { load(store.learners, store.fetchLearners); load(store.stagingLearners, store.fetchStagingLearners); }
            if (isSuper || privs.cohorts) load(store.cohorts, store.fetchCohorts);
            if (isSuper || privs.staff) load(store.staff, store.fetchStaff);
        }

        if (currentNav === 'directory' && (isSuper || privs.directory)) {
            load(store.learners, store.fetchLearners);
        }

        if (currentNav === 'interview-studio' && (isSuper || privs.learners)) {
            load(store.learners, store.fetchLearners);
        }

        if (currentNav === 'learners' && (isSuper || privs.learners)) {
            load(store.learners, store.fetchLearners);
            load(store.stagingLearners, store.fetchStagingLearners);
            load(store.cohorts, store.fetchCohorts);
        }

        if (currentNav === 'qualifications' && (isSuper || privs.qualifications)) {
            load(store.programmes, store.fetchProgrammes);
        }

        if (currentNav === 'staff' && (isSuper || privs.staff)) {
            load(store.staff, store.fetchStaff);
            load(store.employers, store.fetchEmployers);
        }

        if ((currentNav === 'workplaces' || currentNav === 'company-profile') && (isSuper || privs.workplaces)) {
            load(store.employers, store.fetchEmployers);
        }

        if (currentNav === 'studio' && (isSuper || privs.studio)) {
            if (store.fetchAdHocCertificates) store.fetchAdHocCertificates();
        }

        if (currentNav === 'cohorts' && (isSuper || privs.cohorts)) {
            load(store.cohorts, store.fetchCohorts);
            load(store.programmes, store.fetchProgrammes);
            load(store.staff, store.fetchStaff);
            load(store.learners, store.fetchLearners);
        }

        if (currentNav === 'assessments' && (isSuper || privs.assessments)) {
            load(store.cohorts, store.fetchCohorts);
            load(store.programmes, store.fetchProgrammes);
        }
    }, [currentNav, user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleUpdateAdminProfile = async (id: string, updates: any) => {
        try {
            await updateDoc(doc(db, 'users', id), updates);
            if (user?.uid === id) setUser({ ...user, ...updates } as any);
            if (store.updateStaffProfile) await store.updateStaffProfile(id, updates);
            toast.success("Profile updated successfully.");
        } catch (err) {
            console.error("Profile update failed:", err);
            toast.error("Failed to update profile.");
            throw err;
        }
    };

    const handleArchiveLearner = async (learner: DashboardLearner) => setLearnerToProcess({ learner, action: 'archive' });
    const handleDiscardDraft = async (learner: DashboardLearner) => setLearnerToProcess({ learner, action: 'discard' });
    const handleRestoreLearner = async (learner: DashboardLearner) => {
        if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
        await store.restoreLearner(learner.id);
        toast.success(`${learner.fullName} has been restored.`);
    };

    const handleBulkApprove = async (learnersToApprove: DashboardLearner[], mode: 'standard' | 'shadow' | 'offline' = 'standard') => {
        if (!learnersToApprove || learnersToApprove.length === 0) return;
        const confirmationMessages = {
            standard: `Approve ${learnersToApprove.length} standard profiles into the system directory? They will remain dormant until manually invited.`,
            shadow: `Approve ${learnersToApprove.length} profiles straight into live Bootcamp rosters? This will skip authentication setups.`,
            offline: `Approve ${learnersToApprove.length} profiles as offline RPL records? This skips platform login profiles.`
        };
        if (!window.confirm(confirmationMessages[mode])) return;
        await store.approveStagingLearners(learnersToApprove, mode as any);
        toast.success(`Successfully processed ${learnersToApprove.length} profiles.`);
    };

    const handleInviteLearner = (learner: DashboardLearner) => {
        if (!learner.email) {
            setShowNoEmailAlert(true);
            return;
        }
        setLearnerToInvite(learner);
    };

    const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
        const count = learnersToArchive.length;
        if (!window.confirm(`Archive ${count} enrollments? They will be moved to the Archive tab.`)) return;
        try {
            const batch = writeBatch(db);
            learnersToArchive.forEach(l => {
                const enrolId = l.enrollmentId || l.id;
                const ref = doc(db, 'enrollments', enrolId);
                batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
            });
            await batch.commit();
            await store.fetchLearners(true);
            toast.success(`Successfully archived ${count} enrollments.`);
        } catch (e: any) {
            toast.error("Failed to archive: " + e.message);
        }
    };

    const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
        const count = draftsToDiscard.length;
        if (!window.confirm(`Permanently discard ${count} drafts?`)) return;
        const ids = draftsToDiscard.map(l => l.id);
        await store.discardStagingLearners(ids);
        toast.success(`Discarded ${count} drafts.`);
    };

    const executeLearnerAction = async () => {
        if (!learnerToProcess) return;
        const { learner, action } = learnerToProcess;
        try {
            if (action === 'archive') {
                await store.archiveLearner(learner.id);
                toast.success(`${learner.fullName} has been archived.`);
            } else if (action === 'discard') {
                await store.discardStagingLearners([learner.id]);
                toast.success(`Draft for ${learner.fullName} was discarded.`);
            }
        } catch (err: any) {
            toast.error(`Failed to ${action} learner: ${err.message}`);
        } finally {
            setLearnerToProcess(null);
        }
    };

    const handleLearnerCohortArchive = async (year: string) => {
        if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
            await store.archiveCohort(year);
            toast.success(`Cohort ${year} has been successfully archived.`);
        }
    };

    const checkAccess = (tab: NavTabs) => {
        const currentUser = user as any;
        const activeRole = (currentUser?.role || '').toLowerCase();

        const isSuperAdmin = currentUser?.isSuperAdmin === true ||
            activeRole === 'super_admin' ||
            activeRole === 'superadmin';

        if (isSuperAdmin) return true;
        if (tab === 'dashboard' || tab === 'profile') return true;
        if (tab === 'access' || tab === 'crashes') return false;

        const adminRoles = ['admin', 'assistant_admin', 'super_admin', 'superadmin'];
        if (adminRoles.includes(activeRole)) {
            const privs = currentUser?.privileges;
            if (!privs || Object.keys(privs).length === 0) return true;

            const accessMap: Record<string, boolean> = {
                'directory': privs.directory !== false,
                'learners': privs.learners !== false,
                'staff': privs.staff !== false,
                'attendance': privs.attendance !== false,
                'workplaces': privs.workplaces !== false,
                'company-profile': privs.workplaces !== false,
                'qualifications': privs.qualifications !== false,
                'assessments': privs.assessments !== false,
                'surveys': privs.surveys !== false,
                'cohorts': privs.cohorts !== false,
                'ecosystem': privs.ecosystem !== false,
                'studio': privs.studio !== false,
                'settings': privs.settings !== false,
                'coaching': privs.cohorts !== false,
                'interview-studio': privs.learners !== false || privs.studio !== false
            };
            return accessMap[tab] === true;
        }
        return true;
    };

    const hasAccess = checkAccess(currentNav);

    return (
        <div className="admin-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <div className="admin-mobile-header">
                <div className="admin-mobile-header-left">
                    <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu size={24} />
                    </button>
                    <div className="admin-mobile-title">Admin Portal</div>
                </div>
                <div className="admin-mobile-header-right">
                    <NotificationBell />
                </div>
            </div>

            {isMobileMenuOpen && (
                <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={24} />
                </button>
                <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
            </div>

            <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>
                <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                    <div className="header-title">
                        <h1>
                            {currentNav === 'dashboard' && 'Dashboard Overview'}
                            {currentNav === 'interview-studio' && 'AI Interview Studio & Audit Log'}
                            {currentNav === 'directory' && 'Master Learner Directory'}
                            {currentNav === 'learners' && 'Course Enrollments'}
                            {currentNav === 'attendance' && 'Organization Attendance Hub'}
                            {currentNav === 'ecosystem' && 'Ecosystem & Event Check-ins'}
                            {currentNav === 'qualifications' && 'Qualification Templates'}
                            {currentNav === 'assessments' && 'Assessment Management'}
                            {currentNav === 'surveys' && 'Surveys & Feedback Engine'}
                            {currentNav === 'staff' && 'Staff & Mentors'}
                            {currentNav === 'cohorts' && 'Cohort Management'}
                            {currentNav === 'workplaces' && 'Workplace Management'}
                            {currentNav === 'company-profile' && 'Corporate Partner Insights'}
                            {currentNav === 'profile' && 'My Administrator Profile'}
                            {currentNav === 'access' && 'Platform Access Control'}
                            {currentNav === 'crashes' && 'System Crashlytics & Bug Tracker'}
                            {currentNav === 'settings' && 'Platform Settings'}
                            {currentNav === 'studio' && 'Certificate Studio'}
                            {currentNav === 'coaching' && 'Coaching & Support Schedule'}
                        </h1>
                        <p>
                            {currentNav === 'dashboard' && 'Welcome to the administration portal'}
                            {currentNav === 'interview-studio' && 'Inspect completed mock interviews, review transcripts, and audit AI evaluation metrics.'}
                            {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
                            {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
                            {currentNav === 'attendance' && 'Monitor live check-ins and review historical attendance records across all cohorts.'}
                            {currentNav === 'ecosystem' && 'Manage public events, capacity gates, and external guest CRM ledger.'}
                            {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
                            {currentNav === 'assessments' && 'Create, distribute, and manage curriculum assessments and tasks'}
                            {currentNav === 'surveys' && 'Build feedback templates, manage survey questions, and inspect response analytics'}
                            {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
                            {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
                            {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
                            {currentNav === 'company-profile' && 'View compliance, placement ledgers, and operational analytics for this host company.'}
                            {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
                            {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
                            {currentNav === 'crashes' && 'Monitor client-side exceptions, unhandled rejections, and browser diagnostic logs.'}
                            {currentNav === 'settings' && 'Configure global system preferences and application settings'}
                            {currentNav === 'studio' && 'Design custom ad-hoc awards and manage document history.'}
                            {currentNav === 'coaching' && 'Manage upcoming Google Meet sessions and record your coaching notes.'}
                        </p>
                    </div>
                    <div style={{ marginTop: '5px' }}>
                        <NotificationBell />
                    </div>
                </header>

                <div className="admin-content" style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.2s ease' }}>
                    {!hasAccess ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px' }}>
                            <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
                            <h2>Unauthorized Access</h2>
                            <p>You do not have the required privileges to view this module.<br />Please contact a Super Administrator if you believe this is an error.</p>
                        </div>
                    ) : (
                        <>
                            {currentNav === 'coaching' && <CoachingScheduleView />}
                            {currentNav === 'ecosystem' && <EcosystemDashboard />}
                            {currentNav === 'attendance' && <AttendanceHistoryList />}
                            {currentNav === 'dashboard' && <DashboardOverview />}
                            {currentNav === 'interview-studio' && <AdminInterviewStudioView />}
                            {currentNav === 'directory' && <LearnerDirectoryView learners={store.learners} />}
                            {currentNav === 'studio' && <CertificateStudio />}

                            {currentNav === 'learners' && (
                                <LearnersView
                                    learners={store.learners}
                                    stagingLearners={store.stagingLearners}
                                    cohorts={store.cohorts}
                                    onAdd={() => setShowAddLearnerModal(true)}
                                    onUpload={() => setShowImportLearnerModal(true)}
                                    onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}
                                    onArchive={handleArchiveLearner}
                                    onRestore={handleRestoreLearner}
                                    onDiscard={handleDiscardDraft}
                                    onInvite={handleInviteLearner}
                                    onBulkApprove={handleBulkApprove}
                                    onBulkArchive={handleBulkArchive}
                                    onBulkDiscard={handleBulkDiscard}
                                    onBulkRestore={async (list) => {
                                        for (const l of list) await store.restoreLearner(l.id);
                                        store.fetchLearners(true);
                                        toast.success(`Restored ${list.length} learners.`);
                                    }}
                                    onArchiveCohort={handleLearnerCohortArchive}
                                    onDeletePermanent={async (learner, audit) => {
                                        if (store.deleteLearnerPermanent) {
                                            await store.deleteLearnerPermanent(learner.id, audit);
                                            toast.success(`${learner.fullName} was permanently deleted.`);
                                        } else {
                                            toast.error("Delete function not found.");
                                        }
                                    }}
                                />
                            )}

                            {currentNav === 'assessments' && <AssessmentManager />}
                            {currentNav === 'surveys' && <SurveyManager />}

                            {currentNav === 'staff' && (
                                viewingStaffProfile ? (
                                    <div className="animate-fade-in" style={{ position: 'relative' }}>
                                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <button onClick={() => setViewingStaffProfile(null)} className="wm-btn wm-btn--ghost" style={{ background: 'white', color: 'var(--mlab-blue)', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                                                <ArrowLeft size={16} /> Back to Staff Registry
                                            </button>
                                        </div>
                                        <AssessorProfileView profile={viewingStaffProfile} user={viewingStaffProfile} onUpdate={handleUpdateAdminProfile} hideSignaturePrompt={true} />
                                    </div>
                                ) : (
                                    <StaffView staff={store.staff} onAdd={() => { setEditingStaff(null); setShowStaffModal(true); }} onEdit={(s) => { setEditingStaff(s); setShowStaffModal(true); }} onDelete={(s) => setStaffToDelete(s)} onView={(s) => setViewingStaffProfile(s)} />
                                )
                            )}

                            {currentNav === 'workplaces' && <WorkplaceHub />}

                            {currentNav === 'company-profile' && (
                                activeCompanyForInsights ? (
                                    <CompanyInsightsView
                                        company={activeCompanyForInsights}
                                        onBack={() => setCurrentNav('workplaces')}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', flexDirection: 'column', gap: '1rem' }}>
                                        <Loader2 className="wm-spin" size={40} color="var(--mlab-blue)" />
                                        <span style={{ color: 'var(--mlab-midnight)', fontWeight: 600, fontSize: '1.2rem' }}>Reconnecting to Employer Record...</span>
                                    </div>
                                )
                            )}

                            {currentNav === 'cohorts' && (
                                <CohortsView cohorts={store.cohorts} staff={store.staff} onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }} onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }} onArchive={(c) => setCohortToDelete(c)} />
                            )}

                            {currentNav === 'qualifications' && (
                                <QualificationsView programmes={store.programmes} onAdd={() => { setSelectedProg(null); setShowProgModal(true); }} onUpload={() => { }} onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }} onArchive={(p) => setProgToArchive(p)} />
                            )}

                            {currentNav === 'profile' && (
                                <AdminProfileView profile={user} user={user} onUpdate={handleUpdateAdminProfile} />
                            )}

                            {currentNav === 'settings' && <SettingsPage />}

                            {currentNav === 'access' && <AccessManager />}

                            {currentNav === 'crashes' && <SystemCrashesManager />}
                        </>
                    )}
                </div>
            </main>

            {/* MODALS */}
            {showAddLearnerModal && (
                <LearnerFormModal learner={selectedLearner || undefined} title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'} programmes={store.programmes} cohorts={store.cohorts} onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }} onSave={async (l) => { try { if (selectedLearner) { await store.updateLearner(selectedLearner.id, l); toast.success("Learner updated successfully."); } else { await store.addLearner(l as any); toast.success("Learner added successfully."); } setShowAddLearnerModal(false); } catch (err: any) { toast.error(`Failed to save learner: ${err.message}`); } }} />
            )}

            {showImportLearnerModal && (
                <LearnerImportModal cohortId="" onClose={() => setShowImportLearnerModal(false)} onSuccess={() => { setShowImportLearnerModal(false); store.fetchStagingLearners(); store.fetchLearners(true); toast.success("Import successful. Records added to Staging Area."); }} />
            )}

            {learnerToProcess && (
                <DeleteConfirmModal itemName={learnerToProcess.learner.fullName} actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'} onConfirm={executeLearnerAction} onCancel={() => setLearnerToProcess(null)} />
            )}

            {showNoEmailAlert && (
                <StatusModal type="warning" title="Missing Email Address" message="This learner does not have an email address on file. Please edit their profile to add an email before sending an invite." confirmText="Okay" onClose={() => setShowNoEmailAlert(false)} />
            )}

            {learnerToInvite && (
                <StatusModal type="info" title={`${learnerToInvite.authStatus === 'active' ? 'Resend' : 'Send'} Platform Invite`} message={`Are you sure you want to send a platform login invitation to ${learnerToInvite.email}?`} confirmText={isInviting ? "Sending..." : "Send Invite"} onClose={async () => { setIsInviting(true); try { await store.inviteLearner(learnerToInvite); toast.success(`Invite successfully sent to ${learnerToInvite.email}`); setLearnerToInvite(null); } catch (err: any) { toast.error(err.message || "Failed to send invite."); } finally { setIsInviting(false); } }} onCancel={() => { if (!isInviting) setLearnerToInvite(null); }} />
            )}

            {showStaffModal && (
                <StaffFormModal staff={editingStaff || undefined} onClose={() => { setShowStaffModal(false); setEditingStaff(null); }} onSave={async (s) => { try { if (editingStaff) { if (store.updateStaff) { await store.updateStaff(editingStaff.id, s); } else { await updateDoc(doc(db, 'users', editingStaff.id), s as any); await store.fetchStaff(); } toast.success("Staff member updated."); } else { await store.addStaff(s); toast.success("New staff member created."); } setShowStaffModal(false); setEditingStaff(null); } catch (err: any) { toast.error(`Failed to save staff: ${err.message}`); } }} />
            )}

            {staffToDelete && (
                <StatusModal type="error" title="Confirm Deletion" message={`Are you sure you want to permanently delete <strong>${staffToDelete.fullName}</strong>?`} confirmText="Delete Permanently" onClose={async () => { try { await store.deleteStaff(staffToDelete.id); toast.success(`${staffToDelete.fullName} deleted permanently.`); } catch (err: any) { toast.error(`Delete failed: ${err.message}`); } finally { setStaffToDelete(null); } }} onCancel={() => setStaffToDelete(null)} />
            )}

            {showCohortModal && (
                <CohortFormModal cohort={selectedCohort || undefined} onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }} onSave={async (c) => { try { const batch = writeBatch(db); const timestamp = new Date().toISOString(); const cohortId = selectedCohort?.id || doc(collection(db, 'cohorts')).id; const cohortRef = doc(db, 'cohorts', cohortId); const cleanLearnerIds = (c.learnerIds || []).filter((id: string) => id && !id.startsWith("Unassigned_")).map((id: string) => { const match = store.learners.find(l => l.id === id || l.idNumber === id); return match ? (match.idNumber || match.id) : id; }); const uniqueCleanIds = Array.from(new Set(cleanLearnerIds)); const cohortData = { ...c, learnerIds: uniqueCleanIds, id: cohortId, updatedAt: timestamp }; if (selectedCohort) { batch.update(cohortRef, cohortData); } else { batch.set(cohortRef, { ...cohortData, createdAt: timestamp }); } uniqueCleanIds.forEach((lId) => { const enrollmentId = `${cohortId}_${lId as string}`; const enrollRef = doc(db, 'enrollments', enrollmentId); batch.set(enrollRef, { id: enrollmentId, cohortId: cohortId, learnerId: lId, programmeId: c.programmeId || '', campusId: c.campusId || '', status: 'active', enrolledAt: timestamp, updatedAt: timestamp }, { merge: true }); batch.set(doc(db, 'learners', lId as string), { cohortId: cohortId, updatedAt: timestamp }, { merge: true }); }); if (selectedCohort) { const removedIds = (selectedCohort.learnerIds || []).filter((oldId: string) => !uniqueCleanIds.includes(oldId)); removedIds.forEach((rId: string) => { const lMatch = store.learners.find(l => l.id === rId || l.idNumber === rId); const finalRid = lMatch ? (lMatch.idNumber || lMatch.id) : rId; batch.set(doc(db, "enrollments", `${cohortId}_${finalRid}`), { status: 'dropped', updatedAt: timestamp }, { merge: true }); batch.set(doc(db, "learners", finalRid), { cohortId: "", updatedAt: timestamp }, { merge: true }); }); } await batch.commit(); await store.fetchCohorts(true); await store.fetchLearners(true); toast.success("Class Roster Saved Successfully!"); setShowCohortModal(false); } catch (err: any) { console.error("Database Save Failed:", err); toast.error(`Error: ${err.message}`); } }} />
            )}

            {cohortToDelete && (
                <DeleteConfirmModal itemName={cohortToDelete.name} actionType="Delete" onConfirm={async () => { try { await store.deleteCohort(cohortToDelete.id); toast.success(`${cohortToDelete.name} deleted.`); } catch (err: any) { toast.error(`Failed to delete cohort: ${err.message}`); } finally { setCohortToDelete(null); } }} onCancel={() => setCohortToDelete(null)} />
            )}

            {showProgModal && (
                <ProgrammeFormModal programme={selectedProg} existingProgrammes={store.programmes} title={selectedProg ? 'Edit Template' : 'Create Template'} onClose={() => { setShowProgModal(false); setSelectedProg(null); }} onSave={async (p) => { try { if (selectedProg) { await store.updateProgramme(selectedProg.id, p); toast.success("Template updated."); } else { await store.addProgramme(p as any); toast.success("New template created."); } setShowProgModal(false); } catch (err: any) { toast.error(`Failed to save template: ${err.message}`); } }} />
            )}

            {progToArchive && (
                <DeleteConfirmModal itemName={progToArchive.name} actionType="Archive" onConfirm={async () => { try { await store.archiveProgramme(progToArchive.id); toast.success(`${progToArchive.name} archived.`); } catch (err: any) { toast.error(`Archive failed: ${err.message}`); } finally { setProgToArchive(null); } }} onCancel={() => setProgToArchive(null)} />
            )}
        </div>
    );
};

export default AdminDashboard;