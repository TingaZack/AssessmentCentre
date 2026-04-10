// src/pages/FacilitatorDashboard/FacilitatorProfileView/FacilitatorProfileView.tsx

import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
    Fingerprint, GraduationCap, AlertCircle, Info, Loader2, Camera,
    Briefcase, Globe, CheckCircle, Upload, Clock, PenTool, MapPin, Plus, Trash2,
    BookOpen
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";
import './FacilitatorProfileView.css';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';

// ─── DICTIONARIES ─────────────────────────────────────────────────────────
const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
].map(p => ({ label: p, value: p }));

interface ProfileProps {
    profile: any;
    user: any; // Note: 'user' here is the ADMIN doing the editing. 'profile' is the FACILITATOR being viewed.
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const FacilitatorProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isSigModalOpen, setIsSigModalOpen] = useState(false);

    const [liveProfile, setLiveProfile] = useState<any>(profile || {});

    // The Draft State (Only used when isEditing is true)
    const [formData, setFormData] = useState<any>({});

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Dynamic Document State
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

    const targetId = profile?.uid || profile?.id;

    // Determines the "Ink" color for the signature display based on role
    const getPenColor = () => {
        const role = liveProfile?.role?.toLowerCase();
        if (role === 'facilitator') return 'blue';
        if (role === 'assessor') return 'red';
        if (role === 'moderator') return 'green';
        return 'black';
    };

    // 1. REAL-TIME LISTENER: Keep liveProfile perfectly in sync with Firestore
    useEffect(() => {
        if (!targetId) return;

        const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveProfile(data);

                // If signature just arrived, close the modal automatically!
                if (data.signatureUrl && isSigModalOpen) {
                    setIsSigModalOpen(false);
                }
            }
        });

        return () => unsubscribe();
    }, [targetId, isSigModalOpen]);

    // 2. HYDRATE UI FROM LIVE PROFILE (Only when NOT editing)
    useEffect(() => {
        if (!isEditing && liveProfile) {
            const sameAsRes = liveProfile.sameAsResidential !== undefined
                ? liveProfile.sameAsResidential
                : (liveProfile.postalAddress === liveProfile.streetAddress || !liveProfile.postalAddress);

            setFormData({ ...liveProfile, sameAsResidential: sameAsRes });
            setPhotoPreview(liveProfile.profilePhotoUrl || null);

            // POPULATE DYNAMIC DOCUMENTS FROM PROFILE
            const legacyDocs = liveProfile.complianceDocs || {};
            const rawUploadedDocs = liveProfile.uploadedDocuments;
            const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

            const currentDocs: DynamicDocument[] = [
                { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '', isFixed: true, isRequired: true },
                { id: 'cv', name: 'Detailed CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: true },
                { id: 'fac_cert', name: 'Facilitator Certificate', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'fac_cert')?.url || legacyDocs.facilitatorCertUrl || '', isFixed: true, isRequired: false }
            ];

            // Conditionally add Work Permit if Foreign National
            if (liveProfile.nationalityType === 'Foreign National') {
                currentDocs.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '', isFixed: true, isRequired: true });
            }

            // Append custom documents
            const coreDocIds = ['id', 'cv', 'fac_cert', 'permit'];
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
        // If we have data, but no signature, force it open
        // We also ensure this only applies if the person viewing is the actual facilitator (not an Admin editing them)
        const isSelf = user?.uid === targetId;
        if (isSelf && liveProfile && Object.keys(liveProfile).length > 0 && !liveProfile.signatureUrl) {
            setIsSigModalOpen(true);
        }
    }, [liveProfile.signatureUrl, user?.uid, targetId]);

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
        if (!targetId) return;
        setSaving(true);

        try {
            let finalPhotoUrl = formData.profilePhotoUrl;

            // Upload new profile photo if changed
            if (profilePhoto) {
                const ext = profilePhoto.name.split('.').pop();
                finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${targetId}/profile_${Date.now()}.${ext}`);
            }

            // PROCESS ALL DYNAMIC DOCUMENTS
            const finalUploadedDocs = [];
            const legacyDocsObject: any = { ...(liveProfile.complianceDocs || {}) }; // Keep backward compatibility

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
                    if (docItem.id === 'cv') legacyDocsObject.cvUrl = finalUrl;
                    if (docItem.id === 'fac_cert') legacyDocsObject.facilitatorCertUrl = finalUrl;
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

    const update = (field: string, val: string | number | boolean) =>
        setFormData((prev: any) => ({ ...prev, [field]: val }));

    const isVerified = liveProfile?.profileCompleted === true;

    // We strictly determine if postal is mapped to residential for the UI
    const isPostalSame = formData.sameAsResidential !== false;

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

    // We use liveProfile for display unless we are actively editing
    const displayData = isEditing ? formData : liveProfile;

    return (
        <div className="lpv-wrapper animate-fade-in" style={{ padding: 16 }}>
            {/* STRICT SIGNATURE MODAL */}
            {isSigModalOpen && (
                <SignatureSetupModal
                    userUid={targetId}
                    onComplete={() => {
                        // The onSnapshot listener will automatically close this and update the UI!
                    }}
                />
            )}

            {/* Compliance Status Banner */}
            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck
                    size={22}
                    className="lpv-banner__icon"
                    color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
                />
                <div>
                    <span className="lpv-banner__title">
                        Practitioner Status: {isVerified ? 'Verified & Compliant' : 'Pending Verification'}
                    </span>
                    <p className="lpv-banner__desc">
                        {isVerified
                            ? 'Your profile meets all QCTO and institutional requirements.'
                            : 'Please ensure all compliance documents and details are updated.'}
                    </p>
                </div>
            </div>

            <div className="lpv-layout">
                <div className="lpv-main-stack">

                    {/* Identity & Demographics */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title">
                                <User size={16} /> Identity &amp; Contact
                            </h3>
                            <button
                                className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`}
                                onClick={() => {
                                    setIsEditing(!isEditing);
                                    if (isEditing) {
                                        // Cancel Edits
                                        setProfilePhoto(null);
                                        setPhotoPreview(liveProfile?.profilePhotoUrl || null);
                                    }
                                }}
                            >
                                {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        {/* PHOTO & BASIC INFO */}
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
                                        <input type="file" accept="image/jpeg, image/png, image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{displayData?.fullName || 'Facilitator'}</h4>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                                    {liveProfile?.role || 'Staff'}
                                </p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <EditField label="Full Legal Name" value={displayData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
                            <ROField label="National ID / Passport" value={liveProfile?.idNumber || liveProfile?.passportNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Contact Number" value={displayData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
                            <EditField label="Email Address" value={displayData?.email} icon={<Mail size={13} />} isEditing={isEditing} onChange={val => update('email', val)} />
                        </div>
                    </section>

                    {/* ADDRESS SECTION*/}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
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
                                    defaultValue={displayData.streetAddress}
                                    placeholder="Start typing your street name..."
                                />
                            </div>
                        )}

                        <div className="lpv-grid-3">
                            <EditField label="Street Address" value={displayData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                            <ROField label="City" value={displayData.city} />
                            <EditField label="Province" value={displayData.province} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('province', v)} />
                            <ROField label="Postal Code" value={displayData.postalCode} />
                        </div>

                        {/* Postal Address Logic */}
                        {isEditing ? (
                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={displayData.sameAsResidential}
                                        onChange={e => update('sameAsResidential', e.target.checked)}
                                    />
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

                    {/* Professional Experience */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title lpv-panel__title--simple">
                            <Briefcase size={16} /> Professional Experience
                        </h3>
                        <div className="lpv-grid-2">
                            <EditField label="Highest Qualification" value={displayData?.highestQualification} icon={<GraduationCap size={13} />} isEditing={isEditing} onChange={val => update('highestQualification', val)} />
                            <EditField label="Years Experience" value={displayData?.yearsExperience?.toString()} icon={<Clock size={13} />} isEditing={isEditing} onChange={val => update('yearsExperience', parseInt(val) || 0)} />
                        </div>
                        <div className="lpv-divider" />
                        <div className="lpv-fg">
                            <div className="lpv-field__label"><BookOpen size={13} /> Professional Bio & Expertise</div>
                            {isEditing ? (
                                <textarea className="lpv-input" rows={5} value={displayData?.bio || ''} onChange={e => update('bio', e.target.value)} style={{ resize: 'vertical' }} placeholder="Summarize your background..." />
                            ) : (
                                <div className="lpv-field__value" style={{ fontWeight: 'normal', lineHeight: '1.6', color: '#334155' }}>
                                    {liveProfile?.bio || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No professional bio provided.</span>}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SIGNATURE SECTION */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title">
                                <PenTool size={16} /> Official Digital Signature
                            </h3>
                            {isEditing && (
                                <button className="lpv-sig-edit-btn" onClick={(e) => { e.preventDefault(); setIsSigModalOpen(true); }}>
                                    <PenTool size={13} /> Update Signature
                                </button>
                            )}
                        </div>
                        <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                            {liveProfile?.signatureUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <TintedSignature imageUrl={liveProfile.signatureUrl} color={getPenColor()} />
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '10px' }}>
                                        Authenticated Digital Signature ({getPenColor()} ink)
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} /> No digital signature registered.
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Aside */}
                <aside className="lpv-aside">
                    <div className="lpv-qual-card">
                        <div className="lpv-qual-card__label"><GraduationCap size={13} /> Core Qualification</div>
                        <p className="lpv-qual-card__name">{liveProfile?.highestQualification || 'Not Specified'}</p>
                        <span className="lpv-qual-card__saqa">Experience: {liveProfile?.yearsExperience || 0} Years</span>
                    </div>

                    <div className="lpv-vault-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Compliance Vault</h4>
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

/* ── Helper Components ─────────────────────────────────────────────────────── */

export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
    const filterMap: any = {
        black: 'brightness(0)',
        blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
        red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
        green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
    };

    return (
        <img
            src={imageUrl}
            alt="Signature"
            style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }}
        />
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
    label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[];
}) => {
    const displayValue = type === 'select' && !isEditing
        ? options.find(o => o.value === value)?.label || value
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
                <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>
                    {displayValue || '—'}
                </div>
            )}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
    </a>
);




