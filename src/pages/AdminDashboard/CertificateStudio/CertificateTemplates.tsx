// src/pages/AdminDashboard/CertificateStudio/CertificateTemplates.tsx

import React from 'react';
import { Award } from 'lucide-react';

// ── LUXURY TEMPLATE ──────────────────────────────────────────────────────────
export const LuxuryTemplate = ({ data, finalType }: { data: any; finalType: string }) => (
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
                    {data.logoUrl && (
                        <img
                            src={data.logoUrl}
                            alt="Logo"
                            className="cert-logo"
                            crossOrigin="anonymous"
                        />
                    )}
                </div>
                <div className="cert-institution">
                    <h3>{data.institutionName}</h3>
                    <div className="cert-divider-diamond">
                        <span className="diamond" />
                    </div>
                </div>
            </header>

            <main className="cert-content">
                <div className="cert-pretitle">This is to certify that</div>
                <h1 className="cert-recipient-name">
                    {data.recipientName || '[Recipient Name]'}
                </h1>
                <div className="cert-description">{data.description}</div>
                <div className="cert-programme-name">
                    {data.programme || '[Event/Course Name]'}
                </div>

                <div className="cert-type-badge">
                    <span className="cert-type-text">
                        {finalType.includes('Award') ? 'Official' : 'Certificate of'}
                    </span>
                    <span className="cert-type-value">{finalType}</span>
                </div>
            </main>

            <footer className="cert-footer-new">
                <div className="cert-signature-block">
                    <div className="cert-signature-image-container">
                        {data.sigUrl && (
                            <img
                                src={data.sigUrl}
                                alt="Signature"
                                className="cert-signature-img"
                                crossOrigin="anonymous"
                            />
                        )}
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
                        {new Date(data.issueDate).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </div>
                    <div className="cert-signature-line" />
                    <div className="cert-date-label">Date of Issue</div>
                </div>
            </footer>
            <div className="cert-bottom-accent" />
        </div>
    </>
);

// ── OFFICIAL TEMPLATE ────────────────────────────────────────────────────────
export const OfficialTemplate = ({ data, finalType }: { data: any; finalType: string }) => (
    <div
        style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            position: 'relative',
            fontFamily: 'Arial, sans-serif',
            color: '#333',
        }}
    >
        <div style={{ display: 'flex', height: '12px', width: '100%' }}>
            <div style={{ flex: 1, backgroundColor: 'var(--mlab-blue)' }} />
            <div style={{ width: '150px', backgroundColor: 'var(--mlab-green)' }} />
        </div>

        <div
            style={{
                padding: '50px 80px',
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100% - 12px)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '2px solid var(--mlab-blue)',
                    paddingBottom: '20px',
                    marginBottom: '30px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {data.logoUrl && (
                        <img
                            src={data.logoUrl}
                            alt="Logo"
                            style={{ height: '70px', objectFit: 'contain' }}
                            crossOrigin="anonymous"
                        />
                    )}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <h2
                        style={{
                            margin: 0,
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--mlab-blue)',
                            fontSize: '24px',
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                        }}
                    >
                        {data.institutionName}
                    </h2>
                    <p
                        style={{
                            margin: '5px 0 0',
                            color: '#666',
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}
                    >
                        Official Statement of Award
                    </p>
                </div>
            </div>

            <div
                style={{
                    backgroundColor: 'var(--mlab-blue)',
                    color: 'white',
                    padding: '15px 30px',
                    display: 'inline-block',
                    alignSelf: 'flex-start',
                    marginBottom: '40px',
                    borderLeft: '6px solid var(--mlab-green)',
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontFamily: 'var(--font-heading)',
                        fontSize: '28px',
                        fontWeight: 'normal',
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                    }}
                >
                    {finalType}
                </h1>
            </div>

            <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', color: '#555', marginBottom: '10px' }}>
                    This document officially certifies that:
                </p>
                <h2
                    style={{
                        margin: '0 0 30px',
                        fontSize: '36px',
                        color: 'var(--mlab-blue)',
                        fontWeight: 'bold',
                    }}
                >
                    {data.recipientName || '[Recipient Name]'}
                </h2>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
                    <tbody>
                        <tr>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    width: '200px',
                                    fontWeight: 'bold',
                                    color: '#777',
                                    fontSize: '13px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Awarding Programme
                            </td>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '18px',
                                    color: 'var(--mlab-blue)',
                                    fontWeight: 'bold',
                                }}
                            >
                                {data.programme || '[Course Name]'}
                            </td>
                        </tr>
                        <tr>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    fontWeight: 'bold',
                                    color: '#777',
                                    fontSize: '13px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Description
                            </td>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '15px',
                                    color: '#333',
                                }}
                            >
                                {data.description}
                            </td>
                        </tr>
                        <tr>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    fontWeight: 'bold',
                                    color: '#777',
                                    fontSize: '13px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Date of Issue
                            </td>
                            <td
                                style={{
                                    padding: '15px 0',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '15px',
                                    color: '#333',
                                }}
                            >
                                {new Date(data.issueDate).toLocaleDateString('en-ZA', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginTop: 'auto',
                }}
            >
                <div style={{ width: '250px' }}>
                    <div
                        style={{
                            height: '70px',
                            display: 'flex',
                            alignItems: 'flex-end',
                            marginBottom: '10px',
                        }}
                    >
                        {data.sigUrl && (
                            <img
                                src={data.sigUrl}
                                alt="Signature"
                                crossOrigin="anonymous"
                                style={{
                                    height: 190,
                                    objectFit: 'contain',
                                    marginBottom: -70,
                                }}
                            />
                        )}
                    </div>
                    <div style={{ borderTop: '1px solid var(--mlab-blue)', paddingTop: '10px' }}>
                        <p
                            style={{
                                margin: 0,
                                fontWeight: 'bold',
                                color: 'var(--mlab-blue)',
                                fontSize: '14px',
                            }}
                        >
                            {data.signatoryName}
                        </p>
                        <p style={{ margin: '2px 0 0', color: '#777', fontSize: '12px' }}>
                            {data.signatoryTitle}
                        </p>
                    </div>
                </div>

                <div
                    style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        border: '2px dashed var(--mlab-green)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.5,
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <Award size={32} color="var(--mlab-blue)" style={{ margin: '0 auto' }} />
                        <div
                            style={{
                                fontSize: '8px',
                                fontWeight: 'bold',
                                color: 'var(--mlab-blue)',
                                marginTop: '4px',
                                letterSpacing: '1px',
                            }}
                        >
                            OFFICIAL
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// ── MODERN TEMPLATE ──────────────────────────────────────────────────────────
export const ModernTemplate = ({ data, finalType }: { data: any; finalType: string }) => (
    <div
        style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#f8fafc',
            position: 'relative',
            fontFamily: 'system-ui, sans-serif',
            display: 'flex',
        }}
    >
        <div
            style={{
                width: '280px',
                backgroundColor: 'var(--mlab-blue)',
                height: '100%',
                padding: '60px 40px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                color: 'white',
                boxSizing: 'border-box',
            }}
        >
            <div>
                {data.logoUrl && (
                    <img
                        src={data.logoUrl}
                        alt="Logo"
                        crossOrigin="anonymous"
                        style={{ height: '60px', objectFit: 'contain' }}
                    />
                )}
                <div
                    style={{
                        marginTop: '40px',
                        width: '40px',
                        height: '4px',
                        backgroundColor: 'var(--mlab-green)',
                    }}
                />
            </div>
            <div>
                <p
                    style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        opacity: 0.6,
                        margin: '0 0 5px',
                    }}
                >
                    Date Issued
                </p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 30px' }}>
                    {new Date(data.issueDate).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                    })}
                </p>
                <p
                    style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        opacity: 0.6,
                        margin: '0 0 5px',
                    }}
                >
                    Certificate ID
                </p>
                <p
                    style={{
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        opacity: 0.8,
                        margin: 0,
                    }}
                >
                    {Date.now().toString().slice(-8)}
                </p>
            </div>
        </div>

        <div
            style={{
                flex: 1,
                padding: '80px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    alignSelf: 'flex-end',
                    padding: '8px 16px',
                    backgroundColor: 'rgba(148, 199, 61, 0.1)',
                    color: 'var(--mlab-green-dark)',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                }}
            >
                {data.institutionName}
            </div>

            <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
                <p
                    style={{
                        fontSize: '16px',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '3px',
                        marginBottom: '10px',
                    }}
                >
                    Awarded To
                </p>
                <h1
                    style={{
                        fontSize: '56px',
                        color: 'var(--mlab-blue)',
                        margin: '0 0 20px',
                        lineHeight: 1.1,
                        letterSpacing: '-1px',
                    }}
                >
                    {data.recipientName || '[Recipient Name]'}
                </h1>

                <div
                    style={{
                        display: 'inline-block',
                        backgroundColor: 'var(--mlab-blue)',
                        color: 'white',
                        padding: '10px 20px',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                        marginBottom: '30px',
                    }}
                >
                    {finalType}
                </div>

                <p
                    style={{
                        fontSize: '18px',
                        color: '#475569',
                        lineHeight: 1.6,
                        maxWidth: '600px',
                        margin: '0 0 10px',
                    }}
                >
                    {data.description}
                </p>
                <p
                    style={{
                        fontSize: '22px',
                        color: 'var(--mlab-blue)',
                        fontWeight: 'bold',
                        margin: 0,
                    }}
                >
                    {data.programme || '[Event/Course Name]'}
                </p>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div style={{ width: '200px' }}>
                    {data.sigUrl && (
                        <img
                            src={data.sigUrl}
                            alt="Signature"
                            crossOrigin="anonymous"
                            style={{
                                height: 190,
                                objectFit: 'contain',
                                marginBottom: -70,
                            }}
                        />
                    )}
                    <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '10px' }}>
                        <p
                            style={{
                                margin: 0,
                                fontWeight: 'bold',
                                color: 'var(--mlab-blue)',
                                fontSize: '14px',
                            }}
                        >
                            {data.signatoryName}
                        </p>
                        <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12px' }}>
                            {data.signatoryTitle}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>
);