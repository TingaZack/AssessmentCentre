// src/components/admin/LearnerProfileView/LearnerProfileView.tsx
// mLab CI v2.1 — ViewPortfolio aesthetic

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    User, Mail, Phone, FileText, Edit3, Save, X,
    Fingerprint, GraduationCap, AlertCircle, Loader2,
    BookOpen, Calendar, CheckCircle, Users,
    ExternalLink, History
} from 'lucide-react';
import type { DashboardLearner } from '../../../types';
import './LearnerProfileView.css';
import { useStore } from '../../../store/useStore';
import { PageHeader, type HeaderTheme } from '../../common/PageHeader/PageHeader';
import { Sidebar } from '../../dashboard/Sidebar';

export const LearnerProfileView: React.FC = () => {
    const { learnerId } = useParams<{ learnerId: string }>();
    const navigate = useNavigate();

    const { user, learners, cohorts, learnersLoading, fetchLearners, fetchCohorts, updateLearner } = useStore();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<DashboardLearner>>({});

    const headerTheme = useMemo((): HeaderTheme => {
        if (!user?.role) return 'default';
        if (user.role === 'learner') return 'student';
        return user.role as HeaderTheme;
    }, [user?.role]);

    useEffect(() => {
        if (learners.length === 0) fetchLearners();
        if (cohorts.length === 0) fetchCohorts();
    }, [learners.length, cohorts.length, fetchLearners, fetchCohorts]);

    const learnerEnrollments = useMemo(() => {
        if (!learnerId) return [];
        return learners.filter(l => l.learnerId === learnerId || l.id === learnerId);
    }, [learners, learnerId]);

    const profile = learnerEnrollments.length > 0 ? learnerEnrollments[0] : null;

    useEffect(() => {
        if (profile && !isEditing) {
            setFormData({
                fullName: profile.fullName,
                idNumber: profile.idNumber,
                email: profile.email,
                phone: profile.phone || profile.mobile,
                dateOfBirth: profile.dateOfBirth,
            });
        }
    }, [profile, isEditing]);

    const handleSave = async () => {
        if (!learnerId || !profile) return;
        setSaving(true);
        try {
            await updateLearner(profile.id, formData);
            setIsEditing(false);
        } catch (err) {
            console.error('Update failed', err);
            alert('Failed to update identity details.');
        } finally {
            setSaving(false);
        }
    };

    const update = (field: keyof DashboardLearner, val: string) =>
        setFormData(prev => ({ ...prev, [field]: val }));

    const getDemo = (rootKey: string, nestedKey: string) =>
        (profile as any)?.[rootKey] ||
        profile?.demographics?.[nestedKey as keyof typeof profile.demographics] ||
        'N/A';

    /* ── Loading ── */
    if (learnersLoading && !profile) {
        return (
            <div className="admin-layout lpv-full-screen">
                <Sidebar currentNav="directory" onLogout={() => { }} />
                <main className="main-wrapper lpv-centered">
                    <Loader2 size={40} className="lpv-spin" />
                    <p className="lpv-loading-label">Loading 360° Profile…</p>
                </main>
            </div>
        );
    }

    /* ── 404 ── */
    if (!profile) {
        return (
            <div className="admin-layout lpv-full-screen">
                <Sidebar currentNav="directory" onLogout={() => { }} />
                <main className="main-wrapper">
                    <PageHeader
                        theme={headerTheme} variant="compact"
                        title="Profile Not Found"
                        onBack={() => navigate('/admin', { state: { activeTab: 'directory' } })}
                        backLabel="Back to Directory"
                    />
                    <div className="lpv-not-found">
                        <AlertCircle size={40} className="lpv-not-found__icon" />
                        <p className="lpv-not-found__title">Learner Not Found</p>
                        <p className="lpv-not-found__desc">
                            The requested learner profile does not exist or has been deleted.
                        </p>
                    </div>
                </main>
            </div>
        );
    }

    const isVerified = profile.authStatus === 'active';

    return (
        <div className="admin-layout lpv-full-screen">
            <Sidebar currentNav="directory" onLogout={() => { }} />

            <main className="main-wrapper" style={{ display: 'flex', flexDirection: 'column', width: "100%" }}>

                <PageHeader
                    theme={headerTheme}
                    variant="hero"
                    eyebrow="Student Record"
                    title={profile.fullName}
                    description={`ID: ${profile.idNumber}`}
                    icon={<User size={24} />}
                    onBack={() => navigate('/admin', { state: { activeTab: 'directory' } })}
                    backLabel="Back to Master Directory"
                    status={{
                        label: isVerified ? 'Active User' : 'Pending Invite',
                        variant: isVerified ? 'active' : 'draft',
                    }}
                    actions={
                        <PageHeader.Btn variant="outline" icon={<Edit3 size={14} />} onClick={() => setIsEditing(true)}>
                            Edit Identity
                        </PageHeader.Btn>
                    }
                />

                <div className="admin-content lpv-scroll-area">
                    <div className="lpv-wrapper">
                        <div className="lpv-layout">

                            {/* ══ MAIN STACK ══ */}
                            <div className="lpv-main-stack">

                                {/* ── Identity & Contact ── */}
                                <section className="lpv-panel">
                                    <div className="lpv-panel__header">
                                        <h3 className="lpv-panel__title">
                                            <User size={15} /> Identity &amp; Contact
                                        </h3>
                                        {!isEditing && (
                                            <button className="lpv-edit-trigger" onClick={() => setIsEditing(true)}>
                                                <Edit3 size={12} /> Edit
                                            </button>
                                        )}
                                    </div>

                                    {/* Avatar + name banner */}
                                    <div className="lpv-identity-banner">
                                        <div className="lpv-avatar">
                                            {(profile as any).profilePhotoUrl ? (
                                                <img
                                                    src={(profile as any).profilePhotoUrl}
                                                    alt="Profile"
                                                    className="lpv-avatar__img"
                                                />
                                            ) : (
                                                <User size={34} className="lpv-avatar__placeholder" />
                                            )}
                                        </div>
                                        <div className="lpv-identity-banner__info">
                                            <p className="lpv-identity-banner__name">
                                                {formData.fullName || profile.fullName}
                                            </p>
                                            <p className="lpv-identity-banner__email">{profile.email}</p>
                                        </div>
                                        <div className={`lpv-status-chip lpv-status-chip--${isVerified ? 'active' : 'pending'}`}>
                                            <CheckCircle size={11} />
                                            {isVerified ? 'Verified' : 'Pending'}
                                        </div>
                                    </div>

                                    {/* Editable fields */}
                                    <div className="lpv-grid-2">
                                        <EditField label="Full Legal Name" value={formData.fullName} icon={<User size={12} />} isEditing={isEditing} onChange={v => update('fullName', v)} />
                                        <EditField label="National ID / Passport" value={formData.idNumber} icon={<Fingerprint size={12} />} isEditing={isEditing} onChange={v => update('idNumber', v)} />
                                        <EditField label="Contact Number" value={formData.phone} icon={<Phone size={12} />} isEditing={isEditing} onChange={v => update('phone', v)} />
                                        <EditField label="Email Address" value={formData.email} icon={<Mail size={12} />} isEditing={isEditing} onChange={v => update('email', v)} />
                                    </div>

                                    <div className="lpv-divider" />

                                    <div className="lpv-grid-2">
                                        <EditField label="Date of Birth" value={formData.dateOfBirth} icon={<Calendar size={12} />} isEditing={isEditing} onChange={v => update('dateOfBirth', v)} type="date" />
                                    </div>

                                    {isEditing && (
                                        <div className="lpv-edit-actions">
                                            <button className="lpv-btn lpv-btn--ghost" onClick={() => setIsEditing(false)}>
                                                <X size={13} /> Cancel
                                            </button>
                                            <button className="lpv-btn lpv-btn--primary" onClick={handleSave} disabled={saving}>
                                                {saving
                                                    ? <><Loader2 size={13} className="lpv-spin" /> Saving…</>
                                                    : <><Save size={13} /> Save Identity</>
                                                }
                                            </button>
                                        </div>
                                    )}
                                </section>

                                {/* ── QCTO Demographics ── */}
                                <section className="lpv-panel">
                                    <div className="lpv-panel__header">
                                        <h3 className="lpv-panel__title">
                                            <BookOpen size={15} /> QCTO Demographics
                                        </h3>
                                    </div>
                                    <div className="lpv-grid-3">
                                        <ROField label="Equity" value={getDemo('equity', 'equityCode')} />
                                        <ROField label="Gender" value={getDemo('gender', 'genderCode')} />
                                        <ROField label="Nationality" value={getDemo('nationality', 'nationalityCode')} />
                                        <ROField label="Home Language" value={getDemo('homeLanguage', 'homeLanguageCode')} />
                                        <ROField label="City" value={getDemo('city', 'city')} />
                                        <ROField label="Province" value={getDemo('province', 'provinceCode')} />
                                        <ROField label="Employment Status" value={getDemo('employmentStatus', 'employmentStatus')} />
                                    </div>
                                </section>
                            </div>

                            {/* ══ ASIDE ══ */}
                            <aside className="lpv-aside">

                                {/* Academic history overview */}
                                <div className="lpv-overview-card">
                                    <div className="lpv-overview-card__eyebrow">
                                        <History size={12} /> Academic History Overview
                                    </div>
                                    <p className="lpv-overview-card__count">
                                        {learnerEnrollments.length} Total{' '}
                                        {learnerEnrollments.length === 1 ? 'Enrollment' : 'Enrollments'}
                                    </p>
                                    <span className="lpv-overview-card__sub">
                                        Across{' '}
                                        {new Set(learnerEnrollments.map(e => e.cohortId)).size} distinct{' '}
                                        {new Set(learnerEnrollments.map(e => e.cohortId)).size === 1 ? 'class' : 'classes'}
                                    </span>
                                </div>

                                {/* Compliance vault */}
                                <div className="lpv-card">
                                    <h4 className="lpv-card__title">
                                        <FileText size={14} /> Compliance Vault
                                    </h4>
                                    <div className="lpv-vault-links">
                                        <DocVaultLink label="ID Document" url={(profile as any)?.documents?.idUrl || null} />
                                        <DocVaultLink label="Highest Qualification" url={(profile as any)?.documents?.qualUrl || null} />
                                        <DocVaultLink label="Comprehensive CV" url={(profile as any)?.documents?.cvUrl || null} />
                                    </div>
                                </div>

                                {/* Course enrollments */}
                                <div className="lpv-card">
                                    <h4 className="lpv-card__title">
                                        <GraduationCap size={14} /> Course Enrollments
                                    </h4>
                                    <div className="lpv-enrollments">
                                        {learnerEnrollments.map((enrollment, idx) => {
                                            const cohortObj = cohorts.find(c => c.id === enrollment.cohortId);
                                            const cohortName = cohortObj
                                                ? cohortObj.name
                                                : enrollment.cohortId === 'Unassigned'
                                                    ? 'Unassigned'
                                                    : 'Unknown Class';

                                            const isCompleted = enrollment.status === 'completed';
                                            const isDropped = enrollment.status === 'dropped';
                                            const statusKey = isCompleted ? 'completed' : isDropped ? 'dropped' : 'active';

                                            return (
                                                <div
                                                    key={enrollment.enrollmentId || idx}
                                                    className={`lpv-enrollment-card lpv-enrollment-card--${statusKey}`}
                                                >
                                                    <p className="lpv-enrollment-card__qual">
                                                        {enrollment.qualification?.name || 'Unknown Qualification'}
                                                    </p>
                                                    <div className="lpv-enrollment-card__meta">
                                                        <span><Users size={11} /> {cohortName}</span>
                                                        <span><Calendar size={11} /> {enrollment.trainingStartDate}</span>
                                                    </div>
                                                    <div className="lpv-enrollment-card__footer">
                                                        <span className={`lpv-status-pill lpv-status-pill--${statusKey}`}>
                                                            {isCompleted ? 'Completed' : isDropped ? 'Dropped' : 'In Progress'}
                                                        </span>
                                                        <button
                                                            className="lpv-sor-link"
                                                            onClick={() => navigate(`/sor/${enrollment.enrollmentId}`)}
                                                        >
                                                            View SOR <ExternalLink size={11} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

/* ── Sub-components ─────────────────────────────────────────────────────── */

const ROField = ({
    label, value, icon,
}: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div className="lpv-field">
        <span className="lpv-field__label">{icon && icon}{label}</span>
        <span className={`lpv-field__value ${!value || value === 'N/A' ? 'lpv-field__value--empty' : ''}`}>
            {value || '—'}
        </span>
    </div>
);

const EditField = ({
    label, value, isEditing, onChange, icon, type = 'text',
}: {
    label: string; value?: string; isEditing: boolean;
    onChange: (val: string) => void; icon?: React.ReactNode; type?: string;
}) => (
    <div className="lpv-field">
        <span className="lpv-field__label">{icon && icon}{label}</span>
        {isEditing ? (
            <input
                type={type}
                className="lpv-input"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
            />
        ) : (
            <span className={`lpv-field__value ${!value ? 'lpv-field__value--empty' : ''}`}>
                {value || '—'}
            </span>
        )}
    </div>
);

const DocVaultLink = ({ label, url }: { label: string; url?: string | null }) => (
    <a
        href={url || '#'}
        target={url ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="lpv-doc-link-wrap"
    >
        <div className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
            <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
            {url
                ? <ExternalLink size={12} className="lpv-doc-link__icon" />
                : <AlertCircle size={12} className="lpv-doc-link__icon" />
            }
        </div>
    </a>
);