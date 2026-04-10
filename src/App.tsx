// src/App.tsx

import { useEffect } from 'react';
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
import { SettingsPage } from './pages/SettingsPage/SettingsPage';
import { CertificateStudio } from './pages/AdminDashboard/CertificateStudio/CertificateStudio';
import { AdminProfileSetup } from './pages/AdminDashboard/AdminProfileSetup/AdminProfileSetup';
import { AccessManager } from './pages/AdminDashboard/AccessManager/AccessManager';

// Staff (Facilitator, Assessor, Moderator, Invigilator)
import { FacilitatorLayout } from './pages/FacilitatorDashboard/FacilitatorLayout/FacilitatorLayout';
import { FacilitatorDashboard } from './pages/FacilitatorDashboard/FacilitatorDashboard';
import { AttendancePage } from './pages/FacilitatorDashboard/AttendancePage';
import { AssessmentManager } from './pages/FacilitatorDashboard/AssessmentManager/AssessmentManager';
import { AssessmentBuilder } from './pages/FacilitatorDashboard/AssessmentBuilder/AssessmentBuilder';
import { AssessmentPreview } from './pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview';
import { SubmissionReview } from './pages/FacilitatorDashboard/SubmissionReview/SubmissionReview';
import { AssessorDashboard } from './pages/FacilitatorDashboard/AssessorDashboard/AssessorDashboard';
import InvigilatorDashboard from './components/views/InvigilatorDashboard/InvigilatorDashboard';

// Compliance & Profile Setup Gates
import { AssessorProfileSetup } from './pages/FacilitatorDashboard/AssessorProfileSetup/AssessorProfileSetup';
import { FacilitatorProfileSetup } from './pages/FacilitatorDashboard/FacilitatorProfileSetup/FacilitatorProfileSetup';
import { LearnerProfileSetup } from './pages/LearnerPortal/LearnerProfileSetup/LearnerProfileSetup';
import { ModeratorProfileSetup } from './pages/FacilitatorDashboard/ModeratorProfileSetup/ModeratorProfileSetup';
import { ModeratorDashboard } from './pages/FacilitatorDashboard/ModeratorDashboard/ModeratorDashboard';

// Mentor (Workplace)
import { MentorProfileSetup } from './pages/mentor/MentorProfileSetup/MentorProfileSetup';
import { MentorDashboard } from './pages/mentor/MentorDashboard/MentorDashboard';

// Learner & Public
import AssessmentPlayer from './pages/LearnerPortal/AssessmentPlayer/AssessmentPlayer';
import { ViewPortfolio } from './pages/Portfolio/ViewPortfolio';
import StatementOfResults from './pages/StatementOfResults/StatementOfResults';
import PublicVerification from './pages/LearnerPortal/PublicVerification';
import LearnerDashboard from './pages/LearnerPortal/LearnerDashboard/LearnerDashboard';
import { LearnerProfileView } from './components/views/LearnerProfileView/LearnerProfileView';
import { WorkplacesManager } from './components/admin/WorkplacesManager/WorkplacesManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CohortDetailsPage } from './pages/CohortDetails/CohortDetailsPage';
import { fetchStatssaCodes } from './services/qctoService';
import { PrivacyPolicy } from './components/views/PrivacyPolicy/PrivacyPolicy';
import Loader from './components/common/Loader/Loader';


