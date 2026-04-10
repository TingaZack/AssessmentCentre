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