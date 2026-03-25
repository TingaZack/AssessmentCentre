import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, Loader } from 'lucide-react';
import './Login.css';

import mLabLogo from '../../assets/logo/mlab_logo.png';


const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Authenticate with Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            // 2. Fetch User Profile to determine Role
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                const role = userData.role || 'learner'; // Default to learner if undefined

                console.log(`User authenticated. UID: ${uid}, Role: ${role}`);

                // 3. Smart Redirect based on Role
                switch (role) {
                    case 'admin':
                        navigate('/admin');
                        break;
                    case 'learner':
                        navigate('/classroom');
                        break;
                    case 'facilitator':
                        navigate('/facilitator');
                        break;
                    case 'assessor':
                        navigate('/marking');
                        break;
                    case 'moderator':
                        navigate('/moderation');
                        break;
                    default:
                        navigate('/classroom');
                }
            } else {
                console.warn("User authenticated in Auth but has no Firestore profile.");
                // For MVP: Default to classroom or show an error
                // navigate('/classroom'); 
                setError("No user profile found. Please contact support.");
            }
        } catch (err: any) {
            console.error("Login Error:", err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError("Invalid email or password.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Too many failed attempts. Try again later.");
            } else {
                setError("Login failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #073f4e, #94c73d)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <div style={{
                background: 'white',
                padding: '2.5rem',
                borderRadius: '12px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                width: '100%',
                maxWidth: '400px',
                textAlign: 'center'
            }}>
                {/* Brand Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <div className="logo-text" style={{ fontSize: '2.5rem', fontWeight: '300', marginBottom: '0.5rem', fontFamily: 'Oswald, sans-serif' }}>
                        {/* <span style={{ color: '#94c73d' }}>m</span><span style={{ color: '#073f4e' }}>lab</span> */}
                        <img src={mLabLogo} height={70} alt="" />
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#64748b' }}>Assessment Platform</h2>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '8px',
                            color: 'black',
                            border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
                        }}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '8px',
                            color: 'black',
                            border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
                        }}
                    />

                    {error && (
                        <div style={{
                            color: '#ef4444', fontSize: '0.9rem', display: 'flex',
                            alignItems: 'center', gap: '0.5rem', background: '#fef2f2',
                            padding: '0.75rem', borderRadius: '6px', textAlign: 'left', border: '1px solid #fecaca'
                        }}>
                            <AlertCircle size={18} /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            background: '#073f4e',
                            color: 'white',
                            padding: '1rem',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginTop: '0.5rem',
                            transition: 'all 0.2s',
                            textTransform: 'uppercase',
                            letterSpacing: '1px'
                        }}
                    >
                        {loading ? <Loader className="spin" size={20} /> : <><Lock size={18} /> Secure Login</>}
                    </button>
                </form>

                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#94a3b8' }}>
                    <p>Having trouble signing in?</p>
                    <a href="mailto:support@mlab.co.za" style={{ color: '#073f4e', fontWeight: 600, textDecoration: 'none' }}>Contact Support</a>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>Looking for public results? </span>
                    <a href="/portal" style={{ color: '#94c73d', fontWeight: 600, textDecoration: 'none' }}>
                        Verify a Result
                    </a>
                </div>
            </div>
        </div>
    );
};

export default Login;


// // import React, { useState } from 'react';
// // import { signInWithEmailAndPassword } from 'firebase/auth';
// // import { doc, getDoc } from 'firebase/firestore';
// // import { auth, db } from '../../lib/firebase';
// // import { useNavigate } from 'react-router-dom';
// // import { Lock, AlertCircle, Loader } from 'lucide-react';
// // import './Login.css'; // Reusing your existing styles

// // const Login: React.FC = () => {
// //     const [email, setEmail] = useState('');
// //     const [password, setPassword] = useState('');
// //     const [error, setError] = useState('');
// //     const [loading, setLoading] = useState(false);
// //     const navigate = useNavigate();

// //     const handleLogin = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setLoading(true);
// //         setError('');

// //         try {
// //             // 1. Authenticate with Firebase Auth
// //             const userCredential = await signInWithEmailAndPassword(auth, email, password);
// //             const uid = userCredential.user.uid;

// //             // 2. Fetch User Profile to determine Role
// //             const docRef = doc(db, 'users', uid);
// //             const docSnap = await getDoc(docRef);