// --- TRAFFIC CONTROLLER ---
const RootRedirect = () => {
  const user = useStore((state) => state.user);
  const loading = useStore((state) => state.loading);

  if (loading) return (
    <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'var(--mlab-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader message="Syncing Session..." fullScreen={false} />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  const rawUploadedDocs = (user as any).uploadedDocuments;
  const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];
  const hasDoc = (docId: string) => uploadedDocs.some((doc: any) => doc.id === docId && typeof doc.url === 'string' && doc.url.trim() !== '');

  // 1. Learner Compliance Logic
  const isLearnerCompliant = () => {
    if (user.role !== 'learner') return true;
    const d = (user as any).demographics || {};
    const hasDemographics = !!d.equityCode && !!d.provinceCode && (!!d.statssaAreaCode || !!d.statsaaAreaCode) && !!d.learnerTitle;
    return user.profileCompleted === true && hasDemographics && hasDoc('id') && hasDoc('qual');
  };

  // 2. Staff Compliance Logic
  const isStaffCompliant = () => {
    if (user.role === 'learner') return true;
    if (!user.profileCompleted) return false;

    const hasStaffProvince = !!(user as any).province;
    const isForeignNational = (user as any).nationalityType === 'Foreign National';
    const hasPermitIfForeign = isForeignNational ? hasDoc('permit') : true;

    switch (user.role) {
      case 'facilitator':
        return hasStaffProvince && hasDoc('id') && hasDoc('cv') && hasPermitIfForeign;
      case 'assessor':
        return hasStaffProvince && hasDoc('id') && hasDoc('assessor_cert') && hasDoc('reg_letter') && hasPermitIfForeign;
      case 'moderator':
        return hasStaffProvince && hasDoc('id') && hasDoc('moderator_cert') && hasDoc('reg_letter') && hasPermitIfForeign;
      case 'admin':
        if ((user as any).isSuperAdmin) return true;
        return hasStaffProvince && hasDoc('id') && hasDoc('appointment') && hasPermitIfForeign;
      case 'mentor':
        return hasStaffProvince;
      default:
        return true;
    }
  };

  // 3. APPLY GATES
  if (user.role === 'learner' && !isLearnerCompliant()) {
    return <Navigate to="/setup-profile" replace />;
  }

  const staffRoles = ['facilitator', 'assessor', 'moderator', 'mentor', 'admin'];
  if (staffRoles.includes(user.role) && !isStaffCompliant()) {
    return <Navigate to={`/setup-${user.role}`} replace />;
  }

  // 4. FINAL TRAFFIC CONTROL (Fully Compliant Users)
  switch (user.role) {
    case 'admin': return <Navigate to="/admin" replace />;
    case 'facilitator': return <Navigate to="/facilitator" replace />;
    case 'assessor': return <Navigate to="/marking" replace />;
    case 'moderator': return <Navigate to="/moderation" replace />;
    case 'mentor': return <Navigate to="/mentor" replace />;
    case 'learner': return <Navigate to="/portal" replace />;
    default: return <Navigate to="/login" replace />;
  }
};

