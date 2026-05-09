// src/components/admin/CohortFormModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Save, Loader2, ShieldAlert, CheckSquare, Square,
    User, Users, BookOpen, Layers, Search, Info, MapPin,
    Calendar, Plus, Trash2
} from 'lucide-react';
import './CohortFormModal.css';
import type { Cohort } from '../../../types';
import { useStore } from '../../../store/useStore';
import { StatusModal, type StatusType } from '../../common/StatusModal/StatusModal';

interface Props {
    cohort?: Cohort;
    onClose: () => void;
    onSave: (
        cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
        reasons?: { facilitator?: string; assessor?: string; moderator?: string }
    ) => Promise<void>;
}

const ROLE_META: { key: 'facilitator' | 'supportFacilitator' | 'assessor' | 'moderator'; label: string }[] = [
    { key: 'facilitator', label: 'Primary Facilitator *' },
    { key: 'supportFacilitator', label: 'Support / Backup Facilitator' },
    { key: 'assessor', label: 'Assessor' },
    { key: 'moderator', label: 'Moderator' },
];

export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
    const { staff, learners, programmes, cohorts, settings } = useStore();
    const [loading, setLoading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [showAll, setShowAll] = useState(false);

    const [statusModal, setStatusModal] = useState<{
        show: boolean; type: StatusType; title: string; message: string;
    }>({ show: false, type: 'info', title: '', message: '' });

    const [formData, setFormData] = useState({
        name: '', programmeId: '', campusId: '', startDate: '', endDate: '',
        facilitatorId: '', supportFacilitatorId: '', assessorId: '', moderatorId: '',
        learnerIds: [] as string[],
        recessPeriods: [] as { start: string, end: string, reason: string }[],
    });

    const [reasons, setReasons] = useState({
        facilitator: '', supportFacilitator: '', assessor: '', moderator: '',
    });

    // ── Identity Helper: Always returns the Enrollment IDs for a human ──
    const getResolvedCohortId = (l: any) => {
        const enrollment = l.enrollment || {};
        const rawId = enrollment.cohortId || l.cohortId || l.cohort || l.classId || '';
        return String(rawId).trim();
    };

    // ── FORGIVING LEARNER FILTER ──
    const filteredLearners = useMemo(() => learners.filter(l => {
        const allowedStatuses = ['active', 'in-progress', undefined, '', 'registered'];
        const currentStatus = (l.status || '').toLowerCase();

        if (l.isArchived || l.isOffline || (l.status && !allowedStatuses.includes(currentStatus))) {
            return false;
        }

        const matchesSearch =
            l.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.idNumber?.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;
        if (showAll) return true;

        const resolvedCohortId = getResolvedCohortId(l);
        const isDormant = !resolvedCohortId || resolvedCohortId === "" || resolvedCohortId === "Unassigned";
        const isAlreadyInThisClass = cohort && String(cohort.id).trim() === resolvedCohortId;

        return isDormant || isAlreadyInThisClass;
    }), [learners, cohort, searchTerm, showAll]);

    // SYNC & HEAL ON LOAD
    useEffect(() => {
        if (cohort) {
            // CRITICAL: Convert any legacy Auto-IDs in the list to the learner's ID Number
            // This ensures that checkboxes match our modern identity standard.
            const healedIds = (cohort.learnerIds || []).map(cid => {
                const match = learners.find(l => l.id === cid || l.idNumber === cid);
                return match ? (match.idNumber || match.id) : cid;
            });

            setFormData({
                name: cohort.name,
                programmeId: cohort.programmeId,
                campusId: cohort.campusId || '',
                startDate: cohort.startDate,
                endDate: cohort.endDate,
                facilitatorId: cohort.facilitatorId || '',
                supportFacilitatorId: cohort.supportFacilitatorId || '',
                assessorId: cohort.assessorId || '',
                moderatorId: cohort.moderatorId || '',
                learnerIds: Array.from(new Set(healedIds)),
                recessPeriods: cohort.recessPeriods || [],
            });
        } else if (settings?.campuses && settings.campuses.length > 0) {
            const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
            setFormData(prev => ({ ...prev, campusId: defaultCampus.id }));
        }
    }, [cohort, settings, learners]);

    const showStatus = (type: StatusType, title: string, message: string) =>
        setStatusModal({ show: true, type, title, message });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.facilitatorId) {
            showStatus('error', 'Missing Staff', 'A Primary Facilitator is strictly required.');
            return;
        }

        // Validate recess dates
        for (const recess of formData.recessPeriods) {
            if (!recess.start || !recess.end || !recess.reason) {
                showStatus('error', 'Incomplete Recess', 'All break periods must have a reason, start date, and end date.');
                return;
            }
            if (new Date(recess.start) > new Date(recess.end)) {
                showStatus('error', 'Invalid Recess Dates', 'A break\'s start date cannot be after its end date.');
                return;
            }
        }

        setLoading(true);
        try {
            await onSave(formData as any, reasons);
            onClose();
        } catch (err: any) {
            showStatus('error', 'Database Error', err.message || 'System failed to commit changes.');
        } finally {
            setLoading(false);
        }
    };

    //  Identity-Aware unchecking
    const toggleLearner = (learner: any) => {
        const id = learner.id; // Legacy ID
        const idNum = learner.idNumber; // New ID

        setFormData(prev => {
            const isCurrentlySelected = prev.learnerIds.includes(id) || (idNum && prev.learnerIds.includes(idNum));

            if (isCurrentlySelected) {
                // UNCHECK: Filter out BOTH IDs to be safe
                return {
                    ...prev,
                    learnerIds: prev.learnerIds.filter(lid => lid !== id && lid !== idNum)
                };
            } else {
                // CHECK: Only add the ID Number (Our current standard)
                return {
                    ...prev,
                    learnerIds: [...prev.learnerIds, idNum || id]
                };
            }
        });
    };

    const selectAll = () => setFormData(prev => ({ ...prev, learnerIds: filteredLearners.map(l => l.idNumber || l.id) }));
    const clearAll = () => setFormData(prev => ({ ...prev, learnerIds: [] }));

    // ─── RECESS HANDLERS ───
    const addRecess = () => setFormData(prev => ({ ...prev, recessPeriods: [...prev.recessPeriods, { start: '', end: '', reason: '' }] }));
    const updateRecess = (index: number, field: string, value: string) => {
        setFormData(prev => {
            const updated = [...prev.recessPeriods];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, recessPeriods: updated };
        });
    };
    const removeRecess = (index: number) => {
        setFormData(prev => ({ ...prev, recessPeriods: prev.recessPeriods.filter((_, i) => i !== index) }));
    };

    return (
        <>
            {statusModal.show && (
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={() => setStatusModal(s => ({ ...s, show: false }))}
                />
            )}

            <div className="cfm-overlay" onClick={onClose}>
                <div className="cfm-modal" onClick={e => e.stopPropagation()}>

                    <div className="cfm-header">
                        <h2 className="cfm-header__title">
                            <Users size={16} />
                            {cohort ? 'Class Configuration' : 'Create New Class'}
                        </h2>
                        <button className="cfm-close-btn" type="button" onClick={onClose} disabled={loading}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="cfm-form">
                        <div className="cfm-body">
                            <div className="cfm-left" style={{ overflowY: 'auto', paddingRight: '8px' }}>
                                <div className="cfm-section-hdr">
                                    <BookOpen size={13} />
                                    <span>1. Class Meta-Data</span>
                                </div>

                                <div className="cfm-fg">
                                    <label htmlFor="cfm-name">Cohort Name *</label>
                                    <input id="cfm-name" className="cfm-input" required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>

                                <div className="cfm-fg">
                                    <label htmlFor="cfm-prog">Target Qualification *</label>
                                    <select id="cfm-prog" className="cfm-input cfm-select" required
                                        value={formData.programmeId}
                                        onChange={e => setFormData({ ...formData, programmeId: e.target.value })}>
                                        <option value="">Select Qualification…</option>
                                        {programmes.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="cfm-fg">
                                    <label htmlFor="cfm-campus" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MapPin size={12} /> Delivery Site *
                                    </label>
                                    <select id="cfm-campus" className="cfm-input cfm-select" required
                                        value={formData.campusId}
                                        onChange={e => setFormData({ ...formData, campusId: e.target.value })}>
                                        {settings?.campuses?.map(campus => (
                                            <option key={campus.id} value={campus.id}>{campus.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="cfm-date-row">
                                    <div className="cfm-fg">
                                        <label htmlFor="cfm-start">Commencement *</label>
                                        <input id="cfm-start" className="cfm-input" type="date" required
                                            value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                                    </div>
                                    <div className="cfm-fg">
                                        <label htmlFor="cfm-end">Conclusion *</label>
                                        <input id="cfm-end" className="cfm-input" type="date" required
                                            value={formData.endDate}
                                            onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                                    </div>
                                </div>

                                <div className="cfm-section-hdr" style={{ marginTop: '1.25rem' }}>
                                    <Calendar size={13} />
                                    <span>2. Term Breaks & Recess</span>
                                    <button
                                        type="button"
                                        onClick={addRecess}
                                        style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--mlab-green)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}
                                    >
                                        <Plus size={12} strokeWidth={3} /> Add Break
                                    </button>
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    {formData.recessPeriods.map((recess, idx) => (
                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', marginBottom: '10px', position: 'relative' }}>
                                            <button
                                                type="button"
                                                onClick={() => removeRecess(idx)}
                                                style={{ position: 'absolute', top: '10px', right: '10px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '4px' }}
                                                title="Remove Break"
                                            >
                                                <Trash2 size={12} />
                                            </button>

                                            <div className="cfm-fg" style={{ marginBottom: '10px', paddingRight: '30px' }}>
                                                <label>Reason / Term Name *</label>
                                                <input className="cfm-input" type="text" placeholder="e.g., Mid-Term Break" value={recess.reason} onChange={e => updateRecess(idx, 'reason', e.target.value)} required />
                                            </div>
                                            <div className="cfm-date-row" style={{ marginBottom: 0 }}>
                                                <div className="cfm-fg">
                                                    <label>Start Date *</label>
                                                    <input className="cfm-input" type="date" value={recess.start} onChange={e => updateRecess(idx, 'start', e.target.value)} required />
                                                </div>
                                                <div className="cfm-fg">
                                                    <label>End Date *</label>
                                                    <input className="cfm-input" type="date" value={recess.end} onChange={e => updateRecess(idx, 'end', e.target.value)} required />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.recessPeriods.length === 0 && (
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                            No breaks scheduled. TV Kiosk will be active every weekday.
                                        </div>
                                    )}
                                </div>

                                <div className="cfm-section-hdr" style={{ marginTop: '1.25rem' }}>
                                    <Layers size={13} />
                                    <span>3. Staff Assignment</span>
                                </div>

                                {ROLE_META.map(({ key, label }) => {
                                    const roleLookup = key === 'supportFacilitator' ? 'facilitator' : key;
                                    const options = staff.filter(s => s.role === roleLookup);
                                    const currentId = formData[`${key}Id` as keyof typeof formData] as string;

                                    return (
                                        <div key={key} className="cfm-staff-block">
                                            <div className="cfm-fg">
                                                <label className="cfm-staff-label">{label}</label>
                                                <select
                                                    className="cfm-input cfm-select"
                                                    value={currentId}
                                                    required={key === 'facilitator'}
                                                    onChange={e => setFormData({ ...formData, [`${key}Id`]: e.target.value })}>
                                                    <option value="">Select Staff…</option>
                                                    {options.map(s => (
                                                        <option key={s.id} value={s.authUid || s.id}>{s.fullName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="cfm-right">
                                <div className="cfm-section-hdr">
                                    <User size={13} />
                                    <span>4. Select Learners</span>
                                    <span className="cfm-learner-count">{formData.learnerIds.length} assigned</span>
                                </div>

                                <div className="cfm-learner-controls-panel">
                                    <div className="cfm-search-wrap">
                                        <Search size={14} className="cfm-search-icon" />
                                        <input
                                            className="cfm-input cfm-search-input"
                                            type="text"
                                            placeholder="Search name or ID..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>

                                    <div className="cfm-controls-row">
                                        <label className="cfm-toggle-row">
                                            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                                            Show learners from other cohorts
                                        </label>
                                        <div className="cfm-bulk-btns">
                                            <button type="button" className="cfm-bulk-btn" onClick={selectAll}>All</button>
                                            <button type="button" className="cfm-bulk-btn" onClick={clearAll}>None</button>
                                        </div>
                                    </div>
                                </div>

                                <div className="cfm-learner-list">
                                    {filteredLearners.length === 0 ? (
                                        <div className="cfm-learner-empty">
                                            <User size={32} />
                                            <span>No available learners found.</span>
                                        </div>
                                    ) : filteredLearners.map(learner => {
                                        //  UI Check: True if either Legacy or ID Number is in state
                                        const isSelected = formData.learnerIds.includes(learner.id) || formData.learnerIds.includes(learner.idNumber);
                                        const otherCohortId = getResolvedCohortId(learner);
                                        const isInOther = !!(otherCohortId && otherCohortId !== "Unassigned" && (!cohort || otherCohortId !== String(cohort.id).trim()));
                                        const otherCohortName = isInOther ? cohorts.find(c => String(c.id).trim() === otherCohortId)?.name || 'Other Class' : null;

                                        return (
                                            <div
                                                key={learner.id}
                                                className={`cfm-learner-row ${isSelected ? 'selected' : ''} ${isInOther && !isSelected ? 'other-cohort' : ''}`}
                                                onClick={() => toggleLearner(learner)}
                                            >
                                                <div className="cfm-learner-check">
                                                    {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                                                </div>
                                                <div className="cfm-learner-info">
                                                    <div className="cfm-learner-name-row">
                                                        <span className="cfm-learner-name">{learner.fullName}</span>
                                                        {isInOther && (
                                                            <span className="cfm-enrolled-badge">
                                                                <Info size={10} /> {otherCohortName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="cfm-learner-id">{learner.idNumber}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="cfm-footer">
                            <button type="button" className="cfm-btn cfm-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
                            <button type="submit" className="cfm-btn cfm-btn--primary" disabled={loading}>
                                {loading ? <Loader2 size={13} className="cfm-spin" /> : <Save size={13} />}
                                {cohort ? ' Save Changes' : ' Initialize Class'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

