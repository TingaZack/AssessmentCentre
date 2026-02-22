// src/pages/FacilitatorPortal/AssessmentManager/AssessmentManager.tsx


// src/pages/FacilitatorPortal/AssessmentManager/AssessmentManager.tsx
// mLab CI — matches ViewPortfolio aesthetic (dark table headers, green-left border panel)

import React, { useState, useEffect } from 'react';
import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import './AssessmentManager.css';
import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import PageHeader from '../../../components/common/PageHeader/PageHeader';

interface Assessment {
    id: string;
    title: string;
    type: 'formative' | 'summative';
    cohortId: string;
    status: 'draft' | 'scheduled' | 'active' | 'completed';
    scheduledDate?: string;
    durationMinutes: number;
    questionCount: number;
    pendingMarkingCount?: number; // 🚀 NEW: Tracks submissions awaiting facilitator
}

export const AssessmentManager: React.FC = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAssessments = async () => {
            if (!user?.uid) return;
            try {
                // 1. Fetch the assessments for this facilitator
                const q = query(collection(db, 'assessments'), where('facilitatorId', '==', user.uid));
                const snapshot = await getDocs(q);
                const loadedAssessments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assessment));

                // 2. 🚀 NEW: For each assessment, count how many submissions are awaiting marking
                const assessmentsWithCounts = await Promise.all(loadedAssessments.map(async (test) => {
                    try {
                        const subQ = query(
                            collection(db, 'learner_submissions'),
                            where('assessmentId', '==', test.id),
                            where('status', '==', 'submitted') // 'submitted' means waiting for Facilitator (Blue Pen)
                        );
                        const subSnap = await getDocs(subQ);
                        return { ...test, pendingMarkingCount: subSnap.size };
                    } catch (e) {
                        console.error(`Error fetching pending count for ${test.id}:`, e);
                        return { ...test, pendingMarkingCount: 0 };
                    }
                }));

                setAssessments(assessmentsWithCounts);
            } catch (err) {
                console.error('Error loading assessments:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAssessments();
    }, [user]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure? This cannot be undone.')) return;
        try {
            await deleteDoc(doc(db, 'assessments', id));
            setAssessments(prev => prev.filter(a => a.id !== id));
        } catch {
            alert('Failed to delete assessment.');
        }
    };

    if (loading) return (
        <div className="am-loading">
            <div className="am-spinner" />
            Loading Assessments…
        </div>
    );

    return (
        <div className="am-animate">
            {/* ── Header ── */}
            <PageHeader
                eyebrow="Facilitator Portal"
                title="Assessment Manager"
                description="Create, schedule, and manage tests for your cohorts."
                actions={
                    <PageHeader.Btn
                        variant="primary"
                        icon={<Plus size={15} />}
                        onClick={() => navigate('/facilitator/assessments/builder')}
                    >
                        New Assessment
                    </PageHeader.Btn>
                }
            />

            {/* ── Panel + Table ── */}
            <div className="am-panel">
                <table className="am-table">
                    <thead>
                        <tr>
                            <th>Assessment Title</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Schedule</th>
                            <th className="am-col-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assessments.length > 0 ? (
                            assessments.map(test => (
                                <tr key={test.id}>
                                    <td>
                                        <span className="am-cell-title">{test.title}</span>
                                        <span className="am-cell-sub">
                                            <FileText size={12} /> {test.questionCount || 0} Blocks
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`am-badge am-badge--${test.type}`}>{test.type}</span>
                                    </td>
                                    <td>
                                        <span className={`am-badge am-badge--${test.status}`}>{test.status}</span>

                                        {/* 🚀 NEW: Awaiting Marking Indicator */}
                                        {test.pendingMarkingCount !== undefined && test.pendingMarkingCount > 0 && (
                                            <div style={{ marginTop: '8px' }}>
                                                <span
                                                    className="am-badge"
                                                    style={{
                                                        background: '#e0f2fe',
                                                        color: '#0369a1',
                                                        border: '1px solid #bae6fd',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.7rem'
                                                    }}
                                                >
                                                    <AlertCircle size={10} />
                                                    {test.pendingMarkingCount} Awaiting Marking
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        {test.scheduledDate ? (
                                            <span className="am-schedule__date">
                                                <Calendar size={13} />
                                                {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
                                                    day: 'numeric', month: 'short', year: 'numeric'
                                                })}
                                            </span>
                                        ) : (
                                            <span className="am-schedule__empty">Not scheduled</span>
                                        )}
                                    </td>
                                    <td className="am-col-right">
                                        <div className="am-actions">
                                            <button
                                                className="am-btn am-btn--outline am-btn--sm"
                                                onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
                                            >
                                                <Edit size={13} /> Edit
                                            </button>
                                            {test.status === 'active' && (
                                                <button className="am-btn am-btn--green am-btn--sm">
                                                    <PlayCircle size={13} /> Invigilate
                                                </button>
                                            )}
                                            <button
                                                className="am-btn am-btn--danger"
                                                onClick={() => handleDelete(test.id)}
                                                title="Delete"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5}>
                                    <div className="am-empty">
                                        <div className="am-empty__icon"><FileText size={44} color="var(--mlab-green)" /></div>
                                        <p className="am-empty__title">No Assessments Yet</p>
                                        <p className="am-empty__sub">Create your first assessment to get started.</p>
                                        <button
                                            className="am-btn am-btn--primary"
                                            onClick={() => navigate('/facilitator/assessments/builder')}
                                        >
                                            <Plus size={15} /> New Assessment
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// // src/pages/FacilitatorPortal/AssessmentManager/AssessmentManager.tsx
// // mLab CI — matches ViewPortfolio aesthetic (dark table headers, green-left border panel)

// import React, { useState, useEffect } from 'react';
// import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle } from 'lucide-react';
// import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
// import { useNavigate } from 'react-router-dom';
// import './AssessmentManager.css';
// import { useStore } from '../../../store/useStore';
// import { db } from '../../../lib/firebase';
// import PageHeader from '../../../components/common/PageHeader/PageHeader';

// interface Assessment {
//     id: string;
//     title: string;
//     type: 'formative' | 'summative';
//     cohortId: string;
//     status: 'draft' | 'scheduled' | 'active' | 'completed';
//     scheduledDate?: string;
//     durationMinutes: number;
//     questionCount: number;
// }

// export const AssessmentManager: React.FC = () => {
//     const { user } = useStore();
//     const navigate = useNavigate();
//     const [assessments, setAssessments] = useState<Assessment[]>([]);
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         const fetchAssessments = async () => {
//             if (!user?.uid) return;
//             try {
//                 const q = query(collection(db, 'assessments'), where('facilitatorId', '==', user.uid));
//                 const snapshot = await getDocs(q);
//                 setAssessments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assessment)));
//             } catch (err) {
//                 console.error('Error loading assessments:', err);
//             } finally {
//                 setLoading(false);
//             }
//         };
//         fetchAssessments();
//     }, [user]);

//     const handleDelete = async (id: string) => {
//         if (!window.confirm('Are you sure? This cannot be undone.')) return;
//         try {
//             await deleteDoc(doc(db, 'assessments', id));
//             setAssessments(prev => prev.filter(a => a.id !== id));
//         } catch {
//             alert('Failed to delete assessment.');
//         }
//     };

//     if (loading) return (
//         <div className="am-loading">
//             <div className="am-spinner" />
//             Loading Assessments…
//         </div>
//     );

//     return (
//         <div className="am-animate">
//             {/* ── Header ── */}
//             {/* <div className="am-header">
//                 <div>
//                     <h2 className="am-header__title">Assessment Manager</h2>
//                     <p className="am-header__sub">Create, schedule, and manage tests for your cohorts.</p>
//                 </div>
//                 <button
//                     className="am-btn am-btn--primary"
//                     onClick={() => navigate('/facilitator/assessments/builder')}
//                 >
//                     <Plus size={16} /> New Assessment
//                 </button>
//             </div> */}
//             <PageHeader
//                 eyebrow="Facilitator Portal"
//                 title="Assessment Manager"
//                 description="Create, schedule, and manage tests for your cohorts."
//                 actions={
//                     <PageHeader.Btn
//                         variant="primary"
//                         icon={<Plus size={15} />}
//                         onClick={() => { }}
//                     >
//                         New Assessment
//                     </PageHeader.Btn>
//                 }
//             />


//             {/* ── Panel + Table ── */}
//             <div className="am-panel">
//                 <table className="am-table">
//                     <thead>
//                         <tr>
//                             <th>Assessment Title</th>
//                             <th>Type</th>
//                             <th>Status</th>
//                             <th>Schedule</th>
//                             <th className="am-col-right">Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {assessments.length > 0 ? (
//                             assessments.map(test => (
//                                 <tr key={test.id}>
//                                     <td>
//                                         <span className="am-cell-title">{test.title}</span>
//                                         <span className="am-cell-sub">
//                                             <FileText size={12} /> {test.questionCount || 0} Blocks
//                                         </span>
//                                     </td>
//                                     <td>
//                                         <span className={`am-badge am-badge--${test.type}`}>{test.type}</span>
//                                     </td>
//                                     <td>
//                                         <span className={`am-badge am-badge--${test.status}`}>{test.status}</span>
//                                     </td>
//                                     <td>
//                                         {test.scheduledDate ? (
//                                             <span className="am-schedule__date">
//                                                 <Calendar size={13} />
//                                                 {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
//                                                     day: 'numeric', month: 'short', year: 'numeric'
//                                                 })}
//                                             </span>
//                                         ) : (
//                                             <span className="am-schedule__empty">Not scheduled</span>
//                                         )}
//                                     </td>
//                                     <td className="am-col-right">
//                                         <div className="am-actions">
//                                             <button
//                                                 className="am-btn am-btn--outline am-btn--sm"
//                                                 onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
//                                             >
//                                                 <Edit size={13} /> Edit
//                                             </button>
//                                             {test.status === 'active' && (
//                                                 <button className="am-btn am-btn--green am-btn--sm">
//                                                     <PlayCircle size={13} /> Invigilate
//                                                 </button>
//                                             )}
//                                             <button
//                                                 className="am-btn am-btn--danger"
//                                                 onClick={() => handleDelete(test.id)}
//                                                 title="Delete"
//                                             >
//                                                 <Trash2 size={15} />
//                                             </button>
//                                         </div>
//                                     </td>
//                                 </tr>
//                             ))
//                         ) : (
//                             <tr>
//                                 <td colSpan={5}>
//                                     <div className="am-empty">
//                                         <div className="am-empty__icon"><FileText size={44} color="var(--mlab-green)" /></div>
//                                         <p className="am-empty__title">No Assessments Yet</p>
//                                         <p className="am-empty__sub">Create your first assessment to get started.</p>
//                                         <button
//                                             className="am-btn am-btn--primary"
//                                             onClick={() => navigate('/facilitator/assessments/builder')}
//                                         >
//                                             <Plus size={15} /> New Assessment
//                                         </button>
//                                     </div>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };



// // // mLab CI Brand-aligned Assessment Manager v2.1

// // import React, { useState, useEffect } from 'react';
// // import {
// //     Plus, Calendar, FileText,
// //     Trash2, Edit, PlayCircle
// // } from 'lucide-react';
// // import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
// // import { useNavigate } from 'react-router-dom';
// // import './AssessmentManager.css';
// // import { useStore } from '../../../store/useStore';
// // import { db } from '../../../lib/firebase';
// // import PageHeader from '../../../components/common/PageHeader/PageHeader';

// // interface Assessment {
// //     id: string;
// //     title: string;
// //     type: 'formative' | 'summative';
// //     cohortId: string;
// //     status: 'draft' | 'scheduled' | 'active' | 'completed';
// //     scheduledDate?: string;
// //     durationMinutes: number;
// //     questionCount: number;
// // }

// // export const AssessmentManager: React.FC = () => {
// //     const { user } = useStore();
// //     const navigate = useNavigate();
// //     const [assessments, setAssessments] = useState<Assessment[]>([]);
// //     const [loading, setLoading] = useState(true);

// //     useEffect(() => {
// //         const fetchAssessments = async () => {
// //             if (!user?.uid) return;
// //             try {
// //                 const q = query(
// //                     collection(db, 'assessments'),
// //                     where('facilitatorId', '==', user.uid)
// //                 );
// //                 const snapshot = await getDocs(q);
// //                 setAssessments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assessment)));
// //             } catch (err) {
// //                 console.error('Error loading assessments:', err);
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };
// //         fetchAssessments();
// //     }, [user]);

// //     const handleDelete = async (id: string) => {
// //         if (!window.confirm('Are you sure? This cannot be undone.')) return;
// //         try {
// //             await deleteDoc(doc(db, 'assessments', id));
// //             setAssessments(prev => prev.filter(a => a.id !== id));
// //         } catch {
// //             alert('Failed to delete assessment.');
// //         }
// //     };

// //     if (loading) return (
// //         <div className="am-loading">
// //             <div className="am-spinner" />
// //             Loading Assessments…
// //         </div>
// //     );

// //     return (
// //         <div className="am-animate">
// //             {/* ── Header ── */}
// //             {/* <div className="am-header">
// //                 <div className="am-header__text">
// //                     <h2 className="am-header__title">Assessment Manager</h2>
// //                     <p className="am-header__sub">Create, schedule, and manage tests for your cohorts.</p>
// //                 </div>
// //                 <button
// //                     className="am-btn am-btn--primary"
// //                     onClick={() => navigate('/facilitator/assessments/builder')}
// //                 >
// //                     <Plus size={16} /> New Assessment
// //                 </button>
// //             </div> */}

// //             <PageHeader
// //                 eyebrow="Facilitator Portal"
// //                 title="Assessment Manager"
// //                 description="Create, schedule, and manage tests for your cohorts."
// //                 actions={
// //                     <PageHeader.Btn
// //                         variant="primary"
// //                         icon={<Plus size={15} />}
// //                         onClick={() => { }}
// //                     >
// //                         New Assessment
// //                     </PageHeader.Btn>
// //                 }
// //             />

// //             {/* ── Table ── */}
// //             <div className="am-table-wrap">
// //                 <table className="am-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Assessment Title</th>
// //                             <th>Type</th>
// //                             <th>Status</th>
// //                             <th>Schedule</th>
// //                             <th className="am-col-actions">Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {assessments.length > 0 ? (
// //                             assessments.map(test => (
// //                                 <tr key={test.id}>
// //                                     {/* Title */}
// //                                     <td>
// //                                         <span className="am-cell-title">{test.title}</span>
// //                                         <span className="am-cell-meta">
// //                                             <FileText size={12} /> {test.questionCount || 0} Blocks
// //                                         </span>
// //                                     </td>

// //                                     {/* Type */}
// //                                     <td>
// //                                         <span className={`am-type-badge am-type-badge--${test.type}`}>
// //                                             {test.type}
// //                                         </span>
// //                                     </td>

// //                                     {/* Status */}
// //                                     <td>
// //                                         <StatusBadge status={test.status} />
// //                                     </td>

// //                                     {/* Schedule */}
// //                                     <td>
// //                                         {test.scheduledDate ? (
// //                                             <div className="am-schedule">
// //                                                 <span className="am-schedule__date">
// //                                                     <Calendar size={13} />
// //                                                     {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
// //                                                         day: 'numeric', month: 'short', year: 'numeric'
// //                                                     })}
// //                                                 </span>
// //                                             </div>
// //                                         ) : (
// //                                             <span className="am-schedule__empty">Not scheduled</span>
// //                                         )}
// //                                     </td>

// //                                     {/* Actions */}
// //                                     <td className="am-col-actions">
// //                                         <div className="am-actions">
// //                                             <button
// //                                                 className="am-btn am-btn--outline am-btn--sm"
// //                                                 onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
// //                                                 title="Edit assessment"
// //                                             >
// //                                                 <Edit size={13} /> Edit
// //                                             </button>

// //                                             {test.status === 'active' && (
// //                                                 <button
// //                                                     className="am-btn am-btn--primary am-btn--sm"
// //                                                     title="Invigilate live session"
// //                                                 >
// //                                                     <PlayCircle size={13} /> Invigilate
// //                                                 </button>
// //                                             )}

// //                                             <button
// //                                                 className="am-btn am-btn--danger"
// //                                                 onClick={() => handleDelete(test.id)}
// //                                                 title="Delete assessment"
// //                                             >
// //                                                 <Trash2 size={15} />
// //                                             </button>
// //                                         </div>
// //                                     </td>
// //                                 </tr>
// //                             ))
// //                         ) : (
// //                             <tr>
// //                                 <td colSpan={5}>
// //                                     <div className="am-empty">
// //                                         <div className="am-empty__icon">
// //                                             <FileText size={26} />
// //                                         </div>
// //                                         <p className="am-empty__title">No Assessments Yet</p>
// //                                         <p className="am-empty__sub">Create your first assessment to get started.</p>
// //                                         <button
// //                                             className="am-btn am-btn--primary"
// //                                             onClick={() => navigate('/facilitator/assessments/builder')}
// //                                         >
// //                                             <Plus size={15} /> New Assessment
// //                                         </button>
// //                                     </div>
// //                                 </td>
// //                             </tr>
// //                         )}
// //                     </tbody>
// //                 </table>
// //             </div>
// //         </div>
// //     );
// // };

// // /* ── Status Badge ─────────────────────────────────────────────────────────── */
// // const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
// //     <span className={`am-status-badge am-status-badge--${status}`}>
// //         {status}
// //     </span>
// // );


// // // import React, { useState, useEffect } from 'react';
// // // import { useStore } from '../../../store/useStore';
// // // import {
// // //     Plus, Calendar, Clock, FileText,
// // //     Trash2, Edit, PlayCircle
// // // } from 'lucide-react';
// // // import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useNavigate } from 'react-router-dom';

// // // interface Assessment {
// // //     id: string;
// // //     title: string;
// // //     type: 'formative' | 'summative';
// // //     cohortId: string;
// // //     status: 'draft' | 'scheduled' | 'active' | 'completed';
// // //     scheduledDate?: string;
// // //     durationMinutes: number;
// // //     questionCount: number;
// // // }

// // // export const AssessmentManager: React.FC = () => {
// // //     const { user } = useStore();
// // //     const navigate = useNavigate();
// // //     const [assessments, setAssessments] = useState<Assessment[]>([]);
// // //     const [loading, setLoading] = useState(true);

// // //     useEffect(() => {
// // //         const fetchAssessments = async () => {
// // //             if (!user?.uid) return;
// // //             try {
// // //                 const q = query(
// // //                     collection(db, 'assessments'),
// // //                     where('facilitatorId', '==', user.uid)
// // //                 );
// // //                 const snapshot = await getDocs(q);
// // //                 const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assessment));
// // //                 setAssessments(data);
// // //             } catch (err) {
// // //                 console.error("Error loading assessments:", err);
// // //             } finally {
// // //                 setLoading(false);
// // //             }
// // //         };
// // //         fetchAssessments();
// // //     }, [user]);

// // //     const handleDelete = async (id: string) => {
// // //         if (window.confirm('Are you sure? This cannot be undone.')) {
// // //             try {
// // //                 await deleteDoc(doc(db, 'assessments', id));
// // //                 setAssessments(prev => prev.filter(a => a.id !== id));
// // //             } catch (err) {
// // //                 alert("Failed to delete assessment.");
// // //             }
// // //         }
// // //     };

// // //     if (loading) return <div className="p-8">Loading assessments...</div>;

// // //     return (
// // //         <div className="animate-fade-in">
// // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
// // //                 <div>
// // //                     <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>Assessment Manager</h2>
// // //                     <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Create, schedule, and manage tests for your cohorts.</p>
// // //                 </div>
// // //                 <button
// // //                     className="btn btn-primary"
// // //                     onClick={() => navigate('/facilitator/assessments/builder')} // FIXED PATH
// // //                     style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
// // //                 >
// // //                     <Plus size={18} /> New Assessment
// // //                 </button>
// // //             </div>

// // //             <div className="f-table-container">
// // //                 <table className="f-table">
// // //                     <thead>
// // //                         <tr>
// // //                             <th>Assessment Title</th>
// // //                             <th>Type</th>
// // //                             <th>Status</th>
// // //                             <th>Schedule</th>
// // //                             <th style={{ textAlign: 'right' }}>Actions</th>
// // //                         </tr>
// // //                     </thead>
// // //                     <tbody>
// // //                         {assessments.length > 0 ? (
// // //                             assessments.map((test) => (
// // //                                 <tr key={test.id}>
// // //                                     <td>
// // //                                         <div style={{ fontWeight: 600, color: '#0f172a' }}>{test.title}</div>
// // //                                         <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                             <FileText size={12} /> {test.questionCount || 0} Blocks
// // //                                         </div>
// // //                                     </td>
// // //                                     <td>
// // //                                         <span className={`f-badge ${test.type === 'summative' ? 'badge-red' : 'badge-blue'}`}>
// // //                                             {test.type}
// // //                                         </span>
// // //                                     </td>
// // //                                     <td>
// // //                                         <StatusBadge status={test.status} />
// // //                                     </td>
// // //                                     <td>
// // //                                         {test.scheduledDate ? (
// // //                                             <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
// // //                                                 <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0f172a' }}>
// // //                                                     <Calendar size={14} /> {new Date(test.scheduledDate).toLocaleDateString()}
// // //                                                 </span>
// // //                                             </div>
// // //                                         ) : (
// // //                                             <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>Not scheduled</span>
// // //                                         )}
// // //                                     </td>
// // //                                     <td className="f-col-actions" style={{ textAlign: 'right' }}>
// // //                                         <button
// // //                                             className="btn btn-outline small"
// // //                                             onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)} // FIXED PATH
// // //                                             style={{ marginRight: '8px' }}
// // //                                         >
// // //                                             <Edit size={14} /> Edit
// // //                                         </button>

// // //                                         {test.status === 'active' && (
// // //                                             <button className="btn btn-primary small" style={{ marginRight: '8px' }}>
// // //                                                 <PlayCircle size={14} /> Invigilate
// // //                                             </button>
// // //                                         )}

// // //                                         <button className="btn btn-icon-only" onClick={() => handleDelete(test.id)} style={{ color: '#ef4444' }}>
// // //                                             <Trash2 size={16} />
// // //                                         </button>
// // //                                     </td>
// // //                                 </tr>
// // //                             ))
// // //                         ) : (
// // //                             <tr>
// // //                                 <td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
// // //                                     <p>No assessments found.</p>
// // //                                 </td>
// // //                             </tr>
// // //                         )}
// // //                     </tbody>
// // //                 </table>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // const StatusBadge = ({ status }: { status: string }) => {
// // //     const colors: any = {
// // //         draft: { bg: '#f1f5f9', text: '#475569' },
// // //         active: { bg: '#f0fdf4', text: '#16a34a' },
// // //         completed: { bg: '#eff6ff', text: '#2563eb' }
// // //     };
// // //     const style = colors[status] || colors.draft;
// // //     return (
// // //         <span style={{
// // //             padding: '0.2rem 0.6rem',
// // //             borderRadius: '99px',
// // //             fontSize: '0.7rem',
// // //             fontWeight: 700,
// // //             backgroundColor: style.bg,
// // //             color: style.text,
// // //             textTransform: 'uppercase'
// // //         }}>
// // //             {status}
// // //         </span>
// // //     );
// // // };