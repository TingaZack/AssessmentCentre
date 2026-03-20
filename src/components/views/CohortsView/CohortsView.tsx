// src/components/views/CohortsView.tsx

import React from 'react';
import { Plus, Archive, Calendar, Users, Layers, ArrowRight, Edit } from 'lucide-react';
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
