// src/pages/AdminDashboard/AccessManager/AccessManager.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    UserPlus, Search, Shield, ShieldCheck, User,
    Loader2, X, Layers, PenTool, GraduationCap, AlertTriangle, Briefcase, Eye, Award, CheckSquare,
    ChevronDown, ChevronUp, Check, Mail, Clock, RotateCcw, Link2, Send, Copy
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import '../../../components/views/StaffView/StaffView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

const PRIVILEGE_OPTIONS = [
    { key: 'directory', title: 'Master Directory', desc: 'View and manage the global directory of all platform users.' },
    { key: 'learners', title: 'Course Enrollments', desc: 'Manage learner applications, enrollments, and academic records.' },
    { key: 'staff', title: 'Staff Management', desc: 'Provision and manage facilitators, assessors, and moderators.' },
    { key: 'attendance', title: 'Attendance Hub', desc: 'Monitor campus check-ins and workplace logbook entries.' },
    { key: 'workplaces', title: 'Workplaces & Employers', desc: 'Manage employer profiles, host SMEs, and logbook governance.' },
    { key: 'qualifications', title: 'Qualifications Builder', desc: 'Create and modify qualification templates and modules.' },
    { key: 'content', title: 'Content Studio', desc: 'Author learning units, video lessons, and interactive checks.' },
    { key: 'assessments', title: 'Assessment Engine', desc: 'Manage rubrics, moderation queues, and grading rules.' },
    { key: 'cohorts', title: 'Cohort Management', desc: 'Manage classes, assign educators, and oversee tracking.' },
    { key: 'ecosystem', title: 'Ecosystem & Events', desc: 'Manage external ecosystem events, sponsors, and campaigns.' },
    { key: 'studio', title: 'Certificate Studio', desc: 'Design templates and issue official certificates.' },
    { key: 'settings', title: 'System Settings', desc: 'Modify global platform configurations and API integrations.' }
] as const;

type AccountRoleType = 'admin' | 'assistant_admin' | 'seta_verifier' | 'qcto_auditor';

let adminCache: any[] | null = null;

