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
import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
import { StaffFormModal } from '../../components/admin/StaffFormModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
// ✅ ADDED IMPORT: CohortFormModal
// import { CohortFormModal } from '../../components/admin/CohortFormModal';

import './AdminDashboard.css';
import { CohortFormModal } from '../../components/admin/CohortFormModal';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    // ----- Navigation State -----
    const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>(
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

        // Learners Tab: Load Live AND Staging
        if (currentNav === 'learners') {
            store.fetchLearners(true);    // Force refresh live data
            store.fetchStagingLearners(); // Fetch staging data
            store.fetchCohorts();         // ✅ Fetch cohorts so the modal dropdown is populated!
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
        if (!window.confirm(`Approve ${learnersToApprove.length} learners? They will become Active.`)) return;
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
        if (!window.confirm(`Archive ${count} learners? They will be moved to the Archive tab.`)) return;

        try {
            const batch = writeBatch(db);
            learnersToArchive.forEach(l => {
                const ref = doc(db, 'learners', l.id);
                batch.update(ref, { isArchived: true, updatedAt: new Date().toISOString() });
            });
            await batch.commit();
            await store.fetchLearners(true); // Refresh UI
            alert(`Successfully archived ${count} learners.`);
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
                            {currentNav === 'learners' && 'Learner Results'}
                            {currentNav === 'qualifications' && 'Qualification Templates'}
                            {currentNav === 'staff' && 'Staff Management'}
                            {currentNav === 'cohorts' && 'Cohort Management'}
                        </h1>
                        <p>Manage Statements of Results and Assessments</p>
                    </div>
                </header>

                <div className="admin-content">
                    {/* DASHBOARD OVERVIEW */}
                    {currentNav === 'dashboard' && (
                        <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
                            <StatCard icon={<Users size={24} />} title="Total Learners" value={store.learners.length} color="blue" />
                            <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
                            <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
                            <StatCard icon={<AlertCircle size={24} />} title="Staging / Drafts" value={store.stagingLearners.length} color="orange" />
                        </div>
                    )}

                    {/* LEARNERS VIEW */}
                    {currentNav === 'learners' && (
                        <LearnersView
                            learners={store.learners}              // Live Data
                            stagingLearners={store.stagingLearners}// Staging Data

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
                                // Simple bulk restore loop
                                const batch = writeBatch(db);
                                list.forEach(l => batch.update(doc(db, 'learners', l.id), { isArchived: false }));
                                await batch.commit();
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
                    title={selectedLearner ? 'Edit Learner' : 'Add New Learner'}
                    programmes={store.programmes}
                    cohorts={store.cohorts} // ✅ FIX: Passed cohorts here to clear TS error
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

// // Modals
// import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
// import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
// import { StaffFormModal } from '../../components/admin/StaffFormModal';
// import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
// import { LearnerImportModal } from '../../components/admin/LearnerImportModal';

// import './AdminDashboard.css';
// import { LearnersView } from '../../components/views/LearnersView/LearnersView';

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
//         }

//         // Other Tabs
//         if (currentNav === 'qualifications') store.fetchProgrammes();
//         if (currentNav === 'staff') store.fetchStaff();
//         if (currentNav === 'cohorts') {
//             store.fetchCohorts();
//             store.fetchProgrammes();
//             store.fetchStaff();
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
//         // Instead of deleting immediately, we set state to confirm via modal
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
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
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
//             {showCohortModal && (
//                 <CohortFormModal
//                     cohort={selectedCohort || undefined}
//                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
//                     onSave={async (c, reasons) => {
//                         if (selectedCohort) {
//                             await store.updateCohort(selectedCohort.id, c, reasons);
//                         } else {
//                             await store.addCohort(c);
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

// // // Store
// // import { useStore } from '../../store/useStore';
// // import type { StaffMember } from '../../store/useStore';
// // import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// // // // Components
// // // import { StatCard } from '../../components/common/StatCard';
// // // import { Sidebar } from './components/Sidebar';

// // // // Views
// // // import { LearnersView } from './views/LearnersView';
// // // import { StaffView } from './views/StaffView';
// // // import { QualificationsView } from './views/QualificationsView';
// // // import { CohortsView } from './views/CohortsView';

// // // Modals
// // import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
// // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
// // import { StaffFormModal } from '../../components/admin/StaffFormModal';
// // import { CohortFormModal } from '../../components/admin/CohortFormModal';
// // import { UploadModal } from '../../components/common/UploadModal';
// // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';

// // import './AdminDashboard.css';
// // import { StatCard } from '../../components/common/StatCard';
// // import { LearnersView } from '../../components/views/LearnersView';
// // import { StaffView } from '../../components/views/StaffView';
// // import { CohortsView } from '../../components/views/CohortsView';
// // import { QualificationsView } from '../../components/views/QualificationsView';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import { doc, updateDoc, writeBatch } from 'firebase/firestore';

// // const AdminDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );
// //     // ----- Modal States -----
// //     const [showAddLearnerModal, setShowAddLearnerModal] = useState(false);
// //     const [showUploadLearnerModal, setShowUploadLearnerModal] = useState(false);
// //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);
// //     const [learnerToDelete, setLearnerToDelete] = useState<DashboardLearner | null>(null);

// //     const [showProgModal, setShowProgModal] = useState(false);
// //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// //     const [showProgUploadModal, setShowProgUploadModal] = useState(false);
// //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

// //     const [showStaffModal, setShowStaffModal] = useState(false);
// //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// //     const [showCohortModal, setShowCohortModal] = useState(false);
// //     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);

// //     const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

// //     // ----- Store -----
// //     const store = useStore();

// //     // ----- Load data on mount or tab change -----
// //     useEffect(() => {
// //         if (currentNav === 'learners' || currentNav === 'dashboard') store.fetchLearners();
// //         if (currentNav === 'qualifications') store.fetchProgrammes();
// //         if (currentNav === 'staff' || currentNav === 'cohorts') store.fetchStaff();
// //         if (currentNav === 'cohorts') { store.fetchCohorts(); store.fetchProgrammes(); store.fetchLearners(); }
// //     }, [currentNav, store]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         } catch (error) {
// //             console.error("Logout failed", error);
// //         }
// //     };

// //     // ----- Handlers -----
// //     const handleLearnerArchive = async (year: string) => {
// //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${year} cohort?`)) {
// //             await store.archiveCohort(year);
// //         }
// //     };

// //     const handleRestore = async (learner: DashboardLearner) => {
// //         if (!window.confirm(`Are you sure you want to restore ${learner.fullName} to the active list?`)) {
// //             return;
// //         }

// //         try {
// //             // FIX: Changed collection from 'users' to 'learners'
// //             // Ensure this matches your Firestore collection name exactly
// //             const learnerRef = doc(db, 'learners', learner.id);

// //             await updateDoc(learnerRef, {
// //                 isArchived: false,
// //                 updatedAt: new Date().toISOString()
// //             });

// //             // Refresh the global store to update the UI
// //             await store.fetchLearners();

// //             alert(`${learner.fullName} has been successfully restored.`);

// //         } catch (error: any) {
// //             console.error("Error restoring learner:", error);

// //             // If it fails again, it might be in the 'users' collection after all
// //             // You can add a fallback check or simply alert the specific error
// //             if (error.code === 'not-found') {
// //                 alert("Error: Could not find this learner record in the database. It may have been permanently deleted.");
// //             } else {
// //                 alert(`Failed to restore: ${error.message}`);
// //             }
// //         }
// //     };

// //     const handleRestoreCohort = async (cohort: Cohort) => {
// //         if (!window.confirm(`Are you sure you want to restore the "${cohort.name}" cohort?`)) {
// //             return;
// //         }

// //         try {
// //             // Note: Check if your collection is 'cohorts' or 'classes' in your DB
// //             const cohortRef = doc(db, 'cohorts', cohort.id);

// //             await updateDoc(cohortRef, {
// //                 isArchived: false,
// //                 updatedAt: new Date().toISOString()
// //             });

// //             await store.fetchCohorts(); // Refresh UI
// //             alert(`Cohort "${cohort.name}" restored successfully.`);

// //         } catch (error) {
// //             console.error("Error restoring cohort:", error);
// //             alert("Failed to restore cohort.");
// //         }
// //     };

// //     const handleBulkRestore = async (learnersToRestore: DashboardLearner[]) => {
// //         if (!window.confirm(`Are you sure you want to restore ${learnersToRestore.length} learners?`)) return;

// //         try {
// //             const batch = writeBatch(db);
// //             learnersToRestore.forEach(l => {
// //                 const ref = doc(db, 'learners', l.id); // Ensure correct collection
// //                 batch.update(ref, { isArchived: false, updatedAt: new Date().toISOString() });
// //             });

// //             await batch.commit();
// //             await store.fetchLearners();
// //             alert("Batch restore successful.");
// //         } catch (e) {
// //             console.error(e);
// //             alert("Batch restore failed.");
// //         }
// //     };

// //     // ----- Render -----
// //     return (
// //         <div className="admin-layout">
// //             <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />

// //             <main className="main-wrapper">
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
// //                     {currentNav === 'dashboard' && (
// //                         <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
// //                             <StatCard icon={<Users size={24} />} title="Total Learners" value={store.learners.length} color="blue" />
// //                             <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
// //                             <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
// //                             <StatCard icon={<AlertCircle size={24} />} title="Pending Review" value={store.learners.filter(l => l.status === 'in-progress').length} color="orange" />
// //                         </div>
// //                     )}

// //                     {currentNav === 'learners' && (
// //                         <LearnersView
// //                             learners={store.learners}
// //                             onAdd={() => setShowAddLearnerModal(true)}
// //                             onUpload={() => setShowUploadLearnerModal(true)}
// //                             onEdit={(l) => { setSelectedLearner(l); setShowAddLearnerModal(true); }}
// //                             onDelete={(l) => setLearnerToDelete(l)}
// //                             onArchiveCohort={handleLearnerArchive}
// //                             onRestore={handleRestore}
// //                             onBulkRestore={handleBulkRestore}
// //                         />
// //                     )}

// //                     {currentNav === 'staff' && (
// //                         <StaffView
// //                             staff={store.staff}
// //                             onAdd={() => setShowStaffModal(true)}
// //                             onDelete={(s) => setStaffToDelete(s)}
// //                         />
// //                     )}

// //                     {currentNav === 'cohorts' && (
// //                         // <CohortsView
// //                         //     cohorts={store.cohorts}
// //                         //     staff={store.staff}
// //                         //     onAdd={() => setShowCohortModal(true)}
// //                         //     onDelete={(c) => setCohortToDelete(c)}
// //                         // />
// //                         <CohortsView
// //                             cohorts={store.cohorts}
// //                             staff={store.staff}
// //                             onAdd={() => {
// //                                 setSelectedCohort(null); // Clear selection for "Add"
// //                                 setShowCohortModal(true);
// //                             }}
// //                             onEdit={(c) => {
// //                                 setSelectedCohort(c);    // Set selection for "Edit"
// //                                 setShowCohortModal(true);
// //                             }}
// //                             onArchive={(c) => setCohortToDelete(c)}
// //                             onRestore={handleRestoreCohort}
// //                         />
// //                     )}

// //                     {currentNav === 'qualifications' && (
// //                         <QualificationsView
// //                             programmes={store.programmes}
// //                             onAdd={() => { setSelectedProg(null); setShowProgModal(true); }}
// //                             onUpload={() => setShowProgUploadModal(true)}
// //                             onEdit={(p) => { setSelectedProg(p); setShowProgModal(true); }}
// //                             onArchive={(p) => setProgToArchive(p)}
// //                         />
// //                     )}
// //                 </div>
// //             </main>

// //             {/* ----- MODALS ----- */}
// //             {/* Learners */}
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
// //             {showUploadLearnerModal && (
// //                 <UploadModal
// //                     title="Upload Master CSV"
// //                     onClose={() => setShowUploadLearnerModal(false)}
// //                     onUpload={async (f) => { await store.importUnifiedLearners(f); setShowUploadLearnerModal(false); }}
// //                 />
// //             )}
// //             {learnerToDelete && (
// //                 <DeleteConfirmModal
// //                     itemName={learnerToDelete.fullName}
// //                     actionType="Delete"
// //                     onConfirm={() => { store.deleteLearner(learnerToDelete.id); setLearnerToDelete(null); }}
// //                     onCancel={() => setLearnerToDelete(null)}
// //                 />
// //             )}

// //             {/* Staff */}
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

// //             {/* Cohorts */}
// //             {/* {showCohortModal && (
// //                 <CohortFormModal
// //                     onClose={() => setShowCohortModal(false)}
// //                     onSave={async (c) => { await store.addCohort(c); setShowCohortModal(false); }}
// //                 />
// //             )} */}

// //             {showCohortModal && (
// //                 <CohortFormModal
// //                     cohort={selectedCohort || undefined}
// //                     onClose={() => { setShowCohortModal(false); setSelectedCohort(null); }}
// //                     // Update this handler:
// //                     onSave={async (c, reasons) => {
// //                         if (selectedCohort) {
// //                             // Pass the reasons to the update function
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

// //             {/* Programmes */}
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
// //             {showProgUploadModal && (
// //                 <UploadModal
// //                     title="Upload Programmes CSV"
// //                     onClose={() => setShowProgUploadModal(false)}
// //                     onUpload={async (f) => { await store.importProgrammesFromCSV(f); setShowProgUploadModal(false); }}
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


// // // import React, { useEffect, useState, useMemo } from 'react';
// // // import {
// // //     Plus, Upload, Download, Search, Filter, Edit, Trash2,
// // //     Users, BookOpen, Settings, LogOut, AlertCircle,
// // //     Share2, Check, Calendar, Archive, UserCheck, Layers,
// // //     CheckCircle, XCircle, Eye
// // // } from 'lucide-react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { signOut } from 'firebase/auth';
// // // import { auth } from '../../lib/firebase';

// // // // Store
// // // import { useStore } from '../../store/useStore';
// // // import type { StaffMember } from '../../store/useStore';

// // // // Components
// // // import { StatCard } from '../../components/common/StatCard';
// // // import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
// // // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
// // // import { StaffFormModal } from '../../components/admin/StaffFormModal';
// // // import { CohortFormModal } from '../../components/admin/CohortFormModal';
// // // import { UploadModal } from '../../components/common/UploadModal';
// // // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';

// // // // Types
// // // import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// // // // Styles
// // // import './AdminDashboard.css';

// // // const AdminDashboard: React.FC = () => {
// // //     const navigate = useNavigate();

// // //     // ----- Local UI State -----
// // //     const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'cohorts' | 'dashboard'>('dashboard');
// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [filterStatus, setFilterStatus] = useState('all');

// // //     // Filter State
// // //     const [selectedYear, setSelectedYear] = useState<string>('all');
// // //     const [showArchived, setShowArchived] = useState(false);
// // //     const [copiedId, setCopiedId] = useState<string | null>(null);

// // //     // Learner Modal states
// // //     const [showAddModal, setShowAddModal] = useState(false);
// // //     const [showUploadModal, setShowUploadModal] = useState(false);
// // //     const [showEditModal, setShowEditModal] = useState(false);
// // //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

// // //     // Programme Modal states
// // //     const [showProgModal, setShowProgModal] = useState(false);
// // //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// // //     const [showProgUploadModal, setShowProgUploadModal] = useState(false);

// // //     // Staff Modal states
// // //     const [showStaffModal, setShowStaffModal] = useState(false);
// // //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// // //     // Cohort Modal states
// // //     const [showCohortModal, setShowCohortModal] = useState(false);
// // //     const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);

// // //     // Delete states
// // //     const [learnerToDelete, setLearnerToDelete] = useState<DashboardLearner | null>(null);
// // //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

// // //     // ----- Global State from Store -----
// // //     const {
// // //         // Learners
// // //         learners, fetchLearners, addLearner, updateLearner, deleteLearner,
// // //         importUnifiedLearners, archiveCohort,
// // //         // Programmes
// // //         programmes, fetchProgrammes, addProgramme, updateProgramme, archiveProgramme,
// // //         importProgrammesFromCSV,
// // //         // Staff
// // //         staff, fetchStaff, addStaff, deleteStaff,
// // //         // Cohorts
// // //         cohorts, fetchCohorts, addCohort, deleteCohort
// // //     } = useStore();

// // //     // ----- Load data on mount or tab change -----
// // //     useEffect(() => {
// // //         if (currentNav === 'learners' || currentNav === 'dashboard') fetchLearners();
// // //         if (currentNav === 'qualifications') fetchProgrammes();
// // //         if (currentNav === 'staff' || currentNav === 'cohorts') fetchStaff();
// // //         if (currentNav === 'cohorts') { fetchCohorts(); fetchProgrammes(); fetchLearners(); }
// // //     }, [currentNav, fetchLearners, fetchProgrammes, fetchStaff, fetchCohorts]);

// // //     // ----- 1. Compute Available Years -----
// // //     const availableYears = useMemo(() => {
// // //         const years = new Set<string>();
// // //         learners.forEach(l => {
// // //             if (l.trainingStartDate) {
// // //                 years.add(l.trainingStartDate.substring(0, 4));
// // //             }
// // //         });
// // //         return Array.from(years).sort().reverse();
// // //     }, [learners]);

// // //     // ----- 2. Filter Logic -----
// // //     const filteredLearners = learners.filter(learner => {
// // //         const matchesSearch = learner.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //             learner.idNumber.includes(searchTerm) ||
// // //             learner.email.toLowerCase().includes(searchTerm.toLowerCase());
// // //         const matchesStatus = filterStatus === 'all' || learner.status === filterStatus;
// // //         const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// // //         const matchesYear = selectedYear === 'all' || learnerYear === selectedYear;
// // //         const matchesArchived = showArchived ? true : !learner.isArchived;

// // //         return matchesSearch && matchesStatus && matchesYear && matchesArchived;
// // //     });

// // //     const stats = {
// // //         totalLearners: learners.length,
// // //         activeCohorts: cohorts.length,
// // //         activeStaff: staff.length,
// // //         pendingReview: learners.filter(l => l.status === 'in-progress').length,
// // //     };

// // //     // ----- Action Handlers -----

// // //     const handleLogout = async () => {
// // //         try {
// // //             await signOut(auth);
// // //             navigate('/login');
// // //         } catch (error) {
// // //             console.error("Logout failed", error);
// // //         }
// // //     };

// // //     const handleViewSOR = (learner: DashboardLearner) => {
// // //         navigate(`/sor/${learner.id}`);
// // //     };

// // //     const handleCopyLink = (learnerIdNumber: string) => {
// // //         const link = `${window.location.origin}/portal?id=${learnerIdNumber}`;
// // //         navigator.clipboard.writeText(link).then(() => {
// // //             setCopiedId(learnerIdNumber);
// // //             setTimeout(() => setCopiedId(null), 2000);
// // //         });
// // //     };

// // //     const handleArchiveCohort = async () => {
// // //         if (selectedYear === 'all') {
// // //             alert("Please select a specific year to archive.");
// // //             return;
// // //         }
// // //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${selectedYear} cohort?`)) {
// // //             await archiveCohort(selectedYear);
// // //         }
// // //     };

// // //     // CRUD Handlers
// // //     const handleAddLearner = async (newLearner: DashboardLearner) => {
// // //         const { id, ...learnerData } = newLearner;
// // //         await addLearner(learnerData);
// // //         setShowAddModal(false);
// // //     };

// // //     const handleUpdateLearner = async (updatedLearner: DashboardLearner) => {
// // //         await updateLearner(updatedLearner.id, updatedLearner);
// // //         setShowEditModal(false);
// // //         setSelectedLearner(null);
// // //     };

// // //     const handleAddProgramme = async (newProgramme: ProgrammeTemplate) => {
// // //         const { id, ...programmeData } = newProgramme;
// // //         await addProgramme(programmeData);
// // //         setShowProgModal(false);
// // //     };

// // //     const handleUpdateProgramme = async (updatedProgramme: ProgrammeTemplate) => {
// // //         await updateProgramme(updatedProgramme.id, updatedProgramme);
// // //         setShowProgModal(false);
// // //         setSelectedProg(null);
// // //     };

// // //     const handleAddStaff = async (newStaff: any) => {
// // //         await addStaff(newStaff);
// // //         setShowStaffModal(false);
// // //     };

// // //     const handleAddCohort = async (newCohort: any) => {
// // //         await addCohort(newCohort);
// // //         setShowCohortModal(false);
// // //     };

// // //     // Import Handlers
// // //     const handleUploadLearners = async (file: File) => {
// // //         try {
// // //             const result = await importUnifiedLearners(file);
// // //             alert(`Processed ${result.success} learners.`);
// // //             setShowUploadModal(false);
// // //         } catch (error) {
// // //             alert('Import failed: ' + (error as Error).message);
// // //         }
// // //     };

// // //     const handleUploadProgrammes = async (file: File) => {
// // //         try {
// // //             const result = await importProgrammesFromCSV(file);
// // //             alert(`Imported ${result.success} programmes.`);
// // //             setShowProgUploadModal(false);
// // //         } catch (error) {
// // //             alert('Import failed: ' + (error as Error).message);
// // //         }
// // //     };

// // //     const exportToCSV = () => {
// // //         const headers = ['Full Name', 'ID Number', 'Email', 'Start Date', 'Qualification', 'Status'];
// // //         const rows = filteredLearners.map(l => [
// // //             l.fullName, l.idNumber, l.email, l.trainingStartDate, l.qualification.name, l.status,
// // //         ]);
// // //         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
// // //         const blob = new Blob([csvContent], { type: 'text/csv' });
// // //         const url = window.URL.createObjectURL(blob);
// // //         const a = document.createElement('a');
// // //         a.href = url; a.download = 'learners-export.csv'; a.click();
// // //     };

// // //     // Helper to get staff name by ID
// // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // //     // ========================= RENDER =========================
// // //     return (
// // //         <div className="admin-layout">
// // //             {/* SIDEBAR */}
// // //             <aside className="sidebar">
// // //                 <div className="sidebar-header">
// // //                     <div className="sidebar-logo">
// // //                         <span className="m">m</span><span className="lab">lab</span>
// // //                     </div>
// // //                 </div>
// // //                 <nav className="sidebar-nav">
// // //                     <button className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentNav('dashboard')}>
// // //                         <Users size={20} /> <span>Overview</span>
// // //                     </button>
// // //                     <button className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`} onClick={() => setCurrentNav('learners')}>
// // //                         <Users size={20} /> <span>Learner Results</span>
// // //                     </button>
// // //                     <button className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`} onClick={() => setCurrentNav('qualifications')}>
// // //                         <BookOpen size={20} /> <span>Qualifications</span>
// // //                     </button>
// // //                     <button className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`} onClick={() => setCurrentNav('staff')}>
// // //                         <UserCheck size={20} /> <span>Staff Management</span>
// // //                     </button>
// // //                     <button className={`nav-item ${currentNav === 'cohorts' ? 'active' : ''}`} onClick={() => setCurrentNav('cohorts')}>
// // //                         <Layers size={20} /> <span>Cohorts (Classes)</span>
// // //                     </button>
// // //                 </nav>
// // //                 <div className="sidebar-footer">
// // //                     <button className="nav-item"><Settings size={20} /> <span>Settings</span></button>
// // //                     <button className="nav-item" style={{ color: '#ef4444' }} onClick={handleLogout}><LogOut size={20} /> <span>Logout</span></button>
// // //                 </div>
// // //             </aside>

// // //             {/* MAIN CONTENT */}
// // //             <main className="main-wrapper">
// // //                 <header className="dashboard-header">
// // //                     <div className="header-title">
// // //                         <h1>
// // //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// // //                             {currentNav === 'learners' && 'Learner Results'}
// // //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// // //                             {currentNav === 'staff' && 'Staff Management'}
// // //                             {currentNav === 'cohorts' && 'Cohort Management'}
// // //                         </h1>
// // //                         <p>Manage Statements of Results and Assessments</p>
// // //                     </div>
// // //                     {currentNav === 'learners' && (
// // //                         <div className="admin-actions">
// // //                             <button className="btn btn-outline" onClick={exportToCSV}><Download size={18} /> <span>Export</span></button>
// // //                             <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}><Upload size={18} /> <span>Upload Master CSV</span></button>
// // //                             <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><Plus size={18} /> <span>Add Learner</span></button>
// // //                         </div>
// // //                     )}
// // //                 </header>

// // //                 <div className="admin-content">
// // //                     {/* DASHBOARD OVERVIEW TAB */}
// // //                     {currentNav === 'dashboard' && (
// // //                         <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
// // //                             <StatCard icon={<Users size={24} />} title="Total Learners" value={stats.totalLearners} color="blue" />
// // //                             <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={stats.activeCohorts} color="green" />
// // //                             <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={stats.activeStaff} color="purple" />
// // //                             <StatCard icon={<AlertCircle size={24} />} title="Pending Review" value={stats.pendingReview} color="orange" />
// // //                         </div>
// // //                     )}

// // //                     {/* STAFF TAB */}
// // //                     {currentNav === 'staff' && (
// // //                         <div className="list-view">
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
// // //                                 <h2>Facilitators, Assessors & Moderators</h2>
// // //                                 <button className="btn btn-primary" onClick={() => setShowStaffModal(true)}><Plus size={18} /> Add Staff Member</button>
// // //                             </div>
// // //                             <table className="assessment-table">
// // //                                 <thead>
// // //                                     <tr>
// // //                                         <th>Full Name</th>
// // //                                         <th>Role (Pen Color)</th>
// // //                                         <th>Email</th>
// // //                                         <th>Phone</th>
// // //                                         <th>Actions</th>
// // //                                     </tr>
// // //                                 </thead>
// // //                                 <tbody>
// // //                                     {staff.map(s => (
// // //                                         <tr key={s.id}>
// // //                                             <td style={{ fontWeight: 600 }}>{s.fullName}</td>
// // //                                             <td>
// // //                                                 <span style={{
// // //                                                     padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
// // //                                                     background: s.role === 'assessor' ? '#fecaca' : s.role === 'moderator' ? '#bbf7d0' : '#bfdbfe',
// // //                                                     color: s.role === 'assessor' ? '#991b1b' : s.role === 'moderator' ? '#166534' : '#1e40af'
// // //                                                 }}>
// // //                                                     {s.role.toUpperCase()}
// // //                                                 </span>
// // //                                             </td>
// // //                                             <td>{s.email}</td>
// // //                                             <td>{s.phone || '-'}</td>
// // //                                             <td><button className="icon-btn delete" onClick={() => setStaffToDelete(s)}><Trash2 size={18} /></button></td>
// // //                                         </tr>
// // //                                     ))}
// // //                                     {staff.length === 0 && (
// // //                                         <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No staff found.</td></tr>
// // //                                     )}
// // //                                 </tbody>
// // //                             </table>
// // //                         </div>
// // //                     )}

// // //                     {/* COHORTS TAB */}
// // //                     {currentNav === 'cohorts' && (
// // //                         <div className="list-view">
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
// // //                                 <h2>Active Classes (Cohorts)</h2>
// // //                                 <button className="btn btn-primary" onClick={() => setShowCohortModal(true)}><Plus size={18} /> Create New Cohort</button>
// // //                             </div>
// // //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
// // //                                 {cohorts.map(cohort => (
// // //                                     <div key={cohort.id} style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
// // //                                             <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{cohort.name}</h3>
// // //                                             <button className="icon-btn delete" onClick={() => setCohortToDelete(cohort)}><Trash2 size={16} /></button>
// // //                                         </div>
// // //                                         <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
// // //                                             <Calendar size={14} style={{ display: 'inline', marginRight: '5px' }} />
// // //                                             {cohort.startDate} — {cohort.endDate}
// // //                                         </div>

// // //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></div>
// // //                                                 <span style={{ color: '#64748b' }}>Facilitator:</span>
// // //                                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.facilitatorId)}</span>
// // //                                             </div>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></div>
// // //                                                 <span style={{ color: '#64748b' }}>Assessor:</span>
// // //                                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.assessorId)}</span>
// // //                                             </div>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // //                                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
// // //                                                 <span style={{ color: '#64748b' }}>Moderator:</span>
// // //                                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.moderatorId)}</span>
// // //                                             </div>
// // //                                         </div>

// // //                                         <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem' }}>
// // //                                                 <Users size={16} />
// // //                                                 <span>{cohort.learnerIds.length} Learners Enrolled</span>
// // //                                             </div>
// // //                                             <button style={{ color: '#073f4e', fontSize: '0.85rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
// // //                                                 Manage &rarr;
// // //                                             </button>
// // //                                         </div>
// // //                                     </div>
// // //                                 ))}
// // //                                 {cohorts.length === 0 && (
// // //                                     <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '12px', color: '#94a3b8' }}>
// // //                                         <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
// // //                                         <p>No cohorts created yet. Create a class to get started.</p>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* LEARNERS TAB */}
// // //                     {currentNav === 'learners' && (
// // //                         <>
// // //                             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// // //                                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // //                                     <input type="text" placeholder="Search by name, ID, or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
// // //                                 </div>
// // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // //                                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // //                                     <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ minWidth: '120px' }}>
// // //                                         <option value="all">All Years</option>
// // //                                         {availableYears.map(year => (
// // //                                             <option key={year} value={year}>{year} Cohort</option>
// // //                                         ))}
// // //                                     </select>
// // //                                 </div>
// // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // //                                     <Filter size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // //                                     <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
// // //                                         <option value="all">All Status</option>
// // //                                         <option value="completed">Completed</option>
// // //                                         <option value="in-progress">In Progress</option>
// // //                                         <option value="pending">Pending</option>
// // //                                     </select>
// // //                                 </div>
// // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
// // //                                     <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
// // //                                     Show Archived
// // //                                 </label>
// // //                                 {selectedYear !== 'all' && !showArchived && (
// // //                                     <button className="btn btn-outline" onClick={handleArchiveCohort} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
// // //                                         <Archive size={16} /> Archive {selectedYear}
// // //                                     </button>
// // //                                 )}
// // //                             </div>

// // //                             <div className="list-view">
// // //                                 <table className="assessment-table">
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Learner Details</th>
// // //                                             <th>Qualification</th>
// // //                                             <th>Progress</th>
// // //                                             <th>EISA Status</th>
// // //                                             <th>Actions</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {filteredLearners.map((learner) => (
// // //                                             <tr key={learner.id} style={{ opacity: learner.isArchived ? 0.6 : 1, background: learner.isArchived ? '#7d6939' : 'transparent' }}>
// // //                                                 <td>
// // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                                         <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#0369a1' }}>
// // //                                                             {learner.fullName.charAt(0)}
// // //                                                         </div>
// // //                                                         <div>
// // //                                                             <div style={{ fontWeight: 600 }}>
// // //                                                                 {learner.fullName}
// // //                                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
// // //                                                             </div>
// // //                                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// // //                                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div style={{ fontWeight: 500 }}>{learner.qualification.name || "N/A"}</div>
// // //                                                     <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>SAQA: {learner.qualification.saqaId}</div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>K: {learner.knowledgeModules.length}</span>
// // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>P: {learner.practicalModules.length}</span>
// // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>W: {learner.workExperienceModules.length}</span>
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500, color: learner.eisaAdmission ? '#16a34a' : '#ef4444' }}>
// // //                                                         {learner.eisaAdmission ? <><CheckCircle size={16} /> Admitted</> : <><XCircle size={16} /> Pending</>}
// // //                                                     </span>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                                         <button className="icon-btn action-view" onClick={() => handleViewSOR(learner)}><Eye size={18} /></button>
// // //                                                         <button className="icon-btn" style={{ color: copiedId === learner.idNumber ? '#16a34a' : 'white' }} onClick={() => handleCopyLink(learner.idNumber)}>
// // //                                                             {copiedId === learner.idNumber ? <Check size={18} /> : <Share2 size={18} />}
// // //                                                         </button>
// // //                                                         <button className="icon-btn action-edit" onClick={() => { setSelectedLearner(learner); setShowEditModal(true); }}><Edit size={18} /></button>
// // //                                                         <button className="icon-btn delete" onClick={() => setLearnerToDelete(learner)}><Trash2 size={18} /></button>
// // //                                                     </div>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         ))}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>
// // //                         </>
// // //                     )}

// // //                     {/* QUALIFICATIONS TAB */}
// // //                     {currentNav === 'qualifications' && (
// // //                         <div className="list-view">
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
// // //                                 <h2 style={{ margin: 0 }}>Programme Templates</h2>
// // //                                 <div className="admin-actions">
// // //                                     <button className="btn btn-outline" onClick={() => setShowProgUploadModal(true)}>
// // //                                         <Upload size={18} /> Upload CSV
// // //                                     </button>
// // //                                     <button className="btn btn-primary" onClick={() => { setSelectedProg(null); setShowProgModal(true); }}>
// // //                                         <Plus size={18} /> Create Template
// // //                                     </button>
// // //                                 </div>
// // //                             </div>
// // //                             <table className="assessment-table">
// // //                                 <thead>
// // //                                     <tr>
// // //                                         <th>Programme Name</th>
// // //                                         <th>SAQA ID</th>
// // //                                         <th>NQF Level</th>
// // //                                         <th>Modules</th>
// // //                                         <th>Actions</th>
// // //                                     </tr>
// // //                                 </thead>
// // //                                 <tbody>
// // //                                     {programmes.filter(p => !p.isArchived).map((prog) => (
// // //                                         <tr key={prog.id}>
// // //                                             <td style={{ fontWeight: 600 }}>{prog.name}</td>
// // //                                             <td>{prog.saqaId}</td>
// // //                                             <td>Level {prog.nqfLevel}</td>
// // //                                             <td>
// // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                                     <span style={{ fontSize: '0.8rem', background: '#5277c1', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>K: {prog.knowledgeModules.length}</span>
// // //                                                     <span style={{ fontSize: '0.8rem', background: '#5277c1', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>P: {prog.practicalModules.length}</span>
// // //                                                 </div>
// // //                                             </td>
// // //                                             <td>
// // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                                     <button className="icon-btn action-edit" onClick={() => { setSelectedProg(prog); setShowProgModal(true); }}><Edit size={18} /></button>
// // //                                                     <button className="icon-btn delete" onClick={() => setProgToArchive(prog)}><Trash2 size={18} /></button>
// // //                                                 </div>
// // //                                             </td>
// // //                                         </tr>
// // //                                     ))}
// // //                                 </tbody>
// // //                             </table>
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </main>


// // //             {/* MODALS */}
// // //             {showAddModal && <LearnerFormModal onClose={() => setShowAddModal(false)} onSave={handleAddLearner} title="Add New Learner" programmes={programmes} />}
// // //             {showEditModal && selectedLearner && <LearnerFormModal learner={selectedLearner} onClose={() => { setShowEditModal(false); setSelectedLearner(null); }} onSave={handleUpdateLearner} title="Edit Learner" programmes={programmes} />}
// // //             {showProgModal && <ProgrammeFormModal programme={selectedProg} onClose={() => setShowProgModal(false)} onSave={selectedProg ? handleUpdateProgramme : handleAddProgramme} title={selectedProg ? 'Edit Template' : 'Create Template'} />}
// // //             {showStaffModal && <StaffFormModal onClose={() => setShowStaffModal(false)} onSave={handleAddStaff} />}
// // //             {showCohortModal && <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleAddCohort} />}

// // //             {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} onUpload={handleUploadLearners} title="Upload Master CSV" />}
// // //             {showProgUploadModal && <UploadModal onClose={() => setShowProgUploadModal(false)} onUpload={handleUploadProgrammes} title="Upload Programmes CSV" />}

// // //             {/* DELETE CONFIRMATIONS */}
// // //             {learnerToDelete && <DeleteConfirmModal itemName={learnerToDelete.fullName} actionType="Delete" onConfirm={() => { deleteLearner(learnerToDelete.id); setLearnerToDelete(null); }} onCancel={() => setLearnerToDelete(null)} />}
// // //             {progToArchive && <DeleteConfirmModal itemName={progToArchive.name} actionType="Archive" onConfirm={() => { archiveProgramme(progToArchive.id); setProgToArchive(null); }} onCancel={() => setProgToArchive(null)} />}
// // //             {staffToDelete && <DeleteConfirmModal itemName={staffToDelete.fullName} actionType="Delete" onConfirm={() => { deleteStaff(staffToDelete.id); setStaffToDelete(null); }} onCancel={() => setStaffToDelete(null)} />}
// // //             {cohortToDelete && <DeleteConfirmModal itemName={cohortToDelete.name} actionType="Delete" onConfirm={() => { deleteCohort(cohortToDelete.id); setCohortToDelete(null); }} onCancel={() => setCohortToDelete(null)} />}
// // //         </div>
// // //     );
// // // };

// // // export default AdminDashboard;

// // // // import React, { useEffect, useState, useMemo } from 'react';
// // // // import {
// // // //     Plus, Upload, Download, Search, Filter, Edit, Trash2,
// // // //     Users, Award, CheckCircle, XCircle, Eye,
// // // //     LayoutDashboard, BookOpen, Settings, LogOut, AlertCircle,
// // // //     Share2, Check, Calendar, Archive, UserCheck
// // // // } from 'lucide-react';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import { signOut } from 'firebase/auth';
// // // // import { auth } from '../../lib/firebase';

// // // // // Store
// // // // import { useStore } from '../../store/useStore';
// // // // import type { StaffMember } from '../../store/useStore';

// // // // // Components
// // // // import { StatCard } from '../../components/common/StatCard';
// // // // import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
// // // // import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
// // // // import { StaffFormModal } from '../../components/admin/StaffFormModal'; // NEW
// // // // import { UploadModal } from '../../components/common/UploadModal';
// // // // import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';

// // // // // Types
// // // // import type { DashboardLearner, ProgrammeTemplate } from '../../types';

// // // // // Styles
// // // // import './AdminDashboard.css';

// // // // const AdminDashboard: React.FC = () => {
// // // //     const navigate = useNavigate();

// // // //     // ----- Local UI State -----
// // // //     const [currentNav, setCurrentNav] = useState<'learners' | 'staff' | 'qualifications' | 'dashboard'>('dashboard');
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [filterStatus, setFilterStatus] = useState('all');

// // // //     // Filter State
// // // //     const [selectedYear, setSelectedYear] = useState<string>('all');
// // // //     const [showArchived, setShowArchived] = useState(false);
// // // //     const [copiedId, setCopiedId] = useState<string | null>(null);

// // // //     // Learner Modal states
// // // //     const [showAddModal, setShowAddModal] = useState(false);
// // // //     const [showUploadModal, setShowUploadModal] = useState(false);
// // // //     const [showEditModal, setShowEditModal] = useState(false);
// // // //     const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

// // // //     // Programme Modal states
// // // //     const [showProgModal, setShowProgModal] = useState(false);
// // // //     const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
// // // //     const [showProgUploadModal, setShowProgUploadModal] = useState(false);

// // // //     // Staff Modal states
// // // //     const [showStaffModal, setShowStaffModal] = useState(false);

// // // //     // Delete states
// // // //     const [learnerToDelete, setLearnerToDelete] = useState<DashboardLearner | null>(null);
// // // //     const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);
// // // //     const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

// // // //     // ----- Global State from Store -----
// // // //     const {
// // // //         // Learners
// // // //         learners,
// // // //         fetchLearners,
// // // //         addLearner,
// // // //         updateLearner,
// // // //         deleteLearner,
// // // //         importUnifiedLearners,
// // // //         archiveCohort,
// // // //         // Programmes
// // // //         programmes,
// // // //         fetchProgrammes,
// // // //         addProgramme,
// // // //         updateProgramme,
// // // //         archiveProgramme,
// // // //         importProgrammesFromCSV,
// // // //         // Staff
// // // //         staff,
// // // //         fetchStaff,
// // // //         addStaff,
// // // //         deleteStaff
// // // //     } = useStore();

// // // //     // ----- Load data on mount or tab change -----
// // // //     useEffect(() => {
// // // //         if (currentNav === 'learners' || currentNav === 'dashboard') fetchLearners();
// // // //         if (currentNav === 'qualifications') fetchProgrammes();
// // // //         if (currentNav === 'staff') fetchStaff();
// // // //     }, [currentNav, fetchLearners, fetchProgrammes, fetchStaff]);

// // // //     // ----- 1. Compute Available Years -----
// // // //     const availableYears = useMemo(() => {
// // // //         const years = new Set<string>();
// // // //         learners.forEach(l => {
// // // //             if (l.trainingStartDate) {
// // // //                 years.add(l.trainingStartDate.substring(0, 4));
// // // //             }
// // // //         });
// // // //         return Array.from(years).sort().reverse();
// // // //     }, [learners]);

// // // //     // ----- 2. Filter Logic -----
// // // //     const filteredLearners = learners.filter(learner => {
// // // //         const matchesSearch = learner.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //             learner.idNumber.includes(searchTerm) ||
// // // //             learner.email.toLowerCase().includes(searchTerm.toLowerCase());
// // // //         const matchesStatus = filterStatus === 'all' || learner.status === filterStatus;
// // // //         const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
// // // //         const matchesYear = selectedYear === 'all' || learnerYear === selectedYear;
// // // //         const matchesArchived = showArchived ? true : !learner.isArchived;

// // // //         return matchesSearch && matchesStatus && matchesYear && matchesArchived;
// // // //     });

// // // //     const stats = {
// // // //         totalLearners: learners.length,
// // // //         eisaAdmitted: learners.filter(l => l.eisaAdmission).length,
// // // //         activeStaff: staff.length,
// // // //         pendingReview: learners.filter(l => l.status === 'in-progress').length,
// // // //     };

// // // //     // ----- Action Handlers -----

// // // //     const handleLogout = async () => {
// // // //         try {
// // // //             await signOut(auth);
// // // //             navigate('/login');
// // // //         } catch (error) {
// // // //             console.error("Logout failed", error);
// // // //         }
// // // //     };

// // // //     const handleViewSOR = (learner: DashboardLearner) => {
// // // //         navigate(`/sor/${learner.id}`);
// // // //     };

// // // //     const handleCopyLink = (learnerIdNumber: string) => {
// // // //         const link = `${window.location.origin}/portal?id=${learnerIdNumber}`;
// // // //         navigator.clipboard.writeText(link).then(() => {
// // // //             setCopiedId(learnerIdNumber);
// // // //             setTimeout(() => setCopiedId(null), 2000);
// // // //         });
// // // //     };

// // // //     const handleArchiveCohort = async () => {
// // // //         if (selectedYear === 'all') {
// // // //             alert("Please select a specific year to archive.");
// // // //             return;
// // // //         }
// // // //         if (window.confirm(`Are you sure you want to ARCHIVE the entire ${selectedYear} cohort?`)) {
// // // //             await archiveCohort(selectedYear);
// // // //         }
// // // //     };

// // // //     // Learner Handlers
// // // //     const handleAddLearner = async (newLearner: DashboardLearner) => {
// // // //         const { id, ...learnerData } = newLearner;
// // // //         await addLearner(learnerData);
// // // //         setShowAddModal(false);
// // // //     };

// // // //     const handleUpdateLearner = async (updatedLearner: DashboardLearner) => {
// // // //         await updateLearner(updatedLearner.id, updatedLearner);
// // // //         setShowEditModal(false);
// // // //         setSelectedLearner(null);
// // // //     };

// // // //     const handleDeleteLearner = async (id: string) => {
// // // //         await deleteLearner(id);
// // // //         setLearnerToDelete(null);
// // // //     };

// // // //     // Programme Handlers
// // // //     const handleAddProgramme = async (newProgramme: ProgrammeTemplate) => {
// // // //         const { id, ...programmeData } = newProgramme;
// // // //         await addProgramme(programmeData);
// // // //         setShowProgModal(false);
// // // //     };

// // // //     const handleUpdateProgramme = async (updatedProgramme: ProgrammeTemplate) => {
// // // //         await updateProgramme(updatedProgramme.id, updatedProgramme);
// // // //         setShowProgModal(false);
// // // //         setSelectedProg(null);
// // // //     };

// // // //     const handleArchiveProgramme = async (id: string) => {
// // // //         await archiveProgramme(id);
// // // //         setProgToArchive(null);
// // // //     };

// // // //     // Staff Handlers
// // // //     const handleAddStaff = async (newStaff: any) => {
// // // //         await addStaff(newStaff);
// // // //         setShowStaffModal(false);
// // // //     };

// // // //     const handleDeleteStaff = async (id: string) => {
// // // //         await deleteStaff(id);
// // // //         setStaffToDelete(null);
// // // //     };

// // // //     // Import Handlers
// // // //     const handleUploadLearners = async (file: File) => {
// // // //         try {
// // // //             const result = await importUnifiedLearners(file);
// // // //             alert(`Processed ${result.success} learners.`);
// // // //             setShowUploadModal(false);
// // // //         } catch (error) {
// // // //             alert('Import failed: ' + (error as Error).message);
// // // //         }
// // // //     };

// // // //     const handleUploadProgrammes = async (file: File) => {
// // // //         try {
// // // //             const result = await importProgrammesFromCSV(file);
// // // //             alert(`Imported ${result.success} programmes.`);
// // // //             setShowProgUploadModal(false);
// // // //         } catch (error) {
// // // //             alert('Import failed: ' + (error as Error).message);
// // // //         }
// // // //     };

// // // //     const exportToCSV = () => {
// // // //         const headers = ['Full Name', 'ID Number', 'Email', 'Start Date', 'Qualification', 'Status'];
// // // //         const rows = filteredLearners.map(l => [
// // // //             l.fullName,
// // // //             l.idNumber,
// // // //             l.email,
// // // //             l.trainingStartDate,
// // // //             l.qualification.name,
// // // //             l.status,
// // // //         ]);
// // // //         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
// // // //         const blob = new Blob([csvContent], { type: 'text/csv' });
// // // //         const url = window.URL.createObjectURL(blob);
// // // //         const a = document.createElement('a');
// // // //         a.href = url;
// // // //         a.download = 'learners-export.csv';
// // // //         a.click();
// // // //     };

// // // //     // ========================= RENDER =========================
// // // //     return (
// // // //         <div className="admin-layout">
// // // //             {/* SIDEBAR */}
// // // //             <aside className="sidebar">
// // // //                 <div className="sidebar-header">
// // // //                     <div className="sidebar-logo">
// // // //                         <span className="m">m</span>
// // // //                         <span className="lab">lab</span>
// // // //                     </div>
// // // //                 </div>
// // // //                 <nav className="sidebar-nav">
// // // //                     <button
// // // //                         className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`}
// // // //                         onClick={() => setCurrentNav('dashboard')}
// // // //                     >
// // // //                         <LayoutDashboard size={20} />
// // // //                         <span>Overview</span>
// // // //                     </button>
// // // //                     <button
// // // //                         className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`}
// // // //                         onClick={() => setCurrentNav('learners')}
// // // //                     >
// // // //                         <Users size={20} />
// // // //                         <span>Learner Results</span>
// // // //                     </button>
// // // //                     <button
// // // //                         className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`}
// // // //                         onClick={() => setCurrentNav('qualifications')}
// // // //                     >
// // // //                         <BookOpen size={20} />
// // // //                         <span>Qualifications</span>
// // // //                     </button>
// // // //                     <button
// // // //                         className={`nav-item ${currentNav === 'staff' ? 'active' : ''}`}
// // // //                         onClick={() => setCurrentNav('staff')}
// // // //                     >
// // // //                         <UserCheck size={20} />
// // // //                         <span>Staff Management</span>
// // // //                     </button>
// // // //                 </nav>
// // // //                 <div className="sidebar-footer">
// // // //                     <button className="nav-item">
// // // //                         <Settings size={20} />
// // // //                         <span>Settings</span>
// // // //                     </button>
// // // //                     <button className="nav-item" style={{ color: '#ef4444' }} onClick={handleLogout}>
// // // //                         <LogOut size={20} />
// // // //                         <span>Logout</span>
// // // //                     </button>
// // // //                 </div>
// // // //             </aside>

// // // //             {/* MAIN CONTENT */}
// // // //             <main className="main-wrapper">
// // // //                 <header className="dashboard-header">
// // // //                     <div className="header-title">
// // // //                         <h1>
// // // //                             {currentNav === 'dashboard' && 'Dashboard Overview'}
// // // //                             {currentNav === 'learners' && 'Learner Results'}
// // // //                             {currentNav === 'qualifications' && 'Qualification Templates'}
// // // //                             {currentNav === 'staff' && 'Staff Management'}
// // // //                         </h1>
// // // //                         <p>Manage Statements of Results and Assessments</p>
// // // //                     </div>
// // // //                     {currentNav === 'learners' && (
// // // //                         <div className="admin-actions">
// // // //                             <button className="btn btn-outline" onClick={exportToCSV}>
// // // //                                 <Download size={18} /> <span>Export</span>
// // // //                             </button>
// // // //                             <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
// // // //                                 <Upload size={18} /> <span>Upload Master CSV</span>
// // // //                             </button>
// // // //                             <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
// // // //                                 <Plus size={18} /> <span>Add Learner</span>
// // // //                             </button>
// // // //                         </div>
// // // //                     )}
// // // //                 </header>

// // // //                 <div className="admin-content">
// // // //                     {/* DASHBOARD OVERVIEW TAB */}
// // // //                     {currentNav === 'dashboard' && (
// // // //                         <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
// // // //                             <StatCard icon={<Users size={24} />} title="Total Learners" value={stats.totalLearners} color="blue" />
// // // //                             <StatCard icon={<CheckCircle size={24} />} title="EISA Admitted" value={stats.eisaAdmitted} color="green" />
// // // //                             <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={stats.activeStaff} color="purple" />
// // // //                             <StatCard icon={<AlertCircle size={24} />} title="Pending Review" value={stats.pendingReview} color="orange" />
// // // //                         </div>
// // // //                     )}

// // // //                     {/* STAFF TAB (NEW) */}
// // // //                     {currentNav === 'staff' && (
// // // //                         <div className="list-view">
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
// // // //                                 <h2>Facilitators, Assessors & Moderators</h2>
// // // //                                 <button className="btn btn-primary" onClick={() => setShowStaffModal(true)}>
// // // //                                     <Plus size={18} /> Add Staff Member
// // // //                                 </button>
// // // //                             </div>

// // // //                             <table className="assessment-table">
// // // //                                 <thead>
// // // //                                     <tr>
// // // //                                         <th>Full Name</th>
// // // //                                         <th>Role (Pen Color)</th>
// // // //                                         <th>Email</th>
// // // //                                         <th>Phone</th>
// // // //                                         <th>Actions</th>
// // // //                                     </tr>
// // // //                                 </thead>
// // // //                                 <tbody>
// // // //                                     {staff.map(s => (
// // // //                                         <tr key={s.id}>
// // // //                                             <td style={{ fontWeight: 600 }}>{s.fullName}</td>
// // // //                                             <td>
// // // //                                                 <span
// // // //                                                     style={{
// // // //                                                         padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
// // // //                                                         background: s.role === 'assessor' ? '#fecaca' : s.role === 'moderator' ? '#bbf7d0' : '#bfdbfe',
// // // //                                                         color: s.role === 'assessor' ? '#991b1b' : s.role === 'moderator' ? '#166534' : '#1e40af'
// // // //                                                     }}
// // // //                                                 >
// // // //                                                     {s.role.toUpperCase()}
// // // //                                                 </span>
// // // //                                             </td>
// // // //                                             <td>{s.email}</td>
// // // //                                             <td>{s.phone || '-'}</td>
// // // //                                             <td>
// // // //                                                 <button className="icon-btn delete" onClick={() => setStaffToDelete(s)}>
// // // //                                                     <Trash2 size={18} />
// // // //                                                 </button>
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     ))}
// // // //                                     {staff.length === 0 && (
// // // //                                         <tr>
// // // //                                             <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
// // // //                                                 No staff members found. Add one to get started.
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     )}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* LEARNERS TAB */}
// // // //                     {currentNav === 'learners' && (
// // // //                         <>
// // // //                             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// // // //                                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                                     <input
// // // //                                         type="text"
// // // //                                         placeholder="Search by name, ID, or email..."
// // // //                                         value={searchTerm}
// // // //                                         onChange={(e) => setSearchTerm(e.target.value)}
// // // //                                         style={{ width: '100%' }}
// // // //                                     />
// // // //                                 </div>
// // // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // // //                                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                                     <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ minWidth: '120px' }}>
// // // //                                         <option value="all">All Years</option>
// // // //                                         {availableYears.map(year => (
// // // //                                             <option key={year} value={year}>{year} Cohort</option>
// // // //                                         ))}
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// // // //                                     <Filter size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// // // //                                     <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
// // // //                                         <option value="all">All Status</option>
// // // //                                         <option value="completed">Completed</option>
// // // //                                         <option value="in-progress">In Progress</option>
// // // //                                         <option value="pending">Pending</option>
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
// // // //                                     <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
// // // //                                     Show Archived
// // // //                                 </label>
// // // //                                 {selectedYear !== 'all' && !showArchived && (
// // // //                                     <button className="btn btn-outline" onClick={handleArchiveCohort} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
// // // //                                         <Archive size={16} /> Archive {selectedYear}
// // // //                                     </button>
// // // //                                 )}
// // // //                             </div>

