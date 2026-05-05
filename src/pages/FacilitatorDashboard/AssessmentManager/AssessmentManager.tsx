// src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, CheckCircle, Copy, Clock, Video, GraduationCap, Users } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import Loader from '../../../components/common/Loader/Loader';
import '../../../components/views/LearnersView/LearnersView.css';

interface Assessment {
    id: string;
    title: string;
    type: 'formative' | 'summative';
    cohortId: string;
    status: 'draft' | 'upcoming' | 'scheduled' | 'active' | 'completed';
    scheduledDate?: string;
    durationMinutes: number;
    questionCount: number;
    pendingMarkingCount?: number;
    requiresInvigilation?: boolean;
    moduleInfo?: {
        qualificationTitle?: string;
        moduleNumber?: string;
    };
    createdAt?: string;
    lastUpdated?: string;
    createdBy?: string;
    facilitatorId?: string;
    collaboratorIds?: string[];
    blocks?: any[];
}

export const AssessmentManager: React.FC = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const toast = useToast();

    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);

    // ─── FILTER STATES ───
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterProgramme, setFilterProgramme] = useState('all');

    // ─── MODAL STATES ───
    const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!user?.uid) return;
        setLoading(true);

        const unsubscribers: (() => void)[] = [];

        const handleSnapshot = async (snapshot: any) => {
            const assessmentMap = new Map<string, Assessment>();

            snapshot.docs.forEach((d: any) => {
                assessmentMap.set(d.id, { id: d.id, ...d.data() } as Assessment);
            });

            setAssessments(prevAssessments => {
                const mergedMap = new Map(prevAssessments.map(a => [a.id, a]));

                assessmentMap.forEach((value, key) => {
                    mergedMap.set(key, value);
                });

                const updatedList = Array.from(mergedMap.values());

                updatedList.sort((a, b) => {
                    const dateA = new Date(a.lastUpdated || a.createdAt || 0).getTime();
                    const dateB = new Date(b.lastUpdated || b.createdAt || 0).getTime();
                    return dateB - dateA;
                });

                return updatedList;
            });

            const docsToProcess = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));

            for (const test of docsToProcess) {
                try {
                    const subQ = query(
                        collection(db, 'learner_submissions'),
                        where('assessmentId', '==', test.id),
                        where('status', '==', 'submitted')
                    );

                    const subSnap = await getDocs(subQ);

                    setAssessments(current => current.map(a =>
                        a.id === test.id ? { ...a, pendingMarkingCount: subSnap.size } : a
                    ));
                } catch (e) {
                    console.error(`Error fetching pending count for ${test.id}:`, e);
                }
            }

            setLoading(false);
        };

        try {
            if (user.role === 'admin') {
                const q = query(collection(db, 'assessments'));
                const unsub = onSnapshot(q, handleSnapshot, (error) => {
                    console.error("Admin Listener Error:", error);
                    toast.error("Lost connection to live updates.");
                });
                unsubscribers.push(unsub);
            } else {
                const q1 = query(collection(db, 'assessments'), where('createdBy', '==', user.uid));
                unsubscribers.push(onSnapshot(q1, handleSnapshot));

                const q2 = query(collection(db, 'assessments'), where('facilitatorId', '==', user.uid));
                unsubscribers.push(onSnapshot(q2, handleSnapshot));

                const q3 = query(collection(db, 'assessments'), where('collaboratorIds', 'array-contains', user.uid));
                unsubscribers.push(onSnapshot(q3, handleSnapshot));
            }
        } catch (err) {
            console.error('Error setting up assessment listeners:', err);
            setLoading(false);
            toast.error("Failed to connect to assessment database.");
        }

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, [user?.uid, user?.role]);

    // ─── ACTION HANDLERS ───
    const initiateDelete = (assessment: Assessment) => {
        const isCreator = assessment.createdBy === user?.uid || assessment.facilitatorId === user?.uid;

        if (!isCreator && user?.role !== 'admin') {
            toast.error("Access Denied: Only the original creator or an Admin can delete this workbook.");
            return;
        }
        setAssessmentToDelete(assessment);
    };

    const executeDelete = async () => {
        if (!assessmentToDelete) return;
        setIsProcessing(true);
        try {
            await deleteDoc(doc(db, 'assessments', assessmentToDelete.id));
            setAssessments(prev => prev.filter(a => a.id !== assessmentToDelete.id));
            toast.success("Assessment deleted successfully.");
        } catch {
            toast.error('Failed to delete assessment.');
        } finally {
            setIsProcessing(false);
            setAssessmentToDelete(null);
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            toast.info("Duplicating assessment...");
            const docRef = doc(db, 'assessments', id);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                toast.error("Original assessment not found.");
                return;
            }

            const data = snap.data();
            const newRef = doc(collection(db, 'assessments'));

            const newAssessment = {
                ...data,
                title: `${data.title} (Copy)`,
                status: 'draft',
                cohortIds: [],
                cohortId: null,
                scheduledDate: null,
                isScheduled: false,
                collaboratorIds: [],
                autoCloseTaskId: null, // Clear the Google Cloud Task ID on clone
                requiresInvigilation: data.requiresInvigilation ?? false,
                createdBy: user?.uid,
                facilitatorId: user?.uid,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            await setDoc(newRef, newAssessment);
            toast.success('Assessment duplicated successfully!');
            navigate(`/facilitator/assessments/builder/${newRef.id}`);
        } catch (error) {
            console.error("Duplicate Error:", error);
            toast.error("Failed to duplicate assessment.");
        }
    };

    const uniqueProgrammes = useMemo(() => {
        const progs = new Set<string>();
        assessments.forEach(a => {
            if (a.moduleInfo?.qualificationTitle) {
                progs.add(a.moduleInfo.qualificationTitle);
            }
        });
        return Array.from(progs).sort();
    }, [assessments]);

    const filteredAssessments = useMemo(() => {
        return assessments.filter(test => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                test.title.toLowerCase().includes(searchLower) ||
                test.moduleInfo?.qualificationTitle?.toLowerCase().includes(searchLower) ||
                test.moduleInfo?.moduleNumber?.toLowerCase().includes(searchLower);

            const matchesType = filterType === 'all' || test.type === filterType;
            const matchesStatus = filterStatus === 'all' || test.status === filterStatus;
            const testProgramme = test.moduleInfo?.qualificationTitle || 'Unmapped';
            const matchesProgramme = filterProgramme === 'all' || testProgramme === filterProgramme;

            return matchesSearch && matchesType && matchesStatus && matchesProgramme;
        });
    }, [assessments, searchTerm, filterType, filterStatus, filterProgramme]);

    if (loading) return (
        <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Loader message="Loading Assessments..." />
        </div>
    );

    return (
        <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ── TOOLBAR / FILTER SYSTEM ── */}
            <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="mlab-search">
                        <Search size={18} color="var(--mlab-grey)" />
                        <input
                            type="text"
                            placeholder="Search by title or module..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="mlab-select-wrap">
                        <Filter size={16} color="var(--mlab-grey)" />
                        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="all">All Types</option>
                            <option value="formative">Formative</option>
                            <option value="summative">Summative</option>
                        </select>
                    </div>

                    <div className="mlab-select-wrap">
                        <Filter size={16} color="var(--mlab-grey)" />
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="upcoming">Coming Soon</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>

                    {uniqueProgrammes.length > 0 && (
                        <div className="mlab-select-wrap">
                            <GraduationCap size={16} color="var(--mlab-grey)" />
                            <select value={filterProgramme} onChange={e => setFilterProgramme(e.target.value)}>
                                <option value="all">All Programmes</option>
                                {uniqueProgrammes.map(prog => (
                                    <option key={prog} value={prog}>
                                        {prog.length > 40 ? prog.substring(0, 40) + '...' : prog}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* 🚀 PROMINENT CREATE ASSESSMENT BUTTON 🚀 */}
                <button
                    className="mlab-btn mlab-btn--primary"
                    onClick={() => navigate('/facilitator/assessments/builder')}
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Plus size={16} /> Create Assessment
                </button>
            </div>

            {/* ── TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Assessment Title</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Schedule</th>
                            <th>Last Updated</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAssessments.length > 0 ? (
                            filteredAssessments.map(test => {
                                const lastUpdateStr = test.lastUpdated || test.createdAt;
                                const formattedLastUpdate = lastUpdateStr
                                    ? new Date(lastUpdateStr).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                    : '—';

                                const isCollaborator = test.collaboratorIds?.includes(user?.uid || '');

                                return (
                                    <tr key={test.id}>
                                        <td>
                                            <div className="mlab-cell-content">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className="mlab-cell-name">{test.title}</span>
                                                    {isCollaborator && user?.role !== 'admin' && (
                                                        <span className="mlab-badge" style={{ background: '#f0f9ff', color: '#0284c7', border: 'none', padding: '2px 6px', fontSize: '0.65rem' }}>
                                                            <Users size={10} style={{ marginRight: '3px' }} /> Shared
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={12} /> {test.blocks?.length || test.questionCount || 0} Blocks
                                                    {test.moduleInfo?.qualificationTitle && ` • ${test.moduleInfo.qualificationTitle}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                                <span className={`mlab-badge mlab-badge--${test.type === 'formative' ? 'blue' : 'green'}`} style={{ textTransform: 'capitalize' }}>
                                                    {test.type}
                                                </span>
                                                {test.requiresInvigilation && (
                                                    <span className="mlab-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none' }}>
                                                        <Video size={10} /> Proctored
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                                <span className={`mlab-badge mlab-badge--${test.status === 'active' ? 'active' : test.status === 'draft' ? 'draft' : test.status === 'upcoming' ? 'amber' : 'blue'}`} style={{ textTransform: 'capitalize' }}>
                                                    {test.status === 'upcoming' ? 'Coming Soon' : test.status}
                                                </span>
                                                {test.pendingMarkingCount !== undefined && test.pendingMarkingCount > 0 && (
                                                    <span className="mlab-badge" style={{ background: '#fef2f2', color: '#b91c1c', border: 'none' }}>
                                                        <AlertCircle size={10} /> {test.pendingMarkingCount} Awaiting
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            {test.scheduledDate ? (
                                                <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)', fontWeight: 600 }}>
                                                    <Calendar size={13} />
                                                    {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
                                                        day: 'numeric', month: 'short', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </span>
                                            ) : (
                                                <span className="mlab-cell-sub" style={{ fontStyle: 'italic' }}>Not scheduled</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={12} />
                                                {formattedLastUpdate}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--blue"
                                                    onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
                                                    title={isCollaborator ? "Edit Shared Assessment" : "Open in Assessment Builder"}
                                                >
                                                    <Edit size={14} />
                                                </button>

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--blue"
                                                    onClick={() => handleDuplicate(test.id)}
                                                    title="Duplicate Assessment"
                                                >
                                                    <Copy size={14} />
                                                </button>

                                                {test.status === 'active' && test.requiresInvigilation && (
                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--green"
                                                        onClick={() => navigate(`/admin/invigilate/${test.id}`)}
                                                        title="Open Live Proctoring Dashboard"
                                                    >
                                                        <PlayCircle size={14} />
                                                    </button>
                                                )}

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--red"
                                                    onClick={() => initiateDelete(test)}
                                                    title={isCollaborator && user?.role !== 'admin' ? "You cannot delete a shared assessment" : "Delete"}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
                                    {assessments.length === 0 ? (
                                        <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                            <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                            <p className="mlab-empty__title">No Assessments Yet</p>
                                            <p className="mlab-empty__desc">Create your first assessment to get started.</p>
                                            <button
                                                className="mlab-btn mlab-btn--primary"
                                                onClick={() => navigate('/facilitator/assessments/builder')}
                                                style={{ marginTop: '1rem' }}
                                            >
                                                <Plus size={15} /> New Assessment
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                            <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                            <p className="mlab-empty__title">No matches found</p>
                                            <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
                                            <button
                                                className="mlab-btn mlab-btn--outline"
                                                onClick={() => {
                                                    setSearchTerm('');
                                                    setFilterType('all');
                                                    setFilterStatus('all');
                                                    setFilterProgramme('all');
                                                }}
                                                style={{ marginTop: '1rem' }}
                                            >
                                                Clear Filters
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── STATUS MODALS ── */}
            {assessmentToDelete && createPortal(
                <StatusModal
                    type="error"
                    title="Delete Assessment"
                    message={`Are you sure you want to permanently delete the workbook ${assessmentToDelete.title}? This will instantly remove it from the system, and any associated learner data may be lost.`}
                    confirmText={isProcessing ? "Deleting..." : "Delete Permanently"}
                    onClose={executeDelete}
                    onCancel={() => !isProcessing && setAssessmentToDelete(null)}
                />,
                document.body
            )}
        </div>
    );
};

export default AssessmentManager;

// // src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, CheckCircle, Copy, Clock, Video, GraduationCap, Users } from 'lucide-react';
// import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
// import { useNavigate } from 'react-router-dom';
// import { useStore } from '../../../store/useStore';
// import { db } from '../../../lib/firebase';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
// import Loader from '../../../components/common/Loader/Loader';
// import '../../../components/views/LearnersView/LearnersView.css';

// interface Assessment {
//     id: string;
//     title: string;
//     type: 'formative' | 'summative';
//     cohortId: string;
//     status: 'draft' | 'scheduled' | 'active' | 'completed';
//     scheduledDate?: string;
//     durationMinutes: number;
//     questionCount: number;
//     pendingMarkingCount?: number;
//     requiresInvigilation?: boolean;
//     moduleInfo?: {
//         qualificationTitle?: string;
//         moduleNumber?: string;
//     };
//     createdAt?: string;
//     lastUpdated?: string;
//     createdBy?: string;
//     facilitatorId?: string;
//     collaboratorIds?: string[];
// }

// // MODULE-LEVEL CACHE: This survives even when the component is destroyed by tab switching!
// let cachedAssessments: Assessment[] | null = null;

// export const AssessmentManager: React.FC = () => {
//     const { user } = useStore();
//     const navigate = useNavigate();
//     const toast = useToast();

//     // Instantly load the cache if we have it, otherwise start with an empty array
//     const [assessments, setAssessments] = useState<Assessment[]>(cachedAssessments || []);
//     const [loading, setLoading] = useState(!cachedAssessments);

//     // ─── FILTER STATES ───
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterType, setFilterType] = useState('all');
//     const [filterStatus, setFilterStatus] = useState('all');
//     const [filterProgramme, setFilterProgramme] = useState('all');

//     // ─── MODAL STATES ───
//     const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
//     const [assessmentToActivate, setAssessmentToActivate] = useState<Assessment | null>(null);
//     const [isProcessing, setIsProcessing] = useState(false);

//     useEffect(() => {
//         const fetchAssessments = async () => {
//             if (!user?.uid) return;
//             try {
//                 const assessmentMap = new Map<string, Assessment>();

//                 if (user.role === 'admin') {
//                     // ADMINS: Fetch everything in the collection
//                     const snap = await getDocs(collection(db, 'assessments'));
//                     snap.docs.forEach(d => {
//                         assessmentMap.set(d.id, { id: d.id, ...d.data() } as Assessment);
//                     });
//                 } else {
//                     // FACILITATORS/ASSESSORS: Run 3 simple, fast queries to bypass Firebase Index requirements
//                     const queries = [
//                         getDocs(query(collection(db, 'assessments'), where('createdBy', '==', user.uid))),
//                         getDocs(query(collection(db, 'assessments'), where('facilitatorId', '==', user.uid))),
//                         getDocs(query(collection(db, 'assessments'), where('collaboratorIds', 'array-contains', user.uid)))
//                     ];

//                     // Wait for all 3 to finish, then merge them into the Map (which automatically removes duplicates)
//                     const results = await Promise.all(queries);
//                     results.forEach(snapshot => {
//                         snapshot.docs.forEach(d => {
//                             assessmentMap.set(d.id, { id: d.id, ...d.data() } as Assessment);
//                         });
//                     });
//                 }

//                 const loadedAssessments = Array.from(assessmentMap.values());

//                 // Fetch pending counts for each assessment
//                 const assessmentsWithCounts = await Promise.all(loadedAssessments.map(async (test) => {
//                     try {
//                         const subQ = query(
//                             collection(db, 'learner_submissions'),
//                             where('assessmentId', '==', test.id),
//                             where('status', '==', 'submitted')
//                         );
//                         const subSnap = await getDocs(subQ);
//                         return { ...test, pendingMarkingCount: subSnap.size };
//                     } catch (e) {
//                         console.error(`Error fetching pending count for ${test.id}:`, e);
//                         return { ...test, pendingMarkingCount: 0 };
//                     }
//                 }));

//                 // Sort by newest first
//                 assessmentsWithCounts.sort((a, b) => {
//                     const dateA = new Date(a.lastUpdated || a.createdAt || 0).getTime();
//                     const dateB = new Date(b.lastUpdated || b.createdAt || 0).getTime();
//                     return dateB - dateA;
//                 });

//                 cachedAssessments = assessmentsWithCounts;
//                 setAssessments(assessmentsWithCounts);
//             } catch (err) {
//                 console.error('Error loading assessments:', err);
//                 toast.error("Failed to load assessments.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchAssessments();
//     }, [user, toast]);

//     // ─── ACTION HANDLERS ───

//     const initiateDelete = (assessment: Assessment) => {
//         const isCreator = assessment.createdBy === user?.uid || assessment.facilitatorId === user?.uid;

//         if (!isCreator && user?.role !== 'admin') {
//             toast.error("Access Denied: Only the original creator or an Admin can delete this workbook.");
//             return;
//         }
//         setAssessmentToDelete(assessment);
//     };

//     const executeDelete = async () => {
//         if (!assessmentToDelete) return;
//         setIsProcessing(true);
//         try {
//             await deleteDoc(doc(db, 'assessments', assessmentToDelete.id));
//             setAssessments(prev => {
//                 const updated = prev.filter(a => a.id !== assessmentToDelete.id);
//                 cachedAssessments = updated;
//                 return updated;
//             });
//             toast.success("Assessment deleted successfully.");
//         } catch {
//             toast.error('Failed to delete assessment.');
//         } finally {
//             setIsProcessing(false);
//             setAssessmentToDelete(null);
//         }
//     };

//     const executeActivate = async () => {
//         if (!assessmentToActivate) return;
//         setIsProcessing(true);
//         try {
//             await updateDoc(doc(db, 'assessments', assessmentToActivate.id), {
//                 status: 'active'
//             });
//             setAssessments(prev => {
//                 const updated = prev.map(a => a.id === assessmentToActivate.id ? { ...a, status: 'active' as const } : a);
//                 cachedAssessments = updated;
//                 return updated;
//             });
//             toast.success("Assessment is now active.");
//         } catch (error) {
//             console.error("Failed to activate", error);
//             toast.error("Failed to update status to Active.");
//         } finally {
//             setIsProcessing(false);
//             setAssessmentToActivate(null);
//         }
//     };

//     const handleDuplicate = async (id: string) => {
//         try {
//             toast.info("Duplicating assessment...");
//             const docRef = doc(db, 'assessments', id);
//             const snap = await getDoc(docRef);
//             if (!snap.exists()) {
//                 toast.error("Original assessment not found.");
//                 return;
//             }

//             const data = snap.data();
//             const newRef = doc(collection(db, 'assessments'));

//             const newAssessment = {
//                 ...data,
//                 title: `${data.title} (Copy)`,
//                 status: 'draft',
//                 cohortIds: [],
//                 cohortId: null,
//                 scheduledDate: null,
//                 collaboratorIds: [], // Strip collaborators on duplicate
//                 requiresInvigilation: data.requiresInvigilation ?? false,
//                 createdBy: user?.uid,
//                 facilitatorId: user?.uid,
//                 createdAt: new Date().toISOString(),
//                 lastUpdated: new Date().toISOString()
//             };

//             await setDoc(newRef, newAssessment);
//             toast.success('Assessment duplicated successfully!');
//             navigate(`/facilitator/assessments/builder/${newRef.id}`);
//         } catch (error) {
//             console.error("Duplicate Error:", error);
//             toast.error("Failed to duplicate assessment.");
//         }
//     };

//     const uniqueProgrammes = useMemo(() => {
//         const progs = new Set<string>();
//         assessments.forEach(a => {
//             if (a.moduleInfo?.qualificationTitle) {
//                 progs.add(a.moduleInfo.qualificationTitle);
//             }
//         });
//         return Array.from(progs).sort();
//     }, [assessments]);

//     const filteredAssessments = useMemo(() => {
//         return assessments.filter(test => {
//             const searchLower = searchTerm.toLowerCase();
//             const matchesSearch =
//                 test.title.toLowerCase().includes(searchLower) ||
//                 test.moduleInfo?.qualificationTitle?.toLowerCase().includes(searchLower) ||
//                 test.moduleInfo?.moduleNumber?.toLowerCase().includes(searchLower);

//             const matchesType = filterType === 'all' || test.type === filterType;
//             const matchesStatus = filterStatus === 'all' || test.status === filterStatus;
//             const testProgramme = test.moduleInfo?.qualificationTitle || 'Unmapped';
//             const matchesProgramme = filterProgramme === 'all' || testProgramme === filterProgramme;

//             return matchesSearch && matchesType && matchesStatus && matchesProgramme;
//         });
//     }, [assessments, searchTerm, filterType, filterStatus, filterProgramme]);

//     if (loading) return (
//         <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
//             <Loader message="Loading Assessments..." />
//         </div>
//     );

//     return (
//         <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* ── TOOLBAR / FILTER SYSTEM ── */}
//             <div className="mlab-toolbar">
//                 <div className="mlab-search">
//                     <Search size={18} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search by title or module..."
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>

//                 <div className="mlab-select-wrap">
//                     <Filter size={16} color="var(--mlab-grey)" />
//                     <select value={filterType} onChange={e => setFilterType(e.target.value)}>
//                         <option value="all">All Types</option>
//                         <option value="formative">Formative</option>
//                         <option value="summative">Summative</option>
//                     </select>
//                 </div>

//                 <div className="mlab-select-wrap">
//                     <Filter size={16} color="var(--mlab-grey)" />
//                     <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
//                         <option value="all">All Statuses</option>
//                         <option value="draft">Draft</option>
//                         <option value="scheduled">Scheduled</option>
//                         <option value="active">Active</option>
//                         <option value="completed">Completed</option>
//                     </select>
//                 </div>

//                 {uniqueProgrammes.length > 0 && (
//                     <div className="mlab-select-wrap">
//                         <GraduationCap size={16} color="var(--mlab-grey)" />
//                         <select value={filterProgramme} onChange={e => setFilterProgramme(e.target.value)}>
//                             <option value="all">All Programmes</option>
//                             {uniqueProgrammes.map(prog => (
//                                 <option key={prog} value={prog}>
//                                     {prog.length > 40 ? prog.substring(0, 40) + '...' : prog}
//                                 </option>
//                             ))}
//                         </select>
//                     </div>
//                 )}
//             </div>

//             {/* ── TABLE ── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Assessment Title</th>
//                             <th>Type</th>
//                             <th>Status</th>
//                             <th>Schedule</th>
//                             <th>Last Updated</th>
//                             <th style={{ textAlign: 'right' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredAssessments.length > 0 ? (
//                             filteredAssessments.map(test => {
//                                 const lastUpdateStr = test.lastUpdated || test.createdAt;
//                                 const formattedLastUpdate = lastUpdateStr
//                                     ? new Date(lastUpdateStr).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
//                                     : '—';

//                                 const isCollaborator = test.collaboratorIds?.includes(user?.uid || '');

//                                 return (
//                                     <tr key={test.id}>
//                                         <td>
//                                             <div className="mlab-cell-content">
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <span className="mlab-cell-name">{test.title}</span>
//                                                     {isCollaborator && user?.role !== 'admin' && (
//                                                         <span className="mlab-badge" style={{ background: '#f0f9ff', color: '#0284c7', border: 'none', padding: '2px 6px', fontSize: '0.65rem' }}>
//                                                             <Users size={10} style={{ marginRight: '3px' }} /> Shared
//                                                         </span>
//                                                     )}
//                                                 </div>
//                                                 <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                     <FileText size={12} /> {test.questionCount || 0} Blocks
//                                                     {test.moduleInfo?.qualificationTitle && ` • ${test.moduleInfo.qualificationTitle}`}
//                                                 </span>
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
//                                                 <span className={`mlab-badge mlab-badge--${test.type === 'formative' ? 'blue' : 'green'}`} style={{ textTransform: 'capitalize' }}>
//                                                     {test.type}
//                                                 </span>
//                                                 {test.requiresInvigilation && (
//                                                     <span className="mlab-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none' }}>
//                                                         <Video size={10} /> Proctored
//                                                     </span>
//                                                 )}
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
//                                                 <span className={`mlab-badge mlab-badge--${test.status === 'active' ? 'active' : test.status === 'draft' ? 'draft' : 'blue'}`} style={{ textTransform: 'capitalize' }}>
//                                                     {test.status}
//                                                 </span>
//                                                 {test.pendingMarkingCount !== undefined && test.pendingMarkingCount > 0 && (
//                                                     <span className="mlab-badge" style={{ background: '#fef2f2', color: '#b91c1c', border: 'none' }}>
//                                                         <AlertCircle size={10} /> {test.pendingMarkingCount} Awaiting
//                                                     </span>
//                                                 )}
//                                             </div>
//                                         </td>
//                                         <td>
//                                             {test.scheduledDate ? (
//                                                 <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)', fontWeight: 600 }}>
//                                                     <Calendar size={13} />
//                                                     {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
//                                                         day: 'numeric', month: 'short', year: 'numeric',
//                                                         hour: '2-digit', minute: '2-digit'
//                                                     })}
//                                                 </span>
//                                             ) : (
//                                                 <span className="mlab-cell-sub" style={{ fontStyle: 'italic' }}>Not scheduled</span>
//                                             )}
//                                         </td>
//                                         <td>
//                                             <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 <Clock size={12} />
//                                                 {formattedLastUpdate}
//                                             </span>
//                                         </td>
//                                         <td style={{ textAlign: 'right' }}>
//                                             <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
//                                                 {test.status === 'draft' && (
//                                                     <button
//                                                         className="mlab-icon-btn mlab-icon-btn--emerald"
//                                                         onClick={() => setAssessmentToActivate(test)}
//                                                         title="Mark as Active"
//                                                     >
//                                                         <CheckCircle size={14} />
//                                                     </button>
//                                                 )}

//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--blue"
//                                                     onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
//                                                     title={isCollaborator ? "Edit Shared Assessment" : "Edit Assessment"}
//                                                 >
//                                                     <Edit size={14} />
//                                                 </button>

//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--blue"
//                                                     onClick={() => handleDuplicate(test.id)}
//                                                     title="Duplicate Assessment"
//                                                 >
//                                                     <Copy size={14} />
//                                                 </button>

//                                                 {test.status === 'active' && test.requiresInvigilation && (
//                                                     <button
//                                                         className="mlab-icon-btn mlab-icon-btn--green"
//                                                         onClick={() => navigate(`/admin/invigilate/${test.id}`)}
//                                                         title="Open Live Proctoring Dashboard"
//                                                     >
//                                                         <PlayCircle size={14} />
//                                                     </button>
//                                                 )}

//                                                 <button
//                                                     className="mlab-icon-btn mlab-icon-btn--red"
//                                                     onClick={() => initiateDelete(test)}
//                                                     title={isCollaborator && user?.role !== 'admin' ? "You cannot delete a shared assessment" : "Delete"}
//                                                 >
//                                                     <Trash2 size={14} />
//                                                 </button>
//                                             </div>
//                                         </td>
//                                     </tr>
//                                 );
//                             })
//                         ) : (
//                             <tr>
//                                 <td colSpan={6}>
//                                     {assessments.length === 0 ? (
//                                         <div className="mlab-empty">
//                                             <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                             <p className="mlab-empty__title">No Assessments Yet</p>
//                                             <p className="mlab-empty__desc">Create your first assessment to get started.</p>
//                                             <button
//                                                 className="mlab-btn mlab-btn--primary"
//                                                 onClick={() => navigate('/facilitator/assessments/builder')}
//                                                 style={{ marginTop: '1rem' }}
//                                             >
//                                                 <Plus size={15} /> New Assessment
//                                             </button>
//                                         </div>
//                                     ) : (
//                                         <div className="mlab-empty">
//                                             <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                             <p className="mlab-empty__title">No matches found</p>
//                                             <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
//                                             <button
//                                                 className="mlab-btn mlab-btn--outline"
//                                                 onClick={() => {
//                                                     setSearchTerm('');
//                                                     setFilterType('all');
//                                                     setFilterStatus('all');
//                                                     setFilterProgramme('all');
//                                                 }}
//                                                 style={{ marginTop: '1rem' }}
//                                             >
//                                                 Clear Filters
//                                             </button>
//                                         </div>
//                                     )}
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* ── STATUS MODALS ── */}
//             {assessmentToDelete && (
//                 <StatusModal
//                     type="error"
//                     title="Delete Assessment"
//                     message={`Are you sure you want to permanently delete the workbook <strong>"${assessmentToDelete.title}"</strong>?<br/><br/>This will instantly remove it from the system, and any associated learner data may be lost.`}
//                     confirmText={isProcessing ? "Deleting..." : "Delete Permanently"}
//                     onClose={executeDelete}
//                     onCancel={() => !isProcessing && setAssessmentToDelete(null)}
//                 />
//             )}

