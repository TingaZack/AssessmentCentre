// src/pages/AdminDashboard/AdminProfileView/AdminProfileView.tsx

import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
    Fingerprint, AlertCircle, Info, Loader2, Camera, Briefcase, MapPin, Shield, Key, Plus
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";

// Reusing the base practitioner view styles
import '../../../pages/FacilitatorDashboard/AssessorProfileView/AssessorProfileView.css';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
].map(p => ({ label: p, value: p }));

interface ProfileProps {
    profile: any;
    user: any;
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const AdminProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<any>({});
    const [initialData, setInitialData] = useState<any>({});
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.profilePhotoUrl || null);

    // Dynamic Document State
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);
    const [initialDocsList, setInitialDocsList] = useState<DynamicDocument[]>([]);

    const isSuper = profile?.isSuperAdmin === true;

    useEffect(() => {
        if (profile) {
            if (!isEditing) {
                const sameAsRes = profile.sameAsResidential !== undefined
                    ? profile.sameAsResidential
                    : (profile.postalAddress === profile.streetAddress || !profile.postalAddress);

                const loadData = {
                    ...profile,
                    sameAsResidential: sameAsRes
                };

                setFormData(loadData);
                setInitialData(loadData);
            }
            if (profile.profilePhotoUrl && !profilePhoto) {
                setPhotoPreview(profile.profilePhotoUrl);
            }

            // POPULATE DYNAMIC DOCUMENTS FROM PROFILE
            const legacyDocs = profile.complianceDocs || {};
            const rawUploadedDocs = profile.uploadedDocuments;
            const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

            const initialDocs: DynamicDocument[] = [
                {
                    id: 'id',
                    name: 'Certified ID / Passport Copy',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '',
                    isFixed: true,
                    isRequired: true
                },
                {
                    id: 'appointment',
                    name: 'Appointment Letter',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'appointment')?.url || legacyDocs.appointmentLetterUrl || '',
                    isFixed: true,
                    isRequired: true
                }
            ];

            // Conditionally add Work Permit if Foreign National
            if (profile.nationalityType === 'Foreign National') {
                initialDocs.splice(1, 0, {
                    id: 'permit',
                    name: 'Work Permit / Visa',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '',
                    isFixed: true,
                    isRequired: true
                });
            }

            // Append custom documents
            const coreDocIds = ['id', 'appointment', 'permit'];
            uploadedDocsArray.forEach((savedDoc: any) => {
                if (!coreDocIds.includes(savedDoc.id)) {
                    initialDocs.push({
                        id: savedDoc.id,
                        name: savedDoc.name,
                        file: null,
                        url: savedDoc.url,
                        isFixed: false,
                        isRequired: false
                    });
                }
            });

            setDocsList(initialDocs);
            setInitialDocsList(JSON.parse(JSON.stringify(initialDocs))); // Deep copy for cancel check
        }
    }, [profile, isEditing, profilePhoto]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handlePlaceSelected = (place: any) => {
        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        let provString = getComp("administrative_area_level_1");
        const matchedProv = QCTO_PROVINCES.find(p => provString.includes(p.value))?.value || '';

        setFormData((prev: any) => ({
            ...prev,
            streetAddress: `${getComp("street_number")} ${getComp("route")}`.trim(),
            city: getComp("locality") || getComp("sublocality_level_1"),
            province: matchedProv,
            postalCode: getComp("postal_code")
        }));
    };

    const handleFileUpload = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    // DYNAMIC DOC HANDLERS
    const handleAddDocument = () => {
        setDocsList(prev => [
            ...prev,
            { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }
        ]);
    };

    const handleRemoveDocument = (id: string) => {
        setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
    };

    const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => {
        setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));
    };

    const handleSave = async () => {
        const targetId = profile?.uid || profile?.id || user?.uid;
        if (!targetId) return;

        const hasFormChanges = JSON.stringify(formData) !== JSON.stringify(initialData);
        const hasPhotoChanges = profilePhoto !== null;

        // Check for document changes
        const hasDocChanges = docsList.some(d => d.file !== null) ||
            docsList.length !== initialDocsList.length ||
            JSON.stringify(docsList.map(d => d.name)) !== JSON.stringify(initialDocsList.map(d => d.name));

        if (!hasFormChanges && !hasPhotoChanges && !hasDocChanges) {
            setIsEditing(false);
            return;
        }

        setSaving(true);
        try {
            let finalPhotoUrl = formData.profilePhotoUrl;

            if (profilePhoto && targetId) {
                const ext = profilePhoto.name.split('.').pop();
                finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${targetId}/profile_${Date.now()}.${ext}`);
            }

            // PROCESS ALL DYNAMIC DOCUMENTS
            const finalUploadedDocs = [];
            const legacyDocsObject: any = { ...(profile.complianceDocs || {}) }; // Keep backward compatibility

            for (const docItem of docsList) {
                let finalUrl = docItem.url;

                // Upload newly selected file
                if (docItem.file) {
                    const ext = docItem.file.name.split('.').pop();
                    finalUrl = await handleFileUpload(docItem.file, `staff/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
                }

                if (finalUrl) {
                    finalUploadedDocs.push({
                        id: docItem.id,
                        name: docItem.name || 'Untitled Document',
                        url: finalUrl
                    });

                    // Map to legacy fields for backward compatibility
                    if (docItem.id === 'id') legacyDocsObject.identificationUrl = finalUrl;
                    if (docItem.id === 'appointment') legacyDocsObject.appointmentLetterUrl = finalUrl;
                    if (docItem.id === 'permit') legacyDocsObject.workPermitUrl = finalUrl;
                }
            }

            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
            const postalCodeFinal = formData.sameAsResidential ? formData.postalCode : formData.customPostalCode;

            const updatedData = {
                ...formData,
                postalAddress: postalLine1,
                customPostalCode: postalCodeFinal,
                profilePhotoUrl: finalPhotoUrl,
                uploadedDocuments: finalUploadedDocs, // 👈 New robust array format
                complianceDocs: legacyDocsObject,     // 👈 Legacy fallback
                updatedAt: new Date().toISOString()
            };

            await onUpdate(targetId, updatedData);
            setIsEditing(false);
            setProfilePhoto(null);

            // Sync initial states
            setInitialData(updatedData);
            setInitialDocsList(JSON.parse(JSON.stringify(docsList)));

        } catch (error) {
            console.error('Update failed', error);
            alert("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));

    const isVerified = profile?.profileCompleted === true;

    // DYNAMIC DOCUMENT VAULT RENDERER
    const renderDocumentVault = () => {
        return (
            <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {isEditing ? (
                    // EDIT MODE: Render dynamic upload cards
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {docsList.map((docItem) => (
                            <DynamicDocUpload
                                key={docItem.id}
                                document={docItem}
                                onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
                                onRemove={() => handleRemoveDocument(docItem.id)}
                            />
                        ))}
                    </div>
                ) : (
                    // READ-ONLY MODE: Render standard links
                    <>
                        {docsList.map((docItem, index) => (
                            <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />
                        ))}
                        {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="lpv-wrapper animate-fade-in" style={{ padding: '0' }}>

            {/* Adaptive Banner */}
            <div
                className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}
                style={isSuper ? { background: '#fef2f2', borderLeft: '5px solid #ef4444' } : isVerified ? { background: '#f1f5f9', borderLeftColor: '#0f172a' } : {}}
            >
                {isSuper ? <Shield size={22} color="#ef4444" className="lpv-banner__icon" /> : <ShieldCheck size={22} className="lpv-banner__icon" color={isVerified ? '#0f172a' : 'var(--mlab-amber)'} />}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="lpv-banner__title" style={{ color: isSuper ? '#ef4444' : isVerified ? '#0f172a' : 'inherit', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            {isSuper ? 'Clearance Level: Platform Owner (Super Admin)' : `Administrator Status: ${isVerified ? 'Verified System Compiler' : 'Pending Verification'}`}
                        </span>
                        {profile?.updatedAt && (
                            <span style={{ fontSize: '0.7rem', opacity: 0.7, fontStyle: 'italic', color: '#64748b' }}>
                                Last Updated: {new Date(profile.updatedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                    <p className="lpv-banner__desc" style={{ color: isSuper ? '#991b1b' : isVerified ? '#475569' : 'inherit' }}>
                        {isSuper
                            ? 'You have absolute authority over system configurations, access control, and master data.'
                            : isVerified
                                ? 'Your profile is authorized to compile and export QCTO LEISA data.'
                                : 'Please update your details to ensure institutional exports are compliant.'}
                    </p>
                </div>
            </div>

            <div className="lpv-layout">
                <div className="lpv-main-stack">

                    {/* Identity & Role Section */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title" style={{ color: '#0f172a' }}><User size={16} /> Identity &amp; Role Details</h3>
                            <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={() => {
                                setIsEditing(!isEditing);
                                if (isEditing) {
                                    // Cancel Edits
                                    setFormData(initialData);
                                    setDocsList(JSON.parse(JSON.stringify(initialDocsList)));
                                    setPhotoPreview(profile?.profilePhotoUrl || null);
                                    setProfilePhoto(null);
                                }
                            }}>
                                {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        <div className="lpv-profile-header">
                            <div className="lpv-avatar-wrapper">
                                <div className="lpv-avatar">
                                    {photoPreview ? <img src={photoPreview} alt="Profile" style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> : <User size={30} color="#94a3b8" />}
                                </div>
                                {isEditing && (
                                    <label className="lpv-avatar-upload" style={{ background: isSuper ? '#ef4444' : '#0f172a' }}>
                                        <Camera size={14} /><input type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 className="lpv-display-name">{formData?.fullName || 'Administrator'}</h4>
                                <p className="lpv-display-sub">{isSuper ? 'Super Administrator' : (formData?.jobTitle || 'Institutional Compiler')}</p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <EditField label="Full Legal Name" value={formData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />

                            {/* Standard Admin Only Field */}
                            {!isSuper && <ROField label="Identity Number" value={profile?.idNumber} icon={<Fingerprint size={13} />} />}

                            {/* Standard Admin Only Field */}
                            {!isSuper && <EditField label="Job Title" value={formData?.jobTitle} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('jobTitle', val)} />}

                            <EditField label="Contact Number" value={formData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
                        </div>
                        <div style={{ marginTop: '1.25rem' }}>
                            <ROField label="Email Address" value={formData?.email} icon={<Mail size={13} />} />
                        </div>
                    </section>

                    {/* Address Section - Standard Admin Only */}
                    {!isSuper && (
                        <section className="lpv-panel">
                            <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
                                <MapPin size={16} /> Residential Address
                            </h3>
                            {isEditing && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <div className="lpv-field__label">Address Search (Google Verified)</div>
                                    <Autocomplete
                                        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                        onPlaceSelected={handlePlaceSelected}
                                        options={{ types: [], componentRestrictions: { country: "za" } }}
                                        className="lpv-input"
                                        defaultValue={formData.streetAddress}
                                        placeholder="Start typing your street name..."
                                    />
                                </div>
                            )}
                            <div className="lpv-grid-3">
                                <EditField label="Street Address" value={formData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                                <ROField label="City" value={formData.city} />
                                <EditField label="Province" value={formData.province} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('province', v)} />
                                <ROField label="Postal Code" value={formData.postalCode} />
                            </div>

                            {isEditing ? (
                                <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={formData.sameAsResidential} onChange={e => update('sameAsResidential', e.target.checked)} />
                                        Postal Address is the same as Residential
                                    </label>
                                    {!formData.sameAsResidential && (
                                        <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
                                            <EditField label="Alternate Postal Address" value={formData.postalAddress} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
                                            <EditField label="Alternate Postal Code" value={formData.customPostalCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                !formData.sameAsResidential && (
                                    <>
                                        <div className="lpv-divider" />
                                        <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Postal Address</h4>
                                        <div className="lpv-grid-2">
                                            <ROField label="Address" value={formData.postalAddress} />
                                            <ROField label="Postal Code" value={formData.customPostalCode} />
                                        </div>
                                    </>
                                )
                            )}
                        </section>
                    )}
                </div>

                <aside className="lpv-aside">
                    {/* Role Card */}
                    <div className="lpv-qual-card" style={{ background: isSuper ? '#ef4444' : '#0f172a' }}>
                        <div className="lpv-qual-card__label"><Briefcase size={13} /> {isSuper ? 'Clearance' : 'Official Title'}</div>
                        <p className="lpv-qual-card__name">{isSuper ? 'Super Admin' : (profile?.jobTitle || 'Administrator')}</p>
                        <span className="lpv-qual-card__saqa">System Role: {profile?.role?.toUpperCase() || 'ADMIN'}</span>
                    </div>

                    {/* Standard Admin Compliance Vault */}
                    {!isSuper && (
                        <div className="lpv-vault-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><ShieldCheck size={15} color="#0f172a" /> Compliance Vault</h4>
                                {isEditing && (
                                    <button
                                        className="lpv-edit-btn"
                                        style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={handleAddDocument}
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                )}
                            </div>

                            {/* RENDER DYNAMIC DOCUMENTS */}
                            {renderDocumentVault()}
                        </div>
                    )}

                    {/* Authorized Signature Vault (Relevant to both) */}
                    <div className="lpv-vault-card">
                        <h4 className="lpv-vault-card__title" style={{ color: '#0f172a' }}>
                            <Key size={15} /> Authorized Signature
                        </h4>
                        <p style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', margin: '4px 0 12px 0' }}>
                            Required for institutional sign-offs and certificates.
                        </p>
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
                            {profile?.signatureUrl ? (
                                <img src={profile.signatureUrl} alt="Signature" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain' }} />
                            ) : (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No Signature Configured</span>
                            )}
                        </div>
                    </div>

                    {isEditing && (
                        <button className="lpv-save-btn" style={{ background: isSuper ? '#ef4444' : '#0f172a', borderColor: isSuper ? '#ef4444' : '#0f172a' }} onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div>
        <div className="lpv-field__label">{icon}{label}</div>
        <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>{value || '—'}</div>
    </div>
);

const EditField = ({
    label, value, isEditing, onChange, icon, type = 'text', options = []
}: {
    label: string; value?: string | number; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[];
}) => {
    const displayValue = type === 'select' && !isEditing
        ? options.find(o => o.value === String(value))?.label || value
        : value;

    return (
        <div>
            <div className="lpv-field__label">{icon}{label}</div>
            {isEditing ? (
                type === 'select' ? (
                    <select className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ) : (
                    <input type="text" className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)} />
                )
            ) : (
                <div className={`lpv-field__value ${!displayValue ? ' lpv-field__value--empty' : ''}`}>
                    {displayValue || '—'}
                </div>
            )}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="#0f172a" /> : <AlertCircle size={13} />}
    </a>
);