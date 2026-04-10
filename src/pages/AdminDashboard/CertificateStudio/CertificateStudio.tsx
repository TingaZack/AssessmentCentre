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

// 🚀 CRITICAL: Import WorkplacesManager CSS for the bespoke Header, Toolbar & Cards
import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
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
// TEMPLATE 1: ORIGINAL LUXURY
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
// TEMPLATE 2: OFFICIAL STATEMENT
// ═════════════════════════════════════════════════════════════════════════════
const OfficialTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', position: 'relative', fontFamily: 'Arial, sans-serif', color: '#333' }}>
        <div style={{ display: 'flex', height: '12px', width: '100%' }}>
            <div style={{ flex: 1, backgroundColor: 'var(--mlab-blue)' }}></div>
            <div style={{ width: '150px', backgroundColor: 'var(--mlab-green)' }}></div>
        </div>

        <div style={{ padding: '50px 80px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mlab-blue)', paddingBottom: '20px', marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '70px', objectFit: 'contain' }} crossOrigin="anonymous" />}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>{data.institutionName}</h2>
                    <p style={{ margin: '5px 0 0', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Statement of Award</p>
                </div>
            </div>

            <div style={{ backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '15px 30px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '40px', borderLeft: '6px solid var(--mlab-green)' }}>
                <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '28px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>{finalType}</h1>
            </div>

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


export const CertificateStudio: React.FC = () => {
    const {
        settings, user, adHocCertificates = [], certificateGroups = [],
        fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
        renameCertificateGroup, fetchSettings
    } = useStore();

    const toast = useToast();
    const navigate = useNavigate();

    // ─── VIEW & LAYOUT STATE ───
    const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activeFolder, setActiveFolder] = useState<any>(null);
    const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');

    const [certData, setCertData] = useState({
        template: 'luxury',
        recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
        description: 'has demonstrated exceptional skills and outstanding performance in',
        programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
        issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
        signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
        groupId: 'general'
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [actionType, setActionType] = useState<'download' | 'email'>('download');
    const [zoom, setZoom] = useState(0.65);
    const certRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

    useEffect(() => {
        if (settings) {
            setCertData(prev => ({
                ...prev,
                institutionName: settings.institutionName || "mLab Southern Africa",
                signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
                signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
                logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
            }));
        }
    }, [settings]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                if (fetchCertificateGroups) await fetchCertificateGroups();
                if (fetchAdHocCertificates) await fetchAdHocCertificates();
            } catch (error) { console.error("Failed to load studio data", error); }
            finally { setIsLoadingData(false); }
        };
        if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
        else setIsLoadingData(false);
    }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

    const handleLogout = async () => { try { await signOut(auth); navigate('/login'); } catch (e) { } };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
            setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
        } catch (error) { toast.error("Failed to create folder"); }
    };

    const handleRenameFolder = async (id: string) => {
        if (!editFolderName.trim()) { setEditingFolderId(null); return; }
        try {
            if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
            setEditingFolderId(null); toast.success("Folder renamed!");
        } catch (error) { toast.error("Failed to rename folder"); }
    };

    const getCertificatesForActiveFolder = () => {
        if (!activeFolder) return [];
        if (activeFolder.id === 'general') return adHocCertificates.filter(c => !c.groupId || c.groupId === 'general');
        return adHocCertificates.filter(c => c.groupId === activeFolder.id);
    };

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
    const handleResetZoom = () => setZoom(0.65);
    const handleChange = (field: string, value: string) => setCertData(prev => ({ ...prev, [field]: value }));

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
        const file = e.target.files?.[0];
        if (file) { handleChange(field, URL.createObjectURL(file)); }
    };

    const resetForm = () => setCertData(prev => ({ ...prev, recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '', programme: 'Advanced Leadership Workshop' }));
    const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

    const executeGeneration = useCallback(async () => {
        if (!certRef.current) return;
        if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

        setIsGenerating(true);
        toast.info(actionType === 'email' ? 'Generating and sending email...' : 'Generating high-res PDF...');

        try {
            const currentZoom = zoom; setZoom(1);
            await new Promise(resolve => setTimeout(resolve, 300));

            const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
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
                recipientName: certData.recipientName, recipientEmail: certData.recipientEmail || null,
                type: finalCertType, courseName: certData.programme, issueDate: certData.issueDate,
                pdfUrl: downloadUrl, groupId: certData.groupId || 'general', templateUsed: certData.template,
                createdBy: user?.uid || 'Admin', createdAt: serverTimestamp(), isEmailed: false
            });

            if (actionType === 'email' && certData.recipientEmail) {
                const functions = getFunctions();
                const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
                await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
                await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
                toast.success(`Certificate successfully emailed to ${certData.recipientEmail}`);
            } else if (actionType === 'download') {
                pdf.save(`Certificate_${safeName}.pdf`);
                toast.success('Certificate downloaded securely!');
            }

            if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
            resetForm(); setView('folders');
        } catch (error: any) {
            console.error('Studio Error:', error); toast.error('Failed to process. Please try again.');
        } finally { setIsGenerating(false); }
    }, [certRef, certData, actionType, toast, zoom, finalCertType, user, fetchAdHocCertificates]);

    return (
        <div className="admin-layout">
            <div className="admin-mobile-header">
                <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className="admin-mobile-title">Certificate Studio</div>
            </div>

            {isMobileMenuOpen && <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
                <Sidebar role={user?.role} currentNav="studio" setCurrentNav={() => { }} onLogout={handleLogout} />
            </div>

            <main className="main-wrapper" style={{ padding: 0, height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--mlab-bg)' }}>

                <div className="wm-root animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
                    <div className="wm-page-header" style={{ marginBottom: 0 }}>
                        <div className="wm-page-header__left">
                            <div className="wm-page-header__icon"><Award size={22} /></div>
                            <div>
                                <h1 className="wm-page-header__title">Certificate Studio</h1>
                                <p className="wm-page-header__desc">Design custom ad-hoc awards and manage your document history.</p>
                            </div>
                        </div>
                    </div>

                    {/* ── TABS (Integrated into Toolbar space) ── */}
                    <div style={{ padding: '1rem 1.5rem', background: 'white', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '1rem' }}>
                        <button
                            className={`mlab-tab ${view === 'folders' || view === 'inside-folder' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                            onClick={() => { setView('folders'); setActiveFolder(null); }}
                            style={{ margin: 0 }}
                        >
                            Workspace Folders
                        </button>
                        <button
                            className={`mlab-tab ${view === 'studio' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                            onClick={() => setView('studio')}
                            style={{ margin: 0 }}
                        >
                            Certificate Studio
                        </button>
                    </div>

                    {/* ── TOOLBAR (Dynamic based on View) ── */}
                    <div className="wm-toolbar" style={{ margin: '1.5rem', marginBottom: 0 }}>
                        {view === 'folders' && (
                            <>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {showNewFolderInput ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                className="mlab-input"
                                                style={{ width: '220px', padding: '0.5rem 0.75rem', height: '36px' }}
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                placeholder="Enter folder name..."
                                                autoFocus
                                            />
                                            <button className="wm-btn wm-btn--primary" onClick={handleCreateFolder}>Save</button>
                                            <button className="wm-btn wm-btn--ghost" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
                                        </div>
                                    ) : (
                                        <button className="wm-btn wm-btn--ghost" style={{ background: 'white' }} onClick={() => setShowNewFolderInput(true)}>
                                            <FolderPlus size={15} /> New Folder
                                        </button>
                                    )}
                                </div>
                                <button className="wm-btn wm-btn--primary" style={{ marginLeft: 'auto' }} onClick={() => setView('studio')}>
                                    <Plus size={15} /> Create Certificate
                                </button>
                            </>
                        )}

                        {view === 'inside-folder' && activeFolder && (
                            <>
                                <button className="wm-btn wm-btn--ghost" onClick={() => setView('folders')} style={{ background: 'white' }}>
                                    <ArrowLeft size={15} /> Back to Folders
                                </button>
                                <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginLeft: '1rem' }}>
                                    <Folder size={18} color="var(--mlab-green)" /> {activeFolder.name}
                                </h2>
                                <button className="wm-btn wm-btn--primary" style={{ marginLeft: 'auto' }} onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
                                    <Plus size={15} /> Create in this Folder
                                </button>
                            </>
                        )}

                        {view === 'studio' && (
                            <>
                                <button className="wm-btn wm-btn--ghost" onClick={() => setView('folders')} style={{ background: 'white' }}>
                                    <ArrowLeft size={15} /> Cancel Design
                                </button>
                                <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
                                    <button className="wm-btn wm-btn--ghost" style={{ background: 'white' }} disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={16} /> : <Download size={15} />}
                                        Download PDF
                                    </button>
                                    <button className="wm-btn wm-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={16} /> : <Mail size={15} />}
                                        Email Document
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── DYNAMIC CONTENT AREA ── */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>

                        {/* FOLDERS VIEW */}
                        {view === 'folders' && (
                            isLoadingData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                                    <div className="ap-spinner" />
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Workspace...</span>
                                </div>
                            ) : (
                                <div className="wm-grid">
                                    {/* Static General Folder */}
                                    <div className="wm-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem', borderTopColor: 'var(--mlab-grey)' }}
                                        onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
                                        <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}><Folder size={24} /></div>
                                        <div style={{ flex: 1 }}>
                                            <h4 className="wm-card__name" style={{ fontSize: '1.1rem' }}>General</h4>
                                            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents</p>
                                        </div>
                                        <ChevronRight size={18} color="#cbd5e1" />
                                    </div>

                                    {/* Dynamic Groups */}
                                    {certificateGroups.map(group => (
                                        <div key={group.id} className="wm-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem', borderTopColor: 'var(--mlab-green)' }}
                                            onClick={() => { if (editingFolderId !== group.id) { setActiveFolder(group); setView('inside-folder'); } }}>
                                            <div style={{ background: 'rgba(148, 199, 61, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green-dark)' }}><Folder size={24} /></div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                {editingFolderId === group.id ? (
                                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <input
                                                            className="mlab-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%' }} autoFocus
                                                            value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                                                        />
                                                        <button className="wm-btn wm-btn--primary" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <h4 className="wm-card__name" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
                                                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{adHocCertificates.filter(c => c.groupId === group.id).length} Documents</p>
                                                    </>
                                                )}
                                            </div>

                                            {editingFolderId !== group.id && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder">
                                                        <Edit2 size={16} color="var(--mlab-grey)" />
                                                    </button>
                                                    <ChevronRight size={18} color="#cbd5e1" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* INSIDE FOLDER VIEW */}
                        {view === 'inside-folder' && activeFolder && (
                            getCertificatesForActiveFolder().length === 0 ? (
                                <div className="wm-empty" style={{ margin: '2rem auto', maxWidth: '600px' }}>
                                    <div className="wm-empty__icon"><FileText size={36} /></div>
                                    <p className="wm-empty__title">Folder is Empty</p>
                                    <p className="wm-empty__desc">No certificates have been saved to this folder yet.</p>
                                </div>
                            ) : (
                                <div className="wm-grid">
                                    {getCertificatesForActiveFolder().map(cert => (
                                        <div key={cert.id} className="wm-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
                                            <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                <Award size={48} color="rgba(255,255,255,0.1)" />
                                                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                                                    {cert.isEmailed && <span className="mlab-badge" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem' }} title={`Emailed to ${cert.recipientEmail}`}><Mail size={10} /> Sent</span>}
                                                    <span className="mlab-badge mlab-badge--active" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none' }}>PDF</span>
                                                </div>
                                            </div>
                                            <div style={{ padding: '1.25rem' }}>
                                                <h4 className="wm-card__name" style={{ marginBottom: '0.5rem' }}>{cert.recipientName}</h4>
                                                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <strong>{cert.type}</strong>
                                                    <span>{cert.courseName}</span>
                                                </p>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                        {cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}
                                                    </span>
                                                    <button className="wm-btn wm-btn--ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                        <Download size={14} /> View
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* STUDIO DESIGNER VIEW */}
                        {view === 'studio' && (
                            <div style={{ display: 'flex', gap: '1.5rem', height: '100%', paddingBottom: '0.5rem' }}>
                                {/* Form Settings Panel */}
                                <div style={{ width: '380px', flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <FormSection title="Design Template" icon={Layers}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select></div>
                                        </FormSection>
                                        <FormSection title="Folder Assignment" icon={Folder}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{certificateGroups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}</select></div>
                                        </FormSection>
                                        <FormSection title="Recipient Details" icon={UserCircle}>
                                            <input className="mlab-input" placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
                                            <input className="mlab-input" type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
                                        </FormSection>
                                        <FormSection title="Award Details" icon={FileCheck}>
                                            <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select></div>
                                            {certData.certType === 'Other' && <input className="mlab-input" placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
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
                                                <label className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
                                                <label className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
                                            </div>
                                        </FormSection>
                                    </div>
                                </div>

                                {/* Preview Canvas Panel */}
                                <div className="cert-preview-container" style={{ flex: 1, position: 'relative', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
                                        <button className="mlab-icon-btn" onClick={handleZoomOut}><ZoomOut size={16} color='var(--mlab-green-dark)' /></button>
                                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
                                        <button className="mlab-icon-btn" onClick={handleZoomIn}><ZoomIn size={16} color='var(--mlab-green-dark)' /></button>
                                        <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom}><RotateCcw size={16} /></button>
                                    </div>
                                    <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                                        <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto', backgroundColor: '#fff', overflow: 'hidden' }}>
                                            {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
                                            {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
                                            {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};



// // src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import {
//     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
//     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
//     FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2, Layers
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

// import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// import '../../../components/views/LearnersView/LearnersView.css';
// import '../../../components/views/CohortsView/CohortsView.css';
// import '../AdminDashboard.css';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import defaultSignature from '../../../assets/Signatue_Zack_.png';

// const FormSection = ({ title, icon: Icon, children }: any) => (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
//         <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//             <Icon size={16} /> {title}
//         </h3>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//             {children}
//         </div>
//     </div>
// );

// // ═════════════════════════════════════════════════════════════════════════════
// // TEMPLATE 1: ORIGINAL LUXURY
// // ═════════════════════════════════════════════════════════════════════════════
// const LuxuryTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
//     <>
//         <div className="cert-bg-luxury">
//             <div className="cert-pattern-grid" />
//             <div className="cert-pattern-hex" />
//             <div className="cert-gradient-overlay" />
//         </div>
//         <div className="cert-main">
//             <div className="cert-top-accent">
//                 <div className="cert-accent-line green" />
//                 <div className="cert-accent-line blue" />
//             </div>

//             <header className="cert-header">
//                 <div className="cert-logo-container">
//                     {data.logoUrl && <img src={data.logoUrl} alt="Logo" className="cert-logo" crossOrigin="anonymous" />}
//                 </div>
//                 <div className="cert-institution">
//                     <h3>{data.institutionName}</h3>
//                     <div className="cert-divider-diamond"><span className="diamond" /></div>
//                 </div>
//             </header>

//             <main className="cert-content">
//                 <div className="cert-pretitle">This is to certify that</div>
//                 <h1 className="cert-recipient-name">{data.recipientName || '[Recipient Name]'}</h1>
//                 <div className="cert-description">{data.description}</div>
//                 <div className="cert-programme-name">{data.programme || '[Event/Course Name]'}</div>

//                 <div className="cert-type-badge">
//                     <span className="cert-type-text">{finalType.includes('Award') ? 'Official' : 'Certificate of'}</span>
//                     <span className="cert-type-value">{finalType}</span>
//                 </div>
//             </main>

//             <footer className="cert-footer-new">
//                 <div className="cert-signature-block">
//                     <div className="cert-signature-image-container">
//                         {data.sigUrl && <img src={data.sigUrl} alt="Signature" className="cert-signature-img" crossOrigin="anonymous" />}
//                     </div>
//                     <div className="cert-signature-line" />
//                     <div className="cert-signature-name">{data.signatoryName}</div>
//                     <div className="cert-signature-title">{data.signatoryTitle}</div>
//                 </div>

//                 <div className="cert-seal-container">
//                     <div className="cert-seal-ring">
//                         <div className="cert-seal-inner">
//                             <Award size={36} strokeWidth={2} style={{ color: 'var(--mlab-green)' }} />
//                         </div>
//                     </div>
//                 </div>

//                 <div className="cert-date-block">
//                     <div className="cert-date-value">
//                         {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
//                     </div>
//                     <div className="cert-signature-line" />
//                     <div className="cert-date-label">Date of Issue</div>
//                 </div>
//             </footer>
//             <div className="cert-bottom-accent" />
//         </div>
//     </>
// );

// // ═════════════════════════════════════════════════════════════════════════════
// // TEMPLATE 2: OFFICIAL STATEMENT
// // ═════════════════════════════════════════════════════════════════════════════
// const OfficialTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
//     <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', position: 'relative', fontFamily: 'Arial, sans-serif', color: '#333' }}>
//         <div style={{ display: 'flex', height: '12px', width: '100%' }}>
//             <div style={{ flex: 1, backgroundColor: 'var(--mlab-blue)' }}></div>
//             <div style={{ width: '150px', backgroundColor: 'var(--mlab-green)' }}></div>
//         </div>

//         <div style={{ padding: '50px 80px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 12px)' }}>
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mlab-blue)', paddingBottom: '20px', marginBottom: '30px' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
//                     {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '70px', objectFit: 'contain' }} crossOrigin="anonymous" />}
//                 </div>
//                 <div style={{ textAlign: 'right' }}>
//                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>{data.institutionName}</h2>
//                     <p style={{ margin: '5px 0 0', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Statement of Award</p>
//                 </div>
//             </div>

//             <div style={{ backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '15px 30px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '40px', borderLeft: '6px solid var(--mlab-green)' }}>
//                 <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '28px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>{finalType}</h1>
//             </div>

//             <div style={{ flex: 1 }}>
//                 <p style={{ fontSize: '14px', color: '#555', marginBottom: '10px' }}>This document officially certifies that:</p>
//                 <h2 style={{ margin: '0 0 30px', fontSize: '36px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.recipientName || '[Recipient Name]'}</h2>

//                 <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
//                     <tbody>
//                         <tr>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', width: '200px', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Awarding Programme</td>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '18px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.programme || '[Course Name]'}</td>
//                         </tr>
//                         <tr>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Description</td>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{data.description}</td>
//                         </tr>
//                         <tr>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Date of Issue</td>
//                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
//                         </tr>
//                     </tbody>
//                 </table>
//             </div>

//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
//                 <div style={{ width: '250px' }}>
//                     <div style={{ height: '70px', display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
//                         {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
//                     </div>
//                     <div style={{ borderTop: '1px solid var(--mlab-blue)', paddingTop: '10px' }}>
//                         <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
//                         <p style={{ margin: '2px 0 0', color: '#777', fontSize: '12px' }}>{data.signatoryTitle}</p>
//                     </div>
//                 </div>

//                 <div style={{ width: '100px', height: '100px', borderRadius: '50%', border: '2px dashed var(--mlab-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                     <div style={{ textAlign: 'center' }}>
//                         <Award size={32} color="var(--mlab-blue)" style={{ margin: '0 auto' }} />
//                         <div style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--mlab-blue)', marginTop: '4px', letterSpacing: '1px' }}>OFFICIAL</div>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     </div>
// );

// // ═════════════════════════════════════════════════════════════════════════════
// // TEMPLATE 3: MODERN MINIMALIST
// // ═════════════════════════════════════════════════════════════════════════════
// const ModernTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
//     <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
//         <div style={{ width: '280px', backgroundColor: 'var(--mlab-blue)', height: '100%', padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white', boxSizing: 'border-box' }}>
//             <div>
//                 {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '60px', objectFit: 'contain', }} crossOrigin="anonymous" />}
//                 <div style={{ marginTop: '40px', width: '40px', height: '4px', backgroundColor: 'var(--mlab-green)' }}></div>
//             </div>
//             <div>
//                 <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Date Issued</p>
//                 <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 30px' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
//                 <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Certificate ID</p>
//                 <p style={{ fontSize: '14px', fontFamily: 'monospace', opacity: 0.8, margin: 0 }}>{Date.now().toString().slice(-8)}</p>
//             </div>
//         </div>

//         <div style={{ flex: 1, padding: '80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
//             <div style={{ alignSelf: 'flex-end', padding: '8px 16px', backgroundColor: 'rgba(148, 199, 61, 0.1)', color: 'var(--mlab-green-dark)', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
//                 {data.institutionName}
//             </div>

//             <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
//                 <p style={{ fontSize: '16px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '10px' }}>Awarded To</p>
//                 <h1 style={{ fontSize: '56px', color: 'var(--mlab-blue)', margin: '0 0 20px', lineHeight: 1.1, letterSpacing: '-1px' }}>{data.recipientName || '[Recipient Name]'}</h1>

//                 <div style={{ display: 'inline-block', backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '10px 20px', fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '30px' }}>
//                     {finalType}
//                 </div>

//                 <p style={{ fontSize: '18px', color: '#475569', lineHeight: 1.6, maxWidth: '600px', margin: '0 0 10px' }}>
//                     {data.description}
//                 </p>
//                 <p style={{ fontSize: '22px', color: 'var(--mlab-blue)', fontWeight: 'bold', margin: 0 }}>
//                     {data.programme || '[Event/Course Name]'}
//                 </p>
//             </div>

//             <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
//                 <div style={{ width: '200px' }}>
//                     {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
//                     <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '10px' }}>
//                         <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
//                         <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12px' }}>{data.signatoryTitle}</p>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     </div>
// );


// export const CertificateStudio: React.FC = () => {
//     const {
//         settings, user, adHocCertificates = [], certificateGroups = [],
//         fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
//         renameCertificateGroup, fetchSettings
//     } = useStore();

//     const toast = useToast();
//     const navigate = useNavigate();

//     // ─── VIEW & LAYOUT STATE ───
//     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [activeFolder, setActiveFolder] = useState<any>(null);
//     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

//     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
//     const [newFolderName, setNewFolderName] = useState('');
//     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
//     const [editFolderName, setEditFolderName] = useState('');

//     const [certData, setCertData] = useState({
//         template: 'luxury',
//         recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
//         description: 'has demonstrated exceptional skills and outstanding performance in',
//         programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
//         issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
//         signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
//         groupId: 'general'
//     });

//     const [isGenerating, setIsGenerating] = useState(false);
//     const [actionType, setActionType] = useState<'download' | 'email'>('download');
//     const [zoom, setZoom] = useState(0.65);
//     const certRef = useRef<HTMLDivElement>(null);

//     useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

//     useEffect(() => {
//         if (settings) {
//             setCertData(prev => ({
//                 ...prev,
//                 institutionName: settings.institutionName || "mLab Southern Africa",
//                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
//                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
//                 logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
//             }));
//         }
//     }, [settings]);

//     useEffect(() => {
//         const loadInitialData = async () => {
//             try {
//                 if (fetchCertificateGroups) await fetchCertificateGroups();
//                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
//             } catch (error) { console.error("Failed to load studio data", error); }
//             finally { setIsLoadingData(false); }
//         };
//         if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
//         else setIsLoadingData(false);
//     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

//     const handleLogout = async () => { try { await signOut(auth); navigate('/login'); } catch (e) { } };

//     const handleCreateFolder = async () => {
//         if (!newFolderName.trim()) return;
//         try {
//             if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
//             setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
//         } catch (error) { toast.error("Failed to create folder"); }
//     };

//     const handleRenameFolder = async (id: string) => {
//         if (!editFolderName.trim()) { setEditingFolderId(null); return; }
//         try {
//             if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
//             setEditingFolderId(null); toast.success("Folder renamed!");
//         } catch (error) { toast.error("Failed to rename folder"); }
//     };

//     const getCertificatesForActiveFolder = () => {
//         if (!activeFolder) return [];
//         if (activeFolder.id === 'general') return adHocCertificates.filter(c => !c.groupId || c.groupId === 'general');
//         return adHocCertificates.filter(c => c.groupId === activeFolder.id);
//     };

//     const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
//     const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
//     const handleResetZoom = () => setZoom(0.65);
//     const handleChange = (field: string, value: string) => setCertData(prev => ({ ...prev, [field]: value }));

//     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
//         const file = e.target.files?.[0];
//         if (file) { handleChange(field, URL.createObjectURL(file)); }
//     };

//     const resetForm = () => setCertData(prev => ({ ...prev, recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '', programme: 'Advanced Leadership Workshop' }));
//     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

//     const executeGeneration = useCallback(async () => {
//         if (!certRef.current) return;
//         if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

//         setIsGenerating(true);
//         toast.info(actionType === 'email' ? 'Generating and sending email...' : 'Generating high-res PDF...');

//         try {
//             const currentZoom = zoom; setZoom(1);
//             await new Promise(resolve => setTimeout(resolve, 300));

//             const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
//             setZoom(currentZoom);

//             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
//             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
//             const pdfBlob = pdf.output('blob');

//             const storage = getStorage();
//             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
//             const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
//             const storageRef = ref(storage, fileName);
//             await uploadBytes(storageRef, pdfBlob);
//             const downloadUrl = await getDownloadURL(storageRef);

//             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
//                 recipientName: certData.recipientName, recipientEmail: certData.recipientEmail || null,
//                 type: finalCertType, courseName: certData.programme, issueDate: certData.issueDate,
//                 pdfUrl: downloadUrl, groupId: certData.groupId || 'general', templateUsed: certData.template,
//                 createdBy: user?.uid || 'Admin', createdAt: serverTimestamp(), isEmailed: false
//             });

//             if (actionType === 'email' && certData.recipientEmail) {
//                 const functions = getFunctions();
//                 const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
//                 await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
//                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
//                 toast.success(`Certificate successfully emailed to ${certData.recipientEmail}`);
//             } else if (actionType === 'download') {
//                 pdf.save(`Certificate_${safeName}.pdf`);
//                 toast.success('Certificate downloaded securely!');
//             }

//             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
//             resetForm(); setView('folders');
//         } catch (error: any) {
//             console.error('Studio Error:', error); toast.error('Failed to process. Please try again.');
//         } finally { setIsGenerating(false); }
//     }, [certRef, certData, actionType, toast, zoom, finalCertType, user, fetchAdHocCertificates]);

//     return (
//         <div className="admin-layout">
//             <div className="admin-mobile-header">
//                 <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                     <Menu size={24} />
//                 </button>
//                 <div className="admin-mobile-title">Certificate Studio</div>
//             </div>

//             {isMobileMenuOpen && <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

//             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
//                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
//                 <Sidebar role={user?.role} currentNav="studio" setCurrentNav={() => { }} onLogout={handleLogout} />
//             </div>

//             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%', height: '100vh', display: 'flex', flexDirection: 'column' }}>

//                 <header className="dashboard-header" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
//                     <div className="header-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
//                         <div>
//                             <h1>Certificate Studio</h1>
//                             <p>Design custom ad-hoc awards and manage your document history.</p>
//                         </div>
//                     </div>
//                 </header>

//                 <div className="admin-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//                     {/* 🚀 IMPLEMENTING MLAB-LEARNERS UI STRUCTURE */}
//                     <div className="mlab-learners" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

//                         {/* ── TABS ── */}
//                         <div className="mlab-tab-bar">
//                             <button
//                                 className={`mlab-tab ${view === 'folders' || view === 'inside-folder' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                                 onClick={() => { setView('folders'); setActiveFolder(null); }}
//                             >
//                                 Workspace Folders
//                             </button>
//                             <button
//                                 className={`mlab-tab ${view === 'studio' ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                                 onClick={() => setView('studio')}
//                             >
//                                 Certificate Studio
//                             </button>
//                         </div>

//                         {/* ── ACTIONS BAR ── */}
//                         <div className="mlab-standard-actions" style={{ justifyContent: view === 'inside-folder' || view === 'studio' ? 'flex-start' : 'space-between', marginBottom: '1.5rem', gap: '15px' }}>
//                             {view === 'folders' && (
//                                 <>
//                                     <div style={{ display: 'flex', gap: '10px' }}>
//                                         {showNewFolderInput ? (
//                                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                 <input
//                                                     className="mlab-input"
//                                                     style={{ width: '220px', padding: '0.5rem 0.75rem' }}
//                                                     value={newFolderName}
//                                                     onChange={e => setNewFolderName(e.target.value)}
//                                                     placeholder="Enter folder name..."
//                                                     autoFocus
//                                                 />
//                                                 <button className="mlab-btn mlab-btn--green" onClick={handleCreateFolder}>Save</button>
//                                                 <button className="mlab-btn mlab-btn--ghost" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
//                                             </div>
//                                         ) : (
//                                             <button className="mlab-btn mlab-btn--outline-blue" onClick={() => setShowNewFolderInput(true)}>
//                                                 <FolderPlus size={15} /> New Folder
//                                             </button>
//                                         )}
//                                     </div>
//                                     <button className="mlab-btn mlab-btn--primary" onClick={() => setView('studio')}>
//                                         <Plus size={15} /> Create Certificate
//                                     </button>
//                                 </>
//                             )}

//                             {view === 'inside-folder' && activeFolder && (
//                                 <>
//                                     <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
//                                         <ArrowLeft size={15} /> Back to Folders
//                                     </button>
//                                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <Folder size={20} color="var(--mlab-green)" /> {activeFolder.name}
//                                     </h2>
//                                     <button className="mlab-btn mlab-btn--primary" style={{ marginLeft: 'auto' }} onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
//                                         <Plus size={15} /> Create in this Folder
//                                     </button>
//                                 </>
//                             )}

//                             {view === 'studio' && (
//                                 <>
//                                     <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
//                                         <ArrowLeft size={15} /> Cancel Design
//                                     </button>
//                                     <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
//                                         <button className="mlab-btn mlab-btn--outline-blue" disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
//                                             {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={16} /> : <Download size={15} />}
//                                             Download PDF
//                                         </button>
//                                         <button className="mlab-btn mlab-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
//                                             {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={16} /> : <Mail size={15} />}
//                                             Email Document
//                                         </button>
//                                     </div>
//                                 </>
//                             )}
//                         </div>

//                         {/* ── DYNAMIC CONTENT AREA ── */}
//                         <div style={{ flex: 1, overflowY: 'auto' }}>

//                             {/* FOLDERS VIEW */}
//                             {view === 'folders' && (
//                                 isLoadingData ? (
//                                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
//                                         <div className="ap-spinner" />
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Workspace...</span>
//                                     </div>
//                                 ) : (
//                                     <div className="mlab-cohort-grid">
//                                         {/* Static General Folder */}
//                                         <div className="mlab-cohort-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}
//                                             onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
//                                             <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}><Folder size={24} /></div>
//                                             <div style={{ flex: 1 }}>
//                                                 <h4 className="mlab-cohort-card__name" style={{ fontSize: '1.1rem' }}>General</h4>
//                                                 <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents</p>
//                                             </div>
//                                             <ChevronRight size={18} color="#cbd5e1" />
//                                         </div>

//                                         {/* Dynamic Groups */}
//                                         {certificateGroups.map(group => (
//                                             <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}
//                                                 onClick={() => { if (editingFolderId !== group.id) { setActiveFolder(group); setView('inside-folder'); } }}>
//                                                 <div style={{ background: 'var(--mlab-light-green)', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green)' }}><Folder size={24} /></div>
//                                                 <div style={{ flex: 1, overflow: 'hidden' }}>
//                                                     {editingFolderId === group.id ? (
//                                                         <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
//                                                             <input
//                                                                 className="mlab-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%' }} autoFocus
//                                                                 value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
//                                                                 onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }}
//                                                             />
//                                                             <button className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
//                                                         </div>
//                                                     ) : (
//                                                         <>
//                                                             <h4 className="mlab-cohort-card__name" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
//                                                             <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{adHocCertificates.filter(c => c.groupId === group.id).length} Documents</p>
//                                                         </>
//                                                     )}
//                                                 </div>

//                                                 {editingFolderId !== group.id && (
//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                         <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder">
//                                                             <Edit2 size={16} color="var(--mlab-grey)" />
//                                                         </button>
//                                                         <ChevronRight size={18} color="#cbd5e1" />
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         ))}
//                                     </div>
//                                 )
//                             )}

//                             {/* INSIDE FOLDER VIEW */}
//                             {view === 'inside-folder' && activeFolder && (
//                                 getCertificatesForActiveFolder().length === 0 ? (
//                                     <div className="mlab-cohort-empty">
//                                         <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                                         <p className="mlab-cohort-empty__title">Folder is Empty</p>
//                                         <p className="mlab-cohort-empty__desc" style={{ marginBottom: '1.5rem' }}>No certificates have been saved to this folder yet.</p>
//                                     </div>
//                                 ) : (
//                                     <div className="mlab-cohort-grid">
//                                         {getCertificatesForActiveFolder().map(cert => (
//                                             <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0 }}>
//                                                 <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
//                                                     <Award size={48} color="rgba(255,255,255,0.1)" />
//                                                     <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
//                                                         {cert.isEmailed && <span className="mlab-badge" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem' }} title={`Emailed to ${cert.recipientEmail}`}><Mail size={10} /> Sent</span>}
//                                                         <span className="mlab-badge mlab-badge--active" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none' }}>PDF</span>
//                                                     </div>
//                                                 </div>
//                                                 <div style={{ padding: '1.25rem' }}>
//                                                     <h4 className="mlab-cohort-card__name" style={{ marginBottom: '0.5rem' }}>{cert.recipientName}</h4>
//                                                     <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}><strong>{cert.type}</strong><span>{cert.courseName}</span></p>
//                                                     <div className="mlab-cohort-card__footer">
//                                                         <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}</span>
//                                                         <button className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => window.open(cert.pdfUrl, '_blank')}><Download size={14} /> View</button>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>
//                                 )
//                             )}

//                             {/* STUDIO DESIGNER VIEW */}
//                             {view === 'studio' && (
//                                 <div style={{ display: 'flex', gap: '1.5rem', height: '100%', paddingBottom: '0.5rem' }}>
//                                     <div style={{ width: '380px', flexShrink: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
//                                         <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                                             <FormSection title="Design Template" icon={Layers}>
//                                                 <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select></div>
//                                             </FormSection>
//                                             <FormSection title="Folder Assignment" icon={Folder}>
//                                                 <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{certificateGroups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}</select></div>
//                                             </FormSection>
//                                             <FormSection title="Recipient Details" icon={UserCircle}>
//                                                 <input className="mlab-input" placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
//                                                 <input className="mlab-input" type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
//                                             </FormSection>
//                                             <FormSection title="Award Details" icon={FileCheck}>
//                                                 <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}><select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select></div>
//                                                 {certData.certType === 'Other' && <input className="mlab-input" placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
//                                                 <input className="mlab-input" placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
//                                                 <textarea className="mlab-input" style={{ minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
//                                             </FormSection>
//                                             <FormSection title="Branding & Signatures" icon={Building2}>
//                                                 <input className="mlab-input" placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
//                                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
//                                                     <input className="mlab-input" placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
//                                                     <input className="mlab-input" type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
//                                                 </div>
//                                                 <input className="mlab-input" placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />
//                                                 <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
//                                                     <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
//                                                     <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
//                                                 </div>
//                                             </FormSection>
//                                         </div>
//                                     </div>
//                                     <div className="cert-preview-container" style={{ flex: 1, position: 'relative', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
//                                         <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
//                                             <button className="mlab-icon-btn" onClick={handleZoomOut}><ZoomOut size={16} color='var(--mlab-green-dark)' /></button>
//                                             <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
//                                             <button className="mlab-icon-btn" onClick={handleZoomIn}><ZoomIn size={16} color='var(--mlab-green-dark)' /></button>
//                                             <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom}><RotateCcw size={16} /></button>
//                                         </div>
//                                         <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
//                                             <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto', backgroundColor: '#fff', overflow: 'hidden' }}>
//                                                 {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
//                                                 {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
//                                                 {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };


// // // src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

// // import React, { useState, useRef, useEffect, useCallback } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import {
// //     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
// //     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
// //     FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2, Layers
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

// // import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import '../../../components/views/CohortsView/CohortsView.css';
// // import '../AdminDashboard.css';

// // import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import '../AdminDashboard.css';

// // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // import defaultSignature from '../../../assets/Signatue_Zack_.png';
// // import { PageHeader } from '../../../components/common/PageHeader/PageHeader';

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

// // // ═════════════════════════════════════════════════════════════════════════════
// // // TEMPLATE 1: ORIGINAL LUXURY (Untouched)
// // // ═════════════════════════════════════════════════════════════════════════════
// // const LuxuryTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
// //     <>
// //         <div className="cert-bg-luxury">
// //             <div className="cert-pattern-grid" />
// //             <div className="cert-pattern-hex" />
// //             <div className="cert-gradient-overlay" />
// //         </div>
// //         <div className="cert-main">
// //             <div className="cert-top-accent">
// //                 <div className="cert-accent-line green" />
// //                 <div className="cert-accent-line blue" />
// //             </div>

// //             <header className="cert-header">
// //                 <div className="cert-logo-container">
// //                     {data.logoUrl && <img src={data.logoUrl} alt="Logo" className="cert-logo" crossOrigin="anonymous" />}
// //                 </div>
// //                 <div className="cert-institution">
// //                     <h3>{data.institutionName}</h3>
// //                     <div className="cert-divider-diamond"><span className="diamond" /></div>
// //                 </div>
// //             </header>

// //             <main className="cert-content">
// //                 <div className="cert-pretitle">This is to certify that</div>
// //                 <h1 className="cert-recipient-name">{data.recipientName || '[Recipient Name]'}</h1>
// //                 <div className="cert-description">{data.description}</div>
// //                 <div className="cert-programme-name">{data.programme || '[Event/Course Name]'}</div>

// //                 <div className="cert-type-badge">
// //                     <span className="cert-type-text">{finalType.includes('Award') ? 'Official' : 'Certificate of'}</span>
// //                     <span className="cert-type-value">{finalType}</span>
// //                 </div>
// //             </main>

// //             <footer className="cert-footer-new">
// //                 <div className="cert-signature-block">
// //                     <div className="cert-signature-image-container">
// //                         {data.sigUrl && <img src={data.sigUrl} alt="Signature" className="cert-signature-img" crossOrigin="anonymous" />}
// //                     </div>
// //                     <div className="cert-signature-line" />
// //                     <div className="cert-signature-name">{data.signatoryName}</div>
// //                     <div className="cert-signature-title">{data.signatoryTitle}</div>
// //                 </div>

// //                 <div className="cert-seal-container">
// //                     <div className="cert-seal-ring">
// //                         <div className="cert-seal-inner">
// //                             <Award size={36} strokeWidth={2} style={{ color: 'var(--mlab-green)' }} />
// //                         </div>
// //                     </div>
// //                 </div>

// //                 <div className="cert-date-block">
// //                     <div className="cert-date-value">
// //                         {new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
// //                     </div>
// //                     <div className="cert-signature-line" />
// //                     <div className="cert-date-label">Date of Issue</div>
// //                 </div>
// //             </footer>
// //             <div className="cert-bottom-accent" />
// //         </div>
// //     </>
// // );

// // // ═════════════════════════════════════════════════════════════════════════════
// // // TEMPLATE 2: OFFICIAL STATEMENT (Statement of Results Inspired)
// // // ═════════════════════════════════════════════════════════════════════════════
// // const OfficialTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
// //     <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', position: 'relative', fontFamily: 'Arial, sans-serif', color: '#333' }}>
// //         {/* Top Border */}
// //         <div style={{ display: 'flex', height: '12px', width: '100%' }}>
// //             <div style={{ flex: 1, backgroundColor: 'var(--mlab-blue)' }}></div>
// //             <div style={{ width: '150px', backgroundColor: 'var(--mlab-green)' }}></div>
// //         </div>

// //         <div style={{ padding: '50px 80px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 12px)' }}>

// //             {/* Header */}
// //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mlab-blue)', paddingBottom: '20px', marginBottom: '30px' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
// //                     {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '70px', objectFit: 'contain' }} crossOrigin="anonymous" />}
// //                 </div>
// //                 <div style={{ textAlign: 'right' }}>
// //                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>{data.institutionName}</h2>
// //                     <p style={{ margin: '5px 0 0', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Statement of Award</p>
// //                 </div>
// //             </div>

// //             {/* Document Title */}
// //             <div style={{ backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '15px 30px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '40px', borderLeft: '6px solid var(--mlab-green)' }}>
// //                 <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '28px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>{finalType}</h1>
// //             </div>

// //             {/* Main Content */}
// //             <div style={{ flex: 1 }}>
// //                 <p style={{ fontSize: '14px', color: '#555', marginBottom: '10px' }}>This document officially certifies that:</p>
// //                 <h2 style={{ margin: '0 0 30px', fontSize: '36px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.recipientName || '[Recipient Name]'}</h2>

// //                 <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
// //                     <tbody>
// //                         <tr>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', width: '200px', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Awarding Programme</td>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '18px', color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{data.programme || '[Course Name]'}</td>
// //                         </tr>
// //                         <tr>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Description</td>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{data.description}</td>
// //                         </tr>
// //                         <tr>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontWeight: 'bold', color: '#777', fontSize: '13px', textTransform: 'uppercase' }}>Date of Issue</td>
// //                             <td style={{ padding: '15px 0', borderBottom: '1px solid #eee', fontSize: '15px', color: '#333' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
// //                         </tr>
// //                     </tbody>
// //                 </table>
// //             </div>

// //             {/* Footer / Signatures */}
// //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
// //                 <div style={{ width: '250px' }}>
// //                     <div style={{ height: '70px', display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
// //                         {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
// //                     </div>
// //                     <div style={{ borderTop: '1px solid var(--mlab-blue)', paddingTop: '10px' }}>
// //                         <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
// //                         <p style={{ margin: '2px 0 0', color: '#777', fontSize: '12px' }}>{data.signatoryTitle}</p>
// //                     </div>
// //                 </div>

// //                 {/* Watermark / Seal */}
// //                 <div style={{ width: '100px', height: '100px', borderRadius: '50%', border: '2px dashed var(--mlab-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                     <div style={{ textAlign: 'center' }}>
// //                         <Award size={32} color="var(--mlab-blue)" style={{ margin: '0 auto' }} />
// //                         <div style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--mlab-blue)', marginTop: '4px', letterSpacing: '1px' }}>OFFICIAL</div>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     </div>
// // );

// // // ═════════════════════════════════════════════════════════════════════════════
// // // TEMPLATE 3: MODERN MINIMALIST
// // // ═════════════════════════════════════════════════════════════════════════════
// // const ModernTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
// //     <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>

// //         {/* Left Accent Panel */}
// //         <div style={{ width: '280px', backgroundColor: 'var(--mlab-blue)', height: '100%', padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white', boxSizing: 'border-box' }}>
// //             <div>
// //                 {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ height: '60px', objectFit: 'contain', }} crossOrigin="anonymous" />}
// //                 <div style={{ marginTop: '40px', width: '40px', height: '4px', backgroundColor: 'var(--mlab-green)' }}></div>
// //             </div>

// //             <div>
// //                 <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Date Issued</p>
// //                 <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 30px' }}>{new Date(data.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>

// //                 <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6, margin: '0 0 5px' }}>Certificate ID</p>
// //                 <p style={{ fontSize: '14px', fontFamily: 'monospace', opacity: 0.8, margin: 0 }}>{Date.now().toString().slice(-8)}</p>
// //             </div>
// //         </div>

// //         {/* Right Content Panel */}
// //         <div style={{ flex: 1, padding: '80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
// //             <div style={{ alignSelf: 'flex-end', padding: '8px 16px', backgroundColor: 'rgba(148, 199, 61, 0.1)', color: 'var(--mlab-green-dark)', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
// //                 {data.institutionName}
// //             </div>

// //             <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
// //                 <p style={{ fontSize: '16px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '10px' }}>Awarded To</p>
// //                 <h1 style={{ fontSize: '56px', color: 'var(--mlab-blue)', margin: '0 0 20px', lineHeight: 1.1, letterSpacing: '-1px' }}>{data.recipientName || '[Recipient Name]'}</h1>

// //                 <div style={{ display: 'inline-block', backgroundColor: 'var(--mlab-blue)', color: 'white', padding: '10px 20px', fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '30px' }}>
// //                     {finalType}
// //                 </div>

// //                 <p style={{ fontSize: '18px', color: '#475569', lineHeight: 1.6, maxWidth: '600px', margin: '0 0 10px' }}>
// //                     {data.description}
// //                 </p>
// //                 <p style={{ fontSize: '22px', color: 'var(--mlab-blue)', fontWeight: 'bold', margin: 0 }}>
// //                     {data.programme || '[Event/Course Name]'}
// //                 </p>
// //             </div>

// //             <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
// //                 <div style={{ width: '200px' }}>
// //                     {data.sigUrl && <img src={data.sigUrl} alt="Signature" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
// //                     <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '10px' }}>
// //                         <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '14px' }}>{data.signatoryName}</p>
// //                         <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12px' }}>{data.signatoryTitle}</p>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     </div>
// // );

// // // ═════════════════════════════════════════════════════════════════════════════
// // // MAIN COMPONENT
// // // ═════════════════════════════════════════════════════════════════════════════

// // export const CertificateStudio: React.FC = () => {
// //     const {
// //         settings,
// //         user,
// //         adHocCertificates = [],
// //         certificateGroups = [],
// //         fetchAdHocCertificates,
// //         fetchCertificateGroups,
// //         createCertificateGroup,
// //         renameCertificateGroup,
// //         fetchSettings
// //     } = useStore();

// //     const toast = useToast();
// //     const navigate = useNavigate();

// //     // ─── VIEW & LAYOUT STATE ───
// //     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio'>('folders');
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// //     const [activeFolder, setActiveFolder] = useState<any>(null);
// //     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

// //     // ─── FOLDER CREATION / RENAME STATE ───
// //     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
// //     const [newFolderName, setNewFolderName] = useState('');
// //     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
// //     const [editFolderName, setEditFolderName] = useState('');

// //     // ─── EDITABLE STUDIO STATE ───
// //     const [certData, setCertData] = useState({
// //         template: 'luxury',
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

// //     // Force fetch settings from Firebase so the logo and signatures load!
// //     useEffect(() => {
// //         if (!settings && fetchSettings) {
// //             fetchSettings();
// //         }
// //     }, [settings, fetchSettings]);

// //     useEffect(() => {
// //         if (settings) {
// //             setCertData(prev => ({
// //                 ...prev,
// //                 institutionName: settings.institutionName || "mLab Southern Africa",
// //                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
// //                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
// //                 logoUrl: mLabLogo,
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

// //             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
// //                 recipientName: certData.recipientName,
// //                 recipientEmail: certData.recipientEmail || null,
// //                 type: finalCertType,
// //                 courseName: certData.programme,
// //                 issueDate: certData.issueDate,
// //                 pdfUrl: downloadUrl,
// //                 groupId: certData.groupId || 'general',
// //                 templateUsed: certData.template,
// //                 createdBy: user?.uid || 'Admin',
// //                 createdAt: serverTimestamp(),
// //                 isEmailed: false
// //             });

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

// //             <main className="main-wrapper" style={{ paddingBottom: '5%', height: '100vh', display: 'flex', flexDirection: 'column' }}>

// //                 <PageHeader
// //                     eyebrow="Facilitator Portal"
// //                     title="Certificate Studio"
// //                     description={view === 'studio' ? 'Design and customize your ad-hoc award' : 'Manage your folders and generation history'}
// //                 // actions={
// //                 //     <PageHeader.Btn
// //                 //         variant="primary"
// //                 //         icon={<Plus size={15} />}
// //                 //         onClick={() => navigate('/facilitator/assessments/builder')}
// //                 //     >
// //                 //         New Assessment
// //                 //     </PageHeader.Btn>
// //                 // }
// //                 />

// //                 {/* USING MLAB-COHORTS STYLING FOR HEADER */}
// //                 {/* <div className="mlab-cohorts__header" style={{ marginBottom: '1.5rem', flexShrink: 0, borderBottom: 'none' }}>
// //                     <div className="mlab-cohorts__header-text">
// //                         <h2 className="mlab-cohorts__title">Certificate Studio</h2>
// //                         <p className="mlab-cohorts__subtitle">
// //                             {view === 'studio' ? 'Design and customize your ad-hoc award' : 'Manage your folders and generation history'}
// //                         </p>
// //                     </div>
// //                 </div> */}

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
// //                                     // USING MLAB-COHORT-GRID FOR FOLDERS
// //                                     <div className="mlab-cohort-grid">

// //                                         {/* Static General Folder */}
// //                                         <div className="mlab-cohort-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}
// //                                             onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
// //                                             <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}>
// //                                                 <Folder size={24} />
// //                                             </div>
// //                                             <div style={{ flex: 1 }}>
// //                                                 <h4 className="mlab-cohort-card__name" style={{ fontSize: '1.1rem' }}>General</h4>
// //                                                 <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// //                                                     {adHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents
// //                                                 </p>
// //                                             </div>
// //                                             <ChevronRight size={18} color="#cbd5e1" />
// //                                         </div>

// //                                         {/* Dynamic Groups */}
// //                                         {certificateGroups.map(group => (
// //                                             <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}
// //                                                 onClick={() => {
// //                                                     if (editingFolderId !== group.id) {
// //                                                         setActiveFolder(group);
// //                                                         setView('inside-folder');
// //                                                     }
// //                                                 }}>
// //                                                 <div style={{ background: 'var(--mlab-light-green)', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green)' }}>
// //                                                     <Folder size={24} />
// //                                                 </div>
// //                                                 <div style={{ flex: 1, overflow: 'hidden' }}>
// //                                                     {editingFolderId === group.id ? (
// //                                                         <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
// //                                                             <input
// //                                                                 className="mlab-input"
// //                                                                 style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%' }}
// //                                                                 autoFocus
// //                                                                 value={editFolderName}
// //                                                                 onChange={e => setEditFolderName(e.target.value)}
// //                                                                 onKeyDown={e => {
// //                                                                     if (e.key === 'Enter') handleRenameFolder(group.id);
// //                                                                     if (e.key === 'Escape') setEditingFolderId(null);
// //                                                                 }}
// //                                                             />
// //                                                             <button className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <>
// //                                                             <h4 className="mlab-cohort-card__name" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
// //                                                             <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
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
// //                             <div className="mlab-standard-actions" style={{ justifyContent: 'flex-start', gap: '15px', marginBottom: '1.5rem' }}>
// //                                 <button className="mlab-btn mlab-btn--ghost" onClick={() => setView('folders')} style={{ border: '1px solid #cbd5e1' }}>
// //                                     <ArrowLeft size={15} /> Back to Folders
// //                                 </button>
// //                                 <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                     <Folder size={20} color="var(--mlab-green)" /> {activeFolder.name}
// //                                 </h2>
// //                             </div>

// //                             <div style={{ flex: 1, overflowY: 'auto' }}>
// //                                 {getCertificatesForActiveFolder().length === 0 ? (
// //                                     <div className="mlab-cohort-empty">
// //                                         <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// //                                         <p className="mlab-cohort-empty__title">Folder is Empty</p>
// //                                         <p className="mlab-cohort-empty__desc" style={{ marginBottom: '1.5rem' }}>No certificates have been saved to this folder yet.</p>
// //                                         <button className="mlab-btn mlab-btn--primary" onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
// //                                             <Plus size={16} /> Create Certificate Here
// //                                         </button>
// //                                     </div>
// //                                 ) : (
// //                                     // USING MLAB-COHORT-GRID FOR CERTIFICATES
// //                                     <div className="mlab-cohort-grid">
// //                                         {getCertificatesForActiveFolder().map(cert => (
// //                                             <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0 }}>
// //                                                 <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
// //                                                     <Award size={48} color="rgba(255,255,255,0.1)" />
// //                                                     <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
// //                                                         {cert.isEmailed && (
// //                                                             <span className="mlab-badge" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem' }} title={`Emailed to ${cert.recipientEmail}`}>
// //                                                                 <Mail size={10} /> Sent
// //                                                             </span>
// //                                                         )}
// //                                                         <span className="mlab-badge mlab-badge--active" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none' }}>PDF</span>
// //                                                     </div>
// //                                                 </div>
// //                                                 <div style={{ padding: '1.25rem' }}>
// //                                                     <h4 className="mlab-cohort-card__name" style={{ marginBottom: '0.5rem' }}>
// //                                                         {cert.recipientName}
// //                                                     </h4>
// //                                                     <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                                         <strong>{cert.type}</strong>
// //                                                         <span>{cert.courseName}</span>
// //                                                     </p>
// //                                                     <div className="mlab-cohort-card__footer">
// //                                                         <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
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

// //                                         <FormSection title="Design Template" icon={Layers}>
// //                                             <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
// //                                                 <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.template} onChange={e => handleChange('template', e.target.value)}>
// //                                                     <option value="luxury">Luxury (Default)</option>
// //                                                     <option value="official">Official Statement (SoR)</option>
// //                                                     <option value="modern">Modern Minimalist</option>
// //                                                 </select>
// //                                             </div>
// //                                         </FormSection>

// //                                         <FormSection title="Folder Assignment" icon={Folder}>
// //                                             <div className="mlab-select-wrap" style={{ width: '100%', padding: 0 }}>
// //                                                 <select className="mlab-input" style={{ border: 'none', background: 'transparent' }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}>
// //                                                     <option value="general">General (No Folder)</option>
// //                                                     {certificateGroups.map(g => (
// //                                                         <option key={g.id} value={g.id}>{g.name}</option>
// //                                                     ))}
// //                                                 </select>
// //                                             </div>
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
// //                                         <button className="mlab-icon-btn" onClick={handleZoomOut}><ZoomOut size={16} color='var(--mlab-green-dark)' /></button>
// //                                         <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
// //                                         <button className="mlab-icon-btn" onClick={handleZoomIn}><ZoomIn size={16} color='var(--mlab-green-dark)' /></button>
// //                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom}><RotateCcw size={16} /></button>
// //                                     </div>

// //                                     <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
// //                                         {/* Canvas Box ensures fixed A4 boundaries for html2canvas */}
// //                                         <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto', backgroundColor: '#fff', overflow: 'hidden' }}>

// //                                             {/* Render Selected Template */}
// //                                             {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
// //                                             {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
// //                                             {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}

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