//             {assessmentToActivate && (
//                 <StatusModal
//                     type="info"
//                     title="Publish Assessment"
//                     message={`Are you sure you want to mark <strong>"${assessmentToActivate.title}"</strong> as Active?<br/><br/>It will become immediately visible to all learners in the assigned cohorts.`}
//                     confirmText={isProcessing ? "Publishing..." : "Publish to Learners"}
//                     onClose={executeActivate}
//                     onCancel={() => !isProcessing && setAssessmentToActivate(null)}
//                 />
//             )}
//         </div>
//     );
// };


// // // src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx

// // import React, { useState, useEffect, useMemo } from 'react';
// // import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, CheckCircle, Copy, Clock, Video, GraduationCap, Users } from 'lucide-react';
// // import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, or } from 'firebase/firestore';
// // import { useNavigate } from 'react-router-dom';
// // import { useStore } from '../../../store/useStore';
// // import { db } from '../../../lib/firebase';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
// // import Loader from '../../../components/common/Loader/Loader';
// // import '../../../components/views/LearnersView/LearnersView.css';

// // interface Assessment {
// //     id: string;
// //     title: string;
// //     type: 'formative' | 'summative';
// //     cohortId: string;
// //     status: 'draft' | 'scheduled' | 'active' | 'completed';
// //     scheduledDate?: string;
// //     durationMinutes: number;
// //     questionCount: number;
// //     pendingMarkingCount?: number;
// //     requiresInvigilation?: boolean;
// //     moduleInfo?: {
// //         qualificationTitle?: string;
// //         moduleNumber?: string;
// //     };
// //     createdAt?: string;
// //     lastUpdated?: string;
// //     createdBy?: string;
// //     facilitatorId?: string;
// //     collaboratorIds?: string[];
// // }

