// src/pages/AdminDashboard/AdminDashboard.tsx

import React, { useEffect, useState } from 'react';
import { Users, AlertCircle, Layers, UserCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';

// Store
import { useStore, type StaffMember } from '../../store/useStore';
import type { DashboardLearner, ProgrammeTemplate, Cohort } from '../../types';

// Components
import { StatCard } from '../../components/common/StatCard';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';

// Views
import { StaffView } from '../../components/views/StaffView/StaffView';
import { CohortsView } from '../../components/views/CohortsView/CohortsView';
import { QualificationsView } from '../../components/views/QualificationsView/QualificationsView';
import { LearnersView } from '../../components/views/LearnersView/LearnersView';
import { LearnerDirectoryView } from '../../components/views/LearnerDirectoryView.tsx/LearnerDirectoryView';

// WORKPLACES MANAGER IMPORT

// Modals
import { LearnerFormModal } from '../../components/admin/LearnerFormModal/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
import { StaffFormModal } from '../../components/admin/StaffFormModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';
import { LearnerImportModal } from '../../components/admin/LearnerImportModal';
import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';

import './AdminDashboard.css';
import { WorkplacesManager } from '../../components/admin/WorkplacesManager/WorkplacesManager';
import { DashboardOverview } from '../../components/views/DashboardOverview/DashboardOverview';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    // ----- Navigation State -----
    // 🚀 ADDED 'workplaces' to the allowed navigation states
    const [currentNav, setCurrentNav] = useState<'directory' | 'learners' | 'staff' | 'qualifications' | 'cohorts' | 'workplaces' | 'dashboard'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

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

        // Directory Tab
        if (currentNav === 'directory') {
            store.fetchLearners();
        }

        // Learners Tab (Enrollments)
        if (currentNav === 'learners') {
            store.fetchLearners(true);
            store.fetchStagingLearners();
            store.fetchCohorts();
        }

        // Other Tabs
        if (currentNav === 'qualifications') store.fetchProgrammes();
        if (currentNav === 'staff') {
            store.fetchStaff();
            store.fetchEmployers(); // Fetch employers so the mentor assignment dropdown works
        }
        if (currentNav === 'workplaces') store.fetchEmployers(); // 🚀 Fetch for Workplaces tab
        if (currentNav === 'cohorts') {
            store.fetchCohorts();
            store.fetchProgrammes();
            store.fetchStaff();
            store.fetchLearners();
        }
    }, [currentNav, store.fetchLearners, store.fetchStagingLearners, store.fetchProgrammes, store.fetchStaff, store.fetchCohorts, store.fetchEmployers]);

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

    // Note: Since WorkplacesManager is now rendered without the dashboard header for maximum screen space, 
    // we conditionally hide the default header if currentNav === 'workplaces'
    return (
        <div className="admin-layout" style={{ width: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar currentNav={currentNav} setCurrentNav={setCurrentNav} onLogout={handleLogout} />

            <main className="main-wrapper" style={{ width: '100%', padding: 16, paddingBottom: '5%' }}>

                {currentNav !== 'workplaces' && (
                    <header className="dashboard-header">
                        <div className="header-title">
                            <h1>
                                {currentNav === 'dashboard' && 'Dashboard Overview'}
                                {currentNav === 'directory' && 'Master Learner Directory'}
                                {currentNav === 'learners' && 'Course Enrollments'}
                                {currentNav === 'qualifications' && 'Qualification Templates'}
                                {currentNav === 'staff' && 'Staff & Mentors'}
                                {currentNav === 'cohorts' && 'Cohort Management'}
                            </h1>
                            <p>
                                {currentNav === 'directory'
                                    ? 'View and manage unique learner profiles across the system'
                                    : 'Manage Statements of Results and Assessments'}
                            </p>
                        </div>
                    </header>
                )}

                <div className={currentNav === 'workplaces' ? '' : 'admin-content'}>
                    {/* DASHBOARD OVERVIEW */}
                    {currentNav === 'dashboard' && (
                        // <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
                        //     <StatCard icon={<Users size={24} />} title="Total Enrollments" value={store.learners.length} color="blue" />
                        //     <StatCard icon={<Layers size={24} />} title="Active Cohorts" value={store.cohorts.length} color="green" />
                        //     <StatCard icon={<UserCheck size={24} />} title="Active Staff" value={store.staff.length} color="purple" />
                        //     <StatCard icon={<AlertCircle size={24} />} title="Staging / Drafts" value={store.stagingLearners.length} color="orange" />
                        // </div>
                        <DashboardOverview />
                    )}

                    {/* LEARNER DIRECTORY VIEW (HUMANS) */}
                    {currentNav === 'directory' && (
                        <LearnerDirectoryView learners={store.learners} />
                    )}

                    {/* LEARNERS VIEW (ENROLLMENTS) */}
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
                                for (const l of list) {
                                    await store.restoreLearner(l.id);
                                }
                                store.fetchLearners(true);
                            }}

                            onArchiveCohort={handleLearnerCohortArchive}

                            onDeletePermanent={async (learner, audit) => {
                                if (store.deleteLearnerPermanent) {
                                    await store.deleteLearnerPermanent(learner.id, audit);
                                } else {
                                    alert("Delete function not found in store. Please ensure useStore is fully updated.");
                                }
                            }}
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

                    {/* 🚀 WORKPLACES MANAGER VIEW 🚀 */}
                    {currentNav === 'workplaces' && (
                        <WorkplacesManager />
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

