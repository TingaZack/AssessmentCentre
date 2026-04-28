// src/auth/RoleProtectedRoute.tsx

import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useStore } from "../store/useStore";
// UPDATED: Import from the common component folder
import { auth } from "../lib/firebase";
import { VerifyEmail } from "../components/auth/VerifyEmail";
import Loader from "../components/common/Loader/Loader";
import { SignatureSetupModal } from "../components/auth/SignatureSetupModal";

interface Props {
    children: React.ReactNode;
    allowedRoles: string[];
    requireSuperAdmin?: boolean;
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

    if (loading || !isFirebaseAuthLoaded) {
        return (
            <div className="ap-fullscreen" style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: "var(--mlab-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                    <div style={{ width: "40px", height: "40px", border: "4px solid var(--mlab-light-blue)", borderTopColor: "var(--mlab-blue)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <Loader message="Verifying Access..." fullScreen={false} />
                </div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!user || !auth.currentUser) return <Navigate to="/login" state={{ from: location }} replace />;

    const isTestAccount = auth.currentUser.email === "adlab@gmail.com";
    if (auth.currentUser.emailVerified === false && !isTestAccount) {
        return <VerifyEmail><div /></VerifyEmail>;
    }

    // --- SIGNATURE GATE ---
    const requiresSignature = ["facilitator", "assessor", "moderator", "mentor", "learner"].includes(user.role);
    if (requiresSignature && !user.signatureUrl) {
        return (
            <SignatureSetupModal
                userUid={user.uid}
                existingSignatureUrl={user.signatureUrl}
                onComplete={() => window.location.reload()}
            />
        );
    }

    // --- FRESH START COMPLIANCE CHECK ---
    const rawUploadedDocs = (user as any).uploadedDocuments;
    const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];
    const hasDoc = (docId: string) => uploadedDocs.some((doc: any) => doc.id === docId && typeof doc.url === 'string' && doc.url.trim() !== '');

    // 1. Learner Strict Check
    const d = (user as any).demographics || {};
    const isLearnerFullyCompliant =
        user.role === 'learner' &&
        user.profileCompleted === true &&
        !!d.equityCode && !!d.provinceCode && (!!d.statssaAreaCode || !!d.statsaaAreaCode) && !!d.learnerTitle &&
        hasDoc('id') && hasDoc('qual');

    // 2. Staff Strict Check
    const hasStaffProvince = !!(user as any).province;
    const isForeign = (user as any).nationalityType === 'Foreign National';
    const hasPermit = isForeign ? hasDoc('permit') : true;

    const checkStaffCompliance = () => {
        if (user.profileCompleted !== true) return false;

        switch (user.role) {
            case 'facilitator': return hasStaffProvince && hasDoc('id') && hasDoc('cv') && hasPermit;
            case 'assessor': return hasStaffProvince && hasDoc('id') && hasDoc('assessor_cert') && hasDoc('reg_letter') && hasPermit;
            case 'moderator': return hasStaffProvince && hasDoc('id') && hasDoc('moderator_cert') && hasDoc('reg_letter') && hasPermit;
            case 'admin':
                if ((user as any).isSuperAdmin) return true;
                return hasStaffProvince && hasDoc('id') && hasDoc('appointment') && hasPermit;
            case 'mentor': return hasStaffProvince;
            default: return true;
        }
    };

    const isStaffFullyCompliant = checkStaffCompliance();

    // --- REDIRECT GATES ---
    if (user.role === "learner" && !isLearnerFullyCompliant && location.pathname !== "/setup-profile") {
        return <Navigate to="/setup-profile" replace />;
    }

    if (user.role === "facilitator" && !isStaffFullyCompliant && location.pathname !== "/setup-facilitator") {
        return <Navigate to="/setup-facilitator" replace />;
    }

    if (user.role === "assessor" && !isStaffFullyCompliant && location.pathname !== "/setup-assessor") return <Navigate to="/setup-assessor" replace />;
    if (user.role === "moderator" && !isStaffFullyCompliant && location.pathname !== "/setup-moderator") return <Navigate to="/setup-moderator" replace />;
    if (user.role === "mentor" && !isStaffFullyCompliant && location.pathname !== "/setup-mentor") return <Navigate to="/setup-mentor" replace />;

