// src/pages/AdminDashboard/AdminDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, writeBatch, updateDoc, collection } from 'firebase/firestore';
import { Menu, X, ShieldAlert, Wrench, Skull } from 'lucide-react';
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

// --- NEWLY INTEGRATED VIEWS & COMPONENTS ---
import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { StatusModal } from '../../components/common/StatusModal/StatusModal';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';
import { AttendanceHistoryList } from '../FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList';

// 🚀 IMPORT THE ATTENDANCE HUB 🚀

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();
    const { user, setUser } = store;
    const toast = useToast();

    // ----- Navigation State (🚀 Added 'attendance' to the union type) -----
    const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'assessments' | 'settings' | 'attendance'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    // Mobile Sidebar State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    // ----- Modal States -----
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

    // ----- Load Data -----
    useEffect(() => {
        if (currentNav === 'dashboard') {
            store.fetchLearners();
            store.fetchStagingLearners();
            store.fetchCohorts();
            store.fetchStaff();
        }
        if (currentNav === 'directory') store.fetchLearners();
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
    }, [currentNav, store]);

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

    const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
        if (!window.confirm(`Approve ${learnersToApprove.length} learner profiles? They will be added to the system directory.`)) return;
        await store.approveStagingLearners(learnersToApprove);
        toast.success(`Successfully initialized ${learnersToApprove.length} learner profiles.`);
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
            console.error(e);
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

    if (currentNav === 'studio') {
        return <CertificateStudio />;
    }

    return (
        <div className="admin-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* MOBILE HEADER */}
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

            {/* MOBILE OVERLAY */}
            {isMobileMenuOpen && (
                <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* SIDEBAR WRAPPER */}
            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={24} />
                </button>
                <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
            </div>

            <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

                {/* DESKTOP HEADER */}
                <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                    <div className="header-title">
                        <h1>
                            {currentNav === 'dashboard' && 'Dashboard Overview'}
                            {currentNav === 'directory' && 'Master Learner Directory'}
                            {currentNav === 'learners' && 'Course Enrollments'}
                            {currentNav === 'attendance' && 'Organization Attendance Hub'}
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
                            {currentNav === 'attendance' && 'Monitor live check-ins and review historical attendance records across all cohorts.'}
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

                    <div style={{ marginTop: '5px' }}>
                        <NotificationBell />
                    </div>
                </header>

                <div className="admin-content">
                    {/* 🚀 RENDER ATTENDANCE HUB IF SELECTED 🚀 */}
                    {currentNav === 'attendance' && <AttendanceHistoryList />}

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
                    {currentNav === 'staff' && (
                        <StaffView
                            staff={store.staff}
                            onAdd={() => { setEditingStaff(null); setShowStaffModal(true); }}
                            onEdit={(s) => { setEditingStaff(s); setShowStaffModal(true); }}
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
                    {currentNav === 'profile' && (
                        <AdminProfileView profile={user} user={user} onUpdate={handleUpdateAdminProfile} />
                    )}
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
                        try {
                            if (selectedLearner) {
                                await store.updateLearner(selectedLearner.id, l);
                                toast.success("Learner updated successfully.");
                            } else {
                                await store.addLearner(l as any);
                                toast.success("Learner added successfully.");
                            }
                            setShowAddLearnerModal(false);
                        } catch (err: any) {
                            toast.error(`Failed to save learner: ${err.message}`);
                        }
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
                        toast.success("Import successful. Records added to Staging Area.");
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

            {showNoEmailAlert && (
                <StatusModal
                    type="warning"
                    title="Missing Email Address"
                    message="This learner does not have an email address on file. Please edit their profile to add an email before sending an invite."
                    confirmText="Okay"
                    onClose={() => setShowNoEmailAlert(false)}
                />
            )}

            {learnerToInvite && (
                <StatusModal
                    type="info"
                    title={`${learnerToInvite.authStatus === 'active' ? 'Resend' : 'Send'} Platform Invite`}
                    message={`Are you sure you want to send a platform login invitation to ${learnerToInvite.email}?`}
                    confirmText={isInviting ? "Sending..." : "Send Invite"}
                    onClose={async () => {
                        setIsInviting(true);
                        try {
                            await store.inviteLearner(learnerToInvite);
                            toast.success(`Invite successfully sent to ${learnerToInvite.email}`);
                            setLearnerToInvite(null);
                        } catch (err: any) {
                            toast.error(err.message || "Failed to send invite.");
                        } finally {
                            setIsInviting(false);
                        }
                    }}
                    onCancel={() => {
                        if (!isInviting) setLearnerToInvite(null);
                    }}
                />
            )}

            {showStaffModal && (
                <StaffFormModal
                    staff={editingStaff || undefined}
                    onClose={() => { setShowStaffModal(false); setEditingStaff(null); }}
                    onSave={async (s) => {
                        try {
                            if (editingStaff) {
                                if (store.updateStaff) {
                                    await store.updateStaff(editingStaff.id, s);
                                } else {
                                    await updateDoc(doc(db, 'users', editingStaff.id), s as any);
                                    await store.fetchStaff();
                                }
                                toast.success("Staff member updated.");
                            } else {
                                await store.addStaff(s);
                                toast.success("New staff member created.");
                            }
                            setShowStaffModal(false);
                            setEditingStaff(null);
                        } catch (err: any) {
                            toast.error(`Failed to save staff: ${err.message}`);
                        }
                    }}
                />
            )}

            {staffToDelete && (
                <StatusModal
                    type="error"
                    title="Confirm Deletion"
                    message={`Are you sure you want to permanently delete <strong>${staffToDelete.fullName}</strong>?`}
                    confirmText="Delete Permanently"
                    onClose={async () => {
                        try {
                            await store.deleteStaff(staffToDelete.id);
                            toast.success(`${staffToDelete.fullName} deleted permanently.`);
                        } catch (err: any) {
                            toast.error(`Delete failed: ${err.message}`);
                        } finally {
                            setStaffToDelete(null);
                        }
                    }}
                    onCancel={() => setStaffToDelete(null)}
                />
            )}

            {showCohortModal && (
                <CohortFormModal
                    cohort={selectedCohort || undefined}
                    onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
                    onSave={async (c, reasons) => {
                        try {
                            const batch = writeBatch(db);
                            const timestamp = new Date().toISOString();

                            const cohortId = selectedCohort?.id || doc(collection(db, 'cohorts')).id;
                            const cohortRef = doc(db, 'cohorts', cohortId);

                            const cleanLearnerIds = (c.learnerIds || [])
                                .filter((id: string) => id && !id.startsWith("Unassigned_"))
                                .map((id: string) => {
                                    const match = store.learners.find(l => l.id === id || l.idNumber === id);
                                    return match ? (match.idNumber || match.id) : id;
                                });

                            const uniqueCleanIds = Array.from(new Set(cleanLearnerIds));

                            const cohortData = {
                                ...c,
                                learnerIds: uniqueCleanIds,
                                id: cohortId,
                                updatedAt: timestamp
                            };

                            if (selectedCohort) {
                                batch.update(cohortRef, cohortData);
                            } else {
                                batch.set(cohortRef, { ...cohortData, createdAt: timestamp });
                            }

                            uniqueCleanIds.forEach((lId) => {
                                const enrollmentId = `${cohortId}_${lId as string}`;
                                const enrollRef = doc(db, 'enrollments', enrollmentId);

                                batch.set(enrollRef, {
                                    id: enrollmentId,
                                    cohortId: cohortId,
                                    learnerId: lId,
                                    programmeId: c.programmeId || '',
                                    campusId: c.campusId || '',
                                    status: 'active',
                                    enrolledAt: timestamp,
                                    updatedAt: timestamp
                                }, { merge: true });

                                batch.set(doc(db, 'learners', lId as string), { cohortId: cohortId, updatedAt: timestamp }, { merge: true });
                            });

                            if (selectedCohort) {
                                const removedIds = (selectedCohort.learnerIds || []).filter((oldId: string) => !uniqueCleanIds.includes(oldId));

                                removedIds.forEach((rId: string) => {
                                    const lMatch = store.learners.find(l => l.id === rId || l.idNumber === rId);
                                    const finalRid = lMatch ? (lMatch.idNumber || lMatch.id) : rId;

                                    batch.set(doc(db, 'enrollments', `${cohortId}_${finalRid}`), {
                                        status: 'dropped',
                                        updatedAt: timestamp
                                    }, { merge: true });

                                    batch.set(doc(db, 'learners', finalRid), {
                                        cohortId: "",
                                        updatedAt: timestamp
                                    }, { merge: true });
                                });
                            }

                            await batch.commit();

                            await store.fetchCohorts(true);
                            await store.fetchLearners(true);

                            toast.success("Class Roster Saved Successfully!");
                            setShowCohortModal(false);
                        } catch (err: any) {
                            console.error("Database Save Failed:", err);
                            toast.error(`Error: ${err.message}`);
                        }
                    }}
                />
            )}

            {cohortToDelete && (
                <DeleteConfirmModal
                    itemName={cohortToDelete.name}
                    actionType="Delete"
                    onConfirm={async () => {
                        try {
                            await store.deleteCohort(cohortToDelete.id);
                            toast.success(`${cohortToDelete.name} deleted.`);
                        } catch (err: any) {
                            toast.error(`Failed to delete cohort: ${err.message}`);
                        } finally {
                            setCohortToDelete(null);
                        }
                    }}
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
                        try {
                            if (selectedProg) {
                                await store.updateProgramme(selectedProg.id, p);
                                toast.success("Template updated.");
                            } else {
                                await store.addProgramme(p as any);
                                toast.success("New template created.");
                            }
                            setShowProgModal(false);
                        } catch (err: any) {
                            toast.error(`Failed to save template: ${err.message}`);
                        }
                    }}
                />
            )}

            {progToArchive && (
                <DeleteConfirmModal
                    itemName={progToArchive.name}
                    actionType="Archive"
                    onConfirm={async () => {
                        try {
                            await store.archiveProgramme(progToArchive.id);
                            toast.success(`${progToArchive.name} archived.`);
                        } catch (err: any) {
                            toast.error(`Archive failed: ${err.message}`);
                        } finally {
                            setProgToArchive(null);
                        }
                    }}
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
// import { Menu, X, ShieldAlert, Wrench, Skull } from 'lucide-react';
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

// // --- NEWLY INTEGRATED VIEWS & COMPONENTS ---
// import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
// import { SettingsPage } from '../SettingsPage/SettingsPage';
// import { StatusModal } from '../../components/common/StatusModal/StatusModal';
// import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
// import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// const AdminDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();
//     const { user, setUser } = store;
//     const toast = useToast();

//     // ----- Navigation State -----
//     const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'assessments' | 'settings'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );

//     // Mobile Sidebar State
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//     useEffect(() => {
//         setIsMobileMenuOpen(false);
//     }, [currentNav]);

//     // ----- Modal States -----
//     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
//     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
//     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

//     const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

//     const [learnerToInvite, setLearnerToInvite] = useState<DashboardLearner | null>(null);
//     const [showNoEmailAlert, setShowNoEmailAlert] = useState(false);
//     const [isInviting, setIsInviting] = useState(false);

//     const [showProgModal, setShowProgModal] = useState(false);
//     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
//     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

//     const [showStaffModal, setShowStaffModal] = useState(false);
//     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
//     const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

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
//         if (currentNav === 'directory') store.fetchLearners();
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
//         if (currentNav === 'assessments') {
//             store.fetchCohorts();
//             store.fetchProgrammes();
//         }
//     }, [currentNav, store]);

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
//             toast.success("Profile updated successfully.");
//         } catch (err) {
//             console.error("Profile update failed:", err);
//             toast.error("Failed to update profile.");
//             throw err;
//         }
//     };

//     const handleArchiveLearner = async (learner: DashboardLearner) => setLearnerToProcess({ learner, action: 'archive' });
//     const handleDiscardDraft = async (learner: DashboardLearner) => setLearnerToProcess({ learner, action: 'discard' });
//     const handleRestoreLearner = async (learner: DashboardLearner) => {
//         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
//         await store.restoreLearner(learner.id);
//         toast.success(`${learner.fullName} has been restored.`);
//     };

//     // const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
//     //     if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
//     //     await store.approveStagingLearners(learnersToApprove);
//     //     toast.success(`Successfully approved ${learnersToApprove.length} learners.`);
//     // };
//     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
//         // 📢 Change the message: Use "Profiles" instead of "Enrollments"
//         if (!window.confirm(`Approve ${learnersToApprove.length} learner profiles? They will be added to the system directory.`)) return;

//         // This now ONLY creates the Human Profile in the /learners collection
//         await store.approveStagingLearners(learnersToApprove);

//         toast.success(`Successfully initialized ${learnersToApprove.length} learner profiles.`);
//     };

//     const handleInviteLearner = (learner: DashboardLearner) => {
//         if (!learner.email) {
//             setShowNoEmailAlert(true);
//             return;
//         }
//         setLearnerToInvite(learner);
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
//             toast.success(`Successfully archived ${count} enrollments.`);
//         } catch (e: any) {
//             console.error(e);
//             toast.error("Failed to archive: " + e.message);
//         }
//     };

//     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
//         const count = draftsToDiscard.length;
//         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;
//         const ids = draftsToDiscard.map(l => l.id);
//         await store.discardStagingLearners(ids);
//         toast.success(`Discarded ${count} drafts.`);
//     };

//     const executeLearnerAction = async () => {
//         if (!learnerToProcess) return;
//         const { learner, action } = learnerToProcess;
//         try {
//             if (action === 'archive') {
//                 await store.archiveLearner(learner.id);
//                 toast.success(`${learner.fullName} has been archived.`);
//             } else if (action === 'discard') {
//                 await store.discardStagingLearners([learner.id]);
//                 toast.success(`Draft for ${learner.fullName} was discarded.`);
//             }
//         } catch (err: any) {
//             toast.error(`Failed to ${action} learner: ${err.message}`);
//         } finally {
//             setLearnerToProcess(null);
//         }
//     };

//     const handleLearnerCohortArchive = async (year: string) => {
//         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
//             await store.archiveCohort(year);
//             toast.success(`Cohort ${year} has been successfully archived.`);
//         }
//     };

//     if (currentNav === 'studio') {
//         return <CertificateStudio />;
//     }

//     return (
//         <div className="admin-layout">
//             {/* <DataRepairClinic /> */}
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             {/* MOBILE HEADER - Bell included here for mobile view */}
//             <div className="admin-mobile-header">
//                 <div className="admin-mobile-header-left">
//                     <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                         <Menu size={24} />
//                     </button>
//                     <div className="admin-mobile-title">Admin Portal</div>
//                 </div>
//                 <div className="admin-mobile-header-right">
//                     <NotificationBell />
//                 </div>
//             </div>

//             {/* MOBILE OVERLAY */}
//             {isMobileMenuOpen && (
//                 <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
//             )}

//             {/* SIDEBAR WRAPPER */}
//             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
//                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
//                     <X size={24} />
//                 </button>
//                 <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
//             </div>

//             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

//                 {/* DESKTOP HEADER WITH NOTIFICATION BELL */}
//                 <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
//                     <div className="header-title">
//                         <h1>
//                             {currentNav === 'dashboard' && 'Dashboard Overview'}
//                             {currentNav === 'directory' && 'Master Learner Directory'}
//                             {currentNav === 'learners' && 'Course Enrollments'}
//                             {currentNav === 'qualifications' && 'Qualification Templates'}
//                             {currentNav === 'assessments' && 'Assessment Management'}
//                             {currentNav === 'staff' && 'Staff & Mentors'}
//                             {currentNav === 'cohorts' && 'Cohort Management'}
//                             {currentNav === 'workplaces' && 'Workplace Management'}
//                             {currentNav === 'profile' && 'My Administrator Profile'}
//                             {currentNav === 'access' && 'Platform Access Control'}
//                             {currentNav === 'settings' && 'Platform Settings'}
//                         </h1>
//                         <p>
//                             {currentNav === 'dashboard' && 'Welcome to the administration portal'}
//                             {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
//                             {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
//                             {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
//                             {currentNav === 'assessments' && 'Create, distribute, and manage curriculum assessments and tasks'}
//                             {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
//                             {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
//                             {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
//                             {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
//                             {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
//                             {currentNav === 'settings' && 'Configure global system preferences and application settings'}
//                         </p>
//                     </div>

//                     {/* The Bell aligned to the far right */}
//                     <div style={{ marginTop: '5px' }}>
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="admin-content">
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
//                                 toast.success(`Restored ${list.length} learners.`);
//                             }}
//                             onArchiveCohort={handleLearnerCohortArchive}
//                             onDeletePermanent={async (learner, audit) => {
//                                 if (store.deleteLearnerPermanent) {
//                                     await store.deleteLearnerPermanent(learner.id, audit);
//                                     toast.success(`${learner.fullName} was permanently deleted.`);
//                                 } else {
//                                     toast.error("Delete function not found.");
//                                 }
//                             }}
//                         />
//                     )}
//                     {currentNav === 'assessments' && <AssessmentManager />}
//                     {currentNav === 'staff' && (
//                         <StaffView
//                             staff={store.staff}
//                             onAdd={() => { setEditingStaff(null); setShowStaffModal(true); }}
//                             onEdit={(s) => { setEditingStaff(s); setShowStaffModal(true); }}
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
//                     {currentNav === 'profile' && (
//                         <AdminProfileView profile={user} user={user} onUpdate={handleUpdateAdminProfile} />
//                     )}
//                     {currentNav === 'settings' && <SettingsPage />}
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

//             {/* ALL MODALS BELOW */}
//             {showAddLearnerModal && (
//                 <LearnerFormModal
//                     learner={selectedLearner || undefined}
//                     title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'}
//                     programmes={store.programmes}
//                     cohorts={store.cohorts}
//                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
//                     onSave={async (l) => {
//                         try {
//                             if (selectedLearner) {
//                                 await store.updateLearner(selectedLearner.id, l);
//                                 toast.success("Learner updated successfully.");
//                             } else {
//                                 await store.addLearner(l as any);
//                                 toast.success("Learner added successfully.");
//                             }
//                             setShowAddLearnerModal(false);
//                         } catch (err: any) {
//                             toast.error(`Failed to save learner: ${err.message}`);
//                         }
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
//                         toast.success("Import successful. Records added to Staging Area.");
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

//             {showNoEmailAlert && (
//                 <StatusModal
//                     type="warning"
//                     title="Missing Email Address"
//                     message="This learner does not have an email address on file. Please edit their profile to add an email before sending an invite."
//                     confirmText="Okay"
//                     onClose={() => setShowNoEmailAlert(false)}
//                 />
//             )}

//             {learnerToInvite && (
//                 <StatusModal
//                     type="info"
//                     title={`${learnerToInvite.authStatus === 'active' ? 'Resend' : 'Send'} Platform Invite`}
//                     message={`Are you sure you want to send a platform login invitation to ${learnerToInvite.email}?`}
//                     confirmText={isInviting ? "Sending..." : "Send Invite"}
//                     onClose={async () => {
//                         setIsInviting(true);
//                         try {
//                             await store.inviteLearner(learnerToInvite);
//                             toast.success(`Invite successfully sent to ${learnerToInvite.email}`);
//                             setLearnerToInvite(null);
//                         } catch (err: any) {
//                             toast.error(err.message || "Failed to send invite.");
//                         } finally {
//                             setIsInviting(false);
//                         }
//                     }}
//                     onCancel={() => {
//                         if (!isInviting) setLearnerToInvite(null);
//                     }}
//                 />
//             )}

//             {showStaffModal && (
//                 <StaffFormModal
//                     staff={editingStaff || undefined}
//                     onClose={() => { setShowStaffModal(false); setEditingStaff(null); }}
//                     onSave={async (s) => {
//                         try {
//                             if (editingStaff) {
//                                 if (store.updateStaff) {
//                                     await store.updateStaff(editingStaff.id, s);
//                                 } else {
//                                     await updateDoc(doc(db, 'users', editingStaff.id), s as any);
//                                     await store.fetchStaff();
//                                 }
//                                 toast.success("Staff member updated.");
//                             } else {
//                                 await store.addStaff(s);
//                                 toast.success("New staff member created.");
//                             }
//                             setShowStaffModal(false);
//                             setEditingStaff(null);
//                         } catch (err: any) {
//                             toast.error(`Failed to save staff: ${err.message}`);
//                         }
//                     }}
//                 />
//             )}

//             {staffToDelete && (
//                 <StatusModal
//                     type="error"
//                     title="Confirm Deletion"
//                     message={`Are you sure you want to permanently delete <strong>${staffToDelete.fullName}</strong>?`}
//                     confirmText="Delete Permanently"
//                     onClose={async () => {
//                         try {
//                             await store.deleteStaff(staffToDelete.id);
//                             toast.success(`${staffToDelete.fullName} deleted permanently.`);
//                         } catch (err: any) {
//                             toast.error(`Delete failed: ${err.message}`);
//                         } finally {
//                             setStaffToDelete(null);
//                         }
//                     }}
//                     onCancel={() => setStaffToDelete(null)}
//                 />
//             )}

//             {showCohortModal && (
//                 <CohortFormModal
//                     cohort={selectedCohort || undefined}
//                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
//                     onSave={async (c, reasons) => {
//                         try {
//                             const batch = writeBatch(db);
//                             const timestamp = new Date().toISOString();

//                             const cohortId = selectedCohort?.id || doc(collection(db, 'cohorts')).id;
//                             const cohortRef = doc(db, 'cohorts', cohortId);

//                             // 1. 🚀 SAFE ARRAY CHECK: Add (c.learnerIds || [])
//                             const cleanLearnerIds = (c.learnerIds || [])
//                                 .filter((id: string) => id && !id.startsWith("Unassigned_"))
//                                 .map((id: string) => {
//                                     const match = store.learners.find(l => l.id === id || l.idNumber === id);
//                                     return match ? (match.idNumber || match.id) : id;
//                                 });

//                             const uniqueCleanIds = Array.from(new Set(cleanLearnerIds));

//                             // 2. 📝 SAVE COHORT
//                             const cohortData = {
//                                 ...c,
//                                 learnerIds: uniqueCleanIds,
//                                 id: cohortId,
//                                 updatedAt: timestamp
//                             };

//                             if (selectedCohort) {
//                                 batch.update(cohortRef, cohortData);
//                             } else {
//                                 batch.set(cohortRef, { ...cohortData, createdAt: timestamp });
//                             }

//                             // 3. 📑 CREATE / UPDATE ENROLLMENT LEDGER
//                             uniqueCleanIds.forEach((lId) => {
//                                 const enrollmentId = `${cohortId}_${lId}`;
//                                 const enrollRef = doc(db, 'enrollments', enrollmentId);

//                                 batch.set(enrollRef, {
//                                     id: enrollmentId,
//                                     cohortId: cohortId,
//                                     learnerId: lId,
//                                     programmeId: c.programmeId || '',
//                                     campusId: c.campusId || '',
//                                     status: 'active',
//                                     enrolledAt: timestamp,
//                                     updatedAt: timestamp
//                                 }, { merge: true });

//                                 batch.set(doc(db, 'learners', lId), { cohortId: cohortId, updatedAt: timestamp }, { merge: true });
//                             });

//                             // 4. 🗑️ HANDLE DROPPED/UNCHECKED LEARNERS
//                             if (selectedCohort) {
//                                 // 🚀 SAFE ARRAY CHECK 2: Add (selectedCohort.learnerIds || [])
//                                 const removedIds = (selectedCohort.learnerIds || []).filter((oldId: string) => !uniqueCleanIds.includes(oldId));

//                                 removedIds.forEach((rId: string) => {
//                                     const lMatch = store.learners.find(l => l.id === rId || l.idNumber === rId);
//                                     const finalRid = lMatch ? (lMatch.idNumber || lMatch.id) : rId;

//                                     batch.set(doc(db, 'enrollments', `${cohortId}_${finalRid}`), {
//                                         status: 'dropped',
//                                         updatedAt: timestamp
//                                     }, { merge: true });

//                                     batch.set(doc(db, 'learners', finalRid), {
//                                         cohortId: "",
//                                         updatedAt: timestamp
//                                     }, { merge: true });
//                                 });
//                             }

//                             // 5. ATOMIC COMMIT
//                             await batch.commit();

//                             // 6. FORCE REFRESH TO UPDATE UI
//                             await store.fetchCohorts(true);
//                             await store.fetchLearners(true);

//                             toast.success("Class Roster Saved Successfully!");
//                             setShowCohortModal(false);
//                         } catch (err: any) {
//                             console.error("Database Save Failed:", err);
//                             toast.error(`Error: ${err.message}`);
//                         }
//                     }}
//                 />
//             )}

//             {/* {showCohortModal && (
//                 <CohortFormModal
//                     cohort={selectedCohort || undefined}
//                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
//                     onSave={async (c, reasons) => {
//                         try {
//                             if (selectedCohort) {
//                                 await store.updateCohort(selectedCohort.id, c, reasons);
//                                 toast.success("Cohort updated successfully.");
//                             } else {
//                                 await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
//                                 toast.success("Cohort created successfully.");
//                             }
//                             setShowCohortModal(false);
//                         } catch (err: any) {
//                             toast.error(`Error saving cohort: ${err.message}`);
//                         }
//                     }}
//                 />
//             )} */}

//             {cohortToDelete && (
//                 <DeleteConfirmModal
//                     itemName={cohortToDelete.name}
//                     actionType="Delete"
//                     onConfirm={async () => {
//                         try {
//                             await store.deleteCohort(cohortToDelete.id);
//                             toast.success(`${cohortToDelete.name} deleted.`);
//                         } catch (err: any) {
//                             toast.error(`Failed to delete cohort: ${err.message}`);
//                         } finally {
//                             setCohortToDelete(null);
//                         }
//                     }}
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
//                         try {
//                             if (selectedProg) {
//                                 await store.updateProgramme(selectedProg.id, p);
//                                 toast.success("Template updated.");
//                             } else {
//                                 await store.addProgramme(p as any);
//                                 toast.success("New template created.");
//                             }
//                             setShowProgModal(false);
//                         } catch (err: any) {
//                             toast.error(`Failed to save template: ${err.message}`);
//                         }
//                     }}
//                 />
//             )}

//             {progToArchive && (
//                 <DeleteConfirmModal
//                     itemName={progToArchive.name}
//                     actionType="Archive"
//                     onConfirm={async () => {
//                         try {
//                             await store.archiveProgramme(progToArchive.id);
//                             toast.success(`${progToArchive.name} archived.`);
//                         } catch (err: any) {
//                             toast.error(`Archive failed: ${err.message}`);
//                         } finally {
//                             setProgToArchive(null);
//                         }
//                     }}
//                     onCancel={() => setProgToArchive(null)}
//                 />
//             )}
//             {/* <SubmissionNukeTool /> */}
//             {/* <IdentityMigrationClinic /> */}
//             {/* <RosterHarmonizer /> */}
//             {/* <DeepSystemPurgeTool /> */}
//         </div>
//     );
// };

// export default AdminDashboard;






// export const DeepSystemPurgeTool = () => {
//     const [running, setRunning] = useState(false);
//     const [log, setLog] = useState<string[]>([]);

//     const addLog = (msg: string) => setLog(prev => [...prev, msg]);

//     const runPurge = async () => {
//         if (!window.confirm("WARNING: This will permanently hunt down and delete all 'Unassigned_' and legacy auto-IDs across Learners, Enrollments, and Cohorts. Proceed?")) return;

//         setRunning(true);
//         addLog("🚀 Starting Deep System Purge...");

//         try {
//             // Helper to identify corrupted IDs
//             const isBadId = (id: string) => !id || id.startsWith("Unassigned_") || id.length > 15;

//             let batch = writeBatch(db);
//             let operationCount = 0;

//             const commitBatchIfFull = async () => {
//                 if (operationCount > 450) {
//                     await batch.commit();
//                     batch = writeBatch(db);
//                     operationCount = 0;
//                 }
//             };

//             // Fetch all collections
//             const learnersSnap = await getDocs(collection(db, 'learners'));
//             const enrollmentsSnap = await getDocs(collection(db, 'enrollments'));
//             const cohortsSnap = await getDocs(collection(db, 'cohorts'));

//             // Build a lookup map to safely translate bad IDs to good ID Numbers
//             const idTranslationMap = new Map<string, string>();

//             // ─── 1. PURGE LEARNER PROFILES ───
//             addLog("🔍 Scanning Learner Profiles...");
//             for (const lDoc of learnersSnap.docs) {
//                 const oldId = lDoc.id;
//                 const data = lDoc.data();
//                 const realIdNumber = String(data.idNumber || '').trim();

//                 if (isBadId(oldId)) {
//                     if (realIdNumber && !isBadId(realIdNumber)) {
//                         idTranslationMap.set(oldId, realIdNumber); // Remember this fix for the cohort arrays

//                         // Clone to the true ID Number
//                         batch.set(doc(db, 'learners', realIdNumber), {
//                             ...data,
//                             id: realIdNumber,
//                             learnerId: realIdNumber,
//                             repairNote: "System Purge: ID Recovered"
//                         }, { merge: true });
//                         operationCount++;

//                         addLog(`👻 Profile Fixed: Cloned ${oldId} -> ${realIdNumber}`);
//                     } else {
//                         addLog(`⚠️ Profile Destroyed: ${oldId} had no valid ID Number to recover.`);
//                     }

//                     // Destroy the original ghost profile
//                     batch.delete(lDoc.ref);
//                     operationCount++;
//                     await commitBatchIfFull();
//                 }
//             }

//             // ─── 2. PURGE ENROLLMENT LEDGER ───
//             addLog("🔍 Scanning Enrollment Ledger...");
//             for (const eDoc of enrollmentsSnap.docs) {
//                 const eData = eDoc.data();
//                 const learnerId = eData.learnerId || "";

//                 // If the ledger entry belongs to a bad ID, or the doc ID itself is corrupted, destroy it
//                 if (isBadId(learnerId) || eDoc.id.includes("Unassigned_")) {
//                     batch.delete(eDoc.ref);
//                     operationCount++;
//                     addLog(`🗑️ Ledger Entry Destroyed: ${eDoc.id}`);
//                     await commitBatchIfFull();
//                 }
//             }

//             // ─── 3. PURGE COHORT ARRAYS ───
//             addLog("🔍 Scanning Cohort Rosters...");
//             for (const cDoc of cohortsSnap.docs) {
//                 const cohort = cDoc.data();
//                 const oldLearnerIds = cohort.learnerIds || [];

//                 let arrayWasModified = false;
//                 const cleanLearnerIds = new Set<string>();

//                 for (const id of oldLearnerIds) {
//                     if (isBadId(id)) {
//                         arrayWasModified = true;
//                         // Try to rescue the assignment using our translation map
//                         if (idTranslationMap.has(id)) {
//                             cleanLearnerIds.add(idTranslationMap.get(id)!);
//                             addLog(`🩹 Cohort Array Rescued: Translated ${id} to ${idTranslationMap.get(id)}`);
//                         } else {
//                             addLog(`✂️ Cohort Array Cleaned: Dropped untranslatable ID ${id}`);
//                         }
//                     } else {
//                         cleanLearnerIds.add(id); // Keep valid IDs
//                     }
//                 }

//                 if (arrayWasModified) {
//                     batch.update(cDoc.ref, { learnerIds: Array.from(cleanLearnerIds) });
//                     operationCount++;
//                     await commitBatchIfFull();
//                 }
//             }

//             // Final commit for any remaining operations
//             if (operationCount > 0) {
//                 await batch.commit();
//             }

//             addLog("✅ PURGE COMPLETE! All ghost IDs and corrupted arrays have been destroyed.");

//         } catch (e: any) {
//             console.error(e);
//             addLog(`❌ ERROR: ${e.message}`);
//         } finally {
//             setRunning(false);
//         }
//     };

//     return (
//         <div style={{ padding: '24px', background: '#0f172a', border: '2px solid #ef4444', borderRadius: '12px', margin: '20px 0', color: 'white' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
//                 <Skull size={24} color="#ef4444" />
//                 <h3 style={{ margin: 0, color: '#f87171', fontSize: '1.2rem' }}>Deep System Purge</h3>
//             </div>

//             <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '20px', lineHeight: '1.5' }}>
//                 This script sweeps the entire database. It detects any Document IDs that start with <strong>"Unassigned_"</strong> or are <strong>20-character auto-generated Firebase strings</strong>. It will clone the human profiles to their proper ID numbers, destroy the bad enrollment documents, and permanently wipe the bad IDs from your Cohort class lists.
//             </p>

//             <button
//                 onClick={runPurge}
//                 disabled={running}
//                 style={{
//                     display: 'flex', alignItems: 'center', gap: '8px',
//                     padding: '10px 20px', background: '#ef4444',
//                     color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
//                 }}
//             >
//                 {running ? <Loader2 className="spin" size={16} /> : <ShieldAlert size={16} />}
//                 {running ? "Purging System..." : "Execute Deep Purge"}
//             </button>

//             {log.length > 0 && (
//                 <div style={{ marginTop: '20px', padding: '12px', background: '#000', color: '#10b981', borderRadius: '6px', fontSize: '0.75rem', maxHeight: '250px', overflowY: 'auto', fontFamily: 'monospace', border: '1px solid #333' }}>
//                     {log.map((line, i) => <div key={i}>{line}</div>)}
//                 </div>
//             )}
//         </div>
//     );
// };


// import { Fingerprint, Zap } from 'lucide-react';

// export const RosterHarmonizer = () => {
//     const [running, setRunning] = useState(false);
//     const [log, setLog] = useState<string[]>([]);

//     const run = async () => {
//         setRunning(true);
//         setLog(["🚀 Starting Roster Harmonization..."]);
//         try {
//             const batch = writeBatch(db);
//             const learnersSnap = await getDocs(collection(db, 'learners'));
//             const cohortsSnap = await getDocs(collection(db, 'cohorts'));

//             const learners = learnersSnap.docs.map(d => ({ docId: d.id, ...d.data() } as any));

//             // 1. Fix Learner Statuses (Stop the "Vanishing")
//             learnersSnap.docs.forEach(lDoc => {
//                 const d = lDoc.data();
//                 if (d.status !== 'active' || !d.authStatus) {
//                     batch.update(lDoc.ref, { status: 'active', authStatus: 'active' });
//                 }
//             });

//             // 2. Fix Cohort Arrays (The ID Number vs Legacy ID mismatch)
//             cohortsSnap.docs.forEach(cDoc => {
//                 const cohort = cDoc.data();
//                 const oldIds = cohort.learnerIds || [];
//                 const newIds = new Set<string>();

//                 oldIds.forEach((id: string) => {
//                     // Find the learner who either HAS this docId OR HAS this idNumber
//                     const match = learners.find((l: any) => l.docId === id || l.idNumber === id);
//                     if (match && match.idNumber) {
//                         newIds.add(match.idNumber); // Force the ID Number into the array
//                     } else {
//                         newIds.add(id); // Keep as is if no match found
//                     }
//                 });

//                 batch.update(cDoc.ref, { learnerIds: Array.from(newIds) });
//                 setLog(prev => [...prev, `✅ Harmonized Cohort: ${cohort.name}`]);
//             });

//             await batch.commit();
//             setLog(prev => [...prev, "🎉 DATABASE ALIGNED. Refresh your page!"]);
//         } catch (e: any) { setLog(prev => [...prev, "❌ Error: " + e.message]); }
//         setRunning(false);
//     };

//     return (
//         <div style={{ padding: '20px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', margin: '20px 0' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                 <Fingerprint size={20} color="#0369a1" />
//                 <h3 style={{ margin: 0 }}>Roster Harmonizer</h3>
//             </div>
//             <p style={{ fontSize: '0.8rem', color: '#0c4a6e' }}>Forces Cohort lists to use ID Numbers and fixes "Vanishing" learner statuses.</p>
//             <button onClick={run} disabled={running} style={{ padding: '10px 20px', background: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
//                 {running ? <Loader2 className="spin" size={16} /> : <Zap size={16} />} Harmonize All Rosters
//             </button>
//             {log.length > 0 && <div style={{ marginTop: '10px', fontSize: '0.7rem', fontFamily: 'monospace', maxHeight: '100px', overflowY: 'auto', background: '#000', color: '#22c55e', padding: '10px' }}>{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
//         </div>
//     );
// };


// import { collection, getDocs } from 'firebase/firestore';
// import { AlertOctagon, Loader2, Trash2 } from 'lucide-react';

// export const SubmissionNukeTool = () => {
//     const [nuking, setNuking] = useState(false);

//     const executeNuke = async () => {
//         // Double-lock safety check
//         const promptAnswer = window.prompt("WARNING: This will permanently delete ALL submissions and grades for ALL learners.\n\nTo proceed, type the word: NUKE");

//         if (promptAnswer !== 'NUKE') {
//             alert("Action cancelled. Submissions are safe.");
//             return;
//         }

//         setNuking(true);
//         try {
//             const subSnap = await getDocs(collection(db, 'learner_submissions'));

//             // Firestore has a limit of 500 operations per batch. We chunk them just to be safe.
//             const batches = [];
//             let currentBatch = writeBatch(db);
//             let count = 0;

//             subSnap.docs.forEach((docSnap) => {
//                 currentBatch.delete(docSnap.ref);
//                 count++;
//                 if (count % 490 === 0) {
//                     batches.push(currentBatch.commit());
//                     currentBatch = writeBatch(db);
//                 }
//             });

//             // Commit the final batch
//             batches.push(currentBatch.commit());
//             await Promise.all(batches);

//             alert(`💥 SYSTEM RESET: Successfully deleted ${count} submissions.`);
//         } catch (error: any) {
//             console.error("Nuke failed:", error);
//             alert("Deletion failed: " + error.message);
//         } finally {
//             setNuking(false);
//         }
//     };

//     return (
//         <div style={{ padding: '24px', background: '#0f172a', border: '2px solid #ef4444', borderRadius: '8px', margin: '20px 0', color: 'white' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
//                 <AlertOctagon size={28} color="#ef4444" />
//                 <h2 style={{ margin: 0, color: '#f87171' }}>Submission Nuke Tool (Complete Reset)</h2>
//             </div>

//             <p style={{ color: '#cbd5e1', marginBottom: '20px', lineHeight: '1.5' }}>
//                 This tool will permanently delete <strong>EVERY single assessment submission</strong> in the database.
//                 Learners will lose any answers they have submitted, and facilitators will lose any grading they have done.
//                 <br /><br />
//                 Once deleted, the system will automatically generate fresh, perfectly-linked blank assessments for all valid learners.
//             </p>

//             <button
//                 onClick={executeNuke}
//                 disabled={nuking}
//                 style={{
//                     background: '#ef4444', color: 'white', padding: '12px 24px',
//                     border: 'none', borderRadius: '6px', cursor: 'pointer',
//                     fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
//                     fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px'
//                 }}
//             >
//                 {nuking ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
//                 {nuking ? 'Erasing Database...' : 'Nuke All Submissions'}
//             </button>
//         </div>
//     );
// };



// import { query, where } from 'firebase/firestore';

// export const IdentityMigrationClinic = () => {
//     const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
//     const [log, setLog] = useState<string[]>([]);

//     const addLog = (msg: string) => setLog(prev => [...prev, msg]);

//     const runMigration = async () => {
//         if (!window.confirm("This will migrate all auto-generated IDs to strict ID Numbers across all collections. Proceed?")) return;

//         setStatus('running');
//         setLog(["🚀 Starting Identity Migration..."]);

//         try {
//             const learnersSnap = await getDocs(collection(db, 'learners'));
//             const cohortsSnap = await getDocs(collection(db, 'cohorts'));
//             let migratedCount = 0;

//             for (const learnerDoc of learnersSnap.docs) {
//                 const oldId = learnerDoc.id;
//                 const data = learnerDoc.data();
//                 const trueIdNumber = String(data.idNumber || '').trim();

//                 // Detect if the Document ID is an auto-generated Firebase ID (usually 20 chars) 
//                 // and DOES NOT match their actual ID Number.
//                 if (trueIdNumber && oldId !== trueIdNumber && oldId.length > 15) {
//                     addLog(`Migrating: ${data.fullName} (${oldId} -> ${trueIdNumber})`);

//                     // We use a fresh batch for EACH learner to avoid Firestore limits
//                     const batch = writeBatch(db);

//                     // 1. CLONE THE HUMAN PROFILE TO THE CORRECT ID
//                     batch.set(doc(db, 'learners', trueIdNumber), {
//                         ...data,
//                         id: trueIdNumber,
//                         learnerId: trueIdNumber,
//                         repairNote: "Identity ID Migrated"
//                     });

//                     // 2. FIND AND MIGRATE ALL ENROLLMENTS
//                     const enrollQ = query(collection(db, 'enrollments'), where('learnerId', '==', oldId));
//                     const enrollSnap = await getDocs(enrollQ);

//                     enrollSnap.docs.forEach(eDoc => {
//                         const eData = eDoc.data();
//                         const cohortId = eData.cohortId || 'Unassigned';
//                         const newEnrollId = `${cohortId}_${trueIdNumber}`;

//                         // Create new enrollment ledger entry
//                         batch.set(doc(db, 'enrollments', newEnrollId), {
//                             ...eData,
//                             id: newEnrollId,
//                             learnerId: trueIdNumber,
//                             repairNote: "Identity ID Migrated"
//                         });

//                         // Delete the old corrupted enrollment
//                         batch.delete(eDoc.ref);
//                     });

//                     // 3. REWIRE COHORT CLASS LISTS
//                     cohortsSnap.docs.forEach(cDoc => {
//                         const cData = cDoc.data();
//                         if (cData.learnerIds && cData.learnerIds.includes(oldId)) {
//                             // Filter out the old auto-ID and push the real ID Number
//                             const updatedLearnerIds = cData.learnerIds.filter((id: string) => id !== oldId);
//                             updatedLearnerIds.push(trueIdNumber);

//                             batch.update(cDoc.ref, { learnerIds: updatedLearnerIds });
//                         }
//                     });

//                     // 4. DESTROY THE OLD GHOST PROFILE
//                     batch.delete(learnerDoc.ref);

//                     await batch.commit();
//                     migratedCount++;
//                 }
//             }

//             if (migratedCount > 0) {
//                 addLog(`✅ Migration Complete! Rewired ${migratedCount} learner identities.`);
//                 setStatus('success');
//             } else {
//                 addLog("ℹ️ Scanned database. All identities are already perfectly aligned.");
//                 setStatus('success');
//             }

//         } catch (err: any) {
//             console.error(err);
//             addLog(`❌ ERROR: ${err.message}`);
//             setStatus('error');
//         }
//     };

//     return (
//         <div style={{ padding: '20px', background: '#fff1f2', border: '1px solid #fda4af', borderRadius: '12px', margin: '20px 0' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
//                 <Wrench size={20} color="#e11d48" />
//                 <h3 style={{ margin: 0, color: '#881337' }}>Deep Identity Migration Clinic</h3>
//             </div>

//             <p style={{ fontSize: '0.85rem', color: '#be123c', marginBottom: '15px' }}>
//                 This script detects learners saved with random auto-generated IDs, clones their data to their true ID Numbers, rewires all their enrollments/cohorts, and deletes the ghosts.
//             </p>

//             <button
//                 onClick={runMigration}
//                 disabled={status === 'running'}
//                 style={{
//                     display: 'flex', alignItems: 'center', gap: '8px',
//                     padding: '8px 16px', background: status === 'success' ? '#16a34a' : '#e11d48',
//                     color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
//                 }}
//             >
//                 {status === 'running' ? <Loader2 className="spin" size={16} /> : <Wrench size={16} />}
//                 {status === 'idle' && "Run Identity Migration"}
//                 {status === 'running' && "Rewiring Database..."}
//                 {status === 'success' && "Migration Complete - Refresh Page!"}
//             </button>

//             {log.length > 0 && (
//                 <div style={{ marginTop: '15px', padding: '10px', background: '#0f172a', color: '#fca5a5', borderRadius: '6px', fontSize: '0.75rem', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace' }}>
//                     {log.map((line, i) => <div key={i}>{line}</div>)}
//                 </div>
//             )}
//         </div>
//     );
// };

// // import { collection, getDocs, } from 'firebase/firestore';
// // import { Trash2, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';

// // export const DataPurgeTool = () => {
// //     const [loading, setLoading] = useState(true);
// //     const [purging, setPurging] = useState(false);
// //     const [ghosts, setGhosts] = useState<any[]>([]);
// //     const [orphans, setOrphans] = useState<any[]>([]);

// //     useEffect(() => {
// //         scanDatabase();
// //     }, []);

// //     const scanDatabase = async () => {
// //         setLoading(true);
// //         try {
// //             const lSnap = await getDocs(collection(db, 'learners'));
// //             const learnersData = lSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));

// //             const eSnap = await getDocs(collection(db, 'enrollments'));
// //             const enrollmentsData = eSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));

// //             // 1. Find Ghosts (Learners with no name)
// //             const foundGhosts = learnersData.filter((l: any) => !l.fullName || l.fullName.trim() === '');
// //             setGhosts(foundGhosts);

// //             // 2. Find Orphans (Enrollments pointing to a missing learner)
// //             const validLearnerIds = new Set(learnersData.filter((l: any) => l.fullName && l.fullName.trim() !== '').map((l: any) => l._docId));
// //             const foundOrphans = enrollmentsData.filter((e: any) => {
// //                 const targetId = e.learnerId || e.authUid || e.id;
// //                 return !validLearnerIds.has(targetId);
// //             });
// //             setOrphans(foundOrphans);

// //         } catch (error) {
// //             console.error("Scan failed:", error);
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     const executePurge = async () => {
// //         if (!window.confirm(`Are you absolutely sure you want to permanently delete ${ghosts.length} ghosts and ${orphans.length} orphans? This cannot be undone.`)) return;

// //         setPurging(true);
// //         try {
// //             const batch = writeBatch(db);
// //             const badIdsToClean = new Set<string>();

// //             // 1. Queue Ghost Learners for deletion
// //             ghosts.forEach(g => {
// //                 batch.delete(doc(db, 'learners', g._docId));
// //                 badIdsToClean.add(g._docId);
// //             });

// //             // 2. Queue Orphaned Enrollments for deletion
// //             orphans.forEach(o => {
// //                 batch.delete(doc(db, 'enrollments', o._docId));
// //                 badIdsToClean.add(o._docId);
// //                 if (o.learnerId) badIdsToClean.add(o.learnerId);
// //             });

// //             // 3. Hunt down any phantom submissions attached to these bad IDs
// //             const subSnap = await getDocs(collection(db, 'learner_submissions'));
// //             let subDeletions = 0;
// //             subSnap.forEach(subDoc => {
// //                 const subData = subDoc.data();
// //                 if (badIdsToClean.has(subData.learnerId) || badIdsToClean.has(subData.enrollmentId)) {
// //                     batch.delete(subDoc.ref);
// //                     subDeletions++;
// //                 }
// //             });

// //             // 4. Commit the purge transaction
// //             await batch.commit();
// //             alert(`Purge Complete! Deleted ${ghosts.length} ghost profiles, ${orphans.length} orphaned enrollments, and ${subDeletions} phantom submissions.`);

// //             // Rescan to verify it is clean
// //             await scanDatabase();

// //         } catch (error: any) {
// //             console.error("Purge failed:", error);
// //             alert("Purge failed: " + error.message);
// //         } finally {
// //             setPurging(false);
// //         }
// //     };

// //     if (loading) {
// //         return <div style={{ padding: '20px' }}><Loader2 className="spin" /> Preparing Purge Bay...</div>;
// //     }

// //     const isClean = ghosts.length === 0 && orphans.length === 0;

// //     return (
// //         <div style={{ padding: '20px', background: isClean ? '#f0fdf4' : '#fef2f2', border: `2px solid ${isClean ? '#22c55e' : '#ef4444'}`, borderRadius: '8px', margin: '20px 0' }}>
// //             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
// //                 {isClean ? <CheckCircle size={24} color="#15803d" /> : <AlertTriangle size={24} color="#b91c1c" />}
// //                 <h2 style={{ margin: 0, color: isClean ? '#15803d' : '#b91c1c' }}>
// //                     {isClean ? 'Database is Clean!' : 'Data Purge Required'}
// //                 </h2>
// //             </div>

// //             {!isClean ? (
// //                 <>
// //                     <p style={{ color: '#991b1b', marginBottom: '20px' }}>
// //                         The system has identified <strong>{ghosts.length} empty ghost profiles</strong> and <strong>{orphans.length} orphaned enrollments</strong>.
// //                         These records are causing UI rendering errors and marking anomalies.
// //                     </p>

// //                     <button
// //                         onClick={executePurge}
// //                         disabled={purging}
// //                         style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
// //                     >
// //                         {purging ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
// //                         {purging ? 'Purging Database...' : 'Permanently Delete Corrupted Data'}
// //                     </button>
// //                 </>
// //             ) : (
// //                 <p style={{ color: '#166534' }}>All ghost and orphaned records have been successfully eradicated from the Firestore database. You can safely remove this tool.</p>
// //             )}
// //         </div>
// //     );
// // };

// // import { collection, getDocs, query, where } from 'firebase/firestore';
// // import { Wrench, Loader2, AlertTriangle, Link as LinkIcon } from 'lucide-react';

// // export const DataRepairClinic = () => {
// //     const [loading, setLoading] = useState(false);
// //     const [repairing, setRepairing] = useState(false);
// //     const [orphans, setOrphans] = useState<any[]>([]);
// //     const [validLearners, setValidLearners] = useState<any[]>([]);
// //     const [selectedFixes, setSelectedFixes] = useState<Record<string, string>>({});
// //     const toast = useToast();

// //     const scanDatabase = async () => {
// //         setLoading(true);
// //         try {
// //             // 1. Get all profiles and enrollments
// //             const profilesSnap = await getDocs(collection(db, 'learners'));
// //             const enrollmentsSnap = await getDocs(collection(db, 'enrollments'));

// //             const profilesMap = new Map();
// //             const valid: any[] = [];

// //             profilesSnap.forEach(d => {
// //                 const data = d.data();
// //                 profilesMap.set(d.id, data);
// //                 // Collect valid humans to use in our dropdown
// //                 if (data.fullName && data.fullName.trim() !== '') {
// //                     valid.push({ id: d.id, name: data.fullName, idNumber: data.idNumber });
// //                 }
// //             });

// //             valid.sort((a, b) => a.name.localeCompare(b.name));
// //             setValidLearners(valid);

// //             // 2. Find Broken Enrollments (The Split/Orphaned ones)
// //             const brokenEnrollments: any[] = [];
// //             enrollmentsSnap.forEach(d => {
// //                 const enrolData = d.data();
// //                 const attachedProfile = profilesMap.get(enrolData.learnerId);

// //                 // If the profile doesn't exist, OR it's a blank ghost
// //                 if (!attachedProfile || !attachedProfile.fullName || attachedProfile.fullName.trim() === '') {
// //                     brokenEnrollments.push({
// //                         enrollmentId: d.id,
// //                         ghostLearnerId: enrolData.learnerId,
// //                         ...enrolData
// //                     });
// //                 }
// //             });

// //             setOrphans(brokenEnrollments);
// //         } catch (error: any) {
// //             toast.error("Scan failed: " + error.message);
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     // Keep track of which dropdown matches which broken enrollment
// //     const handleSelectFix = (enrollmentId: string, realLearnerId: string) => {
// //         setSelectedFixes(prev => ({ ...prev, [enrollmentId]: realLearnerId }));
// //     };

// //     const executeRepair = async (enrollmentId: string, ghostLearnerId: string) => {
// //         const realLearnerId = selectedFixes[enrollmentId];
// //         if (!realLearnerId) {
// //             toast.error("Please select a valid learner to link this to.");
// //             return;
// //         }

// //         if (!window.confirm("Are you sure you want to merge this enrollment data into the selected learner?")) return;

// //         setRepairing(true);
// //         try {
// //             const batch = writeBatch(db);

// //             // 1. Point the Enrollment to the REAL learner
// //             batch.update(doc(db, 'enrollments', enrollmentId), {
// //                 learnerId: realLearnerId,
// //                 updatedAt: new Date().toISOString()
// //             });

// //             // 2. Find all submissions pointing to this enrollment and fix their learnerId
// //             const subQ = query(collection(db, 'learner_submissions'), where('enrollmentId', '==', enrollmentId));
// //             const subSnap = await getDocs(subQ);
// //             subSnap.forEach(subDoc => {
// //                 batch.update(subDoc.ref, {
// //                     learnerId: realLearnerId,
// //                     authUid: realLearnerId // Keep auth in sync
// //                 });
// //             });

// //             // 3. (Optional but recommended) Delete the empty ghost profile now that it's disconnected
// //             if (ghostLearnerId) {
// //                 batch.delete(doc(db, 'learners', ghostLearnerId));
// //             }

// //             await batch.commit();
// //             toast.success("Successfully repaired and linked to real learner!");

// //             // Remove from UI
// //             setOrphans(prev => prev.filter(o => o.enrollmentId !== enrollmentId));

// //         } catch (error: any) {
// //             toast.error("Repair failed: " + error.message);
// //         } finally {
// //             setRepairing(false);
// //         }
// //     };

// //     return (
// //         <div style={{ padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', margin: '20px 0' }}>
// //             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
// //                 <Wrench size={24} color="#0284c7" />
// //                 <h2 style={{ margin: 0, color: '#0f172a' }}>Data Repair Clinic</h2>
// //             </div>
// //             <p style={{ color: '#475569', marginBottom: '20px' }}>
// //                 This tool finds orphaned enrollments (where the system created an empty "ghost" profile) and allows you to relink that enrollment and its assessments back to the real learner.
// //             </p>

// //             <button onClick={scanDatabase} disabled={loading} className="mlab-btn mlab-btn--primary">
// //                 {loading ? <Loader2 className="spin" size={16} /> : <AlertTriangle size={16} />}
// //                 Scan for Broken Links
// //             </button>

// //             {orphans.length > 0 && (
// //                 <div style={{ marginTop: '24px' }}>
// //                     <h3 style={{ color: '#b91c1c' }}>Found {orphans.length} Orphaned / Ghost Enrollments</h3>
// //                     <table className="mlab-table" style={{ width: '100%', marginTop: '16px', background: 'white' }}>
// //                         <thead>
// //                             <tr>
// //                                 <th>Broken Enrollment Data</th>
// //                                 <th>Link To Real Learner</th>
// //                                 <th>Action</th>
// //                             </tr>
// //                         </thead>
// //                         <tbody>
// //                             {orphans.map(orphan => (
// //                                 <tr key={orphan.enrollmentId}>
// //                                     <td style={{ fontSize: '0.85rem' }}>
// //                                         <strong>Enrol ID:</strong> {orphan.enrollmentId}<br />
// //                                         <strong>Ghost ID:</strong> {orphan.ghostLearnerId}<br />
// //                                         <span style={{ color: '#64748b' }}>Check your CSV to guess who this belongs to based on the Enrol ID.</span>
// //                                     </td>
// //                                     <td>
// //                                         <select
// //                                             value={selectedFixes[orphan.enrollmentId] || ''}
// //                                             onChange={e => handleSelectFix(orphan.enrollmentId, e.target.value)}
// //                                             style={{ padding: '8px', width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px' }}
// //                                         >
// //                                             <option value="">-- Select Real Learner --</option>
// //                                             {validLearners.map(vl => (
// //                                                 <option key={vl.id} value={vl.id}>{vl.name} ({vl.idNumber || 'No ID'})</option>
// //                                             ))}
// //                                         </select>
// //                                     </td>
// //                                     <td>
// //                                         <button
// //                                             className="mlab-btn mlab-btn--success mlab-btn--sm"
// //                                             disabled={repairing || !selectedFixes[orphan.enrollmentId]}
// //                                             onClick={() => executeRepair(orphan.enrollmentId, orphan.ghostLearnerId)}
// //                                         >
// //                                             <LinkIcon size={14} /> Relink & Fix
// //                                         </button>
// //                                     </td>
// //                                 </tr>
// //                             ))}
// //                         </tbody>
// //                     </table>
// //                 </div>
// //             )}

// //             {!loading && orphans.length === 0 && validLearners.length > 0 && (
// //                 <div style={{ marginTop: '20px', padding: '16px', background: '#dcfce7', color: '#166534', borderRadius: '6px' }}>
// //                     ✅ Scan complete. No broken links or ghost enrollments found!
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };


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

// // // --- NEWLY INTEGRATED VIEWS & COMPONENTS ---
// // import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
// // import { SettingsPage } from '../SettingsPage/SettingsPage';
// // import { StatusModal } from '../../components/common/StatusModal/StatusModal';
// // import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
// // import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// // const AdminDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();
// //     const { user, setUser } = store;
// //     const toast = useToast();

// //     // ----- Navigation State -----
// //     const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'assessments' | 'settings'>(
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

// //     const [learnerToInvite, setLearnerToInvite] = useState<DashboardLearner | null>(null);
// //     const [showNoEmailAlert, setShowNoEmailAlert] = useState(false);
// //     const [isInviting, setIsInviting] = useState(false);

// //     const [showProgModal, setShowProgModal] = useState(false);
// //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

// //     const [showStaffModal, setShowStaffModal] = useState(false);
// //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// //     const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

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

// //         if (currentNav === 'assessments') {
// //             store.fetchCohorts();
// //             store.fetchProgrammes();
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
// //             toast.success("Profile updated successfully.");
// //         } catch (err) {
// //             console.error("Profile update failed:", err);
// //             toast.error("Failed to update profile.");
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
// //         toast.success(`${learner.fullName} has been restored.`);
// //     };

// //     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
// //         if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
// //         await store.approveStagingLearners(learnersToApprove);
// //         toast.success(`Successfully approved ${learnersToApprove.length} learners.`);
// //     };

// //     const handleInviteLearner = (learner: DashboardLearner) => {
// //         if (!learner.email) {
// //             setShowNoEmailAlert(true);
// //             return;
// //         }
// //         setLearnerToInvite(learner);
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
// //             toast.success(`Successfully archived ${count} enrollments.`);
// //         } catch (e: any) {
// //             console.error(e);
// //             toast.error("Failed to archive: " + e.message);
// //         }
// //     };

// //     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
// //         const count = draftsToDiscard.length;
// //         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

// //         const ids = draftsToDiscard.map(l => l.id);
// //         await store.discardStagingLearners(ids);
// //         toast.success(`Discarded ${count} drafts.`);
// //     };

// //     const executeLearnerAction = async () => {
// //         if (!learnerToProcess) return;
// //         const { learner, action } = learnerToProcess;

// //         try {
// //             if (action === 'archive') {
// //                 await store.archiveLearner(learner.id);
// //                 toast.success(`${learner.fullName} has been archived.`);
// //             } else if (action === 'discard') {
// //                 await store.discardStagingLearners([learner.id]);
// //                 toast.success(`Draft for ${learner.fullName} was discarded.`);
// //             }
// //         } catch (err: any) {
// //             toast.error(`Failed to ${action} learner: ${err.message}`);
// //         } finally {
// //             setLearnerToProcess(null);
// //         }
// //     };

// //     const handleLearnerCohortArchive = async (year: string) => {
// //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
// //             await store.archiveCohort(year);
// //             toast.success(`Cohort ${year} has been successfully archived.`);
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
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* MOBILE HEADER */}
// //             <div className="admin-mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                     <button
// //                         className="admin-hamburger-btn"
// //                         onClick={() => setIsMobileMenuOpen(true)}
// //                     >
// //                         <Menu size={24} />
// //                     </button>
// //                     <div className="admin-mobile-title">Admin Portal</div>
// //                 </div>
// //                 <NotificationBell />
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

// //                 <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// //                     <div className="header-title">
// //                         <h1>
// //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// //                             {currentNav === 'directory' && 'Master Learner Directory'}
// //                             {currentNav === 'learners' && 'Course Enrollments'}
// //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// //                             {currentNav === 'assessments' && 'Assessment Management'}
// //                             {currentNav === 'staff' && 'Staff & Mentors'}
// //                             {currentNav === 'cohorts' && 'Cohort Management'}
// //                             {currentNav === 'workplaces' && 'Workplace Management'}
// //                             {currentNav === 'profile' && 'My Administrator Profile'}
// //                             {currentNav === 'access' && 'Platform Access Control'}
// //                             {currentNav === 'settings' && 'Platform Settings'}
// //                         </h1>
// //                         <p>
// //                             {currentNav === 'dashboard' && 'Welcome to the administration portal'}
// //                             {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
// //                             {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
// //                             {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
// //                             {currentNav === 'assessments' && 'Create, distribute, and manage curriculum assessments and tasks'}
// //                             {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
// //                             {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
// //                             {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
// //                             {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
// //                             {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
// //                             {currentNav === 'settings' && 'Configure global system preferences and application settings'}
// //                         </p>
// //                     </div>

// //                     <div style={{ marginTop: '4px' }}>
// //                         <NotificationBell />
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
// //                                 toast.success(`Restored ${list.length} learners.`);
// //                             }}
// //                             onArchiveCohort={handleLearnerCohortArchive}
// //                             onDeletePermanent={async (learner, audit) => {
// //                                 if (store.deleteLearnerPermanent) {
// //                                     await store.deleteLearnerPermanent(learner.id, audit);
// //                                     toast.success(`${learner.fullName} was permanently deleted.`);
// //                                 } else {
// //                                     toast.error("Delete function not found.");
// //                                 }
// //                             }}
// //                         />
// //                     )}

// //                     {currentNav === 'assessments' && <AssessmentManager />}

// //                     {currentNav === 'staff' && (
// //                         <StaffView
// //                             staff={store.staff}
// //                             onAdd={() => {
// //                                 setEditingStaff(null);
// //                                 setShowStaffModal(true);
// //                             }}
// //                             onEdit={(s) => {
// //                                 setEditingStaff(s);
// //                                 setShowStaffModal(true);
// //                             }}
// //                             onDelete={(s) => setStaffToDelete(s)}
// //                         />
// //                     )}

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

// //                     {/* Settings Tab Integration */}
// //                     {currentNav === 'settings' && <SettingsPage />}

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
// //                         try {
// //                             if (selectedLearner) {
// //                                 await store.updateLearner(selectedLearner.id, l);
// //                                 toast.success("Learner updated successfully.");
// //                             } else {
// //                                 await store.addLearner(l as any);
// //                                 toast.success("Learner added successfully.");
// //                             }
// //                             setShowAddLearnerModal(false);
// //                         } catch (err: any) {
// //                             toast.error(`Failed to save learner: ${err.message}`);
// //                         }
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
// //                         toast.success("Import successful. Records added to Staging Area.");
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

// //             {/* NEW INVITE MODALS */}
// //             {showNoEmailAlert && (
// //                 <StatusModal
// //                     type="warning"
// //                     title="Missing Email Address"
// //                     message="This learner does not have an email address on file. Please edit their profile to add an email before sending an invite."
// //                     confirmText="Okay"
// //                     onClose={() => setShowNoEmailAlert(false)}
// //                 />
// //             )}

// //             {learnerToInvite && (
// //                 <StatusModal
// //                     type="info"
// //                     title={`${learnerToInvite.authStatus === 'active' ? 'Resend' : 'Send'} Platform Invite`}
// //                     message={`Are you sure you want to send a platform login invitation to ${learnerToInvite.email}?`}
// //                     confirmText={isInviting ? "Sending..." : "Send Invite"}
// //                     onClose={async () => {
// //                         setIsInviting(true);
// //                         try {
// //                             await store.inviteLearner(learnerToInvite);
// //                             toast.success(`Invite successfully sent to ${learnerToInvite.email}`);
// //                             setLearnerToInvite(null);
// //                         } catch (err: any) {
// //                             toast.error(err.message || "Failed to send invite.");
// //                         } finally {
// //                             setIsInviting(false);
// //                         }
// //                     }}
// //                     onCancel={() => {
// //                         if (!isInviting) setLearnerToInvite(null);
// //                     }}
// //                 />
// //             )}

// //             {/* StaffFormModal to handle both Add and Edit states perfectly */}
// //             {showStaffModal && (
// //                 <StaffFormModal
// //                     staff={editingStaff || undefined}
// //                     onClose={() => {
// //                         setShowStaffModal(false);
// //                         setEditingStaff(null);
// //                     }}
// //                     onSave={async (s) => {
// //                         try {
// //                             if (editingStaff) {
// //                                 if (store.updateStaff) {
// //                                     await store.updateStaff(editingStaff.id, s);
// //                                 } else {
// //                                     // Fallback to raw update if updateStaff isn't in store
// //                                     await updateDoc(doc(db, 'users', editingStaff.id), s as any);
// //                                     await store.fetchStaff();
// //                                 }
// //                                 toast.success("Staff member updated.");
// //                             } else {
// //                                 await store.addStaff(s);
// //                                 toast.success("New staff member created.");
// //                             }
// //                             setShowStaffModal(false);
// //                             setEditingStaff(null);
// //                         } catch (err: any) {
// //                             toast.error(`Failed to save staff: ${err.message}`);
// //                         }
// //                     }}
// //                 />
// //             )}

// //             {staffToDelete && (
// //                 <StatusModal
// //                     type="error"
// //                     title="Confirm Deletion"
// //                     message={`Are you sure you want to permanently delete <strong>${staffToDelete.fullName}</strong>?`}
// //                     confirmText="Delete Permanently"
// //                     onClose={async () => {
// //                         try {
// //                             await store.deleteStaff(staffToDelete.id);
// //                             toast.success(`${staffToDelete.fullName} deleted permanently.`);
// //                         } catch (err: any) {
// //                             toast.error(`Delete failed: ${err.message}`);
// //                         } finally {
// //                             setStaffToDelete(null);
// //                         }
// //                     }}
// //                     onCancel={() => setStaffToDelete(null)}
// //                 />
// //             )}

// //             {showCohortModal && (
// //                 <CohortFormModal
// //                     cohort={selectedCohort || undefined}
// //                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
// //                     onSave={async (c, reasons) => {
// //                         try {
// //                             if (selectedCohort) {
// //                                 await store.updateCohort(selectedCohort.id, c, reasons);
// //                                 toast.success("Cohort updated successfully.");
// //                             } else {
// //                                 await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
// //                                 toast.success("Cohort created successfully.");
// //                             }
// //                             setShowCohortModal(false);
// //                         } catch (err: any) {
// //                             toast.error(`Error saving cohort: ${err.message}`);
// //                         }
// //                     }}
// //                 />
// //             )}

// //             {cohortToDelete && (
// //                 <DeleteConfirmModal
// //                     itemName={cohortToDelete.name}
// //                     actionType="Delete"
// //                     onConfirm={async () => {
// //                         try {
// //                             await store.deleteCohort(cohortToDelete.id);
// //                             toast.success(`${cohortToDelete.name} deleted.`);
// //                         } catch (err: any) {
// //                             toast.error(`Failed to delete cohort: ${err.message}`);
// //                         } finally {
// //                             setCohortToDelete(null);
// //                         }
// //                     }}
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
// //                         try {
// //                             if (selectedProg) {
// //                                 await store.updateProgramme(selectedProg.id, p);
// //                                 toast.success("Template updated.");
// //                             } else {
// //                                 await store.addProgramme(p as any);
// //                                 toast.success("New template created.");
// //                             }
// //                             setShowProgModal(false);
// //                         } catch (err: any) {
// //                             toast.error(`Failed to save template: ${err.message}`);
// //                         }
// //                     }}
// //                 />
// //             )}

// //             {progToArchive && (
// //                 <DeleteConfirmModal
// //                     itemName={progToArchive.name}
// //                     actionType="Archive"
// //                     onConfirm={async () => {
// //                         try {
// //                             await store.archiveProgramme(progToArchive.id);
// //                             toast.success(`${progToArchive.name} archived.`);
// //                         } catch (err: any) {
// //                             toast.error(`Archive failed: ${err.message}`);
// //                         } finally {
// //                             setProgToArchive(null);
// //                         }
// //                     }}
// //                     onCancel={() => setProgToArchive(null)}
// //                 />
// //             )}

// //         </div>
// //     );
// // };

// // export default AdminDashboard;


// // // // src/pages/AdminDashboard/AdminDashboard.tsx

// // // import React, { useEffect, useState } from 'react';
// // // import { useLocation, useNavigate } from 'react-router-dom';
// // // import { signOut } from 'firebase/auth';
// // // import { auth, db } from '../../lib/firebase';
// // // import { doc, writeBatch, updateDoc } from 'firebase/firestore';
// // // import { Menu, X, ShieldAlert } from 'lucide-react';
// // // import { useStore, type StaffMember } from '../../store/useStore';
// // // import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';
// // // import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// // // import { StaffView } from '../../components/views/StaffView/StaffView';
// // // import { CohortsView } from '../../components/views/CohortsView/CohortsView';
// // // import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
// // // import { LearnersView } from '../../components/views/LearnersView/LearnersView';
// // // import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';
// // // import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
// // // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
// // // import { StaffFormModal } from '../../components/admin/StaffFormModal';
// // // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// // // import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
// // // import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

// // // import './AdminDashboard.css';
// // // import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
// // // import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';

// // // import { CertificateStudio } from './CertificateStudio/CertificateStudio';
// // // import { AdminProfileView } from './AdminProfileView/AdminProfileView';
// // // import { AccessManager } from './AccessManager/AccessManager';

// // // // --- NEWLY INTEGRATED VIEWS & COMPONENTS ---
// // // import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
// // // import { SettingsPage } from '../SettingsPage/SettingsPage';
// // // import { StatusModal } from '../../components/common/StatusModal/StatusModal';
// // // import { ToastContainer, useToast } from '../../components/common/Toast/Toast';

// // // const AdminDashboard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();
// // //     const store = useStore();
// // //     const { user, setUser } = store;
// // //     const toast = useToast();

// // //     // ----- Navigation State -----
// // //     const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' | 'assessments' | 'settings'>(
// // //         (location.state as any)?.activeTab || 'dashboard'
// // //     );

// // //     // Mobile Sidebar State
// // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // //     // Auto-close the sidebar when the user clicks a navigation link on mobile
// // //     useEffect(() => {
// // //         setIsMobileMenuOpen(false);
// // //     }, [currentNav]);

// // //     // ----- Modal States -----
// // //     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
// // //     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
// // //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

// // //     const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

// // //     const [learnerToInvite, setLearnerToInvite] = useState<DashboardLearner | null>(null);
// // //     const [showNoEmailAlert, setShowNoEmailAlert] = useState(false);
// // //     const [isInviting, setIsInviting] = useState(false);

// // //     const [showProgModal, setShowProgModal] = useState(false);
// // //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// // //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

// // //     const [showStaffModal, setShowStaffModal] = useState(false);
// // //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// // //     const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

// // //     const [showCohortModal, setShowCohortModal] = useState(false);
// // //     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
// // //     const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

// // //     // ----- Load Data -----
// // //     useEffect(() => {
// // //         if (currentNav === 'dashboard') {
// // //             store.fetchLearners();
// // //             store.fetchStagingLearners();
// // //             store.fetchCohorts();
// // //             store.fetchStaff();
// // //         }

// // //         if (currentNav === 'directory') {
// // //             store.fetchLearners();
// // //         }

// // //         if (currentNav === 'learners') {
// // //             store.fetchLearners(true);
// // //             store.fetchStagingLearners();
// // //             store.fetchCohorts();
// // //         }

// // //         if (currentNav === 'qualifications') store.fetchProgrammes();

// // //         if (currentNav === 'staff') {
// // //             store.fetchStaff();
// // //             store.fetchEmployers();
// // //         }

// // //         if (currentNav === 'workplaces') store.fetchEmployers();

// // //         if (currentNav === 'studio') {
// // //             if (store.fetchAdHocCertificates) store.fetchAdHocCertificates();
// // //         }

// // //         if (currentNav === 'cohorts') {
// // //             store.fetchCohorts();
// // //             store.fetchProgrammes();
// // //             store.fetchStaff();
// // //             store.fetchLearners();
// // //         }

// // //         if (currentNav === 'assessments') {
// // //             store.fetchCohorts();
// // //             store.fetchProgrammes();
// // //         }
// // //     }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts, store.fetchEmployers, store.fetchAdHocCertificates]);

// // //     const handleLogout = async () => {
// // //         try {
// // //             await signOut(auth);
// // //             navigate('/login');
// // //         } catch (error) {
// // //             console.error("Logout failed", error);
// // //         }
// // //     };

// // //     const handleUpdateAdminProfile = async (id: string, updates: any) => {
// // //         try {
// // //             await updateDoc(doc(db, 'users', id), updates);
// // //             if (user?.uid === id) {
// // //                 setUser({ ...user, ...updates } as any);
// // //             }
// // //             toast.success("Profile updated successfully.");
// // //         } catch (err) {
// // //             console.error("Profile update failed:", err);
// // //             toast.error("Failed to update profile.");
// // //             throw err;
// // //         }
// // //     };

// // //     // ─────────────────────────────────────────────────────────────
// // //     // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
// // //     // ─────────────────────────────────────────────────────────────

// // //     const handleArchiveLearner = async (learner: DashboardLearner) => {
// // //         setLearnerToProcess({ learner, action: 'archive' });
// // //     };

// // //     const handleDiscardDraft = async (learner: DashboardLearner) => {
// // //         setLearnerToProcess({ learner, action: 'discard' });
// // //     };

// // //     const handleRestoreLearner = async (learner: DashboardLearner) => {
// // //         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
// // //         await store.restoreLearner(learner.id);
// // //         toast.success(`${learner.fullName} has been restored.`);
// // //     };

// // //     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
// // //         if (!window.confirm(`Approve ${learnersToApprove.length} enrollments? They will become Active.`)) return;
// // //         await store.approveStagingLearners(learnersToApprove);
// // //         toast.success(`Successfully approved ${learnersToApprove.length} learners.`);
// // //     };

// // //     const handleInviteLearner = (learner: DashboardLearner) => {
// // //         if (!learner.email) {
// // //             setShowNoEmailAlert(true);
// // //             return;
// // //         }
// // //         setLearnerToInvite(learner);
// // //     };

// // //     const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
// // //         const count = learnersToArchive.length;
// // //         if (!window.confirm(`Archive ${count} enrollments? They will be moved to the Archive tab.`)) return;

// // //         try {
// // //             const batch = writeBatch(db);
// // //             learnersToArchive.forEach(l => {
// // //                 const enrolId = l.enrollmentId || l.id;
// // //                 const ref = doc(db, 'enrollments', enrolId);
// // //                 batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
// // //             });
// // //             await batch.commit();
// // //             await store.fetchLearners(true);
// // //             toast.success(`Successfully archived ${count} enrollments.`);
// // //         } catch (e: any) {
// // //             console.error(e);
// // //             toast.error("Failed to archive: " + e.message);
// // //         }
// // //     };

// // //     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
// // //         const count = draftsToDiscard.length;
// // //         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

// // //         const ids = draftsToDiscard.map(l => l.id);
// // //         await store.discardStagingLearners(ids);
// // //         toast.success(`Discarded ${count} drafts.`);
// // //     };

// // //     const executeLearnerAction = async () => {
// // //         if (!learnerToProcess) return;
// // //         const { learner, action } = learnerToProcess;

// // //         try {
// // //             if (action === 'archive') {
// // //                 await store.archiveLearner(learner.id);
// // //                 toast.success(`${learner.fullName} has been archived.`);
// // //             } else if (action === 'discard') {
// // //                 await store.discardStagingLearners([learner.id]);
// // //                 toast.success(`Draft for ${learner.fullName} was discarded.`);
// // //             }
// // //         } catch (err: any) {
// // //             toast.error(`Failed to ${action} learner: ${err.message}`);
// // //         } finally {
// // //             setLearnerToProcess(null);
// // //         }
// // //     };

// // //     const handleLearnerCohortArchive = async (year: string) => {
// // //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
// // //             await store.archiveCohort(year);
// // //             toast.success(`Cohort ${year} has been successfully archived.`);
// // //         }
// // //     };

// // //     // ─────────────────────────────────────────────────────────────
// // //     // RENDER
// // //     // ─────────────────────────────────────────────────────────────

// // //     if (currentNav === 'studio') {
// // //         return <CertificateStudio />;
// // //     }

// // //     return (
// // //         <div className="admin-layout">
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {/* MOBILE HEADER */}
// // //             <div className="admin-mobile-header">
// // //                 <button
// // //                     className="admin-hamburger-btn"
// // //                     onClick={() => setIsMobileMenuOpen(true)}
// // //                 >
// // //                     <Menu size={24} />
// // //                 </button>
// // //                 <div className="admin-mobile-title">Admin Portal</div>
// // //             </div>

// // //             {/* MOBILE OVERLAY */}
// // //             {isMobileMenuOpen && (
// // //                 <div
// // //                     className="admin-sidebar-overlay"
// // //                     onClick={() => setIsMobileMenuOpen(false)}
// // //                 />
// // //             )}

// // //             {/* SIDEBAR WRAPPER */}
// // //             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
// // //                 <button
// // //                     className="admin-close-btn"
// // //                     onClick={() => setIsMobileMenuOpen(false)}
// // //                 >
// // //                     <X size={24} />
// // //                 </button>
// // //                 <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />
// // //             </div>

// // //             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

// // //                 <header className="dashboard-header">
// // //                     <div className="header-title">
// // //                         <h1>
// // //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// // //                             {currentNav === 'directory' && 'Master Learner Directory'}
// // //                             {currentNav === 'learners' && 'Course Enrollments'}
// // //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// // //                             {currentNav === 'assessments' && 'Assessment Management'}
// // //                             {currentNav === 'staff' && 'Staff & Mentors'}
// // //                             {currentNav === 'cohorts' && 'Cohort Management'}
// // //                             {currentNav === 'workplaces' && 'Workplace Management'}
// // //                             {currentNav === 'profile' && 'My Administrator Profile'}
// // //                             {currentNav === 'access' && 'Platform Access Control'}
// // //                             {currentNav === 'settings' && 'Platform Settings'}
// // //                         </h1>
// // //                         <p>
// // //                             {currentNav === 'dashboard' && 'Welcome to the administration portal'}
// // //                             {currentNav === 'directory' && 'View and manage unique learner profiles across the system'}
// // //                             {currentNav === 'learners' && 'Manage learner enrollments, staging, and statements of results'}
// // //                             {currentNav === 'qualifications' && 'Create and manage curriculum blueprints and unit standards'}
// // //                             {currentNav === 'assessments' && 'Create, distribute, and manage curriculum assessments and tasks'}
// // //                             {currentNav === 'staff' && 'Manage facilitators, assessors, moderators, and support staff'}
// // //                             {currentNav === 'cohorts' && 'Organize learners into training classes and assign educators'}
// // //                             {currentNav === 'workplaces' && 'Manage employer partners and workplace mentor allocations'}
// // //                             {currentNav === 'profile' && 'Manage your institutional compiler and contact details'}
// // //                             {currentNav === 'access' && 'Manage Super Administrator access and permissions'}
// // //                             {currentNav === 'settings' && 'Configure global system preferences and application settings'}
// // //                         </p>
// // //                     </div>
// // //                 </header>

// // //                 <div className="admin-content">
// // //                     {/* VIEWS */}
// // //                     {currentNav === 'dashboard' && <DashboardOverview />}

// // //                     {currentNav === 'directory' && <LearnerDirectoryView learners={store.learners} />}

// // //                     {currentNav === 'learners' && (
// // //                         <LearnersView
// // //                             learners={store.learners}
// // //                             stagingLearners={store.stagingLearners}
// // //                             cohorts={store.cohorts}
// // //                             onAdd={() => setShowAddLearnerModal(true)}
// // //                             onUpload={() => setShowImportLearnerModal(true)}
// // //                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}
// // //                             onArchive={handleArchiveLearner}
// // //                             onRestore={handleRestoreLearner}
// // //                             onDiscard={handleDiscardDraft}
// // //                             onInvite={handleInviteLearner}
// // //                             onBulkApprove={handleBulkApprove}
// // //                             onBulkArchive={handleBulkArchive}
// // //                             onBulkDiscard={handleBulkDiscard}
// // //                             onBulkRestore={async (list) => {
// // //                                 for (const l of list) await store.restoreLearner(l.id);
// // //                                 store.fetchLearners(true);
// // //                                 toast.success(`Restored ${list.length} learners.`);
// // //                             }}
// // //                             onArchiveCohort={handleLearnerCohortArchive}
// // //                             onDeletePermanent={async (learner, audit) => {
// // //                                 if (store.deleteLearnerPermanent) {
// // //                                     await store.deleteLearnerPermanent(learner.id, audit);
// // //                                     toast.success(`${learner.fullName} was permanently deleted.`);
// // //                                 } else {
// // //                                     toast.error("Delete function not found.");
// // //                                 }
// // //                             }}
// // //                         />
// // //                     )}

// // //                     {currentNav === 'assessments' && <AssessmentManager />}

// // //                     {currentNav === 'staff' && (
// // //                         <StaffView
// // //                             staff={store.staff}
// // //                             onAdd={() => {
// // //                                 setEditingStaff(null);
// // //                                 setShowStaffModal(true);
// // //                             }}
// // //                             onEdit={(s) => {
// // //                                 setEditingStaff(s);
// // //                                 setShowStaffModal(true);
// // //                             }}
// // //                             onDelete={(s) => setStaffToDelete(s)}
// // //                         />
// // //                     )}

// // //                     {currentNav === 'workplaces' && <WorkplacesManager />}

// // //                     {currentNav === 'cohorts' && (
// // //                         <CohortsView
// // //                             cohorts={store.cohorts}
// // //                             staff={store.staff}
// // //                             onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
// // //                             onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
// // //                             onArchive={(c) => setCohortToDelete(c)}
// // //                         />
// // //                     )}

// // //                     {currentNav === 'qualifications' && (
// // //                         <QualificationsView
// // //                             programmes={store.programmes}
// // //                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
// // //                             onUpload={() => { }}
// // //                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
// // //                             onArchive={(p) => setProgToArchive(p)}
// // //                         />
// // //                     )}

// // //                     {/* Profile Tab Integration */}
// // //                     {currentNav === 'profile' && (
// // //                         <AdminProfileView
// // //                             profile={user}
// // //                             user={user}
// // //                             onUpdate={handleUpdateAdminProfile}
// // //                         />
// // //                     )}

// // //                     {/* Settings Tab Integration */}
// // //                     {currentNav === 'settings' && <SettingsPage />}

// // //                     {currentNav === 'access' && (
// // //                         (user as any)?.isSuperAdmin ? (
// // //                             <AccessManager />
// // //                         ) : (
// // //                             <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
// // //                                 <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
// // //                                 <h2>Unauthorized Access</h2>
// // //                                 <p>You do not have Super Admin privileges to view this module.</p>
// // //                             </div>
// // //                         )
// // //                     )}
// // //                 </div>
// // //             </main>

// // //             {/* MODALS */}
// // //             {showAddLearnerModal && (
// // //                 <LearnerFormModal
// // //                     learner={selectedLearner || undefined}
// // //                     title={selectedLearner ? 'Edit Enrollment' : 'Add New Enrollment'}
// // //                     programmes={store.programmes}
// // //                     cohorts={store.cohorts}
// // //                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
// // //                     onSave={async (l) => {
// // //                         try {
// // //                             if (selectedLearner) {
// // //                                 await store.updateLearner(selectedLearner.id, l);
// // //                                 toast.success("Learner updated successfully.");
// // //                             } else {
// // //                                 await store.addLearner(l as any);
// // //                                 toast.success("Learner added successfully.");
// // //                             }
// // //                             setShowAddLearnerModal(false);
// // //                         } catch (err: any) {
// // //                             toast.error(`Failed to save learner: ${err.message}`);
// // //                         }
// // //                     }}
// // //                 />
// // //             )}

// // //             {showImportLearnerModal && (
// // //                 <LearnerImportModal
// // //                     cohortId=""
// // //                     onClose={() => setShowImportLearnerModal(false)}
// // //                     onSuccess={() => {
// // //                         setShowImportLearnerModal(false);
// // //                         store.fetchStagingLearners();
// // //                         store.fetchLearners(true);
// // //                         toast.success("Import successful. Records added to Staging Area.");
// // //                     }}
// // //                 />
// // //             )}

// // //             {learnerToProcess && (
// // //                 <DeleteConfirmModal
// // //                     itemName={learnerToProcess.learner.fullName}
// // //                     actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
// // //                     onConfirm={executeLearnerAction}
// // //                     onCancel={() => setLearnerToProcess(null)}
// // //                 />
// // //             )}

// // //             {/* NEW INVITE MODALS */}
// // //             {showNoEmailAlert && (
// // //                 <StatusModal
// // //                     type="warning"
// // //                     title="Missing Email Address"
// // //                     message="This learner does not have an email address on file. Please edit their profile to add an email before sending an invite."
// // //                     confirmText="Okay"
// // //                     onClose={() => setShowNoEmailAlert(false)}
// // //                 />
// // //             )}

// // //             {learnerToInvite && (
// // //                 <StatusModal
// // //                     type="info"
// // //                     title={`${learnerToInvite.authStatus === 'active' ? 'Resend' : 'Send'} Platform Invite`}
// // //                     message={`Are you sure you want to send a platform login invitation to ${learnerToInvite.email}?`}
// // //                     confirmText={isInviting ? "Sending..." : "Send Invite"}
// // //                     onClose={async () => {
// // //                         setIsInviting(true);
// // //                         try {
// // //                             await store.inviteLearner(learnerToInvite);
// // //                             toast.success(`Invite successfully sent to ${learnerToInvite.email}`);
// // //                             setLearnerToInvite(null);
// // //                         } catch (err: any) {
// // //                             toast.error(err.message || "Failed to send invite.");
// // //                         } finally {
// // //                             setIsInviting(false);
// // //                         }
// // //                     }}
// // //                     onCancel={() => {
// // //                         if (!isInviting) setLearnerToInvite(null);
// // //                     }}
// // //                 />
// // //             )}

// // //             {/* StaffFormModal to handle both Add and Edit states perfectly */}
// // //             {showStaffModal && (
// // //                 <StaffFormModal
// // //                     staff={editingStaff || undefined}
// // //                     onClose={() => {
// // //                         setShowStaffModal(false);
// // //                         setEditingStaff(null);
// // //                     }}
// // //                     onSave={async (s) => {
// // //                         try {
// // //                             if (editingStaff) {
// // //                                 if (store.updateStaff) {
// // //                                     await store.updateStaff(editingStaff.id, s);
// // //                                 } else {
// // //                                     // Fallback to raw update if updateStaff isn't in store
// // //                                     await updateDoc(doc(db, 'users', editingStaff.id), s as any);
// // //                                     await store.fetchStaff();
// // //                                 }
// // //                                 toast.success("Staff member updated.");
// // //                             } else {
// // //                                 await store.addStaff(s);
// // //                                 toast.success("New staff member created.");
// // //                             }
// // //                             setShowStaffModal(false);
// // //                             setEditingStaff(null);
// // //                         } catch (err: any) {
// // //                             toast.error(`Failed to save staff: ${err.message}`);
// // //                         }
// // //                     }}
// // //                 />
// // //             )}

// // //             {staffToDelete && (
// // //                 <StatusModal
// // //                     type="error"
// // //                     title="Confirm Deletion"
// // //                     message={`Are you sure you want to permanently delete <strong>${staffToDelete.fullName}</strong>?`}
// // //                     confirmText="Delete Permanently"
// // //                     onClose={async () => {
// // //                         try {
// // //                             await store.deleteStaff(staffToDelete.id);
// // //                             toast.success(`${staffToDelete.fullName} deleted permanently.`);
// // //                         } catch (err: any) {
// // //                             toast.error(`Delete failed: ${err.message}`);
// // //                         } finally {
// // //                             setStaffToDelete(null);
// // //                         }
// // //                     }}
// // //                     onCancel={() => setStaffToDelete(null)}
// // //                 />
// // //             )}

// // //             {showCohortModal && (
// // //                 <CohortFormModal
// // //                     cohort={selectedCohort || undefined}
// // //                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
// // //                     onSave={async (c, reasons) => {
// // //                         try {
// // //                             if (selectedCohort) {
// // //                                 await store.updateCohort(selectedCohort.id, c, reasons);
// // //                                 toast.success("Cohort updated successfully.");
// // //                             } else {
// // //                                 await store.addCohort({ ...c, isArchived: false, staffHistory: [] });
// // //                                 toast.success("Cohort created successfully.");
// // //                             }
// // //                             setShowCohortModal(false);
// // //                         } catch (err: any) {
// // //                             toast.error(`Error saving cohort: ${err.message}`);
// // //                         }
// // //                     }}
// // //                 />
// // //             )}

// // //             {cohortToDelete && (
// // //                 <DeleteConfirmModal
// // //                     itemName={cohortToDelete.name}
// // //                     actionType="Delete"
// // //                     onConfirm={async () => {
// // //                         try {
// // //                             await store.deleteCohort(cohortToDelete.id);
// // //                             toast.success(`${cohortToDelete.name} deleted.`);
// // //                         } catch (err: any) {
// // //                             toast.error(`Failed to delete cohort: ${err.message}`);
// // //                         } finally {
// // //                             setCohortToDelete(null);
// // //                         }
// // //                     }}
// // //                     onCancel={() => setCohortToDelete(null)}
// // //                 />
// // //             )}

// // //             {showProgModal && (
// // //                 <ProgrammeFormModal
// // //                     programme={selectedProg}
// // //                     existingProgrammes={store.programmes}
// // //                     title={selectedProg ? 'Edit Template' : 'Create Template'}
// // //                     onClose={() => { setShowProgModal(false); setSelectedProg(null); }}
// // //                     onSave={async (p) => {
// // //                         try {
// // //                             if (selectedProg) {
// // //                                 await store.updateProgramme(selectedProg.id, p);
// // //                                 toast.success("Template updated.");
// // //                             } else {
// // //                                 await store.addProgramme(p as any);
// // //                                 toast.success("New template created.");
// // //                             }
// // //                             setShowProgModal(false);
// // //                         } catch (err: any) {
// // //                             toast.error(`Failed to save template: ${err.message}`);
// // //                         }
// // //                     }}
// // //                 />
// // //             )}

// // //             {progToArchive && (
// // //                 <DeleteConfirmModal
// // //                     itemName={progToArchive.name}
// // //                     actionType="Archive"
// // //                     onConfirm={async () => {
// // //                         try {
// // //                             await store.archiveProgramme(progToArchive.id);
// // //                             toast.success(`${progToArchive.name} archived.`);
// // //                         } catch (err: any) {
// // //                             toast.error(`Archive failed: ${err.message}`);
// // //                         } finally {
// // //                             setProgToArchive(null);
// // //                         }
// // //                     }}
// // //                     onCancel={() => setProgToArchive(null)}
// // //                 />
// // //             )}

// // //         </div>
// // //     );
// // // };

// // // export default AdminDashboard;

