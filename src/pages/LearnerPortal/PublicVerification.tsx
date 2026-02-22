import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Loader, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import './PublicVerification.css';

const PublicVerification: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { learners, fetchLearners } = useStore();

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
    }, [searchParams, learners]);

    const handleSearch = async (idToSearch: string) => {
        if (!idToSearch) return;

        setIsSearching(true);
        setError(null);

        // Ensure data is loaded
        if (learners.length === 0) {
            await fetchLearners();
        }

        // Slight delay for UX
        setTimeout(() => {
            // Check fresh state
            const currentLearners = useStore.getState().learners;
            const found = currentLearners.find(l => l.idNumber.trim() === idToSearch.trim());

            if (found) {
                // Navigate to the SOR page using the Firestore Document ID
                navigate(`/sor/${found.id}`);
            } else {
                setError("No Statement of Results found for this ID Number.");
                setIsSearching(false);
            }
        }, 800);
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(idInput);
    };

    return (
        <div className="portal-container">
            <div className="portal-card">
                <div className="portal-header">
                    <div className="logo-text">
                        <span className="logo-m">m</span>
                        <span className="logo-lab">lab</span>
                    </div>
                    <h1>Learner Portal</h1>
                    <p>Enter your ID Number to view your Statement of Results</p>
                </div>

                <form onSubmit={onSubmit} className="portal-form">
                    <div className="search-box">
                        <input
                            type="text"
                            placeholder="e.g. 9208145234086"
                            value={idInput}
                            onChange={(e) => setIdInput(e.target.value)}
                            className={error ? 'error' : ''}
                        />
                        <Search className="search-icon" size={20} />
                    </div>

                    {error && (
                        <div className="error-message">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-portal"
                        disabled={isSearching || !idInput}
                    >
                        {isSearching ? (
                            <>
                                <Loader className="spin" size={18} /> Verifying...
                            </>
                        ) : (
                            'View Results'
                        )}
                    </button>
                </form>

                <div className="portal-footer">
                    <p>Having trouble? Contact <a href="mailto:training@mlab.co.za">training@mlab.co.za</a></p>
                    <div style={{ marginTop: '1rem', opacity: 0.5, fontSize: '0.75rem' }}>
                        <a href="/admin">Admin Login</a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicVerification;