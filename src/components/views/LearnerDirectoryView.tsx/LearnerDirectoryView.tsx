import React, { useState, useMemo } from 'react';
import { Search, Mail, Phone, Eye, UserCheck, Users, ShieldAlert, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardLearner } from '../../../types';
import '../LearnersView/LearnersView.css';

interface LearnerDirectoryViewProps {
    learners: DashboardLearner[];
}

export const LearnerDirectoryView: React.FC<LearnerDirectoryViewProps> = ({ learners }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // ─── 🚀 SMART GROUPING: EXTRACT UNIQUE HUMANS 🚀 ───
    const directoryData = useMemo(() => {
        const profileMap = new Map<string, any>();

        learners.forEach(l => {
            // Fallback for legacy records that might not have a learnerId mapped yet
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
                    latestCohort: l.cohortId // Just for a quick glance
                });
            } else {
                const existing = profileMap.get(humanId);
                existing.enrollmentCount += 1;
                // If they have an active course, prioritize that over an archived one
                if (!l.isArchived) {
                    existing.isArchived = false;
                }
            }
        });

        // Filter by search term
        let results = Array.from(profileMap.values());

        if (searchTerm.trim()) {
            const s = searchTerm.toLowerCase();
            results = results.filter(p =>
                p.fullName?.toLowerCase().includes(s) ||
                p.idNumber?.includes(s) ||
                p.email?.toLowerCase().includes(s)
            );
        }

        // Sort alphabetically
        return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [learners, searchTerm]);

    const totalHumans = directoryData.length;

    return (
        <div className="mlab-learners animate-fade-in">

            {/* ── HEADER & SEARCH ── */}
            <div className="mlab-toolbar" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '8px', color: '#3730a3' }}>
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Master Directory</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                            {totalHumans} unique individual(s) registered on the platform.
                        </p>
                    </div>
                </div>

                <div className="mlab-search" style={{ minWidth: '300px' }}>
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by name, ID or email…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* ── DIRECTORY TABLE ── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Learner Identity</th>
                            <th>Contact Info</th>
                            <th>Auth Status</th>
                            <th>History</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {directoryData.length > 0 ? directoryData.map((profile) => (
                            <tr key={profile.learnerId}>

                                {/* Identity Column */}
                                <td>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>
                                            {profile.fullName}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>ID: {profile.idNumber}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Contact Column */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#475569' }}>
                                            <Mail size={12} /> {profile.email || <span style={{ opacity: 0.5 }}>No email</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#475569' }}>
                                            <Phone size={12} /> {profile.phone || <span style={{ opacity: 0.5 }}>No phone</span>}
                                        </div>
                                    </div>
                                </td>

                                {/* System Auth Status */}
                                <td>
                                    {profile.authStatus === 'active' ? (
                                        <span className="mlab-badge mlab-badge--active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <UserCheck size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="mlab-badge mlab-badge--draft" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <ShieldAlert size={12} /> Pending / Invited
                                        </span>
                                    )}
                                </td>

                                {/* Enrollments Column */}
                                <td>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        background: profile.enrollmentCount > 1 ? '#dbeafe' : '#f1f5f9',
                                        color: profile.enrollmentCount > 1 ? '#1d4ed8' : '#475569',
                                        padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600
                                    }}>
                                        <GraduationCap size={14} />
                                        {profile.enrollmentCount} {profile.enrollmentCount === 1 ? 'Enrollment' : 'Enrollments'}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
                                        onClick={() => navigate(`/admin/learners/${profile.learnerId}`)}
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        <Eye size={14} /> View 360° Profile
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5}>
                                    <div className="mlab-empty" style={{ padding: '3rem 0' }}>
                                        <Users size={40} color="#cbd5e1" style={{ marginBottom: '1rem' }} />
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