// // // MODULE-LEVEL CACHE: This survives even when the component is destroyed by tab switching!
// // let cachedAssessments: Assessment[] | null = null;

// // export const AssessmentManager: React.FC = () => {
// //     const { user } = useStore();
// //     const navigate = useNavigate();
// //     const toast = useToast();

// //     // Instantly load the cache if we have it, otherwise start with an empty array
// //     const [assessments, setAssessments] = useState<Assessment[]>(cachedAssessments || []);
// //     const [loading, setLoading] = useState(!cachedAssessments);

// //     // ─── FILTER STATES ───
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [filterType, setFilterType] = useState('all');
// //     const [filterStatus, setFilterStatus] = useState('all');
// //     const [filterProgramme, setFilterProgramme] = useState('all');

// //     // ─── MODAL STATES ───
// //     const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
// //     const [assessmentToActivate, setAssessmentToActivate] = useState<Assessment | null>(null);
// //     const [isProcessing, setIsProcessing] = useState(false);

// //     useEffect(() => {
// //         const fetchAssessments = async () => {
// //             if (!user?.uid) return;
// //             try {
// //                 // Fetch assessments where the user is EITHER the creator OR a collaborator
// //                 const q = query(
// //                     collection(db, 'assessments'),
// //                     or(
// //                         where('facilitatorId', '==', user.uid),
// //                         where('createdBy', '==', user.uid),
// //                         where('collaboratorIds', 'array-contains', user.uid)
// //                     )
// //                 );

