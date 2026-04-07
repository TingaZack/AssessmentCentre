// src/pages/LearnerPortal/PublicVerification.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Loader, AlertCircle, ShieldCheck, FileSearch } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import mLabLogo from '../../assets/logo/mlab_logo.png';

import './LearnerProfileSetup/LearnerProfileSetup.css';

const PublicVerification: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [idInput, setIdInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Auto-search if URL has ?id=...
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
            // 🔒 SECURE FIRESTORE QUERY: Only fetch the single requested document.
            // We check if the input matches EITHER an ID Number OR a Blockchain Verification Code
            const learnersRef = collection(db, 'learners');

            // First, try searching by SA ID Number
            let q = query(learnersRef, where('idNumber', '==', cleanId));
            let snapshot = await getDocs(q);

            // If not found by ID, try searching by Blockchain Certificate Code
            if (snapshot.empty) {
                q = query(learnersRef, where('verificationCode', '==', cleanId));
                snapshot = await getDocs(q);
            }

            if (!snapshot.empty) {
                // Match found! Navigate securely to the SOR page
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
        <div className="lp-container animate-fade-in" style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, var(--mlab-blue), var(--mlab-green))',
            zIndex: 9999
        }}>
            <div className="lp-card" style={{
                height: 'auto',
                padding: '3rem 2.5rem',
                maxWidth: '450px',
                textAlign: 'center',
                margin: 'auto',
                border: 'none',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                {/* Brand Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <img src={mLabLogo} height={70} alt="mLab Logo" />
                    </div>
                    <h2 style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        color: 'var(--mlab-blue)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                    }}>
                        <ShieldCheck size={24} color="var(--mlab-green)" />
                        Public Verification
                    </h2>
                    <p style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.9rem',
                        color: 'var(--mlab-grey)',
                        marginTop: '0.75rem',
                        lineHeight: '1.5'
                    }}>
                        Enter a Learner ID Number or Blockchain Certificate ID to verify a credential.
                    </p>
                </div>

                <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    <div style={{ position: 'relative' }}>
                        <FileSearch size={20} color="var(--mlab-grey-light)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="e.g. 920814... or CERT-123..."
                            value={idInput}
                            onChange={(e) => setIdInput(e.target.value)}
                            style={{ paddingLeft: '3rem' }}
                            className={`lp-input ${error ? 'error' : ''}`}
                            required
                        />
                    </div>

                    {error && (
                        <div style={{
                            color: '#ef4444', fontSize: '0.85rem', display: 'flex',
                            alignItems: 'center', gap: '0.5rem', background: '#fef2f2',
                            padding: '0.75rem', borderRadius: '6px', textAlign: 'left',
                            border: '1px solid #fecaca', fontFamily: 'var(--font-body)'
                        }}>
                            <AlertCircle size={18} style={{ flexShrink: 0 }} /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSearching || !idInput.trim()}
                        className="lp-btn-primary"
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            padding: '0.85rem',
                            marginTop: '0.5rem'
                        }}
                    >
                        {isSearching ? (
                            <><Loader className="spin" size={18} /> Querying Ledger...</>
                        ) : (
                            <><Search size={18} /> Verify Result</>
                        )}
                    </button>
                </form>

                <div style={{
                    marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid var(--mlab-light-blue)',
                    fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)'
                }}>
                    <p style={{ margin: '0 0 0.5rem 0' }}>Having trouble verifying a credential?</p>
                    <a href="mailto:info@mlab.co.za" style={{ color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>
                        Contact Support
                    </a>

                    <div style={{ marginTop: '1.5rem' }}>
                        <a href="/login" style={{ color: 'var(--mlab-grey-light)', textDecoration: 'none', fontWeight: 600, fontSize: '0.8rem' }}>
                            Institution Login
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicVerification;