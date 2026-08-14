// src/pages/AdminDashboard/AccessManager/AccessManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    UserPlus, Search, Shield, ShieldCheck, User,
    Loader2, X, Layers, PenTool, GraduationCap, AlertTriangle
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import '../../../components/views/StaffView/StaffView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

const PRIVILEGE_OPTIONS = [
    { key: 'directory', title: 'Master Directory', desc: 'View and manage the global directory of all platform users.' },
    { key: 'learners', title: 'Course Enrollments', desc: 'Manage learner applications, enrollments, and academic records.' },
    { key: 'staff', title: 'Staff Management', desc: 'Provision and manage facilitators, assessors, and moderators.' },
    { key: 'attendance', title: 'Attendance Hub', desc: 'Monitor campus check-ins and workplace logbook entries.' },
    { key: 'workplaces', title: 'Workplaces & Employers', desc: 'Manage employer profiles and mentor assignments.' },
    { key: 'qualifications', title: 'Qualifications Builder', desc: 'Create and modify qualification templates and modules.' },
    { key: 'assessments', title: 'Assessment Engine', desc: 'Manage rubrics, moderation queues, and grading rules.' },
    { key: 'cohorts', title: 'Cohort Management', desc: 'Manage classes, assign educators, and oversee tracking.' },
    { key: 'ecosystem', title: 'Ecosystem & Events', desc: 'Manage external ecosystem events, sponsors, and campaigns.' },
    { key: 'studio', title: 'Certificate Studio', desc: 'Design templates and issue official certificates.' },
    { key: 'settings', title: 'System Settings', desc: 'Modify global platform configurations and API integrations.' }
] as const;

let adminCache: any[] | null = null;

