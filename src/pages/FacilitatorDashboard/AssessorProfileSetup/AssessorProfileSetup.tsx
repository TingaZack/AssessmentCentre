// src/pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Camera, Award, Calendar, Fingerprint, Globe, MapPin, Phone, Lock
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import mLabLogo from '../../../assets/logo/mlab_logo.png';
import './AssessorProfileSetup.css';

// ─── DICTIONARIES ─────────────────────────────────────────────────────────
const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
];

interface PractitionerData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    workPermitNumber?: string;
    dateOfBirth: string;

    // Contact & Address Fields
    phone?: string;
    streetAddress?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    sameAsResidential?: boolean;
    postalAddress?: string;
    customPostalCode?: string;

    assessorRegNumber: string;
    primarySeta: string;
    specializationScope: string;
    registrationExpiry: string;
    yearsExperience: number;
    highestQualification: string;
    bio: string;
    popiaConsent: boolean;
    profilePhotoUrl?: string;
}

export const AssessorProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser, setUser, settings } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<PractitionerData>>({
        fullName: user?.fullName || '',
        phone: (user as any)?.phone || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
        primarySeta: 'MICT SETA',
        sameAsResidential: true,
    });

    // Compliance Document States
    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [permitDoc, setPermitDoc] = useState<File | null>(null);
    const [assessorCert, setAssessorCert] = useState<File | null>(null);
    const [regLetter, setRegLetter] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);

    // Photo Preview States
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
        return !!(formData.assessorRegNumber && formData.highestQualification && formData.city);
    };

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

    //  Handle Google Address Autocomplete
    const handlePlaceSelected = (place: any) => {
        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        let provString = getComp("administrative_area_level_1");
        const matchedProv = QCTO_PROVINCES.find(p => provString.includes(p)) || '';

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

    const handleSubmit = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const getExt = (f: File) => f.name.split('.').pop();

            let photoUrl = user?.profilePhotoUrl || "";
            if (profilePhoto) {
                photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${getExt(profilePhoto)}`);
            }

            const docs: any = {};
            if (idDoc) docs.identificationUrl = await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc_${Date.now()}.${getExt(idDoc)}`);
            if (assessorCert) docs.assessorCertUrl = await handleFileUpload(assessorCert, `staff/${user.uid}/assessor_cert_${Date.now()}.${getExt(assessorCert)}`);
            if (regLetter) docs.regLetterUrl = await handleFileUpload(regLetter, `staff/${user.uid}/reg_letter_${Date.now()}.${getExt(regLetter)}`);
            if (cvDoc) docs.cvUrl = await handleFileUpload(cvDoc, `staff/${user.uid}/cv_${Date.now()}.${getExt(cvDoc)}`);
            if (permitDoc) docs.workPermitUrl = await handleFileUpload(permitDoc, `staff/${user.uid}/work_permit_${Date.now()}.${getExt(permitDoc)}`);

            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
            const postalCodeFinal = formData.sameAsResidential ? formData.postalCode : formData.customPostalCode;

            // Generate strict timestamp for when they agreed to the terms
            const popiaTimestamp = new Date().toISOString();

            const finalData = {
                ...formData,
                postalAddress: postalLine1,
                customPostalCode: postalCodeFinal,
                profilePhotoUrl: photoUrl,
                complianceDocs: { ...(user as any).complianceDocs, ...docs, updatedAt: new Date().toISOString() },
                popiActDate: popiaTimestamp, // Audit trail for staff consent
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            await updateDoc(doc(db, 'users', user.uid), finalData);

            if (setUser) {
                setUser({ ...user, ...finalData, profileCompleted: true } as any);
            }

            await refreshUser();
            navigate('/marking', { replace: true }); // Assessors go to marking
        } catch (error) {
            console.error(error);
            alert('Compliance sync failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card practitioner-gate">
                <div className="lp-header">
                    <img height={50} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                    <h1 className="lp-header__title">Assessor Compliance</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Registration & Contact' : 'Vault'}</p>

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
                                {photoPreview ? <img src={photoPreview} alt="Preview" style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> : <User size={40} color="#94a3b8" />}
                            </div>
                            <label className="setup-camera-btn">
                                <Camera size={16} />
                                <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                            </label>
                            <div className="setup-photo-text">
                                <h4>Official Headshot</h4>
                                <p>Mandatory for your QCTO practitioner profile.</p>
                            </div>
                        </div>

                        <div className="lp-grid">
                            <FG label="Full Legal Names (For Certificates)">
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
                            <button className="lp-btn-primary" disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
                                Next Step <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}

                {/* REGISTRATION & CONTACT */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><Award size={16} /> Registration & Qualifications</h3>
                        <div className="lp-grid">
                            <FG label="Primary SETA Quality Partner">
                                <select className="lp-input" value={formData.primarySeta || ''} onChange={e => setFormData({ ...formData, primarySeta: e.target.value })}>
                                    <option value="MICT SETA">MICT SETA</option>
                                    <option value="SERVICES SETA">SERVICES SETA</option>
                                    <option value="ETDP SETA">ETDP SETA</option>
                                    <option value="QCTO DIRECT">QCTO DIRECT</option>
                                </select>
                            </FG>
                            <FG label="Registration Number">
                                <input className="lp-input" placeholder="e.g. ASS/123/2024" value={formData.assessorRegNumber || ''} onChange={e => setFormData({ ...formData, assessorRegNumber: e.target.value })} />
                            </FG>
                            <FG label="Highest Qualification">
                                <input className="lp-input" value={formData.highestQualification || ''} onChange={e => setFormData({ ...formData, highestQualification: e.target.value })} />
                            </FG>
                            <FG label="Contact Number">
                                <div className="input-with-icon">
                                    <Phone size={16} />
                                    <input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                            </FG>
                        </div>

                        {/* Address Section */}
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
                                    {QCTO_PROVINCES.map(prov => <option key={prov} value={prov}>{prov}</option>)}
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

                {/* DOCUMENT VAULT & POPIA CONSENT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><ShieldCheck size={16} /> Compliance Document Vault</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
                            Please upload your verified compliance documents. <strong>ID, Certificate and Registration are mandatory.</strong>
                        </p>

                        <div className="lp-upload-grid">
                            <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy *' : 'Passport Copy *'} file={idDoc} onUpload={setIdDoc} />
                            {formData.nationalityType === 'Foreign National' && <DocUpload label="Work Permit / Visa *" file={permitDoc} onUpload={setPermitDoc} />}
                            <DocUpload label="Assessor Certificate *" file={assessorCert} onUpload={setAssessorCert} />
                            <DocUpload label="SETA Reg. Letter *" file={regLetter} onUpload={setRegLetter} />
                            <DocUpload label="Detailed CV (Optional)" file={cvDoc} onUpload={setCvDoc} isOptional={true} />
                        </div>

                        {/* 🚀 STAFF DATA HANDLER CHECKPOINT */}
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
                                    <strong>I formally consent to the processing of my own data for QCTO compliance.</strong> Additionally, as an Assessor, I understand I will have access to sensitive learner PII. By checking this box, I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Terms of Service</a> and the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>POPIA Privacy Policy</a>, and I legally bind myself to strict confidentiality regarding all learner records.
                                </p>
                            </div>
                        </div>

                        <div className="lp-actions" style={{ marginTop: '2rem' }}>
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button
                                className="lp-btn-primary"
                                onClick={handleSubmit}
                                disabled={loading || !formData.popiaConsent || !idDoc || !assessorCert || !regLetter}
                                style={{
                                    opacity: (!formData.popiaConsent || loading || !idDoc || !assessorCert || !regLetter) ? 0.6 : 1,
                                    cursor: (!formData.popiaConsent || loading || !idDoc || !assessorCert || !regLetter) ? 'not-allowed' : 'pointer',
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

const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void; isOptional?: boolean }> = ({ label, file, onUpload, isOptional }) => (
    <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
        <div className="lp-doc-icon">{file ? <CheckCircle size={22} /> : <Upload size={22} />}</div>
        <div className="lp-doc-info">
            <h4>{label}</h4>
            <span>{file ? file.name : (isOptional ? 'Optional PDF upload' : 'Required PDF upload')}</span>
        </div>
        <input type="file" accept=".pdf,image/*" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);