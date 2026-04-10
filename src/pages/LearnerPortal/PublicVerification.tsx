// src/pages/LearnerPortal/PublicVerification.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search, Loader, AlertCircle, ShieldCheck, FileSearch,
    Hexagon, Mail, ArrowRight
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import mLabLogo from '../../assets/logo/mlab_logo.png';
import '../Login/Login.css';

const PublicVerification: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [idInput, setIdInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const urlId = searchParams.get('id');
        if (urlId) {
            setIdInput(urlId);
            handleSearch(urlId);
        }
    }, [searchParams]);

    const handleSearch = async (idToSearch: string) => {
        const cleanId = idToSearch.trim();
        if (!cleanId) return;

        setIsSearching(true);
        setError(null);

        try {
            const learnersRef = collection(db, 'learners');
            let q = query(learnersRef, where('idNumber', '==', cleanId));
            let snapshot = await getDocs(q);

            if (snapshot.empty) {
                q = query(learnersRef, where('verificationCode', '==', cleanId));
                snapshot = await getDocs(q);
            }

            if (!snapshot.empty) {
                navigate(`/sor/${snapshot.docs[0].id}`);
            } else {
                setError("No verified credential found for this ID or Certificate Number.");
            }
        } catch (err) {
            console.error("Verification Search Error:", err);
            setError("Failed to connect to the verification database.");
        } finally {
            setIsSearching(false);
        }
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(idInput);
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

            <div className="auth-card" style={{ maxWidth: '480px' }}>
                {/* Brand Header */}
                <div className="auth-brand">
                    <div className="auth-logo-wrapper">
                        <img src={mLabLogo} alt="mLab Southern Africa" className="auth-logo" />
                        {/* <div className="auth-logo-ring" /> */}
                    </div>
                    <h1 className="auth-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                        <ShieldCheck size={28} color="#94c73d" />
                        Public Verification
                    </h1>
                    <p className="auth-subtitle">
                        Enter a Learner ID Number or Blockchain Certificate ID to verify a credential
                    </p>
                </div>

                <form onSubmit={onSubmit} className="auth-form">
                    {/* Search Input */}
                    <div className="auth-field">
                        <label className="auth-label">Credential ID</label>
                        <div className="auth-input-wrapper">
                            <FileSearch className="auth-input-icon" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. 920814... or CERT-123..."
                                value={idInput}
                                onChange={(e) => setIdInput(e.target.value)}
                                required
                                className={`auth-input ${error ? 'auth-input--error' : ''}`}
                            />
                        </div>
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
                        disabled={isSearching || !idInput.trim()}
                        className={`auth-btn ${isSearching ? 'auth-btn--loading' : ''}`}
                    >
                        {isSearching ? (
                            <>
                                <Loader className="auth-spin" size={18} />
                                <span>Querying Ledger...</span>
                            </>
                        ) : (
                            <>
                                <Search size={18} />
                                <span>Verify Credential</span>
                                <ArrowRight size={16} className="auth-btn-icon" />
                            </>
                        )}
                    </button>
                </form>

                {/* Footer Links */}
                <div className="auth-footer" style={{ marginTop: '2rem' }}>
                    <div className="auth-footer-item">
                        <span>Need help verifying?</span>
                        <a href="mailto:info@mlab.co.za" className="auth-link">
                            Contact Support
                        </a>
                    </div>
                    <div className="auth-divider" />
                    <div className="auth-footer-item" style={{ justifyContent: 'center' }}>
                        <a href="/login" className="auth-link auth-link--highlight">
                            Institution Login
                        </a>
                    </div>
                </div>
            </div>

            {/* Copyright */}
            <div className="auth-copyright">
                © {new Date().getFullYear()} Mobile Applications Laboratory NPC. All rights reserved.
            </div>
        </div>
    );
};

export default PublicVerification;