// src/components/common/SignatureSetupModal/SignatureSetupModal.tsx

import React, { useRef, useState, useMemo, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import {
    Loader, Save, Eraser, Info, Briefcase, UploadCloud,
    Edit2, Image as ImageIcon, Trash2, X, Check, PenTool, RotateCw
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { ToastContainer, useToast } from '../common/Toast/Toast';

interface Props {
    userUid: string;
    existingSignatureUrl?: string;
    onComplete: () => void;
}

export const SignatureSetupModal: React.FC<Props> = ({ userUid, existingSignatureUrl, onComplete }) => {
    const sigPad = useRef<SignatureCanvas>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    const [loading, setLoading] = useState(false);
    const [inputMode, setInputMode] = useState<'preview' | 'draw' | 'upload'>(existingSignatureUrl ? 'preview' : 'draw');

    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
    const [rotation, setRotation] = useState<number>(0);

    const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);

    const toast = useToast();
    const { user, employers, fetchEmployers } = useStore();

    useEffect(() => {
        if (user?.role === 'mentor' && employers.length === 0) {
            fetchEmployers();
        }
    }, [user?.role, employers.length, fetchEmployers]);

    const mentorEmployer = useMemo(() => employers.find((e: any) => e.id === user?.employerId), [employers, user?.employerId]);
    const displayCompanyName = mentorEmployer?.name || user?.companyName || 'Unassigned Workplace';

    // STRICT COMPLIANCE: Determine Pen Color based on Role
    const penSettings = useMemo(() => {
        const role = user?.role?.toLowerCase();
        switch (role) {
            case 'facilitator':
            case 'mentor':
                return { color: '#0ea5e9', rgb: [14, 165, 233], label: role === 'mentor' ? 'Workplace Mentor (Blue Pen)' : 'Facilitator (Blue Pen)' };
            case 'assessor':
                return { color: '#ef4444', rgb: [239, 68, 68], label: 'Assessor (Red Pen)' };
            case 'moderator':
                return { color: '#22c55e', rgb: [34, 197, 94], label: 'Moderator (Green Pen)' };
            default:
                return { color: '#0f172a', rgb: [15, 23, 42], label: 'Learner (Black Pen)' };
        }
    }, [user]);

    const clear = () => {
        if (inputMode === 'draw') {
            sigPad.current?.clear();
        } else if (inputMode === 'upload') {
            setUploadedDataUrl(null);
            setRawImageSrc(null);
            setRotation(0);
        }
        setHasChanges(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsProcessingImage(true);
            const reader = new FileReader();
            reader.onload = (event) => {
                setRawImageSrc(event.target?.result as string);
                setRotation(0);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    // ─── SMART CANVAS IMAGE PROCESSING WITH AUTO-CROP ───
    useEffect(() => {
        if (!rawImageSrc) return;

        const img = new Image();
        img.onload = () => {
            const canvas = hiddenCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const MAX_WIDTH = 800;
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }

            const isRotated = rotation === 90 || rotation === 270;
            canvas.width = isRotated ? height : width;
            canvas.height = isRotated ? width : height;

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(img, -width / 2, -height / 2, width, height);
            ctx.restore();

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const targetRgb = penSettings.rgb;

            let minBrightness = 255;
            let maxBrightness = 0;

            for (let i = 0; i < data.length; i += 4) {
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                if (brightness < minBrightness) minBrightness = brightness;
                if (brightness > maxBrightness) maxBrightness = brightness;
            }

            const threshold = minBrightness + ((maxBrightness - minBrightness) * 0.55);

            // Bounding box variables for Auto-Cropping
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            let hasInk = false;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const brightness = (r + g + b) / 3;

                if (brightness > threshold) {
                    data[i + 3] = 0; // Make paper fully transparent
                } else {
                    data[i] = targetRgb[0];
                    data[i + 1] = targetRgb[1];
                    data[i + 2] = targetRgb[2];

                    const alphaRatio = Math.max(0, (threshold - brightness) / (threshold - minBrightness));
                    data[i + 3] = Math.min(255, Math.round(alphaRatio * 255) + 50);

                    // Track coordinates for auto-crop
                    hasInk = true;
                    const pixelIndex = i / 4;
                    const x = pixelIndex % canvas.width;
                    const y = Math.floor(pixelIndex / canvas.width);

                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }

            ctx.putImageData(imageData, 0, 0);

            // THE MAGIC: AUTO-CROP THE EMPTY SPACE
            if (hasInk && maxX > minX && maxY > minY) {
                const padding = 20; // Leave a nice little border around the ink
                const cropX = Math.max(0, minX - padding);
                const cropY = Math.max(0, minY - padding);
                const cropW = Math.min(canvas.width - cropX, (maxX - minX) + padding * 2);
                const cropH = Math.min(canvas.height - cropY, (maxY - minY) + padding * 2);

                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = cropW;
                cropCanvas.height = cropH;
                const cropCtx = cropCanvas.getContext('2d');

                if (cropCtx) {
                    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    setUploadedDataUrl(cropCanvas.toDataURL('image/png'));
                } else {
                    setUploadedDataUrl(canvas.toDataURL('image/png'));
                }
            } else {
                setUploadedDataUrl(canvas.toDataURL('image/png'));
            }

            setHasChanges(true);
            setIsProcessingImage(false);
        };
        img.src = rawImageSrc;
    }, [rawImageSrc, rotation, penSettings.rgb]);

    const saveSignature = async () => {
        if (inputMode === 'preview' || !hasChanges) {
            onComplete();
            return;
        }

        let finalDataUrl = '';

        if (inputMode === 'draw') {
            if (!sigPad.current || sigPad.current.isEmpty()) {
                toast.error("Please sign inside the box before saving.");
                return;
            }
            finalDataUrl = sigPad.current.getCanvas().toDataURL('image/png');
        } else if (inputMode === 'upload') {
            if (!uploadedDataUrl) {
                toast.error("Please upload and process a signature photo.");
                return;
            }
            finalDataUrl = uploadedDataUrl;
        }

        setLoading(true);

        try {
            if (!finalDataUrl) throw new Error("Could not generate image data");

            const storage = getStorage();
            const timestamp = Date.now();
            const storageRef = ref(storage, `signatures/${userUid}_${timestamp}.png`);

            await uploadString(storageRef, finalDataUrl, 'data_url');
            const downloadUrl = await getDownloadURL(storageRef);

            const userRef = doc(db, 'users', userUid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) throw new Error("User profile document not found.");

            const isoDate = new Date(timestamp).toISOString();

            const updatePayload: any = {
                signatureUrl: downloadUrl,
                signatureDate: isoDate,
                hasSignature: true,
                signatureColor: penSettings.color,
                profileCompleted: true,
                signatureHistory: arrayUnion({
                    url: downloadUrl,
                    date: isoDate,
                    color: penSettings.color
                })
            };

            if (user?.role === 'mentor') {
                updatePayload.companyName = displayCompanyName;
            }

            await updateDoc(userRef, updatePayload);

            toast.success("Signature registered successfully!");

            setTimeout(() => {
                onComplete();
            }, 1500);

        } catch (error: any) {
            console.error("Error saving signature:", error);
            if (error.message.includes('unauthorized')) {
                toast.error("Upload unauthorized. Please check Firebase Storage rules.");
            } else {
                toast.error(error.message || "Failed to save signature.");
            }
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay" style={{ zIndex: 9999 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

            <div className="lfm-modal" style={{ maxWidth: '600px' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <PenTool size={18} />
                        {existingSignatureUrl ? "Update Digital Signature" : "Register Digital Signature"}
                    </h2>
                    <button className="lfm-close-btn" onClick={onComplete} disabled={loading}>
                        <X size={20} />
                    </button>
                </div>

                <div className="lfm-body" style={{ paddingBottom: '2rem' }}>

                    <div className="lfm-section-hdr" style={{ borderBottomColor: penSettings.color }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: penSettings.color }} />
                        <span style={{ color: penSettings.color }}>{penSettings.label} Required</span>
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', marginTop: 0, marginBottom: '0.5rem' }}>
                        In accordance with QCTO requirements, your role as a <strong>{user?.role}</strong> requires signatures to be digitally stamped in <strong>{penSettings.color}</strong> ink.
                    </p>

                    {user?.role === 'mentor' && (
                        <div className="lfm-flags-panel" style={{ marginTop: '0.5rem' }}>
                            <div className="lfm-checkbox-row" style={{ cursor: 'default' }}>
                                <Briefcase size={16} color="var(--mlab-green)" />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Assigned Host Company</span>
                                    <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{displayCompanyName}</strong>
                                </div>
                            </div>
                        </div>
                    )}

                    {inputMode === 'preview' ? (
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-bg)', padding: '2rem', display: 'flex', justifyContent: 'center', minHeight: '150px', position: 'relative' }}>
                                <img
                                    src={existingSignatureUrl}
                                    alt="Current Signature"
                                    style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'contain' }}
                                />
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => { setInputMode('draw'); setHasChanges(true); }}
                                    className="lfm-btn lfm-btn--ghost"
                                    style={{ flex: 1, justifyContent: 'center' }}
                                >
                                    <Edit2 size={16} /> Draw New
                                </button>
                                <button
                                    onClick={() => { setInputMode('upload'); setHasChanges(true); }}
                                    className="lfm-btn lfm-btn--ghost"
                                    style={{ flex: 1, justifyContent: 'center' }}
                                >
                                    <ImageIcon size={16} /> Upload New
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ marginTop: '1rem' }}>
                            <div className="lfm-tabs">
                                <button
                                    onClick={() => setInputMode('draw')}
                                    className={`lfm-tab ${inputMode === 'draw' ? 'active' : ''}`}
                                >
                                    <Edit2 size={14} /> Draw on Screen
                                </button>
                                <button
                                    onClick={() => setInputMode('upload')}
                                    className={`lfm-tab ${inputMode === 'upload' ? 'active' : ''}`}
                                >
                                    <ImageIcon size={14} /> Upload Photo
                                </button>
                            </div>

                            <div className="lfm-module-editor-wrap" style={{ padding: 0 }}>
                                {inputMode === 'draw' ? (
                                    <div style={{ background: 'var(--mlab-white)', cursor: 'crosshair', opacity: loading ? 0.5 : 1 }}>
                                        <SignatureCanvas
                                            ref={sigPad}
                                            penColor={penSettings.color}
                                            onBegin={() => setHasChanges(true)}
                                            canvasProps={{
                                                width: 550,
                                                height: 220,
                                                className: 'sigCanvas',
                                                style: { maxWidth: '100%', height: 'auto', touchAction: 'none' }
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div style={{ padding: '2rem', opacity: loading ? 0.5 : 1 }}>
                                        {!uploadedDataUrl ? (
                                            <label style={{
                                                border: '2px dashed var(--mlab-border)',
                                                padding: '3rem 2rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'var(--mlab-bg)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                textAlign: 'center'
                                            }}>
                                                <UploadCloud size={32} color="var(--mlab-blue)" style={{ marginBottom: '12px' }} />
                                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {isProcessingImage ? "Processing Image..." : "Upload Photo of Signature"}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '8px' }}>
                                                    Sign on blank white paper. We'll automatically remove the background and apply your required ink color.
                                                </span>
                                                <input
                                                    type="file"
                                                    accept="image/png, image/jpeg, image/jpg"
                                                    hidden
                                                    onChange={handleFileChange}
                                                    disabled={isProcessingImage || loading}
                                                />
                                            </label>
                                        ) : (
                                            <div style={{ display: 'flex', justifyContent: 'center', minHeight: '150px' }}>
                                                <img
                                                    src={uploadedDataUrl}
                                                    alt="Processed Signature"
                                                    style={{ maxHeight: '150px', maxWidth: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="lfm-footer">
                    <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-grey-lt)', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Info size={12} /> Digital Timestamp Enabled
                    </div>

                    {inputMode === 'upload' && uploadedDataUrl && (
                        <button
                            onClick={() => setRotation(r => (r + 90) % 360)}
                            disabled={loading || isProcessingImage}
                            className="lfm-btn lfm-btn--ghost"
                            style={{ marginRight: 'auto' }}
                        >
                            <RotateCw size={14} /> Rotate
                        </button>
                    )}

                    {inputMode !== 'preview' && (
                        <button
                            onClick={clear}
                            disabled={loading || (inputMode === 'draw' && !hasChanges)}
                            className="lfm-btn lfm-btn--ghost"
                        >
                            {(inputMode === 'upload' && uploadedDataUrl) ? <Trash2 size={14} /> : <Eraser size={14} />}
                            {(inputMode === 'upload' && uploadedDataUrl) ? 'Retake' : 'Clear'}
                        </button>
                    )}

                    <button
                        onClick={saveSignature}
                        disabled={loading}
                        className="lfm-btn lfm-btn--primary"
                    >
                        {loading ? (
                            <><Loader className="lfm-spin" size={16} /> Processing...</>
                        ) : inputMode === 'preview' ? (
                            <><Check size={16} /> Keep Existing</>
                        ) : (
                            <><Save size={16} /> Register Signature</>
                        )}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};



// // src/components/common/SignatureSetupModal/SignatureSetupModal.tsx

// import React, { useRef, useState, useMemo, useEffect } from 'react';
// import SignatureCanvas from 'react-signature-canvas';
// import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
// import { doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Loader, Save, Eraser, Info, Briefcase, UploadCloud, Edit2, Image as ImageIcon, Trash2, X, Check, PenTool } from 'lucide-react';
// import { ToastContainer, useToast } from '../common/Toast/Toast';
// import { createPortal } from 'react-dom';

// // Note: Ensure your provided CSS is imported here or globally!
// // import './LearnerFormModal.css'; 

// interface Props {
//     userUid: string;
//     existingSignatureUrl?: string;
//     onComplete: () => void;
// }

// export const SignatureSetupModal: React.FC<Props> = ({ userUid, existingSignatureUrl, onComplete }) => {
//     const sigPad = useRef<SignatureCanvas>(null);
//     const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

//     const [loading, setLoading] = useState(false);
//     const [inputMode, setInputMode] = useState<'preview' | 'draw' | 'upload'>(existingSignatureUrl ? 'preview' : 'draw');
//     const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
//     const [hasChanges, setHasChanges] = useState(false);
//     const [isProcessingImage, setIsProcessingImage] = useState(false);

//     const toast = useToast();
//     const { user, employers, fetchEmployers } = useStore();

//     useEffect(() => {
//         if (user?.role === 'mentor' && employers.length === 0) {
//             fetchEmployers();
//         }
//     }, [user?.role, employers.length, fetchEmployers]);

//     const mentorEmployer = useMemo(() => employers.find((e: any) => e.id === user?.employerId), [employers, user?.employerId]);
//     const displayCompanyName = mentorEmployer?.name || user?.companyName || 'Unassigned Workplace';

//     // STRICT COMPLIANCE: Determine Pen Color based on Role
//     const penSettings = useMemo(() => {
//         const role = user?.role?.toLowerCase();
//         switch (role) {
//             case 'facilitator':
//             case 'mentor':
//                 return { color: '#0ea5e9', rgb: [14, 165, 233], label: role === 'mentor' ? 'Workplace Mentor (Blue Pen)' : 'Facilitator (Blue Pen)' };
//             case 'assessor':
//                 return { color: '#ef4444', rgb: [239, 68, 68], label: 'Assessor (Red Pen)' };
//             case 'moderator':
//                 return { color: '#22c55e', rgb: [34, 197, 94], label: 'Moderator (Green Pen)' };
//             default:
//                 return { color: '#0f172a', rgb: [15, 23, 42], label: 'Learner (Black Pen)' };
//         }
//     }, [user]);

//     const clear = () => {
//         if (inputMode === 'draw') {
//             sigPad.current?.clear();
//         } else if (inputMode === 'upload') {
//             setUploadedDataUrl(null);
//         }
//         setHasChanges(true);
//     };

//     // ─── SMART CANVAS IMAGE PROCESSING ───
//     const processImage = (file: File) => {
//         setIsProcessingImage(true);
//         const reader = new FileReader();

//         reader.onload = (event) => {
//             const img = new Image();
//             img.onload = () => {
//                 const canvas = hiddenCanvasRef.current;
//                 if (!canvas) return;
//                 const ctx = canvas.getContext('2d');
//                 if (!ctx) return;

//                 canvas.width = img.width;
//                 canvas.height = img.height;
//                 ctx.drawImage(img, 0, 0);

//                 const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
//                 const data = imageData.data;
//                 const targetRgb = penSettings.rgb;

//                 for (let i = 0; i < data.length; i += 4) {
//                     const r = data[i];
//                     const g = data[i + 1];
//                     const b = data[i + 2];
//                     const brightness = (r + g + b) / 3;

//                     if (brightness > 160) {
//                         data[i + 3] = 0;
//                     } else {
//                         data[i] = targetRgb[0];
//                         data[i + 1] = targetRgb[1];
//                         data[i + 2] = targetRgb[2];
//                         data[i + 3] = 255;
//                     }
//                 }

//                 ctx.putImageData(imageData, 0, 0);
//                 setUploadedDataUrl(canvas.toDataURL('image/png'));
//                 setHasChanges(true);
//                 setIsProcessingImage(false);
//             };
//             img.src = event.target?.result as string;
//         };
//         reader.readAsDataURL(file);
//     };

//     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.files && e.target.files[0]) {
//             processImage(e.target.files[0]);
//         }
//     };

//     const saveSignature = async () => {
//         if (inputMode === 'preview' || !hasChanges) {
//             onComplete();
//             return;
//         }

//         let finalDataUrl = '';

//         if (inputMode === 'draw') {
//             if (!sigPad.current || sigPad.current.isEmpty()) {
//                 toast.error("Please sign inside the box before saving.");
//                 return;
//             }
//             finalDataUrl = sigPad.current.getCanvas().toDataURL('image/png');
//         } else if (inputMode === 'upload') {
//             if (!uploadedDataUrl) {
//                 toast.error("Please upload and process a signature photo.");
//                 return;
//             }
//             finalDataUrl = uploadedDataUrl;
//         }

//         setLoading(true);

//         try {
//             if (!finalDataUrl) throw new Error("Could not generate image data");

//             const storage = getStorage();
//             const timestamp = Date.now();
//             const storageRef = ref(storage, `signatures/${userUid}_${timestamp}.png`);

//             await uploadString(storageRef, finalDataUrl, 'data_url');
//             const downloadUrl = await getDownloadURL(storageRef);

//             const userRef = doc(db, 'users', userUid);
//             const userSnap = await getDoc(userRef);

//             if (!userSnap.exists()) throw new Error("User profile document not found.");

//             const isoDate = new Date(timestamp).toISOString();

//             const updatePayload: any = {
//                 signatureUrl: downloadUrl,
//                 signatureDate: isoDate,
//                 hasSignature: true,
//                 signatureColor: penSettings.color,
//                 profileCompleted: true,
//                 signatureHistory: arrayUnion({
//                     url: downloadUrl,
//                     date: isoDate,
//                     color: penSettings.color
//                 })
//             };

//             if (user?.role === 'mentor') {
//                 updatePayload.companyName = displayCompanyName;
//             }

//             await updateDoc(userRef, updatePayload);

//             toast.success("Signature registered successfully!");

//             setTimeout(() => {
//                 onComplete();
//             }, 1500);

//         } catch (error: any) {
//             console.error("Error saving signature:", error);
//             if (error.message.includes('unauthorized')) {
//                 toast.error("Upload unauthorized. Please check Firebase Storage rules.");
//             } else {
//                 toast.error(error.message || "Failed to save signature.");
//             }
//         } finally {
//             setLoading(false);
//         }
//     };

//     return createPortal(
//         <div className="lfm-overlay">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

//             <div className="lfm-modal" style={{ maxWidth: '600px' }}>

//                 {/* STRICT HEADER */}
//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title">
//                         <PenTool size={18} />
//                         {existingSignatureUrl ? "Update Digital Signature" : "Register Digital Signature"}
//                     </h2>
//                     <button className="lfm-close-btn" onClick={onComplete} disabled={loading}>
//                         <X size={20} />
//                     </button>
//                 </div>

//                 <div className="lfm-body" style={{ paddingBottom: '2rem' }}>

//                     {/* INFO PANEL */}
//                     <div className="lfm-section-hdr" style={{ borderBottomColor: penSettings.color }}>
//                         <div style={{ width: 10, height: 10, borderRadius: '50%', background: penSettings.color }} />
//                         <span style={{ color: penSettings.color }}>{penSettings.label} Required</span>
//                     </div>
//                     <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', marginTop: 0, marginBottom: '0.5rem' }}>
//                         In accordance with QCTO requirements, your role as a <strong>{user?.role}</strong> requires signatures to be digitally stamped in <strong>{penSettings.color}</strong> ink.
//                     </p>

//                     {/* MENTOR READ-ONLY UI */}
//                     {user?.role === 'mentor' && (
//                         <div className="lfm-flags-panel" style={{ marginTop: '0.5rem' }}>
//                             <div className="lfm-checkbox-row" style={{ cursor: 'default' }}>
//                                 <Briefcase size={16} color="var(--mlab-green)" />
//                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Assigned Host Company</span>
//                                     <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{displayCompanyName}</strong>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* DYNAMIC VIEW: PREVIEW vs EDITING */}
//                     {inputMode === 'preview' ? (
//                         <div style={{ marginTop: '1rem' }}>
//                             <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-bg)', padding: '2rem', display: 'flex', justifyContent: 'center', minHeight: '150px', position: 'relative' }}>
//                                 <img
//                                     src={existingSignatureUrl}
//                                     alt="Current Signature"
//                                     style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'contain' }}
//                                 />
//                             </div>

//                             <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
//                                 <button
//                                     onClick={() => { setInputMode('draw'); setHasChanges(true); }}
//                                     className="lfm-btn lfm-btn--ghost"
//                                     style={{ flex: 1, justifyContent: 'center' }}
//                                 >
//                                     <Edit2 size={16} /> Draw New
//                                 </button>
//                                 <button
//                                     onClick={() => { setInputMode('upload'); setHasChanges(true); }}
//                                     className="lfm-btn lfm-btn--ghost"
//                                     style={{ flex: 1, justifyContent: 'center' }}
//                                 >
//                                     <ImageIcon size={16} /> Upload New
//                                 </button>
//                             </div>
//                         </div>
//                     ) : (
//                         <div style={{ marginTop: '1rem' }}>
//                             {/* STRICT MODE TOGGLE TABS */}
//                             <div className="lfm-tabs">
//                                 <button
//                                     onClick={() => setInputMode('draw')}
//                                     className={`lfm-tab ${inputMode === 'draw' ? 'active' : ''}`}
//                                 >
//                                     <Edit2 size={14} /> Draw on Screen
//                                 </button>
//                                 <button
//                                     onClick={() => setInputMode('upload')}
//                                     className={`lfm-tab ${inputMode === 'upload' ? 'active' : ''}`}
//                                 >
//                                     <ImageIcon size={14} /> Upload Photo
//                                 </button>
//                             </div>

//                             {/* SIGNATURE INPUT AREA (Snaps flush under active tab) */}
//                             <div className="lfm-module-editor-wrap" style={{ padding: 0 }}>
//                                 {inputMode === 'draw' ? (
//                                     <div style={{ background: 'var(--mlab-white)', cursor: 'crosshair', opacity: loading ? 0.5 : 1 }}>
//                                         <SignatureCanvas
//                                             ref={sigPad}
//                                             penColor={penSettings.color}
//                                             onBegin={() => setHasChanges(true)}
//                                             canvasProps={{
//                                                 width: 550, // slightly wider to fill new box
//                                                 height: 220,
//                                                 className: 'sigCanvas',
//                                                 style: { maxWidth: '100%', height: 'auto', touchAction: 'none' }
//                                             }}
//                                         />
//                                     </div>
//                                 ) : (
//                                     <div style={{ padding: '2rem', opacity: loading ? 0.5 : 1 }}>
//                                         {!uploadedDataUrl ? (
//                                             <label style={{
//                                                 border: '2px dashed var(--mlab-border)',
//                                                 padding: '3rem 2rem',
//                                                 display: 'flex',
//                                                 flexDirection: 'column',
//                                                 alignItems: 'center',
//                                                 justifyContent: 'center',
//                                                 background: 'var(--mlab-bg)',
//                                                 cursor: 'pointer',
//                                                 transition: 'all 0.2s',
//                                                 textAlign: 'center'
//                                             }}>
//                                                 <UploadCloud size={32} color="var(--mlab-blue)" style={{ marginBottom: '12px' }} />
//                                                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                     {isProcessingImage ? "Processing Image..." : "Upload Photo of Signature"}
//                                                 </span>
//                                                 <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '8px' }}>
//                                                     Sign on blank white paper. We'll automatically remove the background and apply your required ink color.
//                                                 </span>
//                                                 <input
//                                                     type="file"
//                                                     accept="image/png, image/jpeg, image/jpg"
//                                                     hidden
//                                                     onChange={handleFileChange}
//                                                     disabled={isProcessingImage || loading}
//                                                 />
//                                             </label>
//                                         ) : (
//                                             <div style={{ display: 'flex', justifyContent: 'center', minHeight: '150px' }}>
//                                                 <img
//                                                     src={uploadedDataUrl}
//                                                     alt="Processed Signature"
//                                                     style={{ maxHeight: '150px', maxWidth: '100%', objectFit: 'contain' }}
//                                                 />
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 {/* STRICT FOOTER */}
//                 <div className="lfm-footer">
//                     <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-grey-lt)', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                         <Info size={12} /> Digital Timestamp Enabled
//                     </div>

//                     {inputMode !== 'preview' && (
//                         <button
//                             onClick={clear}
//                             disabled={loading || (inputMode === 'draw' && !hasChanges)}
//                             className="lfm-btn lfm-btn--ghost"
//                         >
//                             {(inputMode === 'upload' && uploadedDataUrl) ? <Trash2 size={14} /> : <Eraser size={14} />}
//                             {(inputMode === 'upload' && uploadedDataUrl) ? 'Retake' : 'Clear'}
//                         </button>
//                     )}

//                     <button
//                         onClick={saveSignature}
//                         disabled={loading}
//                         className="lfm-btn lfm-btn--primary"
//                     >
//                         {loading ? (
//                             <><Loader className="lfm-spin" size={16} /> Processing...</>
//                         ) : inputMode === 'preview' ? (
//                             <><Check size={16} /> Keep Existing</>
//                         ) : (
//                             <><Save size={16} /> Register Signature</>
//                         )}
//                     </button>
//                 </div>

//             </div>
//         </div>,
//         document.body
//     );
// };

