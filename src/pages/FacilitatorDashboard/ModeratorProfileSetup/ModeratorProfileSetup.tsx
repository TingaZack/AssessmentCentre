import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Upload, CheckCircle,
    Save, ChevronRight, ShieldCheck, Loader2, Camera, Calendar, Fingerprint, Globe, Scale
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';

// Reusing the same CSS file from the Assessor setup for consistent UI branding
import '../AssessorProfileSetup/AssessorProfileSetup.css';

interface ModeratorData {
    fullName: string;
    nationalityType: 'South African' | 'Foreign National';
    idNumber?: string;
    passportNumber?: string;
    workPermitNumber?: string;
    dateOfBirth: string;
    moderatorRegNumber: string;    // Specific to Moderators
    assessorRegNumber: string;     // Often required for Moderators
    primarySeta: string;
    specializationScope: string;
    registrationExpiry: string;
    yearsExperience: number;
    highestQualification: string;
    bio: string;
    popiaConsent: boolean;
    profilePhotoUrl?: string;
}

export const ModeratorProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<ModeratorData>>({
        fullName: user?.fullName || '',
        nationalityType: 'South African',
        popiaConsent: false,
        yearsExperience: 0,
        primarySeta: 'MICT SETA'
    });

    // Compliance Document States
    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [permitDoc, setPermitDoc] = useState<File | null>(null);
    const [moderatorCert, setModeratorCert] = useState<File | null>(null);
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
        return !!(formData.moderatorRegNumber && formData.primarySeta && formData.highestQualification);
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
                moderatorCertUrl: await handleFileUpload(moderatorCert!, `staff/${user.uid}/moderator_cert.pdf`),
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
            <div className="lp-card practitioner-gate" style={{ borderTopColor: 'var(--mlab-green)' }}>
                <div className="lp-header">
                    <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span>
                    <h1 className="lp-header__title" style={{ color: 'var(--mlab-green)' }}>QA Moderator Compliance</h1>
                    <p className="lp-header__sub">Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Registration' : 'Vault'}</p>

                    <div className="lp-stepper">
                        {[1, 2, 3].map(s => (
                            <React.Fragment key={s}>
                                <div className={`lp-step ${step >= s ? 'active' : ''}`} style={step >= s ? { background: 'var(--mlab-green)' } : {}}>{s}</div>
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
                            <button className="lp-btn-primary" style={{ background: 'var(--mlab-green)' }} disabled={!canMoveToStep2()} onClick={() => setStep(2)}>
                                Next Step <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2: PROFESSIONAL SCOPE */}
                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><Scale size={16} /> QA Moderator Registration</h3>
                        <div className="lp-grid">
                            <FG label="Primary SETA Quality Partner">
                                <select className="lp-input" value={formData.primarySeta} onChange={e => setFormData({ ...formData, primarySeta: e.target.value })}>
                                    <option value="MICT SETA">MICT SETA</option>
                                    <option value="SERVICES SETA">SERVICES SETA</option>
                                    <option value="ETDP SETA">ETDP SETA</option>
                                    <option value="QCTO DIRECT">QCTO DIRECT</option>
                                </select>
                            </FG>
                            <FG label="Moderator Registration Number">
                                <input className="lp-input" placeholder="e.g. MOD/123/2024" value={formData.moderatorRegNumber || ''} onChange={e => setFormData({ ...formData, moderatorRegNumber: e.target.value })} />
                            </FG>
                            <FG label="Assessor Registration Number (Optional)">
                                <input className="lp-input" placeholder="e.g. ASS/456/2022" value={formData.assessorRegNumber || ''} onChange={e => setFormData({ ...formData, assessorRegNumber: e.target.value })} />
                            </FG>
                            <FG label="QA Registration Expiry Date">
                                <input type="date" className="lp-input" value={formData.registrationExpiry || ''} onChange={e => setFormData({ ...formData, registrationExpiry: e.target.value })} />
                            </FG>
                            <FG label="Highest Academic Qualification">
                                <input className="lp-input" placeholder="e.g. BSc Computer Science" value={formData.highestQualification || ''} onChange={e => setFormData({ ...formData, highestQualification: e.target.value })} />
                            </FG>
                            <FG label="Years in ICT / QA Industry">
                                <input type="number" min="0" className="lp-input" value={formData.yearsExperience || ''} onChange={e => setFormData({ ...formData, yearsExperience: parseInt(e.target.value) || 0 })} />
                            </FG>
                        </div>
                        <FG label="Moderation Scope & Bio">
                            <textarea className="lp-input" rows={3} placeholder="Summarize your experience as a quality assurance moderator..." value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                        </FG>
                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" style={{ background: 'var(--mlab-green)' }} disabled={!canMoveToStep3()} onClick={() => setStep(3)}>Next Documents <ChevronRight size={15} /></button>
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
                            <DocUpload label="Moderator Certificate" file={moderatorCert} onUpload={setModeratorCert} />
                            <DocUpload label="SETA Reg. Letter" file={regLetter} onUpload={setRegLetter} />
                            <DocUpload label="Detailed QA CV" file={cvDoc} onUpload={setCvDoc} />
                        </div>
                        <div className="lp-popia-box">
                            <label className="lp-popia-checkbox">
                                <input type="checkbox" checked={formData.popiaConsent} onChange={e => setFormData({ ...formData, popiaConsent: e.target.checked })} />
                                <span style={{ color: 'black' }}>I declare the above to be true and agree to the QCTO Code of Conduct for Internal Moderators and inline with POPIA act.</span>
                            </label>
                        </div>
                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button className="lp-btn-primary" style={{ background: 'var(--mlab-green)' }} onClick={handleSubmit} disabled={loading || !formData.popiaConsent || !idDoc || !moderatorCert || !regLetter}>
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
        <div className="lp-doc-icon">{file ? <CheckCircle size={22} color="var(--mlab-green)" /> : <Upload size={22} />}</div>
        <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : 'Select PDF'}</span></div>
        <input type="file" accept=".pdf" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);

