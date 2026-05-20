// src/pages/Public/StudentVerification.tsx

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
import moment from 'moment';

import { getFunctions, httpsCallable } from 'firebase/functions';
import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

export const StudentVerification: React.FC = () => {
    const { verificationCode } = useParams<{ verificationCode: string }>();
    const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
    const [studentData, setStudentData] = useState<any>(null);

    useEffect(() => {
        const verifyStudent = async () => {
            if (!verificationCode) {
                setStatus('invalid');
                return;
            }

            try {
                // CALL THE SECURE FIREBASE CLOUD FUNCTION
                // This bypasses local security rules by asking the server to check the database for us
                const functions = getFunctions();
                const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');
                
                const response = await verifyStudentCard({ code: verificationCode });
                const result = response.data as any;

                if (result.status === 'valid' || result.status === 'expired') {
                    setStudentData(result.studentData);
                    setStatus(result.status);
                } else {
                    setStatus('invalid');
                }

            } catch (error) {
                console.error("Cloud Verification failed:", error);
                setStatus('invalid');
            }
        };

        verifyStudent();
    }, [verificationCode]);

    // ─── LOADING STATE ───
    if (status === 'loading') {
        return (
            <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
                <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
                    <div className="lfm-header" style={{ justifyContent: 'center' }}>
                        <h2 className="lfm-header__title">System Query</h2>
                    </div>
                    <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
                        <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
                        <p style={{
                            marginTop: '1.5rem',
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--mlab-blue)',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 700
                        }}>
                            Authenticating Registry...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const isSuccess = status === 'valid';

    // ─── LOADED STATE ───
    return (
        <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
            <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

                {/* STRICT HEADER */}
                <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
                    <h2 className="lfm-header__title">
                        {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
                        Identity Verification
                    </h2>
                </div>

                <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

                    {/* TRAFFIC LIGHT STATUS BANNER */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '2rem 1.5rem',
                        background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
                        border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
                        marginBottom: '1.5rem',
                        textAlign: 'center'
                    }}>
                        {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

                        <h1 style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: '1.8rem',
                            fontWeight: 700,
                            color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            margin: '1rem 0 0.5rem 0'
                        }}>
                            {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
                        </h1>

                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
                            {isSuccess
                                ? "This digital identity card is authentic and currently active in the mLab registry."
                                : "This digital identity card is not recognized or has expired. Access should be denied."}
                        </p>
                    </div>

                    {/* STUDENT DEMOGRAPHICS PANEL */}
                    {studentData && status !== 'invalid' && (
                        <div className="lfm-demographics-panel" style={{
                            borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
                            padding: '1.5rem'
                        }}>
                            <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
                                <User size={14} color="var(--mlab-blue)" /> Student Profile
                            </div>

                            {/* Name Block */}
                            <div style={{
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                background: 'var(--mlab-white)',
                                border: '1px solid var(--mlab-border)'
                            }}>
                                <div style={{
                                    fontFamily: 'var(--font-heading)',
                                    fontSize: '1.4rem',
                                    fontWeight: 700,
                                    color: 'var(--mlab-blue)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '0.25rem'
                                }}>
                                    {studentData.name}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                                    {studentData.cohort}
                                </div>
                            </div>

                            {/* Form Grid for Details */}
                            <div className="lfm-grid">
                                
                                <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
                                    <label>Generated Student Number</label>
                                    <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
                                        <Fingerprint size={14} color="var(--mlab-blue)" />
                                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
                                            {studentData.studentNumber}
                                        </span>
                                    </div>
                                </div>

                                <div className="lfm-fg">
                                    <label>Delivery Site (Campus)</label>
                                    <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
                                        <MapPin size={14} color="var(--mlab-grey)" />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {studentData.campus}
                                        </span>
                                    </div>
                                </div>
                                <div className="lfm-fg">
                                    <label>Valid Thru</label>
                                    <div className="lfm-input" style={{
                                        background: 'var(--mlab-white)',
                                        color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'default'
                                    }}>
                                        <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
                                    </div>
                                </div>
                            </div>

                            {/* Error Banner for Expired */}
                            {!isSuccess && status === 'expired' && (
                                <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
                                    <AlertCircle size={16} />
                                    <span>This student's training period has concluded.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* STRICT FOOTER */}
                <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
                    <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '0.75rem',
                        color: 'var(--mlab-grey)',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <ShieldCheck size={14} color="var(--mlab-green)" />
                        mLab Secure Identity Engine
                    </div>
                </div>

            </div>
        </div>
    );
};


// // src/pages/Public/StudentVerification.tsx

// import React, { useEffect, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// import moment from 'moment';

// import { getFunctions, httpsCallable } from 'firebase/functions';
// import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// export const StudentVerification: React.FC = () => {
//     const { verificationCode } = useParams<{ verificationCode: string }>();
//     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
//     const [studentData, setStudentData] = useState<any>(null);

//     useEffect(() => {
//         const verifyStudent = async () => {
//             if (!verificationCode) {
//                 setStatus('invalid');
//                 return;
//             }

//             try {
//                 // 🚀 CALL THE SECURE FIREBASE CLOUD FUNCTION
//                 // This bypasses local security rules by asking the server to check the database for us
//                 const functions = getFunctions();
//                 const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');
                
//                 const response = await verifyStudentCard({ code: verificationCode });
//                 const result = response.data as any;

//                 if (result.status === 'valid' || result.status === 'expired') {
//                     setStudentData(result.studentData);
//                     setStatus(result.status);
//                 } else {
//                     setStatus('invalid');
//                 }

//             } catch (error) {
//                 console.error("Cloud Verification failed:", error);
//                 setStatus('invalid');
//             }
//         };

//         verifyStudent();
//     }, [verificationCode]);

//     // ─── LOADING STATE ───
//     if (status === 'loading') {
//         return (
//             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
//                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
//                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
//                         <h2 className="lfm-header__title">System Query</h2>
//                     </div>
//                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
//                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
//                         <p style={{
//                             marginTop: '1.5rem',
//                             fontFamily: 'var(--font-heading)',
//                             color: 'var(--mlab-blue)',
//                             letterSpacing: '0.1em',
//                             textTransform: 'uppercase',
//                             fontWeight: 700
//                         }}>
//                             Authenticating Registry...
//                         </p>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     const isSuccess = status === 'valid';

//     // ─── LOADED STATE ───
//     return (
//         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
//             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

//                 {/* STRICT HEADER */}
//                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
//                     <h2 className="lfm-header__title">
//                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
//                         Identity Verification
//                     </h2>
//                 </div>

//                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

//                     {/* TRAFFIC LIGHT STATUS BANNER */}
//                     <div style={{
//                         display: 'flex',
//                         flexDirection: 'column',
//                         alignItems: 'center',
//                         padding: '2rem 1.5rem',
//                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
//                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
//                         marginBottom: '1.5rem',
//                         textAlign: 'center'
//                     }}>
//                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

//                         <h1 style={{
//                             fontFamily: 'var(--font-heading)',
//                             fontSize: '1.8rem',
//                             fontWeight: 700,
//                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
//                             textTransform: 'uppercase',
//                             letterSpacing: '0.05em',
//                             margin: '1rem 0 0.5rem 0'
//                         }}>
//                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
//                         </h1>

//                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
//                             {isSuccess
//                                 ? "This digital identity card is authentic and currently active in the mLab registry."
//                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
//                         </p>
//                     </div>

//                     {/* STUDENT DEMOGRAPHICS PANEL */}
//                     {studentData && status !== 'invalid' && (
//                         <div className="lfm-demographics-panel" style={{
//                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
//                             padding: '1.5rem'
//                         }}>
//                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
//                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
//                             </div>

//                             {/* Name Block */}
//                             <div style={{
//                                 marginBottom: '1.5rem',
//                                 padding: '1rem',
//                                 background: 'var(--mlab-white)',
//                                 border: '1px solid var(--mlab-border)'
//                             }}>
//                                 <div style={{
//                                     fontFamily: 'var(--font-heading)',
//                                     fontSize: '1.4rem',
//                                     fontWeight: 700,
//                                     color: 'var(--mlab-blue)',
//                                     textTransform: 'uppercase',
//                                     letterSpacing: '0.05em',
//                                     marginBottom: '0.25rem'
//                                 }}>
//                                     {studentData.name}
//                                 </div>
//                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
//                                     {studentData.cohort}
//                                 </div>
//                             </div>

//                             {/* Form Grid for Details */}
//                             <div className="lfm-grid">
                                
//                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
//                                     <label>Generated Student Number</label>
//                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
//                                         <Fingerprint size={14} color="var(--mlab-blue)" />
//                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
//                                             {studentData.studentNumber}
//                                         </span>
//                                     </div>
//                                 </div>

//                                 <div className="lfm-fg">
//                                     <label>Delivery Site (Campus)</label>
//                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
//                                         <MapPin size={14} color="var(--mlab-grey)" />
//                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                                             {studentData.campus}
//                                         </span>
//                                     </div>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Valid Thru</label>
//                                     <div className="lfm-input" style={{
//                                         background: 'var(--mlab-white)',
//                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
//                                         fontWeight: 700,
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         gap: '8px',
//                                         cursor: 'default'
//                                     }}>
//                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* Error Banner for Expired */}
//                             {!isSuccess && status === 'expired' && (
//                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
//                                     <AlertCircle size={16} />
//                                     <span>This student's training period has concluded.</span>
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>

//                 {/* STRICT FOOTER */}
//                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
//                     <div style={{
//                         fontFamily: 'var(--font-heading)',
//                         fontSize: '0.75rem',
//                         color: 'var(--mlab-grey)',
//                         letterSpacing: '0.1em',
//                         textTransform: 'uppercase',
//                         display: 'flex',
//                         alignItems: 'center',
//                         gap: '6px'
//                     }}>
//                         <ShieldCheck size={14} color="var(--mlab-green)" />
//                         mLab Secure Identity Engine
//                     </div>
//                 </div>

//             </div>
//         </div>
//     );
// };


// // // src/pages/Public/StudentVerification.tsx

// // import React, { useEffect, useState } from 'react';
// // import { useParams } from 'react-router-dom';
// // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // import moment from 'moment';

// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // export const StudentVerification: React.FC = () => {
// //     // The hash might be URL-encoded, which is fine, we pass it straight to the backend
// //     const { verificationCode } = useParams<{ verificationCode: string }>();
// //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// //     const [studentData, setStudentData] = useState<any>(null);

// //     useEffect(() => {
// //         const verifyStudent = async () => {
// //             if (!verificationCode) {
// //                 setStatus('invalid');
// //                 return;
// //             }

// //             try {
// //                 // 🚀 Send the raw, encrypted QR code string directly to the secure backend!
// //                 const functions = getFunctions();
// //                 const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');
                
// //                 const response = await verifyStudentCard({ code: verificationCode });
// //                 const result = response.data as any;

// //                 if (result.status === 'valid' || result.status === 'expired') {
// //                     setStudentData(result.studentData);
// //                     setStatus(result.status);
// //                 } else {
// //                     setStatus('invalid');
// //                 }

// //             } catch (error) {
// //                 console.error("Cloud Verification failed:", error);
// //                 setStatus('invalid');
// //             }
// //         };

// //         verifyStudent();
// //     }, [verificationCode]);

// //     // ─── LOADING STATE ───
// //     if (status === 'loading') {
// //         return (
// //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// //                         <h2 className="lfm-header__title">System Query</h2>
// //                     </div>
// //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// //                         <p style={{
// //                             marginTop: '1.5rem',
// //                             fontFamily: 'var(--font-heading)',
// //                             color: 'var(--mlab-blue)',
// //                             letterSpacing: '0.1em',
// //                             textTransform: 'uppercase',
// //                             fontWeight: 700
// //                         }}>
// //                             Authenticating Registry...
// //                         </p>
// //                     </div>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     const isSuccess = status === 'valid';

// //     // ─── LOADED STATE ───
// //     return (
// //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// //                 {/* STRICT HEADER */}
// //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// //                     <h2 className="lfm-header__title">
// //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// //                         Identity Verification
// //                     </h2>
// //                 </div>

// //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// //                     <div style={{
// //                         display: 'flex',
// //                         flexDirection: 'column',
// //                         alignItems: 'center',
// //                         padding: '2rem 1.5rem',
// //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// //                         marginBottom: '1.5rem',
// //                         textAlign: 'center'
// //                     }}>
// //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// //                         <h1 style={{
// //                             fontFamily: 'var(--font-heading)',
// //                             fontSize: '1.8rem',
// //                             fontWeight: 700,
// //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// //                             textTransform: 'uppercase',
// //                             letterSpacing: '0.05em',
// //                             margin: '1rem 0 0.5rem 0'
// //                         }}>
// //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// //                         </h1>

// //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// //                             {isSuccess
// //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// //                         </p>
// //                     </div>

// //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// //                     {studentData && status !== 'invalid' && (
// //                         <div className="lfm-demographics-panel" style={{
// //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// //                             padding: '1.5rem'
// //                         }}>
// //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// //                             </div>

// //                             {/* Name Block */}
// //                             <div style={{
// //                                 marginBottom: '1.5rem',
// //                                 padding: '1rem',
// //                                 background: 'var(--mlab-white)',
// //                                 border: '1px solid var(--mlab-border)'
// //                             }}>
// //                                 <div style={{
// //                                     fontFamily: 'var(--font-heading)',
// //                                     fontSize: '1.4rem',
// //                                     fontWeight: 700,
// //                                     color: 'var(--mlab-blue)',
// //                                     textTransform: 'uppercase',
// //                                     letterSpacing: '0.05em',
// //                                     marginBottom: '0.25rem'
// //                                 }}>
// //                                     {studentData.name}
// //                                 </div>
// //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// //                                     {studentData.cohort}
// //                                 </div>
// //                             </div>

// //                             {/* Form Grid for Details */}
// //                             <div className="lfm-grid">
                                
// //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// //                                     <label>Generated Student Number</label>
// //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// //                                             {studentData.studentNumber}
// //                                         </span>
// //                                     </div>
// //                                 </div>

// //                                 <div className="lfm-fg">
// //                                     <label>Delivery Site (Campus)</label>
// //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// //                                         <MapPin size={14} color="var(--mlab-grey)" />
// //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// //                                             {studentData.campus}
// //                                         </span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="lfm-fg">
// //                                     <label>Valid Thru</label>
// //                                     <div className="lfm-input" style={{
// //                                         background: 'var(--mlab-white)',
// //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// //                                         fontWeight: 700,
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         gap: '8px',
// //                                         cursor: 'default'
// //                                     }}>
// //                                         {/* 🎯 DATE BUG IS GONE! It's now safely formatted via Moment.js */}
// //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             {/* Error Banner for Expired */}
// //                             {!isSuccess && status === 'expired' && (
// //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// //                                     <AlertCircle size={16} />
// //                                     <span>This student's training period has concluded.</span>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>

// //                 {/* STRICT FOOTER */}
// //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// //                     <div style={{
// //                         fontFamily: 'var(--font-heading)',
// //                         fontSize: '0.75rem',
// //                         color: 'var(--mlab-grey)',
// //                         letterSpacing: '0.1em',
// //                         textTransform: 'uppercase',
// //                         display: 'flex',
// //                         alignItems: 'center',
// //                         gap: '6px'
// //                     }}>
// //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// //                         mLab Secure Identity Engine
// //                     </div>
// //                 </div>

// //             </div>
// //         </div>
// //     );
// // };


// // // // src/pages/Public/StudentVerification.tsx

// // // import React, { useEffect, useState } from 'react';
// // // import { useParams } from 'react-router-dom';
// // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // import moment from 'moment';

// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // // export const StudentVerification: React.FC = () => {
// // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // //     const [studentData, setStudentData] = useState<any>(null);

// // //     useEffect(() => {
// // //         const verifyStudent = async () => {
// // //             if (!verificationCode) {
// // //                 setStatus('invalid');
// // //                 return;
// // //             }

// // //             try {
// // //                 // 🚀 Send the raw, encrypted QR code string directly to the secure backend!
// // //                 const functions = getFunctions();
// // //                 const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');
                
// // //                 const response = await verifyStudentCard({ code: verificationCode });
// // //                 const result = response.data as any;

// // //                 if (result.status === 'valid' || result.status === 'expired') {
// // //                     setStudentData(result.studentData);
// // //                     setStatus(result.status);
// // //                 } else {
// // //                     setStatus('invalid');
// // //                 }

// // //             } catch (error) {
// // //                 console.error("Cloud Verification failed:", error);
// // //                 setStatus('invalid');
// // //             }
// // //         };

// // //         verifyStudent();
// // //     }, [verificationCode]);

// // //     // ─── LOADING STATE ───
// // //     if (status === 'loading') {
// // //         return (
// // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // //                         <h2 className="lfm-header__title">System Query</h2>
// // //                     </div>
// // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // //                         <p style={{
// // //                             marginTop: '1.5rem',
// // //                             fontFamily: 'var(--font-heading)',
// // //                             color: 'var(--mlab-blue)',
// // //                             letterSpacing: '0.1em',
// // //                             textTransform: 'uppercase',
// // //                             fontWeight: 700
// // //                         }}>
// // //                             Authenticating Registry...
// // //                         </p>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         );
// // //     }

// // //     const isSuccess = status === 'valid';

// // //     // ─── LOADED STATE ───
// // //     return (
// // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // //                 {/* STRICT HEADER */}
// // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // //                     <h2 className="lfm-header__title">
// // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // //                         Identity Verification
// // //                     </h2>
// // //                 </div>

// // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // //                     <div style={{
// // //                         display: 'flex',
// // //                         flexDirection: 'column',
// // //                         alignItems: 'center',
// // //                         padding: '2rem 1.5rem',
// // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // //                         marginBottom: '1.5rem',
// // //                         textAlign: 'center'
// // //                     }}>
// // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // //                         <h1 style={{
// // //                             fontFamily: 'var(--font-heading)',
// // //                             fontSize: '1.8rem',
// // //                             fontWeight: 700,
// // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // //                             textTransform: 'uppercase',
// // //                             letterSpacing: '0.05em',
// // //                             margin: '1rem 0 0.5rem 0'
// // //                         }}>
// // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // //                         </h1>

// // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // //                             {isSuccess
// // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // //                         </p>
// // //                     </div>

// // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // //                     {studentData && status !== 'invalid' && (
// // //                         <div className="lfm-demographics-panel" style={{
// // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // //                             padding: '1.5rem'
// // //                         }}>
// // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // //                             </div>

// // //                             {/* Name Block */}
// // //                             <div style={{
// // //                                 marginBottom: '1.5rem',
// // //                                 padding: '1rem',
// // //                                 background: 'var(--mlab-white)',
// // //                                 border: '1px solid var(--mlab-border)'
// // //                             }}>
// // //                                 <div style={{
// // //                                     fontFamily: 'var(--font-heading)',
// // //                                     fontSize: '1.4rem',
// // //                                     fontWeight: 700,
// // //                                     color: 'var(--mlab-blue)',
// // //                                     textTransform: 'uppercase',
// // //                                     letterSpacing: '0.05em',
// // //                                     marginBottom: '0.25rem'
// // //                                 }}>
// // //                                     {studentData.name}
// // //                                 </div>
// // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // //                                     {studentData.cohort}
// // //                                 </div>
// // //                             </div>

// // //                             {/* Form Grid for Details */}
// // //                             <div className="lfm-grid">
                                
// // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // //                                     <label>Generated Student Number</label>
// // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // //                                             {studentData.studentNumber}
// // //                                         </span>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="lfm-fg">
// // //                                     <label>Delivery Site (Campus)</label>
// // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // //                                             {studentData.campus}
// // //                                         </span>
// // //                                     </div>
// // //                                 </div>
// // //                                 <div className="lfm-fg">
// // //                                     <label>Valid Thru</label>
// // //                                     <div className="lfm-input" style={{
// // //                                         background: 'var(--mlab-white)',
// // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // //                                         fontWeight: 700,
// // //                                         display: 'flex',
// // //                                         alignItems: 'center',
// // //                                         gap: '8px',
// // //                                         cursor: 'default'
// // //                                     }}>
// // //                                         {/* 🎯 DATE BUG IS GONE! It's now safely formatted via Moment.js */}
// // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Error Banner for Expired */}
// // //                             {!isSuccess && status === 'expired' && (
// // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // //                                     <AlertCircle size={16} />
// // //                                     <span>This student's training period has concluded.</span>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 {/* STRICT FOOTER */}
// // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // //                     <div style={{
// // //                         fontFamily: 'var(--font-heading)',
// // //                         fontSize: '0.75rem',
// // //                         color: 'var(--mlab-grey)',
// // //                         letterSpacing: '0.1em',
// // //                         textTransform: 'uppercase',
// // //                         display: 'flex',
// // //                         alignItems: 'center',
// // //                         gap: '6px'
// // //                     }}>
// // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // //                         mLab Secure Identity Engine
// // //                     </div>
// // //                 </div>

// // //             </div>
// // //         </div>
// // //     );
// // // };



// // // // // src/pages/Public/StudentVerification.tsx

// // // // import React, { useEffect, useState } from 'react';
// // // // import { useParams } from 'react-router-dom';
// // // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // // import moment from 'moment';

// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // // // export const StudentVerification: React.FC = () => {
// // // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // // //     const [studentData, setStudentData] = useState<any>(null);

// // // //     useEffect(() => {
// // // //         const verifyStudent = async () => {
// // // //             if (!verificationCode) {
// // // //                 setStatus('invalid');
// // // //                 return;
// // // //             }

// // // //             try {
// // // //                 // 🚀 CALL THE SECURE FIREBASE CLOUD FUNCTION
// // // //                 // This bypasses local security rules by asking the server to check the database for us
// // // //                 const functions = getFunctions();
// // // //                 const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');
                
// // // //                 const response = await verifyStudentCard({ code: verificationCode });
// // // //                 const result = response.data as any;

// // // //                 if (result.status === 'valid' || result.status === 'expired') {
// // // //                     setStudentData(result.studentData);
// // // //                     setStatus(result.status);
// // // //                 } else {
// // // //                     setStatus('invalid');
// // // //                 }

// // // //             } catch (error) {
// // // //                 console.error("Cloud Verification failed:", error);
// // // //                 setStatus('invalid');
// // // //             }
// // // //         };

// // // //         verifyStudent();
// // // //     }, [verificationCode]);

// // // //     // ─── LOADING STATE ───
// // // //     if (status === 'loading') {
// // // //         return (
// // // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // // //                         <h2 className="lfm-header__title">System Query</h2>
// // // //                     </div>
// // // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // // //                         <p style={{
// // // //                             marginTop: '1.5rem',
// // // //                             fontFamily: 'var(--font-heading)',
// // // //                             color: 'var(--mlab-blue)',
// // // //                             letterSpacing: '0.1em',
// // // //                             textTransform: 'uppercase',
// // // //                             fontWeight: 700
// // // //                         }}>
// // // //                             Authenticating Registry...
// // // //                         </p>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     const isSuccess = status === 'valid';

// // // //     // ─── LOADED STATE ───
// // // //     return (
// // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // // //                 {/* STRICT HEADER */}
// // // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // // //                     <h2 className="lfm-header__title">
// // // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // // //                         Identity Verification
// // // //                     </h2>
// // // //                 </div>

// // // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // // //                     <div style={{
// // // //                         display: 'flex',
// // // //                         flexDirection: 'column',
// // // //                         alignItems: 'center',
// // // //                         padding: '2rem 1.5rem',
// // // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // // //                         marginBottom: '1.5rem',
// // // //                         textAlign: 'center'
// // // //                     }}>
// // // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // // //                         <h1 style={{
// // // //                             fontFamily: 'var(--font-heading)',
// // // //                             fontSize: '1.8rem',
// // // //                             fontWeight: 700,
// // // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // //                             textTransform: 'uppercase',
// // // //                             letterSpacing: '0.05em',
// // // //                             margin: '1rem 0 0.5rem 0'
// // // //                         }}>
// // // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // // //                         </h1>

// // // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // // //                             {isSuccess
// // // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // // //                         </p>
// // // //                     </div>

// // // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // // //                     {studentData && status !== 'invalid' && (
// // // //                         <div className="lfm-demographics-panel" style={{
// // // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // //                             padding: '1.5rem'
// // // //                         }}>
// // // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // // //                             </div>

// // // //                             {/* Name Block */}
// // // //                             <div style={{
// // // //                                 marginBottom: '1.5rem',
// // // //                                 padding: '1rem',
// // // //                                 background: 'var(--mlab-white)',
// // // //                                 border: '1px solid var(--mlab-border)'
// // // //                             }}>
// // // //                                 <div style={{
// // // //                                     fontFamily: 'var(--font-heading)',
// // // //                                     fontSize: '1.4rem',
// // // //                                     fontWeight: 700,
// // // //                                     color: 'var(--mlab-blue)',
// // // //                                     textTransform: 'uppercase',
// // // //                                     letterSpacing: '0.05em',
// // // //                                     marginBottom: '0.25rem'
// // // //                                 }}>
// // // //                                     {studentData.name}
// // // //                                 </div>
// // // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // // //                                     {studentData.cohort}
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* Form Grid for Details */}
// // // //                             <div className="lfm-grid">
                                
// // // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // // //                                     <label>Generated Student Number</label>
// // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // // //                                             {studentData.studentNumber}
// // // //                                         </span>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="lfm-fg">
// // // //                                     <label>Delivery Site (Campus)</label>
// // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // //                                             {studentData.campus}
// // // //                                         </span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="lfm-fg">
// // // //                                     <label>Valid Thru</label>
// // // //                                     <div className="lfm-input" style={{
// // // //                                         background: 'var(--mlab-white)',
// // // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // //                                         fontWeight: 700,
// // // //                                         display: 'flex',
// // // //                                         alignItems: 'center',
// // // //                                         gap: '8px',
// // // //                                         cursor: 'default'
// // // //                                     }}>
// // // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* Error Banner for Expired */}
// // // //                             {!isSuccess && status === 'expired' && (
// // // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // // //                                     <AlertCircle size={16} />
// // // //                                     <span>This student's training period has concluded.</span>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}
// // // //                 </div>

// // // //                 {/* STRICT FOOTER */}
// // // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // // //                     <div style={{
// // // //                         fontFamily: 'var(--font-heading)',
// // // //                         fontSize: '0.75rem',
// // // //                         color: 'var(--mlab-grey)',
// // // //                         letterSpacing: '0.1em',
// // // //                         textTransform: 'uppercase',
// // // //                         display: 'flex',
// // // //                         alignItems: 'center',
// // // //                         gap: '6px'
// // // //                     }}>
// // // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // // //                         mLab Secure Identity Engine
// // // //                     </div>
// // // //                 </div>

// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };



// // // // // // src/pages/Public/StudentVerification.tsx

// // // // // import React, { useEffect, useState } from 'react';
// // // // // import { useParams } from 'react-router-dom';
// // // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // // // import moment from 'moment';

// // // // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// // // // // import { db } from '../../../../lib/firebase';

// // // // // export const StudentVerification: React.FC = () => {
// // // // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // // // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // // // //     const [studentData, setStudentData] = useState<any>(null);

// // // // //     useEffect(() => {
// // // // //         const verifyStudent = async () => {
// // // // //             if (!verificationCode) {
// // // // //                 setStatus('invalid');
// // // // //                 return;
// // // // //             }

// // // // //             try {
// // // // //                 // 1. CLEAN THE INCOMING ID
// // // // //                 const decodedCode = decodeURIComponent(verificationCode);
// // // // //                 const targetIdNumber = decodedCode.replace(/[\s-]/g, '').trim();
                
// // // // //                 const learnersRef = collection(db, 'learners');
// // // // //                 let learnerId: string | null = null;
// // // // //                 let learnerData: any = null;

// // // // //                 // 2. FIND THE LEARNER USING EXCLUSIVELY THEIR ID NUMBER
// // // // //                 if (targetIdNumber) {
// // // // //                     const learnerSnap = await getDocs(query(learnersRef, where('idNumber', '==', targetIdNumber)));
// // // // //                     if (!learnerSnap.empty) {
// // // // //                         learnerId = learnerSnap.docs[0].id;
// // // // //                         learnerData = learnerSnap.docs[0].data();
// // // // //                     }
// // // // //                 }

// // // // //                 // Fallback (Just in case the old verification code was passed)
// // // // //                 if (!learnerId) {
// // // // //                     const upperRawId = targetIdNumber.toUpperCase();

// // // // //                     let fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', targetIdNumber)));
// // // // //                     if (fallbackSnap.empty) fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', upperRawId)));
                    
// // // // //                     if (!fallbackSnap.empty) {
// // // // //                         learnerId = fallbackSnap.docs[0].id;
// // // // //                         learnerData = fallbackSnap.docs[0].data();
// // // // //                     }
// // // // //                 }

// // // // //                 // 3. FETCH THEIR ACTIVE ENROLLMENT
// // // // //                 let enrollSnap;
// // // // //                 if (learnerId) {
// // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('learnerId', '==', learnerId)));
// // // // //                 } else {
// // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('verificationCode', '==', targetIdNumber)));
// // // // //                 }

// // // // //                 if (!enrollSnap || enrollSnap.empty) {
// // // // //                     setStatus('invalid');
// // // // //                     return;
// // // // //                 }

// // // // //                 const enrollmentsList = enrollSnap.docs.map(d => d.data());
// // // // //                 const activeEnrollment = enrollmentsList.find(e => e.status === 'active') || enrollmentsList[0];

// // // // //                 if (!learnerData && activeEnrollment.learnerId) {
// // // // //                     const lSnap = await getDoc(doc(db, 'learners', activeEnrollment.learnerId));
// // // // //                     if (lSnap.exists()) {
// // // // //                         learnerData = lSnap.data();
// // // // //                         learnerId = lSnap.id;
// // // // //                     }
// // // // //                 }

// // // // //                 // 4. CHECK EXPIRATION
// // // // //                 const isExpired = moment().isAfter(moment(activeEnrollment.endDate)) || activeEnrollment.status !== 'active';

// // // // //                 // 🚀 RECONSTRUCT THE EXACT STUDENT ID FOR VISUAL VERIFICATION
// // // // //                 // Extracts last 4 of UID + "CT" + last 4 of ID Number
// // // // //                 let generatedStudentId = 'PENDING';
// // // // //                 if (learnerId && learnerData?.idNumber) {
// // // // //                     const uidPart = learnerId.slice(-4).toUpperCase();
// // // // //                     const idPart = String(learnerData.idNumber).slice(-4);
// // // // //                     generatedStudentId = `${uidPart}CT${idPart}`;
// // // // //                 } else if (activeEnrollment.verificationCode) {
// // // // //                     generatedStudentId = activeEnrollment.verificationCode;
// // // // //                 }

// // // // //                 setStudentData({
// // // // //                     name: learnerData?.fullName || activeEnrollment.learnerName || 'Unknown Learner',
// // // // //                     cohort: activeEnrollment.cohortName || 'CodeTribe Academy',
// // // // //                     campus: activeEnrollment.campusName || activeEnrollment.location || 'mLab Campus',
// // // // //                     validThru: activeEnrollment.endDate,
// // // // //                     status: activeEnrollment.status,
// // // // //                     studentNumber: generatedStudentId
// // // // //                 });

// // // // //                 setStatus(isExpired ? 'expired' : 'valid');

// // // // //             } catch (error) {
// // // // //                 console.error("Verification failed:", error);
// // // // //                 setStatus('invalid');
// // // // //             }
// // // // //         };

// // // // //         verifyStudent();
// // // // //     }, [verificationCode]);

// // // // //     // ─── LOADING STATE ───
// // // // //     if (status === 'loading') {
// // // // //         return (
// // // // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // // // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // // // //                         <h2 className="lfm-header__title">System Query</h2>
// // // // //                     </div>
// // // // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // // // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // // // //                         <p style={{
// // // // //                             marginTop: '1.5rem',
// // // // //                             fontFamily: 'var(--font-heading)',
// // // // //                             color: 'var(--mlab-blue)',
// // // // //                             letterSpacing: '0.1em',
// // // // //                             textTransform: 'uppercase',
// // // // //                             fontWeight: 700
// // // // //                         }}>
// // // // //                             Authenticating Registry...
// // // // //                         </p>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>
// // // // //         );
// // // // //     }

// // // // //     const isSuccess = status === 'valid';

// // // // //     // ─── LOADED STATE ───
// // // // //     return (
// // // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // // // //                 {/* STRICT HEADER */}
// // // // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // // // //                     <h2 className="lfm-header__title">
// // // // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // // // //                         Identity Verification
// // // // //                     </h2>
// // // // //                 </div>

// // // // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // // // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // // // //                     <div style={{
// // // // //                         display: 'flex',
// // // // //                         flexDirection: 'column',
// // // // //                         alignItems: 'center',
// // // // //                         padding: '2rem 1.5rem',
// // // // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // // // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // // // //                         marginBottom: '1.5rem',
// // // // //                         textAlign: 'center'
// // // // //                     }}>
// // // // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // // // //                         <h1 style={{
// // // // //                             fontFamily: 'var(--font-heading)',
// // // // //                             fontSize: '1.8rem',
// // // // //                             fontWeight: 700,
// // // // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // //                             textTransform: 'uppercase',
// // // // //                             letterSpacing: '0.05em',
// // // // //                             margin: '1rem 0 0.5rem 0'
// // // // //                         }}>
// // // // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // // // //                         </h1>

// // // // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // // // //                             {isSuccess
// // // // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // // // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // // // //                         </p>
// // // // //                     </div>

// // // // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // // // //                     {studentData && status !== 'invalid' && (
// // // // //                         <div className="lfm-demographics-panel" style={{
// // // // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // // //                             padding: '1.5rem'
// // // // //                         }}>
// // // // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // // // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // // // //                             </div>

// // // // //                             {/* Name Block */}
// // // // //                             <div style={{
// // // // //                                 marginBottom: '1.5rem',
// // // // //                                 padding: '1rem',
// // // // //                                 background: 'var(--mlab-white)',
// // // // //                                 border: '1px solid var(--mlab-border)'
// // // // //                             }}>
// // // // //                                 <div style={{
// // // // //                                     fontFamily: 'var(--font-heading)',
// // // // //                                     fontSize: '1.4rem',
// // // // //                                     fontWeight: 700,
// // // // //                                     color: 'var(--mlab-blue)',
// // // // //                                     textTransform: 'uppercase',
// // // // //                                     letterSpacing: '0.05em',
// // // // //                                     marginBottom: '0.25rem'
// // // // //                                 }}>
// // // // //                                     {studentData.name}
// // // // //                                 </div>
// // // // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // // // //                                     {studentData.cohort}
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             {/* Form Grid for Details */}
// // // // //                             <div className="lfm-grid">
                                
// // // // //                                 {/* 🚀 VISUAL STUDENT ID VERIFICATION BLOCK */}
// // // // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // // // //                                     <label>Generated Student Number</label>
// // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // // // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // // // //                                             {studentData.studentNumber}
// // // // //                                         </span>
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 <div className="lfm-fg">
// // // // //                                     <label>Delivery Site (Campus)</label>
// // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // // // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // // //                                             {studentData.campus}
// // // // //                                         </span>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                                 <div className="lfm-fg">
// // // // //                                     <label>Valid Thru</label>
// // // // //                                     <div className="lfm-input" style={{
// // // // //                                         background: 'var(--mlab-white)',
// // // // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // //                                         fontWeight: 700,
// // // // //                                         display: 'flex',
// // // // //                                         alignItems: 'center',
// // // // //                                         gap: '8px',
// // // // //                                         cursor: 'default'
// // // // //                                     }}>
// // // // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             {/* Error Banner for Expired */}
// // // // //                             {!isSuccess && status === 'expired' && (
// // // // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // // // //                                     <AlertCircle size={16} />
// // // // //                                     <span>This student's training period has concluded.</span>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     )}
// // // // //                 </div>

// // // // //                 {/* STRICT FOOTER */}
// // // // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // // // //                     <div style={{
// // // // //                         fontFamily: 'var(--font-heading)',
// // // // //                         fontSize: '0.75rem',
// // // // //                         color: 'var(--mlab-grey)',
// // // // //                         letterSpacing: '0.1em',
// // // // //                         textTransform: 'uppercase',
// // // // //                         display: 'flex',
// // // // //                         alignItems: 'center',
// // // // //                         gap: '6px'
// // // // //                     }}>
// // // // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // // // //                         mLab Secure Identity Engine
// // // // //                     </div>
// // // // //                 </div>

// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };


// // // // // // // src/pages/Public/StudentVerification.tsx

// // // // // // import React, { useEffect, useState } from 'react';
// // // // // // import { useParams } from 'react-router-dom';
// // // // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // // // // import moment from 'moment';

// // // // // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// // // // // // import { db } from '../../../../lib/firebase';

// // // // // // // ─── 🚀 SIMPLE DECRYPTION UTILITY ───
// // // // // // const decryptIdFromTransit = (hash: string) => {
// // // // // //     try {
// // // // // //         const decodedPayload = hash.match(/.{1,2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('') || '';
// // // // // //         if (decodedPayload.startsWith('MLAB_ID:')) {
// // // // // //             return decodedPayload.replace('MLAB_ID:', '').trim();
// // // // // //         }
// // // // // //         return null;
// // // // // //     } catch (e) {
// // // // // //         return null;
// // // // // //     }
// // // // // // };

// // // // // // export const StudentVerification: React.FC = () => {
// // // // // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // // // // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // // // // //     const [studentData, setStudentData] = useState<any>(null);

// // // // // //     useEffect(() => {
// // // // // //         const verifyStudent = async () => {
// // // // // //             if (!verificationCode) {
// // // // // //                 setStatus('invalid');
// // // // // //                 return;
// // // // // //             }

// // // // // //             try {
// // // // // //                 // 1. DECRYPT THE HASH TO EXTRACT THE RAW ID NUMBER
// // // // // //                 const decodedCode = decodeURIComponent(verificationCode);
// // // // // //                 const targetIdNumber = decryptIdFromTransit(decodedCode);
                
// // // // // //                 const learnersRef = collection(db, 'learners');
// // // // // //                 let learnerId: string | null = null;
// // // // // //                 let learnerData: any = null;

// // // // // //                 // 2. FIND THE LEARNER USING EXCLUSIVELY THEIR ID NUMBER
// // // // // //                 if (targetIdNumber) {
// // // // // //                     const learnerSnap = await getDocs(query(learnersRef, where('idNumber', '==', targetIdNumber)));
// // // // // //                     if (!learnerSnap.empty) {
// // // // // //                         learnerId = learnerSnap.docs[0].id;
// // // // // //                         learnerData = learnerSnap.docs[0].data();
// // // // // //                     }
// // // // // //                 }

// // // // // //                 // Fallback (Just in case raw code was passed)
// // // // // //                 if (!learnerId) {
// // // // // //                     const rawId = decodedCode.trim();
// // // // // //                     const cleanId = rawId.replace(/[\s-]/g, '').toLowerCase();
// // // // // //                     const upperRawId = rawId.toUpperCase();
// // // // // //                     const upperCleanId = cleanId.toUpperCase();

// // // // // //                     let fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', rawId)));
// // // // // //                     if (fallbackSnap.empty) fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', upperRawId)));
// // // // // //                     if (fallbackSnap.empty) fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', upperCleanId)));
                    
// // // // // //                     if (!fallbackSnap.empty) {
// // // // // //                         learnerId = fallbackSnap.docs[0].id;
// // // // // //                         learnerData = fallbackSnap.docs[0].data();
// // // // // //                     }
// // // // // //                 }

// // // // // //                 // 3. FETCH THEIR ACTIVE ENROLLMENT
// // // // // //                 let enrollSnap;
// // // // // //                 if (learnerId) {
// // // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('learnerId', '==', learnerId)));
// // // // // //                 } else {
// // // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('verificationCode', '==', decodedCode.trim())));
// // // // // //                 }

// // // // // //                 if (!enrollSnap || enrollSnap.empty) {
// // // // // //                     setStatus('invalid');
// // // // // //                     return;
// // // // // //                 }

// // // // // //                 const enrollmentsList = enrollSnap.docs.map(d => d.data());
// // // // // //                 const activeEnrollment = enrollmentsList.find(e => e.status === 'active') || enrollmentsList[0];

// // // // // //                 if (!learnerData && activeEnrollment.learnerId) {
// // // // // //                     const lSnap = await getDoc(doc(db, 'learners', activeEnrollment.learnerId));
// // // // // //                     if (lSnap.exists()) {
// // // // // //                         learnerData = lSnap.data();
// // // // // //                         learnerId = lSnap.id;
// // // // // //                     }
// // // // // //                 }

// // // // // //                 // 4. CHECK EXPIRATION
// // // // // //                 const isExpired = moment().isAfter(moment(activeEnrollment.endDate)) || activeEnrollment.status !== 'active';

// // // // // //                 // 🚀 RECONSTRUCT THE EXACT STUDENT ID FOR VISUAL VERIFICATION
// // // // // //                 // Extracts last 4 of UID + "CT" + last 4 of ID Number
// // // // // //                 let generatedStudentId = 'PENDING';
// // // // // //                 if (learnerId && learnerData?.idNumber) {
// // // // // //                     const uidPart = learnerId.slice(-4).toUpperCase();
// // // // // //                     const idPart = String(learnerData.idNumber).slice(-4);
// // // // // //                     generatedStudentId = `${uidPart}CT${idPart}`;
// // // // // //                 } else if (activeEnrollment.verificationCode) {
// // // // // //                     generatedStudentId = activeEnrollment.verificationCode;
// // // // // //                 }

// // // // // //                 setStudentData({
// // // // // //                     name: learnerData?.fullName || activeEnrollment.learnerName || 'Unknown Learner',
// // // // // //                     cohort: activeEnrollment.cohortName || 'CodeTribe Academy',
// // // // // //                     campus: activeEnrollment.campusName || activeEnrollment.location || 'mLab Campus',
// // // // // //                     validThru: activeEnrollment.endDate,
// // // // // //                     status: activeEnrollment.status,
// // // // // //                     studentNumber: generatedStudentId // Added to state
// // // // // //                 });

// // // // // //                 setStatus(isExpired ? 'expired' : 'valid');

// // // // // //             } catch (error) {
// // // // // //                 console.error("Verification failed:", error);
// // // // // //                 setStatus('invalid');
// // // // // //             }
// // // // // //         };

// // // // // //         verifyStudent();
// // // // // //     }, [verificationCode]);

// // // // // //     // ─── LOADING STATE ───
// // // // // //     if (status === 'loading') {
// // // // // //         return (
// // // // // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // // // // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // // // // //                         <h2 className="lfm-header__title">System Query</h2>
// // // // // //                     </div>
// // // // // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // // // // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // // // // //                         <p style={{
// // // // // //                             marginTop: '1.5rem',
// // // // // //                             fontFamily: 'var(--font-heading)',
// // // // // //                             color: 'var(--mlab-blue)',
// // // // // //                             letterSpacing: '0.1em',
// // // // // //                             textTransform: 'uppercase',
// // // // // //                             fontWeight: 700
// // // // // //                         }}>
// // // // // //                             Authenticating Registry...
// // // // // //                         </p>
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //         );
// // // // // //     }

// // // // // //     const isSuccess = status === 'valid';

// // // // // //     // ─── LOADED STATE ───
// // // // // //     return (
// // // // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // // // // //                 {/* STRICT HEADER */}
// // // // // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // // // // //                     <h2 className="lfm-header__title">
// // // // // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // // // // //                         Identity Verification
// // // // // //                     </h2>
// // // // // //                 </div>

// // // // // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // // // // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // // // // //                     <div style={{
// // // // // //                         display: 'flex',
// // // // // //                         flexDirection: 'column',
// // // // // //                         alignItems: 'center',
// // // // // //                         padding: '2rem 1.5rem',
// // // // // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // // // // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // // // // //                         marginBottom: '1.5rem',
// // // // // //                         textAlign: 'center'
// // // // // //                     }}>
// // // // // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // // // // //                         <h1 style={{
// // // // // //                             fontFamily: 'var(--font-heading)',
// // // // // //                             fontSize: '1.8rem',
// // // // // //                             fontWeight: 700,
// // // // // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // // //                             textTransform: 'uppercase',
// // // // // //                             letterSpacing: '0.05em',
// // // // // //                             margin: '1rem 0 0.5rem 0'
// // // // // //                         }}>
// // // // // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // // // // //                         </h1>

// // // // // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // // // // //                             {isSuccess
// // // // // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // // // // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // // // // //                         </p>
// // // // // //                     </div>

// // // // // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // // // // //                     {studentData && status !== 'invalid' && (
// // // // // //                         <div className="lfm-demographics-panel" style={{
// // // // // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // // // //                             padding: '1.5rem'
// // // // // //                         }}>
// // // // // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // // // // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // // // // //                             </div>

// // // // // //                             {/* Name Block */}
// // // // // //                             <div style={{
// // // // // //                                 marginBottom: '1.5rem',
// // // // // //                                 padding: '1rem',
// // // // // //                                 background: 'var(--mlab-white)',
// // // // // //                                 border: '1px solid var(--mlab-border)'
// // // // // //                             }}>
// // // // // //                                 <div style={{
// // // // // //                                     fontFamily: 'var(--font-heading)',
// // // // // //                                     fontSize: '1.4rem',
// // // // // //                                     fontWeight: 700,
// // // // // //                                     color: 'var(--mlab-blue)',
// // // // // //                                     textTransform: 'uppercase',
// // // // // //                                     letterSpacing: '0.05em',
// // // // // //                                     marginBottom: '0.25rem'
// // // // // //                                 }}>
// // // // // //                                     {studentData.name}
// // // // // //                                 </div>
// // // // // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // // // // //                                     {studentData.cohort}
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // //                             {/* Form Grid for Details */}
// // // // // //                             <div className="lfm-grid">
                                
// // // // // //                                 {/* 🚀 VISUAL STUDENT ID VERIFICATION BLOCK */}
// // // // // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // // // // //                                     <label>Generated Student Number</label>
// // // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // // // // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // // // // //                                             {studentData.studentNumber}
// // // // // //                                         </span>
// // // // // //                                     </div>
// // // // // //                                 </div>

// // // // // //                                 <div className="lfm-fg">
// // // // // //                                     <label>Delivery Site (Campus)</label>
// // // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // // // // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // // // //                                             {studentData.campus}
// // // // // //                                         </span>
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                                 <div className="lfm-fg">
// // // // // //                                     <label>Valid Thru</label>
// // // // // //                                     <div className="lfm-input" style={{
// // // // // //                                         background: 'var(--mlab-white)',
// // // // // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // // //                                         fontWeight: 700,
// // // // // //                                         display: 'flex',
// // // // // //                                         alignItems: 'center',
// // // // // //                                         gap: '8px',
// // // // // //                                         cursor: 'default'
// // // // // //                                     }}>
// // // // // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // //                             {/* Error Banner for Expired */}
// // // // // //                             {!isSuccess && status === 'expired' && (
// // // // // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // // // // //                                     <AlertCircle size={16} />
// // // // // //                                     <span>This student's training period has concluded.</span>
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     )}
// // // // // //                 </div>

// // // // // //                 {/* STRICT FOOTER */}
// // // // // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // // // // //                     <div style={{
// // // // // //                         fontFamily: 'var(--font-heading)',
// // // // // //                         fontSize: '0.75rem',
// // // // // //                         color: 'var(--mlab-grey)',
// // // // // //                         letterSpacing: '0.1em',
// // // // // //                         textTransform: 'uppercase',
// // // // // //                         display: 'flex',
// // // // // //                         alignItems: 'center',
// // // // // //                         gap: '6px'
// // // // // //                     }}>
// // // // // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // // // // //                         mLab Secure Identity Engine
// // // // // //                     </div>
// // // // // //                 </div>

// // // // // //             </div>
// // // // // //         </div>
// // // // // //     );
// // // // // // };


// // // // // // // // src/pages/Public/StudentVerification.tsx

// // // // // // // import React, { useEffect, useState } from 'react';
// // // // // // // import { useParams } from 'react-router-dom';
// // // // // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // // // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // // // // // import moment from 'moment';

// // // // // // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// // // // // // // import { db } from '../../../../lib/firebase';

// // // // // // // // ─── 🚀 SIMPLE DECRYPTION UTILITY ───
// // // // // // // const decryptIdFromTransit = (hash: string) => {
// // // // // // //     try {
// // // // // // //         const decodedPayload = hash.match(/.{1,2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('') || '';
// // // // // // //         if (decodedPayload.startsWith('MLAB_ID:')) {
// // // // // // //             return decodedPayload.replace('MLAB_ID:', '').trim();
// // // // // // //         }
// // // // // // //         return null;
// // // // // // //     } catch (e) {
// // // // // // //         return null;
// // // // // // //     }
// // // // // // // };

// // // // // // // export const StudentVerification: React.FC = () => {
// // // // // // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // // // // // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // // // // // //     const [studentData, setStudentData] = useState<any>(null);

// // // // // // //     useEffect(() => {
// // // // // // //         const verifyStudent = async () => {
// // // // // // //             if (!verificationCode) {
// // // // // // //                 setStatus('invalid');
// // // // // // //                 return;
// // // // // // //             }

// // // // // // //             try {
// // // // // // //                 // 1. DECRYPT THE HASH TO EXTRACT THE RAW ID NUMBER
// // // // // // //                 const decodedCode = decodeURIComponent(verificationCode);
// // // // // // //                 const targetIdNumber = decryptIdFromTransit(decodedCode);
                
// // // // // // //                 const learnersRef = collection(db, 'learners');
// // // // // // //                 let learnerId: string | null = null;
// // // // // // //                 let learnerData: any = null;

// // // // // // //                 // 2. FIND THE LEARNER USING EXCLUSIVELY THEIR ID NUMBER
// // // // // // //                 if (targetIdNumber) {
// // // // // // //                     const learnerSnap = await getDocs(query(learnersRef, where('idNumber', '==', targetIdNumber)));
// // // // // // //                     if (!learnerSnap.empty) {
// // // // // // //                         learnerId = learnerSnap.docs[0].id;
// // // // // // //                         learnerData = learnerSnap.docs[0].data();
// // // // // // //                     }
// // // // // // //                 }

// // // // // // //                 // Fallback (Just in case raw code was passed)
// // // // // // //                 if (!learnerId) {
// // // // // // //                     const rawId = decodedCode.trim();
// // // // // // //                     const cleanId = rawId.replace(/[\s-]/g, '').toLowerCase();
// // // // // // //                     const upperRawId = rawId.toUpperCase();
// // // // // // //                     const upperCleanId = cleanId.toUpperCase();

// // // // // // //                     let fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', rawId)));
// // // // // // //                     if (fallbackSnap.empty) fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', upperRawId)));
// // // // // // //                     if (fallbackSnap.empty) fallbackSnap = await getDocs(query(learnersRef, where('verificationCode', '==', upperCleanId)));
                    
// // // // // // //                     if (!fallbackSnap.empty) {
// // // // // // //                         learnerId = fallbackSnap.docs[0].id;
// // // // // // //                         learnerData = fallbackSnap.docs[0].data();
// // // // // // //                     }
// // // // // // //                 }

// // // // // // //                 // 3. FETCH THEIR ACTIVE ENROLLMENT
// // // // // // //                 let enrollSnap;
// // // // // // //                 if (learnerId) {
// // // // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('learnerId', '==', learnerId)));
// // // // // // //                 } else {
// // // // // // //                     enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('verificationCode', '==', decodedCode.trim())));
// // // // // // //                 }

// // // // // // //                 if (!enrollSnap || enrollSnap.empty) {
// // // // // // //                     setStatus('invalid');
// // // // // // //                     return;
// // // // // // //                 }

// // // // // // //                 const enrollmentsList = enrollSnap.docs.map(d => d.data());
// // // // // // //                 const activeEnrollment = enrollmentsList.find(e => e.status === 'active') || enrollmentsList[0];

// // // // // // //                 if (!learnerData && activeEnrollment.learnerId) {
// // // // // // //                     const lSnap = await getDoc(doc(db, 'learners', activeEnrollment.learnerId));
// // // // // // //                     if (lSnap.exists()) {
// // // // // // //                         learnerData = lSnap.data();
// // // // // // //                         learnerId = lSnap.id;
// // // // // // //                     }
// // // // // // //                 }

// // // // // // //                 // 4. CHECK EXPIRATION
// // // // // // //                 const isExpired = moment().isAfter(moment(activeEnrollment.endDate)) || activeEnrollment.status !== 'active';

// // // // // // //                 // 🚀 RECONSTRUCT THE EXACT STUDENT ID FOR VISUAL VERIFICATION
// // // // // // //                 // Extracts last 4 of UID + "CT" + last 4 of ID Number
// // // // // // //                 let generatedStudentId = 'PENDING';
// // // // // // //                 if (learnerId && learnerData?.idNumber) {
// // // // // // //                     const uidPart = learnerId.slice(-4).toUpperCase();
// // // // // // //                     const idPart = String(learnerData.idNumber).slice(-4);
// // // // // // //                     generatedStudentId = `${uidPart}CT${idPart}`;
// // // // // // //                 } else if (activeEnrollment.verificationCode) {
// // // // // // //                     generatedStudentId = activeEnrollment.verificationCode;
// // // // // // //                 }

// // // // // // //                 setStudentData({
// // // // // // //                     name: learnerData?.fullName || activeEnrollment.learnerName || 'Unknown Learner',
// // // // // // //                     cohort: activeEnrollment.cohortName || 'CodeTribe Academy',
// // // // // // //                     campus: activeEnrollment.campusName || activeEnrollment.location || 'mLab Campus',
// // // // // // //                     validThru: activeEnrollment.endDate,
// // // // // // //                     status: activeEnrollment.status,
// // // // // // //                     studentNumber: generatedStudentId // Added to state
// // // // // // //                 });

// // // // // // //                 setStatus(isExpired ? 'expired' : 'valid');

// // // // // // //             } catch (error) {
// // // // // // //                 console.error("Verification failed:", error);
// // // // // // //                 setStatus('invalid');
// // // // // // //             }
// // // // // // //         };

// // // // // // //         verifyStudent();
// // // // // // //     }, [verificationCode]);

// // // // // // //     // ─── LOADING STATE ───
// // // // // // //     if (status === 'loading') {
// // // // // // //         return (
// // // // // // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // // // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // // // // // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // // // // // //                         <h2 className="lfm-header__title">System Query</h2>
// // // // // // //                     </div>
// // // // // // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // // // // // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // // // // // //                         <p style={{
// // // // // // //                             marginTop: '1.5rem',
// // // // // // //                             fontFamily: 'var(--font-heading)',
// // // // // // //                             color: 'var(--mlab-blue)',
// // // // // // //                             letterSpacing: '0.1em',
// // // // // // //                             textTransform: 'uppercase',
// // // // // // //                             fontWeight: 700
// // // // // // //                         }}>
// // // // // // //                             Authenticating Registry...
// // // // // // //                         </p>
// // // // // // //                     </div>
// // // // // // //                 </div>
// // // // // // //             </div>
// // // // // // //         );
// // // // // // //     }

// // // // // // //     const isSuccess = status === 'valid';

// // // // // // //     // ─── LOADED STATE ───
// // // // // // //     return (
// // // // // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // // // // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // // // // // //                 {/* STRICT HEADER */}
// // // // // // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // // // // // //                     <h2 className="lfm-header__title">
// // // // // // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // // // // // //                         Identity Verification
// // // // // // //                     </h2>
// // // // // // //                 </div>

// // // // // // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // // // // // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // // // // // //                     <div style={{
// // // // // // //                         display: 'flex',
// // // // // // //                         flexDirection: 'column',
// // // // // // //                         alignItems: 'center',
// // // // // // //                         padding: '2rem 1.5rem',
// // // // // // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // // // // // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // // // // // //                         marginBottom: '1.5rem',
// // // // // // //                         textAlign: 'center'
// // // // // // //                     }}>
// // // // // // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // // // // // //                         <h1 style={{
// // // // // // //                             fontFamily: 'var(--font-heading)',
// // // // // // //                             fontSize: '1.8rem',
// // // // // // //                             fontWeight: 700,
// // // // // // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // // // //                             textTransform: 'uppercase',
// // // // // // //                             letterSpacing: '0.05em',
// // // // // // //                             margin: '1rem 0 0.5rem 0'
// // // // // // //                         }}>
// // // // // // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // // // // // //                         </h1>

// // // // // // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // // // // // //                             {isSuccess
// // // // // // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // // // // // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // // // // // //                         </p>
// // // // // // //                     </div>

// // // // // // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // // // // // //                     {studentData && status !== 'invalid' && (
// // // // // // //                         <div className="lfm-demographics-panel" style={{
// // // // // // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // // // // //                             padding: '1.5rem'
// // // // // // //                         }}>
// // // // // // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // // // // // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // // // // // //                             </div>

// // // // // // //                             {/* Name Block */}
// // // // // // //                             <div style={{
// // // // // // //                                 marginBottom: '1.5rem',
// // // // // // //                                 padding: '1rem',
// // // // // // //                                 background: 'var(--mlab-white)',
// // // // // // //                                 border: '1px solid var(--mlab-border)'
// // // // // // //                             }}>
// // // // // // //                                 <div style={{
// // // // // // //                                     fontFamily: 'var(--font-heading)',
// // // // // // //                                     fontSize: '1.4rem',
// // // // // // //                                     fontWeight: 700,
// // // // // // //                                     color: 'var(--mlab-blue)',
// // // // // // //                                     textTransform: 'uppercase',
// // // // // // //                                     letterSpacing: '0.05em',
// // // // // // //                                     marginBottom: '0.25rem'
// // // // // // //                                 }}>
// // // // // // //                                     {studentData.name}
// // // // // // //                                 </div>
// // // // // // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // // // // // //                                     {studentData.cohort}
// // // // // // //                                 </div>
// // // // // // //                             </div>

// // // // // // //                             {/* Form Grid for Details */}
// // // // // // //                             <div className="lfm-grid">
                                
// // // // // // //                                 {/* 🚀 VISUAL STUDENT ID VERIFICATION BLOCK */}
// // // // // // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // // // // // //                                     <label>Generated Student Number</label>
// // // // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // // // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // // // // // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // // // // // //                                             {studentData.studentNumber}
// // // // // // //                                         </span>
// // // // // // //                                     </div>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="lfm-fg">
// // // // // // //                                     <label>Delivery Site (Campus)</label>
// // // // // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // // // // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // // // // // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // // // // //                                             {studentData.campus}
// // // // // // //                                         </span>
// // // // // // //                                     </div>
// // // // // // //                                 </div>
// // // // // // //                                 <div className="lfm-fg">
// // // // // // //                                     <label>Valid Thru</label>
// // // // // // //                                     <div className="lfm-input" style={{
// // // // // // //                                         background: 'var(--mlab-white)',
// // // // // // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // // // // //                                         fontWeight: 700,
// // // // // // //                                         display: 'flex',
// // // // // // //                                         alignItems: 'center',
// // // // // // //                                         gap: '8px',
// // // // // // //                                         cursor: 'default'
// // // // // // //                                     }}>
// // // // // // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // // // // // //                                     </div>
// // // // // // //                                 </div>
// // // // // // //                             </div>

// // // // // // //                             {/* Error Banner for Expired */}
// // // // // // //                             {!isSuccess && status === 'expired' && (
// // // // // // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // // // // // //                                     <AlertCircle size={16} />
// // // // // // //                                     <span>This student's training period has concluded.</span>
// // // // // // //                                 </div>
// // // // // // //                             )}
// // // // // // //                         </div>
// // // // // // //                     )}
// // // // // // //                 </div>

// // // // // // //                 {/* STRICT FOOTER */}
// // // // // // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // // // // // //                     <div style={{
// // // // // // //                         fontFamily: 'var(--font-heading)',
// // // // // // //                         fontSize: '0.75rem',
// // // // // // //                         color: 'var(--mlab-grey)',
// // // // // // //                         letterSpacing: '0.1em',
// // // // // // //                         textTransform: 'uppercase',
// // // // // // //                         display: 'flex',
// // // // // // //                         alignItems: 'center',
// // // // // // //                         gap: '6px'
// // // // // // //                     }}>
// // // // // // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // // // // // //                         mLab Secure Identity Engine
// // // // // // //                     </div>
// // // // // // //                 </div>

// // // // // // //             </div>
// // // // // // //         </div>
// // // // // // //     );
// // // // // // // };