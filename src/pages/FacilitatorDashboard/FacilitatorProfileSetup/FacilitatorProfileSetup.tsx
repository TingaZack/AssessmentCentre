// src/pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, BookOpen, MapPin, Phone
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './FacilitatorProfileSetup.css';

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
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<FacilitatorData>>({
        fullName: user?.fullName || '',
        phone: (user as any)?.phone || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
        sameAsResidential: true, // Default to true
    });

    // Compliance Document States
    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [permitDoc, setPermitDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);
    const [facCertDoc, setFacCertDoc] = useState<File | null>(null); // Optional

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
        return !!formData.highestQualification && !!formData.bio && !!formData.city;
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

    // Handle Google Address Autocomplete
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

    const handleSubmit = async () => {
        if (!user?.uid) return;
        if (!idDoc || !cvDoc) {
            alert("ID Document and CV are mandatory.");
            return;
        }

        setLoading(true);
        try {
            let photoUrl = user?.profilePhotoUrl || "";
            if (profilePhoto) photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile.jpg`);

            const docs: any = {
                identificationUrl: await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc.pdf`),
                cvUrl: await handleFileUpload(cvDoc, `staff/${user.uid}/cv.pdf`),
            };

            if (permitDoc) docs.workPermitUrl = await handleFileUpload(permitDoc, `staff/${user.uid}/work_permit.pdf`);
            if (facCertDoc) docs.facilitatorCertUrl = await handleFileUpload(facCertDoc, `staff/${user.uid}/facilitator_cert.pdf`);

            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
            const postalCodeFinal = formData.sameAsResidential ? formData.postalCode : formData.customPostalCode;

            const finalData = {
                ...formData,
                postalAddress: postalLine1,
                customPostalCode: postalCodeFinal,
                profilePhotoUrl: photoUrl,
                complianceDocs: docs,
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            await updateDoc(doc(db, 'users', user.uid), finalData);
            await refreshUser();
            navigate('/facilitator');
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

                        {/* Address Section Added Here */}
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

                {/* DOCUMENT VAULT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><ShieldCheck size={16} /> Compliance Document Vault</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
                            Please upload your verified compliance documents. <strong>ID and CV are mandatory.</strong>
                        </p>

                        <div className="lp-upload-grid">
                            <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy *' : 'Passport Copy *'} file={idDoc} onUpload={setIdDoc} />
                            {formData.nationalityType === 'Foreign National' && <DocUpload label="Work Permit / Visa *" file={permitDoc} onUpload={setPermitDoc} />}
                            <DocUpload label="Detailed CV *" file={cvDoc} onUpload={setCvDoc} />
                            <DocUpload label="Facilitator Certificate (Optional)" file={facCertDoc} onUpload={setFacCertDoc} isOptional={true} />
                        </div>

                        <div className="lp-popia-box" style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <ShieldCheck size={20} color="var(--mlab-blue)" />
                                <h4 style={{ margin: 0, color: '#0f172a' }}>Declarations & POPIA Consent</h4>
                            </div>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#475569' }}>
                                I formally consent to the processing of my data for QCTO compliance. Furthermore, I declare the above details to be true and accurate.
                            </p>
                            <label className="lp-popia-checkbox" style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', color: '#0f172a' }}>
                                <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
                                <span style={{ fontWeight: 500 }}>I agree to the terms and authorize this profile.</span>
                            </label>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button className="lp-btn-primary" onClick={handleSubmit} disabled={loading || !formData.popiaConsent || !idDoc || !cvDoc}>
                                {loading ? <Loader2 className="spin" size={15} /> : 'Complete Registration'} <Save size={15} />
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
        <input type="file" accept=".pdf" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);


// import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     User, Upload, CheckCircle,
//     Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, BookOpen
// } from 'lucide-react';
// import { doc, updateDoc } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { useStore } from '../../../store/useStore';
// import { db, storage } from '../../../lib/firebase';
// import './FacilitatorProfileSetup.css';

// interface FacilitatorData {
//     fullName: string;
//     nationalityType: 'South African' | 'Foreign National';
//     idNumber?: string;
//     passportNumber?: string;
//     workPermitNumber?: string;
//     dateOfBirth: string;
//     yearsExperience: number;
//     highestQualification: string;
//     bio: string;
//     popiaConsent: boolean;
//     profilePhotoUrl?: string;
// }

// export const FacilitatorProfileSetup: React.FC = () => {
//     const navigate = useNavigate();
//     const { user, refreshUser } = useStore();

//     const [step, setStep] = useState(1);
//     const [loading, setLoading] = useState(false);
//     const [formData, setFormData] = useState<Partial<FacilitatorData>>({
//         fullName: user?.fullName || '',
//         nationalityType: 'South African',
//         popiaConsent: false,
//         yearsExperience: 0,
//     });

//     // Compliance Document States
//     const [idDoc, setIdDoc] = useState<File | null>(null);
//     const [permitDoc, setPermitDoc] = useState<File | null>(null);
//     const [cvDoc, setCvDoc] = useState<File | null>(null);
//     const [facCertDoc, setFacCertDoc] = useState<File | null>(null); // Optional

//     // Photo Preview States
//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);

//     // ─── VALIDATION HELPERS ──────────────────────────────────────────────

//     const validateSAID = (id: string) => /^\d{13}$/.test(id);

//     const extractDoBFromID = (id: string) => {
//         if (!validateSAID(id)) return "";
//         const year = id.substring(0, 2);
//         const month = id.substring(2, 4);
//         const day = id.substring(4, 6);
//         const currentYearShort = new Date().getFullYear() % 100;
//         const century = parseInt(year) <= currentYearShort ? "20" : "19";
//         return `${century}${year}-${month}-${day}`;
//     };

//     const canMoveToStep2 = () => {
//         if (!formData.fullName || formData.fullName.length < 3) return false;
//         if (formData.nationalityType === 'South African') {
//             return validateSAID(formData.idNumber || '') && !!formData.dateOfBirth;
//         } else {
//             return !!(formData.passportNumber && formData.passportNumber.length > 5 && formData.dateOfBirth);
//         }
//     };

//     const canMoveToStep3 = () => {
//         return !!formData.highestQualification && !!formData.bio;
//     };

//     // ─── HANDLERS ─────────────────────────────────────────────────────────

//     const handleIDChange = (val: string) => {
//         setFormData(prev => {
//             const newData = { ...prev, idNumber: val };
//             if (val.length === 13 && validateSAID(val)) {
//                 newData.dateOfBirth = extractDoBFromID(val);
//             }
//             return newData;
//         });
//     };

//     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.files && e.target.files[0]) {
//             const file = e.target.files[0];
//             setProfilePhoto(file);
//             setPhotoPreview(URL.createObjectURL(file));
//         }
//     };

//     const handleFileUpload = async (file: File, path: string) => {
//         const storageRef = ref(storage, path);
//         const snapshot = await uploadBytes(storageRef, file);
//         return await getDownloadURL(snapshot.ref);
//     };

//     const handleSubmit = async () => {
//         if (!user?.uid) return;
//         if (!idDoc || !cvDoc) {
//             alert("ID Document and CV are mandatory.");
//             return;
//         }

//         setLoading(true);
//         try {
//             let photoUrl = user?.profilePhotoUrl || "";
//             if (profilePhoto) photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile.jpg`);

//             const docs: any = {
//                 identificationUrl: await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc.pdf`),
//                 cvUrl: await handleFileUpload(cvDoc, `staff/${user.uid}/cv.pdf`),
//             };

//             if (permitDoc) docs.workPermitUrl = await handleFileUpload(permitDoc, `staff/${user.uid}/work_permit.pdf`);
//             if (facCertDoc) docs.facilitatorCertUrl = await handleFileUpload(facCertDoc, `staff/${user.uid}/facilitator_cert.pdf`);

//             const finalData = {
//                 ...formData,
//                 profilePhotoUrl: photoUrl,
//                 complianceDocs: docs,
//                 profileCompleted: true,
//                 updatedAt: new Date().toISOString(),
//             };

//             await updateDoc(doc(db, 'users', user.uid), finalData);
//             await refreshUser();
//             navigate('/facilitator');
//         } catch (error) {
//             console.error(error);
//             alert('Compliance sync failed. Please check your connection.');
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div className="lp-container animate-fade-in">
//             <div className="lp-card practitioner-gate">
//                 <div className="lp-header">
//                     <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span>
//                     <h1 className="lp-header__title">Facilitator Onboarding</h1>
//                     <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Experience' : 'Document Vault'}</p>

//                     <div className="lp-stepper">
//                         {[1, 2, 3].map(s => (
//                             <React.Fragment key={s}>
//                                 <div className={`lp-step ${step >= s ? 'active' : ''}`}>{s}</div>
//                                 {s < 3 && <div className="lp-step-line" />}
//                             </React.Fragment>
//                         ))}
//                     </div>
//                 </div>

//                 {/* PERSONAL & IDENTITY */}
//                 {step === 1 && (
//                     <div className="lp-form-body animate-fade-in">
//                         <h3 className="lp-section-title"><User size={16} /> Identity Verification</h3>

//                         <div className="setup-photo-upload">
//                             <div className="setup-avatar-circle">
//                                 {photoPreview ? <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={40} color="#94a3b8" />}
//                             </div>
//                             <label className="setup-camera-btn">
//                                 <Camera size={16} />
//                                 <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
//                             </label>
//                             <div className="setup-photo-text">
//                                 <h4>Official Headshot</h4>
//                                 <p>Helps learners and staff identify you.</p>
//                             </div>
//                         </div>

//                         <div className="lp-grid">
//                             <FG label="Full Legal Names">
//                                 <input className="lp-input" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
//                             </FG>
//                             <FG label="Nationality">
//                                 <select
//                                     className="lp-input"
//                                     value={formData.nationalityType}
//                                     onChange={e => setFormData({ ...formData, nationalityType: e.target.value as any, idNumber: '', passportNumber: '', dateOfBirth: '' })}
//                                 >
//                                     <option value="South African">South African</option>
//                                     <option value="Foreign National">Foreign National</option>
//                                 </select>
//                             </FG>

//                             {formData.nationalityType === 'South African' ? (
//                                 <FG label="SA ID Number (13 Digits)">
//                                     <div className="input-with-icon">
//                                         <Fingerprint size={16} />
//                                         <input
//                                             className={`lp-input ${formData.idNumber && !validateSAID(formData.idNumber) ? 'error' : ''}`}
//                                             maxLength={13}
//                                             value={formData.idNumber || ''}
//                                             onChange={e => handleIDChange(e.target.value)}
//                                         />
//                                     </div>
//                                 </FG>
//                             ) : (
//                                 <FG label="Passport Number">
//                                     <div className="input-with-icon">
//                                         <Globe size={16} />
//                                         <input className="lp-input" value={formData.passportNumber || ''} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} />
//                                     </div>
//                                 </FG>
//                             )}

//                             <FG label="Date of Birth">
//                                 <div className="input-with-icon">
//                                     <Calendar size={16} />
//                                     <input
//                                         type="date"
//                                         className="lp-input"
//                                         readOnly={formData.nationalityType === 'South African'}
//                                         style={formData.nationalityType === 'South African' ? { background: '#f8fafc' } : {}}
//                                         value={formData.dateOfBirth || ''}
//                                         onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
//                                     />
//                                 </div>
//                             </FG>
//                         </div>

//                         <div className="lp-actions">
//                             <div />
//                             <button className="lp-btn-primary" disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
//                                 Next Step <ChevronRight size={15} />
//                             </button>
//                         </div>
//                     </div>
//                 )}

//                 {/* EXPERIENCE & QUALIFICATIONS */}
//                 {step === 2 && (
//                     <div className="lp-form-body animate-fade-in">
//                         <h3 className="lp-section-title"><BookOpen size={16} /> Experience & Qualifications</h3>
//                         <div className="lp-grid">
//                             <FG label="Highest Qualification">
//                                 <input className="lp-input" placeholder="e.g. BSc Computer Science" value={formData.highestQualification || ''} onChange={e => setFormData({ ...formData, highestQualification: e.target.value })} />
//                             </FG>
//                             <FG label="Years of Industry Experience">
//                                 <input type="number" className="lp-input" min="0" value={formData.yearsExperience} onChange={e => setFormData({ ...formData, yearsExperience: parseInt(e.target.value) || 0 })} />
//                             </FG>
//                         </div>

//                         <div style={{ marginTop: '1.25rem' }}>
//                             <FG label="Professional Bio">
//                                 <textarea className="lp-input" rows={4} placeholder="Provide a brief summary of your background, expertise, and teaching philosophy..." value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
//                             </FG>
//                         </div>

//                         <div className="lp-actions">
//                             <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
//                             <button className="lp-btn-primary" disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
//                         </div>
//                     </div>
//                 )}

//                 {/* DOCUMENT VAULT */}
//                 {step === 3 && (
//                     <div className="lp-form-body animate-fade-in">
//                         <h3 className="lp-section-title"><ShieldCheck size={16} /> Compliance Document Vault</h3>
//                         <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
//                             Please upload your verified compliance documents. <strong>ID and CV are mandatory.</strong>
//                         </p>

//                         <div className="lp-upload-grid">
//                             <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy *' : 'Passport Copy *'} file={idDoc} onUpload={setIdDoc} />
//                             {formData.nationalityType === 'Foreign National' && <DocUpload label="Work Permit / Visa *" file={permitDoc} onUpload={setPermitDoc} />}
//                             <DocUpload label="Detailed CV *" file={cvDoc} onUpload={setCvDoc} />
//                             <DocUpload label="Facilitator Certificate (Optional)" file={facCertDoc} onUpload={setFacCertDoc} isOptional={true} />
//                         </div>

//                         <div className="lp-popia-box">
//                             <label className="lp-popia-checkbox">
//                                 <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
//                                 <span style={{ color: 'black' }}>I declare the above details to be true and accurate, and consent to my data being processed for QCTO compliance purposes and inline with POPIA act.</span>
//                             </label>
//                         </div>
//                         <div className="lp-actions">
//                             <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
//                             <button className="lp-btn-primary" onClick={handleSubmit} disabled={loading || !formData.popiaConsent || !idDoc || !cvDoc}>
//                                 {loading ? <Loader2 className="spin" size={15} /> : 'Complete Registration'} <Save size={15} />
//                             </button>
//                         </div>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };

// const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
//     <div className="lp-fg"><label className="lp-fg-label">{label}</label>{children}</div>
// );

// const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void; isOptional?: boolean }> = ({ label, file, onUpload, isOptional }) => (
//     <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
//         <div className="lp-doc-icon">{file ? <CheckCircle size={22} /> : <Upload size={22} />}</div>
//         <div className="lp-doc-info">
//             <h4>{label}</h4>
//             <span>{file ? file.name : (isOptional ? 'Optional PDF upload' : 'Required PDF upload')}</span>
//         </div>
//         <input type="file" accept=".pdf" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
//     </div>
// );