// src/components/views/CohortsView.tsx

import React from 'react';
import { Plus, Archive, Calendar, Users, Layers, ArrowRight, Edit, Eye } from 'lucide-react';
import type { StaffMember } from '../../../store/useStore';
import type { Cohort } from '../../../types';
import { useNavigate } from 'react-router-dom';
import './CohortsView.css';

interface CohortsViewProps {
    cohorts: Cohort[];
    staff: StaffMember[];
    onAdd: () => void;
    onEdit: (cohort: Cohort) => void;
    onArchive: (cohort: Cohort) => void;
}

export const CohortsView: React.FC<CohortsViewProps> = ({ cohorts, staff, onAdd, onEdit, onArchive }) => {
    const navigate = useNavigate();

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    return (
        <div className="mlab-cohorts">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="mlab-cohorts__header">
                <h2 className="mlab-cohorts__title">Active Classes (Cohorts)</h2>
                <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
                    <Plus size={16} /> Create New Cohort
                </button>
            </div>

            {/* ── Card Grid ──────────────────────────────────────────────── */}
            <div className="mlab-cohort-grid">
                {cohorts.map(cohort => (
                    <div key={cohort.id} className="mlab-cohort-card">

                        {/* Card Header */}
                        <div className="mlab-cohort-card__header">
                            <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
                            <div className="mlab-cohort-card__actions">
                                <button
                                    className="mlab-icon-btn mlab-icon-btn--blue"
                                    onClick={() => onEdit(cohort)}
                                    title="Edit Details"
                                >
                                    <Edit size={15} />
                                </button>
                                <button
                                    className="mlab-icon-btn mlab-icon-btn--amber"
                                    onClick={() => onArchive(cohort)}
                                    title="Archive Class (History)"
                                >
                                    <Archive size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Date Range */}
                        <div className="mlab-cohort-card__dates">
                            <Calendar size={14} />
                            {cohort.startDate} — {cohort.endDate}
                        </div>

                        {/* Staff Roles */}
                        <div className="mlab-cohort-card__roles">
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--blue" />
                                <span className="mlab-role-label">Facilitator:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.facilitatorId)}</span>
                            </div>
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--red" />
                                <span className="mlab-role-label">Assessor:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.assessorId)}</span>
                            </div>
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--green" />
                                <span className="mlab-role-label">Moderator:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.moderatorId)}</span>
                            </div>
                        </div>

                        {/* Card Footer */}
                        <div className="mlab-cohort-card__footer">
                            <div className="mlab-cohort-card__learner-count">
                                <Users size={15} />
                                <span>
                                    <strong>{cohort.learnerIds.length}</strong> Learners Enrolled
                                </span>
                            </div>
                            <button
                                className="mlab-cohort-card__manage"
                                onClick={() => navigate(`/cohorts/${cohort.id}`)}
                            >
                                Manage <ArrowRight size={13} />
                            </button>
                            {/* <button
                                className="icon-btn action-view"
                                onClick={() => navigate(`/cohorts/${cohort.id}`)}
                                title="View Class Register"
                            >
                                <Eye size={16} />
                            </button> */}
                        </div>
                    </div>
                ))}

                {/* Empty State */}
                {cohorts.length === 0 && (
                    <div className="mlab-cohort-empty">
                        <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                        <p className="mlab-cohort-empty__title">No Cohorts Yet</p>
                        <p className="mlab-cohort-empty__desc">
                            Create a class to get started.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// // import React, { useState } from 'react';
// // import { Plus, Trash2, Edit, Users, Calendar, Archive, RotateCcw, Layers } from 'lucide-react';
// // import type { Cohort, } from '../../types';
// // import type { StaffMember } from '../../store/useStore';

// // interface CohortsViewProps {
// //     cohorts: Cohort[];
// //     staff: StaffMember[];
// //     onAdd: () => void;
// //     onEdit: (cohort: Cohort) => void;
// //     onArchive: (cohort: Cohort) => void;
// //     onRestore: (cohort: Cohort) => void; // ✅ NEW PROP
// // }

// // export const CohortsView: React.FC<CohortsViewProps> = ({
// //     cohorts, staff, onAdd, onEdit, onArchive, onRestore
// // }) => {

// //     // Toggle state for viewing archives
// //     const [showArchived, setShowArchived] = useState(false);

// //     // Filter logic
// //     const displayedCohorts = cohorts.filter(c =>
// //         showArchived ? c.isArchived : !c.isArchived
// //     );

// //     // Helper to find staff names
// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     return (
// //         <div className="list-view">
// //             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                     <h2 style={{ margin: 0 }}>
// //                         {showArchived ? 'Archived Cohorts' : 'Active Cohorts'}
// //                     </h2>

// //                     {/* Toggle Button */}
// //                     <button
// //                         className={`btn ${showArchived ? 'btn-warning' : 'btn-outline'}`}
// //                         onClick={() => setShowArchived(!showArchived)}
// //                         style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
// //                     >
// //                         {showArchived ? <><Layers size={16} /> View Active</> : <><Archive size={16} /> View Archived</>}
// //                     </button>
// //                 </div>

// //                 {!showArchived && (
// //                     <button className="btn btn-primary" onClick={onAdd}>
// //                         <Plus size={18} /> Create New Cohort
// //                     </button>
// //                 )}
// //             </div>

// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
// //                 {displayedCohorts.map(cohort => (
// //                     <div key={cohort.id} style={{
// //                         background: cohort.isArchived ? '#fffbeb' : 'white',
// //                         padding: '1.5rem',
// //                         borderRadius: '12px',
// //                         border: cohort.isArchived ? '1px solid #fcd34d' : '1px solid #e2e8f0',
// //                         boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
// //                         opacity: cohort.isArchived ? 0.8 : 1
// //                     }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
// //                             <div>
// //                                 <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
// //                                     {cohort.name}
// //                                 </h3>
// //                                 {cohort.isArchived && <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>Archived</span>}
// //                             </div>

// //                             {/* ACTION BUTTONS */}
// //                             <div style={{ display: 'flex', gap: '0.5rem' }}>
// //                                 {cohort.isArchived ? (
// //                                     <button
// //                                         className="icon-btn"
// //                                         title="Restore Cohort"
// //                                         onClick={() => onRestore(cohort)}
// //                                         style={{ color: '#d97706', background: '#fef3c7' }}
// //                                     >
// //                                         <RotateCcw size={18} />
// //                                     </button>
// //                                 ) : (
// //                                     <>
// //                                         <button className="icon-btn action-edit" onClick={() => onEdit(cohort)}>
// //                                             <Edit size={18} />
// //                                         </button>
// //                                         <button className="icon-btn delete" onClick={() => onArchive(cohort)} title="Archive">
// //                                             <Trash2 size={18} />
// //                                         </button>
// //                                     </>
// //                                 )}
// //                             </div>
// //                         </div>

// //                         <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
// //                             <Calendar size={14} style={{ display: 'inline', marginRight: '5px' }} />
// //                             {cohort.startDate} — {cohort.endDate}
// //                         </div>

// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
// //                             {/* Staff indicators */}
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// //                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></div>
// //                                 <span style={{ color: '#64748b' }}>Fac:</span>
// //                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.facilitatorId)}</span>
// //                             </div>
// //                             {/* Assessor/Moderator ... */}
// //                         </div>

// //                         <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem' }}>
// //                                 <Users size={16} />
// //                                 <span>{cohort.learnerIds?.length || 0} Learners</span>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 ))}

// //                 {displayedCohorts.length === 0 && (
// //                     <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '12px', color: '#94a3b8' }}>
// //                         <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
// //                         <p>No {showArchived ? 'archived' : 'active'} cohorts found.</p>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };


// import React from 'react';
// import { Plus, Archive, Calendar, Users, Layers, ArrowRight, Edit } from 'lucide-react'; // <--- Archive Icon
// import type { StaffMember } from '../../store/useStore';
// import type { Cohort } from '../../types';
// import { useNavigate } from 'react-router-dom';

// interface CohortsViewProps {
//     cohorts: Cohort[];
//     staff: StaffMember[];
//     onAdd: () => void;
//     onEdit: (cohort: Cohort) => void;
//     onArchive: (cohort: Cohort) => void; // <--- Changed from onDelete to onArchive
// }

// export const CohortsView: React.FC<CohortsViewProps> = ({ cohorts, staff, onAdd, onEdit, onArchive }) => {

//     const navigate = useNavigate();

//     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     return (
//         <div className="list-view">
//             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
//                 <h2>Active Classes (Cohorts)</h2>
//                 <button className="btn btn-primary" onClick={onAdd}><Plus size={18} /> Create New Cohort</button>
//             </div>
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
//                 {cohorts.map(cohort => (
//                     <div key={cohort.id} style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
//                             <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{cohort.name}</h3>

//                             {/* ACTION BUTTONS GROUP */}
//                             <div style={{ display: 'flex', gap: '0.5rem' }}>
//                                 <button className="icon-btn action-edit" onClick={() => onEdit(cohort)} title="Edit Details">
//                                     <Edit size={16} />
//                                 </button>
//                                 {/* ARCHIVE BUTTON */}
//                                 <button
//                                     className="icon-btn delete"
//                                     onClick={() => onArchive(cohort)}
//                                     title="Archive Class (History)"
//                                     style={{ color: '#d97706', borderColor: '#d97706' }} // Orange color for Archive
//                                 >
//                                     <Archive size={16} />
//                                 </button>
//                             </div>
//                         </div>

//                         <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
//                             <Calendar size={14} style={{ display: 'inline', marginRight: '5px' }} />
//                             {cohort.startDate} — {cohort.endDate}
//                         </div>

//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
//                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></div>
//                                 <span style={{ color: '#64748b' }}>Facilitator:</span>
//                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.facilitatorId)}</span>
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
//                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></div>
//                                 <span style={{ color: '#64748b' }}>Assessor:</span>
//                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.assessorId)}</span>
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
//                                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
//                                 <span style={{ color: '#64748b' }}>Moderator:</span>
//                                 <span style={{ fontWeight: 600 }}>{getStaffName(cohort.moderatorId)}</span>
//                             </div>
//                         </div>

//                         <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem' }}>
//                                 <Users size={16} />
//                                 <span>{cohort.learnerIds.length} Learners Enrolled</span>
//                             </div>
//                             <button
//                                 onClick={() => navigate(`/admin/cohorts/${cohort.id}`)}
//                                 style={{ color: '#073f4e', fontSize: '0.85rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
//                             >
//                                 Manage <ArrowRight size={14} />
//                             </button>
//                         </div>
//                     </div>
//                 ))}
//                 {cohorts.length === 0 && (
//                     <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '12px', color: '#94a3b8' }}>
//                         <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
//                         <p>No cohorts created yet. Create a class to get started.</p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };