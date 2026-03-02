// src/components/common/StatusModal.tsx

import React from 'react';
import { Info, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import './StatusModal.css';

export type StatusType = 'info' | 'success' | 'error' | 'warning';

export interface StatusModalProps {
    type: StatusType;
    title: string;
    message: string;
    onClose: () => void;
    onCancel?: () => void;
    confirmText?: string;
}

const STATUS_CONFIG: Record<StatusType, {
    Icon: React.ElementType;
    accentColor: string;
    bgColor: string;
    borderColor: string;
    labelColor: string;
}> = {
    info: {
        Icon: Info,
        accentColor: 'var(--mlab-blue)',
        bgColor: 'var(--mlab-light-blue)',
        borderColor: 'var(--mlab-blue)',
        labelColor: 'var(--mlab-blue)',
    },
    success: {
        Icon: CheckCircle,
        accentColor: 'var(--mlab-green-dark)',
        bgColor: 'var(--mlab-green-bg)',
        borderColor: 'var(--mlab-green)',
        labelColor: 'var(--mlab-green-dark)',
    },
    error: {
        Icon: XCircle,
        accentColor: '#b91c1c',
        bgColor: '#fef2f2',
        borderColor: '#ef4444',
        labelColor: '#b91c1c',
    },
    warning: {
        Icon: AlertTriangle,
        accentColor: '#b45309',
        bgColor: '#fffbeb',
        borderColor: '#f59e0b',
        labelColor: '#b45309',
    },
};

const STATUS_LABEL: Record<StatusType, string> = {
    info: 'Information',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
};

export const StatusModal: React.FC<StatusModalProps> = ({
    type, title, message, onClose, onCancel, confirmText = 'Okay'
}) => {
    const { Icon, accentColor, bgColor, borderColor, labelColor } = STATUS_CONFIG[type];

    return (
        <div className="stm-overlay">
            <div
                className="stm-modal"
                style={{ '--stm-accent': accentColor, '--stm-bg': bgColor, '--stm-border': borderColor } as React.CSSProperties}
            >
                {/* Coloured top bar */}
                <div className="stm-top-bar" />

                {/* Icon zone */}
                <div className="stm-icon-zone">
                    <div className="stm-icon-ring">
                        <Icon size={28} />
                    </div>
                    <span className="stm-type-label" style={{ color: labelColor }}>
                        {STATUS_LABEL[type]}
                    </span>
                </div>

                {/* Content */}
                <div className="stm-body">
                    <h2 className="stm-title">{title}</h2>
                    <p className="stm-message">{message}</p>
                </div>

                {/* Footer */}
                <div className={`stm-footer ${onCancel ? 'stm-footer--split' : ''}`}>
                    {onCancel && (
                        <button type="button" className="stm-btn stm-btn--ghost" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button type="button" className="stm-btn stm-btn--confirm" onClick={onClose}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};


// import React from 'react';
// import { Info, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// export type StatusType = 'info' | 'success' | 'error' | 'warning';

// export interface StatusModalProps {
//     type: StatusType;
//     title: string;
//     message: string;
//     onClose: () => void;
//     onCancel?: () => void;       // Added so it can be used as a Confirm dialog
//     confirmText?: string;        // Allows changing "Okay" to "Yes, Load It"
// }

// export const StatusModal: React.FC<StatusModalProps> = ({
//     type, title, message, onClose, onCancel, confirmText = 'Okay'
// }) => {

//     // Dynamic Styles based on type
//     const styles = {
//         info: { color: '#3b82f6', Icon: Info },          // Blue
//         success: { color: '#22c55e', Icon: CheckCircle },   // Green
//         error: { color: '#ef4444', Icon: XCircle },       // Red
//         warning: { color: '#f59e0b', Icon: AlertTriangle }  // Orange
//     };

//     const { color, Icon } = styles[type];

//     return (
//         // zIndex 2000 ensures it sits ON TOP of other modals
//         <div className="modal-overlay" style={{ zIndex: 2000 }}>
//             <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
//                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
//                     <Icon size={48} color={color} />
//                 </div>

//                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b' }}>{title}</h2>

//                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem' }}>
//                     {message}
//                 </p>

//                 <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
//                     {onCancel && (
//                         <button
//                             type="button"
//                             className="btn btn-outline"
//                             onClick={onCancel}
//                             style={{ flex: 1 }}
//                         >
//                             Cancel
//                         </button>
//                     )}
//                     <button
//                         type="button"
//                         className="btn btn-primary"
//                         onClick={onClose}
//                         style={{
//                             flex: 1,
//                             justifyContent: 'center',
//                             background: color,
//                             borderColor: color
//                         }}
//                     >
//                         {confirmText}
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// };


// // import React from 'react';
// // import { Info, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// // export type StatusType = 'info' | 'success' | 'error' | 'warning';

// // interface StatusModalProps {
// //     type: StatusType;
// //     title: string;
// //     message: string;
// //     onClose: () => void;
// // }

// // export const StatusModal: React.FC<StatusModalProps> = ({ type, title, message, onClose }) => {

// //     // Dynamic Styles based on type
// //     const styles = {
// //         info: { color: '#3b82f6', Icon: Info },          // Blue
// //         success: { color: '#22c55e', Icon: CheckCircle },   // Green
// //         error: { color: '#ef4444', Icon: XCircle },       // Red
// //         warning: { color: '#f59e0b', Icon: AlertTriangle }  // Orange
// //     };

// //     const { color, Icon } = styles[type];

// //     return (
// //         // zIndex 2000 ensures it sits ON TOP of other modals
// //         <div className="modal-overlay" style={{ zIndex: 2000 }}>
// //             <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
// //                 <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
// //                     <Icon size={48} color={color} />
// //                 </div>

// //                 <h2 style={{ marginTop: 0, fontSize: '1.25rem', color: '#1e293b' }}>{title}</h2>

// //                 <p style={{ color: '#64748b', lineHeight: '1.5', marginBottom: '2rem' }}>
// //                     {message}
// //                 </p>

// //                 <button
// //                     className="btn btn-primary"
// //                     onClick={onClose}
// //                     style={{
// //                         width: '100%',
// //                         justifyContent: 'center',
// //                         background: color,
// //                         borderColor: color
// //                     }}
// //                 >
// //                     Okay
// //                 </button>
// //             </div>
// //         </div>
// //     );
// // };