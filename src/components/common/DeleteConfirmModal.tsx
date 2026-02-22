import React from 'react';
import { AlertTriangle } from 'lucide-react';

// 1. UPDATE THIS INTERFACE 👇
interface DeleteConfirmModalProps {
    itemName: string;
    actionType: 'Delete' | 'Archive' | 'Discard'; // ✅ Added 'Discard'
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
            case 'Discard': // ✅ Handle new case
                return {
                    btnClass: 'btn-danger',
                    btnColor: '#dc2626',
                    title: 'Discard Draft',
                    desc: 'This draft will be permanently removed. This cannot be undone.'
                };
            default: // Delete
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


// import React from 'react';
// import { AlertCircle, Trash2, Archive } from 'lucide-react'; // Added Archive icon

// interface DeleteConfirmModalProps {
//     itemName: string;
//     actionType?: 'Delete' | 'Archive'; // We support both
//     onConfirm: () => void;
//     onCancel: () => void;
// }

// export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
//     itemName,
//     actionType = 'Delete',
//     onConfirm,
//     onCancel,
// }) => (
//     <div className="modal-overlay" onClick={onCancel}>
//         <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }} onClick={(e) => e.stopPropagation()}>
//             <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
//                 <AlertCircle size={48} color="#ef4444" />
//             </div>

//             <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>Confirm {actionType}</h2>

//             <p style={{ color: '#64748b', lineHeight: '1.5' }}>
//                 Are you sure you want to {actionType.toLowerCase()} <strong>{itemName}</strong>?<br />
//                 {actionType === 'Delete' ? 'This cannot be undone.' : 'It will be moved to history.'}
//             </p>

//             <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
//                 <button className="btn btn-outline" onClick={onCancel}>
//                     Cancel
//                 </button>
//                 <button
//                     className="btn btn-primary"
//                     style={{
//                         background: actionType === 'Delete' ? '#ef4444' : '#d97706', // Red for delete, Orange for archive
//                         borderColor: actionType === 'Delete' ? '#ef4444' : '#d97706',
//                         display: 'flex', alignItems: 'center', gap: '8px'
//                     }}
//                     onClick={onConfirm}
//                 >
//                     {actionType === 'Delete' ? <Trash2 size={18} /> : <Archive size={18} />}
//                     {actionType}
//                 </button>
//             </div>
//         </div>
//     </div>
// );