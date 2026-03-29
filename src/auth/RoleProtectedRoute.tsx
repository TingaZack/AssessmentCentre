// src/auth/RoleProtectedRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';

interface Props {
    children: React.ReactNode;
    allowedRoles: string[];
}

export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
    const { user, loading } = useStore();
    const location = useLocation();

    // WHILE LOADING: Prevent UI flicker
    if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Verifying Access...</span>
            </div>
        </div>
    );

    // NO USER: Redirect to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // SIGNATURE CHECK (Staff AND Learners)
    const requiresSignature = ['facilitator', 'assessor', 'moderator', 'mentor', 'learner'].includes(user.role);

    if (requiresSignature && !user.signatureUrl) {
        return (
            <SignatureSetupModal
                userUid={user.uid}
                onComplete={() => window.location.reload()}
            />
        );
    }

    // DEEP KYC CHECKS
    // 1. Learner Check (Nested in demographics)
    const hasLearnerEquity = !!(user as any).demographics?.equityCode;
    const hasLearnerProvince = !!(user as any).demographics?.provinceCode;
    const isLearnerFullyCompliant = user.profileCompleted === true && hasLearnerEquity && hasLearnerProvince;

    // 2. Staff/Admin Check (Root level province added in the new updates)
    const hasStaffProvince = !!(user as any).province;
    const isStaffFullyCompliant = user.profileCompleted === true && hasStaffProvince;


    // THE LEARNER GATEKEEPER
    if (
        user.role === 'learner' &&
        !isLearnerFullyCompliant &&
        location.pathname !== '/setup-profile'
    ) {
        console.warn("Learner QCTO compliance check failed. Redirecting to setup.");
        return <Navigate to="/setup-profile" replace />;
    }

    // THE ASSESSOR GATEKEEPER
    if (
        user.role === 'assessor' &&
        !isStaffFullyCompliant &&
        location.pathname !== '/setup-assessor'
    ) {
        console.warn("Assessor compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-assessor" replace />;
    }

    // THE MODERATOR GATEKEEPER
    if (
        user.role === 'moderator' &&
        !isStaffFullyCompliant &&
        location.pathname !== '/setup-moderator'
    ) {
        console.warn("Moderator compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-moderator" replace />;
    }

    // THE FACILITATOR GATEKEEPER
    if (
        user.role === 'facilitator' &&
        !isStaffFullyCompliant &&
        location.pathname !== '/setup-facilitator'
    ) {
        console.warn("Facilitator compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-facilitator" replace />;
    }

    // THE MENTOR GATEKEEPER
    if (
        user.role === 'mentor' &&
        !isStaffFullyCompliant &&
        location.pathname !== '/setup-mentor'
    ) {
        console.warn("Mentor compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-mentor" replace />;
    }

    // THE ADMIN GATEKEEPER
    if (
        user.role === 'admin' &&
        !isStaffFullyCompliant &&
        location.pathname !== '/setup-admin' &&
        location.pathname !== '/admin/profile'
    ) {
        console.warn("Admin compliance check failed. Redirecting to professional setup.");
        return <Navigate to="/setup-admin" replace />;
    }

    // ROLE CHECK
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

    // ALL CHECKS PASSED: Render the requested page
    return <>{children}</>;
};