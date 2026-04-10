import React from 'react';
import { AlertTriangle } from 'lucide-react';

// 1. UPDATE THIS INTERFACE 
interface DeleteConfirmModalProps {
    itemName: string;
    actionType: 'Delete' | 'Archive' | 'Discard';
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    itemName, actionType, onConfirm, onCancel
}) => {

    // Helper to get color/text based on action
    const getActionStyles = () => {
        switch (actionType) {
            case 'Archive':
                return {
                    btnClass: 'btn-warning',
                    btnColor: '#d97706',
                    title: 'Confirm Archive',
                    desc: 'This item will be moved to the archive. You can restore it later.'
                };
            case 'Discard':
                return {
                    btnClass: 'btn-danger',
                    btnColor: '#dc2626',
                    title: 'Discard Draft',
                    desc: 'This draft will be permanently removed. This cannot be undone.'
                };
            default:
                return {
                    btnClass: 'btn-danger',
                    btnColor: '#dc2626',
                    title: 'Confirm Delete',
                    desc: 'Are you sure you want to permanently delete this item? This action cannot be undone.'
                };
        }
    };

    const styles = getActionStyles();

    return (
        <div className="modal-overlay">
            <div className="modal-content animate-scale-in" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem', display: 'inline-flex', padding: '12px', borderRadius: '50%', background: '#fee2e2' }}>
                    <AlertTriangle size={32} color={styles.btnColor} />
                </div>

                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{styles.title}</h3>

                <p style={{ color: '#64748b', marginBottom: '0.5rem' }}>
                    You are about to <strong>{actionType.toLowerCase()}</strong> "{itemName}".
                </p>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '2rem' }}>
                    {styles.desc}
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
                    <button
                        className={`btn ${styles.btnClass}`}
                        onClick={onConfirm}
                        style={{ background: styles.btnColor, borderColor: styles.btnColor, color: 'white' }}
                    >
                        {actionType}
                    </button>
                </div>
            </div>
        </div>
    );
};

