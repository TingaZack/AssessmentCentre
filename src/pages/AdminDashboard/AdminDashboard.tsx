// src/pages/AdminDashboard/AdminDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, writeBatch, updateDoc } from 'firebase/firestore';
import { Menu, X, ShieldAlert } from 'lucide-react';
import { useStore, type StaffMember } from '../../store/useStore';
import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import { StaffView } from '../../components/views/StaffView/StaffView';
import { CohortsView } from '../../components/views/CohortsView/CohortsView';
import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
import { LearnersView } from '../../components/views/LearnersView/LearnersView';
import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';
import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
import { StaffFormModal } from '../../components/admin/StaffFormModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

import './AdminDashboard.css';
import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';

import { CertificateStudio } from './CertificateStudio/CertificateStudio';
import { AdminProfileView } from './AdminProfileView/AdminProfileView';
import { AccessManager } from './AccessManager/AccessManager';

// --- NEWLY INTEGRATED VIEWS ---
import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { SettingsPage } from '../SettingsPage/SettingsPage';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();
    const { user, setUser } = store;

    // ----- Navigation State -----
    // Added 'assessments' and 'settings' to the union type
    const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'assessments' | 'settings'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    // Mobile Sidebar State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Auto-close the sidebar when the user clicks a navigation link on mobile
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    // ----- Modal States -----
    const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
    const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
    const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

    const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

    const [showProgModal, setShowProgModal] = useState(false);
    const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
    const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

    const [showStaffModal, setShowStaffModal] = useState(false);
    const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

    const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

    const [showCohortModal, setShowCohortModal] = useState(false);
    const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
    const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

    // ----- Load Data -----
    useEffect(() => {
        if (currentNav === 'dashboard') {
            store.fetchLearners();
            store.fetchStagingLearners();
            store.fetchCohorts();
            store.fetchStaff();
        }

        if (currentNav === 'directory') {
            store.fetchLearners();
        }

        if (currentNav === 'learners') {
            store.fetchLearners(true);
            store.fetchStagingLearners();
            store.fetchCohorts();
        }

        if (currentNav === 'qualifications') store.fetchProgrammes();

        if (currentNav === 'staff') {
            store.fetchStaff();
            store.fetchEmployers();
        }

        if (currentNav === 'workplaces') store.fetchEmployers();

        if (currentNav === 'studio') {
            if (store.fetchAdHocCertificates) store.fetchAdHocCertificates();
        }

        if (currentNav === 'cohorts') {
            store.fetchCohorts();
            store.fetchProgrammes();
            store.fetchStaff();
            store.fetchLearners();
        }

        if (currentNav === 'assessments') {
            store.fetchCohorts();
            store.fetchProgrammes();
        }
    }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts, store.fetchEmployers, store.fetchAdHocCertificates]);

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
            if (user?.uid === id) {
                setUser({ ...user, ...updates } as any);
            }
        } catch (err) {
            console.error("Profile update failed:", err);
            throw err;
        }
    };

    // ─────────────────────────────────────────────────────────────
    // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
    // ─────────────────────────────────────────────────────────────

    const handleArchiveLearner = async (learner: DashboardLearner) => {
        setLearnerToProcess({ learner, action: 'archive' });
    };

    const handleDiscardDraft = async (learner: DashboardLearner) => {
        setLearnerToProcess({ learner, action: 'discard' });
    };

    const handleRestoreLearner = async (learner: DashboardLearner) => {
        if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
        await store.restoreLearner(learner.id);
    };

    const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
        if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
        await store.approveStagingLearners(learnersToApprove);
    };

    const handleInviteLearner = async (learner: DashboardLearner) => {
        if (!learner.email) {
            alert("This learner has no email address!");
            return;
        }

        const action = learner.authStatus === 'active' ? "Resend" : "Send";
        if (window.confirm(`${action} login invite to ${learner.email}?`)) {
            await store.inviteLearner(learner);
        }
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
            alert(`Successfully archived ${count} enrollments.`);
        } catch (e: any) {
            console.error(e);
            alert("Failed to archive: " + e.message);
        }
    };

    const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
        const count = draftsToDiscard.length;
        if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

        const ids = draftsToDiscard.map(l => l.id);
        await store.discardStagingLearners(ids);
    };

    const executeLearnerAction = async () => {
        if (!learnerToProcess) return;
        const { learner, action } = learnerToProcess;

        if (action === 'archive') {
            await store.archiveLearner(learner.id);
        } else if (action === 'discard') {
            await store.discardStagingLearners([learner.id]);
        }

        setLearnerToProcess(null);
    };

    const handleLearnerCohortArchive = async (year: string) => {
        if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
            await store.archiveCohort(year);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    if (currentNav === 'studio') {
        return <CertificateStudio />;
    }

    return (
        <div className="admin-layout">

            {/* MOBILE HEADER */}
            <div className="admin-mobile-header">
                <button
                    className="admin-hamburger-btn"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <div className="admin-mobile-title">Admin Portal</div>
            </div>

            {/* MOBILE OVERLAY */}
            {isMobileMenuOpen && (
                <div
                    className="admin-sidebar-overlay"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* SIDEBAR WRAPPER */}
            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button
                    className="admin-close-btn"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <X size={24} />
                </button>
                <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
            </div>

            <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

                <header className="dashboard-header">
                    <div className="header-title">
                        <h1>
                            {currentNav === 'dashboard' && 'Dashboard Overview'}
                            {currentNav === 'directory' && 'Master Learner Directory'}
                            {currentNav === 'learners' && 'Course Enrollments'}
                            {currentNav === 'qualifications' && 'Qualification Templates'}
                            {currentNav === 'assessments' && 'Assessment Management'}
                            {currentNav === 'staff' && 'Staff & Mentors'}
                            {currentNav === 'cohorts' && 'Cohort Management'}
                            {currentNav === 'workplaces' && 'Workplace Management'}
                            {currentNav === 'profile' && 'My Administrator Profile'}
                            {currentNav === 'access' && 'Platform Access Control'}
                            {currentNav === 'settings' && 'Platform Settings'}
                        </h1>
                        <p>
                            {currentNav === 'dashboard' && 'Welcome to the administration portal'}
                            {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
                            {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
                            {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
                            {currentNav === 'assessments' && 'Create, distribute, and manage curriculum assessments and tasks'}
                            {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
                            {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
                            {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
                            {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
                            {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
                            {currentNav === 'settings' && 'Configure global system preferences and application settings'}
                        </p>
                    </div>
                </header>

                <div className="admin-content">
                    {/* VIEWS */}
                    {currentNav === 'dashboard' && <DashboardOverview />}

                    {currentNav === 'directory' && <LearnerDirectoryView learners={store.learners} />}

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
                            }}
                            onArchiveCohort={handleLearnerCohortArchive}
                            onDeletePermanent={async (learner, audit) => {
                                if (store.deleteLearnerPermanent) {
                                    await store.deleteLearnerPermanent(learner.id, audit);
                                } else {
                                    alert("Delete function not found.");
                                }
                            }}
                        />
                    )}

                    {currentNav === 'assessments' && <AssessmentManager />}

                    {currentNav === 'staff' && (
                        <StaffView
                            staff={store.staff}
                            onAdd={() => {
                                setEditingStaff(null);
                                setShowStaffModal(true);
                            }}
                            onEdit={(s) => {
                                setEditingStaff(s);
                                setShowStaffModal(true);
                            }}
                            onDelete={(s) => setStaffToDelete(s)}
                        />
                    )}

                    {currentNav === 'workplaces' && <WorkplacesManager />}

                    {currentNav === 'cohorts' && (
                        <CohortsView
                            cohorts={store.cohorts}
                            staff={store.staff}
                            onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
                            onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
                            onArchive={(c) => setCohortToDelete(c)}
                        />
                    )}

                    {currentNav === 'qualifications' && (
                        <QualificationsView
                            programmes={store.programmes}
                            onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
                            onUpload={() => { }}
                            onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
                            onArchive={(p) => setProgToArchive(p)}
                        />
                    )}

                    {/* Profile Tab Integration */}
                    {currentNav === 'profile' && (
                        <AdminProfileView
                            profile={user}
                            user={user}
                            onUpdate={handleUpdateAdminProfile}
                        />
                    )}

                    {/* Settings Tab Integration */}
                    {currentNav === 'settings' && <SettingsPage />}

                    {currentNav === 'access' && (
                        (user as any)?.isSuperAdmin ? (
                            <AccessManager />
                        ) : (
                            <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
                                <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
                                <h2>Unauthorized Access</h2>
                                <p>You do not have Super Admin privileges to view this module.</p>
                            </div>
                        )
                    )}
                </div>
            </main>

            {/* MODALS */}
            {showAddLearnerModal && (
                <LearnerFormModal
                    learner={selectedLearner || undefined}
                    title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'}
                    programmes={store.programmes}
                    cohorts={store.cohorts}
                    onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
                    onSave={async (l) => {
                        if (selectedLearner) await store.updateLearner(selectedLearner.id, l);
                        else await store.addLearner(l as any);
                        setShowAddLearnerModal(false);
                    }}
                />
            )}

            {showImportLearnerModal && (
                <LearnerImportModal
                    cohortId=""
                    onClose={() => setShowImportLearnerModal(false)}
                    onSuccess={() => {
                        setShowImportLearnerModal(false);
                        store.fetchStagingLearners();
                        store.fetchLearners(true);
                    }}
                />
            )}

            {learnerToProcess && (
                <DeleteConfirmModal
                    itemName={learnerToProcess.learner.fullName}
                    actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
                    onConfirm={executeLearnerAction}
                    onCancel={() => setLearnerToProcess(null)}
                />
            )}

            {/* StaffFormModal to handle both Add and Edit states perfectly */}
            {showStaffModal && (
                <StaffFormModal
                    staff={editingStaff || undefined}
                    onClose={() => {
                        setShowStaffModal(false);
                        setEditingStaff(null);
                    }}
                    onSave={async (s) => {
                        if (editingStaff) {
                            if (store.updateStaff) {
                                await store.updateStaff(editingStaff.id, s);
                            } else {
                                // Fallback to raw update if updateStaff isn't in store
                                await updateDoc(doc(db, 'users', editingStaff.id), s as any);
                                await store.fetchStaff();
                            }
                        } else {
                            await store.addStaff(s);
                        }
                        setShowStaffModal(false);
                        setEditingStaff(null);
                    }}
                />
            )}

            {staffToDelete && (
                <DeleteConfirmModal
                    itemName={staffToDelete.fullName}
                    actionType="Delete"
                    onConfirm={() => { store.deleteStaff(staffToDelete.id); setStaffToDelete(null); }}
                    onCancel={() => setStaffToDelete(null)}
                />
            )}

            {showCohortModal && (
                <CohortFormModal
                    cohort={selectedCohort || undefined}
                    onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
                    onSave={async (c, reasons) => {
                        if (selectedCohort) {
                            await store.updateCohort(selectedCohort.id, c, reasons);
                        } else {
                            await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
                        }
                        setShowCohortModal(false);
                    }}
                />
            )}

            {cohortToDelete && (
                <DeleteConfirmModal
                    itemName={cohortToDelete.name}
                    actionType="Delete"
                    onConfirm={() => { store.deleteCohort(cohortToDelete.id); setCohortToDelete(null); }}
                    onCancel={() => setCohortToDelete(null)}
                />
            )}

            {showProgModal && (
                <ProgrammeFormModal
                    programme={selectedProg}
                    existingProgrammes={store.programmes}
                    title={selectedProg ? 'Edit Template' : 'Create Template'}
                    onClose={() => { setShowProgModal(false); setSelectedProg(null); }}
                    onSave={async (p) => {
                        if (selectedProg) await store.updateProgramme(selectedProg.id, p);
                        else await store.addProgramme(p as any);
                        setShowProgModal(false);
                    }}
                />
            )}

            {progToArchive && (
                <DeleteConfirmModal
                    itemName={progToArchive.name}
                    actionType="Archive"
                    onConfirm={() => { store.archiveProgramme(progToArchive.id); setProgToArchive(null); }}
                    onCancel={() => setProgToArchive(null)}
                />
            )}

        </div>
    );
};

export default AdminDashboard;


// // src/pages/AdminDashboard/AdminDashboard.tsx

// import React, { useEffect, useState } from 'react';
// import { useLocation, useNavigate } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import { auth, db } from '../../lib/firebase';
// import { doc, writeBatch, updateDoc } from 'firebase/firestore';
// import { Menu, X, ShieldAlert } from 'lucide-react';
// import { useStore, type StaffMember } from '../../store/useStore';
// import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import { StaffView } from '../../components/views/StaffView/StaffView';
// import { CohortsView } from '../../components/views/CohortsView/CohortsView';
// import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
// import { LearnersView } from '../../components/views/LearnersView/LearnersView';
// import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';
// import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
// import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
// import { StaffFormModal } from '../../components/admin/StaffFormModal';
// import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
// import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

// import './AdminDashboard.css';
// import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
// import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';

// import { CertificateStudio } from './CertificateStudio/CertificateStudio';
// import { AdminProfileView } from './AdminProfileView/AdminProfileView';
// import { AccessManager } from './AccessManager/AccessManager';
// import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';

// const AdminDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();
//     const { user, setUser } = store;

//     // ----- Navigation State -----
//     const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );

//     // Mobile Sidebar State
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//     // Auto-close the sidebar when the user clicks a navigation link on mobile
//     useEffect(() => {
//         setIsMobileMenuOpen(false);
//     }, [currentNav]);

//     // ----- Modal States -----
//     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
//     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
//     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

//     const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

//     const [showProgModal, setShowProgModal] = useState(false);
//     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
//     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

//     const [showStaffModal, setShowStaffModal] = useState(false);
//     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

//     const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

//     const [showCohortModal, setShowCohortModal] = useState(false);
//     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
//     const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

//     // ----- Load Data -----
//     useEffect(() => {
//         if (currentNav === 'dashboard') {
//             store.fetchLearners();
//             store.fetchStagingLearners();
//             store.fetchCohorts();
//             store.fetchStaff();
//         }

//         if (currentNav === 'directory') {
//             store.fetchLearners();
//         }

//         if (currentNav === 'learners') {
//             store.fetchLearners(true);
//             store.fetchStagingLearners();
//             store.fetchCohorts();
//         }

//         if (currentNav === 'qualifications') store.fetchProgrammes();
//         if (currentNav === 'staff') {
//             store.fetchStaff();
//             store.fetchEmployers();
//         }
//         if (currentNav === 'workplaces') store.fetchEmployers();

//         if (currentNav === 'studio') {
//             if (store.fetchAdHocCertificates) store.fetchAdHocCertificates();
//         }

//         if (currentNav === 'cohorts') {
//             store.fetchCohorts();
//             store.fetchProgrammes();
//             store.fetchStaff();
//             store.fetchLearners();
//         }
//     }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts, store.fetchEmployers, store.fetchAdHocCertificates]);

//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             navigate('/login');
//         } catch (error) {
//             console.error("Logout failed", error);
//         }
//     };

//     const handleUpdateAdminProfile = async (id: string, updates: any) => {
//         try {
//             await updateDoc(doc(db, 'users', id), updates);
//             if (user?.uid === id) {
//                 setUser({ ...user, ...updates } as any);
//             }
//         } catch (err) {
//             console.error("Profile update failed:", err);
//             throw err;
//         }
//     };

//     // ─────────────────────────────────────────────────────────────
//     // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
//     // ─────────────────────────────────────────────────────────────

//     const handleArchiveLearner = async (learner: DashboardLearner) => {
//         setLearnerToProcess({ learner, action: 'archive' });
//     };

//     const handleDiscardDraft = async (learner: DashboardLearner) => {
//         setLearnerToProcess({ learner, action: 'discard' });
//     };

//     const handleRestoreLearner = async (learner: DashboardLearner) => {
//         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
//         await store.restoreLearner(learner.id);
//     };

//     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
//         if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
//         await store.approveStagingLearners(learnersToApprove);
//     };

//     const handleInviteLearner = async (learner: DashboardLearner) => {
//         if (!learner.email) {
//             alert("This learner has no email address!");
//             return;
//         }

//         const action = learner.authStatus === 'active' ? "Resend" : "Send";
//         if (window.confirm(`${action} login invite to ${learner.email}?`)) {
//             await store.inviteLearner(learner);
//         }
//     };

//     const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
//         const count = learnersToArchive.length;
//         if (!window.confirm(`Archive ${count} enrollments? They will be moved to the Archive tab.`)) return;

//         try {
//             const batch = writeBatch(db);
//             learnersToArchive.forEach(l => {
//                 const enrolId = l.enrollmentId || l.id;
//                 const ref = doc(db, 'enrollments', enrolId);
//                 batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
//             });
//             await batch.commit();
//             await store.fetchLearners(true);
//             alert(`Successfully archived ${count} enrollments.`);
//         } catch (e: any) {
//             console.error(e);
//             alert("Failed to archive: " + e.message);
//         }
//     };

//     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
//         const count = draftsToDiscard.length;
//         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

//         const ids = draftsToDiscard.map(l => l.id);
//         await store.discardStagingLearners(ids);
//     };

//     const executeLearnerAction = async () => {
//         if (!learnerToProcess) return;
//         const { learner, action } = learnerToProcess;

//         if (action === 'archive') {
//             await store.archiveLearner(learner.id);
//         } else if (action === 'discard') {
//             await store.discardStagingLearners([learner.id]);
//         }

//         setLearnerToProcess(null);
//     };

//     const handleLearnerCohortArchive = async (year: string) => {
//         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
//             await store.archiveCohort(year);
//         }
//     };

//     // ─────────────────────────────────────────────────────────────
//     // RENDER
//     // ─────────────────────────────────────────────────────────────

//     if (currentNav === 'studio') {
//         return <CertificateStudio />;
//     }

//     return (
//         <div className="admin-layout">

//             {/* MOBILE HEADER */}
//             <div className="admin-mobile-header">
//                 <button
//                     className="admin-hamburger-btn"
//                     onClick={() => setIsMobileMenuOpen(true)}
//                 >
//                     <Menu size={24} />
//                 </button>
//                 <div className="admin-mobile-title">Admin Portal</div>
//             </div>

//             {/* MOBILE OVERLAY */}
//             {isMobileMenuOpen && (
//                 <div
//                     className="admin-sidebar-overlay"
//                     onClick={() => setIsMobileMenuOpen(false)}
//                 />
//             )}

//             {/* SIDEBAR WRAPPER */}
//             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
//                 <button
//                     className="admin-close-btn"
//                     onClick={() => setIsMobileMenuOpen(false)}
//                 >
//                     <X size={24} />
//                 </button>
//                 <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
//             </div>

//             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

//                 <header className="dashboard-header">
//                     <div className="header-title">
//                         <h1>
//                             {currentNav === 'dashboard' && 'Dashboard Overview'}
//                             {currentNav === 'directory' && 'Master Learner Directory'}
//                             {currentNav === 'learners' && 'Course Enrollments'}
//                             {currentNav === 'qualifications' && 'Qualification Templates'}
//                             {currentNav === 'staff' && 'Staff & Mentors'}
//                             {currentNav === 'cohorts' && 'Cohort Management'}
//                             {currentNav === 'workplaces' && 'Workplace Management'}
//                             {currentNav === 'profile' && 'My Administrator Profile'}
//                             {currentNav === 'access' && 'Platform Access Control'}
//                         </h1>
//                         <p>
//                             {currentNav === 'dashboard' && 'Welcome to the administration portal'}
//                             {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
//                             {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
//                             {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
//                             {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
//                             {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
//                             {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
//                             {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
//                             {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
//                         </p>
//                     </div>
//                 </header>

//                 <div className="admin-content">
//                     {/* VIEWS */}
//                     {currentNav === 'dashboard' && <DashboardOverview />}
//                     {currentNav === 'directory' && <LearnerDirectoryView learners={store.learners} />}
//                     {currentNav === 'learners' && (
//                         <LearnersView
//                             learners={store.learners}
//                             stagingLearners={store.stagingLearners}
//                             cohorts={store.cohorts}
//                             onAdd={() => setShowAddLearnerModal(true)}
//                             onUpload={() => setShowImportLearnerModal(true)}
//                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}
//                             onArchive={handleArchiveLearner}
//                             onRestore={handleRestoreLearner}
//                             onDiscard={handleDiscardDraft}
//                             onInvite={handleInviteLearner}
//                             onBulkApprove={handleBulkApprove}
//                             onBulkArchive={handleBulkArchive}
//                             onBulkDiscard={handleBulkDiscard}
//                             onBulkRestore={async (list) => {
//                                 for (const l of list) await store.restoreLearner(l.id);
//                                 store.fetchLearners(true);
//                             }}
//                             onArchiveCohort={handleLearnerCohortArchive}
//                             onDeletePermanent={async (learner, audit) => {
//                                 if (store.deleteLearnerPermanent) {
//                                     await store.deleteLearnerPermanent(learner.id, audit);
//                                 } else {
//                                     alert("Delete function not found.");
//                                 }
//                             }}
//                         />
//                     )}
//                     {currentNav === 'assessments' && <AssessmentManager />}

//                     {currentNav === 'staff' && (
//                         <StaffView
//                             staff={store.staff}
//                             onAdd={() => {
//                                 setEditingStaff(null);
//                                 setShowStaffModal(true);
//                             }}
//                             onEdit={(s) => {
//                                 setEditingStaff(s);
//                                 setShowStaffModal(true);
//                             }}
//                             onDelete={(s) => setStaffToDelete(s)}
//                         />
//                     )}

//                     {currentNav === 'workplaces' && <WorkplacesManager />}
//                     {currentNav === 'cohorts' && (
//                         <CohortsView
//                             cohorts={store.cohorts}
//                             staff={store.staff}
//                             onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
//                             onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
//                             onArchive={(c) => setCohortToDelete(c)}
//                         />
//                     )}
//                     {currentNav === 'qualifications' && (
//                         <QualificationsView
//                             programmes={store.programmes}
//                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
//                             onUpload={() => { }}
//                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
//                             onArchive={(p) => setProgToArchive(p)}
//                         />
//                     )}

//                     {/* Profile Tab Integration */}
//                     {currentNav === 'profile' && (
//                         <AdminProfileView
//                             profile={user}
//                             user={user}
//                             onUpdate={handleUpdateAdminProfile}
//                         />
//                     )}

//                     {currentNav === 'access' && (
//                         (user as any)?.isSuperAdmin ? (
//                             <AccessManager />
//                         ) : (
//                             <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
//                                 <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
//                                 <h2>Unauthorized Access</h2>
//                                 <p>You do not have Super Admin privileges to view this module.</p>
//                             </div>
//                         )
//                     )}
//                 </div>
//             </main>

//             {/* MODALS */}
//             {showAddLearnerModal && (
//                 <LearnerFormModal
//                     learner={selectedLearner || undefined}
//                     title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'}
//                     programmes={store.programmes}
//                     cohorts={store.cohorts}
//                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
//                     onSave={async (l) => {
//                         if (selectedLearner) await store.updateLearner(selectedLearner.id, l);
//                         else await store.addLearner(l as any);
//                         setShowAddLearnerModal(false);
//                     }}
//                 />
//             )}

//             {showImportLearnerModal && (
//                 <LearnerImportModal
//                     cohortId=""
//                     onClose={() => setShowImportLearnerModal(false)}
//                     onSuccess={() => {
//                         setShowImportLearnerModal(false);
//                         store.fetchStagingLearners();
//                         store.fetchLearners(true);
//                     }}
//                 />
//             )}

//             {learnerToProcess && (
//                 <DeleteConfirmModal
//                     itemName={learnerToProcess.learner.fullName}
//                     actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
//                     onConfirm={executeLearnerAction}
//                     onCancel={() => setLearnerToProcess(null)}
//                 />
//             )}

//             {/* StaffFormModal to handle both Add and Edit states perfectly */}
//             {showStaffModal && (
//                 <StaffFormModal
//                     staff={editingStaff || undefined}
//                     onClose={() => {
//                         setShowStaffModal(false);
//                         setEditingStaff(null);
//                     }}
//                     onSave={async (s) => {
//                         if (editingStaff) {
//                             if (store.updateStaff) {
//                                 await store.updateStaff(editingStaff.id, s);
//                             } else {
//                                 // Fallback to raw update if updateStaff isn't in store
//                                 await updateDoc(doc(db, 'users', editingStaff.id), s as any);
//                                 await store.fetchStaff();
//                             }
//                         } else {
//                             await store.addStaff(s);
//                         }
//                         setShowStaffModal(false);
//                         setEditingStaff(null);
//                     }}
//                 />
//             )}

//             {staffToDelete && (
//                 <DeleteConfirmModal
//                     itemName={staffToDelete.fullName}
//                     actionType="Delete"
//                     onConfirm={() => { store.deleteStaff(staffToDelete.id); setStaffToDelete(null); }}
//                     onCancel={() => setStaffToDelete(null)}
//                 />
//             )}

//             {showCohortModal && (
//                 <CohortFormModal
//                     cohort={selectedCohort || undefined}
//                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
//                     onSave={async (c, reasons) => {
//                         if (selectedCohort) {
//                             await store.updateCohort(selectedCohort.id, c, reasons);
//                         } else {
//                             await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
//                         }
//                         setShowCohortModal(false);
//                     }}
//                 />
//             )}
//             {cohortToDelete && (
//                 <DeleteConfirmModal
//                     itemName={cohortToDelete.name}
//                     actionType="Delete"
//                     onConfirm={() => { store.deleteCohort(cohortToDelete.id); setCohortToDelete(null); }}
//                     onCancel={() => setCohortToDelete(null)}
//                 />
//             )}

//             {showProgModal && (
//                 <ProgrammeFormModal
//                     programme={selectedProg}
//                     existingProgrammes={store.programmes}
//                     title={selectedProg ? 'Edit Template' : 'Create Template'}
//                     onClose={() => { setShowProgModal(false); setSelectedProg(null); }}
//                     onSave={async (p) => {
//                         if (selectedProg) await store.updateProgramme(selectedProg.id, p);
//                         else await store.addProgramme(p as any);
//                         setShowProgModal(false);
//                     }}
//                 />
//             )}

//             {progToArchive && (
//                 <DeleteConfirmModal
//                     itemName={progToArchive.name}
//                     actionType="Archive"
//                     onConfirm={() => { store.archiveProgramme(progToArchive.id); setProgToArchive(null); }}
//                     onCancel={() => setProgToArchive(null)}
//                 />
//             )}

//         </div>
//     );
// };

// export default AdminDashboard;


// // // src/pages/AdminDashboard/AdminDashboard.tsx

// // import React, { useEffect, useState } from 'react';
// // import { useLocation, useNavigate } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import { auth, db } from '../../lib/firebase';
// // import { doc, writeBatch, updateDoc } from 'firebase/firestore';
// // import { Menu, X, ShieldAlert } from 'lucide-react';
// // import { useStore, type StaffMember } from '../../store/useStore';
// // import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';
// // import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// // import { StaffView } from '../../components/views/StaffView/StaffView';
// // import { CohortsView } from '../../components/views/CohortsView/CohortsView';
// // import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
// // import { LearnersView } from '../../components/views/LearnersView/LearnersView';
// // import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';
// // import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
// // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
// // import { StaffFormModal } from '../../components/admin/StaffFormModal';
// // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// // import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
// // import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

// // import './AdminDashboard.css';
// // import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
// // import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';

// // import { CertificateStudio } from './CertificateStudio/CertificateStudio';
// // import { AdminProfileView } from './AdminProfileView/AdminProfileView';
// // import { AccessManager } from './AccessManager/AccessManager';

// // const AdminDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();
// //     const { user, setUser } = store;

// //     // ----- Navigation State -----
// //     const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );

// //     // Mobile Sidebar State
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// //     // Auto-close the sidebar when the user clicks a navigation link on mobile
// //     useEffect(() => {
// //         setIsMobileMenuOpen(false);
// //     }, [currentNav]);

// //     // ----- Modal States -----
// //     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
// //     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
// //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

// //     const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

// //     const [showProgModal, setShowProgModal] = useState(false);
// //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

// //     const [showStaffModal, setShowStaffModal] = useState(false);
// //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// //     const [showCohortModal, setShowCohortModal] = useState(false);
// //     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
// //     const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

// //     // ----- Load Data -----
// //     useEffect(() => {
// //         if (currentNav === 'dashboard') {
// //             store.fetchLearners();
// //             store.fetchStagingLearners();
// //             store.fetchCohorts();
// //             store.fetchStaff();
// //         }

// //         if (currentNav === 'directory') {
// //             store.fetchLearners();
// //         }

// //         if (currentNav === 'learners') {
// //             store.fetchLearners(true);
// //             store.fetchStagingLearners();
// //             store.fetchCohorts();
// //         }

// //         if (currentNav === 'qualifications') store.fetchProgrammes();
// //         if (currentNav === 'staff') {
// //             store.fetchStaff();
// //             store.fetchEmployers();
// //         }
// //         if (currentNav === 'workplaces') store.fetchEmployers();

// //         if (currentNav === 'studio') {
// //             if (store.fetchAdHocCertificates) store.fetchAdHocCertificates();
// //         }

// //         if (currentNav === 'cohorts') {
// //             store.fetchCohorts();
// //             store.fetchProgrammes();
// //             store.fetchStaff();
// //             store.fetchLearners();
// //         }
// //     }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts, store.fetchEmployers, store.fetchAdHocCertificates]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         } catch (error) {
// //             console.error("Logout failed", error);
// //         }
// //     };

// //     const handleUpdateAdminProfile = async (id: string, updates: any) => {
// //         try {
// //             await updateDoc(doc(db, 'users', id), updates);
// //             if (user?.uid === id) {
// //                 setUser({ ...user, ...updates } as any);
// //             }
// //         } catch (err) {
// //             console.error("Profile update failed:", err);
// //             throw err;
// //         }
// //     };

// //     // ─────────────────────────────────────────────────────────────
// //     // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
// //     // ─────────────────────────────────────────────────────────────

// //     const handleArchiveLearner = async (learner: DashboardLearner) => {
// //         setLearnerToProcess({ learner, action: 'archive' });
// //     };

// //     const handleDiscardDraft = async (learner: DashboardLearner) => {
// //         setLearnerToProcess({ learner, action: 'discard' });
// //     };

// //     const handleRestoreLearner = async (learner: DashboardLearner) => {
// //         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
// //         await store.restoreLearner(learner.id);
// //     };

// //     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
// //         if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
// //         await store.approveStagingLearners(learnersToApprove);
// //     };

// //     const handleInviteLearner = async (learner: DashboardLearner) => {
// //         if (!learner.email) {
// //             alert("This learner has no email address!");
// //             return;
// //         }

// //         const action = learner.authStatus === 'active' ? "Resend" : "Send";
// //         if (window.confirm(`${action} login invite to ${learner.email}?`)) {
// //             await store.inviteLearner(learner);
// //         }
// //     };

// //     const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
// //         const count = learnersToArchive.length;
// //         if (!window.confirm(`Archive ${count} enrollments? They will be moved to the Archive tab.`)) return;

// //         try {
// //             const batch = writeBatch(db);
// //             learnersToArchive.forEach(l => {
// //                 const enrolId = l.enrollmentId || l.id;
// //                 const ref = doc(db, 'enrollments', enrolId);
// //                 batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
// //             });
// //             await batch.commit();
// //             await store.fetchLearners(true);
// //             alert(`Successfully archived ${count} enrollments.`);
// //         } catch (e: any) {
// //             console.error(e);
// //             alert("Failed to archive: " + e.message);
// //         }
// //     };

// //     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
// //         const count = draftsToDiscard.length;
// //         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

// //         const ids = draftsToDiscard.map(l => l.id);
// //         await store.discardStagingLearners(ids);
// //     };

// //     const executeLearnerAction = async () => {
// //         if (!learnerToProcess) return;
// //         const { learner, action } = learnerToProcess;

// //         if (action === 'archive') {
// //             await store.archiveLearner(learner.id);
// //         } else if (action === 'discard') {
// //             await store.discardStagingLearners([learner.id]);
// //         }

// //         setLearnerToProcess(null);
// //     };

// //     const handleLearnerCohortArchive = async (year: string) => {
// //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
// //             await store.archiveCohort(year);
// //         }
// //     };

// //     // ─────────────────────────────────────────────────────────────
// //     // RENDER
// //     // ─────────────────────────────────────────────────────────────

// //     if (currentNav === 'studio') {
// //         return <CertificateStudio />;
// //     }

// //     return (
// //         <div className="admin-layout">

// //             {/* MOBILE HEADER */}
// //             <div className="admin-mobile-header">
// //                 <button
// //                     className="admin-hamburger-btn"
// //                     onClick={() => setIsMobileMenuOpen(true)}
// //                 >
// //                     <Menu size={24} />
// //                 </button>
// //                 <div className="admin-mobile-title">Admin Portal</div>
// //             </div>

// //             {/* MOBILE OVERLAY */}
// //             {isMobileMenuOpen && (
// //                 <div
// //                     className="admin-sidebar-overlay"
// //                     onClick={() => setIsMobileMenuOpen(false)}
// //                 />
// //             )}

// //             {/* SIDEBAR WRAPPER */}
// //             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
// //                 <button
// //                     className="admin-close-btn"
// //                     onClick={() => setIsMobileMenuOpen(false)}
// //                 >
// //                     <X size={24} />
// //                 </button>
// //                 <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
// //             </div>

// //             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

// //                 <header className="dashboard-header">
// //                     <div className="header-title">
// //                         <h1>
// //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// //                             {currentNav === 'directory' && 'Master Learner Directory'}
// //                             {currentNav === 'learners' && 'Course Enrollments'}
// //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// //                             {currentNav === 'staff' && 'Staff & Mentors'}
// //                             {currentNav === 'cohorts' && 'Cohort Management'}
// //                             {currentNav === 'workplaces' && 'Workplace Management'}
// //                             {currentNav === 'profile' && 'My Administrator Profile'}
// //                             {currentNav === 'access' && 'Platform Access Control'}
// //                         </h1>
// //                         <p>
// //                             {currentNav === 'dashboard' && 'Welcome to the administration portal'}
// //                             {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
// //                             {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
// //                             {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
// //                             {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
// //                             {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
// //                             {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
// //                             {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
// //                             {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
// //                         </p>
// //                     </div>
// //                 </header>

// //                 <div className="admin-content">
// //                     {/* VIEWS */}
// //                     {currentNav === 'dashboard' && <DashboardOverview />}
// //                     {currentNav === 'directory' && <LearnerDirectoryView learners={store.learners} />}
// //                     {currentNav === 'learners' && (
// //                         <LearnersView
// //                             learners={store.learners}
// //                             stagingLearners={store.stagingLearners}
// //                             cohorts={store.cohorts}
// //                             onAdd={() => setShowAddLearnerModal(true)}
// //                             onUpload={() => setShowImportLearnerModal(true)}
// //                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}
// //                             onArchive={handleArchiveLearner}
// //                             onRestore={handleRestoreLearner}
// //                             onDiscard={handleDiscardDraft}
// //                             onInvite={handleInviteLearner}
// //                             onBulkApprove={handleBulkApprove}
// //                             onBulkArchive={handleBulkArchive}
// //                             onBulkDiscard={handleBulkDiscard}
// //                             onBulkRestore={async (list) => {
// //                                 for (const l of list) await store.restoreLearner(l.id);
// //                                 store.fetchLearners(true);
// //                             }}
// //                             onArchiveCohort={handleLearnerCohortArchive}
// //                             onDeletePermanent={async (learner, audit) => {
// //                                 if (store.deleteLearnerPermanent) {
// //                                     await store.deleteLearnerPermanent(learner.id, audit);
// //                                 } else {
// //                                     alert("Delete function not found.");
// //                                 }
// //                             }}
// //                         />
// //                     )}
// //                     {currentNav === 'staff' && 
// //                     <StaffView 
// //     staff={store.staff} 
// //     onAdd={() => {
// //         setEditingStaff(null); // Clear out any old data for a fresh form
// //         setShowStaffModal(true);
// //     }} 
// //     onEdit={(s) => {
// //         setEditingStaff(s); // Pass the specific staff member's data to the modal
// //         setShowStaffModal(true);
// //     }}
// //     onDelete={(s) => setStaffToDelete(s)} 
// // />

// //                     // <StaffView staff={store.staff} 
// //                     // onAdd={() => setShowStaffModal(true)} onDelete={(s) => setStaffToDelete(s)} />
// //                     }
// //                     {currentNav === 'workplaces' && <WorkplacesManager />}
// //                     {currentNav === 'cohorts' && (
// //                         <CohortsView
// //                             cohorts={store.cohorts}
// //                             staff={store.staff}
// //                             onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
// //                             onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
// //                             onArchive={(c) => setCohortToDelete(c)}
// //                         />
// //                     )}
// //                     {currentNav === 'qualifications' && (
// //                         <QualificationsView
// //                             programmes={store.programmes}
// //                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
// //                             onUpload={() => { }}
// //                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
// //                             onArchive={(p) => setProgToArchive(p)}
// //                         />
// //                     )}

// //                     {/* Profile Tab Integration */}
// //                     {currentNav === 'profile' && (
// //                         <AdminProfileView
// //                             profile={user}
// //                             user={user}
// //                             onUpdate={handleUpdateAdminProfile}
// //                         />
// //                     )}

// //                     {currentNav === 'access' && (
// //                         (user as any)?.isSuperAdmin ? (
// //                             <AccessManager />
// //                         ) : (
// //                             <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
// //                                 <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
// //                                 <h2>Unauthorized Access</h2>
// //                                 <p>You do not have Super Admin privileges to view this module.</p>
// //                             </div>
// //                         )
// //                     )}
// //                 </div>
// //             </main>

// //             {/* MODALS */}
// //             {showAddLearnerModal && (
// //                 <LearnerFormModal
// //                     learner={selectedLearner || undefined}
// //                     title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'}
// //                     programmes={store.programmes}
// //                     cohorts={store.cohorts}
// //                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
// //                     onSave={async (l) => {
// //                         if (selectedLearner) await store.updateLearner(selectedLearner.id, l);
// //                         else await store.addLearner(l as any);
// //                         setShowAddLearnerModal(false);
// //                     }}
// //                 />
// //             )}

// //             {showImportLearnerModal && (
// //                 <LearnerImportModal
// //                     cohortId=""
// //                     onClose={() => setShowImportLearnerModal(false)}
// //                     onSuccess={() => {
// //                         setShowImportLearnerModal(false);
// //                         store.fetchStagingLearners();
// //                         store.fetchLearners(true);
// //                     }}
// //                 />
// //             )}

// //             {learnerToProcess && (
// //                 <DeleteConfirmModal
// //                     itemName={learnerToProcess.learner.fullName}
// //                     actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
// //                     onConfirm={executeLearnerAction}
// //                     onCancel={() => setLearnerToProcess(null)}
// //                 />
// //             )}

// //             {showStaffModal && (
// //                 <StaffFormModal
// //                     onClose={() => setShowStaffModal(false)}
// //                     onSave={async (s) => { await store.addStaff(s); setShowStaffModal(false); }}
// //                 />
// //             )}
// //             {staffToDelete && (
// //                 <DeleteConfirmModal
// //                     itemName={staffToDelete.fullName}
// //                     actionType="Delete"
// //                     onConfirm={() => { store.deleteStaff(staffToDelete.id); setStaffToDelete(null); }}
// //                     onCancel={() => setStaffToDelete(null)}
// //                 />
// //             )}

// //             {showCohortModal && (
// //                 <CohortFormModal
// //                     cohort={selectedCohort || undefined}
// //                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
// //                     onSave={async (c, reasons) => {
// //                         if (selectedCohort) {
// //                             await store.updateCohort(selectedCohort.id, c, reasons);
// //                         } else {
// //                             await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
// //                         }
// //                         setShowCohortModal(false);
// //                     }}
// //                 />
// //             )}
// //             {cohortToDelete && (
// //                 <DeleteConfirmModal
// //                     itemName={cohortToDelete.name}
// //                     actionType="Delete"
// //                     onConfirm={() => { store.deleteCohort(cohortToDelete.id); setCohortToDelete(null); }}
// //                     onCancel={() => setCohortToDelete(null)}
// //                 />
// //             )}

// //             {showProgModal && (
// //                 <ProgrammeFormModal
// //                     programme={selectedProg}
// //                     existingProgrammes={store.programmes}
// //                     title={selectedProg ? 'Edit Template' : 'Create Template'}
// //                     onClose={() => { setShowProgModal(false); setSelectedProg(null); }}
// //                     onSave={async (p) => {
// //                         if (selectedProg) await store.updateProgramme(selectedProg.id, p);
// //                         else await store.addProgramme(p as any);
// //                         setShowProgModal(false);
// //                     }}
// //                 />
// //             )}

// //             {progToArchive && (
// //                 <DeleteConfirmModal
// //                     itemName={progToArchive.name}
// //                     actionType="Archive"
// //                     onConfirm={() => { store.archiveProgramme(progToArchive.id); setProgToArchive(null); }}
// //                     onCancel={() => setProgToArchive(null)}
// //                 />
// //             )}

// //         </div>
// //     );
// // };

// // export default AdminDashboard;