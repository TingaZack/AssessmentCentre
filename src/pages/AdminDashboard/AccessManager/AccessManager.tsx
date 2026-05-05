// src/pages/AdminDashboard/AccessManager/AccessManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    UserPlus, Search, Shield, ShieldCheck, User,
    Loader2, AlertCircle, CheckCircle2, X, Layers
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import '../../../components/views/StaffView/StaffView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

const PRIVILEGE_OPTIONS = [
    { key: 'users', title: 'User & Staff Management', desc: 'Create, edit, and archive learners and staff members.' },
    { key: 'curriculum', title: 'Curriculum Builder', desc: 'Create and modify qualification templates and modules.' },
    { key: 'cohorts', title: 'Cohort Management', desc: 'Manage classes, assign educators, and oversee tracking.' },
    { key: 'certificates', title: 'Certificate Studio', desc: 'Design templates and issue official certificates.' },
    { key: 'settings', title: 'System Settings', desc: 'Modify global platform configurations and API integrations.' }
] as const;

// 🚀 GLOBAL CACHE: Survives tab switching so it never spins twice!
let adminCache: any[] | null = null;

export const AccessManager: React.FC = () => {
    // --- STATE ---
    const [admins, setAdmins] = useState<any[]>(adminCache || []);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [fetching, setFetching] = useState(!adminCache); // Only spin if cache is empty

    // Form State
    const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    // Privileges
    const [privileges, setPrivileges] = useState({
        users: false, curriculum: false, cohorts: false, certificates: false, settings: false
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // --- FETCH ADMINS ---
    const fetchAdmins = async (forceRefetch = false) => {
        if (adminCache && !forceRefetch) return; // Skip if already loaded

        setFetching(true);
        try {
            const q = query(collection(db, 'users'), where('role', '==', 'admin'));
            const snapshot = await getDocs(q);
            const adminList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            adminCache = adminList; // Save to memory cache
            setAdmins(adminList);
        } catch (err) {
            console.error("Failed to fetch admins", err);
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    // --- FILTERING ---
    const filteredAdmins = useMemo(() => {
        if (!searchTerm) return admins;
        const q = searchTerm.toLowerCase();
        return admins.filter(a =>
            a.fullName?.toLowerCase().includes(q) ||
            a.email?.toLowerCase().includes(q)
        );
    }, [admins, searchTerm]);

    // --- HANDLERS ---
    const togglePrivilege = (key: keyof typeof privileges) => {
        setPrivileges(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleOpenCreate = () => {
        setEditingAdminId(null);
        setFullName('');
        setEmail('');
        setIsSuperAdmin(false);
        setPrivileges({ users: false, curriculum: false, cohorts: false, certificates: false, settings: false });
        setShowModal(true);
    };

    const handleOpenEdit = (admin: any) => {
        setEditingAdminId(admin.id);
        setFullName(admin.fullName || '');
        setEmail(admin.email || '');
        setIsSuperAdmin(admin.isSuperAdmin || false);
        setPrivileges({
            users: admin.privileges?.users || false,
            curriculum: admin.privileges?.curriculum || false,
            cohorts: admin.privileges?.cohorts || false,
            certificates: admin.privileges?.certificates || false,
            settings: admin.privileges?.settings || false
        });
        setShowModal(true);
    };

    const handleSaveAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        const officialDomain = "@mlab.co.za";
<<<<<<< HEAD
        // const isTestEmail = email.toLowerCase() === "adlab@gmail.com";
        const isTestEmail = email.toLowerCase() === "moq66065@laoia.com";
=======
        const isTestEmail = email.toLowerCase() === "adlab@gmail.com";
>>>>>>> dc5e6e85f7da2b5cc456794fff55bafa22f23d7c

        if (!email.toLowerCase().endsWith(officialDomain) && !isTestEmail) {
            setError(`Security Policy: Administrator accounts must use an official ${officialDomain} email address.`);
            setLoading(false);
            return;
        }

        try {
            if (editingAdminId) {
                await updateDoc(doc(db, 'users', editingAdminId), {
                    fullName,
                    isSuperAdmin,
                    privileges: isSuperAdmin ? null : privileges
                });
                setSuccess(`Success! Privileges updated for ${fullName}.`);
            } else {
                const functions = getFunctions();
                const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

                await createStaffAccount({
                    email, fullName, role: 'admin', isSuperAdmin, privileges: isSuperAdmin ? null : privileges
                });
                setSuccess(`Success! An invitation email has been sent to ${email}.`);
            }

            await fetchAdmins(true); // Force refetch to get the updated list

            setTimeout(() => {
                setShowModal(false);
                setSuccess(null);
            }, 2000);

        } catch (err: any) {
            console.error("Error saving admin:", err);
            setError(err.message || "Failed to save account. Check console.");
        } finally {
            setLoading(false);
        }
    };

    const formatPrivileges = (admin: any) => {
        if (admin.isSuperAdmin) return "All Access";
        if (!admin.privileges) return "None";

        const active = Object.entries(admin.privileges)
            .filter(([_, value]) => value === true)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));

        return active.length > 0 ? active.join(', ') : "None";
    };

    return (
        <div className="mlab-staff animate-fade-in">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="mlab-staff__header">
                <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={24} color="var(--mlab-green)" />
                    Platform Access Control
                </h2>
                <button className="mlab-btn mlab-btn--green" onClick={handleOpenCreate}>
                    <UserPlus size={16} /> Provision Admin
                </button>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────── */}
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

            {/* ── Result Count ────────────────────────────────────────────── */}
            <p className="mlab-staff__count">
                Showing <strong>{filteredAdmins.length}</strong> administrators
            </p>

            {/* ── Data Table ──────────────────────────────────────────────── */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Administrator</th>
                            <th>Contact Info</th>
                            <th>Security Level</th>
                            <th>Granular Privileges</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fetching ? (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
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
                        ) : filteredAdmins.map(admin => (
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
                                            <span className="mlab-role-badge__dot" /> Standard
                                        </span>
                                    )}
                                </td>
                                <td style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>
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
                        ))}

                        {!fetching && filteredAdmins.length === 0 && (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
                                    <Shield size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-table-empty__title">No Administrators Found</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>

                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UserPlus size={16} /> {editingAdminId ? 'Edit Access Rights' : 'Provision New Admin'}</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowModal(false)} disabled={loading}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdmin} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                            <div className="lfm-body">

                                {error && (
                                    <div className="lfm-error-banner">
                                        <AlertCircle size={16} /><span>{error}</span>
                                    </div>
                                )}
                                {success && (
                                    <div className="lfm-error-banner" style={{ background: 'var(--mlab-light-green)', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}>
                                        <CheckCircle2 size={16} color="var(--mlab-green-dark)" /><span>{success}</span>
                                    </div>
                                )}

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

                                <div style={{ opacity: isSuperAdmin ? 0.4 : 1, pointerEvents: isSuperAdmin ? 'none' : 'auto', transition: '0.3s' }}>
                                    <div className="lfm-section-hdr"><Layers size={13} /> Granular Privileges</div>

                                    <div className="lfm-flags-panel" style={{ marginTop: 0, gap: '1rem' }}>
                                        {PRIVILEGE_OPTIONS.map(priv => (
                                            <label key={priv.key} className="lfm-checkbox-row" style={{ alignItems: 'flex-start' }}>
                                                <input
                                                    type="checkbox"
                                                    style={{ marginTop: '2px' }}
                                                    checked={privileges[priv.key as keyof typeof privileges]}
                                                    onChange={() => togglePrivilege(priv.key as keyof typeof privileges)}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{priv.title}</span>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)' }}>{priv.desc}</span>
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


// // src/pages/AdminDashboard/AccessManager/AccessManager.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     UserPlus, Search, Shield, ShieldCheck, User,
//     Loader2, AlertCircle, CheckCircle2, X, Layers
// } from 'lucide-react';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import '../../../components/views/StaffView/StaffView.css';
// import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// const PRIVILEGE_OPTIONS = [
//     { key: 'users', title: 'User & Staff Management', desc: 'Create, edit, and archive learners and staff members.' },
//     { key: 'curriculum', title: 'Curriculum Builder', desc: 'Create and modify qualification templates and modules.' },
//     { key: 'cohorts', title: 'Cohort Management', desc: 'Manage classes, assign educators, and oversee tracking.' },
//     { key: 'certificates', title: 'Certificate Studio', desc: 'Design templates and issue official certificates.' },
//     { key: 'settings', title: 'System Settings', desc: 'Modify global platform configurations and API integrations.' }
// ] as const;

// export const AccessManager: React.FC = () => {
//     // --- STATE ---
//     const [admins, setAdmins] = useState<any[]>([]);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [showModal, setShowModal] = useState(false);
//     const [fetching, setFetching] = useState(true);

//     // Form State
//     const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
//     const [fullName, setFullName] = useState('');
//     const [email, setEmail] = useState('');
//     const [isSuperAdmin, setIsSuperAdmin] = useState(false);

//     // Privileges
//     const [privileges, setPrivileges] = useState({
//         users: false,
//         curriculum: false,
//         cohorts: false,
//         certificates: false,
//         settings: false
//     });

//     const [loading, setLoading] = useState(false);
//     const [error, setError] = useState<string | null>(null);
//     const [success, setSuccess] = useState<string | null>(null);

//     // --- FETCH ADMINS ---
//     const fetchAdmins = async () => {
//         setFetching(true);
//         try {
//             const q = query(collection(db, 'users'), where('role', '==', 'admin'));
//             const snapshot = await getDocs(q);
//             const adminList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             setAdmins(adminList);
//         } catch (err) {
//             console.error("Failed to fetch admins", err);
//         } finally {
//             setFetching(false);
//         }
//     };

//     useEffect(() => {
//         fetchAdmins();
//     }, []);

//     // --- FILTERING ---
//     const filteredAdmins = useMemo(() => {
//         if (!searchTerm) return admins;
//         const q = searchTerm.toLowerCase();
//         return admins.filter(a =>
//             a.fullName?.toLowerCase().includes(q) ||
//             a.email?.toLowerCase().includes(q)
//         );
//     }, [admins, searchTerm]);

//     // --- HANDLERS ---
//     const togglePrivilege = (key: keyof typeof privileges) => {
//         setPrivileges(prev => ({ ...prev, [key]: !prev[key] }));
//     };

//     const handleOpenCreate = () => {
//         setEditingAdminId(null);
//         setFullName('');
//         setEmail('');
//         setIsSuperAdmin(false);
//         setPrivileges({ users: false, curriculum: false, cohorts: false, certificates: false, settings: false });
//         setShowModal(true);
//     };

//     const handleOpenEdit = (admin: any) => {
//         setEditingAdminId(admin.id);
//         setFullName(admin.fullName || '');
//         setEmail(admin.email || '');
//         setIsSuperAdmin(admin.isSuperAdmin || false);
//         setPrivileges({
//             users: admin.privileges?.users || false,
//             curriculum: admin.privileges?.curriculum || false,
//             cohorts: admin.privileges?.cohorts || false,
//             certificates: admin.privileges?.certificates || false,
//             settings: admin.privileges?.settings || false
//         });
//         setShowModal(true);
//     };

//     const handleSaveAdmin = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setLoading(true);
//         setError(null);
//         setSuccess(null);

//         const officialDomain = "@mlab.co.za";
//         const isTestEmail = email.toLowerCase() === "adlab@gmail.com"; // ALLOW TEST EMAIL( to be removed later on)

//         if (!email.toLowerCase().endsWith(officialDomain) && !isTestEmail) {
//             setError(`Security Policy: Administrator accounts must use an official ${officialDomain} email address.`);
//             setLoading(false);
//             return;
//         }

//         try {
//             if (editingAdminId) {
//                 // UPDATE EXISTING ADMIN IN FIRESTORE
//                 await updateDoc(doc(db, 'users', editingAdminId), {
//                     fullName,
//                     isSuperAdmin,
//                     privileges: isSuperAdmin ? null : privileges
//                 });
//                 setSuccess(`Success! Privileges updated for ${fullName}.`);
//             } else {
//                 // CREATE NEW ADMIN VIA CLOUD FUNCTION
//                 const functions = getFunctions();
//                 const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

//                 await createStaffAccount({
//                     email,
//                     fullName,
//                     role: 'admin',
//                     isSuperAdmin,
//                     privileges: isSuperAdmin ? null : privileges
//                 });
//                 setSuccess(`Success! An invitation email has been sent to ${email}.`);
//             }

//             await fetchAdmins();

//             setTimeout(() => {
//                 setShowModal(false);
//                 setSuccess(null);
//             }, 2000);

//         } catch (err: any) {
//             console.error("Error saving admin:", err);
//             setError(err.message || "Failed to save account. Check console.");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const formatPrivileges = (admin: any) => {
//         if (admin.isSuperAdmin) return "All Access";
//         if (!admin.privileges) return "None";

//         const active = Object.entries(admin.privileges)
//             .filter(([_, value]) => value === true)
//             .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));

//         return active.length > 0 ? active.join(', ') : "None";
//     };

//     return (
//         <div className="mlab-staff animate-fade-in">
//             {/* ── Header ─────────────────────────────────────────────────── */}
//             <div className="mlab-staff__header">
//                 <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                     <ShieldCheck size={24} color="var(--mlab-green)" />
//                     Platform Access Control
//                 </h2>
//                 <button className="mlab-btn mlab-btn--green" onClick={handleOpenCreate}>
//                     <UserPlus size={16} /> Provision Admin
//                 </button>
//             </div>

//             {/* ── Toolbar ────────────────────────────────────────────────── */}
//             <div className="mlab-staff__toolbar">
//                 <div className="mlab-search">
//                     <Search size={17} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search administrators by name or email..."
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>
//             </div>

//             {/* ── Result Count ────────────────────────────────────────────── */}
//             <p className="mlab-staff__count">
//                 Showing <strong>{filteredAdmins.length}</strong> administrators
//             </p>

//             {/* ── Data Table ──────────────────────────────────────────────── */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Administrator</th>
//                             <th>Contact Info</th>
//                             <th>Security Level</th>
//                             <th>Granular Privileges</th>
//                             <th>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {fetching ? (
//                             <tr>
//                                 <td colSpan={5} className="mlab-table-empty">
//                                     <div className="ap-fullscreen" style={{ position: 'relative', height: '150px' }}>
//                                         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '2rem' }}>
//                                             <div className="ap-spinner" />
//                                             <span style={{
//                                                 fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em',
//                                                 textTransform: 'uppercase', color: 'var(--mlab-grey)'
//                                             }}>Loading Administrators...</span>
//                                         </div>
//                                     </div>
//                                 </td>
//                             </tr>
//                         ) : filteredAdmins.map(admin => (
//                             <tr key={admin.id}>
//                                 <td>
//                                     <span className="mlab-staff-name">{admin.fullName}</span>
//                                 </td>
//                                 <td>
//                                     <span className="mlab-contact">{admin.email}</span>
//                                 </td>
//                                 <td>
//                                     {admin.isSuperAdmin ? (
//                                         <span className="mlab-role-badge mlab-role-badge--assessor" style={{ borderColor: 'var(--mlab-red)', background: 'var(--mlab-red-light)', color: 'var(--mlab-red)' }}>
//                                             <Shield size={12} /> Super Admin
//                                         </span>
//                                     ) : (
//                                         <span className="mlab-role-badge mlab-role-badge--moderator">
//                                             <span className="mlab-role-badge__dot" /> Standard
//                                         </span>
//                                     )}
//                                 </td>
//                                 <td style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem' }}>
//                                     {formatPrivileges(admin)}
//                                 </td>
//                                 <td>
//                                     {/* TRIGGER EDIT MODE HERE */}
//                                     <button
//                                         onClick={() => handleOpenEdit(admin)}
//                                         style={{ background: 'none', border: 'none', color: '#0ea5e9', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}
//                                     >
//                                         Edit Rights
//                                     </button>
//                                 </td>
//                             </tr>
//                         ))}

//                         {!fetching && filteredAdmins.length === 0 && (
//                             <tr>
//                                 <td colSpan={5} className="mlab-table-empty">
//                                     <Shield size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                                     <span className="mlab-table-empty__title">No Administrators Found</span>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* MODAL MOVED TO REACT PORTAL TO ESCAPE CSS TRAPS */}
//             {showModal && createPortal(
//                 <div className="lfm-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 9999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>

//                         <div className="lfm-header">
//                             {/* Dynamic Title based on Edit or Create Mode */}
//                             <h2 className="lfm-header__title"><UserPlus size={16} /> {editingAdminId ? 'Edit Access Rights' : 'Provision New Admin'}</h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setShowModal(false)} disabled={loading}>
//                                 <X size={20} />
//                             </button>
//                         </div>

//                         <form onSubmit={handleSaveAdmin} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
//                             <div className="lfm-body">

//                                 {error && (
//                                     <div className="lfm-error-banner">
//                                         <AlertCircle size={16} /><span>{error}</span>
//                                     </div>
//                                 )}
//                                 {success && (
//                                     <div className="lfm-error-banner" style={{ background: 'var(--mlab-light-green)', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}>
//                                         <CheckCircle2 size={16} color="var(--mlab-green-dark)" /><span>{success}</span>
//                                     </div>
//                                 )}

//                                 {/* Admin Details */}
//                                 <div>
//                                     <div className="lfm-section-hdr"><User size={13} /> Administrator Details</div>
//                                     <div className="lfm-grid">
//                                         <div className="lfm-fg lfm-fg--full">
//                                             <label>Full Legal Name *</label>
//                                             <input className="lfm-input" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" />
//                                         </div>
//                                         <div className="lfm-fg lfm-fg--full">
//                                             <label>Institution Email Address *</label>
//                                             {/* Lock the email field if we are editing an existing user */}
//                                             <input
//                                                 className="lfm-input"
//                                                 type="email"
//                                                 required
//                                                 value={email}
//                                                 onChange={(e) => setEmail(e.target.value)}
//                                                 placeholder="e.g. name@mlab.co.za"
//                                                 disabled={!!editingAdminId}
//                                                 style={{ opacity: editingAdminId ? 0.6 : 1, cursor: editingAdminId ? 'not-allowed' : 'text' }}
//                                             />
//                                             {editingAdminId && <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Email address cannot be changed after provisioning.</span>}
//                                         </div>
//                                     </div>
//                                 </div>

//                                 {/* Security Level */}
//                                 <div>
//                                     <div className="lfm-section-hdr"><Shield size={13} /> Security Level</div>
//                                     <div className="lfm-flags-panel" style={{ marginTop: 0, borderColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-border)', borderLeftColor: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)', background: isSuperAdmin ? 'var(--mlab-red-light)' : 'var(--mlab-light-blue)' }}>
//                                         <label className="lfm-checkbox-row">
//                                             <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
//                                             <span style={{ fontWeight: 'bold', color: isSuperAdmin ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Grant Super Admin Access</span>
//                                         </label>
//                                         <p style={{ margin: '0 0 0 25px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
//                                             Gives this user absolute control over the platform, overriding all granular privileges below.
//                                         </p>
//                                     </div>
//                                 </div>

//                                 {/* Granular Privileges */}
//                                 <div style={{ opacity: isSuperAdmin ? 0.4 : 1, pointerEvents: isSuperAdmin ? 'none' : 'auto', transition: '0.3s' }}>
//                                     <div className="lfm-section-hdr"><Layers size={13} /> Granular Privileges</div>

//                                     <div className="lfm-flags-panel" style={{ marginTop: 0, gap: '1rem' }}>
//                                         {PRIVILEGE_OPTIONS.map(priv => (
//                                             <label key={priv.key} className="lfm-checkbox-row" style={{ alignItems: 'flex-start' }}>
//                                                 <input
//                                                     type="checkbox"
//                                                     style={{ marginTop: '2px' }}
//                                                     checked={privileges[priv.key as keyof typeof privileges]}
//                                                     onChange={() => togglePrivilege(priv.key as keyof typeof privileges)}
//                                                 />
//                                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                     <span style={{ fontWeight: 'bold' }}>{priv.title}</span>
//                                                     <span style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)' }}>{priv.desc}</span>
//                                                 </div>
//                                             </label>
//                                         ))}
//                                     </div>
//                                 </div>

//                             </div>

//                             <div className="lfm-footer">
//                                 <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowModal(false)} disabled={loading}>
//                                     Cancel
//                                 </button>
//                                 <button type="submit" className="lfm-btn lfm-btn--primary" disabled={loading || !email.trim() || !fullName.trim()}>
//                                     {loading ? <><Loader2 size={13} className="lfm-spin" /> Saving...</> : <><ShieldCheck size={13} /> {editingAdminId ? 'Save Changes' : 'Authorize Admin'}</>}
//                                 </button>
//                             </div>
//                         </form>

//                     </div>
//                 </div>,
//                 document.body
//             )}
//         </div>
//     );
// };