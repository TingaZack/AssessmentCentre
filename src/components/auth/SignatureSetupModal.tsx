import React, { useRef, useState, useMemo } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore'; // 🚀 Hook into your global state
import { Loader, Save, Eraser, Info } from 'lucide-react';

interface Props {
    userUid: string;
    onComplete: () => void;
}

export const SignatureSetupModal: React.FC<Props> = ({ userUid, onComplete }) => {
    const sigPad = useRef<SignatureCanvas>(null);
    const [loading, setLoading] = useState(false);
    const { user } = useStore(); // Get current user info

    // 🚀 STRICT COMPLIANCE: Determine Pen Color based on Role
    const penSettings = useMemo(() => {
        const role = user?.role?.toLowerCase();
        switch (role) {
            case 'facilitator':
                return { color: 'blue', label: 'Facilitator (Blue Pen)' };
            case 'assessor':
                return { color: 'red', label: 'Assessor (Red Pen)' };
            case 'moderator':
                return { color: 'green', label: 'Moderator (Green Pen)' };
            default:
                return { color: 'black', label: 'Learner (Black Pen)' };
        }
    }, [user]);

    const clear = () => sigPad.current?.clear();

    const saveSignature = async () => {
        if (!sigPad.current || sigPad.current.isEmpty()) {
            alert("Please sign before saving.");
            return;
        }

        setLoading(true);

        try {
            // Use getCanvas() to avoid the trim crash mentioned previously
            const canvas = sigPad.current.getCanvas();
            const dataUrl = canvas.toDataURL('image/png');

            if (!dataUrl) throw new Error("Could not generate image data");

            // 1. Upload to Firebase Storage
            const storage = getStorage();
            const storageRef = ref(storage, `signatures/${userUid}.png`);
            await uploadString(storageRef, dataUrl, 'data_url');
            const downloadUrl = await getDownloadURL(storageRef);

            // 2. Update User Profile in Firestore
            const userRef = doc(db, 'users', userUid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                throw new Error("User profile document not found.");
            }

            await updateDoc(userRef, {
                signatureUrl: downloadUrl,
                signatureDate: new Date().toISOString(),
                hasSignature: true,
                signatureColor: penSettings.color // Store the color for audit purposes
            });

            onComplete();
        } catch (error: any) {
            console.error("Error saving signature:", error);
            alert(`Failed to save signature: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 46, 58, 0.9)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: 'white', padding: '2.5rem', borderRadius: '16px',
                maxWidth: '520px', width: '90%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
            }}>
                <h2 style={{ color: '#073f4e', marginBottom: '0.75rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                    Register Digital Signature
                </h2>

                {/* 🚀 Pen Role Indicator */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: '#f1f5f9',
                    borderRadius: '99px',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: penSettings.color }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                        {penSettings.label} Assigned
                    </span>
                </div>

                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.5' }}>
                    Sign inside the box below. In accordance with QCTO requirements, your role as a <strong>{user?.role}</strong> requires signatures to be captured in <strong>{penSettings.color}</strong> ink.
                </p>

                <div style={{
                    border: `2px solid ${penSettings.color === 'black' ? '#e2e8f0' : penSettings.color}`,
                    borderRadius: '12px', marginBottom: '2rem',
                    background: '#f8fafc', overflow: 'hidden', cursor: 'crosshair',
                    opacity: loading ? 0.5 : 1
                }}>
                    <SignatureCanvas
                        ref={sigPad}
                        penColor={penSettings.color} // 🚀 The Pen Color is now dynamic
                        canvasProps={{
                            width: 450,
                            height: 200,
                            className: 'sigCanvas',
                            style: { maxWidth: '100%', height: 'auto' }
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button
                        onClick={clear}
                        disabled={loading}
                        style={{
                            padding: '0.8rem 1.5rem', border: '1px solid #e2e8f0', color: '#475569',
                            background: 'white', borderRadius: '8px', cursor: 'pointer',
                            display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 500
                        }}
                    >
                        <Eraser size={18} /> Clear
                    </button>

                    <button
                        onClick={saveSignature}
                        disabled={loading}
                        style={{
                            padding: '0.8rem 1.5rem',
                            background: penSettings.color === 'black' ? '#073f4e' : penSettings.color,
                            color: 'white',
                            border: 'none', borderRadius: '8px', fontWeight: 'bold',
                            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex',
                            gap: '0.5rem', alignItems: 'center', boxShadow: `0 4px 14px 0 ${penSettings.color}44`
                        }}
                    >
                        {loading ? (
                            <><Loader className="spin" size={18} /> Processing...</>
                        ) : (
                            <><Save size={18} /> Register Signature</>
                        )}
                    </button>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.75rem' }}>
                    <Info size={14} /> Digital Timestamp & Biometric Ink Tracking Enabled
                </div>

                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .spin { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        </div>
    );
};


// import React, { useRef, useState } from 'react';
// import SignatureCanvas from 'react-signature-canvas';
// import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
// import { doc, updateDoc, getDoc } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { Loader, Save, Eraser } from 'lucide-react';

// interface Props {
//     userUid: string;
//     onComplete: () => void;
// }

// export const SignatureSetupModal: React.FC<Props> = ({ userUid, onComplete }) => {
//     const sigPad = useRef<SignatureCanvas>(null);
//     const [loading, setLoading] = useState(false);

//     const clear = () => sigPad.current?.clear();

//     const saveSignature = async () => {
//         // Basic validation
//         if (!sigPad.current || sigPad.current.isEmpty()) {
//             alert("Please sign before saving.");
//             return;
//         }

//         setLoading(true);

//         try {
//             // 1. FIX: Use getCanvas() instead of getTrimmedCanvas() 
//             // This avoids the 'import_trim_canvas.default' crash
//             const canvas = sigPad.current.getCanvas();
//             const dataUrl = canvas.toDataURL('image/png');

//             if (!dataUrl) throw new Error("Could not generate image data");

//             // 2. Upload to Firebase Storage
//             const storage = getStorage();
//             const storageRef = ref(storage, `signatures/${userUid}.png`);

//             // Upload the base64 string
//             await uploadString(storageRef, dataUrl, 'data_url');
//             const downloadUrl = await getDownloadURL(storageRef);

//             // 3. Update User Profile in Firestore
//             const userRef = doc(db, 'users', userUid);

//             // Safety Check: Verify the user document exists first
//             const userSnap = await getDoc(userRef);
//             if (!userSnap.exists()) {
//                 throw new Error("User profile document not found in Firestore.");
//             }

//             await updateDoc(userRef, {
//                 signatureUrl: downloadUrl,
//                 signatureDate: new Date().toISOString(),
//                 hasSignature: true // Useful flag for conditional rendering elsewhere
//             });

//             // 4. Success!
//             onComplete();
//         } catch (error: any) {
//             console.error("Error saving signature:", error);
//             alert(`Failed to save signature: ${error.message || "Please try again."}`);
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div style={{
//             position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
//             display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
//         }}>
//             <div style={{
//                 background: 'white', padding: '2.5rem', borderRadius: '16px',
//                 maxWidth: '520px', width: '90%', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
//             }}>
//                 <h2 style={{ color: '#073f4e', marginBottom: '0.75rem' }}>Digital Signature Required</h2>
//                 <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: '1.5' }}>
//                     To comply with <strong>QCTO regulations</strong>, you must register your digital signature.
//                     This is used to legally sign assessment records and attendance logs.
//                 </p>

//                 <div style={{
//                     border: '2px dashed #e2e8f0', borderRadius: '12px', marginBottom: '2rem',
//                     background: '#f8fafc', overflow: 'hidden', cursor: 'crosshair'
//                 }}>
//                     <SignatureCanvas
//                         ref={sigPad}
//                         penColor="#0f172a"
//                         canvasProps={{
//                             width: 450,
//                             height: 200,
//                             className: 'sigCanvas',
//                             style: { maxWidth: '100%', height: 'auto' }
//                         }}
//                     />
//                 </div>

//                 <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
//                     <button
//                         onClick={clear}
//                         disabled={loading}
//                         style={{
//                             padding: '0.8rem 1.5rem', border: '1px solid #e2e8f0', color: '#475569',
//                             background: 'white', borderRadius: '8px', cursor: 'pointer',
//                             display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 500
//                         }}
//                     >
//                         <Eraser size={18} /> Clear
//                     </button>

//                     <button
//                         onClick={saveSignature}
//                         disabled={loading}
//                         style={{
//                             padding: '0.8rem 1.5rem', background: '#94c73d', color: '#073f4e',
//                             border: 'none', borderRadius: '8px', fontWeight: 'bold',
//                             cursor: loading ? 'not-allowed' : 'pointer', display: 'flex',
//                             gap: '0.5rem', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(148, 199, 61, 0.3)'
//                         }}
//                     >
//                         {loading ? (
//                             <>
//                                 <Loader className="spin" size={18} /> Saving...
//                             </>
//                         ) : (
//                             <>
//                                 <Save size={18} /> Save & Continue
//                             </>
//                         )}
//                     </button>
//                 </div>

//                 <style>{`
//                     @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
//                     .spin { animation: spin 1s linear infinite; }
//                 `}</style>
//             </div>
//         </div>
//     );
// };