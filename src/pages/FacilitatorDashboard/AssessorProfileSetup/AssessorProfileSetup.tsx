import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Award, Calendar, Fingerprint, Globe, Briefcase
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './AssessorProfileSetup.css';

interface PractitionerData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    workPermitNumber?: string;
    dateOfBirth: string;
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
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<PractitionerData>>({
        fullName: user?.fullName || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
        primarySeta: 'MICT SETA'
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

            const docs: any = {
                identificationUrl: await handleFileUpload(idDoc!, `staff/${user.uid}/identity_doc.pdf`),
                assessorCertUrl: await handleFileUpload(assessorCert!, `staff/${user.uid}/assessor_cert.pdf`),
                regLetterUrl: await handleFileUpload(regLetter!, `staff/${user.uid}/reg_letter.pdf`),
                cvUrl: cvDoc ? await handleFileUpload(cvDoc, `staff/${user.uid}/cv.pdf`) : null,
            };

            if (permitDoc) docs.workPermitUrl = await handleFileUpload(permitDoc, `staff/${user.uid}/work_permit.pdf`);

            const finalData = {
                ...formData,
                profilePhotoUrl: photoUrl,
                complianceDocs: docs,
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
            };

            await updateDoc(doc(db, 'users', user.uid), finalData);
            await refreshUser();
            navigate('/');
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
                    <h1 className="lp-header__title">Assessor Compliance</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Registration' : 'Vault'}</p>

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
                                {photoPreview ? <img src={photoPreview} alt="Preview" /> : <User size={40} color="#94a3b8" />}
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

                {/* PROFESSIONAL SCOPE */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><Award size={16} /> Assessor Registration</h3>
                        <div className="lp-grid">
                            <FG label="Primary SETA Quality Partner">
                                <select className="lp-input" value={formData.primarySeta} onChange={e => setFormData({ ...formData, primarySeta: e.target.value })}>
                                    <option value="MICT SETA">MICT SETA</option>
                                    <option value="SERVICES SETA">SERVICES SETA</option>
                                    <option value="ETDP SETA">ETDP SETA</option>
                                    <option value="QCTO DIRECT">QCTO DIRECT</option>
                                </select>
                            </FG>
                            <FG label="Registration Number">
                                <input className="lp-input" placeholder="e.g. ASS/123/2024" value={formData.assessorRegNumber || ''} onChange={e => setFormData({ ...formData, assessorRegNumber: e.target.value })} />
                            </FG>
                            <FG label="Registration Expiry">
                                <input type="date" className="lp-input" value={formData.registrationExpiry || ''} onChange={e => setFormData({ ...formData, registrationExpiry: e.target.value })} />
                            </FG>
                            <FG label="Highest Qualification">
                                <input className="lp-input" value={formData.highestQualification || ''} onChange={e => setFormData({ ...formData, highestQualification: e.target.value })} />
                            </FG>
                        </div>
                        <FG label="Practitioner Bio (Experience Summary)">
                            <textarea className="lp-input" rows={3} placeholder="Summarize your industry experience..." value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                        </FG>
                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {/* STEP 3: DOCUMENT VAULT */}
                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><ShieldCheck size={16} /> Compliance Document Vault</h3>
                        <div className="lp-upload-grid">
                            <DocUpload label={formData.nationalityType === 'South African' ? 'Certified ID Copy' : 'Passport Copy'} file={idDoc} onUpload={setIdDoc} />
                            {formData.nationalityType === 'Foreign National' && <DocUpload label="Work Permit / Visa" file={permitDoc} onUpload={setPermitDoc} />}
                            <DocUpload label="Assessor Certificate" file={assessorCert} onUpload={setAssessorCert} />
                            <DocUpload label="SETA Reg. Letter" file={regLetter} onUpload={setRegLetter} />
                            <DocUpload label="Detailed CV" file={cvDoc} onUpload={setCvDoc} />
                        </div>
                        <div className="lp-popia-box">
                            <label className="lp-popia-checkbox">
                                <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
                                <span style={{ color: 'black' }}>I declare the above to be true and agree to the QCTO Code of Conduct.</span>
                            </label>
                        </div>
                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
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

const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void }> = ({ label, file, onUpload }) => (
    <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
        <div className="lp-doc-icon">{file ? <CheckCircle size={22} /> : <Upload size={22} />}</div>
        <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : 'Select PDF'}</span></div>
        <input type="file" accept=".pdf" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);