    if (user.role === "admin" && !isStaffFullyCompliant && !location.pathname.startsWith("/setup-admin") && !location.pathname.startsWith("/admin/profile")) {
        return <Navigate to="/setup-admin" replace />;
    }

    // --- SUPER ADMIN LOCK ---
    if (requireSuperAdmin && (user as any).isSuperAdmin !== true) {
        return (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "var(--mlab-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", zIndex: 9999 }}>
                <ShieldAlert size={64} color="#ef4444" />
                <h2 style={{ fontFamily: "var(--font-heading)", textTransform: "uppercase", margin: 0, fontSize: "2rem", color: "var(--mlab-blue)" }}>Super Admin Only</h2>
                <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center", maxWidth: "400px" }}>
                    <p style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Logged in as: <strong style={{ textTransform: "uppercase", color: "var(--mlab-grey)" }}>Standard {user.role}</strong></p>
                    <p style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}>This module contains critical platform infrastructure and is restricted to Platform Owners / Super Admins.</p>
                </div>
                <button onClick={() => window.history.back()} className="lp-btn-primary" style={{ marginTop: "1rem" }}>Go Back</button>
            </div>
        );
    }

    // Generic Role Access Check
    const hasAccess = allowedRoles.includes(user.role) || user.role === "admin";
    if (!hasAccess) {
        return (
            <div className="ap-fullscreen" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "var(--mlab-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
                <ShieldAlert size={64} color="#ef4444" />
                <h2 style={{ fontFamily: "var(--font-heading)", textTransform: "uppercase", fontSize: "2rem" }}>Access Denied</h2>
                <button onClick={() => window.history.back()} className="lp-btn-primary">Go Back</button>
            </div>
        );
    }

    return <>{children}</>;
};



// // src/auth/RoleProtectedRoute.tsx

// import React, { useEffect, useState } from "react";
// import { Navigate, useLocation } from "react-router-dom";
// import { ShieldAlert } from "lucide-react";
// import { useStore } from "../store/useStore";
// import { SignatureSetupModal } from "../components/auth/SignatureSetupModal";
// import { auth } from "../lib/firebase";
// import { VerifyEmail } from "../components/auth/VerifyEmail";
// import Loader from "../components/common/Loader/Loader";

// interface Props {
//     children: React.ReactNode;
//     allowedRoles: string[];
//     requireSuperAdmin?: boolean;
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

//     if (loading || !isFirebaseAuthLoaded) {
//         return (
//             <div className="ap-fullscreen" style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: "var(--mlab-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
//                 <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
//                     <div style={{ width: "40px", height: "40px", border: "4px solid var(--mlab-light-blue)", borderTopColor: "var(--mlab-blue)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
//                     <Loader message="Verifying Access..." fullScreen={false} />
//                 </div>
//                 <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
//             </div>
//         );
//     }

//     if (!user || !auth.currentUser) return <Navigate to="/login" state={{ from: location }} replace />;

//     const isTestAccount = auth.currentUser.email === "adlab@gmail.com";
//     if (auth.currentUser.emailVerified === false && !isTestAccount) {
//         return <VerifyEmail><div /></VerifyEmail>;
//     }

//     const requiresSignature = ["facilitator", "assessor", "moderator", "mentor", "learner"].includes(user.role);
//     if (requiresSignature && !user.signatureUrl) {
//         return <SignatureSetupModal userUid={user.uid} onComplete={() => window.location.reload()} />;
//     }

//     // --- FRESH START COMPLIANCE CHECK ---
//     const rawUploadedDocs = (user as any).uploadedDocuments;
//     const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];
//     const hasDoc = (docId: string) => uploadedDocs.some((doc: any) => doc.id === docId && typeof doc.url === 'string' && doc.url.trim() !== '');

//     // 1. Learner Strict Check
//     const d = (user as any).demographics || {};
//     const isLearnerFullyCompliant =
//         user.role === 'learner' &&
//         user.profileCompleted === true &&
//         !!d.equityCode && !!d.provinceCode && (!!d.statssaAreaCode || !!d.statsaaAreaCode) && !!d.learnerTitle &&
//         hasDoc('id') && hasDoc('qual');

