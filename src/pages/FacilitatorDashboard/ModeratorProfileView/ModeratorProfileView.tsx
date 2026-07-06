// src/pages/FacilitatorDashboard/ModeratorProfileView/ModeratorProfileView.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
    Fingerprint, GraduationCap, AlertCircle, Info, Loader2,
    Camera, Award, Calendar, Briefcase, PenTool, Scale, MapPin, Plus, History, Eye
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";

import '../AssessorProfileView/AssessorProfileView.css';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import { useStore } from '../../../store/useStore';

// ─── DICTIONARIES ─────────────────────────────────────────────────────────
const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
].map(p => ({ label: p, value: p }));

// 🚀 HELPER: Extracts the readable filename directly from the Firebase Storage URL
const extractFilename = (url: string) => {
    if (!url) return 'Saved Document';
    try {
        const decoded = decodeURIComponent(url.split('?')[0]);
        const parts = decoded.split('/');
        return parts[parts.length - 1];
    } catch {
        return 'Saved Document';
    }
};

interface ProfileProps {
    profile?: any;
    user: any;
    onUpdate: (id: string, updates: any) => Promise<void>;
    hideSignaturePrompt?: boolean;
}

export const ModeratorProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate, hideSignaturePrompt = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Modal state controller
    const [isSigModalOpen, setIsSigModalOpen] = useState(false);
    const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false); // 🚀 Overwrite Shield State

    const [liveProfile, setLiveProfile] = useState<any>(profile || user || {});
    const [formData, setFormData] = useState<any>({});
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

    const targetId = profile?.uid || profile?.id || user?.uid;

    const { employers, fetchEmployers } = useStore();

    useEffect(() => {
        if (employers.length === 0) {
            fetchEmployers();
        }
    }, [employers.length, fetchEmployers]);

    // 1. REAL-TIME LISTENER: Keep liveProfile perfectly in sync with Firestore
    useEffect(() => {
        if (!targetId) return;

        const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveProfile((prev: any) => ({
                    ...prev,
                    ...data,
                    documentHistory: prev.documentHistory || data.documentHistory || [] // 🚀 Track history
                }));
            }
        });

        return () => unsubscribe();
    }, [targetId]);

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
                { id: 'moderator_cert', name: 'Moderator Certificate', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'moderator_cert')?.url || legacyDocs.moderatorCertUrl || '', isFixed: true, isRequired: true },
                { id: 'reg_letter', name: 'SETA Reg. Letter', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'reg_letter')?.url || legacyDocs.regLetterUrl || '', isFixed: true, isRequired: true },
                { id: 'cv', name: 'Detailed QA CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
            ];

            // Conditionally add Work Permit if Foreign National
            if (liveProfile.nationalityType === 'Foreign National') {
                currentDocs.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '', isFixed: true, isRequired: true });
            }

            // Append custom documents
            const coreDocIds = ['id', 'cv', 'moderator_cert', 'reg_letter', 'permit'];
            uploadedDocsArray.forEach((savedDoc: any) => {
                if (!coreDocIds.includes(savedDoc.id)) {
                    currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
                }
            });

            setDocsList(currentDocs);
        }
    }, [liveProfile, isEditing]);

    // 3. STRICT COMPLIANCE: Trigger Signature Modal automatically if missing
    useEffect(() => {
        if (hideSignaturePrompt) return;

        if (liveProfile && Object.keys(liveProfile).length > 0 && !liveProfile.signatureUrl && ['assessor', 'moderator', 'facilitator'].includes(liveProfile.role)) {
            setIsSigModalOpen(true);
        }
    }, [liveProfile.signatureUrl, liveProfile.role, hideSignaturePrompt]);

    // ─── Handlers ──────────────────────────────────────────────────────────
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

    // 🚀 NEW: Overwrite Shield
    const handleSaveClick = () => {
        const isOverwriting = docsList.some(d => d.file && d.url);

        if (isOverwriting) {
            setConfirmDocOverwrite(true);
        } else {
            executeSave();
        }
    };

    const executeSave = async () => {
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
            const legacyDocsObject: any = { ...(liveProfile.complianceDocs || {}) };
            const newHistory = [...(liveProfile.documentHistory || [])]; // 🚀 Track history

            for (const docItem of docsList) {
                let finalUrl = docItem.url;

                // Upload newly selected file
                if (docItem.file) {
                    // Archive the old document before overwriting
                    if (docItem.url) {
                        newHistory.push({
                            id: docItem.id,
                            name: docItem.name || 'Legacy Document',
                            url: docItem.url,
                            replacedAt: new Date().toISOString()
                        });
                    }

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
                    if (docItem.id === 'moderator_cert') legacyDocsObject.moderatorCertUrl = finalUrl;
                    if (docItem.id === 'reg_letter') legacyDocsObject.regLetterUrl = finalUrl;
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
                documentHistory: newHistory, // 👈 Save the audit trail
                complianceDocs: legacyDocsObject,
                updatedAt: new Date().toISOString()
            };

            await onUpdate(profile?.id || targetId, updatedData);

            // Cleanup edit state
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

    // Determine Role Formatting
    const roleLabel = (liveProfile?.role || 'staff').charAt(0).toUpperCase() + (liveProfile?.role || 'staff').slice(1).replace('_', ' ');

    // DYNAMIC DOCUMENT VAULT RENDERER
    const renderDocumentVault = () => {
        return (
            <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {isEditing ? (
                    // EDIT MODE: Render dynamic upload cards
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {docsList.map((docItem) => (
                            <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <DynamicDocUpload
                                    document={docItem}
                                    onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
                                    onRemove={() => handleRemoveDocument(docItem.id)}
                                />
                                {/* 🚀 Visual preview for existing files during edit */}
                                {docItem.url && !docItem.file && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <FileText size={14} color="var(--mlab-green)" />
                                            <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
                                        </span>
                                        <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-green)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            <Eye size={14} /> View File
                                        </a>
                                    </div>
                                )}
                            </div>
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

                {/* 🚀 Document History Log Renderer */}
                {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <History size={14} /> Document History Log
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
                                <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-green)', textDecoration: 'none' }}>
                                        <FileText size={14} /> {hDoc.name || 'Archived Document'}
                                    </a>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // We use liveProfile for display unless we are actively editing
    const displayData = isEditing ? formData : liveProfile;

    return (
        <div className="lpv-wrapper animate-fade-in">

            {/* 🚀 Overwrite Confirmation Modal */}
            {confirmDocOverwrite && createPortal(
                <StatusModal
                    type="warning"
                    title="Overwrite Existing Documents?"
                    message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
                    confirmText="Yes, Overwrite"
                    onClose={() => {
                        setConfirmDocOverwrite(false);
                        executeSave();
                    }}
                    onCancel={() => setConfirmDocOverwrite(false)}
                />,
                document.body
            )}

            {/* STRICT SIGNATURE MODAL */}
            {isSigModalOpen && createPortal(
                <SignatureSetupModal
                    userUid={targetId}
                    existingSignatureUrl={liveProfile?.signatureUrl}
                    onComplete={() => {
                        setIsSigModalOpen(false);
                    }}
                />,
                document.body
            )}

            {/* ── Practitioner Status Banner ────────────────────────────── */}
            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <Scale
                    size={22}
                    className="lpv-banner__icon"
                    color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
                />
                <div>
                    <span className="lpv-banner__title">
                        Internal QA Status: {isVerified ? 'Verified & Authorized' : 'Pending Verification'}
                    </span>
                    <p className="lpv-banner__desc">
                        {isVerified
                            ? 'Your credentials meet all QCTO regulatory requirements.'
                            : 'Compliance audit in progress. Ensure your registration number and signature are configured.'}
                    </p>
                </div>
            </div>

            <div className="lpv-layout">
                <div className="lpv-main-stack">

                    {/* Identity & Contact Section */}
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

                        {/* PROFILE PHOTO AREA */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Profile" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={36} color="#94a3b8" />
                                    )}
                                </div>
                                {isEditing && (
                                    <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-green)', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}>
                                        <Camera size={14} />
                                        <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{displayData?.fullName || 'Practitioner'}</h4>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                                    System Role: <strong>{roleLabel}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <EditField label="Full Legal Name" value={displayData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
                            <ROField label="Identity Number" value={liveProfile?.idNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Contact Number" value={displayData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
                            <ROField label="Email Address" value={liveProfile?.email} icon={<Mail size={13} />} />
                        </div>
                    </section>

                    {/* ADDRESS SECTION */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-green)' }}>
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

                    {/* VISIBLE SIGNATURE PREVIEW SECTION */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title">
                                <PenTool size={16} /> Digital Signature Certificate
                            </h3>
                            {!hideSignaturePrompt && (
                                <button
                                    className="lpv-edit-btn"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setIsSigModalOpen(true);
                                    }}
                                >
                                    <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
                                </button>
                            )}
                        </div>
                        <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                            {liveProfile?.signatureUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ background: 'white', padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%', maxWidth: '350px' }}>
                                        <img
                                            src={liveProfile.signatureUrl}
                                            alt="Registered Moderator Signature"
                                            crossOrigin="anonymous"
                                            style={{
                                                height: '60px',
                                                width: '100%',
                                                objectFit: 'contain',
                                                // FIXED: Applies the exact Green Ink filter used in the review dashboard!
                                                filter: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
                                            }}
                                        />
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-green-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
                                        Internal Moderator Signature (Green Ink)
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: 'var(--mlab-amber)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} /> No digital signature found.
                                </div>
                            )}
                        </div>

                        {/* 🚀 SIGNATURE HISTORY RENDERER */}
                        {liveProfile?.signatureHistory && liveProfile.signatureHistory.length > 0 && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <History size={14} /> Signature History Log
                                </h4>
                                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
                                    {liveProfile.signatureHistory.map((sig: any, idx: number) => (
                                        <div key={idx} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', minWidth: '120px', textAlign: 'center', flexShrink: 0 }}>
                                            <img
                                                src={sig.url}
                                                alt={`Historical Signature ${idx}`}
                                                crossOrigin="anonymous"
                                                style={{ height: '35px', width: '100%', objectFit: 'contain', marginBottom: '8px' }}
                                            />
                                            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>
                                                {new Date(sig.date).toLocaleDateString()}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                                                {new Date(sig.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            Signatures are color-coded to Green Ink for official QA endorsement declarations per QCTO compliance standards.
                        </p>
                    </section>

                    {/* Registration & Scope Section */}
                    <section className="lpv-panel">
                        <h3 className="lpv-panel__title lpv-panel__title--simple">
                            <ShieldCheck size={16} /> QCTO Moderation Scope
                        </h3>

                        <div className="lpv-grid-2">
                            <EditField label="Moderator Reg. Number" value={displayData?.moderatorRegNumber} icon={<ShieldCheck size={13} />} isEditing={isEditing} onChange={val => update('moderatorRegNumber', val)} />
                            <EditField label="Assessor Reg. Number" value={displayData?.assessorRegNumber} icon={<Award size={13} />} isEditing={isEditing} onChange={val => update('assessorRegNumber', val)} />
                            <EditField label="Primary SETA" value={displayData?.primarySeta} icon={<Award size={13} />} isEditing={isEditing} onChange={val => update('primarySeta', val)} />
                            <EditField label="Specialization Scope" value={displayData?.specializationScope} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('specializationScope', val)} />
                            <EditField label="Reg. Expiry Date" value={displayData?.registrationExpiry} icon={<Calendar size={13} />} isEditing={isEditing} type="text" onChange={val => update('registrationExpiry', val)} />
                        </div>

                        <div className="lpv-divider" />

                        <div className="lpv-fg">
                            <div className="lpv-field__label"><Info size={13} /> Professional Bio</div>
                            {isEditing ? (
                                <textarea
                                    className="lpv-input"
                                    rows={5}
                                    value={displayData?.bio || ''}
                                    onChange={e => update('bio', e.target.value)}
                                    style={{ resize: 'vertical' }}
                                />
                            ) : (
                                <div className="lpv-field__value" style={{ fontWeight: 'normal', lineHeight: '1.6', textAlign: 'justify', color: '#334155' }}>
                                    {liveProfile?.bio || 'No professional bio provided.'}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* ── Aside: Qualifications & Docs ────────────────────────── */}
                <aside className="lpv-aside">

                    <div className="lpv-qual-card" style={{ background: 'var(--mlab-green)' }}>
                        <div className="lpv-qual-card__label">
                            <GraduationCap size={13} /> Highest Qualification
                        </div>
                        <p className="lpv-qual-card__name">
                            {liveProfile?.highestQualification || 'Not Specified'}
                        </p>
                        <span className="lpv-qual-card__saqa">
                            Experience: {liveProfile?.yearsExperience || 0} Years
                        </span>
                    </div>

                    <div className="lpv-vault-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 className="lpv-vault-card__title" style={{ margin: 0 }}>
                                <ShieldCheck size={15} /> Compliance Vault
                            </h4>
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
                        <button className="lpv-save-btn" style={{ background: 'var(--mlab-green)' }} onClick={handleSaveClick} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* ── Typed Helpers ───────────────────────────────────────────────────────── */

const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div>
        <div className="lpv-field__label">{icon}{label}</div>
        <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
            {value || '—'}
        </div>
    </div>
);

const EditField = ({ label, value, isEditing, onChange, icon, type = 'text', options = [] }: { label: string; value?: string | number; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string, value: string }[]; }) => {
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
                <div className={`lpv-field__value${!displayValue ? ' lpv-field__value--empty' : ''}`}>
                    {displayValue || '—'}
                </div>
            )}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="var(--mlab-green)" /> : <AlertCircle size={13} />}
    </a>
);