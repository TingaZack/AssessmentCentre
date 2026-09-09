// src/auth/RoleProtectedRoute.tsx

import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useStore } from "../store/useStore";
import { auth, db } from "../lib/firebase";
import { VerifyEmail } from "../components/auth/VerifyEmail";
import Loader from "../components/common/Loader/Loader";
import { SignatureSetupModal } from "../components/auth/SignatureSetupModal";
import { StatusModal } from "../components/common/StatusModal/StatusModal";

interface Props {
    children: React.ReactNode;
    allowedRoles: string[];
    requireSuperAdmin?: boolean;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 72 Hours

export const RoleProtectedRoute: React.FC<Props> = ({
    children,
    allowedRoles,
    requireSuperAdmin = false,
}) => {
    const { user, loading } = useStore();
    const location = useLocation();
    const navigate = useNavigate();

    const [isFirebaseAuthLoaded, setIsFirebaseAuthLoaded] = useState(false);
    const [dismissedNotice, setDismissedNotice] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(() => {
            setIsFirebaseAuthLoaded(true);
        });
        return () => unsubscribe();
    }, []);

    const rawUploadedDocs = (user as any)?.uploadedDocuments;
    const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];
    const hasDoc = (docId: string) => uploadedDocs.some((doc: any) => doc.id === docId && typeof doc.url === 'string' && doc.url.trim() !== '');

    const d = (user as any)?.demographics || {};
    const isLearnerFullyCompliant =
        user?.role === 'learner' &&
        user?.profileCompleted === true &&
        !!d.equityCode &&
        !!d.provinceCode &&
        (!!d.statssaAreaCode || !!d.statsaaAreaCode) &&
        !!d.localMunicipality &&
        !!d.learnerTitle &&
        hasDoc('id') &&
        hasDoc('qual') &&
        hasDoc('poa');

    const firstShownAtRaw = (user as any)?.addressNoticeFirstShownAt;

    useEffect(() => {
        if (user?.uid && user.role === 'learner' && user.profileCompleted === true && !isLearnerFullyCompliant && !firstShownAtRaw) {
            updateDoc(doc(db, 'users', user.uid), {
                addressNoticeFirstShownAt: serverTimestamp()
            }).catch(console.error);
        }
    }, [user?.uid, user?.role, user?.profileCompleted, isLearnerFullyCompliant, firstShownAtRaw]);

    const getFirstShownAtMs = (): number | null => {
        if (!firstShownAtRaw) return null;
        if (typeof firstShownAtRaw.toMillis === 'function') return firstShownAtRaw.toMillis();
        if (firstShownAtRaw.seconds) return firstShownAtRaw.seconds * 1000;
        const parsed = new Date(firstShownAtRaw).getTime();
        return isNaN(parsed) ? null : parsed;
    };

    const firstShownAtMs = getFirstShownAtMs();
    const currentNow = Date.now();

    const isClockTampered = firstShownAtMs !== null && currentNow < firstShownAtMs;
    const isGracePeriodExpired = firstShownAtMs !== null && (
        (currentNow - firstShownAtMs > THREE_DAYS_MS) || isClockTampered
    );

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

    const requiresSignature = ["facilitator", "assistant_facilitator", "assessor", "moderator", "mentor", "learner"].includes(user.role);
    if (requiresSignature && !user.signatureUrl) {
        return (
            <SignatureSetupModal
                userUid={user.uid}
                existingSignatureUrl={user.signatureUrl}
                onComplete={() => window.location.reload()}
            />
        );
    }

    const hasStaffProvince = !!(user as any).province;
    const isForeign = (user as any).nationalityType === 'Foreign National';
    const hasPermit = isForeign ? hasDoc('permit') : true;

    const checkStaffCompliance = () => {
        if (user.profileCompleted !== true) return false;

        switch (user.role) {
            case 'facilitator':
            case 'assistant_facilitator':
                return hasStaffProvince && hasDoc('id') && hasDoc('cv') && hasPermit;
            case 'assessor':
                return hasStaffProvince && hasDoc('id') && hasDoc('assessor_cert') && hasDoc('reg_letter') && hasPermit;
            case 'moderator':
                return hasStaffProvince && hasDoc('id') && hasDoc('moderator_cert') && hasDoc('reg_letter') && hasPermit;
            case 'admin':
            case 'assistant_admin':
                if ((user as any).isSuperAdmin) return true;
                const hasSignature = hasDoc('signature') || !!(user as any).signatureUrl;
                return hasStaffProvince && hasDoc('id') && hasDoc('appointment') && hasPermit && hasSignature;
            case 'mentor':
                return hasStaffProvince;
            default:
                return true;
        }
    };

    const isStaffFullyCompliant = checkStaffCompliance();

    if (user.role === "learner" && !isLearnerFullyCompliant && location.pathname !== "/setup-profile") {
        if (!user.profileCompleted) {
            return <Navigate to="/setup-profile" replace />;
        }

        if (isGracePeriodExpired) {
            return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.85)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
                    <StatusModal
                        type="warning"
                        title="3-Day Grace Period Expired"
                        message={isClockTampered
                            ? "System clock inconsistency detected. Please complete your residential address verification and Proof of Address upload to proceed."
                            : "Your 3-day grace period to verify your residential address and upload your Proof of Address document has expired. Please complete this step now to access your portal."
                        }
                        confirmText="Verify Address & Upload POA"
                        onClose={() => navigate("/setup-profile", { replace: true })}
                    />
                </div>
            );
        }

        if (!dismissedNotice) {
            return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.8)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
                    <StatusModal
                        type="info"
                        title="Compliance Action Required"
                        message="To align with updated QCTO & SETA regulatory standards, your profile requires a brief verification of your residential address, local municipality, and Proof of Address document. You have 3 days to complete this."
                        confirmText="Verify Now"
                        cancelText="Do It Later"
                        onClose={() => navigate("/setup-profile")}
                        onCancel={() => setDismissedNotice(true)}
                    />
                </div>
            );
        }
    }

    if ((user.role === "facilitator" || user.role === "assistant_facilitator") && !isStaffFullyCompliant && location.pathname !== "/setup-facilitator") {
        return <Navigate to="/setup-facilitator" replace />;
    }

    if (user.role === "assessor" && !isStaffFullyCompliant && location.pathname !== "/setup-assessor") return <Navigate to="/setup-assessor" replace />;
    if (user.role === "moderator" && !isStaffFullyCompliant && location.pathname !== "/setup-moderator") return <Navigate to="/setup-moderator" replace />;
    if (user.role === "mentor" && !isStaffFullyCompliant && location.pathname !== "/setup-mentor") return <Navigate to="/setup-mentor" replace />;

    if ((user.role === "admin" || user.role === "assistant_admin") && !isStaffFullyCompliant && !location.pathname.startsWith("/setup-admin") && !location.pathname.startsWith("/admin/profile")) {
        return <Navigate to="/setup-admin" replace />;
    }

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

    // 🚀 ENHANCED ROLE ACCESS CHECK (Includes Secondary Roles & SuperAdmin)
    const secondaryRoles = Array.isArray((user as any)?.secondaryRoles) ? (user as any).secondaryRoles : [];
    const hasAccess =
        allowedRoles.includes(user.role) ||
        user.role === "admin" ||
        user.role === "assistant_admin" ||
        (user as any)?.isSuperAdmin === true ||
        secondaryRoles.some((r: string) => allowedRoles.includes(r));

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