// //                 const snapshot = await getDocs(q);

// //                 // Use a Map to deduplicate just in case the OR query returns overlaps
// //                 const assessmentMap = new Map<string, Assessment>();

// //                 snapshot.docs.forEach(d => {
// //                     assessmentMap.set(d.id, { id: d.id, ...d.data() } as Assessment);
// //                 });

// //                 const loadedAssessments = Array.from(assessmentMap.values());

// //                 const assessmentsWithCounts = await Promise.all(loadedAssessments.map(async (test) => {
// //                     try {
// //                         const subQ = query(
// //                             collection(db, 'learner_submissions'),
// //                             where('assessmentId', '==', test.id),
// //                             where('status', '==', 'submitted')
// //                         );
// //                         const subSnap = await getDocs(subQ);
// //                         return { ...test, pendingMarkingCount: subSnap.size };
// //                     } catch (e) {
// //                         console.error(`Error fetching pending count for ${test.id}:`, e);
// //                         return { ...test, pendingMarkingCount: 0 };
// //                     }
// //                 }));

// //                 assessmentsWithCounts.sort((a, b) => {
// //                     const dateA = new Date(a.lastUpdated || a.createdAt || 0).getTime();
// //                     const dateB = new Date(b.lastUpdated || b.createdAt || 0).getTime();
// //                     return dateB - dateA;
// //                 });

