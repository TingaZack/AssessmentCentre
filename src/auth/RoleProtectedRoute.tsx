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
import { getRequiredSetupPath } from "./compliance";

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

    const setupPath = getRequiredSetupPath(user);
    if (setupPath && location.pathname !== setupPath && !location.pathname.startsWith("/admin/profile")) {
        return <Navigate to={setupPath} replace />;
    }

    // --- SUPER ADMIN LOCK ---
    if (requireSuperAdmin && user.isSuperAdmin !== true) {
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
