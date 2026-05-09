// src/pages/AdminDashboard/AdminDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, writeBatch, updateDoc, collection } from 'firebase/firestore';
import { Menu, X, ShieldAlert } from 'lucide-react';
import { useStore, type StaffMember } from '../../store/useStore';
import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// --- CORE DASHBOARD COMPONENTS ---
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';
import { AdminProfileView } from './AdminProfileView/AdminProfileView';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { AccessManager } from './AccessManager/AccessManager';

// --- ENTITY MANAGEMENT VIEWS ---
import { StaffView } from '../../components/views/StaffView/StaffView';
import { CohortsView } from '../../components/views/CohortsView/CohortsView';
import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
import { LearnersView } from '../../components/views/LearnersView/LearnersView';
import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';
import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
import { AssessmentManager } from '../FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { CertificateStudio } from './CertificateStudio/CertificateStudio';

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

// --- NEW APP MODULES ---
import { AttendanceHistoryList } from '../FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList';

import './AdminDashboard.css';
import { EcosystemDashboard } from '../../components/admin/EcosystemDashboard/EcosystemDashboard';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();
    const { user, setUser } = store;
    const toast = useToast();

    const [currentNav, setCurrentNav] = useState<
        'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' |
        'workplaces' | 'studio' | 'dashboard' | 'profile' | 'access' |
        'assessments' | 'settings' | 'attendance' | 'ecosystem'
    >((location.state as any)?.activeTab || 'dashboard');

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
                            {currentNav === 'ecosystem' && 'Ecosystem & Event Check-ins'}
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
                            {currentNav === 'ecosystem' && 'Manage public events, capacity gates, and external guest CRM ledger.'}
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
                    {currentNav === 'ecosystem' && <EcosystemDashboard />}

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