// import React, { useState, useEffect } from 'react';
// import {
//     User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
//     Fingerprint, GraduationCap, AlertCircle, Info, Loader2, Camera,
//     Briefcase, Globe, CheckCircle, Upload, Clock, PenTool, MapPin, Plus, Trash2,
//     BookOpen
// } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { storage } from '../../../lib/firebase';
// import Autocomplete from "react-google-autocomplete";
// import './FacilitatorProfileView.css';
// import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';
// import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

// // ─── DICTIONARIES ─────────────────────────────────────────────────────────
// const QCTO_PROVINCES = [
//     "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
//     "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
// ].map(p => ({ label: p, value: p }));

// interface ProfileProps {
//     profile: any;
//     user: any; // Note: 'user' here is the ADMIN doing the editing. 'profile' is the FACILITATOR being viewed.
//     onUpdate: (id: string, updates: any) => Promise<void>;
// }

// export const FacilitatorProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
//     const [isEditing, setIsEditing] = useState(false);
//     const [saving, setSaving] = useState(false);
//     const [formData, setFormData] = useState<any>({});
//     const [initialData, setInitialData] = useState<any>({});

//     const [isSigModalOpen, setIsSigModalOpen] = useState(false);

//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.profilePhotoUrl || null);

//     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);
//     const [initialDocsList, setInitialDocsList] = useState<DynamicDocument[]>([]);

