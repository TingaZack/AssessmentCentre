import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useStore } from './store/useStore';

// --- TYPES ---
import type { UserProfile, UserRole } from './types/auth.types';

// --- PAGES & COMPONENTS ---
import Login from './pages/Login/Login';
import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
import { auth, db } from './lib/firebase';

// Admin
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';

// Staff (Facilitator, Assessor, Moderator)
import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';

// Compliance & Profile Setup Gates
import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';
import { FacilitatorProfileSetup } from './pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup';
import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

// Learner & Public
import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
import PublicVerification from './pages/LearnerPortal/PublicVerification';
import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
import { ModeratorProfileSetup } from './pages/FacilitatorDashboard/ModeratorProfileSetup/ModeratorProfileSetup';
import { ModeratorDashboard } from './pages/FacilitatorDashboard/ModeratorDashboard/ModeratorDashboard';

// --- PLACEHOLDER DASHBOARDS ---
// const ModerationDashboard = () => (
//   <div style={{ padding: '2rem', textAlign: 'center' }}>
//     <h1 style={{ color: '#16a34a', fontFamily: 'Oswald, sans-serif' }}>🟢 Moderation Room</h1>
//     <p>Sample graded scripts and perform quality assurance validation.</p>
//   </div>
// );

// --- 🚦 TRAFFIC CONTROLLER ---
const RootRedirect = () => {
  const user = useStore((state) => state.user);
  const loading = useStore((state) => state.loading);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Oswald' }}>SYNCING SESSION...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // 🛡️ QCTO GATEKEEPERS

  // 1. Learner Gate
  if (user.role === 'learner' && user.profileCompleted !== true) {
    return <Navigate to="/setup-profile" replace />;
  }

  // 2. Assessor Gate
  if (user.role === 'assessor' && user.profileCompleted !== true) {
    return <Navigate to="/setup-assessor" replace />;
  }

  // 3. Moderator Gate
  if (user.role === 'moderator' && user.profileCompleted !== true) {
    return <Navigate to="/setup-moderator" replace />;
  }

  // 4. Facilitator Gate
  if (user.role === 'facilitator' && user.profileCompleted !== true) {
    return <Navigate to="/setup-facilitator" replace />;
  }

  // Master Routing Switch
  switch (user.role) {
    case 'admin': return <Navigate to="/admin" replace />;
    case 'facilitator': return <Navigate to="/facilitator" replace />;
    case 'assessor': return <Navigate to="/marking" replace />;
    case 'moderator': return <Navigate to="/moderation" replace />;
    case 'learner': return <Navigate to="/portal" replace />;
    default: return <Navigate to="/login" replace />;
  }
};

