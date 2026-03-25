// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Users, Calendar,
    Clock, XCircle, AlertTriangle, CheckCircle,
    Eye, Loader2, PenTool,
    RefreshCcw, Info, Building2, Edit
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import './CohortDetailsPage.css';
import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal'; // 🚀 IMPORT NEW MODAL
import type { DashboardLearner } from '../../types';

export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();

    const {
        user, cohorts, learners, staff, employers,
        fetchCohorts, fetchLearners, fetchStaff, fetchEmployers
    } = useStore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [submissions, setSubmissions] = useState<any[]>([]);

    // State for controlling the Status Modal
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    const headerTheme = useMemo((): HeaderTheme => {
        if (!user?.role) return 'default';
        if (user.role === 'learner') return 'student';
        return user.role as HeaderTheme;
    }, [user?.role]);

    const enrolledLearners = useMemo(() => {
        return learners.filter(l => {
            const hasCohortId = l.cohortId === cohortId;
            const isInCohortArray = cohort?.learnerIds?.includes(l.id);
            return hasCohortId || isInCohortArray;
        });
    }, [learners, cohort, cohortId]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
        if (employers.length === 0) fetchEmployers();
    }, [cohorts, learners, staff, employers, fetchCohorts, fetchLearners, fetchStaff, fetchEmployers]);

    const fetchSubmissions = async () => {
        if (!cohortId) return;
        try {
            const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
            const snap = await getDocs(q);
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Error fetching submissions:", error);
        }
    };

    useEffect(() => {
        fetchSubmissions();
    }, [cohortId]);

    const syncLearnerWorkbooks = async () => {
        if (!cohortId) return;
        setIsSyncing(true);

        try {
            const batch = writeBatch(db);
            const assessmentsRef = collection(db, 'assessments');

            const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
            const snapArray = await getDocs(qArray);

            const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
            const snapString = await getDocs(qString);

            const allAssessments = new Map();
            snapArray.docs.forEach(d => allAssessments.set(d.id, d));
            snapString.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) {
                setIsSyncing(false);
                setModalConfig({
                    isOpen: true,
                    type: 'info',
                    title: 'No Assessments Found',
                    message: 'There are no active assessments published for this class yet. Nothing to sync.'
                });
                return;
            }

            let newDocsCount = 0;

            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;

                for (const [astId, astDoc] of allAssessments.entries()) {
                    const alreadyExists = submissions.some(s =>
                        s.assessmentId === astId &&
                        s.cohortId === cohortId &&
                        (s.enrollmentId === enrolId || s.learnerId === humanId)
                    );

                    if (!alreadyExists) {
                        const astData = astDoc.data();
                        const submissionId = `${cohortId}_${humanId}_${astId}`;
                        const subRef = doc(db, 'learner_submissions', submissionId);

                        batch.set(subRef, {
                            learnerId: humanId,
                            enrollmentId: enrolId,
                            qualificationName: learner.qualification?.name || '',
                            assessmentId: astId,
                            cohortId: cohortId,
                            title: astData.title,
                            type: astData.type || 'formative',
                            moduleNumber: astData.moduleInfo?.moduleNumber || '',
                            moduleType: astData.moduleType || 'knowledge',
                            status: 'not_started',
                            answers: {},
                            assignedAt: new Date().toISOString(),
                            totalMarks: astData.totalMarks || 0,
                            marks: 0,
                            createdAt: new Date().toISOString()
                        });

                        newDocsCount++;
                    }
                }
            }

            if (newDocsCount > 0) {
                await batch.commit();
                await fetchSubmissions();

                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Sync Complete',
                    message: `Successfully generated ${newDocsCount} missing workbook(s) for late-joining learners.`
                });
            } else {
                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Already Synced',
                    message: 'All learners currently enrolled in this class are fully up-to-date with their assessment workbooks.'
                });
            }

        } catch (error: any) {
            console.error("Sync Error:", error);
            setModalConfig({
                isOpen: true,
                type: 'error',
                title: 'Sync Failed',
                message: `An error occurred while trying to sync workbooks: ${error.message}`
            });
        } finally {
            setIsSyncing(false);
        }
    };

    if (!cohort) {
        return (
            <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
                <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="mlab-state mlab-state--loading">
                        <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
                        <span>Loading Cohort Details…</span>
                    </div>
                </main>
            </div>
        );
    }

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const getEmployerName = (id?: string) => {
        if (!id) return null;
        return employers.find(e => e.id === id)?.name || 'Unknown Workplace';
    };

    const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(
            `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving ${cohort.name}?\n(e.g., Found Employment, Medical, Non-attendance)`
        );

        if (reason && reason.trim().length > 0) {
            if (window.confirm(
                `Are you sure you want to mark ${learnerName} as DROPPED from THIS CLASS?\n\nReason: "${reason}"\n\nThis will not affect their other enrollments.`
            )) {
                await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
            }
        } else if (reason !== null) {
            alert('Exit Reason is mandatory for QCTO compliance.');
        }
    };

    const handleBackNavigation = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else if (isFacilitator) {
            navigate('/facilitator');
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

            {/* STATUS MODAL */}
            {modalConfig.isOpen && (
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                    confirmText="Acknowledge"
                />
            )}

            {/* WORKPLACE PLACEMENT MODAL */}
            {learnerToPlace && (
                <WorkplacePlacementModal
                    learner={learnerToPlace}
                    onClose={() => setLearnerToPlace(null)}
                />
            )}

            <Sidebar
                role={user?.role}
                currentNav="cohorts"
                setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
                onLogout={() => navigate('/login')}
            />

            <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

                <PageHeader
                    theme={headerTheme}
                    variant="hero"
                    eyebrow={`${cohort.name}`}
                    title="Cohort Overview"
                    description="Manage Class Progress, Attendance & Exits."
                    onBack={handleBackNavigation}
                    backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
                    status={{
                        label: cohort.isArchived ? 'Archived' : 'Active Class',
                        variant: cohort.isArchived ? 'draft' : 'active'
                    }}
                    actions={
                        (isAdmin || isFacilitator) ? (
                            <PageHeader.Btn
                                variant="outline"
                                onClick={syncLearnerWorkbooks}
                                disabled={isSyncing}
                            >
                                {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                                Sync Workbooks
                            </PageHeader.Btn>
                        ) : undefined
                    }
                />

                <div className="admin-content" style={{ paddingBottom: '4rem' }}>

                    {/* ── Summary Card ────────────────────────────────────── */}
                    <div className="mlab-summary-card">
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">
                                <Calendar size={13} /> Training Dates
                            </span>
                            <span className="mlab-summary-item__value">
                                {cohort.startDate} — {cohort.endDate}
                            </span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Facilitator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Assessor</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Moderator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
                        </div>
                    </div>

                    {/* ── Enrolled Learners ────────────────────────────────── */}
                    <div className="mlab-section">

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="mlab-section__title" style={{ margin: 0 }}>
                                <Users size={16} />
                                Enrolled Learners ({enrolledLearners.length})
                            </h3>
                        </div>

                        <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <Info size={18} color="#0284c7" style={{ marginTop: '2px' }} />
                            <div>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0369a1' }}>Adding learners late?</h4>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#0c4a6e', lineHeight: 1.4 }}>
                                    If a learner joined this class <strong>after</strong> assessments were published, click <strong>"Sync Workbooks"</strong> at the top of the page. This will generate their missing portfolios without affecting existing students' progress.
                                </p>
                            </div>
                        </div>

                        <div className="mlab-table-wrap">
                            <table className="mlab-table">
                                <thead>
                                    <tr>
                                        <th>Learner</th>
                                        <th>Workplace Placement</th> {/* 🚀 NEW COLUMN */}
                                        <th>Progress (Modules)</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {enrolledLearners.map(learner => {
                                        const isDropped = learner.status === 'dropped';
                                        const routingId = learner.enrollmentId || learner.id;

                                        const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                        const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

                                        const normalizeType = (type?: string) => (type || 'knowledge').toLowerCase();
                                        const isLearnerDone = (status?: string) => status && !['not_started', 'in_progress'].includes(status);

                                        const knowSubs = learnerSubs.filter(s => normalizeType(s.moduleType) === 'knowledge');
                                        const pracSubs = learnerSubs.filter(s => normalizeType(s.moduleType) === 'practical');

                                        const completedK = knowSubs.filter(s => isLearnerDone(s.status)).length;
                                        const totalK = knowSubs.length;

                                        const completedP = pracSubs.filter(s => isLearnerDone(s.status)).length;
                                        const totalP = pracSubs.length;

                                        const employerName = getEmployerName(learner.employerId);

                                        return (
                                            <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                <td>
                                                    <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
                                                        {learner.fullName}
                                                    </div>
                                                    <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
                                                        {learner.idNumber}
                                                    </div>
                                                    {!isDropped && pendingMarking.length > 0 && (
                                                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 🚀 NEW WORKPLACE PLACEMENT COLUMN */}
                                                <td>
                                                    {employerName ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Building2 size={13} color="#0ea5e9" /> {employerName}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mentor: {getStaffName(learner.mentorId as string)}</span>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>Pending Placement</span>
                                                    )}
                                                </td>

                                                <td>
                                                    <div className="mlab-module-chips">
                                                        <span className="mlab-chip mlab-chip--k" title={`${completedK} out of ${totalK} Knowledge Modules submitted`}>
                                                            K: {completedK}/{totalK}
                                                        </span>
                                                        <span className="mlab-chip mlab-chip--p" title={`${completedP} out of ${totalP} Practical Modules submitted`}>
                                                            P: {completedP}/{totalP}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {isDropped ? (
                                                        <div className="mlab-dropped-status">
                                                            <div className="mlab-dropped-status__label">
                                                                <XCircle size={13} /> Dropped
                                                            </div>
                                                            <div className="mlab-dropped-status__detail">
                                                                Reason: {learner.exitReason || 'Unknown'}
                                                            </div>
                                                            <div className="mlab-dropped-status__detail">
                                                                Date: {formatDate(learner.exitDate || null)}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="mlab-badge mlab-badge--active">
                                                            <CheckCircle size={13} /> Active
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {!isDropped && (
                                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

                                                            {/* 🚀 DYNAMIC ASSIGN/UPDATE WORKPLACE BUTTON */}
                                                            {isAdmin && (
                                                                <button
                                                                    className="mlab-btn"
                                                                    style={{
                                                                        background: 'transparent',
                                                                        color: employerName ? '#475569' : '#0284c7',
                                                                        border: `1px solid ${employerName ? '#cbd5e1' : '#0284c7'}`,
                                                                        display: 'flex',
                                                                        gap: '4px',
                                                                        alignItems: 'center'
                                                                    }}
                                                                    onClick={() => setLearnerToPlace(learner)}
                                                                >
                                                                    {employerName ? (
                                                                        <>
                                                                            <Edit size={13} /> Update Placement
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Building2 size={13} /> Assign Workplace
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}

                                                            <button
                                                                className="mlab-btn mlab-btn--outline-blue"
                                                                onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
                                                            >
                                                                <Eye size={13} /> View Portfolio
                                                            </button>

                                                            {pendingMarking.length > 0 && (isAdmin || isFacilitator) && (
                                                                <button
                                                                    className="mlab-btn"
                                                                    style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', gap: '4px', alignItems: 'center' }}
                                                                    onClick={() => navigate(`/portfolio/submission/${pendingMarking[0].id}`)}
                                                                >
                                                                    <PenTool size={13} /> Mark Script
                                                                </button>
                                                            )}

                                                            {isAdmin && (
                                                                <button
                                                                    className="mlab-btn mlab-btn--outline-red"
                                                                    onClick={() => handleDropLearner(learner.id, learner.fullName)}
                                                                >
                                                                    <AlertTriangle size={13} /> Record Exit
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};