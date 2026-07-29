// src/components/admin/WorkplacesManager/TaxAdvisoryModal.tsx

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
    X, Landmark, Coins, FileText, ExternalLink, Youtube,
    CheckCircle2, AlertTriangle, ShieldCheck, DownloadCloud, BookOpen
} from "lucide-react";

interface TaxAdvisoryModalProps {
    companyName: string;
    onClose: () => void;
}

export const TaxAdvisoryModal: React.FC<TaxAdvisoryModalProps> = ({ companyName, onClose }) => {
    const [activeTab, setActiveTab] = useState<"eti" | "s12h" | "sars_links">("eti");

    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000 }}>
            <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh' }}>

                {/* Header */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Landmark size={18} /> SARS Tax Incentive Advisory & Claim Guide
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="lfm-body" style={{ flex: 1, overflowY: 'auto' }}>

                    {/* Intro Card */}
                    <div style={{ background: "var(--mlab-light-blue)", border: "1px solid var(--mlab-border)", borderLeft: "4px solid var(--mlab-blue)", padding: "1rem" }}>
                        <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "0.95rem", color: "var(--mlab-blue)", fontFamily: "var(--font-heading)", textTransform: "uppercase" }}>
                            Maximizing Tax Benefits for {companyName}
                        </h3>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#334155", lineHeight: 1.5 }}>
                            Placing youth learners and registered interns allows employers to significantly offset salary overheads through legal tax incentives granted under the <strong>Employment Tax Incentive (ETI) Act</strong> and <strong>Section 12H of the Income Tax Act</strong>.
                        </p>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="lfm-tabs">
                        <button type="button" className={`lfm-tab ${activeTab === 'eti' ? 'active' : ''}`} onClick={() => setActiveTab('eti')}>
                            <Coins size={14} /> ETI (PAYE Deduction)
                        </button>
                        <button type="button" className={`lfm-tab ${activeTab === 's12h' ? 'active' : ''}`} onClick={() => setActiveTab('s12h')}>
                            <ShieldCheck size={14} /> Section 12H Allowance
                        </button>
                        <button type="button" className={`lfm-tab ${activeTab === 'sars_links' ? 'active' : ''}`} onClick={() => setActiveTab('sars_links')}>
                            <ExternalLink size={14} /> Official SARS Downloads & Videos
                        </button>
                    </div>

                    {/* TAB 1: ETI GUIDE */}
                    {activeTab === 'eti' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
                            <div className="lfm-section-hdr"><Coins size={13} /> Employment Tax Incentive (ETI) Overview</div>

                            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                ETI reduces the cost of hiring young people (ages 18–29) by allowing the company to reduce the monthly <strong>PAYE tax bill</strong> paid to SARS via eFiling (EMP201 return) without reducing the intern's take-home pay.
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    How ETI Claims Work on Monthly Payroll:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <li><strong>1. Eligibility Check:</strong> Learner must possess a valid SA ID/passport and be between 18 and 29 years old.</li>
                                    <li><strong>2. Stipend Range:</strong> Monthly stipend must be between R2,000 and R6,500/month.</li>
                                    <li><strong>3. Payroll Offset:</strong> Claim up to <strong>R1,500/month per learner</strong> for the first 12 months, and <strong>R750/month</strong> for months 13–24.</li>
                                    <li><strong>4. EMP201 Filing:</strong> Enter total ETI calculated directly into your monthly SARS EMP201 return on eFiling.</li>
                                </ul>
                            </div>

                            <div style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: '0.85rem 1rem', fontSize: '0.78rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                                <span><strong>SARS Tax Compliance Rule:</strong> You cannot claim or deduct ETI if the company has outstanding tax returns or unpaid SARS balances. Resolving compliance unlocks all accumulated ETI claims.</span>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: SECTION 12H GUIDE */}
                    {activeTab === 's12h' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
                            <div className="lfm-section-hdr"><ShieldCheck size={13} /> Section 12H Income Tax Allowance</div>

                            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                Section 12H provides an <strong>additional tax deduction</strong> against Corporate Income Tax (IT14 return) for employers that enter into registered SETA learnerships or work-integrated learning agreements.
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem' }}>
                                    <div style={{ fontWeight: 800, color: '#166534', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Able-Bodied Learners
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', fontFamily: 'var(--font-heading)' }}>
                                        R80,000 Total
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '6px' }}>
                                        • R40,000 Commencement Allowance<br />
                                        • R40,000 Completion Allowance
                                    </div>
                                </div>

                                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '1rem' }}>
                                    <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Learners with Disability
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0284c7', fontFamily: 'var(--font-heading)' }}>
                                        R120,000 Total
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '6px' }}>
                                        • R60,000 Commencement Allowance<br />
                                        • R60,000 Completion Allowance
                                    </div>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Required Documents for SARS Section 12H Audit:
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
                                    1. Signed SETA Learnership Agreement.<br />
                                    2. Completed <strong>SARS IT180 Form</strong> (Declaration by Employer).<br />
                                    3. Proof of Completion / SETA Statement of Results (for completion allowance).
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: OFFICIAL LINKS & VIDEOS */}
                    {activeTab === 'sars_links' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
                            <div className="lfm-section-hdr"><ExternalLink size={13} /> Direct SARS Portals & Legal Guides</div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <a
                                    href="https://www.sars.gov.za/types-of-tax/pay-as-you-earn/employment-tax-incentive-eti/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.8rem' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <BookOpen size={16} color="var(--mlab-green-dark)" /> Official SARS ETI Information Portal
                                    </span>
                                    <ExternalLink size={14} color="#64748b" />
                                </a>

                                <a
                                    href="https://www.sars.gov.za/wp-content/uploads/Legal/Drafts/Legal-LPrep-Draft-2023-10-Draft-Guide-to-the-Employment-Tax-Incentive-Issue-5.pdf"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.8rem' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <DownloadCloud size={16} color="#0ea5e9" /> SARS Guide to Employment Tax Incentive (PDF)
                                    </span>
                                    <ExternalLink size={14} color="#64748b" />
                                </a>

                                <a
                                    href="https://www.sars.gov.za/wp-content/uploads/Ops/Guides/LAPD-IT-G09-Guide-on-the-Tax-Incentive-for-Learnership-Agreements.pdf"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.8rem' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <DownloadCloud size={16} color="#0ea5e9" /> SARS Section 12H Learnership Guide (PDF)
                                    </span>
                                    <ExternalLink size={14} color="#64748b" />
                                </a>

                                <a
                                    href="https://www.sars.gov.za/wp-content/uploads/Ops/Forms/IT180-Declaration-by-Employer-to-Claim-Deduction-against-Learnerships-External-Form.pdf"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.8rem' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={16} color="#16a34a" /> Official SARS IT180 Tax Declaration Form (PDF)
                                    </span>
                                    <ExternalLink size={14} color="#64748b" />
                                </a>
                            </div>

                            <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><Youtube size={13} color="#dc2626" /> Video Tutorials</div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <a
                                    href="https://www.youtube.com/watch?v=wG8f64dHCPI"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: '#991b1b', fontWeight: 700, fontSize: '0.8rem' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Youtube size={16} color="#dc2626" /> Video: Step-by-Step ETI Payroll Setup & SARS EMP201 Claim
                                    </span>
                                    <ExternalLink size={14} color="#dc2626" />
                                </a>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={onClose}>
                        Close Tax Guide
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};