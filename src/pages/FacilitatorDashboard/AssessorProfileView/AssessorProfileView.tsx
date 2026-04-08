import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
    Fingerprint, GraduationCap, AlertCircle, Info, Loader2,
    Camera, Award, Calendar, Briefcase, PenTool, Clock, MapPin, Plus, Trash2, CheckCircle, Upload
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";
import './AssessorProfileView.css';
import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';



// ─── DICTIONARIES ─────────────────────────────────────────────────────────
const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
].map(p => ({ label: p, value: p }));

interface ProfileProps {
    profile: any; // The user object from Firestore
    user: any;    // The current auth user (Admin/Manager viewing)
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const AssessorProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isSigModalOpen, setIsSigModalOpen] = useState(false);

    const [formData, setFormData] = useState<any>({});
    const [initialData, setInitialData] = useState<any>({});

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.profilePhotoUrl || null);

    // Dynamic Document State
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);
    const [initialDocsList, setInitialDocsList] = useState<DynamicDocument[]>([]);

    // STRICT COMPLIANCE: Assessor Pen is always RED
    const inkColor = 'red';

    // Sync data when 'profile' prop arrives from Firestore
    useEffect(() => {
        if (profile) {
            if (!isEditing) {
                // Safely load profile data and determine if postal is same as residential
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
                    id: 'assessor_cert',
                    name: 'Assessor Certificate',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'assessor_cert')?.url || legacyDocs.assessorCertUrl || '',
                    isFixed: true,
                    isRequired: true
                },
                {
                    id: 'reg_letter',
                    name: 'SETA Reg. Letter',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'reg_letter')?.url || legacyDocs.regLetterUrl || '',
                    isFixed: true,
                    isRequired: true
                },
                {
                    id: 'cv',
                    name: 'Detailed CV',
                    file: null,
                    url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '',
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

            // Append any additional custom documents
            const coreDocIds = ['id', 'cv', 'assessor_cert', 'reg_letter', 'permit'];
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

    const handleSave = async () => {
        const targetId = profile?.uid || profile?.id;
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
                    if (docItem.id === 'cv') legacyDocsObject.cvUrl = finalUrl;
                    if (docItem.id === 'assessor_cert') legacyDocsObject.assessorCertUrl = finalUrl;
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
                uploadedDocuments: finalUploadedDocs, // 👈 New robust array format
                complianceDocs: legacyDocsObject      // 👈 Legacy fallback
            };

            await onUpdate(targetId, updatedData);

            setIsEditing(false);
            setProfilePhoto(null);

            // Sync initial states
            setInitialData(updatedData);
            setInitialDocsList(JSON.parse(JSON.stringify(docsList)));

        } catch (error) {
            console.error('Update failed', error);
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: string | number | boolean) =>
        setFormData((prev: any) => ({ ...prev, [field]: val }));

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
        <div className="lpv-wrapper animate-fade-in">

            {/* SIGNATURE MODAL */}
            {isSigModalOpen && (
                <SignatureSetupModal
                    userUid={profile.uid || profile.id}
                    onComplete={() => {
                        setIsSigModalOpen(false);
                        window.location.reload(); // Refresh to sync the new signature from Firestore
                    }}
                />
            )}

            {/* ── Practitioner Status Banner ────────────────────────────── */}
            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck
                    size={22}
                    className="lpv-banner__icon"
                    color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
                />
                <div>
                    <span className="lpv-banner__title">
                        Practitioner Status: {isVerified ? 'Verified & Registered' : 'Pending Verification'}
                    </span>
                    <p className="lpv-banner__desc">
                        {isVerified
                            ? 'Your credentials meet all QCTO regulatory requirements.'
                            : 'Compliance audit in progress. Ensure all documents are uploaded.'}
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
                                        setFormData(initialData);
                                        setDocsList(JSON.parse(JSON.stringify(initialDocsList)));
                                        setPhotoPreview(profile?.profilePhotoUrl || null);
                                        setProfilePhoto(null);
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
                                <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{formData?.fullName || 'Practitioner'}</h4>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                                    {isEditing ? 'Click the camera icon to update your photo.' : 'Registered Assessor'}
                                </p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <EditField label="Full Legal Name" value={formData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
                            <ROField label="National ID / Passport" value={profile?.idNumber || profile?.passportNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Contact Number" value={formData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
                            <ROField label="Email Address" value={profile?.email} icon={<Mail size={13} />} />
                        </div>
                    </section>

                    {/* ADDRESS SECTION */}
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

                        {/* Postal Address Logic */}
                        {isEditing ? (
                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.sameAsResidential}
                                        onChange={e => update('sameAsResidential', e.target.checked)}
                                    />
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
                                    <h4 style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Postal Address</h4>
                                    <div className="lpv-grid-2">
                                        <ROField label="Address" value={formData.postalAddress} />
                                        <ROField label="Postal Code" value={formData.customPostalCode} />
                                    </div>
                                </>
                            )
                        )}
                    </section>

                    {/* SIGNATURE SECTION */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title">
                                <PenTool size={16} /> Digital Signature Certificate
                            </h3>
                            {isEditing && (
                                <button className="lpv-sig-edit-btn" onClick={() => setIsSigModalOpen(true)}>
                                    <Edit3 size={12} /> Update Signature
                                </button>
                            )}
                        </div>
                        <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                            {profile?.signatureUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <TintedSignature imageUrl={profile.signatureUrl} color={inkColor} />
                                    <span style={{ fontSize: '0.7rem', color: inkColor, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
                                        Registered Assessor Signature (Red Ink)
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} /> No digital signature found.
                                </div>
                            )}
                        </div>
                        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            Signatures are color-coded to Red Ink for official assessment declarations per QCTO compliance standards.
                        </p>
                    </section>

                    {/* Registration & Scope Section */}
                    <section className="lpv-panel">
                        <h3 className="lp-panel__title lpv-panel__title--simple">
                            <Award size={16} /> QCTO Registration Scope
                        </h3>

                        <div className="lpv-grid-2">
                            <EditField label="Assessor Reg. Number" value={formData?.assessorRegNumber} icon={<ShieldCheck size={13} />} isEditing={isEditing} onChange={val => update('assessorRegNumber', val)} />
                            <EditField label="Primary SETA" value={formData?.primarySeta} icon={<Award size={13} />} isEditing={isEditing} onChange={val => update('primarySeta', val)} />
                            <EditField label="Specialization Scope" value={formData?.specializationScope} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('specializationScope', val)} />
                            <EditField label="Reg. Expiry Date" value={formData?.registrationExpiry} icon={<Calendar size={13} />} isEditing={isEditing} onChange={val => update('registrationExpiry', val)} />
                        </div>

                        <div className="lpv-divider" />

                        <div className="lpv-fg">
                            <div className="lpv-field__label"><Info size={13} /> Professional Bio</div>
                            {isEditing ? (
                                <textarea
                                    className="lpv-input"
                                    rows={5}
                                    value={formData?.bio || ''}
                                    onChange={e => update('bio', e.target.value)}
                                    style={{ resize: 'vertical' }}
                                />
                            ) : (
                                <div className="lpv-field__value" style={{ fontWeight: 'normal', lineHeight: '1.6', textAlign: 'justify', color: '#334155' }}>
                                    {profile?.bio || 'No professional bio provided.'}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* ── Aside: Qualifications & Docs ────────────────────────── */}
                <aside className="lpv-aside">

                    <div className="lpv-qual-card" style={{ background: 'var(--mlab-blue)' }}>
                        <div className="lpv-qual-card__label">
                            <GraduationCap size={13} /> Highest Qualification
                        </div>
                        <p className="lpv-qual-card__name">
                            {profile?.highestQualification || 'Not Specified'}
                        </p>
                        <span className="lpv-qual-card__saqa">
                            Experience: {profile?.yearsExperience || 0} Years
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
                        <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* ── Typed Helpers ───────────────────────────────────────────────────────── */

const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
    // Pure CSS Pen color transformation (CORS-proof)
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
            style={{
                height: '60px',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                marginBottom: '10px',
                filter: filterMap[color] || 'none'
            }}
        />
    );
};

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
        {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
    </a>
);