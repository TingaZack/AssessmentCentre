// src/components/common/ErrorBoundary.tsx

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { db } from '../../lib/firebase';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorMessage: string;
    errorStack: string;
    componentStack: string;
    showDetails: boolean;
    copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        errorMessage: '',
        errorStack: '',
        componentStack: '',
        showDetails: false,
        copied: false,
    };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        // Update state so the next render will show the fallback UI.
        return {
            hasError: true,
            errorMessage: error.message || 'An unexpected client-side exception occurred.',
            errorStack: error.stack || '',
        };
    }

    public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error caught by boundary:', error, errorInfo);

        const compStack = errorInfo.componentStack || '';
        this.setState({ componentStack: compStack });

        // 1. Report Exception to Firebase Analytics
        try {
            const analytics = getAnalytics();
            logEvent(analytics, 'exception', {
                description: `${error.name || 'Error'}: ${error.message || ''}`.substring(0, 100),
                fatal: true,
                page_location: window.location.href,
            });
        } catch (analyticsError) {
            // Analytics might be blocked by browser extensions like AdBlock
            console.warn("Analytics blocked", analyticsError);
        }

        // 2. Report Detailed Crash Log to Firestore for Admin Inspection
        try {
            const crashLog = {
                errorName: error.name || 'React Component Error',
                errorMessage: error.message || 'Unknown error',
                errorStack: error.stack || '',
                componentStack: compStack,
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: serverTimestamp(),
                createdAt: new Date().toISOString(),
            };

            await addDoc(collection(db, 'system_crashes'), crashLog);
        } catch (dbError) {
            console.error('Failed to log crash to Firestore:', dbError);
        }
    }

    private handleCopyDetails = () => {
        const details = `URL: ${window.location.href}\nError: ${this.state.errorMessage}\n\nStack:\n${this.state.errorStack}\n\nComponent Stack:\n${this.state.componentStack}`;
        navigator.clipboard.writeText(details);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, justifyContent: 'center', height: '100vh', background: '#f8fafc', padding: '2rem', textAlign: 'center', zIndex: 999999 }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', padding: '2rem', borderRadius: '12px', maxWidth: '560px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                        <AlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 1rem' }} />
                        <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem', fontFamily: 'var(--font-heading, sans-serif)' }}>Something went wrong</h2>
                        <p style={{ color: '#7f1d1d', fontSize: '0.9rem', marginBottom: '1.5rem', wordBreak: 'break-word', lineHeight: 1.5 }}>
                            {this.state.errorMessage}
                        </p>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <button
                                onClick={() => window.location.reload()}
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}
                            >
                                <RefreshCw size={16} /> Reload Application
                            </button>

                            <button
                                onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                                style={{ background: 'white', color: '#991b1b', border: '1px solid #fca5a5', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '0.85rem' }}
                            >
                                {this.state.showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                {this.state.showDetails ? 'Hide Details' : 'Technical Details'}
                            </button>
                        </div>

                        {this.state.showDetails && (
                            <div style={{ marginTop: '1rem', textAlign: 'left', background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '200px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>CRASH DIAGNOSTIC LOG</span>
                                    <button
                                        onClick={this.handleCopyDetails}
                                        style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}
                                    >
                                        {this.state.copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                                        {this.state.copied ? 'Copied' : 'Copy Log'}
                                    </button>
                                </div>
                                <div style={{ color: '#f87171', marginBottom: '6px' }}>{this.state.errorMessage}</div>
                                {this.state.errorStack && <div style={{ opacity: 0.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.errorStack}</div>}
                                {this.state.componentStack && <div style={{ opacity: 0.6, marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.componentStack}</div>}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}


// // src/components/common/ErrorBoundary.tsx
// import React, { Component, type ErrorInfo, type ReactNode, } from 'react';
// import { AlertTriangle, RefreshCw } from 'lucide-react';

// interface Props {
//     children: ReactNode;
// }

// interface State {
//     hasError: boolean;
//     errorMessage: string;
// }

// export class ErrorBoundary extends Component<Props, State> {
//     public state: State = {
//         hasError: false,
//         errorMessage: ''
//     };

//     public static getDerivedStateFromError(error: Error): State {
//         // Update state so the next render will show the fallback UI.
//         return { hasError: true, errorMessage: error.message };
//     }

//     public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
//         console.error('Uncaught error caught by boundary:', error, errorInfo);
//     }

//     public render() {
//         if (this.state.hasError) {
//             return (
//                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, justifyContent: 'center', height: '100vh', background: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
//                     <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', padding: '2rem', borderRadius: '12px', maxWidth: '500px' }}>
//                         <AlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 1rem' }} />
//                         <h2 style={{ color: '#991b1b', margin: '0 0 1rem' }}>Something went wrong.</h2>
//                         <p style={{ color: '#7f1d1d', fontSize: '0.9rem', marginBottom: '1.5rem', wordWrap: 'break-word' }}>
//                             {this.state.errorMessage}
//                         </p>
//                         <button
//                             onClick={() => window.location.reload()}
//                             style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto', fontWeight: 'bold' }}
//                         >
//                             <RefreshCw size={16} /> Reload Application
//                         </button>
//                     </div>
//                 </div>
//             );
//         }

//         return this.props.children;
//     }
// }