// //             if (docSnap.exists()) {
// //                 const userData = docSnap.data();
// //                 const role = userData.role || 'learner'; // Default to learner if undefined

// //                 // 3. Smart Redirect based on Role
// //                 switch (role) {
// //                     case 'admin':
// //                         navigate('/admin');
// //                         break;
// //                     case 'learner':
// //                         // Send learners to their PRIVATE classroom, not the public search
// //                         navigate('/classroom');
// //                         break;
// //                     case 'facilitator':
// //                         navigate('/facilitator');
// //                         break;
// //                     case 'assessor':
// //                         navigate('/marking');
// //                         break;
// //                     case 'moderator':
// //                         navigate('/moderation');
// //                         break;
// //                     default:
// //                         navigate('/classroom');
// //                 }
// //             } else {
// //                 // Edge case: User is in Auth but has no Firestore profile
// //                 // You might want to auto-create a profile here or show an error
// //                 console.warn("User authenticated but no profile found.");
// //                 setError("Profile not found. Please contact your administrator.");
// //                 // Optional: navigate('/setup-profile');
// //             }
// //         } catch (err: any) {
// //             console.error("Login Error:", err);
// //             // Friendly error messages
// //             if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
// //                 setError("Invalid email or password.");
// //             } else if (err.code === 'auth/too-many-requests') {
// //                 setError("Too many failed attempts. Try again later.");
// //             } else {
// //                 setError("Login failed. Please try again.");
// //             }
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     return (
// //         <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'linear-gradient(135deg, #073f4e, #94c73d)' }}>
// //             <div style={{
// //                 minHeight: '100vh',
// //                 display: 'flex',
// //                 justifyContent: 'center',
// //                 alignItems: 'center',
// //             }}>
// //                 hvhjvjhjhv
// //                 <div style={{
// //                     background: 'white',
// //                     padding: '2.5rem',
// //                     borderRadius: '12px',
// //                     boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
// //                     width: '100%',
// //                     maxWidth: '400px',
// //                     textAlign: 'center'
// //                 }}>
// //                     {/* Brand Header */}
// //                     <div style={{ marginBottom: '2rem' }}>
// //                         <div className="logo-text" style={{ fontSize: '2.5rem', fontWeight: '300', marginBottom: '0.5rem', fontFamily: 'Oswald, sans-serif' }}>
// //                             <span style={{ color: '#94c73d' }}>m</span><span style={{ color: '#073f4e' }}>lab</span>
// //                         </div>
// //                         <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#64748b' }}>Assessment Platform</h2>
// //                     </div>

// //                     <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                         <div className="input-group">
// //                             <input
// //                                 type="email"
// //                                 placeholder="Email Address"
// //                                 value={email}
// //                                 onChange={(e) => setEmail(e.target.value)}
// //                                 required
// //                                 style={{
// //                                     width: '100%', padding: '1rem', borderRadius: '8px',
// //                                     border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
// //                                 }}
// //                             />
// //                         </div>
// //                         <div className="input-group">
// //                             <input
// //                                 type="password"
// //                                 placeholder="Password"
// //                                 value={password}
// //                                 onChange={(e) => setPassword(e.target.value)}
// //                                 required
// //                                 style={{
// //                                     width: '100%', padding: '1rem', borderRadius: '8px',
// //                                     border: '2px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box'
// //                                 }}
// //                             />
// //                         </div>

// //                         {error && (
// //                             <div style={{
// //                                 color: '#ef4444', fontSize: '0.9rem', display: 'flex',
// //                                 alignItems: 'center', gap: '0.5rem', background: '#fef2f2',
// //                                 padding: '0.75rem', borderRadius: '6px', textAlign: 'left', border: '1px solid #fecaca'
// //                             }}>
// //                                 <AlertCircle size={18} /> {error}
// //                             </div>
// //                         )}

// //                         <button
// //                             type="submit"
// //                             disabled={loading}
// //                             style={{
// //                                 background: '#073f4e',
// //                                 color: 'white',
// //                                 padding: '1rem',
// //                                 borderRadius: '8px',
// //                                 border: 'none',
// //                                 fontSize: '1rem',
// //                                 fontWeight: 700,
// //                                 cursor: loading ? 'not-allowed' : 'pointer',
// //                                 display: 'flex',
// //                                 justifyContent: 'center',
// //                                 alignItems: 'center',
// //                                 gap: '0.5rem',
// //                                 marginTop: '0.5rem',
// //                                 transition: 'all 0.2s',
// //                                 textTransform: 'uppercase',
// //                                 letterSpacing: '1px'
// //                             }}
// //                         >
// //                             {loading ? <Loader className="spin" size={20} /> : <><Lock size={18} /> Secure Login</>}
// //                         </button>
// //                     </form>

// //                     <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#94a3b8' }}>
// //                         <p>Having trouble signing in?</p>
// //                         <a href="mailto:support@mlab.co.za" style={{ color: '#073f4e', fontWeight: 600, textDecoration: 'none' }}>Contact Support</a>
// //                     </div>

// //                     {/* Public Portal Link */}
// //                     <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
// //                         <span style={{ color: '#94a3b8' }}>Looking for public results? </span>
// //                         <a href="/portal" style={{ color: '#94c73d', fontWeight: 600, textDecoration: 'none' }}>
// //                             Verify a Result
// //                         </a>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // export default Login;

// import React, { useState } from 'react';
// import { signInWithEmailAndPassword } from 'firebase/auth';
// import { auth } from '../../lib/firebase';
// import { useNavigate } from 'react-router-dom';
// import { Lock, AlertCircle, Loader } from 'lucide-react';
// import './Login.css';

// const Login: React.FC = () => {
//     const [email, setEmail] = useState('');
//     const [password, setPassword] = useState('');
//     const [error, setError] = useState('');
//     const [loading, setLoading] = useState(false);
//     const navigate = useNavigate();

//     console.log('Hello world')

//     const handleLogin = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setLoading(true);
//         setError('');

//         try {
//             await signInWithEmailAndPassword(auth, email, password);
//             navigate('/'); // Success! Go to Dashboard
//         } catch (err: any) {
//             console.error(err);
//             setError("Invalid email or password.");
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div style={{ background: 'red', position: 'absolute', left: 0, top: 0, right: 0 }}>
//             lkkmlkmlk
//             <div style={{
//                 minHeight: '100vh',
//                 display: 'flex',
//                 // width: "150vh",
//                 justifyContent: 'center',
//                 alignItems: 'center',
//                 position: 'absolute',
//                 left: 0, right: 0,
//                 top: 0, bottom: 0,
//                 background: 'linear-gradient(135deg, #073f4e, #94c73d)'
//             }}>
//                 <div style={{
//                     background: 'white',
//                     padding: '2.5rem',
//                     borderRadius: '12px',
//                     boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
//                     width: '100%',
//                     maxWidth: '400px',
//                     textAlign: 'center'
//                 }}>
//                     <div style={{ marginBottom: '1.5rem', color: '#073f4e' }}>
//                         <div className="logo-text" style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
//                             <span style={{ color: '#94c73d' }}>m</span>lab
//                         </div>
//                         <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Admin Login</h2>
//                     </div>

//                     <form onSubmit={handleLogin} style={{ display: 'flex', color: 'black', flexDirection: 'column', gap: '1rem' }}>
//                         <input
//                             type="email"
//                             placeholder="Email Address"
//                             value={email}
//                             onChange={(e) => setEmail(e.target.value)}
//                             required
//                             style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
//                         />
//                         <input
//                             type="password"
//                             placeholder="Password"
//                             value={password}
//                             onChange={(e) => setPassword(e.target.value)}
//                             required
//                             style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
//                         />

//                         {error && (
//                             <div style={{ color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', padding: '0.5rem', borderRadius: '4px' }}>
//                                 <AlertCircle size={16} /> {error}
//                             </div>
//                         )}

//                         <button
//                             type="submit"
//                             disabled={loading}
//                             style={{
//                                 background: '#073f4e',
//                                 color: 'white',
//                                 padding: '0.8rem',
//                                 borderRadius: '6px',
//                                 border: 'none',
//                                 fontSize: '1rem',
//                                 fontWeight: 600,
//                                 cursor: loading ? 'not-allowed' : 'pointer',
//                                 display: 'flex',
//                                 justifyContent: 'center',
//                                 alignItems: 'center',
//                                 gap: '0.5rem'
//                             }}
//                         >
//                             {loading ? <Loader className="spin" size={18} /> : <><Lock size={18} /> Login</>}
//                         </button>
//                     </form>
//                 </div>
//             </div>
//         </div>
//     );
// };

// export default Login;