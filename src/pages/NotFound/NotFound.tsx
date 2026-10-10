import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home, Compass } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const NotFound: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useStore();

    const getDashboardPath = () => {
        if (!user) return '/login';
        switch (user.role) {
            case 'admin':
            case 'assistant_admin': return '/admin';
            case 'facilitator':
            case 'assistant_facilitator': return '/facilitator';
            case 'assessor': return '/marking';
            case 'moderator': return '/moderation';
            case 'mentor': return '/mentor';
            case 'learner': return '/portal';
            case 'seta_verifier':
            case 'qcto_auditor': return '/audit-portal';
            default: return '/login';
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            background: 'var(--mlab-bg, #f0f4f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box'
        }}>
            <div style={{
                maxWidth: '560px',
                width: '100%',
                background: '#ffffff',
                border: '3px solid var(--mlab-blue, #073f4e)',
                borderTop: '6px solid var(--mlab-green, #94c73d)',
                borderRadius: '0px',
                padding: '36px 32px',
                boxShadow: '0 20px 40px rgba(7, 63, 78, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
            }}>
                {/* ICON EMBLEM */}
                <div style={{
                    width: '72px',
                    height: '72px',
                    background: 'var(--mlab-light-blue, #e8f0f3)',
                    border: '2px solid var(--mlab-blue, #073f4e)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px',
                    color: 'var(--mlab-blue, #073f4e)'
                }}>
                    <FileQuestion size={36} />
                </div>

                {/* ERROR CODE & HEADING */}
                <span style={{
                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    letterSpacing: '0.15em',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    marginBottom: '4px'
                }}>
                    Error 404 • Page Not Found
                </span>

                <h1 style={{
                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                    fontSize: '2rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: 'var(--mlab-blue, #073f4e)',
                    margin: '0 0 12px 0',
                    lineHeight: 1.15
                }}>
                    Destination Out of Reach
                </h1>

                <p style={{
                    fontSize: '0.9rem',
                    color: '#475569',
                    lineHeight: 1.6,
                    margin: '0 0 28px 0',
                    maxWidth: '440px'
                }}>
                    The link or resource you attempted to open does not exist, has moved, or is restricted under your active credentials.
                </p>

                {/* ACTION BUTTONS */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    width: '100%'
                }}>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        style={{
                            background: '#ffffff',
                            color: 'var(--mlab-blue, #073f4e)',
                            border: '2px solid var(--mlab-blue, #073f4e)',
                            borderRadius: '0px',
                            padding: '10px 20px',
                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <ArrowLeft size={16} /> Go Back
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate(getDashboardPath())}
                        style={{
                            background: 'var(--mlab-blue, #073f4e)',
                            color: '#ffffff',
                            border: '2px solid var(--mlab-blue, #073f4e)',
                            borderRadius: '0px',
                            padding: '10px 22px',
                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {user ? <Home size={16} color="var(--mlab-green, #94c73d)" /> : <Compass size={16} />}
                        {user ? 'Return to Portal' : 'Return to Login'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotFound;