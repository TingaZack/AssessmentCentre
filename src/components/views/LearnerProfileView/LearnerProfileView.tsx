// src/components/admin/LearnerProfileView/LearnerProfileView.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    User, Mail, Phone, FileText, Edit3, Save, X,
    Fingerprint, GraduationCap, AlertCircle, Loader2,
    BookOpen, Calendar, CheckCircle, Users,
    ExternalLink, History, Code, TrendingUp, ChevronDown, ChevronUp, Plus, Clock, Award
} from 'lucide-react';
import type { DashboardLearner } from '../../../types';
import './LearnerProfileView.css';
import { useStore } from '../../../store/useStore';
import { PageHeader, type HeaderTheme } from '../../common/PageHeader/PageHeader';
import { Sidebar } from '../../dashboard/Sidebar/Sidebar';

/* ─── SKILL PROGRESSION TYPES ──────────────────────────────────────────────── */

export type CompetencyLevel = 'Novice' | 'Intermediate' | 'Advanced' | 'Expert';

export interface SkillHistoryLog {
    level: CompetencyLevel;
    updatedAt: string;
    updatedByName?: string;
    note?: string;
}

export interface SkillItemWithTimeline {
    id: string;
    name: string;
    category?: string;
    initialLevel: CompetencyLevel;
    currentLevel: CompetencyLevel;
    history?: SkillHistoryLog[];
}

const LEVEL_WEIGHTS: Record<CompetencyLevel, number> = {
    Novice: 25,
    Intermediate: 50,
    Advanced: 75,
    Expert: 100
};

const LEVEL_ORDER: CompetencyLevel[] = ['Novice', 'Intermediate', 'Advanced', 'Expert'];

