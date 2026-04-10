// src/components/auth/VerifyEmail.tsx

import React, { useState } from 'react';
import {
    Mail,
    RefreshCw,
    LogOut,
    ArrowRight,
    CheckCircle2,
    AlertCircle,
    Shield,
    Send
} from 'lucide-react';
import { reload, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { auth } from '../../lib/firebase';
import '../../pages/Login/Login.css';

export const VerifyEmail: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const { clearUser } = useStore();

    const [isVerifying, setIsVerifying] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!auth.currentUser) {
        return <>{children}</>;
    }

    if (auth.currentUser.emailVerified) {
        return <>{children}</>;
    }

    const handleResend = async () => {
        setIsVerifying(true);
        setError(null);
        try {
            if (auth.currentUser) {
                // Pointing to our custom NodeMailer Cloud Function instead of the default Firebase one!
                const functions = getFunctions();
                const sendCustomVerificationEmail = httpsCallable(functions, 'sendCustomVerificationEmail');

                await sendCustomVerificationEmail();

                setEmailSent(true);
            }
        } catch (err: any) {
            console.error("Failed to send custom verification:", err);
            // Handling backend errors
            if (err.message?.includes('too-many-requests') || err.code === 'functions/resource-exhausted') {
                setError("Please wait a few minutes before requesting another email.");
            } else {
                setError("Failed to send email. Please try again.");
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleRefresh = async () => {
        setIsVerifying(true);
        try {
            if (auth.currentUser) {
                await reload(auth.currentUser);
                if (auth.currentUser.emailVerified) {
                    window.location.reload();
                } else {
                    setError("Email not yet verified. Please check your inbox and click the link.");
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        clearUser();
        navigate('/login');
    };

    return (
        <div className="login-container">

            {/* Background Elements */}
            <div className="login-bg-pattern" />
            <div className="login-bg-glow" />

            <div className="login-card" style={{ maxWidth: '480px' }}>
                {/* Security Badge */}
                <div className="login-security-badge">
                    <Shield size={12} />
                    <span>Secure Verification</span>
                </div>

                {/* Icon Header */}
                <div className="login-brand">
                    <div className="login-logo-wrapper" style={{
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                        outlineColor: 'var(--login-green)'
                    }}>
                        <Mail size={32} style={{ color: 'var(--login-green)' }} />
                    </div>

                    <h1 className="login-title">Verify Your Email</h1>
                    <p className="login-subtitle">
                        Secure your account by verifying your email address
                    </p>
                </div>

                {/* Email Info Box */}
                <div style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '2px solid #e2e8f0',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    textAlign: 'center'
                }}>
                    <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.875rem',
                        color: 'var(--login-grey)'
                    }}>
                        Verification sent to:
                    </span>
                    <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--login-blue)',
                        marginTop: '0.25rem',
                        wordBreak: 'break-all'
                    }}>
                        {auth.currentUser.email}
                    </div>
                </div>

                {/* Alert Messages */}
                {error && (
                    <div className="login-alert login-alert--error" style={{ marginBottom: '1.25rem' }}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {emailSent && !error && (
                    <div className="login-alert login-alert--success" style={{ marginBottom: '1.25rem' }}>
                        <CheckCircle2 size={18} />
                        <span>Verification link sent! Check your spam folder if you don't see it.</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button
                        onClick={handleRefresh}
                        disabled={isVerifying}
                        className="login-submit-btn"
                    >
                        {isVerifying ? (
                            <RefreshCw size={18} className="spin" />
                        ) : (
                            <ArrowRight size={18} />
                        )}
                        <span>I've verified, continue</span>
                    </button>

                    <button
                        onClick={handleResend}
                        disabled={isVerifying || emailSent}
                        className="login-back-btn"
                        style={{
                            opacity: (isVerifying || emailSent) ? 0.6 : 1,
                            cursor: (isVerifying || emailSent) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Send size={16} />
                        <span>Resend Email</span>
                    </button>
                </div>

                {/* Divider */}
                <div className="login-divider" style={{ margin: '1.5rem 0' }} />

                {/* Logout Option */}
                <button
                    onClick={handleLogout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        color: 'var(--login-grey)',
                        fontFamily: 'var(--font-heading)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        transition: 'color 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--login-blue)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--login-grey)'}
                >
                    <LogOut size={16} />
                    <span>Sign out / Different account</span>
                </button>
            </div>

            {/* Copyright */}
            <div className="login-copyright">
                © {new Date().getFullYear()} mLab Southern Africa NPC. All rights reserved.
            </div>
        </div>
    );
};
