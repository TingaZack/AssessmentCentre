import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export const ConfirmModal: React.FC<{
    title: string; message: string; confirmText: string; cancelText: string;
    onConfirm: () => void; onCancel: () => void;
}> = ({ title, message, confirmText, cancelText, onConfirm, onCancel }) => {
    useEffect(() => {
        const s = document.createElement('style');
        s.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(s);
        return () => { document.head.removeChild(s); };
    }, []);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.72)', backdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="ap-animate" style={{ background: 'var(--mlab-white)', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 24px 48px -8px rgba(5,46,58,0.35)', border: '1px solid var(--mlab-border)', borderTop: '5px solid var(--mlab-blue)', overflow: 'hidden' }}>
                <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
                    <div style={{ width: 56, height: 56, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><AlertTriangle size={28} color="#d97706" /></div>
                    <h2 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>{title}</h2>
                    <p style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '0.9rem', lineHeight: 1.65 }}>{message}</p>
                </div>
                <div style={{ display: 'flex' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '1rem', border: 'none', borderRight: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{cancelText}</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: '1rem', border: 'none', background: 'var(--mlab-blue)', color: 'white', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{confirmText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
};