function App() {
  const setUser = useStore((state) => state.setUser);
  const setLoading = useStore((state) => state.setLoading);
  const user = useStore((state) => state.user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();

            // Explicitly map required properties to satisfy UserProfile interface,
            // then use spread operator (...data) to pull in all custom QCTO fields.
            const userProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || data.email || '',
              fullName: data.fullName || 'Practitioner',
              role: data.role as UserRole,
              profilePhotoUrl: data.profilePhotoUrl || '',
              ...data, // Pulls in bio, assessorRegNumber, complianceDocs, etc.
              profileCompleted: data.profileCompleted === true,
            };

            setUser(userProfile);
          }
        } catch (e) {
          console.error("Auth Sync Error:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* ================= PUBLIC ROUTES ================= */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/verify" element={<PublicVerification />} />

          {/* ================= ONBOARDING GATES ================= */}
          {/* Mandatory KYC for Learners */}
          <Route path="/setup-profile" element={
            <RoleProtectedRoute allowedRoles={['learner']}>
              <LearnerProfileSetup />
            </RoleProtectedRoute>
          } />

          {/* Mandatory Compliance for Assessors */}
          <Route path="/setup-assessor" element={
            <RoleProtectedRoute allowedRoles={['assessor']}>
              <AssessorProfileSetup />
            </RoleProtectedRoute>
          } />

          {/* Mandatory Compliance for Moderators */}
          <Route path="/setup-moderator" element={
            <RoleProtectedRoute allowedRoles={['moderator']}>
              <ModeratorProfileSetup />
            </RoleProtectedRoute>
          } />

          {/* Mandatory Compliance for Facilitators */}
          <Route path="/setup-facilitator" element={
            <RoleProtectedRoute allowedRoles={['facilitator']}>
              <FacilitatorProfileSetup />
            </RoleProtectedRoute>
          } />

          {/* ================= PROTECTED ROUTES ================= */}

          {/* 1. LEARNER PORTAL */}
          <Route path="/portal" element={
            <RoleProtectedRoute allowedRoles={['learner']}>
              <LearnerDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/learner/assessment/:assessmentId" element={
            <RoleProtectedRoute allowedRoles={['learner']}>
              <AssessmentPlayer />
            </RoleProtectedRoute>
          } />

          {/* 2. ADMIN CONSOLE */}
          <Route path="/admin" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </RoleProtectedRoute>
          } />

          {/* 3. FACILITATOR SUITE */}
          <Route path="/facilitator" element={
            <RoleProtectedRoute allowedRoles={['facilitator']}>
              <FacilitatorLayout />
            </RoleProtectedRoute>
          }>
            <Route index element={<FacilitatorDashboard />} />
            <Route path="dashboard" element={<FacilitatorDashboard />} />
            <Route path="profile" element={<FacilitatorDashboard />} />
            <Route path="attendance" element={<FacilitatorDashboard />} />
            <Route path="attendance/:cohortId" element={<AttendancePage />} />
            <Route path="assessments" element={<AssessmentManager />} />
            <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
          </Route>

          {/* 4. SHARED STAFF & AUDIT VIEWS */}
          <Route path="/admin/assessment/preview/:assessmentId" element={
            <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
              <AssessmentPreview />
            </RoleProtectedRoute>
          } />

          <Route path="/cohorts/:cohortId" element={
            <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
              <CohortDetailsPage />
            </RoleProtectedRoute>
          } />

          <Route path="/sor/:id" element={
            <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
              <ViewPortfolio />
            </RoleProtectedRoute>
          } />

          {/* Audited Grading Interface */}
          <Route path="/portfolio/submission/:submissionId" element={
            <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
              <SubmissionReview />
            </RoleProtectedRoute>
          } />

          {/* 5. ASSESSOR (Marking Centre) */}
          <Route path="/marking/*" element={
            <RoleProtectedRoute allowedRoles={['assessor']}>
              <AssessorDashboard />
            </RoleProtectedRoute>
          } />

          {/* 6. MODERATOR (QA & Endorsement) */}
          <Route path="/moderation/*" element={
            <RoleProtectedRoute allowedRoles={['moderator']}>
              <ModeratorDashboard />
            </RoleProtectedRoute>
          } />

          {/* ================= FALLBACKS ================= */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;


// import React, { useEffect } from 'react';
// import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { onAuthStateChanged } from 'firebase/auth';
// import { doc, getDoc } from 'firebase/firestore';
// import { useStore } from './store/useStore';

// // --- TYPES ---
// import type { UserProfile, UserRole } from './types/auth.types';

// // --- PAGES & COMPONENTS ---
// import Login from './pages/Login/Login';
// import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// import { auth, db } from './lib/firebase';

// // Admin
// import AdminDashboard from './pages/AdminDashboard/AdminDashboard';

// // Facilitator & Assessor
// import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager/AssessmentManager';
// import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';
// import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';
// import { FacilitatorProfileSetup } from './pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup';

// // Learner & Public
// import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// import PublicVerification from './pages/LearnerPortal/PublicVerification';
// import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
// import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // --- PLACEHOLDER DASHBOARDS ---
// const ModerationDashboard = () => (
//   <div style={{ padding: '2rem', textAlign: 'center' }}>
//     <h1 style={{ color: '#16a34a', fontFamily: 'Oswald, sans-serif' }}>🟢 Moderation Room</h1>
//     <p>Sample graded scripts and perform quality assurance validation.</p>
//   </div>
// );

// // --- 🚦 TRAFFIC CONTROLLER ---
// const RootRedirect = () => {
//   const user = useStore((state) => state.user);
//   const loading = useStore((state) => state.loading);

//   if (loading) return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Oswald' }}>SYNCING SESSION...</div>;
//   if (!user) return <Navigate to="/login" replace />;

//   // 🛡️ QCTO GATEKEEPERS

//   // 1. Learner Gate
//   if (user.role === 'learner' && user.profileCompleted !== true) {
//     return <Navigate to="/setup-profile" replace />;
//   }

//   // 2. Practitioner Gate (Assessors & Moderators)
//   const isPractitioner = user.role === 'assessor' || user.role === 'moderator';
//   if (isPractitioner && user.profileCompleted !== true) {
//     return <Navigate to="/setup-practitioner" replace />;
//   }

//   // 3. Facilitator Gate
//   if (user.role === 'facilitator' && user.profileCompleted !== true) {
//     return <Navigate to="/setup-facilitator" replace />;
//   }

//   switch (user.role) {
//     case 'admin': return <Navigate to="/admin" replace />;
//     case 'facilitator': return <Navigate to="/facilitator" replace />;
//     case 'assessor': return <Navigate to="/marking" replace />;
//     case 'moderator': return <Navigate to="/moderation" replace />;
//     case 'learner': return <Navigate to="/portal" replace />;
//     default: return <Navigate to="/login" replace />;
//   }
// };

// function App() {
//   const setUser = useStore((state) => state.setUser);
//   const setLoading = useStore((state) => state.setLoading);
//   const user = useStore((state) => state.user);

//   useEffect(() => {
//     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (firebaseUser) {
//         try {
//           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
//           if (userDoc.exists()) {
//             const data = userDoc.data();

//             // Explicitly map required properties to satisfy UserProfile interface,
//             // then use spread operator (...data) to pull in all custom QCTO fields.
//             const userProfile: UserProfile = {
//               uid: firebaseUser.uid,
//               email: firebaseUser.email || data.email || '',
//               fullName: data.fullName || 'Practitioner',
//               role: data.role as UserRole,
//               profilePhotoUrl: data.profilePhotoUrl || '',
//               ...data, // Pulls in bio, assessorRegNumber, complianceDocs, etc.
//               profileCompleted: data.profileCompleted === true,
//             };

//             setUser(userProfile);
//           }
//         } catch (e) {
//           console.error("Auth Sync Error:", e);
//         }
//       } else {
//         setUser(null);
//       }
//       setLoading(false);
//     });

//     return () => unsubscribe();
//   }, [setUser, setLoading]);

//   return (
//     <Router>
//       <div className="App">
//         <Routes>
//           {/* ================= PUBLIC ROUTES ================= */}
//           <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
//           <Route path="/verify" element={<PublicVerification />} />

//           {/* ================= ONBOARDING GATES ================= */}
//           {/* Mandatory KYC for Learners */}
//           <Route path="/setup-profile" element={
//             <RoleProtectedRoute allowedRoles={['learner']}>
//               <LearnerProfileSetup />
//             </RoleProtectedRoute>
//           } />

//           {/* Mandatory Compliance for Assessors/Moderators */}
//           <Route path="/setup-practitioner" element={
//             <RoleProtectedRoute allowedRoles={['assessor', 'moderator']}>
//               <AssessorProfileSetup />
//             </RoleProtectedRoute>
//           } />

//           {/* Mandatory Compliance for Facilitators */}
//           <Route path="/setup-facilitator" element={
//             <RoleProtectedRoute allowedRoles={['facilitator']}>
//               <FacilitatorProfileSetup />
//             </RoleProtectedRoute>
//           } />

//           {/* ================= PROTECTED ROUTES ================= */}

//           {/* 1. LEARNER PORTAL */}
//           <Route path="/portal" element={
//             <RoleProtectedRoute allowedRoles={['learner']}>
//               <LearnerDashboard />
//             </RoleProtectedRoute>
//           } />

//           <Route path="/learner/assessment/:assessmentId" element={
//             <RoleProtectedRoute allowedRoles={['learner']}>
//               <AssessmentPlayer />
//             </RoleProtectedRoute>
//           } />

//           {/* 2. ADMIN CONSOLE */}
//           <Route path="/admin" element={
//             <RoleProtectedRoute allowedRoles={['admin']}>
//               <AdminDashboard />
//             </RoleProtectedRoute>
//           } />

//           {/* 3. FACILITATOR SUITE */}
//           <Route path="/facilitator" element={
//             <RoleProtectedRoute allowedRoles={['facilitator']}>
//               <FacilitatorLayout />
//             </RoleProtectedRoute>
//           }>
//             <Route index element={<FacilitatorDashboard />} />
//             <Route path="dashboard" element={<FacilitatorDashboard />} />
//             <Route path="profile" element={<FacilitatorDashboard />} />
//             <Route path="attendance" element={<FacilitatorDashboard />} />
//             <Route path="attendance/:cohortId" element={<AttendancePage />} />
//             <Route path="assessments" element={<AssessmentManager />} />
//             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
//           </Route>

//           {/* 4. SHARED STAFF & AUDIT VIEWS */}
//           <Route path="/admin/assessment/preview/:assessmentId" element={
//             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
//               <AssessmentPreview />
//             </RoleProtectedRoute>
//           } />

//           <Route path="/cohorts/:cohortId" element={
//             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
//               <CohortDetailsPage />
//             </RoleProtectedRoute>
//           } />

//           <Route path="/sor/:id" element={
//             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
//               <ViewPortfolio />
//             </RoleProtectedRoute>
//           } />

//           {/* Audited Grading Interface */}
//           <Route path="/portfolio/submission/:submissionId" element={
//             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
//               <SubmissionReview />
//             </RoleProtectedRoute>
//           } />

//           {/* 5. ASSESSOR (Marking Centre) */}
//           <Route path="/marking/*" element={
//             <RoleProtectedRoute allowedRoles={['assessor']}>
//               <AssessorDashboard />
//             </RoleProtectedRoute>
//           } />

//           {/* 6. MODERATOR (QA & Endorsement) */}
//           <Route path="/moderation/*" element={
//             <RoleProtectedRoute allowedRoles={['moderator']}>
//               <ModerationDashboard />
//             </RoleProtectedRoute>
//           } />

//           {/* ================= FALLBACKS ================= */}
//           <Route path="/" element={<RootRedirect />} />
//           <Route path="*" element={<RootRedirect />} />

//         </Routes>
//       </div>
//     </Router>
//   );
// }

// export default App;


// // import React, { useEffect } from 'react';
// // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // import { onAuthStateChanged } from 'firebase/auth';
// // import { doc, getDoc } from 'firebase/firestore';
// // import { useStore } from './store/useStore';

// // // --- TYPES ---
// // import type { UserProfile, UserRole } from './types/auth.types';

// // // --- PAGES & COMPONENTS ---
// // import Login from './pages/Login/Login';
// // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // import { auth, db } from './lib/firebase';

// // // Admin
// // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // // Facilitator & Assessor
// // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// // import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// // import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';
// // import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';

// // // Learner & Public
// // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// // import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

// // // --- PLACEHOLDER DASHBOARDS ---
// // const ModerationDashboard = () => (
// //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// //     <h1 style={{ color: '#16a34a', fontFamily: 'Oswald, sans-serif' }}>🟢 Moderation Room</h1>
// //     <p>Sample graded scripts and perform quality assurance validation.</p>
// //   </div>
// // );

// // // --- 🚦 TRAFFIC CONTROLLER ---
// // const RootRedirect = () => {
// //   const user = useStore((state) => state.user);
// //   const loading = useStore((state) => state.loading);

// //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Oswald' }}>SYNCING SESSION...</div>;
// //   if (!user) return <Navigate to="/login" replace />;

// //   // 🛡️ QCTO GATEKEEPERS

// //   // 1. Learner Gate
// //   if (user.role === 'learner' && user.profileCompleted !== true) {
// //     return <Navigate to="/setup-profile" replace />;
// //   }

// //   // 2. Practitioner Gate (Assessors & Moderators)
// //   const isPractitioner = user.role === 'assessor' || user.role === 'moderator';

// //   // 🚀 FIX: Relaxed the gatekeeper for testing. It now ONLY checks the boolean flag.
// //   // This prevents the infinite redirect loop if the user is missing a reg number in the DB.
// //   if (isPractitioner && user.profileCompleted !== true) {
// //     return <Navigate to="/setup-practitioner" replace />;
// //   }

// //   switch (user.role) {
// //     case 'admin': return <Navigate to="/admin" replace />;
// //     case 'facilitator': return <Navigate to="/facilitator" replace />;
// //     case 'assessor': return <Navigate to="/marking" replace />;
// //     case 'moderator': return <Navigate to="/moderation" replace />;
// //     case 'learner': return <Navigate to="/portal" replace />;
// //     default: return <Navigate to="/login" replace />;
// //   }
// // };

// // function App() {
// //   const setUser = useStore((state) => state.setUser);
// //   const setLoading = useStore((state) => state.setLoading);
// //   const user = useStore((state) => state.user);

// //   useEffect(() => {
// //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// //       if (firebaseUser) {
// //         try {
// //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// //           if (userDoc.exists()) {
// //             const data = userDoc.data();

// //             // 🚀 THE FIX: Explicitly map required properties to satisfy UserProfile interface,
// //             // then use spread operator (...data) to pull in all custom QCTO fields.
// //             const userProfile: UserProfile = {
// //               uid: firebaseUser.uid,
// //               email: firebaseUser.email || data.email || '',
// //               fullName: data.fullName || 'Practitioner',
// //               role: data.role as UserRole,
// //               profilePhotoUrl: data.profilePhotoUrl || '',
// //               ...data, // Pulls in bio, assessorRegNumber, complianceDocs, etc.
// //               profileCompleted: data.profileCompleted === true,
// //             };

// //             setUser(userProfile);
// //           }
// //         } catch (e) {
// //           console.error("Auth Sync Error:", e);
// //         }
// //       } else {
// //         setUser(null);
// //       }
// //       setLoading(false);
// //     });

// //     return () => unsubscribe();
// //   }, [setUser, setLoading]);

// //   return (
// //     <Router>
// //       <div className="App">
// //         <Routes>
// //           {/* ================= PUBLIC ROUTES ================= */}
// //           <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
// //           <Route path="/verify" element={<PublicVerification />} />

// //           {/* ================= ONBOARDING GATES ================= */}
// //           {/* Mandatory KYC for Learners */}
// //           <Route path="/setup-profile" element={
// //             <RoleProtectedRoute allowedRoles={['learner']}>
// //               <LearnerProfileSetup />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* Mandatory Compliance for Assessors/Moderators */}
// //           <Route path="/setup-practitioner" element={
// //             <RoleProtectedRoute allowedRoles={['assessor', 'moderator']}>
// //               <AssessorProfileSetup />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* ================= PROTECTED ROUTES ================= */}

// //           {/* 1. LEARNER PORTAL */}
// //           <Route path="/portal" element={
// //             <RoleProtectedRoute allowedRoles={['learner']}>
// //               <LearnerDashboard />
// //             </RoleProtectedRoute>
// //           } />

// //           <Route path="/learner/assessment/:assessmentId" element={
// //             <RoleProtectedRoute allowedRoles={['learner']}>
// //               <AssessmentPlayer />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* 2. ADMIN CONSOLE */}
// //           <Route path="/admin" element={
// //             <RoleProtectedRoute allowedRoles={['admin']}>
// //               <AdminDashboard />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* 3. FACILITATOR SUITE */}
// //           <Route path="/facilitator" element={
// //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// //               <FacilitatorLayout />
// //             </RoleProtectedRoute>
// //           }>
// //             <Route index element={<FacilitatorDashboard />} />
// //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// //             <Route path="profile" element={<FacilitatorDashboard />} />
// //             <Route path="attendance" element={<FacilitatorDashboard />} />
// //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// //             <Route path="assessments" element={<AssessmentManager />} />
// //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// //           </Route>

// //           {/* 4. SHARED STAFF & AUDIT VIEWS */}
// //           <Route path="/admin/assessment/preview/:assessmentId" element={
// //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// //               <AssessmentPreview />
// //             </RoleProtectedRoute>
// //           } />

// //           <Route path="/cohorts/:cohortId" element={
// //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// //               <CohortDetailsPage />
// //             </RoleProtectedRoute>
// //           } />

// //           <Route path="/sor/:id" element={
// //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// //               <ViewPortfolio />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* Audited Grading Interface */}
// //           <Route path="/portfolio/submission/:submissionId" element={
// //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// //               <SubmissionReview />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* 5. ASSESSOR (Marking Centre) */}
// //           <Route path="/marking/*" element={
// //             <RoleProtectedRoute allowedRoles={['assessor']}>
// //               <AssessorDashboard />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* 6. MODERATOR (QA & Endorsement) */}
// //           <Route path="/moderation/*" element={
// //             <RoleProtectedRoute allowedRoles={['moderator']}>
// //               <ModerationDashboard />
// //             </RoleProtectedRoute>
// //           } />

// //           {/* ================= FALLBACKS ================= */}
// //           <Route path="/" element={<RootRedirect />} />
// //           <Route path="*" element={<RootRedirect />} />

// //         </Routes>
// //       </div>
// //     </Router>
// //   );
// // }

// // export default App;


// // // import React, { useEffect } from 'react';
// // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // import { onAuthStateChanged } from 'firebase/auth';
// // // import { doc, getDoc } from 'firebase/firestore';
// // // import { useStore } from './store/useStore';


// // // // --- PAGES & COMPONENTS ---
// // // import Login from './pages/Login/Login';
// // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // import { auth, db } from './lib/firebase';

// // // // Admin
// // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // // // Facilitator & Assessor
// // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// // // import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// // // import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';
// // // import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';

// // // // Learner & Public
// // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// // // import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
// // // import type { UserProfile, UserRole } from './types/auth.types';

// // // // --- PLACEHOLDER DASHBOARDS ---
// // // const ModerationDashboard = () => (
// // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // //     <h1 style={{ color: '#16a34a', fontFamily: 'Oswald, sans-serif' }}>🟢 Moderation Room</h1>
// // //     <p>Sample graded scripts and perform quality assurance validation.</p>
// // //   </div>
// // // );

// // // // --- 🚦 TRAFFIC CONTROLLER ---
// // // const RootRedirect = () => {
// // //   const user = useStore((state) => state.user);
// // //   const loading = useStore((state) => state.loading);

// // //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Oswald' }}>SYNCING SESSION...</div>;
// // //   if (!user) return <Navigate to="/login" replace />;

// // //   // 🛡️ QCTO GATEKEEPERS

// // //   // 1. Learner Gate
// // //   if (user.role === 'learner' && user.profileCompleted !== true) {
// // //     return <Navigate to="/setup-profile" replace />;
// // //   }

// // //   // 2. Practitioner Gate (Assessors & Moderators)
// // //   const isPractitioner = user.role === 'assessor' || user.role === 'moderator';

// // //   // We check for profileCompleted AND the presence of the registration number to ensure full compliance
// // //   if (isPractitioner && (user.profileCompleted !== true || !user.assessorRegNumber)) {
// // //     return <Navigate to="/setup-practitioner" replace />;
// // //   }

// // //   switch (user.role) {
// // //     case 'admin': return <Navigate to="/admin" replace />;
// // //     case 'facilitator': return <Navigate to="/facilitator" replace />;
// // //     case 'assessor': return <Navigate to="/marking" replace />;
// // //     case 'moderator': return <Navigate to="/moderation" replace />;
// // //     case 'learner': return <Navigate to="/portal" replace />;
// // //     default: return <Navigate to="/login" replace />;
// // //   }
// // // };

// // // function App() {
// // //   const setUser = useStore((state) => state.setUser);
// // //   const setLoading = useStore((state) => state.setLoading);
// // //   const user = useStore((state) => state.user);

// // //   useEffect(() => {
// // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // //       if (firebaseUser) {
// // //         try {
// // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // //           if (userDoc.exists()) {
// // //             const data = userDoc.data();

// // //             // 🚀 THE FIX: Explicitly map required properties to satisfy UserProfile interface,
// // //             // then use spread operator (...data) to pull in all custom QCTO fields.
// // //             const userProfile: UserProfile = {
// // //               uid: firebaseUser.uid,
// // //               email: firebaseUser.email || data.email || '',
// // //               fullName: data.fullName || 'Practitioner',
// // //               role: data.role as UserRole,
// // //               profilePhotoUrl: data.profilePhotoUrl || '',
// // //               ...data, // Pulls in bio, assessorRegNumber, complianceDocs, etc.
// // //               profileCompleted: data.profileCompleted === true,
// // //             };

// // //             setUser(userProfile);
// // //           }
// // //         } catch (e) {
// // //           console.error("Auth Sync Error:", e);
// // //         }
// // //       } else {
// // //         setUser(null);
// // //       }
// // //       setLoading(false);
// // //     });

// // //     return () => unsubscribe();
// // //   }, [setUser, setLoading]);

// // //   return (
// // //     <Router>
// // //       <div className="App">
// // //         <Routes>
// // //           {/* ================= PUBLIC ROUTES ================= */}
// // //           <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
// // //           <Route path="/verify" element={<PublicVerification />} />

// // //           {/* ================= ONBOARDING GATES ================= */}
// // //           {/* Mandatory KYC for Learners */}
// // //           <Route path="/setup-profile" element={
// // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // //               <LearnerProfileSetup />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* Mandatory Compliance for Assessors/Moderators */}
// // //           <Route path="/setup-practitioner" element={
// // //             <RoleProtectedRoute allowedRoles={['assessor', 'moderator']}>
// // //               <AssessorProfileSetup />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* ================= PROTECTED ROUTES ================= */}

// // //           {/* 1. LEARNER PORTAL */}
// // //           <Route path="/portal" element={
// // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // //               <LearnerDashboard />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           <Route path="/learner/assessment/:assessmentId" element={
// // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // //               <AssessmentPlayer />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* 2. ADMIN CONSOLE */}
// // //           <Route path="/admin" element={
// // //             <RoleProtectedRoute allowedRoles={['admin']}>
// // //               <AdminDashboard />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* 3. FACILITATOR SUITE */}
// // //           <Route path="/facilitator" element={
// // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // //               <FacilitatorLayout />
// // //             </RoleProtectedRoute>
// // //           }>
// // //             <Route index element={<FacilitatorDashboard />} />
// // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // //             <Route path="assessments" element={<AssessmentManager />} />
// // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // //           </Route>

// // //           {/* 4. SHARED STAFF & AUDIT VIEWS */}
// // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // //               <AssessmentPreview />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           <Route path="/cohorts/:cohortId" element={
// // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // //               <CohortDetailsPage />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           <Route path="/sor/:id" element={
// // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // //               <ViewPortfolio />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* Audited Grading Interface */}
// // //           <Route path="/portfolio/submission/:submissionId" element={
// // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // //               <SubmissionReview />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* 5. ASSESSOR (Marking Centre) */}
// // //           <Route path="/marking/*" element={
// // //             <RoleProtectedRoute allowedRoles={['assessor']}>
// // //               <AssessorDashboard />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* 6. MODERATOR (QA & Endorsement) */}
// // //           <Route path="/moderation/*" element={
// // //             <RoleProtectedRoute allowedRoles={['moderator']}>
// // //               <ModerationDashboard />
// // //             </RoleProtectedRoute>
// // //           } />

// // //           {/* ================= FALLBACKS ================= */}
// // //           <Route path="/" element={<RootRedirect />} />
// // //           <Route path="*" element={<RootRedirect />} />

// // //         </Routes>
// // //       </div>
// // //     </Router>
// // //   );
// // // }

// // // export default App;

// // // // import React, { useEffect } from 'react';
// // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // import { doc, getDoc } from 'firebase/firestore';
// // // // import { useStore } from './store/useStore';

// // // // // --- PAGES & COMPONENTS ---
// // // // import Login from './pages/Login/Login';
// // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // import { auth, db } from './lib/firebase';

// // // // // Admin
// // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // // // // Facilitator & Assessor
// // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';

// // // // // Learner & Public
// // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // // // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// // // // import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
// // // // import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// // // // import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';

// // // // // --- PLACEHOLDER DASHBOARDS ---
// // // // const MarkingDashboard = () => (
// // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // //     <p>Select a cohort and learner to begin grading their submissions.</p>
// // // //   </div>
// // // // );

// // // // const ModerationDashboard = () => (
// // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // //   </div>
// // // // );

// // // // // --- 🚦 TRAFFIC CONTROLLER ---
// // // // const RootRedirect = () => {
// // // //   const user = useStore((state) => state.user);
// // // //   const loading = useStore((state) => state.loading);

// // // //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Project...</div>;
// // // //   if (!user) return <Navigate to="/login" replace />;

// // // //   // 🛡️ QCTO GATEKEEPERS

// // // //   // 1. Learner Gate
// // // //   if (user.role === 'learner' && user.profileCompleted !== true) {
// // // //     return <Navigate to="/setup-profile" replace />;
// // // //   }

// // // //   // 2. Practitioner Gate (Assessors & Moderators)
// // // //   if ((user.role === 'assessor' || user.role === 'moderator') && user.profileCompleted !== true) {
// // // //     return <Navigate to="/setup-practitioner" replace />;
// // // //   }

// // // //   switch (user.role) {
// // // //     case 'admin': return <Navigate to="/admin" replace />;
// // // //     case 'facilitator': return <Navigate to="/facilitator" replace />;
// // // //     case 'assessor': return <Navigate to="/marking" replace />;
// // // //     case 'moderator': return <Navigate to="/moderation" replace />;
// // // //     case 'learner': return <Navigate to="/portal" replace />;
// // // //     default: return <Navigate to="/login" replace />;
// // // //   }
// // // // };

// // // // function App() {
// // // //   const setUser = useStore((state) => state.setUser);
// // // //   const setLoading = useStore((state) => state.setLoading);
// // // //   const user = useStore((state) => state.user);

// // // //   useEffect(() => {
// // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // //       if (firebaseUser) {
// // // //         try {
// // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // //           if (userDoc.exists()) {
// // // //             const data = userDoc.data();
// // // //             setUser({
// // // //               uid: firebaseUser.uid,
// // // //               email: firebaseUser.email || '',
// // // //               role: data.role,
// // // //               fullName: data.fullName,
// // // //               signatureUrl: data.signatureUrl || null,
// // // //               profileCompleted: data.profileCompleted === true, // ✅ Capture completion status
// // // //             });
// // // //           }
// // // //         } catch (e) {
// // // //           console.error("Auth Error:", e);
// // // //         }
// // // //       } else {
// // // //         setUser(null);
// // // //       }
// // // //       setLoading(false);
// // // //     });

// // // //     return () => unsubscribe();
// // // //   }, [setUser, setLoading]);

// // // //   return (
// // // //     <Router>
// // // //       <div className="App">
// // // //         <Routes>
// // // //           {/* ================= PUBLIC ROUTES ================= */}
// // // //           <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
// // // //           <Route path="/verify" element={<PublicVerification />} />

// // // //           {/* ================= LEARNER ONBOARDING ================= */}
// // // //           {/* The Mandatory Setup Route */}
// // // //           <Route path="/setup-profile" element={
// // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // //               <LearnerProfileSetup />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // //           {/* 1. LEARNER ROUTES */}
// // // //           <Route path="/portal" element={
// // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // //               <LearnerDashboard />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           <Route path="/learner/assessment/:assessmentId" element={
// // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // //               <AssessmentPlayer />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* 2. ADMIN ROUTES */}
// // // //           <Route path="/admin" element={
// // // //             <RoleProtectedRoute allowedRoles={['admin']}>
// // // //               <AdminDashboard />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* 3. FACILITATOR ROUTES */}
// // // //           <Route path="/facilitator" element={
// // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // //               <FacilitatorLayout />
// // // //             </RoleProtectedRoute>
// // // //           }>
// // // //             <Route index element={<FacilitatorDashboard />} />
// // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // // //             <Route path="assessments" element={<AssessmentManager />} />
// // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // //           </Route>

// // // //           {/* 4. SHARED STAFF/AUDIT VIEWS */}
// // // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // //               <AssessmentPreview />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           <Route path="/cohorts/:cohortId" element={
// // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // //               <CohortDetailsPage />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           <Route path="/sor/:id" element={
// // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // //               <ViewPortfolio />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* THE ASSESSOR GRADING ROUTE */}
// // // //           <Route path="/portfolio/submission/:submissionId" element={
// // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // //               <SubmissionReview />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* 5. ASSESSOR (Marking) */}
// // // //           <Route path="/marking/*" element={
// // // //             <RoleProtectedRoute allowedRoles={['assessor']}>
// // // //               {/* <MarkingDashboard /> */}
// // // //               <AssessorDashboard />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* 6. MODERATOR (QA) */}
// // // //           <Route path="/moderation/*" element={
// // // //             <RoleProtectedRoute allowedRoles={['moderator']}>
// // // //               <ModerationDashboard />
// // // //             </RoleProtectedRoute>
// // // //           } />

// // // //           {/* ================= FALLBACKS ================= */}
// // // //           <Route path="/" element={<RootRedirect />} />
// // // //           <Route path="*" element={<RootRedirect />} />

// // // //         </Routes>
// // // //       </div>
// // // //     </Router>
// // // //   );
// // // // }

// // // // export default App;


// // // // // import React, { useEffect } from 'react';
// // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // import { useStore } from './store/useStore';

// // // // // // --- PAGES & COMPONENTS ---
// // // // // import Login from './pages/Login/Login';
// // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // import { auth, db } from './lib/firebase';

// // // // // // Admin
// // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // // // // // Facilitator
// // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';

// // // // // // Learner & Public
// // // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // // // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// // // // // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// // // // // import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

// // // // // // --- PLACEHOLDER DASHBOARDS ---
// // // // // const MarkingDashboard = () => (
// // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // // //     <p>Select a submission to grade using the Red Pen tools.</p>
// // // // //   </div>
// // // // // );

// // // // // const ModerationDashboard = () => (
// // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // // //   </div>
// // // // // );

// // // // // // --- 🚦 TRAFFIC CONTROLLER ---
// // // // // const RootRedirect = () => {
// // // // //   const user = useStore((state) => state.user);
// // // // //   const loading = useStore((state) => state.loading);

// // // // //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Project...</div>;

// // // // //   if (!user) return <Navigate to="/login" replace />;

// // // // //   // 🛡️ QCTO GATEKEEPER: Ensure learners complete their profile/NLRD data first
// // // // //   if (user.role === 'learner' && user.profileCompleted !== true) {
// // // // //     return <Navigate to="/setup-profile" replace />;
// // // // //   }

// // // // //   switch (user.role) {
// // // // //     case 'admin': return <Navigate to="/admin" replace />;
// // // // //     case 'facilitator': return <Navigate to="/facilitator" replace />;
// // // // //     case 'assessor': return <Navigate to="/marking" replace />;
// // // // //     case 'moderator': return <Navigate to="/moderation" replace />;
// // // // //     case 'learner': return <Navigate to="/portal" replace />;
// // // // //     default: return <Navigate to="/login" replace />;
// // // // //   }
// // // // // };

// // // // // function App() {
// // // // //   const setUser = useStore((state) => state.setUser);
// // // // //   const setLoading = useStore((state) => state.setLoading);
// // // // //   const user = useStore((state) => state.user);

// // // // //   useEffect(() => {
// // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // //       if (firebaseUser) {
// // // // //         try {
// // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // //           if (userDoc.exists()) {
// // // // //             const data = userDoc.data();
// // // // //             setUser({
// // // // //               uid: firebaseUser.uid,
// // // // //               email: firebaseUser.email || '',
// // // // //               role: data.role,
// // // // //               fullName: data.fullName,
// // // // //               signatureUrl: data.signatureUrl || null,
// // // // //               profileCompleted: data.profileCompleted === true, // ✅ Capture completion status
// // // // //             });
// // // // //           }
// // // // //         } catch (e) {
// // // // //           console.error("Auth Error:", e);
// // // // //         }
// // // // //       } else {
// // // // //         setUser(null);
// // // // //       }
// // // // //       setLoading(false);
// // // // //     });

// // // // //     return () => unsubscribe();
// // // // //   }, [setUser, setLoading]);

// // // // //   return (
// // // // //     <Router>
// // // // //       <div className="App">
// // // // //         <Routes>
// // // // //           {/* ================= PUBLIC ROUTES ================= */}
// // // // //           <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
// // // // //           <Route path="/verify" element={<PublicVerification />} />

// // // // //           {/* ================= LEARNER ONBOARDING ================= */}
// // // // //           {/* The Mandatory Setup Route */}
// // // // //           <Route path="/setup-profile" element={
// // // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // // //               <LearnerProfileSetup />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // // //           {/* 1. LEARNER ROUTES */}
// // // // //           <Route path="/portal" element={
// // // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // // //               <LearnerDashboard />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           <Route path="/learner/assessment/:assessmentId" element={
// // // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // // //               <AssessmentPlayer />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* 2. ADMIN ROUTES */}
// // // // //           <Route path="/admin" element={
// // // // //             <RoleProtectedRoute allowedRoles={['admin']}>
// // // // //               <AdminDashboard />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* 3. FACILITATOR ROUTES */}
// // // // //           <Route path="/facilitator" element={
// // // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // //               <FacilitatorLayout />
// // // // //             </RoleProtectedRoute>
// // // // //           }>
// // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // // // //             <Route path="assessments" element={<AssessmentManager />} />
// // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // //           </Route>

// // // // //           {/* 4. SHARED STAFF/AUDIT VIEWS */}
// // // // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // //               <AssessmentPreview />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           <Route path="/cohorts/:cohortId" element={
// // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // //               <CohortDetailsPage />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           <Route path="/sor/:id" element={
// // // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // // //               <ViewPortfolio />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* 5. ASSESSOR (Marking) */}
// // // // //           <Route path="/marking/*" element={
// // // // //             <RoleProtectedRoute allowedRoles={['assessor']}>
// // // // //               <MarkingDashboard />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* 6. MODERATOR (QA) */}
// // // // //           <Route path="/moderation/*" element={
// // // // //             <RoleProtectedRoute allowedRoles={['moderator']}>
// // // // //               <ModerationDashboard />
// // // // //             </RoleProtectedRoute>
// // // // //           } />

// // // // //           {/* ================= FALLBACKS ================= */}
// // // // //           <Route path="/" element={<RootRedirect />} />
// // // // //           <Route path="*" element={<RootRedirect />} />

// // // // //         </Routes>
// // // // //       </div>
// // // // //     </Router>
// // // // //   );
// // // // // }

// // // // // export default App;


// // // // // // import React, { useEffect } from 'react';
// // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // // import { useStore } from './store/useStore';

// // // // // // // --- PAGES & COMPONENTS ---
// // // // // // import Login from './pages/Login/Login';
// // // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // // import { auth, db } from './lib/firebase';

// // // // // // // Admin
// // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

// // // // // // // Facilitator
// // // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';

// // // // // // // Learner & Public
// // // // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // // // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // // // // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// // // // // // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';

// // // // // // // --- PLACEHOLDER DASHBOARDS (To prevent crashes until built) ---
// // // // // // const MarkingDashboard = () => (
// // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // // // //     <p>Select a submission to grade using the Red Pen tools.</p>
// // // // // //   </div>
// // // // // // );

// // // // // // const ModerationDashboard = () => (
// // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // // // //   </div>
// // // // // // );

// // // // // // // --- 🚦 TRAFFIC CONTROLLER ---
// // // // // // // Automatically routes logged-in users to their correct dashboard based on their role
// // // // // // const RootRedirect = () => {
// // // // // //   const user = useStore((state) => state.user);
// // // // // //   const loading = useStore((state) => state.loading);

// // // // // //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

// // // // // //   // If no user is logged in, send them to login
// // // // // //   if (!user) return <Navigate to="/login" replace />;

// // // // // //   // Traffic Controller: Send users to their correct dashboards based on role
// // // // // //   switch (user.role) {
// // // // // //     case 'admin':
// // // // // //       return <Navigate to="/admin" replace />;
// // // // // //     case 'facilitator':
// // // // // //       return <Navigate to="/facilitator" replace />;
// // // // // //     case 'assessor':
// // // // // //       return <Navigate to="/marking" replace />;
// // // // // //     case 'moderator':
// // // // // //       return <Navigate to="/moderation" replace />;
// // // // // //     case 'learner':
// // // // // //       return <Navigate to="/portal" replace />; // Directs learners to their private portal
// // // // // //     default:
// // // // // //       return <Navigate to="/login" replace />;
// // // // // //   }
// // // // // // };

// // // // // // function App() {
// // // // // //   const setUser = useStore((state) => state.setUser);
// // // // // //   const setLoading = useStore((state) => state.setLoading);
// // // // // //   const user = useStore((state) => state.user);

// // // // // //   useEffect(() => {
// // // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // // //       if (firebaseUser) {
// // // // // //         try {
// // // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // // //           if (userDoc.exists()) {
// // // // // //             if (typeof setUser === 'function') {
// // // // // //               setUser({
// // // // // //                 uid: firebaseUser.uid,
// // // // // //                 email: firebaseUser.email || '',
// // // // // //                 role: userDoc.data().role,
// // // // // //                 fullName: userDoc.data().fullName,
// // // // // //                 signatureUrl: userDoc.data().signatureUrl || null,
// // // // // //               });
// // // // // //             }
// // // // // //           }
// // // // // //         } catch (e) {
// // // // // //           console.error(e);
// // // // // //         }
// // // // // //       } else {
// // // // // //         if (typeof setUser === 'function') setUser(null);
// // // // // //       }
// // // // // //       if (typeof setLoading === 'function') setLoading(false);
// // // // // //     });

// // // // // //     return () => unsubscribe();
// // // // // //   }, [setUser, setLoading]);

// // // // // //   return (
// // // // // //     <Router>
// // // // // //       <div className="App">
// // // // // //         <Routes>
// // // // // //           {/* ================= PUBLIC ROUTES ================= */}

// // // // // //           {/* ✅ If logged in, skip the login page and go straight to the root redirector */}
// // // // // //           <Route
// // // // // //             path="/login"
// // // // // //             element={user ? <Navigate to="/" replace /> : <Login />}
// // // // // //           />

// // // // // //           {/* ✅ Public Verification Search Tool (For Employers/QR Codes) */}
// // // // // //           <Route path="/verify" element={<PublicVerification />} />


// // // // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // // // //           {/* 1. LEARNER ROUTES */}
// // // // // //           {/* The REAL Learner Dashboard */}
// // // // // //           <Route path="/portal" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // // // //               <LearnerDashboard />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* Learner Assessment Player */}
// // // // // //           <Route path="/learner/assessment/:assessmentId" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['learner']}>
// // // // // //               <AssessmentPlayer />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* 2. ADMIN ROUTES */}
// // // // // //           <Route path="/admin" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['admin']}>
// // // // // //               <AdminDashboard />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* 3. FACILITATOR / STAFF ROUTES */}
// // // // // //           <Route path="/facilitator" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // // //               <FacilitatorLayout />
// // // // // //             </RoleProtectedRoute>
// // // // // //           }>
// // // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // // // // //             <Route path="assessments" element={<AssessmentManager />} />
// // // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // // //           </Route>

// // // // // //           {/* ADMIN/STAFF ASSESSMENT PREVIEW */}
// // // // // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // // //               <AssessmentPreview />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* 4. SHARED STAFF VIEWS */}
// // // // // //           <Route path="/cohorts/:cohortId" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // // //               <CohortDetailsPage />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* Portfolio View (Learners see their own, Staff see anyone's) */}
// // // // // //           <Route path="/sor/:id" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // // // //               <ViewPortfolio />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* 5. ASSESSOR (Marking) */}
// // // // // //           <Route path="/marking/*" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['assessor']}>
// // // // // //               <MarkingDashboard />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* 6. MODERATOR (Quality Assurance) */}
// // // // // //           <Route path="/moderation/*" element={
// // // // // //             <RoleProtectedRoute allowedRoles={['moderator']}>
// // // // // //               <ModerationDashboard />
// // // // // //             </RoleProtectedRoute>
// // // // // //           } />

// // // // // //           {/* ================= FALLBACKS ================= */}

// // // // // //           {/* ✅ Redirect root based on user role using our new Traffic Controller */}
// // // // // //           <Route path="/" element={<RootRedirect />} />

// // // // // //           {/* ✅ Catch-all 404 -> Send to Traffic Controller to figure out where they belong */}
// // // // // //           <Route path="*" element={<RootRedirect />} />

// // // // // //         </Routes>
// // // // // //       </div>
// // // // // //     </Router>
// // // // // //   );
// // // // // // }

// // // // // // export default App;


// // // // // // // import { useEffect } from 'react';
// // // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // // // import { useStore } from './store/useStore';

// // // // // // // // --- PAGES ---
// // // // // // // import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
// // // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
// // // // // // // import { auth, db } from './lib/firebase';
// // // // // // // import Login from './pages/Login/Login';
// // // // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // // // // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // // // // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';

// // // // // // // // --- PLACEHOLDER DASHBOARDS (To prevent crashes until built) ---
// // // // // // // const ClassroomDashboard = () => (
// // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // //     <h1 style={{ color: '#073f4e' }}>🎓 Learner Classroom</h1>
// // // // // // //     <p>Welcome to your private dashboard. Your assigned modules will appear here.</p>
// // // // // // //   </div>
// // // // // // // );

// // // // // // // const MarkingDashboard = () => (
// // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // // // // //     <p>Select a submission to grade using the Red Pen tools.</p>
// // // // // // //   </div>
// // // // // // // );

// // // // // // // const ModerationDashboard = () => (
// // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // // // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // // // // //   </div>
// // // // // // // );

// // // // // // // // --- 🚦 TRAFFIC CONTROLLER ---
// // // // // // // // Automatically routes logged-in users to their correct dashboard based on their role
// // // // // // // const RootRedirect = () => {
// // // // // // //   const user = useStore((state) => state.user);
// // // // // // //   const loading = useStore((state) => state.loading);

// // // // // // //   if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

// // // // // // //   // If no user is logged in, send them to login
// // // // // // //   if (!user) return <Navigate to="/login" replace />;

// // // // // // //   // Traffic Controller: Send users to their correct dashboards based on role
// // // // // // //   switch (user.role) {
// // // // // // //     case 'admin':
// // // // // // //       return <Navigate to="/admin" replace />;
// // // // // // //     case 'facilitator':
// // // // // // //       return <Navigate to="/facilitator" replace />;
// // // // // // //     case 'assessor':
// // // // // // //       return <Navigate to="/marking" replace />;
// // // // // // //     case 'moderator':
// // // // // // //       return <Navigate to="/moderation" replace />;
// // // // // // //     case 'learner':
// // // // // // //       return <Navigate to="/portal" replace />; // Directs learners to their portal
// // // // // // //     default:
// // // // // // //       return <Navigate to="/login" replace />;
// // // // // // //   }
// // // // // // // };

// // // // // // // function App() {
// // // // // // //   const setUser = useStore((state) => state.setUser);
// // // // // // //   const setLoading = useStore((state) => state.setLoading);
// // // // // // //   const user = useStore((state) => state.user); // ✅ Added user state here

// // // // // // //   useEffect(() => {
// // // // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // // // //       if (firebaseUser) {
// // // // // // //         try {
// // // // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // // // //           if (userDoc.exists()) {
// // // // // // //             if (typeof setUser === 'function') {
// // // // // // //               setUser({
// // // // // // //                 uid: firebaseUser.uid,
// // // // // // //                 email: firebaseUser.email || '',
// // // // // // //                 role: userDoc.data().role,
// // // // // // //                 fullName: userDoc.data().fullName,
// // // // // // //                 signatureUrl: userDoc.data().signatureUrl || null,
// // // // // // //               });
// // // // // // //             }
// // // // // // //           }
// // // // // // //         } catch (e) {
// // // // // // //           console.error(e);
// // // // // // //         }
// // // // // // //       } else {
// // // // // // //         if (typeof setUser === 'function') setUser(null);
// // // // // // //       }
// // // // // // //       if (typeof setLoading === 'function') setLoading(false);
// // // // // // //     });

// // // // // // //     return () => unsubscribe();
// // // // // // //   }, [setUser, setLoading]);

// // // // // // //   return (
// // // // // // //     <Router>
// // // // // // //       <div className="App">
// // // // // // //         <Routes>
// // // // // // //           {/* ================= PUBLIC ROUTES ================= */}

// // // // // // //           {/* ✅ If logged in, skip the login page and go straight to the root redirector */}
// // // // // // //           <Route
// // // // // // //             path="/login"
// // // // // // //             element={user ? <Navigate to="/" replace /> : <Login />}
// // // // // // //           />

// // // // // // //           {/* Public Search Portal */}
// // // // // // //           <Route path="/portal" element={<LearnerPortal />} />

// // // // // // //           {/* Learner Assessment Player */}
// // // // // // //           <Route path="/learner/assessment/:assessmentId" element={<AssessmentPlayer />} />

// // // // // // //           {/* Portfolio View */}
// // // // // // //           <Route path="/sor/:id" element={
// // // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // // // // //               <ViewPortfolio />
// // // // // // //             </RoleProtectedRoute>
// // // // // // //           } />

// // // // // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // // // // //           {/* 1. ADMIN ROUTES */}
// // // // // // //           <Route
// // // // // // //             path="/admin"
// // // // // // //             element={
// // // // // // //               <RoleProtectedRoute allowedRoles={['admin']}>
// // // // // // //                 <AdminDashboard />
// // // // // // //               </RoleProtectedRoute>
// // // // // // //             }
// // // // // // //           />

// // // // // // //           {/* ADMIN/STAFF ASSESSMENT PREVIEW */}
// // // // // // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // // // //               <AssessmentPreview />
// // // // // // //             </RoleProtectedRoute>
// // // // // // //           } />

// // // // // // //           {/* SHARED COHORT DETAILS ROUTE */}
// // // // // // //           <Route
// // // // // // //             path="/cohorts/:cohortId"
// // // // // // //             element={<CohortDetailsPage />}
// // // // // // //           />

// // // // // // //           {/* 2. LEARNER (Classroom) */}
// // // // // // //           <Route
// // // // // // //             path="/classroom/*"
// // // // // // //             element={
// // // // // // //               <RoleProtectedRoute allowedRoles={['learner']}>
// // // // // // //                 <ClassroomDashboard />
// // // // // // //               </RoleProtectedRoute>
// // // // // // //             }
// // // // // // //           />

// // // // // // //           {/* 3. ASSESSOR (Marking) */}
// // // // // // //           <Route
// // // // // // //             path="/marking/*"
// // // // // // //             element={
// // // // // // //               <RoleProtectedRoute allowedRoles={['assessor']}>
// // // // // // //                 <MarkingDashboard />
// // // // // // //               </RoleProtectedRoute>
// // // // // // //             }
// // // // // // //           />

// // // // // // //           {/* 4. MODERATOR (Quality Assurance) */}
// // // // // // //           <Route
// // // // // // //             path="/moderation/*"
// // // // // // //             element={
// // // // // // //               <RoleProtectedRoute allowedRoles={['moderator']}>
// // // // // // //                 <ModerationDashboard />
// // // // // // //               </RoleProtectedRoute>
// // // // // // //             }
// // // // // // //           />

// // // // // // //           {/* 5. FACILITATOR (Class Management) */}
// // // // // // //           <Route path="/facilitator" element={
// // // // // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // // // //               <FacilitatorLayout />
// // // // // // //             </RoleProtectedRoute>
// // // // // // //           }>
// // // // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // // // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // // // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // // // // // //             <Route path="assessments" element={<AssessmentManager />} />
// // // // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // // // //           </Route>

// // // // // // //           {/* ================= FALLBACKS ================= */}

// // // // // // //           {/* ✅ Redirect root based on user role using our new Traffic Controller */}
// // // // // // //           <Route path="/" element={<RootRedirect />} />

// // // // // // //           {/* ✅ Catch-all 404 -> Send to Traffic Controller to figure out where they belong */}
// // // // // // //           <Route path="*" element={<RootRedirect />} />

// // // // // // //         </Routes>
// // // // // // //       </div>
// // // // // // //     </Router>
// // // // // // //   );
// // // // // // // }

// // // // // // // export default App;


// // // // // // // // import React, { useEffect } from 'react';
// // // // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // // // // import { useStore } from './store/useStore';

// // // // // // // // // --- PAGES ---
// // // // // // // // import StatementOfResults from './pages/StatementOfResults/StatementOfResults';
// // // // // // // // import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
// // // // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
// // // // // // // // import { auth, db } from './lib/firebase';
// // // // // // // // import Login from './pages/Login/Login';
// // // // // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // // // // // // // // ✅ Import the new Preview Component
// // // // // // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // // // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // // // // // // // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';

// // // // // // // // // --- PLACEHOLDER DASHBOARDS ---
// // // // // // // // const ClassroomDashboard = () => (
// // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}><h1 style={{ color: '#073f4e' }}>🎓 Learner Classroom</h1></div>
// // // // // // // // );

// // // // // // // // const MarkingDashboard = () => (
// // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}><h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1></div>
// // // // // // // // );

// // // // // // // // const ModerationDashboard = () => (
// // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}><h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1></div>
// // // // // // // // );

// // // // // // // // function App() {
// // // // // // // //   const setUser = useStore((state) => state.setUser);
// // // // // // // //   const setLoading = useStore((state) => state.setLoading);

// // // // // // // //   useEffect(() => {
// // // // // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // // // // //       if (firebaseUser) {
// // // // // // // //         try {
// // // // // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // // // // //           if (userDoc.exists() && typeof setUser === 'function') {
// // // // // // // //             setUser({
// // // // // // // //               uid: firebaseUser.uid,
// // // // // // // //               email: firebaseUser.email || '',
// // // // // // // //               role: userDoc.data().role,
// // // // // // // //               fullName: userDoc.data().fullName,
// // // // // // // //               signatureUrl: userDoc.data().signatureUrl || null,
// // // // // // // //             });
// // // // // // // //           }
// // // // // // // //         } catch (e) { console.error(e); }
// // // // // // // //       } else {
// // // // // // // //         if (typeof setUser === 'function') setUser(null);
// // // // // // // //       }
// // // // // // // //       if (typeof setLoading === 'function') setLoading(false);
// // // // // // // //     });
// // // // // // // //     return () => unsubscribe();
// // // // // // // //   }, [setUser, setLoading]);

// // // // // // // //   return (
// // // // // // // //     <Router>
// // // // // // // //       <div className="App">
// // // // // // // //         <Routes>
// // // // // // // //           <Route path="/login" element={<Login />} />
// // // // // // // //           <Route path="/portal" element={<LearnerPortal />} />

// // // // // // // //           {/* LEARNER PLAYER */}
// // // // // // // //           <Route path="/learner/assessment/:assessmentId" element={<AssessmentPlayer />} />

// // // // // // // //           <Route path="/sor/:id" element={
// // // // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // // // // // //               <ViewPortfolio />
// // // // // // // //             </RoleProtectedRoute>
// // // // // // // //           } />

// // // // // // // //           {/* ADMIN */}
// // // // // // // //           <Route path="/admin" element={
// // // // // // // //             <RoleProtectedRoute allowedRoles={['admin']}><AdminDashboard /></RoleProtectedRoute>
// // // // // // // //           } />

// // // // // // // //           {/* ✅ PREVIEW ROUTE FOR STAFF */}
// // // // // // // //           <Route path="/admin/assessment/preview/:assessmentId" element={
// // // // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator']}>
// // // // // // // //               <AssessmentPreview />
// // // // // // // //             </RoleProtectedRoute>
// // // // // // // //           } />

// // // // // // // //           <Route path="/cohorts/:cohortId" element={<CohortDetailsPage />} />

// // // // // // // //           <Route path="/classroom/*" element={<RoleProtectedRoute allowedRoles={['learner']}><ClassroomDashboard /></RoleProtectedRoute>} />
// // // // // // // //           <Route path="/marking/*" element={<RoleProtectedRoute allowedRoles={['assessor']}><MarkingDashboard /></RoleProtectedRoute>} />
// // // // // // // //           <Route path="/moderation/*" element={<RoleProtectedRoute allowedRoles={['moderator']}><ModerationDashboard /></RoleProtectedRoute>} />

// // // // // // // //           {/* FACILITATOR */}
// // // // // // // //           <Route path="/facilitator" element={<RoleProtectedRoute allowedRoles={['facilitator']}><FacilitatorLayout /></RoleProtectedRoute>}>
// // // // // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // // // // //             <Route path="profile" element={<FacilitatorDashboard />} />
// // // // // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />
// // // // // // // //             <Route path="assessments" element={<AssessmentManager />} />
// // // // // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // // // // //           </Route>

// // // // // // // //           <Route path="/" element={<Navigate to="/login" replace />} />
// // // // // // // //           <Route path="*" element={<Navigate to="/login" replace />} />
// // // // // // // //         </Routes>
// // // // // // // //       </div>
// // // // // // // //     </Router>
// // // // // // // //   );
// // // // // // // // }

// // // // // // // // export default App;


// // // // // // // // // import React, { useEffect } from 'react';
// // // // // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // // // // // import { useStore } from './store/useStore';

// // // // // // // // // // --- PAGES ---
// // // // // // // // // import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
// // // // // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
// // // // // // // // // import { auth, db } from './lib/firebase';
// // // // // // // // // import Login from './pages/Login/Login';
// // // // // // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // // // // // // // // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // // // // // // // // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';

// // // // // // // // // // --- PLACEHOLDER DASHBOARDS (To prevent crashes until built) ---
// // // // // // // // // const ClassroomDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#073f4e' }}>🎓 Learner Classroom</h1>
// // // // // // // // //     <p>Welcome to your private dashboard. Your assigned modules will appear here.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // const MarkingDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // // // // // // //     <p>Select a submission to grade using the Red Pen tools.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // const ModerationDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // // // // // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // function App() {
// // // // // // // // //   const setUser = useStore((state) => state.setUser);
// // // // // // // // //   const setLoading = useStore((state) => state.setLoading);

// // // // // // // // //   useEffect(() => {
// // // // // // // // //     // Debug: Check if setUser exists when component mounts
// // // // // // // // //     console.log("Store Check - setUser type:", typeof setUser);

// // // // // // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // // // // // //       if (firebaseUser) {
// // // // // // // // //         try {
// // // // // // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // // // // // //           if (userDoc.exists()) {
// // // // // // // // //             console.log('DOcu: ', userDoc.data());
// // // // // // // // //             // Check if setUser is a function before calling it
// // // // // // // // //             if (typeof setUser === 'function') {
// // // // // // // // //               setUser({
// // // // // // // // //                 uid: firebaseUser.uid,
// // // // // // // // //                 email: firebaseUser.email || '',
// // // // // // // // //                 role: userDoc.data().role,
// // // // // // // // //                 fullName: userDoc.data().fullName,
// // // // // // // // //                 signatureUrl: userDoc.data().signatureUrl || null,
// // // // // // // // //               });
// // // // // // // // //             }
// // // // // // // // //           }
// // // // // // // // //         } catch (e) {
// // // // // // // // //           console.error(e);
// // // // // // // // //         }
// // // // // // // // //       } else {
// // // // // // // // //         if (typeof setUser === 'function') setUser(null);
// // // // // // // // //       }
// // // // // // // // //       if (typeof setLoading === 'function') setLoading(false);
// // // // // // // // //     });

// // // // // // // // //     return () => unsubscribe();
// // // // // // // // //   }, [setUser, setLoading]);

// // // // // // // // //   return (
// // // // // // // // //     <Router>
// // // // // // // // //       <div className="App">
// // // // // // // // //         <Routes>
// // // // // // // // //           {/* ================= PUBLIC ROUTES ================= */}

// // // // // // // // //           <Route path="/login" element={<Login />} />

// // // // // // // // //           {/* Public Search Portal (e.g., specific specific landing page) */}
// // // // // // // // //           <Route path="/portal" element={<LearnerPortal />} />

// // // // // // // // //           <Route path="/learner/assessment/:assessmentId" element={<AssessmentPlayer />} />

// // // // // // // // //           {/* Public Verification Link (QR Codes point here) */}
// // // // // // // // //           {/* <Route path="/sor/:id" element={<StatementOfResults />} /> */}
// // // // // // // // //           <Route path="/sor/:id" element={
// // // // // // // // //             <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner']}>
// // // // // // // // //               <ViewPortfolio />
// // // // // // // // //             </RoleProtectedRoute>
// // // // // // // // //           } />

// // // // // // // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // // // // // // //           {/* 1. ADMIN ROUTES */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/admin"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['admin']}>
// // // // // // // // //                 <AdminDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* ✅ SHARED COHORT DETAILS ROUTE (No role restrictions here) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/cohorts/:cohortId"
// // // // // // // // //             element={<CohortDetailsPage />}
// // // // // // // // //           />

// // // // // // // // //           {/* 2. LEARNER (Classroom) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/classroom/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['learner']}>
// // // // // // // // //                 <ClassroomDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* 3. ASSESSOR (Marking) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/marking/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['assessor']}>
// // // // // // // // //                 <MarkingDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* 4. MODERATOR (Quality Assurance) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/moderation/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['moderator']}>
// // // // // // // // //                 <ModerationDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />


// // // // // // // // //           {/* 5. FACILITATOR (Class Management) */}
// // // // // // // // //           <Route path="/facilitator" element={
// // // // // // // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // // // // // //               <FacilitatorLayout />
// // // // // // // // //             </RoleProtectedRoute>
// // // // // // // // //           }>
// // // // // // // // //             {/* Dashboard & Profile */}
// // // // // // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="profile" element={<FacilitatorDashboard />} />

// // // // // // // // //             {/* Attendance */}
// // // // // // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />

// // // // // // // // //             {/* Assessments */}
// // // // // // // // //             <Route path="assessments" element={<AssessmentManager />} />

// // // // // // // // //             {/* Combine New and Edit into one route with an optional parameter. */}
// // // // // // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // // // // // //           </Route>

// // // // // // // // //           {/* ================= FALLBACKS ================= */}

// // // // // // // // //           {/* Redirect root based on nothing being selected -> Login */}
// // // // // // // // //           <Route path="/" element={<Navigate to="/login" replace />} />

// // // // // // // // //           {/* Catch-all 404 -> Login */}
// // // // // // // // //           <Route path="*" element={<Navigate to="/login" replace />} />

// // // // // // // // //         </Routes>
// // // // // // // // //       </div>
// // // // // // // // //     </Router>
// // // // // // // // //   );
// // // // // // // // // }

// // // // // // // // // export default App;


// // // // // // // // // import React, { useEffect } from 'react';
// // // // // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // // // // import { onAuthStateChanged } from 'firebase/auth';
// // // // // // // // // import { doc, getDoc } from 'firebase/firestore';
// // // // // // // // // import { useStore } from './store/useStore';

// // // // // // // // // // --- PAGES ---
// // // // // // // // // import StatementOfResults from './pages/StatementOfResults/StatementOfResults';
// // // // // // // // // import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
// // // // // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // // // // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
// // // // // // // // // import { auth, db } from './lib/firebase';
// // // // // // // // // import Login from './pages/Login/Login';
// // // // // // // // // import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
// // // // // // // // // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // // // // // // // // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // // // // // // // // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // // // // // // // // import { AttendanceHistoryList } from './pages/FacilitatorDashboard/AttendanceHistoryList';
// // // // // // // // // import { FacilitatorProfile } from './pages/FacilitatorDashboard/FacilitatorProfile';
// // // // // // // // // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager';
// // // // // // // // // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';

// // // // // // // // // // --- PLACEHOLDER DASHBOARDS (To prevent crashes until built) ---
// // // // // // // // // const ClassroomDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#073f4e' }}>🎓 Learner Classroom</h1>
// // // // // // // // //     <p>Welcome to your private dashboard. Your assigned modules will appear here.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // const MarkingDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#e11d48' }}>🔴 Assessor Marking Centre</h1>
// // // // // // // // //     <p>Select a submission to grade using the Red Pen tools.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // const ModerationDashboard = () => (
// // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // //     <h1 style={{ color: '#16a34a' }}>🟢 Moderation Room</h1>
// // // // // // // // //     <p>Sample graded scripts and perform quality assurance.</p>
// // // // // // // // //   </div>
// // // // // // // // // );

// // // // // // // // // // const FacilitatorDashboard = () => (
// // // // // // // // // //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// // // // // // // // // //     <h1 style={{ color: '#2563eb' }}>🔵 Facilitator Hub</h1>
// // // // // // // // // //     <p>Manage class attendance and sign off formative activities.</p>
// // // // // // // // // //     {/* <FacilitatorDashboard /> */}
// // // // // // // // // //   </div>
// // // // // // // // // // );

// // // // // // // // // function App() {
// // // // // // // // //   const setUser = useStore((state) => state.setUser);
// // // // // // // // //   const setLoading = useStore((state) => state.setLoading);

// // // // // // // // //   useEffect(() => {
// // // // // // // // //     // Debug: Check if setUser exists when component mounts
// // // // // // // // //     console.log("Store Check - setUser type:", typeof setUser);

// // // // // // // // //     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
// // // // // // // // //       if (firebaseUser) {
// // // // // // // // //         try {
// // // // // // // // //           const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
// // // // // // // // //           if (userDoc.exists()) {
// // // // // // // // //             console.log('DOcu: ', userDoc.data());
// // // // // // // // //             // Check if setUser is a function before calling it
// // // // // // // // //             if (typeof setUser === 'function') {
// // // // // // // // //               setUser({
// // // // // // // // //                 uid: firebaseUser.uid,
// // // // // // // // //                 email: firebaseUser.email || '',
// // // // // // // // //                 role: userDoc.data().role,
// // // // // // // // //                 fullName: userDoc.data().fullName,
// // // // // // // // //                 signatureUrl: userDoc.data().signatureUrl || null,
// // // // // // // // //               });
// // // // // // // // //             }
// // // // // // // // //           }
// // // // // // // // //         } catch (e) {
// // // // // // // // //           console.error(e);
// // // // // // // // //         }
// // // // // // // // //       } else {
// // // // // // // // //         if (typeof setUser === 'function') setUser(null);
// // // // // // // // //       }
// // // // // // // // //       if (typeof setLoading === 'function') setLoading(false);
// // // // // // // // //     });

// // // // // // // // //     return () => unsubscribe();
// // // // // // // // //   }, [setUser, setLoading]);

// // // // // // // // //   return (
// // // // // // // // //     <Router>
// // // // // // // // //       <div className="App">
// // // // // // // // //         <Routes>
// // // // // // // // //           {/* ================= PUBLIC ROUTES ================= */}

// // // // // // // // //           <Route path="/login" element={<Login />} />

// // // // // // // // //           {/* Public Search Portal (e.g., specific specific landing page) */}
// // // // // // // // //           <Route path="/portal" element={<LearnerPortal />} />

// // // // // // // // //           {/* Public Verification Link (QR Codes point here) */}
// // // // // // // // //           <Route path="/sor/:id" element={<StatementOfResults />} />

// // // // // // // // //           {/* ================= PROTECTED ROUTES ================= */}

// // // // // // // // //           {/* 1. ADMIN ROUTES */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/admin"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['admin']}>
// // // // // // // // //                 <AdminDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* CRITICAL FIX: This was unprotected in your snippet. Now secured. */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/admin/cohorts/:cohortId"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['admin']}>
// // // // // // // // //                 <CohortDetailsPage />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* 2. LEARNER (Classroom) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/classroom/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['learner']}>
// // // // // // // // //                 <ClassroomDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />

// // // // // // // // //           {/* 3. ASSESSOR (Marking) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/marking/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['assessor']}>
// // // // // // // // //                 <MarkingDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />
// // // // // // // // //           {/* FACILITATOR (Class Management) */}
// // // // // // // // //           {/* <Route
// // // // // // // // //             path="/facilitator"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // // // // // //                 <FacilitatorDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           /> */}


// // // // // // // // //           {/* 4. MODERATOR (Quality Assurance) */}
// // // // // // // // //           <Route
// // // // // // // // //             path="/moderation/*"
// // // // // // // // //             element={
// // // // // // // // //               <RoleProtectedRoute allowedRoles={['moderator']}>
// // // // // // // // //                 <ModerationDashboard />
// // // // // // // // //               </RoleProtectedRoute>
// // // // // // // // //             }
// // // // // // // // //           />


// // // // // // // // //           {/* 5. FACILITATOR (Class Management) */}

// // // // // // // // //           <Route path="/facilitator" element={
// // // // // // // // //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// // // // // // // // //               <FacilitatorLayout />
// // // // // // // // //             </RoleProtectedRoute>
// // // // // // // // //           }>
// // // // // // // // //             {/* Dashboard & Profile */}
// // // // // // // // //             <Route index element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="dashboard" element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="profile" element={<FacilitatorDashboard />} />

// // // // // // // // //             {/* Attendance */}
// // // // // // // // //             <Route path="attendance" element={<FacilitatorDashboard />} />
// // // // // // // // //             <Route path="attendance/:cohortId" element={<AttendancePage />} />

// // // // // // // // //             {/* Assessments */}
// // // // // // // // //             <Route path="assessments" element={<AssessmentManager />} />

// // // // // // // // //             {/* Combine New and Edit into one route with an optional parameter.
// // // // // // // // //                 This allows the 'useParams' inside AssessmentBuilder to catch the ID 
// // // // // // // // //                 whether the URL is /assessments/builder (New) or /assessments/builder/abc123 (Edit).
// // // // // // // // //             */}
// // // // // // // // //             <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
// // // // // // // // //           </Route>

// // // // // // // // //           {/* ================= FALLBACKS ================= */}

// // // // // // // // //           {/* Redirect root based on nothing being selected -> Login */}
// // // // // // // // //           <Route path="/" element={<Navigate to="/login" replace />} />

// // // // // // // // //           {/* Catch-all 404 -> Login */}
// // // // // // // // //           <Route path="*" element={<Navigate to="/login" replace />} />

// // // // // // // // //         </Routes>
// // // // // // // // //       </div>
// // // // // // // // //     </Router>
// // // // // // // // //   );
// // // // // // // // // }

// // // // // // // // // export default App;



// // // // // // // // // // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // // // // // // // // // import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// // // // // // // // // // import StatementOfResults from './pages/StatementOfResults/StatementOfResults';
// // // // // // // // // // import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
// // // // // // // // // // import { ProtectedRoute } from './auth/ProtectedRoute';
// // // // // // // // // // import Login from './pages/Login/Login';

// // // // // // // // // // function App() {
// // // // // // // // // //   return (
// // // // // // // // // //     // 1. Wrap the entire application in the Router
// // // // // // // // // //     <Router>
// // // // // // // // // //       <div className="App">

// // // // // // // // // //         <Routes>
// // // // // // // // // //           {/* Public: Learner Portal */}
// // // // // // // // // //           <Route path="/portal" element={<LearnerPortal />} />

// // // // // // // // // //           {/* Public: Statement of Results (Required for learners) */}
// // // // // // // // // //           <Route path="/sor/:id" element={<StatementOfResults />} />

// // // // // // // // // //           {/* Public: Admin Login */}
// // // // // // // // // //           <Route path="/login" element={<Login />} />

// // // // // // // // // //           {/* PROTECTED: Admin Dashboard */}
// // // // // // // // // //           <Route
// // // // // // // // // //             path="/"
// // // // // // // // // //             element={
// // // // // // // // // //               <ProtectedRoute>
// // // // // // // // // //                 <AdminDashboard />
// // // // // // // // // //               </ProtectedRoute>
// // // // // // // // // //             }
// // // // // // // // // //           />

// // // // // // // // // //           {/* Catch-all */}
// // // // // // // // // //           <Route path="*" element={<Navigate to="/" replace />} />
// // // // // // // // // //         </Routes>
// // // // // // // // // //       </div>
// // // // // // // // // //     </Router>
// // // // // // // // // //   );
// // // // // // // // // // }

// // // // // // // // // // // --- Styles (Preserved from your code) ---

// // // // // // // // // // export default App;

