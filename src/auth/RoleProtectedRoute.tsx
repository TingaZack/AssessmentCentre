// src/auth/RoleProtectedRoute.tsx

import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useStore } from "../store/useStore";
import { SignatureSetupModal } from "../components/auth/SignatureSetupModal";
import { auth } from "../lib/firebase";
import { VerifyEmail } from "../components/auth/VerifyEmail";
import Loader from "../components/common/Loader/Loader";

interface Props {
    children: React.ReactNode;
    allowedRoles: string[];
    requireSuperAdmin?: boolean; // Strict Super Admin Flag
}

export const RoleProtectedRoute: React.FC<Props> = ({
    children,
    allowedRoles,
    requireSuperAdmin = false,
}) => {
    const { user, loading } = useStore();
    const location = useLocation();
    const [isFirebaseAuthLoaded, setIsFirebaseAuthLoaded] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(() => {
            setIsFirebaseAuthLoaded(true);
        });
        return () => unsubscribe();
    }, []);

    if (loading || !isFirebaseAuthLoaded)
        return (
            <div
                className="ap-fullscreen"
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    top: 0,
                    backgroundColor: "var(--mlab-bg)",
                }}
            >
                <div
                    style={{
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "1rem",
                    }}
                >
                    <div
                        style={{
                            width: "40px",
                            height: "40px",
                            border: "4px solid var(--mlab-light-blue)",
                            borderTopColor: "var(--mlab-blue)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                        }}
                    />
                    {/* <span
                        style={{
                            fontFamily: "var(--font-heading)",
                            fontSize: "0.8rem",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--mlab-grey)",
                        }}
                    >
                        Verifying Access...
                    </span> */}
                    <Loader message="Verifying Access..." fullScreen={false} />
                </div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );

    if (!user || !auth.currentUser)
        return <Navigate to="/login" state={{ from: location }} replace />;

    // TESTING BYPASS: Allow adlab@gmail.com to skip email verification
    const isTestAccount = auth.currentUser.email === "adlab@gmail.com";

    if (auth.currentUser.emailVerified === false && !isTestAccount) {
        return (
            <VerifyEmail>
                <div />
            </VerifyEmail>
        );
    }

    const requiresSignature = [
        "facilitator",
        "assessor",
        "moderator",
        "mentor",
        "learner",
    ].includes(user.role);
    if (requiresSignature && !user.signatureUrl) {
        return (
            <SignatureSetupModal
                userUid={user.uid}
                onComplete={() => window.location.reload()}
            />
        );
    }

    const d = (user as any).demographics || {};
    const hasLearnerEquity = !!d.equityCode;
    const hasLearnerProvince = !!d.provinceCode;
    const hasLearnerStatssa = !!d.statssaAreaCode || !!d.statsaaAreaCode;
    const hasLearnerTitle = !!d.learnerTitle;

    const isLearnerFullyCompliant =
        user.profileCompleted === true &&
        hasLearnerEquity &&
        hasLearnerProvince &&
        hasLearnerStatssa &&
        hasLearnerTitle;
    const hasStaffProvince = !!(user as any).province;
    const isStaffFullyCompliant =
        user.profileCompleted === true && hasStaffProvince;

    if (
        user.role === "learner" &&
        !isLearnerFullyCompliant &&
        location.pathname !== "/setup-profile"
    )
        return <Navigate to="/setup-profile" replace />;
    if (
        user.role === "assessor" &&
        !isStaffFullyCompliant &&
        location.pathname !== "/setup-assessor"
    )
        return <Navigate to="/setup-assessor" replace />;
    if (
        user.role === "moderator" &&
        !isStaffFullyCompliant &&
        location.pathname !== "/setup-moderator"
    )
        return <Navigate to="/setup-moderator" replace />;
    if (
        user.role === "facilitator" &&
        !isStaffFullyCompliant &&
        location.pathname !== "/setup-facilitator"
    )
        return <Navigate to="/setup-facilitator" replace />;
    if (
        user.role === "mentor" &&
        !isStaffFullyCompliant &&
        location.pathname !== "/setup-mentor"
    )
        return <Navigate to="/setup-mentor" replace />;
    if (
        user.role === "admin" &&
        !user.profileCompleted &&
        location.pathname !== "/setup-admin" &&
        location.pathname !== "/admin/profile"
    )
        return <Navigate to="/setup-admin" replace />;

    // SUPER ADMIN CHECK
    // If the route requires a Super Admin, check if the user has the explicit flag
    if (requireSuperAdmin && (user as any).isSuperAdmin !== true) {
        return (
            <div
                style={{
                    height: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    flexDirection: "column",
                    gap: "1rem",
                    color: "var(--mlab-blue)",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "var(--mlab-bg)",
                    fontFamily: "var(--font-body)",
                }}
            >
                <ShieldAlert size={64} color="#ef4444" />
                <h2
                    style={{
                        fontFamily: "var(--font-heading)",
                        textTransform: "uppercase",
                        margin: 0,
                        fontSize: "2rem",
                    }}
                >
                    Super Admin Only
                </h2>
                <div
                    style={{
                        background: "white",
                        padding: "1.5rem",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        textAlign: "center",
                        maxWidth: "400px",
                    }}
                >
                    <p style={{ margin: "0 0 0.5rem 0" }}>
                        Logged in as:{" "}
                        <strong
                            style={{ textTransform: "uppercase", color: "var(--mlab-grey)" }}
                        >
                            Standard {user.role}
                        </strong>
                    </p>
                    <p
                        style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}
                    >
                        This module contains critical platform infrastructure and is
                        restricted to Platform Owners / Super Admins.
                    </p>
                </div>
                <button
                    onClick={() => window.history.back()}
                    className="lp-btn-primary"
                    style={{ marginTop: "1rem" }}
                >
                    Go Back
                </button>
            </div>
        );
    }

    const hasAccess = allowedRoles.includes(user.role) || user.role === "admin";

    if (!hasAccess) {
        return (
            <div
                style={{
                    height: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    flexDirection: "column",
                    gap: "1rem",
                    color: "var(--mlab-blue)",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "var(--mlab-bg)",
                    fontFamily: "var(--font-body)",
                }}
            >
                <ShieldAlert size={64} color="#ef4444" />
                <h2
                    style={{
                        fontFamily: "var(--font-heading)",
                        textTransform: "uppercase",
                        margin: 0,
                        fontSize: "2rem",
                    }}
                >
                    Access Denied
                </h2>
                <div
                    style={{
                        background: "white",
                        padding: "1.5rem",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        textAlign: "center",
                    }}
                >
                    <p style={{ margin: "0 0 0.5rem 0" }}>
                        Logged in as:{" "}
                        <strong
                            style={{
                                textTransform: "uppercase",
                                color: "var(--mlab-green-dark)",
                            }}
                        >
                            {user.role}
                        </strong>
                    </p>
                    <p
                        style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}
                    >
                        You do not have permission to view this page.
                    </p>
                </div>
                <button
                    onClick={() => window.history.back()}
                    className="lp-btn-primary"
                    style={{ marginTop: "1rem" }}
                >
                    Go Back
                </button>
            </div>
        );
    }

    return <>{children}</>;
};


