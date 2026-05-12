// src/components/common/ErrorBoundary.tsx
import React, { Component, type ErrorInfo, type ReactNode, } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        errorMessage: ''
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, errorMessage: error.message };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error caught by boundary:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, justifyContent: 'center', height: '100vh', background: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', padding: '2rem', borderRadius: '12px', maxWidth: '500px' }}>
                        <AlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 1rem' }} />
                        <h2 style={{ color: '#991b1b', margin: '0 0 1rem' }}>Something went wrong.</h2>
                        <p style={{ color: '#7f1d1d', fontSize: '0.9rem', marginBottom: '1.5rem', wordWrap: 'break-word' }}>
                            {this.state.errorMessage}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto', fontWeight: 'bold' }}
                        >
                            <RefreshCw size={16} /> Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}