//     // Determines the "Ink" color for the signature display based on role
//     const getPenColor = () => {
//         const role = profile?.role?.toLowerCase();
//         if (role === 'facilitator') return 'blue';
//         if (role === 'assessor') return 'red';
//         if (role === 'moderator') return 'green';
//         return 'black';
//     };

//     useEffect(() => {
//         if (profile) {
//             if (!isEditing) {
//                 // Safely load profile data and determine if postal is same as residential
//                 const sameAsRes = profile.sameAsResidential !== undefined
//                     ? profile.sameAsResidential
//                     : (profile.postalAddress === profile.streetAddress || !profile.postalAddress);

//                 const loadData = {
//                     ...profile,
//                     sameAsResidential: sameAsRes
//                 };

//                 setFormData(loadData);
//                 setInitialData(loadData);
//             }
//             if (!profilePhoto && profile.profilePhotoUrl) {
//                 setPhotoPreview(profile.profilePhotoUrl);
//             }

//             // POPULATE DYNAMIC DOCUMENTS FROM PROFILE
//             const legacyDocs = profile.complianceDocs || {};
//             const rawUploadedDocs = profile.uploadedDocuments;
//             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

//             const initialDocs: DynamicDocument[] = [
//                 {
//                     id: 'id',
//                     name: 'Certified ID / Passport Copy',
//                     file: null,
//                     url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '',
//                     isFixed: true,
//                     isRequired: true
//                 },
//                 {
//                     id: 'cv',
//                     name: 'Detailed CV',
//                     file: null,
//                     url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '',
//                     isFixed: true,
//                     isRequired: true
//                 },
//                 {
//                     id: 'fac_cert',
//                     name: 'Facilitator Certificate',
//                     file: null,
//                     url: uploadedDocsArray.find((d: any) => d.id === 'fac_cert')?.url || legacyDocs.facilitatorCertUrl || '',
//                     isFixed: true,
//                     isRequired: false
//                 }
//             ];