// import React, { useEffect, useState } from "react";
// import { Navigate, useLocation } from "react-router-dom";
// import { ShieldAlert } from "lucide-react";
// import { useStore } from "../store/useStore";
// import { SignatureSetupModal } from "../components/auth/SignatureSetupModal";
// import { auth } from "../lib/firebase";
// import { VerifyEmail } from "../components/auth/VerifyEmail";

// interface Props {
//     children: React.ReactNode;
//     allowedRoles: string[];
//     requireSuperAdmin?: boolean; // Strict Super Admin Flag
// }

// export const RoleProtectedRoute: React.FC<Props> = ({
//     children,
//     allowedRoles,
//     requireSuperAdmin = false,
// }) => {
//     const { user, loading } = useStore();
//     const location = useLocation();
//     const [isFirebaseAuthLoaded, setIsFirebaseAuthLoaded] = useState(false);

//     useEffect(() => {
//         const unsubscribe = auth.onAuthStateChanged(() => {
//             setIsFirebaseAuthLoaded(true);
//         });
//         return () => unsubscribe();
//     }, []);

//     if (loading || !isFirebaseAuthLoaded)
//         return (
//             <div
//                 className="ap-fullscreen"
//                 style={{
//                     position: "absolute",
//                     left: 0,
//                     right: 0,
//                     bottom: 0,
//                     top: 0,
//                     backgroundColor: "var(--mlab-bg)",
//                 }}
//             >
//                 <div
//                     style={{
//                         textAlign: "center",
//                         display: "flex",
//                         flexDirection: "column",
//                         alignItems: "center",
//                         gap: "1rem",
//                     }}
//                 >
//                     <div
//                         style={{
//                             width: "40px",
//                             height: "40px",
//                             border: "4px solid var(--mlab-light-blue)",
//                             borderTopColor: "var(--mlab-blue)",
//                             borderRadius: "50%",
//                             animation: "spin 1s linear infinite",
//                         }}
//                     />
//                     <span
//                         style={{
//                             fontFamily: "var(--font-heading)",
//                             fontSize: "0.8rem",
//                             letterSpacing: "0.14em",
//                             textTransform: "uppercase",
//                             color: "var(--mlab-grey)",
//                         }}
//                     >
//                         Verifying Access...
//                     </span>
//                 </div>
//                 <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
//             </div>
//         );

