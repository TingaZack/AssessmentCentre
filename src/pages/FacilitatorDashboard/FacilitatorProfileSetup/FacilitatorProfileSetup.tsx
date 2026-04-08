import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, BookOpen, MapPin, Phone, Lock, Plus
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './FacilitatorProfileSetup.css';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

interface FacilitatorData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    workPermitNumber?: string;
    dateOfBirth: string;

    phone?: string;
    streetAddress?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    sameAsResidential?: boolean;
    postalAddress?: string;
    customPostalCode?: string;

    yearsExperience: number;
    highestQualification: string;
    bio: string;
    popiaConsent: boolean;
    profilePhotoUrl?: string;
}

export const FacilitatorProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser, setUser } = useStore(); // Added setUser here

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [fetchingInitial, setFetchingInitial] = useState(true);

    const [formData, setFormData] = useState<Partial<FacilitatorData>>({
        fullName: user?.fullName || '',
        phone: (user as any)?.phone || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
        sameAsResidential: true,
    });

    // DYNAMIC DOCUMENT STATE
    const [docsList, setDocsList] = useState<DynamicDocument[]>([
        { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: '', isFixed: true, isRequired: true },
        { id: 'cv', name: 'Detailed CV', file: null, url: '', isFixed: true, isRequired: true },
        { id: 'fac_cert', name: 'Facilitator Certificate', file: null, url: '', isFixed: true, isRequired: false },
    ]);

    // Photo Preview States
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // ─── EFFECTS ─────────────────────────────────────────────────────────

    // 🚀 NEW: Fetch Existing Data from Firestore to Pre-fill Form
    useEffect(() => {
        const fetchExistingData = async () => {
            if (!user?.uid) return;
            try {
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();

                    const sameAsRes = data.sameAsResidential !== undefined
                        ? data.sameAsResidential
                        : (data.postalAddress === data.streetAddress || !data.postalAddress);

                    setFormData({
                        fullName: data.fullName || user.fullName || '',
                        nationalityType: data.nationalityType || 'South African',
                        idNumber: data.idNumber || '',
                        passportNumber: data.passportNumber || '',
                        dateOfBirth: data.dateOfBirth || '',
                        phone: data.phone || '',
                        streetAddress: data.streetAddress || '',
                        city: data.city || '',
                        province: data.province || '',
                        postalCode: data.postalCode || '',
                        sameAsResidential: sameAsRes,
                        postalAddress: data.postalAddress || '',
                        customPostalCode: data.customPostalCode || '',
                        yearsExperience: data.yearsExperience || 0,
                        highestQualification: data.highestQualification || '',
                        bio: data.bio || '',
                        popiaConsent: data.popiaConsent || false,
                        profilePhotoUrl: data.profilePhotoUrl || ''
                    });

                    if (data.profilePhotoUrl) setPhotoPreview(data.profilePhotoUrl);

                    // 🚀 HYDRATE DOCUMENTS
                    const legacyDocs = data.complianceDocs || {};
                    const rawUploadedDocs = data.uploadedDocuments;
                    const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

                    const initialDocs: DynamicDocument[] = [
                        { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.identificationUrl || '', isFixed: true, isRequired: true },
                        { id: 'cv', name: 'Detailed CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: true },
                        { id: 'fac_cert', name: 'Facilitator Certificate', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'fac_cert')?.url || legacyDocs.facilitatorCertUrl || '', isFixed: true, isRequired: false },
                    ];

                    if (data.nationalityType === 'Foreign National') {
                        initialDocs.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'permit')?.url || legacyDocs.workPermitUrl || '', isFixed: true, isRequired: true });
                    }

                    const coreDocIds = ['id', 'cv', 'fac_cert', 'permit'];
                    uploadedDocsArray.forEach((savedDoc: any) => {
                        if (!coreDocIds.includes(savedDoc.id)) {
                            initialDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
                        }
                    });

                    setDocsList(initialDocs);
                }
            } catch (error) {
                console.error("Error fetching existing profile data:", error);
            } finally {
                setFetchingInitial(false);
            }
        };

        fetchExistingData();
    }, [user?.uid]);

    // Automatically require a Work Permit if they switch to Foreign National
    useEffect(() => {
        setDocsList(prev => {
            const hasPermit = prev.find(d => d.id === 'permit');

            if (formData.nationalityType === 'Foreign National') {
                if (!hasPermit) {
                    const newList = [...prev];
                    newList.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: '', isFixed: true, isRequired: true });
                    return newList;
                }
            } else {
                if (hasPermit) {
                    return prev.filter(d => d.id !== 'permit');
                }
            }
            return prev;
        });
    }, [formData.nationalityType]);

    // ─── VALIDATION HELPERS ──────────────────────────────────────────────

    const validateSAID = (id: string) => /^\d{13}$/.test(id);

    const extractDoBFromID = (id: string) => {
        if (!validateSAID(id)) return "";
        const year = id.substring(0, 2);
        const month = id.substring(2, 4);
        const day = id.substring(4, 6);
        const currentYearShort = new Date().getFullYear() % 100;
        const century = parseInt(year) <= currentYearShort ? "20" : "19";
        return `${century}${year}-${month}-${day}`;
    };

    const canMoveToStep2 = () => {
        if (!formData.fullName || formData.fullName.length < 3) return false;
        if (formData.nationalityType === 'South African') {
            return validateSAID(formData.idNumber || '') && !!formData.dateOfBirth;
        } else {
            return !!(formData.passportNumber && formData.passportNumber.length > 5 && formData.dateOfBirth);
        }
    };

    const canMoveToStep3 = () => {
        return !!formData.highestQualification && !!formData.bio && !!formData.city;
    };

    const missingRequiredDocs = docsList.filter(d => d.isRequired && !d.file && !d.url);

    // ─── HANDLERS ─────────────────────────────────────────────────────────

    const handleIDChange = (val: string) => {
        setFormData(prev => {
            const newData = { ...prev, idNumber: val };
            if (val.length === 13 && validateSAID(val)) {
                newData.dateOfBirth = extractDoBFromID(val);
            }
            return newData;
        });
    };

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
        const provinceOptions = ["Western Cape", "Eastern Cape", "Northern Cape", "Free State", "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"];
        const matchedProv = provinceOptions.find(p => provString.includes(p)) || '';

        setFormData(prev => ({
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

    const handleSubmit = async () => {
        if (!user?.uid) return;

        if (missingRequiredDocs.length > 0) {
            alert(`Please upload all required documents: ${missingRequiredDocs.map(d => d.name).join(', ')}`);
            return;
        }

        setLoading(true);
        try {
            let photoUrl = formData.profilePhotoUrl || "";
            if (profilePhoto) {
                const ext = profilePhoto.name.split('.').pop();
                photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${ext}`);
            }

            // PROCESS ALL DYNAMIC DOCUMENTS
            const finalUploadedDocs = [];
            const legacyDocsObject: any = { ...((user as any).complianceDocs || {}) };

            for (const docItem of docsList) {
                let finalUrl = docItem.url;

                if (docItem.file) {
                    const ext = docItem.file.name.split('.').pop();
                    finalUrl = await handleFileUpload(docItem.file, `staff/${user.uid}/${docItem.id}_${Date.now()}.${ext}`);
                }

                if (finalUrl) {
                    finalUploadedDocs.push({
                        id: docItem.id,
                        name: docItem.name || 'Untitled Document',
                        url: finalUrl
                    });

                    if (docItem.id === 'id') legacyDocsObject.identificationUrl = finalUrl;
                    if (docItem.id === 'cv') legacyDocsObject.cvUrl = finalUrl;
                    if (docItem.id === 'fac_cert') legacyDocsObject.facilitatorCertUrl = finalUrl;
                    if (docItem.id === 'permit') legacyDocsObject.workPermitUrl = finalUrl;
                }
            }

            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
            const postalCodeFinal = formData.sameAsResidential ? formData.postalCode : formData.customPostalCode;

            const finalData = {
                ...formData,
                postalAddress: postalLine1,
                customPostalCode: postalCodeFinal,
                profilePhotoUrl: photoUrl,
                uploadedDocuments: finalUploadedDocs,
                complianceDocs: legacyDocsObject,
                popiActDate: new Date().toISOString(),
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            // 1. Save strictly to DB
            await updateDoc(doc(db, 'users', user.uid), finalData);

            // 2. FORCE local state override to bust the redirect loop!
            if (setUser) {
                setUser({ ...user, ...finalData, profileCompleted: true } as any);
            }

            // 3. Await the refresh
            await refreshUser();

            // 4. Force replace navigate to break out of setup route
            navigate('/facilitator', { replace: true });

        } catch (error) {
            console.error(error);
            alert('Compliance sync failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    if (fetchingInitial) {
        return (
            <div className="lp-loading" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0 }}>
                <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
                <h2 className="lp-loading__title">Loading Profile</h2>
                <p className="lp-loading__sub">Retrieving your existing records...</p>
            </div>
        );
    }

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card practitioner-gate">
                <div className="lp-header">
                    <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span>
                    <h1 className="lp-header__title">Facilitator Onboarding</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Experience & Contact' : 'Document Vault'}</p>

                    <div className="lp-stepper">
                        {[1, 2, 3].map(s => (
                            <React.Fragment key={s}>
                                <div className={`lp-step ${step >= s ? 'active' : ''}`}>{s}</div>
                                {s < 3 && <div className="lp-step-line" />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* PERSONAL & IDENTITY */}
                {step === 1 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><User size={16} /> Identity Verification</h3>

                        <div className="setup-photo-upload">
                            <div className="setup-avatar-circle">
                                {photoPreview ? <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={40} color="#94a3b8" />}
                            </div>
                            <label className="setup-camera-btn">
                                <Camera size={16} />
                                <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                            </label>
                            <div className="setup-photo-text">
                                <h4>Official Headshot</h4>
                                <p>Helps learners and staff identify you.</p>
                            </div>
                        </div>

                        <div className="lp-grid">
                            <FG label="Full Legal Names">
                                <input className="lp-input" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                            </FG>
                            <FG label="Nationality">
                                <select
                                    className="lp-input"
                                    value={formData.nationalityType}
                                    onChange={e => setFormData({ ...formData, nationalityType: e.target.value as any, idNumber: '', passportNumber: '', dateOfBirth: '' })}
                                >
                                    <option value="South African">South African</option>
                                    <option value="Foreign National">Foreign National</option>
                                </select>
                            </FG>

                            {formData.nationalityType === 'South African' ? (
                                <FG label="SA ID Number (13 Digits)">
                                    <div className="input-with-icon">
                                        <Fingerprint size={16} />
                                        <input
                                            className={`lp-input ${formData.idNumber && !validateSAID(formData.idNumber) ? 'error' : ''}`}
                                            maxLength={13}
                                            value={formData.idNumber || ''}
                                            onChange={e => handleIDChange(e.target.value)}
                                        />
                                    </div>
                                </FG>
                            ) : (
                                <FG label="Passport Number">
                                    <div className="input-with-icon">
                                        <Globe size={16} />
                                        <input className="lp-input" value={formData.passportNumber || ''} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} />
                                    </div>
                                </FG>
                            )}

                            <FG label="Date of Birth">
                                <div className="input-with-icon">
                                    <Calendar size={16} />
                                    <input
                                        type="date"
                                        className="lp-input"
                                        readOnly={formData.nationalityType === 'South African'}
                                        style={formData.nationalityType === 'South African' ? { background: '#f8fafc' } : {}}
                                        value={formData.dateOfBirth || ''}
                                        onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                    />
                                </div>
                            </FG>
                        </div>

                        <div className="lp-actions">
                            <div />
                            <button className="lp-btn-primary" disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
                                Next Step <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}

                {/* EXPERIENCE, CONTACT & ADDRESS */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><BookOpen size={16} /> Experience & Qualifications</h3>
                        <div className="lp-grid">
                            <FG label="Highest Qualification">
                                <input className="lp-input" placeholder="e.g. BSc Computer Science" value={formData.highestQualification || ''} onChange={e => setFormData({ ...formData, highestQualification: e.target.value })} />
                            </FG>
                            <FG label="Years of Industry Experience">
                                <input type="number" className="lp-input" min="0" value={formData.yearsExperience} onChange={e => setFormData({ ...formData, yearsExperience: parseInt(e.target.value) || 0 })} />
                            </FG>
                            <FG label="Contact Number">
                                <div className="input-with-icon">
                                    <Phone size={16} />
                                    <input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                            </FG>
                        </div>

                        <div style={{ marginTop: '1.25rem', marginBottom: '2rem' }}>
                            <FG label="Professional Bio">
                                <textarea className="lp-input" rows={3} placeholder="Provide a brief summary of your background, expertise, and teaching philosophy..." value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                            </FG>
                        </div>

                        <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <FG label="Address Search (Google Verified)">
                                <Autocomplete
                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                    onPlaceSelected={handlePlaceSelected}
                                    options={{ types: [], componentRestrictions: { country: "za" } }}
                                    className="lp-input"
                                    defaultValue={formData.streetAddress}
                                    placeholder="Start typing your street name..."
                                />
                            </FG>
                        </div>

                        <div className="lp-grid">
                            <FG label="City / Town">
                                <input className="lp-input readonly-field" value={formData.city || ''} readOnly />
                            </FG>
                            <FG label="Province">
                                <select className="lp-input" value={formData.province || ''} onChange={e => setFormData({ ...formData, province: e.target.value })}>
                                    <option value="">Select...</option>
                                    <option value="Western Cape">Western Cape</option>
                                    <option value="Eastern Cape">Eastern Cape</option>
                                    <option value="Northern Cape">Northern Cape</option>
                                    <option value="Free State">Free State</option>
                                    <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                                    <option value="North West">North West</option>
                                    <option value="Gauteng">Gauteng</option>
                                    <option value="Mpumalanga">Mpumalanga</option>
                                    <option value="Limpopo">Limpopo</option>
                                </select>
                            </FG>
                        </div>

                        <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.sameAsResidential}
                                    onChange={e => setFormData({ ...formData, sameAsResidential: e.target.checked })}
                                />
                                My Postal Address is the same as my Residential Address
                            </label>

                            {!formData.sameAsResidential && (
                                <div className="animate-fade-in" style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 2 }}>
                                        <FG label="Alternate Postal Address (e.g. P.O. Box)">
                                            <input
                                                className="lp-input"
                                                placeholder="P.O. Box 1234..."
                                                value={formData.postalAddress || ''}
                                                onChange={e => setFormData({ ...formData, postalAddress: e.target.value })}
                                            />
                                        </FG>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <FG label="Postal Code">
                                            <input
                                                className="lp-input"
                                                placeholder="0000"
                                                value={formData.customPostalCode || ''}
                                                onChange={e => setFormData({ ...formData, customPostalCode: e.target.value })}
                                            />
                                        </FG>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {/* DOCUMENT VAULT & LEGAL CHECKPOINT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 className="lp-section-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}><ShieldCheck size={16} /> Compliance Document Vault</h3>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                    Please upload your verified compliance documents. <strong>ID and CV are mandatory.</strong>
                                </p>
                            </div>
                            <button className="lp-btn-ghost" style={{ fontSize: '0.85rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
                                <Plus size={14} /> Add Document
                            </button>
                        </div>

                        <div className="lp-upload-grid">
                            {docsList.map((docItem) => (
                                <DynamicDocUpload
                                    key={docItem.id}
                                    document={docItem}
                                    onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
                                    onRemove={() => handleRemoveDocument(docItem.id)}
                                />
                            ))}
                        </div>

                        {/* STAFF DATA HANDLER CHECKPOINT */}
                        <div style={{
                            display: 'flex', gap: '1rem', alignItems: 'flex-start',
                            background: formData.popiaConsent ? '#f0fdf4' : '#f8fafc',
                            padding: '1.25rem', border: `1px solid ${formData.popiaConsent ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: '8px', marginTop: '2rem', transition: 'all 0.3s ease'
                        }}>
                            <input
                                type="checkbox"
                                id="staff-popia-consent"
                                checked={formData.popiaConsent}
                                onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })}
                                style={{ marginTop: '0.25rem', width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <div>
                                <label htmlFor="staff-popia-consent" style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                                    <ShieldCheck size={18} color={formData.popiaConsent ? "#16a34a" : "#64748b"} />
                                    Data Handling & POPIA Compliance Declaration
                                </label>
                                <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                                    <strong>I formally consent to the processing of my own data for QCTO compliance.</strong> Additionally, as a Facilitator, I understand I will have access to sensitive learner PII. By checking this box, I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Terms of Service</a> and the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>POPIA Privacy Policy</a>, and I legally bind myself to strict confidentiality regarding all learner records.
                                </p>
                            </div>
                        </div>

                        <div className="lp-actions" style={{ marginTop: '2rem' }}>
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button
                                className="lp-btn-primary"
                                onClick={handleSubmit}
                                disabled={loading || !formData.popiaConsent || missingRequiredDocs.length > 0}
                                style={{
                                    opacity: (!formData.popiaConsent || loading || missingRequiredDocs.length > 0) ? 0.6 : 1,
                                    cursor: (!formData.popiaConsent || loading || missingRequiredDocs.length > 0) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem'
                                }}
                            >
                                {loading ? 'Saving Registration...' : 'Complete Registration'}
                                {formData.popiaConsent ? <Save size={16} /> : <Lock size={16} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="lp-fg"><label className="lp-fg-label">{label}</label>{children}</div>
);