// src/components/admin/CohortFormModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Save, Loader2, ShieldAlert, CheckSquare, Square,
    User, Users, BookOpen, Layers, Search, Info, MapPin
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

const ROLE_META: { key: 'facilitator' | 'assessor' | 'moderator'; label: string }[] = [
    { key: 'facilitator', label: 'Facilitator' },
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
        facilitatorId: '', assessorId: '', moderatorId: '',
        learnerIds: [] as string[],
    });

    const [reasons, setReasons] = useState({
        facilitator: '', assessor: '', moderator: '',
    });

    // ── Filtered learner list ──
    const filteredLearners = useMemo(() => learners.filter(l => {
        if (l.isArchived) return false;
        const matchesSearch =
            l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.idNumber.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (showAll) return true;
        return l.cohortId === 'Unassigned' || !l.cohortId || (cohort && cohort.id === l.cohortId);
    }), [learners, cohort, searchTerm, showAll]);

    useEffect(() => {
        if (cohort) {
            setFormData({
                name: cohort.name,
                programmeId: cohort.programmeId,
                campusId: cohort.campusId || '',
                startDate: cohort.startDate,
                endDate: cohort.endDate,
                facilitatorId: cohort.facilitatorId,
                assessorId: cohort.assessorId,
                moderatorId: cohort.moderatorId,
                learnerIds: cohort.learnerIds || [],
            });
        } else if (settings?.campuses && settings.campuses.length > 0) {
            // Auto-select the default campus for new cohorts
            const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
            setFormData(prev => ({ ...prev, campusId: defaultCampus.id }));
        }
    }, [cohort, settings]);

    const showStatus = (type: StatusType, title: string, message: string) =>
        setStatusModal({ show: true, type, title, message });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
            showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
            return;
        }
        setLoading(true);
        try {
            await onSave(formData as any, reasons);
            onClose();
        } catch (err) {
            showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleLearner = (id: string) =>
        setFormData(prev => ({
            ...prev,
            learnerIds: prev.learnerIds.includes(id)
                ? prev.learnerIds.filter(lid => lid !== id)
                : [...prev.learnerIds, id],
        }));

    const selectAll = () => setFormData(prev => ({ ...prev, learnerIds: filteredLearners.map(l => l.id) }));
    const clearAll = () => setFormData(prev => ({ ...prev, learnerIds: [] }));

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

                    {/* ── Header ── */}
                    <div className="cfm-header">
                        <h2 className="cfm-header__title">
                            <Users size={16} />
                            {cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}
                        </h2>
                        <button className="cfm-close-btn" type="button" onClick={onClose} disabled={loading}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="cfm-form">
                        <div className="cfm-body">

                            {/* ══ LEFT: Details + Staff ══ */}
                            <div className="cfm-left">

                                {/* Section 1 — Class Details */}
                                <div className="cfm-section-hdr">
                                    <BookOpen size={13} />
                                    <span>1. Class Details</span>
                                </div>

                                <div className="cfm-fg">
                                    <label htmlFor="cfm-name">Cohort Name *</label>
                                    <input id="cfm-name" className="cfm-input" required
                                        placeholder="e.g. SD-2025-A"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>

                                <div className="cfm-fg">
                                    <label htmlFor="cfm-prog">Qualification *</label>
                                    <select id="cfm-prog" className="cfm-input cfm-select" required
                                        value={formData.programmeId}
                                        onChange={e => setFormData({ ...formData, programmeId: e.target.value })}>
                                        <option value="">Select Qualification…</option>
                                        {programmes.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Delivery Site Dropdown */}
                                <div className="cfm-fg">
                                    <label htmlFor="cfm-campus" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MapPin size={12} /> Delivery Site (Campus) *
                                    </label>
                                    <select id="cfm-campus" className="cfm-input cfm-select" required
                                        value={formData.campusId}
                                        onChange={e => setFormData({ ...formData, campusId: e.target.value })}>
                                        <option value="">Select Location…</option>
                                        {settings?.campuses?.map(campus => (
                                            <option key={campus.id} value={campus.id}>
                                                {campus.name} ({campus.type === 'online' ? 'Online' : 'Physical'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="cfm-date-row">
                                    <div className="cfm-fg">
                                        <label htmlFor="cfm-start">Start Date *</label>
                                        <input id="cfm-start" className="cfm-input" type="date" required
                                            value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                                    </div>
                                    <div className="cfm-fg">
                                        <label htmlFor="cfm-end">End Date *</label>
                                        <input id="cfm-end" className="cfm-input" type="date" required
                                            value={formData.endDate}
                                            onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                                    </div>
                                </div>

                                {/* Section 2 — Staff */}
                                <div className="cfm-section-hdr" style={{ marginTop: '0.5rem' }}>
                                    <Layers size={13} />
                                    <span>2. Assign Staff</span>
                                </div>

                                {ROLE_META.map(({ key, label }) => {
                                    const options = staff.filter(s => s.role === key);
                                    const currentId = formData[`${key}Id` as keyof typeof formData] as string;
                                    const originalId = cohort ? cohort[`${key}Id` as keyof Cohort] as string : '';
                                    const hasChanged = !!cohort && currentId !== originalId;
                                    const isConflict =
                                        (key === 'assessor' && !!currentId && currentId === formData.moderatorId) ||
                                        (key === 'moderator' && !!currentId && currentId === formData.assessorId);

                                    return (
                                        <div key={key} className="cfm-staff-block">
                                            <div className="cfm-fg">
                                                <label className={`cfm-staff-label ${isConflict ? 'conflict' : hasChanged ? 'changed' : ''}`}>
                                                    {label}
                                                    {isConflict && (
                                                        <span className="cfm-conflict-badge">
                                                            <ShieldAlert size={11} /> Conflict
                                                        </span>
                                                    )}
                                                    {hasChanged && !isConflict && (
                                                        <span className="cfm-changed-badge">Modified</span>
                                                    )}
                                                </label>
                                                <select
                                                    className={`cfm-input cfm-select ${isConflict ? 'cfm-input--conflict' : hasChanged ? 'cfm-input--changed' : ''}`}
                                                    value={currentId}
                                                    onChange={e => setFormData({ ...formData, [`${key}Id`]: e.target.value })}>
                                                    <option value="">Select Staff…</option>
                                                    {options.map(s => (
                                                        <option key={s.id} value={s.authUid || s.id}>{s.fullName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {hasChanged && (
                                                <input
                                                    className="cfm-input cfm-reason-input"
                                                    placeholder={`Reason for changing ${label}…`}
                                                    value={reasons[key]}
                                                    onChange={e => setReasons({ ...reasons, [key]: e.target.value })}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ══ RIGHT: Learner selector ══ */}
                            <div className="cfm-right">
                                <div className="cfm-section-hdr">
                                    <User size={13} />
                                    <span>3. Select Learners</span>
                                    <span className="cfm-learner-count">{formData.learnerIds.length} selected</span>
                                </div>

                                {/* Search + controls panel */}
                                <div className="cfm-learner-controls-panel">
                                    <div className="cfm-search-wrap">
                                        <Search size={14} className="cfm-search-icon" />
                                        <input
                                            className="cfm-input cfm-search-input"
                                            type="text"
                                            placeholder="Search by name or ID number…"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>

                                    <div className="cfm-controls-row">
                                        <label className="cfm-toggle-row">
                                            <input
                                                type="checkbox"
                                                checked={showAll}
                                                onChange={e => setShowAll(e.target.checked)}
                                            />
                                            Show learners already assigned to other classes
                                        </label>
                                        <div className="cfm-bulk-btns">
                                            <button type="button" className="cfm-bulk-btn" onClick={selectAll}>All</button>
                                            <button type="button" className="cfm-bulk-btn" onClick={clearAll}>None</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Learner list */}
                                <div className="cfm-learner-list">
                                    {filteredLearners.length === 0 ? (
                                        <div className="cfm-learner-empty">
                                            <User size={32} />
                                            <span>No learners found.</span>
                                            <small>
                                                {searchTerm
                                                    ? 'Try a different search term.'
                                                    : "Import learners or enable 'Show all' above."}
                                            </small>
                                        </div>
                                    ) : filteredLearners.map(learner => {
                                        const isSelected = formData.learnerIds.includes(learner.id);
                                        const otherCohortId = learner.cohortId;
                                        const isInOther = !!(otherCohortId && otherCohortId !== 'Unassigned' && (!cohort || otherCohortId !== cohort.id));
                                        const otherCohortName = isInOther
                                            ? cohorts.find(c => c.id === otherCohortId)?.name || 'Another Class'
                                            : null;

                                        return (
                                            <div
                                                key={learner.id}
                                                className={`cfm-learner-row ${isSelected ? 'selected' : ''} ${isInOther && !isSelected ? 'other-cohort' : ''}`}
                                                onClick={() => toggleLearner(learner.id)}
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

                        {/* ── Footer ── */}
                        <div className="cfm-footer">
                            <button type="button" className="cfm-btn cfm-btn--ghost" onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                            <button type="submit" className="cfm-btn cfm-btn--primary" disabled={loading}>
                                {loading
                                    ? <><Loader2 size={13} className="cfm-spin" /> Saving…</>
                                    : <><Save size={13} /> {cohort ? 'Update Cohort' : 'Create Cohort'}</>
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