//             // Conditionally add Work Permit if Foreign National
//             if (profile.nationalityType === 'Foreign National') {
//                 initialDocs.splice(1, 0, {
//                     id: 'permit',
//                     name: 'Work Permit / Visa',
//                     file: null,
//                     url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '',
//                     isFixed: true,
//                     isRequired: true
//                 });
//             }

//             // Append custom documents
//             const coreDocIds = ['id', 'cv', 'fac_cert', 'permit'];
//             uploadedDocsArray.forEach((savedDoc: any) => {
//                 if (!coreDocIds.includes(savedDoc.id)) {
//                     initialDocs.push({
//                         id: savedDoc.id,
//                         name: savedDoc.name,
//                         file: null,
//                         url: savedDoc.url,
//                         isFixed: false,
//                         isRequired: false
//                     });
//                 }
//             });

//             setDocsList(initialDocs);
//             setInitialDocsList(JSON.parse(JSON.stringify(initialDocs))); // Deep copy for cancel check
//         }
//     }, [profile, isEditing, profilePhoto]);

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

//         let provString = getComp("administrative_area_level_1");
//         const matchedProv = QCTO_PROVINCES.find(p => provString.includes(p.value))?.value || '';

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

//     // DYNAMIC DOC HANDLERS
//     const handleAddDocument = () => {
//         setDocsList(prev => [
//             ...prev,
//             { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }
//         ]);
//     };

//     const handleRemoveDocument = (id: string) => {
//         setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
//     };

//     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => {
//         setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));
//     };

//     const handleSave = async () => {
//         const targetId = profile?.uid || profile?.id;
//         if (!targetId) return;

//         const hasFormChanges = JSON.stringify(formData) !== JSON.stringify(initialData);
//         const hasPhotoChanges = profilePhoto !== null;

//         // Check for document changes
//         const hasDocChanges = docsList.some(d => d.file !== null) ||
//             docsList.length !== initialDocsList.length ||
//             JSON.stringify(docsList.map(d => d.name)) !== JSON.stringify(initialDocsList.map(d => d.name));

//         if (!hasFormChanges && !hasPhotoChanges && !hasDocChanges) {
//             setIsEditing(false);
//             return;
//         }

//         setSaving(true);
//         try {
//             let finalPhotoUrl = formData.profilePhotoUrl;

