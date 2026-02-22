import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { Cohort } from '../../types';
import { StatusModal, type StatusType } from '../common/StatusModal';

interface Props {
    cohort?: Cohort;
    onClose: () => void;
    onSave: (
        cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
        reasons?: { facilitator?: string; assessor?: string; moderator?: string }
    ) => Promise<void>;
}

export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
    const { staff, learners, programmes } = useStore();
    const [loading, setLoading] = useState(false);

    // --- MODAL STATE ---
    const [statusModal, setStatusModal] = useState<{
        show: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({ show: false, type: 'info', title: '', message: '' });

    // --- FORM STATE ---
    const [formData, setFormData] = useState({
        name: '',
        programmeId: '',
        startDate: '',
        endDate: '',
        facilitatorId: '',
        assessorId: '',
        moderatorId: '',
        learnerIds: [] as string[]
    });

    const [reasons, setReasons] = useState({
        facilitator: '',
        assessor: '',
        moderator: ''
    });

    // --- FILTER DATA ---
    const availableLearners = useMemo(() => {
        return learners.filter(l =>
            !l.isArchived &&
            (l.cohortId === 'Unassigned' || !l.cohortId || (cohort && cohort.learnerIds.includes(l.id)))
        );
    }, [learners, cohort]);

    const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
    const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
    const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

    // --- LOAD DATA ON EDIT ---
    useEffect(() => {
        if (cohort) {
            setFormData({
                name: cohort.name,
                programmeId: cohort.programmeId,
                startDate: cohort.startDate,
                endDate: cohort.endDate,
                facilitatorId: cohort.facilitatorId,
                assessorId: cohort.assessorId,
                moderatorId: cohort.moderatorId,
                learnerIds: cohort.learnerIds || []
            });
        }
    }, [cohort]);

    // --- HELPER: SHOW MODAL ---
    const showStatus = (type: StatusType, title: string, message: string) => {
        setStatusModal({ show: true, type, title, message });
    };

    // --- SUBMIT HANDLER ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (cohort) {
            const isNameChanged = formData.name !== cohort.name;
            const isProgChanged = formData.programmeId !== cohort.programmeId;
            const isStartChanged = formData.startDate !== cohort.startDate;
            const isEndChanged = formData.endDate !== cohort.endDate;
            const isFacilitatorChanged = formData.facilitatorId !== cohort.facilitatorId;
            const isAssessorChanged = formData.assessorId !== cohort.assessorId;
            const isModeratorChanged = formData.moderatorId !== cohort.moderatorId;

            const currentLearners = [...formData.learnerIds].sort().join(',');
            const originalLearners = [...cohort.learnerIds].sort().join(',');
            const isLearnersChanged = currentLearners !== originalLearners;

            const hasAnyChange = isNameChanged || isProgChanged || isStartChanged || isEndChanged ||
                isFacilitatorChanged || isAssessorChanged || isModeratorChanged || isLearnersChanged;

            if (!hasAnyChange) {
                showStatus('info', 'No Changes Detected', 'You have not modified any fields. No data was saved.');
                return;
            }
        }

        if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
            showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
            return;
        }

        if (cohort) {
            if (formData.facilitatorId !== cohort.facilitatorId && !reasons.facilitator) {
                showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Facilitator.');
                return;
            }
            if (formData.assessorId !== cohort.assessorId && !reasons.assessor) {
                showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Assessor.');
                return;
            }
            if (formData.moderatorId !== cohort.moderatorId && !reasons.moderator) {
                showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Moderator.');
                return;
            }
        }

        setLoading(true);
        try {
            await onSave(formData as any, reasons);
            onClose(); // Added to close on success
        } catch (error) {
            showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const toggleLearner = (id: string) => {
        setFormData(prev => {
            const current = prev.learnerIds;
            return current.includes(id)
                ? { ...prev, learnerIds: current.filter(lid => lid !== id) }
                : { ...prev, learnerIds: [...current, id] };
        });
    };

    return (
        <>
            {statusModal.show && (
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={() => setStatusModal({ ...statusModal, show: false })}
                />
            )}

            <div className="modal-overlay">
                <div className="modal-content" style={{ maxWidth: '950px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>

                    <div className="modal-header">
                        <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
                        <button onClick={onClose}><X size={24} /></button>
                    </div>

                    <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem' }}>

                        {/* LEFT COLUMN: Class Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>1. Class Details</h3>

                            <div className="input-group">
                                <label>Cohort Name</label>
                                <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
                            </div>

                            <div className="input-group">
                                <label>Qualification</label>
                                <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
                                    <option value="">Select Qualification...</option>
                                    {programmes.map(p => <option key={p.id} value={p.id}>{p.name} (L{p.nqfLevel})</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="input-group">
                                    <label>Start Date</label>
                                    <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
                                </div>
                                <div className="input-group">
                                    <label>End Date</label>
                                    <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
                                </div>
                            </div>

                            <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Assign Staff</h3>

                            {(['facilitator', 'assessor', 'moderator'] as const).map(role => {
                                const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
                                const currentId = formData[`${role}Id`];
                                const originalId = cohort ? cohort[`${role}Id`] : '';
                                const hasChanged = cohort && currentId !== originalId;

                                const isConflict = (role === 'assessor' && currentId && currentId === formData.moderatorId) ||
                                    (role === 'moderator' && currentId && currentId === formData.assessorId);

                                return (
                                    <div key={role} className="input-group">
                                        <label style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between' }}>
                                            {role} {isConflict && <span style={{ color: 'red', fontSize: '0.7em', display: 'flex', alignItems: 'center' }}><ShieldAlert size={12} /> Conflict!</span>}
                                        </label>
                                        <select
                                            value={currentId}
                                            onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}
                                            style={{ borderColor: isConflict ? 'red' : hasChanged ? 'orange' : '#e2e8f0' }}
                                        >
                                            <option value="">Select Staff...</option>
                                            {options.map(s => (
                                                /* 🚀 AMENDMENT: Use authUid as value to ensure Dashboard visibility */
                                                <option key={s.id} value={s.authUid || s.id}>
                                                    {s.fullName}
                                                </option>
                                            ))}
                                        </select>
                                        {hasChanged && (
                                            <input
                                                placeholder="Reason for change..."
                                                style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
                                                value={reasons[role]}
                                                onChange={e => setReasons({ ...reasons, [role]: e.target.value })}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* RIGHT COLUMN: Learners */}
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span>3. Select Learners</span>
                                <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
                                    {formData.learnerIds.length} Selected
                                </span>
                            </h3>

                            <div style={{
                                flex: 1,
                                minHeight: '300px',
                                overflowY: 'auto',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {availableLearners.length > 0 ? (
                                    availableLearners.map(learner => {
                                        const isSelected = formData.learnerIds.includes(learner.id);
                                        return (
                                            <div
                                                key={learner.id}
                                                onClick={() => toggleLearner(learner.id)}
                                                style={{
                                                    padding: '0.75rem 1rem',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem',
                                                    background: isSelected ? '#eff6ff' : 'white',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>{learner.fullName}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                        <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                        <p>No available learners found.</p>
                                        <small>Import new learners or set existing ones to 'Unassigned'.</small>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                            {loading ? <Loader className="spin" /> : <Save size={18} />}
                            {cohort ? 'Save Changes' : 'Create Cohort'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};


// import React, { useState, useEffect, useMemo } from 'react';
// import { X, Save, Loader, ShieldAlert, CheckSquare, Square, User } from 'lucide-react';
// import { useStore } from '../../store/useStore';
// import type { Cohort } from '../../types';
// import { StatusModal, type StatusType } from '../common/StatusModal';

// interface Props {
//     cohort?: Cohort;
//     onClose: () => void;
//     // Updated type definition to strictly match the store signature
//     onSave: (
//         cohort: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
//         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
//     ) => Promise<void>;
// }

// export const CohortFormModal: React.FC<Props> = ({ cohort, onClose, onSave }) => {
//     const { staff, learners, programmes } = useStore();
//     const [loading, setLoading] = useState(false);

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

//     // --- FILTER DATA ---
//     const availableLearners = useMemo(() => {
//         // ✅ ENHANCED FILTER: Only show learners who are active AND (Unassigned OR already in this cohort)
//         return learners.filter(l =>
//             !l.isArchived &&
//             (l.cohortId === 'Unassigned' || !l.cohortId || (cohort && cohort.learnerIds.includes(l.id)))
//         );
//     }, [learners, cohort]);

//     const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
//     const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
//     const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

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

//     // --- HELPER: SHOW MODAL ---
//     const showStatus = (type: StatusType, title: string, message: string) => {
//         setStatusModal({ show: true, type, title, message });
//     };

//     // --- SUBMIT HANDLER ---
//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();

//         // 1. DIRTY CHECK (Has anything changed?)
//         if (cohort) {
//             const isNameChanged = formData.name !== cohort.name;
//             const isProgChanged = formData.programmeId !== cohort.programmeId;
//             const isStartChanged = formData.startDate !== cohort.startDate;
//             const isEndChanged = formData.endDate !== cohort.endDate;
//             const isFacilitatorChanged = formData.facilitatorId !== cohort.facilitatorId;
//             const isAssessorChanged = formData.assessorId !== cohort.assessorId;
//             const isModeratorChanged = formData.moderatorId !== cohort.moderatorId;

//             const currentLearners = [...formData.learnerIds].sort().join(',');
//             const originalLearners = [...cohort.learnerIds].sort().join(',');
//             const isLearnersChanged = currentLearners !== originalLearners;

//             const hasAnyChange = isNameChanged || isProgChanged || isStartChanged || isEndChanged ||
//                 isFacilitatorChanged || isAssessorChanged || isModeratorChanged || isLearnersChanged;

//             if (!hasAnyChange) {
//                 showStatus('info', 'No Changes Detected', 'You have not modified any fields. No data was saved.');
//                 return;
//             }
//         }

//         // 2. SEGREGATION OF DUTIES Check
//         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
//             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
//             return;
//         }

//         // 3. AUDIT REASONS Check
//         if (cohort) {
//             if (formData.facilitatorId !== cohort.facilitatorId && !reasons.facilitator) {
//                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Facilitator.');
//                 return;
//             }
//             if (formData.assessorId !== cohort.assessorId && !reasons.assessor) {
//                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Assessor.');
//                 return;
//             }
//             if (formData.moderatorId !== cohort.moderatorId && !reasons.moderator) {
//                 showStatus('warning', 'Missing Reason', 'Please provide a reason for changing the Moderator.');
//                 return;
//             }
//         }

//         // 4. SAVE
//         setLoading(true);
//         try {
//             await onSave(formData as any, reasons);
//         } catch (error) {
//             showStatus('error', 'Save Failed', 'There was an error saving the cohort data.');
//             console.error(error);
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
//             {/* --- STATUS MODAL (Popups) --- */}
//             {statusModal.show && (
//                 <StatusModal
//                     type={statusModal.type}
//                     title={statusModal.title}
//                     message={statusModal.message}
//                     onClose={() => setStatusModal({ ...statusModal, show: false })}
//                 />
//             )}

//             {/* --- MAIN FORM MODAL --- */}
//             <div className="modal-overlay">
//                 <div className="modal-content" style={{ maxWidth: '950px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>

//                     <div className="modal-header">
//                         <h2>{cohort ? 'Edit Cohort & Staffing' : 'Create New Cohort'}</h2>
//                         <button onClick={onClose}><X size={24} /></button>
//                     </div>

//                     <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem' }}>

//                         {/* LEFT COLUMN: Class Details */}
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>1. Class Details</h3>

//                             <div className="input-group">
//                                 <label>Cohort Name</label>
//                                 <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. SD-2025-A" />
//                             </div>

//                             <div className="input-group">
//                                 <label>Qualification</label>
//                                 <select value={formData.programmeId} onChange={e => setFormData({ ...formData, programmeId: e.target.value })} required>
//                                     <option value="">Select Qualification...</option>
//                                     {programmes.map(p => <option key={p.id} value={p.id}>{p.name} (L{p.nqfLevel})</option>)}
//                                 </select>
//                             </div>

//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
//                                 <div className="input-group">
//                                     <label>Start Date</label>
//                                     <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} required />
//                                 </div>
//                                 <div className="input-group">
//                                     <label>End Date</label>
//                                     <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} required />
//                                 </div>
//                             </div>

//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Assign Staff</h3>

//                             {/* Staff Selectors */}
//                             {(['facilitator', 'assessor', 'moderator'] as const).map(role => {
//                                 const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
//                                 const currentId = formData[`${role}Id`];
//                                 const originalId = cohort ? cohort[`${role}Id`] : '';
//                                 const hasChanged = cohort && currentId !== originalId;

//                                 const isConflict = (role === 'assessor' && currentId && currentId === formData.moderatorId) ||
//                                     (role === 'moderator' && currentId && currentId === formData.assessorId);

//                                 return (
//                                     <div key={role} className="input-group">
//                                         <label style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between' }}>
//                                             {role} {isConflict && <span style={{ color: 'red', fontSize: '0.7em', display: 'flex', alignItems: 'center' }}><ShieldAlert size={12} /> Conflict!</span>}
//                                         </label>
//                                         <select
//                                             value={currentId}
//                                             onChange={e => setFormData({ ...formData, [`${role}Id`]: e.target.value })}
//                                             style={{ borderColor: isConflict ? 'red' : hasChanged ? 'orange' : '#e2e8f0' }}
//                                         >
//                                             <option value="">Select Staff...</option>
//                                             {options.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
//                                         </select>
//                                         {hasChanged && (
//                                             <input
//                                                 placeholder="Reason for change..."
//                                                 style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
//                                                 value={reasons[role]}
//                                                 onChange={e => setReasons({ ...reasons, [role]: e.target.value })}
//                                             />
//                                         )}
//                                     </div>
//                                 );
//                             })}
//                         </div>

//                         {/* RIGHT COLUMN: Learners */}
//                         <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
//                             <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
//                                 <span>3. Select Learners</span>
//                                 <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
//                                     {formData.learnerIds.length} Selected
//                                 </span>
//                             </h3>

//                             {/* LEARNER LIST */}
//                             <div style={{
//                                 flex: 1,
//                                 minHeight: '300px',
//                                 overflowY: 'auto',
//                                 border: '1px solid #e2e8f0',
//                                 borderRadius: '8px',
//                                 background: '#f8fafc',
//                                 display: 'flex',
//                                 flexDirection: 'column'
//                             }}>
//                                 {availableLearners.length > 0 ? (
//                                     availableLearners.map(learner => {
//                                         const isSelected = formData.learnerIds.includes(learner.id);
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
//                                                     transition: 'all 0.2s'
//                                                 }}
//                                             >
//                                                 <div style={{ color: isSelected ? '#2563eb' : '#94a3b8' }}>
//                                                     {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
//                                                 </div>
//                                                 <div>
//                                                     <div style={{ fontWeight: 600, color: isSelected ? '#1e3a8a' : '#334155' }}>{learner.fullName}</div>
//                                                     <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{learner.idNumber}</div>
//                                                 </div>
//                                             </div>
//                                         );
//                                     })
//                                 ) : (
//                                     <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
//                                         <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
//                                         <p>No available learners found.</p>
//                                         <small>Import new learners or set existing ones to 'Unassigned'.</small>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     <div className="modal-footer">
//                         <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
//                         <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
//                             {loading ? <Loader className="spin" /> : <Save size={18} />}
//                             {cohort ? 'Save Changes' : 'Create Cohort'}
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
// // import { StatusModal, type StatusType } from '../common/StatusModal';

// // interface Props {
// //     cohort?: Cohort;
// //     onClose: () => void;
// //     onSave: (cohort: any, reasons?: any) => Promise<void>;
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

// //     // Filter Data
// //     const availableLearners = useMemo(() => {
// //         return learners.filter(l => !l.isArchived || (cohort && cohort.learnerIds.includes(l.id)));
// //     }, [learners, cohort]);

// //     const facilitators = useMemo(() => staff.filter(s => s.role === 'facilitator'), [staff]);
// //     const assessors = useMemo(() => staff.filter(s => s.role === 'assessor'), [staff]);
// //     const moderators = useMemo(() => staff.filter(s => s.role === 'moderator'), [staff]);

// //     // Load Data on Edit
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

// //         // 1. DIRTY CHECK (Has anything changed?)
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

// //         // 2. SEGREGATION OF DUTIES Check
// //         if (formData.assessorId && formData.moderatorId && formData.assessorId === formData.moderatorId) {
// //             showStatus('error', 'Compliance Error', 'The Assessor and Moderator cannot be the same person. This violates QCTO Segregation of Duties.');
// //             return;
// //         }

// //         // 3. AUDIT REASONS Check
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

// //         // 4. SAVE
// //         setLoading(true);
// //         await onSave(formData, reasons);
// //         setLoading(false);
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
// //             {/* --- STATUS MODAL (Popups) --- */}
// //             {statusModal.show && (
// //                 <StatusModal
// //                     type={statusModal.type}
// //                     title={statusModal.title}
// //                     message={statusModal.message}
// //                     onClose={() => setStatusModal({ ...statusModal, show: false })}
// //                 />
// //             )}

// //             {/* --- MAIN FORM MODAL --- */}
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

// //                             {/* Staff Selectors */}
// //                             {['facilitator', 'assessor', 'moderator'].map(role => {
// //                                 const options = role === 'facilitator' ? facilitators : role === 'assessor' ? assessors : moderators;
// //                                 const currentId = (formData as any)[`${role}Id`];
// //                                 const originalId = cohort ? (cohort as any)[`${role}Id`] : '';
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
// //                                             {options.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
// //                                         </select>
// //                                         {hasChanged && (
// //                                             <input
// //                                                 placeholder="Reason for change..."
// //                                                 style={{ marginTop: '5px', fontSize: '0.8rem', borderColor: 'orange' }}
// //                                                 value={(reasons as any)[role]}
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

// //                             {/* LEARNER LIST */}
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
// //                                         <p>No active learners found.</p>
// //                                         <small>Add learners in the "Learner Results" tab first.</small>
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