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