// // // //                             <div className="list-view">
// // // //                                 <table className="assessment-table">
// // // //                                     <thead>
// // // //                                         <tr>
// // // //                                             <th>Learner Details</th>
// // // //                                             <th>Qualification</th>
// // // //                                             <th>Progress</th>
// // // //                                             <th>EISA Status</th>
// // // //                                             <th>Actions</th>
// // // //                                         </tr>
// // // //                                     </thead>
// // // //                                     <tbody>
// // // //                                         {filteredLearners.map((learner) => (
// // // //                                             <tr key={learner.id} style={{ opacity: learner.isArchived ? 0.6 : 1, background: learner.isArchived ? '#7d6939' : 'transparent' }}>
// // // //                                                 <td>
// // // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // //                                                         <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#0369a1' }}>
// // // //                                                             {learner.fullName.charAt(0)}
// // // //                                                         </div>
// // // //                                                         <div>
// // // //                                                             <div style={{ fontWeight: 600 }}>
// // // //                                                                 {learner.fullName}
// // // //                                                                 {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
// // // //                                                             </div>
// // // //                                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
// // // //                                                                 {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ fontWeight: 500 }}>{learner.qualification.name || "N/A"}</div>
// // // //                                                     <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>SAQA: {learner.qualification.saqaId}</div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>K: {learner.knowledgeModules.length}</span>
// // // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>P: {learner.practicalModules.length}</span>
// // // //                                                         <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#5277c1', borderRadius: '4px' }}>W: {learner.workExperienceModules.length}</span>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500, color: learner.eisaAdmission ? '#16a34a' : '#ef4444' }}>
// // // //                                                         {learner.eisaAdmission ? <><CheckCircle size={16} /> Admitted</> : <><XCircle size={16} /> Pending</>}
// // // //                                                     </span>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                                         <button className="icon-btn action-view" onClick={() => handleViewSOR(learner)}><Eye size={18} /></button>
// // // //                                                         <button className="icon-btn" style={{ color: copiedId === learner.idNumber ? '#16a34a' : 'white' }} onClick={() => handleCopyLink(learner.idNumber)}>
// // // //                                                             {copiedId === learner.idNumber ? <Check size={18} /> : <Share2 size={18} />}
// // // //                                                         </button>
// // // //                                                         <button className="icon-btn action-edit" onClick={() => { setSelectedLearner(learner); setShowEditModal(true); }}><Edit size={18} /></button>
// // // //                                                         <button className="icon-btn delete" onClick={() => setLearnerToDelete(learner)}><Trash2 size={18} /></button>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         ))}
// // // //                                     </tbody>
// // // //                                 </table>
// // // //                             </div>
// // // //                         </>
// // // //                     )}

