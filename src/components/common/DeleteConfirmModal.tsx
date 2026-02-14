import React from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
    itemName: string;
    actionType?: 'Delete' | 'Archive';
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    itemName,
    actionType = 'Delete',
    onConfirm,
    onCancel,
}) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
            <h2 style={{ marginTop: 0 }}>Confirm {actionType}</h2>
            <p>
                Are you sure you want to {actionType.toLowerCase()} <strong>{itemName}</strong>? This
                cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn btn-outline" onClick={onCancel}>
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    style={{ background: '#ef4444', borderColor: '#ef4444' }}
                    onClick={onConfirm}
                >
                    <Trash2 size={18} /> {actionType}
                </button>
            </div>
        </div>
    </div>
);