//     if (!user || !auth.currentUser)
//         return <Navigate to="/login" state={{ from: location }} replace />;

//     if (auth.currentUser.emailVerified === false) {
//         return (
//             <VerifyEmail>
//                 <div />
//             </VerifyEmail>
//         );
//     }

//     const requiresSignature = [
//         "facilitator",
//         "assessor",
//         "moderator",
//         "mentor",
//         "learner",
//     ].includes(user.role);
//     if (requiresSignature && !user.signatureUrl) {
//         return (
//             <SignatureSetupModal
//                 userUid={user.uid}
//                 onComplete={() => window.location.reload()}
//             />
//         );
//     }

//     const d = (user as any).demographics || {};
//     const hasLearnerEquity = !!d.equityCode;
//     const hasLearnerProvince = !!d.provinceCode;
//     const hasLearnerStatssa = !!d.statssaAreaCode || !!d.statsaaAreaCode;
//     const hasLearnerTitle = !!d.learnerTitle;

//     const isLearnerFullyCompliant =
//         user.profileCompleted === true &&
//         hasLearnerEquity &&
//         hasLearnerProvince &&
//         hasLearnerStatssa &&
//         hasLearnerTitle;
//     const hasStaffProvince = !!(user as any).province;
//     const isStaffFullyCompliant =
//         user.profileCompleted === true && hasStaffProvince;

//     if (
//         user.role === "learner" &&
//         !isLearnerFullyCompliant &&
//         location.pathname !== "/setup-profile"
//     )
//         return <Navigate to="/setup-profile" replace />;
//     if (
//         user.role === "assessor" &&
//         !isStaffFullyCompliant &&
//         location.pathname !== "/setup-assessor"
//     )
//         return <Navigate to="/setup-assessor" replace />;
//     if (
//         user.role === "moderator" &&
//         !isStaffFullyCompliant &&
//         location.pathname !== "/setup-moderator"
//     )
//         return <Navigate to="/setup-moderator" replace />;
//     if (
//         user.role === "facilitator" &&
//         !isStaffFullyCompliant &&
//         location.pathname !== "/setup-facilitator"
//     )
//         return <Navigate to="/setup-facilitator" replace />;
//     if (
//         user.role === "mentor" &&
//         !isStaffFullyCompliant &&
//         location.pathname !== "/setup-mentor"
//     )
//         return <Navigate to="/setup-mentor" replace />;
//     if (
//         user.role === "admin" &&
//         !user.profileCompleted &&
//         location.pathname !== "/setup-admin" &&
//         location.pathname !== "/admin/profile"
//     )
//         return <Navigate to="/setup-admin" replace />;

