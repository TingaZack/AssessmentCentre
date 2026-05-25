// src/pages/FacilitatorDashboard/AssessmentManager/AssessmentManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Calendar, FileText, Trash2, Edit, PlayCircle, AlertCircle, Search, Filter, Copy, Clock, Video, GraduationCap, Users, RefreshCw, ArrowUpDown, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store/useStore';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import Loader from '../../../components/common/Loader/Loader';
import '../../../components/views/LearnersView/LearnersView.css';

export const AssessmentManager: React.FC = () => {

    const {
        user,
        assessments,
        isFetchingAssessments,
        fetchAssessments,
        duplicateAssessment,
        deleteAssessment
    } = useStore() as any;

    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

    // ─── URL-BOUND FILTER & SORT STATES ───
    const searchTerm = searchParams.get('q') || '';
    const filterType = searchParams.get('type') || 'all';
    const filterStatus = searchParams.get('status') || 'all';
    const filterProgramme = searchParams.get('prog') || 'all';
    const sortBy = (searchParams.get('sort') as 'date' | 'title' | 'status' | 'type') || 'date';
    const sortOrder = (searchParams.get('order') as 'asc' | 'desc') || 'desc';

    const hasActiveFilters = searchTerm !== '' || filterType !== 'all' || filterStatus !== 'all' || filterProgramme !== 'all' || sortBy !== 'date' || sortOrder !== 'desc';

    // Helper to gracefully update the URL without pushing a million history states
    const updateUrlParam = (key: string, value: string) => {
        const nextParams = new URLSearchParams(searchParams);
        // Clean up the URL: if a value is empty or default ('all'), remove it from the query string
        if (!value || value === 'all') {
            nextParams.delete(key);
        } else {
            nextParams.set(key, value);
        }
        setSearchParams(nextParams, { replace: true });
    };

    // Only delete the filter parameters, preserving parent routing like `?tab=assessments`
    const handleClearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('q');
        nextParams.delete('type');
        nextParams.delete('status');
        nextParams.delete('prog');
        nextParams.delete('sort');
        nextParams.delete('order');
        setSearchParams(nextParams, { replace: true });
    };

    // ─── MODAL STATES ───
    const [assessmentToDelete, setAssessmentToDelete] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Initial load
    useEffect(() => {
        if (user?.uid) {
            fetchAssessments();
        }
    }, [user?.uid, fetchAssessments]);

    // ─── ACTION HANDLERS ───
    const initiateDelete = (assessment: any) => {
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
            await deleteAssessment(assessmentToDelete.id);
            toast.success("Assessment deleted successfully.");
        } catch {
            toast.error('Failed to delete assessment.');
        } finally {
            setIsProcessing(false);
            setAssessmentToDelete(null);
        }
    };

    const handleDuplicate = async (id: string) => {
        setIsProcessing(true);
        try {
            toast.info("Cloning assessment...");
            const newId = await duplicateAssessment(id);
            toast.success('Assessment duplicated successfully!');
            navigate(`/facilitator/assessments/builder/${newId}`);
        } catch (error: any) {
            console.error("Duplicate Error:", error);
            toast.error(error.message || "Failed to duplicate assessment.");
        } finally {
            setIsProcessing(false);
        }
    };

    const uniqueProgrammes = useMemo(() => {
        const progs = new Set<string>();
        assessments.forEach((a: any) => {
            if (a.moduleInfo?.qualificationTitle) {
                progs.add(a.moduleInfo.qualificationTitle);
            }
        });
        return Array.from(progs).sort();
    }, [assessments]);

    const filteredAssessments = useMemo(() => {
        let filtered = assessments.filter((test: any) => {
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

        filtered.sort((a: any, b: any) => {
            let comparison = 0;
            switch (sortBy) {
                case 'title':
                    comparison = (a.title || '').localeCompare(b.title || '');
                    break;
                case 'date':
                    const dateA = new Date(a.lastUpdated || a.createdAt || 0).getTime();
                    const dateB = new Date(b.lastUpdated || b.createdAt || 0).getTime();
                    comparison = dateA - dateB;
                    break;
                case 'status':
                    comparison = (a.status || '').localeCompare(b.status || '');
                    break;
                case 'type':
                    comparison = (a.type || '').localeCompare(b.type || '');
                    break;
            }
            return sortOrder === 'asc' ? comparison : comparison * -1;
        });

        return filtered;
    }, [assessments, searchTerm, filterType, filterStatus, filterProgramme, sortBy, sortOrder]);

    if (isFetchingAssessments && assessments.length === 0) return (
        <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Loader message="Loading Assessments..." />
        </div>
    );

    return (
        <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><FileText size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Assessments</h1>
                        <p className="wm-page-header__desc">Create, distribute, and manage curriculum assessments and tasks.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="cdp-btn cdp-btn--outline"
                        style={{ background: 'white' }}
                        onClick={() => fetchAssessments(true)}
                        disabled={isFetchingAssessments}
                        title="Refresh Data"
                    >
                        <RefreshCw size={14} className={isFetchingAssessments ? 'spin' : ''} />
                    </button>
                    <button
                        className="wm-btn wm-btn--primary"
                        onClick={() => navigate('/facilitator/assessments/builder')}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        <Plus size={14} /> Create Assessment
                    </button>
                </div>
            </div>

            {/* ── TOOLBAR / FILTER SYSTEM ── */}
            <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="mlab-search">
                        <Search size={18} color="var(--mlab-grey)" />
                        <input
                            type="text"
                            placeholder="Search by title or module..."
                            value={searchTerm}
                            onChange={e => updateUrlParam('q', e.target.value)}
                        />
                    </div>

                    <div className="mlab-select-wrap">
                        <Filter size={16} color="var(--mlab-grey)" />
                        <select value={filterType} onChange={e => updateUrlParam('type', e.target.value)}>
                            <option value="all">All Types</option>
                            <option value="formative">Formative</option>
                            <option value="summative">Summative</option>
                        </select>
                    </div>

                    <div className="mlab-select-wrap">
                        <Filter size={16} color="var(--mlab-grey)" />
                        <select value={filterStatus} onChange={e => updateUrlParam('status', e.target.value)}>
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
                            <select value={filterProgramme} onChange={e => updateUrlParam('prog', e.target.value)}>
                                <option value="all">All Programmes</option>
                                {uniqueProgrammes.map(prog => (
                                    <option key={prog} value={prog}>
                                        {prog.length > 40 ? prog.substring(0, 40) + '...' : prog}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* SORT BY DROPDOWN */}
                    <div className="mlab-select-wrap">
                        <ArrowUpDown size={16} color="var(--mlab-grey)" />
                        <select value={sortBy} onChange={e => updateUrlParam('sort', e.target.value)}>
                            <option value="date">Date Updated</option>
                            <option value="title">Assessment Title</option>
                            <option value="status">Status</option>
                            <option value="type">Assessment Type</option>
                        </select>
                    </div>

                    {/* SORT ORDER TOGGLE */}
                    <button
                        className="mlab-btn mlab-btn--ghost"
                        onClick={() => updateUrlParam('order', sortOrder === 'asc' ? 'desc' : 'asc')}
                        title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
                        style={{ padding: '0 12px', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                    >
                        {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                    </button>

                    {/* RESET FILTERS BUTTON */}
                    {hasActiveFilters && (
                        <button
                            className="mlab-btn mlab-btn--ghost"
                            onClick={handleClearFilters}
                            title="Clear all filters and sorting"
                            style={{ padding: '0 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>
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
                            filteredAssessments.map((test: any) => {
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
                                                    disabled={isProcessing}
                                                >
                                                    <Edit size={14} />
                                                </button>

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--blue"
                                                    onClick={() => handleDuplicate(test.id)}
                                                    title="Duplicate Assessment"
                                                    disabled={isProcessing}
                                                >
                                                    <Copy size={14} />
                                                </button>

                                                {test.status === 'active' && test.requiresInvigilation && (
                                                    <button
                                                        className="mlab-icon-btn mlab-icon-btn--green"
                                                        onClick={() => navigate(`/admin/invigilate/${test.id}`)}
                                                        title="Open Live Proctoring Dashboard"
                                                        disabled={isProcessing}
                                                    >
                                                        <PlayCircle size={14} />
                                                    </button>
                                                )}

                                                <button
                                                    className="mlab-icon-btn mlab-icon-btn--red"
                                                    onClick={() => initiateDelete(test)}
                                                    title={isCollaborator && user?.role !== 'admin' ? "You cannot delete a shared assessment" : "Delete"}
                                                    disabled={isProcessing}
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
                                                onClick={handleClearFilters}
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