// import React, { useState, useEffect } from 'react';
// import {
//     User, Mail, Phone, ShieldCheck, FileText, Edit3, Save, X,
//     Fingerprint, GraduationCap, AlertCircle, Info, Loader2,
//     Camera, Award, Calendar, Briefcase, PenTool, Scale,
//     ArrowLeft
// } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { doc, getDoc, updateDoc } from 'firebase/firestore';
// import { storage, db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { useNavigate } from 'react-router-dom';
// import { SignatureSetupModal } from '../../../components/auth/SignatureSetupModal';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';

// // 🚀 Reusing the Assessor CSS as the layouts are identical
// import '../AssessorProfileSetup/AssessorProfileSetup.css';

// export const ModeratorProfileSetup: React.FC = () => {
//     const { user, setUser } = useStore();
//     const navigate = useNavigate();
//     const toast = useToast();

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);
//     const [isEditing, setIsEditing] = useState(false);
//     const [isSigModalOpen, setIsSigModalOpen] = useState(false);

//     // Profile State
//     const [profile, setProfile] = useState<any>(null);
//     const [formData, setFormData] = useState<any>({});

//     // Photo Upload States
//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);

//     // 🚀 STRICT COMPLIANCE: Moderator Pen is always GREEN
//     const inkColor = 'green';

//     useEffect(() => {
//         const fetchProfile = async () => {
//             if (!user?.uid) return;
//             try {
//                 const docRef = doc(db, 'users', user.uid);
//                 const docSnap = await getDoc(docRef);
//                 if (docSnap.exists()) {
//                     const data = docSnap.data();
//                     setProfile(data);
//                     setFormData(data);
//                     setPhotoPreview(data.profilePhotoUrl || null);