export const AccessManager: React.FC = () => {
    const toast = useToast();
    const [admins, setAdmins] = useState<any[]>(adminCache || []);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [fetching, setFetching] = useState(!adminCache);

    const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [adminType, setAdminType] = useState<'admin' | 'assistant_admin'>('admin');
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    // Practitioner Capabilities (Marking & Facilitation Overrides)
    const [grantAssessorRights, setGrantAssessorRights] = useState(false);
    const [grantFacilitatorRights, setGrantFacilitatorRights] = useState(false);

    // 🚀 NEW: Explicit Marking Suspension / Audit Lock Flag
    const [isMarkingSuspended, setIsMarkingSuspended] = useState(false);

    const [privileges, setPrivileges] = useState({
        directory: false, learners: false, staff: false, attendance: false,
        workplaces: false, qualifications: false, assessments: false,
        cohorts: false, ecosystem: false, studio: false, settings: false
    });

    const [loading, setLoading] = useState(false);

    const fetchAdmins = async (forceRefetch = false) => {
        if (adminCache && !forceRefetch) return;

        setFetching(true);
        try {
            const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'assistant_admin']));
            const snapshot = await getDocs(q);
            const adminList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            adminCache = adminList;
            setAdmins(adminList);
        } catch (err) {
            console.error("Failed to fetch admins", err);
            toast.error("Failed to fetch administrator list from the database.");
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    const filteredAdmins = useMemo(() => {
        if (!searchTerm) return admins;
        const q = searchTerm.toLowerCase();
        return admins.filter(a =>
            a.fullName?.toLowerCase().includes(q) ||
            a.email?.toLowerCase().includes(q)
        );
    }, [admins, searchTerm]);

    const togglePrivilege = (key: keyof typeof privileges) => {
        setPrivileges(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleOpenCreate = () => {
        setEditingAdminId(null);
        setFullName('');
        setEmail('');
        setAdminType('admin');
        setIsSuperAdmin(false);
        setGrantAssessorRights(false);
        setGrantFacilitatorRights(false);
        setIsMarkingSuspended(false);
        setPrivileges({
            directory: false, learners: false, staff: false, attendance: false,
            workplaces: false, qualifications: false, assessments: false,
            cohorts: false, ecosystem: false, studio: false, settings: false
        });
        setShowModal(true);
    };

    const handleOpenEdit = (admin: any) => {
        setEditingAdminId(admin.id);
        setFullName(admin.fullName || '');
        setEmail(admin.email || '');
        setAdminType(admin.role || 'admin');
        setIsSuperAdmin(admin.isSuperAdmin || false);

        // Hydrate practitioner capabilities & marking suspension state
        const secondary = Array.isArray(admin.secondaryRoles) ? admin.secondaryRoles : [];
        setGrantAssessorRights(admin.canMarkAssessments === true || secondary.includes('assessor'));
        setGrantFacilitatorRights(admin.canFacilitateCohorts === true || secondary.includes('facilitator'));
        setIsMarkingSuspended(admin.isMarkingSuspended === true);

        setPrivileges({
            directory: admin.privileges?.directory || false,
            learners: admin.privileges?.learners || false,
            staff: admin.privileges?.staff || false,
            attendance: admin.privileges?.attendance || false,
            workplaces: admin.privileges?.workplaces || false,
            qualifications: admin.privileges?.qualifications || false,
            assessments: admin.privileges?.assessments || false,
            cohorts: admin.privileges?.cohorts || false,
            ecosystem: admin.privileges?.ecosystem || false,
            studio: admin.privileges?.studio || false,
            settings: admin.privileges?.settings || false
        });
        setShowModal(true);
    };

    const handleSaveAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const officialDomain = "@mlab.co.za";
        const isTestEmail = email.toLowerCase() === "moq66065@laoia.com" || email.toLowerCase() === "adlab@gmail.com";

        if (!email.toLowerCase().endsWith(officialDomain) && !isTestEmail) {
            toast.error(`Security Policy: Administrator accounts must use an official ${officialDomain} email address.`);
            setLoading(false);
            return;
        }

        try {
            const payloadIsSuper = adminType === 'admin' ? isSuperAdmin : false;
            const payloadPrivs = payloadIsSuper ? null : privileges;

            // Build Secondary Roles & Capabilities
            const secondaryRolesList: string[] = [];
            if (grantAssessorRights) secondaryRolesList.push('assessor');
            if (grantFacilitatorRights) secondaryRolesList.push('facilitator');

            const capabilitiesPayload = {
                secondaryRoles: secondaryRolesList,
                canMarkAssessments: grantAssessorRights && !isMarkingSuspended,
                canFacilitateCohorts: grantFacilitatorRights,
                isMarkingSuspended: isMarkingSuspended
            };

            if (editingAdminId) {
                const updatedData = {
                    fullName,
                    role: adminType,
                    isSuperAdmin: payloadIsSuper,
                    privileges: payloadPrivs,
                    ...capabilitiesPayload
                };
                await updateDoc(doc(db, 'users', editingAdminId), updatedData);
                toast.success(`Access rights & capabilities updated for ${fullName}.`);
            } else {
                const functions = getFunctions();
                const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

                await createStaffAccount({
                    email,
                    fullName,
                    role: adminType,
                    isSuperAdmin: payloadIsSuper,
                    privileges: payloadPrivs,
                    ...capabilitiesPayload
                });
                toast.success(`Success! An invitation email has been sent to ${email}.`);
            }

            adminCache = null;
            await fetchAdmins(true);
            setShowModal(false);

        } catch (err: any) {
            console.error("Error saving admin:", err);
            toast.error(err.message || "Failed to save account. Check permissions or network connection.");
        } finally {
            setLoading(false);
        }
    };

    const formatPrivileges = (admin: any) => {
        if (admin.isSuperAdmin) return "All Access (Super Admin)";
        if (!admin.privileges) return "None";

        const active = Object.entries(admin.privileges)
            .filter(([_, value]) => value === true)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));

        return active.length > 0 ? active.join(', ') : "None";
    };

    return (
        <div className="mlab-staff animate-fade-in">
            <div className="mlab-staff__header">
                <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={24} color="var(--mlab-green)" />
                    Platform Access Control
                </h2>
                <button className="mlab-btn mlab-btn--green" onClick={handleOpenCreate}>
                    <UserPlus size={16} /> Provision Admin
                </button>
            </div>

            <div className="mlab-staff__toolbar">
                <div className="mlab-search">
                    <Search size={17} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search administrators by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <p className="mlab-staff__count">
                Showing <strong>{filteredAdmins.length}</strong> administrators
            </p>

            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Administrator</th>
                            <th>Contact Info</th>
                            <th>Security Level</th>
                            <th>Practitioner Rights</th>
                            <th>Granular Privileges</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fetching ? (
                            <tr>
                                <td colSpan={6} className="mlab-table-empty">
                                    <div className="ap-fullscreen" style={{ position: 'relative', height: '150px' }}>
                                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '2rem' }}>
                                            <div className="ap-spinner" />
                                            <span style={{
                                                fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em',
                                                textTransform: 'uppercase', color: 'var(--mlab-grey)'
                                            }}>Loading Administrators...</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredAdmins.map(admin => {
                            const isSuspended = admin.isMarkingSuspended === true;
                            const hasAssessor = (admin.canMarkAssessments || admin.secondaryRoles?.includes('assessor')) && !isSuspended;
                            const hasFacilitator = admin.canFacilitateCohorts || admin.secondaryRoles?.includes('facilitator');

                            return (
                                <tr key={admin.id}>
                                    <td>
                                        <span className="mlab-staff-name">{admin.fullName}</span>
                                    </td>
                                    <td>
                                        <span className="mlab-contact">{admin.email}</span>
                                    </td>
                                    <td>
                                        {admin.isSuperAdmin ? (
                                            <span className="mlab-role-badge mlab-role-badge--assessor" style={{ borderColor: 'var(--mlab-red)', background: 'var(--mlab-red-light)', color: 'var(--mlab-red)' }}>
                                                <Shield size={12} /> Super Admin
                                            </span>
                                        ) : (
                                            <span className="mlab-role-badge mlab-role-badge--moderator">
                                                <span className="mlab-role-badge__dot" /> {admin.role === 'assistant_admin' ? 'Assistant Admin' : 'Primary Admin'}
                                            </span>
                                        )}
                                    </td>

                                    {/* 🚀 PRACTITIONER CAPABILITY BADGES (WITH SUSPENSION SUPPORT) */}
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {isSuspended && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fca5a5', width: 'fit-content' }}>
                                                    <AlertTriangle size={11} /> Marking Suspended
                                                </span>
                                            )}
                                            {hasAssessor && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bae6fd', width: 'fit-content' }}>
                                                    <PenTool size={11} /> Marking Rights
                                                </span>
                                            )}
                                            {hasFacilitator && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', width: 'fit-content' }}>
                                                    <GraduationCap size={11} /> Facilitator Rights
                                                </span>
                                            )}
                                            {!isSuspended && !hasAssessor && !hasFacilitator && (
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Admin Only</span>
                                            )}
                                        </div>
                                    </td>

                                    <td style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', lineHeight: '1.4', maxWidth: '260px' }}>
                                        {formatPrivileges(admin)}
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => handleOpenEdit(admin)}
                                            style={{ background: 'none', border: 'none', color: '#0ea5e9', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}
                                        >
                                            Edit Rights
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {!fetching && filteredAdmins.length === 0 && (
                            <tr>
                                <td colSpan={6} className="mlab-table-empty">
                                    <Shield size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-table-empty__title">No Administrators Found</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* PROVISION / EDIT MODAL */}
            {showModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UserPlus size={16} /> {editingAdminId ? 'Edit Access Rights' : 'Provision New Admin'}</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowModal(false)} disabled={loading}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdmin} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                            <div className="lfm-body">
                                <div>
                                    <div className="lfm-section-hdr"><User size={13} /> Administrator Details</div>
                                    <div className="lfm-grid">
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Full Legal Name *</label>
                                            <input className="lfm-input" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" />
                                        </div>
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Institution Email Address *</label>
                                            <input
                                                className="lfm-input"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="e.g. name@mlab.co.za"
                                                disabled={!!editingAdminId}
                                                style={{ opacity: editingAdminId ? 0.6 : 1, cursor: editingAdminId ? 'not-allowed' : 'text' }}
                                            />
                                            {editingAdminId && <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Email address cannot be changed after provisioning.</span>}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="lfm-section-hdr" style={{ marginTop: '1.5rem' }}><Shield size={13} /> Administrative Role</div>
                                    <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Account Role Level</label>
                                            <select className="lfm-input" value={adminType} onChange={(e) => setAdminType(e.target.value as any)}>
                                                <option value="admin">Primary Administrator</option>
                                                <option value="assistant_admin">Assistant Admin</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {adminType === 'admin' && (
                                    <div>
                                        <div className="lfm-section-hdr"><Shield size={13} /> Security Level</div>
                                        <div className="lfm-flags-panel" style={{ marginTop: 0, borderColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-border)', borderLeftColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)', background: isSuperAdmin ? 'var(--mlab-red-light)' : 'var(--mlab-light-blue)' }}>
                                            <label className="lfm-checkbox-row">
                                                <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
                                                <span style={{ fontWeight: 'bold', color: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Grant Super Admin Access</span>
                                            </label>
                                            <p style={{ margin: '0 0 0 25px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                Gives this user absolute control over the platform, overriding all granular privileges below.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Practitioner Capabilities Section */}
                                <div>
                                    <div className="lfm-section-hdr" style={{ marginTop: '1.5rem' }}>
                                        <PenTool size={13} /> Practitioner Capabilities
                                    </div>
                                    <div className="lfm-flags-panel" style={{ marginTop: 0, gap: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                        <label className="lfm-checkbox-row" style={{ alignItems: 'flex-start', padding: '0.5rem 0' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginTop: '2px' }}
                                                checked={grantAssessorRights}
                                                disabled={isMarkingSuspended}
                                                onChange={(e) => setGrantAssessorRights(e.target.checked)}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 'bold', color: isMarkingSuspended ? '#94a3b8' : '#0369a1' }}>Grant Assessor & Marking Rights</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: '1.4', marginTop: '2px' }}>
                                                    Allows this administrator to grade assessments, review portfolios, and issue official marks.
                                                </span>
                                            </div>
                                        </label>

                                        <label className="lfm-checkbox-row" style={{ alignItems: 'flex-start', padding: '0.5rem 0' }}>
                                            <input
                                                type="checkbox"
                                                style={{ marginTop: '2px' }}
                                                checked={grantFacilitatorRights}
                                                onChange={(e) => setGrantFacilitatorRights(e.target.checked)}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 'bold', color: '#15803d' }}>Grant Facilitator & Educator Rights</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: '1.4', marginTop: '2px' }}>
                                                    Allows this administrator to run live cohort sessions, log attendance, and manage module delivery.
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* 🚨 COMPLIANCE & AUDIT LOCK (MARKING SUSPENSION TOGGLE) */}
                                <div>
                                    <div className="lfm-section-hdr" style={{ marginTop: '1.5rem', color: '#b91c1c' }}>
                                        <AlertTriangle size={13} color="#b91c1c" /> Compliance & Audit Controls
                                    </div>
                                    <div className="lfm-flags-panel" style={{ marginTop: 0, borderColor: isMarkingSuspended ? '#ef4444' : '#cbd5e1', borderLeftColor: isMarkingSuspended ? '#dc2626' : '#94a3b8', background: isMarkingSuspended ? '#fef2f2' : '#f8fafc' }}>
                                        <label className="lfm-checkbox-row" style={{ cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={isMarkingSuspended}
                                                onChange={(e) => setIsMarkingSuspended(e.target.checked)}
                                                style={{ accentColor: '#ef4444' }}
                                            />
                                            <span style={{ fontWeight: 'bold', color: isMarkingSuspended ? '#dc2626' : '#334155' }}>
                                                Suspend Marking & Assessment Privileges (Audit Lock)
                                            </span>
                                        </label>
                                        <p style={{ margin: '4px 0 0 25px', fontSize: '0.78rem', color: '#7f1d1d', lineHeight: '1.4' }}>
                                            Immediately prevents this account from grading scripts, assigning marks, or signing off rubrics across all modules due to conflict of interest or audit review.
                                        </p>
                                    </div>
                                </div>

                                <div style={{ opacity: isSuperAdmin && adminType === 'admin' ? 0.4 : 1, pointerEvents: isSuperAdmin && adminType === 'admin' ? 'none' : 'auto', transition: '0.3s' }}>
                                    <div className="lfm-section-hdr" style={{ marginTop: '1.5rem' }}><Layers size={13} /> Granular Privileges</div>
                                    <div className="lfm-flags-panel" style={{ marginTop: 0, gap: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                        {PRIVILEGE_OPTIONS.map(priv => (
                                            <label key={priv.key} className="lfm-checkbox-row" style={{ alignItems: 'flex-start', padding: '0.5rem 0' }}>
                                                <input
                                                    type="checkbox"
                                                    style={{ marginTop: '2px' }}
                                                    checked={privileges[priv.key as keyof typeof privileges]}
                                                    onChange={() => togglePrivilege(priv.key as keyof typeof privileges)}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--mlab-midnight)' }}>{priv.title}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: '1.4', marginTop: '2px' }}>{priv.desc}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="lfm-footer">
                                <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowModal(false)} disabled={loading}>
                                    Cancel
                                </button>
                                <button type="submit" className="lfm-btn lfm-btn--primary" disabled={loading || !email.trim() || !fullName.trim()}>
                                    {loading ? <><Loader2 size={13} className="lfm-spin" /> Saving...</> : <><ShieldCheck size={13} /> {editingAdminId ? 'Save Changes' : 'Authorize Admin'}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};