// src/components/views/QualificationsView.tsx

import React, { useState, useMemo } from 'react';
import { Plus, Edit, Trash2, GraduationCap, Search, X, BookOpen, Filter } from 'lucide-react';
import type { ProgrammeTemplate } from '../../../types';

// 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header & Toolbar
import '../../admin/WorkplacesManager/WorkplacesManager.css';
// 🚀 Import the unified table styles (so mlab-table works perfectly)
import '../../../components/views/LearnersView/LearnersView.css';
import './QualificationsView.css';

interface QualificationsViewProps {
    programmes: ProgrammeTemplate[];
    onAdd: () => void;
    onUpload: () => void;
    onEdit: (prog: ProgrammeTemplate) => void;
    onArchive: (prog: ProgrammeTemplate) => void;
}

export const QualificationsView: React.FC<QualificationsViewProps> = ({
    programmes, onAdd, onUpload, onEdit, onArchive
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterNqf, setFilterNqf] = useState('all');

    // Dynamically get available NQF levels from the programmes
    const availableNqfLevels = useMemo(() => {
        const levels = new Set<string>();
        programmes.forEach(p => {
            if (!p.isArchived && p.nqfLevel) {
                levels.add(p.nqfLevel.toString());
            }
        });
        return Array.from(levels).sort((a, b) => parseInt(a) - parseInt(b));
    }, [programmes]);

    const active = useMemo(() => {
        return programmes.filter(p => {
            if (p.isArchived) return false;

            // Apply NQF Filter
            if (filterNqf !== 'all' && p.nqfLevel?.toString() !== filterNqf) {
                return false;
            }

            // Apply Text Search
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                return p.name.toLowerCase().includes(q) || p.saqaId?.toLowerCase().includes(q);
            }

            return true;
        });
    }, [programmes, searchTerm, filterNqf]);

    return (
        <div className="wm-root animate-fade-in">

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><GraduationCap size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Programme Templates</h1>
                        <p className="wm-page-header__desc">Manage SAQA qualifications, NQF levels, and module structures.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Uncomment this if you want the CSV upload button back!
                    <button className="wm-btn wm-btn--ghost" onClick={onUpload} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
                        <Upload size={14} /> Upload CSV
                    </button> */}
                    <button className="wm-btn wm-btn--primary" onClick={onAdd}>
                        <Plus size={14} /> Create Template
                    </button>
                </div>
            </div>

            {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
            <div className="wm-toolbar" style={{ flexWrap: 'wrap' }}>
                {/* Search */}
                <div className="wm-search" style={{ flex: '1 1 250px' }}>
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search by programme name or SAQA ID…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
                    )}
                </div>

                {/* NQF Level Filter */}
                <div className="wm-search" style={{ flex: 'none', minWidth: '150px' }}>
                    <Filter size={15} className="wm-search__icon" />
                    <select
                        className="wm-search__input"
                        value={filterNqf}
                        onChange={e => setFilterNqf(e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="all">All NQF Levels</option>
                        {availableNqfLevels.map(level => (
                            <option key={level} value={level}>NQF Level {level}</option>
                        ))}
                    </select>
                </div>

                <div className="wm-toolbar__count">
                    {active.length} template{active.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── TABLE (Restored original mlab-table structure) ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Programme Name</th>
                            <th>SAQA ID</th>
                            <th>NQF Level</th>
                            <th>Modules</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {active.map(prog => (
                            <tr key={prog.id}>

                                {/* Name */}
                                <td>
                                    <span className="mlab-cell-name" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
                                        {prog.name}
                                    </span>
                                </td>

                                {/* SAQA ID */}
                                <td>
                                    <span className="mlab-cell-meta" style={{ color: 'var(--mlab-grey)' }}>
                                        {prog.saqaId || '—'}
                                    </span>
                                </td>

                                {/* NQF Level */}
                                <td>
                                    <span className="mlab-nqf-badge" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        Level {prog.nqfLevel}
                                    </span>
                                </td>

                                {/* Module Chips */}
                                <td>
                                    <div className="mlab-module-chips" style={{ display: 'flex', gap: '6px' }}>
                                        <span className="mlab-chip mlab-chip--k" style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                            K: {prog.knowledgeModules.length}
                                        </span>
                                        <span className="mlab-chip mlab-chip--p" style={{ fontSize: '0.75rem', background: '#e0e7ff', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                                            P: {prog.practicalModules.length}
                                        </span>
                                        <span className="mlab-chip mlab-chip--w" style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                            W: {prog.workExperienceModules.length}
                                        </span>
                                    </div>
                                </td>

                                {/* Actions */}
                                <td style={{ textAlign: 'right' }}>
                                    <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
                                        <button
                                            className="mlab-icon-btn mlab-icon-btn--blue"
                                            onClick={() => onEdit(prog)}
                                            title="Edit Programme"
                                        >
                                            <Edit size={15} />
                                        </button>
                                        <button
                                            className="mlab-icon-btn mlab-icon-btn--amber"
                                            onClick={() => onArchive(prog)}
                                            title="Archive Programme"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {/* Empty State (Matched to wm-empty style) */}
                        {active.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                    <div className="wm-empty" style={{ margin: '2rem', border: 'none', background: 'transparent' }}>
                                        <div className="wm-empty__icon"><BookOpen size={36} /></div>
                                        <p className="wm-empty__title">
                                            {searchTerm || filterNqf !== 'all' ? 'No matches found' : 'No Programme Templates'}
                                        </p>
                                        <p className="wm-empty__desc">
                                            {searchTerm || filterNqf !== 'all'
                                                ? 'Try adjusting your search or filter criteria.'
                                                : 'Create a template or upload a CSV to get started.'}
                                        </p>
                                        {!searchTerm && filterNqf === 'all' && (
                                            <button className="wm-btn wm-btn--primary" onClick={onAdd} style={{ marginTop: '1rem' }}>
                                                <Plus size={14} /> Create Template
                                            </button>
                                        )}
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



// // src/components/views/QualificationsView.tsx

// import React, { useState, useMemo } from 'react';
// import { Plus, Upload, Edit, Trash2, GraduationCap, Search, X, BookOpen } from 'lucide-react';
// import type { ProgrammeTemplate } from '../../../types';

// // 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header & Toolbar
// import '../../admin/WorkplacesManager/WorkplacesManager.css';
// // 🚀 Import the unified table styles (so mlab-table works perfectly)
// import '../../../components/views/LearnersView/LearnersView.css';
// import './QualificationsView.css';

// interface QualificationsViewProps {
//     programmes: ProgrammeTemplate[];
//     onAdd: () => void;
//     onUpload: () => void;
//     onEdit: (prog: ProgrammeTemplate) => void;
//     onArchive: (prog: ProgrammeTemplate) => void;
// }

// export const QualificationsView: React.FC<QualificationsViewProps> = ({
//     programmes, onAdd, onUpload, onEdit, onArchive
// }) => {
//     // 🚀 Added search functionality to match the standard toolbar pattern!
//     const [searchTerm, setSearchTerm] = useState('');

//     const active = useMemo(() => {
//         return programmes.filter(p => {
//             if (p.isArchived) return false;
//             if (searchTerm) {
//                 const q = searchTerm.toLowerCase();
//                 return p.name.toLowerCase().includes(q) || p.saqaId?.toLowerCase().includes(q);
//             }
//             return true;
//         });
//     }, [programmes, searchTerm]);

//     return (
//         <div className="wm-root animate-fade-in">

//             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><GraduationCap size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">Programme Templates</h1>
//                         <p className="wm-page-header__desc">Manage SAQA qualifications, NQF levels, and module structures.</p>
//                     </div>
//                 </div>
//                 <div style={{ display: 'flex', gap: '10px' }}>
//                     {/* Uncomment this if you want the CSV upload button back!
//                     <button className="wm-btn wm-btn--ghost" onClick={onUpload} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
//                         <Upload size={14} /> Upload CSV
//                     </button> */}
//                     <button className="wm-btn wm-btn--primary" onClick={onAdd}>
//                         <Plus size={14} /> Create Template
//                     </button>
//                 </div>
//             </div>

//             {/* ── TOOLBAR (Reusing wm-toolbar styling) ── */}
//             <div className="wm-toolbar">
//                 <div className="wm-search">
//                     <Search size={15} className="wm-search__icon" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search by programme name or SAQA ID…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                     {searchTerm && (
//                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>
//                     )}
//                 </div>
//                 <div className="wm-toolbar__count">
//                     {active.length} template{active.length !== 1 ? 's' : ''}
//                 </div>
//             </div>

//             {/* ── TABLE (Restored original mlab-table structure) ── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Programme Name</th>
//                             <th>SAQA ID</th>
//                             <th>NQF Level</th>
//                             <th>Modules</th>
//                             <th style={{ textAlign: 'right' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {active.map(prog => (
//                             <tr key={prog.id}>

//                                 {/* Name */}
//                                 <td>
//                                     <span className="mlab-cell-name" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
//                                         {prog.name}
//                                     </span>
//                                 </td>

//                                 {/* SAQA ID */}
//                                 <td>
//                                     <span className="mlab-cell-meta" style={{ color: 'var(--mlab-grey)' }}>
//                                         {prog.saqaId || '—'}
//                                     </span>
//                                 </td>

//                                 {/* NQF Level */}
//                                 <td>
//                                     {/* Wrapping in standard badge style if mlab-nqf-badge relies on old css */}
//                                     <span className="mlab-nqf-badge" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
//                                         Level {prog.nqfLevel}
//                                     </span>
//                                 </td>

//                                 {/* Module Chips */}
//                                 <td>
//                                     <div className="mlab-module-chips" style={{ display: 'flex', gap: '6px' }}>
//                                         <span className="mlab-chip mlab-chip--k" style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
//                                             K: {prog.knowledgeModules.length}
//                                         </span>
//                                         <span className="mlab-chip mlab-chip--p" style={{ fontSize: '0.75rem', background: '#e0e7ff', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
//                                             P: {prog.practicalModules.length}
//                                         </span>
//                                         <span className="mlab-chip mlab-chip--w" style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
//                                             W: {prog.workExperienceModules.length}
//                                         </span>
//                                     </div>
//                                 </td>

//                                 {/* Actions */}
//                                 <td style={{ textAlign: 'right' }}>
//                                     <div className="mlab-icon-btn-group" style={{ justifyContent: 'flex-end' }}>
//                                         <button
//                                             className="mlab-icon-btn mlab-icon-btn--blue"
//                                             onClick={() => onEdit(prog)}
//                                             title="Edit Programme"
//                                         >
//                                             <Edit size={15} />
//                                         </button>
//                                         <button
//                                             className="mlab-icon-btn mlab-icon-btn--amber"
//                                             onClick={() => onArchive(prog)}
//                                             title="Archive Programme"
//                                         >
//                                             <Trash2 size={15} />
//                                         </button>
//                                     </div>
//                                 </td>
//                             </tr>
//                         ))}

//                         {/* Empty State (Matched to wm-empty style) */}
//                         {active.length === 0 && (
//                             <tr>
//                                 <td colSpan={5} style={{ padding: 0 }}>
//                                     <div className="wm-empty" style={{ margin: '2rem', border: 'none', background: 'transparent' }}>
//                                         <div className="wm-empty__icon"><BookOpen size={36} /></div>
//                                         <p className="wm-empty__title">
//                                             {searchTerm ? 'No matches found' : 'No Programme Templates'}
//                                         </p>
//                                         <p className="wm-empty__desc">
//                                             {searchTerm
//                                                 ? 'Try adjusting your search term.'
//                                                 : 'Create a template or upload a CSV to get started.'}
//                                         </p>
//                                         {!searchTerm && (
//                                             <button className="wm-btn wm-btn--primary" onClick={onAdd} style={{ marginTop: '1rem' }}>
//                                                 <Plus size={14} /> Create Template
//                                             </button>
//                                         )}
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



// // // src/components/views/QualificationsView.tsx

// // import React from 'react';
// // import { Plus, Upload, Edit, Trash2, GraduationCap } from 'lucide-react';
// // import type { ProgrammeTemplate } from '../../../types';
// // import './QualificationsView.css';

// // interface QualificationsViewProps {
// //     programmes: ProgrammeTemplate[];
// //     onAdd: () => void;
// //     onUpload: () => void;
// //     onEdit: (prog: ProgrammeTemplate) => void;
// //     onArchive: (prog: ProgrammeTemplate) => void;
// // }

// // export const QualificationsView: React.FC<QualificationsViewProps> = ({
// //     programmes, onAdd, onUpload, onEdit, onArchive
// // }) => {
// //     const active = programmes.filter(p => !p.isArchived);

// //     return (
// //         <div className="mlab-qualifications">

// //             {/* ── Header ─────────────────────────────────────────────────── */}
// //             <div className="mlab-qualifications__header">
// //                 <h2 className="mlab-qualifications__title">Programme Templates</h2>
// //                 <div className="mlab-qualifications__actions">
// //                     {/* <button className="mlab-btn mlab-btn--outline-blue" onClick={onUpload}>
// //                         <Upload size={15} /> Upload CSV
// //                     </button> */}
// //                     <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
// //                         <Plus size={15} /> Create Template
// //                     </button>
// //                 </div>
// //             </div>

// //             {/* ── Table ──────────────────────────────────────────────────── */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Programme Name</th>
// //                             <th>SAQA ID</th>
// //                             <th>NQF Level</th>
// //                             <th>Modules</th>
// //                             <th>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {active.map(prog => (
// //                             <tr key={prog.id}>

// //                                 {/* Name */}
// //                                 <td>
// //                                     <span className="mlab-cell-name">{prog.name}</span>
// //                                 </td>

// //                                 {/* SAQA ID */}
// //                                 <td>
// //                                     <span className="mlab-cell-meta">{prog.saqaId}</span>
// //                                 </td>

// //                                 {/* NQF Level */}
// //                                 <td>
// //                                     <span className="mlab-nqf-badge">Level {prog.nqfLevel}</span>
// //                                 </td>

// //                                 {/* Module Chips */}
// //                                 <td>
// //                                     <div className="mlab-module-chips">
// //                                         <span className="mlab-chip mlab-chip--k">
// //                                             K: {prog.knowledgeModules.length}
// //                                         </span>
// //                                         <span className="mlab-chip mlab-chip--p">
// //                                             P: {prog.practicalModules.length}
// //                                         </span>
// //                                         <span className="mlab-chip mlab-chip--k">
// //                                             W: {prog.workExperienceModules.length}
// //                                         </span>
// //                                     </div>
// //                                 </td>

// //                                 {/* Actions */}
// //                                 <td>
// //                                     <div className="mlab-icon-btn-group">
// //                                         <button
// //                                             className="mlab-icon-btn mlab-icon-btn--blue"
// //                                             onClick={() => onEdit(prog)}
// //                                             title="Edit Programme"
// //                                         >
// //                                             <Edit size={15} />
// //                                         </button>
// //                                         <button
// //                                             className="mlab-icon-btn mlab-icon-btn--amber"
// //                                             onClick={() => onArchive(prog)}
// //                                             title="Archive Programme"
// //                                         >
// //                                             <Trash2 size={15} />
// //                                         </button>
// //                                     </div>
// //                                 </td>
// //                             </tr>
// //                         ))}

// //                         {/* Empty State */}
// //                         {active.length === 0 && (
// //                             <tr>
// //                                 <td colSpan={5} style={{ padding: 0 }}>
// //                                     <div className="mlab-table-empty">
// //                                         <GraduationCap size={40} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// //                                         <span className="mlab-table-empty__title">No Programme Templates</span>
// //                                         <p className="mlab-table-empty__desc">
// //                                             Create a template or upload a CSV to get started.
// //                                         </p>
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