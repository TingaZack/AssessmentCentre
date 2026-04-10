// src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, CheckCircle, Copy, Clock, Video, GraduationCap } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import Loader from '../../../components/common/Loader/Loader';
import '../../../components/views/LearnersView/LearnersView.css';

interface Assessment {
    id: string;
    title: string;
    type: 'formative' | 'summative';
    cohortId: string;
    status: 'draft' | 'scheduled' | 'active' | 'completed';
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
}

// MODULE-LEVEL CACHE: This survives even when the component is destroyed by tab switching!
let cachedAssessments: Assessment[] | null = null;

export const AssessmentManager: React.FC = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const toast = useToast();

    // Instantly load the cache if we have it, otherwise start with an empty array
    const [assessments, setAssessments] = useState<Assessment[]>(cachedAssessments || []);

    // Only show the full loading spinner if we have NO cache at all
    const [loading, setLoading] = useState(!cachedAssessments);

    // ─── FILTER STATES ───
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterProgramme, setFilterProgramme] = useState('all');

    useEffect(() => {
        const fetchAssessments = async () => {
            if (!user?.uid) return;
            try {
                const q = query(collection(db, 'assessments'), where('facilitatorId', '==', user.uid));
                const snapshot = await getDocs(q);
                const loadedAssessments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assessment));

                const assessmentsWithCounts = await Promise.all(loadedAssessments.map(async (test) => {
                    try {
                        const subQ = query(
                            collection(db, 'learner_submissions'),
                            where('assessmentId', '==', test.id),
                            where('status', '==', 'submitted')
                        );
                        const subSnap = await getDocs(subQ);
                        return { ...test, pendingMarkingCount: subSnap.size };
                    } catch (e) {
                        console.error(`Error fetching pending count for ${test.id}:`, e);
                        return { ...test, pendingMarkingCount: 0 };
                    }
                }));

                assessmentsWithCounts.sort((a, b) => {
                    const dateA = new Date(a.lastUpdated || a.createdAt || 0).getTime();
                    const dateB = new Date(b.lastUpdated || b.createdAt || 0).getTime();
                    return dateB - dateA;
                });

                // Update both our local state AND the permanent cache
                cachedAssessments = assessmentsWithCounts;
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
        if (!window.confirm('Are you sure you want to delete this assessment? This cannot be undone.')) return;
        try {
            await deleteDoc(doc(db, 'assessments', id));
            setAssessments(prev => {
                const updated = prev.filter(a => a.id !== id);
                cachedAssessments = updated; // Update cache
                return updated;
            });
        } catch {
            alert('Failed to delete assessment.');
        }
    };

    const handleActivateDraft = async (id: string) => {
        if (!window.confirm('Mark this draft as Active?')) return;
        try {
            await updateDoc(doc(db, 'assessments', id), {
                status: 'active'
            });
            setAssessments(prev => {
                const updated = prev.map(a => a.id === id ? { ...a, status: 'active' as const } : a);
                cachedAssessments = updated; // Update cache
                return updated;
            });
        } catch (error) {
            console.error("Failed to activate", error);
            alert("Failed to update status to Active.");
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
                requiresInvigilation: data.requiresInvigilation ?? false,
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
            <div className="mlab-toolbar">
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

                                return (
                                    <tr key={test.id}>
                                        <td>
                                            <div className="mlab-cell-content">
                                                <span className="mlab-cell-name">{test.title}</span>
                                                <span className="mlab-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={12} /> {test.questionCount || 0} Blocks
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
                                                <span className={`mlab-badge mlab-badge--${test.status === 'active' ? 'active' : test.status === 'draft' ? 'draft' : 'blue'}`} style={{ textTransform: 'capitalize' }}>
                                                    {test.status}
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
                                                {test.status === 'draft' && (
                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--emerald"
                                                        onClick={() => handleActivateDraft(test.id)}
                                                        title="Mark as Active"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                )}

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--blue"
                                                    onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
                                                    title="Edit Assessment"
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
                                                    onClick={() => handleDelete(test.id)}
                                                    title="Delete"
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
                                <td colSpan={6}>
                                    {assessments.length === 0 ? (
                                        <div className="mlab-empty">
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
                                        <div className="mlab-empty">
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
        </div>
    );
};