//                     // If profile is fully completed, auto-redirect them to their dashboard
//                     // unless they explicitly navigated here to edit.
//                     if (data.profileCompleted && !window.location.search.includes('edit=true')) {
//                         navigate('/moderation', { replace: true });
//                     }
//                 }
//             } catch (error) {
//                 console.error("Failed to load profile:", error);
//                 toast.error("Failed to load profile data.");
//             } finally {
//                 setLoading(false);
//             }
//         };
//         fetchProfile();
//     }, [user?.uid, navigate, toast]);

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

//     const handleSave = async () => {
//         if (!user?.uid) return;

//         // Basic validation for mandatory compliance fields
//         if (!formData.fullName || !formData.phone || !formData.assessorRegNumber) {
//             toast.error("Please fill in all mandatory identification and registration fields.");
//             return;
//         }

//         setSaving(true);
//         try {
//             let finalPhotoUrl = formData.profilePhotoUrl;

//             if (profilePhoto) {
//                 const ext = profilePhoto.name.split('.').pop();
//                 finalPhotoUrl = await handleFileUpload(profilePhoto, `staff/${user.uid}/profile_${Date.now()}.${ext}`);
//             }

//             // A Moderator profile is considered "complete" if they have a signature and reg number
//             const isCompleted = !!(profile?.signatureUrl && formData.assessorRegNumber);

//             const updatedData = {
//                 ...formData,
//                 profilePhotoUrl: finalPhotoUrl,
//                 profileCompleted: isCompleted
//             };

//             await updateDoc(doc(db, 'users', user.uid), updatedData);

//             // Update local state
//             setProfile(updatedData);
//             setUser({ ...user, ...updatedData });

//             setIsEditing(false);
//             setProfilePhoto(null);

//             toast.success("Moderator profile updated successfully.");

//             if (isCompleted) {
//                 setTimeout(() => navigate('/moderation'), 1500);
//             }

//         } catch (error) {
//             console.error('Update failed', error);
//             toast.error("Failed to save profile updates.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: string | number | boolean) =>
//         setFormData((prev: any) => ({ ...prev, [field]: val }));

//     if (loading) {
//         return (
//             <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e' }}>
//                 <Loader2 className="lpv-spin" size={32} />
//                 <p style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Loading Compliance Profile...</p>
//             </div>
//         );
//     }

//     const isVerified = profile?.profileCompleted === true;

//     return (
//         <div className="lpv-wrapper animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* 🚀 SIGNATURE MODAL 🚀 */}
//             {isSigModalOpen && (
//                 <SignatureSetupModal
//                     userUid={user!.uid}
//                     onComplete={() => {
//                         setIsSigModalOpen(false);
//                         window.location.reload(); // Refresh to sync the new signature from Firestore
//                     }}
//                 />
//             )}

//             {/* ── Top Bar ── */}
//             <div style={{ background: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                     <ShieldCheck size={24} color="var(--mlab-blue)" />
//                     <h1 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>Moderator Compliance Setup</h1>
//                 </div>
//                 {isVerified && (
//                     <button onClick={() => navigate('/moderation')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 'bold', color: '#475569' }}>
//                         Enter Moderation Room <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
//                     </button>
//                 )}
//             </div>

//             {/* ── Practitioner Status Banner ────────────────────────────── */}
//             <div style={{ padding: '0 2rem' }}>
//                 <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
//                     <Scale
//                         size={22}
//                         className="lpv-banner__icon"
//                         color={isVerified ? 'var(--mlab-green-dark)' : 'var(--mlab-amber)'}
//                     />
//                     <div>
//                         <span className="lpv-banner__title">
//                             Internal QA Status: {isVerified ? 'Verified & Authorized' : 'Pending Verification'}
//                         </span>
//                         <p className="lpv-banner__desc">
//                             {isVerified
//                                 ? 'Your profile is compliant. You may proceed to endorse official scripts.'
//                                 : 'Compliance audit in progress. Ensure your registration number and signature are configured.'}
//                         </p>
//                     </div>
//                 </div>
//             </div>

