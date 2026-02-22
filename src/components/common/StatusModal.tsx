import React from 'react';
import { Info, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export type StatusType = 'info' | 'success' | 'error' | 'warning';

interface StatusModalProps {
    type: StatusType;
    title: string;
    message: string;
    onClose: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({ type, title, message, onClose }) => {

    // Dynamic Styles based on type
    const styles = {
        info: { color: '#3b82f6', Icon: Info },          // Blue
        success: { color: '#22c55e', Icon: CheckCircle },   // Green
        error: { color: '#ef4444', Icon: XCircle },       // Red
        warning: { color: '#f59e0b', Icon: AlertTriangle }  // Orange
    };

    const { color, Icon } = styles[type];

    return (
        // zIndex 2000 ensures it sits ON TOP of other modals
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
            <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Icon size={48} color={color} />
                </div>

                <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b' }}>{title}</h2>

                <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem' }}>
                    {message}
                </p>

                <button
                    className="btn btn-primary"
                    onClick={onClose}
                    style={{
                        width: '100%',
                        justifyContent: 'center',
                        background: color,
                        borderColor: color
                    }}
                >
                    Okay
                </button>
            </div>
        </div>
    );
};