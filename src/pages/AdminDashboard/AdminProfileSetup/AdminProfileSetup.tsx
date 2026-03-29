// src/pages/AdminDashboard/AdminProfileSetup/AdminProfileSetup.tsx


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, Briefcase, Phone, MapPin
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import './AdminProfileSetup.css';
import '../../FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup.css';

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
    const [formData, setFormData] = useState<Partial<AdminData>>({
        fullName: user?.fullName || '',
        email: user?.email || '',
        phone: (user as any)?.phone || '',
        nationalityType: 'South African',
        popiaConsent: false,
    });

    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [appointmentDoc, setAppointmentDoc] = useState<File | null>(null);

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
        return !!(formData.jobTitle && formData.phone && formData.city && formData.province);
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
        setLoading(true);
        try {
            const getExt = (f: File) => f.name.split('.').pop();

            let photoUrl = user?.profilePhotoUrl || "";
            if (profilePhoto) {
                photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${getExt(profilePhoto)}`);
            }

            const docs: any = {};
            if (idDoc) docs.identificationUrl = await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc_${Date.now()}.${getExt(idDoc)}`);
            if (appointmentDoc) docs.appointmentLetterUrl = await handleFileUpload(appointmentDoc, `staff/${user.uid}/appointment_letter_${Date.now()}.${getExt(appointmentDoc)}`);

            const finalData = {
                ...formData,
                profilePhotoUrl: photoUrl,
                complianceDocs: { ...(user as any).complianceDocs, ...docs, updatedAt: new Date().toISOString() },
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
            <div className="lp-card practitioner-gate">
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
                                {photoPreview ? <img src={photoPreview} alt="Preview" style={{ objectFit: 'cover' }} /> : <User size={40} color="#94a3b8" />}
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
                        <h3 className="lp-section-title"><ShieldCheck size={16} /> Official Documents</h3>
                        <div className="lp-upload-grid">
                            <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy' : 'Passport Copy'} file={idDoc} onUpload={setIdDoc} />
                            <DocUpload label="Appointment Letter / Proof of Role" file={appointmentDoc} onUpload={setAppointmentDoc} />
                        </div>

                        <div className="lp-popia-box" style={{ color: 'grey' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <ShieldCheck size={20} color="var(--mlab-blue)" />
                                <h4 style={{ margin: 0, color: '#0f172a' }}>Declarations & POPIA Consent</h4>
                            </div>
                            <p style={{ margin: '0 0 1rem 0' }}>
                                I formally consent to the processing of my data for QCTO compliance. Furthermore, I declare the above to be true and confirm that I am authorized by this institution to act as a Compiler and system Administrator.
                            </p>
                            <label className="lp-popia-checkbox" style={{ color: 'black' }}>
                                <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
                                <span>I agree to the terms and authorize this profile.</span>
                            </label>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button className="lp-btn-primary" style={{ background: '#0f172a' }} onClick={handleSubmit} disabled={loading || !formData.popiaConsent || !idDoc || !appointmentDoc}>
                                {loading ? <Loader2 className="spin" size={15} /> : 'Complete Setup'} <Save size={15} />
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

const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void }> = ({ label, file, onUpload }) => (
    <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
        <div className="lp-doc-icon">{file ? <CheckCircle size={22} color="#0f172a" /> : <Upload size={22} />}</div>
        <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : 'Select PDF or Image'}</span></div>
        <input type="file" accept=".pdf,image/*" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);


// import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     User, Upload, CheckCircle,
//     Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, Briefcase, Phone, MapPin
// } from 'lucide-react';
// import { doc, updateDoc } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { useStore } from '../../../store/useStore';
// import { db, storage } from '../../../lib/firebase';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';

// import '../../FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup.css';
// import './AdminProfileSetup.css';

// interface AdminData {
//     fullName: string;
//     nationalityType: 'South African' | 'Foreign National';
//     idNumber?: string;
//     passportNumber?: string;
//     dateOfBirth: string;

//     // Admin / Compiler Specific
//     jobTitle: string;
//     phone: string;
//     email: string;
//     streetAddress: string;
//     city: string;
//     province: string;

//     popiaConsent: boolean;
//     profilePhotoUrl?: string;
// }

// export const AdminProfileSetup: React.FC = () => {
//     const navigate = useNavigate();
//     const { user, refreshUser, setUser, settings } = useStore();

//     const [step, setStep] = useState(1);
//     const [loading, setLoading] = useState(false);
//     const [formData, setFormData] = useState<Partial<AdminData>>({
//         fullName: user?.fullName || '',
//         email: user?.email || '',
//         phone: (user as any)?.phone || '',
//         nationalityType: 'South African',
//         popiaConsent: false,
//     });

//     const [idDoc, setIdDoc] = useState<File | null>(null);
//     const [appointmentDoc, setAppointmentDoc] = useState<File | null>(null);

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
//         return !!(formData.jobTitle && formData.phone && formData.city && formData.province);
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
//         setLoading(true);
//         try {
//             const getExt = (f: File) => f.name.split('.').pop();

//             let photoUrl = user?.profilePhotoUrl || "";
//             if (profilePhoto) {
//                 photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${getExt(profilePhoto)}`);
//             }

//             const docs: any = {};
//             if (idDoc) docs.identificationUrl = await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc_${Date.now()}.${getExt(idDoc)}`);
//             if (appointmentDoc) docs.appointmentLetterUrl = await handleFileUpload(appointmentDoc, `staff/${user.uid}/appointment_letter_${Date.now()}.${getExt(appointmentDoc)}`);

//             const finalData = {
//                 ...formData,
//                 profilePhotoUrl: photoUrl,
//                 complianceDocs: { ...(user as any).complianceDocs, ...docs, updatedAt: new Date().toISOString() },
//                 profileCompleted: true,
//                 updatedAt: new Date().toISOString(),
//             };

//             await updateDoc(doc(db, 'users', user.uid), finalData);

//             if (setUser) {
//                 setUser({ ...user, ...finalData, profileCompleted: true } as any);
//             }

//             await refreshUser();
//             navigate('/admin', { replace: true });
//         } catch (error) {
//             console.error(error);
//             alert('Compliance sync failed. Please check your connection.');
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div className="lp-container animate-fade-in">
//             <div className="lp-card practitioner-gate" style={{ borderTopColor: '#0f172a' }}>
//                 <div className="lp-header">
//                     {/* <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span> */}
//                     <img height={50} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
//                     <h1 className="lp-header__title">Administrator Setup</h1>
//                     <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Professional Profile' : 'Vault'}</p>

//                     <div className="lp-stepper">
//                         {[1, 2, 3].map(s => (
//                             <React.Fragment key={s}>
//                                 <div className={`lp-step ${step >= s ? 'active' : ''}`} style={step >= s ? { background: '#0f172a', borderColor: '#0f172a' } : {}}>{s}</div>
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
//                                 {photoPreview ? <img src={photoPreview} alt="Preview" style={{ objectFit: 'cover' }} /> : <User size={40} color="#94a3b8" />}
//                             </div>
//                             <label className="setup-camera-btn" style={{ background: '#0f172a' }}>
//                                 <Camera size={16} />
//                                 <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
//                             </label>
//                             <div className="setup-photo-text">
//                                 <h4>Official Headshot</h4>
//                                 <p>Used for internal system tracking and audits.</p>
//                             </div>
//                         </div>

//                         <div className="lp-grid">
//                             <FG label="Full Legal Names">
//                                 <input className="lp-input" value={formData.fullName || ''} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
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
//                             <button className="lp-btn-primary" style={{ background: '#0f172a' }} disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
//                                 Next Step <ChevronRight size={15} />
//                             </button>
//                         </div>
//                     </div>
//                 )}

//                 {/* PROFESSIONAL & CONTACT */}
//                 {step === 2 && (
//                     <div className="lp-form-body animate-fade-in">
//                         <h3 className="lp-section-title"><Briefcase size={16} /> Contact & Professional Profile</h3>

//                         <div style={{ background: '#e0e7ff', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#3730a3' }}>
//                             <strong>Note:</strong> As an Administrator, these contact details will be automatically attached to QCTO LEISA exports identifying you as the primary Compiler.
//                         </div>

//                         <div className="lp-grid">
//                             <FG label="Job Title / Role in Company">
//                                 <input className="lp-input" placeholder="e.g. Data Administrator, Principal" value={formData.jobTitle || ''} onChange={e => setFormData({ ...formData, jobTitle: e.target.value })} />
//                             </FG>
//                             <FG label="Contact Number (Direct)">
//                                 <div className="input-with-icon">
//                                     <Phone size={16} />
//                                     <input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
//                                 </div>
//                             </FG>
//                             <FG label="Email Address">
//                                 <input className="lp-input" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
//                             </FG>
//                         </div>

//                         <h3 className="lp-section-title mt-8"><MapPin size={16} /> Residential Address</h3>
//                         <div className="lp-grid">
//                             <FG label="Street Address">
//                                 <input className="lp-input" value={formData.streetAddress || ''} onChange={e => setFormData({ ...formData, streetAddress: e.target.value })} />
//                             </FG>
//                             <FG label="City / Town">
//                                 <input className="lp-input" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} />
//                             </FG>
//                             <FG label="Province">
//                                 <select className="lp-input" value={formData.province || ''} onChange={e => setFormData({ ...formData, province: e.target.value })}>
//                                     <option value="">Select...</option>
//                                     <option value="Western Cape">Western Cape</option>
//                                     <option value="Eastern Cape">Eastern Cape</option>
//                                     <option value="Northern Cape">Northern Cape</option>
//                                     <option value="Free State">Free State</option>
//                                     <option value="KwaZulu-Natal">KwaZulu-Natal</option>
//                                     <option value="North West">North West</option>
//                                     <option value="Gauteng">Gauteng</option>
//                                     <option value="Mpumalanga">Mpumalanga</option>
//                                     <option value="Limpopo">Limpopo</option>
//                                 </select>
//                             </FG>
//                         </div>

//                         <div className="lp-actions">
//                             <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
//                             <button className="lp-btn-primary" style={{ background: '#0f172a' }} disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
//                         </div>
//                     </div>
//                 )}

//                 {/* DOCUMENT VAULT */}
//                 {step === 3 && (
//                     <div className="lp-form-body animate-fade-in">
//                         <h3 className="lp-section-title"><ShieldCheck size={16} /> Official Documents</h3>
//                         <div className="lp-upload-grid">
//                             <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy' : 'Passport Copy'} file={idDoc} onUpload={setIdDoc} />
//                             <DocUpload label="Appointment Letter / Proof of Role" file={appointmentDoc} onUpload={setAppointmentDoc} />
//                         </div>

//                         <div className="lp-popia-box" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
//                             <label className="lp-popia-checkbox">
//                                 <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
//                                 <span style={{ color: '#0f172a', fontWeight: 500 }}>
//                                     I declare the above to be true and confirm that I am authorized by this institution to act as a Compiler and system Administrator.
//                                 </span>
//                             </label>
//                         </div>

//                         <div className="lp-actions">
//                             <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
//                             <button className="lp-btn-primary" style={{ background: '#0f172a' }} onClick={handleSubmit} disabled={loading || !formData.popiaConsent || !idDoc || !appointmentDoc}>
//                                 {loading ? <Loader2 className="spin" size={15} /> : 'Complete Setup'} <Save size={15} />
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

// const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void }> = ({ label, file, onUpload }) => (
//     <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
//         <div className="lp-doc-icon">{file ? <CheckCircle size={22} color="#0f172a" /> : <Upload size={22} />}</div>
//         <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : 'Select PDF or Image'}</span></div>
//         <input type="file" accept=".pdf,image/*" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
//     </div>
// );