//     // 2. Staff Strict Check
//     const hasStaffProvince = !!(user as any).province;
//     const isForeign = (user as any).nationalityType === 'Foreign National';
//     const hasPermit = isForeign ? hasDoc('permit') : true;

//     const checkStaffCompliance = () => {
//         if (user.profileCompleted !== true) return false;

//         switch (user.role) {
//             case 'facilitator': return hasStaffProvince && hasDoc('id') && hasDoc('cv') && hasPermit;
//             case 'assessor': return hasStaffProvince && hasDoc('id') && hasDoc('assessor_cert') && hasDoc('reg_letter') && hasPermit;
//             case 'moderator': return hasStaffProvince && hasDoc('id') && hasDoc('moderator_cert') && hasDoc('reg_letter') && hasPermit;
//             case 'admin':
//                 if ((user as any).isSuperAdmin) return true;
//                 return hasStaffProvince && hasDoc('id') && hasDoc('appointment') && hasPermit;
//             case 'mentor': return hasStaffProvince;
//             default: return true;
//         }
//     };

//     const isStaffFullyCompliant = checkStaffCompliance();

//     // --- REDIRECT GATES ---
//     if (user.role === "learner" && !isLearnerFullyCompliant && location.pathname !== "/setup-profile") {
//         return <Navigate to="/setup-profile" replace />;
//     }

//     // Check Facilitator specifically
//     if (user.role === "facilitator" && !isStaffFullyCompliant && location.pathname !== "/setup-facilitator") {
//         return <Navigate to="/setup-facilitator" replace />;
//     }

//     if (user.role === "assessor" && !isStaffFullyCompliant && location.pathname !== "/setup-assessor") return <Navigate to="/setup-assessor" replace />;
//     if (user.role === "moderator" && !isStaffFullyCompliant && location.pathname !== "/setup-moderator") return <Navigate to="/setup-moderator" replace />;
//     if (user.role === "mentor" && !isStaffFullyCompliant && location.pathname !== "/setup-mentor") return <Navigate to="/setup-mentor" replace />;

//     if (user.role === "admin" && !isStaffFullyCompliant && !location.pathname.startsWith("/setup-admin") && !location.pathname.startsWith("/admin/profile")) {
//         return <Navigate to="/setup-admin" replace />;
//     }

//     // --- SUPER ADMIN LOCK ---
//     if (requireSuperAdmin && (user as any).isSuperAdmin !== true) {
//         return (
//             <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "var(--mlab-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", zIndex: 9999 }}>
//                 <ShieldAlert size={64} color="#ef4444" />
//                 <h2 style={{ fontFamily: "var(--font-heading)", textTransform: "uppercase", margin: 0, fontSize: "2rem", color: "var(--mlab-blue)" }}>Super Admin Only</h2>
//                 <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center", maxWidth: "400px" }}>
//                     <p style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Logged in as: <strong style={{ textTransform: "uppercase", color: "var(--mlab-grey)" }}>Standard {user.role}</strong></p>
//                     <p style={{ fontSize: "0.9rem", color: "var(--mlab-grey)", margin: 0 }}>This module contains critical platform infrastructure and is restricted to Platform Owners / Super Admins.</p>
//                 </div>
//                 <button onClick={() => window.history.back()} className="lp-btn-primary" style={{ marginTop: "1rem" }}>Go Back</button>
//             </div>
//         );
//     }

//     // 8. Generic Role Access Check
//     const hasAccess = allowedRoles.includes(user.role) || user.role === "admin";
//     if (!hasAccess) {
//         return (
//             <div className="ap-fullscreen" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "var(--mlab-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
//                 <ShieldAlert size={64} color="#ef4444" />
//                 <h2 style={{ fontFamily: "var(--font-heading)", textTransform: "uppercase", fontSize: "2rem" }}>Access Denied</h2>
//                 <button onClick={() => window.history.back()} className="lp-btn-primary">Go Back</button>
//             </div>
//         );
//     }

//     return <>{children}</>;
// };