// //                 cachedAssessments = assessmentsWithCounts;
// //                 setAssessments(assessmentsWithCounts);
// //             } catch (err) {
// //                 console.error('Error loading assessments:', err);
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };

// //         fetchAssessments();
// //     }, [user]);

// //     // ─── ACTION HANDLERS ───

// //     const initiateDelete = (assessment: Assessment) => {
// //         const isCreator = assessment.createdBy === user?.uid || assessment.facilitatorId === user?.uid;

// //         if (!isCreator && user?.role !== 'admin') {
// //             toast.error("Access Denied: Only the original creator can delete this workbook.");
// //             return;
// //         }
// //         setAssessmentToDelete(assessment);
// //     };

// //     const executeDelete = async () => {
// //         if (!assessmentToDelete) return;
// //         setIsProcessing(true);
// //         try {
// //             await deleteDoc(doc(db, 'assessments', assessmentToDelete.id));
// //             setAssessments(prev => {
// //                 const updated = prev.filter(a => a.id !== assessmentToDelete.id);
// //                 cachedAssessments = updated;
// //                 return updated;
// //             });
// //             toast.success("Assessment deleted successfully.");
// //         } catch {
// //             toast.error('Failed to delete assessment.');
// //         } finally {
// //             setIsProcessing(false);
// //             setAssessmentToDelete(null);
// //         }
// //     };

