import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
    User, Upload, FileText, CheckCircle, AlertCircle,
    Save, ChevronRight, ShieldCheck, MapPin, Phone
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './LearnerProfile.css';
import { db, storage } from '../../lib/firebase';

interface LearnerProfileData {
    // Personal
    idNumber: string;
    nationality: string;
    homeLanguage: string;
    equity: string; // African, Coloured, Indian, White, Other
    gender: string;
    disabilityStatus: 'None' | 'Yes';
    disabilityType?: string;

    // Contact & Address
    phone: string;
    streetAddress: string;
    city: string;
    province: string;
    postalCode: string;

    // Next of Kin
    nokName: string;
    nokRelationship: string;
    nokPhone: string;

    // Socio-Economic
    employmentStatus: 'Employed' | 'Unemployed' | 'Student';
    highestQualification: string;
}

const INITIAL_DATA: LearnerProfileData = {
    idNumber: '', nationality: 'South African', homeLanguage: 'English',
    equity: '', gender: '', disabilityStatus: 'None',
    phone: '', streetAddress: '', city: '', province: '', postalCode: '',
    nokName: '', nokRelationship: '', nokPhone: '',
    employmentStatus: 'Unemployed', highestQualification: ''
};

export const LearnerProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1); // 1: Details, 2: Address/NOK, 3: Documents
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<LearnerProfileData>(INITIAL_DATA);

    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [qualDoc, setQualDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);

    // Pre-fill email/name from auth
    useEffect(() => {
        if (user?.profileCompleted) navigate('/learner/dashboard');
    }, [user, navigate]);

    const handleChange = (field: keyof LearnerProfileData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleFileUpload = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    };

    const handleSubmit = async () => {
        if (!user?.uid) return;
        if (!idDoc || !qualDoc) return alert("Please upload your Certified ID and Qualification.");

        setLoading(true);
        try {
            // Upload Documents
            const idUrl = await handleFileUpload(idDoc, `learners/${user.uid}/documents/ID_Document.pdf`);
            const qualUrl = await handleFileUpload(qualDoc, `learners/${user.uid}/documents/Qualification.pdf`);
            const cvUrl = cvDoc ? await handleFileUpload(cvDoc, `learners/${user.uid}/documents/CV.pdf`) : null;

            // Save Profile Data
            const profilePayload = {
                ...formData,
                documents: {
                    idUrl,
                    qualUrl,
                    cvUrl,
                    uploadedAt: new Date().toISOString()
                },
                profileCompleted: true,
                updatedAt: new Date().toISOString()
            };

            await updateDoc(doc(db, 'users', user.uid), profilePayload);

            // Update Local Store & Redirect
            await refreshUser(); // You might need to implement this in useStore to re-fetch user data
            alert("Profile setup complete! Welcome to your dashboard.");
            navigate('/learner/dashboard');

        } catch (error: any) {
            console.error("Profile Save Error:", error);
            alert("Failed to save profile. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card">

                {/* HEADER */}
                <div className="lp-header">
                    <h1>Complete Your Profile</h1>
                    <p>QCTO regulations require the following details before you begin training.</p>
                    <div className="lp-stepper">
                        <div className={`lp-step ${step >= 1 ? 'active' : ''}`}>1. Personal</div>
                        <div className="lp-line" />
                        <div className={`lp-step ${step >= 2 ? 'active' : ''}`}>2. Contact & NOK</div>
                        <div className="lp-line" />
                        <div className={`lp-step ${step >= 3 ? 'active' : ''}`}>3. Documents</div>
                    </div>
                </div>

                {/* ── PERSONAL DETAILS ── */}
                {step === 1 && (
                    <div className="lp-form-body">
                        <h3 className="lp-section-title"><User size={18} /> Personal Information</h3>
                        <div className="lp-grid">
                            <FG label="ID / Passport Number">
                                <input className="lp-input" value={formData.idNumber} onChange={e => handleChange('idNumber', e.target.value)} placeholder="Enter 13-digit ID" />
                            </FG>
                            <FG label="Nationality">
                                <select className="lp-input" value={formData.nationality} onChange={e => handleChange('nationality', e.target.value)}>
                                    <option value="South African">South African</option>
                                    <option value="Other">Other</option>
                                </select>
                            </FG>
                            <FG label="Equity (Race)">
                                <select className="lp-input" value={formData.equity} onChange={e => handleChange('equity', e.target.value)}>
                                    <option value="">Select...</option>
                                    <option value="African">African</option>
                                    <option value="Coloured">Coloured</option>
                                    <option value="Indian">Indian</option>
                                    <option value="White">White</option>
                                </select>
                            </FG>
                            <FG label="Gender">
                                <select className="lp-input" value={formData.gender} onChange={e => handleChange('gender', e.target.value)}>
                                    <option value="">Select...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </FG>
                            <FG label="Home Language">
                                <input className="lp-input" value={formData.homeLanguage} onChange={e => handleChange('homeLanguage', e.target.value)} />
                            </FG>
                            <FG label="Highest Qualification">
                                <input className="lp-input" value={formData.highestQualification} onChange={e => handleChange('highestQualification', e.target.value)} placeholder="e.g. Grade 12 / NQF 4" />
                            </FG>
                        </div>

                        <div className="lp-disability-section">
                            <label className="lp-checkbox-label">
                                <input type="checkbox" checked={formData.disabilityStatus === 'Yes'}
                                    onChange={e => handleChange('disabilityStatus', e.target.checked ? 'Yes' : 'None')} />
                                <span>I have a disability</span>
                            </label>
                            {formData.disabilityStatus === 'Yes' && (
                                <input className="lp-input mt-2" placeholder="Please specify nature of disability"
                                    value={formData.disabilityType || ''} onChange={e => handleChange('disabilityType', e.target.value)} />
                            )}
                        </div>

                        <div className="lp-actions">
                            <div />
                            <button className="lp-btn-primary" onClick={() => setStep(2)}>Next: Contact Info <ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}

                {/* ── ADDRESS & NEXT OF KIN ── */}
                {step === 2 && (
                    <div className="lp-form-body">
                        <h3 className="lp-section-title"><MapPin size={18} /> Contact Details</h3>
                        <div className="lp-grid">
                            <FG label="Phone Number">
                                <input className="lp-input" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
                            </FG>
                            <FG label="Street Address">
                                <input className="lp-input" value={formData.streetAddress} onChange={e => handleChange('streetAddress', e.target.value)} />
                            </FG>
                            <FG label="City / Town">
                                <input className="lp-input" value={formData.city} onChange={e => handleChange('city', e.target.value)} />
                            </FG>
                            <FG label="Postal Code">
                                <input className="lp-input" value={formData.postalCode} onChange={e => handleChange('postalCode', e.target.value)} />
                            </FG>
                        </div>

                        <h3 className="lp-section-title mt-6"><Phone size={18} /> Next of Kin</h3>
                        <div className="lp-grid">
                            <FG label="Full Name">
                                <input className="lp-input" value={formData.nokName} onChange={e => handleChange('nokName', e.target.value)} />
                            </FG>
                            <FG label="Relationship">
                                <input className="lp-input" value={formData.nokRelationship} onChange={e => handleChange('nokRelationship', e.target.value)} placeholder="e.g. Mother, Partner" />
                            </FG>
                            <FG label="Contact Number">
                                <input className="lp-input" value={formData.nokPhone} onChange={e => handleChange('nokPhone', e.target.value)} />
                            </FG>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" onClick={() => setStep(3)}>Next: Documents <ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}

                {/* ── DOCUMENTS ── */}
                {step === 3 && (
                    <div className="lp-form-body">
                        <h3 className="lp-section-title"><FileText size={18} /> Required Documents</h3>
                        <p className="lp-info-text"><AlertCircle size={14} /> Please upload clear PDF or JPG copies. Max 5MB each.</p>

                        <div className="lp-upload-grid">
                            <DocUpload
                                label="Certified ID Copy"
                                sub="(Within 3 months)"
                                file={idDoc}
                                onUpload={setIdDoc}
                            />
                            <DocUpload
                                label="Proof of Qualification"
                                sub="(Highest cert obtained)"
                                file={qualDoc}
                                onUpload={setQualDoc}
                            />
                            <DocUpload
                                label="Curriculum Vitae (CV)"
                                sub="Optional but recommended"
                                file={cvDoc}
                                onUpload={setCvDoc}
                            />
                        </div>

                        <div className="lp-consent">
                            <ShieldCheck size={24} className="lp-consent-icon" />
                            <p>
                                By submitting this form, I declare that the information provided is correct and I give consent for my data to be processed for QCTO and SETA verification purposes in accordance with the POPI Act.
                            </p>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button className="lp-btn-primary" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Uploading & Saving...' : 'Complete Registration'} <Save size={16} />
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

// ─── HELPERS ───
const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="lp-fg">
        <label>{label}</label>
        {children}
    </div>
);

const DocUpload: React.FC<{ label: string; sub: string; file: File | null; onUpload: (f: File) => void }> = ({ label, sub, file, onUpload }) => (
    <div className={`lp-doc-card ${file ? 'uploaded' : ''}`}>
        <div className="lp-doc-icon">
            {file ? <CheckCircle size={24} /> : <Upload size={24} />}
        </div>
        <div className="lp-doc-info">
            <h4>{label}</h4>
            <span>{file ? file.name : sub}</span>
        </div>
        <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => e.target.files && onUpload(e.target.files[0])}
            className="lp-file-input"
        />
    </div>
);