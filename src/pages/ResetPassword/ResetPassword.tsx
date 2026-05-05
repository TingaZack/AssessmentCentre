import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { confirmPasswordReset } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import {
    Lock, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff,
    ShieldCheck, Hexagon, ArrowRight, Shield, Server
} from 'lucide-react';
import mLabLogo from '../../assets/logo/mlab_logo.png';
import '../Login/Login.css';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const oobCode = searchParams.get('oobCode');

    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [strength, setStrength] = useState(0);
    const [isSecureContext, setIsSecureContext] = useState(true);
    const [showSecurityTooltip, setShowSecurityTooltip] = useState(false);

    useEffect(() => {
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            setIsSecureContext(false);
        }
    }, []);

    useEffect(() => {
        let score = 0;
        if (newPassword.length > 6) score++;
        if (newPassword.length > 10) score++;
        if (/[A-Z]/.test(newPassword)) score++;
        if (/[0-9]/.test(newPassword)) score++;
        if (/[^A-Za-z0-9]/.test(newPassword)) score++;
        setStrength(score);
    }, [newPassword]);

    const getStrengthColor = () => {
        if (strength <= 2) return '#ef4444';
        if (strength <= 3) return '#f59e0b';
        return '#94c73d';
    };

    const getStrengthLabel = () => {
        if (strength <= 2) return 'Weak';
        if (strength <= 3) return 'Good';
        return 'Strong';
    };

    const handleConfirmReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!oobCode) {
            setError("Invalid or missing reset code. Please request a new link.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters long.");
            return;
        }

        setLoading(true);
        setError('');

        try {
            await confirmPasswordReset(auth, oobCode, newPassword);
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/expired-action-code') {
                setError("This reset link has expired. Please request a new one.");
            } else if (err.code === 'auth/invalid-action-code') {
                setError("This reset link is invalid or has already been used.");
            } else {
                setError("Failed to reset password. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        // <div className="auth-container">
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

            <div className={`auth-card ${success ? 'auth-card--success' : ''}`}>
                {/* Brand Section */}
                <div className="auth-brand">
                    <div className="auth-logo-wrapper">
                        <img src={mLabLogo} alt="mLab" className="auth-logo" />
                        {/* <div className="auth-logo-ring" /> */}
                    </div>
                    <h1 className="auth-title">
                        {success ? 'Success!' : 'Create New Password'}
                    </h1>
                    <p className="auth-subtitle">
                        {success
                            ? 'Your password has been securely updated'
                            : 'Enter your new secure password below'}
                    </p>
                </div>

                {success ? (
<<<<<<< HEAD
                    <div className="auth-success-state" style={{ color: 'grey' }}>
=======
                    <div className="auth-success-state">
>>>>>>> dc5e6e85f7da2b5cc456794fff55bafa22f23d7c
                        <div className="auth-success-icon">
                            <ShieldCheck size={48} strokeWidth={2} />
                            <div className="auth-success-particles">
                                {[...Array(6)].map((_, i) => (
                                    <span key={i} className={`auth-particle auth-particle--${i + 1}`} />
                                ))}
                            </div>
                        </div>
<<<<<<< HEAD
                        <div className="auth-success-message" style={{ color: 'grey' }}>
=======
                        <div className="auth-success-message">
>>>>>>> dc5e6e85f7da2b5cc456794fff55bafa22f23d7c
                            <strong>Password Reset Complete</strong>
                            <p>Redirecting you to login in a few seconds...</p>
                        </div>
                        <button
                            className="auth-btn auth-btn--secondary"
                            onClick={() => navigate('/login')}
                        >
                            <ArrowRight size={16} />
                            <span>Go to Login</span>
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleConfirmReset} className="auth-form">
                        {/* Password Field with Strength Meter */}
                        <div className="auth-field">
                            <label className="auth-label">
                                New Password
                                <span className="auth-label-hint">Min 6 characters</span>
                            </label>
                            <div className="auth-input-wrapper">
                                <Lock className="auth-input-icon" size={18} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Create a strong password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
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

                            {/* Password Strength Indicator */}
                            {newPassword.length > 0 && (
                                <div className="auth-strength">
                                    <div className="auth-strength-bars">
                                        {[...Array(4)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={`auth-strength-bar ${i < strength ? 'active' : ''}`}
                                                style={{
                                                    backgroundColor: i < strength ? getStrengthColor() : '#e2e8f0',
                                                    transitionDelay: `${i * 50}ms`
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <span
                                        className="auth-strength-text"
                                        style={{ color: getStrengthColor() }}
                                    >
                                        {getStrengthLabel()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Error Alert */}
                        {error && (
                            <div className="auth-alert auth-alert--error">
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading || strength < 2}
                            className={`auth-btn ${loading ? 'auth-btn--loading' : ''}`}
                        >
                            {loading ? (
                                <Loader2 className="auth-spin" size={20} />
                            ) : (
                                <>
                                    <span>Reset Password</span>
                                    <ArrowRight size={16} className="auth-btn-icon" />
                                </>
                            )}
                        </button>

                        <p className="auth-helper">
                            Remember your password?{' '}
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="auth-link-sm"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                                Sign in
                            </button>
                        </p>
                    </form>
                )}
            </div>

            {/* Copyright */}
            <div className="auth-copyright">
                © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
            </div>
        </div>
    );
};

export default ResetPassword;