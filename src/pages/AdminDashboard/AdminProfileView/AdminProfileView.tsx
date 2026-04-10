// src/pages/AdminDashboard/AdminProfileView/AdminProfileView.tsx

import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
    Fingerprint, AlertCircle, Info, Loader2, Camera, Briefcase, MapPin, Shield, Key, Plus
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";
import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
import '../../../pages/FacilitatorDashboard/AssessorProfileView/AssessorProfileView.css';

import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';

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
    const [showSignatureModal, setShowSignatureModal] = useState(false);

    const [liveProfile, setLiveProfile] = useState<any>(profile || user || {});

    // The Draft State (Only used when isEditing is true)
    const [formData, setFormData] = useState<any>({});
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const isSuper = liveProfile?.isSuperAdmin === true;
    const targetId = profile?.uid || profile?.id || user?.uid;

    // 1. REAL-TIME LISTENER: Keep liveProfile perfectly in sync with Firestore
    useEffect(() => {
        if (!targetId) return;

        const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveProfile(data);

                // If signature just arrived, close the modal automatically!
                if (data.signatureUrl && showSignatureModal) {
                    setShowSignatureModal(false);
                }
            }
        });

        return () => unsubscribe();
    }, [targetId, showSignatureModal]);

    // 2. HYDRATE UI FROM LIVE PROFILE (Only when NOT editing)
    useEffect(() => {
        if (!isEditing && liveProfile) {
            const sameAsRes = liveProfile.sameAsResidential !== undefined
                ? liveProfile.sameAsResidential
                : (liveProfile.postalAddress === liveProfile.streetAddress || !liveProfile.postalAddress);

            setFormData({ ...liveProfile, sameAsResidential: sameAsRes });
            setPhotoPreview(liveProfile.profilePhotoUrl || null);

            // Build Documents List from Live Data
            const legacyDocs = liveProfile.complianceDocs || {};
            const rawUploadedDocs = liveProfile.uploadedDocuments;
            const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

            const currentDocs: DynamicDocument[] = [
                { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '', isFixed: true, isRequired: true },
                { id: 'appointment', name: 'Appointment Letter', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'appointment')?.url || legacyDocs.appointmentLetterUrl || '', isFixed: true, isRequired: true }
            ];

            if (liveProfile.nationalityType === 'Foreign National') {
                currentDocs.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '', isFixed: true, isRequired: true });
            }

            const coreDocIds = ['id', 'appointment', 'permit'];
            uploadedDocsArray.forEach((savedDoc: any) => {
                if (!coreDocIds.includes(savedDoc.id)) {
                    currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
                }
            });

            setDocsList(currentDocs);
        }
    }, [liveProfile, isEditing]);

    // 3. STRICT COMPLIANCE: Trigger Signature Modal
    useEffect(() => {
        // Only trigger the signature modal if the user is NOT a Super Admin
        if (liveProfile && Object.keys(liveProfile).length > 0 && !liveProfile.signatureUrl && !isSuper) {
            setShowSignatureModal(true);
        }
    }, [liveProfile.signatureUrl, isSuper]); // Added isSuper to dependency array


    // ─── HANDLERS ─────────────────────────────────────────────────────────

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
        const matchedProv = QCTO_PROVINCES.find(p => getComp("administrative_area_level_1").includes(p.value))?.value || '';

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

    const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
    const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
    const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

    const handleSave = async () => {
        if (!targetId) return;
        setSaving(true);

        try {
            let finalPhotoUrl = formData.profilePhotoUrl;
            if (profilePhoto) {
                const ext = profilePhoto.name.split('.').pop();
                finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${targetId}/profile_${Date.now()}.${ext}`);
            }

            const finalUploadedDocs = [];
            const legacyDocsObject: any = { ...(liveProfile.complianceDocs || {}) };

            for (const docItem of docsList) {
                let finalUrl = docItem.url;
                if (docItem.file) {
                    const ext = docItem.file.name.split('.').pop();
                    finalUrl = await handleFileUpload(docItem.file, `staff/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
                }
                if (finalUrl) {
                    finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
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
                uploadedDocuments: finalUploadedDocs,
                complianceDocs: legacyDocsObject,
                updatedAt: new Date().toISOString()
            };

            await onUpdate(targetId, updatedData);

            // Cleanup edit state. The snapshot listener will instantly update liveProfile and the UI.
            setIsEditing(false);
            setProfilePhoto(null);

        } catch (error) {
            console.error('Update failed', error);
            alert("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));

    const isVerified = liveProfile?.profileCompleted === true;

    // ─── RENDERERS ─────────────────────────────────────────────────────────

    const renderDocumentVault = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {docsList.map((docItem) => (
                        <DynamicDocUpload key={docItem.id} document={docItem} onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)} onRemove={() => handleRemoveDocument(docItem.id)} />
                    ))}
                </div>
            ) : (
                <>
                    {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
                    {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
                </>
            )}
        </div>
    );

    const displayData = isEditing ? formData : liveProfile;
    const isPostalSame = displayData.sameAsResidential !== false;

    return (
        <>
            {showSignatureModal && (
                <SignatureSetupModal userUid={targetId} onComplete={() => { }} />
            )}

            <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

                {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
                <div className="wm-page-header">
                    <div className="wm-page-header__left">
                        <div className="wm-page-header__icon"><ShieldCheck size={22} /></div>
                        <div>
                            <h1 className="wm-page-header__title">Administrator Profile</h1>
                            <p className="wm-page-header__desc">Manage your identity, contact details, and compliance documents.</p>
                        </div>
                    </div>
                    {/* Header Action Button */}
                    <button
                        className={`wm-btn ${isEditing ? 'wm-btn--ghost' : 'wm-btn--primary'}`}
                        onClick={() => {
                            setIsEditing(!isEditing);
                            if (isEditing) {
                                setProfilePhoto(null);
                                setPhotoPreview(liveProfile?.profilePhotoUrl || null);
                            }
                        }}
                    >
                        {isEditing ? <><X size={14} /> Cancel Edits</> : <><Edit3 size={14} /> Edit Profile</>}
                    </button>
                </div>

                {/* ── VERIFICATION BANNER ── */}
                <div style={{ padding: '0 1.5rem', marginBottom: '1.5rem' }}>
                    <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`} style={{ margin: 0, ...(isSuper ? { background: '#fef2f2', borderLeft: '5px solid #ef4444' } : isVerified ? { background: '#f1f5f9', borderLeftColor: '#0f172a' } : {}) }}>
                        {isSuper ? <Shield size={22} color="#ef4444" className="lpv-banner__icon" /> : <ShieldCheck size={22} className="lpv-banner__icon" color={isVerified ? '#0f172a' : 'var(--mlab-amber)'} />}
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="lpv-banner__title" style={{ color: isSuper ? '#ef4444' : isVerified ? '#0f172a' : 'inherit', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    {isSuper ? 'Clearance Level: Platform Owner (Super Admin)' : `Administrator Status: ${isVerified ? 'Verified System Compiler' : 'Pending Verification'}`}
                                </span>
                                {liveProfile?.updatedAt && (
                                    <span style={{ fontSize: '0.7rem', opacity: 0.7, fontStyle: 'italic', color: '#64748b' }}>
                                        Last Updated: {new Date(liveProfile.updatedAt).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                            <p className="lpv-banner__desc" style={{ color: isSuper ? '#991b1b' : isVerified ? '#475569' : 'inherit' }}>
                                {isSuper ? 'You have absolute authority over system configurations, access control, and master data.' : isVerified ? 'Your profile is authorized to compile and export QCTO LEISA data.' : 'Please update your details to ensure institutional exports are compliant.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── MAIN CONTENT GRID ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '0 1.5rem' }}>

                    {/* LEFT COLUMN: Identity & Address */}
                    <div style={{ flex: '1 1 60%', display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: '350px' }}>

                        {/* Panel 1: Identity */}
                        <section className="wm-card" style={{ padding: '1.5rem' }}>
                            <div className="wm-card__header" style={{ padding: 0, paddingBottom: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
                                <h3 className="wm-card__name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <User size={16} /> Identity &amp; Role Details
                                </h3>
                            </div>

                            <div className="lpv-profile-header" style={{ marginBottom: '2rem' }}>
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
                                    <h4 className="lpv-display-name">{displayData?.fullName || 'Administrator'}</h4>
                                    <p className="lpv-display-sub">{isSuper ? 'Super Administrator' : (displayData?.jobTitle || 'Institutional Compiler')}</p>
                                </div>
                            </div>

                            <div className="lpv-grid-2">
                                <EditField label="Full Legal Name" value={displayData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
                                {!isSuper && <ROField label="Identity Number" value={liveProfile?.idNumber} icon={<Fingerprint size={13} />} />}
                                {!isSuper && <EditField label="Job Title" value={displayData?.jobTitle} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('jobTitle', val)} />}
                                <EditField label="Contact Number" value={displayData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
                            </div>
                            <div style={{ marginTop: '1.25rem' }}>
                                <ROField label="Email Address" value={displayData?.email} icon={<Mail size={13} />} />
                            </div>
                        </section>

                        {/* Panel 2: Address */}
                        {!isSuper && (
                            <section className="wm-card" style={{ padding: '1.5rem' }}>
                                <div className="wm-card__header" style={{ padding: 0, paddingBottom: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
                                    <h3 className="wm-card__name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <MapPin size={16} /> Residential Address
                                    </h3>
                                </div>

                                {isEditing && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <div className="lpv-field__label">Address Search (Google Verified)</div>
                                        <Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ types: [], componentRestrictions: { country: "za" } }} className="lpv-input" defaultValue={displayData.streetAddress} placeholder="Start typing your street name..." />
                                    </div>
                                )}
                                <div className="lpv-grid-3">
                                    <EditField label="Street Address" value={displayData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                                    <ROField label="City" value={displayData.city} />
                                    <EditField label="Province" value={displayData.province} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('province', v)} />
                                    <ROField label="Postal Code" value={displayData.postalCode} />
                                </div>

                                {isEditing ? (
                                    <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.85rem' }}>
                                            <input type="checkbox" checked={displayData.sameAsResidential} onChange={e => update('sameAsResidential', e.target.checked)} />
                                            Postal Address is the same as Residential
                                        </label>
                                        {!displayData.sameAsResidential && (
                                            <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
                                                <EditField label="Alternate Postal Address" value={displayData.postalAddress} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
                                                <EditField label="Alternate Postal Code" value={displayData.customPostalCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
                                        <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
                                            Postal Address
                                            {isPostalSame && (
                                                <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>
                                                    Same as Residential
                                                </span>
                                            )}
                                        </h4>
                                        <div className="lpv-grid-2">
                                            <ROField label="Address" value={isPostalSame ? displayData.streetAddress : displayData.postalAddress} />
                                            <ROField label="Postal Code" value={isPostalSame ? displayData.postalCode : displayData.customPostalCode} />
                                        </div>
                                    </>
                                )}
                            </section>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Sidebar Cards */}
                    <aside style={{ flex: '1 1 30%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        <div className="wm-card" style={{ padding: '1.5rem', borderTopColor: isSuper ? '#ef4444' : '#0f172a', background: isSuper ? '#ef4444' : '#0f172a', color: 'white' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <Briefcase size={13} /> {isSuper ? 'Clearance' : 'Official Title'}
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>{isSuper ? 'Super Admin' : (liveProfile?.jobTitle || 'Administrator')}</p>
                            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                System Role: {liveProfile?.role?.toUpperCase() || 'ADMIN'}
                            </span>
                        </div>

                        {!isSuper && (
                            <div className="wm-card" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--mlab-border)' }}>
                                    <h4 className="wm-card__name" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="var(--mlab-blue)" /> Compliance Vault</h4>
                                    {isEditing && (
                                        <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={handleAddDocument}>
                                            <Plus size={12} /> Add
                                        </button>
                                    )}
                                </div>
                                {renderDocumentVault()}
                            </div>
                        )}

                        {/* Hide Signature Block completely if user is Super Admin */}
                        {!isSuper && (
                            <div className="wm-card" style={{ padding: '1.5rem' }}>
                                <div style={{ paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--mlab-border)' }}>
                                    <h4 className="wm-card__name" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={16} color="var(--mlab-blue)" /> Authorized Signature</h4>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '4px 0 0 0', lineHeight: 1.4 }}>Required for institutional sign-offs and certificates.</p>
                                </div>

                                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100px', borderRadius: '6px' }}>
                                    {liveProfile?.signatureUrl ? (
                                        <>
                                            <img src={liveProfile.signatureUrl} alt="Signature" style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }} />
                                            {isEditing && (
                                                <button type="button" onClick={(e) => { e.preventDefault(); setShowSignatureModal(true); }} style={{ marginTop: '10px', fontSize: '11px', color: '#0ea5e9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', fontWeight: 600 }}>
                                                    <Edit3 size={11} /> Redraw Signature
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>Action Required: Signature Missing</span>
                                            <button type="button" className="wm-btn wm-btn--primary" onClick={(e) => { e.preventDefault(); setShowSignatureModal(true); }} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                                                <Plus size={12} /> Draw Signature
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Save Button explicitly placed at the bottom of the sidebar */}
                        {isEditing && (
                            <button
                                className="wm-btn wm-btn--primary"
                                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', fontSize: '0.85rem', background: isSuper ? '#ef4444' : 'var(--mlab-green)', borderColor: isSuper ? '#ef4444' : 'var(--mlab-green-dark)' }}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? <><Loader2 size={16} className="spin" /> Saving Changes…</> : <><Save size={16} /> Confirm Changes</>}
                            </button>
                        )}
                    </aside>
                </div>
            </div>
        </>
    );
};

// Form Field Helpers
const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div>
        <div className="lpv-field__label">{icon}{label}</div>
        <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>{value || '—'}</div>
    </div>
);

const EditField = ({ label, value, isEditing, onChange, icon, type = 'text', options = [] }: { label: string; value?: string | number; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[]; }) => {
    const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === String(value))?.label || value : value;
    return (
        <div>
            <div className="lpv-field__label">{icon}{label}</div>
            {isEditing ? (
                type === 'select' ? (
                    <select className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ) : <input type="text" className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)} />
            ) : <div className={`lpv-field__value ${!displayValue ? ' lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="#0f172a" /> : <AlertCircle size={13} />}
    </a>
);


// // src/pages/AdminDashboard/AdminProfileView/AdminProfileView.tsx

// import React, { useState, useEffect } from 'react';
// import {
//     User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
//     Fingerprint, AlertCircle, Info, Loader2, Camera, Briefcase, MapPin, Shield, Key, Plus
// } from 'lucide-react';
// import { doc, onSnapshot } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { db, storage } from '../../../lib/firebase';
// import Autocomplete from "react-google-autocomplete";
// import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// import '../../../pages/FacilitatorDashboard/AssessorProfileView/AssessorProfileView.css';

// import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
// import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';

// const QCTO_PROVINCES = [
//     "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
//     "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
// ].map(p => ({ label: p, value: p }));

// interface ProfileProps {
//     profile: any;
//     user: any;
//     onUpdate: (id: string, updates: any) => Promise<void>;
// }

// export const AdminProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
//     const [isEditing, setIsEditing] = useState(false);
//     const [saving, setSaving] = useState(false);
//     const [showSignatureModal, setShowSignatureModal] = useState(false);

//     const [liveProfile, setLiveProfile] = useState<any>(profile || user || {});

//     // The Draft State (Only used when isEditing is true)
//     const [formData, setFormData] = useState<any>({});
//     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);

//     const isSuper = liveProfile?.isSuperAdmin === true;
//     const targetId = profile?.uid || profile?.id || user?.uid;

//     // 1. REAL-TIME LISTENER: Keep liveProfile perfectly in sync with Firestore
//     useEffect(() => {
//         if (!targetId) return;

//         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
//             if (docSnap.exists()) {
//                 const data = docSnap.data();
//                 setLiveProfile(data);

//                 // If signature just arrived, close the modal automatically!
//                 if (data.signatureUrl && showSignatureModal) {
//                     setShowSignatureModal(false);
//                 }
//             }
//         });

//         return () => unsubscribe();
//     }, [targetId, showSignatureModal]);

//     // 2. HYDRATE UI FROM LIVE PROFILE (Only when NOT editing)
//     useEffect(() => {
//         if (!isEditing && liveProfile) {
//             const sameAsRes = liveProfile.sameAsResidential !== undefined
//                 ? liveProfile.sameAsResidential
//                 : (liveProfile.postalAddress === liveProfile.streetAddress || !liveProfile.postalAddress);

//             setFormData({ ...liveProfile, sameAsResidential: sameAsRes });
//             setPhotoPreview(liveProfile.profilePhotoUrl || null);

//             // Build Documents List from Live Data
//             const legacyDocs = liveProfile.complianceDocs || {};
//             const rawUploadedDocs = liveProfile.uploadedDocuments;
//             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

//             const currentDocs: DynamicDocument[] = [
//                 { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '', isFixed: true, isRequired: true },
//                 { id: 'appointment', name: 'Appointment Letter', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'appointment')?.url || legacyDocs.appointmentLetterUrl || '', isFixed: true, isRequired: true }
//             ];

//             if (liveProfile.nationalityType === 'Foreign National') {
//                 currentDocs.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '', isFixed: true, isRequired: true });
//             }

//             const coreDocIds = ['id', 'appointment', 'permit'];
//             uploadedDocsArray.forEach((savedDoc: any) => {
//                 if (!coreDocIds.includes(savedDoc.id)) {
//                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
//                 }
//             });

//             setDocsList(currentDocs);
//         }
//     }, [liveProfile, isEditing]);

//     // 3. STRICT COMPLIANCE: Trigger Signature Modal
//     useEffect(() => {
//         if (liveProfile && Object.keys(liveProfile).length > 0 && !liveProfile.signatureUrl) {
//             setShowSignatureModal(true);
//         }
//     }, [liveProfile.signatureUrl]);


//     // ─── HANDLERS ─────────────────────────────────────────────────────────

//     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.files && e.target.files[0]) {
//             const file = e.target.files[0];
//             setProfilePhoto(file);
//             setPhotoPreview(URL.createObjectURL(file));
//         }
//     };

//     const handlePlaceSelected = (place: any) => {
//         const addressComponents = place.address_components;
//         const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";
//         const matchedProv = QCTO_PROVINCES.find(p => getComp("administrative_area_level_1").includes(p.value))?.value || '';

//         setFormData((prev: any) => ({
//             ...prev,
//             streetAddress: `${getComp("street_number")} ${getComp("route")}`.trim(),
//             city: getComp("locality") || getComp("sublocality_level_1"),
//             province: matchedProv,
//             postalCode: getComp("postal_code")
//         }));
//     };

//     const handleFileUpload = async (file: File, path: string) => {
//         const storageRef = ref(storage, path);
//         const snapshot = await uploadBytes(storageRef, file);
//         return await getDownloadURL(snapshot.ref);
//     };

//     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
//     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
//     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

//     const handleSave = async () => {
//         if (!targetId) return;
//         setSaving(true);

//         try {
//             let finalPhotoUrl = formData.profilePhotoUrl;
//             if (profilePhoto) {
//                 const ext = profilePhoto.name.split('.').pop();
//                 finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${targetId}/profile_${Date.now()}.${ext}`);
//             }

//             const finalUploadedDocs = [];
//             const legacyDocsObject: any = { ...(liveProfile.complianceDocs || {}) };

//             for (const docItem of docsList) {
//                 let finalUrl = docItem.url;
//                 if (docItem.file) {
//                     const ext = docItem.file.name.split('.').pop();
//                     finalUrl = await handleFileUpload(docItem.file, `staff/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
//                 }
//                 if (finalUrl) {
//                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
//                     if (docItem.id === 'id') legacyDocsObject.identificationUrl = finalUrl;
//                     if (docItem.id === 'appointment') legacyDocsObject.appointmentLetterUrl = finalUrl;
//                     if (docItem.id === 'permit') legacyDocsObject.workPermitUrl = finalUrl;
//                 }
//             }

//             const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
//             const postalCodeFinal = formData.sameAsResidential ? formData.postalCode : formData.customPostalCode;

//             const updatedData = {
//                 ...formData,
//                 postalAddress: postalLine1,
//                 customPostalCode: postalCodeFinal,
//                 profilePhotoUrl: finalPhotoUrl,
//                 uploadedDocuments: finalUploadedDocs,
//                 complianceDocs: legacyDocsObject,
//                 updatedAt: new Date().toISOString()
//             };

//             await onUpdate(targetId, updatedData);

//             // Cleanup edit state. The snapshot listener will instantly update liveProfile and the UI.
//             setIsEditing(false);
//             setProfilePhoto(null);

//         } catch (error) {
//             console.error('Update failed', error);
//             alert("Failed to update profile.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));

//     const isVerified = liveProfile?.profileCompleted === true;

//     // ─── RENDERERS ─────────────────────────────────────────────────────────

//     const renderDocumentVault = () => (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//             {isEditing ? (
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
//                     {docsList.map((docItem) => (
//                         <DynamicDocUpload key={docItem.id} document={docItem} onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)} onRemove={() => handleRemoveDocument(docItem.id)} />
//                     ))}
//                 </div>
//             ) : (
//                 <>
//                     {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
//                     {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
//                 </>
//             )}
//         </div>
//     );

//     const displayData = isEditing ? formData : liveProfile;
//     const isPostalSame = displayData.sameAsResidential !== false;

//     return (
//         <>
//             {showSignatureModal && (
//                 <SignatureSetupModal userUid={targetId} onComplete={() => { }} />
//             )}

//             <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

//                 {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
//                 <div className="wm-page-header">
//                     <div className="wm-page-header__left">
//                         <div className="wm-page-header__icon"><ShieldCheck size={22} /></div>
//                         <div>
//                             <h1 className="wm-page-header__title">Administrator Profile</h1>
//                             <p className="wm-page-header__desc">Manage your identity, contact details, and compliance documents.</p>
//                         </div>
//                     </div>
//                     {/* Header Action Button */}
//                     <button
//                         className={`wm-btn ${isEditing ? 'wm-btn--ghost' : 'wm-btn--primary'}`}
//                         onClick={() => {
//                             setIsEditing(!isEditing);
//                             if (isEditing) {
//                                 setProfilePhoto(null);
//                                 setPhotoPreview(liveProfile?.profilePhotoUrl || null);
//                             }
//                         }}
//                     >
//                         {isEditing ? <><X size={14} /> Cancel Edits</> : <><Edit3 size={14} /> Edit Profile</>}
//                     </button>
//                 </div>

//                 {/* ── VERIFICATION BANNER ── */}
//                 <div style={{ padding: '0 1.5rem', marginBottom: '1.5rem' }}>
//                     <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`} style={{ margin: 0, ...(isSuper ? { background: '#fef2f2', borderLeft: '5px solid #ef4444' } : isVerified ? { background: '#f1f5f9', borderLeftColor: '#0f172a' } : {}) }}>
//                         {isSuper ? <Shield size={22} color="#ef4444" className="lpv-banner__icon" /> : <ShieldCheck size={22} className="lpv-banner__icon" color={isVerified ? '#0f172a' : 'var(--mlab-amber)'} />}
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span className="lpv-banner__title" style={{ color: isSuper ? '#ef4444' : isVerified ? '#0f172a' : 'inherit', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     {isSuper ? 'Clearance Level: Platform Owner (Super Admin)' : `Administrator Status: ${isVerified ? 'Verified System Compiler' : 'Pending Verification'}`}
//                                 </span>
//                                 {liveProfile?.updatedAt && (
//                                     <span style={{ fontSize: '0.7rem', opacity: 0.7, fontStyle: 'italic', color: '#64748b' }}>
//                                         Last Updated: {new Date(liveProfile.updatedAt).toLocaleDateString()}
//                                     </span>
//                                 )}
//                             </div>
//                             <p className="lpv-banner__desc" style={{ color: isSuper ? '#991b1b' : isVerified ? '#475569' : 'inherit' }}>
//                                 {isSuper ? 'You have absolute authority over system configurations, access control, and master data.' : isVerified ? 'Your profile is authorized to compile and export QCTO LEISA data.' : 'Please update your details to ensure institutional exports are compliant.'}
//                             </p>
//                         </div>
//                     </div>
//                 </div>

//                 {/* ── MAIN CONTENT GRID ── */}
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '0 1.5rem' }}>

//                     {/* LEFT COLUMN: Identity & Address */}
//                     <div style={{ flex: '1 1 60%', display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: '350px' }}>

//                         {/* Panel 1: Identity */}
//                         <section className="wm-card" style={{ padding: '1.5rem' }}>
//                             <div className="wm-card__header" style={{ padding: 0, paddingBottom: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                                 <h3 className="wm-card__name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                     <User size={16} /> Identity &amp; Role Details
//                                 </h3>
//                             </div>

//                             <div className="lpv-profile-header" style={{ marginBottom: '2rem' }}>
//                                 <div className="lpv-avatar-wrapper">
//                                     <div className="lpv-avatar">
//                                         {photoPreview ? <img src={photoPreview} alt="Profile" style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> : <User size={30} color="#94a3b8" />}
//                                     </div>
//                                     {isEditing && (
//                                         <label className="lpv-avatar-upload" style={{ background: isSuper ? '#ef4444' : '#0f172a' }}>
//                                             <Camera size={14} /><input type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
//                                         </label>
//                                     )}
//                                 </div>
//                                 <div>
//                                     <h4 className="lpv-display-name">{displayData?.fullName || 'Administrator'}</h4>
//                                     <p className="lpv-display-sub">{isSuper ? 'Super Administrator' : (displayData?.jobTitle || 'Institutional Compiler')}</p>
//                                 </div>
//                             </div>

//                             <div className="lpv-grid-2">
//                                 <EditField label="Full Legal Name" value={displayData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
//                                 {!isSuper && <ROField label="Identity Number" value={liveProfile?.idNumber} icon={<Fingerprint size={13} />} />}
//                                 {!isSuper && <EditField label="Job Title" value={displayData?.jobTitle} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('jobTitle', val)} />}
//                                 <EditField label="Contact Number" value={displayData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
//                             </div>
//                             <div style={{ marginTop: '1.25rem' }}>
//                                 <ROField label="Email Address" value={displayData?.email} icon={<Mail size={13} />} />
//                             </div>
//                         </section>

//                         {/* Panel 2: Address */}
//                         {!isSuper && (
//                             <section className="wm-card" style={{ padding: '1.5rem' }}>
//                                 <div className="wm-card__header" style={{ padding: 0, paddingBottom: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                                     <h3 className="wm-card__name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <MapPin size={16} /> Residential Address
//                                     </h3>
//                                 </div>

//                                 {isEditing && (
//                                     <div style={{ marginBottom: '1.5rem' }}>
//                                         <div className="lpv-field__label">Address Search (Google Verified)</div>
//                                         <Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ types: [], componentRestrictions: { country: "za" } }} className="lpv-input" defaultValue={displayData.streetAddress} placeholder="Start typing your street name..." />
//                                     </div>
//                                 )}
//                                 <div className="lpv-grid-3">
//                                     <EditField label="Street Address" value={displayData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
//                                     <ROField label="City" value={displayData.city} />
//                                     <EditField label="Province" value={displayData.province} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('province', v)} />
//                                     <ROField label="Postal Code" value={displayData.postalCode} />
//                                 </div>

//                                 {isEditing ? (
//                                     <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.85rem' }}>
//                                             <input type="checkbox" checked={displayData.sameAsResidential} onChange={e => update('sameAsResidential', e.target.checked)} />
//                                             Postal Address is the same as Residential
//                                         </label>
//                                         {!displayData.sameAsResidential && (
//                                             <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
//                                                 <EditField label="Alternate Postal Address" value={displayData.postalAddress} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
//                                                 <EditField label="Alternate Postal Code" value={displayData.customPostalCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
//                                             </div>
//                                         )}
//                                     </div>
//                                 ) : (
//                                     <>
//                                         <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
//                                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
//                                             Postal Address
//                                             {isPostalSame && (
//                                                 <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>
//                                                     Same as Residential
//                                                 </span>
//                                             )}
//                                         </h4>
//                                         <div className="lpv-grid-2">
//                                             <ROField label="Address" value={isPostalSame ? displayData.streetAddress : displayData.postalAddress} />
//                                             <ROField label="Postal Code" value={isPostalSame ? displayData.postalCode : displayData.customPostalCode} />
//                                         </div>
//                                     </>
//                                 )}
//                             </section>
//                         )}
//                     </div>

//                     {/* RIGHT COLUMN: Sidebar Cards */}
//                     <aside style={{ flex: '1 1 30%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//                         <div className="wm-card" style={{ padding: '1.5rem', borderTopColor: isSuper ? '#ef4444' : '#0f172a', background: isSuper ? '#ef4444' : '#0f172a', color: 'white' }}>
//                             <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
//                                 <Briefcase size={13} /> {isSuper ? 'Clearance' : 'Official Title'}
//                             </div>
//                             <p style={{ margin: '0 0 10px', fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>{isSuper ? 'Super Admin' : (liveProfile?.jobTitle || 'Administrator')}</p>
//                             <span style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
//                                 System Role: {liveProfile?.role?.toUpperCase() || 'ADMIN'}
//                             </span>
//                         </div>

//                         {!isSuper && (
//                             <div className="wm-card" style={{ padding: '1.5rem' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                                     <h4 className="wm-card__name" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="var(--mlab-blue)" /> Compliance Vault</h4>
//                                     {isEditing && (
//                                         <button type="button" className="wm-btn wm-btn--ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={handleAddDocument}>
//                                             <Plus size={12} /> Add
//                                         </button>
//                                     )}
//                                 </div>
//                                 {renderDocumentVault()}
//                             </div>
//                         )}

//                         <div className="wm-card" style={{ padding: '1.5rem' }}>
//                             <div style={{ paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                                 <h4 className="wm-card__name" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={16} color="var(--mlab-blue)" /> Authorized Signature</h4>
//                                 <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '4px 0 0 0', lineHeight: 1.4 }}>Required for institutional sign-offs and certificates.</p>
//                             </div>

//                             <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100px', borderRadius: '6px' }}>
//                                 {liveProfile?.signatureUrl ? (
//                                     <>
//                                         <img src={liveProfile.signatureUrl} alt="Signature" style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }} />
//                                         {isEditing && (
//                                             <button type="button" onClick={(e) => { e.preventDefault(); setShowSignatureModal(true); }} style={{ marginTop: '10px', fontSize: '11px', color: '#0ea5e9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', fontWeight: 600 }}>
//                                                 <Edit3 size={11} /> Redraw Signature
//                                             </button>
//                                         )}
//                                     </>
//                                 ) : (
//                                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
//                                         <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>Action Required: Signature Missing</span>
//                                         <button type="button" className="wm-btn wm-btn--primary" onClick={(e) => { e.preventDefault(); setShowSignatureModal(true); }} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
//                                             <Plus size={12} /> Draw Signature
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* Save Button explicitly placed at the bottom of the sidebar */}
//                         {isEditing && (
//                             <button
//                                 className="wm-btn wm-btn--primary"
//                                 style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', fontSize: '0.85rem', background: isSuper ? '#ef4444' : 'var(--mlab-green)', borderColor: isSuper ? '#ef4444' : 'var(--mlab-green-dark)' }}
//                                 onClick={handleSave}
//                                 disabled={saving}
//                             >
//                                 {saving ? <><Loader2 size={16} className="spin" /> Saving Changes…</> : <><Save size={16} /> Confirm Changes</>}
//                             </button>
//                         )}
//                     </aside>
//                 </div>
//             </div>
//         </>
//     );
// };

// // Form Field Helpers
// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>{value || '—'}</div>
//     </div>
// );

// const EditField = ({ label, value, isEditing, onChange, icon, type = 'text', options = [] }: { label: string; value?: string | number; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[]; }) => {
//     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === String(value))?.label || value : value;
//     return (
//         <div>
//             <div className="lpv-field__label">{icon}{label}</div>
//             {isEditing ? (
//                 type === 'select' ? (
//                     <select className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)}>
//                         <option value="">Select...</option>
//                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
//                     </select>
//                 ) : <input type="text" className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)} />
//             ) : <div className={`lpv-field__value ${!displayValue ? ' lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>}
//         </div>
//     );
// };

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
//         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
//         {url ? <Info size={13} color="#0f172a" /> : <AlertCircle size={13} />}
//     </a>
// );