//     // SUPER ADMIN CHECK
//     // If the route requires a Super Admin, check if the user has the explicit flag
//     if (requireSuperAdmin && (user as any).isSuperAdmin !== true) {
//         return (
//             <div
//                 style={{
//                     height: "100vh",
//                     display: "flex",
//                     justifyContent: "center",
//                     alignItems: "center",
//                     flexDirection: "column",
//                     gap: "1rem",
//                     color: "var(--mlab-blue)",
//                     position: "absolute",
//                     top: 0,
//                     left: 0,
//                     right: 0,
//                     bottom: 0,
//                     background: "var(--mlab-bg)",
//                     fontFamily: "var(--font-body)",
//                 }}
//             >
//                 <ShieldAlert size={64} color="#ef4444" />
//                 <h2
//                     style={{
//                         fontFamily: "var(--font-heading)",
//                         textTransform: "uppercase",
//                         margin: 0,
//                         fontSize: "2rem",
//                     }}
//                 >
//                     Super Admin Only
//                 </h2>
//                 <div
//                     style={{
//                         background: "white",
//                         padding: "1.5rem",
//                         borderRadius: "8px",
//                         border: "1px solid #e2e8f0",
//                         textAlign: "center",
//                         maxWidth: "400px",
//                     }}
//                 >
//                     <p style={{ margin: "0 0 0.5rem 0" }}>
//                         Logged in as:{" "}
//                         <strong
//                             style={{ textTransform: "uppercase", color: "var(--mlab-grey)" }}
//                         >
//                             Standard {user.role}
//                         </strong>
//                     </p>
//                     <p
//                         style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}
//                     >
//                         This module contains critical platform infrastructure and is
//                         restricted to Platform Owners / Super Admins.
//                     </p>
//                 </div>
//                 <button
//                     onClick={() => window.history.back()}
//                     className="lp-btn-primary"
//                     style={{ marginTop: "1rem" }}
//                 >
//                     Go Back
//                 </button>
//             </div>
//         );
//     }

//     const hasAccess = allowedRoles.includes(user.role) || user.role === "admin";

//     if (!hasAccess) {
//         return (
//             <div
//                 style={{
//                     height: "100vh",
//                     display: "flex",
//                     justifyContent: "center",
//                     alignItems: "center",
//                     flexDirection: "column",
//                     gap: "1rem",
//                     color: "var(--mlab-blue)",
//                     position: "absolute",
//                     top: 0,
//                     left: 0,
//                     right: 0,
//                     bottom: 0,
//                     background: "var(--mlab-bg)",
//                     fontFamily: "var(--font-body)",
//                 }}
//             >
//                 <ShieldAlert size={64} color="#ef4444" />
//                 <h2
//                     style={{
//                         fontFamily: "var(--font-heading)",
//                         textTransform: "uppercase",
//                         margin: 0,
//                         fontSize: "2rem",
//                     }}
//                 >
//                     Access Denied
//                 </h2>
//                 <div
//                     style={{
//                         background: "white",
//                         padding: "1.5rem",
//                         borderRadius: "8px",
//                         border: "1px solid #e2e8f0",
//                         textAlign: "center",
//                     }}
//                 >
//                     <p style={{ margin: "0 0 0.5rem 0" }}>
//                         Logged in as:{" "}
//                         <strong
//                             style={{
//                                 textTransform: "uppercase",
//                                 color: "var(--mlab-green-dark)",
//                             }}
//                         >
//                             {user.role}
//                         </strong>
//                     </p>
//                     <p
//                         style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}
//                     >
//                         You do not have permission to view this page.
//                     </p>
//                 </div>
//                 <button
//                     onClick={() => window.history.back()}
//                     className="lp-btn-primary"
//                     style={{ marginTop: "1rem" }}
//                 >
//                     Go Back
//                 </button>
//             </div>
//         );
//     }

