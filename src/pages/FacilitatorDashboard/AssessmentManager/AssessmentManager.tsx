// src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, CheckCircle, Copy, Clock, Video } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import './AssessmentManager.css';
import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import PageHeader from '../../../components/common/PageHeader/PageHeader';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

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
            setAssessments(prev => prev.filter(a => a.id !== id));
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
            setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: 'active' } : a));
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
        <div className="am-loading">
            <div className="am-spinner" />
            Loading Assessments…
        </div>
    );

    return (
        <div className="am-manager-container am-animate" style={{ paddingBottom: 16 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

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

            <div className="am-panel">
                {/* ── TOOLBAR / FILTER SYSTEM ── */}
                <div className="am-filters">
                    <div className="am-filters-label">
                        <Filter size={16} /> Filters:
                    </div>

                    <div className="am-search-wrapper">
                        <Search size={16} className="am-search-icon" />
                        <input
                            type="text"
                            placeholder="Search by title or module..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="am-search-input"
                        />
                    </div>

                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="am-filter-select"
                    >
                        <option value="all">All Types</option>
                        <option value="formative">Formative</option>
                        <option value="summative">Summative</option>
                    </select>

                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="am-filter-select"
                    >
                        <option value="all">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                    </select>

                    {uniqueProgrammes.length > 0 && (
                        <select
                            value={filterProgramme}
                            onChange={e => setFilterProgramme(e.target.value)}
                            className="am-filter-select am-programme-select"
                        >
                            <option value="all">All Programmes / Templates</option>
                            {uniqueProgrammes.map(prog => (
                                <option key={prog} value={prog}>
                                    {prog.length > 40 ? prog.substring(0, 40) + '...' : prog}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* ── TABLE ── */}
                <div className="am-table-wrapper">
                    <table className="am-table">
                        <thead>
                            <tr>
                                <th>Assessment Title</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Schedule</th>
                                <th>Last Updated</th>
                                <th className="am-col-right">Actions</th>
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
                                                <span className="am-cell-title">{test.title}</span>
                                                <span className="am-cell-sub">
                                                    <FileText size={12} /> {test.questionCount || 0} Blocks
                                                    {test.moduleInfo?.qualificationTitle && ` • ${test.moduleInfo.qualificationTitle}`}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`am-badge am-badge--${test.type}`}>{test.type}</span>
                                                {test.requiresInvigilation && (
                                                    <span className="am-badge am-badge-proctored">
                                                        <Video size={10} /> Proctored
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`am-badge am-badge--${test.status}`}>{test.status}</span>
                                                {test.pendingMarkingCount !== undefined && test.pendingMarkingCount > 0 && (
                                                    <div className="am-marking-indicator">
                                                        <span className="am-badge am-badge-marking">
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
                                                            day: 'numeric', month: 'short', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </span>
                                                ) : (
                                                    <span className="am-schedule__empty">Not scheduled</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="am-cell-sub am-cell-updated">
                                                    <Clock size={12} />
                                                    {formattedLastUpdate}
                                                </span>
                                            </td>
                                            <td className="am-col-right">
                                                <div className="am-actions">
                                                    {test.status === 'draft' && (
                                                        <button
                                                            className="am-btn am-btn--outline am-btn--sm am-btn-activate"
                                                            onClick={() => handleActivateDraft(test.id)}
                                                            title="Mark as Active"
                                                        >
                                                            <CheckCircle size={13} /> Activate
                                                        </button>
                                                    )}

                                                    <button
                                                        className="am-btn am-btn--outline am-btn--sm"
                                                        onClick={() => navigate(`/facilitator/assessments/builder/${test.id}`)}
                                                    >
                                                        <Edit size={13} /> Edit
                                                    </button>

                                                    <button
                                                        className="am-btn am-btn--outline am-btn--sm"
                                                        onClick={() => handleDuplicate(test.id)}
                                                        title="Duplicate Assessment"
                                                    >
                                                        <Copy size={13} /> Duplicate
                                                    </button>
                                                    {/* {test.status === 'active' && test.requiresInvigilation && ( */}

                                                    {test.status === 'active' && test.requiresInvigilation && (
                                                        <button
                                                            className="am-btn am-btn--green am-btn--sm"
                                                            onClick={() => navigate(`/admin/invigilate/${test.id}`)}
                                                            title="Open Live Proctoring Dashboard"
                                                        >
                                                            <PlayCircle size={13} /> Invigilate
                                                        </button>
                                                    )
                                                    }
                                                    < button
                                                        className="am-btn am-btn--danger"
                                                        onClick={() => handleDelete(test.id)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={15} />
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
                                        ) : (
                                            <div className="am-empty">
                                                <div className="am-empty__icon"><Search size={40} color="#cbd5e1" /></div>
                                                <p className="am-empty__title">No matches found</p>
                                                <p className="am-empty__sub">Try adjusting your filters or search term.</p>
                                                <button
                                                    className="am-btn am-btn--outline"
                                                    onClick={() => {
                                                        setSearchTerm('');
                                                        setFilterType('all');
                                                        setFilterStatus('all');
                                                        setFilterProgramme('all');
                                                    }}
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
        </div >
    );
};