export const AccessManager: React.FC = () => {
    const toast = useToast();
    const { cohorts: storeCohorts, fetchCohorts } = useStore() as any;

    const [admins, setAdmins] = useState<any[]>(adminCache || []);
    const [grantsMap, setGrantsMap] = useState<Record<string, any[]>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [fetching, setFetching] = useState(!adminCache);
    const [isResending, setIsResending] = useState<string | null>(null);

    // DUAL-MODE EXTEND ACCESS MODAL STATE
    const [extendingAuditor, setExtendingAuditor] = useState<any | null>(null);
    const [extendMode, setExtendMode] = useState<'same_link' | 'new_link'>('same_link');
    const [extendDurationMinutes, setExtendDurationMinutes] = useState<number>(120);
    const [isExtending, setIsExtending] = useState(false);

    const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [adminType, setAdminType] = useState<AccountRoleType>('admin');
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    // Practitioner Capabilities
    const [grantAssessorRights, setGrantAssessorRights] = useState(false);
    const [grantFacilitatorRights, setGrantFacilitatorRights] = useState(false);
    const [grantMentorRights, setGrantMentorRights] = useState(false);

    // AUDITOR SCOPED COHORTS STATE & SEARCH DROPDOWN CONTROL
    const [allowedCohortIds, setAllowedCohortIds] = useState<string[]>([]);
    const [cohortSearchQuery, setCohortSearchQuery] = useState('');
    const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);
    const cohortDropdownRef = useRef<HTMLDivElement>(null);

    // Explicit Marking Suspension
    const [isMarkingSuspended, setIsMarkingSuspended] = useState(false);

    const [privileges, setPrivileges] = useState({
        directory: false, learners: false, staff: false, attendance: false,
        workplaces: false, qualifications: false, content: false, assessments: false,
        cohorts: false, ecosystem: false, studio: false, settings: false
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!storeCohorts || storeCohorts.length === 0) {
            fetchCohorts();
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cohortDropdownRef.current && !cohortDropdownRef.current.contains(event.target as Node)) {
                setIsCohortDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchAdmins = async (forceRefetch = false) => {
        if (adminCache && !forceRefetch) return;

        setFetching(true);
        try {
            const q = query(
                collection(db, 'users'),
                where('role', 'in', ['admin', 'assistant_admin', 'seta_verifier', 'qcto_auditor'])
            );
            const snapshot = await getDocs(q);
            const adminList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const grantsQuery = query(collection(db, 'auditor_access_grants'));
            const grantsSnap = await getDocs(grantsQuery);
            const gMap: Record<string, any[]> = {};
            grantsSnap.docs.forEach(gDoc => {
                const gData: any = { id: gDoc.id, ...gDoc.data() };
                const gEmail = (gData.email || '').toLowerCase().trim();
                if (gEmail) {
                    if (!gMap[gEmail]) gMap[gEmail] = [];
                    gMap[gEmail].push(gData);
                }
            });

            adminCache = adminList;
            setAdmins(adminList);
            setGrantsMap(gMap);
        } catch (err) {
            console.error("Failed to fetch accounts", err);
            toast.error("Failed to fetch administrator and auditor list.");
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

    const searchedCohorts = useMemo(() => {
        if (!storeCohorts) return [];
        if (!cohortSearchQuery.trim()) return storeCohorts;
        const q = cohortSearchQuery.toLowerCase();
        return storeCohorts.filter((c: any) => c.name?.toLowerCase().includes(q));
    }, [storeCohorts, cohortSearchQuery]);

    const getAuditorGrantStatus = (auditorEmail: string) => {
        const clean = (auditorEmail || '').toLowerCase().trim();
        const grantsList = grantsMap[clean] || [];
        if (grantsList.length === 0) {
            return { status: 'none', label: 'Link Pending', isExtended: false, grantCount: 0, latestGrant: null };
        }

        const sorted = [...grantsList].sort((a, b) => {
            const timeA = new Date(a.expiresAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.expiresAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        const latest = sorted[0];
        const now = Date.now();
        const expiryMs = new Date(latest.expiresAt).getTime();
        const isValid = latest.isActive !== false && now < expiryMs;
        const isExtended = sorted.length > 1;

        let timeRemainingLabel = '';
        if (isValid) {
            const diffMin = Math.ceil((expiryMs - now) / (1000 * 60));
            if (diffMin > 60) {
                const hrs = Math.floor(diffMin / 60);
                const mins = diffMin % 60;
                timeRemainingLabel = `${hrs}h ${mins}m left`;
            } else {
                timeRemainingLabel = `${diffMin}m left`;
            }
        }

        return {
            status: isValid ? 'active' : 'expired',
            label: isValid ? `Active (${timeRemainingLabel})` : 'Link Expired',
            isExtended,
            grantCount: sorted.length,
            latestGrant: latest
        };
    };

    // COPY MAGIC LINK TO CLIPBOARD
    const handleCopyLink = async (adminUser: any) => {
        const auditorEmail = (adminUser.email || '').toLowerCase().trim();
        const grantInfo = getAuditorGrantStatus(auditorEmail);

        if (grantInfo.latestGrant?.id) {
            const magicUrl = `${window.location.origin}/audit-access/${grantInfo.latestGrant.id}`;
            try {
                await navigator.clipboard.writeText(magicUrl);
                if (grantInfo.status === 'expired') {
                    toast.error(`Link copied to clipboard, but note: this session is currently EXPIRED. Click 'Extend' to reactivate.`);
                } else {
                    toast.success(`Magic Link copied to clipboard for ${adminUser.fullName}!`);
                }
            } catch (err) {
                toast.error("Failed to copy link. Please copy manually.");
            }
        } else {
            toast.error("No active access link found. Click 'Resend' to issue a new Magic Link.");
        }
    };

    const togglePrivilege = (key: keyof typeof privileges) => {
        setPrivileges(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleCohortScope = (cohortId: string) => {
        setAllowedCohortIds(prev =>
            prev.includes(cohortId)
                ? prev.filter(id => id !== cohortId)
                : [...prev, cohortId]
        );
    };

    const removeCohortScope = (cohortId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setAllowedCohortIds(prev => prev.filter(id => id !== cohortId));
    };

    const handleOpenCreate = () => {
        setEditingAdminId(null);
        setFullName('');
        setEmail('');
        setAdminType('admin');
        setIsSuperAdmin(false);
        setGrantAssessorRights(false);
        setGrantFacilitatorRights(false);
        setGrantMentorRights(false);
        setIsMarkingSuspended(false);
        setAllowedCohortIds([]);
        setCohortSearchQuery('');
        setIsCohortDropdownOpen(false);
        setPrivileges({
            directory: false, learners: false, staff: false, attendance: false,
            workplaces: false, qualifications: false, content: false, assessments: false,
            cohorts: false, ecosystem: false, studio: false, settings: false
        });
        setShowModal(true);
    };

    const handleOpenEdit = (admin: any) => {
        const adminCohorts = Array.isArray(admin.allowedCohortIds) ? admin.allowedCohortIds : [];

        setEditingAdminId(admin.id);
        setFullName(admin.fullName || '');
        setEmail(admin.email || '');
        setAdminType(admin.role || 'admin');
        setIsSuperAdmin(admin.isSuperAdmin || false);
        setAllowedCohortIds(adminCohorts);
        setCohortSearchQuery('');
        setIsCohortDropdownOpen(false);

        const secondary = Array.isArray(admin.secondaryRoles) ? admin.secondaryRoles : [];
        setGrantAssessorRights(admin.canMarkAssessments === true || secondary.includes('assessor'));
        setGrantFacilitatorRights(admin.canFacilitateCohorts === true || secondary.includes('facilitator'));
        setGrantMentorRights(admin.isMentor === true || admin.canVerifyLogbooks === true || secondary.includes('mentor'));
        setIsMarkingSuspended(admin.isMarkingSuspended === true);

        setPrivileges({
            directory: admin.privileges?.directory || false,
            learners: admin.privileges?.learners || false,
            staff: admin.privileges?.staff || false,
            attendance: admin.privileges?.attendance || false,
            workplaces: admin.privileges?.workplaces || false,
            qualifications: admin.privileges?.qualifications || false,
            content: admin.privileges?.content || false,
            assessments: admin.privileges?.assessments || false,
            cohorts: admin.privileges?.cohorts || false,
            ecosystem: admin.privileges?.ecosystem || false,
            studio: admin.privileges?.studio || false,
            settings: admin.privileges?.settings || false
        });
        setShowModal(true);
    };

    // Resend Access Email
    const handleResendEmail = async (adminUser: any) => {
        setIsResending(adminUser.id);
        try {
            const functions = getFunctions();
            const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

            await createStaffAccount({
                email: adminUser.email,
                fullName: adminUser.fullName,
                role: adminUser.role,
                isSuperAdmin: adminUser.isSuperAdmin || false,
                privileges: adminUser.privileges || null,
                allowedCohortIds: adminUser.allowedCohortIds || [],
                durationMinutes: 360,
                secondaryRoles: adminUser.secondaryRoles || [],
                canMarkAssessments: adminUser.canMarkAssessments || false,
                canFacilitateCohorts: adminUser.canFacilitateCohorts || false,
                isMentor: adminUser.isMentor || false,
                canVerifyLogbooks: adminUser.canVerifyLogbooks || false,
                isMarkingSuspended: adminUser.isMarkingSuspended || false
            });

            toast.success(`Access email successfully resent to ${adminUser.email}`);
            await fetchAdmins(true);
        } catch (error: any) {
            console.error("Resend Error:", error);
            toast.error(error.message || "Failed to resend access email.");
        } finally {
            setIsResending(null);
        }
    };

    // DUAL-MODE EXTENSION HANDLER (SAME LINK vs NEW LINK)
    const handleConfirmExtendSession = async () => {
        if (!extendingAuditor) return;
        setIsExtending(true);

        try {
            const auditorEmail = extendingAuditor.email.toLowerCase().trim();
            const grantsList = grantsMap[auditorEmail] || [];
            const grantInfo = getAuditorGrantStatus(auditorEmail);

            if (extendMode === 'same_link' && grantInfo.latestGrant?.id) {
                // OPTION A: INSTANT EXTENSION ON SAME LINK
                const currentExpiryMs = new Date(grantInfo.latestGrant.expiresAt).getTime();
                const baseTime = currentExpiryMs > Date.now() ? currentExpiryMs : Date.now();
                const newExpiryIso = new Date(baseTime + extendDurationMinutes * 60 * 1000).toISOString();

                // Update ALL grant documents for this email so active token links get the updated scope & expiration
                await Promise.all(grantsList.map(g =>
                    updateDoc(doc(db, 'auditor_access_grants', g.id), {
                        expiresAt: newExpiryIso,
                        isActive: true,
                        durationMinutes: (grantInfo.latestGrant.durationMinutes || 0) + extendDurationMinutes,
                        allowedCohortIds: extendingAuditor.allowedCohortIds || [],
                        extendedAt: serverTimestamp()
                    })
                ));

                toast.success(`Access window extended for ${extendingAuditor.fullName}! They can keep using the same link.`);
            } else {
                // OPTION B: DISPATCH FRESH MAGIC LINK TO INBOX
                const functions = getFunctions();
                const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

                await createStaffAccount({
                    email: extendingAuditor.email,
                    fullName: extendingAuditor.fullName,
                    role: extendingAuditor.role,
                    allowedCohortIds: extendingAuditor.allowedCohortIds || [],
                    durationMinutes: extendDurationMinutes
                });

                toast.success(`New Magic Link dispatched to ${extendingAuditor.email}!`);
            }

            setExtendingAuditor(null);
            await fetchAdmins(true);
        } catch (err: any) {
            console.error("Failed to extend auditor duration:", err);
            toast.error("Failed to update access window.");
        } finally {
            setIsExtending(false);
        }
    };

    // SAVE ADMIN & SYNC ALL AUDITOR GRANTS IN FIRESTORE
    const handleSaveAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const officialDomain = "@mlab.co.za";
        const isAuditorRole = adminType === 'seta_verifier' || adminType === 'qcto_auditor';
        const cleanEmail = email.toLowerCase().trim();
        const isTestEmail = cleanEmail === "moq66065@laoia.com" || cleanEmail === "adlab@gmail.com";

        if (!isAuditorRole && !cleanEmail.endsWith(officialDomain) && !isTestEmail) {
            toast.error(`Security Policy: Internal administrator accounts must use an official ${officialDomain} email address.`);
            setLoading(false);
            return;
        }

        try {
            const payloadIsSuper = adminType === 'admin' ? isSuperAdmin : false;
            const payloadPrivs = payloadIsSuper ? null : privileges;

            const secondaryRolesList: string[] = [];
            if (grantAssessorRights) secondaryRolesList.push('assessor');
            if (grantFacilitatorRights) secondaryRolesList.push('facilitator');
            if (grantMentorRights) secondaryRolesList.push('mentor');

            const capabilitiesPayload = {
                secondaryRoles: secondaryRolesList,
                canMarkAssessments: grantAssessorRights && !isMarkingSuspended,
                canFacilitateCohorts: grantFacilitatorRights,
                isMentor: grantMentorRights,
                canVerifyLogbooks: grantMentorRights,
                isMarkingSuspended: isMarkingSuspended,
                allowedCohortIds: isAuditorRole ? allowedCohortIds : []
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

                // Sync updated cohort scope directly across ALL grant documents for this auditor email
                if (isAuditorRole) {
                    const grantsList = grantsMap[cleanEmail] || [];
                    await Promise.all(grantsList.map(g =>
                        updateDoc(doc(db, 'auditor_access_grants', g.id), {
                            allowedCohortIds: allowedCohortIds
                        })
                    ));
                }

                toast.success(`Access rights & cohort scope updated for ${fullName}.`);
            } else {
                const functions = getFunctions();
                const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

                await createStaffAccount({
                    email: cleanEmail,
                    fullName,
                    role: adminType,
                    isSuperAdmin: payloadIsSuper,
                    privileges: payloadPrivs,
                    ...capabilitiesPayload
                });
                toast.success(`Success! An invitation email has been sent to ${cleanEmail}.`);
            }

            adminCache = null;
            await fetchAdmins(true);
            setShowModal(false);

        } catch (err: any) {
            console.error("Error saving account:", err);
            toast.error(err.message || "Failed to save account.");
        } finally {
            setLoading(false);
        }
    };

    const formatPrivileges = (admin: any) => {
        if (admin.isSuperAdmin) return "All Access (Super Admin)";
        if (admin.role === 'seta_verifier' || admin.role === 'qcto_auditor') {
            const count = Array.isArray(admin.allowedCohortIds) ? admin.allowedCohortIds.length : 0;
            return count > 0
                ? `Scoped Auditor Access (${count} Assigned Cohort${count === 1 ? '' : 's'})`
                : "Auditor Access (All Cohorts View)";
        }
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
                    <UserPlus size={16} /> Provision User
                </button>
            </div>

            <div className="mlab-staff__toolbar">
                <div className="mlab-search">
                    <Search size={17} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search administrators or auditors by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <p className="mlab-staff__count">
                Showing <strong>{filteredAdmins.length}</strong> administrative and compliance accounts
            </p>

            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>User Details</th>
                            <th>Contact Info</th>
                            <th>Security Level / Status</th>
                            <th>Practitioner Rights</th>
                            <th>Granular Privileges / Scope</th>
                            <th style={{ textAlign: 'right', paddingRight: '20px' }}>Actions</th>
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
                                            }}>Loading Accounts...</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredAdmins.map(admin => {
                            const isSuspended = admin.isMarkingSuspended === true;
                            const hasAssessor = (admin.canMarkAssessments || admin.secondaryRoles?.includes('assessor')) && !isSuspended;
                            const hasFacilitator = admin.canFacilitateCohorts || admin.secondaryRoles?.includes('facilitator');
                            const hasMentor = admin.isMentor || admin.canVerifyLogbooks || admin.secondaryRoles?.includes('mentor');
                            const isAuditor = admin.role === 'seta_verifier' || admin.role === 'qcto_auditor';

                            return (
                                <tr key={admin.id}>
                                    <td>
                                        <span className="mlab-staff-name">{admin.fullName}</span>
                                    </td>
                                    <td>
                                        <span className="mlab-contact">{admin.email}</span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {admin.isSuperAdmin ? (
                                                <span className="mlab-role-badge mlab-role-badge--assessor" style={{ borderColor: 'var(--mlab-red)', background: 'var(--mlab-red-light)', color: 'var(--mlab-red)' }}>
                                                    <Shield size={12} /> Super Admin
                                                </span>
                                            ) : admin.role === 'seta_verifier' ? (
                                                <span className="mlab-role-badge" style={{ borderColor: '#0284c7', background: '#e0f2fe', color: '#0369a1' }}>
                                                    <Eye size={12} /> SETA Verifier
                                                </span>
                                            ) : admin.role === 'qcto_auditor' ? (
                                                <span className="mlab-role-badge" style={{ borderColor: '#16a34a', background: '#dcfce7', color: '#15803d' }}>
                                                    <Award size={12} /> QCTO Assurer
                                                </span>
                                            ) : (
                                                <span className="mlab-role-badge mlab-role-badge--moderator">
                                                    <span className="mlab-role-badge__dot" /> {admin.role === 'assistant_admin' ? 'Assistant Admin' : 'Primary Admin'}
                                                </span>
                                            )}

                                            {/* AUDITOR ACCESS STATUS & EXTENSION INDICATORS */}
                                            {isAuditor && (() => {
                                                const grantInfo = getAuditorGrantStatus(admin.email);
                                                return (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                                        {grantInfo.status === 'active' && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                                                <Clock size={11} /> {grantInfo.label}
                                                            </span>
                                                        )}
                                                        {grantInfo.status === 'expired' && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 800, color: '#b91c1c', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                                                                <AlertTriangle size={11} /> Expired
                                                            </span>
                                                        )}
                                                        {grantInfo.status === 'none' && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                                                <Clock size={11} /> Link Pending
                                                            </span>
                                                        )}
                                                        {grantInfo.isExtended && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fcd34d' }}>
                                                                <RotateCcw size={10} /> Extended ({grantInfo.grantCount - 1}x)
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </td>

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
                                            {hasMentor && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', color: '#7c3aed', background: '#f3e8ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #ddd6fe', width: 'fit-content' }}>
                                                    <Briefcase size={11} /> Mentor Rights
                                                </span>
                                            )}
                                            {!isSuspended && !hasAssessor && !hasFacilitator && !hasMentor && (
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                                    {isAuditor ? 'External Auditor' : 'Admin Only'}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', lineHeight: '1.4', maxWidth: '260px' }}>
                                        {formatPrivileges(admin)}
                                    </td>

                                    <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleOpenEdit(admin)}
                                                style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}
                                            >
                                                <PenTool size={12} /> Edit
                                            </button>

                                            {/* COPY LINK BUTTON FOR AUDITOR ACCOUNTS */}
                                            {isAuditor && (
                                                <button
                                                    onClick={() => handleCopyLink(admin)}
                                                    style={{ background: '#f3e8ff', border: '1px solid #ddd6fe', color: '#7c3aed', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}
                                                    title="Copy Magic Link to Clipboard"
                                                >
                                                    <Copy size={12} /> Copy Link
                                                </button>
                                            )}

                                            {/* EXTEND BUTTON FOR AUDITOR ACCOUNTS */}
                                            {isAuditor && (
                                                <button
                                                    onClick={() => {
                                                        setExtendingAuditor(admin);
                                                        setExtendMode('same_link');
                                                        setExtendDurationMinutes(120);
                                                    }}
                                                    style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#b45309', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}
                                                >
                                                    <Clock size={12} /> Extend
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleResendEmail(admin)}
                                                disabled={isResending === admin.id}
                                                style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '6px 10px', borderRadius: '4px', cursor: isResending === admin.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: isResending === admin.id ? 0.6 : 1 }}
                                            >
                                                {isResending === admin.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Resend
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {!fetching && filteredAdmins.length === 0 && (
                            <tr>
                                <td colSpan={6} className="mlab-table-empty">
                                    <Shield size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-table-empty__title">No Accounts Found</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* DUAL-MODE MODAL: EXTEND ACCESS DURATION FOR AUDITOR */}
            {extendingAuditor && createPortal(
                <div className="lfm-overlay" onClick={() => setExtendingAuditor(null)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
                        <div className="lfm-header" style={{ background: '#0f172a', borderBottom: '3px solid #f59e0b' }}>
                            <h2 className="lfm-header__title" style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="#f59e0b" /> Extend Inspection Access Window
                            </h2>
                            <button className="lfm-close-btn" onClick={() => setExtendingAuditor(null)} style={{ color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="lfm-body" style={{ gap: '16px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}>
                                <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Auditor: {extendingAuditor.fullName}</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Email: {extendingAuditor.email}</div>
                            </div>

                            {/* RADIO BUTTON SELECTOR: SAME LINK VS NEW LINK */}
                            <div className="lfm-fg lfm-fg--full">
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                                    Extension Method *
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                        padding: '12px 14px',
                                        borderRadius: '6px',
                                        border: `1px solid ${extendMode === 'same_link' ? '#f59e0b' : '#cbd5e1'}`,
                                        background: extendMode === 'same_link' ? '#fffbeb' : '#ffffff',
                                        cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="extendMode"
                                            value="same_link"
                                            checked={extendMode === 'same_link'}
                                            onChange={() => setExtendMode('same_link')}
                                            style={{ marginTop: '3px', accentColor: '#d97706' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Link2 size={14} color="#d97706" /> Extend Existing Link (Instant — No New Email)
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                Pushes expiry time forward on the active token. Auditor simply hits refresh on their current screen.
                                            </div>
                                        </div>
                                    </label>

                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                        padding: '12px 14px',
                                        borderRadius: '6px',
                                        border: `1px solid ${extendMode === 'new_link' ? '#16a34a' : '#cbd5e1'}`,
                                        background: extendMode === 'new_link' ? '#f0fdf4' : '#ffffff',
                                        cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="extendMode"
                                            value="new_link"
                                            checked={extendMode === 'new_link'}
                                            onChange={() => setExtendMode('new_link')}
                                            style={{ marginTop: '3px', accentColor: '#16a34a' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Send size={14} color="#16a34a" /> Issue &amp; Email New Magic Link
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                Generates a brand-new access token grant and dispatches a fresh Mailgun email.
                                            </div>
                                        </div>
                                    </label>

                                </div>
                            </div>

                            {/* DURATION SELECTOR */}
                            <div className="lfm-fg lfm-fg--full">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                    Additional / Refreshed Time Window *
                                </label>
                                <select
                                    className="lfm-input"
                                    value={extendDurationMinutes}
                                    onChange={e => setExtendDurationMinutes(Number(e.target.value))}
                                    style={{ fontWeight: 'bold', color: extendMode === 'same_link' ? '#b45309' : '#15803d' }}
                                >
                                    <option value={30}>+ 30 Minutes (Quick Spot-Check Extension)</option>
                                    <option value={60}>+ 1 Hour Extension</option>
                                    <option value={120}>+ 2 Hours Extension</option>
                                    <option value={180}>+ 3 Hours Extension</option>
                                    <option value={240}>+ 4 Hours (Half-Day Audit)</option>
                                    <option value={360}>+ 6 Hours (Full-Day Verification Visit)</option>
                                </select>
                            </div>
                        </div>

                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setExtendingAuditor(null)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--primary"
                                onClick={handleConfirmExtendSession}
                                disabled={isExtending}
                                style={{ background: extendMode === 'same_link' ? '#d97706' : '#16a34a', color: 'white', border: 'none' }}
                            >
                                {isExtending ? (
                                    <><Loader2 size={14} className="animate-spin" /> Updating Access...</>
                                ) : extendMode === 'same_link' ? (
                                    <><Clock size={14} /> Extend Current Session Instantly</>
                                ) : (
                                    <><Send size={14} /> Issue &amp; Dispatch New Link</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* PROVISION / EDIT MODAL */}
            {showModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UserPlus size={16} /> {editingAdminId ? 'Edit Access Rights' : 'Provision Platform Account'}</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowModal(false)} disabled={loading}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdmin} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                            <div className="lfm-body">
                                <div>
                                    <div className="lfm-section-hdr"><User size={13} /> Account Details</div>
                                    <div className="lfm-grid">
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Full Legal Name *</label>
                                            <input className="lfm-input" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" />
                                        </div>
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Email Address *</label>
                                            <input
                                                className="lfm-input"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder={adminType === 'seta_verifier' || adminType === 'qcto_auditor' ? "e.g. inspector@qcto.org.za or auditor@gmail.com" : "e.g. name@mlab.co.za"}
                                                disabled={!!editingAdminId}
                                                style={{ opacity: editingAdminId ? 0.6 : 1, cursor: editingAdminId ? 'not-allowed' : 'text' }}
                                            />
                                            {adminType !== 'seta_verifier' && adminType !== 'qcto_auditor' && (
                                                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                                                    Internal admin accounts require an official @mlab.co.za email domain.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="lfm-section-hdr" style={{ marginTop: '1.5rem' }}><Shield size={13} /> Role &amp; Permission Tier</div>
                                    <div className="lfm-grid" style={{ marginBottom: '1rem' }}>
                                        <div className="lfm-fg lfm-fg--full">
                                            <label>Account Role Level</label>
                                            <select className="lfm-input" value={adminType} onChange={(e) => setAdminType(e.target.value as any)}>
                                                <option value="admin">Primary Administrator (@mlab.co.za strictly required)</option>
                                                <option value="assistant_admin">Assistant Admin (@mlab.co.za strictly required)</option>
                                                <option value="seta_verifier">SETA Verifier (External - Any Domain Allowed)</option>
                                                <option value="qcto_auditor">QCTO Quality Assurer (External - Any Domain Allowed)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* SEARCHABLE MULTI-SELECT DROPDOWN FOR SCOPED COHORT ACCESS */}
                                {(adminType === 'seta_verifier' || adminType === 'qcto_auditor') && (
                                    <div>
                                        <div className="lfm-section-hdr" style={{ marginTop: '1.5rem', color: '#0284c7' }}>
                                            <CheckSquare size={13} color="#0284c7" /> Scoped Cohort Access
                                        </div>
                                        <div className="lfm-flags-panel" style={{ marginTop: 0, background: '#f0f9ff', borderColor: '#bae6fd' }}>
                                            <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#0369a1', fontWeight: 'bold' }}>
                                                Select the specific cohort(s) this auditor is authorized to inspect. Leaving all unselected grants access to all cohorts.
                                            </p>

                                            {/* SELECTED COHORT BADGES */}
                                            {allowedCohortIds.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                                    {allowedCohortIds.map(cId => {
                                                        const cohortObj = storeCohorts?.find((c: any) => c.id === cId);
                                                        return (
                                                            <span
                                                                key={cId}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    background: '#0284c7',
                                                                    color: 'white',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                }}
                                                            >
                                                                {cohortObj?.name || cId}
                                                                <X
                                                                    size={12}
                                                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                                                    onClick={(e) => removeCohortScope(cId, e)}
                                                                />
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* DROPDOWN CONTAINER */}
                                            <div ref={cohortDropdownRef} style={{ position: 'relative' }}>
                                                <div
                                                    onClick={() => setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                                                    style={{
                                                        background: 'white',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '4px',
                                                        padding: '10px 12px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        fontSize: '0.85rem',
                                                        color: allowedCohortIds.length > 0 ? '#0f172a' : '#64748b',
                                                        fontWeight: allowedCohortIds.length > 0 ? 700 : 'normal'
                                                    }}
                                                >
                                                    <span>
                                                        {allowedCohortIds.length === 0
                                                            ? 'Click to select / search cohorts...'
                                                            : `${allowedCohortIds.length} Cohort${allowedCohortIds.length === 1 ? '' : 's'} Selected`}
                                                    </span>
                                                    {isCohortDropdownOpen ? <ChevronUp size={16} color="#0284c7" /> : <ChevronDown size={16} color="#64748b" />}
                                                </div>

                                                {/* POPUP DROPDOWN PANEL WITH LIVE SEARCH */}
                                                {isCohortDropdownOpen && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        marginTop: '4px',
                                                        background: 'white',
                                                        border: '1px solid #0284c7',
                                                        borderRadius: '4px',
                                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                        zIndex: 100,
                                                        maxHeight: '220px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        overflow: 'hidden'
                                                    }}>
                                                        {/* SEARCH INPUT */}
                                                        <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Search size={14} color="#94a3b8" />
                                                            <input
                                                                type="text"
                                                                placeholder="Search cohorts by name..."
                                                                value={cohortSearchQuery}
                                                                onChange={(e) => setCohortSearchQuery(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{
                                                                    border: 'none',
                                                                    outline: 'none',
                                                                    background: 'transparent',
                                                                    fontSize: '0.8rem',
                                                                    width: '100%',
                                                                    color: '#0f172a'
                                                                }}
                                                            />
                                                            {cohortSearchQuery && (
                                                                <X
                                                                    size={12}
                                                                    color="#94a3b8"
                                                                    style={{ cursor: 'pointer' }}
                                                                    onClick={(e) => { e.stopPropagation(); setCohortSearchQuery(''); }}
                                                                />
                                                            )}
                                                        </div>

                                                        {/* COHORT CHECKBOX LIST */}
                                                        <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
                                                            {searchedCohorts.length === 0 ? (
                                                                <div style={{ padding: '12px', fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
                                                                    No cohorts match "{cohortSearchQuery}"
                                                                </div>
                                                            ) : (
                                                                searchedCohorts.map((c: any) => {
                                                                    const isSelected = allowedCohortIds.includes(c.id);
                                                                    return (
                                                                        <div
                                                                            key={c.id}
                                                                            onClick={(e) => { e.stopPropagation(); toggleCohortScope(c.id); }}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                padding: '8px 10px',
                                                                                fontSize: '0.8rem',
                                                                                cursor: 'pointer',
                                                                                borderRadius: '4px',
                                                                                background: isSelected ? '#f0f9ff' : 'transparent',
                                                                                color: isSelected ? '#0369a1' : '#334155',
                                                                                fontWeight: isSelected ? 700 : 500
                                                                            }}
                                                                        >
                                                                            <span>{c.name}</span>
                                                                            {isSelected && <Check size={14} color="#0284c7" />}
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {adminType === 'admin' && (
                                    <div>
                                        <div className="lfm-section-hdr"><Shield size={13} /> Security Level</div>
                                        <div className="lfm-flags-panel" style={{ marginTop: 0, borderColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-border)', borderLeftColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)', background: isSuperAdmin ? 'var(--mlab-red-light)' : 'var(--mlab-light-blue)' }}>
                                            <label className="lfm-checkbox-row">
                                                <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
                                                <span style={{ fontWeight: 'bold', color: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Grant Super Admin Access</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {(adminType === 'admin' || adminType === 'assistant_admin') && (
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
                                                    <span style={{ fontWeight: 'bold', color: isMarkingSuspended ? '#94a3b8' : '#0369a1' }}>Grant Assessor &amp; Marking Rights</span>
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
                                                    <span style={{ fontWeight: 'bold', color: '#15803d' }}>Grant Facilitator &amp; Educator Rights</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* GRANULAR PRIVILEGES CHECKLIST */}
                                {(adminType === 'admin' || adminType === 'assistant_admin') && (
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
                                )}

                            </div>

                            <div className="lfm-footer">
                                <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowModal(false)} disabled={loading}>
                                    Cancel
                                </button>
                                <button type="submit" className="lfm-btn lfm-btn--primary" disabled={loading || !email.trim() || !fullName.trim()}>
                                    {loading ? <><Loader2 size={13} className="lfm-spin" /> Saving...</> : <><ShieldCheck size={13} /> {editingAdminId ? 'Save Changes' : 'Authorize Account'}</>}
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