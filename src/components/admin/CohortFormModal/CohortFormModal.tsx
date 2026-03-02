// src/components/admin/CohortFormModal.tsx
// mLab CI v2.1 — ViewPortfolio aesthetic

import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Save, Loader2, ShieldAlert, CheckSquare, Square,
    User, Users, BookOpen, Layers, Search, Info
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
    const { staff, learners, programmes, cohorts } = useStore();
    const [loading, setLoading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [showAll, setShowAll] = useState(false);

    const [statusModal, setStatusModal] = useState<{
        show: boolean; type: StatusType; title: string; message: string;
    }>({ show: false, type: 'info', title: '', message: '' });

    const [formData, setFormData] = useState({
        name: '', programmeId: '', startDate: '', endDate: '',
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
                name: cohort.name, programmeId: cohort.programmeId,
                startDate: cohort.startDate, endDate: cohort.endDate,
                facilitatorId: cohort.facilitatorId, assessorId: cohort.assessorId,
                moderatorId: cohort.moderatorId, learnerIds: cohort.learnerIds || [],
            });
        }
    }, [cohort]);

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
                                    const currentId = formData[`${key}Id`];
                                    const originalId = cohort ? cohort[`${key}Id`] : '';
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


// import React, { useState, useEffect, useMemo } from 'react';
// import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User, Search, Info } from 'lucide-react';
// import { useStore } from '../../../store/useStore';
// import type { Cohort } from '../../../types';
// import { StatusModal, type StatusType } from '../../common/StatusModal/StatusModal';

// interface Props {
//     cohort?: Cohort;
//     onClose: () => void;
//     onSave: (
//         cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
//         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
//     ) => Promise<void>;
// }

// export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
//     const { staff, learners, programmes, cohorts } = useStore();
//     const [loading, setLoading] = useState(false);

//     // --- SEARCH & TOGGLE STATE ---
//     const [searchTerm, setSearchTerm] = useState('');
//     const [showAll, setShowAll] = useState(false);

//     // --- MODAL STATE ---
//     const [statusModal, setStatusModal] = useState<{
//         show: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//     }>({ show: false, type: 'info', title: '', message: '' });

//     // --- FORM STATE ---
//     const [formData, setFormData] = useState({
//         name: '',
//         programmeId: '',
//         startDate: '',
//         endDate: '',
//         facilitatorId: '',
//         assessorId: '',
//         moderatorId: '',
//         learnerIds: [] as string[]
//     });

//     const [reasons, setReasons] = useState({
//         facilitator: '',
//         assessor: '',
//         moderator: ''
//     });

//     // --- FILTER LOGIC (SEARCH + TOGGLE) ---
//     const filteredLearners = useMemo(() => {
//         return learners.filter(l => {
//             if (l.isArchived) return false;

//             // 1. Search Filter (Name or ID)
//             const matchesSearch =
//                 l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//                 l.idNumber.toLowerCase().includes(searchTerm.toLowerCase());

//             if (!matchesSearch) return false;

//             // 2. Availability Filter
//             if (showAll) return true; // Show everyone if toggle is on

//             // Otherwise, show only unassigned or those already in THIS cohort
//             return (
//                 l.cohortId === 'Unassigned' ||
//                 !l.cohortId ||
//                 (cohort && cohort.id === l.cohortId)
//             );
//         });
//     }, [learners, cohort, searchTerm, showAll]);

//     // --- LOAD DATA ON EDIT ---
//     useEffect(() => {
//         if (cohort) {
//             setFormData({
//                 name: cohort.name,
//                 programmeId: cohort.programmeId,
//                 startDate: cohort.startDate,
//                 endDate: cohort.endDate,
//                 facilitatorId: cohort.facilitatorId,
//                 assessorId: cohort.assessorId,
//                 moderatorId: cohort.moderatorId,
//                 learnerIds: cohort.learnerIds || []
//             });
//         }
//     }, [cohort]);

//     const showStatus = (type: StatusType, title: string, message: string) => {
//         setStatusModal({ show: true, type, title, message });
//     };

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();

//         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
//             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person.');
//             return;
//         }

//         setLoading(true);
//         try {
//             await onSave(formData as any, reasons);
//             onClose();
//         } catch (error) {
//             showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
//         } finally {
//             setLoading(false);
//         }
//     };

//     const toggleLearner = (id: string) => {
//         setFormData(prev => {
//             const current = prev.learnerIds;
//             return current.includes(id)
//                 ? { ...prev, learnerIds: current.filter(lid => lid !== id) }
//                 : { ...prev, learnerIds: [...current, id] };
//         });
//     };

//     return (
//         <>
//             {statusModal.show && (
//                 <StatusModal
//                     type={statusModal.type}
//                     title={statusModal.title}
//                     message={statusModal.message}
//                     onClose={() => setStatusModal({ ...statusModal, show: false })}
//                 />
//             )}

//             <div className="modal-overlay">
//                 <div className="modal-content" style={{ maxWidth: '1100px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column' }}>

//                     <div className="modal-header">
//                         <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
//                         <button onClick={onClose}><X size={24} /></button>
//                     </div>

//                     <div className="modal-body" style={{ flex: 1, overflowY: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem', padding: '1.5rem' }}>