// // // //                     {/* QUALIFICATIONS TAB */}
// // // //                     {currentNav === 'qualifications' && (
// // // //                         <div className="list-view">
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
// // // //                                 <h2 style={{ margin: 0 }}>Programme Templates</h2>
// // // //                                 <div className="admin-actions">
// // // //                                     <button className="btn btn-outline" onClick={() => setShowProgUploadModal(true)}>
// // // //                                         <Upload size={18} /> Upload CSV
// // // //                                     </button>
// // // //                                     <button className="btn btn-primary" onClick={() => { setSelectedProg(null); setShowProgModal(true); }}>
// // // //                                         <Plus size={18} /> Create Template
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <table className="assessment-table">
// // // //                                 <thead>
// // // //                                     <tr>
// // // //                                         <th>Programme Name</th>
// // // //                                         <th>SAQA ID</th>
// // // //                                         <th>NQF Level</th>
// // // //                                         <th>Modules</th>
// // // //                                         <th>Actions</th>
// // // //                                     </tr>
// // // //                                 </thead>
// // // //                                 <tbody>
// // // //                                     {programmes.filter(p => !p.isArchived).map((prog) => (
// // // //                                         <tr key={prog.id}>
// // // //                                             <td style={{ fontWeight: 600 }}>{prog.name}</td>
// // // //                                             <td>{prog.saqaId}</td>
// // // //                                             <td>Level {prog.nqfLevel}</td>
// // // //                                             <td>
// // // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                                     <span style={{ fontSize: '0.8rem', background: '#f3f4f6', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>K: {prog.knowledgeModules.length}</span>
// // // //                                                     <span style={{ fontSize: '0.8rem', background: '#f3f4f6', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>P: {prog.practicalModules.length}</span>
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                                     <button className="icon-btn action-edit" onClick={() => { setSelectedProg(prog); setShowProgModal(true); }}><Edit size={18} /></button>
// // // //                                                     <button className="icon-btn delete" onClick={() => setProgToArchive(prog)}><Trash2 size={18} /></button>
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     ))}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                     )}
// // // //                 </div>
// // // //             </main>

