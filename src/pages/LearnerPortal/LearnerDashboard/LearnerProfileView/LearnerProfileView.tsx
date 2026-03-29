// src/pages/LearnerPortal/LearnerProfileView/LearnerProfileView.tsx

import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, MapPin, ShieldCheck,
    FileText, Edit3, Save, X, Fingerprint,
    GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './LearnerProfileView.css';
import { storage } from '../../../../lib/firebase';

/* ── QCTO DICTIONARIES (For Label Mapping) ────────────────────────────────── */
const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }];
const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }];
const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }];
const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }];
const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }];

interface ProfileProps {
    profile: any;
    user: any;
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Local form state - flattened for easier input binding
    const [formData, setFormData] = useState<any>({});

    // Photo Upload States
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Initial Load & Sync
    useEffect(() => {
        if (profile) {
            const d = profile.demographics || {};
            const nok = profile.nextOfKin || {};

            setFormData({
                fullName: profile.fullName || '',
                email: profile.email || '',
                phone: profile.phone || d.learnerPhoneNumber || '',
                idNumber: profile.idNumber || '',
                streetAddress: d.learnerHomeAddress1 || '',
                city: d.learnerHomeAddress2 || '',
                provinceCode: d.provinceCode || '',
                postalCode: d.learnerHomeAddressPostalCode || '',
                equityCode: d.equityCode || '',
                genderCode: d.genderCode || '',
                homeLanguageCode: d.homeLanguageCode || '',
                citizenStatusCode: d.citizenResidentStatusCode || '',
                socioeconomicCode: d.socioeconomicStatusCode || '',
                disabilityCode: d.disabilityStatusCode || 'N',
                disabilityRating: d.disabilityRating || '',
                nokName: nok.name || '',
                nokRelationship: nok.relationship || '',
                nokPhone: nok.phone || '',
                profilePhotoUrl: profile.profilePhotoUrl || ''
            });
            setPhotoPreview(profile.profilePhotoUrl || null);
        }
    }, [profile]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        if (!profile?.id) return;
        setSaving(true);
        try {
            let finalPhotoUrl = formData.profilePhotoUrl;

            if (profilePhoto && user?.uid) {
                const storageRef = ref(storage, `learners/${user.uid}/profile_${Date.now()}`);
                const snapshot = await uploadBytes(storageRef, profilePhoto);
                finalPhotoUrl = await getDownloadURL(snapshot.ref);
            }

            // Re-structure the data back into the QCTO nested format
            const updatedData = {
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                profilePhotoUrl: finalPhotoUrl,
                demographics: {
                    ...(profile.demographics || {}),
                    learnerPhoneNumber: formData.phone,
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    provinceCode: formData.provinceCode,
                    learnerHomeAddressPostalCode: formData.postalCode,
                    equityCode: formData.equityCode,
                    genderCode: formData.genderCode,
                    homeLanguageCode: formData.homeLanguageCode,
                    citizenResidentStatusCode: formData.citizenStatusCode,
                    socioeconomicStatusCode: formData.socioeconomicCode,
                    disabilityStatusCode: formData.disabilityCode,
                    disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
                },
                nextOfKin: {
                    name: formData.nokName,
                    relationship: formData.nokRelationship,
                    phone: formData.nokPhone
                }
            };

            await onUpdate(profile.id, updatedData);
            setIsEditing(false);
            setProfilePhoto(null);
        } catch (error) {
            console.error('Update failed', error);
            alert("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: string) => setFormData((prev: any) => ({ ...prev, [field]: val }));

    // Helper to get labels from codes
    const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

    const isVerified = profile?.profileCompleted;

    return (
        <div className="lpv-wrapper animate-fade-in">
            {/* Compliance Banner */}
            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck size={22} className="lpv-banner__icon" />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Information Required'}</span>
                        {profile?.updatedAt && (
                            <span style={{ fontSize: '0.75rem', opacity: 0.8, fontStyle: 'italic' }}>
                                Last Synced: {new Date(profile.updatedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                    <p className="lpv-banner__desc">{isVerified ? 'Your profile data is synchronized with QCTO standards and locked for NLRD reporting.' : 'Please update your profile to meet regulatory requirements.'}</p>
                </div>
            </div>

            <div className="lpv-layout">
                <div className="lpv-main-stack">

                    {/* 1. Identity Section */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
                            <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={() => setIsEditing(!isEditing)}>
                                {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        <div className="lpv-profile-header">
                            <div className="lpv-avatar-wrapper">
                                <div className="lpv-avatar">
                                    {photoPreview ? <img src={photoPreview} style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="Profile" /> : <User size={30} color="#94a3b8" />}
                                </div>
                                {isEditing && (
                                    <label className="lpv-avatar-upload">
                                        <Camera size={14} />
                                        <input type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 className="lpv-display-name">{formData.fullName}</h4>
                                <p className="lpv-display-sub">{getLabel(formData.genderCode, QCTO_GENDER)} • {getLabel(formData.equityCode, QCTO_EQUITY)}</p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <ROField label="National ID" value={formData.idNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Citizenship Status" value={formData.citizenStatusCode} isEditing={isEditing} type="select" options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} />
                            <EditField label="Home Language" value={formData.homeLanguageCode} isEditing={isEditing} type="select" options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
                            <EditField label="Contact Number" value={formData.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />
                            <EditField label="Email Address" value={formData.email} icon={<Mail size={13} />} isEditing={isEditing} onChange={(v: string) => update('email', v)} />
                        </div>
                    </section>

                    {/* 2. Socioeconomic & Disability */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}><Briefcase size={16} /> Background & Disability</h3>
                        <div className="lpv-grid-2">
                            <EditField label="Employment Status" value={formData.socioeconomicCode} isEditing={isEditing} type="select" options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
                            <EditField label="Disability Status" value={formData.disabilityCode} isEditing={isEditing} type="select" options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} />
                        </div>
                    </section>

                    {/* 3. Address Section */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}><MapPin size={16} /> Residential Address</h3>
                        <div className="lpv-full-field" style={{ marginBottom: '1rem' }}>
                            <EditField label="Street Address" value={formData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                        </div>
                        <div className="lpv-grid-3">
                            <ROField label="City" value={formData.city} />
                            <EditField label="Province" value={formData.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
                            <ROField label="Postal Code" value={formData.postalCode} />
                        </div>
                    </section>

                    {/* 4. Next of Kin */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}><Heart size={16} /> Emergency Contact</h3>
                        <div className="lpv-grid-3">
                            <EditField label="Full Name" value={formData.nokName} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
                            <EditField label="Relationship" value={formData.nokRelationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
                            <EditField label="Contact Number" value={formData.nokPhone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
                        </div>
                    </section>
                </div>

                {/* Aside Column */}
                <aside className="lpv-aside">
                    <div className="lpv-qual-card">
                        <div className="lpv-qual-card__label"><GraduationCap size={13} /> Active Qualification</div>
                        <p className="lpv-qual-card__name">{profile?.qualification?.name || 'Enrolment Pending'}</p>
                        <span className="lpv-qual-card__saqa">SAQA ID: {profile?.qualification?.saqaId || '—'}</span>
                    </div>

                    <div className="lpv-vault-card">
                        <h4 className="lpv-vault-card__title"><FileText size={15} /> Compliance Vault</h4>
                        <div className="lpv-vault-links">
                            <DocVaultLink label="Certified ID Copy" url={profile?.documents?.idUrl} />
                            <DocVaultLink label="Highest Qualification" url={profile?.documents?.qualUrl} />
                            <DocVaultLink label="Updated CV" url={profile?.documents?.cvUrl} />
                        </div>
                    </div>

                    {isEditing && (
                        <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* ── Internal Components ─────────────────────────────────────────────────── */

const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div className="lpv-field">
        <div className="lpv-field__label">{icon}{label}</div>
        <div className={`lpv-field__value ${!value ? 'lpv-field__value--empty' : ''}`}>{value || '—'}</div>
    </div>
);

const EditField = ({
    label,
    value,
    isEditing,
    onChange,
    icon,
    type = 'text',
    options = []
}: {
    label: string;
    value?: string;
    isEditing: boolean;
    onChange: (val: string) => void;
    icon?: React.ReactNode;
    type?: 'text' | 'select';
    options?: { label: string; value: string }[];
}) => {
    // We need to display the Label when NOT editing, but pass the Value when editing
    const displayValue = type === 'select' && !isEditing
        ? options.find(o => o.value === value)?.label
        : value;

    return (
        <div className="lpv-field">
            <div className="lpv-field__label">{icon}{label}</div>
            {isEditing ? (
                type === 'select' ? (
                    <select
                        className="lpv-input"
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                    >
                        <option value="">Select...</option>
                        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ) : (
                    <input
                        type="text"
                        className="lpv-input"
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                    />
                )
            ) : (
                <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>
                    {displayValue || '—'}
                </div>
            )}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer"
        className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
    </a>
);