//                         {/* LEFT COLUMN: Class Details */}
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '10px' }}>
//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>1. Class Details</h3>
//                             <div className="input-group">
//                                 <label>Cohort Name</label>
//                                 <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
//                             </div>
//                             <div className="input-group">
//                                 <label>Qualification</label>
//                                 <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
//                                     <option value="">Select Qualification...</option>
//                                     {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
//                                 </select>
//                             </div>
//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
//                                 <div className="input-group"><label>Start Date</label><input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} /></div>
//                                 <div className="input-group"><label>End Date</label><input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} /></div>
//                             </div>

//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem' }}>2. Assign Staff</h3>
//                             {(['facilitator', 'assessor', 'moderator'] as const).map(role => (
//                                 <div key={role} className="input-group">
//                                     <label style={{ textTransform: 'capitalize' }}>{role}</label>
//                                     <select value={formData[`${role}Id`]} onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}>
//                                         <option value="">Select Staff...</option>
//                                         {staff.filter(s => s.role === role).map(s => <option key={s.id} value={s.authUid || s.id}>{s.fullName}</option>)}
//                                     </select>
//                                 </div>
//                             ))}
//                         </div>

//                         {/* RIGHT COLUMN: Learners with Search and Indicator */}
//                         <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span>3. Select Learners</span>
//                                 <span style={{ fontSize: '0.85rem', color: '#64748b', background: '#f1f5f9', padding: '2px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
//                                     {formData.learnerIds.length} Selected
//                                 </span>
//                             </h3>

//                             {/* Search and Toggle Controls */}
//                             <div style={{ marginBottom: '1rem', background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
//                                 <div style={{ position: 'relative' }}>
//                                     <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
//                                     <input
//                                         type="text"
//                                         placeholder="Search by name or ID number..."
//                                         style={{ width: '100%', padding: '8px 8px 8px 35px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
//                                         value={searchTerm}
//                                         onChange={(e) => setSearchTerm(e.target.value)}
//                                     />
//                                 </div>
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
//                                     <input
//                                         type="checkbox"
//                                         checked={showAll}
//                                         onChange={(e) => setShowAll(e.target.checked)}
//                                         style={{ width: '16px', height: '16px' }}
//                                     />
//                                     Show learners already assigned to other classes
//                                 </label>
//                             </div>

//                             {/* Learner List */}
//                             <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
//                                 {filteredLearners.length > 0 ? (
//                                     filteredLearners.map(learner => {
//                                         const isSelected = formData.learnerIds.includes(learner.id);

//                                         // ─── INDICATOR LOGIC ───
//                                         // Find if they are in another cohort (not current editing one and not 'Unassigned')
//                                         const otherCohortId = learner.cohortId;
//                                         const isInOtherCohort = otherCohortId && otherCohortId !== 'Unassigned' && (!cohort || otherCohortId !== cohort.id);
//                                         const otherCohortName = isInOtherCohort
//                                             ? cohorts.find(c => c.id === otherCohortId)?.name || 'Another Class'
//                                             : null;

//                                         return (
//                                             <div
//                                                 key={learner.id}
//                                                 onClick={() => toggleLearner(learner.id)}
//                                                 style={{
//                                                     padding: '0.75rem 1rem',
//                                                     borderBottom: '1px solid #e2e8f0',
//                                                     cursor: 'pointer',
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     gap: '1rem',
//                                                     background: isSelected ? '#eff6ff' : 'white',
//                                                     opacity: isInOtherCohort && !isSelected ? 0.75 : 1,
//                                                     transition: 'all 0.2s'
//                                                 }}
//                                             >
//                                                 <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
//                                                     {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
//                                                 </div>
//                                                 <div style={{ flex: 1 }}>
//                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                         <span style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>
//                                                             {learner.fullName}
//                                                         </span>
//                                                         {isInOtherCohort && (
//                                                             <span style={{
//                                                                 fontSize: '0.7rem',
//                                                                 background: '#fee2e2',
//                                                                 color: '#b91c1c',
//                                                                 padding: '2px 8px',
//                                                                 borderRadius: '4px',
//                                                                 fontWeight: 'bold',
//                                                                 display: 'flex',
//                                                                 alignItems: 'center',
//                                                                 gap: '4px'
//                                                             }}>
//                                                                 <Info size={10} /> Enrolled in: {otherCohortName}
//                                                             </span>
//                                                         )}
//                                                     </div>
//                                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
//                                                 </div>
//                                             </div>
//                                         );
//                                     })
//                                 ) : (
//                                     <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
//                                         <User size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
//                                         <p>No learners found matching your search.</p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     <div className="modal-footer" style={{ padding: '1rem 1.5rem', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
//                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
//                         <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
//                             {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
//                             {cohort ? 'Update Cohort' : 'Create Cohort'}
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </>
//     );
// };


// // import React, { useState, useEffect, useMemo } from 'react';
// // import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User } from 'lucide-react';
// // import { useStore } from '../../store/useStore';
// // import type { Cohort } from '../../types';
// // import { StatusModal, type StatusType } from '../common/StatusModal/StatusModal';

// // interface Props {
// //     cohort?: Cohort;
// //     onClose: () => void;
// //     onSave: (
// //         cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
// //         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
// //     ) => Promise<void>;
// // }