function App() {
  const setUser = useStore((state) => state.setUser);
  const setLoading = useStore((state) => state.setLoading);
  const user = useStore((state) => state.user);
  const fetchSettings = useStore((state) => state.fetchSettings);

  const testFunc = async () => {
    const codes = await fetchStatssaCodes();
    console.log("Fetched STATSSA Codes:", codes);
  }

  useEffect(() => {
    testFunc();
    fetchSettings();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const userProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || data.email || '',
              fullName: data.fullName || 'Practitioner',
              role: data.role as UserRole,
              profilePhotoUrl: data.profilePhotoUrl || '',
              ...data,
              profileCompleted: data.profileCompleted === true,
            } as UserProfile;
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
    <ErrorBoundary>
      <Router>
        <div className="App">
          <Routes>
            {/* ================= PUBLIC ROUTES ================= */}
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/verify" element={<PublicVerification />} />
            <Route path="/sor/:id" element={<StatementOfResults />} />

            {/* LEGAL & COMPLIANCE ROUTES */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<PrivacyPolicy />} /> {/* Serving Privacy Policy temporarily as Terms */}

            {/* ================= ONBOARDING GATES ================= */}
            <Route path="/setup-admin" element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminProfileSetup />
              </RoleProtectedRoute>
            } />
            <Route path="/setup-profile" element={
              <RoleProtectedRoute allowedRoles={['learner']}>
                <LearnerProfileSetup />
              </RoleProtectedRoute>
            } />
            <Route path="/setup-assessor" element={
              <RoleProtectedRoute allowedRoles={['assessor']}>
                <AssessorProfileSetup />
              </RoleProtectedRoute>
            } />
            <Route path="/setup-moderator" element={
              <RoleProtectedRoute allowedRoles={['moderator']}>
                <ModeratorProfileSetup />
              </RoleProtectedRoute>
            } />
            <Route path="/setup-facilitator" element={
              <RoleProtectedRoute allowedRoles={['facilitator']}>
                <FacilitatorProfileSetup />
              </RoleProtectedRoute>
            } />
            <Route path="/setup-mentor" element={
              <RoleProtectedRoute allowedRoles={['mentor']}>
                <MentorProfileSetup />
              </RoleProtectedRoute>
            } />

            {/* ================= PROTECTED ROUTES ================= */}

            {/* ADMIN CONSOLE (Includes Profile within its own Sidebar logic) */}
            <Route path="/admin" element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </RoleProtectedRoute>
            } />

            {/* STANDALONE ADMIN PAGES */}
            {/* 🚀 SUPER ADMIN ONLY: ACCESS MANAGER */}
            <Route path="/admin/access" element={
              <RoleProtectedRoute allowedRoles={['admin']} requireSuperAdmin={true}>
                <AccessManager />
              </RoleProtectedRoute>
            } />

            <Route path="/admin/studio" element={
              <RoleProtectedRoute allowedRoles={['admin', 'facilitator']}>
                <CertificateStudio />
              </RoleProtectedRoute>
            } />
            <Route path="/admin/workplaces" element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <WorkplacesManager />
              </RoleProtectedRoute>
            } />
            <Route path="/settings" element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <SettingsPage />
              </RoleProtectedRoute>
            } />
            <Route path="/admin/learners/:learnerId" element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <LearnerProfileView />
              </RoleProtectedRoute>
            } />
            <Route path="/admin/invigilate/:assessmentId" element={
              <RoleProtectedRoute allowedRoles={['admin', 'facilitator']}>
                <InvigilatorDashboard />
              </RoleProtectedRoute>
            } />

            {/* LEARNER PORTAL */}
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

            {/* FACILITATOR SUITE */}
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
              {/* <Route path="assessments" element={<AssessmentManager />} /> */}
              <Route path="assessments" element={<FacilitatorDashboard />} />
              <Route path="assessments/builder/:assessmentId?" element={<AssessmentBuilder />} />
            </Route>

            {/* SHARED VIEWS */}
            <Route path="/admin/assessment/preview/:assessmentId" element={
              <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator', 'mentor']}>
                <AssessmentPreview />
              </RoleProtectedRoute>
            } />
            <Route path="/cohorts/:cohortId" element={
              <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator', 'mentor']}>
                <CohortDetailsPage />
              </RoleProtectedRoute>
            } />
            <Route path="/portfolio/:id" element={
              <RoleProtectedRoute allowedRoles={['admin', 'assessor', 'moderator', 'facilitator', 'learner', 'mentor']}>
                <ViewPortfolio />
              </RoleProtectedRoute>
            } />
            <Route path="/portfolio/submission/:submissionId" element={
              <RoleProtectedRoute allowedRoles={['admin', 'facilitator', 'assessor', 'moderator', 'mentor']}>
                <SubmissionReview />
              </RoleProtectedRoute>
            } />

            {/* ASSESSOR / MODERATOR / MENTOR */}
            <Route path="/marking/*" element={
              <RoleProtectedRoute allowedRoles={['assessor']}>
                <AssessorDashboard />
              </RoleProtectedRoute>
            } />
            <Route path="/moderation/*" element={
              <RoleProtectedRoute allowedRoles={['moderator']}>
                <ModeratorDashboard />
              </RoleProtectedRoute>
            } />
            <Route path="/mentor/*" element={
              <RoleProtectedRoute allowedRoles={['mentor']}>
                <MentorDashboard />
              </RoleProtectedRoute>
            } />

            {/* ================= FALLBACKS ================= */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;