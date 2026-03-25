import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';

interface Props {
    children: React.ReactNode;
    allowedRoles: string[];
}

export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
    const { user, loading } = useStore();
    const location = useLocation();

    // 1. WHILE LOADING: Prevent UI flicker
    // if (loading) {
    //     return (
    //         <div style={{
    //             height: '100vh', display: 'flex', justifyContent: 'center',
    //             alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
    //         }}>
    //             <Loader className="spin" size={32} />
    //             <p>Verifying Access...</p>
    //         </div>
    //     );
    // }
    if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Verifying Access...</span>
            </div>
        </div>
    );

    // 2. NO USER: Redirect to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 🚀 3. SIGNATURE CHECK (Staff AND Learners)
    // Digital signatures are a legal requirement for QCTO/SETA compliance.
    const requiresSignature = ['facilitator', 'assessor', 'moderator', 'mentor', 'learner'].includes(user.role);

    if (requiresSignature && !user.signatureUrl) {
        return (
            <SignatureSetupModal
                userUid={user.uid}
                onComplete={() => window.location.reload()}
            />
        );
    }

    // 🚀 4. THE LEARNER GATEKEEPER (Learners KYC)
    if (
        user.role === 'learner' &&
        user.profileCompleted !== true &&
        location.pathname !== '/setup-profile'
    ) {
        return <Navigate to="/setup-profile" replace />;
    }

    // 🚀 5. THE ASSESSOR GATEKEEPER
    // Prevents assessors from marking scripts until professional docs are uploaded.
    if (
        user.role === 'assessor' &&
        user.profileCompleted !== true &&
        location.pathname !== '/setup-assessor'
    ) {
        console.warn("Assessor compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-assessor" replace />;
    }

    // 🚀 6. THE MODERATOR GATEKEEPER
    // Prevents moderators from endorsing scripts until professional docs are uploaded.
    if (
        user.role === 'moderator' &&
        user.profileCompleted !== true &&
        location.pathname !== '/setup-moderator'
    ) {
        console.warn("Moderator compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-moderator" replace />;
    }

    // 🚀 7. THE FACILITATOR GATEKEEPER (Facilitator Compliance)
    // Prevents facilitators from accessing classes until ID and CV are uploaded.
    if (
        user.role === 'facilitator' &&
        user.profileCompleted !== true &&
        location.pathname !== '/setup-facilitator'
    ) {
        console.warn("Facilitator compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-facilitator" replace />;
    }

    // 🚀 8. THE MENTOR GATEKEEPER (Workplace Verification)
    // Prevents mentors from viewing logbooks until their company details are confirmed.
    if (
        user.role === 'mentor' &&
        user.profileCompleted !== true &&
        location.pathname !== '/setup-mentor'
    ) {
        console.warn("Mentor compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-mentor" replace />;
    }

    // 9. ROLE CHECK
    const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

    if (!hasAccess) {
        return (
            <div style={{
                height: '100vh', display: 'flex', justifyContent: 'center',
                alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e',
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            }}>
                <AlertTriangle size={48} color="#ef4444" />
                <h2>Access Denied</h2>
                <p>Logged in as: <strong>{user.role.toUpperCase()}</strong></p>
                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                    You do not have permission to view this page.
                </p>
                <button
                    onClick={() => window.history.back()}
                    style={{
                        padding: '0.8rem 1.5rem', background: '#073f4e', marginTop: '1rem',
                        color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Go Back
                </button>
            </div>
        );
    }

    // 10. ALL CHECKS PASSED: Render the requested page
    return <>{children}</>;
};

