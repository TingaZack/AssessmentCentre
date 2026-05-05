// src/pages/AdminDashboard/AdminProfileSetup/AdminProfileSetup.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, Briefcase, Phone, MapPin, Plus, Lock
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';

import mLabLogo from '../../../assets/logo/mlab_logo_white.png';
import '../../FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup.css';

import { DynamicDocUpload, type DynamicDocument } from '../../LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

interface AdminData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    dateOfBirth: string;

    // Admin / Compiler Specific
    jobTitle: string;
    phone: string;
    email: string;
    streetAddress: string;
    city: string;
    province: string;
    postalCode?: string;

    popiaConsent: boolean;
    profilePhotoUrl?: string;
}

export const AdminProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser, setUser, settings } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Initialize empty, we will pre-fill via useEffect
    const [formData, setFormData] = useState<Partial<AdminData>>({
        fullName: '',
        email: '',
        phone: '',
        nationalityType: 'South African',
        popiaConsent: false,
    });

    // DYNAMIC DOCUMENT STATE
    const [docsList, setDocsList] = useState<DynamicDocument[]>([
        { id: 'id', name: 'Certified ID / Passport Copy', file: null, url: '', isFixed: true, isRequired: true },
        { id: 'appointment', name: 'Appointment Letter / Proof of Role', file: null, url: '', isFixed: true, isRequired: true }
    ]);

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // ─── EFFECTS ─────────────────────────────────────────────────────────

    // Pre-fill data when the user object arrives from the database
    useEffect(() => {
        if (user) {
            const u = user as any;

            // 1. Pre-fill textual form data
            setFormData({
                fullName: u.fullName || '',
                email: u.email || '',
                phone: u.phone || '',
                nationalityType: u.nationalityType || 'South African',
                idNumber: u.idNumber || '',
                passportNumber: u.passportNumber || '',
                dateOfBirth: u.dateOfBirth || '',
                jobTitle: u.jobTitle || '',
                streetAddress: u.streetAddress || '',
                city: u.city || '',
                province: u.province || '',
                postalCode: u.postalCode || '',
                popiaConsent: u.popiaConsent || !!u.popiActDate || false,
            });

            // 2. Pre-fill profile photo preview
            if (u.profilePhotoUrl) {
                setPhotoPreview(u.profilePhotoUrl);
            }

            // 3. Pre-fill dynamic documents
            if (u.uploadedDocuments && Array.isArray(u.uploadedDocuments)) {
                setDocsList(prev => {
                    const updatedList = [...prev];
                    u.uploadedDocuments.forEach((docItem: any) => {
                        const existingIdx = updatedList.findIndex(d => d.id === docItem.id);
                        if (existingIdx >= 0) {
                            updatedList[existingIdx].url = docItem.url;
                            if (docItem.name) updatedList[existingIdx].name = docItem.name;
                        } else {
                            updatedList.push({
                                id: docItem.id,
                                name: docItem.name || 'Additional Document',
                                file: null,
                                url: docItem.url,
                                isFixed: false,
                                isRequired: false
                            });
                        }
                    });
                    return updatedList;
                });
            } else if (u.complianceDocs) {
                // Fallback to fetch from legacy document format
                setDocsList(prev => {
                    const updatedList = [...prev];
                    if (u.complianceDocs.identificationUrl) {
                        const idx = updatedList.findIndex(d => d.id === 'id');
                        if (idx >= 0) updatedList[idx].url = u.complianceDocs.identificationUrl;
                    }
                    if (u.complianceDocs.appointmentLetterUrl) {
                        const idx = updatedList.findIndex(d => d.id === 'appointment');
                        if (idx >= 0) updatedList[idx].url = u.complianceDocs.appointmentLetterUrl;
                    }
                    if (u.complianceDocs.workPermitUrl) {
                        const idx = updatedList.findIndex(d => d.id === 'permit');
                        if (idx >= 0) {
                            updatedList[idx].url = u.complianceDocs.workPermitUrl;
                        } else {
                            updatedList.splice(1, 0, { id: 'permit', name: 'Work Permit / Visa', file: null, url: u.complianceDocs.workPermitUrl, isFixed: true, isRequired: true });
                        }
                    }
                    return updatedList;
                });
            }
        }
    }, [user]);

    // Automatically require a Work Permit if they are a Foreign National
    useEffect(() => {
        setDocsList(prev => {
            const hasPermit = prev.find(d => d.id === 'permit');

            if (formData.nationalityType === 'Foreign National') {
                if (!hasPermit) {
                    const newList = [...prev];
                    // Insert Permit after ID
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
        return !!(formData.jobTitle && formData.phone && formData.city && formData.province);
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
            let photoUrl = user?.profilePhotoUrl || "";
            if (profilePhoto) {
                const getExt = (f: File) => f.name.split('.').pop();
                photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${getExt(profilePhoto)}`);
            }

            // PROCESS ALL DYNAMIC DOCUMENTS
            const finalUploadedDocs = [];
            const legacyDocsObject: any = { ...((user as any).complianceDocs || {}) }; // Preserve legacy format

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

                    // Map specific core documents to the legacy object
                    if (docItem.id === 'id') legacyDocsObject.identificationUrl = finalUrl;
                    if (docItem.id === 'appointment') legacyDocsObject.appointmentLetterUrl = finalUrl;
                    if (docItem.id === 'permit') legacyDocsObject.workPermitUrl = finalUrl;
                }
            }

            const finalData = {
                ...formData,
                profilePhotoUrl: photoUrl,
                uploadedDocuments: finalUploadedDocs, // 👈 New robust array format
                complianceDocs: { ...legacyDocsObject, updatedAt: new Date().toISOString() }, // 👈 Legacy format fallback
                popiActDate: new Date().toISOString(), // Audit trail for consent
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            await updateDoc(doc(db, 'users', user.uid), finalData);

            if (setUser) {
                setUser({ ...user, ...finalData, profileCompleted: true } as any);
            }

            await refreshUser();
            navigate('/admin', { replace: true });
        } catch (error) {
            console.error(error);
            alert('Compliance sync failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card practitioner-gate" style={{ borderTopColor: '#0f172a' }}>
                <div className="lp-header">
                    <img height={50} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                    <h1 className="lp-header__title">Administrator Setup</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Professional Profile' : 'Vault'}</p>

                    <div className="lp-stepper">
                        {[1, 2, 3].map(s => (
                            <React.Fragment key={s}>
                                <div className={`lp-step ${step >= s ? 'active' : ''}`} style={step >= s ? { background: '#0f172a', borderColor: '#0f172a' } : {}}>{s}</div>
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
                                {photoPreview ? <img src={photoPreview} alt="Preview" style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> : <User size={40} color="#94a3b8" />}
                            </div>
                            <label className="setup-camera-btn" style={{ background: '#0f172a' }}>
                                <Camera size={16} />
                                <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                            </label>
                            <div className="setup-photo-text">
                                <h4>Official Headshot</h4>
                                <p>Used for internal system tracking and audits.</p>
                            </div>
                        </div>

                        <div className="lp-grid">
                            <FG label="Full Legal Names">
                                <input className="lp-input" value={formData.fullName || ''} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
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
                            <button className="lp-btn-primary" style={{ background: '#0f172a' }} disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
                                Next Step <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}

                {/* PROFESSIONAL & CONTACT */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><Briefcase size={16} /> Contact & Professional Profile</h3>

                        <div style={{ background: '#e0e7ff', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#3730a3' }}>
                            <strong>Note:</strong> As an Administrator, these contact details will be automatically attached to QCTO LEISA exports identifying you as the primary Compiler.
                        </div>

                        <div className="lp-grid">
                            <FG label="Job Title / Role in Company">
                                <input className="lp-input" placeholder="e.g. Data Administrator, Principal" value={formData.jobTitle || ''} onChange={e => setFormData({ ...formData, jobTitle: e.target.value })} />
                            </FG>
                            <FG label="Contact Number (Direct)">
                                <div className="input-with-icon">
                                    <Phone size={16} />
                                    <input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                            </FG>
                            <FG label="Email Address">
                                <input className="lp-input" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </FG>
                        </div>

                        <h3 className="lp-section-title mt-8"><MapPin size={16} /> Residential Address</h3>
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

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" style={{ background: '#0f172a' }} disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {/* DOCUMENT VAULT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 className="lp-section-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}><ShieldCheck size={16} /> Official Documents</h3>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                    Please upload your verified compliance documents. <strong>ID and Appointment Letter are mandatory.</strong>
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

                        {/* ENHANCED POPIA LEGAL CHECKPOINT */}
                        <div style={{
                            display: 'flex', gap: '1rem', alignItems: 'flex-start',
                            background: formData.popiaConsent ? '#f0fdf4' : '#f8fafc',
                            padding: '1.25rem', border: `1px solid ${formData.popiaConsent ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: '8px', marginTop: '2rem', transition: 'all 0.3s ease'
                        }}>
                            <input
                                type="checkbox"
                                id="popia-consent"
                                checked={formData.popiaConsent}
                                onChange={(e) => setFormData({ ...formData, popiaConsent: e.target.checked })}
                                style={{ marginTop: '0.25rem', width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <div>
                                <label htmlFor="popia-consent" style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                                    <ShieldCheck size={18} color={formData.popiaConsent ? "#16a34a" : "#64748b"} />
                                    POPIA Consent & Terms of Service
                                </label>
                                <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                                    <strong>I formally consent to the processing of my data for QCTO compliance.</strong> By checking this box, I confirm that I have read and agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Terms & Conditions</a> and the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>POPIA Privacy Policy</a>. Furthermore, I declare the above to be true and confirm that I am authorized by this institution to act as a Compiler and system Administrator.
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
                                    background: '#0f172a',
                                    opacity: (!formData.popiaConsent || loading || missingRequiredDocs.length > 0) ? 0.6 : 1,
                                    cursor: (!formData.popiaConsent || loading || missingRequiredDocs.length > 0) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem'
                                }}
                            >
                                {loading ? <Loader2 className="spin" size={15} /> : 'Complete Setup'}
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