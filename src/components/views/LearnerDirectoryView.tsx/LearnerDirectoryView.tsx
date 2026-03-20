// src/components/views/LearnerDirectoryView/LearnerDirectoryView.tsx
// Styled to align with mLab Corporate Identity Brand Guide 2019
// Inherits shared mlab-* classes from LearnersView.css
// Component-specific classes live in LearnerDirectoryView.css

import React, { useState, useMemo } from 'react';
import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardLearner } from '../../../types';
import '../LearnersView/LearnersView.css';
import './LearnerDirectoryView.css';

interface LearnerDirectoryViewProps {
    learners: DashboardLearner[];
}

export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // ─── SMART GROUPING: EXTRACT UNIQUE HUMANS ───────────────────────────────
    const directoryData = useMemo(() => {
        const profileMap = new Map<string, any>();

        learners.forEach(l => {
            const humanId = l.learnerId || l.id;

            if (!profileMap.has(humanId)) {
                profileMap.set(humanId, {
                    learnerId: humanId,
                    fullName: l.fullName,
                    idNumber: l.idNumber,
                    email: l.email,
                    phone: l.phone || l.mobile,
                    authStatus: l.authStatus || 'pending',
                    isArchived: l.isArchived,
                    enrollmentCount: 1,
                    latestCohort: l.cohortId,
                });
            } else {
                const existing = profileMap.get(humanId);
                existing.enrollmentCount += 1;
                if (!l.isArchived) existing.isArchived = false;
            }
        });

        let results = Array.from(profileMap.values());

        if (searchTerm.trim()) {
            const s = searchTerm.toLowerCase();
            results = results.filter(p =>
                p.fullName?.toLowerCase().includes(s) ||
                p.idNumber?.includes(s) ||
                p.email?.toLowerCase().includes(s)
            );
        }

        return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [learners, searchTerm]);

    return (
        <div className="mlab-learners ld-root">

            {/* ── HEADER ── */}
            <div className="ld-header">
                <div className="ld-header__identity">
                    <div className="ld-header__icon-box">
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 className="ld-header__title">Master Directory</h2>
                        <p className="ld-header__sub">
                            {directoryData.length} unique individual{directoryData.length !== 1 ? 's' : ''} registered on the platform.
                        </p>
                    </div>
                </div>

                <div className="mlab-search ld-search">
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by name, ID or email…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* ── TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Learner Identity</th>
                            <th>Contact Info</th>
                            <th>Auth Status</th>
                            <th>History</th>
                            <th className="ld-th--right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {directoryData.length > 0 ? directoryData.map(profile => (
                            <tr key={profile.learnerId}>

                                {/* Identity */}
                                <td>
                                    <div className="ld-identity">
                                        <span className="ld-identity__name">{profile.fullName}</span>
                                        <span className="ld-identity__id">ID: {profile.idNumber}</span>
                                    </div>
                                </td>

                                {/* Contact */}
                                <td>
                                    <div className="ld-contact">
                                        <div className="ld-contact__row">
                                            <Mail size={12} />
                                            <span>{profile.email || <em className="ld-empty-val">No email</em>}</span>
                                        </div>
                                        <div className="ld-contact__row">
                                            <Phone size={12} />
                                            <span>{profile.phone || <em className="ld-empty-val">No phone</em>}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Auth Status */}
                                <td>
                                    {profile.authStatus === 'active' ? (
                                        <span className="mlab-badge mlab-badge--active ld-badge">
                                            <UserCheck size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="mlab-badge mlab-badge--draft ld-badge">
                                            <ShieldAlert size={12} /> Pending / Invited
                                        </span>
                                    )}
                                </td>

                                {/* Enrollments */}
                                <td>
                                    <span className={`ld-enrol-chip${profile.enrollmentCount > 1 ? ' ld-enrol-chip--multi' : ''}`}>
                                        <GraduationCap size={14} />
                                        {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="ld-td--right">
                                    <button
                                        className="mlab-btn mlab-btn--outline mlab-btn--outline-blue ld-view-btn"
                                        onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
                                    >
                                        <Eye size={14} /> View 360° Profile
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                    <div className="mlab-empty">
                                        <Users size={40} color="var(--mlab-green)" style={{ opacity: 0.6 }} />
                                        <p className="mlab-empty__title">No Learners Found</p>
                                        <p className="mlab-empty__desc">Try adjusting your search criteria.</p>
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