//             <div className="lpv-layout" style={{ padding: '0 2rem' }}>
//                 <div className="lpv-main-stack">

//                     {/* Identity & Contact Section */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title">
//                                 <User size={16} /> Identity &amp; Contact
//                             </h3>
//                             <button
//                                 className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`}
//                                 onClick={() => {
//                                     setIsEditing(!isEditing);
//                                     if (isEditing) {
//                                         setFormData({ ...profile });
//                                         setPhotoPreview(profile?.profilePhotoUrl || null);
//                                         setProfilePhoto(null);
//                                     }
//                                 }}
//                             >
//                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
//                             </button>
//                         </div>

//                         {/* PROFILE PHOTO AREA */}
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                             <div style={{ position: 'relative' }}>
//                                 <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
//                                     {photoPreview ? (
//                                         <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//                                     ) : (
//                                         <User size={36} color="#94a3b8" />
//                                     )}
//                                 </div>
//                                 {isEditing && (
//                                     <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-blue)', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}>
//                                         <Camera size={14} />
//                                         <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
//                                     </label>
//                                 )}
//                             </div>
//                             <div>
//                                 <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>{formData?.fullName || 'Moderator'}</h4>
//                                 <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
//                                     {isEditing ? 'Click the camera icon to update your photo.' : 'Internal Moderator'}
//                                 </p>
//                             </div>
//                         </div>

//                         <div className="lpv-grid-2">
//                             <EditField label="Full Legal Name" value={formData?.fullName} icon={<User size={13} />} isEditing={isEditing} onChange={val => update('fullName', val)} />
//                             <ROField label="Identity Number" value={profile?.idNumber} icon={<Fingerprint size={13} />} />
//                             <EditField label="Contact Number" value={formData?.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={val => update('phone', val)} />
//                             <ROField label="Email Address" value={profile?.email} icon={<Mail size={13} />} />
//                         </div>
//                     </section>

//                     {/* 🚀 SIGNATURE SECTION 🚀 */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title">
//                                 <PenTool size={16} /> Digital Signature Certificate
//                             </h3>
//                             <button className="lpv-sig-edit-btn" onClick={() => setIsSigModalOpen(true)}>
//                                 <Edit3 size={12} /> {profile?.signatureUrl ? 'Update Signature' : 'Configure Signature'}
//                             </button>
//                         </div>
//                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
//                             {profile?.signatureUrl ? (
//                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//                                     <TintedSignature imageUrl={profile.signatureUrl} color={inkColor} />
//                                     <span style={{ fontSize: '0.7rem', color: inkColor, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
//                                         Internal Moderator Signature (Green Ink)
//                                     </span>
//                                 </div>
//                             ) : (
//                                 <div style={{ color: 'var(--mlab-amber)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
//                                     <AlertCircle size={16} /> Signature Configuration Required.
//                                 </div>
//                             )}
//                         </div>
//                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
//                             Internal Moderation signatures are color-coded to Green Ink for official QA endorsement per QCTO compliance standards.
//                         </p>
//                     </section>

//                     {/* Registration & Scope Section */}
//                     <section className="lpv-panel">
//                         <h3 className="lpv-panel__title lpv-panel__title--simple">
//                             <ShieldCheck size={16} /> QCTO Moderation Scope
//                         </h3>

//                         <div className="lpv-grid-2">
//                             <EditField label="Moderator Reg. Number" value={formData?.assessorRegNumber} icon={<ShieldCheck size={13} />} isEditing={isEditing} onChange={val => update('assessorRegNumber', val)} />
//                             <EditField label="Primary SETA" value={formData?.primarySeta} icon={<Award size={13} />} isEditing={isEditing} onChange={val => update('primarySeta', val)} />
//                             <EditField label="Specialization Scope" value={formData?.specializationScope} icon={<Briefcase size={13} />} isEditing={isEditing} onChange={val => update('specializationScope', val)} />
//                             <EditField label="Reg. Expiry Date" value={formData?.registrationExpiry} icon={<Calendar size={13} />} isEditing={isEditing} onChange={val => update('registrationExpiry', val)} />
//                         </div>

