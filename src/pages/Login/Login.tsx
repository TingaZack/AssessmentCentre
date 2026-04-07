import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import {
    Lock,
    AlertCircle,
    Loader2,
    KeyRound,
    CheckCircle2,
    ArrowLeft,
    Mail,
    Shield,
    Fingerprint,
    ShieldCheck,
    Server
} from 'lucide-react';
import mLabLogo from '../../assets/logo/mlab_logo.png';
import './Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [isResetFlow, setIsResetFlow] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    // --- SECURITY BADGE STATE ---
    const [isSecureContext, setIsSecureContext] = useState(true);
    const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

    useEffect(() => {
        // Check if the connection is actually HTTPS or Localhost
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            setIsSecureContext(false);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                const role = userData.role || 'learner';

                const routes: Record<string, string> = {
                    admin: '/admin',
                    learner: '/portal',
                    facilitator: '/facilitator',
                    assessor: '/marking',
                    moderator: '/moderation',
                    mentor: '/mentor'
                };

                navigate(routes[role] || '/portal');
            } else {
                setError("No user profile found. Please contact support.");
            }
        } catch (err: any) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError("Invalid email or password.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Account temporarily locked. Please try again later.");
            } else {
                setError("Authentication failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError("Please enter your email address.");
            return;
        }

        setLoading(true);
        setError('');

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMessage("Password reset link sent! Check your inbox.");
        } catch (err: any) {
            if (err.code === 'auth/invalid-email') {
                setError("Please enter a valid email address.");
            } else if (err.code === 'auth/user-not-found') {
                setError("No account found with this email.");
            } else {
                setError("Failed to send reset link. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            {/* Animated Background Elements */}
            <div className="login-bg-pattern" />
            <div className="login-bg-glow" />

            <div className="login-card">
                {/* Security Badge */}
                {/* <div className="login-security-badge">
                    <Shield size={12} />
                    <span>Secure Connection</span>
                </div> */}

                <div
                    className="login-security-badge"
                    style={{
                        // position: 'relative',
                        // cursor: 'help',
                        // background: isSecureContext ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        // color: isSecureContext ? '#4ade80' : '#ef4444',
                        // border: `1px solid ${isSecureContext ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}
                    onMouseEnter={() => setShowSecurityTooltip(true)}
                    onMouseLeave={() => setShowSecurityTooltip(false)}
                    onClick={() => setShowSecurityTooltip(!showSecurityTooltip)}
                >
                    <Shield size={12} />
                    <span>{isSecureContext ? 'Secure Connection' : 'Unsecured Network'}</span>

                    {/* Popover Tooltip */}
                    {showSecurityTooltip && (
                        <div style={{
                            // position: 'absolute',
                            // top: '120%',
                            // left: '50%',
                            // transform: 'translateX(-50%)',
                            // background: '#0f172a',
                            // border: '1px solid #1e293b',
                            // boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                            // borderRadius: '8px',
                            // padding: '1rem',
                            // width: '240px',
                            // zIndex: 50,
                            // textAlign: 'left',
                            // color: '#f8fafc',
                            // textTransform: 'none',
                            // letterSpacing: 'normal'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: isSecureContext ? '#4ade80' : '#ef4444' }}>
                                {isSecureContext ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
                                {isSecureContext ? 'Connection Encrypted' : 'Warning: Not Private'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                    <Lock size={14} style={{ marginTop: '2px', color: '#0ea5e9' }} />
                                    <span><strong>TLS 1.2+ SSL</strong><br />Data in transit is fully encrypted.</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                    <Server size={14} style={{ marginTop: '2px', color: '#0ea5e9' }} />
                                    <span><strong>POPIA Compliant</strong><br />Stored via GCP Secure Cloud.</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>


                {/* Brand Header */}
                <div className="login-brand">
                    <div className="login-logo-wrappr" style={{ margin: 16 }}>
                        <img src={mLabLogo} alt="mLab Southern Africa" className="login-logo" />
                    </div>
                    <h1 className="login-title">
                        {isResetFlow ? 'Reset Password' : 'Login'}
                    </h1>
                    <p className="login-subtitle">
                        {isResetFlow
                            ? 'Enter your email to receive a secure reset link'
                            : 'Sign in to access your learning dashboard'}
                    </p>
                </div>

                <form
                    onSubmit={isResetFlow ? handleResetPassword : handleLogin}
                    className="login-form"
                >
                    {/* Email Field */}
                    <div className="login-field">
                        <label className="login-label">Email Address</label>
                        <div className="login-input-wrapper">
                            <Mail className="login-input-icon" size={18} />
                            <input
                                type="email"
                                placeholder="name@mlab.co.za"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="login-input"
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    {!isResetFlow && (
                        <div className="login-field">
                            <div className="login-label-row">
                                <label className="login-label">Password</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsResetFlow(true);
                                        setError('');
                                        setSuccessMessage('');
                                    }}
                                    className="login-link-sm"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <div className="login-input-wrapper">
                                <Lock className="login-input-icon" size={18} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="login-input"
                                />
                                <button
                                    type="button"
                                    className="login-toggle-password"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Alert Messages */}
                    {error && (
                        <div className="login-alert login-alert--error">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="login-alert login-alert--success">
                            <CheckCircle2 size={18} />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="login-submit-btn"
                    >
                        {loading ? (
                            <Loader2 className="spin" size={20} />
                        ) : isResetFlow ? (
                            <>
                                <KeyRound size={18} />
                                <span>Send Reset Link</span>
                            </>
                        ) : (
                            <>
                                <Fingerprint size={18} />
                                <span>Sign In Securely</span>
                            </>
                        )}
                    </button>

                    {/* Back to Login Link */}
                    {isResetFlow && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsResetFlow(false);
                                setError('');
                                setSuccessMessage('');
                            }}
                            className="login-back-btn"
                        >
                            <ArrowLeft size={16} />
                            <span>Back to Sign In</span>
                        </button>
                    )}
                </form>

                {/* Footer Links */}
                {!isResetFlow && (
                    <div className="login-footer">
                        <div className="login-footer-section">
                            <span className="login-footer-text">Need help?</span>
                            <a href="mailto:support@mlab.co.za" className="login-footer-link">
                                Contact Support
                            </a>
                        </div>
                        <div className="login-divider" />
                        <div className="login-footer-section">
                            <span className="login-footer-text">Verify credentials?</span>
                            <a href="/verify" className="login-footer-link login-footer-link--highlight">
                                Check Results
                            </a>
                        </div>
                    </div>
                )}
            </div>

            {/* Copyright */}
            <div className="login-copyright">
                © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
            </div>
        </div>
    );
};

export default Login;



// import React, { useState, useEffect } from 'react';
// import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
// import { doc, getDoc } from 'firebase/firestore';
// import { auth, db } from '../../lib/firebase';
// import { useNavigate } from 'react-router-dom';
// import {
//     Lock,
//     AlertCircle,
//     Loader2,
//     KeyRound,
//     CheckCircle2,
//     ArrowLeft,
//     Mail,
//     Shield,
//     Fingerprint,
//     ShieldCheck,
//     Server
// } from 'lucide-react';
// import mLabLogo from '../../assets/logo/mlab_logo.png';
// import './Login.css';

// const Login: React.FC = () => {
//     const [email, setEmail] = useState('');
//     const [password, setPassword] = useState('');
//     const [error, setError] = useState('');
//     const [successMessage, setSuccessMessage] = useState('');
//     const [loading, setLoading] = useState(false);
//     const [isResetFlow, setIsResetFlow] = useState(false);
//     const [showPassword, setShowPassword] = useState(false);
//     const navigate = useNavigate();

//     // --- SECURITY BADGE STATE ---
//     const [isSecureContext, setIsSecureContext] = useState(true);
//     const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

//     useEffect(() => {
//         // Check if the connection is actually HTTPS or Localhost
//         if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
//             setIsSecureContext(false);
//         }
//     }, []);

//     const handleLogin = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setLoading(true);
//         setError('');
//         setSuccessMessage('');

//         try {
//             const userCredential = await signInWithEmailAndPassword(auth, email, password);
//             const uid = userCredential.user.uid;
//             const docRef = doc(db, 'users', uid);
//             const docSnap = await getDoc(docRef);

//             if (docSnap.exists()) {
//                 const userData = docSnap.data();
//                 const role = userData.role || 'learner';

//                 const routes: Record<string, string> = {
//                     admin: '/admin',
//                     learner: '/portal',
//                     facilitator: '/facilitator',
//                     assessor: '/marking',
//                     moderator: '/moderation',
//                     mentor: '/mentor'
//                 };

//                 navigate(routes[role] || '/portal');
//             } else {
//                 setError("No user profile found. Please contact support.");
//             }
//         } catch (err: any) {
//             if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
//                 setError("Invalid email or password.");
//             } else if (err.code === 'auth/too-many-requests') {
//                 setError("Account temporarily locked. Please try again later.");
//             } else {
//                 setError("Authentication failed. Please try again.");
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     const handleResetPassword = async (e: React.FormEvent) => {
//         e.preventDefault();
//         if (!email) {
//             setError("Please enter your email address.");
//             return;
//         }

//         setLoading(true);
//         setError('');

//         try {
//             await sendPasswordResetEmail(auth, email);
//             setSuccessMessage("Password reset link sent! Check your inbox.");
//         } catch (err: any) {
//             if (err.code === 'auth/invalid-email') {
//                 setError("Please enter a valid email address.");
//             } else if (err.code === 'auth/user-not-found') {
//                 setError("No account found with this email.");
//             } else {
//                 setError("Failed to send reset link. Please try again.");
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div className="login-container">
//             {/* Animated Background Elements */}
//             <div className="login-bg-pattern" />
//             <div className="login-bg-glow" />

//             <div className="login-card">

//                 <div
//                     className="login-security-badge"
//                     style={{
//                         position: 'relative',
//                         cursor: 'help',
//                         background: isSecureContext ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
//                         color: isSecureContext ? '#4ade80' : '#ef4444',
//                         border: `1px solid ${isSecureContext ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
//                     }}
//                     onMouseEnter={() => setShowSecurityTooltip(true)}
//                     onMouseLeave={() => setShowSecurityTooltip(false)}
//                     onClick={() => setShowSecurityTooltip(!showSecurityTooltip)}
//                 >
//                     <Shield size={12} />
//                     <span>{isSecureContext ? 'Secure Connection' : 'Unsecured Network'}</span>

//                     {/* Popover Tooltip */}
//                     {showSecurityTooltip && (
//                         <div style={{
//                             position: 'absolute',
//                             top: '120%',
//                             left: '50%',
//                             transform: 'translateX(-50%)',
//                             background: '#0f172a',
//                             border: '1px solid #1e293b',
//                             boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
//                             borderRadius: '8px',
//                             padding: '1rem',
//                             width: '240px',
//                             zIndex: 50,
//                             textAlign: 'left',
//                             color: '#f8fafc',
//                             textTransform: 'none',
//                             letterSpacing: 'normal'
//                         }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: isSecureContext ? '#4ade80' : '#ef4444' }}>
//                                 {isSecureContext ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
//                                 {isSecureContext ? 'Connection Encrypted' : 'Warning: Not Private'}
//                             </div>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
//                                 <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
//                                     <Lock size={14} style={{ marginTop: '2px', color: '#0ea5e9' }} />
//                                     <span><strong>TLS 1.2+ SSL</strong><br />Data in transit is fully encrypted.</span>
//                                 </div>
//                                 <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
//                                     <Server size={14} style={{ marginTop: '2px', color: '#0ea5e9' }} />
//                                     <span><strong>POPIA Compliant</strong><br />Stored via Firebase Secure Cloud.</span>
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 {/* Brand Header */}
//                 <div className="login-brand">
//                     <div className="login-logo-wrappr" style={{ margin: 16 }}>
//                         <img src={mLabLogo} alt="mLab Southern Africa" className="login-logo" />
//                     </div>
//                     <h1 className="login-title">
//                         {isResetFlow ? 'Reset Password' : 'Login'}
//                     </h1>
//                     <p className="login-subtitle">
//                         {isResetFlow
//                             ? 'Enter your email to receive a secure reset link'
//                             : 'Sign in to access your learning dashboard'}
//                     </p>
//                 </div>

//                 <form
//                     onSubmit={isResetFlow ? handleResetPassword : handleLogin}
//                     className="login-form"
//                 >
//                     {/* Email Field */}
//                     <div className="login-field">
//                         <label className="login-label">Email Address</label>
//                         <div className="login-input-wrapper">
//                             <Mail className="login-input-icon" size={18} />
//                             <input
//                                 type="email"
//                                 placeholder="name@mlab.co.za"
//                                 value={email}
//                                 onChange={(e) => setEmail(e.target.value)}
//                                 required
//                                 className="login-input"
//                             />
//                         </div>
//                     </div>

//                     {/* Password Field */}
//                     {!isResetFlow && (
//                         <div className="login-field">
//                             <div className="login-label-row">
//                                 <label className="login-label">Password</label>
//                                 <button
//                                     type="button"
//                                     onClick={() => {
//                                         setIsResetFlow(true);
//                                         setError('');
//                                         setSuccessMessage('');
//                                     }}
//                                     className="login-link-sm"
//                                 >
//                                     Forgot password?
//                                 </button>
//                             </div>
//                             <div className="login-input-wrapper">
//                                 <Lock className="login-input-icon" size={18} />
//                                 <input
//                                     type={showPassword ? "text" : "password"}
//                                     placeholder="••••••••"
//                                     value={password}
//                                     onChange={(e) => setPassword(e.target.value)}
//                                     required
//                                     className="login-input"
//                                 />
//                                 <button
//                                     type="button"
//                                     className="login-toggle-password"
//                                     onClick={() => setShowPassword(!showPassword)}
//                                     tabIndex={-1}
//                                 >
//                                     {showPassword ? 'Hide' : 'Show'}
//                                 </button>
//                             </div>
//                         </div>
//                     )}

//                     {/* Alert Messages */}
//                     {error && (
//                         <div className="login-alert login-alert--error">
//                             <AlertCircle size={18} />
//                             <span>{error}</span>
//                         </div>
//                     )}

//                     {successMessage && (
//                         <div className="login-alert login-alert--success">
//                             <CheckCircle2 size={18} />
//                             <span>{successMessage}</span>
//                         </div>
//                     )}

//                     {/* Submit Button */}
//                     <button
//                         type="submit"
//                         disabled={loading}
//                         className="login-submit-btn"
//                     >
//                         {loading ? (
//                             <Loader2 className="spin" size={20} />
//                         ) : isResetFlow ? (
//                             <>
//                                 <KeyRound size={18} />
//                                 <span>Send Reset Link</span>
//                             </>
//                         ) : (
//                             <>
//                                 <Fingerprint size={18} />
//                                 <span>Sign In Securely</span>
//                             </>
//                         )}
//                     </button>

//                     {/* Back to Login Link */}
//                     {isResetFlow && (
//                         <button
//                             type="button"
//                             onClick={() => {
//                                 setIsResetFlow(false);
//                                 setError('');
//                                 setSuccessMessage('');
//                             }}
//                             className="login-back-btn"
//                         >
//                             <ArrowLeft size={16} />
//                             <span>Back to Sign In</span>
//                         </button>
//                     )}
//                 </form>

//                 {/* Footer Links */}
//                 {!isResetFlow && (
//                     <div className="login-footer">
//                         <div className="login-footer-section">
//                             <span className="login-footer-text">Need help?</span>
//                             <a href="mailto:support@mlab.co.za" className="login-footer-link">
//                                 Contact Support
//                             </a>
//                         </div>
//                         <div className="login-divider" />
//                         <div className="login-footer-section">
//                             <span className="login-footer-text">Verify credentials?</span>
//                             <a href="/verify" className="login-footer-link login-footer-link--highlight">
//                                 Check Results
//                             </a>
//                         </div>
//                     </div>
//                 )}
//             </div>

//             {/* Copyright */}
//             <div className="login-copyright">
//                 © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
//             </div>
//         </div>
//     );
// };

// export default Login;


// // import React, { useState } from 'react';
// // import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
// // import { doc, getDoc } from 'firebase/firestore';
// // import { auth, db } from '../../lib/firebase';
// // import { useNavigate } from 'react-router-dom';
// // import { Lock, AlertCircle, Loader, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';
// // import './Login.css';

// // import mLabLogo from '../../assets/logo/mlab_logo.png';

// // const Login: React.FC = () => {
// //     const [email, setEmail] = useState('');
// //     const [password, setPassword] = useState('');
// //     const [error, setError] = useState('');
// //     const [successMessage, setSuccessMessage] = useState('');
// //     const [loading, setLoading] = useState(false);
// //     const [isResetFlow, setIsResetFlow] = useState(false); // Toggles the Forgot Password view
// //     const navigate = useNavigate();

// //     const handleLogin = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setLoading(true);
// //         setError('');
// //         setSuccessMessage('');

// //         try {
// //             // Authenticate with Firebase Auth
// //             const userCredential = await signInWithEmailAndPassword(auth, email, password);
// //             const uid = userCredential.user.uid;

// //             // Fetch User Profile to determine Role
// //             const docRef = doc(db, 'users', uid);
// //             const docSnap = await getDoc(docRef);

// //             if (docSnap.exists()) {
// //                 const userData = docSnap.data();
// //                 const role = userData.role || 'learner'; // Default to learner if undefined

// //                 console.log(`User authenticated. UID: ${uid}, Role: ${role}`);

// //                 // Smart Redirect based on Role
// //                 switch (role) {
// //                     case 'admin':
// //                         navigate('/admin');
// //                         break;
// //                     case 'learner':
// //                         navigate('/portal'); // 🚀 FIXED: Pointing to /portal instead of /classroom
// //                         break;
// //                     case 'facilitator':
// //                         navigate('/facilitator');
// //                         break;
// //                     case 'assessor':
// //                         navigate('/marking');
// //                         break;
// //                     case 'moderator':
// //                         navigate('/moderation');
// //                         break;
// //                     case 'mentor':
// //                         navigate('/mentor');
// //                         break;
// //                     default:
// //                         navigate('/portal'); // 🚀 FIXED: Fallback to /portal
// //                 }
// //             } else {
// //                 console.warn("User authenticated in Auth but has no Firestore profile.");
// //                 setError("No user profile found. Please contact support.");
// //             }
// //         } catch (err: any) {
// //             console.error("Login Error:", err);
// //             if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
// //                 setError("Invalid email or password.");
// //             } else if (err.code === 'auth/too-many-requests') {
// //                 setError("Too many failed attempts. Try again later.");
// //             } else {
// //                 setError("Login failed. Please try again.");
// //             }
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     const handleResetPassword = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         if (!email) {
// //             setError("Please enter your email address first.");
// //             return;
// //         }

// //         setLoading(true);
// //         setError('');
// //         setSuccessMessage('');

// //         try {
// //             await sendPasswordResetEmail(auth, email);
// //             setSuccessMessage("Password reset link sent! Please check your inbox.");
// //         } catch (err: any) {
// //             console.error("Reset Error:", err);
// //             if (err.code === 'auth/invalid-email') {
// //                 setError("Please enter a valid email address.");
// //             } else if (err.code === 'auth/user-not-found') {
// //                 setError("No account found with this email address.");
// //             } else {
// //                 setError("Failed to send reset link. Please try again.");
// //             }
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     return (
// //         <div style={{
// //             position: 'fixed',
// //             inset: 0,
// //             background: 'linear-gradient(135deg, #073f4e, #94c73d)',
// //             display: 'flex',
// //             justifyContent: 'center',
// //             alignItems: 'center'
// //         }}>
// //             <div style={{
// //                 background: 'white',
// //                 padding: '2.5rem',
// //                 borderRadius: '12px',
// //                 boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
// //                 width: '100%',
// //                 maxWidth: '400px',
// //                 textAlign: 'center'
// //             }}>
// //                 {/* Brand Header */}
// //                 <div style={{ marginBottom: '2rem' }}>
// //                     <div className="logo-text" style={{ fontSize: '2.5rem', fontWeight: '300', marginBottom: '0.5rem', fontFamily: 'Oswald, sans-serif' }}>
// //                         <img src={mLabLogo} height={70} alt="mLab Logo" />
// //                     </div>
// //                     <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#64748b' }}>
// //                         {isResetFlow ? 'Reset Password' : 'Assessment Platform'}
// //                     </h2>
// //                     {isResetFlow && (
// //                         <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.5rem', lineHeight: '1.4' }}>
// //                             Enter your email address and we'll send you a secure link to reset your password.
// //                         </p>
// //                     )}
// //                 </div>

// //                 <form onSubmit={isResetFlow ? handleResetPassword : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                     <input
// //                         type="email"
// //                         placeholder="Email Address"
// //                         value={email}
// //                         onChange={(e) => setEmail(e.target.value)}
// //                         required
// //                         style={{
// //                             width: '100%', padding: '1rem', borderRadius: '8px',
// //                             color: 'black',
// //                             background: "whitesmoke",
// //                             border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
// //                         }}
// //                     />

// //                     {!isResetFlow && (
// //                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
// //                             <input
// //                                 type="password"
// //                                 placeholder="Password"
// //                                 value={password}
// //                                 onChange={(e) => setPassword(e.target.value)}
// //                                 required
// //                                 style={{
// //                                     width: '100%', padding: '1rem', borderRadius: '8px',
// //                                     color: 'black', background: "whitesmoke",
// //                                     border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
// //                                 }}
// //                             />
// //                             <button
// //                                 type="button"
// //                                 onClick={() => {
// //                                     setIsResetFlow(true);
// //                                     setError('');
// //                                     setSuccessMessage('');
// //                                 }}
// //                                 style={{
// //                                     background: 'none', border: 'none', color: '#073f4e',
// //                                     fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.25rem 0'
// //                                 }}
// //                             >
// //                                 Forgot password?
// //                             </button>
// //                         </div>
// //                     )}

// //                     {error && (
// //                         <div style={{
// //                             color: '#ef4444', fontSize: '0.9rem', display: 'flex',
// //                             alignItems: 'center', gap: '0.5rem', background: '#fef2f2',
// //                             padding: '0.75rem', borderRadius: '6px', textAlign: 'left', border: '1px solid #fecaca'
// //                         }}>
// //                             <AlertCircle size={18} style={{ flexShrink: 0 }} /> {error}
// //                         </div>
// //                     )}

// //                     {successMessage && (
// //                         <div style={{
// //                             color: '#16a34a', fontSize: '0.9rem', display: 'flex',
// //                             alignItems: 'center', gap: '0.5rem', background: '#f0fdf4',
// //                             padding: '0.75rem', borderRadius: '6px', textAlign: 'left', border: '1px solid #bbf7d0'
// //                         }}>
// //                             <CheckCircle2 size={18} style={{ flexShrink: 0 }} /> {successMessage}
// //                         </div>
// //                     )}

// //                     <button
// //                         type="submit"
// //                         disabled={loading}
// //                         style={{
// //                             background: '#073f4e',
// //                             color: 'white',
// //                             padding: '1rem',
// //                             borderRadius: '8px',
// //                             border: 'none',
// //                             fontSize: '1rem',
// //                             fontWeight: 700,
// //                             cursor: loading ? 'not-allowed' : 'pointer',
// //                             display: 'flex',
// //                             justifyContent: 'center',
// //                             alignItems: 'center',
// //                             gap: '0.5rem',
// //                             marginTop: '0.5rem',
// //                             transition: 'all 0.2s',
// //                             textTransform: 'uppercase',
// //                             letterSpacing: '1px'
// //                         }}
// //                     >
// //                         {loading ? (
// //                             <Loader className="spin" size={20} />
// //                         ) : isResetFlow ? (
// //                             <><KeyRound size={18} /> Send Reset Link</>
// //                         ) : (
// //                             <><Lock size={18} /> Secure Login</>
// //                         )}
// //                     </button>

// //                     {isResetFlow && (
// //                         <button
// //                             type="button"
// //                             onClick={() => {
// //                                 setIsResetFlow(false);
// //                                 setError('');
// //                                 setSuccessMessage('');
// //                             }}
// //                             style={{
// //                                 background: 'transparent', color: '#64748b', padding: '0.75rem',
// //                                 borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem',
// //                                 fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center',
// //                                 alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
// //                             }}
// //                         >
// //                             <ArrowLeft size={16} /> Back to Login
// //                         </button>
// //                     )}
// //                 </form>

// //                 {!isResetFlow && (
// //                     <>
// //                         <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#94a3b8' }}>
// //                             <p>Having trouble signing in?</p>
// //                             <a href="mailto:support@mlab.co.za" style={{ color: '#073f4e', fontWeight: 600, textDecoration: 'none' }}>Contact Support</a>
// //                         </div>

// //                         <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
// //                             <span style={{ color: '#94a3b8' }}>Looking for public results? </span>
// //                             <a href="/verify" style={{ color: '#94c73d', fontWeight: 600, textDecoration: 'none' }}>
// //                                 Verify a Result
// //                             </a>
// //                         </div>
// //                     </>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };

// // export default Login;