// // export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
// //     const { staff, learners, programmes } = useStore();
// //     const [loading, setLoading] = useState(false);

// //     // --- MODAL STATE ---
// //     const [statusModal, setStatusModal] = useState<{
// //         show: boolean;
// //         type: StatusType;
// //         title: string;
// //         message: string;
// //     }>({ show: false, type: 'info', title: '', message: '' });

// //     // --- FORM STATE ---
// //     const [formData, setFormData] = useState({
// //         name: '',
// //         programmeId: '',
// //         startDate: '',
// //         endDate: '',
// //         facilitatorId: '',
// //         assessorId: '',
// //         moderatorId: '',
// //         learnerIds: [] as string[]
// //     });

// //     const [reasons, setReasons] = useState({
// //         facilitator: '',
// //         assessor: '',
// //         moderator: ''
// //     });

// //     // --- FILTER DATA ---
// //     const availableLearners = useMemo(() => {
// //         return learners.filter(l =>
// //             !l.isArchived &&
// //             (l.cohortId === 'Unassigned' || !l.cohortId || (cohort && cohort.learnerIds.includes(l.id)))
// //         );
// //     }, [learners, cohort]);

// //     const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
// //     const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
// //     const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

// //     // --- LOAD DATA ON EDIT ---
// //     useEffect(() => {
// //         if (cohort) {
// //             setFormData({
// //                 name: cohort.name,
// //                 programmeId: cohort.programmeId,
// //                 startDate: cohort.startDate,
// //                 endDate: cohort.endDate,
// //                 facilitatorId: cohort.facilitatorId,
// //                 assessorId: cohort.assessorId,
// //                 moderatorId: cohort.moderatorId,
// //                 learnerIds: cohort.learnerIds || []
// //             });
// //         }
// //     }, [cohort]);

// //     // --- HELPER: SHOW MODAL ---
// //     const showStatus = (type: StatusType, title: string, message: string) => {
// //         setStatusModal({ show: true, type, title, message });
// //     };

// //     // --- SUBMIT HANDLER ---
// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();

// //         if (cohort) {
// //             const isNameChanged = formData.name !== cohort.name;
// //             const isProgChanged = formData.programmeId !== cohort.programmeId;
// //             const isStartChanged = formData.startDate !== cohort.startDate;
// //             const isEndChanged = formData.endDate !== cohort.endDate;
// //             const isFacilitatorChanged = formData.facilitatorId !== cohort.facilitatorId;
// //             const isAssessorChanged = formData.assessorId !== cohort.assessorId;
// //             const isModeratorChanged = formData.moderatorId !== cohort.moderatorId;

// //             const currentLearners = [...formData.learnerIds].sort().join(',');
// //             const originalLearners = [...cohort.learnerIds].sort().join(',');
// //             const isLearnersChanged = currentLearners !== originalLearners;

// //             const hasAnyChange = isNameChanged || isProgChanged || isStartChanged || isEndChanged ||
// //                 isFacilitatorChanged || isAssessorChanged || isModeratorChanged || isLearnersChanged;

// //             if (!hasAnyChange) {
// //                 showStatus('info', 'No Changes Detected', 'You have not modified any fields. No data was saved.');
// //                 return;
// //             }
// //         }

// //         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
// //             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
// //             return;
// //         }

// //         if (cohort) {
// //             if (formData.facilitatorId !== cohort.facilitatorId && !reasons.facilitator) {
// //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Facilitator.');
// //                 return;
// //             }
// //             if (formData.assessorId !== cohort.assessorId && !reasons.assessor) {
// //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Assessor.');
// //                 return;
// //             }
// //             if (formData.moderatorId !== cohort.moderatorId && !reasons.moderator) {
// //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Moderator.');
// //                 return;
// //             }
// //         }