//     return <>{children}</>;
// };

// // import React, { useEffect, useState } from 'react';
// // import { Navigate, useLocation } from 'react-router-dom';
// // import { AlertTriangle } from 'lucide-react';
// // import { useStore } from '../store/useStore';
// // import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';
// // import { auth } from '../lib/firebase';
// // import { VerifyEmail } from '../components/auth/VerifyEmail';

// // interface Props {
// //     children: React.ReactNode;
// //     allowedRoles: string[];
// // }

// // export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
// //     const { user, loading } = useStore();
// //     const location = useLocation();

// //     // We add a tiny state to track if Firebase Auth has synced with our component
// //     const [isFirebaseAuthLoaded, setIsFirebaseAuthLoaded] = useState(false);

// //     useEffect(() => {
// //         // This listener ensures we don't render gatekeepers until Firebase Auth gives us the true user object
// //         const unsubscribe = auth.onAuthStateChanged(() => {
// //             setIsFirebaseAuthLoaded(true);
// //         });
// //         return () => unsubscribe();
// //     }, []);

// //     // WHILE LOADING: Prevent UI flicker
// //     if (loading || !isFirebaseAuthLoaded) return (
// //         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: '#f8fafc' }}>
// //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '40vh' }}>
// //                 <div className="ap-spinner" style={{ width: '40px', height: '40px', border: '4px solid #bae6fd', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
// //                 <span style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>Securing Session...</span>
// //             </div>
// //             <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
// //         </div>
// //     );

// //     // NO USER: Redirect to login
// //     if (!user || !auth.currentUser) {
// //         return <Navigate to="/login" state={{ from: location }} replace />;
// //     }

// //     // BULLETPROOF EMAIL VERIFICATION GATEKEEPER
// //     // If the user's Firebase Auth profile is NOT verified, trap them here permanently.
// //     if (auth.currentUser.emailVerified === false) {
// //         return (
// //             <VerifyEmail>
// //                 <div /> {/* Render absolutely nothing if they bypass the Verify UI */}
// //             </VerifyEmail>
// //         );
// //     }

// //     // SIGNATURE CHECK (Staff AND Learners)
// //     const requiresSignature = ['facilitator', 'assessor', 'moderator', 'mentor', 'learner'].includes(user.role);

// //     if (requiresSignature && !user.signatureUrl) {
// //         return (
// //             <SignatureSetupModal
// //                 userUid={user.uid}
// //                 onComplete={() => window.location.reload()}
// //             />
// //         );
// //     }

// //     // DEEP KYC CHECKS
// //     const d = (user as any).demographics || {};

// //     // STRICT QCTO COMPLIANCE GATEKEEPER FOR LEARNERS
// //     const hasLearnerEquity = !!d.equityCode;
// //     // const hasTest = !!d?.test;
// //     const hasLearnerProvince = !!d.provinceCode;
// //     const hasLearnerStatssa = !!d.statssaAreaCode || !!d.statsaaAreaCode;
// //     const hasLearnerTitle = !!d.learnerTitle;

// //     const isLearnerFullyCompliant = user.profileCompleted === true
// //         && hasLearnerEquity
// //         // && hasTest
// //         && hasLearnerProvince
// //         && hasLearnerStatssa
// //         && hasLearnerTitle;

// //     // Staff/Admin Check
// //     const hasStaffProvince = !!(user as any).province;
// //     const isStaffFullyCompliant = user.profileCompleted === true && hasStaffProvince;