//             // Upload new profile photo if changed
//             if (profilePhoto && targetId) {
//                 const ext = profilePhoto.name.split('.').pop();
//                 finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${targetId}/profile_${Date.now()}.${ext}`);
//             }

//             // PROCESS ALL DYNAMIC DOCUMENTS
//             const finalUploadedDocs = [];
//             const legacyDocsObject: any = { ...(profile.complianceDocs || {}) }; // Keep backward compatibility

//             for (const docItem of docsList) {
//                 let finalUrl = docItem.url;

//                 // Upload newly selected file
//                 if (docItem.file) {
//                     const ext = docItem.file.name.split('.').pop();
//                     finalUrl = await handleFileUpload(docItem.file, `staff/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
//                 }

//                 if (finalUrl) {
//                     finalUploadedDocs.push({
//                         id: docItem.id,
//                         name: docItem.name || 'Untitled Document',
//                         url: finalUrl
//                     });

//                     // Map to legacy fields for backward compatibility
//                     if (docItem.id === 'id') legacyDocsObject.identificationUrl = finalUrl;
//                     if (docItem.id === 'cv') legacyDocsObject.cvUrl = finalUrl;
//                     if (docItem.id === 'fac_cert') legacyDocsObject.facilitatorCertUrl = finalUrl;
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
//                 uploadedDocuments: finalUploadedDocs, // 👈 New robust array format
//                 complianceDocs: legacyDocsObject      // 👈 Legacy fallback
//             };

//             await onUpdate(targetId, updatedData);

//             setIsEditing(false);
//             setProfilePhoto(null);

//             // Sync initial states
//             setInitialData(updatedData);
//             setInitialDocsList(JSON.parse(JSON.stringify(docsList)));

//         } catch (error) {
//             console.error('Update failed', error);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: any) => setFormData((prev: any) => ({ ...prev, [field]: val }));

//     const isVerified = profile?.profileCompleted === true;

//     // DYNAMIC DOCUMENT VAULT RENDERER
//     const renderDocumentVault = () => {
//         return (
//             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//                 {isEditing ? (
//                     // EDIT MODE: Render dynamic upload cards
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
//                         {docsList.map((docItem) => (
//                             <DynamicDocUpload
//                                 key={docItem.id}
//                                 document={docItem}
//                                 onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
//                                 onRemove={() => handleRemoveDocument(docItem.id)}
//                             />
//                         ))}
//                     </div>
//                 ) : (
//                     // READ-ONLY MODE: Render standard links
//                     <>
//                         {docsList.map((docItem, index) => (
//                             <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />
//                         ))}
//                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
//                     </>
//                 )}
//             </div>
//         );
//     };

//     return (
//         <div className="lpv-wrapper animate-fade-in" style={{ padding: 16 }}>
//             {/* SIGNATURE EDIT MODAL */}
//             {isSigModalOpen && (
//                 <SignatureSetupModal
//                     userUid={profile.uid || profile.id}
//                     onComplete={() => {
//                         setIsSigModalOpen(false);
//                         window.location.reload();
//                     }}
//                 />
//             )}

//             {/* Compliance Status Banner */}
//             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
//                 <ShieldCheck
//                     size={22}
//                     className="lpv-banner__icon"
//                     color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
//                 />
//                 <div>
//                     <span className="lpv-banner__title">
//                         Practitioner Status: {isVerified ? 'Verified & Compliant' : 'Pending Verification'}
//                     </span>
//                     <p className="lpv-banner__desc">
//                         {isVerified
//                             ? 'Your profile meets all QCTO and institutional requirements.'
//                             : 'Please ensure all compliance documents and details are updated.'}
//                     </p>
//                 </div>
//             </div>

//             <div className="lpv-layout">
//                 <div className="lpv-main-stack">

