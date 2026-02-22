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
    if (loading) {
        return (
            <div style={{
                height: '100vh', display: 'flex', justifyContent: 'center',
                alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
            }}>
                <Loader className="spin" size={32} />
                <p>Verifying Access...</p>
            </div>
        );
    }

    // 2. NO USER: Redirect to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 🚀 3. SIGNATURE CHECK (Staff AND Learners)
    // Digital signatures are a legal requirement for QCTO/SETA compliance.
    const requiresSignature = ['facilitator', 'assessor', 'moderator', 'learner'].includes(user.role);

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

    // 8. ROLE CHECK
    const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

    if (!hasAccess) {
        return (
            <div style={{
                height: '100vh', display: 'flex', justifyContent: 'center',
                alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
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

    // 9. ALL CHECKS PASSED: Render the requested page
    return <>{children}</>;
};


// import React from 'react';
// import { Navigate, useLocation } from 'react-router-dom';
// import { useStore } from '../store/useStore';
// import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';
// import { Loader, AlertTriangle } from 'lucide-react';

// interface Props {
//     children: React.ReactNode;
//     allowedRoles: string[];
// }

// export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
//     const { user, loading } = useStore();
//     const location = useLocation();

//     // 1. WHILE LOADING: Prevent UI flicker
//     if (loading) {
//         return (
//             <div style={{
//                 height: '100vh', display: 'flex', justifyContent: 'center',
//                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
//             }}>
//                 <Loader className="spin" size={32} />
//                 <p>Verifying Access...</p>
//             </div>
//         );
//     }

//     // 2. NO USER: Redirect to login
//     if (!user) {
//         return <Navigate to="/login" state={{ from: location }} replace />;
//     }

//     // 🚀 3. SIGNATURE CHECK (Staff AND Learners)
//     // Digital signatures are a legal requirement for QCTO/SETA compliance.
//     const requiresSignature = ['facilitator', 'assessor', 'moderator', 'learner'].includes(user.role);

//     if (requiresSignature && !user.signatureUrl) {
//         return (
//             <SignatureSetupModal
//                 userUid={user.uid}
//                 onComplete={() => window.location.reload()}
//             />
//         );
//     }

//     // 🚀 4. THE LEARNER GATEKEEPER (Learners KYC)
//     if (
//         user.role === 'learner' &&
//         user.profileCompleted !== true &&
//         location.pathname !== '/setup-profile'
//     ) {
//         return <Navigate to="/setup-profile" replace />;
//     }

//     // 🚀 5. THE PRACTITIONER GATEKEEPER (Assessor/Moderator Compliance)
//     // Prevents assessors from marking scripts until professional docs are uploaded.
//     const isPractitioner = user.role === 'assessor' || user.role === 'moderator';

//     if (
//         isPractitioner &&
//         user.profileCompleted !== true &&
//         location.pathname !== '/setup-practitioner'
//     ) {
//         console.warn("Practitioner compliance check failed. Redirecting to professional setup.");
//         return <Navigate to="/setup-practitioner" replace />;
//     }

//     // 🚀 6. THE FACILITATOR GATEKEEPER (Facilitator Compliance)
//     // Prevents facilitators from accessing classes until ID and CV are uploaded.
//     if (
//         user.role === 'facilitator' &&
//         user.profileCompleted !== true &&
//         location.pathname !== '/setup-facilitator'
//     ) {
//         console.warn("Facilitator compliance check failed. Redirecting to professional setup.");
//         return <Navigate to="/setup-facilitator" replace />;
//     }

//     // 7. ROLE CHECK
//     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

//     if (!hasAccess) {
//         return (
//             <div style={{
//                 height: '100vh', display: 'flex', justifyContent: 'center',
//                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
//             }}>
//                 <AlertTriangle size={48} color="#ef4444" />
//                 <h2>Access Denied</h2>
//                 <p>Logged in as: <strong>{user.role.toUpperCase()}</strong></p>
//                 <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
//                     You do not have permission to view this page.
//                 </p>
//                 <button
//                     onClick={() => window.history.back()}
//                     style={{
//                         padding: '0.8rem 1.5rem', background: '#073f4e', marginTop: '1rem',
//                         color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
//                         fontWeight: 'bold'
//                     }}
//                 >
//                     Go Back
//                 </button>
//             </div>
//         );
//     }

//     // 8. ALL CHECKS PASSED: Render the requested page
//     return <>{children}</>;
// };


// // import React from 'react';
// // import { Navigate, useLocation } from 'react-router-dom';
// // import { useStore } from '../store/useStore';
// // import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';
// // import { Loader, AlertTriangle } from 'lucide-react';

// // interface Props {
// //     children: React.ReactNode;
// //     allowedRoles: string[];
// // }

// // export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
// //     const { user, loading } = useStore();
// //     const location = useLocation();

// //     // 1. WHILE LOADING: Prevent UI flicker
// //     if (loading) {
// //         return (
// //             <div style={{
// //                 height: '100vh', display: 'flex', justifyContent: 'center',
// //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// //             }}>
// //                 <Loader className="spin" size={32} />
// //                 <p>Verifying Access...</p>
// //             </div>
// //         );
// //     }

// //     // 2. NO USER: Redirect to login
// //     if (!user) {
// //         return <Navigate to="/login" state={{ from: location }} replace />;
// //     }

// //     // 🚀 3. SIGNATURE CHECK (Staff AND Learners)
// //     // Digital signatures are a legal requirement for QCTO/SETA compliance.
// //     const requiresSignature = ['facilitator', 'assessor', 'moderator', 'learner'].includes(user.role);

// //     if (requiresSignature && !user.signatureUrl) {
// //         return (
// //             <SignatureSetupModal
// //                 userUid={user.uid}
// //                 onComplete={() => window.location.reload()}
// //             />
// //         );
// //     }

// //     // 🚀 4. THE QCTO GATEKEEPER (Learners KYC)
// //     if (
// //         user.role === 'learner' &&
// //         user.profileCompleted !== true &&
// //         location.pathname !== '/setup-profile'
// //     ) {
// //         return <Navigate to="/setup-profile" replace />;
// //     }

// //     // 🚀 5. THE PRACTITIONER GATEKEEPER (Assessor/Moderator Compliance)
// //     // Prevents assessors from marking scripts until professional docs are uploaded.
// //     const isPractitioner = user.role === 'assessor' || user.role === 'moderator';

// //     if (
// //         isPractitioner &&
// //         user.profileCompleted !== true &&
// //         location.pathname !== '/setup-practitioner'
// //     ) {
// //         console.warn("Practitioner compliance check failed. Redirecting to professional setup.");
// //         return <Navigate to="/setup-practitioner" replace />;
// //     }

// //     // 6. ROLE CHECK
// //     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

// //     if (!hasAccess) {
// //         return (
// //             <div style={{
// //                 height: '100vh', display: 'flex', justifyContent: 'center',
// //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// //             }}>
// //                 <AlertTriangle size={48} color="#ef4444" />
// //                 <h2>Access Denied</h2>
// //                 <p>Logged in as: <strong>{user.role.toUpperCase()}</strong></p>
// //                 <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
// //                     You do not have permission to view this page.
// //                 </p>
// //                 <button
// //                     onClick={() => window.history.back()}
// //                     style={{
// //                         padding: '0.8rem 1.5rem', background: '#073f4e', marginTop: '1rem',
// //                         color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
// //                         fontWeight: 'bold'
// //                     }}
// //                 >
// //                     Go Back
// //                 </button>
// //             </div>
// //         );
// //     }

// //     // 7. ALL CHECKS PASSED: Render the requested page
// //     return <>{children}</>;
// // };


// // // import React from 'react';
// // // import { Navigate, useLocation } from 'react-router-dom';
// // // import { useStore } from '../store/useStore';
// // // import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';
// // // import { Loader, AlertTriangle } from 'lucide-react';

// // // interface Props {
// // //     children: React.ReactNode;
// // //     allowedRoles: string[];
// // // }

// // // export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
// // //     // 1. Pull everything from your central Zustand store
// // //     const { user, loading } = useStore();
// // //     const location = useLocation();

// // //     // 2. WHILE LOADING: Show the spinner. 
// // //     // This prevents the "flash" of the login page during navigation.
// // //     if (loading) {
// // //         return (
// // //             <div style={{
// // //                 height: '100vh', display: 'flex', justifyContent: 'center',
// // //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// // //             }}>
// // //                 <Loader className="spin" size={32} />
// // //                 <p>Verifying Access...</p>
// // //             </div>
// // //         );
// // //     }

// // //     // 3. NO USER: Redirect to login
// // //     if (!user) {
// // //         return <Navigate to="/login" state={{ from: location }} replace />;
// // //     }

// // //     // 🚀 4. SIGNATURE CHECK (Staff AND Learners)
// // //     // QCTO compliance requires ALL active roles to have a digital signature on file
// // //     // for signing off assessments, attendance registers, and PoE declarations.
// // //     const requiresSignature = ['facilitator', 'assessor', 'moderator', 'learner'].includes(user.role);

// // //     if (requiresSignature && !user.signatureUrl) {
// // //         return (
// // //             <SignatureSetupModal
// // //                 userUid={user.uid}
// // //                 onComplete={() => window.location.reload()}
// // //             />
// // //         );
// // //     }

// // //     // 🚀 5. THE QCTO GATEKEEPER (Learners Only KYC)
// // //     // If they are a learner, haven't finished setup, and aren't ALREADY on the setup page...
// // //     if (
// // //         user.role === 'learner' &&
// // //         user.profileCompleted !== true &&
// // //         location.pathname !== '/setup-profile'
// // //     ) {
// // //         console.warn("Learner profile incomplete. Redirecting to KYC Setup.");
// // //         return <Navigate to="/setup-profile" replace />;
// // //     }

// // //     // 6. ROLE CHECK
// // //     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

// // //     if (!hasAccess) {
// // //         return (
// // //             <div style={{
// // //                 height: '100vh', display: 'flex', justifyContent: 'center',
// // //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// // //             }}>
// // //                 <AlertTriangle size={48} color="#ef4444" />
// // //                 <h2>Access Denied</h2>
// // //                 <p>Logged in as: <strong>{user.role.toUpperCase()}</strong></p>
// // //                 <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
// // //                     You do not have permission to view this page.
// // //                 </p>
// // //                 <button
// // //                     onClick={() => window.history.back()}
// // //                     style={{
// // //                         padding: '0.8rem 1.5rem', background: '#073f4e', marginTop: '1rem',
// // //                         color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
// // //                         fontWeight: 'bold'
// // //                     }}
// // //                 >
// // //                     Go Back
// // //                 </button>
// // //             </div>
// // //         );
// // //     }

// // //     // 7. ALL CHECKS PASSED: Render the requested page
// // //     return <>{children}</>;
// // // };


// // // // import React, { useState, useEffect } from 'react';
// // // // import { Navigate, useLocation } from 'react-router-dom';
// // // // import { useStore } from '../store/useStore'; // Use your actual store
// // // // import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';
// // // // import { Loader, AlertTriangle } from 'lucide-react';

// // // // interface Props {
// // // //     children: React.ReactNode;
// // // //     allowedRoles: string[];
// // // // }

// // // // export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
// // // //     // 1. Pull everything from your central Zustand store
// // // //     const { user, loading } = useStore();
// // // //     const location = useLocation();

// // // //     // 2. WHILE LOADING: Show the spinner. 
// // // //     // This prevents the "flash" of the login page during navigation.
// // // //     if (loading) {
// // // //         return (
// // // //             <div style={{
// // // //                 height: '100vh', display: 'flex', justifyContent: 'center',
// // // //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// // // //             }}>
// // // //                 <Loader className="spin" size={32} />
// // // //                 <p>Verifying Access...</p>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     // 3. NO USER: Redirect to login
// // // //     if (!user) {
// // // //         return <Navigate to="/login" state={{ from: location }} replace />;
// // // //     }

// // // //     // 4. SIGNATURE CHECK: 
// // // //     // QCTO compliance requires facilitators/assessors to have signatures.
// // // //     // We block if they aren't admin and have no signature.
// // // //     // Note: Ensure 'signatureUrl' is part of your 'user' object in App.tsx
// // // //     if (user.role !== 'admin' && !user.signatureUrl) {
// // // //         return (
// // // //             <SignatureSetupModal
// // // //                 userUid={user.uid}
// // // //                 onComplete={() => window.location.reload()}
// // // //             />
// // // //         );
// // // //     }

// // // //     // 5. ROLE CHECK
// // // //     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

// // // //     if (!hasAccess) {
// // // //         return (
// // // //             <div style={{
// // // //                 height: '100vh', display: 'flex', justifyContent: 'center',
// // // //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e'
// // // //             }}>
// // // //                 <AlertTriangle size={48} color="#ef4444" />
// // // //                 <h2>Access Denied</h2>
// // // //                 <p>Logged in as: <strong>{user.role.toUpperCase()}</strong></p>
// // // //                 <button
// // // //                     onClick={() => window.history.back()}
// // // //                     style={{
// // // //                         padding: '0.8rem 1.5rem', background: '#073f4e',
// // // //                         color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer'
// // // //                     }}
// // // //                 >
// // // //                     Go Back
// // // //                 </button>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return <>{children}</>;
// // // // };