// //     // THE LEARNER GATEKEEPER
// //     if (
// //         user.role === 'learner' &&
// //         !isLearnerFullyCompliant &&
// //         location.pathname !== '/setup-profile'
// //     ) {
// //         return <Navigate to="/setup-profile" replace />;
// //     }

// //     // THE ASSESSOR GATEKEEPER
// //     if (
// //         user.role === 'assessor' &&
// //         !isStaffFullyCompliant &&
// //         location.pathname !== '/setup-assessor'
// //     ) {
// //         return <Navigate to="/setup-assessor" replace />;
// //     }

// //     // THE MODERATOR GATEKEEPER
// //     if (
// //         user.role === 'moderator' &&
// //         !isStaffFullyCompliant &&
// //         location.pathname !== '/setup-moderator'
// //     ) {
// //         return <Navigate to="/setup-moderator" replace />;
// //     }

// //     // THE FACILITATOR GATEKEEPER
// //     if (
// //         user.role === 'facilitator' &&
// //         !isStaffFullyCompliant &&
// //         location.pathname !== '/setup-facilitator'
// //     ) {
// //         return <Navigate to="/setup-facilitator" replace />;
// //     }

// //     // THE MENTOR GATEKEEPER
// //     if (
// //         user.role === 'mentor' &&
// //         !isStaffFullyCompliant &&
// //         location.pathname !== '/setup-mentor'
// //     ) {
// //         return <Navigate to="/setup-mentor" replace />;
// //     }

// //     // THE ADMIN GATEKEEPER
// //     if (
// //         user.role === 'admin' &&
// //         !isStaffFullyCompliant &&
// //         location.pathname !== '/setup-admin' &&
// //         location.pathname !== '/admin/profile'
// //     ) {
// //         return <Navigate to="/setup-admin" replace />;
// //     }

// //     // ROLE CHECK
// //     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

// //     if (!hasAccess) {
// //         return (
// //             <div style={{
// //                 height: '100vh', display: 'flex', justifyContent: 'center',
// //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e',
// //                 position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#f8fafc'
// //             }}>
// //                 <AlertTriangle size={48} color="#ef4444" />
// //                 <h2>Access Denied</h2>
// //                 <p>Logged in as: <strong style={{ textTransform: 'uppercase' }}>{user.role}</strong></p>
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

// //     // ALL CHECKS PASSED: Render the requested page
// //     return <>{children}</>;
// // };

// // // import React from 'react';
// // // import { Navigate, useLocation } from 'react-router-dom';
// // // import { AlertTriangle } from 'lucide-react';
// // // import { useStore } from '../store/useStore';
// // // import { SignatureSetupModal } from '../components/auth/SignatureSetupModal';

// // // interface Props {
// // //     children: React.ReactNode;
// // //     allowedRoles: string[];
// // // }

// // // export const RoleProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
// // //     const { user, loading } = useStore();
// // //     const location = useLocation();

// // //     // WHILE LOADING: Prevent UI flicker
// // //     if (loading) return (
// // //         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// // //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// // //                 <div className="ap-spinner" />
// // //                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Verifying Access...</span>
// // //             </div>
// // //         </div>
// // //     );

// // //     // NO USER: Redirect to login
// // //     if (!user) {
// // //         return <Navigate to="/login" state={{ from: location }} replace />;
// // //     }

// // //     // SIGNATURE CHECK (Staff AND Learners)
// // //     const requiresSignature = ['facilitator', 'assessor', 'moderator', 'mentor', 'learner'].includes(user.role);

// // //     if (requiresSignature && !user.signatureUrl) {
// // //         return (
// // //             <SignatureSetupModal
// // //                 userUid={user.uid}
// // //                 onComplete={() => window.location.reload()}
// // //             />
// // //         );
// // //     }

// // //     // DEEP KYC CHECKS
// // //     // Learner Check (Nested in demographics)
// // //     const d = (user as any).demographics || {};