//                     {/* Identity & Demographics */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title">
//                                 <User size={16} /> Identity &amp; Contact
//                             </h3>
//                             <button
//                                 className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`}
//                                 onClick={() => {
//                                     setIsEditing(!isEditing);
//                                     if (isEditing) {
//                                         // Cancel Edits
//                                         setFormData(initialData);
//                                         setDocsList(JSON.parse(JSON.stringify(initialDocsList)));
//                                         setPhotoPreview(profile?.profilePhotoUrl || null);
//                                         setProfilePhoto(null);
//                                     }
//                                 }}
//                             >
//                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
//                             </button>
//                         </div>

//                         {/* PHOTO & BASIC INFO */}
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                             <div style={{ position: 'relative' }}>
//                                 <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
//                                     {photoPreview ? (
//                                         <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//                                     ) : (
//                                         <User size={36} color="#94a3b8" />
//                                     )}
//                                 </div>
//                                 {isEditing && (
//                                     <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-blue)', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}>
//                                         <Camera size={14} />
//                                         <input type="file" accept="image/jpeg, image/png, image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
//                                     </label>
//                                 )}
//                             </div>
//                             <div>
//                                 <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{formData?.fullName || profile?.fullName || 'Facilitator'}</h4>
//                                 <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
//                                     {profile?.role || 'Staff'}
//                                 </p>
//                             </div>
//                         </div>

//                         <div className="lpv-grid-2">
//                             <EditField label="Full Legal Name" value={formData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
//                             <ROField label="National ID / Passport" value={profile?.idNumber || profile?.passportNumber} icon={<Fingerprint size={13} />} />
//                             <EditField label="Contact Number" value={formData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
//                             <EditField label="Email Address" value={formData?.email} icon={<Mail size={13} />} isEditing={isEditing} onChange={val => update('email', val)} />
//                         </div>
//                     </section>

//                     {/* ADDRESS SECTION*/}
//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
//                             <MapPin size={16} /> Residential Address
//                         </h3>

//                         {isEditing && (
//                             <div style={{ marginBottom: '1rem' }}>
//                                 <div className="lpv-field__label">Address Search (Google Verified)</div>
//                                 <Autocomplete
//                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                     onPlaceSelected={handlePlaceSelected}
//                                     options={{ types: [], componentRestrictions: { country: "za" } }}
//                                     className="lpv-input"
//                                     defaultValue={formData.streetAddress}
//                                     placeholder="Start typing your street name..."
//                                 />
//                             </div>
//                         )}

//                         <div className="lpv-grid-3">
//                             <EditField label="Street Address" value={formData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
//                             <ROField label="City" value={formData.city} />
//                             <EditField label="Province" value={formData.province} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('province', v)} />
//                             <ROField label="Postal Code" value={formData.postalCode} />
//                         </div>

//                         {/* Postal Address Logic */}
//                         {isEditing ? (
//                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
//                                     <input
//                                         type="checkbox"
//                                         checked={formData.sameAsResidential}
//                                         onChange={e => update('sameAsResidential', e.target.checked)}
//                                     />
//                                     Postal Address is the same as Residential
//                                 </label>
//                                 {!formData.sameAsResidential && (
//                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
//                                         <EditField label="Alternate Postal Address" value={formData.postalAddress} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
//                                         <EditField label="Alternate Postal Code" value={formData.customPostalCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
//                                     </div>
//                                 )}
//                             </div>
//                         ) : (
//                             !formData.sameAsResidential && (
//                                 <>
//                                     <div className="lpv-divider" />
//                                     <h4 style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Postal Address</h4>
//                                     <div className="lpv-grid-2">
//                                         <ROField label="Address" value={formData.postalAddress} />
//                                         <ROField label="Postal Code" value={formData.customPostalCode} />
//                                     </div>
//                                 </>
//                             )
//                         )}
//                     </section>