//                         <div className="lpv-divider" />

//                         <div className="lpv-fg">
//                             <div className="lpv-field__label"><Info size={13} /> Professional Bio</div>
//                             {isEditing ? (
//                                 <textarea
//                                     className="lpv-input"
//                                     rows={5}
//                                     value={formData?.bio || ''}
//                                     onChange={e => update('bio', e.target.value)}
//                                     style={{ resize: 'vertical' }}
//                                 />
//                             ) : (
//                                 <div className="lpv-field__value" style={{ fontWeight: 'normal', lineHeight: '1.6', textAlign: 'justify', color: '#334155' }}>
//                                     {profile?.bio || 'No professional bio provided.'}
//                                 </div>
//                             )}
//                         </div>
//                     </section>
//                 </div>

//                 {/* ── Aside: Qualifications & Docs ────────────────────────── */}
//                 <aside className="lpv-aside">

//                     <div className="lpv-qual-card" style={{ background: 'var(--mlab-blue)' }}>
//                         <div className="lpv-qual-card__label">
//                             <GraduationCap size={13} /> Highest Qualification
//                         </div>
//                         <p className="lpv-qual-card__name">
//                             {profile?.highestQualification || 'Not Specified'}
//                         </p>
//                         <span className="lpv-qual-card__saqa">
//                             Experience: {profile?.yearsExperience || 0} Years
//                         </span>
//                     </div>

//                     <div className="lpv-vault-card">
//                         <h4 className="lpv-vault-card__title">
//                             <ShieldCheck size={15} /> Compliance Vault
//                         </h4>
//                         <div className="lpv-vault-links">
//                             <DocVaultLink label="ID / Passport Copy" url={profile?.complianceDocs?.identificationUrl} />
//                             <DocVaultLink label="Moderator Certificate" url={profile?.complianceDocs?.assessorCertUrl} />
//                             <DocVaultLink label="SETA Reg. Letter" url={profile?.complianceDocs?.regLetterUrl} />
//                             <DocVaultLink label="Comprehensive CV" url={profile?.complianceDocs?.cvUrl} />
//                         </div>
//                     </div>

//                     {isEditing && (
//                         <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
//                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Confirm Changes</>}
//                         </button>
//                     )}
//                 </aside>
//             </div>
//         </div>
//     );
// };

// /* ── Typed Helpers ───────────────────────────────────────────────────────── */

// const TintedSignature = ({ imageUrl, color }: { imageUrl: string, color: string }) => {
//     // Pure CSS Pen color transformation (CORS-proof)
//     const filterMap: any = {
//         black: 'brightness(0)',
//         blue: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)',
//         red: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)',
//         green: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'
//     };

//     return (
//         <img
//             src={imageUrl}
//             alt="Signature"
//             style={{
//                 height: '60px',
//                 width: 'auto',
//                 maxWidth: '100%',
//                 objectFit: 'contain',
//                 marginBottom: '10px',
//                 filter: filterMap[color] || 'none'
//             }}
//         />
//     );
// };

// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
//             {value || '—'}
//         </div>
//     </div>
// );

// const EditField = ({ label, value, isEditing, onChange, icon }: { label: string; value?: string | number; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; }) => (
//     <div>
//         <div className="lpv-field__label">{icon}{label}</div>
//         {isEditing ? (
//             <input type="text" className="lpv-input" value={value || ''} onChange={e => onChange(e.target.value)} />
//         ) : (
//             <div className={`lpv-field__value${!value ? ' lpv-field__value--empty' : ''}`}>
//                 {value || '—'}
//             </div>
//         )}
//     </div>
// );

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
//         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
//         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
//     </a>
// );