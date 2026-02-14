// src/pages/Login/Login.tsx

import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, Loader } from 'lucide-react';
import './Login.css'; // We'll reuse the portal styles or create simple ones

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/'); // Success! Go to Dashboard
        } catch (err: any) {
            console.error(err);
            setError("Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: 'red', position: 'absolute', left: 0, top: 0, right: 0 }}>

            <div style={{
                minHeight: '100vh',
                display: 'flex',
                // width: "150vh",
                justifyContent: 'center',
                alignItems: 'center',
                position: 'absolute',
                left: 0, right: 0,
                top: 0, bottom: 0,
                background: 'linear-gradient(135deg, #073f4e, #94c73d)'
            }}>
                <div style={{
                    background: 'white',
                    padding: '2.5rem',
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    width: '100%',
                    maxWidth: '400px',
                    textAlign: 'center'
                }}>
                    <div style={{ marginBottom: '1.5rem', color: '#073f4e' }}>
                        <div className="logo-text" style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                            <span style={{ color: '#94c73d' }}>m</span>lab
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Admin Login</h2>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', color: 'black', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            type="email"
                            placeholder="Email Address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                        />

                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', padding: '0.5rem', borderRadius: '4px' }}>
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                background: '#073f4e',
                                color: 'white',
                                padding: '0.8rem',
                                borderRadius: '6px',
                                border: 'none',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {loading ? <Loader className="spin" size={18} /> : <><Lock size={18} /> Login</>}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;