// // //     // STRICT QCTO COMPLIANCE GATEKEEPER FOR LEARNERS
// // //     const hasLearnerEquity = !!d.equityCode;
// // //     const hasLearnerProvince = !!d.provinceCode;
// // //     const hasLearnerStatssa = !!d.statssaAreaCode || !!d.statsaaAreaCode; // Allow typo key for backwards compatibility
// // //     const hasLearnerTitle = !!d.learnerTitle;

// // //     const isLearnerFullyCompliant = user.profileCompleted === true
// // //         && hasLearnerEquity
// // //         && hasLearnerProvince
// // //         && hasLearnerStatssa
// // //         && hasLearnerTitle;

// // //     // Staff/Admin Check (Root level province added in the new updates)
// // //     const hasStaffProvince = !!(user as any).province;
// // //     const isStaffFullyCompliant = user.profileCompleted === true && hasStaffProvince;

// // //     // THE LEARNER GATEKEEPER
// // //     if (
// // //         user.role === 'learner' &&
// // //         !isLearnerFullyCompliant &&
// // //         location.pathname !== '/setup-profile'
// // //     ) {
// // //         console.warn("Learner QCTO compliance check failed. Redirecting to setup.");
// // //         return <Navigate to="/setup-profile" replace />;
// // //     }

// // //     // THE ASSESSOR GATEKEEPER
// // //     if (
// // //         user.role === 'assessor' &&
// // //         !isStaffFullyCompliant &&
// // //         location.pathname !== '/setup-assessor'
// // //     ) {
// // //         console.warn("Assessor compliance check failed. Redirecting to professional setup.");
// // //         return <Navigate to="/setup-assessor" replace />;
// // //     }

// // //     // THE MODERATOR GATEKEEPER
// // //     if (
// // //         user.role === 'moderator' &&
// // //         !isStaffFullyCompliant &&
// // //         location.pathname !== '/setup-moderator'
// // //     ) {
// // //         console.warn("Moderator compliance check failed. Redirecting to professional setup.");
// // //         return <Navigate to="/setup-moderator" replace />;
// // //     }

// // //     // THE FACILITATOR GATEKEEPER
// // //     if (
// // //         user.role === 'facilitator' &&
// // //         !isStaffFullyCompliant &&
// // //         location.pathname !== '/setup-facilitator'
// // //     ) {
// // //         console.warn("Facilitator compliance check failed. Redirecting to professional setup.");
// // //         return <Navigate to="/setup-facilitator" replace />;
// // //     }

// // //     // THE MENTOR GATEKEEPER
// // //     if (
// // //         user.role === 'mentor' &&
// // //         !isStaffFullyCompliant &&
// // //         location.pathname !== '/setup-mentor'
// // //     ) {
// // //         console.warn("Mentor compliance check failed. Redirecting to professional setup.");
// // //         return <Navigate to="/setup-mentor" replace />;
// // //     }

// // //     // THE ADMIN GATEKEEPER
// // //     if (
// // //         user.role === 'admin' &&
// // //         !isStaffFullyCompliant &&
// // //         location.pathname !== '/setup-admin' &&
// // //         location.pathname !== '/admin/profile'
// // //     ) {
// // //         console.warn("Admin compliance check failed. Redirecting to professional setup.");
// // //         return <Navigate to="/setup-admin" replace />;
// // //     }

// // //     // ROLE CHECK
// // //     const hasAccess = allowedRoles.includes(user.role) || user.role === 'admin';

// // //     if (!hasAccess) {
// // //         return (
// // //             <div style={{
// // //                 height: '100vh', display: 'flex', justifyContent: 'center',
// // //                 alignItems: 'center', flexDirection: 'column', gap: '1rem', color: '#073f4e',
// // //                 position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
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

// // //     // ALL CHECKS PASSED: Render the requested page
// // //     return <>{children}</>;
// // // };