//                     {/* Professional Experience */}
//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title lpv-panel__title--simple">
//                             <Briefcase size={16} /> Professional Experience
//                         </h3>
//                         <div className="lpv-grid-2">
//                             <EditField label="Highest Qualification" value={formData?.highestQualification} icon={<GraduationCap size={13} />} isEditing={isEditing} onChange={val => update('highestQualification', val)} />
//                             <EditField label="Years Experience" value={formData?.yearsExperience?.toString()} icon={<Clock size={13} />} isEditing={isEditing} onChange={val => update('yearsExperience', parseInt(val) || 0)} />
//                         </div>
//                         <div className="lpv-divider" />
//                         <div className="lpv-fg">
//                             <div className="lpv-field__label"><BookOpen size={13} /> Professional Bio & Expertise</div>
//                             {isEditing ? (
//                                 <textarea className="lpv-input" rows={5} value={formData?.bio || ''} onChange={e => update('bio', e.target.value)} style={{ resize: 'vertical' }} placeholder="Summarize your background..." />
//                             ) : (
//                                 <div className="lpv-field__value" style={{ fontWeight: 'normal', lineHeight: '1.6', color: '#334155' }}>
//                                     {profile?.bio || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No professional bio provided.</span>}
//                                 </div>
//                             )}
//                         </div>
//                     </section>

//                     {/* SIGNATURE SECTION */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title">
//                                 <PenTool size={16} /> Official Digital Signature
//                             </h3>
//                             {isEditing && (
//                                 <button className="lpv-sig-edit-btn" onClick={() => setIsSigModalOpen(true)}>
//                                     <PenTool size={13} /> Update Signature
//                                 </button>
//                             )}
//                         </div>
//                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
//                             {profile?.signatureUrl ? (
//                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//                                     <TintedSignature imageUrl={profile.signatureUrl} color={getPenColor()} />
//                                     <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '10px' }}>
//                                         Authenticated Digital Signature ({getPenColor()} ink)
//                                     </span>
//                                 </div>
//                             ) : (
//                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
//                                     <AlertCircle size={16} /> No digital signature registered.
//                                 </div>
//                             )}
//                         </div>
//                     </section>
//                 </div>

//                 {/* Aside */}
//                 <aside className="lpv-aside">
//                     <div className="lpv-qual-card">
//                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Core Qualification</div>
//                         <p className="lpv-qual-card__name">{profile?.highestQualification || 'Not Specified'}</p>
//                         <span className="lpv-qual-card__saqa">Experience: {profile?.yearsExperience || 0} Years</span>
//                     </div>

//                     <div className="lpv-vault-card">
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
//                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Compliance Vault</h4>
//                             {isEditing && (
//                                 <button
//                                     className="lpv-edit-btn"
//                                     style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
//                                     onClick={handleAddDocument}
//                                 >
//                                     <Plus size={12} /> Add
//                                 </button>
//                             )}
//                         </div>

//                         {/* RENDER DYNAMIC DOCUMENTS */}
//                         {renderDocumentVault()}
//                     </div>

//                     {isEditing && (
//                         <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
//                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
//                         </button>
//                     )}
//                 </aside>
//             </div>
//         </div>
//     );
// };

// /* ── Helper Components ─────────────────────────────────────────────────────── */

// export const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
//     const filterMap: any = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
//     };

//     return (
//         <img
//             src={imageUrl}
//             alt="Signature"
//             style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain', filter: filterMap[color] || 'none' }}
//         />
//     );
// };

// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>{value || '—'}</div>
//     </div>
// );

// const EditField = ({
//     label, value, isEditing, onChange, icon, type = 'text', options = []
// }: {
//     label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[];
// }) => {
//     const displayValue = type === 'select' && !isEditing
//         ? options.find(o => o.value === value)?.label || value
//         : value;

//     return (
//         <div>
//             <div className="lpv-field__label">{icon}{label}</div>
//             {isEditing ? (
//                 type === 'select' ? (
//                     <select className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)}>
//                         <option value="">Select...</option>
//                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
//                     </select>
//                 ) : (
//                     <input type="text" className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)} />
//                 )
//             ) : (
//                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>
//                     {displayValue || '—'}
//                 </div>
//             )}
//         </div>
//     );
// };

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
//         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
//         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
//     </a>
// );