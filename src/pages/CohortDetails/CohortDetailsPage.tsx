// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Users, Calendar,
    Clock, XCircle, AlertTriangle, CheckCircle,
    Eye, Loader2, PenTool,
    RefreshCcw, Info
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar';
import './CohortDetailsPage.css';
import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
import type { StatusType } from '../FacilitatorDashboard/SubmissionReview/SubmissionReview';
import { StatusModal } from '../../components/common/StatusModal/StatusModal';

export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();

    const {
        user, cohorts, learners, staff,
        fetchCohorts, fetchLearners, fetchStaff, dropLearner
    } = useStore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [submissions, setSubmissions] = useState<any[]>([]);

    // 🚀 NEW: State for controlling the Status Modal
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    // Map user role to Header Theme securely
    const headerTheme = useMemo((): HeaderTheme => {
        if (!user?.role) return 'default';
        if (user.role === 'learner') return 'student';
        return user.role as HeaderTheme;
    }, [user?.role]);

    // ROBUST FILTER: Checks both sides of the relationship
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
    }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

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

    /**
     * 🚀 BULLETPROOF SYNC WORKBOOKS FUNCTION WITH MODAL FEEDBACK 🚀
     */
    const syncLearnerWorkbooks = async () => {
        if (!cohortId) return;
        setIsSyncing(true);

        try {
            const batch = writeBatch(db);
            const assessmentsRef = collection(db, 'assessments');

            // 1. Fetch assessments mapped to this cohort (New Array format)
            const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
            const snapArray = await getDocs(qArray);

            // 2. Fetch assessments mapped to this cohort (Legacy String format)
            const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
            const snapString = await getDocs(qString);

            // Combine and deduplicate
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

            // 3. Loop through learners and generate ONLY missing workbooks
            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;

                for (const [astId, astDoc] of allAssessments.entries()) {

                    // 🚀 THE SAFETY CHECK: Does this student already have this workbook FOR THIS SPECIFIC CLASS?
                    const alreadyExists = submissions.some(s =>
                        s.assessmentId === astId &&
                        s.cohortId === cohortId && // 🚀 MUST MATCH THE COHORT
                        (s.enrollmentId === enrolId || s.learnerId === humanId)
                    );

                    if (!alreadyExists) {
                        const astData = astDoc.data();

                        // 🚀 GUARANTEED UNIQUE ID (Cohort + Learner + Assessment)
                        const submissionId = `${cohortId}_${humanId}_${astId}`;
                        const subRef = doc(db, 'learner_submissions', submissionId);

                        batch.set(subRef, {
                            learnerId: humanId,
                            enrollmentId: enrolId,
                            qualificationName: learner.qualification?.name || '',
                            assessmentId: astId,
                            cohortId: cohortId, // 🚀 SAVE THE COHORT ID
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
                await fetchSubmissions(); // Refresh the local state

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

            {/* 🚀 STATUS MODAL INJECTION 🚀 */}
            {modalConfig.isOpen && (
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                    confirmText="Acknowledge"
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
                    description="Manage Class Progress, Attendance &amp; Exits."
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

                        {/* 🚀 LATE JOINER INFO BANNER 🚀 */}
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
                                        <th>Progress (Modules)</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {enrolledLearners.map(learner => {
                                        const isDropped = learner.status === 'dropped';
                                        const routingId = learner.enrollmentId || learner.id;

                                        // Filter submissions to isolate THIS learner for THIS class
                                        const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);

                                        // Count pending marking
                                        const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

                                        // 🚀 FIXED: DYNAMIC PROGRESS CALCULATION 🚀
                                        // A module is considered 'Completed by Learner' if it is no longer 'not_started' or 'in_progress'.
                                        // This includes: submitted, facilitator_reviewed, returned, graded, moderated, appealed.
                                        const normalizeType = (type?: string) => (type || 'knowledge').toLowerCase();
                                        const isLearnerDone = (status?: string) => status && !['not_started', 'in_progress'].includes(status);

                                        const knowSubs = learnerSubs.filter(s => normalizeType(s.moduleType) === 'knowledge');
                                        const pracSubs = learnerSubs.filter(s => normalizeType(s.moduleType) === 'practical');

                                        const completedK = knowSubs.filter(s => isLearnerDone(s.status)).length;
                                        const totalK = knowSubs.length;

                                        const completedP = pracSubs.filter(s => isLearnerDone(s.status)).length;
                                        const totalP = pracSubs.length;

                                        return (
                                            <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                <td>
                                                    <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
                                                        {learner.fullName}
                                                    </div>
                                                    <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
                                                        {learner.idNumber}
                                                    </div>
                                                    {/* Visual Alert if marking is pending */}
                                                    {!isDropped && pendingMarking.length > 0 && (
                                                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
                                                        </div>
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
                                                            {isAdmin && (
                                                                <button
                                                                    className="mlab-btn mlab-btn--outline-red"
                                                                    onClick={() => handleDropLearner(learner.id, learner.fullName)}
                                                                >
                                                                    <AlertTriangle size={13} /> Record Exit
                                                                </button>
                                                            )}

                                                            <button
                                                                className="mlab-btn mlab-btn--outline-blue"
                                                                onClick={() => navigate(`/sor/${routingId}`, { state: { cohortId: cohort.id } })}
                                                            >
                                                                <Eye size={13} /> View Portfolio
                                                            </button>

                                                            {/* Quick Action to mark the script */}
                                                            {pendingMarking.length > 0 && (isAdmin || isFacilitator) && (
                                                                <button
                                                                    className="mlab-btn"
                                                                    style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', gap: '4px', alignItems: 'center' }}
                                                                    onClick={() => navigate(`/portfolio/submission/${pendingMarking[0].id}`)}
                                                                >
                                                                    <PenTool size={13} /> Mark Script
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

// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     Users, Calendar, BookOpen, ShieldCheck,
// //     Award, UserMinus, Eye, Search, RefreshCw, Loader2
// // } from 'lucide-react';
// // import { doc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// // import type { Cohort } from '../../types';
// // import './CohortDetailsPage.css';

// // export const CohortDetailsPage: React.FC = () => {
// //     // 🚀 FIXED: Properly capture the 'cohortId' parameter from the Router
// //     const { cohortId: id } = useParams<{ cohortId: string }>();
// //     const navigate = useNavigate();

// //     // ─── ZUSTAND SELECTORS ───
// //     const user = useStore(state => state.user);
// //     const cohorts = useStore(state => state.cohorts);
// //     const learners = useStore(state => state.learners);
// //     const staff = useStore(state => state.staff);
// //     const programmes = useStore(state => state.programmes);

// //     const dropLearnerFromCohort = useStore(state => state.dropLearnerFromCohort);

// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [isSyncing, setIsSyncing] = useState(false);

// //     // ─── DIRECT DATABASE FALLBACK STATE ───
// //     const [localCohort, setLocalCohort] = useState<Cohort | null>(null);
// //     const [isDirectFetching, setIsDirectFetching] = useState(true);

// //     // ─── GUARANTEED INITIALIZATION ───
// //     useEffect(() => {
// //         let isMounted = true;

// //         const loadGuaranteedData = async () => {
// //             if (!id) {
// //                 if (isMounted) setIsDirectFetching(false);
// //                 return;
// //             }

// //             setIsDirectFetching(true);

// //             try {
// //                 // 1. Background Hydration
// //                 useStore.getState().fetchCohorts();
// //                 useStore.getState().fetchLearners();
// //                 useStore.getState().fetchStaff();
// //                 useStore.getState().fetchProgrammes();

// //                 // 2. Direct Firestore Fetch
// //                 const docRef = doc(db, 'cohorts', id);
// //                 const docSnap = await getDoc(docRef);

// //                 if (docSnap.exists() && isMounted) {
// //                     setLocalCohort({ id: docSnap.id, ...docSnap.data() } as Cohort);
// //                 } else if (isMounted) {
// //                     setLocalCohort(null);
// //                 }
// //             } catch (error) {
// //                 console.error("Failed to load class:", error);
// //             } finally {
// //                 if (isMounted) {
// //                     setIsDirectFetching(false);
// //                 }
// //             }
// //         };

// //         loadGuaranteedData();

// //         return () => { isMounted = false; };
// //     }, [id]);

// //     // ─── HYBRID DERIVED STATE ───
// //     const cohort = useMemo(() => {
// //         const fromStore = cohorts.find(c => String(c.id).trim() === String(id).trim());
// //         return fromStore || localCohort;
// //     }, [id, cohorts, localCohort]);

// //     // Resolve Relationships
// //     const enrolledLearners = useMemo(() => {
// //         if (!cohort) return [];
// //         return learners.filter(l =>
// //             l.cohortId === cohort.id ||
// //             (cohort.learnerIds && cohort.learnerIds.includes(l.learnerId || l.id))
// //         ).filter(l => l.status !== 'dropped');
// //     }, [cohort, learners]);

// //     const facilitator = useMemo(() => staff.find(s => s.id === cohort?.facilitatorId), [staff, cohort?.facilitatorId]);
// //     const assessor = useMemo(() => staff.find(s => s.id === cohort?.assessorId), [staff, cohort?.assessorId]);
// //     const moderator = useMemo(() => staff.find(s => s.id === cohort?.moderatorId), [staff, cohort?.moderatorId]);

// //     const programmeId = cohort?.programmeId || (cohort as any)?.qualificationId;
// //     const programme = useMemo(() => programmes.find(p => p.id === programmeId), [programmes, programmeId]);

// //     const filteredLearners = useMemo(() => {
// //         return enrolledLearners.filter(l =>
// //             l.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
// //             l.idNumber?.includes(searchTerm)
// //         );
// //     }, [enrolledLearners, searchTerm]);

// //     // ─── TARGETED DROP FUNCTION ───
// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         if (!cohort) return;

// //         const reason = window.prompt(
// //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving ${cohort.name}?\n(e.g., Found Employment, Medical, Non-attendance)`
// //         );

// //         if (reason && reason.trim().length > 0) {
// //             if (window.confirm(
// //                 `Are you sure you want to mark ${learnerName} as DROPPED from THIS CLASS?\n\nReason: "${reason}"\n\nThis will not affect their other enrollments.`
// //             )) {
// //                 await dropLearnerFromCohort(learnerId, cohort.id, reason);
// //             }
// //         } else if (reason !== null) {
// //             alert('Exit Reason is mandatory for QCTO compliance.');
// //         }
// //     };

// //     // ─── COLLISION-PROOF WORKBOOK SYNC ───
// //     const syncLearnerWorkbooks = async () => {
// //         if (!cohort) return;
// //         if (!window.confirm("Scan all assigned assessments and generate missing workbooks for the learners in this class?")) return;

// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);
// //             let newDocsCount = 0;

// //             const astSnap = await getDocs(collection(db, 'assessments'));

// //             const cohortAssessments = astSnap.docs.filter(astDoc => {
// //                 const data = astDoc.data();
// //                 const isInArray = data.cohortIds && Array.isArray(data.cohortIds) && data.cohortIds.includes(cohort.id);
// //                 const isExactString = data.cohortId === cohort.id;
// //                 return isInArray || isExactString;
// //             });

// //             if (cohortAssessments.length === 0) {
// //                 alert("No assessments are currently published to this class.");
// //                 setIsSyncing(false);
// //                 return;
// //             }

// //             const subQuery = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id));
// //             const subSnap = await getDocs(subQuery);
// //             const existingSubmissions = subSnap.docs.map(d => d.data());

// //             for (const learner of enrolledLearners) {
// //                 const enrolId = learner.enrollmentId || learner.id;
// //                 const humanId = learner.learnerId || learner.id;

// //                 for (const astDoc of cohortAssessments) {
// //                     const astId = astDoc.id;
// //                     const astData = astDoc.data();

// //                     const alreadyExists = existingSubmissions.some(s =>
// //                         s.assessmentId === astId &&
// //                         s.cohortId === cohort.id &&
// //                         (s.enrollmentId === enrolId || s.learnerId === humanId)
// //                     );

// //                     if (!alreadyExists) {
// //                         const submissionId = `${cohort.id}_${humanId}_${astId}`;
// //                         const subRef = doc(db, 'learner_submissions', submissionId);

// //                         batch.set(subRef, {
// //                             learnerId: humanId,
// //                             enrollmentId: enrolId,
// //                             qualificationName: learner.qualification?.name || programme?.name || '',
// //                             assessmentId: astId,
// //                             cohortId: cohort.id,
// //                             title: astData.title,
// //                             type: astData.type || 'formative',
// //                             moduleNumber: astData.moduleInfo?.moduleNumber || astData.linkedModuleCode || '',
// //                             moduleType: astData.moduleType || 'knowledge',
// //                             status: 'not_started',
// //                             answers: {},
// //                             assignedAt: new Date().toISOString(),
// //                             totalMarks: astData.totalMarks || 0,
// //                             marks: 0,
// //                             createdAt: new Date().toISOString(),
// //                             createdBy: user?.uid || 'system'
// //                         });

// //                         newDocsCount++;
// //                     }
// //                 }
// //             }

// //             if (newDocsCount > 0) {
// //                 await batch.commit();
// //                 alert(`Sync Complete! Generated ${newDocsCount} new workbooks for this class.`);
// //             } else {
// //                 alert(`Sync Complete! All learners already have their required workbooks.`);
// //             }

// //         } catch (error) {
// //             console.error("Sync error:", error);
// //             alert("An error occurred during synchronization. Check console.");
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     // ─── RENDER LOGIC ───

// //     if (isDirectFetching && !cohort) {
// //         return (
// //             <div className="admin-layout mlab-full-screen">
// //                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => { }} />
// //                 <main className="main-wrapper mlab-centered">
// //                     <Loader2 size={40} className="spin" color="var(--mlab-blue)" />
// //                     <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 500 }}>
// //                         Loading Class Workspace...
// //                     </p>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     if (!cohort) {
// //         return (
// //             <div className="admin-layout mlab-full-screen">
// //                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => { }} />
// //                 <main className="main-wrapper" style={{ padding: '2rem' }}>
// //                     <PageHeader title="Class Not Found" onBack={() => navigate('/cohorts')} />
// //                     <div className="mlab-alert mlab-alert--error" style={{ marginTop: '2rem' }}>
// //                         This class could not be located. It may have been archived or deleted.
// //                     </div>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="admin-layout mlab-full-screen">
// //             <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => { }} />

// //             <main className="main-wrapper">
// //                 <PageHeader
// //                     title={cohort.name}
// //                     eyebrow="Class Details"
// //                     description={`Mapped to: ${programme?.name || 'No Curriculum Linked'}`}
// //                     onBack={() => navigate('/cohorts')}
// //                     status={{
// //                         label: cohort.isArchived ? 'ARCHIVED' : 'ACTIVE',
// //                         variant: cohort.isArchived ? 'warning' : 'active'
// //                     }}
// //                 />

// //                 <div className="admin-content">

// //                     {/* ── META INFO CARDS ── */}
// //                     <div className="cohort-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
// //                         <div className="mlab-panel" style={{ padding: '1.25rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
// //                                 <Calendar size={16} /> Schedule
// //                             </div>
// //                             <p style={{ margin: 0, fontWeight: 500 }}>{cohort.startDate} to {cohort.endDate}</p>
// //                         </div>
// //                         <div className="mlab-panel" style={{ padding: '1.25rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
// //                                 <BookOpen size={16} /> Lead Facilitator
// //                             </div>
// //                             <p style={{ margin: 0, fontWeight: 500, color: 'var(--mlab-blue)' }}>{facilitator?.fullName || 'Not Assigned'}</p>
// //                         </div>
// //                         <div className="mlab-panel" style={{ padding: '1.25rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
// //                                 <Award size={16} /> Assessor
// //                             </div>
// //                             <p style={{ margin: 0, fontWeight: 500, color: '#ef4444' }}>{assessor?.fullName || 'Not Assigned'}</p>
// //                         </div>
// //                         <div className="mlab-panel" style={{ padding: '1.25rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
// //                                 <ShieldCheck size={16} /> Moderator
// //                             </div>
// //                             <p style={{ margin: 0, fontWeight: 500, color: '#22c55e' }}>{moderator?.fullName || 'Not Assigned'}</p>
// //                         </div>
// //                     </div>

// //                     {/* ── LEARNER ROSTER ── */}
// //                     <div className="mlab-panel">
// //                         <div className="mlab-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// //                             <div>
// //                                 <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={18} /> Enrolled Learners ({enrolledLearners.length})</h3>
// //                             </div>
// //                             <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
// //                                 <div className="mlab-search-box">
// //                                     <Search size={16} />
// //                                     <input
// //                                         type="text"
// //                                         placeholder="Search class list..."
// //                                         value={searchTerm}
// //                                         onChange={e => setSearchTerm(e.target.value)}
// //                                     />
// //                                 </div>
// //                                 <button
// //                                     className="mlab-btn mlab-btn--outline-green"
// //                                     onClick={syncLearnerWorkbooks}
// //                                     disabled={isSyncing}
// //                                 >
// //                                     {isSyncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
// //                                     Sync Workbooks
// //                                 </button>
// //                             </div>
// //                         </div>

// //                         {enrolledLearners.length === 0 ? (
// //                             <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
// //                                 <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
// //                                 <h4>No learners enrolled</h4>
// //                                 <p>Assign learners to this class via the Enrollments tab.</p>
// //                             </div>
// //                         ) : (
// //                             <div className="mlab-table-wrap">
// //                                 <table className="mlab-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Learner Name</th>
// //                                             <th>ID Number</th>
// //                                             <th>Email</th>
// //                                             <th>Date Enrolled</th>
// //                                             <th style={{ textAlign: 'right' }}>Actions</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {filteredLearners.map(learner => {
// //                                             const routingId = learner.enrollmentId || learner.id;
// //                                             const humanId = learner.learnerId || learner.id;

// //                                             return (
// //                                                 <tr key={routingId}>
// //                                                     <td>
// //                                                         <div style={{ fontWeight: 600, color: '#1e293b' }}>{learner.fullName}</div>
// //                                                     </td>
// //                                                     <td style={{ color: '#64748b' }}>{learner.idNumber}</td>
// //                                                     <td style={{ color: '#64748b' }}>{learner.email}</td>
// //                                                     <td style={{ color: '#64748b' }}>{learner.trainingStartDate ? new Date(learner.trainingStartDate).toLocaleDateString() : 'N/A'}</td>
// //                                                     <td style={{ textAlign: 'right' }}>
// //                                                         <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--ghost"
// //                                                                 style={{ color: 'var(--mlab-blue)' }}
// //                                                                 onClick={() => navigate(`/sor/${routingId}`, { state: { cohortId: cohort.id } })}
// //                                                             >
// //                                                                 <Eye size={16} /> View Portfolio
// //                                                             </button>

// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--ghost"
// //                                                                 style={{ color: '#ef4444' }}
// //                                                                 onClick={() => handleDropLearner(humanId, learner.fullName)}
// //                                                                 title="Drop from this class"
// //                                                             >
// //                                                                 <UserMinus size={16} />
// //                                                             </button>
// //                                                         </div>
// //                                                     </td>
// //                                                 </tr>
// //                                             );
// //                                         })}
// //                                     </tbody>
// //                                 </table>
// //                                 {filteredLearners.length === 0 && (
// //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
// //                                         No learners match your search.
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         )}
// //                     </div>

// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };

// import React, { useEffect, useState, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import {
//     Users, Calendar,
//     Clock, XCircle, AlertTriangle, CheckCircle,
//     Eye, Loader2, PenTool,
//     RefreshCcw, Info
// } from 'lucide-react';
// import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar';
// import './CohortDetailsPage.css';
// import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
// import type { StatusType } from '../FacilitatorDashboard/SubmissionReview/SubmissionReview';
// import { StatusModal } from '../../components/common/StatusModal/StatusModal';

// export const CohortDetailsPage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();

//     const {
//         user, cohorts, learners, staff,
//         fetchCohorts, fetchLearners, fetchStaff, dropLearner
//     } = useStore();

//     const [isSyncing, setIsSyncing] = useState(false);
//     const [submissions, setSubmissions] = useState<any[]>([]);

//     // 🚀 NEW: State for controlling the Status Modal
//     const [modalConfig, setModalConfig] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//     }>({ isOpen: false, type: 'info', title: '', message: '' });

//     const isAdmin = user?.role === 'admin';
//     const isFacilitator = user?.role === 'facilitator';
//     const cohort = cohorts.find(c => c.id === cohortId);

//     // Map user role to Header Theme securely
//     const headerTheme = useMemo((): HeaderTheme => {
//         if (!user?.role) return 'default';
//         if (user.role === 'learner') return 'student';
//         return user.role as HeaderTheme;
//     }, [user?.role]);

//     // ROBUST FILTER: Checks both sides of the relationship
//     const enrolledLearners = useMemo(() => {
//         return learners.filter(l => {
//             const hasCohortId = l.cohortId === cohortId;
//             const isInCohortArray = cohort?.learnerIds?.includes(l.id);
//             return hasCohortId || isInCohortArray;
//         });
//     }, [learners, cohort, cohortId]);

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (staff.length === 0) fetchStaff();
//     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

//     const fetchSubmissions = async () => {
//         if (!cohortId) return;
//         try {
//             const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
//             const snap = await getDocs(q);
//             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//         } catch (error) {
//             console.error("Error fetching submissions:", error);
//         }
//     };

//     useEffect(() => {
//         fetchSubmissions();
//     }, [cohortId]);

//     /**
//      * 🚀 BULLETPROOF SYNC WORKBOOKS FUNCTION WITH MODAL FEEDBACK 🚀
//      */
//     const syncLearnerWorkbooks = async () => {
//         if (!cohortId) return;
//         setIsSyncing(true);

//         try {
//             const batch = writeBatch(db);
//             const assessmentsRef = collection(db, 'assessments');

//             // 1. Fetch assessments mapped to this cohort (New Array format)
//             const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
//             const snapArray = await getDocs(qArray);

//             // 2. Fetch assessments mapped to this cohort (Legacy String format)
//             const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
//             const snapString = await getDocs(qString);

//             // Combine and deduplicate
//             const allAssessments = new Map();
//             snapArray.docs.forEach(d => allAssessments.set(d.id, d));
//             snapString.docs.forEach(d => allAssessments.set(d.id, d));

//             if (allAssessments.size === 0) {
//                 setIsSyncing(false);
//                 setModalConfig({
//                     isOpen: true,
//                     type: 'info',
//                     title: 'No Assessments Found',
//                     message: 'There are no active assessments published for this class yet. Nothing to sync.'
//                 });
//                 return;
//             }

//             let newDocsCount = 0;

//             // 3. Loop through learners and generate ONLY missing workbooks
//             // 3. Loop through learners and generate ONLY missing workbooks
//             for (const learner of enrolledLearners) {
//                 const enrolId = learner.enrollmentId || learner.id;
//                 const humanId = learner.learnerId || learner.id;

//                 for (const [astId, astDoc] of allAssessments.entries()) {

//                     // 🚀 THE SAFETY CHECK: Does this student already have this workbook FOR THIS SPECIFIC CLASS?
//                     const alreadyExists = submissions.some(s =>
//                         s.assessmentId === astId &&
//                         s.cohortId === cohortId && // 🚀 MUST MATCH THE COHORT
//                         (s.enrollmentId === enrolId || s.learnerId === humanId)
//                     );

//                     if (!alreadyExists) {
//                         const astData = astDoc.data();

//                         // 🚀 GUARANTEED UNIQUE ID (Cohort + Learner + Assessment)
//                         const submissionId = `${cohortId}_${humanId}_${astId}`;
//                         const subRef = doc(db, 'learner_submissions', submissionId);

//                         batch.set(subRef, {
//                             learnerId: humanId,
//                             enrollmentId: enrolId,
//                             qualificationName: learner.qualification?.name || '',
//                             assessmentId: astId,
//                             cohortId: cohortId, // 🚀 SAVE THE COHORT ID
//                             title: astData.title,
//                             type: astData.type || 'formative',
//                             moduleNumber: astData.moduleInfo?.moduleNumber || '',
//                             moduleType: astData.moduleType || 'knowledge',
//                             status: 'not_started',
//                             answers: {},
//                             assignedAt: new Date().toISOString(),
//                             totalMarks: astData.totalMarks || 0,
//                             marks: 0,
//                             createdAt: new Date().toISOString()
//                         });

//                         newDocsCount++;
//                     }
//                 }
//             }

//             if (newDocsCount > 0) {
//                 await batch.commit();
//                 await fetchSubmissions(); // Refresh the local state

//                 setModalConfig({
//                     isOpen: true,
//                     type: 'success',
//                     title: 'Sync Complete',
//                     message: `Successfully generated ${newDocsCount} missing workbook(s) for late-joining learners.`
//                 });
//             } else {
//                 setModalConfig({
//                     isOpen: true,
//                     type: 'success',
//                     title: 'Already Synced',
//                     message: 'All learners currently enrolled in this class are fully up-to-date with their assessment workbooks.'
//                 });
//             }

//         } catch (error: any) {
//             console.error("Sync Error:", error);
//             setModalConfig({
//                 isOpen: true,
//                 type: 'error',
//                 title: 'Sync Failed',
//                 message: `An error occurred while trying to sync workbooks: ${error.message}`
//             });
//         } finally {
//             setIsSyncing(false);
//         }
//     };

//     if (!cohort) {
//         return (
//             <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
//                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
//                 <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
//                     <div className="mlab-state mlab-state--loading">
//                         <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
//                         <span>Loading Cohort Details…</span>
//                     </div>
//                 </main>
//             </div>
//         );
//     }

//     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
//     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

//     // const handleDropLearner = async (learnerId: string, learnerName: string) => {
//     //     const reason = window.prompt(
//     //         `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
//     //     );
//     //     if (reason && reason.trim().length > 0) {
//     //         if (window.confirm(
//     //             `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
//     //         )) {
//     //             await dropLearner(learnerId, reason);
//     //         }
//     //     } else if (reason !== null) {
//     //         alert('Exit Reason is mandatory for QCTO compliance.');
//     //     }
//     // };


//     const handleDropLearner = async (learnerId: string, learnerName: string) => {
//         const reason = window.prompt(
//             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving ${cohort.name}?\n(e.g., Found Employment, Medical, Non-attendance)`
//         );

//         if (reason && reason.trim().length > 0) {
//             if (window.confirm(
//                 `Are you sure you want to mark ${learnerName} as DROPPED from THIS CLASS?\n\nReason: "${reason}"\n\nThis will not affect their other enrollments.`
//             )) {
//                 // Call the new store function, passing the exact Cohort ID
//                 await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
//             }
//         } else if (reason !== null) {
//             alert('Exit Reason is mandatory for QCTO compliance.');
//         }
//     };

//     const handleBackNavigation = () => {
//         if (isAdmin) {
//             navigate('/admin', { state: { activeTab: 'cohorts' } });
//         } else if (isFacilitator) {
//             navigate('/facilitator');
//         } else {
//             navigate(-1);
//         }
//     };

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

//             {/* 🚀 STATUS MODAL INJECTION 🚀 */}
//             {modalConfig.isOpen && (
//                 <StatusModal
//                     type={modalConfig.type}
//                     title={modalConfig.title}
//                     message={modalConfig.message}
//                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
//                     confirmText="Acknowledge"
//                 />
//             )}

//             <Sidebar
//                 role={user?.role}
//                 currentNav="cohorts"
//                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
//                 onLogout={() => navigate('/login')}
//             />

//             <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

//                 <PageHeader
//                     theme={headerTheme}
//                     variant="hero"
//                     eyebrow={`${cohort.name}`}
//                     title="Cohort Overview"
//                     description="Manage Class Progress, Attendance &amp; Exits."
//                     onBack={handleBackNavigation}
//                     backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
//                     status={{
//                         label: cohort.isArchived ? 'Archived' : 'Active Class',
//                         variant: cohort.isArchived ? 'draft' : 'active'
//                     }}
//                     actions={
//                         (isAdmin || isFacilitator) ? (
//                             <PageHeader.Btn
//                                 variant="outline"
//                                 onClick={syncLearnerWorkbooks}
//                                 disabled={isSyncing}
//                             >
//                                 {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
//                                 Sync Workbooks
//                             </PageHeader.Btn>
//                         ) : undefined
//                     }
//                 />

//                 <div className="admin-content" style={{ paddingBottom: '4rem' }}>

//                     {/* ── Summary Card ────────────────────────────────────── */}
//                     <div className="mlab-summary-card">
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">
//                                 <Calendar size={13} /> Training Dates
//                             </span>
//                             <span className="mlab-summary-item__value">
//                                 {cohort.startDate} — {cohort.endDate}
//                             </span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Facilitator</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Assessor</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Moderator</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
//                         </div>
//                     </div>

//                     {/* ── Enrolled Learners ────────────────────────────────── */}
//                     <div className="mlab-section">

//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
//                             <h3 className="mlab-section__title" style={{ margin: 0 }}>
//                                 <Users size={16} />
//                                 Enrolled Learners ({enrolledLearners.length})
//                             </h3>
//                         </div>

//                         {/* 🚀 LATE JOINER INFO BANNER 🚀 */}
//                         <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '1rem' }}>
//                             <Info size={18} color="#0284c7" style={{ marginTop: '2px' }} />
//                             <div>
//                                 <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0369a1' }}>Adding learners late?</h4>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#0c4a6e', lineHeight: 1.4 }}>
//                                     If a learner joined this class <strong>after</strong> assessments were published, click <strong>"Sync Workbooks"</strong> at the top of the page. This will generate their missing portfolios without affecting existing students' progress.
//                                 </p>
//                             </div>
//                         </div>

//                         <div className="mlab-table-wrap">
//                             <table className="mlab-table">
//                                 <thead>
//                                     <tr>
//                                         <th>Learner</th>
//                                         <th>Progress (Modules)</th>
//                                         <th>Status</th>
//                                         <th>Actions</th>
//                                     </tr>
//                                 </thead>
//                                 <tbody>
//                                     {enrolledLearners.map(learner => {
//                                         const isDropped = learner.status === 'dropped';

//                                         // Use enrollmentId if available, fallback to learnerId
//                                         const routingId = learner.enrollmentId || learner.id;

//                                         // Check for pending submissions
//                                         const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
//                                         const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

//                                         return (
//                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
//                                                 <td>
//                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
//                                                         {learner.fullName}
//                                                     </div>
//                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
//                                                         {learner.idNumber}
//                                                     </div>
//                                                     {/* Visual Alert if marking is pending */}
//                                                     {!isDropped && pendingMarking.length > 0 && (
//                                                         <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                             <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
//                                                         </div>
//                                                     )}
//                                                 </td>
//                                                 <td>
//                                                     <div className="mlab-module-chips">
//                                                         <span className="mlab-chip mlab-chip--k">
//                                                             K: {learner.knowledgeModules?.length || 0}
//                                                         </span>
//                                                         <span className="mlab-chip mlab-chip--p">
//                                                             P: {learner.practicalModules?.length || 0}
//                                                         </span>
//                                                     </div>
//                                                 </td>
//                                                 <td>
//                                                     {isDropped ? (
//                                                         <div className="mlab-dropped-status">
//                                                             <div className="mlab-dropped-status__label">
//                                                                 <XCircle size={13} /> Dropped
//                                                             </div>
//                                                             <div className="mlab-dropped-status__detail">
//                                                                 Reason: {learner.exitReason || 'Unknown'}
//                                                             </div>
//                                                             <div className="mlab-dropped-status__detail">
//                                                                 Date: {formatDate(learner.exitDate || null)}
//                                                             </div>
//                                                         </div>
//                                                     ) : (
//                                                         <span className="mlab-badge mlab-badge--active">
//                                                             <CheckCircle size={13} /> Active
//                                                         </span>
//                                                     )}
//                                                 </td>
//                                                 <td>
//                                                     {!isDropped && (
//                                                         <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                                             {isAdmin && (
//                                                                 <button
//                                                                     className="mlab-btn mlab-btn--outline-red"
//                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
//                                                                 >
//                                                                     <AlertTriangle size={13} /> Record Exit
//                                                                 </button>
//                                                             )}

//                                                             {/* <button
//                                                                 className="mlab-btn mlab-btn--outline-blue"
//                                                                 onClick={() => navigate(`/sor/${routingId}`)}
//                                                             >
//                                                                 <Eye size={13} /> View Portfolio
//                                                             </button> */}
//                                                             <button
//                                                                 className="mlab-btn mlab-btn--outline-blue"
//                                                                 // 🚀 CRITICAL FIX: We pass the cohort.id in the state!
//                                                                 onClick={() => navigate(`/sor/${routingId}`, { state: { cohortId: cohort.id } })}
//                                                             >
//                                                                 <Eye size={13} /> View Portfolio
//                                                             </button>

//                                                             {/* Quick Action to mark the script */}
//                                                             {pendingMarking.length > 0 && (isAdmin || isFacilitator) && (
//                                                                 <button
//                                                                     className="mlab-btn"
//                                                                     style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', gap: '4px', alignItems: 'center' }}
//                                                                     onClick={() => navigate(`/portfolio/submission/${pendingMarking[0].id}`)}
//                                                                 >
//                                                                     <PenTool size={13} /> Mark Script
//                                                                 </button>
//                                                             )}
//                                                         </div>
//                                                     )}
//                                                 </td>
//                                             </tr>
//                                         );
//                                     })}
//                                 </tbody>
//                             </table>
//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };

// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     Users, Calendar,
// //     Clock, XCircle, AlertTriangle, CheckCircle,
// //     Eye, Loader2, PenTool,
// //     RefreshCcw
// // } from 'lucide-react';
// // import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import './CohortDetailsPage.css';
// // import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';

// // export const CohortDetailsPage: React.FC = () => {
// //     const { cohortId } = useParams();
// //     const navigate = useNavigate();

// //     const {
// //         user, cohorts, learners, staff,
// //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// //     } = useStore();

// //     const [isSyncing, setIsSyncing] = useState(false);
// //     const [submissions, setSubmissions] = useState<any[]>([]);

// //     const isAdmin = user?.role === 'admin';
// //     const isFacilitator = user?.role === 'facilitator';
// //     const cohort = cohorts.find(c => c.id === cohortId);

// //     // Map user role to Header Theme securely
// //     const headerTheme = useMemo((): HeaderTheme => {
// //         if (!user?.role) return 'default';
// //         if (user.role === 'learner') return 'student';
// //         return user.role as HeaderTheme;
// //     }, [user?.role]);

// //     // ROBUST FILTER: Checks both sides of the relationship
// //     const enrolledLearners = useMemo(() => {
// //         return learners.filter(l => {
// //             const hasCohortId = l.cohortId === cohortId;
// //             const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// //             return hasCohortId || isInCohortArray;
// //         });
// //     }, [learners, cohort, cohortId]);

// //     useEffect(() => {
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //         if (staff.length === 0) fetchStaff();
// //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// //     // Fetch submissions to find any pending "Blue Pen" marking tasks
// //     useEffect(() => {
// //         const fetchSubmissions = async () => {
// //             if (!cohortId) return;
// //             try {
// //                 // Fetch all submissions for this specific cohort
// //                 const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
// //                 const snap = await getDocs(q);
// //                 setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //             } catch (error) {
// //                 console.error("Error fetching submissions:", error);
// //             }
// //         };
// //         fetchSubmissions();
// //     }, [cohortId]);

// //     /**
// //      * 🚀 POWER FUNCTION: Sync Workbooks
// //      * This scans all enrolled learners and creates any missing learner_submissions
// //      * for assessments linked to this cohort's qualification.
// //      */
// //     const syncLearnerWorkbooks = async () => {
// //         if (!cohort || !cohort.qualificationId) {
// //             alert("Qualification ID missing for this cohort. Cannot sync workbooks.");
// //             return;
// //         }

// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);

// //             // 1. Get all assessments for this qualification
// //             const assessmentsRef = collection(db, 'assessments');
// //             const q = query(assessmentsRef, where('qualificationId', '==', cohort.qualificationId));
// //             const assessmentSnaps = await getDocs(q);

// //             if (assessmentSnaps.empty) {
// //                 alert("No assessments found for this qualification.");
// //                 setIsSyncing(false);
// //                 return;
// //             }

// //             let newDocsCount = 0;

// //             // 2. Loop through learners and assessments
// //             for (const learner of enrolledLearners) {
// //                 for (const astDoc of assessmentSnaps.docs) {
// //                     const astData = astDoc.data();

// //                     // 🚀 USE ENROLLMENT ID FOR THE SUBMISSION MAPPING
// //                     const enrolId = learner.enrollmentId || learner.id;
// //                     const submissionId = `${enrolId}_${astDoc.id}`;

// //                     const subRef = doc(db, 'learner_submissions', submissionId);

// //                     batch.set(subRef, {
// //                         learnerId: learner.learnerId || learner.id,
// //                         enrollmentId: enrolId, // 🚀 CRITICAL
// //                         qualificationName: learner.qualification?.name || '', // 🚀 CRITICAL FOR FALLBACK
// //                         assessmentId: astDoc.id,
// //                         cohortId: cohortId,
// //                         title: astData.title,
// //                         type: astData.type,
// //                         moduleNumber: astData.moduleInfo?.moduleNumber || 'M1',
// //                         moduleType: astData.moduleInfo?.moduleType || 'knowledge',
// //                         status: 'not_started',
// //                         answers: {},
// //                         assignedAt: new Date().toISOString(),
// //                         totalMarks: astData.totalMarks || 0,
// //                         marks: 0,
// //                         competency: 'NYC'
// //                     }, { merge: true });

// //                     newDocsCount++;
// //                 }
// //             }

// //             await batch.commit();
// //             alert(`Sync Complete! Ensured workbooks are available for ${enrolledLearners.length} learners.`);
// //         } catch (error: any) {
// //             console.error("Sync Error:", error);
// //             alert("Failed to sync workbooks: " + error.message);
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     if (!cohort) {
// //         return (
// //             <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// //                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
// //                 <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
// //                     <div className="mlab-state mlab-state--loading">
// //                         <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
// //                         <span>Loading Cohort Details…</span>
// //                     </div>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         const reason = window.prompt(
// //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// //         );
// //         if (reason && reason.trim().length > 0) {
// //             if (window.confirm(
// //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// //             )) {
// //                 await dropLearner(learnerId, reason);
// //             }
// //         } else if (reason !== null) {
// //             alert('Exit Reason is mandatory for QCTO compliance.');
// //         }
// //     };

// //     const handleBackNavigation = () => {
// //         if (isAdmin) {
// //             navigate('/admin', { state: { activeTab: 'cohorts' } });
// //         } else if (isFacilitator) {
// //             navigate('/facilitator');
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav="cohorts"
// //                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
// //                 onLogout={() => navigate('/login')}
// //             />

// //             <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

// //                 <PageHeader
// //                     theme={headerTheme}
// //                     variant="hero"
// //                     eyebrow={`${cohort.name}`}
// //                     title="Cohort Overview"
// //                     description="Manage Class Progress, Attendance &amp; Exits."
// //                     onBack={handleBackNavigation}
// //                     backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
// //                     status={{
// //                         label: cohort.isArchived ? 'Archived' : 'Active Class',
// //                         variant: cohort.isArchived ? 'draft' : 'active'
// //                     }}
// //                     actions={
// //                         (isAdmin || isFacilitator) ? (
// //                             <PageHeader.Btn
// //                                 variant="outline"
// //                                 onClick={syncLearnerWorkbooks}
// //                                 disabled={isSyncing}
// //                             >
// //                                 {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
// //                                 Sync Workbooks
// //                             </PageHeader.Btn>
// //                         ) : undefined
// //                     }
// //                 />

// //                 <div className="admin-content" style={{ paddingBottom: '4rem' }}>

// //                     {/* ── Summary Card ────────────────────────────────────── */}
// //                     <div className="mlab-summary-card">
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">
// //                                 <Calendar size={13} /> Training Dates
// //                             </span>
// //                             <span className="mlab-summary-item__value">
// //                                 {cohort.startDate} — {cohort.endDate}
// //                             </span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Facilitator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Assessor</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Moderator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// //                         </div>
// //                     </div>

// //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// //                     <div className="mlab-section">
// //                         <h3 className="mlab-section__title">
// //                             <Users size={16} />
// //                             Enrolled Learners ({enrolledLearners.length})
// //                         </h3>

// //                         <div className="mlab-table-wrap">
// //                             <table className="mlab-table">
// //                                 <thead>
// //                                     <tr>
// //                                         <th>Learner</th>
// //                                         <th>Progress (Modules)</th>
// //                                         <th>Status</th>
// //                                         <th>Actions</th>
// //                                     </tr>
// //                                 </thead>
// //                                 <tbody>
// //                                     {enrolledLearners.map(learner => {
// //                                         const isDropped = learner.status === 'dropped';

// //                                         // Use enrollmentId if available, fallback to learnerId
// //                                         const routingId = learner.enrollmentId || learner.id;

// //                                         // Check for pending submissions
// //                                         const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// //                                         const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

// //                                         return (
// //                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// //                                                 <td>
// //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// //                                                         {learner.fullName}
// //                                                     </div>
// //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// //                                                         {learner.idNumber}
// //                                                     </div>
// //                                                     {/* Visual Alert if marking is pending */}
// //                                                     {!isDropped && pendingMarking.length > 0 && (
// //                                                         <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                             <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     <div className="mlab-module-chips">
// //                                                         <span className="mlab-chip mlab-chip--k">
// //                                                             K: {learner.knowledgeModules?.length || 0}
// //                                                         </span>
// //                                                         <span className="mlab-chip mlab-chip--p">
// //                                                             P: {learner.practicalModules?.length || 0}
// //                                                         </span>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     {isDropped ? (
// //                                                         <div className="mlab-dropped-status">
// //                                                             <div className="mlab-dropped-status__label">
// //                                                                 <XCircle size={13} /> Dropped
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Reason: {learner.exitReason || 'Unknown'}
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Date: {formatDate(learner.exitDate || null)}
// //                                                             </div>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <span className="mlab-badge mlab-badge--active">
// //                                                             <CheckCircle size={13} /> Active
// //                                                         </span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {!isDropped && (
// //                                                         <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// //                                                             {isAdmin && (
// //                                                                 <button
// //                                                                     className="mlab-btn mlab-btn--outline-red"
// //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// //                                                                 >
// //                                                                     <AlertTriangle size={13} /> Record Exit
// //                                                                 </button>
// //                                                             )}

// //                                                             {/* 🚀 CRITICAL FIX: Navigate using the specific enrollment ID */}
// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--outline-blue"
// //                                                                 onClick={() => navigate(`/sor/${routingId}`)}
// //                                                             >
// //                                                                 <Eye size={13} /> View Portfolio
// //                                                             </button>

// //                                                             {/* Quick Action to mark the script */}
// //                                                             {pendingMarking.length > 0 && (isAdmin || isFacilitator) && (
// //                                                                 <button
// //                                                                     className="mlab-btn"
// //                                                                     style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', gap: '4px', alignItems: 'center' }}
// //                                                                     onClick={() => navigate(`/portfolio/submission/${pendingMarking[0].id}`)}
// //                                                                 >
// //                                                                     <PenTool size={13} /> Mark Script
// //                                                                 </button>
// //                                                             )}
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })}
// //                                 </tbody>
// //                             </table>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };


// // import React, { useEffect, useState } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     ArrowLeft, Users, Calendar,
// //     Clock, XCircle, AlertTriangle, CheckCircle,
// //     Eye, Plus, Loader2, PenTool,
// //     RefreshCcw
// // } from 'lucide-react';
// // import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import './CohortDetailsPage.css';
// // import PageHeader from '../../components/common/PageHeader/PageHeader';

// // export const CohortDetailsPage: React.FC = () => {
// //     const { cohortId } = useParams();
// //     const navigate = useNavigate();

// //     const {
// //         user, cohorts, learners, staff,
// //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// //     } = useStore();

// //     const [showHistory, setShowHistory] = useState(false);
// //     const [isSyncing, setIsSyncing] = useState(false);

// //     // 🚀 NEW: State to hold all submissions for this cohort to check marking status
// //     const [submissions, setSubmissions] = useState<any[]>([]);

// //     const isAdmin = user?.role === 'admin';
// //     const isFacilitator = user?.role === 'facilitator';
// //     const cohort = cohorts.find(c => c.id === cohortId);

// //     // ROBUST FILTER: Checks both sides of the relationship
// //     const enrolledLearners = learners.filter(l => {
// //         const hasCohortId = l.cohortId === cohortId;
// //         const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// //         return hasCohortId || isInCohortArray;
// //     });

// //     useEffect(() => {
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //         if (staff.length === 0) fetchStaff();
// //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// //     // 🚀 NEW: Fetch submissions to find any pending "Blue Pen" marking tasks
// //     useEffect(() => {
// //         const fetchSubmissions = async () => {
// //             if (!cohortId) return;
// //             try {
// //                 // Fetch all submissions for this specific cohort
// //                 const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
// //                 const snap = await getDocs(q);
// //                 setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //             } catch (error) {
// //                 console.error("Error fetching submissions:", error);
// //             }
// //         };
// //         fetchSubmissions();
// //     }, [cohortId]);

// //     /**
// //      * 🚀 POWER FUNCTION: Sync Workbooks
// //      * This scans all enrolled learners and creates any missing learner_submissions
// //      * for assessments linked to this cohort's qualification.
// //      */
// //     const syncLearnerWorkbooks = async () => {
// //         if (!cohort || !cohort.qualificationId) {
// //             alert("Qualification ID missing for this cohort. Cannot sync workbooks.");
// //             return;
// //         }

// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);

// //             // 1. Get all assessments for this qualification
// //             const assessmentsRef = collection(db, 'assessments');
// //             const q = query(assessmentsRef, where('qualificationId', '==', cohort.qualificationId));
// //             const assessmentSnaps = await getDocs(q);

// //             if (assessmentSnaps.empty) {
// //                 alert("No assessments found for this qualification.");
// //                 setIsSyncing(false);
// //                 return;
// //             }

// //             let newDocsCount = 0;

// //             // 2. Loop through learners and assessments
// //             for (const learner of enrolledLearners) {
// //                 for (const astDoc of assessmentSnaps.docs) {
// //                     const astData = astDoc.data();
// //                     const submissionId = `${learner.id}_${astDoc.id}`;

// //                     // Check if doc exists locally (optional optimization) or just set with merge:false
// //                     const subRef = doc(db, 'learner_submissions', submissionId);

// //                     batch.set(subRef, {
// //                         learnerId: learner.id,
// //                         assessmentId: astDoc.id,
// //                         cohortId: cohortId,
// //                         title: astData.title,
// //                         type: astData.type,
// //                         moduleNumber: astData.moduleInfo?.moduleNumber || 'M1',
// //                         moduleType: astData.moduleInfo?.moduleType || 'knowledge',
// //                         status: 'not_started',
// //                         answers: {},
// //                         assignedAt: new Date().toISOString(),
// //                         totalMarks: astData.totalMarks || 0,
// //                         marks: 0,
// //                         competency: 'NYC'
// //                     }, { merge: true }); // Use merge:true to avoid overwriting existing progress

// //                     newDocsCount++;
// //                 }
// //             }

// //             await batch.commit();
// //             alert(`Sync Complete! Ensured workbooks are available for ${enrolledLearners.length} learners.`);
// //         } catch (error: any) {
// //             console.error("Sync Error:", error);
// //             alert("Failed to sync workbooks: " + error.message);
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     if (!cohort) {
// //         return <div className="mlab-loading">Loading Cohort Details…</div>;
// //     }

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         const reason = window.prompt(
// //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// //         );
// //         if (reason && reason.trim().length > 0) {
// //             if (window.confirm(
// //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// //             )) {
// //                 await dropLearner(learnerId, reason);
// //             }
// //         } else if (reason !== null) {
// //             alert('Exit Reason is mandatory for QCTO compliance.');
// //         }
// //     };

// //     const handleBackNavigation = () => {
// //         if (isAdmin) {
// //             navigate('/admin?tab=cohorts');
// //         } else if (isFacilitator) {
// //             navigate('/facilitator/dashboard');
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav="cohorts"
// //                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
// //                 onLogout={() => navigate('/login')}
// //             />

// //             <main className="main-wrapper" style={{ width: '100%', padding: '2rem', overflowY: 'auto' }}>

// //                 <PageHeader
// //                     eyebrow={`${cohort.name}`}
// //                     title="Cohort"
// //                     description="Manage Class Progress, Attendance &amp; Exits. Sync learner workbooks for new assessments."
// //                     actions={
// //                         <PageHeader.Btn
// //                             variant="primary"
// //                             onClick={syncLearnerWorkbooks}
// //                             disabled={isSyncing}
// //                         >
// //                             {isSyncing ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
// //                             Sync Learner Workbooks
// //                         </PageHeader.Btn>
// //                     }
// //                 />

// //                 {/* <header className="dashboard-header">
// //                     <button
// //                         type="button"
// //                         className="mlab-back-btn"
// //                         onClick={handleBackNavigation}
// //                     >
// //                         <ArrowLeft size={16} /> Back to Dashboard
// //                     </button>

// //                     <div className="mlab-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
// //                         <div>
// //                             <h1>{cohort.name}</h1>
// //                             <p>Manage Class Progress, Attendance &amp; Exits</p>
// //                         </div>

// //                         {(isAdmin || isFacilitator) && (
// //                             <button
// //                                 className={`mlab-btn ${isSyncing ? 'mlab-btn--disabled' : 'mlab-btn--green'}`}
// //                                 onClick={syncLearnerWorkbooks}
// //                                 disabled={isSyncing}
// //                                 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
// //                             >
// //                                 {isSyncing ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
// //                                 Sync Learner Workbooks
// //                             </button>
// //                         )}
// //                     </div>
// //                 </header> */}

// //                 <div className="admin-content">

// //                     {/* ── Summary Card ────────────────────────────────────── */}
// //                     <div className="mlab-summary-card">
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">
// //                                 <Calendar size={13} /> Training Dates
// //                             </span>
// //                             <span className="mlab-summary-item__value">
// //                                 {cohort.startDate} — {cohort.endDate}
// //                             </span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Facilitator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Assessor</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Moderator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// //                         </div>
// //                     </div>

// //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// //                     <div className="mlab-section">
// //                         <h3 className="mlab-section__title">
// //                             <Users size={16} />
// //                             Enrolled Learners ({enrolledLearners.length})
// //                         </h3>

// //                         <div className="mlab-table-wrap">
// //                             <table className="mlab-table">
// //                                 <thead>
// //                                     <tr>
// //                                         <th>Learner</th>
// //                                         <th>Progress (Modules)</th>
// //                                         <th>Status</th>
// //                                         <th>Actions</th>
// //                                     </tr>
// //                                 </thead>
// //                                 <tbody>
// //                                     {enrolledLearners.map(learner => {
// //                                         const isDropped = learner.status === 'dropped';

// //                                         // 🚀 NEW: Check for pending submissions
// //                                         const learnerSubs = submissions.filter(s => s.learnerId === learner.id);
// //                                         const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

// //                                         return (
// //                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// //                                                 <td>
// //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// //                                                         {learner.fullName}
// //                                                     </div>
// //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// //                                                         {learner.idNumber}
// //                                                     </div>
// //                                                     {/* 🚀 NEW: Visual Alert if marking is pending */}
// //                                                     {!isDropped && pendingMarking.length > 0 && (
// //                                                         <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                             <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     <div className="mlab-module-chips">
// //                                                         <span className="mlab-chip mlab-chip--k">
// //                                                             K: {learner.knowledgeModules?.length || 0}
// //                                                         </span>
// //                                                         <span className="mlab-chip mlab-chip--p">
// //                                                             P: {learner.practicalModules?.length || 0}
// //                                                         </span>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     {isDropped ? (
// //                                                         <div className="mlab-dropped-status">
// //                                                             <div className="mlab-dropped-status__label">
// //                                                                 <XCircle size={13} /> Dropped
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Reason: {learner.exitReason || 'Unknown'}
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Date: {formatDate(learner.exitDate || null)}
// //                                                             </div>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <span className="mlab-badge mlab-badge--active">
// //                                                             <CheckCircle size={13} /> Active
// //                                                         </span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {!isDropped && (
// //                                                         <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// //                                                             {isAdmin && (
// //                                                                 <button
// //                                                                     className="mlab-btn mlab-btn--outline-red"
// //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// //                                                                 >
// //                                                                     <AlertTriangle size={13} /> Record Exit
// //                                                                 </button>
// //                                                             )}
// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--outline-blue"
// //                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
// //                                                             >
// //                                                                 <Eye size={13} /> View Portfolio
// //                                                             </button>

// //                                                             {/* 🚀 NEW: Quick Action to mark the script */}
// //                                                             {pendingMarking.length > 0 && (isAdmin || isFacilitator) && (
// //                                                                 <button
// //                                                                     className="mlab-btn"
// //                                                                     style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', gap: '4px', alignItems: 'center' }}
// //                                                                     onClick={() => navigate(`/portfolio/submission/${pendingMarking[0].id}`)}
// //                                                                 >
// //                                                                     <PenTool size={13} /> Mark Script
// //                                                                 </button>
// //                                                             )}
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })}
// //                                 </tbody>
// //                             </table>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };

// // import React, { useEffect, useState } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     ArrowLeft, Users, Calendar,
// //     Clock, XCircle, AlertTriangle, CheckCircle,
// //     Eye, Plus, Loader2
// // } from 'lucide-react';
// // import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import './CohortDetailsPage.css';

// // export const CohortDetailsPage: React.FC = () => {
// //     const { cohortId } = useParams();
// //     const navigate = useNavigate();

// //     const {
// //         user, cohorts, learners, staff,
// //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// //     } = useStore();

// //     const [showHistory, setShowHistory] = useState(false);
// //     const [isSyncing, setIsSyncing] = useState(false);

// //     const isAdmin = user?.role === 'admin';
// //     const cohort = cohorts.find(c => c.id === cohortId);

// //     // ROBUST FILTER: Checks both sides of the relationship
// //     const enrolledLearners = learners.filter(l => {
// //         const hasCohortId = l.cohortId === cohortId;
// //         const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// //         return hasCohortId || isInCohortArray;
// //     });

// //     useEffect(() => {
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //         if (staff.length === 0) fetchStaff();
// //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// //     /**
// //      * 🚀 POWER FUNCTION: Sync Workbooks
// //      * This scans all enrolled learners and creates any missing learner_submissions
// //      * for assessments linked to this cohort's qualification.
// //      */
// //     const syncLearnerWorkbooks = async () => {
// //         if (!cohort || !cohort.qualificationId) {
// //             alert("Qualification ID missing for this cohort. Cannot sync workbooks.");
// //             return;
// //         }

// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);

// //             // 1. Get all assessments for this qualification
// //             const assessmentsRef = collection(db, 'assessments');
// //             const q = query(assessmentsRef, where('qualificationId', '==', cohort.qualificationId));
// //             const assessmentSnaps = await getDocs(q);

// //             if (assessmentSnaps.empty) {
// //                 alert("No assessments found for this qualification.");
// //                 setIsSyncing(false);
// //                 return;
// //             }

// //             let newDocsCount = 0;

// //             // 2. Loop through learners and assessments
// //             for (const learner of enrolledLearners) {
// //                 for (const astDoc of assessmentSnaps.docs) {
// //                     const astData = astDoc.data();
// //                     const submissionId = `${learner.id}_${astDoc.id}`;

// //                     // Check if doc exists locally (optional optimization) or just set with merge:false
// //                     const subRef = doc(db, 'learner_submissions', submissionId);

// //                     batch.set(subRef, {
// //                         learnerId: learner.id,
// //                         assessmentId: astDoc.id,
// //                         cohortId: cohortId,
// //                         title: astData.title,
// //                         type: astData.type,
// //                         moduleNumber: astData.moduleInfo?.moduleNumber || 'M1',
// //                         moduleType: astData.moduleInfo?.moduleType || 'knowledge',
// //                         status: 'not_started',
// //                         answers: {},
// //                         assignedAt: new Date().toISOString(),
// //                         totalMarks: astData.totalMarks || 0,
// //                         marks: 0,
// //                         competency: 'NYC'
// //                     }, { merge: true }); // Use merge:true to avoid overwriting existing progress

// //                     newDocsCount++;
// //                 }
// //             }

// //             await batch.commit();
// //             alert(`Sync Complete! Ensured workbooks are available for ${enrolledLearners.length} learners.`);
// //         } catch (error: any) {
// //             console.error("Sync Error:", error);
// //             alert("Failed to sync workbooks: " + error.message);
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     if (!cohort) {
// //         return <div className="mlab-loading">Loading Cohort Details…</div>;
// //     }

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         const reason = window.prompt(
// //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// //         );
// //         if (reason && reason.trim().length > 0) {
// //             if (window.confirm(
// //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// //             )) {
// //                 await dropLearner(learnerId, reason);
// //             }
// //         } else if (reason !== null) {
// //             alert('Exit Reason is mandatory for QCTO compliance.');
// //         }
// //     };

// //     const handleBackNavigation = () => {
// //         if (isAdmin) {
// //             navigate('/admin?tab=cohorts');
// //         } else if (user?.role === 'facilitator') {
// //             navigate('/facilitator/dashboard');
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav="cohorts"
// //                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
// //                 onLogout={() => navigate('/login')}
// //             />

// //             <main className="main-wrapper" style={{ width: '100%' }}>

// //                 <header className="dashboard-header">
// //                     <button
// //                         type="button"
// //                         className="mlab-back-btn"
// //                         onClick={handleBackNavigation}
// //                     >
// //                         <ArrowLeft size={16} /> Back to Dashboard
// //                     </button>

// //                     <div className="mlab-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
// //                         <div>
// //                             <h1>{cohort.name}</h1>
// //                             <p>Manage Class Progress, Attendance &amp; Exits</p>
// //                         </div>

// //                         {/* 🚀 Add Sync Button for Admin/Facilitator */}
// //                         {(isAdmin || user?.role === 'facilitator') && (
// //                             <button
// //                                 className={`mlab-btn ${isSyncing ? 'mlab-btn--disabled' : 'mlab-btn--green'}`}
// //                                 onClick={syncLearnerWorkbooks}
// //                                 disabled={isSyncing}
// //                                 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
// //                             >
// //                                 {isSyncing ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
// //                                 Sync Learner Workbooks
// //                             </button>
// //                         )}
// //                     </div>
// //                 </header>

// //                 <div className="admin-content">

// //                     {/* ── Summary Card ────────────────────────────────────── */}
// //                     <div className="mlab-summary-card">
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">
// //                                 <Calendar size={13} /> Training Dates
// //                             </span>
// //                             <span className="mlab-summary-item__value">
// //                                 {cohort.startDate} — {cohort.endDate}
// //                             </span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Facilitator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Assessor</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Moderator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// //                         </div>
// //                     </div>

// //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// //                     <div className="mlab-section">
// //                         <h3 className="mlab-section__title">
// //                             <Users size={16} />
// //                             Enrolled Learners ({enrolledLearners.length})
// //                         </h3>

// //                         <div className="mlab-table-wrap">
// //                             <table className="mlab-table">
// //                                 <thead>
// //                                     <tr>
// //                                         <th>Learner</th>
// //                                         <th>Progress (Modules)</th>
// //                                         <th>Status</th>
// //                                         <th>Actions</th>
// //                                     </tr>
// //                                 </thead>
// //                                 <tbody>
// //                                     {enrolledLearners.map(learner => {
// //                                         const isDropped = learner.status === 'dropped';
// //                                         return (
// //                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// //                                                 <td>
// //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// //                                                         {learner.fullName}
// //                                                     </div>
// //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// //                                                         {learner.idNumber}
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     <div className="mlab-module-chips">
// //                                                         <span className="mlab-chip mlab-chip--k">
// //                                                             K: {learner.knowledgeModules?.length || 0}
// //                                                         </span>
// //                                                         <span className="mlab-chip mlab-chip--p">
// //                                                             P: {learner.practicalModules?.length || 0}
// //                                                         </span>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     {isDropped ? (
// //                                                         <div className="mlab-dropped-status">
// //                                                             <div className="mlab-dropped-status__label">
// //                                                                 <XCircle size={13} /> Dropped
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Reason: {learner.exitReason || 'Unknown'}
// //                                                             </div>
// //                                                             <div className="mlab-dropped-status__detail">
// //                                                                 Date: {formatDate(learner.exitDate || null)}
// //                                                             </div>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <span className="mlab-badge mlab-badge--active">
// //                                                             <CheckCircle size={13} /> Active
// //                                                         </span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {!isDropped && (
// //                                                         <div style={{ display: 'flex', gap: '8px' }}>
// //                                                             {isAdmin && (
// //                                                                 <button
// //                                                                     className="mlab-btn mlab-btn--outline-red"
// //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// //                                                                 >
// //                                                                     <AlertTriangle size={13} /> Record Exit
// //                                                                 </button>
// //                                                             )}
// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--outline-blue"
// //                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
// //                                                             >
// //                                                                 <Eye size={13} /> View Portfolio
// //                                                             </button>
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })}
// //                                 </tbody>
// //                             </table>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };


// // // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// // // import React, { useEffect, useState } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     ArrowLeft, Users, Calendar,
// // //     Clock, XCircle, AlertTriangle, CheckCircle,
// // //     Eye
// // // } from 'lucide-react';
// // // import { useStore } from '../../store/useStore';
// // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // import './CohortDetailsPage.css';

// // // export const CohortDetailsPage: React.FC = () => {
// // //     const { cohortId } = useParams();
// // //     const navigate = useNavigate();

// // //     const {
// // //         user, cohorts, learners, staff,
// // //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// // //     } = useStore();

// // //     const [showHistory, setShowHistory] = useState(false);

// // //     const isAdmin = user?.role === 'admin';

// // //     const cohort = cohorts.find(c => c.id === cohortId);

// // //     // ✅ ROBUST FILTER: Checks both sides of the relationship
// // //     // It checks if the Learner has the cohortId OR if the Cohort's learnerIds array includes the Learner's id
// // //     const enrolledLearners = learners.filter(l => {
// // //         const hasCohortId = l.cohortId === cohortId;
// // //         const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// // //         return hasCohortId || isInCohortArray;
// // //     });

// // //     useEffect(() => {
// // //         if (cohorts.length === 0) fetchCohorts();
// // //         if (learners.length === 0) fetchLearners();
// // //         if (staff.length === 0) fetchStaff();
// // //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// // //     if (!cohort) {
// // //         return <div className="mlab-loading">Loading Cohort Details…</div>;
// // //     }

// // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // //         const reason = window.prompt(
// // //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// // //         );
// // //         if (reason && reason.trim().length > 0) {
// // //             if (window.confirm(
// // //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// // //             )) {
// // //                 await dropLearner(learnerId, reason);
// // //             }
// // //         } else if (reason !== null) {
// // //             alert('Exit Reason is mandatory for QCTO compliance.');
// // //         }
// // //     };

// // //     const handleBackNavigation = () => {
// // //         if (isAdmin) {
// // //             navigate('/admin?tab=cohorts');
// // //         } else if (user?.role === 'facilitator') {
// // //             navigate('/facilitator/dashboard');
// // //         } else {
// // //             navigate(-1);
// // //         }
// // //     };

// // //     return (
// // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// // //             <Sidebar
// // //                 currentNav="cohorts"
// // //                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
// // //                 onLogout={() => navigate('/login')}
// // //             />

// // //             <main className="main-wrapper" style={{ width: '100%' }}>

// // //                 <header className="dashboard-header">
// // //                     <button
// // //                         type="button"
// // //                         className="mlab-back-btn"
// // //                         onClick={handleBackNavigation}
// // //                     >
// // //                         <ArrowLeft size={16} /> Back to Dashboard
// // //                     </button>

// // //                     <div className="mlab-detail-header">
// // //                         <h1>{cohort.name}</h1>
// // //                         <p>Manage Class Progress, Attendance &amp; Exits</p>
// // //                     </div>
// // //                 </header>

// // //                 <div className="admin-content">

// // //                     {/* ── Summary Card ────────────────────────────────────── */}
// // //                     <div className="mlab-summary-card">
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">
// // //                                 <Calendar size={13} /> Training Dates
// // //                             </span>
// // //                             <span className="mlab-summary-item__value">
// // //                                 {cohort.startDate} — {cohort.endDate}
// // //                             </span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Facilitator</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Assessor</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Moderator</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// // //                         </div>
// // //                     </div>

// // //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// // //                     <div className="mlab-section">
// // //                         <h3 className="mlab-section__title">
// // //                             <Users size={16} />
// // //                             Enrolled Learners ({enrolledLearners.length})
// // //                         </h3>

// // //                         <div className="mlab-table-wrap">
// // //                             <table className="mlab-table">
// // //                                 <thead>
// // //                                     <tr>
// // //                                         <th>Learner</th>
// // //                                         <th>Progress (Modules)</th>
// // //                                         <th>Status</th>
// // //                                         <th>Actions</th>
// // //                                     </tr>
// // //                                 </thead>
// // //                                 <tbody>
// // //                                     {enrolledLearners.map(learner => {
// // //                                         const isDropped = learner.status === 'dropped';
// // //                                         return (
// // //                                             <tr
// // //                                                 key={learner.id}
// // //                                                 className={isDropped ? 'mlab-tr--dropped' : ''}
// // //                                             >
// // //                                                 <td>
// // //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// // //                                                         {learner.fullName}
// // //                                                     </div>
// // //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// // //                                                         {learner.idNumber}
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     <div className="mlab-module-chips">
// // //                                                         <span className="mlab-chip mlab-chip--k">
// // //                                                             K: {learner.knowledgeModules?.length || 0}
// // //                                                         </span>
// // //                                                         <span className="mlab-chip mlab-chip--p">
// // //                                                             P: {learner.practicalModules?.length || 0}
// // //                                                         </span>
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     {isDropped ? (
// // //                                                         <div className="mlab-dropped-status">
// // //                                                             <div className="mlab-dropped-status__label">
// // //                                                                 <XCircle size={13} /> Dropped
// // //                                                             </div>
// // //                                                             <div className="mlab-dropped-status__detail">
// // //                                                                 Reason: {learner.exitReason || 'Unknown'}
// // //                                                             </div>
// // //                                                             <div className="mlab-dropped-status__detail">
// // //                                                                 Date: {formatDate(learner.exitDate || null)}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     ) : (
// // //                                                         <span className="mlab-badge mlab-badge--active">
// // //                                                             <CheckCircle size={13} /> Active
// // //                                                         </span>
// // //                                                     )}
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     {!isDropped && (
// // //                                                         <div style={{ display: 'flex', gap: '8px' }}>
// // //                                                             {isAdmin && (
// // //                                                                 <button
// // //                                                                     className="mlab-btn mlab-btn--outline-red"
// // //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // //                                                                     title="Record Learner Exit"
// // //                                                                 >
// // //                                                                     <AlertTriangle size={13} /> Record Exit
// // //                                                                 </button>
// // //                                                             )}

// // //                                                             <button
// // //                                                                 className="mlab-btn mlab-btn--outline-blue"
// // //                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
// // //                                                                 title="View Learner Portfolio"
// // //                                                             >
// // //                                                                 <Eye size={13} /> View Portfolio
// // //                                                             </button>
// // //                                                         </div>
// // //                                                     )}
// // //                                                 </td>
// // //                                             </tr>
// // //                                         );
// // //                                     })}

// // //                                     {enrolledLearners.length === 0 && (
// // //                                         <tr>
// // //                                             <td colSpan={4} className="mlab-table-empty">
// // //                                                 No learners enrolled in this cohort yet.
// // //                                             </td>
// // //                                         </tr>
// // //                                     )}
// // //                                 </tbody>
// // //                             </table>
// // //                         </div>
// // //                     </div>

// // //                     {/* ── Staff Assignment History ─────────────────────────── */}
// // //                     <div className="mlab-history-section">
// // //                         <button
// // //                             className="mlab-history-toggle"
// // //                             onClick={() => setShowHistory(!showHistory)}
// // //                         >
// // //                             <Clock size={16} />
// // //                             {showHistory
// // //                                 ? 'Hide Staff Assignment History'
// // //                                 : 'View Staff Assignment History (Audit Trail)'}
// // //                         </button>

// // //                         {showHistory && (
// // //                             <div className="mlab-history-panel">
// // //                                 <table className="mlab-table">
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Role</th>
// // //                                             <th>Staff Member</th>
// // //                                             <th>Assigned Date</th>
// // //                                             <th>Removed Date</th>
// // //                                             <th>Reason for Change (Audit)</th>
// // //                                             <th>Status</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {cohort.staffHistory
// // //                                             ?.sort((a, b) =>
// // //                                                 new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
// // //                                             )
// // //                                             .map((entry, index) => (
// // //                                                 <tr
// // //                                                     key={index}
// // //                                                     className={entry.removedAt ? 'mlab-tr--faded' : ''}
// // //                                                 >
// // //                                                     <td className="mlab-audit-role">{entry.role}</td>
// // //                                                     <td>{getStaffName(entry.staffId)}</td>
// // //                                                     <td>{formatDate(entry.assignedAt)}</td>
// // //                                                     <td>{entry.removedAt ? formatDate(entry.removedAt) : '—'}</td>
// // //                                                     <td className="mlab-audit-reason">
// // //                                                         {entry.changeReason || 'Initial Assignment'}
// // //                                                     </td>
// // //                                                     <td>
// // //                                                         {entry.removedAt
// // //                                                             ? <span className="mlab-badge mlab-badge--previous">Previous</span>
// // //                                                             : <span className="mlab-badge mlab-badge--active">Active</span>
// // //                                                         }
// // //                                                     </td>
// // //                                                 </tr>
// // //                                             ))}

// // //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// // //                                             <tr>
// // //                                                 <td colSpan={6} className="mlab-table-empty">
// // //                                                     No history recorded for this cohort.
// // //                                                 </td>
// // //                                             </tr>
// // //                                         )}
// // //                                     </tbody>
// // //                                 </table>
// // //                             </div>
// // //                         )}
// // //                     </div>

// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };

// // // // import React, { useEffect, useState } from 'react';
// // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // import {
// // // //     ArrowLeft, Users, BookOpen, Calendar,
// // // //     Clock, XCircle, AlertTriangle, CheckCircle,
// // // //     Eye
// // // // } from 'lucide-react';
// // // // import { useStore } from '../../store/useStore';
// // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // import './CohortDetailsPage.css';

// // // // export const CohortDetailsPage: React.FC = () => {
// // // //     const { cohortId } = useParams();
// // // //     const navigate = useNavigate();

// // // //     // ✅ Destructure user to implement Role-Based Access Control (RBAC)
// // // //     const {
// // // //         user, cohorts, learners, staff,
// // // //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// // // //     } = useStore();

// // // //     const [showHistory, setShowHistory] = useState(false);

// // // //     // ✅ Determine if the current user is an Admin
// // // //     const isAdmin = user?.role === 'admin';

// // // //     const cohort = cohorts.find(c => c.id === cohortId);

// // // //     // ✅ CRITICAL FIX: Filter by the learner's cohortId property!
// // // //     const enrolledLearners = learners.filter(l => l.cohortId === cohortId);

// // // //     useEffect(() => {
// // // //         if (cohorts.length === 0) fetchCohorts();
// // // //         if (learners.length === 0) fetchLearners();
// // // //         if (staff.length === 0) fetchStaff();
// // // //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// // // //     if (!cohort) {
// // // //         return <div className="mlab-loading">Loading Cohort Details…</div>;
// // // //     }

// // // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // // //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// // // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // // //         const reason = window.prompt(
// // // //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// // // //         );
// // // //         if (reason && reason.trim().length > 0) {
// // // //             if (window.confirm(
// // // //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// // // //             )) {
// // // //                 await dropLearner(learnerId, reason);
// // // //             }
// // // //         } else if (reason !== null) {
// // // //             alert('Exit Reason is mandatory for QCTO compliance.');
// // // //         }
// // // //     };

// // // //     // Determine fallback routing based on role
// // // //     const handleBackNavigation = () => {
// // // //         if (isAdmin) {
// // // //             navigate('/admin?tab=cohorts');
// // // //         } else if (user?.role === 'facilitator') {
// // // //             navigate('/facilitator/dashboard');
// // // //         } else {
// // // //             navigate(-1); // Go back to previous page for assessors/moderators
// // // //         }
// // // //     };

// // // //     return (
// // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// // // //             <Sidebar
// // // //                 currentNav="cohorts"
// // // //                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
// // // //                 onLogout={() => navigate('/login')}
// // // //             />

// // // //             <main className="main-wrapper" style={{ width: '100%' }}>

// // // //                 <header className="dashboard-header">

// // // //                     {/* ── Back Button ─────────────────────────────────────── */}
// // // //                     <button
// // // //                         type="button"
// // // //                         className="mlab-back-btn"
// // // //                         onClick={handleBackNavigation}
// // // //                     >
// // // //                         <ArrowLeft size={16} /> Back to Dashboard
// // // //                     </button>

// // // //                     {/* ── Page Title ──────────────────────────────────────── */}
// // // //                     <div className="mlab-detail-header">
// // // //                         <h1>{cohort.name}</h1>
// // // //                         <p>Manage Class Progress, Attendance &amp; Exits</p>
// // // //                     </div>
// // // //                 </header>

// // // //                 <div className="admin-content">

// // // //                     {/* ── Summary Card ────────────────────────────────────── */}
// // // //                     <div className="mlab-summary-card">
// // // //                         <div className="mlab-summary-item">
// // // //                             <span className="mlab-summary-item__label">
// // // //                                 <Calendar size={13} /> Training Dates
// // // //                             </span>
// // // //                             <span className="mlab-summary-item__value">
// // // //                                 {cohort.startDate} — {cohort.endDate}
// // // //                             </span>
// // // //                         </div>
// // // //                         <div className="mlab-summary-item">
// // // //                             <span className="mlab-summary-item__label">Facilitator</span>
// // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// // // //                         </div>
// // // //                         <div className="mlab-summary-item">
// // // //                             <span className="mlab-summary-item__label">Assessor</span>
// // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// // // //                         </div>
// // // //                         <div className="mlab-summary-item">
// // // //                             <span className="mlab-summary-item__label">Moderator</span>
// // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// // // //                     <div className="mlab-section">
// // // //                         <h3 className="mlab-section__title">
// // // //                             <Users size={16} />
// // // //                             Enrolled Learners ({enrolledLearners.length})
// // // //                         </h3>

// // // //                         <div className="mlab-table-wrap">
// // // //                             <table className="mlab-table">
// // // //                                 <thead>
// // // //                                     <tr>
// // // //                                         <th>Learner</th>
// // // //                                         <th>Progress (Modules)</th>
// // // //                                         <th>Status</th>
// // // //                                         <th>Actions</th>
// // // //                                     </tr>
// // // //                                 </thead>
// // // //                                 <tbody>
// // // //                                     {enrolledLearners.map(learner => {
// // // //                                         const isDropped = learner.status === 'dropped';
// // // //                                         return (
// // // //                                             <tr
// // // //                                                 key={learner.id}
// // // //                                                 className={isDropped ? 'mlab-tr--dropped' : ''}
// // // //                                             >
// // // //                                                 {/* Learner */}
// // // //                                                 <td>
// // // //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// // // //                                                         {learner.fullName}
// // // //                                                     </div>
// // // //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// // // //                                                         {learner.idNumber}
// // // //                                                     </div>
// // // //                                                 </td>

// // // //                                                 {/* Modules */}
// // // //                                                 <td>
// // // //                                                     <div className="mlab-module-chips">
// // // //                                                         <span className="mlab-chip mlab-chip--k">
// // // //                                                             K: {learner.knowledgeModules.length}
// // // //                                                         </span>
// // // //                                                         <span className="mlab-chip mlab-chip--p">
// // // //                                                             P: {learner.practicalModules.length}
// // // //                                                         </span>
// // // //                                                     </div>
// // // //                                                 </td>

// // // //                                                 {/* Status */}
// // // //                                                 <td>
// // // //                                                     {isDropped ? (
// // // //                                                         <div className="mlab-dropped-status">
// // // //                                                             <div className="mlab-dropped-status__label">
// // // //                                                                 <XCircle size={13} /> Dropped
// // // //                                                             </div>
// // // //                                                             <div className="mlab-dropped-status__detail">
// // // //                                                                 Reason: {learner.exitReason || 'Unknown'}
// // // //                                                             </div>
// // // //                                                             <div className="mlab-dropped-status__detail">
// // // //                                                                 Date: {formatDate(learner.exitDate || null)}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     ) : (
// // // //                                                         <span className="mlab-badge mlab-badge--active">
// // // //                                                             <CheckCircle size={13} /> Active
// // // //                                                         </span>
// // // //                                                     )}
// // // //                                                 </td>

// // // //                                                 {/* Actions */}
// // // //                                                 <td>
// // // //                                                     {!isDropped && (
// // // //                                                         <div style={{ display: 'flex', gap: '8px' }}>
// // // //                                                             {/* ✅ ADMIN ONLY: Drop Learner */}
// // // //                                                             {isAdmin && (
// // // //                                                                 <button
// // // //                                                                     className="mlab-btn mlab-btn--outline-red"
// // // //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // // //                                                                     title="Record Learner Exit"
// // // //                                                                 >
// // // //                                                                     <AlertTriangle size={13} /> Record Exit
// // // //                                                                 </button>
// // // //                                                             )}

// // // //                                                             {/* ✅ EVERYONE ELSE (OR ADMIN TOO): View Portfolio */}
// // // //                                                             <button
// // // //                                                                 className="mlab-btn mlab-btn--outline-blue"
// // // //                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
// // // //                                                                 title="View Learner Portfolio"
// // // //                                                             >
// // // //                                                                 <Eye size={13} /> View Portfolio
// // // //                                                             </button>
// // // //                                                         </div>
// // // //                                                     )}
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         );
// // // //                                     })}

// // // //                                     {enrolledLearners.length === 0 && (
// // // //                                         <tr>
// // // //                                             <td colSpan={4} className="mlab-table-empty">
// // // //                                                 No learners enrolled in this cohort yet.
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     )}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* ── Staff Assignment History ─────────────────────────── */}
// // // //                     <div className="mlab-history-section">
// // // //                         <button
// // // //                             className="mlab-history-toggle"
// // // //                             onClick={() => setShowHistory(!showHistory)}
// // // //                         >
// // // //                             <Clock size={16} />
// // // //                             {showHistory
// // // //                                 ? 'Hide Staff Assignment History'
// // // //                                 : 'View Staff Assignment History (Audit Trail)'}
// // // //                         </button>

// // // //                         {showHistory && (
// // // //                             <div className="mlab-history-panel">
// // // //                                 <table className="mlab-table">
// // // //                                     <thead>
// // // //                                         <tr>
// // // //                                             <th>Role</th>
// // // //                                             <th>Staff Member</th>
// // // //                                             <th>Assigned Date</th>
// // // //                                             <th>Removed Date</th>
// // // //                                             <th>Reason for Change (Audit)</th>
// // // //                                             <th>Status</th>
// // // //                                         </tr>
// // // //                                     </thead>
// // // //                                     <tbody>
// // // //                                         {cohort.staffHistory
// // // //                                             ?.sort((a, b) =>
// // // //                                                 new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
// // // //                                             )
// // // //                                             .map((entry, index) => (
// // // //                                                 <tr
// // // //                                                     key={index}
// // // //                                                     className={entry.removedAt ? 'mlab-tr--faded' : ''}
// // // //                                                 >
// // // //                                                     <td className="mlab-audit-role">{entry.role}</td>
// // // //                                                     <td>{getStaffName(entry.staffId)}</td>
// // // //                                                     <td>{formatDate(entry.assignedAt)}</td>
// // // //                                                     <td>{entry.removedAt ? formatDate(entry.removedAt) : '—'}</td>
// // // //                                                     <td className="mlab-audit-reason">
// // // //                                                         {entry.changeReason || 'Initial Assignment'}
// // // //                                                     </td>
// // // //                                                     <td>
// // // //                                                         {entry.removedAt
// // // //                                                             ? <span className="mlab-badge mlab-badge--previous">Previous</span>
// // // //                                                             : <span className="mlab-badge mlab-badge--active">Active</span>
// // // //                                                         }
// // // //                                                     </td>
// // // //                                                 </tr>
// // // //                                             ))}

// // // //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// // // //                                             <tr>
// // // //                                                 <td colSpan={6} className="mlab-table-empty">
// // // //                                                     No history recorded for this cohort.
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         )}
// // // //                                     </tbody>
// // // //                                 </table>
// // // //                             </div>
// // // //                         )}
// // // //                     </div>

// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };


// // // // // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx
// // // // // // Styled to align with mLab Corporate Identity Brand Guide 2019
// // // // // // All visual styling lives in CohortDetailsPage.css

// // // // // import React, { useEffect, useState } from 'react';
// // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // import {
// // // // //     ArrowLeft, Users, BookOpen, Calendar,
// // // // //     Clock, XCircle, AlertTriangle, CheckCircle
// // // // // } from 'lucide-react';
// // // // // import { useStore } from '../../store/useStore';
// // // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // // import './CohortDetailsPage.css';

// // // // // export const CohortDetailsPage: React.FC = () => {
// // // // //     const { cohortId } = useParams();
// // // // //     const navigate = useNavigate();
// // // // //     const { cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff, dropLearner } = useStore();

// // // // //     const [showHistory, setShowHistory] = useState(false);

// // // // //     const cohort = cohorts.find(c => c.id === cohortId);
// // // // //     const enrolledLearners = learners.filter(l => cohort?.learnerIds.includes(l.id));

// // // // //     useEffect(() => {
// // // // //         if (cohorts.length === 0) fetchCohorts();
// // // // //         if (learners.length === 0) fetchLearners();
// // // // //         if (staff.length === 0) fetchStaff();
// // // // //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// // // // //     if (!cohort) {
// // // // //         return <div className="mlab-loading">Loading Cohort Details…</div>;
// // // // //     }

// // // // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // // // //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// // // // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // // // //         const reason = window.prompt(
// // // // //             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
// // // // //         );
// // // // //         if (reason && reason.trim().length > 0) {
// // // // //             if (window.confirm(
// // // // //                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
// // // // //             )) {
// // // // //                 await dropLearner(learnerId, reason);
// // // // //             }
// // // // //         } else if (reason !== null) {
// // // // //             alert('Exit Reason is mandatory for QCTO compliance.');
// // // // //         }
// // // // //     };

// // // // //     return (
// // // // //         // <div className="admin-layout">
// // // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// // // // //             <Sidebar
// // // // //                 currentNav="cohorts"
// // // // //                 setCurrentNav={nav => navigate(`/admin?tab=${nav}`)}
// // // // //                 onLogout={() => navigate('/login')}
// // // // //             />

// // // // //             {/* <main className="main-wrapper"> */}
// // // // //             <main className="main-wrapper" style={{ width: '100%' }}>

// // // // //                 <header className="dashboard-header">

// // // // //                     {/* ── Back Button ─────────────────────────────────────── */}
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         className="mlab-back-btn"
// // // // //                         onClick={() => navigate('/admin?tab=cohorts')}
// // // // //                     >
// // // // //                         <ArrowLeft size={16} /> Back to Dashboard
// // // // //                     </button>

// // // // //                     {/* ── Page Title ──────────────────────────────────────── */}
// // // // //                     <div className="mlab-detail-header">
// // // // //                         <h1>{cohort.name}</h1>
// // // // //                         <p>Manage Class Progress, Attendance &amp; Exits</p>
// // // // //                     </div>
// // // // //                 </header>

// // // // //                 <div className="admin-content">

// // // // //                     {/* ── Summary Card ────────────────────────────────────── */}
// // // // //                     <div className="mlab-summary-card">
// // // // //                         <div className="mlab-summary-item">
// // // // //                             <span className="mlab-summary-item__label">
// // // // //                                 <Calendar size={13} /> Training Dates
// // // // //                             </span>
// // // // //                             <span className="mlab-summary-item__value">
// // // // //                                 {cohort.startDate} — {cohort.endDate}
// // // // //                             </span>
// // // // //                         </div>
// // // // //                         <div className="mlab-summary-item">
// // // // //                             <span className="mlab-summary-item__label">Facilitator</span>
// // // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// // // // //                         </div>
// // // // //                         <div className="mlab-summary-item">
// // // // //                             <span className="mlab-summary-item__label">Assessor</span>
// // // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// // // // //                         </div>
// // // // //                         <div className="mlab-summary-item">
// // // // //                             <span className="mlab-summary-item__label">Moderator</span>
// // // // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* ── Enrolled Learners ────────────────────────────────── */}
// // // // //                     <div className="mlab-section">
// // // // //                         <h3 className="mlab-section__title">
// // // // //                             <Users size={16} />
// // // // //                             Enrolled Learners ({enrolledLearners.length})
// // // // //                         </h3>

// // // // //                         <div className="mlab-table-wrap">
// // // // //                             <table className="mlab-table">
// // // // //                                 <thead>
// // // // //                                     <tr>
// // // // //                                         <th>Learner</th>
// // // // //                                         <th>Progress (Modules)</th>
// // // // //                                         <th>Status</th>
// // // // //                                         <th>Actions</th>
// // // // //                                     </tr>
// // // // //                                 </thead>
// // // // //                                 <tbody>
// // // // //                                     {enrolledLearners.map(learner => {
// // // // //                                         const isDropped = learner.status === 'dropped';
// // // // //                                         return (
// // // // //                                             <tr
// // // // //                                                 key={learner.id}
// // // // //                                                 className={isDropped ? 'mlab-tr--dropped' : ''}
// // // // //                                             >
// // // // //                                                 {/* Learner */}
// // // // //                                                 <td>
// // // // //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// // // // //                                                         {learner.fullName}
// // // // //                                                     </div>
// // // // //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// // // // //                                                         {learner.idNumber}
// // // // //                                                     </div>
// // // // //                                                 </td>

// // // // //                                                 {/* Modules */}
// // // // //                                                 <td>
// // // // //                                                     <div className="mlab-module-chips">
// // // // //                                                         <span className="mlab-chip mlab-chip--k">
// // // // //                                                             K: {learner.knowledgeModules.length}
// // // // //                                                         </span>
// // // // //                                                         <span className="mlab-chip mlab-chip--p">
// // // // //                                                             P: {learner.practicalModules.length}
// // // // //                                                         </span>
// // // // //                                                     </div>
// // // // //                                                 </td>

// // // // //                                                 {/* Status */}
// // // // //                                                 <td>
// // // // //                                                     {isDropped ? (
// // // // //                                                         <div className="mlab-dropped-status">
// // // // //                                                             <div className="mlab-dropped-status__label">
// // // // //                                                                 <XCircle size={13} /> Dropped
// // // // //                                                             </div>
// // // // //                                                             <div className="mlab-dropped-status__detail">
// // // // //                                                                 Reason: {learner.exitReason || 'Unknown'}
// // // // //                                                             </div>
// // // // //                                                             <div className="mlab-dropped-status__detail">
// // // // //                                                                 Date: {formatDate(learner.exitDate || null)}
// // // // //                                                             </div>
// // // // //                                                         </div>
// // // // //                                                     ) : (
// // // // //                                                         <span className="mlab-badge mlab-badge--active">
// // // // //                                                             <CheckCircle size={13} /> Active
// // // // //                                                         </span>
// // // // //                                                     )}
// // // // //                                                 </td>

// // // // //                                                 {/* Actions */}
// // // // //                                                 <td>
// // // // //                                                     {!isDropped && (
// // // // //                                                         <button
// // // // //                                                             className="mlab-btn mlab-btn--outline-red"
// // // // //                                                             onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // // // //                                                             title="Record Learner Exit"
// // // // //                                                         >
// // // // //                                                             <AlertTriangle size={13} /> Record Exit
// // // // //                                                         </button>
// // // // //                                                     )}
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         );
// // // // //                                     })}

// // // // //                                     {enrolledLearners.length === 0 && (
// // // // //                                         <tr>
// // // // //                                             <td colSpan={4} className="mlab-table-empty">
// // // // //                                                 No learners enrolled in this cohort yet.
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     )}
// // // // //                                 </tbody>
// // // // //                             </table>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* ── Staff Assignment History ─────────────────────────── */}
// // // // //                     <div className="mlab-history-section">
// // // // //                         <button
// // // // //                             className="mlab-history-toggle"
// // // // //                             onClick={() => setShowHistory(!showHistory)}
// // // // //                         >
// // // // //                             <Clock size={16} />
// // // // //                             {showHistory
// // // // //                                 ? 'Hide Staff Assignment History'
// // // // //                                 : 'View Staff Assignment History (Audit Trail)'}
// // // // //                         </button>

// // // // //                         {showHistory && (
// // // // //                             <div className="mlab-history-panel">
// // // // //                                 <table className="mlab-table">
// // // // //                                     <thead>
// // // // //                                         <tr>
// // // // //                                             <th>Role</th>
// // // // //                                             <th>Staff Member</th>
// // // // //                                             <th>Assigned Date</th>
// // // // //                                             <th>Removed Date</th>
// // // // //                                             <th>Reason for Change (Audit)</th>
// // // // //                                             <th>Status</th>
// // // // //                                         </tr>
// // // // //                                     </thead>
// // // // //                                     <tbody>
// // // // //                                         {cohort.staffHistory
// // // // //                                             ?.sort((a, b) =>
// // // // //                                                 new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
// // // // //                                             )
// // // // //                                             .map((entry, index) => (
// // // // //                                                 <tr
// // // // //                                                     key={index}
// // // // //                                                     className={entry.removedAt ? 'mlab-tr--faded' : ''}
// // // // //                                                 >
// // // // //                                                     <td className="mlab-audit-role">{entry.role}</td>
// // // // //                                                     <td>{getStaffName(entry.staffId)}</td>
// // // // //                                                     <td>{formatDate(entry.assignedAt)}</td>
// // // // //                                                     <td>{entry.removedAt ? formatDate(entry.removedAt) : '—'}</td>
// // // // //                                                     <td className="mlab-audit-reason">
// // // // //                                                         {entry.changeReason || 'Initial Assignment'}
// // // // //                                                     </td>
// // // // //                                                     <td>
// // // // //                                                         {entry.removedAt
// // // // //                                                             ? <span className="mlab-badge mlab-badge--previous">Previous</span>
// // // // //                                                             : <span className="mlab-badge mlab-badge--active">Active</span>
// // // // //                                                         }
// // // // //                                                     </td>
// // // // //                                                 </tr>
// // // // //                                             ))}

// // // // //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// // // // //                                             <tr>
// // // // //                                                 <td colSpan={6} className="mlab-table-empty">
// // // // //                                                     No history recorded for this cohort.
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         )}
// // // // //                                     </tbody>
// // // // //                                 </table>
// // // // //                             </div>
// // // // //                         )}
// // // // //                     </div>

// // // // //                 </div>
// // // // //             </main>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // // import React, { useEffect, useState } from 'react';
// // // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // // import { ArrowLeft, Users, BookOpen, Calendar, Clock, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
// // // // // // import { useStore } from '../../store/useStore';
// // // // // // import { Sidebar } from '../../components/dashboard/Sidebar';

// // // // // // export const CohortDetailsPage: React.FC = () => {
// // // // // //     const { cohortId } = useParams();
// // // // // //     const navigate = useNavigate();
// // // // // //     const { cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff, dropLearner } = useStore();

// // // // // //     // Local UI State
// // // // // //     const [showHistory, setShowHistory] = useState(false);

// // // // // //     // Find the specific cohort
// // // // // //     const cohort = cohorts.find(c => c.id === cohortId);

// // // // // //     // Filter learners enrolled in this cohort
// // // // // //     const enrolledLearners = learners.filter(l => cohort?.learnerIds.includes(l.id));

// // // // // //     // Load data if missing (e.g., on refresh)
// // // // // //     useEffect(() => {
// // // // // //         if (cohorts.length === 0) fetchCohorts();
// // // // // //         if (learners.length === 0) fetchLearners();
// // // // // //         if (staff.length === 0) fetchStaff();
// // // // // //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// // // // // //     if (!cohort) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading Cohort Details...</div>;

// // // // // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // // // // //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// // // // // //     // --- HANDLER: DROP LEARNER (QCTO EXIT) ---
// // // // // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // // // // //         const reason = window.prompt(`QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`);

// // // // // //         if (reason && reason.trim().length > 0) {
// // // // // //             if (window.confirm(`Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`)) {
// // // // // //                 await dropLearner(learnerId, reason);
// // // // // //             }
// // // // // //         } else if (reason !== null) {
// // // // // //             alert("Exit Reason is mandatory for QCTO compliance.");
// // // // // //         }
// // // // // //     };

// // // // // //     return (
// // // // // //         <div className="admin-layout">
// // // // // //             <Sidebar
// // // // // //                 currentNav="cohorts"
// // // // // //                 setCurrentNav={(nav) => navigate(`/admin?tab=${nav}`)}
// // // // // //                 onLogout={() => navigate('/login')}
// // // // // //             />

// // // // // //             <main className="main-wrapper">
// // // // // //                 <header className="dashboard-header">
// // // // // //                     {/* BACK BUTTON (Corrected Navigation) */}
// // // // // //                     <button
// // // // // //                         type="button"
// // // // // //                         onClick={() => navigate('/admin?tab=cohorts')}
// // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1rem', color: '#64748b', fontSize: '0.9rem' }}
// // // // // //                     >
// // // // // //                         <ArrowLeft size={18} /> Back to Dashboard
// // // // // //                     </button>

// // // // // //                     <div className="header-title">
// // // // // //                         <h1>{cohort.name}</h1>
// // // // // //                         <p>Manage Class Progress, Attendance & Exits</p>
// // // // // //                     </div>
// // // // // //                 </header>

// // // // // //                 <div className="admin-content">
// // // // // //                     {/* --- COHORT SUMMARY CARD --- */}
// // // // // //                     <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', color: '#64748b', marginBottom: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', border: '1px solid #e2e8f0', alignItems: 'center' }}>
// // // // // //                         <div style={{ paddingRight: '2rem', borderRight: '1px solid #f1f5f9' }}>
// // // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
// // // // // //                                 <Calendar size={14} /> Training Dates
// // // // // //                             </div>
// // // // // //                             <div style={{ fontWeight: 600, marginTop: '4px' }}>{cohort.startDate} — {cohort.endDate}</div>
// // // // // //                         </div>

// // // // // //                         <div>
// // // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Facilitator (Blue)</div>
// // // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.facilitatorId)}</div>
// // // // // //                         </div>
// // // // // //                         <div>
// // // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Assessor (Red)</div>
// // // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.assessorId)}</div>
// // // // // //                         </div>
// // // // // //                         <div>
// // // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Moderator (Green)</div>
// // // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.moderatorId)}</div>
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {/* --- ENROLLED LEARNERS TABLE --- */}
// // // // // //                     <div className="list-view">
// // // // // //                         <h3 style={{ marginBottom: '1rem' }}>Enrolled Learners ({enrolledLearners.length})</h3>
// // // // // //                         <table className="assessment-table">
// // // // // //                             <thead>
// // // // // //                                 <tr>
// // // // // //                                     <th>Learner</th>
// // // // // //                                     <th>Progress (Modules)</th>
// // // // // //                                     <th>Status</th>
// // // // // //                                     <th>Actions</th>
// // // // // //                                 </tr>
// // // // // //                             </thead>
// // // // // //                             <tbody>
// // // // // //                                 {enrolledLearners.map(learner => {
// // // // // //                                     const isDropped = learner.status === 'dropped';

// // // // // //                                     return (
// // // // // //                                         <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : 'transparent', opacity: isDropped ? 0.8 : 1 }}>
// // // // // //                                             <td>
// // // // // //                                                 <div style={{ fontWeight: 600, color: isDropped ? '#991b1b' : 'inherit' }}>
// // // // // //                                                     {learner.fullName}
// // // // // //                                                 </div>
// // // // // //                                                 <div style={{ fontSize: '0.8rem', color: isDropped ? '#b91c1c' : '#64748b' }}>
// // // // // //                                                     {learner.idNumber}
// // // // // //                                                 </div>
// // // // // //                                             </td>

// // // // // //                                             <td>
// // // // // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // // // //                                                     <span style={{ fontSize: '0.8rem', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', color: '#0369a1' }}>
// // // // // //                                                         K: {learner.knowledgeModules.length}
// // // // // //                                                     </span>
// // // // // //                                                     <span style={{ fontSize: '0.8rem', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', color: '#0369a1' }}>
// // // // // //                                                         P: {learner.practicalModules.length}
// // // // // //                                                     </span>
// // // // // //                                                 </div>
// // // // // //                                             </td>

// // // // // //                                             <td>
// // // // // //                                                 {isDropped ? (
// // // // // //                                                     <div style={{ fontSize: '0.85rem', color: '#ef4444' }}>
// // // // // //                                                         <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // // //                                                             <XCircle size={14} /> DROPPED
// // // // // //                                                         </div>
// // // // // //                                                         <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
// // // // // //                                                             Reason: {learner.exitReason || "Unknown"}
// // // // // //                                                         </div>
// // // // // //                                                         <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
// // // // // //                                                             Date: {formatDate(learner.exitDate || null)}
// // // // // //                                                         </div>
// // // // // //                                                     </div>
// // // // // //                                                 ) : (
// // // // // //                                                     <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // // //                                                         <CheckCircle size={14} /> Active
// // // // // //                                                     </span>
// // // // // //                                                 )}
// // // // // //                                             </td>

// // // // // //                                             <td>
// // // // // //                                                 {!isDropped && (
// // // // // //                                                     <button
// // // // // //                                                         onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // // // // //                                                         className="btn btn-outline"
// // // // // //                                                         style={{ color: '#ef4444', borderColor: '#fee2e2', padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
// // // // // //                                                         title="Record Learner Exit"
// // // // // //                                                     >
// // // // // //                                                         <AlertTriangle size={14} /> Record Exit
// // // // // //                                                     </button>
// // // // // //                                                 )}
// // // // // //                                             </td>
// // // // // //                                         </tr>
// // // // // //                                     );
// // // // // //                                 })}
// // // // // //                                 {enrolledLearners.length === 0 && (
// // // // // //                                     <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No learners enrolled in this cohort yet.</td></tr>
// // // // // //                                 )}
// // // // // //                             </tbody>
// // // // // //                         </table>
// // // // // //                     </div>

// // // // // //                     {/* --- STAFF HISTORY LOG (QCTO AUDIT) --- */}
// // // // // //                     <div style={{ marginTop: '3rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
// // // // // //                         <button
// // // // // //                             onClick={() => setShowHistory(!showHistory)}
// // // // // //                             style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}
// // // // // //                         >
// // // // // //                             <Clock size={18} />
// // // // // //                             {showHistory ? 'Hide Staff Assignment History' : 'View Staff Assignment History (Audit Trail)'}
// // // // // //                         </button>

// // // // // //                         {showHistory && (
// // // // // //                             <div style={{ marginTop: '1rem', background: 'transparent', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
// // // // // //                                 <table className="assessment-table" style={{ fontSize: '0.85rem' }}>
// // // // // //                                     <thead>
// // // // // //                                         <tr>
// // // // // //                                             <th>Role</th>
// // // // // //                                             <th>Staff Member</th>
// // // // // //                                             <th>Assigned Date</th>
// // // // // //                                             <th>Removed Date</th>
// // // // // //                                             <th>Reason for Change (Audit)</th>
// // // // // //                                             <th>Status</th>
// // // // // //                                         </tr>
// // // // // //                                     </thead>
// // // // // //                                     <tbody>
// // // // // //                                         {cohort.staffHistory?.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()).map((entry, index) => (
// // // // // //                                             <tr key={index} style={{ opacity: entry.removedAt ? 0.6 : 1 }}>
// // // // // //                                                 <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{entry.role}</td>
// // // // // //                                                 <td>{getStaffName(entry.staffId)}</td>
// // // // // //                                                 <td>{formatDate(entry.assignedAt)}</td>
// // // // // //                                                 <td>{entry.removedAt ? formatDate(entry.removedAt) : '-'}</td>
// // // // // //                                                 <td style={{ fontStyle: 'italic', color: '#475569' }}>
// // // // // //                                                     {entry.changeReason || "Initial Assignment"}
// // // // // //                                                 </td>
// // // // // //                                                 <td>
// // // // // //                                                     {entry.removedAt
// // // // // //                                                         ? <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#64748b' }}>Previous</span>
// // // // // //                                                         : <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Active</span>
// // // // // //                                                     }
// // // // // //                                                 </td>
// // // // // //                                             </tr>
// // // // // //                                         ))}
// // // // // //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// // // // // //                                             <tr><td colSpan={6} style={{ textAlign: 'center' }}>No history recorded for this cohort.</td></tr>
// // // // // //                                         )}
// // // // // //                                     </tbody>
// // // // // //                                 </table>
// // // // // //                             </div>
// // // // // //                         )}
// // // // // //                     </div>

// // // // // //                 </div>
// // // // // //             </main>
// // // // // //         </div>
// // // // // //     );
// // // // // // };