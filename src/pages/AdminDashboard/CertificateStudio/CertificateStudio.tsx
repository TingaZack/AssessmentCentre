// src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
    Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
    FileText, Menu, X, Folder, FolderPlus, ChevronRight, Edit2, Layers,
    UploadCloud, CheckCircle, UserPlus, Search, Trash2,
    ChevronLeft,
    Send
} from 'lucide-react';
import { collection, addDoc, updateDoc, writeBatch, serverTimestamp, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { useStore } from '../../../store/useStore';
import { useToast, ToastContainer } from '../../../components/common/Toast/Toast';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { auth, db } from '../../../lib/firebase';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';

import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../../CohortDetails/CohortDetailsPage.css';
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
// TEMPLATES
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
                        {data.sigUrl && <img src={data.sigUrl} alt="Signature" crossOrigin="anonymous" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
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

const ModernTemplate = ({ data, finalType }: { data: any, finalType: string }) => (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
        <div style={{ width: '280px', backgroundColor: 'var(--mlab-blue)', height: '100%', padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white', boxSizing: 'border-box' }}>
            <div>
                {data.logoUrl && <img src={data.logoUrl} alt="Logo" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain', }} crossOrigin="anonymous" />}
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
                    {data.sigUrl && <img src={data.sigUrl} alt="Signature" crossOrigin="anonymous" style={{ height: 190, objectFit: 'contain', marginBottom: -70 }} crossOrigin="anonymous" />}
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
// COMPONENT: SHARE / COLLABORATOR MODAL
// ═════════════════════════════════════════════════════════════════════════════
const ShareModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    targetId: string;
    targetType: 'folder' | 'certificate';
    targetName: string;
    initialCollaborators: string[];
    onSave: (id: string, type: 'folder' | 'certificate', collabs: string[]) => Promise<void>;
}> = ({ isOpen, onClose, targetId, targetType, targetName, initialCollaborators, onSave }) => {
    const [emails, setEmails] = useState<string[]>(initialCollaborators || []);
    const [inputValue, setInputValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleAdd = () => {
        const cleanEmail = inputValue.trim().toLowerCase();
        if (cleanEmail && !emails.includes(cleanEmail)) {
            setEmails([...emails, cleanEmail]);
            setInputValue('');
        }
    };

    const handleRemove = (email: string) => {
        setEmails(emails.filter(e => e !== email));
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(targetId, targetType, emails);
        setIsSaving(false);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><UserPlus size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Share {targetType === 'folder' ? 'Folder' : 'Certificate'}</h2>
                        <p className="wm-modal__subtitle">Manage access for "{targetName}"</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label className="wm-form-label">Add Collaborator (Email)</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="email"
                                className="wm-form-input"
                                style={{ margin: 0, flex: 1 }}
                                placeholder="e.g. facilitator@mlab.co.za"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                            />
                            <button type="button" className="cdp-btn cdp-btn--outline" onClick={handleAdd}>Add</button>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
                        <label className="wm-form-label">Current Collaborators ({emails.length})</label>
                        {emails.length === 0 ? (
                            <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontStyle: 'italic', margin: '0.5rem 0' }}>No external collaborators added. Only you can view this.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {emails.map(email => (
                                    <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{email}</span>
                                        <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', padding: 0 }} onClick={() => handleRemove(email)}>
                                            <Trash2 size={14} color="#ef4444" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="wm-modal__footer">
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 size={14} className="cdp-spinner" /> : 'Save Access Control'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT: STUDIO MAIN
// ═════════════════════════════════════════════════════════════════════════════
export const CertificateStudio: React.FC = () => {
    const {
        settings, user, adHocCertificates = [], certificateGroups = [],
        fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
        renameCertificateGroup, fetchSettings
    } = useStore();

    const toast = useToast();
    const navigate = useNavigate();

    // ─── VIEW & LAYOUT STATE ───
    const [view, setView] = useState<'folders' | 'inside-folder' | 'studio' | 'bulk-review'>('folders');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [activeFolder, setActiveFolder] = useState<any>(null);
    const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');

    const [folderSearchQuery, setFolderSearchQuery] = useState('');
    const [certSearchQuery, setCertSearchQuery] = useState('');
    const [folderToDelete, setFolderToDelete] = useState<any>(null);

    // ─── SHARE MODAL STATE ───
    const [shareModalConfig, setShareModalConfig] = useState<{
        isOpen: boolean;
        targetId: string;
        targetType: 'folder' | 'certificate';
        targetName: string;
        collaborators: string[];
    }>({ isOpen: false, targetId: '', targetType: 'folder', targetName: '', collaborators: [] });

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

    // ─── BULK GENERATOR STATE ───
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [isBulkGenerating, setIsBulkGenerating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

    const [bulkData, setBulkData] = useState<any[]>([]);
    const [bulkSettings, setBulkSettings] = useState<any>(null);
    const [bulkSendEmails, setBulkSendEmails] = useState(false);
    const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);

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

    useEffect(() => {
        if (view === 'bulk-review' && bulkData.length > 0 && bulkSettings) {
            const row = bulkData[bulkCurrentIndex];
            const rowName = row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown';
            const rowEmail = row.Email || row.email || row['Email Address'] || '';
            const rowCourse = row.Course || row.course || row.Programme || bulkSettings.programme;

            setCertData(prev => ({
                ...prev,
                ...bulkSettings,
                recipientName: rowName,
                recipientEmail: rowEmail,
                programme: rowCourse
            }));
        }
    }, [bulkCurrentIndex, view, bulkData, bulkSettings]);

    const handleLogout = async () => { try { await signOut(auth); navigate('/login'); } catch (e) { } };

    // ─── FILTERING FOR ACCESS CONTROL ───
    const isSuperAdmin = (user as any)?.isSuperAdmin === true;
    const userEmail = user?.email?.toLowerCase() || '';

    const myCertificateGroups = certificateGroups.filter(g =>
        isSuperAdmin || g.createdBy === user?.uid || (g.collaborators || []).includes(userEmail)
    );

    const myAdHocCertificates = adHocCertificates.filter(c =>
        isSuperAdmin || c.createdBy === user?.uid || (c.collaborators || []).includes(userEmail)
    );

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            // Explicitly set collaborators array for security
            if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());

            // To ensure the new field is mapped if we do direct DB creation instead of store func:
            // await addDoc(collection(db, 'certificate_groups'), { name: newFolderName.trim(), createdBy: user?.uid, collaborators: [] });

            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
        } catch (error) { toast.error("Failed to create folder"); }
    };

    const handleRenameFolder = async (id: string) => {
        if (!editFolderName.trim()) { setEditingFolderId(null); return; }
        try {
            if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            setEditingFolderId(null); toast.success("Folder renamed!");
        } catch (error) { toast.error("Failed to rename folder"); }
    };

    const triggerDeleteFolder = (e: React.MouseEvent, folder: any) => {
        e.stopPropagation();
        setFolderToDelete(folder);
    };

    const executeDeleteFolder = async () => {
        if (!folderToDelete) return;

        try {
            const batch = writeBatch(db);
            const certsToMove = myAdHocCertificates.filter(c => c.groupId === folderToDelete.id);
            certsToMove.forEach(cert => {
                batch.update(doc(db, 'ad_hoc_certificates', cert.id), { groupId: 'general' });
            });

            batch.delete(doc(db, 'certificate_groups', folderToDelete.id));

            await batch.commit();
            toast.success(`Folder deleted. ${certsToMove.length} certificates safely moved to General.`);

            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
        } catch (error) {
            console.error("Delete Error:", error);
            toast.error("Failed to delete folder.");
        } finally {
            setFolderToDelete(null);
        }
    };

    const handleSaveCollaborators = async (id: string, type: 'folder' | 'certificate', collaborators: string[]) => {
        try {
            const collectionName = type === 'folder' ? 'certificate_groups' : 'ad_hoc_certificates';
            await updateDoc(doc(db, collectionName, id), { collaborators });
            toast.success('Access control updated securely.');

            if (type === 'folder' && fetchCertificateGroups) await fetchCertificateGroups(true);
            if (type === 'certificate' && fetchAdHocCertificates) await fetchAdHocCertificates(true);
        } catch (err) {
            toast.error('Failed to update collaborators.');
        }
    };

    const getCertificatesForActiveFolder = () => {
        if (!activeFolder) return [];
        let certs = [];
        if (activeFolder.id === 'general') certs = myAdHocCertificates.filter(c => !c.groupId || c.groupId === 'general');
        else certs = myAdHocCertificates.filter(c => c.groupId === activeFolder.id);

        if (certSearchQuery) {
            const q = certSearchQuery.toLowerCase();
            return certs.filter(c =>
                (c.recipientName || '').toLowerCase().includes(q) ||
                (c.courseName || '').toLowerCase().includes(q) ||
                (c.type || '').toLowerCase().includes(q)
            );
        }
        return certs;
    };

    const filteredFolders = myCertificateGroups.filter(g => g.name.toLowerCase().includes(folderSearchQuery.toLowerCase()));
    const showGeneralFolder = folderSearchQuery === '' || 'general certificates'.includes(folderSearchQuery.toLowerCase());

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
                createdBy: user?.uid || 'Admin', createdAt: serverTimestamp(), isEmailed: false,
                collaborators: [] // 🚀 Secure by default
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

    const handleStartBulkReview = (rows: any[], settings: any, sendEmails: boolean) => {
        setShowBulkModal(false);
        setBulkData(rows);
        setBulkSettings(settings);
        setBulkSendEmails(sendEmails);
        setBulkCurrentIndex(0);
        setView('bulk-review');
    };

    const executeFinalBulkProcessing = async () => {
        setIsBulkGenerating(true);
        const currentZoom = zoom;
        setZoom(1);

        let successCount = 0;

        try {
            for (let i = 0; i < bulkData.length; i++) {
                setBulkProgress({ current: i + 1, total: bulkData.length });
                const row = bulkData[i];

                const rowName = row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown';
                const rowEmail = row.Email || row.email || row['Email Address'] || '';
                const rowCourse = row.Course || row.course || row.Programme || bulkSettings.programme;

                setCertData(prev => ({
                    ...prev,
                    ...bulkSettings,
                    recipientName: rowName,
                    recipientEmail: rowEmail,
                    programme: rowCourse
                }));

                await new Promise(r => setTimeout(r, 700));

                if (!certRef.current) continue;

                const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
                const pdfBlob = pdf.output('blob');

                const safeName = rowName.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `ad_hoc_certs/bulk_${Date.now()}_${safeName}.pdf`;
                const storageRef = ref(getStorage(), fileName);
                await uploadBytes(storageRef, pdfBlob);
                const downloadUrl = await getDownloadURL(storageRef);

                const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
                    recipientName: rowName,
                    recipientEmail: rowEmail || null,
                    type: bulkSettings.certType,
                    courseName: rowCourse,
                    issueDate: bulkSettings.issueDate,
                    pdfUrl: downloadUrl,
                    groupId: bulkSettings.groupId || 'general',
                    templateUsed: bulkSettings.template,
                    createdBy: user?.uid || 'Admin',
                    createdAt: serverTimestamp(),
                    isEmailed: false,
                    isBulkUpload: true,
                    collaborators: [] // 🚀 Secure by default
                });

                if (bulkSendEmails && rowEmail) {
                    const sendAdHocEmail = httpsCallable(getFunctions(), 'sendAdHocCertificate');
                    await sendAdHocEmail({ email: rowEmail, recipientName: rowName, pdfUrl: downloadUrl, awardTitle: bulkSettings.certType, courseName: rowCourse });
                    await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
                }

                successCount++;
            }

            toast.success(`Bulk Operation Complete: ${successCount} certificates generated safely.`);
            if (fetchAdHocCertificates) fetchAdHocCertificates(true);

        } catch (error) {
            console.error("Bulk process failed:", error);
            toast.error("A critical error interrupted the bulk generation loop.");
        } finally {
            setZoom(currentZoom);
            setIsBulkGenerating(false);
            setBulkData([]);
            setBulkSettings(null);
            setBulkProgress({ current: 0, total: 0 });
            resetForm();
            setView('folders');
        }
    };

    return (
        <div className="cdp-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {folderToDelete && (
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="warning"
                        title="Delete Workspace Folder"
                        message={`Are you sure you want to delete the folder "${folderToDelete.name}"?\n\nDon't worry! All certificates currently inside this folder will be safely preserved and moved back to the General Certificates workspace.`}
                        confirmText="Yes, Delete Folder"
                        onClose={executeDeleteFolder}
                        onCancel={() => setFolderToDelete(null)}
                    />
                </div>
            )}

            {shareModalConfig.isOpen && (
                <ShareModal
                    isOpen={shareModalConfig.isOpen}
                    onClose={() => setShareModalConfig({ ...shareModalConfig, isOpen: false })}
                    targetId={shareModalConfig.targetId}
                    targetType={shareModalConfig.targetType}
                    targetName={shareModalConfig.targetName}
                    initialCollaborators={shareModalConfig.collaborators}
                    onSave={handleSaveCollaborators}
                />
            )}

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

            <main className="cdp-main" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>

                {isBulkGenerating && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-blue)' }}></div>
                        <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '2rem', margin: '0 0 0.5rem' }}>Generating Batch Certificates</h2>
                        <p style={{ color: 'var(--mlab-grey)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Processing <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{bulkProgress.current}</span> of {bulkProgress.total}...
                        </p>
                        <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>DO NOT CLOSE THIS TAB OR SWITCH WINDOWS.</p>
                    </div>
                )}

                {showBulkModal && (
                    <BulkGeneratorModal
                        certificateGroups={myCertificateGroups}
                        onClose={() => setShowBulkModal(false)}
                        onStart={handleStartBulkReview}
                        onCreateFolder={async (name) => {
                            try {
                                const newDocRef = await addDoc(collection(db, 'certificate_groups'), {
                                    name: name,
                                    createdAt: serverTimestamp(),
                                    createdBy: user?.uid || 'Admin',
                                    collaborators: [] // 🚀 Secure by default
                                });
                                if (fetchCertificateGroups) await fetchCertificateGroups(true);
                                toast.success("Folder created successfully!");
                                return newDocRef.id;
                            } catch (error) {
                                toast.error("Failed to create folder");
                                return null;
                            }
                        }}
                    />
                )}

                {/* ── CDP-ALIGNED PAGE HEADER ── */}
                {view !== 'bulk-review' && (
                    <header className="cdp-header">
                        <div className="cdp-header__left">
                            <div className="cdp-header__eyebrow"><Award size={12} /> Institutional Tool</div>
                            <h1 className="cdp-header__title">Certificate Studio</h1>
                            <p className="cdp-header__sub">
                                <Award size={12} className="cdp-header__sub-icon" /> Design custom ad-hoc awards and manage document history.
                                <span className="cdp-header__status cdp-header__status--active">System Live</span>
                            </p>
                        </div>
                        <div className="cdp-header__right">
                            <NotificationBell />
                        </div>
                    </header>
                )}

                <div className="cdp-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: view === 'bulk-review' ? 0 : '1.5rem 2rem' }}>

                    {/* ── METRICS RIBBON (Only show on Folders view to match CDP style) ── */}
                    {view === 'folders' && !isLoadingData && (
                        <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
                            <div className="cdp-stat-card cdp-stat-card--blue">
                                <div className="cdp-stat-card__icon"><Layers size={20} /></div>
                                <div className="cdp-stat-card__body">
                                    <span className="cdp-stat-card__value">{myCertificateGroups.length + 1}</span>
                                    <span className="cdp-stat-card__label">Total Folders</span>
                                </div>
                            </div>
                            <div className="cdp-stat-card cdp-stat-card--green">
                                <div className="cdp-stat-card__icon"><Award size={20} /></div>
                                <div className="cdp-stat-card__body">
                                    <span className="cdp-stat-card__value">{myAdHocCertificates.length}</span>
                                    <span className="cdp-stat-card__label">Issued Certificates</span>
                                </div>
                            </div>
                            <div className="cdp-stat-card cdp-stat-card--amber">
                                <div className="cdp-stat-card__icon"><Mail size={20} /></div>
                                <div className="cdp-stat-card__body">
                                    <span className="cdp-stat-card__value">{myAdHocCertificates.filter(c => c.isEmailed).length}</span>
                                    <span className="cdp-stat-card__label">Emailed Successfully</span>
                                </div>
                            </div>
                            <div className="cdp-stat-card cdp-stat-card--grey">
                                <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                                <div className="cdp-stat-card__body">
                                    <span className="cdp-stat-card__value">{myAdHocCertificates.filter(c => !c.isEmailed).length}</span>
                                    <span className="cdp-stat-card__label">Downloads Only</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TABS (LFM style to match CDP) ── */}
                    {view !== 'bulk-review' && (
                        <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
                            <button
                                className={`lfm-tab ${view === 'folders' || view === 'inside-folder' ? 'active' : ''}`}
                                onClick={() => { setView('folders'); setActiveFolder(null); }}
                            >
                                <Folder size={16} /> Workspace Folders
                            </button>
                            <button
                                className={`lfm-tab ${view === 'studio' ? 'active' : ''}`}
                                onClick={() => setView('studio')}
                            >
                                <FileCheck size={16} /> Certificate Studio
                            </button>
                        </div>
                    )}

                    {/* ── ADVANCED TOOLBAR (CDP Style) ── */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: view === 'bulk-review' ? 0 : '1.5rem', alignItems: 'center', padding: view === 'bulk-review' ? '1rem 1.5rem' : 0 }}>
                        {view === 'folders' && (
                            <>
                                <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
                                    <Search size={15} color="var(--mlab-grey)" />
                                    <input
                                        type="text"
                                        placeholder="Search folders..."
                                        value={folderSearchQuery}
                                        onChange={e => setFolderSearchQuery(e.target.value)}
                                        style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
                                    />
                                    {folderSearchQuery && <button onClick={() => setFolderSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {showNewFolderInput ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                className="wm-form-input"
                                                style={{ width: '220px', padding: '0.5rem 0.75rem', height: '36px', margin: 0 }}
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                placeholder="Enter folder name..."
                                                autoFocus
                                            />
                                            <button className="cdp-btn cdp-btn--outline" onClick={handleCreateFolder}>Save</button>
                                            <button className="cdp-btn cdp-btn--danger" onClick={() => setShowNewFolderInput(false)}>Cancel</button>
                                        </div>
                                    ) : (
                                        <button className="cdp-btn cdp-btn--outline" style={{ background: 'white' }} onClick={() => setShowNewFolderInput(true)}>
                                            <FolderPlus size={14} /> New Folder
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                    <button className="cdp-btn cdp-btn--outline" style={{ background: 'white' }} onClick={() => setShowBulkModal(true)}>
                                        <UploadCloud size={14} /> Import Spreadsheet
                                    </button>
                                    <button className="mlab-btn mlab-btn--primary" onClick={() => setView('studio')}>
                                        <Plus size={14} /> Single Certificate
                                    </button>
                                </div>
                            </>
                        )}

                        {view === 'inside-folder' && activeFolder && (
                            <>
                                <button className="cdp-btn cdp-btn--outline" onClick={() => setView('folders')} style={{ background: 'white' }}>
                                    <ArrowLeft size={14} /> Back to Folders
                                </button>
                                <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginLeft: '1rem', marginRight: '1rem' }}>
                                    <Folder size={18} color="var(--mlab-green)" /> {activeFolder.name}
                                </h2>

                                <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
                                    <Search size={15} color="var(--mlab-grey)" />
                                    <input
                                        type="text"
                                        placeholder="Search names or courses..."
                                        value={certSearchQuery}
                                        onChange={e => setCertSearchQuery(e.target.value)}
                                        style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
                                    />
                                    {certSearchQuery && <button onClick={() => setCertSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                    <button
                                        className="cdp-btn cdp-btn--outline"
                                        style={{ background: 'white' }}
                                        onClick={() => setShareModalConfig({
                                            isOpen: true,
                                            targetId: activeFolder.id,
                                            targetType: 'folder',
                                            targetName: activeFolder.name,
                                            collaborators: activeFolder.collaborators || []
                                        })}
                                    >
                                        <UserPlus size={14} /> Add Collaborator
                                    </button>
                                    <button
                                        className="mlab-btn mlab-btn--primary"
                                        onClick={() => { setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}
                                    >
                                        <Plus size={14} /> Create in this Folder
                                    </button>
                                </div>
                            </>
                        )}

                        {view === 'studio' && (
                            <>
                                <button className="cdp-btn cdp-btn--outline" onClick={() => setView('folders')} style={{ background: 'white' }}>
                                    <ArrowLeft size={14} /> Cancel Design
                                </button>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                    <button className="cdp-btn cdp-btn--outline" style={{ background: 'white' }} disabled={isGenerating} onClick={() => { setActionType('download'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'download' ? <Loader2 className="cdp-spinner" size={14} /> : <Download size={14} />}
                                        Download PDF
                                    </button>
                                    <button className="mlab-btn mlab-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
                                        {isGenerating && actionType === 'email' ? <Loader2 className="cdp-spinner" size={14} /> : <Mail size={14} />}
                                        Email Document
                                    </button>
                                </div>
                            </>
                        )}

                        {view === 'bulk-review' && (
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 1rem' }}>
                                <button className="cdp-btn cdp-btn--danger" onClick={() => { setBulkData([]); setView('folders'); }}>
                                    <X size={14} /> Cancel Bulk Operation
                                </button>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto', background: 'white', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                    <button
                                        className="mlab-icon-btn"
                                        disabled={bulkCurrentIndex === 0}
                                        onClick={() => setBulkCurrentIndex(p => Math.max(0, p - 1))}
                                        style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    >
                                        <ChevronLeft color='var(--mlab-midnight)' size={18} />
                                    </button>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', minWidth: '150px', textAlign: 'center' }}>
                                        Preview {bulkCurrentIndex + 1} of {bulkData.length}
                                    </span>
                                    <button
                                        className="mlab-icon-btn"
                                        disabled={bulkCurrentIndex === bulkData.length - 1}
                                        onClick={() => setBulkCurrentIndex(p => Math.min(bulkData.length - 1, p + 1))}
                                        style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    >
                                        <ChevronRight color='var(--mlab-midnight)' size={18} />
                                    </button>
                                </div>

                                <button className="mlab-btn mlab-btn--primary" onClick={executeFinalBulkProcessing}>
                                    <Send size={14} /> Approve & Process All ({bulkData.length})
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── MAIN CONTENT AREA ── */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                        {view === 'folders' && (
                            isLoadingData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                                    <div className="cdp-spinner" style={{ color: 'var(--mlab-blue)' }}><Loader2 size={32} /></div>
                                    <span className="cdp-loading-state__label">Loading Workspace...</span>
                                </div>
                            ) : (
                                <div className="cdp-panel" style={{ border: 'none', background: 'transparent' }}>
                                    <div className="wm-grid">
                                        {showGeneralFolder && (
                                            <div className="wm-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem', borderTopColor: 'var(--mlab-grey)' }}
                                                onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
                                                <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: 'var(--mlab-blue)' }}><Folder size={24} /></div>
                                                <div style={{ flex: 1 }}>
                                                    <h4 className="wm-card__name" style={{ fontSize: '1.1rem' }}>General Certificates</h4>
                                                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{myAdHocCertificates.filter(c => !c.groupId || c.groupId === 'general').length} Documents</p>
                                                </div>
                                                <ChevronRight size={18} color="#cbd5e1" />
                                            </div>
                                        )}

                                        {filteredFolders.map(group => (
                                            <div key={group.id} className="wm-card animate-fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', padding: '1.5rem', borderTopColor: 'var(--mlab-green)' }}
                                                onClick={() => { if (editingFolderId !== group.id) { setActiveFolder(group); setView('inside-folder'); } }}>
                                                <div style={{ background: 'rgba(148, 199, 61, 0.15)', padding: '12px', borderRadius: '10px', color: 'var(--mlab-green-dark)' }}><Folder size={24} /></div>
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    {editingFolderId === group.id ? (
                                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                                            <input
                                                                className="wm-form-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%', margin: 0 }} autoFocus
                                                                value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                                                            />
                                                            <button className="cdp-btn cdp-btn--outline" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <h4 className="wm-card__name" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h4>
                                                            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{myAdHocCertificates.filter(c => c.groupId === group.id).length} Documents</p>
                                                        </>
                                                    )}
                                                </div>

                                                {editingFolderId !== group.id && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder">
                                                            <Edit2 size={16} color="var(--mlab-blue)" />
                                                        </button>

                                                        {/* Dynamic Share Button Access */}
                                                        <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={(e) => { e.stopPropagation(); setShareModalConfig({ isOpen: true, targetId: group.id, targetType: 'folder', targetName: group.name, collaborators: group.collaborators || [] }); }} title="Share Folder">
                                                            <UserPlus size={16} color="var(--mlab-green)" />
                                                        </button>

                                                        <button className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={(e) => triggerDeleteFolder(e, group)} title="Delete Folder">
                                                            <Trash2 size={16} color="#ef4444" />
                                                        </button>

                                                        <ChevronRight size={18} color="#cbd5e1" style={{ marginLeft: '4px' }} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {filteredFolders.length === 0 && !showGeneralFolder && (
                                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                                <Search size={32} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
                                                <p>No folders match your search.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        )}

                        {view === 'inside-folder' && activeFolder && (
                            <div className="cdp-panel" style={{ border: 'none', background: 'transparent' }}>
                                {getCertificatesForActiveFolder().length === 0 ? (
                                    <div className="wm-empty" style={{ margin: '2rem auto', maxWidth: '600px', background: 'white' }}>
                                        <div className="wm-empty__icon">{certSearchQuery ? <Search size={36} /> : <FileText size={36} />}</div>
                                        <p className="wm-empty__title">{certSearchQuery ? 'No Results Found' : 'Folder is Empty'}</p>
                                        <p className="wm-empty__desc">{certSearchQuery ? `No certificates match "${certSearchQuery}".` : 'No certificates have been saved to this folder yet.'}</p>
                                    </div>
                                ) : (
                                    <div className="wm-grid">
                                        {getCertificatesForActiveFolder().map(cert => (
                                            <div key={cert.id} className="wm-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
                                                <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                    <Award size={48} color="rgba(255,255,255,0.1)" />
                                                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                                                        {cert.isEmailed && <span className="cdp-header__status cdp-header__status--active" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem', background: 'var(--mlab-green)', color: 'white', border: 'none' }} title={`Emailed to ${cert.recipientEmail}`}><Mail size={10} /> Sent</span>}
                                                        <span className="cdp-header__status cdp-header__status--archived" style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.5rem' }}>PDF</span>
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
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            {/* 🚀 FIXED: Dynamic Share Button Access per individual certificate */}
                                                            <button className="cdp-btn cdp-btn--outline" onClick={() => setShareModalConfig({ isOpen: true, targetId: cert.id, targetType: 'certificate', targetName: cert.recipientName, collaborators: cert.collaborators || [] })}>
                                                                <UserPlus size={12} /> Share
                                                            </button>
                                                            <button className="cdp-btn cdp-btn--outline" onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                                <Download size={12} /> View
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {(view === 'studio' || view === 'bulk-review') && (
                            <div style={{ display: 'flex', gap: '1.5rem', height: '100%', paddingBottom: view === 'bulk-review' ? '0' : '0.5rem' }}>

                                {view === 'studio' && (
                                    <div className="cdp-panel" style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <FormSection title="Design Template" icon={Layers}>
                                                <select className="wm-form-input" style={{ margin: 0 }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select>
                                            </FormSection>
                                            <FormSection title="Folder Assignment" icon={Folder}>
                                                <select className="wm-form-input" style={{ margin: 0 }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{myCertificateGroups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}</select>
                                            </FormSection>
                                            <FormSection title="Recipient Details" icon={UserCircle}>
                                                <input className="wm-form-input" style={{ margin: 0 }} placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
                                                <input className="wm-form-input" style={{ margin: 0 }} type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
                                            </FormSection>
                                            <FormSection title="Award Details" icon={FileCheck}>
                                                <select className="wm-form-input" style={{ margin: 0 }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select>
                                                {certData.certType === 'Other' && <input className="wm-form-input" style={{ margin: 0 }} placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
                                                <input className="wm-form-input" style={{ margin: 0 }} placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
                                                <textarea className="wm-form-input" style={{ margin: 0, minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
                                            </FormSection>
                                            <FormSection title="Branding & Signatures" icon={Building2}>
                                                <input className="wm-form-input" style={{ margin: 0 }} placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                    <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
                                                    <input className="wm-form-input" style={{ margin: 0 }} type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
                                                </div>
                                                <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                                    <label className="cdp-btn cdp-btn--outline" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
                                                    <label className="cdp-btn cdp-btn--outline" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
                                                </div>
                                            </FormSection>
                                        </div>
                                    </div>
                                )}

                                <div className="cdp-panel cert-preview-container" style={{ flex: 1, position: 'relative', background: '#e2e8f0', borderRadius: view === 'bulk-review' ? '0' : '8px', border: view === 'bulk-review' ? 'none' : '1px solid var(--mlab-border)', overflow: 'hidden' }}>

                                    <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
                                        <button className="mlab-icon-btn" onClick={handleZoomOut} disabled={isBulkGenerating}><ZoomOut size={16} color='var(--mlab-green-dark)' /></button>
                                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
                                        <button className="mlab-icon-btn" onClick={handleZoomIn} disabled={isBulkGenerating}><ZoomIn size={16} color='var(--mlab-green-dark)' /></button>
                                        <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom} disabled={isBulkGenerating}><RotateCcw size={16} /></button>
                                    </div>

                                    {view === 'bulk-review' && certData.recipientEmail && bulkSendEmails && (
                                        <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0', zIndex: 100 }}>
                                            <Mail size={14} /> Will be emailed to: {certData.recipientEmail}
                                        </div>
                                    )}

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


// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT: BULK GENERATOR MODAL
// ═════════════════════════════════════════════════════════════════════════════
const BulkGeneratorModal: React.FC<{
    certificateGroups: any[],
    onClose: () => void,
    onStart: (rows: any[], settings: any, sendEmails: boolean) => void,
    onCreateFolder: (name: string) => Promise<string | null>
}> = ({ certificateGroups, onClose, onStart, onCreateFolder }) => {

    const [parsedData, setParsedData] = useState<any[]>([]);
    const [fileError, setFileError] = useState('');
    const [sendEmails, setSendEmails] = useState(false);

    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [isSavingFolder, setIsSavingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const [settings, setSettings] = useState({
        template: 'luxury',
        groupId: 'general',
        certType: 'Achievement',
        programme: '',
        description: 'has demonstrated exceptional skills and outstanding performance in',
        issueDate: new Date().toISOString().split('T')[0]
    });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    setFileError("The uploaded spreadsheet is empty.");
                    return;
                }

                const sample = data[0] as any;
                const hasName = ('Name' in sample) || ('name' in sample) || ('Full Name' in sample) || ('Recipient' in sample);

                if (!hasName) {
                    setFileError("Spreadsheet missing a recognizable 'Name' column. Please use a column header like 'Name' or 'Full Name'.");
                    return;
                }

                setFileError('');
                setParsedData(data);

            } catch (err) {
                setFileError("Failed to parse the file. Ensure it is a valid .csv or .xlsx.");
            }
        };
        reader.readAsBinaryString(file);
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Layers size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Bulk Generate Certificates</h2>
                        <p className="wm-modal__subtitle">Upload a spreadsheet to automate design and distribution.</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="wm-modal__body">

                    {parsedData.length === 0 ? (
                        <div style={{ border: '2px dashed #cbd5e1', padding: '3rem 2rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc' }}>
                            <UploadCloud size={48} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1rem' }}>Upload Document Template</h3>
                            <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.85rem' }}>Must contain a "Name" column. Optionally include "Email" or "Course". (.csv or .xlsx)</p>
                            <label className="mlab-btn mlab-btn--primary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                                Browse Files
                                <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                            </label>
                            {fileError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '1rem', fontWeight: 500 }}>{fileError}</p>}
                        </div>
                    ) : (
                        <div className="wm-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                <CheckCircle size={24} color="#16a34a" />
                                <div>
                                    <h4 style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>Spreadsheet Verified!</h4>
                                    <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.75rem' }}>Successfully extracted <strong>{parsedData.length} records.</strong></p>
                                </div>
                                <button className="cdp-btn cdp-btn--outline" style={{ marginLeft: 'auto' }} onClick={() => setParsedData([])}>Change File</button>
                            </div>

                            <div className="wm-form-section">
                                <div className="wm-form-section__label"><Layers size={12} /> Default Certificate Settings</div>
                                <div className="wm-form-grid">
                                    <div className="wm-form-group wm-form-group--full">
                                        <label className="wm-form-label">Visual Template</label>
                                        <select className="wm-form-input" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value }))}>
                                            <option value="luxury">Luxury Classic</option>
                                            <option value="official">Official Statement (SoR)</option>
                                            <option value="modern">Modern Minimalist</option>
                                        </select>
                                    </div>

                                    <div className="wm-form-group wm-form-group--full">
                                        <label className="wm-form-label">Save To Folder</label>
                                        {isCreatingFolder ? (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    className="wm-form-input"
                                                    autoFocus
                                                    placeholder="New folder name..."
                                                    value={newFolderName}
                                                    onChange={e => setNewFolderName(e.target.value)}
                                                    disabled={isSavingFolder}
                                                    onKeyDown={async (e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (!newFolderName.trim()) return;
                                                            setIsSavingFolder(true);
                                                            const newId = await onCreateFolder(newFolderName.trim());
                                                            if (newId) {
                                                                setSettings(s => ({ ...s, groupId: newId }));
                                                                setIsCreatingFolder(false);
                                                                setNewFolderName('');
                                                            }
                                                            setIsSavingFolder(false);
                                                        }
                                                    }}
                                                />
                                                <button type="button" className="cdp-btn cdp-btn--outline" disabled={isSavingFolder} onClick={async () => {
                                                    if (!newFolderName.trim()) return;
                                                    setIsSavingFolder(true);
                                                    const newId = await onCreateFolder(newFolderName.trim());
                                                    if (newId) {
                                                        setSettings(s => ({ ...s, groupId: newId }));
                                                        setIsCreatingFolder(false);
                                                        setNewFolderName('');
                                                    }
                                                    setIsSavingFolder(false);
                                                }}>
                                                    {isSavingFolder ? <Loader2 size={14} className="cdp-spinner" /> : 'Save'}
                                                </button>
                                                <button type="button" className="cdp-btn cdp-btn--danger" disabled={isSavingFolder} onClick={() => setIsCreatingFolder(false)}>Cancel</button>
                                            </div>
                                        ) : (
                                            <select className="wm-form-input" value={settings.groupId} onChange={e => {
                                                if (e.target.value === 'create_new') {
                                                    setIsCreatingFolder(true);
                                                } else {
                                                    setSettings(s => ({ ...s, groupId: e.target.value }));
                                                }
                                            }}>
                                                <option value="general">General (No Folder)</option>
                                                {certificateGroups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}

                                                {settings.groupId !== 'general' && !certificateGroups.find(g => g.id === settings.groupId) && (
                                                    <option value={settings.groupId}>{newFolderName || 'New Folder...'}</option>
                                                )}

                                                <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>➕ Create New Folder...</option>
                                            </select>
                                        )}
                                    </div>

                                    <div className="wm-form-group wm-form-group--full">
                                        <label className="wm-form-label">Award Title</label>
                                        <select className="wm-form-input" value={settings.certType} onChange={e => setSettings(s => ({ ...s, certType: e.target.value }))}>
                                            <option value="Achievement">Certificate of Achievement</option>
                                            <option value="Attendance">Certificate of Attendance</option>
                                            <option value="Excellence">Award of Excellence</option>
                                            <option value="Participation">Certificate of Participation</option>
                                        </select>
                                    </div>
                                    <div className="wm-form-group wm-form-group--full">
                                        <label className="wm-form-label">Default Course/Programme Name (Overridden if spreadsheet has 'Course' column)</label>
                                        <input className="wm-form-input" placeholder="e.g. Advanced AI Bootcamp" value={settings.programme} onChange={e => setSettings(s => ({ ...s, programme: e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                Automatically email to recipients
                                <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>(Requires 'Email' column in spreadsheet)</span>
                            </label>

                        </div>
                    )}

                </div>
                <div className="wm-modal__footer">
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        className="mlab-btn mlab-btn--primary"
                        disabled={parsedData.length === 0 || isCreatingFolder}
                        onClick={() => onStart(parsedData, settings, sendEmails)}
                    >
                        {isCreatingFolder ? "Save Folder First..." : `Stage & Review (${parsedData.length})`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};