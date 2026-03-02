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
import { ModeratorProfileSetup } from './pages/FacilitatorDashboard/ModeratorProfileSetup/ModeratorProfileSetup';
import { ModeratorDashboard } from './pages/FacilitatorDashboard/ModeratorDashboard/ModeratorDashboard';

// Learner & Public
import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
import PublicVerification from './pages/LearnerPortal/PublicVerification';
import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
import { LearnerProfileView } from './components/views/LearnerProfileView/LearnerProfileView';

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

          {/* 🚀 NEW 360° PROFILE ROUTE */}
          <Route path="/admin/learners/:learnerId" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <LearnerProfileView />
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

// // Staff (Facilitator, Assessor, Moderator)
// import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager/AssessmentManager';
// import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';

// // Compliance & Profile Setup Gates
// import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';
// import { FacilitatorProfileSetup } from './pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup';
// import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';

// // Learner & Public
// import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// import PublicVerification from './pages/LearnerPortal/PublicVerification';
// import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
// import { ModeratorProfileSetup } from './pages/FacilitatorDashboard/ModeratorProfileSetup/ModeratorProfileSetup';
// import { ModeratorDashboard } from './pages/FacilitatorDashboard/ModeratorDashboard/ModeratorDashboard';

// // --- PLACEHOLDER DASHBOARDS ---
// // const ModerationDashboard = () => (
// //   <div style={{ padding: '2rem', textAlign: 'center' }}>
// //     <h1 style={{ color: '#16a34a', fontFamily: 'Oswald, sans-serif' }}>🟢 Moderation Room</h1>
// //     <p>Sample graded scripts and perform quality assurance validation.</p>
// //   </div>
// // );

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

//   // 2. Assessor Gate
//   if (user.role === 'assessor' && user.profileCompleted !== true) {
//     return <Navigate to="/setup-assessor" replace />;
//   }

//   // 3. Moderator Gate
//   if (user.role === 'moderator' && user.profileCompleted !== true) {
//     return <Navigate to="/setup-moderator" replace />;
//   }

//   // 4. Facilitator Gate
//   if (user.role === 'facilitator' && user.profileCompleted !== true) {
//     return <Navigate to="/setup-facilitator" replace />;
//   }

//   // Master Routing Switch
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

//           {/* Mandatory Compliance for Assessors */}
//           <Route path="/setup-assessor" element={
//             <RoleProtectedRoute allowedRoles={['assessor']}>
//               <AssessorProfileSetup />
//             </RoleProtectedRoute>
//           } />

//           {/* Mandatory Compliance for Moderators */}
//           <Route path="/setup-moderator" element={
//             <RoleProtectedRoute allowedRoles={['moderator']}>
//               <ModeratorProfileSetup />
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
//               <ModeratorDashboard />
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

// // // Facilitator & Assessor
// // import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout';
// // import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
// // import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
// // import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager/AssessmentManager';
// // import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder';
// // import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
// // import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
// // import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';
// // import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';
// // import { FacilitatorProfileSetup } from './pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup';

// // // Learner & Public
// // import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
// // import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
// // import PublicVerification from './pages/LearnerPortal/PublicVerification';
// // import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
// // import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
// // import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';

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
// //   if (isPractitioner && user.profileCompleted !== true) {
// //     return <Navigate to="/setup-practitioner" replace />;
// //   }

// //   // 3. Facilitator Gate
// //   if (user.role === 'facilitator' && user.profileCompleted !== true) {
// //     return <Navigate to="/setup-facilitator" replace />;
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

// //             // Explicitly map required properties to satisfy UserProfile interface,
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

// //           {/* Mandatory Compliance for Facilitators */}
// //           <Route path="/setup-facilitator" element={
// //             <RoleProtectedRoute allowedRoles={['facilitator']}>
// //               <FacilitatorProfileSetup />
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

// // // // --- TYPES ---
// // // import type { UserProfile, UserRole } from './types/auth.types';

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

// // //   // 🚀 FIX: Relaxed the gatekeeper for testing. It now ONLY checks the boolean flag.
// // //   // This prevents the infinite redirect loop if the user is missing a reg number in the DB.
// // //   if (isPractitioner && user.profileCompleted !== true) {
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
