// src/components/views/QualificationsView.tsx

import React from 'react';
import { Plus, Upload, Edit, Trash2, GraduationCap } from 'lucide-react';
import type { ProgrammeTemplate } from '../../../types';
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
    const active = programmes.filter(p => !p.isArchived);

    return (
        <div className="mlab-qualifications">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="mlab-qualifications__header">
                <h2 className="mlab-qualifications__title">Programme Templates</h2>
                <div className="mlab-qualifications__actions">
                    {/* <button className="mlab-btn mlab-btn--outline-blue" onClick={onUpload}>
                        <Upload size={15} /> Upload CSV
                    </button> */}
                    <button className="mlab-btn mlab-btn--green" onClick={onAdd}>
                        <Plus size={15} /> Create Template
                    </button>
                </div>
            </div>

            {/* ── Table ──────────────────────────────────────────────────── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Programme Name</th>
                            <th>SAQA ID</th>
                            <th>NQF Level</th>
                            <th>Modules</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {active.map(prog => (
                            <tr key={prog.id}>

                                {/* Name */}
                                <td>
                                    <span className="mlab-cell-name">{prog.name}</span>
                                </td>

                                {/* SAQA ID */}
                                <td>
                                    <span className="mlab-cell-meta">{prog.saqaId}</span>
                                </td>

                                {/* NQF Level */}
                                <td>
                                    <span className="mlab-nqf-badge">Level {prog.nqfLevel}</span>
                                </td>

                                {/* Module Chips */}
                                <td>
                                    <div className="mlab-module-chips">
                                        <span className="mlab-chip mlab-chip--k">
                                            K: {prog.knowledgeModules.length}
                                        </span>
                                        <span className="mlab-chip mlab-chip--p">
                                            P: {prog.practicalModules.length}
                                        </span>
                                        <span className="mlab-chip mlab-chip--k">
                                            W: {prog.workExperienceModules.length}
                                        </span>
                                    </div>
                                </td>

                                {/* Actions */}
                                <td>
                                    <div className="mlab-icon-btn-group">
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

                        {/* Empty State */}
                        {active.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                    <div className="mlab-table-empty">
                                        <GraduationCap size={40} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                        <span className="mlab-table-empty__title">No Programme Templates</span>
                                        <p className="mlab-table-empty__desc">
                                            Create a template or upload a CSV to get started.
                                        </p>
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