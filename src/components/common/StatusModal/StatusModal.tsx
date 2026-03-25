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
        borderColor: '#0c0903',
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
