// src/components/auth/ProtectedRoute.tsx

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useStore } from '../store/useStore';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const [firebaseUser, setFirebaseUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const storeUser = useStore((state: any) => state.user);
    const setUser = useStore((state: any) => state.setUser);

    useEffect(() => {
        // 🚀 REHYDRATE TEMPORARY AUDITOR SESSION ON RELOAD
        if (!storeUser) {
            const savedSession = sessionStorage.getItem('temp_auditor_session');
            if (savedSession) {
                try {
                    const parsed = JSON.parse(savedSession);
                    const expiry = new Date(parsed.expiresAt || 0).getTime();
                    if (parsed.isTemporaryAuditor && (expiry === 0 || Date.now() < expiry)) {
                        setUser(parsed);
                    } else {
                        sessionStorage.removeItem('temp_auditor_session');
                    }
                } catch {
                    sessionStorage.removeItem('temp_auditor_session');
                }
            }
        }

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setFirebaseUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="loader"></div>
            </div>
        );
    }

    const activeUser = storeUser || (() => {
        const saved = sessionStorage.getItem('temp_auditor_session');
        return saved ? JSON.parse(saved) : null;
    })();

    // Let Magic Link users through without a Firebase Auth session
    if (activeUser?.isTemporaryAuditor) {
        return <>{children}</>;
    }

    // Standard check for registered users
    if (!firebaseUser) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};


// // src/components/auth/ProtectedRoute.tsx

// import React, { useEffect, useState } from 'react';
// import { Navigate } from 'react-router-dom';
// import { onAuthStateChanged } from 'firebase/auth';
// import { auth } from '../lib/firebase';
// import { useStore } from '../store/useStore';

// interface ProtectedRouteProps {
//     children: React.ReactNode;
// }

// export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
//     const [firebaseUser, setFirebaseUser] = useState<any>(null);
//     const [loading, setLoading] = useState(true);

//     // Grab the local Zustand state to check for temporary auditor sessions
//     const storeUser = useStore((state: any) => state.user);

//     useEffect(() => {
//         const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
//             setFirebaseUser(currentUser);
//             setLoading(false);
//         });
//         return () => unsubscribe();
//     }, []);

//     if (loading) {
//         return (
//             <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
//                 <div className="loader"></div>
//             </div>
//         );
//     }

//     // Let Magic Link users through without a Firebase Auth session
//     if (storeUser?.isTemporaryAuditor) {
//         return <>{children}</>;
//     }

//     // Standard check for registered users
//     if (!firebaseUser) {
//         return <Navigate to="/login" replace />;
//     }

//     return <>{children}</>;
// };