// //     const executeActivate = async () => {
// //         if (!assessmentToActivate) return;
// //         setIsProcessing(true);
// //         try {
// //             await updateDoc(doc(db, 'assessments', assessmentToActivate.id), {
// //                 status: 'active'
// //             });
// //             setAssessments(prev => {
// //                 const updated = prev.map(a => a.id === assessmentToActivate.id ? { ...a, status: 'active' as const } : a);
// //                 cachedAssessments = updated;
// //                 return updated;
// //             });
// //             toast.success("Assessment is now active.");
// //         } catch (error) {
// //             console.error("Failed to activate", error);
// //             toast.error("Failed to update status to Active.");
// //         } finally {
// //             setIsProcessing(false);
// //             setAssessmentToActivate(null);
// //         }
// //     };

// //     const handleDuplicate = async (id: string) => {
// //         try {
// //             toast.info("Duplicating assessment...");
// //             const docRef = doc(db, 'assessments', id);
// //             const snap = await getDoc(docRef);
// //             if (!snap.exists()) {
// //                 toast.error("Original assessment not found.");
// //                 return;
// //             }

// //             const data = snap.data();
// //             const newRef = doc(collection(db, 'assessments'));

// //             const newAssessment = {
// //                 ...data,
// //                 title: `${data.title} (Copy)`,
// //                 status: 'draft',
// //                 cohortIds: [],
// //                 cohortId: null,
// //                 scheduledDate: null,
// //                 collaboratorIds: [], // Strip collaborators on duplicate
// //                 requiresInvigilation: data.requiresInvigilation ?? false,
// //                 createdBy: user?.uid,
// //                 facilitatorId: user?.uid,
// //                 createdAt: new Date().toISOString(),
// //                 lastUpdated: new Date().toISOString()
// //             };

