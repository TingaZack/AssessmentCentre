// src/components/admin/PlacementsDashboard/EvidenceExportModal.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderArchive, DownloadCloud, CheckSquare, Square, X, Loader2 } from 'lucide-react';

const AUDIT_FOLDERS = [
    { id: '01_Contracts', label: '01_Contracts', sub: 'SLA, WBL Agreements, Employment Contracts' },
    { id: '02_Learners', label: '02_Learners', sub: 'IDs, Qualifications, Affidavits' },
    { id: '03_SMEs', label: '03_SMEs', sub: 'Agreements, Mentor Assignments' },
    { id: '04_Attendance', label: '04_Attendance', sub: 'Registers, Timesheets' },
    { id: '05_Finance', label: '05_Finance', sub: 'Proof of Payments, Invoices' },
    { id: '06_Monitoring', label: '06_Monitoring', sub: 'Site Visits, Evidence Artifacts' },
    { id: '07_Reports', label: '07_Reports', sub: 'Quarterly Reports, Final Report' },
    { id: '08_Audit', label: '08_Audit', sub: 'Evidence Register, Compliance Checklist' }
];

interface EvidenceExportModalProps {
    learnerName: string;
    onClose: () => void;
    onGenerate: (selectedFolders: string[]) => void;
    isGenerating: boolean;
}

export const EvidenceExportModal: React.FC<EvidenceExportModalProps> = ({
    learnerName, // 🚀 FIXED: Destructured as learnerName
    onClose,
    onGenerate,
    isGenerating
}) => {
    // Default to all folders selected
    const [selectedFolders, setSelectedFolders] = useState<Set<string>>(
        new Set(AUDIT_FOLDERS.map(f => f.id))
    );

    const toggleFolder = (id: string) => {
        const next = new Set(selectedFolders);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedFolders(next);
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '600px', background: 'white', borderRadius: '12px', padding: '0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
                <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-blue)', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#4338ca', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FolderArchive size={24} />
                        </div>
                        <div>
                            <h2 className="wm-modal__title" style={{ margin: '0 0 4px 0', fontSize: '1.2rem', color: 'var(--mlab-midnight)' }}>Configure Audit Pack</h2>
                            <p className="wm-modal__subtitle" style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Select which compliance folders to compile for <strong>{learnerName}</strong>.</p>
                        </div>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={isGenerating} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="wm-modal__body" style={{ padding: '1.5rem', maxHeight: '55vh', overflowY: 'auto', background: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {AUDIT_FOLDERS.map(folder => {
                            const isSelected = selectedFolders.has(folder.id);
                            return (
                                <div
                                    key={folder.id}
                                    onClick={() => toggleFolder(folder.id)}
                                    style={{
                                        border: `1px solid ${isSelected ? 'var(--mlab-blue)' : '#cbd5e1'}`,
                                        background: isSelected ? '#eff6ff' : 'white',
                                        borderRadius: '8px', padding: '12px', cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', color: isSelected ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontWeight: 700, fontSize: '0.85rem' }}>
                                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} color="#94a3b8" />}
                                        {folder.label}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', paddingLeft: '24px', lineHeight: 1.4 }}>
                                        {folder.sub}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="wm-modal__footer" style={{ padding: '1rem 1.5rem', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isGenerating} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="wm-btn wm-btn--primary"
                        onClick={() => onGenerate(Array.from(selectedFolders))}
                        disabled={isGenerating || selectedFolders.size === 0}
                        style={{ padding: '8px 16px', background: 'var(--mlab-blue)', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: isGenerating || selectedFolders.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isGenerating || selectedFolders.size === 0 ? 0.7 : 1 }}
                    >
                        {isGenerating ? <><Loader2 className="wm-spin" size={16} /> Compiling Server-Side...</> : <><DownloadCloud size={16} /> Request Zip Generation</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};