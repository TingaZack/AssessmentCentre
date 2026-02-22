// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Users, Calendar,
    Clock, XCircle, AlertTriangle, CheckCircle,
    Eye, Plus, Loader2, PenTool,
    RefreshCcw
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar';
import './CohortDetailsPage.css';
import PageHeader from '../../components/common/PageHeader/PageHeader';

export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();

    const {
        user, cohorts, learners, staff,
        fetchCohorts, fetchLearners, fetchStaff, dropLearner
    } = useStore();

    const [showHistory, setShowHistory] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // 🚀 NEW: State to hold all submissions for this cohort to check marking status
    const [submissions, setSubmissions] = useState<any[]>([]);

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    // ROBUST FILTER: Checks both sides of the relationship
    const enrolledLearners = learners.filter(l => {
        const hasCohortId = l.cohortId === cohortId;
        const isInCohortArray = cohort?.learnerIds?.includes(l.id);
        return hasCohortId || isInCohortArray;
    });

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
    }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

    // 🚀 NEW: Fetch submissions to find any pending "Blue Pen" marking tasks
    useEffect(() => {
        const fetchSubmissions = async () => {
            if (!cohortId) return;
            try {
                // Fetch all submissions for this specific cohort
                const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
                const snap = await getDocs(q);
                setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error("Error fetching submissions:", error);
            }
        };
        fetchSubmissions();
    }, [cohortId]);

    /**
     * 🚀 POWER FUNCTION: Sync Workbooks
     * This scans all enrolled learners and creates any missing learner_submissions
     * for assessments linked to this cohort's qualification.
     */
    const syncLearnerWorkbooks = async () => {
        if (!cohort || !cohort.qualificationId) {
            alert("Qualification ID missing for this cohort. Cannot sync workbooks.");
            return;
        }

        setIsSyncing(true);
        try {
            const batch = writeBatch(db);

            // 1. Get all assessments for this qualification
            const assessmentsRef = collection(db, 'assessments');
            const q = query(assessmentsRef, where('qualificationId', '==', cohort.qualificationId));
            const assessmentSnaps = await getDocs(q);

            if (assessmentSnaps.empty) {
                alert("No assessments found for this qualification.");
                setIsSyncing(false);
                return;
            }

            let newDocsCount = 0;

            // 2. Loop through learners and assessments
            for (const learner of enrolledLearners) {
                for (const astDoc of assessmentSnaps.docs) {
                    const astData = astDoc.data();
                    const submissionId = `${learner.id}_${astDoc.id}`;

                    // Check if doc exists locally (optional optimization) or just set with merge:false
                    const subRef = doc(db, 'learner_submissions', submissionId);

                    batch.set(subRef, {
                        learnerId: learner.id,
                        assessmentId: astDoc.id,
                        cohortId: cohortId,
                        title: astData.title,
                        type: astData.type,
                        moduleNumber: astData.moduleInfo?.moduleNumber || 'M1',
                        moduleType: astData.moduleInfo?.moduleType || 'knowledge',
                        status: 'not_started',
                        answers: {},
                        assignedAt: new Date().toISOString(),
                        totalMarks: astData.totalMarks || 0,
                        marks: 0,
                        competency: 'NYC'
                    }, { merge: true }); // Use merge:true to avoid overwriting existing progress

                    newDocsCount++;
                }
            }

            await batch.commit();
            alert(`Sync Complete! Ensured workbooks are available for ${enrolledLearners.length} learners.`);
        } catch (error: any) {
            console.error("Sync Error:", error);
            alert("Failed to sync workbooks: " + error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    if (!cohort) {
        return <div className="mlab-loading">Loading Cohort Details…</div>;
    }

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
    const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(
            `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
        );
        if (reason && reason.trim().length > 0) {
            if (window.confirm(
                `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
            )) {
                await dropLearner(learnerId, reason);
            }
        } else if (reason !== null) {
            alert('Exit Reason is mandatory for QCTO compliance.');
        }
    };

    const handleBackNavigation = () => {
        if (isAdmin) {
            navigate('/admin?tab=cohorts');
        } else if (isFacilitator) {
            navigate('/facilitator/dashboard');
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

            <Sidebar
                role={user?.role}
                currentNav="cohorts"
                setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
                onLogout={() => navigate('/login')}
            />

            <main className="main-wrapper" style={{ width: '100%', padding: '2rem', overflowY: 'auto' }}>

                <PageHeader
                    eyebrow={`${cohort.name}`}
                    title="Cohort"
                    description="Manage Class Progress, Attendance &amp; Exits. Sync learner workbooks for new assessments."
                    actions={
                        <PageHeader.Btn
                            variant="primary"
                            onClick={syncLearnerWorkbooks}
                            disabled={isSyncing}
                        >
                            {isSyncing ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
                            Sync Learner Workbooks
                        </PageHeader.Btn>
                    }
                />

                {/* <header className="dashboard-header">
                    <button
                        type="button"
                        className="mlab-back-btn"
                        onClick={handleBackNavigation}
                    >
                        <ArrowLeft size={16} /> Back to Dashboard
                    </button>

                    <div className="mlab-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
                        <div>
                            <h1>{cohort.name}</h1>
                            <p>Manage Class Progress, Attendance &amp; Exits</p>
                        </div>

                        {(isAdmin || isFacilitator) && (
                            <button
                                className={`mlab-btn ${isSyncing ? 'mlab-btn--disabled' : 'mlab-btn--green'}`}
                                onClick={syncLearnerWorkbooks}
                                disabled={isSyncing}
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                            >
                                {isSyncing ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                                Sync Learner Workbooks
                            </button>
                        )}
                    </div>
                </header> */}

                <div className="admin-content">

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
                        <h3 className="mlab-section__title">
                            <Users size={16} />
                            Enrolled Learners ({enrolledLearners.length})
                        </h3>

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

                                        // 🚀 NEW: Check for pending submissions
                                        const learnerSubs = submissions.filter(s => s.learnerId === learner.id);
                                        const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

                                        return (
                                            <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                <td>
                                                    <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
                                                        {learner.fullName}
                                                    </div>
                                                    <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
                                                        {learner.idNumber}
                                                    </div>
                                                    {/* 🚀 NEW: Visual Alert if marking is pending */}
                                                    {!isDropped && pendingMarking.length > 0 && (
                                                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={12} /> {pendingMarking.length} Script{pendingMarking.length > 1 ? 's' : ''} Awaiting Marking
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="mlab-module-chips">
                                                        <span className="mlab-chip mlab-chip--k">
                                                            K: {learner.knowledgeModules?.length || 0}
                                                        </span>
                                                        <span className="mlab-chip mlab-chip--p">
                                                            P: {learner.practicalModules?.length || 0}
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
                                                                onClick={() => navigate(`/sor/${learner.id}`)}
                                                            >
                                                                <Eye size={13} /> View Portfolio
                                                            </button>

                                                            {/* 🚀 NEW: Quick Action to mark the script */}
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

// import React, { useEffect, useState } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import {
//     ArrowLeft, Users, Calendar,
//     Clock, XCircle, AlertTriangle, CheckCircle,
//     Eye, Plus, Loader2
// } from 'lucide-react';
// import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar';
// import './CohortDetailsPage.css';

// export const CohortDetailsPage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();

//     const {
//         user, cohorts, learners, staff,
//         fetchCohorts, fetchLearners, fetchStaff, dropLearner
//     } = useStore();

//     const [showHistory, setShowHistory] = useState(false);
//     const [isSyncing, setIsSyncing] = useState(false);

//     const isAdmin = user?.role === 'admin';
//     const cohort = cohorts.find(c => c.id === cohortId);

//     // ROBUST FILTER: Checks both sides of the relationship
//     const enrolledLearners = learners.filter(l => {
//         const hasCohortId = l.cohortId === cohortId;
//         const isInCohortArray = cohort?.learnerIds?.includes(l.id);
//         return hasCohortId || isInCohortArray;
//     });

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (staff.length === 0) fetchStaff();
//     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

//     /**
//      * 🚀 POWER FUNCTION: Sync Workbooks
//      * This scans all enrolled learners and creates any missing learner_submissions
//      * for assessments linked to this cohort's qualification.
//      */
//     const syncLearnerWorkbooks = async () => {
//         if (!cohort || !cohort.qualificationId) {
//             alert("Qualification ID missing for this cohort. Cannot sync workbooks.");
//             return;
//         }

//         setIsSyncing(true);
//         try {
//             const batch = writeBatch(db);

//             // 1. Get all assessments for this qualification
//             const assessmentsRef = collection(db, 'assessments');
//             const q = query(assessmentsRef, where('qualificationId', '==', cohort.qualificationId));
//             const assessmentSnaps = await getDocs(q);

//             if (assessmentSnaps.empty) {
//                 alert("No assessments found for this qualification.");
//                 setIsSyncing(false);
//                 return;
//             }

//             let newDocsCount = 0;

//             // 2. Loop through learners and assessments
//             for (const learner of enrolledLearners) {
//                 for (const astDoc of assessmentSnaps.docs) {
//                     const astData = astDoc.data();
//                     const submissionId = `${learner.id}_${astDoc.id}`;

//                     // Check if doc exists locally (optional optimization) or just set with merge:false
//                     const subRef = doc(db, 'learner_submissions', submissionId);

//                     batch.set(subRef, {
//                         learnerId: learner.id,
//                         assessmentId: astDoc.id,
//                         cohortId: cohortId,
//                         title: astData.title,
//                         type: astData.type,
//                         moduleNumber: astData.moduleInfo?.moduleNumber || 'M1',
//                         moduleType: astData.moduleInfo?.moduleType || 'knowledge',
//                         status: 'not_started',
//                         answers: {},
//                         assignedAt: new Date().toISOString(),
//                         totalMarks: astData.totalMarks || 0,
//                         marks: 0,
//                         competency: 'NYC'
//                     }, { merge: true }); // Use merge:true to avoid overwriting existing progress

//                     newDocsCount++;
//                 }
//             }

//             await batch.commit();
//             alert(`Sync Complete! Ensured workbooks are available for ${enrolledLearners.length} learners.`);
//         } catch (error: any) {
//             console.error("Sync Error:", error);
//             alert("Failed to sync workbooks: " + error.message);
//         } finally {
//             setIsSyncing(false);
//         }
//     };

//     if (!cohort) {
//         return <div className="mlab-loading">Loading Cohort Details…</div>;
//     }

//     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
//     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

//     const handleDropLearner = async (learnerId: string, learnerName: string) => {
//         const reason = window.prompt(
//             `QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`
//         );
//         if (reason && reason.trim().length > 0) {
//             if (window.confirm(
//                 `Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`
//             )) {
//                 await dropLearner(learnerId, reason);
//             }
//         } else if (reason !== null) {
//             alert('Exit Reason is mandatory for QCTO compliance.');
//         }
//     };

//     const handleBackNavigation = () => {
//         if (isAdmin) {
//             navigate('/admin?tab=cohorts');
//         } else if (user?.role === 'facilitator') {
//             navigate('/facilitator/dashboard');
//         } else {
//             navigate(-1);
//         }
//     };

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

//             <Sidebar
//                 role={user?.role}
//                 currentNav="cohorts"
//                 setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
//                 onLogout={() => navigate('/login')}
//             />

//             <main className="main-wrapper" style={{ width: '100%' }}>

//                 <header className="dashboard-header">
//                     <button
//                         type="button"
//                         className="mlab-back-btn"
//                         onClick={handleBackNavigation}
//                     >
//                         <ArrowLeft size={16} /> Back to Dashboard
//                     </button>

//                     <div className="mlab-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
//                         <div>
//                             <h1>{cohort.name}</h1>
//                             <p>Manage Class Progress, Attendance &amp; Exits</p>
//                         </div>

//                         {/* 🚀 Add Sync Button for Admin/Facilitator */}
//                         {(isAdmin || user?.role === 'facilitator') && (
//                             <button
//                                 className={`mlab-btn ${isSyncing ? 'mlab-btn--disabled' : 'mlab-btn--green'}`}
//                                 onClick={syncLearnerWorkbooks}
//                                 disabled={isSyncing}
//                                 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
//                             >
//                                 {isSyncing ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
//                                 Sync Learner Workbooks
//                             </button>
//                         )}
//                     </div>
//                 </header>

//                 <div className="admin-content">

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
//                         <h3 className="mlab-section__title">
//                             <Users size={16} />
//                             Enrolled Learners ({enrolledLearners.length})
//                         </h3>

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
//                                         return (
//                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
//                                                 <td>
//                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
//                                                         {learner.fullName}
//                                                     </div>
//                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
//                                                         {learner.idNumber}
//                                                     </div>
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
//                                                         <div style={{ display: 'flex', gap: '8px' }}>
//                                                             {isAdmin && (
//                                                                 <button
//                                                                     className="mlab-btn mlab-btn--outline-red"
//                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
//                                                                 >
//                                                                     <AlertTriangle size={13} /> Record Exit
//                                                                 </button>
//                                                             )}
//                                                             <button
//                                                                 className="mlab-btn mlab-btn--outline-blue"
//                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
//                                                             >
//                                                                 <Eye size={13} /> View Portfolio
//                                                             </button>
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


// // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// // import React, { useEffect, useState } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     ArrowLeft, Users, Calendar,
// //     Clock, XCircle, AlertTriangle, CheckCircle,
// //     Eye
// // } from 'lucide-react';
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

// //     const isAdmin = user?.role === 'admin';

// //     const cohort = cohorts.find(c => c.id === cohortId);

// //     // ✅ ROBUST FILTER: Checks both sides of the relationship
// //     // It checks if the Learner has the cohortId OR if the Cohort's learnerIds array includes the Learner's id
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

// //                     <div className="mlab-detail-header">
// //                         <h1>{cohort.name}</h1>
// //                         <p>Manage Class Progress, Attendance &amp; Exits</p>
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
// //                                             <tr
// //                                                 key={learner.id}
// //                                                 className={isDropped ? 'mlab-tr--dropped' : ''}
// //                                             >
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
// //                                                                     title="Record Learner Exit"
// //                                                                 >
// //                                                                     <AlertTriangle size={13} /> Record Exit
// //                                                                 </button>
// //                                                             )}

// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--outline-blue"
// //                                                                 onClick={() => navigate(`/sor/${learner.id}`)}
// //                                                                 title="View Learner Portfolio"
// //                                                             >
// //                                                                 <Eye size={13} /> View Portfolio
// //                                                             </button>
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })}

// //                                     {enrolledLearners.length === 0 && (
// //                                         <tr>
// //                                             <td colSpan={4} className="mlab-table-empty">
// //                                                 No learners enrolled in this cohort yet.
// //                                             </td>
// //                                         </tr>
// //                                     )}
// //                                 </tbody>
// //                             </table>
// //                         </div>
// //                     </div>

// //                     {/* ── Staff Assignment History ─────────────────────────── */}
// //                     <div className="mlab-history-section">
// //                         <button
// //                             className="mlab-history-toggle"
// //                             onClick={() => setShowHistory(!showHistory)}
// //                         >
// //                             <Clock size={16} />
// //                             {showHistory
// //                                 ? 'Hide Staff Assignment History'
// //                                 : 'View Staff Assignment History (Audit Trail)'}
// //                         </button>

// //                         {showHistory && (
// //                             <div className="mlab-history-panel">
// //                                 <table className="mlab-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Role</th>
// //                                             <th>Staff Member</th>
// //                                             <th>Assigned Date</th>
// //                                             <th>Removed Date</th>
// //                                             <th>Reason for Change (Audit)</th>
// //                                             <th>Status</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {cohort.staffHistory
// //                                             ?.sort((a, b) =>
// //                                                 new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
// //                                             )
// //                                             .map((entry, index) => (
// //                                                 <tr
// //                                                     key={index}
// //                                                     className={entry.removedAt ? 'mlab-tr--faded' : ''}
// //                                                 >
// //                                                     <td className="mlab-audit-role">{entry.role}</td>
// //                                                     <td>{getStaffName(entry.staffId)}</td>
// //                                                     <td>{formatDate(entry.assignedAt)}</td>
// //                                                     <td>{entry.removedAt ? formatDate(entry.removedAt) : '—'}</td>
// //                                                     <td className="mlab-audit-reason">
// //                                                         {entry.changeReason || 'Initial Assignment'}
// //                                                     </td>
// //                                                     <td>
// //                                                         {entry.removedAt
// //                                                             ? <span className="mlab-badge mlab-badge--previous">Previous</span>
// //                                                             : <span className="mlab-badge mlab-badge--active">Active</span>
// //                                                         }
// //                                                     </td>
// //                                                 </tr>
// //                                             ))}

// //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// //                                             <tr>
// //                                                 <td colSpan={6} className="mlab-table-empty">
// //                                                     No history recorded for this cohort.
// //                                                 </td>
// //                                             </tr>
// //                                         )}
// //                                     </tbody>
// //                                 </table>
// //                             </div>
// //                         )}
// //                     </div>

// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };

// // // import React, { useEffect, useState } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     ArrowLeft, Users, BookOpen, Calendar,
// // //     Clock, XCircle, AlertTriangle, CheckCircle,
// // //     Eye
// // // } from 'lucide-react';
// // // import { useStore } from '../../store/useStore';
// // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // import './CohortDetailsPage.css';

// // // export const CohortDetailsPage: React.FC = () => {
// // //     const { cohortId } = useParams();
// // //     const navigate = useNavigate();

// // //     // ✅ Destructure user to implement Role-Based Access Control (RBAC)
// // //     const {
// // //         user, cohorts, learners, staff,
// // //         fetchCohorts, fetchLearners, fetchStaff, dropLearner
// // //     } = useStore();

// // //     const [showHistory, setShowHistory] = useState(false);

// // //     // ✅ Determine if the current user is an Admin
// // //     const isAdmin = user?.role === 'admin';

// // //     const cohort = cohorts.find(c => c.id === cohortId);

// // //     // ✅ CRITICAL FIX: Filter by the learner's cohortId property!
// // //     const enrolledLearners = learners.filter(l => l.cohortId === cohortId);

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

// // //     // Determine fallback routing based on role
// // //     const handleBackNavigation = () => {
// // //         if (isAdmin) {
// // //             navigate('/admin?tab=cohorts');
// // //         } else if (user?.role === 'facilitator') {
// // //             navigate('/facilitator/dashboard');
// // //         } else {
// // //             navigate(-1); // Go back to previous page for assessors/moderators
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

// // //                     {/* ── Back Button ─────────────────────────────────────── */}
// // //                     <button
// // //                         type="button"
// // //                         className="mlab-back-btn"
// // //                         onClick={handleBackNavigation}
// // //                     >
// // //                         <ArrowLeft size={16} /> Back to Dashboard
// // //                     </button>

// // //                     {/* ── Page Title ──────────────────────────────────────── */}
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
// // //                                                 {/* Learner */}
// // //                                                 <td>
// // //                                                     <div className={`mlab-cell-name${isDropped ? ' mlab-cell-name--dropped' : ''}`}>
// // //                                                         {learner.fullName}
// // //                                                     </div>
// // //                                                     <div className={`mlab-cell-sub${isDropped ? ' mlab-cell-sub--dropped' : ''}`}>
// // //                                                         {learner.idNumber}
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 {/* Modules */}
// // //                                                 <td>
// // //                                                     <div className="mlab-module-chips">
// // //                                                         <span className="mlab-chip mlab-chip--k">
// // //                                                             K: {learner.knowledgeModules.length}
// // //                                                         </span>
// // //                                                         <span className="mlab-chip mlab-chip--p">
// // //                                                             P: {learner.practicalModules.length}
// // //                                                         </span>
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 {/* Status */}
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

// // //                                                 {/* Actions */}
// // //                                                 <td>
// // //                                                     {!isDropped && (
// // //                                                         <div style={{ display: 'flex', gap: '8px' }}>
// // //                                                             {/* ✅ ADMIN ONLY: Drop Learner */}
// // //                                                             {isAdmin && (
// // //                                                                 <button
// // //                                                                     className="mlab-btn mlab-btn--outline-red"
// // //                                                                     onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // //                                                                     title="Record Learner Exit"
// // //                                                                 >
// // //                                                                     <AlertTriangle size={13} /> Record Exit
// // //                                                                 </button>
// // //                                                             )}

// // //                                                             {/* ✅ EVERYONE ELSE (OR ADMIN TOO): View Portfolio */}
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


// // // // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx
// // // // // Styled to align with mLab Corporate Identity Brand Guide 2019
// // // // // All visual styling lives in CohortDetailsPage.css

// // // // import React, { useEffect, useState } from 'react';
// // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // import {
// // // //     ArrowLeft, Users, BookOpen, Calendar,
// // // //     Clock, XCircle, AlertTriangle, CheckCircle
// // // // } from 'lucide-react';
// // // // import { useStore } from '../../store/useStore';
// // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // import './CohortDetailsPage.css';

// // // // export const CohortDetailsPage: React.FC = () => {
// // // //     const { cohortId } = useParams();
// // // //     const navigate = useNavigate();
// // // //     const { cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff, dropLearner } = useStore();

// // // //     const [showHistory, setShowHistory] = useState(false);

// // // //     const cohort = cohorts.find(c => c.id === cohortId);
// // // //     const enrolledLearners = learners.filter(l => cohort?.learnerIds.includes(l.id));

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

// // // //     return (
// // // //         // <div className="admin-layout">
// // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

// // // //             <Sidebar
// // // //                 currentNav="cohorts"
// // // //                 setCurrentNav={nav => navigate(`/admin?tab=${nav}`)}
// // // //                 onLogout={() => navigate('/login')}
// // // //             />

// // // //             {/* <main className="main-wrapper"> */}
// // // //             <main className="main-wrapper" style={{ width: '100%' }}>

// // // //                 <header className="dashboard-header">

// // // //                     {/* ── Back Button ─────────────────────────────────────── */}
// // // //                     <button
// // // //                         type="button"
// // // //                         className="mlab-back-btn"
// // // //                         onClick={() => navigate('/admin?tab=cohorts')}
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
// // // //                                                         <button
// // // //                                                             className="mlab-btn mlab-btn--outline-red"
// // // //                                                             onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // // //                                                             title="Record Learner Exit"
// // // //                                                         >
// // // //                                                             <AlertTriangle size={13} /> Record Exit
// // // //                                                         </button>
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

// // // // // import React, { useEffect, useState } from 'react';
// // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // import { ArrowLeft, Users, BookOpen, Calendar, Clock, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
// // // // // import { useStore } from '../../store/useStore';
// // // // // import { Sidebar } from '../../components/dashboard/Sidebar';

// // // // // export const CohortDetailsPage: React.FC = () => {
// // // // //     const { cohortId } = useParams();
// // // // //     const navigate = useNavigate();
// // // // //     const { cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff, dropLearner } = useStore();

// // // // //     // Local UI State
// // // // //     const [showHistory, setShowHistory] = useState(false);

// // // // //     // Find the specific cohort
// // // // //     const cohort = cohorts.find(c => c.id === cohortId);

// // // // //     // Filter learners enrolled in this cohort
// // // // //     const enrolledLearners = learners.filter(l => cohort?.learnerIds.includes(l.id));

// // // // //     // Load data if missing (e.g., on refresh)
// // // // //     useEffect(() => {
// // // // //         if (cohorts.length === 0) fetchCohorts();
// // // // //         if (learners.length === 0) fetchLearners();
// // // // //         if (staff.length === 0) fetchStaff();
// // // // //     }, [cohorts, learners, staff, fetchCohorts, fetchLearners, fetchStaff]);

// // // // //     if (!cohort) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading Cohort Details...</div>;

// // // // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // // // //     const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

// // // // //     // --- HANDLER: DROP LEARNER (QCTO EXIT) ---
// // // // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // // // //         const reason = window.prompt(`QCTO REQUIREMENT:\n\nWhy is ${learnerName} leaving the programme?\n(e.g., Found Employment, Medical, Non-attendance)`);

// // // // //         if (reason && reason.trim().length > 0) {
// // // // //             if (window.confirm(`Are you sure you want to mark ${learnerName} as DROPPED?\n\nReason: "${reason}"\n\nThis cannot be easily undone.`)) {
// // // // //                 await dropLearner(learnerId, reason);
// // // // //             }
// // // // //         } else if (reason !== null) {
// // // // //             alert("Exit Reason is mandatory for QCTO compliance.");
// // // // //         }
// // // // //     };

// // // // //     return (
// // // // //         <div className="admin-layout">
// // // // //             <Sidebar
// // // // //                 currentNav="cohorts"
// // // // //                 setCurrentNav={(nav) => navigate(`/admin?tab=${nav}`)}
// // // // //                 onLogout={() => navigate('/login')}
// // // // //             />

// // // // //             <main className="main-wrapper">
// // // // //                 <header className="dashboard-header">
// // // // //                     {/* BACK BUTTON (Corrected Navigation) */}
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         onClick={() => navigate('/admin?tab=cohorts')}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1rem', color: '#64748b', fontSize: '0.9rem' }}
// // // // //                     >
// // // // //                         <ArrowLeft size={18} /> Back to Dashboard
// // // // //                     </button>

// // // // //                     <div className="header-title">
// // // // //                         <h1>{cohort.name}</h1>
// // // // //                         <p>Manage Class Progress, Attendance & Exits</p>
// // // // //                     </div>
// // // // //                 </header>

// // // // //                 <div className="admin-content">
// // // // //                     {/* --- COHORT SUMMARY CARD --- */}
// // // // //                     <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', color: '#64748b', marginBottom: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', border: '1px solid #e2e8f0', alignItems: 'center' }}>
// // // // //                         <div style={{ paddingRight: '2rem', borderRight: '1px solid #f1f5f9' }}>
// // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
// // // // //                                 <Calendar size={14} /> Training Dates
// // // // //                             </div>
// // // // //                             <div style={{ fontWeight: 600, marginTop: '4px' }}>{cohort.startDate} — {cohort.endDate}</div>
// // // // //                         </div>

// // // // //                         <div>
// // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Facilitator (Blue)</div>
// // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.facilitatorId)}</div>
// // // // //                         </div>
// // // // //                         <div>
// // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Assessor (Red)</div>
// // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.assessorId)}</div>
// // // // //                         </div>
// // // // //                         <div>
// // // // //                             <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Moderator (Green)</div>
// // // // //                             <div style={{ fontWeight: 600 }}>{getStaffName(cohort.moderatorId)}</div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* --- ENROLLED LEARNERS TABLE --- */}
// // // // //                     <div className="list-view">
// // // // //                         <h3 style={{ marginBottom: '1rem' }}>Enrolled Learners ({enrolledLearners.length})</h3>
// // // // //                         <table className="assessment-table">
// // // // //                             <thead>
// // // // //                                 <tr>
// // // // //                                     <th>Learner</th>
// // // // //                                     <th>Progress (Modules)</th>
// // // // //                                     <th>Status</th>
// // // // //                                     <th>Actions</th>
// // // // //                                 </tr>
// // // // //                             </thead>
// // // // //                             <tbody>
// // // // //                                 {enrolledLearners.map(learner => {
// // // // //                                     const isDropped = learner.status === 'dropped';

// // // // //                                     return (
// // // // //                                         <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : 'transparent', opacity: isDropped ? 0.8 : 1 }}>
// // // // //                                             <td>
// // // // //                                                 <div style={{ fontWeight: 600, color: isDropped ? '#991b1b' : 'inherit' }}>
// // // // //                                                     {learner.fullName}
// // // // //                                                 </div>
// // // // //                                                 <div style={{ fontSize: '0.8rem', color: isDropped ? '#b91c1c' : '#64748b' }}>
// // // // //                                                     {learner.idNumber}
// // // // //                                                 </div>
// // // // //                                             </td>

// // // // //                                             <td>
// // // // //                                                 <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // // //                                                     <span style={{ fontSize: '0.8rem', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', color: '#0369a1' }}>
// // // // //                                                         K: {learner.knowledgeModules.length}
// // // // //                                                     </span>
// // // // //                                                     <span style={{ fontSize: '0.8rem', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', color: '#0369a1' }}>
// // // // //                                                         P: {learner.practicalModules.length}
// // // // //                                                     </span>
// // // // //                                                 </div>
// // // // //                                             </td>

// // // // //                                             <td>
// // // // //                                                 {isDropped ? (
// // // // //                                                     <div style={{ fontSize: '0.85rem', color: '#ef4444' }}>
// // // // //                                                         <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                             <XCircle size={14} /> DROPPED
// // // // //                                                         </div>
// // // // //                                                         <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
// // // // //                                                             Reason: {learner.exitReason || "Unknown"}
// // // // //                                                         </div>
// // // // //                                                         <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
// // // // //                                                             Date: {formatDate(learner.exitDate || null)}
// // // // //                                                         </div>
// // // // //                                                     </div>
// // // // //                                                 ) : (
// // // // //                                                     <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                         <CheckCircle size={14} /> Active
// // // // //                                                     </span>
// // // // //                                                 )}
// // // // //                                             </td>

// // // // //                                             <td>
// // // // //                                                 {!isDropped && (
// // // // //                                                     <button
// // // // //                                                         onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // // // //                                                         className="btn btn-outline"
// // // // //                                                         style={{ color: '#ef4444', borderColor: '#fee2e2', padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
// // // // //                                                         title="Record Learner Exit"
// // // // //                                                     >
// // // // //                                                         <AlertTriangle size={14} /> Record Exit
// // // // //                                                     </button>
// // // // //                                                 )}
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     );
// // // // //                                 })}
// // // // //                                 {enrolledLearners.length === 0 && (
// // // // //                                     <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No learners enrolled in this cohort yet.</td></tr>
// // // // //                                 )}
// // // // //                             </tbody>
// // // // //                         </table>
// // // // //                     </div>

// // // // //                     {/* --- STAFF HISTORY LOG (QCTO AUDIT) --- */}
// // // // //                     <div style={{ marginTop: '3rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
// // // // //                         <button
// // // // //                             onClick={() => setShowHistory(!showHistory)}
// // // // //                             style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}
// // // // //                         >
// // // // //                             <Clock size={18} />
// // // // //                             {showHistory ? 'Hide Staff Assignment History' : 'View Staff Assignment History (Audit Trail)'}
// // // // //                         </button>

// // // // //                         {showHistory && (
// // // // //                             <div style={{ marginTop: '1rem', background: 'transparent', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
// // // // //                                 <table className="assessment-table" style={{ fontSize: '0.85rem' }}>
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
// // // // //                                         {cohort.staffHistory?.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()).map((entry, index) => (
// // // // //                                             <tr key={index} style={{ opacity: entry.removedAt ? 0.6 : 1 }}>
// // // // //                                                 <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{entry.role}</td>
// // // // //                                                 <td>{getStaffName(entry.staffId)}</td>
// // // // //                                                 <td>{formatDate(entry.assignedAt)}</td>
// // // // //                                                 <td>{entry.removedAt ? formatDate(entry.removedAt) : '-'}</td>
// // // // //                                                 <td style={{ fontStyle: 'italic', color: '#475569' }}>
// // // // //                                                     {entry.changeReason || "Initial Assignment"}
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     {entry.removedAt
// // // // //                                                         ? <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#64748b' }}>Previous</span>
// // // // //                                                         : <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Active</span>
// // // // //                                                     }
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         ))}
// // // // //                                         {(!cohort.staffHistory || cohort.staffHistory.length === 0) && (
// // // // //                                             <tr><td colSpan={6} style={{ textAlign: 'center' }}>No history recorded for this cohort.</td></tr>
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