export const LearnerProfileView: React.FC = () => {
    const { learnerId } = useParams<{ learnerId: string }>();
    const navigate = useNavigate();

    const { user, learners, cohorts, learnersLoading, fetchLearners, fetchCohorts, updateLearner } = useStore();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<DashboardLearner & { skills: SkillItemWithTimeline[] }>>({});

    const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillInitial, setNewSkillInitial] = useState<CompetencyLevel>('Novice');
    const [newSkillCurrent, setNewSkillCurrent] = useState<CompetencyLevel>('Novice');
    const [showAddSkillForm, setShowAddSkillForm] = useState(false);

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
                skills: (profile as any)?.skills || [
                    {
                        id: 'sk_1',
                        name: 'React / Frontend Development',
                        category: 'Software Engineering',
                        initialLevel: 'Novice',
                        currentLevel: 'Advanced',
                        history: [
                            { level: 'Novice', updatedAt: '2025-10-15T08:00:00.000Z', note: 'Baseline assessment upon enrollment' },
                            { level: 'Intermediate', updatedAt: '2026-02-10T10:30:00.000Z', note: 'Passed Formative Practical Assessment' },
                            { level: 'Advanced', updatedAt: '2026-08-20T14:15:00.000Z', note: 'Completed Workplace Internship Project' }
                        ]
                    },
                    {
                        id: 'sk_2',
                        name: 'TypeScript',
                        category: 'Languages',
                        initialLevel: 'Novice',
                        currentLevel: 'Intermediate',
                        history: [
                            { level: 'Novice', updatedAt: '2025-10-15T08:00:00.000Z', note: 'Baseline assessment' },
                            { level: 'Intermediate', updatedAt: '2026-04-05T09:00:00.000Z', note: 'Mid-term code evaluation' }
                        ]
                    }
                ],
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

    const update = (field: keyof (DashboardLearner & { skills: SkillItemWithTimeline[] }), val: any) =>
        setFormData(prev => ({ ...prev, [field]: val }));

    const handleAddSkill = () => {
        if (!newSkillName.trim()) return;
        const newSkill: SkillItemWithTimeline = {
            id: `sk_${Date.now()}`,
            name: newSkillName.trim(),
            category: 'Technical Competency',
            initialLevel: newSkillInitial,
            currentLevel: newSkillCurrent,
            history: [
                { level: newSkillInitial, updatedAt: new Date().toISOString(), note: 'Initial skill baseline logged' },
                ...(newSkillInitial !== newSkillCurrent ? [{ level: newSkillCurrent, updatedAt: new Date().toISOString(), note: 'Current updated level' }] : [])
            ]
        };

        const updatedSkills = [...(formData.skills || []), newSkill];
        update('skills', updatedSkills);
        setNewSkillName('');
        setShowAddSkillForm(false);
    };

    const handleUpdateSkillCurrentLevel = (skillId: string, nextLevel: CompetencyLevel) => {
        const updatedSkills = (formData.skills || []).map(skill => {
            if (skill.id !== skillId) return skill;
            const history = skill.history || [];
            return {
                ...skill,
                currentLevel: nextLevel,
                history: [
                    ...history,
                    {
                        level: nextLevel,
                        updatedAt: new Date().toISOString(),
                        updatedByName: user?.fullName || 'Assessor',
                        note: `Upgraded proficiency to ${nextLevel}`
                    }
                ]
            };
        });
        update('skills', updatedSkills);
    };

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

                                {/* ── Technical Skills & Progression Timeline ── */}
                                <section className="lpv-panel">
                                    <div className="lpv-panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 className="lpv-panel__title">
                                            <Code size={15} /> Technical Competencies &amp; Growth Timeline
                                        </h3>
                                        {isEditing && (
                                            <button
                                                className="lpv-btn lpv-btn--primary"
                                                style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                                                onClick={() => setShowAddSkillForm(true)}
                                            >
                                                <Plus size={12} /> Add Skill
                                            </button>
                                        )}
                                    </div>

                                    {/* Modal / Form to Add Skill */}
                                    {showAddSkillForm && (
                                        <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>Add New Skill Baseline</div>
                                            <input
                                                type="text"
                                                placeholder="Skill Name (e.g. Node.js, Python, Figma)"
                                                value={newSkillName}
                                                onChange={e => setNewSkillName(e.target.value)}
                                                style={{ padding: '6px 8px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                            />
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', display: 'block' }}>Initial Level (Onboard)</label>
                                                    <select value={newSkillInitial} onChange={e => setNewSkillInitial(e.target.value as CompetencyLevel)} style={{ width: '100%', padding: '6px', fontSize: '0.8rem', border: '1px solid #cbd5e1' }}>
                                                        {LEVEL_ORDER.map(l => <option key={l} value={l}>{l}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', display: 'block' }}>Current Level</label>
                                                    <select value={newSkillCurrent} onChange={e => setNewSkillCurrent(e.target.value as CompetencyLevel)} style={{ width: '100%', padding: '6px', fontSize: '0.8rem', border: '1px solid #cbd5e1' }}>
                                                        {LEVEL_ORDER.map(l => <option key={l} value={l}>{l}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                                <button onClick={() => setShowAddSkillForm(false)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>Cancel</button>
                                                <button onClick={handleAddSkill} style={{ padding: '4px 12px', fontSize: '0.75rem', background: 'var(--mlab-blue)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Add Skill</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Skills List with Growth Trackers */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                                        {(formData.skills || []).length === 0 ? (
                                            <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                No technical skills or timeline markers logged for this student.
                                            </div>
                                        ) : (
                                            (formData.skills || []).map(skill => {
                                                const initialWeight = LEVEL_WEIGHTS[skill.initialLevel] || 25;
                                                const currentWeight = LEVEL_WEIGHTS[skill.currentLevel] || 25;
                                                const growth = currentWeight - initialWeight;
                                                const isExpanded = expandedSkillId === skill.id;

                                                return (
                                                    <div key={skill.id} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '0', transition: 'all 0.2s' }}>

                                                        {/* Skill Card Header */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                            <div>
                                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--mlab-midnight)' }}>
                                                                    {skill.name}
                                                                </h4>
                                                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                                                    {skill.category || 'Technical Skill'}
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {/* Growth Badge */}
                                                                {growth > 0 ? (
                                                                    <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <TrendingUp size={12} /> +{growth}% Growth
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px' }}>
                                                                        Baseline Maintained
                                                                    </span>
                                                                )}

                                                                {/* Expand Timeline Toggle */}
                                                                <button
                                                                    onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                                                                >
                                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Dual Layer Progress Bar */}
                                                        <div style={{ marginTop: '10px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                                <span>Started: <strong style={{ color: '#64748b' }}>{skill.initialLevel}</strong></span>
                                                                <span>Current: <strong style={{ color: 'var(--mlab-blue)' }}>{skill.currentLevel}</strong></span>
                                                            </div>

                                                            <div style={{ position: 'relative', width: '100%', height: '10px', background: '#e2e8f0', overflow: 'hidden' }}>
                                                                {/* Layer 1: Baseline Initial Level (Muted) */}
                                                                <div
                                                                    style={{
                                                                        position: 'absolute', top: 0, left: 0, bottom: 0,
                                                                        width: `${initialWeight}%`,
                                                                        background: '#94a3b8',
                                                                        opacity: 0.6
                                                                    }}
                                                                    title={`Started at ${skill.initialLevel}`}
                                                                />
                                                                {/* Layer 2: Current Level Overlay (Vibrant Growth) */}
                                                                <div
                                                                    style={{
                                                                        position: 'absolute', top: 0, left: 0, bottom: 0,
                                                                        width: `${currentWeight}%`,
                                                                        background: growth > 0 ? 'var(--mlab-green)' : 'var(--mlab-blue)',
                                                                        transition: 'width 0.6s ease'
                                                                    }}
                                                                    title={`Current level: ${skill.currentLevel}`}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Quick Level Update Dropdown (Only in Edit Mode) */}
                                                        {isEditing && (
                                                            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Promote Skill Competency:</span>
                                                                <select
                                                                    value={skill.currentLevel}
                                                                    onChange={e => handleUpdateSkillCurrentLevel(skill.id, e.target.value as CompetencyLevel)}
                                                                    style={{ padding: '2px 8px', fontSize: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, color: 'var(--mlab-blue)' }}
                                                                >
                                                                    {LEVEL_ORDER.map((lvl, indx) => <option key={indx} value={lvl}>{lvl}</option>)}
                                                                </select>
                                                            </div>
                                                        )}

                                                        {/* EXPANDABLE TIMELINE DRAWER */}
                                                        {isExpanded && (
                                                            <div className="animate-fade-in" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', background: '#fafbfc', padding: '10px' }}>
                                                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Clock size={12} color="var(--mlab-blue)" /> Historical Milestone Logs
                                                                </div>

                                                                {(skill.history || []).length === 0 ? (
                                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No historical milestone updates recorded yet.</div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {skill.history?.map((log, lIdx) => (
                                                                            <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem', color: '#334155', background: 'white', padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                                                                                <Award size={14} color="var(--mlab-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                                                <div style={{ flex: 1 }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                        <strong style={{ color: 'var(--mlab-midnight)' }}>{log.level}</strong>
                                                                                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{new Date(log.updatedAt).toLocaleDateString()}</span>
                                                                                    </div>
                                                                                    {log.note && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>{log.note}</div>}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
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