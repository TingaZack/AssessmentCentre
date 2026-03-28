// src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
    Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
    FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2, Layers
} from 'lucide-react';
import { collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { auth, db } from '../../../lib/firebase';

import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../AdminDashboard.css';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import defaultSignature from '../../../assets/Signatue_Zack_.png';

const FormSection = ({ title, icon: Icon, children }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Icon size={16} /> {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {children}
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1: ORIGINAL LUXURY (Untouched)
// ═════════════════════════════════════════════════════════════════════════════
const LuxuryTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
    <>
        <div className="cert-bg-luxury">
            <div className="cert-pattern-grid" />
            <div className="cert-pattern-hex" />
            <div className="cert-gradient-overlay" />
        </div>
        <div className="cert-main">
            <div className="cert-top-accent">
                <div className="cert-accent-line green" />
                <div className="cert-accent-line blue" />
            </div>

            <header className="cert-header">
                <div className="cert-logo-container">
                    {data.logoUrl && <img src={data.logoUrl} alt="Logo" className="cert-logo" crossOrigin="anonymous" />}
                </div>
                <div className="cert-institution">
                    <h3>{data.institutionName}</h3>
                    <div className="cert-divider-diamond"><span className="diamond" /></div>
                </div>
            </header>

            <main className="cert-content">
                <div className="cert-pretitle">This is to certify that</div>
                <h1 className="cert-recipient-name">{data.recipientName || '[Recipient Name]'}</h1>
                <div className="cert-description">{data.description}</div>
                <div className="cert-programme-name">{data.programme || '[Event/Course Name]'}</div>

                <div className="cert-type-badge">
                    <span className="cert-type-text">{finalType.includes('Award') ? 'Official' : 'Certificate of'}</span>
                    <span className="cert-type-value">{finalType}</span>
                </div>
            </main>

            <footer className="cert-footer-new">
                <div className="cert-signature-block">
                    <div className="cert-signature-image-container">
                        {data.sigUrl && <img src={data.sigUrl} alt="Signature" className="cert-signature-img" crossOrigin="anonymous" />}
                    </div>
                    <div className="cert-signature-line" />
                    <div className="cert-signature-name">{data.signatoryName}</div>
                    <div className="cert-signature-title">{data.signatoryTitle}</div>
                </div>

                <div className="cert-seal-container">
                    <div className="cert-seal-ring">
                        <div className="cert-seal-inner">
                            <Award size={36} strokeWidth={2} style={{ color: 'var(--mlab-green)' }} />
                        </div>
                    </div>
                </div>

                <div className="cert-date-block">
                    <div className="cert-date-value">
                        {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="cert-signature-line" />
                    <div className="cert-date-label">Date of Issue</div>
                </div>
            </footer>
            <div className="cert-bottom-accent" />
        </div>
    </>
);

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2: OFFICIAL STATEMENT (Statement of Results Inspired)
// ═════════════════════════════════════════════════════════════════════════════
const OfficialTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', position: 'relative', fontFamily: 'Arial, sans-serif', color: '#333' }}>
        {/* Top Border */}
        <div style={{ display: 'flex', height: '12px', width: '100%' }}>
            <div style={{ flex: 1, backgroundColor: 'var(--mlab-blue)' }}></div>
            <div style={{ width: '150px', backgroundColor: 'var(--mlab-green)' }}></div>
        </div>

        <div style={{ padding: '50px 80px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 12px)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mlab-blue)', paddingBottom: '20px', marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '70px', objectFit: 'contain' }} crossOrigin="anonymous" />}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>{data.institutionName}</h2>
                    <p style={{ margin: '5px 0 0', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Statement of Award</p>
                </div>
            </div>

            {/* Document Title */}
            <div style={{ backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '15px 30px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '40px', borderLeft: '6px solid var(--mlab-green)' }}>
                <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '28px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>{finalType}</h1>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', color: '#555', marginBottom: '10px' }}>This document officially certifies that:</p>
                <h2 style={{ margin: '0 0 30px', fontSize: '36px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.recipientName || '[Recipient Name]'}</h2>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', width: '200px', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Awarding Programme</td>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '18px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.programme || '[Course Name]'}</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Description</td>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{data.description}</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Date of Issue</td>
                            <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Footer / Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                <div style={{ width: '250px' }}>
                    <div style={{ height: '70px', display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                        {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
                    </div>
                    <div style={{ borderTop: '1px solid var(--mlab-blue)', paddingTop: '10px' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
                        <p style={{ margin: '2px 0 0', color: '#777', fontSize: '12px' }}>{data.signatoryTitle}</p>
                    </div>
                </div>

                {/* Watermark / Seal */}
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', border: '2px dashed var(--mlab-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                    <div style={{ textAlign: 'center' }}>
                        <Award size={32} color="var(--mlab-blue)" style={{ margin: '0 auto' }} />
                        <div style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--mlab-blue)', marginTop: '4px', letterSpacing: '1px' }}>OFFICIAL</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3: MODERN MINIMALIST
// ═════════════════════════════════════════════════════════════════════════════
const ModernTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>

        {/* Left Accent Panel */}
        <div style={{ width: '280px', backgroundColor: 'var(--mlab-blue)', height: '100%', padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white', boxSizing: 'border-box' }}>
            <div>
                {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '60px', objectFit: 'contain', }} crossOrigin="anonymous" />}
                <div style={{ marginTop: '40px', width: '40px', height: '4px', backgroundColor: 'var(--mlab-green)' }}></div>
            </div>

            <div>
                <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Date Issued</p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 30px' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>

                <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Certificate ID</p>
                <p style={{ fontSize: '14px', fontFamily: 'monospace', opacity: 0.8, margin: 0 }}>{Date.now().toString().slice(-8)}</p>
            </div>
        </div>

        {/* Right Content Panel */}
        <div style={{ flex: 1, padding: '80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={{ alignSelf: 'flex-end', padding: '8px 16px', backgroundColor: 'rgba(148, 199, 61, 0.1)', color: 'var(--mlab-green-dark)', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {data.institutionName}
            </div>

            <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
                <p style={{ fontSize: '16px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '10px' }}>Awarded To</p>
                <h1 style={{ fontSize: '56px', color: 'var(--mlab-blue)', margin: '0 0 20px', lineHeight: 1.1, letterSpacing: '-1px' }}>{data.recipientName || '[Recipient Name]'}</h1>

                <div style={{ display: 'inline-block', backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '10px 20px', fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '30px' }}>
                    {finalType}
                </div>

                <p style={{ fontSize: '18px', color: '#475569', lineHeight: 1.6, maxWidth: '600px', margin: '0 0 10px' }}>
                    {data.description}
                </p>
                <p style={{ fontSize: '22px', color: 'var(--mlab-blue)', fontWeight: 'bold', margin: 0 }}>
                    {data.programme || '[Event/Course Name]'}
                </p>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div style={{ width: '200px' }}>
                    {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
                    <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '10px' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
                        <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12px' }}>{data.signatoryTitle}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export const CertificateStudio: React.FC = () => {
    const {
        settings,
        user,
        adHocCertificates = [],
        certificateGroups = [],
        fetchAdHocCertificates,
        fetchCertificateGroups,
        createCertificateGroup,
        renameCertificateGroup,
        fetchSettings
    } = useStore();

    const toast = useToast();
    const navigate = useNavigate();

    // ─── VIEW & LAYOUT STATE ───
    const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activeFolder, setActiveFolder] = useState<any>(null);
    const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

    // ─── FOLDER CREATION / RENAME STATE ───
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');

    // ─── EDITABLE STUDIO STATE ───
    const [certData, setCertData] = useState({
        template: 'luxury', // 🚀 New Template State
        recipientName: '',
        recipientEmail: '',
        certType: 'Achievement',
        customType: '',
        description: 'has demonstrated exceptional skills and outstanding performance in',
        programme: 'Advanced Leadership Workshop',
        institutionName: 'mLab Southern Africa',
        issueDate: new Date().toISOString().split('T')[0],
        signatoryName: 'Zakhele Tinga',
        signatoryTitle: 'Academic Manager',
        logoUrl: mLabLogo,
        sigUrl: defaultSignature,
        groupId: 'general'
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [actionType, setActionType] = useState<'download' | 'email'>('download');
    const [zoom, setZoom] = useState(0.65);
    const certRef = useRef<HTMLDivElement>(null);

    // useEffect(() => {
    //     if (settings) {
    //         setCertData(prev => ({
    //             ...prev,
    //             institutionName: settings.institutionName || "mLab Southern Africa",
    //             signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
    //             signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
    //             logoUrl: mLabLogo,
    //             sigUrl: (settings as any).signatureUrl || defaultSignature
    //         }));
    //     }
    // }, [settings]);

    // Force fetch settings from Firebase so the logo and signatures load!
    useEffect(() => {
        if (!settings && fetchSettings) {
            fetchSettings();
        }
    }, [settings, fetchSettings]);

    // (This is your existing settings useEffect, keep this as is!)
    useEffect(() => {
        if (settings) {
            setCertData(prev => ({
                ...prev,
                institutionName: settings.institutionName || "mLab Southern Africa",
                signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
                signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
                logoUrl: mLabLogo,
                sigUrl: (settings as any).signatureUrl || defaultSignature
            }));
        }
    }, [settings]);


    useEffect(() => {
        const loadInitialData = async () => {
            try {
                if (fetchCertificateGroups) await fetchCertificateGroups();
                if (fetchAdHocCertificates) await fetchAdHocCertificates();
            } catch (error) {
                console.error("Failed to load studio data", error);
            } finally {
                setIsLoadingData(false);
            }
        };
        if (adHocCertificates.length === 0 || certificateGroups.length === 0) {
            loadInitialData();
        } else {
            setIsLoadingData(false);
        }
    }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    // ─── FOLDER HANDLERS ───
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
            setNewFolderName('');
            setShowNewFolderInput(false);
            toast.success("Folder created successfully!");
        } catch (error) {
            toast.error("Failed to create folder");
        }
    };

    const handleRenameFolder = async (id: string) => {
        if (!editFolderName.trim()) {
            setEditingFolderId(null);
            return;
        }
        try {
            if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
            setEditingFolderId(null);
            toast.success("Folder renamed!");
        } catch (error) {
            toast.error("Failed to rename folder");
        }
    };

    const getCertificatesForActiveFolder = () => {
        if (!activeFolder) return [];
        if (activeFolder.id === 'general') {
            return adHocCertificates.filter(c => !c.groupId || c.groupId === 'general');
        }
        return adHocCertificates.filter(c => c.groupId === activeFolder.id);
    };

    // ─── STUDIO HANDLERS ───
    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
    const handleResetZoom = () => setZoom(0.65);

    const handleChange = (field: string, value: string) => {
        setCertData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
        const file = e.target.files?.[0];
        if (file) {
            const tempUrl = URL.createObjectURL(file);
            handleChange(field, tempUrl);
        }
    };

    const resetForm = () => {
        setCertData(prev => ({
            ...prev,
            recipientName: '',
            recipientEmail: '',
            certType: 'Achievement',
            customType: '',
            programme: 'Advanced Leadership Workshop'
        }));
    };

    const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

    const executeGeneration = useCallback(async () => {
        if (!certRef.current) return;
        if (!certData.recipientName.trim()) {
            toast.error('Recipient name is required');
            return;
        }

        setIsGenerating(true);
        toast.info(actionType === 'email' ? 'Generating and sending email...' : 'Generating high-res PDF...');

        try {
            const currentZoom = zoom;
            setZoom(1);
            await new Promise(resolve => setTimeout(resolve, 300));

            const canvas = await html2canvas(certRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 1123,
                height: 794
            });

            setZoom(currentZoom);

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
            const pdfBlob = pdf.output('blob');

            const storage = getStorage();
            const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, pdfBlob);
            const downloadUrl = await getDownloadURL(storageRef);

            const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
                recipientName: certData.recipientName,
                recipientEmail: certData.recipientEmail || null,
                type: finalCertType,
                courseName: certData.programme,
                issueDate: certData.issueDate,
                pdfUrl: downloadUrl,
                groupId: certData.groupId || 'general',
                templateUsed: certData.template,
                createdBy: user?.uid || 'Admin',
                createdAt: serverTimestamp(),
                isEmailed: false
            });

            if (actionType === 'email' && certData.recipientEmail) {
                const functions = getFunctions();
                const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
                await sendAdHocEmail({
                    email: certData.recipientEmail,
                    recipientName: certData.recipientName,
                    pdfUrl: downloadUrl,
                    awardTitle: finalCertType,
                    courseName: certData.programme
                });

                await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
                toast.success(`Certificate successfully emailed to ${certData.recipientEmail}`);
            } else if (actionType === 'download') {
                pdf.save(`Certificate_${safeName}.pdf`);
                toast.success('Certificate downloaded securely!');
            }

            if (fetchAdHocCertificates) await fetchAdHocCertificates(true);

            resetForm();
            setView('folders');
        } catch (error: any) {
            console.error('Studio Error:', error);
            toast.error('Failed to process. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    }, [certRef, certData, actionType, toast, zoom, finalCertType, user, fetchAdHocCertificates]);

    return (
        <div className="admin-layout">
            <div className="admin-mobile-header">
                <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className="admin-mobile-title">Certificate Studio</div>
            </div>

            {isMobileMenuOpen && (
                <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={24} />
                </button>
                <Sidebar role={user?.role} currentNav="studio" setCurrentNav={() => { }} onLogout={handleLogout} />
            </div>

            <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                <header className="dashboard-header" style={{ flexShrink: 0 }}>
                    <div className="header-title">
                        <h1>Certificate Studio</h1>
                        <p>{view === 'studio' ? 'Design and customize your ad-hoc award' : 'Manage your folders and generation history'}</p>
                    </div>
                </header>

                <div className="admin-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* ════════════════════════════════════════════════════════
                        VIEW 1: FOLDERS LIST
                        ════════════════════════════════════════════════════════ */}
                    {view === 'folders' && (
                        <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div className="mlab-standard-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {showNewFolderInput ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                className="mlab-input"
                                                style={{ width: '220px', padding: '0.5rem 0.75rem' }}
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                placeholder="Enter folder name..."
                                                autoFocus
                                            />
                                            <button className="mlab-btn mlab-btn--green" onClick={handleCreateFolder}>Save</button>
                                            <button className="mlab-btn mlab-btn--ghost" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
                                        </div>
                                    ) : (
                                        <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setShowNewFolderInput(true)}>
                                            <FolderPlus size={15} /> New Folder
                                        </button>
                                    )}
                                </div>
                                <button className="mlab-btn mlab-btn--primary" onClick={() => setView('studio')}>
                                    <Plus size={15} /> Create Certificate
                                </button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {isLoadingData ? (
                                    <div className="ap-fullscreen" style={{ position: 'absolute', inset: 0 }}>
                                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <div className="ap-spinner" />
                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Workspace...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>

                                        {/* Static General Folder */}
                                        <div className="mlab-card" style={{ cursor: 'pointer', background: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                                            onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
                                            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}>
                                                <Folder size={24} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>General</h4>
                                                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                    {adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents
                                                </p>
                                            </div>
                                            <ChevronRight size={18} color="#cbd5e1" />
                                        </div>

                                        {/* Dynamic Groups */}
                                        {certificateGroups.map(group => (
                                            <div key={group.id} className="mlab-card" style={{ cursor: 'pointer', background: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                                                onClick={() => {
                                                    if (editingFolderId !== group.id) {
                                                        setActiveFolder(group);
                                                        setView('inside-folder');
                                                    }
                                                }}>
                                                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green)' }}>
                                                    <Folder size={24} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    {editingFolderId === group.id ? (
                                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                                            <input
                                                                className="mlab-input"
                                                                style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem' }}
                                                                autoFocus
                                                                value={editFolderName}
                                                                onChange={e => setEditFolderName(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleRenameFolder(group.id);
                                                                    if (e.key === 'Escape') setEditingFolderId(null);
                                                                }}
                                                            />
                                                            <button className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
                                                            <button className="mlab-btn mlab-btn--ghost" style={{ padding: '0.4rem 0.6rem' }} onClick={() => setEditingFolderId(null)}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <h4 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
                                                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                                {adHocCertificates.filter(c => c.groupId === group.id).length} Documents
                                                            </p>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Hover Edit Action */}
                                                {editingFolderId !== group.id && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <button
                                                            className="mlab-icon-btn"
                                                            style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingFolderId(group.id);
                                                                setEditFolderName(group.name);
                                                            }}
                                                            title="Rename Folder"
                                                        >
                                                            <Edit2 size={16} color="var(--mlab-grey)" />
                                                        </button>
                                                        <ChevronRight size={18} color="#cbd5e1" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════
                        VIEW 2: INSIDE A SPECIFIC FOLDER
                        ════════════════════════════════════════════════════════ */}
                    {view === 'inside-folder' && activeFolder && (
                        <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                            <div className="mlab-standard-actions" style={{ justifyContent: 'flex-start', gap: '15px', marginBottom: '1.5rem' }}>
                                <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
                                    <ArrowLeft size={15} /> Back to Folders
                                </button>
                                <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Folder size={20} color="var(--mlab-green)" /> {activeFolder.name}
                                </h2>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {getCertificatesForActiveFolder().length === 0 ? (
                                    <div className="mlab-empty" style={{ borderRadius: '8px', border: '1px dashed #cbd5e1', background: 'transparent' }}>
                                        <FileText size={48} color="var(--mlab-grey-light)" className="mlab-empty-icon" />
                                        <p className="mlab-empty__title">Folder is Empty</p>
                                        <p className="mlab-empty__desc" style={{ marginBottom: '1.5rem' }}>No certificates have been saved to this folder yet.</p>
                                        <button className="mlab-btn mlab-btn--primary" onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
                                            <Plus size={16} /> Create Certificate Here
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
                                        {getCertificatesForActiveFolder().map(cert => (
                                            <div key={cert.id} style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                    <Award size={48} color="rgba(255,255,255,0.1)" />
                                                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                                                        {cert.isEmailed && (
                                                            <span className="mlab-badge" style={{ background: 'var(--mlab-emerald)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem' }} title={`Emailed to ${cert.recipientEmail}`}>
                                                                <Mail size={10} /> Sent
                                                            </span>
                                                        )}
                                                        <span className="mlab-badge mlab-badge--active" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none' }}>PDF</span>
                                                    </div>
                                                </div>
                                                <div style={{ padding: '1.25rem' }}>
                                                    <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {cert.recipientName}
                                                    </h4>
                                                    <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <strong>{cert.type}</strong>
                                                        <span>{cert.courseName}</span>
                                                    </p>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                                            {cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}
                                                        </span>
                                                        <button className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                            <Download size={14} /> View
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════
                        VIEW 3: THE AD-HOC STUDIO GENERATOR 
                        ════════════════════════════════════════════════════════ */}
                    {view === 'studio' && (
                        <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                            <div className="mlab-standard-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
                                <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
                                    <ArrowLeft size={15} /> Cancel
                                </button>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="mlab-btn mlab-btn--outline-blue" disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={16} /> : <Download size={15} />}
                                        Download PDF
                                    </button>
                                    <button className="mlab-btn mlab-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={16} /> : <Mail size={15} />}
                                        Email Document
                                    </button>
                                </div>
                            </div>

                            <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden', paddingBottom: '0.5rem' }}>

                                {/* ── LEFT PANE: STUDIO FORM ── */}
                                <div style={{ width: '380px', flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>

                                        <FormSection title="Design Template" icon={Layers}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
                                                <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.template} onChange={e => handleChange('template', e.target.value)}>
                                                    <option value="luxury">Luxury (Default)</option>
                                                    <option value="official">Official Statement (SoR)</option>
                                                    <option value="modern">Modern Minimalist</option>
                                                </select>
                                            </div>
                                        </FormSection>

                                        <FormSection title="Folder Assignment" icon={Folder}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
                                                <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}>
                                                    <option value="general">General (No Folder)</option>
                                                    {certificateGroups.map(g => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </FormSection>

                                        <FormSection title="Recipient Details" icon={UserCircle}>
                                            <input className="mlab-input" placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
                                            <input className="mlab-input" type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
                                        </FormSection>

                                        <FormSection title="Award Details" icon={FileCheck}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
                                                <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}>
                                                    <option value="Achievement">Certificate of Achievement</option>
                                                    <option value="Attendance">Certificate of Attendance</option>
                                                    <option value="Appreciation">Certificate of Appreciation</option>
                                                    <option value="Excellence">Award of Excellence</option>
                                                    <option value="Other">Custom Title...</option>
                                                </select>
                                            </div>
                                            {certData.certType === 'Other' && (
                                                <input className="mlab-input" placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />
                                            )}
                                            <input className="mlab-input" placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
                                            <textarea className="mlab-input" style={{ minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
                                        </FormSection>

                                        <FormSection title="Branding & Signatures" icon={Building2}>
                                            <input className="mlab-input" placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <input className="mlab-input" placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
                                                <input className="mlab-input" type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
                                            </div>
                                            <input className="mlab-input" placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />

                                            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                                <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    <ImageIcon size={14} /> Change Logo
                                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} />
                                                </label>
                                                <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    <ImageIcon size={14} /> Change Signature
                                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} />
                                                </label>
                                            </div>
                                        </FormSection>

                                    </div>
                                </div>

                                {/* ── RIGHT PANE: CANVAS PREVIEW ── */}
                                <div className="cert-preview-container" style={{ flex: 1, position: 'relative', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>

                                    <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
                                        <button className="mlab-icon-btn" onClick={handleZoomOut}><ZoomOut size={16} color='green' /></button>
                                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
                                        <button className="mlab-icon-btn" onClick={handleZoomIn}><ZoomIn size={16} color='green' /></button>
                                        <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom}><RotateCcw size={16} /></button>
                                    </div>

                                    <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                                        {/* Canvas Box ensures fixed A4 boundaries for html2canvas */}
                                        <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto', backgroundColor: '#fff', overflow: 'hidden' }}>

                                            {/* Render Selected Template */}
                                            {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
                                            {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
                                            {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}

                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};


// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import {
//     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
//     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
//     FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2,
//     DownloadCloud, Layers, Check
// } from 'lucide-react';
// import { collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import html2canvas from 'html2canvas';
// import jsPDF from 'jspdf';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { auth, db } from '../../../lib/firebase';

// import '../../../components/views/LearnersView/LearnersView.css';
// import '../AdminDashboard.css';
// import './CertificateStudio.css';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import defaultSignature from '../../../assets/Signatue_Zack_.png';

// /* ─── Template definitions ──────────────────────────────────────────────────── */
// export type TemplateId = 'prestige' | 'letterhead' | 'modern';

// const TEMPLATES: Array<{ id: TemplateId; label: string; description: string; preview: string }> = [
//     {
//         id: 'prestige',
//         label: 'Prestige',
//         description: 'Ornamental corner frames, Georgia calligraphic name, decorative diamond dividers.',
//         preview: 'prestige',
//     },
//     {
//         id: 'letterhead',
//         label: 'Official Letterhead',
//         description: 'Inspired by the Statement of Results — professional letterhead, ruled data rows, institutional feel.',
//         preview: 'letterhead',
//     },
//     {
//         id: 'modern',
//         label: 'Modern',
//         description: 'Bold typographic contrast, clean vertical rule accent, stark and minimal.',
//         preview: 'modern',
//     },
// ];

// /* ─── FormSection helper ─────────────────────────────────────────────────────── */
// const FormSection = ({ title, icon: Icon, children }: any) => (
//     <div className="cs-form-section">
//         <h3 className="cs-form-section__title"><Icon size={15} /> {title}</h3>
//         <div className="cs-form-section__body">{children}</div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    TEMPLATE A — PRESTIGE 
// ═══════════════════════════════════════════════════════════════════════════ */
// const TemplatePrestige: React.FC<{ data: any; finalCertType: string }> = ({ data, finalCertType }) => (
//     <div className="prestige-canvas">
//         <div className="cert-bg-pattern" aria-hidden="true" />
//         <div className="cert-corner cert-corner--tl" aria-hidden="true">
//             <svg viewBox="0 0 80 80" fill="none"><path d="M0 0 L80 0 L80 4 L4 4 L4 80 L0 80 Z" fill="#073f4e" /><path d="M8 8 L72 8 L72 11 L11 11 L11 72 L8 72 Z" fill="#94c73d" /><circle cx="20" cy="20" r="6" fill="none" stroke="#073f4e" strokeWidth="1.5" /><path d="M20 8 L20 14 M8 20 L14 20" stroke="#073f4e" strokeWidth="1" /></svg>
//         </div>
//         <div className="cert-corner cert-corner--tr" aria-hidden="true">
//             <svg viewBox="0 0 80 80" fill="none"><path d="M80 0 L0 0 L0 4 L76 4 L76 80 L80 80 Z" fill="#073f4e" /><path d="M72 8 L8 8 L8 11 L69 11 L69 72 L72 72 Z" fill="#94c73d" /><circle cx="60" cy="20" r="6" fill="none" stroke="#073f4e" strokeWidth="1.5" /><path d="M60 8 L60 14 M72 20 L66 20" stroke="#073f4e" strokeWidth="1" /></svg>
//         </div>
//         <div className="cert-corner cert-corner--bl" aria-hidden="true">
//             <svg viewBox="0 0 80 80" fill="none"><path d="M0 80 L80 80 L80 76 L4 76 L4 0 L0 0 Z" fill="#073f4e" /><path d="M8 72 L72 72 L72 69 L11 69 L11 8 L8 8 Z" fill="#94c73d" /><circle cx="20" cy="60" r="6" fill="none" stroke="#073f4e" strokeWidth="1.5" /><path d="M20 72 L20 66 M8 60 L14 60" stroke="#073f4e" strokeWidth="1" /></svg>
//         </div>
//         <div className="cert-corner cert-corner--br" aria-hidden="true">
//             <svg viewBox="0 0 80 80" fill="none"><path d="M80 80 L0 80 L0 76 L76 76 L76 0 L80 0 Z" fill="#073f4e" /><path d="M72 72 L8 72 L8 69 L69 69 L69 8 L72 8 Z" fill="#94c73d" /><circle cx="60" cy="60" r="6" fill="none" stroke="#073f4e" strokeWidth="1.5" /><path d="M60 72 L60 66 M72 60 L66 60" stroke="#073f4e" strokeWidth="1" /></svg>
//         </div>
//         <div className="cert-accent-top" aria-hidden="true">
//             <div className="cert-accent-top__blue" /><div className="cert-accent-top__green" />
//         </div>
//         <div className="cert-body">
//             <div className="cert-issuer">
//                 <img src={data.logoUrl} alt="Logo" className="cert-issuer__logo" crossOrigin={data.logoUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                 <div className="cert-issuer__divider" />
//                 <div className="cert-issuer__text">
//                     <span className="cert-issuer__org">{data.institutionName}</span>
//                     <span className="cert-issuer__tag">QCTO Accredited Training Provider</span>
//                 </div>
//             </div>
//             <div className="cert-divider" aria-hidden="true">
//                 <div className="cert-divider__line" /><div className="cert-divider__diamond" /><div className="cert-divider__line" />
//             </div>
//             <p className="cert-presents">This is to certify that</p>
//             <h1 className="cert-name">{data.recipientName || '[Recipient Name]'}</h1>
//             <p className="cert-descriptor">{data.description}</p>
//             <div className="cert-programme">
//                 <div className="cert-programme__text">{data.programme || '[Event/Course Name]'}</div>
//             </div>
//             <div className="cert-type-badge">
//                 <span className="cert-type-badge__label">Certificate of</span>
//                 <span className="cert-type-badge__value">{finalCertType}</span>
//             </div>
//             <div className="cert-footer">
//                 <div className="cert-sig cert-sig--date">
//                     <div className="cert-sig__value--date">
//                         {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
//                     </div>
//                     <div className="cert-sig__line" /><div className="cert-sig__label">Date of Issue</div>
//                 </div>
//                 <div className="cert-seal" aria-hidden="true">
//                     <svg viewBox="0 0 120 120" className="cert-seal__svg">
//                         <circle cx="60" cy="60" r="56" fill="none" stroke="#073f4e" strokeWidth="2" strokeDasharray="4 3" opacity="0.25" />
//                         <circle cx="60" cy="60" r="48" fill="none" stroke="#94c73d" strokeWidth="1.5" opacity="0.35" />
//                         <circle cx="60" cy="60" r="40" fill="#073f4e" opacity="0.06" />
//                         <text x="60" y="53" textAnchor="middle" fontFamily="Oswald, Trebuchet MS, sans-serif" fontSize="7" fontWeight="700" letterSpacing="3" fill="#073f4e" opacity="0.5" textLength="72" lengthAdjust="spacing">MLAB SOUTHERN</text>
//                         <text x="60" y="63" textAnchor="middle" fontFamily="Oswald, Trebuchet MS, sans-serif" fontSize="7" fontWeight="700" letterSpacing="3" fill="#073f4e" opacity="0.5" textLength="50" lengthAdjust="spacing">AFRICA</text>
//                         <text x="60" y="75" textAnchor="middle" fontFamily="Oswald, Trebuchet MS, sans-serif" fontSize="6" letterSpacing="2" fill="#94c73d" opacity="0.5">ACCREDITED</text>
//                     </svg>
//                 </div>
//                 <div className="cert-sig cert-sig--authorised">
//                     <img src={data.sigUrl} alt="Signature" className="cert-sig__image" crossOrigin={data.sigUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                     <div className="cert-sig__line" /><div className="cert-sig__label">Authorised Signature</div>
//                     <div className="cert-sig__name">{data.signatoryName}</div>
//                     <div className="cert-sig__title">{data.signatoryTitle}</div>
//                 </div>
//             </div>
//         </div>
//         <div className="cert-accent-bottom" aria-hidden="true">
//             <div className="cert-accent-bottom__green" /><div className="cert-accent-bottom__blue" />
//         </div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    TEMPLATE B — OFFICIAL LETTERHEAD
// ═══════════════════════════════════════════════════════════════════════════ */
// const TemplateLetterhead: React.FC<{ data: any; finalCertType: string }> = ({ data, finalCertType }) => (
//     <div className="lh-canvas">
//         <div className="lh-accent-stripe" aria-hidden="true">
//             <div className="lh-accent-stripe__blue" />
//             <div className="lh-accent-stripe__green" />
//         </div>

//         <header className="lh-letterhead">
//             <div className="lh-letterhead__logo-col">
//                 <img src={data.logoUrl} alt="Logo" className="lh-letterhead__logo" crossOrigin={data.logoUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                 <div className="lh-letterhead__org">
//                     <span className="lh-letterhead__org-name">{data.institutionName}</span>
//                     <span className="lh-letterhead__org-tag">QCTO Accredited Skills Development Provider</span>
//                     <span className="lh-letterhead__org-reg">Registration No: SDP070824115131</span>
//                 </div>
//             </div>
//             <div className="lh-letterhead__contact">
//                 <div>Tel: +27 012 844 0240</div>
//                 <div>Email: codetribe@mlab.co.za</div>
//                 <div>Web: www.mlab.co.za</div>
//             </div>
//         </header>

//         <div className="lh-doc-header">
//             <div className="lh-doc-header__rule-left" aria-hidden="true" />
//             <div className="lh-doc-header__title-group">
//                 <h1 className="lh-doc-header__title">Certificate of {finalCertType}</h1>
//                 <p className="lh-doc-header__sub">Official Award Document — mLab Southern Africa</p>
//             </div>
//             <div className="lh-doc-header__rule-right" aria-hidden="true" />
//         </div>

//         <div className="lh-recipient-block">
//             <div className="lh-field-row">
//                 <span className="lh-field-row__label">Full Name</span>
//                 <span className="lh-field-row__value lh-field-row__value--name">{data.recipientName || '—'}</span>
//             </div>
//             <div className="lh-field-row">
//                 <span className="lh-field-row__label">Programme</span>
//                 <span className="lh-field-row__value">{data.programme || '—'}</span>
//             </div>
//             <div className="lh-field-row">
//                 <span className="lh-field-row__label">Date of Issue</span>
//                 <span className="lh-field-row__value">
//                     {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
//                 </span>
//             </div>
//         </div>

//         <div className="lh-body">
//             <p className="lh-body__declaration">
//                 This is to officially certify that the above-named person has successfully fulfilled all the requirements
//                 set by <strong>{data.institutionName}</strong> and {data.description} the programme referenced above.
//                 This certificate is issued in recognition of demonstrated competency and commitment.
//             </p>

//             <div className="lh-award-panel">
//                 <div className="lh-award-panel__label">AWARD CATEGORY</div>
//                 <div className="lh-award-panel__value">Certificate of {finalCertType}</div>
//                 <div className="lh-award-panel__meta">
//                     <div className="lh-award-panel__chip">
//                         <span className="lh-award-panel__chip-label">Provider</span>
//                         <span className="lh-award-panel__chip-value">{data.institutionName}</span>
//                     </div>
//                     <div className="lh-award-panel__chip">
//                         <span className="lh-award-panel__chip-label">Signatory</span>
//                         <span className="lh-award-panel__chip-value">{data.signatoryName}</span>
//                     </div>
//                     <div className="lh-award-panel__chip">
//                         <span className="lh-award-panel__chip-label">Title</span>
//                         <span className="lh-award-panel__chip-value">{data.signatoryTitle}</span>
//                     </div>
//                 </div>
//             </div>
//         </div>

//         <footer className="lh-footer">
//             <div className="lh-footer__sig">
//                 <img src={data.sigUrl} alt="Signature" className="lh-footer__sig-img" crossOrigin={data.sigUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                 <div className="lh-footer__sig-line" />
//                 <div className="lh-footer__sig-name">{data.signatoryName}</div>
//                 <div className="lh-footer__sig-title">{data.signatoryTitle}</div>
//                 <div className="lh-footer__sig-date">
//                     Date: {new Date(data.issueDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
//                 </div>
//             </div>

//             <div className="lh-footer__seal" aria-hidden="true">
//                 <svg viewBox="0 0 140 140" className="lh-footer__seal-svg">
//                     <circle cx="70" cy="70" r="66" fill="none" stroke="#073f4e" strokeWidth="2.5" strokeDasharray="5 3" opacity="0.2" />
//                     <circle cx="70" cy="70" r="58" fill="none" stroke="#94c73d" strokeWidth="1.5" opacity="0.3" />
//                     <circle cx="70" cy="70" r="50" fill="#073f4e" opacity="0.05" />
//                     <text x="70" y="62" textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="8" fontWeight="700" letterSpacing="3.5" fill="#073f4e" opacity="0.4">OFFICIALLY</text>
//                     <text x="70" y="75" textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="8" fontWeight="700" letterSpacing="3.5" fill="#073f4e" opacity="0.4">CERTIFIED</text>
//                     <text x="70" y="90" textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="7" letterSpacing="2" fill="#94c73d" opacity="0.5">MLAB SOUTHERN AFRICA</text>
//                 </svg>
//             </div>
//         </footer>

//         <div className="lh-bottom-rule" aria-hidden="true">
//             <div className="lh-bottom-rule__green" />
//             <div className="lh-bottom-rule__blue" />
//         </div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    TEMPLATE C — MODERN MINIMALIST
// ═══════════════════════════════════════════════════════════════════════════ */
// const TemplateModern: React.FC<{ data: any; finalCertType: string }> = ({ data, finalCertType }) => (
//     <div className="mod-canvas">
//         <div className="mod-rule" aria-hidden="true">
//             <div className="mod-rule__blue" />
//             <div className="mod-rule__green" />
//         </div>

//         <div className="mod-content">
//             <div className="mod-header">
//                 <img src={data.logoUrl} alt="Logo" className="mod-header__logo" crossOrigin={data.logoUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                 <div className="mod-header__right">
//                     <span className="mod-header__org">{data.institutionName}</span>
//                     <span className="mod-header__doc-type">Certificate of {finalCertType}</span>
//                 </div>
//             </div>

//             <div className="mod-name-block">
//                 <div className="mod-name-block__label">Awarded to</div>
//                 <h1 className="mod-name-block__name">{data.recipientName || '[Recipient Name]'}</h1>
//                 <div className="mod-name-block__underline" aria-hidden="true" />
//             </div>

//             <div className="mod-body">
//                 <p className="mod-body__desc">{data.description}</p>
//                 <div className="mod-body__programme">{data.programme || '[Programme Name]'}</div>
//             </div>

//             <div className="mod-meta-row">
//                 <div className="mod-meta-item">
//                     <span className="mod-meta-item__label">Date of Issue</span>
//                     <span className="mod-meta-item__value">
//                         {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
//                     </span>
//                 </div>
//                 <div className="mod-meta-divider" aria-hidden="true" />
//                 <div className="mod-meta-item">
//                     <span className="mod-meta-item__label">Signed by</span>
//                     <span className="mod-meta-item__value">{data.signatoryName} · {data.signatoryTitle}</span>
//                 </div>
//             </div>

//             <div className="mod-footer">
//                 <div className="mod-footer__sig">
//                     <img src={data.sigUrl} alt="Signature" className="mod-footer__sig-img" crossOrigin={data.sigUrl?.startsWith('http') ? 'anonymous' : undefined} />
//                     <div className="mod-footer__sig-line" />
//                 </div>
//                 <div className="mod-footer__stamp">
//                     <div className="mod-footer__stamp-type">Certificate of</div>
//                     <div className="mod-footer__stamp-value">{finalCertType}</div>
//                     <div className="mod-footer__stamp-dot" aria-hidden="true" />
//                 </div>
//             </div>
//         </div>

//         <div className="mod-dots" aria-hidden="true">
//             {Array.from({ length: 20 }).map((_, i) => (
//                 <div key={i} className="mod-dot" />
//             ))}
//         </div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    TEMPLATE PICKER MODAL
// ═══════════════════════════════════════════════════════════════════════════ */
// const TemplatePicker: React.FC<{
//     current: TemplateId;
//     onChange: (t: TemplateId) => void;
//     onClose: () => void;
// }> = ({ current, onChange, onClose }) => (
//     <div className="cs-tpicker-overlay" onClick={onClose}>
//         <div className="cs-tpicker-card" onClick={e => e.stopPropagation()}>
//             <div className="cs-tpicker-header">
//                 <h2 className="cs-tpicker-title"><Layers size={18} /> Choose a Template</h2>
//                 <button className="cs-tpicker-close" onClick={onClose}><X size={18} /></button>
//             </div>
//             <div className="cs-tpicker-grid">
//                 {TEMPLATES.map(t => (
//                     <button
//                         key={t.id}
//                         className={`cs-tpicker-item${current === t.id ? ' cs-tpicker-item--active' : ''}`}
//                         onClick={() => { onChange(t.id); onClose(); }}
//                     >
//                         <div className={`cs-tpicker-thumb cs-tpicker-thumb--${t.id}`} aria-hidden="true">
//                             {t.id === 'prestige' && (
//                                 <>
//                                     <div className="cst-p-corner cst-p-corner--tl" />
//                                     <div className="cst-p-corner cst-p-corner--tr" />
//                                     <div className="cst-p-corner cst-p-corner--bl" />
//                                     <div className="cst-p-corner cst-p-corner--br" />
//                                     <div className="cst-p-body">
//                                         <div className="cst-p-name" />
//                                         <div className="cst-p-line" />
//                                         <div className="cst-p-badge" />
//                                     </div>
//                                 </>
//                             )}
//                             {t.id === 'letterhead' && (
//                                 <>
//                                     <div className="cst-l-header">
//                                         <div className="cst-l-logo" />
//                                         <div className="cst-l-lines">
//                                             <div className="cst-l-line" /><div className="cst-l-line cst-l-line--short" />
//                                         </div>
//                                     </div>
//                                     <div className="cst-l-title" />
//                                     <div className="cst-l-rows">
//                                         <div className="cst-l-row" /><div className="cst-l-row" /><div className="cst-l-row" />
//                                     </div>
//                                     <div className="cst-l-panel" />
//                                 </>
//                             )}
//                             {t.id === 'modern' && (
//                                 <>
//                                     <div className="cst-m-rule" />
//                                     <div className="cst-m-body">
//                                         <div className="cst-m-small" /><div className="cst-m-name" /><div className="cst-m-line" /><div className="cst-m-med" />
//                                     </div>
//                                     <div className="cst-m-dots">
//                                         {[...Array(9)].map((_, i) => <div key={i} className="cst-m-dot" />)}
//                                     </div>
//                                 </>
//                             )}
//                         </div>
//                         <div className="cs-tpicker-meta">
//                             <div className="cs-tpicker-name">
//                                 {t.label}
//                                 {current === t.id && <Check size={13} className="cs-tpicker-check" />}
//                             </div>
//                             <div className="cs-tpicker-desc">{t.description}</div>
//                         </div>
//                     </button>
//                 ))}
//             </div>
//         </div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════ */
// export const CertificateStudio: React.FC = () => {
//     const {
//         settings,
//         user,
//         adHocCertificates = [],
//         certificateGroups = [],
//         fetchAdHocCertificates,
//         fetchCertificateGroups,
//         createCertificateGroup,
//         renameCertificateGroup,
//         fetchSettings // 🚀 Destructured to manually trigger
//     } = useStore();

//     const toast = useToast();
//     const navigate = useNavigate();

//     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [activeFolder, setActiveFolder] = useState<any>(null);
//     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);
//     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
//     const [newFolderName, setNewFolderName] = useState('');
//     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
//     const [editFolderName, setEditFolderName] = useState('');
//     const [isDownloadingAll, setIsDownloadingAll] = useState(false);

//     const [activeTemplate, setActiveTemplate] = useState<TemplateId>('prestige');
//     const [showTemplatePicker, setShowTemplatePicker] = useState(false);

//     const [certData, setCertData] = useState({
//         recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
//         description: 'has demonstrated exceptional skills and outstanding performance in',
//         programme: 'Advanced Leadership Workshop',
//         institutionName: 'mLab Southern Africa',
//         issueDate: new Date().toISOString().split('T')[0],
//         signatoryName: 'Zakhele Tinga', signatoryTitle: 'Academic Manager',
//         logoUrl: mLabLogo, sigUrl: defaultSignature, groupId: 'general'
//     });

//     const [isGenerating, setIsGenerating] = useState(false);
//     const [actionType, setActionType] = useState<'download' | 'email'>('download');
//     const [zoom, setZoom] = useState(0.65);
//     const certRef = useRef<HTMLDivElement>(null);

//     // 🚀 Force fetch settings if they are missing
//     useEffect(() => {
//         if (!settings && fetchSettings) {
//             fetchSettings();
//         }
//     }, [settings, fetchSettings]);

//     useEffect(() => {
//         if (settings) {
//             setCertData(prev => ({
//                 ...prev,
//                 institutionName: settings.institutionName || 'mLab Southern Africa',
//                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
//                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
//                 logoUrl: (settings as any).logoUrl || mLabLogo,
//                 sigUrl: (settings as any).signatureUrl || defaultSignature
//             }));
//         }
//     }, [settings]);

//     useEffect(() => {
//         const loadInitialData = async () => {
//             try {
//                 if (fetchCertificateGroups) await fetchCertificateGroups();
//                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
//             } catch (err) { console.error('Failed to load studio data', err); }
//             finally { setIsLoadingData(false); }
//         };
//         if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
//         else setIsLoadingData(false);
//     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

//     const handleLogout = async () => {
//         try { await signOut(auth); navigate('/login'); }
//         catch (e) { console.error('Logout failed', e); }
//     };

//     const handleCreateFolder = async () => {
//         if (!newFolderName.trim()) return;
//         try { if (createCertificateGroup) await createCertificateGroup(newFolderName.trim()); setNewFolderName(''); setShowNewFolderInput(false); toast.success('Folder created!'); }
//         catch { toast.error('Failed to create folder'); }
//     };

//     const handleRenameFolder = async (id: string) => {
//         if (!editFolderName.trim()) { setEditingFolderId(null); return; }
//         try { if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim()); setEditingFolderId(null); toast.success('Folder renamed!'); }
//         catch { toast.error('Failed to rename folder'); }
//     };

//     const getCertificatesForActiveFolder = () => {
//         if (!activeFolder) return [];
//         return activeFolder.id === 'general'
//             ? adHocCertificates.filter(c => !c.groupId || c.groupId === 'general')
//             : adHocCertificates.filter(c => c.groupId === activeFolder.id);
//     };

//     const handleDownloadAll = async () => {
//         const certs = getCertificatesForActiveFolder();
//         if (!certs.length) return;
//         setIsDownloadingAll(true);
//         toast.info(`Preparing to download ${certs.length} certificates…`);
//         try {
//             for (const cert of certs) {
//                 const blob = await fetch(cert.pdfUrl).then(r => r.blob());
//                 const url = window.URL.createObjectURL(blob);
//                 const a = document.createElement('a');
//                 a.href = url; a.download = `${cert.type.replace(/\s+/g, '_')}_${cert.recipientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
//                 document.body.appendChild(a); a.click();
//                 window.URL.revokeObjectURL(url); document.body.removeChild(a);
//                 await new Promise(r => setTimeout(r, 600));
//             }
//             toast.success('All certificates downloaded!');
//         } catch { toast.error('Bulk download failed.'); }
//         finally { setIsDownloadingAll(false); }
//     };

//     const handleChange = (field: string, value: string) => setCertData(prev => ({ ...prev, [field]: value }));
//     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
//         const file = e.target.files?.[0];
//         if (file) handleChange(field, URL.createObjectURL(file));
//     };
//     const resetForm = () => setCertData(prev => ({ ...prev, recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '', programme: 'Advanced Leadership Workshop' }));
//     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

//     const executeGeneration = useCallback(async () => {
//         if (!certRef.current) return;
//         if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }
//         setIsGenerating(true);
//         toast.info(actionType === 'email' ? 'Generating and sending email…' : 'Generating high-res PDF…');
//         try {
//             const currentZoom = zoom; setZoom(1);
//             await new Promise(r => setTimeout(r, 300));
//             const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
//             setZoom(currentZoom);
//             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
//             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
//             const pdfBlob = pdf.output('blob');
//             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
//             const storageRef = ref(getStorage(), `ad_hoc_certs/${Date.now()}_${safeName}.pdf`);
//             await uploadBytes(storageRef, pdfBlob);
//             const downloadUrl = await getDownloadURL(storageRef);
//             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
//                 recipientName: certData.recipientName, recipientEmail: certData.recipientEmail || null,
//                 type: finalCertType, courseName: certData.programme, issueDate: certData.issueDate,
//                 pdfUrl: downloadUrl, groupId: certData.groupId || 'general', template: activeTemplate,
//                 createdBy: user?.uid || 'Admin', createdAt: serverTimestamp(), isEmailed: false
//             });
//             if (actionType === 'email' && certData.recipientEmail) {
//                 await httpsCallable(getFunctions(), 'sendAdHocCertificate')({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
//                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
//                 toast.success(`Certificate emailed to ${certData.recipientEmail}`);
//             } else { pdf.save(`Certificate_${safeName}.pdf`); toast.success('Certificate downloaded!'); }
//             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
//             resetForm(); setView('folders');
//         } catch (err: any) { console.error('Studio Error:', err); toast.error('Failed to process. Please try again.'); }
//         finally { setIsGenerating(false); }
//     }, [certRef, certData, actionType, toast, zoom, finalCertType, user, fetchAdHocCertificates, activeTemplate]);

//     return (
//         <div className="admin-layout">
//             {/* ── Mobile header ── */}
//             <div className="admin-mobile-header">
//                 <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
//                 <div className="admin-mobile-title">Certificate Studio</div>
//             </div>
//             {isMobileMenuOpen && <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}
//             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
//                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
//                 <Sidebar role={user?.role} currentNav="studio" setCurrentNav={() => { }} onLogout={handleLogout} />
//             </div>

//             {/* Template picker modal */}
//             {showTemplatePicker && (
//                 <TemplatePicker current={activeTemplate} onChange={setActiveTemplate} onClose={() => setShowTemplatePicker(false)} />
//             )}

//             <main className="main-wrapper cs-main">
//                 <header className="dashboard-header">
//                     <div className="header-title">
//                         <h1>Certificate Studio</h1>
//                         <p>{view === 'studio' ? 'Design and issue your ad-hoc award' : 'Manage folders and generation history'}</p>
//                     </div>
//                 </header>

//                 <div className="admin-content cs-admin-content">

//                     {/* ════════ VIEW 1: FOLDERS ════════ */}
//                     {view === 'folders' && (
//                         <div className="cs-view cs-view--folders">
//                             <div className="cs-toolbar">
//                                 <div className="cs-toolbar__left">
//                                     {showNewFolderInput ? (
//                                         <div className="cs-new-folder-row">
//                                             <input className="mlab-input cs-new-folder-input" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name…" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolderInput(false); }} />
//                                             <button className="mlab-btn mlab-btn--green" onClick={handleCreateFolder}>Save</button>
//                                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
//                                         </div>
//                                     ) : (
//                                         <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setShowNewFolderInput(true)}><FolderPlus size={14} /> New Folder</button>
//                                     )}
//                                 </div>
//                                 <button className="mlab-btn mlab-btn--primary" onClick={() => setView('studio')}><Plus size={14} /> Create Certificate</button>
//                             </div>

//                             {isLoadingData ? (
//                                 <div className="cs-loading"><div className="ap-spinner" /><span className="cs-loading__label">Loading Workspace…</span></div>
//                             ) : (
//                                 <div className="cs-folder-grid">
//                                     {/* General folder */}
//                                     <button className="cs-folder-card" onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
//                                         <div className="cs-folder-card__icon cs-folder-card__icon--general"><Folder size={22} /></div>
//                                         <div className="cs-folder-card__body">
//                                             <div className="cs-folder-card__name">General</div>
//                                             <div className="cs-folder-card__count">{adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} documents</div>
//                                         </div>
//                                         <ChevronRight size={16} className="cs-folder-card__arrow" />
//                                     </button>

//                                     {/* Dynamic groups */}
//                                     {certificateGroups.map(group => (
//                                         <div key={group.id} className="cs-folder-card cs-folder-card--group" onClick={() => { if (editingFolderId !== group.id) { setActiveFolder(group); setView('inside-folder'); } }}>
//                                             <div className="cs-folder-card__icon cs-folder-card__icon--group"><Folder size={22} /></div>
//                                             <div className="cs-folder-card__body">
//                                                 {editingFolderId === group.id ? (
//                                                     <div className="cs-rename-row" onClick={e => e.stopPropagation()}>
//                                                         <input className="mlab-input cs-rename-input" autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }} />
//                                                         <button className="mlab-btn mlab-btn--green cs-rename-save" onClick={() => handleRenameFolder(group.id)}>Save</button>
//                                                         <button className="mlab-btn mlab-btn--ghost cs-rename-save" onClick={() => setEditingFolderId(null)}>✕</button>
//                                                     </div>
//                                                 ) : (
//                                                     <>
//                                                         <div className="cs-folder-card__name">{group.name}</div>
//                                                         <div className="cs-folder-card__count">{adHocCertificates.filter(c => c.groupId === group.id).length} documents</div>
//                                                     </>
//                                                 )}
//                                             </div>
//                                             {editingFolderId !== group.id && (
//                                                 <div className="cs-folder-card__actions">
//                                                     <button className="mlab-icon-btn cs-folder-edit-btn" title="Rename" onClick={e => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }}><Edit2 size={14} /></button>
//                                                     <ChevronRight size={16} className="cs-folder-card__arrow" />
//                                                 </div>
//                                             )}
//                                         </div>
//                                     ))}
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* ════════ VIEW 2: INSIDE FOLDER ════════ */}
//                     {view === 'inside-folder' && activeFolder && (
//                         <div className="cs-view cs-view--folder-contents">
//                             <div className="cs-toolbar">
//                                 <div className="cs-toolbar__left">
//                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setView('folders')}><ArrowLeft size={14} /> Folders</button>
//                                     <div className="cs-breadcrumb"><Folder size={16} /> {activeFolder.name}</div>
//                                 </div>
//                                 {getCertificatesForActiveFolder().length > 0 && (
//                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={handleDownloadAll} disabled={isDownloadingAll}>
//                                         {isDownloadingAll ? <Loader2 className="spin" size={14} /> : <DownloadCloud size={14} />}
//                                         {isDownloadingAll ? 'Downloading…' : 'Download All'}
//                                     </button>
//                                 )}
//                             </div>

//                             {getCertificatesForActiveFolder().length === 0 ? (
//                                 <div className="cs-empty">
//                                     <div className="cs-empty__icon"><FileText size={32} /></div>
//                                     <p className="cs-empty__title">Folder is Empty</p>
//                                     <p className="cs-empty__desc">No certificates saved here yet.</p>
//                                     <button className="mlab-btn mlab-btn--primary" onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}><Plus size={14} /> Create Certificate Here</button>
//                                 </div>
//                             ) : (
//                                 <div className="cs-cert-grid">
//                                     {getCertificatesForActiveFolder().map(cert => (
//                                         <div key={cert.id} className="cs-cert-card">
//                                             <div className="cs-cert-card__hero">
//                                                 <Award size={42} className="cs-cert-card__hero-icon" />
//                                                 <div className="cs-cert-card__badges">
//                                                     {cert.isEmailed && <span className="cs-cert-badge cs-cert-badge--emailed"><Mail size={9} /> Sent</span>}
//                                                     <span className="cs-cert-badge cs-cert-badge--pdf">PDF</span>
//                                                 </div>
//                                             </div>
//                                             <div className="cs-cert-card__body">
//                                                 <h4 className="cs-cert-card__name">{cert.recipientName}</h4>
//                                                 <p className="cs-cert-card__type">{cert.type}</p>
//                                                 <p className="cs-cert-card__programme">{cert.courseName}</p>
//                                                 <div className="cs-cert-card__footer">
//                                                     <span className="cs-cert-card__date">
//                                                         {cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString('en-ZA') : cert.issueDate}
//                                                     </span>
//                                                     <button className="mlab-btn mlab-btn--outline-blue cs-cert-card__view-btn" onClick={() => window.open(cert.pdfUrl, '_blank')}><Download size={12} /> View</button>
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     ))}
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* ════════ VIEW 3: STUDIO ════════ */}
//                     {view === 'studio' && (
//                         <div className="cs-view cs-view--studio">
//                             {/* Studio toolbar */}
//                             <div className="cs-toolbar cs-toolbar--studio">
//                                 <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setView('folders')}><ArrowLeft size={14} /> Cancel</button>
//                                 <div className="cs-toolbar__centre">
//                                     <button className="cs-template-switcher" onClick={() => setShowTemplatePicker(true)}>
//                                         <Layers size={14} />
//                                         Template: <strong>{TEMPLATES.find(t => t.id === activeTemplate)?.label}</strong>
//                                         <ChevronRight size={13} className="cs-template-switcher__caret" />
//                                     </button>
//                                     <div className="cs-zoom-controls">
//                                         <button className="mlab-icon-btn" onClick={() => setZoom(z => Math.max(z - 0.1, 0.3))}><ZoomOut size={15} /></button>
//                                         <span className="cs-zoom-label">{Math.round(zoom * 100)}%</span>
//                                         <button className="mlab-icon-btn" onClick={() => setZoom(z => Math.min(z + 0.1, 1.5))}><ZoomIn size={15} /></button>
//                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => setZoom(0.65)}><RotateCcw size={15} /></button>
//                                     </div>
//                                 </div>
//                                 <div className="cs-toolbar__right">
//                                     <button className="mlab-btn mlab-btn--outline-blue" disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
//                                         {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Download PDF
//                                     </button>
//                                     <button className="mlab-btn mlab-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
//                                         {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={14} /> : <Mail size={14} />} Email
//                                     </button>
//                                 </div>
//                             </div>

//                             {/* Studio body: form pane + canvas */}
//                             <div className="cs-studio-body">
//                                 {/* ── Form pane ── */}
//                                 <aside className="cs-form-pane">
//                                     <div className="cs-form-pane__inner">
//                                         <FormSection title="Folder" icon={Folder}>
//                                             <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
//                                                 <select className="mlab-input" style={{ border: 'none', background: 'transparent', width: '100%' }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}>
//                                                     <option value="general">General</option>
//                                                     {certificateGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
//                                                 </select>
//                                             </div>
//                                         </FormSection>
//                                         <FormSection title="Recipient" icon={UserCircle}>
//                                             <input className="mlab-input" placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
//                                             <input className="mlab-input" type="email" placeholder="Email (for delivery)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
//                                         </FormSection>
//                                         <FormSection title="Award Details" icon={FileCheck}>
//                                             <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
//                                                 <select className="mlab-input" style={{ border: 'none', background: 'transparent', width: '100%' }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}>
//                                                     <option value="Achievement">Certificate of Achievement</option>
//                                                     <option value="Attendance">Certificate of Attendance</option>
//                                                     <option value="Appreciation">Certificate of Appreciation</option>
//                                                     <option value="Excellence">Award of Excellence</option>
//                                                     <option value="Competence">Certificate of Competence</option>
//                                                     <option value="Other">Custom Title…</option>
//                                                 </select>
//                                             </div>
//                                             {certData.certType === 'Other' && <input className="mlab-input" placeholder="Custom title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
//                                             <input className="mlab-input" placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
//                                             <textarea className="mlab-input" style={{ minHeight: '60px' }} placeholder="Description…" value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
//                                         </FormSection>
//                                         <FormSection title="Branding" icon={Building2}>
//                                             <input className="mlab-input" placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
//                                             <div className="cs-form-grid2">
//                                                 <input className="mlab-input" placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
//                                                 <input className="mlab-input" type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
//                                             </div>
//                                             <input className="mlab-input" placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />
//                                             <div className="cs-form-grid2 cs-upload-row">
//                                                 <label className="cs-upload-btn">
//                                                     <ImageIcon size={13} /> Logo
//                                                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} />
//                                                 </label>
//                                                 <label className="cs-upload-btn">
//                                                     <ImageIcon size={13} /> Signature
//                                                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} />
//                                                 </label>
//                                             </div>
//                                         </FormSection>
//                                     </div>
//                                 </aside>

//                                 {/* ── Canvas pane ── */}
//                                 <div className="cs-canvas-pane">
//                                     <div className="cs-canvas-pane__inner">
//                                         <div
//                                             className="cert-canvas"
//                                             ref={certRef}
//                                             style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
//                                         >
//                                             {activeTemplate === 'prestige' && <TemplatePrestige data={certData} finalCertType={finalCertType} />}
//                                             {activeTemplate === 'letterhead' && <TemplateLetterhead data={certData} finalCertType={finalCertType} />}
//                                             {activeTemplate === 'modern' && <TemplateModern data={certData} finalCertType={finalCertType} />}
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };


// // import React, { useState, useRef, useEffect, useCallback } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import {
// //     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
// //     Mail, Building2, UserCircle, Image as ImageIcon, Plus, History, ArrowLeft,
// //     FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2, DownloadCloud
// // } from 'lucide-react';
// // import { collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
// // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import html2canvas from 'html2canvas';
// // import jsPDF from 'jspdf';
// // import { useStore } from '../../../store/useStore';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // import { auth, db } from '../../../lib/firebase';

// // // import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // // import '../AdminDashboard.css';

// // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // import defaultSignature from '../../../assets/Signatue_Zack_.png';

// // const FormSection = ({ title, icon: Icon, children }: any) => (
// //     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
// //         <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //             <Icon size={16} /> {title}
// //         </h3>
// //         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// //             {children}
// //         </div>
// //     </div>
// // );

// // export const CertificateStudio: React.FC = () => {
// //     const {
// //         settings,
// //         user,
// //         adHocCertificates = [],
// //         certificateGroups = [],
// //         fetchAdHocCertificates,
// //         fetchCertificateGroups,
// //         createCertificateGroup,
// //         renameCertificateGroup
// //     } = useStore();

// //     const toast = useToast();
// //     const navigate = useNavigate();

// //     // ─── VIEW & LAYOUT STATE ───
// //     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// //     const [activeFolder, setActiveFolder] = useState<any>(null);
// //     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

// //     // ─── FOLDER CREATION / RENAME / DOWNLOAD STATE ───
// //     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
// //     const [newFolderName, setNewFolderName] = useState('');
// //     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
// //     const [editFolderName, setEditFolderName] = useState('');
// //     const [isDownloadingAll, setIsDownloadingAll] = useState(false); // 🚀 Bulk Download State

// //     // ─── EDITABLE STUDIO STATE ───
// //     const [certData, setCertData] = useState({
// //         recipientName: '',
// //         recipientEmail: '',
// //         certType: 'Achievement',
// //         customType: '',
// //         description: 'has demonstrated exceptional skills and outstanding performance in',
// //         programme: 'Advanced Leadership Workshop',
// //         institutionName: 'mLab Southern Africa',
// //         issueDate: new Date().toISOString().split('T')[0],
// //         signatoryName: 'Zakhele Tinga',
// //         signatoryTitle: 'Academic Manager',
// //         logoUrl: mLabLogo,
// //         sigUrl: defaultSignature,
// //         groupId: 'general'
// //     });

// //     const [isGenerating, setIsGenerating] = useState(false);
// //     const [actionType, setActionType] = useState<'download' | 'email'>('download');
// //     const [zoom, setZoom] = useState(0.65);
// //     const certRef = useRef<HTMLDivElement>(null);

// //     useEffect(() => {
// //         if (settings) {
// //             setCertData(prev => ({
// //                 ...prev,
// //                 institutionName: settings.institutionName || "mLab Southern Africa",
// //                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
// //                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
// //                 logoUrl: (settings as any).logoUrl || mLabLogo,
// //                 sigUrl: (settings as any).signatureUrl || defaultSignature
// //             }));
// //         }
// //     }, [settings]);

// //     useEffect(() => {
// //         const loadInitialData = async () => {
// //             try {
// //                 if (fetchCertificateGroups) await fetchCertificateGroups();
// //                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
// //             } catch (error) {
// //                 console.error("Failed to load studio data", error);
// //             } finally {
// //                 setIsLoadingData(false);
// //             }
// //         };
// //         if (adHocCertificates.length === 0 || certificateGroups.length === 0) {
// //             loadInitialData();
// //         } else {
// //             setIsLoadingData(false);
// //         }
// //     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         } catch (error) {
// //             console.error('Logout failed', error);
// //         }
// //     };

// //     // ─── FOLDER HANDLERS ───
// //     const handleCreateFolder = async () => {
// //         if (!newFolderName.trim()) return;
// //         try {
// //             if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
// //             setNewFolderName('');
// //             setShowNewFolderInput(false);
// //             toast.success("Folder created successfully!");
// //         } catch (error) {
// //             toast.error("Failed to create folder");
// //         }
// //     };

// //     const handleRenameFolder = async (id: string) => {
// //         if (!editFolderName.trim()) {
// //             setEditingFolderId(null);
// //             return;
// //         }
// //         try {
// //             if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
// //             setEditingFolderId(null);
// //             toast.success("Folder renamed!");
// //         } catch (error) {
// //             toast.error("Failed to rename folder");
// //         }
// //     };

// //     const getCertificatesForActiveFolder = () => {
// //         if (!activeFolder) return [];
// //         if (activeFolder.id === 'general') {
// //             return adHocCertificates.filter(c => !c.groupId || c.groupId === 'general');
// //         }
// //         return adHocCertificates.filter(c => c.groupId === activeFolder.id);
// //     };

// //     // 🚀 BULK DOWNLOAD HANDLER
// //     const handleDownloadAll = async () => {
// //         const certs = getCertificatesForActiveFolder();
// //         if (certs.length === 0) return;

// //         setIsDownloadingAll(true);
// //         toast.info(`Preparing to download ${certs.length} certificates...`);

// //         try {
// //             for (let i = 0; i < certs.length; i++) {
// //                 const cert = certs[i];

// //                 // Fetch the PDF as a blob to force a direct download (avoids popup blockers)
// //                 const response = await fetch(cert.pdfUrl);
// //                 const blob = await response.blob();
// //                 const url = window.URL.createObjectURL(blob);

// //                 const a = document.createElement('a');
// //                 a.style.display = 'none';
// //                 a.href = url;
// //                 // Clean the name for a safe file output
// //                 const safeName = cert.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// //                 a.download = `${cert.type.replace(/\s+/g, '_')}_${safeName}.pdf`;

// //                 document.body.appendChild(a);
// //                 a.click();

// //                 window.URL.revokeObjectURL(url);
// //                 document.body.removeChild(a);

// //                 // Small delay to prevent the browser from blocking multiple rapid downloads
// //                 await new Promise(resolve => setTimeout(resolve, 600));
// //             }
// //             toast.success("All certificates downloaded successfully!");
// //         } catch (error) {
// //             console.error("Bulk download failed:", error);
// //             toast.error("Failed to download all files. Please try downloading individually.");
// //         } finally {
// //             setIsDownloadingAll(false);
// //         }
// //     };

// //     // ─── STUDIO HANDLERS ───
// //     const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
// //     const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
// //     const handleResetZoom = () => setZoom(0.65);

// //     const handleChange = (field: string, value: string) => {
// //         setCertData(prev => ({ ...prev, [field]: value }));
// //     };

// //     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
// //         const file = e.target.files?.[0];
// //         if (file) {
// //             const tempUrl = URL.createObjectURL(file);
// //             handleChange(field, tempUrl);
// //         }
// //     };

// //     const resetForm = () => {
// //         setCertData(prev => ({
// //             ...prev,
// //             recipientName: '',
// //             recipientEmail: '',
// //             certType: 'Achievement',
// //             customType: '',
// //             programme: 'Advanced Leadership Workshop'
// //         }));
// //     };

// //     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

// //     const executeGeneration = useCallback(async () => {
// //         if (!certRef.current) return;
// //         if (!certData.recipientName.trim()) {
// //             toast.error('Recipient name is required');
// //             return;
// //         }

// //         setIsGenerating(true);
// //         toast.info(actionType === 'email' ? 'Generating and sending email...' : 'Generating high-res PDF...');

// //         try {
// //             const currentZoom = zoom;
// //             setZoom(1);
// //             await new Promise(resolve => setTimeout(resolve, 300));

// //             const canvas = await html2canvas(certRef.current, {
// //                 scale: 2,
// //                 useCORS: true,
// //                 logging: false,
// //                 backgroundColor: '#ffffff',
// //                 width: 1123,
// //                 height: 794
// //             });

// //             setZoom(currentZoom);

// //             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
// //             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
// //             const pdfBlob = pdf.output('blob');

// //             const storage = getStorage();
// //             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// //             const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
// //             const storageRef = ref(storage, fileName);
// //             await uploadBytes(storageRef, pdfBlob);
// //             const downloadUrl = await getDownloadURL(storageRef);

// //             // 1. Create the document FIRST so we have an ID
// //             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
// //                 recipientName: certData.recipientName,
// //                 recipientEmail: certData.recipientEmail || null,
// //                 type: finalCertType,
// //                 courseName: certData.programme,
// //                 issueDate: certData.issueDate,
// //                 pdfUrl: downloadUrl,
// //                 groupId: certData.groupId || 'general',
// //                 createdBy: user?.uid || 'Admin',
// //                 createdAt: serverTimestamp(),
// //                 isEmailed: false
// //             });

// //             // 2. If emailing, trigger cloud function and update the document upon success
// //             if (actionType === 'email' && certData.recipientEmail) {
// //                 const functions = getFunctions();
// //                 const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
// //                 await sendAdHocEmail({
// //                     email: certData.recipientEmail,
// //                     recipientName: certData.recipientName,
// //                     pdfUrl: downloadUrl,
// //                     awardTitle: finalCertType,
// //                     courseName: certData.programme
// //                 });

// //                 // Update Firestore to indicate the email was successfully sent
// //                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
// //                 toast.success(`Certificate successfully emailed to ${certData.recipientEmail}`);
// //             } else if (actionType === 'download') {
// //                 pdf.save(`Certificate_${safeName}.pdf`);
// //                 toast.success('Certificate downloaded securely!');
// //             }

// //             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);

// //             resetForm();
// //             setView('folders');
// //         } catch (error: any) {
// //             console.error('Studio Error:', error);
// //             toast.error('Failed to process. Please try again.');
// //         } finally {
// //             setIsGenerating(false);
// //         }
// //     }, [certRef, certData, actionType, toast, zoom, finalCertType, user, fetchAdHocCertificates]);

// //     return (
// //         <div className="admin-layout">
// //             <div className="admin-mobile-header">
// //                 <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// //                     <Menu size={24} />
// //                 </button>
// //                 <div className="admin-mobile-title">Certificate Studio</div>
// //             </div>

// //             {isMobileMenuOpen && (
// //                 <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// //             )}

// //             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
// //                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// //                     <X size={24} />
// //                 </button>
// //                 <Sidebar role={user?.role} currentNav="studio" setCurrentNav={() => { }} onLogout={handleLogout} />
// //             </div>

// //             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
// //                 <header className="dashboard-header" style={{ flexShrink: 0 }}>
// //                     <div className="header-title">
// //                         <h1>Certificate Studio</h1>
// //                         <p>{view === 'studio' ? 'Design and customize your ad-hoc award' : 'Manage your folders and generation history'}</p>
// //                     </div>
// //                 </header>

// //                 <div className="admin-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

// //                     {/* ════════════════════════════════════════════════════════
// //                         VIEW 1: FOLDERS LIST
// //                         ════════════════════════════════════════════════════════ */}
// //                     {view === 'folders' && (
// //                         <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
// //                             <div className="mlab-standard-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
// //                                 <div style={{ display: 'flex', gap: '10px' }}>
// //                                     {showNewFolderInput ? (
// //                                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                             <input
// //                                                 className="mlab-input"
// //                                                 style={{ width: '220px', padding: '0.5rem 0.75rem' }}
// //                                                 value={newFolderName}
// //                                                 onChange={e => setNewFolderName(e.target.value)}
// //                                                 placeholder="Enter folder name..."
// //                                                 autoFocus
// //                                             />
// //                                             <button className="mlab-btn mlab-btn--green" onClick={handleCreateFolder}>Save</button>
// //                                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
// //                                         </div>
// //                                     ) : (
// //                                         <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setShowNewFolderInput(true)}>
// //                                             <FolderPlus size={15} /> New Folder
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                                 <button className="mlab-btn mlab-btn--primary" onClick={() => setView('studio')}>
// //                                     <Plus size={15} /> Create Certificate
// //                                 </button>
// //                             </div>

// //                             <div style={{ flex: 1, overflowY: 'auto' }}>
// //                                 {isLoadingData ? (
// //                                     <div className="ap-fullscreen" style={{ position: 'absolute', inset: 0 }}>
// //                                         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// //                                             <div className="ap-spinner" />
// //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Workspace...</span>
// //                                         </div>
// //                                     </div>
// //                                 ) : (
// //                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>

// //                                         {/* Static General Folder */}
// //                                         <div className="mlab-card" style={{ cursor: 'pointer', background: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
// //                                             onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
// //                                             <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}>
// //                                                 <Folder size={24} />
// //                                             </div>
// //                                             <div style={{ flex: 1 }}>
// //                                                 <h4 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>General</h4>
// //                                                 <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
// //                                                     {adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents
// //                                                 </p>
// //                                             </div>
// //                                             <ChevronRight size={18} color="#cbd5e1" />
// //                                         </div>

// //                                         {/* Dynamic Groups */}
// //                                         {certificateGroups.map(group => (
// //                                             <div key={group.id} className="mlab-card" style={{ cursor: 'pointer', background: 'white', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
// //                                                 onClick={() => {
// //                                                     if (editingFolderId !== group.id) {
// //                                                         setActiveFolder(group);
// //                                                         setView('inside-folder');
// //                                                     }
// //                                                 }}>
// //                                                 <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green)' }}>
// //                                                     <Folder size={24} />
// //                                                 </div>
// //                                                 <div style={{ flex: 1 }}>
// //                                                     {editingFolderId === group.id ? (
// //                                                         <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
// //                                                             <input
// //                                                                 className="mlab-input"
// //                                                                 style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem' }}
// //                                                                 autoFocus
// //                                                                 value={editFolderName}
// //                                                                 onChange={e => setEditFolderName(e.target.value)}
// //                                                                 onKeyDown={e => {
// //                                                                     if (e.key === 'Enter') handleRenameFolder(group.id);
// //                                                                     if (e.key === 'Escape') setEditingFolderId(null);
// //                                                                 }}
// //                                                             />
// //                                                             <button className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
// //                                                             <button className="mlab-btn mlab-btn--ghost" style={{ padding: '0.4rem 0.6rem' }} onClick={() => setEditingFolderId(null)}>Cancel</button>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <>
// //                                                             <h4 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
// //                                                             <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
// //                                                                 {adHocCertificates.filter(c => c.groupId === group.id).length} Documents
// //                                                             </p>
// //                                                         </>
// //                                                     )}
// //                                                 </div>

// //                                                 {/* Hover Edit Action */}
// //                                                 {editingFolderId !== group.id && (
// //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                         <button
// //                                                             className="mlab-icon-btn"
// //                                                             style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
// //                                                             onClick={(e) => {
// //                                                                 e.stopPropagation();
// //                                                                 setEditingFolderId(group.id);
// //                                                                 setEditFolderName(group.name);
// //                                                             }}
// //                                                             title="Rename Folder"
// //                                                         >
// //                                                             <Edit2 size={16} color="var(--mlab-grey)" />
// //                                                         </button>
// //                                                         <ChevronRight size={18} color="#cbd5e1" />
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         ))}

// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ════════════════════════════════════════════════════════
// //                         VIEW 2: INSIDE A SPECIFIC FOLDER
// //                         ════════════════════════════════════════════════════════ */}
// //                     {view === 'inside-folder' && activeFolder && (
// //                         <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

// //                             <div className="mlab-standard-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
// //                                     <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
// //                                         <ArrowLeft size={15} /> Back to Folders
// //                                     </button>
// //                                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                         <Folder size={20} color="var(--mlab-green)" /> {activeFolder.name}
// //                                     </h2>
// //                                 </div>

// //                                 {/* 🚀 NEW: Bulk Download Button */}
// //                                 {getCertificatesForActiveFolder().length > 0 && (
// //                                     <button
// //                                         className="mlab-btn mlab-btn--outline-blue"
// //                                         onClick={handleDownloadAll}
// //                                         disabled={isDownloadingAll}
// //                                     >
// //                                         {isDownloadingAll ? <Loader2 className="spin" size={15} /> : <DownloadCloud size={15} />}
// //                                         {isDownloadingAll ? 'Downloading...' : 'Download All as PDFs'}
// //                                     </button>
// //                                 )}
// //                             </div>

// //                             <div style={{ flex: 1, overflowY: 'auto' }}>
// //                                 {getCertificatesForActiveFolder().length === 0 ? (
// //                                     <div className="mlab-empty" style={{ borderRadius: '8px', border: '1px dashed #cbd5e1', background: 'transparent' }}>
// //                                         <FileText size={48} color="var(--mlab-grey-light)" className="mlab-empty-icon" />
// //                                         <p className="mlab-empty__title">Folder is Empty</p>
// //                                         <p className="mlab-empty__desc" style={{ marginBottom: '1.5rem' }}>No certificates have been saved to this folder yet.</p>
// //                                         <button className="mlab-btn mlab-btn--primary" onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
// //                                             <Plus size={16} /> Create Certificate Here
// //                                         </button>
// //                                     </div>
// //                                 ) : (
// //                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
// //                                         {getCertificatesForActiveFolder().map(cert => (
// //                                             <div key={cert.id} style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
// //                                                 <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
// //                                                     <Award size={48} color="rgba(255,255,255,0.1)" />
// //                                                     <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
// //                                                         {cert.isEmailed && (
// //                                                             <span className="mlab-badge" style={{ background: 'var(--mlab-emerald)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem' }} title={`Emailed to ${cert.recipientEmail}`}>
// //                                                                 <Mail size={10} /> Sent
// //                                                             </span>
// //                                                         )}
// //                                                         <span className="mlab-badge mlab-badge--active" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none' }}>PDF</span>
// //                                                     </div>
// //                                                 </div>
// //                                                 <div style={{ padding: '1.25rem' }}>
// //                                                     <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                                         {cert.recipientName}
// //                                                     </h4>
// //                                                     <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                                         <strong>{cert.type}</strong>
// //                                                         <span>{cert.courseName}</span>
// //                                                     </p>
// //                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
// //                                                         <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
// //                                                             {cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}
// //                                                         </span>
// //                                                         <button className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
// //                                                             <Download size={14} /> View
// //                                                         </button>
// //                                                     </div>
// //                                                 </div>
// //                                             </div>
// //                                         ))}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ════════════════════════════════════════════════════════
// //                         VIEW 3: THE AD-HOC STUDIO GENERATOR 
// //                         ════════════════════════════════════════════════════════ */}
// //                     {view === 'studio' && (
// //                         <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

// //                             <div className="mlab-standard-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
// //                                 <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
// //                                     <ArrowLeft size={15} /> Cancel
// //                                 </button>
// //                                 <div style={{ display: 'flex', gap: '0.75rem' }}>
// //                                     <button className="mlab-btn mlab-btn--outline-blue" disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
// //                                         {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={16} /> : <Download size={15} />}
// //                                         Download PDF
// //                                     </button>
// //                                     <button className="mlab-btn mlab-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
// //                                         {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={16} /> : <Mail size={15} />}
// //                                         Email Document
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden', paddingBottom: '0.5rem' }}>

// //                                 {/* ── LEFT PANE: STUDIO FORM ── */}
// //                                 <div style={{ width: '380px', flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
// //                                     <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>

// //                                         <FormSection title="Organization" icon={Folder}>
// //                                             <select className="mlab-input" value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}>
// //                                                 <option value="general">General (No Folder)</option>
// //                                                 {certificateGroups.map(g => (
// //                                                     <option key={g.id} value={g.id}>{g.name}</option>
// //                                                 ))}
// //                                             </select>
// //                                         </FormSection>

// //                                         <FormSection title="Recipient Details" icon={UserCircle}>
// //                                             <input className="mlab-input" placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
// //                                             <input className="mlab-input" type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
// //                                         </FormSection>

// //                                         <FormSection title="Award Details" icon={FileCheck}>
// //                                             <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
// //                                                 <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}>
// //                                                     <option value="Achievement">Certificate of Achievement</option>
// //                                                     <option value="Attendance">Certificate of Attendance</option>
// //                                                     <option value="Appreciation">Certificate of Appreciation</option>
// //                                                     <option value="Excellence">Award of Excellence</option>
// //                                                     <option value="Other">Custom Title...</option>
// //                                                 </select>
// //                                             </div>
// //                                             {certData.certType === 'Other' && (
// //                                                 <input className="mlab-input" placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />
// //                                             )}
// //                                             <input className="mlab-input" placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
// //                                             <textarea className="mlab-input" style={{ minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
// //                                         </FormSection>

// //                                         <FormSection title="Branding & Signatures" icon={Building2}>
// //                                             <input className="mlab-input" placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
// //                                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
// //                                                 <input className="mlab-input" placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
// //                                                 <input className="mlab-input" type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
// //                                             </div>
// //                                             <input className="mlab-input" placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />

// //                                             <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
// //                                                 <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
// //                                                     <ImageIcon size={14} /> Change Logo
// //                                                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} />
// //                                                 </label>
// //                                                 <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
// //                                                     <ImageIcon size={14} /> Change Signature
// //                                                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} />
// //                                                 </label>
// //                                             </div>
// //                                         </FormSection>

// //                                     </div>
// //                                 </div>

// //                                 {/* ── RIGHT PANE: CANVAS PREVIEW ── */}
// //                                 <div className="cert-preview-container" style={{ flex: 1, position: 'relative', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>

// //                                     <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
// //                                         <button className="mlab-icon-btn" onClick={handleZoomOut}><ZoomOut size={16} /></button>
// //                                         <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
// //                                         <button className="mlab-icon-btn" onClick={handleZoomIn}><ZoomIn size={16} /></button>
// //                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom}><RotateCcw size={16} /></button>
// //                                     </div>

// //                                     <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
// //                                         <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto' }}>
// //                                             <div className="cert-bg-luxury">
// //                                                 <div className="cert-pattern-grid" />
// //                                                 <div className="cert-pattern-hex" />
// //                                                 <div className="cert-gradient-overlay" />
// //                                             </div>
// //                                             <div className="cert-main">
// //                                                 <div className="cert-top-accent">
// //                                                     <div className="cert-accent-line green" />
// //                                                     <div className="cert-accent-line blue" />
// //                                                 </div>

// //                                                 <header className="cert-header">
// //                                                     <div className="cert-logo-container">
// //                                                         {certData.logoUrl && <img src={certData.logoUrl} alt="Logo" className="cert-logo" crossOrigin="anonymous" />}
// //                                                     </div>
// //                                                     <div className="cert-institution">
// //                                                         <h3>{certData.institutionName}</h3>
// //                                                         <div className="cert-divider-diamond"><span className="diamond" /></div>
// //                                                     </div>
// //                                                 </header>

// //                                                 <main className="cert-content">
// //                                                     <div className="cert-pretitle">This is to certify that</div>
// //                                                     <h1 className="cert-recipient-name">{certData.recipientName || '[Recipient Name]'}</h1>
// //                                                     <div className="cert-description">{certData.description}</div>
// //                                                     <div className="cert-programme-name">{certData.programme || '[Event/Course Name]'}</div>

// //                                                     <div className="cert-type-badge">
// //                                                         <span className="cert-type-text">{finalCertType.includes('Award') ? 'Official' : 'Certificate of'}</span>
// //                                                         <span className="cert-type-value">{finalCertType}</span>
// //                                                     </div>
// //                                                 </main>

// //                                                 <footer className="cert-footer-new">
// //                                                     <div className="cert-signature-block">
// //                                                         <div className="cert-signature-image-container">
// //                                                             {certData.sigUrl && <img src={certData.sigUrl} alt="Signature" className="cert-signature-img" crossOrigin="anonymous" />}
// //                                                         </div>
// //                                                         <div className="cert-signature-line" />
// //                                                         <div className="cert-signature-name">{certData.signatoryName}</div>
// //                                                         <div className="cert-signature-title">{certData.signatoryTitle}</div>
// //                                                     </div>

// //                                                     <div className="cert-seal-container">
// //                                                         <div className="cert-seal-ring">
// //                                                             <div className="cert-seal-inner">
// //                                                                 <Award size={36} strokeWidth={2} style={{ color: 'var(--mlab-green)' }} />
// //                                                             </div>
// //                                                         </div>
// //                                                     </div>

// //                                                     <div className="cert-date-block">
// //                                                         <div className="cert-date-value">
// //                                                             {new Date(certData.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
// //                                                         </div>
// //                                                         <div className="cert-signature-line" />
// //                                                         <div className="cert-date-label">Date of Issue</div>
// //                                                     </div>
// //                                                 </footer>
// //                                                 <div className="cert-bottom-accent" />
// //                                             </div>
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };