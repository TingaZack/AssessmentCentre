// src/components/views/PrivacyPolicy.tsx

import React from 'react';
import { ShieldCheck, Printer, ArrowLeft, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../../store/useStore'; // Adjust path if needed
import './PrivacyPolicy.css';

export const PrivacyPolicy: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { settings } = useStore();

    // Determine which document to show based on the URL path
    const isTerms = location.pathname.includes('terms');

    const handlePrint = () => {
        window.print();
    };

    // Dynamically get the current month and year
    const currentDate = new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

    // Pull the company name from Firebase settings, with a fallback
    const companyName = (settings as any)?.companyName || (settings as any)?.institutionName || 'mLab Southern Africa';
    const platformName = `${companyName} Digital Credential & Learner Management System`;

    return (
        <div style={{ height: '100vh', width: '100%', overflowY: 'auto', backgroundColor: '#ffffff' }}>
            <div className="mlab-privacy-wrapper" style={{ margin: '0 auto', }}>

                {/* STICKY HEADER */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: '#073f4e',
                    zIndex: 50,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    marginBottom: '2rem',
                    borderBottom: '1px solid #06313d',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: '#bae6fd', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}
                    >
                        <ArrowLeft size={18} /> Back
                    </button>
                    <button
                        onClick={handlePrint}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#ffffff', cursor: 'pointer', fontWeight: 500 }}
                    >
                        <Printer size={16} /> Print Document
                    </button>
                </div>

                {/* DOCUMENT HEADER */}
                <div style={{ textAlign: 'center', marginBottom: '3rem', padding: '0 16px' }}>
                    {isTerms ? (
                        <FileText size={48} color="#0ea5e9" style={{ marginBottom: '1rem' }} />
                    ) : (
                        <ShieldCheck size={48} color="#16a34a" style={{ marginBottom: '1rem' }} />
                    )}
                    <h1 style={{ color: '#0f172a', fontSize: '2rem', marginBottom: '0.5rem' }}>
                        {isTerms ? 'Terms & Conditions of Service' : 'Privacy Policy & POPIA Compliance'}
                    </h1>
                    <p style={{ color: '#64748b', margin: 0 }}><strong>Effective Date:</strong> {currentDate}</p>
                    <p style={{ color: '#64748b', margin: 0 }}><strong>Institution:</strong> {companyName}</p>
                    <p style={{ color: '#64748b', margin: 0 }}><strong>Platform:</strong> {platformName}</p>
                </div>

                {/* CONTENT BODY */}
                <div style={{ color: '#334155', lineHeight: '1.6', fontSize: '0.95rem', padding: '0 16px 32px 16px' }}>

                    {/* ========================================== */}
                    {/* TERMS & CONDITIONS             */}
                    {/* ========================================== */}
                    {isTerms ? (
                        <>
                            <p style={{ marginBottom: '1.5rem' }}>
                                Welcome to the {platformName}. These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("the Learner", "the User") and {companyName} ("we", "us", "our"). By registering an account, accessing the platform, or submitting academic work, you expressly acknowledge that you have read, understood, and agree to be bound by these Terms.
                            </p>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                1. User Accounts and Security
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>To access the full functionality of the Learner Management System (LMS), you must create and secure an account.</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Accurate Information:</strong> You agree to provide accurate, current, and complete demographic and identity information during registration. This data is strictly required for statutory reporting to the Quality Council for Trades and Occupations (QCTO), relevant SETAs, and the National Learner Records Database (NLRD).</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Account Security:</strong> You are strictly responsible for maintaining the confidentiality of your login credentials. You may not share your account, transfer access, or allow third parties to submit work on your behalf.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Unauthorized Access:</strong> You must immediately notify our support team if you suspect unauthorized use of your account. We reserve the right to suspend accounts suspected of being compromised.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                2. Academic Integrity and Conduct
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>{companyName} enforces a zero-tolerance policy regarding academic dishonesty to protect the integrity of our accredited qualifications.</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Plagiarism & Cheating:</strong> The submission of falsified Portfolios of Evidence (PoE), copying work from other learners, or contract cheating (paying someone to do your work) is strictly prohibited.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Artificial Intelligence:</strong> Unless explicitly permitted in an assessment brief, the use of generative AI tools to author submissions is considered academic misconduct.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Consequences of Breach:</strong> Violations of academic integrity will trigger an internal disciplinary review and may result in immediate suspension from the program, revocation of accumulated credits, and a formal report to the relevant statutory and assessing bodies.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                3. Acceptable Use of the Platform
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>When using the platform, you agree not to engage in any of the following prohibited activities:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}>Attempting to reverse-engineer, decompile, or hack any part of the platform, including the blockchain credentialing infrastructure.</li>
                                <li style={{ marginBottom: '0.5rem' }}>Uploading files that contain viruses, malware, or corrupted data that may damage the platform's servers.</li>
                                <li style={{ marginBottom: '0.5rem' }}>Using the platform to distribute spam, unsolicited communications, or content that is defamatory, discriminatory, or unlawful under South African law.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                4. Intellectual Property Rights
                            </h2>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Institution IP:</strong> All courseware, training materials, assessments, rubrics, video content, code, and platform interfaces are the exclusive intellectual property of {companyName} or its accredited partners. You may not distribute, reproduce, publicly display, or monetize any platform content without explicit written permission.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Learner IP:</strong> The intellectual property of the original work you produce and submit as part of your Portfolio of Evidence (PoE) remains yours. However, by uploading it to the platform, you grant us a perpetual, royalty-free license to store, evaluate, and share these submissions with internal assessors, external moderators, and statutory quality assurance bodies (e.g., QCTO).</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                5. Statutory Compliance and Certification
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>Please be aware of the following conditions regarding your official certification:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Third-Party Delays:</strong> Achieving a passing grade internally does not automatically guarantee instant certification. Official Statements of Results (SoR) and certificates require external verification by SETAs and the QCTO. We are not liable for any delays caused by these external statutory bodies.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Incomplete Profiles:</strong> Failure to provide requested statutory data (e.g., Certified ID copies, previous qualifications) may result in us being legally unable to register you for your External Integrated Summative Assessment (EISA) or process your graduation.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                6. Blockchain Credentialing
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>Upon successful completion and external moderation of an accredited program, you may be issued a blockchain-verified Statement of Results.</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Immutability:</strong> You acknowledge that blockchain records are immutable. While your personally identifiable information (PII) remains strictly off-chain to comply with POPIA, the cryptographic hash proving your qualification is permanent.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Revocation:</strong> In the event that a qualification is found to be issued in error, or if severe academic fraud is discovered post-graduation, {companyName} reserves the right to revoke the credential. This will immediately render the digital certificate invalid on the public verification portal.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                7. Platform Availability and Disclaimers
                            </h2>
                            <p style={{ marginBottom: '1rem' }}>The platform is provided on an "AS IS" and "AS AVAILABLE" basis.</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}>We make no warranties that the platform will be entirely error-free, uninterrupted, or perfectly secure at all times.</li>
                                <li style={{ marginBottom: '0.5rem' }}>We reserve the right to temporarily suspend access to the platform for scheduled maintenance, upgrades, or emergency security patches.</li>
                                <li style={{ marginBottom: '0.5rem' }}>It is your responsibility to maintain stable internet access and backup any work locally before submission. We are not liable for data loss occurring due to user connectivity drops during an assessment.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                8. Limitation of Liability
                            </h2>
                            <p style={{ marginBottom: '1.5rem' }}>
                                To the maximum extent permitted by applicable South African law, {companyName}, its directors, employees, and partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or career opportunities, resulting from (i) your access to or use of or inability to access or use the platform; (ii) any conduct or content of any third party on the platform; or (iii) unauthorized access, use, or alteration of your transmissions or content.
                            </p>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                9. Governing Law
                            </h2>
                            <p style={{ marginBottom: '1.5rem' }}>
                                These Terms shall be governed and construed in accordance with the laws of the Republic of South Africa, without regard to its conflict of law provisions. Any disputes arising from these terms will be subject to the exclusive jurisdiction of the South African courts.
                            </p>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                10. Amendments to Terms
                            </h2>
                            <p style={{ marginBottom: '1.5rem' }}>
                                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice via platform notification or email prior to any new terms taking effect. By continuing to access or use our platform after those revisions become effective, you agree to be bound by the revised terms.
                            </p>
                        </>
                    ) : (

                        /* ========================================== */
                        /* PRIVACY POLICY (POPIA)           */
                        /* ========================================== */
                        <>
                            <p style={{ marginBottom: '2rem' }}>
                                At {companyName}, we are committed to protecting your privacy and ensuring that your personal information is collected, processed, and stored in strict accordance with the <strong>Protection of Personal Information Act (POPIA) No. 4 of 2013</strong>.
                                This policy explains how our Digital Credential Platform handles your data, from your first day of enrollment to the day you receive your blockchain-verified Statement of Results.
                            </p>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                1. What Personal Information We Collect
                            </h2>
                            <p>To provide accredited training and issue legally recognized qualifications, we are required by law to collect specific data. This includes:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Standard Personal Data:</strong> Full name, Identity Number / Passport Number, contact details (email, mobile), and physical address.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Special Personal Information (Statutory Requirement):</strong> To comply with the Quality Council for Trades and Occupations (QCTO) and the National Learner Records Database (NLRD), we are legally mandated to collect demographic data including race, gender, socio-economic status, citizenship, and disability status/rating.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Academic Data:</strong> Your ongoing academic performance, formative and summative assessment marks, assessor feedback, and your uploaded Portfolios of Evidence (PoE).</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                2. Why We Collect Your Data (Purpose Specification)
                            </h2>
                            <p>We do not sell, rent, or trade your personal information. Your data is used exclusively for the following purposes:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Academic Administration:</strong> To enroll you in cohorts, assign you to facilitators, and evaluate your academic progress.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Statutory Reporting:</strong> To generate compliance reports (LEISA/EISA) required by the QCTO and relevant SETAs for your official national registration.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Certification:</strong> To generate your official Statement of Results (SoR) and secure your digital credential.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                3. How We Secure Your Data (Storage & Access)
                            </h2>
                            <p>Your data is stored in a highly secure, cloud-based infrastructure. We employ strict technical and organizational measures to prevent unauthorized access, loss, or data breaches:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Encryption:</strong> All data is encrypted both in transit (HTTPS/TLS) and at rest (AES-256) within our cloud database.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Role-Based Access Control (RBAC):</strong> Platform access is strictly limited by job function. For example, Assessors only have access to your academic submissions and feedback; they do not have access to your sensitive demographic data. Only authorized Super Administrators can view full profiles or execute data deletions.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Audit Trails:</strong> Every critical action taken on your profile (e.g., a grade change or a profile update) is permanently logged in our system with a timestamp and the staff member's ID to ensure total accountability.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                4. Blockchain Credentials & Your Privacy (The Web3 Framework)
                            </h2>
                            <p>{companyName} utilizes blockchain technology to issue tamper-proof certificates, ensuring your qualifications can never be forged. However, we have architected our system to protect your right to privacy on the public ledger:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Off-Chain Storage:</strong> Your actual personal information (Name, ID, Demographics) lives entirely <em>off-chain</em> in our encrypted private database.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>On-Chain Hashing:</strong> When your certificate is minted to the blockchain, the system only writes a "Cryptographic Hash" (a random string of letters and numbers representing the digital fingerprint of your certificate).</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Zero PII on the Blockchain:</strong> Absolutely no Personally Identifiable Information (PII) is exposed on the public blockchain. If your off-chain data is ever deleted, the hash on the blockchain becomes permanently orphaned and cannot be reverse-engineered to identify you.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                5. Data Retention & Archiving
                            </h2>
                            <p>The POPI Act requires that data only be kept as long as necessary. However, under QCTO regulations, accredited training providers are legally required to retain learner academic records and portfolios for extended periods (typically 5+ years) for national auditing purposes.</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Archiving:</strong> Once you graduate or leave the program, your profile will be securely "Archived." This restricts general staff access while preserving the data for mandatory government audits.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Permanent Deletion:</strong> When statutory retention periods expire, or upon a valid and legally cleared deletion request, your PII is permanently scrubbed from our active database, leaving only an anonymized audit ghost-record to prove compliance.</li>
                            </ul>

                            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                                6. Your Rights as a Data Subject
                            </h2>
                            <p>Under the POPI Act, you hold the following rights regarding your personal information:</p>
                            <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Right to Access:</strong> You may request a copy of the personal data we hold about you.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Right to Rectification:</strong> You may request that we correct any inaccurate or outdated information.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Right to Object:</strong> You may object to the processing of your personal information on reasonable legal grounds.</li>
                                <li style={{ marginBottom: '0.5rem' }}><strong>Right to be Forgotten:</strong> You may request the deletion of your data. <em>(Please note: Deletion requests are subject to our legal obligations to retain specific records under QCTO and SAQA legislation).</em></li>
                            </ul>
                        </>
                    )}

                    {/* SHARED CONTACT FOOTER */}
                    <h2 style={{ color: '#0f172a', fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: '2rem', marginBottom: '1rem' }}>
                        Contact Information
                    </h2>
                    <p style={{ marginBottom: '1rem' }}>
                        If you have any questions regarding these {isTerms ? 'Terms' : 'Policies'}, please contact our designated compliance team:
                    </p>
                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}><strong>Institution:</strong> {companyName}</p>
                        <p style={{ margin: '0 0 0.5rem 0' }}><strong>Email Address:</strong> info@mlab.co.za</p>
                    </div>

                    {!isTerms && (
                        <p style={{ fontStyle: 'italic', color: '#64748b', fontSize: '0.85rem' }}>
                            If you believe your data has been handled unlawfully, you also have the right to lodge a complaint with the South African Information Regulator at <a href="mailto:inforeg@justice.gov.za" style={{ color: '#0ea5e9' }}>inforeg@justice.gov.za</a>.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};