// //         setLoading(true);
// //         try {
// //             await onSave(formData as any, reasons);
// //             onClose(); // Added to close on success
// //         } catch (error) {
// //             showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
// //             console.error(error);
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     const toggleLearner = (id: string) => {
// //         setFormData(prev => {
// //             const current = prev.learnerIds;
// //             return current.includes(id)
// //                 ? { ...prev, learnerIds: current.filter(lid => lid !== id) }
// //                 : { ...prev, learnerIds: [...current, id] };
// //         });
// //     };

// //     return (
// //         <>
// //             {statusModal.show && (
// //                 <StatusModal
// //                     type={statusModal.type}
// //                     title={statusModal.title}
// //                     message={statusModal.message}
// //                     onClose={() => setStatusModal({ ...statusModal, show: false })}
// //                 />
// //             )}

// //             <div className="modal-overlay">
// //                 <div className="modal-content" style={{ maxWidth: '950px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>

// //                     <div className="modal-header">
// //                         <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
// //                         <button onClick={onClose}><X size={24} /></button>
// //                     </div>

// //                     <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem' }}>

// //                         {/* LEFT COLUMN: Class Details */}
// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>1. Class Details</h3>

// //                             <div className="input-group">
// //                                 <label>Cohort Name</label>
// //                                 <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
// //                             </div>

// //                             <div className="input-group">
// //                                 <label>Qualification</label>
// //                                 <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
// //                                     <option value="">Select Qualification...</option>
// //                                     {programmes.map(p => <option key={p.id} value={p.id}>{p.name} (L{p.nqfLevel})</option>)}
// //                                 </select>
// //                             </div>

// //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
// //                                 <div className="input-group">
// //                                     <label>Start Date</label>
// //                                     <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
// //                                 </div>
// //                                 <div className="input-group">
// //                                     <label>End Date</label>
// //                                     <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
// //                                 </div>
// //                             </div>

// //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Assign Staff</h3>

// //                             {(['facilitator', 'assessor', 'moderator'] as const).map(role => {
// //                                 const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
// //                                 const currentId = formData[`${role}Id`];
// //                                 const originalId = cohort ? cohort[`${role}Id`] : '';
// //                                 const hasChanged = cohort && currentId !== originalId;

// //                                 const isConflict = (role === 'assessor' && currentId && currentId === formData.moderatorId) ||
// //                                     (role === 'moderator' && currentId && currentId === formData.assessorId);

// //                                 return (
// //                                     <div key={role} className="input-group">
// //                                         <label style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between' }}>
// //                                             {role} {isConflict && <span style={{ color: 'red', fontSize: '0.7em', display: 'flex', alignItems: 'center' }}><ShieldAlert size={12} /> Conflict!</span>}
// //                                         </label>
// //                                         <select
// //                                             value={currentId}
// //                                             onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}
// //                                             style={{ borderColor: isConflict ? 'red' : hasChanged ? 'orange' : '#e2e8f0' }}
// //                                         >
// //                                             <option value="">Select Staff...</option>
// //                                             {options.map(s => (
// //                                                 /* 🚀 AMENDMENT: Use authUid as value to ensure Dashboard visibility */
// //                                                 <option key={s.id} value={s.authUid || s.id}>
// //                                                     {s.fullName}
// //                                                 </option>
// //                                             ))}
// //                                         </select>
// //                                         {hasChanged && (
// //                                             <input
// //                                                 placeholder="Reason for change..."
// //                                                 style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
// //                                                 value={reasons[role]}
// //                                                 onChange={e => setReasons({ ...reasons, [role]: e.target.value })}
// //                                             />
// //                                         )}
// //                                     </div>
// //                                 );
// //                             })}
// //                         </div>

// //                         {/* RIGHT COLUMN: Learners */}
// //                         <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
// //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
// //                                 <span>3. Select Learners</span>
// //                                 <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
// //                                     {formData.learnerIds.length} Selected
// //                                 </span>
// //                             </h3>

// //                             <div style={{
// //                                 flex: 1,
// //                                 minHeight: '300px',
// //                                 overflowY: 'auto',
// //                                 border: '1px solid #e2e8f0',
// //                                 borderRadius: '8px',
// //                                 background: '#f8fafc',
// //                                 display: 'flex',
// //                                 flexDirection: 'column'
// //                             }}>
// //                                 {availableLearners.length > 0 ? (
// //                                     availableLearners.map(learner => {
// //                                         const isSelected = formData.learnerIds.includes(learner.id);
// //                                         return (
// //                                             <div
// //                                                 key={learner.id}
// //                                                 onClick={() => toggleLearner(learner.id)}
// //                                                 style={{
// //                                                     padding: '0.75rem 1rem',
// //                                                     borderBottom: '1px solid #e2e8f0',
// //                                                     cursor: 'pointer',
// //                                                     display: 'flex',
// //                                                     alignItems: 'center',
// //                                                     gap: '1rem',
// //                                                     background: isSelected ? '#eff6ff' : 'white',
// //                                                     transition: 'all 0.2s'
// //                                                 }}
// //                                             >
// //                                                 <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
// //                                                     {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
// //                                                 </div>
// //                                                 <div>
// //                                                     <div style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>{learner.fullName}</div>
// //                                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
// //                                                 </div>
// //                                             </div>
// //                                         );
// //                                     })
// //                                 ) : (
// //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
// //                                         <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
// //                                         <p>No available learners found.</p>
// //                                         <small>Import new learners or set existing ones to 'Unassigned'.</small>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="modal-footer">
// //                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
// //                         <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
// //                             {loading ? <Loader className="spin" /> : <Save size={18} />}
// //                             {cohort ? 'Save Changes' : 'Create Cohort'}
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         </>
// //     );
// // };


// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User } from 'lucide-react';
// // // import { useStore } from '../../store/useStore';
// // // import type { Cohort } from '../../types';
// // // import { StatusModal, type StatusType } from '../common/StatusModal';

// // // interface Props {
// // //     cohort?: Cohort;
// // //     onClose: () => void;
// // //     // Updated type definition to strictly match the store signature
// // //     onSave: (
// // //         cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
// // //         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
// // //     ) => Promise<void>;
// // // }

// // // export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
// // //     const { staff, learners, programmes } = useStore();
// // //     const [loading, setLoading] = useState(false);

// // //     // --- MODAL STATE ---
// // //     const [statusModal, setStatusModal] = useState<{
// // //         show: boolean;
// // //         type: StatusType;
// // //         title: string;
// // //         message: string;
// // //     }>({ show: false, type: 'info', title: '', message: '' });

// // //     // --- FORM STATE ---
// // //     const [formData, setFormData] = useState({
// // //         name: '',
// // //         programmeId: '',
// // //         startDate: '',
// // //         endDate: '',
// // //         facilitatorId: '',
// // //         assessorId: '',
// // //         moderatorId: '',
// // //         learnerIds: [] as string[]
// // //     });

// // //     const [reasons, setReasons] = useState({
// // //         facilitator: '',
// // //         assessor: '',
// // //         moderator: ''
// // //     });

// // //     // --- FILTER DATA ---
// // //     const availableLearners = useMemo(() => {
// // //         // ✅ ENHANCED FILTER: Only show learners who are active AND (Unassigned OR already in this cohort)
// // //         return learners.filter(l =>
// // //             !l.isArchived &&
// // //             (l.cohortId === 'Unassigned' || !l.cohortId || (cohort && cohort.learnerIds.includes(l.id)))
// // //         );
// // //     }, [learners, cohort]);

// // //     const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
// // //     const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
// // //     const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

// // //     // --- LOAD DATA ON EDIT ---
// // //     useEffect(() => {
// // //         if (cohort) {
// // //             setFormData({
// // //                 name: cohort.name,
// // //                 programmeId: cohort.programmeId,
// // //                 startDate: cohort.startDate,
// // //                 endDate: cohort.endDate,
// // //                 facilitatorId: cohort.facilitatorId,
// // //                 assessorId: cohort.assessorId,
// // //                 moderatorId: cohort.moderatorId,
// // //                 learnerIds: cohort.learnerIds || []
// // //             });
// // //         }
// // //     }, [cohort]);

// // //     // --- HELPER: SHOW MODAL ---
// // //     const showStatus = (type: StatusType, title: string, message: string) => {
// // //         setStatusModal({ show: true, type, title, message });
// // //     };

// // //     // --- SUBMIT HANDLER ---
// // //     const handleSubmit = async (e: React.FormEvent) => {
// // //         e.preventDefault();

// // //         // 1. DIRTY CHECK (Has anything changed?)
// // //         if (cohort) {
// // //             const isNameChanged = formData.name !== cohort.name;
// // //             const isProgChanged = formData.programmeId !== cohort.programmeId;
// // //             const isStartChanged = formData.startDate !== cohort.startDate;
// // //             const isEndChanged = formData.endDate !== cohort.endDate;
// // //             const isFacilitatorChanged = formData.facilitatorId !== cohort.facilitatorId;
// // //             const isAssessorChanged = formData.assessorId !== cohort.assessorId;
// // //             const isModeratorChanged = formData.moderatorId !== cohort.moderatorId;

// // //             const currentLearners = [...formData.learnerIds].sort().join(',');
// // //             const originalLearners = [...cohort.learnerIds].sort().join(',');
// // //             const isLearnersChanged = currentLearners !== originalLearners;

// // //             const hasAnyChange = isNameChanged || isProgChanged || isStartChanged || isEndChanged ||
// // //                 isFacilitatorChanged || isAssessorChanged || isModeratorChanged || isLearnersChanged;

// // //             if (!hasAnyChange) {
// // //                 showStatus('info', 'No Changes Detected', 'You have not modified any fields. No data was saved.');
// // //                 return;
// // //             }
// // //         }

// // //         // 2. SEGREGATION OF DUTIES Check
// // //         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
// // //             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
// // //             return;
// // //         }

// // //         // 3. AUDIT REASONS Check
// // //         if (cohort) {
// // //             if (formData.facilitatorId !== cohort.facilitatorId && !reasons.facilitator) {
// // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Facilitator.');
// // //                 return;
// // //             }
// // //             if (formData.assessorId !== cohort.assessorId && !reasons.assessor) {
// // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Assessor.');
// // //                 return;
// // //             }
// // //             if (formData.moderatorId !== cohort.moderatorId && !reasons.moderator) {
// // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Moderator.');
// // //                 return;
// // //             }
// // //         }

// // //         // 4. SAVE
// // //         setLoading(true);
// // //         try {
// // //             await onSave(formData as any, reasons);
// // //         } catch (error) {
// // //             showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
// // //             console.error(error);
// // //         } finally {
// // //             setLoading(false);
// // //         }
// // //     };

// // //     const toggleLearner = (id: string) => {
// // //         setFormData(prev => {
// // //             const current = prev.learnerIds;
// // //             return current.includes(id)
// // //                 ? { ...prev, learnerIds: current.filter(lid => lid !== id) }
// // //                 : { ...prev, learnerIds: [...current, id] };
// // //         });
// // //     };

// // //     return (
// // //         <>
// // //             {/* --- STATUS MODAL (Popups) --- */}
// // //             {statusModal.show && (
// // //                 <StatusModal
// // //                     type={statusModal.type}
// // //                     title={statusModal.title}
// // //                     message={statusModal.message}
// // //                     onClose={() => setStatusModal({ ...statusModal, show: false })}
// // //                 />
// // //             )}

// // //             {/* --- MAIN FORM MODAL --- */}
// // //             <div className="modal-overlay">
// // //                 <div className="modal-content" style={{ maxWidth: '950px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>

// // //                     <div className="modal-header">
// // //                         <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
// // //                         <button onClick={onClose}><X size={24} /></button>
// // //                     </div>

// // //                     <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem' }}>

// // //                         {/* LEFT COLUMN: Class Details */}
// // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>1. Class Details</h3>

// // //                             <div className="input-group">
// // //                                 <label>Cohort Name</label>
// // //                                 <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
// // //                             </div>

// // //                             <div className="input-group">
// // //                                 <label>Qualification</label>
// // //                                 <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
// // //                                     <option value="">Select Qualification...</option>
// // //                                     {programmes.map(p => <option key={p.id} value={p.id}>{p.name} (L{p.nqfLevel})</option>)}
// // //                                 </select>
// // //                             </div>

// // //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
// // //                                 <div className="input-group">
// // //                                     <label>Start Date</label>
// // //                                     <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
// // //                                 </div>
// // //                                 <div className="input-group">
// // //                                     <label>End Date</label>
// // //                                     <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
// // //                                 </div>
// // //                             </div>

// // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Assign Staff</h3>

// // //                             {/* Staff Selectors */}
// // //                             {(['facilitator', 'assessor', 'moderator'] as const).map(role => {
// // //                                 const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
// // //                                 const currentId = formData[`${role}Id`];
// // //                                 const originalId = cohort ? cohort[`${role}Id`] : '';
// // //                                 const hasChanged = cohort && currentId !== originalId;

// // //                                 const isConflict = (role === 'assessor' && currentId && currentId === formData.moderatorId) ||
// // //                                     (role === 'moderator' && currentId && currentId === formData.assessorId);

// // //                                 return (
// // //                                     <div key={role} className="input-group">
// // //                                         <label style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between' }}>
// // //                                             {role} {isConflict && <span style={{ color: 'red', fontSize: '0.7em', display: 'flex', alignItems: 'center' }}><ShieldAlert size={12} /> Conflict!</span>}
// // //                                         </label>
// // //                                         <select
// // //                                             value={currentId}
// // //                                             onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}
// // //                                             style={{ borderColor: isConflict ? 'red' : hasChanged ? 'orange' : '#e2e8f0' }}
// // //                                         >
// // //                                             <option value="">Select Staff...</option>
// // //                                             {options.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
// // //                                         </select>
// // //                                         {hasChanged && (
// // //                                             <input
// // //                                                 placeholder="Reason for change..."
// // //                                                 style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
// // //                                                 value={reasons[role]}
// // //                                                 onChange={e => setReasons({ ...reasons, [role]: e.target.value })}
// // //                                             />
// // //                                         )}
// // //                                     </div>
// // //                                 );
// // //                             })}
// // //                         </div>

// // //                         {/* RIGHT COLUMN: Learners */}
// // //                         <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
// // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
// // //                                 <span>3. Select Learners</span>
// // //                                 <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
// // //                                     {formData.learnerIds.length} Selected
// // //                                 </span>
// // //                             </h3>

// // //                             {/* LEARNER LIST */}
// // //                             <div style={{
// // //                                 flex: 1,
// // //                                 minHeight: '300px',
// // //                                 overflowY: 'auto',
// // //                                 border: '1px solid #e2e8f0',
// // //                                 borderRadius: '8px',
// // //                                 background: '#f8fafc',
// // //                                 display: 'flex',
// // //                                 flexDirection: 'column'
// // //                             }}>
// // //                                 {availableLearners.length > 0 ? (
// // //                                     availableLearners.map(learner => {
// // //                                         const isSelected = formData.learnerIds.includes(learner.id);
// // //                                         return (
// // //                                             <div
// // //                                                 key={learner.id}
// // //                                                 onClick={() => toggleLearner(learner.id)}
// // //                                                 style={{
// // //                                                     padding: '0.75rem 1rem',
// // //                                                     borderBottom: '1px solid #e2e8f0',
// // //                                                     cursor: 'pointer',
// // //                                                     display: 'flex',
// // //                                                     alignItems: 'center',
// // //                                                     gap: '1rem',
// // //                                                     background: isSelected ? '#eff6ff' : 'white',
// // //                                                     transition: 'all 0.2s'
// // //                                                 }}
// // //                                             >
// // //                                                 <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
// // //                                                     {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
// // //                                                 </div>
// // //                                                 <div>
// // //                                                     <div style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>{learner.fullName}</div>
// // //                                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
// // //                                                 </div>
// // //                                             </div>
// // //                                         );
// // //                                     })
// // //                                 ) : (
// // //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
// // //                                         <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
// // //                                         <p>No available learners found.</p>
// // //                                         <small>Import new learners or set existing ones to 'Unassigned'.</small>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     <div className="modal-footer">
// // //                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
// // //                         <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
// // //                             {loading ? <Loader className="spin" /> : <Save size={18} />}
// // //                             {cohort ? 'Save Changes' : 'Create Cohort'}
// // //                         </button>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </>
// // //     );
// // // };


// // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User } from 'lucide-react';
// // // // import { useStore } from '../../store/useStore';
// // // // import type { Cohort } from '../../types';
// // // // import { StatusModal, type StatusType } from '../common/StatusModal';

// // // // interface Props {
// // // //     cohort?: Cohort;
// // // //     onClose: () => void;
// // // //     onSave: (cohort: any, reasons?: any) => Promise<void>;
// // // // }

// // // // export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
// // // //     const { staff, learners, programmes } = useStore();
// // // //     const [loading, setLoading] = useState(false);

// // // //     // --- MODAL STATE ---
// // // //     const [statusModal, setStatusModal] = useState<{
// // // //         show: boolean;
// // // //         type: StatusType;
// // // //         title: string;
// // // //         message: string;
// // // //     }>({ show: false, type: 'info', title: '', message: '' });

// // // //     // --- FORM STATE ---
// // // //     const [formData, setFormData] = useState({
// // // //         name: '',
// // // //         programmeId: '',
// // // //         startDate: '',
// // // //         endDate: '',
// // // //         facilitatorId: '',
// // // //         assessorId: '',
// // // //         moderatorId: '',
// // // //         learnerIds: [] as string[]
// // // //     });

// // // //     const [reasons, setReasons] = useState({
// // // //         facilitator: '',
// // // //         assessor: '',
// // // //         moderator: ''
// // // //     });

// // // //     // Filter Data
// // // //     const availableLearners = useMemo(() => {
// // // //         return learners.filter(l => !l.isArchived || (cohort && cohort.learnerIds.includes(l.id)));
// // // //     }, [learners, cohort]);

// // // //     const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
// // // //     const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
// // // //     const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

// // // //     // Load Data on Edit
// // // //     useEffect(() => {
// // // //         if (cohort) {
// // // //             setFormData({
// // // //                 name: cohort.name,
// // // //                 programmeId: cohort.programmeId,
// // // //                 startDate: cohort.startDate,
// // // //                 endDate: cohort.endDate,
// // // //                 facilitatorId: cohort.facilitatorId,
// // // //                 assessorId: cohort.assessorId,
// // // //                 moderatorId: cohort.moderatorId,
// // // //                 learnerIds: cohort.learnerIds || []
// // // //             });
// // // //         }
// // // //     }, [cohort]);

// // // //     // --- HELPER: SHOW MODAL ---
// // // //     const showStatus = (type: StatusType, title: string, message: string) => {
// // // //         setStatusModal({ show: true, type, title, message });
// // // //     };

// // // //     // --- SUBMIT HANDLER ---
// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();

// // // //         // 1. DIRTY CHECK (Has anything changed?)
// // // //         if (cohort) {
// // // //             const isNameChanged = formData.name !== cohort.name;
// // // //             const isProgChanged = formData.programmeId !== cohort.programmeId;
// // // //             const isStartChanged = formData.startDate !== cohort.startDate;
// // // //             const isEndChanged = formData.endDate !== cohort.endDate;
// // // //             const isFacilitatorChanged = formData.facilitatorId !== cohort.facilitatorId;
// // // //             const isAssessorChanged = formData.assessorId !== cohort.assessorId;
// // // //             const isModeratorChanged = formData.moderatorId !== cohort.moderatorId;

// // // //             const currentLearners = [...formData.learnerIds].sort().join(',');
// // // //             const originalLearners = [...cohort.learnerIds].sort().join(',');
// // // //             const isLearnersChanged = currentLearners !== originalLearners;

// // // //             const hasAnyChange = isNameChanged || isProgChanged || isStartChanged || isEndChanged ||
// // // //                 isFacilitatorChanged || isAssessorChanged || isModeratorChanged || isLearnersChanged;

// // // //             if (!hasAnyChange) {
// // // //                 showStatus('info', 'No Changes Detected', 'You have not modified any fields. No data was saved.');
// // // //                 return;
// // // //             }
// // // //         }

// // // //         // 2. SEGREGATION OF DUTIES Check
// // // //         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
// // // //             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
// // // //             return;
// // // //         }

// // // //         // 3. AUDIT REASONS Check
// // // //         if (cohort) {
// // // //             if (formData.facilitatorId !== cohort.facilitatorId && !reasons.facilitator) {
// // // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Facilitator.');
// // // //                 return;
// // // //             }
// // // //             if (formData.assessorId !== cohort.assessorId && !reasons.assessor) {
// // // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Assessor.');
// // // //                 return;
// // // //             }
// // // //             if (formData.moderatorId !== cohort.moderatorId && !reasons.moderator) {
// // // //                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Moderator.');
// // // //                 return;
// // // //             }
// // // //         }

// // // //         // 4. SAVE
// // // //         setLoading(true);
// // // //         await onSave(formData, reasons);
// // // //         setLoading(false);
// // // //     };

// // // //     const toggleLearner = (id: string) => {
// // // //         setFormData(prev => {
// // // //             const current = prev.learnerIds;
// // // //             return current.includes(id)
// // // //                 ? { ...prev, learnerIds: current.filter(lid => lid !== id) }
// // // //                 : { ...prev, learnerIds: [...current, id] };
// // // //         });
// // // //     };

// // // //     return (
// // // //         <>
// // // //             {/* --- STATUS MODAL (Popups) --- */}
// // // //             {statusModal.show && (
// // // //                 <StatusModal
// // // //                     type={statusModal.type}
// // // //                     title={statusModal.title}
// // // //                     message={statusModal.message}
// // // //                     onClose={() => setStatusModal({ ...statusModal, show: false })}
// // // //                 />
// // // //             )}

// // // //             {/* --- MAIN FORM MODAL --- */}
// // // //             <div className="modal-overlay">
// // // //                 <div className="modal-content" style={{ maxWidth: '950px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>

// // // //                     <div className="modal-header">
// // // //                         <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
// // // //                         <button onClick={onClose}><X size={24} /></button>
// // // //                     </div>

// // // //                     <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem' }}>

// // // //                         {/* LEFT COLUMN: Class Details */}
// // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>1. Class Details</h3>

// // // //                             <div className="input-group">
// // // //                                 <label>Cohort Name</label>
// // // //                                 <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
// // // //                             </div>

// // // //                             <div className="input-group">
// // // //                                 <label>Qualification</label>
// // // //                                 <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
// // // //                                     <option value="">Select Qualification...</option>
// // // //                                     {programmes.map(p => <option key={p.id} value={p.id}>{p.name} (L{p.nqfLevel})</option>)}
// // // //                                 </select>
// // // //                             </div>

// // // //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
// // // //                                 <div className="input-group">
// // // //                                     <label>Start Date</label>
// // // //                                     <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
// // // //                                 </div>
// // // //                                 <div className="input-group">
// // // //                                     <label>End Date</label>
// // // //                                     <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
// // // //                                 </div>
// // // //                             </div>

// // // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Assign Staff</h3>

// // // //                             {/* Staff Selectors */}
// // // //                             {['facilitator', 'assessor', 'moderator'].map(role => {
// // // //                                 const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
// // // //                                 const currentId = (formData as any)[`${role}Id`];
// // // //                                 const originalId = cohort ? (cohort as any)[`${role}Id`] : '';
// // // //                                 const hasChanged = cohort && currentId !== originalId;

// // // //                                 const isConflict = (role === 'assessor' && currentId && currentId === formData.moderatorId) ||
// // // //                                     (role === 'moderator' && currentId && currentId === formData.assessorId);

// // // //                                 return (
// // // //                                     <div key={role} className="input-group">
// // // //                                         <label style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between' }}>
// // // //                                             {role} {isConflict && <span style={{ color: 'red', fontSize: '0.7em', display: 'flex', alignItems: 'center' }}><ShieldAlert size={12} /> Conflict!</span>}
// // // //                                         </label>
// // // //                                         <select
// // // //                                             value={currentId}
// // // //                                             onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}
// // // //                                             style={{ borderColor: isConflict ? 'red' : hasChanged ? 'orange' : '#e2e8f0' }}
// // // //                                         >
// // // //                                             <option value="">Select Staff...</option>
// // // //                                             {options.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
// // // //                                         </select>
// // // //                                         {hasChanged && (
// // // //                                             <input
// // // //                                                 placeholder="Reason for change..."
// // // //                                                 style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
// // // //                                                 value={(reasons as any)[role]}
// // // //                                                 onChange={e => setReasons({ ...reasons, [role]: e.target.value })}
// // // //                                             />
// // // //                                         )}
// // // //                                     </div>
// // // //                                 );
// // // //                             })}
// // // //                         </div>

// // // //                         {/* RIGHT COLUMN: Learners */}
// // // //                         <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
// // // //                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
// // // //                                 <span>3. Select Learners</span>
// // // //                                 <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
// // // //                                     {formData.learnerIds.length} Selected
// // // //                                 </span>
// // // //                             </h3>

// // // //                             {/* LEARNER LIST */}
// // // //                             <div style={{
// // // //                                 flex: 1,
// // // //                                 minHeight: '300px',
// // // //                                 overflowY: 'auto',
// // // //                                 border: '1px solid #e2e8f0',
// // // //                                 borderRadius: '8px',
// // // //                                 background: '#f8fafc',
// // // //                                 display: 'flex',
// // // //                                 flexDirection: 'column'
// // // //                             }}>
// // // //                                 {availableLearners.length > 0 ? (
// // // //                                     availableLearners.map(learner => {
// // // //                                         const isSelected = formData.learnerIds.includes(learner.id);
// // // //                                         return (
// // // //                                             <div
// // // //                                                 key={learner.id}
// // // //                                                 onClick={() => toggleLearner(learner.id)}
// // // //                                                 style={{
// // // //                                                     padding: '0.75rem 1rem',
// // // //                                                     borderBottom: '1px solid #e2e8f0',
// // // //                                                     cursor: 'pointer',
// // // //                                                     display: 'flex',
// // // //                                                     alignItems: 'center',
// // // //                                                     gap: '1rem',
// // // //                                                     background: isSelected ? '#eff6ff' : 'white',
// // // //                                                     transition: 'all 0.2s'
// // // //                                                 }}
// // // //                                             >
// // // //                                                 <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
// // // //                                                     {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
// // // //                                                 </div>
// // // //                                                 <div>
// // // //                                                     <div style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>{learner.fullName}</div>
// // // //                                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
// // // //                                                 </div>
// // // //                                             </div>
// // // //                                         );
// // // //                                     })
// // // //                                 ) : (
// // // //                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
// // // //                                         <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
// // // //                                         <p>No active learners found.</p>
// // // //                                         <small>Add learners in the "Learner Results" tab first.</small>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="modal-footer">
// // // //                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
// // // //                         <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
// // // //                             {loading ? <Loader className="spin" /> : <Save size={18} />}
// // // //                             {cohort ? 'Save Changes' : 'Create Cohort'}
// // // //                         </button>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </>
// // // //     );
// // // // };