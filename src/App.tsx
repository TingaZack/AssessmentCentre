import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import StatementOfResults from './pages/StatementOfResults/StatementOfResults';
import LearnerPortal from './pages/LearnerPortal/LearnerPortal';
import { ProtectedRoute } from './auth/ProtectedRoute';
import Login from './pages/Login/Login';

function App() {
  return (
    // 1. Wrap the entire application in the Router
    <Router>
      <div className="App">
        {/* REMOVED: The global <nav> block. 
           Now each page (Dashboard, Login, Portal) controls its own layout.
        */}

        <Routes>
          {/* Public: Learner Portal */}
          <Route path="/portal" element={<LearnerPortal />} />

          {/* Public: Statement of Results (Required for learners) */}
          <Route path="/sor/:id" element={<StatementOfResults />} />

          {/* Public: Admin Login */}
          <Route path="/login" element={<Login />} />

          {/* PROTECTED: Admin Dashboard */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

// --- Styles (Preserved from your code) ---

const navStyle: React.CSSProperties = {
  background: '#073f4e',
  padding: '1rem 2rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  position: 'relative',
  zIndex: 100,
  height: '80px', // Fixed height for layout calculation
  boxSizing: 'border-box'
};

const navBrand: React.CSSProperties = {
  color: 'white',
  fontWeight: 'bold',
  fontSize: '1.5rem',
  letterSpacing: '1px',
  fontFamily: 'Oswald, sans-serif'
};

const baseTab: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
  textDecoration: 'none', // Added for Link component
  display: 'inline-block'
};

const activeTab: React.CSSProperties = {
  ...baseTab,
  background: '#94c73d',
  color: 'white'
};

export default App;



// import React, { useState } from 'react';
// import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
// import StatementOfResults from './pages/StatementOfResults/StatementOfResults';

// function App() {
//   const [currentView, setCurrentView] = useState<'admin' | 'sor'>('admin');

//   return (
//     <div className="App">
//       {/* Super simple global navigation bar */}
//       <nav style={navStyle}>
//         <div style={navBrand}>mLab Portal</div>
//         <div style={{ display: 'flex', gap: '1rem' }}>
//           <button
//             style={currentView === 'admin' ? activeTab : inactiveTab}
//             onClick={() => setCurrentView('admin')}
//           >
//             Admin Dashboard
//           </button>
//           <button
//             style={currentView === 'sor' ? activeTab : inactiveTab}
//             onClick={() => setCurrentView('sor')}
//           >
//             View Sample SoR
//           </button>
//         </div>
//       </nav>

//       {/* Conditional Rendering based on the selected tab */}
//       {currentView === 'admin' && <AdminDashboard />}
//       {currentView === 'sor' && <StatementOfResults />}
//     </div>
//   );
// }

// // Inline styles for the temporary navigation bar
// const navStyle: React.CSSProperties = {
//   background: '#073f4e',
//   padding: '1rem 2rem',
//   display: 'flex',
//   justifyContent: 'space-between',
//   alignItems: 'center',
//   boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
//   position: 'relative',
//   zIndex: 100
// };

// const navBrand: React.CSSProperties = {
//   color: 'white',
//   fontWeight: 'bold',
//   fontSize: '1.2rem',
//   letterSpacing: '1px'
// };

// const baseTab: React.CSSProperties = {
//   padding: '0.5rem 1rem',
//   borderRadius: '4px',
//   border: 'none',
//   fontWeight: 600,
//   cursor: 'pointer',
//   transition: 'all 0.2s'
// };

// const activeTab: React.CSSProperties = {
//   ...baseTab,
//   background: '#94c73d',
//   color: 'white'
// };

// const inactiveTab: React.CSSProperties = {
//   ...baseTab,
//   background: 'transparent',
//   color: '#a0aec0',
//   border: '1px solid #a0aec0'
// };

// export default App;

// // import StatementOfResults from './pages/StatementOfResults/StatementOfResults';

// // function App() {
// //   return (
// //     <div className="App">
// //       <StatementOfResults />
// //     </div>
// //   );
// // }

// // export default App;