// // // //             {/* MODALS */}
// // // //             {showAddModal && (
// // // //                 <LearnerFormModal onClose={() => setShowAddModal(false)} onSave={handleAddLearner} title="Add New Learner" programmes={programmes} />
// // // //             )}
// // // //             {showEditModal && selectedLearner && (
// // // //                 <LearnerFormModal learner={selectedLearner} onClose={() => { setShowEditModal(false); setSelectedLearner(null); }} onSave={handleUpdateLearner} title="Edit Learner" programmes={programmes} />
// // // //             )}
// // // //             {showProgModal && (
// // // //                 <ProgrammeFormModal programme={selectedProg} onClose={() => setShowProgModal(false)} onSave={selectedProg ? handleUpdateProgramme : handleAddProgramme} title={selectedProg ? 'Edit Template' : 'Create Template'} />
// // // //             )}
// // // //             {showStaffModal && (
// // // //                 <StaffFormModal onClose={() => setShowStaffModal(false)} onSave={handleAddStaff} />
// // // //             )}
// // // //             {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} onUpload={handleUploadLearners} title="Upload Master CSV" />}
// // // //             {showProgUploadModal && <UploadModal onClose={() => setShowProgUploadModal(false)} onUpload={handleUploadProgrammes} title="Upload Programmes CSV" />}

// // // //             {/* DELETE MODALS */}
// // // //             {learnerToDelete && <DeleteConfirmModal itemName={learnerToDelete.fullName} actionType="Delete" onConfirm={() => handleDeleteLearner(learnerToDelete.id)} onCancel={() => setLearnerToDelete(null)} />}
// // // //             {progToArchive && <DeleteConfirmModal itemName={progToArchive.name} actionType="Archive" onConfirm={() => handleArchiveProgramme(progToArchive.id)} onCancel={() => setProgToArchive(null)} />}
// // // //             {staffToDelete && <DeleteConfirmModal itemName={staffToDelete.fullName} actionType="Delete" onConfirm={() => handleDeleteStaff(staffToDelete.id)} onCancel={() => setStaffToDelete(null)} />}
// // // //         </div>
// // // //     );
// // // // };

// // // // export default AdminDashboard;