// //             await setDoc(newRef, newAssessment);
// //             toast.success('Assessment duplicated successfully!');
// //             navigate(`/facilitator/assessments/builder/${newRef.id}`);
// //         } catch (error) {
// //             console.error("Duplicate Error:", error);
// //             toast.error("Failed to duplicate assessment.");
// //         }
// //     };

// //     const uniqueProgrammes = useMemo(() => {
// //         const progs = new Set<string>();
// //         assessments.forEach(a => {
// //             if (a.moduleInfo?.qualificationTitle) {
// //                 progs.add(a.moduleInfo.qualificationTitle);
// //             }
// //         });
// //         return Array.from(progs).sort();
// //     }, [assessments]);

// //     const filteredAssessments = useMemo(() => {
// //         return assessments.filter(test => {
// //             const searchLower = searchTerm.toLowerCase();
// //             const matchesSearch =
// //                 test.title.toLowerCase().includes(searchLower) ||
// //                 test.moduleInfo?.qualificationTitle?.toLowerCase().includes(searchLower) ||
// //                 test.moduleInfo?.moduleNumber?.toLowerCase().includes(searchLower);

// //             const matchesType = filterType === 'all' || test.type === filterType;
// //             const matchesStatus = filterStatus === 'all' || test.status === filterStatus;
// //             const testProgramme = test.moduleInfo?.qualificationTitle || 'Unmapped';
// //             const matchesProgramme = filterProgramme === 'all' || testProgramme === filterProgramme;

// //             return matchesSearch && matchesType && matchesStatus && matchesProgramme;
// //         });
// //     }, [assessments, searchTerm, filterType, filterStatus, filterProgramme]);

// //     if (loading) return (
// //         <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
// //             <Loader message="Loading Assessments..." />
// //         </div>
// //     );

// //     return (
// //         <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* ── TOOLBAR / FILTER SYSTEM ── */}
// //             <div className="mlab-toolbar">
// //                 <div className="mlab-search">
// //                     <Search size={18} color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         placeholder="Search by title or module..."
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                 </div>

// //                 <div className="mlab-select-wrap">
// //                     <Filter size={16} color="var(--mlab-grey)" />
// //                     <select value={filterType} onChange={e => setFilterType(e.target.value)}>
// //                         <option value="all">All Types</option>
// //                         <option value="formative">Formative</option>
// //                         <option value="summative">Summative</option>
// //                     </select>
// //                 </div>

// //                 <div className="mlab-select-wrap">
// //                     <Filter size={16} color="var(--mlab-grey)" />
// //                     <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
// //                         <option value="all">All Statuses</option>
// //                         <option value="draft">Draft</option>
// //                         <option value="scheduled">Scheduled</option>
// //                         <option value="active">Active</option>
// //                         <option value="completed">Completed</option>
// //                     </select>
// //                 </div>

// //                 {uniqueProgrammes.length > 0 && (
// //                     <div className="mlab-select-wrap">
// //                         <GraduationCap size={16} color="var(--mlab-grey)" />
// //                         <select value={filterProgramme} onChange={e => setFilterProgramme(e.target.value)}>
// //                             <option value="all">All Programmes</option>
// //                             {uniqueProgrammes.map(prog => (
// //                                 <option key={prog} value={prog}>
// //                                     {prog.length > 40 ? prog.substring(0, 40) + '...' : prog}
// //                                 </option>
// //                             ))}
// //                         </select>
// //                     </div>
// //                 )}
// //             </div>

// //             {/* ── TABLE ── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Assessment Title</th>
// //                             <th>Type</th>
// //                             <th>Status</th>
// //                             <th>Schedule</th>
// //                             <th>Last Updated</th>
// //                             <th style={{ textAlign: 'right' }}>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {filteredAssessments.length > 0 ? (
// //                             filteredAssessments.map(test => {
// //                                 const lastUpdateStr = test.lastUpdated || test.createdAt;
// //                                 const formattedLastUpdate = lastUpdateStr
// //                                     ? new Date(lastUpdateStr).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
// //                                     : '—';

// //                                 const isCollaborator = test.collaboratorIds?.includes(user?.uid || '');

