// src/pages/LearnerPortal/LearnerProfileView/LearnerProfileView.tsx


import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, MapPin, ShieldCheck,
    FileText, Edit3, Save, X, Fingerprint,
    GraduationCap, AlertCircle, Info, Loader2, Camera
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './LearnerProfileView.css';
import { storage } from '../../../../lib/firebase';

interface ProfileProps {
    profile: any;
    user: any;
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({ ...profile });

    // Photo Upload States
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.profilePhotoUrl || null);

    // Sync preview if profile prop updates
    useEffect(() => {
        if (profile?.profilePhotoUrl && !profilePhoto) {
            setPhotoPreview(profile.profilePhotoUrl);
            setFormData((prev: any) => ({ ...prev, profilePhotoUrl: profile.profilePhotoUrl }));
        }
    }, [profile]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file)); // Show local preview instantly
        }
    };

    const handleFileUpload = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    const handleSave = async () => {
        if (!profile?.id) return;
        setSaving(true);
        try {
            let finalPhotoUrl = formData.profilePhotoUrl;

            // ✅ Upload new photo if selected
            if (profilePhoto && user?.uid) {
                const ext = profilePhoto.name.split('.').pop();
                finalPhotoUrl = await handleFileUpload(profilePhoto, `learners/${user.uid}/profile_${Date.now()}.${ext}`);
            }

            const updatedData = { ...formData, profilePhotoUrl: finalPhotoUrl };
            await onUpdate(profile.id, updatedData);

            setIsEditing(false);
            setProfilePhoto(null); // Reset file state after successful save
        } catch (error) {
            console.error('Update failed', error);
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: string) =>
        setFormData((prev: any) => ({ ...prev, [field]: val }));

    const isVerified = profile?.profileCompleted;

    return (
        <div className="lpv-wrapper animate-fade-in">

            {/* ── Compliance Status Banner ──────────────────────────────── */}
            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck
                    size={22}
                    className="lpv-banner__icon"
                    color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
                />
                <div>
                    <span className="lpv-banner__title">
                        NLRD Verification: {isVerified ? 'Verified & Compliant' : 'Pending Verification'}
                    </span>
                    <p className="lpv-banner__desc">
                        {isVerified
                            ? 'Your profile meets all QCTO regulatory requirements.'
                            : 'Some compliance documents or details are still being verified.'}
                    </p>
                </div>
            </div>

            {/* ── Two-column layout ─────────────────────────────────────── */}
            <div className="lpv-layout">

                {/* ── Main Stack ────────────────────────────────────────── */}
                <div className="lpv-main-stack">

                    {/* Identity & Demographics */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title">
                                <User size={16} /> Identity &amp; Demographics
                            </h3>
                            <button
                                className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`}
                                onClick={() => {
                                    setIsEditing(!isEditing);
                                    if (isEditing) {
                                        // Reset photo preview if cancelling
                                        setPhotoPreview(profile?.profilePhotoUrl || null);
                                        setProfilePhoto(null);
                                    }
                                }}
                            >
                                {isEditing
                                    ? <><X size={13} /> Cancel</>
                                    : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        {/* PROFILE PHOTO AREA */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={36} color="#94a3b8" />
                                    )}
                                </div>
                                {isEditing && (
                                    <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-blue)', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}>
                                        <Camera size={14} />
                                        <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{profile?.fullName || 'Learner'}</h4>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                                    {isEditing ? 'Click the camera icon to update your photo.' : 'Student Profile'}
                                </p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <ROField label="Full Legal Name" value={profile?.fullName} icon={<User size={13} />} />
                            <ROField label="National ID Number" value={profile?.idNumber} icon={<Fingerprint size={13} />} />
                            <EditField
                                label="Contact Number" value={formData?.phone}
                                icon={<Phone size={13} />} isEditing={isEditing}
                                onChange={val => update('phone', val)}
                            />
                            <EditField
                                label="Email Address" value={formData?.email}
                                icon={<Mail size={13} />} isEditing={isEditing}
                                onChange={val => update('email', val)}
                            />
                        </div>

                        <div className="lpv-divider" />

                        <div className="lpv-grid-3">
                            <ROField label="Equity Group" value={profile?.equity} />
                            <ROField label="Gender" value={profile?.gender} />
                            <ROField label="Nationality" value={profile?.nationality || 'South African'} />
                        </div>
                    </section>

                    {/* Address & Next of Kin */}
                    <section className="lpv-panel">
                        <h3 className="lpv-panel__title lpv-panel__title--simple">
                            <MapPin size={16} /> Address &amp; Emergency Contact
                        </h3>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <EditField
                                label="Residential Address" value={formData?.streetAddress}
                                isEditing={isEditing}
                                onChange={val => update('streetAddress', val)}
                            />
                        </div>

                        <div className="lpv-grid-3">
                            <ROField label="City" value={profile?.city} />
                            <ROField label="Province" value={profile?.province} />
                            <ROField label="Postal Code" value={profile?.postalCode} />
                        </div>

                        <div className="lpv-divider" />

                        <div className="lpv-grid-3">
                            <EditField label="Next of Kin" value={formData?.nokName} isEditing={isEditing} onChange={val => update('nokName', val)} />
                            <EditField label="Relationship" value={formData?.nokRelationship} isEditing={isEditing} onChange={val => update('nokRelationship', val)} />
                            <EditField label="NOK Phone" value={formData?.nokPhone} isEditing={isEditing} onChange={val => update('nokPhone', val)} />
                        </div>
                    </section>
                </div>

                {/* ── Aside ─────────────────────────────────────────────── */}
                <aside className="lpv-aside">

                    {/* Qualification Card */}
                    <div className="lpv-qual-card">
                        <div className="lpv-qual-card__label">
                            <GraduationCap size={13} /> Current Qualification
                        </div>
                        <p className="lpv-qual-card__name">
                            {profile?.qualification?.name || 'Unassigned'}
                        </p>
                        <span className="lpv-qual-card__saqa">
                            SAQA ID: {profile?.qualification?.saqaId || '—'}
                        </span>
                    </div>

                    {/* Compliance Vault */}
                    <div className="lpv-vault-card">
                        <h4 className="lpv-vault-card__title">
                            <FileText size={15} /> Compliance Vault
                        </h4>
                        <div className="lpv-vault-links">
                            <DocVaultLink label="Certified ID Copy" url={profile?.documents?.idUrl} />
                            <DocVaultLink label="Highest Qualification" url={profile?.documents?.qualUrl} />
                            <DocVaultLink label="Updated CV" url={profile?.documents?.cvUrl} />
                        </div>
                    </div>

                    {/* Save Button — only while editing */}
                    {isEditing && (
                        <button
                            className="lpv-save-btn"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving
                                ? <><Loader2 size={16} className="lpv-spin" /> Saving…</>
                                : <><Save size={16} /> Confirm Changes</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* ── Helper Components ─────────────────────────────────────────────────────── */

const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div>
        <div className="lpv-field__label">{icon}{label}</div>
        <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
            {value || '—'}
        </div>
    </div>
);

const EditField = ({
    label, value, isEditing, onChange, icon
}: {
    label: string; value?: string; isEditing: boolean;
    onChange: (val: string) => void; icon?: React.ReactNode;
}) => (
    <div>
        <div className="lpv-field__label">{icon}{label}</div>
        {isEditing ? (
            <input
                type="text"
                className="lpv-input"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
            />
        ) : (
            <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
                {value || '—'}
            </div>
        )}
    </div>
);

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a
        href={url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}
    >
        <span className="lpv-doc-link__name">
            <FileText size={13} /> {label}
        </span>
        {url
            ? <Info size={13} color="var(--mlab-blue)" />
            : <AlertCircle size={13} />}
    </a>
);


// import React, { useState } from 'react';
// import {
//     User, Mail, Phone, MapPin, ShieldCheck,
//     FileText, Edit3, Save, X, Fingerprint,
//     GraduationCap, AlertCircle, Info, Loader2
// } from 'lucide-react';
// import './LearnerProfileView.css';

// interface ProfileProps {
//     profile: any;
//     user: any;
//     onUpdate: (id: string, updates: any) => Promise<void>;
// }

// export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
//     const [isEditing, setIsEditing] = useState(false);
//     const [saving, setSaving] = useState(false);
//     const [formData, setFormData] = useState({ ...profile });

//     const handleSave = async () => {
//         if (!profile?.id) return;
//         setSaving(true);
//         try {
//             await onUpdate(profile.id, formData);
//             setIsEditing(false);
//         } catch (error) {
//             console.error('Update failed', error);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: string) =>
//         setFormData((prev: any) => ({ ...prev, [field]: val }));

//     const isVerified = profile?.profileCompleted;

//     return (
//         <div className="lpv-wrapper animate-fade-in">

//             {/* ── Compliance Status Banner ──────────────────────────────── */}
//             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
//                 <ShieldCheck
//                     size={22}
//                     className="lpv-banner__icon"
//                     color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
//                 />
//                 <div>
//                     <span className="lpv-banner__title">
//                         NLRD Verification: {isVerified ? 'Verified & Compliant' : 'Pending Verification'}
//                     </span>
//                     <p className="lpv-banner__desc">
//                         {isVerified
//                             ? 'Your profile meets all QCTO regulatory requirements.'
//                             : 'Some compliance documents or details are still being verified.'}
//                     </p>
//                 </div>
//             </div>

//             {/* ── Two-column layout ─────────────────────────────────────── */}
//             <div className="lpv-layout">

//                 {/* ── Main Stack ────────────────────────────────────────── */}
//                 <div className="lpv-main-stack">

//                     {/* Identity & Demographics */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title">
//                                 <User size={16} /> Identity &amp; Demographics
//                             </h3>
//                             <button
//                                 className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`}
//                                 onClick={() => setIsEditing(!isEditing)}
//                             >
//                                 {isEditing
//                                     ? <><X size={13} /> Cancel</>
//                                     : <><Edit3 size={13} /> Edit Contact</>}
//                             </button>
//                         </div>

//                         <div className="lpv-grid-2">
//                             <ROField label="Full Legal Name" value={profile?.fullName} icon={<User size={13} />} />
//                             <ROField label="National ID Number" value={profile?.idNumber} icon={<Fingerprint size={13} />} />
//                             <EditField
//                                 label="Contact Number" value={formData?.phone}
//                                 icon={<Phone size={13} />} isEditing={isEditing}
//                                 onChange={val => update('phone', val)}
//                             />
//                             <EditField
//                                 label="Email Address" value={formData?.email}
//                                 icon={<Mail size={13} />} isEditing={isEditing}
//                                 onChange={val => update('email', val)}
//                             />
//                         </div>

//                         <div className="lpv-divider" />

//                         <div className="lpv-grid-3">
//                             <ROField label="Equity Group" value={profile?.equity} />
//                             <ROField label="Gender" value={profile?.gender} />
//                             <ROField label="Nationality" value={profile?.nationality || 'South African'} />
//                         </div>
//                     </section>

//                     {/* Address & Next of Kin */}
//                     <section className="lpv-panel">
//                         <h3 className="lpv-panel__title lpv-panel__title--simple">
//                             <MapPin size={16} /> Address &amp; Emergency Contact
//                         </h3>

//                         <div style={{ marginBottom: '1.25rem' }}>
//                             <EditField
//                                 label="Residential Address" value={formData?.streetAddress}
//                                 isEditing={isEditing}
//                                 onChange={val => update('streetAddress', val)}
//                             />
//                         </div>

//                         <div className="lpv-grid-3">
//                             <ROField label="City" value={profile?.city} />
//                             <ROField label="Province" value={profile?.province} />
//                             <ROField label="Postal Code" value={profile?.postalCode} />
//                         </div>

//                         <div className="lpv-divider" />

//                         <div className="lpv-grid-3">
//                             <EditField label="Next of Kin" value={formData?.nokName} isEditing={isEditing} onChange={val => update('nokName', val)} />
//                             <EditField label="Relationship" value={formData?.nokRelationship} isEditing={isEditing} onChange={val => update('nokRelationship', val)} />
//                             <EditField label="NOK Phone" value={formData?.nokPhone} isEditing={isEditing} onChange={val => update('nokPhone', val)} />
//                         </div>
//                     </section>
//                 </div>

//                 {/* ── Aside ─────────────────────────────────────────────── */}
//                 <aside className="lpv-aside">

//                     {/* Qualification Card */}
//                     <div className="lpv-qual-card">
//                         <div className="lpv-qual-card__label">
//                             <GraduationCap size={13} /> Current Qualification
//                         </div>
//                         <p className="lpv-qual-card__name">
//                             {profile?.qualification?.name || 'Unassigned'}
//                         </p>
//                         <span className="lpv-qual-card__saqa">
//                             SAQA ID: {profile?.qualification?.saqaId || '—'}
//                         </span>
//                     </div>

//                     {/* Compliance Vault */}
//                     <div className="lpv-vault-card">
//                         <h4 className="lpv-vault-card__title">
//                             <FileText size={15} /> Compliance Vault
//                         </h4>
//                         <div className="lpv-vault-links">
//                             <DocVaultLink label="Certified ID Copy" url={profile?.documents?.idUrl} />
//                             <DocVaultLink label="Highest Qualification" url={profile?.documents?.qualUrl} />
//                             <DocVaultLink label="Updated CV" url={profile?.documents?.cvUrl} />
//                         </div>
//                     </div>

//                     {/* Save Button — only while editing */}
//                     {isEditing && (
//                         <button
//                             className="lpv-save-btn"
//                             onClick={handleSave}
//                             disabled={saving}
//                         >
//                             {saving
//                                 ? <><Loader2 size={16} className="lpv-spin" /> Saving…</>
//                                 : <><Save size={16} /> Confirm Changes</>}
//                         </button>
//                     )}
//                 </aside>
//             </div>
//         </div>
//     );
// };

// /* ── Helper Components ─────────────────────────────────────────────────────── */

// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
//             {value || '—'}
//         </div>
//     </div>
// );

// const EditField = ({
//     label, value, isEditing, onChange, icon
// }: {
//     label: string; value?: string; isEditing: boolean;
//     onChange: (val: string) => void; icon?: React.ReactNode;
// }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         {isEditing ? (
//             <input
//                 type="text"
//                 className="lpv-input"
//                 value={value || ''}
//                 onChange={e => onChange(e.target.value)}
//             />
//         ) : (
//             <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
//                 {value || '—'}
//             </div>
//         )}
//     </div>
// );

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a
//         href={url || '#'}
//         target="_blank"
//         rel="noopener noreferrer"
//         className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}
//     >
//         <span className="lpv-doc-link__name">
//             <FileText size={13} /> {label}
//         </span>
//         {url
//             ? <Info size={13} color="var(--mlab-blue)" />
//             : <AlertCircle size={13} />}
//     </a>
// );



// // import React, { useState } from 'react';
// // import {
// //     User, Mail, Phone, MapPin, ShieldCheck,
// //     FileText, Edit3, Save, X, Fingerprint,
// //     GraduationCap, Briefcase, Info, AlertCircle, Loader2
// // } from 'lucide-react';

// // interface ProfileProps {
// //     profile: any;
// //     user: any;
// //     onUpdate: (id: string, updates: any) => Promise<void>;
// // }

// // export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
// //     const [isEditing, setIsEditing] = useState(false);
// //     const [saving, setSaving] = useState(false);

// //     // Initializing state with existing profile data
// //     const [formData, setFormData] = useState({ ...profile });

// //     const handleSave = async () => {
// //         if (!profile?.id) return;
// //         setSaving(true);
// //         try {
// //             await onUpdate(profile.id, formData);
// //             setIsEditing(false);
// //         } catch (error) {
// //             console.error("Update failed", error);
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     return (
// //         <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>

// //             {/* ─── 1. COMPLIANCE STATUS BANNER ─── */}
// //             <div className={`mlab-alert ${profile?.profileCompleted ? 'mlab-alert--success' : 'mlab-alert--warning'}`} style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '8px', background: profile?.profileCompleted ? '#f0fdf4' : '#fffbeb', border: `1px solid ${profile?.profileCompleted ? '#bbf7d0' : '#fef3c7'}` }}>
// //                 <ShieldCheck size={24} color={profile?.profileCompleted ? '#16a34a' : '#d97706'} />
// //                 <div>
// //                     <strong style={{ display: 'block', color: '#1e293b' }}>
// //                         NLRD Verification: {profile?.profileCompleted ? 'Verified & Compliant' : 'Pending Verification'}
// //                     </strong>
// //                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
// //                         {profile?.profileCompleted
// //                             ? "Your profile meets all QCTO regulatory requirements."
// //                             : "Some compliance documents or details are still being verified."}
// //                     </p>
// //                 </div>
// //             </div>

// //             <div className="profile-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>

// //                 <div className="profile-main-stack" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

// //                     {/* ─── 2. IDENTITY SECTION (Locked for Compliance) ─── */}
// //                     <section className="mlab-panel" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
// //                             <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
// //                                 <User size={18} color="#3b82f6" /> Identity & Demographics
// //                             </h3>
// //                             <button
// //                                 className="mlab-btn"
// //                                 onClick={() => setIsEditing(!isEditing)}
// //                                 style={{ background: isEditing ? '#f1f5f9' : '#eff6ff', color: isEditing ? '#475569' : '#3b82f6', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '600' }}
// //                             >
// //                                 {isEditing ? <><X size={14} /> Cancel</> : <><Edit3 size={14} /> Edit Contact</>}
// //                             </button>
// //                         </div>

// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
// //                             <ReadOnlyField label="Full Legal Name" value={profile?.fullName} icon={<User size={14} />} />
// //                             <ReadOnlyField label="National ID Number" value={profile?.idNumber} icon={<Fingerprint size={14} />} />

// //                             <EditableField
// //                                 label="Contact Number"
// //                                 value={formData?.phone}
// //                                 isEditing={isEditing}
// //                                 onChange={(val: string) => setFormData({ ...formData, phone: val })}
// //                                 icon={<Phone size={14} />}
// //                             />
// //                             <EditableField
// //                                 label="Email Address"
// //                                 value={formData?.email}
// //                                 isEditing={isEditing}
// //                                 onChange={(val: string) => setFormData({ ...formData, email: val })}
// //                                 icon={<Mail size={14} />}
// //                             />
// //                         </div>

// //                         <div style={{ margin: '1.5rem 0', height: '1px', background: '#f1f5f9' }} />

// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
// //                             <ReadOnlyField label="Equity Group" value={profile?.equity} />
// //                             <ReadOnlyField label="Gender" value={profile?.gender} />
// //                             <ReadOnlyField label="Nationality" value={profile?.nationality || 'South African'} />
// //                         </div>
// //                     </section>

// //                     {/* ─── 3. RESIDENTIAL & NEXT OF KIN ─── */}
// //                     <section className="mlab-panel" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// //                         <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
// //                             <MapPin size={18} color="#3b82f6" /> Address & Emergency Contact
// //                         </h3>
// //                         <div style={{ marginBottom: '1.5rem' }}>
// //                             <EditableField
// //                                 label="Residential Address"
// //                                 value={formData?.streetAddress}
// //                                 isEditing={isEditing}
// //                                 onChange={(val: string) => setFormData({ ...formData, streetAddress: val })}
// //                             />
// //                         </div>
// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
// //                             <ReadOnlyField label="City" value={profile?.city} />
// //                             <ReadOnlyField label="Province" value={profile?.province} />
// //                             <ReadOnlyField label="Postal Code" value={profile?.postalCode} />
// //                         </div>

// //                         <div style={{ margin: '1.5rem 0', height: '1px', background: '#f1f5f9' }} />

// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
// //                             <EditableField label="Next of Kin" value={formData?.nokName} isEditing={isEditing} onChange={(val: string) => setFormData({ ...formData, nokName: val })} />
// //                             <EditableField label="Relationship" value={formData?.nokRelationship} isEditing={isEditing} onChange={(val: string) => setFormData({ ...formData, nokRelationship: val })} />
// //                             <EditableField label="NOK Phone" value={formData?.nokPhone} isEditing={isEditing} onChange={(val: string) => setFormData({ ...formData, nokPhone: val })} />
// //                         </div>
// //                     </section>
// //                 </div>

// //                 {/* ─── 4. SIDEBAR: QUALIFICATION & DOCUMENTS ─── */}
// //                 <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

// //                     <div style={{ background: '#0f172a', color: 'white', padding: '1.5rem', borderRadius: '12px' }}>
// //                         <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.7, letterSpacing: '0.05em' }}>
// //                             Current Qualification
// //                         </h4>
// //                         <div style={{ fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.4' }}>{profile?.qualification?.name || 'Unassigned'}</div>
// //                         <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>SAQA ID: {profile?.qualification?.saqaId || '—'}</div>
// //                     </div>

// //                     <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
// //                         <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
// //                             <FileText size={16} /> Compliance Vault
// //                         </h4>
// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
// //                             <DocVaultLink label="Certified ID Copy" url={profile?.documents?.idUrl} />
// //                             <DocVaultLink label="Highest Qualification" url={profile?.documents?.qualUrl} />
// //                             <DocVaultLink label="Updated CV" url={profile?.documents?.cvUrl} />
// //                         </div>
// //                     </div>

// //                     {isEditing && (
// //                         <button
// //                             className="mlab-btn"
// //                             style={{ width: '100%', padding: '1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
// //                             onClick={handleSave}
// //                             disabled={saving}
// //                         >
// //                             {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
// //                             {saving ? 'Saving...' : 'Confirm Changes'}
// //                         </button>
// //                     )}
// //                 </aside>
// //             </div>
// //         </div>
// //     );
// // };

// // // ─── HELPER COMPONENTS ──────────────────────────────────────────

// // const ReadOnlyField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
// //     <div>
// //         <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
// //             {icon} {label}
// //         </label>
// //         <div style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{value || '—'}</div>
// //     </div>
// // );

// // const EditableField = ({ label, value, isEditing, onChange, icon }: { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode }) => (
// //     <div>
// //         <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
// //             {icon} {label}
// //         </label>
// //         {isEditing ? (
// //             <input
// //                 type="text"
// //                 style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem', outlineColor: '#3b82f6' }}
// //                 value={value || ''}
// //                 onChange={(e) => onChange(e.target.value)}
// //             />
// //         ) : (
// //             <div style={{ color: '#1e293b', fontWeight: '600', fontSize: '0.95rem' }}>{value || '—'}</div>
// //         )}
// //     </div>
// // );

// // const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
// //     <a
// //         href={url}
// //         target="_blank"
// //         rel="noopener noreferrer"
// //         style={{
// //             display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem',
// //             borderRadius: '8px', background: url ? '#f8fafc' : '#fff1f2', textDecoration: 'none',
// //             border: `1px solid ${url ? '#e2e8f0' : '#fecaca'}`, color: url ? '#475569' : '#e11d48',
// //             pointerEvents: url ? 'auto' : 'none', transition: 'all 0.2s'
// //         }}
// //     >
// //         <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', fontWeight: '600' }}>
// //             <FileText size={14} /> {label}
// //         </div>
// //         {url ? <Info size={14} color="#3b82f6" /> : <AlertCircle size={14} />}
// //     </a>
// // );