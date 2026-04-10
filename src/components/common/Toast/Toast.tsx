import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastProps {
    toast: ToastMessage;
    onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(toast.id);
        }, toast.duration || 4000);

        return () => clearTimeout(timer);
    }, [toast, onClose]);

    const icons = {
        success: <CheckCircle size={20} />,
        error: <XCircle size={20} />,
        warning: <AlertCircle size={20} />,
        info: <Info size={20} />
    };

    return (
        <div className={`toast toast-${toast.type}`}>
            <div className="toast-icon">{icons[toast.type]}</div>
            <div className="toast-message">{toast.message}</div>
            {/* <button className="toast-close" onClick={() => onClose(toast.id)}>
                <X size={16} />
            </button> */}
            <button className="toast-close" onClick={() => onClose(toast.id)}>
                <X size={16} style={{ color: 'white' }} />
            </button>
        </div>
    );
};

export const ToastContainer: React.FC<{ toasts: ToastMessage[]; onClose: (id: string) => void }> = ({
    toasts,
    onClose
}) => {
    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast key={toast.id} toast={toast} onClose={onClose} />
            ))}
        </div>
    );
};

// Hook for using toasts
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = (type: ToastType, message: string, duration?: number) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newToast: ToastMessage = { id, type, message, duration };

        setToasts(prev => [...prev, newToast]);
    };

    const closeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return {
        toasts,
        showToast,
        closeToast,
        success: (message: string, duration?: number) => showToast('success', message, duration),
        error: (message: string, duration?: number) => showToast('error', message, duration),
        warning: (message: string, duration?: number) => showToast('warning', message, duration),
        info: (message: string, duration?: number) => showToast('info', message, duration),
    };
};

export default Toast;