// src/components/auth/Login.tsx

import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore'; // ADDED updateDoc
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import {
    Lock, AlertCircle, Loader2, KeyRound, CheckCircle2,
    ArrowLeft, Mail, Shield, Eye, EyeOff, ArrowRight,
    Hexagon, Server, ShieldCheck
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
    const [isSecureContext, setIsSecureContext] = useState(true);
    const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
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
            // 1. Authenticate with Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                const role = userData.role || 'learner';

                // ENGAGEMENT TRACKER: Update the lastLoginAt timestamp
                try {
                    await updateDoc(docRef, {
                        lastLoginAt: new Date().toISOString()
                    });
                } catch (timestampErr) {
                    console.warn("Non-fatal: Failed to update lastLoginAt timestamp", timestampErr);
                    // We don't throw here because they are already authenticated.
                    // We don't want to block their login just because a timestamp failed to save.
                }

                // 3. Route them to their correct dashboard
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
                // Note: We don't auto-signout here in case they are midway through a setup flow,
                // but usually, a missing profile means data corruption.
            }
        } catch (err: any) {
            console.error("Login Error:", err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError("Invalid email or password.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Account temporarily locked due to many failed attempts. Please try again later.");
            } else {
                setError("Authentication failed. Please check your connection and try again.");
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
        setSuccessMessage('');

        try {
            const functions = getFunctions();
            const sendReset = httpsCallable(functions, 'sendCustomPasswordReset');
            await sendReset({ email });
            setSuccessMessage("Secure mLab reset link sent! Check your inbox.");
        } catch (err: any) {
            console.error("Reset error:", err);
            if (err.message?.includes('not-found') || err.code === 'not-found') {
                setError("No account found with this email.");
            } else {
                setError("Failed to send custom reset link. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container" style={{ borderRadius: 0, position: 'absolute', right: 0, left: 0, top: 0, bottom: 0 }}>
            {/* Animated Background Elements */}
            <div className="auth-bg-hexagons">
                {[...Array(6)].map((_, i) => (
                    <Hexagon
                        key={i}
                        className={`auth-hex auth-hex--${i + 1}`}
                        size={60 + i * 20}
                        strokeWidth={1}
                    />
                ))}
            </div>
            <div className="auth-bg-glow auth-bg-glow--green" />
            <div className="auth-bg-glow auth-bg-glow--blue" />

            {/* Security Badge */}
            <div
                className={`auth-security-badge ${!isSecureContext ? 'auth-security-badge--warning' : ''}`}
                onMouseEnter={() => setShowSecurityTooltip(true)}
                onMouseLeave={() => setShowSecurityTooltip(false)}
                onClick={() => setShowSecurityTooltip(!showSecurityTooltip)}
            >
                <Shield size={12} />
                <span>{isSecureContext ? 'Secure Connection' : 'Unsecured Network'}</span>

                {showSecurityTooltip && (
                    <div className="auth-security-tooltip">
                        <div className={`auth-security-tooltip-header ${!isSecureContext ? 'warning' : ''}`}>
                            {isSecureContext ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
                            {isSecureContext ? 'Connection Encrypted' : 'Warning: Not Private'}
                        </div>
                        <div className="auth-security-tooltip-body">
                            <div className="auth-security-item">
                                <Lock size={14} />
                                <span><strong>TLS 1.2+ SSL</strong><br />Data in transit is fully encrypted.</span>
                            </div>
                            <div className="auth-security-item">
                                <Server size={14} />
                                <span><strong>POPIA Compliant</strong><br />Stored via GCP Secure Cloud.</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className={`auth-card ${successMessage ? 'auth-card--success' : ''}`}>
                {/* Brand Header */}
                <div className="auth-brand">
                    <div className="auth-logo-wrapper">
                        <img src={mLabLogo} alt="mLab Southern Africa" className="auth-logo" />
                        {/* <div className="auth-logo-ring" /> */}
                    </div>
                    <h1 className="auth-title">
                        {isResetFlow ? 'Reset Password' : 'Welcome Back'}
                    </h1>
                    <p className="auth-subtitle">
                        {isResetFlow
                            ? 'Enter your email to receive a secure reset link'
                            : 'Sign in to access your learning dashboard'}
                    </p>
                </div>

                <form
                    onSubmit={isResetFlow ? handleResetPassword : handleLogin}
                    className="auth-form"
                >
                    {/* Email Field */}
                    <div className="auth-field">
                        <label className="auth-label">Email Address</label>
                        <div className="auth-input-wrapper">
                            <Mail className="auth-input-icon" size={18} />
                            <input
                                type="email"
                                placeholder="name@mlab.co.za"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="auth-input"
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    {!isResetFlow && (
                        <div className="auth-field">
                            <div className="auth-label-row">
                                <label className="auth-label">Password</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsResetFlow(true);
                                        setError('');
                                        setSuccessMessage('');
                                    }}
                                    className="auth-link-sm"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <div className="auth-input-wrapper">
                                <Lock className="auth-input-icon" size={18} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="auth-input"
                                />
                                <button
                                    type="button"
                                    className="auth-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Alert Messages */}
                    {error && (
                        <div className="auth-alert auth-alert--error">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="auth-alert auth-alert--success">
                            <CheckCircle2 size={18} />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`auth-btn ${loading ? 'auth-btn--loading' : ''}`}
                    >
                        {loading ? (
                            <Loader2 className="auth-spin" size={20} />
                        ) : isResetFlow ? (
                            <>
                                <KeyRound size={18} />
                                <span>Send Reset Link</span>
                            </>
                        ) : (
                            <>
                                <span>Sign In Securely</span>
                                <ArrowRight size={16} className="auth-btn-icon" />
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
                            className="auth-btn auth-btn--secondary"
                        >
                            <ArrowLeft size={16} />
                            <span>Back to Sign In</span>
                        </button>
                    )}
                </form>

                {/* Footer Links */}
                {!isResetFlow && (
                    <div className="auth-footer">
                        <div className="auth-footer-item">
                            <span>Need help?</span>
                            <a href="mailto:support@mlab.co.za" className="auth-link">
                                Contact Support
                            </a>
                        </div>
                        <div className="auth-divider" />
                        <div className="auth-footer-item">
                            <span>Verify credentials?</span>
                            <a href="/verify" className="auth-link auth-link--highlight">
                                Check Results
                            </a>
                        </div>
                    </div>
                )}
            </div>

            {/* Copyright */}
            <div className="auth-copyright">
                © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
            </div>
        </div>
    );
};

export default Login;


// import React, { useEffect, useState } from 'react';
// import { signInWithEmailAndPassword } from 'firebase/auth';
// import { doc, getDoc } from 'firebase/firestore';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { auth, db } from '../../lib/firebase';
// import { useNavigate } from 'react-router-dom';
// import {
//     Lock, AlertCircle, Loader2, KeyRound, CheckCircle2,
//     ArrowLeft, Mail, Shield, Eye, EyeOff, ArrowRight,
//     Hexagon, Server, ShieldCheck, Fingerprint
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
//     const [isSecureContext, setIsSecureContext] = useState(true);
//     const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

//     const navigate = useNavigate();

//     useEffect(() => {
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
//         setSuccessMessage('');

//         try {
//             const functions = getFunctions();
//             const sendReset = httpsCallable(functions, 'sendCustomPasswordReset');
//             await sendReset({ email });
//             setSuccessMessage("Secure mLab reset link sent! Check your inbox.");
//         } catch (err: any) {
//             console.error("Reset error:", err);
//             if (err.message?.includes('not-found') || err.code === 'not-found') {
//                 setError("No account found with this email.");
//             } else {
//                 setError("Failed to send custom reset link. Please try again.");
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div className="auth-container" style={{ borderRadius: 0, position: 'absolute', right: 0, left: 0, top: 0, bottom: 0 }}>
//             {/* Animated Background Elements */}
//             <div className="auth-bg-hexagons">
//                 {[...Array(6)].map((_, i) => (
//                     <Hexagon
//                         key={i}
//                         className={`auth-hex auth-hex--${i + 1}`}
//                         size={60 + i * 20}
//                         strokeWidth={1}
//                     />
//                 ))}
//             </div>
//             <div className="auth-bg-glow auth-bg-glow--green" />
//             <div className="auth-bg-glow auth-bg-glow--blue" />

//             {/* Security Badge */}
//             <div
//                 className={`auth-security-badge ${!isSecureContext ? 'auth-security-badge--warning' : ''}`}
//                 onMouseEnter={() => setShowSecurityTooltip(true)}
//                 onMouseLeave={() => setShowSecurityTooltip(false)}
//                 onClick={() => setShowSecurityTooltip(!showSecurityTooltip)}
//             >
//                 <Shield size={12} />
//                 <span>{isSecureContext ? 'Secure Connection' : 'Unsecured Network'}</span>

//                 {showSecurityTooltip && (
//                     <div className="auth-security-tooltip">
//                         <div className={`auth-security-tooltip-header ${!isSecureContext ? 'warning' : ''}`}>
//                             {isSecureContext ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
//                             {isSecureContext ? 'Connection Encrypted' : 'Warning: Not Private'}
//                         </div>
//                         <div className="auth-security-tooltip-body">
//                             <div className="auth-security-item">
//                                 <Lock size={14} />
//                                 <span><strong>TLS 1.2+ SSL</strong><br />Data in transit is fully encrypted.</span>
//                             </div>
//                             <div className="auth-security-item">
//                                 <Server size={14} />
//                                 <span><strong>POPIA Compliant</strong><br />Stored via GCP Secure Cloud.</span>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </div>

//             <div className={`auth-card ${successMessage ? 'auth-card--success' : ''}`}>
//                 {/* Brand Header */}
//                 <div className="auth-brand">
//                     <div className="auth-logo-wrapper">
//                         <img src={mLabLogo} alt="mLab Southern Africa" className="auth-logo" />
//                         {/* <div className="auth-logo-ring" /> */}
//                     </div>
//                     <h1 className="auth-title">
//                         {isResetFlow ? 'Reset Password' : 'Welcome Back'}
//                     </h1>
//                     <p className="auth-subtitle">
//                         {isResetFlow
//                             ? 'Enter your email to receive a secure reset link'
//                             : 'Sign in to access your learning dashboard'}
//                     </p>
//                 </div>

//                 <form
//                     onSubmit={isResetFlow ? handleResetPassword : handleLogin}
//                     className="auth-form"
//                 >
//                     {/* Email Field */}
//                     <div className="auth-field">
//                         <label className="auth-label">Email Address</label>
//                         <div className="auth-input-wrapper">
//                             <Mail className="auth-input-icon" size={18} />
//                             <input
//                                 type="email"
//                                 placeholder="name@mlab.co.za"
//                                 value={email}
//                                 onChange={(e) => setEmail(e.target.value)}
//                                 required
//                                 className="auth-input"
//                             />
//                         </div>
//                     </div>

//                     {/* Password Field */}
//                     {!isResetFlow && (
//                         <div className="auth-field">
//                             <div className="auth-label-row">
//                                 <label className="auth-label">Password</label>
//                                 <button
//                                     type="button"
//                                     onClick={() => {
//                                         setIsResetFlow(true);
//                                         setError('');
//                                         setSuccessMessage('');
//                                     }}
//                                     className="auth-link-sm"
//                                 >
//                                     Forgot password?
//                                 </button>
//                             </div>
//                             <div className="auth-input-wrapper">
//                                 <Lock className="auth-input-icon" size={18} />
//                                 <input
//                                     type={showPassword ? "text" : "password"}
//                                     placeholder="Enter your password"
//                                     value={password}
//                                     onChange={(e) => setPassword(e.target.value)}
//                                     required
//                                     className="auth-input"
//                                 />
//                                 <button
//                                     type="button"
//                                     className="auth-toggle-btn"
//                                     onClick={() => setShowPassword(!showPassword)}
//                                     tabIndex={-1}
//                                 >
//                                     {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
//                                 </button>
//                             </div>
//                         </div>
//                     )}

//                     {/* Alert Messages */}
//                     {error && (
//                         <div className="auth-alert auth-alert--error">
//                             <AlertCircle size={18} />
//                             <span>{error}</span>
//                         </div>
//                     )}

//                     {successMessage && (
//                         <div className="auth-alert auth-alert--success">
//                             <CheckCircle2 size={18} />
//                             <span>{successMessage}</span>
//                         </div>
//                     )}

//                     {/* Submit Button */}
//                     <button
//                         type="submit"
//                         disabled={loading}
//                         className={`auth-btn ${loading ? 'auth-btn--loading' : ''}`}
//                     >
//                         {loading ? (
//                             <Loader2 className="auth-spin" size={20} />
//                         ) : isResetFlow ? (
//                             <>
//                                 <KeyRound size={18} />
//                                 <span>Send Reset Link</span>
//                             </>
//                         ) : (
//                             <>
//                                 <span>Sign In Securely</span>
//                                 <ArrowRight size={16} className="auth-btn-icon" />
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
//                             className="auth-btn auth-btn--secondary"
//                         >
//                             <ArrowLeft size={16} />
//                             <span>Back to Sign In</span>
//                         </button>
//                     )}
//                 </form>

//                 {/* Footer Links */}
//                 {!isResetFlow && (
//                     <div className="auth-footer">
//                         <div className="auth-footer-item">
//                             <span>Need help?</span>
//                             <a href="mailto:support@mlab.co.za" className="auth-link">
//                                 Contact Support
//                             </a>
//                         </div>
//                         <div className="auth-divider" />
//                         <div className="auth-footer-item">
//                             <span>Verify credentials?</span>
//                             <a href="/verify" className="auth-link auth-link--highlight">
//                                 Check Results
//                             </a>
//                         </div>
//                     </div>
//                 )}
//             </div>

//             {/* Copyright */}
//             <div className="auth-copyright">
//                 © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
//             </div>
//         </div>
//     );
// };

// export default Login;