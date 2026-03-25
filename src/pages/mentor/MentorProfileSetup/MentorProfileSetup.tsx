import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, Briefcase
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import '../../FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup.css';

interface MentorData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    workPermitNumber?: string;
    dateOfBirth: string;

    // Mentor Specific Fields
    companyName: string;
    jobTitle: string;
    yearsExperience: number;
    bio: string;

    popiaConsent: boolean;
    profilePhotoUrl?: string;
}

export const MentorProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<MentorData>>({
        fullName: user?.fullName || '',
        companyName: user?.companyName || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
    });

    // Compliance Document States
    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [permitDoc, setPermitDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);
    const [smeCertDoc, setSmeCertDoc] = useState<File | null>(null);

    // Photo Preview States
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const validateSAID = (id: string) => /^\d{13}$/.test(id);

    // Check if Date of Birth matches the first 6 digits of SA ID
    const doesIdMatchDoB = (id?: string, dob?: string) => {
        if (!id || id.length < 6 || !dob) return false;

        // Extract YYMMDD from the selected Date of Birth (YYYY-MM-DD)
        const dobYear = dob.substring(2, 4);
        const dobMonth = dob.substring(5, 7);
        const dobDay = dob.substring(8, 10);
        const dobFormatted = `${dobYear}${dobMonth}${dobDay}`;

        // Extract first 6 digits from ID
        const idPrefix = id.substring(0, 6);

        return dobFormatted === idPrefix;
    };

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
            return validateSAID(formData.idNumber || '') &&
                !!formData.dateOfBirth &&
                doesIdMatchDoB(formData.idNumber, formData.dateOfBirth);
        } else {
            return !!(formData.passportNumber && formData.passportNumber.length > 5 &&
                formData.workPermitNumber && formData.workPermitNumber.length > 3 &&
                formData.dateOfBirth);
        }
    };

    const canMoveToStep3 = () => {
        return !!formData.companyName && !!formData.jobTitle && !!formData.bio;
    };

    const handleIDChange = (val: string) => {
        setFormData(prev => {
            const newData = { ...prev, idNumber: val };
            // Auto-fill DOB if a valid 13-digit ID is typed
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

    const handleFileUpload = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    const handleSubmit = async () => {
        if (!user?.uid) return;

        setLoading(true);
        try {
            let photoUrl = user?.profilePhotoUrl || "";
            if (profilePhoto) photoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile.jpg`);

            // Only upload the documents that the user actually selected
            const docs: any = {};
            if (idDoc) docs.identificationUrl = await handleFileUpload(idDoc, `staff/${user.uid}/identity_doc.pdf`);
            if (cvDoc) docs.cvUrl = await handleFileUpload(cvDoc, `staff/${user.uid}/cv.pdf`);
            if (permitDoc) docs.workPermitUrl = await handleFileUpload(permitDoc, `staff/${user.uid}/work_permit.pdf`);
            if (smeCertDoc) docs.mentorCertUrl = await handleFileUpload(smeCertDoc, `staff/${user.uid}/mentor_sme_cert.pdf`);

            const finalData: any = {
                ...formData,
                profilePhotoUrl: photoUrl,
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            // Safely merge new compliance docs with any existing ones they might have uploaded before
            if (Object.keys(docs).length > 0) {
                finalData.complianceDocs = { ...(user?.complianceDocs || {}), ...docs };
            }

            await updateDoc(doc(db, 'users', user.uid), finalData);
            await refreshUser();
            navigate('/mentor');
        } catch (error) {
            console.error(error);
            alert('Compliance sync failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const idMismatchError = formData.nationalityType === 'South African' &&
        formData.idNumber && formData.idNumber.length === 13 &&
        formData.dateOfBirth &&
        !doesIdMatchDoB(formData.idNumber, formData.dateOfBirth);

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card practitioner-gate">
                <div className="lp-header">
                    <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span>
                    <h1 className="lp-header__title">Mentor Onboarding</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Workplace Details' : 'Document Vault'}</p>

                    <div className="lp-stepper">
                        {[1, 2, 3].map(s => (
                            <React.Fragment key={s}>
                                <div className={`lp-step ${step >= s ? 'active' : ''}`}>{s}</div>
                                {s < 3 && <div className="lp-step-line" />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* STEP 1: PERSONAL & IDENTITY */}
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
                                    onChange={e => setFormData({ ...formData, nationalityType: e.target.value as any, idNumber: '', passportNumber: '', workPermitNumber: '', dateOfBirth: '' })}
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
                                            className={`lp-input ${(formData.idNumber && !validateSAID(formData.idNumber)) || idMismatchError ? 'error' : ''}`}
                                            maxLength={13}
                                            value={formData.idNumber || ''}
                                            onChange={e => handleIDChange(e.target.value)}
                                        />
                                    </div>
                                </FG>
                            ) : (
                                <>
                                    <FG label="Passport Number">
                                        <div className="input-with-icon">
                                            <Globe size={16} />
                                            <input className="lp-input" value={formData.passportNumber || ''} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} />
                                        </div>
                                    </FG>
                                    <FG label="Work Permit / Visa Number">
                                        <div className="input-with-icon">
                                            <Briefcase size={16} />
                                            <input className="lp-input" value={formData.workPermitNumber || ''} onChange={e => setFormData({ ...formData, workPermitNumber: e.target.value })} />
                                        </div>
                                    </FG>
                                </>
                            )}

                            <FG label="Date of Birth">
                                <div className="input-with-icon">
                                    <Calendar size={16} />
                                    <input
                                        type="date"
                                        className={`lp-input ${idMismatchError ? 'error' : ''}`}
                                        value={formData.dateOfBirth || ''}
                                        onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                    />
                                </div>
                            </FG>

                            {/* Show Error if ID and DOB don't match */}
                            {idMismatchError && (
                                <div style={{ gridColumn: '1 / -1', color: '#ef4444', fontSize: '0.8rem', marginTop: '-0.5rem', fontWeight: 'bold' }}>
                                    Error: Your Date of Birth does not match the first 6 digits of your SA ID Number.
                                </div>
                            )}
                        </div>

                        <div className="lp-actions">
                            <div />
                            <button className="lp-btn-primary" disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
                                Next Step <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2: WORKPLACE DETAILS */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><Briefcase size={16} /> Workplace Details</h3>
                        <div className="lp-grid">
                            <FG label="Host Company Name">
                                <input className="lp-input" placeholder="e.g. Acme Innovations" value={formData.companyName || ''} onChange={e => setFormData({ ...formData, companyName: e.target.value })} />
                            </FG>
                            <FG label="Current Job Title">
                                <input className="lp-input" placeholder="e.g. Senior Developer" value={formData.jobTitle || ''} onChange={e => setFormData({ ...formData, jobTitle: e.target.value })} />
                            </FG>
                            <FG label="Years of Industry Experience">
                                <input type="number" className="lp-input" min="0" value={formData.yearsExperience} onChange={e => setFormData({ ...formData, yearsExperience: parseInt(e.target.value) || 0 })} />
                            </FG>
                        </div>

                        <div style={{ marginTop: '1.25rem' }}>
                            <FG label="Professional Bio / Expertise">
                                <textarea className="lp-input" rows={4} placeholder="Provide a brief summary of your background, expertise, and day-to-day responsibilities..." value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                            </FG>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {/* STEP 3: DOCUMENT VAULT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><ShieldCheck size={16} /> Compliance Document Vault</h3>

                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
                            You can upload your compliance documents now or provide them to the administrator later. <strong>All files are optional right now.</strong>
                        </p>

                        <div className="lp-upload-grid">
                            <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy' : 'Passport Copy'} file={idDoc} onUpload={setIdDoc} isOptional={true} />
                            {formData.nationalityType === 'Foreign National' && <DocUpload label="Work Permit / Visa" file={permitDoc} onUpload={setPermitDoc} isOptional={true} />}
                            <DocUpload label="Detailed CV" file={cvDoc} onUpload={setCvDoc} isOptional={true} />
                            <DocUpload label="SME / Mentor Certificate" file={smeCertDoc} onUpload={setSmeCertDoc} isOptional={true} />
                        </div>

                        <div className="lp-popia-box">
                            <label className="lp-popia-checkbox">
                                <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
                                <span style={{ color: 'black' }}>I declare the above details to be true and accurate, and consent to my data being processed for QCTO compliance purposes and inline with POPIA act.</span>
                            </label>
                        </div>
                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            {/* REMOVED !idDoc || !cvDoc from the disabled check */}
                            <button className="lp-btn-primary" onClick={handleSubmit} disabled={loading || !formData.popiaConsent}>
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

