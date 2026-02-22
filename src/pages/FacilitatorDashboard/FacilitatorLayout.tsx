import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { Sidebar } from '../../components/dashboard/Sidebar';

export const FacilitatorLayout: React.FC = () => {
    // 🚀 FIX 1: Destructure 'user' from the store
    const { user, setUser } = useStore();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active nav for the sidebar highlight
    const currentNav = location.pathname.includes('attendance') ? 'attendance' :
        location.pathname.includes('assessments') ? 'assessments' :
            location.pathname.includes('profile') ? 'profile' : 'dashboard';

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            navigate('/login');
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <div className="admin-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            <Sidebar
                role={user?.role}
                currentNav={currentNav}
                onLogout={handleLogout}
            />

            <main className="main-wrapper" style={{ flex: 1, background: '#f8fafc', overflowY: 'auto' }}>
                <div className="admin-content" style={{ padding: '2rem' }}>
                    {/* ONLY the specific page content loads here */}
                    <Outlet />
                </div>
            </main>
        </div>
    );
};


// import React from 'react';
// import { Outlet, useNavigate, useLocation } from 'react-router-dom';
// import { FacilitatorSidebar } from '../../components/dashboard/FacilitatorSidebar';
// import { useStore } from '../../store/useStore';
// import { auth } from '../../lib/firebase';
// import { signOut } from 'firebase/auth';
// import { Sidebar } from '../../components/dashboard/Sidebar';

// export const FacilitatorLayout: React.FC = () => {
//     const { setUser } = useStore();
//     const navigate = useNavigate();
//     const location = useLocation();

//     // // Determine active nav for the sidebar highlight
//     // const currentNav = location.pathname.includes('attendance') ? 'attendance' :
//     //     location.pathname.includes('profile') ? 'profile' : 'dashboard';

//     const currentNav = location.pathname.includes('attendance') ? 'attendance' :
//         location.pathname.includes('profile') ? 'profile' : 'dashboard';


//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             setUser(null);
//             navigate('/login');
//         } catch (error) {
//             console.error("Logout failed:", error);
//         }
//     };

//     return (
//         <div className="admin-layout">
//             {/* The Sidebar stays fixed while you navigate between tabs */}
//             {/* <FacilitatorSidebar kjdbskj
//                 currentNav={currentNav}
//                 onNavChange={(nav) => navigate(`/facilitator/${nav}`)}
//                 onLogout={handleLogout}
//             /> */}

//             <Sidebar
//                 role={store.user?.role}
//                 currentNav={currentNav}
//                 setCurrentNav={setCurrentNav as any}
//                 onLogout={handleLogout}
//             />

//             <main className="main-wrapper" style={{ width: '100%', background: '#f8fafc' }}>
//                 <div className="admin-contet">
//                     {/* ONLY the specific page content loads here */}
//                     <Outlet />
//                 </div>
//             </main>
//         </div>
//     );
// };


// // import React from 'react';
// // import { Outlet, useNavigate, useLocation } from 'react-router-dom';
// // import { FacilitatorSidebar } from '../../components/dashboard/FacilitatorSidebar';
// // import { useStore } from '../../store/useStore';
// // import { auth } from '../../lib/firebase';
// // import { signOut } from 'firebase/auth';

// // export const FacilitatorLayout: React.FC = () => {
// //     const { setUser } = useStore();
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Determine active nav based on URL path
// //     const currentNav = location.pathname.includes('attendance') ? 'attendance' :
// //         location.pathname.includes('profile') ? 'profile' : 'dashboard';

// //     const handleLogout = async () => {
// //         await signOut(auth);
// //         setUser(null);
// //         navigate('/login');
// //     };

// //     return (
// //         <div className="admin-layout">
// //             <FacilitatorSidebar
// //                 currentNav={currentNav}
// //                 onNavChange={(nav) => navigate(`/facilitator/${nav}`)}
// //                 onLogout={handleLogout}
// //             />
// //             {/* <main className="main-wrapper">
// //                 <div className="admin-content">
// //                     <Outlet /> 
// //                 </div>
// //             </main> */}
// //             <main
// //                 className="main-wrapper"
// //                 style={{
// //                     minHeight: '100vh',
// //                     width: '100%',
// //                     display: 'flex',
// //                     flexDirection: 'column'
// //                 }}
// //             >
// //                 <div style={{ width: '100%' }}>

// //                     <Outlet />

// //                 </div>
// //             </main>

// //         </div>
// //     );
// // };