// //                                 return (
// //                                     <tr key={test.id}>
// //                                         <td>
// //                                             <div className="mlab-cell-content">
// //                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                     <span className="mlab-cell-name">{test.title}</span>
// //                                                     {isCollaborator && (
// //                                                         <span className="mlab-badge" style={{ background: '#f0f9ff', color: '#0284c7', border: 'none', padding: '2px 6px', fontSize: '0.65rem' }}>
// //                                                             <Users size={10} style={{ marginRight: '3px' }} /> Shared
// //                                                         </span>
// //                                                     )}
// //                                                 </div>
// //                                                 <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     <FileText size={12} /> {test.questionCount || 0} Blocks
// //                                                     {test.moduleInfo?.qualificationTitle && ` • ${test.moduleInfo.qualificationTitle}`}
// //                                                 </span>
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
// //                                                 <span className={`mlab-badge mlab-badge--${test.type === 'formative' ? 'blue' : 'green'}`} style={{ textTransform: 'capitalize' }}>
// //                                                     {test.type}
// //                                                 </span>
// //                                                 {test.requiresInvigilation && (
// //                                                     <span className="mlab-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none' }}>
// //                                                         <Video size={10} /> Proctored
// //                                                     </span>
// //                                                 )}
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
// //                                                 <span className={`mlab-badge mlab-badge--${test.status === 'active' ? 'active' : test.status === 'draft' ? 'draft' : 'blue'}`} style={{ textTransform: 'capitalize' }}>
// //                                                     {test.status}
// //                                                 </span>
// //                                                 {test.pendingMarkingCount !== undefined && test.pendingMarkingCount > 0 && (
// //                                                     <span className="mlab-badge" style={{ background: '#fef2f2', color: '#b91c1c', border: 'none' }}>
// //                                                         <AlertCircle size={10} /> {test.pendingMarkingCount} Awaiting
// //                                                     </span>
// //                                                 )}
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             {test.scheduledDate ? (
// //                                                 <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)', fontWeight: 600 }}>
// //                                                     <Calendar size={13} />
// //                                                     {new Date(test.scheduledDate).toLocaleDateString('en-ZA', {
// //                                                         day: 'numeric', month: 'short', year: 'numeric',
// //                                                         hour: '2-digit', minute: '2-digit'
// //                                                     })}
// //                                                 </span>
// //                                             ) : (
// //                                                 <span className="mlab-cell-sub" style={{ fontStyle: 'italic' }}>Not scheduled</span>
// //                                             )}
// //                                         </td>
// //                                         <td>
// //                                             <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                 <Clock size={12} />
// //                                                 {formattedLastUpdate}
// //                                             </span>
// //                                         </td>
// //                                         <td style={{ textAlign: 'right' }}>
// //                                             <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
// //                                                 {test.status === 'draft' && (
// //                                                     <button
// //                                                         className="mlab-icon-btn mlab-icon-btn--emerald"
// //                                                         onClick={() => setAssessmentToActivate(test)}
// //                                                         title="Mark as Active"
// //                                                     >
// //                                                         <CheckCircle size={14} />
// //                                                     </button>
// //                                                 )}

// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--blue"
// //                                                     onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
// //                                                     title={isCollaborator ? "Edit Shared Assessment" : "Edit Assessment"}
// //                                                 >
// //                                                     <Edit size={14} />
// //                                                 </button>

// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--blue"
// //                                                     onClick={() => handleDuplicate(test.id)}
// //                                                     title="Duplicate Assessment"
// //                                                 >
// //                                                     <Copy size={14} />
// //                                                 </button>

// //                                                 {test.status === 'active' && test.requiresInvigilation && (
// //                                                     <button
// //                                                         className="mlab-icon-btn mlab-icon-btn--green"
// //                                                         onClick={() => navigate(`/admin/invigilate/${test.id}`)}
// //                                                         title="Open Live Proctoring Dashboard"
// //                                                     >
// //                                                         <PlayCircle size={14} />
// //                                                     </button>
// //                                                 )}

// //                                                 <button
// //                                                     className="mlab-icon-btn mlab-icon-btn--red"
// //                                                     onClick={() => initiateDelete(test)}
// //                                                     title={isCollaborator ? "You cannot delete a shared assessment" : "Delete"}
// //                                                 >
// //                                                     <Trash2 size={14} />
// //                                                 </button>
// //                                             </div>
// //                                         </td>
// //                                     </tr>
// //                                 );
// //                             })
// //                         ) : (
// //                             <tr>
// //                                 <td colSpan={6}>
// //                                     {assessments.length === 0 ? (
// //                                         <div className="mlab-empty">
// //                                             <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                             <p className="mlab-empty__title">No Assessments Yet</p>
// //                                             <p className="mlab-empty__desc">Create your first assessment to get started.</p>
// //                                             <button
// //                                                 className="mlab-btn mlab-btn--primary"
// //                                                 onClick={() => navigate('/facilitator/assessments/builder')}
// //                                                 style={{ marginTop: '1rem' }}
// //                                             >
// //                                                 <Plus size={15} /> New Assessment
// //                                             </button>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="mlab-empty">
// //                                             <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                             <p className="mlab-empty__title">No matches found</p>
// //                                             <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// //                                             <button
// //                                                 className="mlab-btn mlab-btn--outline"
// //                                                 onClick={() => {
// //                                                     setSearchTerm('');
// //                                                     setFilterType('all');
// //                                                     setFilterStatus('all');
// //                                                     setFilterProgramme('all');
// //                                                 }}
// //                                                 style={{ marginTop: '1rem' }}
// //                                             >
// //                                                 Clear Filters
// //                                             </button>
// //                                         </div>
// //                                     )}
// //                                 </td>
// //                             </tr>
// //                         )}
// //                     </tbody>
// //                 </table>
// //             </div>

// //             {/* ── STATUS MODALS ── */}
// //             {assessmentToDelete && (
// //                 <StatusModal
// //                     type="error"
// //                     title="Delete Assessment"
// //                     message={`Are you sure you want to permanently delete the workbook <strong>"${assessmentToDelete.title}"</strong>?<br/><br/>This will instantly remove it from the system, and any associated learner data may be lost.`}
// //                     confirmText={isProcessing ? "Deleting..." : "Delete Permanently"}
// //                     onClose={executeDelete}
// //                     onCancel={() => !isProcessing && setAssessmentToDelete(null)}
// //                 />
// //             )}

// //             {assessmentToActivate && (
// //                 <StatusModal
// //                     type="info"
// //                     title="Publish Assessment"
// //                     message={`Are you sure you want to mark <strong>"${assessmentToActivate.title}"</strong> as Active?<br/><br/>It will become immediately visible to all learners in the assigned cohorts.`}
// //                     confirmText={isProcessing ? "Publishing..." : "Publish to Learners"}
// //                     onClose={executeActivate}
// //                     onCancel={() => !isProcessing && setAssessmentToActivate(null)}
// //                 />
// //             )}
// //         </div>
// //     );
// // };

