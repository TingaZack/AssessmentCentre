// src/pages/AdminDashboard/AdminDashboard.tsx


import React, { useEffect, useState } from 'react';
import { Users, AlertCircle, Layers, UserCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

// Store
import { useStore, type StaffMember } from '../../store/useStore';
import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// Components
import { StatCard } from '../../components/common/StatCard';
import { Sidebar } from '../../components/dashboard/Sidebar';

// Views
import { StaffView } from '../../components/views/StaffView/StaffView';
import { CohortsView } from '../../components/views/CohortsView/CohortsView';
import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
import { LearnersView } from '../../components/views/LearnersView/LearnersView';

// Modals
import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
import { StaffFormModal } from '../../components/admin/StaffFormModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

import './AdminDashboard.css';
import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    // ----- Navigation State -----
    // 🚀 ADDED 'directory' to the allowed navigation states
    const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    // ----- Modal States -----
    const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
    const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
    const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

    // NOTE: We keep 'learnerToDelete' state name for compatibility with the generic DeleteConfirmModal,
    // but for active learners, this will trigger an Archive action.
    const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

    const [showProgModal, setShowProgModal] = useState(false);
    const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
    const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

    const [showStaffModal, setShowStaffModal] = useState(false);
    const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

    const [showCohortModal, setShowCohortModal] = useState(false);
    const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
    const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

    // ----- Load Data -----
    useEffect(() => {
        // Dashboard Overview
        if (currentNav === 'dashboard') {
            store.fetchLearners();
            store.fetchStagingLearners();
            store.fetchCohorts();
            store.fetchStaff();
        }

        // 🚀 Directory Tab: Load humans
        if (currentNav === 'directory') {
            store.fetchLearners();
        }

        // Learners Tab (Now Enrollments): Load Live AND Staging
        if (currentNav === 'learners') {
            store.fetchLearners(true);    // Force refresh live data
            store.fetchStagingLearners(); // Fetch staging data
            store.fetchCohorts();         // Fetch cohorts so the modal dropdown is populated!
        }

        // Other Tabs
        if (currentNav === 'qualifications') store.fetchProgrammes();
        if (currentNav === 'staff') store.fetchStaff();
        if (currentNav === 'cohorts') {
            store.fetchCohorts();
            store.fetchProgrammes();
            store.fetchStaff();
            store.fetchLearners(); // Needed to assign learners to cohorts
        }
    }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
    // ─────────────────────────────────────────────────────────────

    // 1. SINGLE ARCHIVE (Active -> Archived)
    const handleArchiveLearner = async (learner: DashboardLearner) => {
        setLearnerToProcess({ learner, action: 'archive' });
    };

    // 2. SINGLE DISCARD (Staging -> Delete)
    const handleDiscardDraft = async (learner: DashboardLearner) => {
        setLearnerToProcess({ learner, action: 'discard' });
    };

    // 3. SINGLE RESTORE (Archived -> Active)
    const handleRestoreLearner = async (learner: DashboardLearner) => {
        if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
        await store.restoreLearner(learner.id);
    };

    // 4. BULK APPROVE (Staging -> Active)
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

    // 5. BULK ARCHIVE (Active -> Archived)
    const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
        const count = learnersToArchive.length;
        if (!window.confirm(`Archive ${count} enrollments? They will be moved to the Archive tab.`)) return;

        try {
            const batch = writeBatch(db);
            learnersToArchive.forEach(l => {
                // Using enrollmentId for the relational mapping, fallback to id
                const enrolId = l.enrollmentId || l.id;
                const ref = doc(db, 'enrollments', enrolId);
                // Fallback for flat structure if needed would be handled inside the store normally, 
                // but direct DB calls in components should be migrated fully to the store.
                batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
            });
            await batch.commit();
            await store.fetchLearners(true); // Refresh UI
            alert(`Successfully archived ${count} enrollments.`);
        } catch (e: any) {
            console.error(e);
            alert("Failed to archive: " + e.message);
        }
    };

    // 6. BULK DISCARD (Staging -> Deleted)
    const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
        const count = draftsToDiscard.length;
        if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

        const ids = draftsToDiscard.map(l => l.id);
        await store.discardStagingLearners(ids);
    };

    // 7. EXECUTE MODAL ACTION
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

    return (
        <div className="admin-layout" style={{ width: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />

            <main className="main-wrapper" style={{ width: '100%' }}>
                <header className="dashboard-header">
                    <div className="header-title">
                        <h1>
                            {currentNav === 'dashboard' && 'Dashboard Overview'}
                            {currentNav === 'directory' && 'Master Learner Directory'} {/* 🚀 NEW TITLE */}
                            {currentNav === 'learners' && 'Course Enrollments'} {/* 🚀 UPDATED TITLE */}
                            {currentNav === 'qualifications' && 'Qualification Templates'}
                            {currentNav === 'staff' && 'Staff Management'}
                            {currentNav === 'cohorts' && 'Cohort Management'}
                        </h1>
                        <p>
                            {currentNav === 'directory'
                                ? 'View and manage unique learner profiles across the system'
                                : 'Manage Statements of Results and Assessments'}
                        </p>
                    </div>
                </header>

                <div className="admin-content">
                    {/* DASHBOARD OVERVIEW */}
                    {currentNav === 'dashboard' && (
                        <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
                            <StatCard icon={<Users size={24} />} title="Total Enrollments" value={store.learners.length} color="blue" />
                            <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
                            <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
                            <StatCard icon={<AlertCircle size={24} />} title="Staging / Drafts" value={store.stagingLearners.length} color="orange" />
                        </div>
                    )}

                    {/* 🚀 LEARNER DIRECTORY VIEW (HUMANS) 🚀 */}
                    {currentNav === 'directory' && (
                        <LearnerDirectoryView learners={store.learners} />
                    )}

                    {/* LEARNERS VIEW (NOW ENROLLMENTS) */}
                    {currentNav === 'learners' && (
                        <LearnersView
                            learners={store.learners}              // Live Data
                            stagingLearners={store.stagingLearners}// Staging Data
                            cohorts={store.cohorts}                // 🚀 PASSING COHORTS PROP

                            onAdd={() => setShowAddLearnerModal(true)}
                            onUpload={() => setShowImportLearnerModal(true)}
                            onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}

                            // SAFE ACTIONS
                            onArchive={handleArchiveLearner}       // Soft Delete
                            onRestore={handleRestoreLearner}       // Restore
                            onDiscard={handleDiscardDraft}         // Discard Draft

                            onInvite={handleInviteLearner}

                            // BULK ACTIONS
                            onBulkApprove={handleBulkApprove}
                            onBulkArchive={handleBulkArchive}
                            onBulkDiscard={handleBulkDiscard}
                            onBulkRestore={async (list) => {
                                // Bulk restore loop via store actions
                                for (const l of list) {
                                    await store.restoreLearner(l.id);
                                }
                                store.fetchLearners(true);
                            }}

                            onArchiveCohort={handleLearnerCohortArchive}
                        />
                    )}

                    {/* STAFF VIEW */}
                    {currentNav === 'staff' && (
                        <StaffView
                            staff={store.staff}
                            onAdd={() => setShowStaffModal(true)}
                            onDelete={(s) => setStaffToDelete(s)}
                        />
                    )}

                    {/* COHORTS VIEW */}
                    {currentNav === 'cohorts' && (
                        <CohortsView
                            cohorts={store.cohorts}
                            staff={store.staff}
                            onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
                            onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
                            onArchive={(c) => setCohortToDelete(c)}
                        />
                    )}

                    {/* QUALIFICATIONS VIEW */}
                    {currentNav === 'qualifications' && (
                        <QualificationsView
                            programmes={store.programmes}
                            onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
                            onUpload={() => { }}
                            onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
                            onArchive={(p) => setProgToArchive(p)}
                        />
                    )}
                </div>
            </main>

            {/* ─────────────────────────────────────────────────────────────
                MODALS
               ───────────────────────────────────────────────────────────── */}

            {/* 1. LEARNER MODALS */}
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

            {/* IMPORT MODAL */}
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

            {/* SAFE CONFIRM MODAL FOR ARCHIVE/DISCARD */}
            {learnerToProcess && (
                <DeleteConfirmModal
                    itemName={learnerToProcess.learner.fullName}
                    // Dynamically change label based on action
                    actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
                    onConfirm={executeLearnerAction}
                    onCancel={() => setLearnerToProcess(null)}
                />
            )}

            {/* 2. STAFF MODALS */}
            {showStaffModal && (
                <StaffFormModal
                    onClose={() => setShowStaffModal(false)}
                    onSave={async (s) => { await store.addStaff(s); setShowStaffModal(false); }}
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

            {/* 3. COHORT MODALS */}
            {showCohortModal && (
                <CohortFormModal
                    cohort={selectedCohort || undefined}
                    onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
                    onSave={async (c, reasons) => {
                        if (selectedCohort) {
                            await store.updateCohort(selectedCohort.id, c, reasons);
                        } else {
                            await store.addCohort({
                                ...c,
                                isArchived: false,
                                staffHistory: []
                            });
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

            {/* 4. PROGRAMME MODALS */}
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



// import React, { useEffect, useState } from 'react';
// import { Users, AlertCircle, Layers, UserCheck } from 'lucide-react';
// import { useLocation, useNavigate } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import { auth, db } from '../../lib/firebase';
// import { doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

// // Store
// import { useStore, type StaffMember } from '../../store/useStore';
// import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// // Components
// import { StatCard } from '../../components/common/StatCard';
// import { Sidebar } from '../../components/dashboard/Sidebar';

// // Views
// import { StaffView } from '../../components/views/StaffView/StaffView';
// import { CohortsView } from '../../components/views/CohortsView/CohortsView';
// import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
// import { LearnersView } from '../../components/views/LearnersView/LearnersView';

// // Modals
// import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
// import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
// import { StaffFormModal } from '../../components/admin/StaffFormModal';
// import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
// // ✅ ADDED IMPORT: CohortFormModal
// // import { CohortFormModal } from '../../components/admin/CohortFormModal';

// import './AdminDashboard.css';
// import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

// const AdminDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();

//     // ----- Navigation State -----
//     const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );

//     // ----- Modal States -----
//     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
//     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
//     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

//     // NOTE: We keep 'learnerToDelete' state name for compatibility with the generic DeleteConfirmModal,
//     // but for active learners, this will trigger an Archive action.
//     const [learnerToProcess, setLearnerToProcess] = useState<{ learner: DashboardLearner, action: 'archive' | 'discard' | 'delete' } | null>(null);

//     const [showProgModal, setShowProgModal] = useState(false);
//     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
//     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

//     const [showStaffModal, setShowStaffModal] = useState(false);
//     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

//     const [showCohortModal, setShowCohortModal] = useState(false);
//     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
//     const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

//     // ----- Load Data -----
//     useEffect(() => {
//         // Dashboard Overview
//         if (currentNav === 'dashboard') {
//             store.fetchLearners();
//             store.fetchStagingLearners();
//             store.fetchCohorts();
//             store.fetchStaff();
//         }

//         // Learners Tab: Load Live AND Staging
//         if (currentNav === 'learners') {
//             store.fetchLearners(true);    // Force refresh live data
//             store.fetchStagingLearners(); // Fetch staging data
//             store.fetchCohorts();         // ✅ Fetch cohorts so the modal dropdown is populated!
//         }

//         // Other Tabs
//         if (currentNav === 'qualifications') store.fetchProgrammes();
//         if (currentNav === 'staff') store.fetchStaff();
//         if (currentNav === 'cohorts') {
//             store.fetchCohorts();
//             store.fetchProgrammes();
//             store.fetchStaff();
//             store.fetchLearners(); // Needed to assign learners to cohorts
//         }
//     }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts]);

//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             navigate('/login');
//         } catch (error) {
//             console.error("Logout failed", error);
//         }
//     };

//     // ─────────────────────────────────────────────────────────────
//     // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
//     // ─────────────────────────────────────────────────────────────

//     // 1. SINGLE ARCHIVE (Active -> Archived)
//     const handleArchiveLearner = async (learner: DashboardLearner) => {
//         setLearnerToProcess({ learner, action: 'archive' });
//     };

//     // 2. SINGLE DISCARD (Staging -> Delete)
//     const handleDiscardDraft = async (learner: DashboardLearner) => {
//         setLearnerToProcess({ learner, action: 'discard' });
//     };

//     // 3. SINGLE RESTORE (Archived -> Active)
//     const handleRestoreLearner = async (learner: DashboardLearner) => {
//         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
//         await store.restoreLearner(learner.id);
//     };

//     // 4. BULK APPROVE (Staging -> Active)
//     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
//         if (!window.confirm(`Approve ${learnersToApprove.length} learners? They will become Active.`)) return;
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

//     // 5. BULK ARCHIVE (Active -> Archived)
//     const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
//         const count = learnersToArchive.length;
//         if (!window.confirm(`Archive ${count} learners? They will be moved to the Archive tab.`)) return;

//         try {
//             const batch = writeBatch(db);
//             learnersToArchive.forEach(l => {
//                 const ref = doc(db, 'learners', l.id);
//                 batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
//             });
//             await batch.commit();
//             await store.fetchLearners(true); // Refresh UI
//             alert(`Successfully archived ${count} learners.`);
//         } catch (e: any) {
//             console.error(e);
//             alert("Failed to archive: " + e.message);
//         }
//     };

//     // 6. BULK DISCARD (Staging -> Deleted)
//     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
//         const count = draftsToDiscard.length;
//         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

//         const ids = draftsToDiscard.map(l => l.id);
//         await store.discardStagingLearners(ids);
//     };

//     // 7. EXECUTE MODAL ACTION
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

//     return (
//         <div className="admin-layout" style={{ width: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
//             <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />

//             <main className="main-wrapper" style={{ width: '100%' }}>
//                 <header className="dashboard-header">
//                     <div className="header-title">
//                         <h1>
//                             {currentNav === 'dashboard' && 'Dashboard Overview'}
//                             {currentNav === 'learners' && 'Learner Results'}
//                             {currentNav === 'qualifications' && 'Qualification Templates'}
//                             {currentNav === 'staff' && 'Staff Management'}
//                             {currentNav === 'cohorts' && 'Cohort Management'}
//                         </h1>
//                         <p>Manage Statements of Results and Assessments</p>
//                     </div>
//                 </header>

//                 <div className="admin-content">
//                     {/* DASHBOARD OVERVIEW */}
//                     {currentNav === 'dashboard' && (
//                         <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
//                             <StatCard icon={<Users size={24} />} title="Total Learners" value={store.learners.length} color="blue" />
//                             <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
//                             <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
//                             <StatCard icon={<AlertCircle size={24} />} title="Staging / Drafts" value={store.stagingLearners.length} color="orange" />
//                         </div>
//                     )}

//                     {/* LEARNERS VIEW */}
//                     {currentNav === 'learners' && (
//                         <LearnersView
//                             learners={store.learners}              // Live Data
//                             stagingLearners={store.stagingLearners}// Staging Data

//                             onAdd={() => setShowAddLearnerModal(true)}
//                             onUpload={() => setShowImportLearnerModal(true)}
//                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}

//                             // SAFE ACTIONS
//                             onArchive={handleArchiveLearner}       // Soft Delete
//                             onRestore={handleRestoreLearner}       // Restore
//                             onDiscard={handleDiscardDraft}         // Discard Draft

//                             onInvite={handleInviteLearner}

//                             // BULK ACTIONS
//                             onBulkApprove={handleBulkApprove}
//                             onBulkArchive={handleBulkArchive}
//                             onBulkDiscard={handleBulkDiscard}
//                             onBulkRestore={async (list) => {
//                                 // Simple bulk restore loop
//                                 const batch = writeBatch(db);
//                                 list.forEach(l => batch.update(doc(db, 'learners', l.id), { isArchived: false }));
//                                 await batch.commit();
//                                 store.fetchLearners(true);
//                             }}

//                             onArchiveCohort={handleLearnerCohortArchive}
//                         />
//                     )}

//                     {/* STAFF VIEW */}
//                     {currentNav === 'staff' && (
//                         <StaffView
//                             staff={store.staff}
//                             onAdd={() => setShowStaffModal(true)}
//                             onDelete={(s) => setStaffToDelete(s)}
//                         />
//                     )}

//                     {/* COHORTS VIEW */}
//                     {currentNav === 'cohorts' && (
//                         <CohortsView
//                             cohorts={store.cohorts}
//                             staff={store.staff}
//                             onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
//                             onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
//                             onArchive={(c) => setCohortToDelete(c)}
//                         />
//                     )}

//                     {/* QUALIFICATIONS VIEW */}
//                     {currentNav === 'qualifications' && (
//                         <QualificationsView
//                             programmes={store.programmes}
//                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
//                             onUpload={() => { }}
//                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
//                             onArchive={(p) => setProgToArchive(p)}
//                         />
//                     )}
//                 </div>
//             </main>

//             {/* ─────────────────────────────────────────────────────────────
//                 MODALS
//                ───────────────────────────────────────────────────────────── */}

//             {/* 1. LEARNER MODALS */}
//             {showAddLearnerModal && (
//                 <LearnerFormModal
//                     learner={selectedLearner || undefined}
//                     title={selectedLearner ? 'Edit Learner' : 'Add New Learner'}
//                     programmes={store.programmes}
//                     cohorts={store.cohorts} // ✅ FIX: Passed cohorts here to clear TS error
//                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
//                     onSave={async (l) => {
//                         if (selectedLearner) await store.updateLearner(selectedLearner.id, l);
//                         else await store.addLearner(l as any);
//                         setShowAddLearnerModal(false);
//                     }}
//                 />
//             )}

//             {/* IMPORT MODAL */}
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

//             {/* SAFE CONFIRM MODAL FOR ARCHIVE/DISCARD */}
//             {learnerToProcess && (
//                 <DeleteConfirmModal
//                     itemName={learnerToProcess.learner.fullName}
//                     // Dynamically change label based on action
//                     actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
//                     onConfirm={executeLearnerAction}
//                     onCancel={() => setLearnerToProcess(null)}
//                 />
//             )}

//             {/* 2. STAFF MODALS */}
//             {showStaffModal && (
//                 <StaffFormModal
//                     onClose={() => setShowStaffModal(false)}
//                     onSave={async (s) => { await store.addStaff(s); setShowStaffModal(false); }}
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

//             {/* 3. COHORT MODALS */}
//             {/* 3. COHORT MODALS */}
//             {showCohortModal && (
//                 <CohortFormModal
//                     cohort={selectedCohort || undefined}
//                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
//                     onSave={async (c, reasons) => {
//                         if (selectedCohort) {
//                             await store.updateCohort(selectedCohort.id, c, reasons);
//                         } else {
//                             await store.addCohort({
//                                 ...c,
//                                 isArchived: false,
//                                 staffHistory: []
//                             });
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

//             {/* 4. PROGRAMME MODALS */}
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


// // import React, { useEffect, useState } from 'react';
// // import { Users, AlertCircle, Layers, UserCheck } from 'lucide-react';
// // import { useLocation, useNavigate } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import { auth, db } from '../../lib/firebase';
// // import { doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

// // // Store
// // import { useStore, type StaffMember } from '../../store/useStore';
// // import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// // // Components
// // import { StatCard } from '../../components/common/StatCard';
// // import { Sidebar } from '../../components/dashboard/Sidebar';

// // // Views
// // import { StaffView } from '../../components/views/StaffView/StaffView';
// // import { CohortsView } from '../../components/views/CohortsView/CohortsView';
// // import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';

// // // Modals
// // import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
// // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
// // import { StaffFormModal } from '../../components/admin/StaffFormModal';
// // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// // import { LearnerImportModal } from '../../components/admin/LearnerImportModal';

// // import './AdminDashboard.css';
// // import { LearnersView } from '../../components/views/LearnersView/LearnersView';

// // const AdminDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();

// //     // ----- Navigation State -----
// //     const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );

// //     // ----- Modal States -----
// //     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
// //     const [showImportLearnerModal, setShowImportLearnerModal] = useState(false);
// //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

// //     // NOTE: We keep 'learnerToDelete' state name for compatibility with the generic DeleteConfirmModal,
// //     // but for active learners, this will trigger an Archive action.
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
// //         // Dashboard Overview
// //         if (currentNav === 'dashboard') {
// //             store.fetchLearners();
// //             store.fetchStagingLearners();
// //             store.fetchCohorts();
// //             store.fetchStaff();
// //         }

// //         // Learners Tab: Load Live AND Staging
// //         if (currentNav === 'learners') {
// //             store.fetchLearners(true);    // Force refresh live data
// //             store.fetchStagingLearners(); // Fetch staging data
// //         }

// //         // Other Tabs
// //         if (currentNav === 'qualifications') store.fetchProgrammes();
// //         if (currentNav === 'staff') store.fetchStaff();
// //         if (currentNav === 'cohorts') {
// //             store.fetchCohorts();
// //             store.fetchProgrammes();
// //             store.fetchStaff();
// //         }
// //     }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         } catch (error) {
// //             console.error("Logout failed", error);
// //         }
// //     };

// //     // ─────────────────────────────────────────────────────────────
// //     // LEARNER HANDLERS (SAFE ARCHIVE / RESTORE)
// //     // ─────────────────────────────────────────────────────────────

// //     // 1. SINGLE ARCHIVE (Active -> Archived)
// //     const handleArchiveLearner = async (learner: DashboardLearner) => {
// //         // Instead of deleting immediately, we set state to confirm via modal
// //         setLearnerToProcess({ learner, action: 'archive' });
// //     };

// //     // 2. SINGLE DISCARD (Staging -> Delete)
// //     const handleDiscardDraft = async (learner: DashboardLearner) => {
// //         setLearnerToProcess({ learner, action: 'discard' });
// //     };

// //     // 3. SINGLE RESTORE (Archived -> Active)
// //     const handleRestoreLearner = async (learner: DashboardLearner) => {
// //         if (!window.confirm(`Restore ${learner.fullName} to the active list?`)) return;
// //         await store.restoreLearner(learner.id);
// //     };

// //     // 4. BULK APPROVE (Staging -> Active)
// //     const handleBulkApprove = async (learnersToApprove: DashboardLearner[]) => {
// //         if (!window.confirm(`Approve ${learnersToApprove.length} learners? They will become Active.`)) return;
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

// //     // 5. BULK ARCHIVE (Active -> Archived)
// //     const handleBulkArchive = async (learnersToArchive: DashboardLearner[]) => {
// //         const count = learnersToArchive.length;
// //         if (!window.confirm(`Archive ${count} learners? They will be moved to the Archive tab.`)) return;

// //         try {
// //             const batch = writeBatch(db);
// //             learnersToArchive.forEach(l => {
// //                 const ref = doc(db, 'learners', l.id);
// //                 batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
// //             });
// //             await batch.commit();
// //             await store.fetchLearners(true); // Refresh UI
// //             alert(`Successfully archived ${count} learners.`);
// //         } catch (e: any) {
// //             console.error(e);
// //             alert("Failed to archive: " + e.message);
// //         }
// //     };

// //     // 6. BULK DISCARD (Staging -> Deleted)
// //     const handleBulkDiscard = async (draftsToDiscard: DashboardLearner[]) => {
// //         const count = draftsToDiscard.length;
// //         if (!window.confirm(`Permanently discard ${count} drafts?`)) return;

// //         const ids = draftsToDiscard.map(l => l.id);
// //         await store.discardStagingLearners(ids);
// //     };

// //     // 7. EXECUTE MODAL ACTION
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

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// //             <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />

// //             <main className="main-wrapper" style={{ width: '100%' }}>
// //                 <header className="dashboard-header">
// //                     <div className="header-title">
// //                         <h1>
// //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// //                             {currentNav === 'learners' && 'Learner Results'}
// //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// //                             {currentNav === 'staff' && 'Staff Management'}
// //                             {currentNav === 'cohorts' && 'Cohort Management'}
// //                         </h1>
// //                         <p>Manage Statements of Results and Assessments</p>
// //                     </div>
// //                 </header>

// //                 <div className="admin-content">
// //                     {/* DASHBOARD OVERVIEW */}
// //                     {currentNav === 'dashboard' && (
// //                         <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
// //                             <StatCard icon={<Users size={24} />} title="Total Learners" value={store.learners.length} color="blue" />
// //                             <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
// //                             <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
// //                             <StatCard icon={<AlertCircle size={24} />} title="Staging / Drafts" value={store.stagingLearners.length} color="orange" />
// //                         </div>
// //                     )}

// //                     {/* LEARNERS VIEW */}
// //                     {currentNav === 'learners' && (
// //                         <LearnersView
// //                             learners={store.learners}              // Live Data
// //                             stagingLearners={store.stagingLearners}// Staging Data

// //                             onAdd={() => setShowAddLearnerModal(true)}
// //                             onUpload={() => setShowImportLearnerModal(true)}
// //                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}

// //                             // SAFE ACTIONS
// //                             onArchive={handleArchiveLearner}       // Soft Delete
// //                             onRestore={handleRestoreLearner}       // Restore
// //                             onDiscard={handleDiscardDraft}         // Discard Draft

// //                             onInvite={handleInviteLearner}

// //                             // BULK ACTIONS
// //                             onBulkApprove={handleBulkApprove}
// //                             onBulkArchive={handleBulkArchive}
// //                             onBulkDiscard={handleBulkDiscard}
// //                             onBulkRestore={async (list) => {
// //                                 // Simple bulk restore loop
// //                                 const batch = writeBatch(db);
// //                                 list.forEach(l => batch.update(doc(db, 'learners', l.id), { isArchived: false }));
// //                                 await batch.commit();
// //                                 store.fetchLearners(true);
// //                             }}

// //                             onArchiveCohort={handleLearnerCohortArchive}
// //                         />
// //                     )}

// //                     {/* STAFF VIEW */}
// //                     {currentNav === 'staff' && (
// //                         <StaffView
// //                             staff={store.staff}
// //                             onAdd={() => setShowStaffModal(true)}
// //                             onDelete={(s) => setStaffToDelete(s)}
// //                         />
// //                     )}

// //                     {/* COHORTS VIEW */}
// //                     {currentNav === 'cohorts' && (
// //                         <CohortsView
// //                             cohorts={store.cohorts}
// //                             staff={store.staff}
// //                             onAdd={() => { setSelectedCohort(null); setShowCohortModal(true); }}
// //                             onEdit={(c) => { setSelectedCohort(c); setShowCohortModal(true); }}
// //                             onArchive={(c) => setCohortToDelete(c)}
// //                         />
// //                     )}

// //                     {/* QUALIFICATIONS VIEW */}
// //                     {currentNav === 'qualifications' && (
// //                         <QualificationsView
// //                             programmes={store.programmes}
// //                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
// //                             onUpload={() => { }}
// //                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
// //                             onArchive={(p) => setProgToArchive(p)}
// //                         />
// //                     )}
// //                 </div>
// //             </main>

// //             {/* ─────────────────────────────────────────────────────────────
// //                 MODALS
// //                ───────────────────────────────────────────────────────────── */}

// //             {/* 1. LEARNER MODALS */}
// //             {showAddLearnerModal && (
// //                 <LearnerFormModal
// //                     learner={selectedLearner || undefined}
// //                     title={selectedLearner ? 'Edit Learner' : 'Add New Learner'}
// //                     programmes={store.programmes}
// //                     onClose={() => { setShowAddLearnerModal(false); setSelectedLearner(null); }}
// //                     onSave={async (l) => {
// //                         if (selectedLearner) await store.updateLearner(selectedLearner.id, l);
// //                         else await store.addLearner(l as any);
// //                         setShowAddLearnerModal(false);
// //                     }}
// //                 />
// //             )}

// //             {/* IMPORT MODAL */}
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

// //             {/* SAFE CONFIRM MODAL FOR ARCHIVE/DISCARD */}
// //             {learnerToProcess && (
// //                 <DeleteConfirmModal
// //                     itemName={learnerToProcess.learner.fullName}
// //                     // Dynamically change label based on action
// //                     actionType={learnerToProcess.action === 'archive' ? 'Archive' : 'Discard'}
// //                     onConfirm={executeLearnerAction}
// //                     onCancel={() => setLearnerToProcess(null)}
// //                 />
// //             )}

// //             {/* 2. STAFF MODALS */}
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

// //             {/* 3. COHORT MODALS */}
// //             {showCohortModal && (
// //                 <CohortFormModal
// //                     cohort={selectedCohort || undefined}
// //                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
// //                     onSave={async (c, reasons) => {
// //                         if (selectedCohort) {
// //                             await store.updateCohort(selectedCohort.id, c, reasons);
// //                         } else {
// //                             await store.addCohort(c);
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

// //             {/* 4. PROGRAMME MODALS */}
// //             {showProgModal && (
// //                 <ProgrammeFormModal
// //                     programme={selectedProg}
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


