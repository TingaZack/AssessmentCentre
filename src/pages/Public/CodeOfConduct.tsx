import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Printer, ArrowLeft, FileText, List, ChevronRight, Info } from 'lucide-react';
import mLabLogo from '../../assets/logo/mlab_logo_white.png';
import { useStore } from '../../store/useStore';

/* 
  -----------------------------------------------------------------------------------
  TODO: DYNAMIC MARKDOWN MIGRATION
  In a future iteration, replace this static JSX layout with dynamic Markdown rendering
  (e.g., using `react-markdown` or `remark`). The .md file will be fetched from 
  Firebase Storage or a CMS endpoint to allow non-technical updates.
  -----------------------------------------------------------------------------------
*/

interface TocItem {
    id: string;
    title: string;
}

const TOC_SECTIONS: TocItem[] = [
    { id: 'introduction', title: 'Introduction' },
    { id: 'compliance-with-laws', title: 'Compliance with Laws' },
    { id: 'standards-of-conduct', title: 'Standards of Conduct' },
    { id: 'internet-and-network-usage', title: 'Internet and network usage' },
    { id: 'use-of-developers-resources', title: 'Use of developer’s resources' },
    { id: 'maintenance-and-abuse', title: 'Maintenance and abuse of mLab computers' },
    { id: 'harassment-and-discrimination', title: 'Training environment free of harassment and discrimination' },
    { id: 'smoking', title: 'Smoking' },
    { id: 'firearms-and-weapons', title: 'Firearms and weapons' },
    { id: 'substance-abuse', title: 'Substance Abuse' },
    { id: 'gambling', title: 'Gambling' },
    { id: 'visitors', title: 'Visitors in the training facility' },
    { id: 'plagiarism-and-copyright', title: 'Plagiarism and Copyright Infringement' },
    { id: 'academic-standards', title: 'Attaining the academic standards of the mLab CodeTribe Academy' },
    { id: 'contagious-diseases', title: 'Treatment for contagious or infectious diseases' },
    { id: 'termination-actions', title: 'Actions that may result in termination of the study contract' },
    { id: 'intellectual-property', title: 'Assignment of Intellectual property to mLab' },
    { id: 'waivers', title: 'Waivers of the Code of Conduct' },
    { id: 'acknowledgement-signature', title: 'Trainee Acknowledgement & Signature' }
];

export const CodeOfConduct: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useStore() as any;
    const [activeSection, setActiveSection] = useState<string>('introduction');

    // 🚀 AUTOMATIC IFRAME & EMBED DETECTION (PREVENTS TOC SIDEBAR STACKING)
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    const isEmbed = isIframe || new URLSearchParams(location.search).get('mode') === 'embed';

    // Check digital signature status from active store session
    const isSigned = user?.demographics?.popiActAgree === 'Y' || user?.popiaConsent === true;
    const rawSignedDate = user?.demographics?.popiActDate || user?.updatedAt;

    const signatureUrl = useMemo(() => {
        if (!user) return null;
        return (
            user?.signatureUrl ||
            user?.demographics?.signatureUrl ||
            user?.uploadedDocuments?.find((d: any) => d.id === 'signature' || d.name?.toLowerCase().includes('signature'))?.url ||
            null
        );
    }, [user]);

    const formattedSignDate = useMemo(() => {
        if (!rawSignedDate) return new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
        if (typeof rawSignedDate === 'string' && rawSignedDate.length === 8) {
            const y = rawSignedDate.substring(0, 4);
            const m = rawSignedDate.substring(4, 6);
            const d = rawSignedDate.substring(6, 8);
            return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return new Date(rawSignedDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
    }, [rawSignedDate]);

    const handleScrollTo = (id: string) => {
        setActiveSection(id);
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Shared Document Render Function
    const renderDocumentBody = () => (
        <article style={{ fontSize: '0.92rem', lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* 1. INTRODUCTION */}
            <section id="introduction" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Introduction
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    mLab SA seeks to conduct business in an ethical, responsible manner, build relationships of trust and instill confidence in the organisation to deliver on its mandate. Trainees of any mLab programmes are custodians of mLab’s reputation and are therefore expected to conduct themselves in an honourable manner. This Code of Conduct is intended to help trainees understand their ethical and legal obligations, as well as acceptable behaviour as it applied to the mLab CodeTribe Academy.
                </p>
                <p style={{ margin: 0 }}>
                    Although this Code of Conduct does not cover every issue that may possibly arise, it is intended to establish guidelines to which trainees may refer in situations where the proper course of action may not be entirely clear. The guidelines set out in this Code of Conduct are mandatory and, as such, must be always observed.
                </p>
            </section>

            {/* 2. COMPLIANCE WITH LAWS */}
            <section id="compliance-with-laws" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Compliance with Laws
                </h2>
                <p style={{ margin: 0 }}>
                    mLab and its beneficiaries must comply with all local, national, international, or foreign laws or regulations, that apply to mLab’s business. Ignorance of the law is generally not considered a valid defence when an infraction is committed, thus any areas of uncertainty should be clarified by liaising with the CodeTribe Facilitator or by seeking appropriate guidance from mLab management.
                </p>
            </section>

            {/* 3. STANDARDS OF CONDUCT */}
            <section id="standards-of-conduct" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Standards of Conduct
                </h2>
                <p style={{ margin: 0 }}>
                    The CodeTribe rules and standards of conduct for are important and are regarded seriously. Trainees are urged to familiarise themselves with these rules and standards and to follow the rules and standards faithfully whilst participating in the mLab CodeTribe Academy. A learner who deviates from these rules and standards will be subject to corrective action, up to and including termination of contract.
                </p>
            </section>

            {/* 4. INTERNET AND NETWORK USAGE */}
            <section id="internet-and-network-usage" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Internet and network usage
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    It is mLab’s policy to maintain access for its community to local, national, and international sources of information and to provide an environment that encourages the free exchange of ideas and sharing of information. Access to this environment and the mLab information technology resources is a privilege and must be treated with the highest standard of ethics.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    mLab provides trainees with a network connection and Internet access (at the mLab facility only). This policy governs all use of the mLab network, Internet access, whether for electronic mail, chat rooms, Internet browsing, newsgroups, or electronic bulletin boards.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    mLab expects all trainees to use computing and information technology resources in a responsible manner, to respect the public trust through which these resources have been provided, the rights and privacy of others, the integrity of facilities and controls, and all pertinent laws and mLab policies and standards.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    The mLab data network is a shared resource that must be preserved for the common use of the mLab community. Network bandwidth, both internal and external, is maintained and provided to accommodate the broad business purposes of mLab.
                </p>
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                    All computers connected to the mLab network are classified according to the following definitions and guidelines regarding bandwidth utilisation:
                </p>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
                    <li style={{ marginBottom: '6px' }}><strong>Excessive use</strong> – High bandwidth utilisation by one or more computers or network devices, either transient or sustained, which degrades network performance and effectively degenerates, prevents or inhibits legitimate business activities.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Incidental use</strong> – Low bandwidth utilisation of a shared resource by one or more computers or network devices that, when aggregated over a proscribed sampling period, is in the bottom quartile of devices sharing that same resource.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Business use</strong> – Bandwidth utilisation that, directly or indirectly, contributes to the normal business activities of mLab SA.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Personal use</strong> - Bandwidth utilisation that cannot be categorised as business use.</li>
                </ul>
                <p style={{ margin: '0 0 12px 0' }}>
                    During normal training hours, users are required to restrict their browsing consumption to 10-15Mb local and 8-10Mb international. This is usually more than sufficient for browsing, but restricts the downloading of large files, streaming of sound and video, or any other activity that involves the transfer of large amounts of data.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    To ensure access to finite resources such as Internet connections, mLab reserves the right to monitor bandwidth usage characteristics. When necessary, mLab will communicate with the learner that is associated with a computer/s that has displayed bandwidth usage characteristics that appear to violate the above guidelines and may take the necessary steps to curb excessive use. Access to the network and Internet are for official training purposes only.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Trainees do not have any expectation of privacy regarding any information created, sent, or received via the network or Internet. This includes all e-mail messages and all electronic files. mLab reserves the right to, at any time and without notice, access, read and review, monitor, and copy all messages and files on its computer system, as it deems necessary. When considered necessary, mLab may disclose text or images to law enforcement agencies or other third parties without obtaining the Learner’s consent.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Alternative Internet Service Provider connections to the mLab internal network are not permitted unless expressly authorised, in writing, by mLab and must be properly protected by a firewall or other appropriate security device(s).
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Trainees are reminded that information obtained from the Internet is not always reliable and should be verified by a reliable source for accuracy before it is used.
                </p>

                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>Trainees may not use the mLab network or Internet access for any of the following:</p>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
                    <li>Downloading of any software without the prior written approval of mLab management.</li>
                    <li>Dissemination or printing of copyrighted materials, including articles and software, in violation of copyright laws.</li>
                    <li>Sending, receiving, printing, or otherwise disseminating proprietary data, trade secrets, or other confidential information of mLab in violation of company policy or written agreements.</li>
                    <li>Operating a business, usurping business opportunities, soliciting money for personal gain or searching for jobs outside mLab’s business.</li>
                    <li>Offensive or harassing statements or language including ridiculing others based on their race, color, religion, national origin, disability, age, sex, or sexual orientation, etc.</li>
                    <li>Sending or soliciting politically oriented messages or images.</li>
                    <li>Sending or soliciting sexually oriented messages or images.</li>
                    <li>Visiting sites featuring pornography, terrorism, espionage, theft, or controlled or illegal substances.</li>
                    <li>Gambling or engaging in any other activity in violation of the law.</li>
                    <li>Unethical activities or content, or activities or content that could damage mLab’s professional reputation.</li>
                </ul>

                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>Trainees must abide by the following:</p>
                <ul style={{ margin: '0 0 12px 0', paddingLeft: '24px' }}>
                    <li>Files that are downloaded from the Internet must be scanned with virus detection software before installing or execution. All appropriate precautions should be taken to detect a virus and, if necessary, to prevent its spread.</li>
                    <li>Trainees shall not place mLab material (copyrighted software, internal correspondence, etc.) on any publicly accessible Internet computer without proper permission.</li>
                    <li>Unless otherwise noted, all software on the Internet should be considered copyrighted work. Therefore, trainees are prohibited from downloading software and/or modifying any such files without permission from the copyright holder.</li>
                    <li>The Internet does not guarantee the privacy and confidentiality of information. Sensitive material transferred over the Internet may be at risk of detection by a third party. Therefore, trainees must exercise caution and care when transferring such material in any form.</li>
                    <li>Others may consider infringing activities by a learner as being the responsibility of mLab. Therefore, trainees can be held liable for their actions and mLab reserves the right to inspect a Learner’s computer system for violations of this policy.</li>
                </ul>
                <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
                    Any trainees that are found guilty of a violation of this policy or uses the mLab network or Internet access for improper purposes, shall be subject to termination of their contract with mLab.
                </p>
            </section>

            {/* 5. USE OF DEVELOPER'S RESOURCES */}
            <section id="use-of-developers-resources" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Use of developer’s resources.
                </h2>
                <p style={{ margin: 0 }}>
                    mLab SA possess licenses to a variety of developer’s resources. Trainees who access these resources must at all times do so in accordance with the stipulations of the relevant license agreements. Any infringement of such license agreements will lead to immediate action, including possible termination of the training contract with mLab.
                </p>
            </section>

            {/* 6. MAINTENANCE AND ABUSE OF MLAB COMPUTERS */}
            <section id="maintenance-and-abuse" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Maintenance and abuse of mLab computers
                </h2>
                <p style={{ margin: 0 }}>
                    Maintenance of mLab computers and network is outsourced. Trainees may not change any component of a mLab computer and will be held liable for any damages incurred, if found responsible of abusing mLab computers or related information technology equipment.
                </p>
            </section>

            {/* 7. TRAINING ENVIRONMENT FREE OF HARASSMENT AND DISCRIMINATION */}
            <section id="harassment-and-discrimination" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Training environment free of harassment and discrimination
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    mLab is committed to providing a training environment that is free of discrimination and unlawful harassment. Actions, words, jokes or comments based on an individual’s gender, race, ethnicity, age, religion or any other legally protected characteristic will not be tolerated.
                </p>
                <p style={{ margin: 0 }}>
                    Any learner that believes that s/he had been the victim of harassment, or who know of another learner who has, should report it to mLab management immediately. Trainees can raise concerns and make reports without fear of reprisal.
                </p>
            </section>

            {/* 8. SMOKING */}
            <section id="smoking" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Smoking
                </h2>
                <p style={{ margin: 0 }}>
                    mLab is a designated NON-SMOKING facility; however, there are smoking areas located outside the building.
                </p>
            </section>

            {/* 9. FIREARMS AND WEAPONS */}
            <section id="firearms-and-weapons" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Firearms and weapons
                </h2>
                <p style={{ margin: 0 }}>
                    No firearms and weapons of any kind are allowed on the mLab premises.
                </p>
            </section>

            {/* 10. SUBSTANCE ABUSE */}
            <section id="substance-abuse" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Substance Abuse
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    mLab is committed to providing a safe and productive training facility for its trainees and staff. In keeping with this commitment, the following rules regarding the use of alcohol and drugs or abuse thereof have been established for all individuals, while they are on mLab premises or elsewhere on mLab related training activities:
                </p>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
                    <li>The use of alcohol is prohibited on the mLab premises. However, alcoholic beverages may be served at special events, subject to prior approval by mLab management.</li>
                    <li>The manufacture, distribution, possession, sale, or purchase of controlled substances or drug paraphernalia on mLab property is prohibited.</li>
                    <li>Being under the influence of illegal drugs, alcohol, or other substances on mLab property is prohibited.</li>
                    <li>Attending classes while under the influence of prescription drugs that impair performance or judgment is prohibited.</li>
                </ul>
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                    So that there is no question about what these rules signify, please note the following definitions:
                </p>
                <ul style={{ margin: 0, paddingLeft: '24px' }}>
                    <li style={{ marginBottom: '6px' }}><strong>mLab property:</strong> All mLab owned or leased property.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Controlled substances:</strong> Any substance listed as such by the relevant authorities.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Drug:</strong> Any chemical substance that produces physical, mental, emotional or behavioural change in the user.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Drug paraphernalia:</strong> Equipment, products or materials that are used or intended for use in concealing an illegal drug, or otherwise introducing into the human body an illegal drug or controlled substance.</li>
                    <li style={{ marginBottom: '6px' }}>
                        <strong>Illegal drug:</strong>
                        <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
                            <li>Any drug or derivative thereof whose use, possession, sale, transfer, attempted sale or transfer, manufacture, or storage is illegal.</li>
                            <li>Any drug, including – but not limited to – a prescription drug, used for any reason other than that prescribed by a physician.</li>
                            <li>Inhalants used illegally.</li>
                        </ul>
                    </li>
                    <li style={{ marginBottom: '6px' }}><strong>Under the influence:</strong> A state of not having the normal use of mental or physical faculties resulting from the voluntary introduction into the body of an alcoholic beverage, drug, or substance of abuse.</li>
                </ul>
            </section>

            {/* 11. GAMBLING */}
            <section id="gambling" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Gambling
                </h2>
                <p style={{ margin: 0 }}>
                    Gambling shall not be permitted on the mLab premises.
                </p>
            </section>

            {/* 12. VISITORS IN THE TRAINING FACILITY */}
            <section id="visitors" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Visitors in the training facility
                </h2>
                <p style={{ margin: 0 }}>
                    To provide for the safety and security of trainees and staff using the facilities at mLab, only authorised visitors are permitted onto the premises. Restricting unauthorised visitors helps ensure security, decreases insurance liability, protects confidential information, safeguards welfare and avoids potential distractions and disturbances. Only authorised visitors will be escorted to their destination and must thereafter be always accompanied by an mLab representative.
                </p>
            </section>

            {/* 13. PLAGIARISM AND COPYRIGHT INFRINGEMENT */}
            <section id="plagiarism-and-copyright" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Plagiarism and Copyright Infringement
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    All academic work, written or otherwise, submitted by a student is expected to be the result of his/her own skill and labour. Where a student’s work is not authentically his/her own, such work does not qualify as an academic output, whether this is in relation to a project, an assignment, research, or exam, and any such transgression will be viewed as plagiarism, which is defined as the appropriation of another's work, whether intentionally or unintentionally, without proper acknowledgement.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Any form of plagiarism by stating, or implying, original authorship of someone else's written or creative work (words, images, ideas, opinions, discoveries, recordings, computer- generated work, code, etc.), and/or by incorporating such work or material, in whole or in part, into his/her own work without properly acknowledging or citing the source. Should a student be found guilty of plagiarism, this shall lead to the termination of the study contract.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Our trainees are expected to uphold high ethical standards and to give us the power to act in cases where contraventions of ethical academic standards occur. We also wish to inform our trainees of the rights of copyright holders and to provide them with guidelines for ethical research and study practices.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Plagiarism amounts to academic dishonesty, which is unethical conduct that undermines the credibility of your work and is a negation of sound academic practice. No value is added if copyright is infringed or where unethical research practices are used. Material gained through dishonesty adds nothing to existing knowledge, as there is obviously no growth in the independence of the writer’s intellectual involvement, and his/her academic integrity is compromised.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                    Unethical use of another person’s work for research or study purposes may, in addition to the infringement of the copyright owner’s economic rights, also infringe the author’s moral rights and constitute a criminal offence.
                </p>
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                    The following will amount to the infringement of an author’s moral rights, and will be copyright infringement as well:
                </p>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
                    <li>failure to acknowledge the author where phrases or passages are taken word-for-word from a published or unpublished text.</li>
                    <li>use of a summary of a work which contains the ideas of others and presents the essence of an argument in language that condenses and compresses the original language of the source without acknowledging the author of the work.</li>
                    <li>using the cut-and-paste method, where pieces of other persons’ work, including those taken from the internet, are blended with one’s own words and phrases without acknowledging the author of the source work.</li>
                </ul>
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                    Dishonest practices may also amount to criminal offences, such as fraud, theft and criminal copyright liability. Such dishonest practices include the following:
                </p>
                <ul style={{ margin: 0, paddingLeft: '24px' }}>
                    <li>copying information from another person (e.g., another learner’s assignment, project or exam) and submitting identical work where such work is not the result of teamwork and indicated as such by all participants.</li>
                    <li>asking someone else to do an assignment or project or sit for an exam on one’s behalf.</li>
                </ul>
            </section>

            {/* 14. ATTAINING THE ACADEMIC STANDARDS */}
            <section id="academic-standards" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Attaining the academic standards of the mLab CodeTribe Academy
                </h2>
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>These include the following:</p>
                <ul style={{ margin: '0 0 12px 0', paddingLeft: '24px' }}>
                    <li>Attend at least 90% of all classes and where this is not possible, to provide a legitimate reason and/or sick certificate to the facilitator.</li>
                    <li>Hand in at least 90% of all assignments on time</li>
                    <li>Achieve a minimum level of competence to graduate.</li>
                </ul>
                <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
                    Failure to adhere to bullets 1 and 2 above, will result in forfeiture of the study support for the following quarter and may lead to termination from the Academy.
                </p>
            </section>

            {/* 15. TREATMENT FOR CONTAGIOUS OR INFECTIOUS DISEASES */}
            <section id="contagious-diseases" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Treatment for contagious or infectious diseases
                </h2>
                <p style={{ margin: 0 }}>
                    If a learner suspects that s/he has an infectious or contagious disease they must get medical assistance immediately, must withdraw from all mLab training activities and must take all other steps to make sure that they do not infect other trainees or staff.
                </p>
            </section>

            {/* 16. ACTIONS THAT MAY RESULT IN TERMINATION */}
            <section id="termination-actions" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Actions that may result in termination of the study contract
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    While not intended to list all the forms of behaviour that are considered unacceptable in the mLab training facility, the following are examples of rule infractions or misconduct that may result in corrective action, including termination of the study contract:
                </p>
                <ul style={{ margin: 0, paddingLeft: '24px' }}>
                    <li style={{ marginBottom: '6px' }}>Theft or inappropriate removal or possession of property.</li>
                    <li style={{ marginBottom: '6px' }}>Working under the influence of alcohol or illegal drugs (See Substance Abuse).</li>
                    <li style={{ marginBottom: '6px' }}>Possession, distribution, sale, transfer, or use of alcohol, controlled substances or illegal drugs in the workplace (See substance abuse).</li>
                    <li style={{ marginBottom: '6px' }}>Fighting or threatening violence whilst on mLab property.</li>
                    <li style={{ marginBottom: '6px' }}>Overly boisterous or disruptive activity in the training facility.</li>
                    <li style={{ marginBottom: '6px' }}>Negligence or improper conduct leading to damage of mLab owned or customer-owned property.</li>
                    <li style={{ marginBottom: '6px' }}>Violation of safety or health rules.</li>
                    <li style={{ marginBottom: '6px' }}>Smoking in the facility.</li>
                    <li style={{ marginBottom: '6px' }}>Sexual or other unlawful or unwelcome harassment.</li>
                    <li style={{ marginBottom: '6px' }}>Unauthorised use of telephones, or other mLab owned equipment.</li>
                    <li style={{ marginBottom: '6px' }}>Unauthorised disclosure of mLab trade secrets or confidential information.</li>
                    <li style={{ marginBottom: '6px' }}>Acts in a dishonest manner or attempts to act in a dishonest manner, which includes any form of conduct involving deception, for example theft, unauthorised possession of property, bribery, fraud, forgery or giving false or misleading statements.</li>
                    <li style={{ marginBottom: '6px' }}>Accepts or attempts to obtain any benefit or information or access to information in an inappropriate manner, which may place any learner in an advantageous position academically in relation to other students in any manner whatsoever.</li>
                    <li style={{ marginBottom: '6px' }}>Assists or encourages another student to commit an act which constitutes misconduct.</li>
                </ul>
            </section>

            {/* 17. ASSIGNMENT OF INTELLECTUAL PROPERTY */}
            <section id="intellectual-property" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Assignment of Intellectual property to mLab
                </h2>
                <p style={{ margin: '0 0 12px 0' }}>
                    By signing the mLab study contract, you assign to mLab all intellectual property rights in any work you create during your training. This includes assignments, assessment scripts, personal class notes, presentations, recordings, software, hardware, data or databases or any other work created, adapted or amended by you.
                </p>
                <p style={{ margin: 0 }}>
                    The intellectual property in these works belong to mLab and the learner may not share or allow others to copy or distribute these works or infringe the intellectual property rights of mLab in any manner, without the express permission of mLab management.
                </p>
            </section>

            {/* 18. WAIVERS OF THE CODE OF CONDUCT */}
            <section id="waivers" className="coc-section" style={{ scrollMarginTop: '100px' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Waivers of the Code of Conduct
                </h2>
                <p style={{ margin: 0 }}>
                    A waiver of any provision of this Code of Conduct will only be granted if it is deemed appropriate under the circumstances. Any waiver of provisions of this Code of Conduct for trainees will only be granted by the Board of Directors of mLab or a duly authorised committee of the Board.
                </p>
            </section>

            {/* 19. ACKNOWLEDGEMENT & SIGNATURE FORM WITH DYNAMIC AUDIT VERIFICATION */}
            <section id="acknowledgement-signature" className="coc-section" style={{ scrollMarginTop: '100px', marginTop: '16px', background: '#f8fafc', padding: '24px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                <h2 style={{ fontSize: '1.1rem', color: '#0f172a', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="var(--mlab-blue)" /> Trainee Policy Acknowledgement
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '20px' }}>
                    By executing this document or checking the digital PoPIA/Code of Conduct consent box in your Learner Portal setup, you acknowledge that you have read, understood, and agreed to abide by all the provisions of this Code of Conduct.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Full Trainee Name</label>
                        <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '4px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                            {user?.fullName || '_________________________________'}
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Date Signed</label>
                        <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '4px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                            {isSigned ? formattedSignDate : 'Pending Profile Completion'}
                        </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Signature Audit Verification</label>
                        <div style={{
                            background: isSigned ? '#f0fdf4' : 'white',
                            border: `1px ${isSigned ? 'solid #bbf7d0' : 'dashed #94a3b8'}`,
                            padding: '16px 24px',
                            borderRadius: '4px',
                            textAlign: 'center',
                            color: isSigned ? '#15803d' : '#64748b',
                            fontSize: '0.85rem',
                            fontWeight: 700
                        }}>
                            {signatureUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <img
                                        src={signatureUrl}
                                        alt="Trainee Digital Signature"
                                        style={{ maxHeight: '60px', objectFit: 'contain', filter: 'contrast(120%)' }}
                                        crossOrigin="anonymous"
                                    />
                                    <div style={{ fontSize: '0.7rem', color: '#166534', fontFamily: 'monospace', fontWeight: 700 }}>
                                        ✓ Digitally Signed by {user?.fullName || 'Trainee'} on {formattedSignDate}
                                    </div>
                                </div>
                            ) : isSigned ? (
                                <div>
                                    <div style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                        ✓ Digitally Signed &amp; Timestamped
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#166534', fontFamily: 'monospace' }}>
                                        Audit UID: {user?.uid} | Status: VALIDATED_QMS_LEDGER
                                    </div>
                                </div>
                            ) : (
                                'Digitally Recorded & Signed via mLab QMS Ledger upon Profile Completion'
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </article>
    );

    // 🚀 CLEAN EMBED RENDER (Used inside the iframe inside MandatoryPolicyModal)
    if (isEmbed) {
        return (
            <div style={{ background: 'white', padding: '24px 20px', color: '#334155', fontFamily: 'var(--font-body, system-ui, sans-serif)', boxSizing: 'border-box' }}>
                <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '28px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <ShieldCheck size={16} /> Mobile Applications Laboratory NPC (mLab)
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', color: '#0f172a', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                        Code of Conduct for CodeTribe Trainees
                    </h1>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>Mobile Applications Laboratory NPC | Reg: 2011/149875/08</p>
                        <p style={{ margin: 0 }}>The Loft, Block C, 2nd Floor, The Village Office Park, Faerie Glen, Pretoria.</p>
                    </div>
                </div>
                {renderDocumentBody()}
            </div>
        );
    }

    // 🚀 STANDALONE PAGE RENDER (Used when accessing /code-of-conduct directly)
    return (
        <div className="coc-wrapper">
            <style>{`
                html, body, #root, .App {
                    width: 100% !important;
                    min-height: 100vh !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background-color: #f8fafc !important;
                    overflow-x: hidden !important;
                }

                .coc-wrapper {
                    position: fixed;
                    inset: 0;
                    width: 100vw;
                    height: 100vh;
                    overflow-y: auto;
                    overflow-x: hidden;
                    background-color: #f8fafc;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    color: #334155;
                    font-family: var(--font-body, system-ui, sans-serif);
                    box-sizing: border-box;
                }

                .coc-layout {
                    width: 100%;
                    max-width: 1400px;
                    margin: 0 auto;
                    padding: 24px 32px 64px 32px;
                    box-sizing: border-box;
                    display: grid;
                    grid-template-columns: 280px 1fr;
                    gap: 28px;
                    align-items: start;
                    flex: 1;
                }

                .coc-sidebar {
                    position: sticky !important;
                    top: 88px !important;
                    align-self: start !important;
                    z-index: 10;
                }

                @media (max-width: 900px) {
                    .coc-layout {
                        grid-template-columns: 1fr;
                        padding: 16px;
                    }
                    .coc-sidebar {
                        position: relative !important;
                        top: 0 !important;
                    }
                }

                @media print {
                    header, .coc-sidebar, .coc-action-btn, .coc-dev-note { display: none !important; }
                    .coc-layout { display: block !important; padding: 0 !important; }
                    .coc-document { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
                    .coc-wrapper { position: relative !important; height: auto !important; background: white !important; }
                    .coc-section { page-break-inside: avoid; }
                }
            `}</style>

            {/* STICKY TOP HEADER */}
            <header style={{ background: 'var(--mlab-midnight, #0f172a)', color: 'white', padding: '16px 24px', borderBottom: '3px solid var(--mlab-green, #16a34a)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={mLabLogo} alt="mLab Logo" height={36} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '12px' }}>
                        CodeTribe Academy Policies
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handlePrint}
                        className="coc-action-btn"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 14px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Printer size={14} /> Print / Save PDF
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="coc-action-btn"
                        style={{ background: 'var(--mlab-blue, #0284c7)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                </div>
            </header>

            {/* FULL-WIDTH FLUID LAYOUT CONTAINER */}
            <div className="coc-layout">

                {/* HANGING (STICKY) TABLE OF CONTENTS SIDEBAR */}
                <aside
                    className="coc-sidebar"
                    style={{
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '20px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                >
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue, #0284c7)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <List size={16} /> Table of Contents
                    </div>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {TOC_SECTIONS.map((item, idx) => {
                            const isActive = activeSection === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleScrollTo(item.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        textAlign: 'left',
                                        background: isActive ? '#f0f9ff' : 'transparent',
                                        color: isActive ? 'var(--mlab-blue, #0284c7)' : '#475569',
                                        border: 'none',
                                        borderLeft: isActive ? '3px solid var(--mlab-blue, #0284c7)' : '3px solid transparent',
                                        padding: '8px 10px',
                                        fontSize: '0.78rem',
                                        fontWeight: isActive ? 800 : 500,
                                        cursor: 'pointer',
                                        borderRadius: '0 4px 4px 0',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {idx + 1}. {item.title}
                                    </span>
                                    {isActive && <ChevronRight size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />}
                                </button>
                            );
                        })}
                    </nav>

                    {/* FUTURE MARKDOWN NOTICE (DEV ONLY) */}
                    {process.env.NODE_ENV === 'development' && (
                        <div className="coc-dev-note" style={{ background: '#eff6ff', border: '1px dashed #3b82f6', color: '#1d4ed8', padding: '10px 12px', borderRadius: '4px', fontSize: '0.75rem', marginTop: '20px', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.4 }}>
                            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span><strong>Developer Note:</strong> Content is currently hardcoded. A future update will load and parse dynamic Markdown content automatically.</span>
                        </div>
                    )}
                </aside>

                {/* MAIN POLICY DOCUMENT CONTAINER */}
                <main className="coc-document" style={{ background: 'white', padding: '48px 56px', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '24px', marginBottom: '36px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <ShieldCheck size={16} /> Mobile Applications Laboratory NPC (mLab)
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.1rem', color: '#0f172a', margin: '0 0 12px 0', textTransform: 'uppercase' }}>
                            Code of Conduct for CodeTribe Trainees
                        </h1>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                            <p style={{ margin: 0, fontWeight: 700 }}>Mobile Applications Laboratory NPC | Reg: 2011/149875/08</p>
                            <p style={{ margin: 0 }}>The Loft, Block C, 2nd Floor, The Village Office Park, Faerie Glen, Pretoria.</p>
                        </div>
                    </div>

                    {renderDocumentBody()}
                </main>
            </div>
        </div>
    );
};



// import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { ShieldCheck, Printer, ArrowLeft, FileText, List, ChevronRight, Info } from 'lucide-react';
// import mLabLogo from '../../assets/logo/mlab_logo_white.png';

// /* 
//   -----------------------------------------------------------------------------------
//   TODO: DYNAMIC MARKDOWN MIGRATION
//   In a future iteration, replace this static JSX layout with dynamic Markdown rendering
//   (e.g., using `react-markdown` or `remark`). The .md file will be fetched from 
//   Firebase Storage or a CMS endpoint to allow non-technical updates.
//   -----------------------------------------------------------------------------------
// */

// interface TocItem {
//     id: string;
//     title: string;
// }

// const TOC_SECTIONS: TocItem[] = [
//     { id: 'introduction', title: 'Introduction' },
//     { id: 'compliance-with-laws', title: 'Compliance with Laws' },
//     { id: 'standards-of-conduct', title: 'Standards of Conduct' },
//     { id: 'internet-and-network-usage', title: 'Internet and network usage' },
//     { id: 'use-of-developers-resources', title: 'Use of developer’s resources' },
//     { id: 'maintenance-and-abuse', title: 'Maintenance and abuse of mLab computers' },
//     { id: 'harassment-and-discrimination', title: 'Training environment free of harassment and discrimination' },
//     { id: 'smoking', title: 'Smoking' },
//     { id: 'firearms-and-weapons', title: 'Firearms and weapons' },
//     { id: 'substance-abuse', title: 'Substance Abuse' },
//     { id: 'gambling', title: 'Gambling' },
//     { id: 'visitors', title: 'Visitors in the training facility' },
//     { id: 'plagiarism-and-copyright', title: 'Plagiarism and Copyright Infringement' },
//     { id: 'academic-standards', title: 'Attaining the academic standards of the mLab CodeTribe Academy' },
//     { id: 'contagious-diseases', title: 'Treatment for contagious or infectious diseases' },
//     { id: 'termination-actions', title: 'Actions that may result in termination of the study contract' },
//     { id: 'intellectual-property', title: 'Assignment of Intellectual property to mLab' },
//     { id: 'waivers', title: 'Waivers of the Code of Conduct' },
//     { id: 'acknowledgement-signature', title: 'Trainee Acknowledgement & Signature' }
// ];

// export const CodeOfConduct: React.FC = () => {
//     const navigate = useNavigate();
//     const [activeSection, setActiveSection] = useState<string>('introduction');

//     const handleScrollTo = (id: string) => {
//         setActiveSection(id);
//         const element = document.getElementById(id);
//         if (element) {
//             element.scrollIntoView({ behavior: 'smooth', block: 'start' });
//         }
//     };

//     const handlePrint = () => {
//         window.print();
//     };

//     return (
//         <div className="coc-wrapper">

//             {/* STYLES & OVERFLOW FIXES */}
//             <style>{`
//                 /* Fixed Viewport Wrapper guarantees scrolling & 100% background coverage */
//                 .coc-wrapper {
//                     position: fixed;
//                     inset: 0;
//                     width: 100vw;
//                     height: 100vh;
//                     overflow-y: auto;
//                     overflow-x: hidden;
//                     background-color: #f8fafc;
//                     z-index: 1000;
//                     display: flex;
//                     flex-direction: column;
//                     color: #334155;
//                     font-family: var(--font-body, system-ui, sans-serif);
//                     box-sizing: border-box;
//                 }

//                 .coc-layout {
//                     width: 100%;
//                     max-width: 1400px;
//                     margin: 0 auto;
//                     padding: 24px 32px 64px 32px;
//                     box-sizing: border-box;
//                     display: grid;
//                     grid-template-columns: 280px 1fr;
//                     gap: 28px;
//                     align-items: start;
//                     flex: 1;
//                 }

//                 .coc-sidebar {
//                     position: sticky !important;
//                     top: 88px !important;
//                     align-self: start !important;
//                     z-index: 10;
//                 }

//                 @media (max-width: 900px) {
//                     .coc-layout {
//                         grid-template-columns: 1fr;
//                         padding: 16px;
//                     }
//                     .coc-sidebar {
//                         position: relative !important;
//                         top: 0 !important;
//                     }
//                 }

//                 @media print {
//                     header, .coc-sidebar, .coc-action-btn, .coc-dev-note { display: none !important; }
//                     .coc-layout { display: block !important; padding: 0 !important; }
//                     .coc-document { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
//                     .coc-wrapper { position: relative !important; height: auto !important; background: white !important; }
//                     .coc-section { page-break-inside: avoid; }
//                 }
//             `}</style>

//             {/* STICKY TOP HEADER */}
//             <header style={{ background: 'var(--mlab-midnight, #0f172a)', color: 'white', padding: '16px 24px', borderBottom: '3px solid var(--mlab-green, #16a34a)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                     <img src={mLabLogo} alt="mLab Logo" height={36} />
//                     <span style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '12px' }}>
//                         CodeTribe Academy Policies
//                     </span>
//                 </div>
//                 <div style={{ display: 'flex', gap: '12px' }}>
//                     <button
//                         onClick={handlePrint}
//                         className="coc-action-btn"
//                         style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 14px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
//                     >
//                         <Printer size={14} /> Print / Save PDF
//                     </button>
//                     <button
//                         onClick={() => navigate(-1)}
//                         className="coc-action-btn"
//                         style={{ background: 'var(--mlab-blue, #0284c7)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
//                     >
//                         <ArrowLeft size={14} /> Back
//                     </button>
//                 </div>
//             </header>

//             {/* FULL-WIDTH FLUID LAYOUT CONTAINER */}
//             <div className="coc-layout">

//                 {/* HANGING (STICKY) TABLE OF CONTENTS SIDEBAR */}
//                 <aside
//                     className="coc-sidebar"
//                     style={{
//                         background: 'white',
//                         border: '1px solid #cbd5e1',
//                         borderRadius: '4px',
//                         padding: '20px',
//                         boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
//                     }}
//                 >
//                     <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue, #0284c7)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <List size={16} /> Table of Contents
//                     </div>
//                     <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                         {TOC_SECTIONS.map((item, idx) => {
//                             const isActive = activeSection === item.id;
//                             return (
//                                 <button
//                                     key={item.id}
//                                     onClick={() => handleScrollTo(item.id)}
//                                     style={{
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'space-between',
//                                         textAlign: 'left',
//                                         background: isActive ? '#f0f9ff' : 'transparent',
//                                         color: isActive ? 'var(--mlab-blue, #0284c7)' : '#475569',
//                                         border: 'none',
//                                         borderLeft: isActive ? '3px solid var(--mlab-blue, #0284c7)' : '3px solid transparent',
//                                         padding: '8px 10px',
//                                         fontSize: '0.78rem',
//                                         fontWeight: isActive ? 800 : 500,
//                                         cursor: 'pointer',
//                                         borderRadius: '0 4px 4px 0',
//                                         transition: 'all 0.15s'
//                                     }}
//                                 >
//                                     <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                                         {idx + 1}. {item.title}
//                                     </span>
//                                     {isActive && <ChevronRight size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />}
//                                 </button>
//                             );
//                         })}
//                     </nav>

//                     {/* FUTURE MARKDOWN NOTICE (DEV ONLY) */}
//                     {process.env.NODE_ENV === 'development' && (
//                         <div className="coc-dev-note" style={{ background: '#eff6ff', border: '1px dashed #3b82f6', color: '#1d4ed8', padding: '10px 12px', borderRadius: '4px', fontSize: '0.75rem', marginTop: '20px', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.4 }}>
//                             <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
//                             <span><strong>Developer Note:</strong> Content is currently hardcoded. A future update will load and parse dynamic Markdown content automatically.</span>
//                         </div>
//                     )}
//                 </aside>

//                 {/* MAIN POLICY DOCUMENT CONTAINER */}
//                 <main className="coc-document" style={{ background: 'white', padding: '48px 56px', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' }}>

//                     {/* OFFICIAL INSTITUTION HEADER */}
//                     <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '24px', marginBottom: '36px', textAlign: 'center' }}>
//                         <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
//                             <ShieldCheck size={16} /> Mobile Applications Laboratory NPC <span style={{ textTransform: 'none' }}>(mLab)</span>
//                         </div>
//                         <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.1rem', color: '#0f172a', margin: '0 0 12px 0', textTransform: 'uppercase' }}>
//                             Code of Conduct for CodeTribe Trainees
//                         </h1>
//                         <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
//                             <p style={{ margin: 0, fontWeight: 700 }}>Mobile Applications Laboratory NPC | Reg: 2011/149875/08</p>
//                             <p style={{ margin: 0 }}>The Loft, Block C, 2nd Floor, The Village Office Park, Faerie Glen, Pretoria.</p>
//                         </div>
//                     </div>

//                     {/* DOCUMENT BODY WITH EXACT VERBATIM PROSE */}
//                     <article style={{ fontSize: '0.92rem', lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: '32px' }}>

//                         {/* 1. INTRODUCTION */}
//                         <section id="introduction" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Introduction
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 mLab SA seeks to conduct business in an ethical, responsible manner, build relationships of trust and instill confidence in the organisation to deliver on its mandate. Trainees of any mLab programmes are custodians of mLab’s reputation and are therefore expected to conduct themselves in an honourable manner. This Code of Conduct is intended to help trainees understand their ethical and legal obligations, as well as acceptable behaviour as it applied to the mLab CodeTribe Academy.
//                             </p>
//                             <p style={{ margin: 0 }}>
//                                 Although this Code of Conduct does not cover every issue that may possibly arise, it is intended to establish guidelines to which trainees may refer in situations where the proper course of action may not be entirely clear. The guidelines set out in this Code of Conduct are mandatory and, as such, must be always observed.
//                             </p>
//                         </section>

//                         {/* 2. COMPLIANCE WITH LAWS */}
//                         <section id="compliance-with-laws" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Compliance with Laws
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 mLab and its beneficiaries must comply with all local, national, international, or foreign laws or regulations, that apply to mLab’s business. Ignorance of the law is generally not considered a valid defence when an infraction is committed, thus any areas of uncertainty should be clarified by liaising with the CodeTribe Facilitator or by seeking appropriate guidance from mLab management.
//                             </p>
//                         </section>

//                         {/* 3. STANDARDS OF CONDUCT */}
//                         <section id="standards-of-conduct" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Standards of Conduct
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 The CodeTribe rules and standards of conduct for are important and are regarded seriously. Trainees are urged to familiarise themselves with these rules and standards and to follow the rules and standards faithfully whilst participating in the mLab CodeTribe Academy. A learner who deviates from these rules and standards will be subject to corrective action, up to and including termination of contract.
//                             </p>
//                         </section>

//                         {/* 4. INTERNET AND NETWORK USAGE */}
//                         <section id="internet-and-network-usage" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Internet and network usage
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 It is mLab’s policy to maintain access for its community to local, national, and international sources of information and to provide an environment that encourages the free exchange of ideas and sharing of information. Access to this environment and the mLab information technology resources is a privilege and must be treated with the highest standard of ethics.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 mLab provides trainees with a network connection and Internet access (at the mLab facility only). This policy governs all use of the mLab network, Internet access, whether for electronic mail, chat rooms, Internet browsing, newsgroups, or electronic bulletin boards.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 mLab expects all trainees to use computing and information technology resources in a responsible manner, to respect the public trust through which these resources have been provided, the rights and privacy of others, the integrity of facilities and controls, and all pertinent laws and mLab policies and standards.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 The mLab data network is a shared resource that must be preserved for the common use of the mLab community. Network bandwidth, both internal and external, is maintained and provided to accommodate the broad business purposes of mLab.
//                             </p>
//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
//                                 All computers connected to the mLab network are classified according to the following definitions and guidelines regarding bandwidth utilisation:
//                             </p>
//                             <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
//                                 <li style={{ marginBottom: '6px' }}><strong>Excessive use</strong> – High bandwidth utilisation by one or more computers or network devices, either transient or sustained, which degrades network performance and effectively degenerates, prevents or inhibits legitimate business activities.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Incidental use</strong> – Low bandwidth utilisation of a shared resource by one or more computers or network devices that, when aggregated over a proscribed sampling period, is in the bottom quartile of devices sharing that same resource.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Business use</strong> – Bandwidth utilisation that, directly or indirectly, contributes to the normal business activities of mLab SA.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Personal use</strong> - Bandwidth utilisation that cannot be categorised as business use.</li>
//                             </ul>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 During normal training hours, users are required to restrict their browsing consumption to 10-15Mb local and 8-10Mb international. This is usually more than sufficient for browsing, but restricts the downloading of large files, streaming of sound and video, or any other activity that involves the transfer of large amounts of data.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 To ensure access to finite resources such as Internet connections, mLab reserves the right to monitor bandwidth usage characteristics. When necessary, mLab will communicate with the learner that is associated with a computer/s that has displayed bandwidth usage characteristics that appear to violate the above guidelines and may take the necessary steps to curb excessive use. Access to the network and Internet are for official training purposes only.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Trainees do not have any expectation of privacy regarding any information created, sent, or received via the network or Internet. This includes all e-mail messages and all electronic files. mLab reserves the right to, at any time and without notice, access, read and review, monitor, and copy all messages and files on its computer system, as it deems necessary. When considered necessary, mLab may disclose text or images to law enforcement agencies or other third parties without obtaining the Learner’s consent.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Alternative Internet Service Provider connections to the mLab internal network are not permitted unless expressly authorised, in writing, by mLab and must be properly protected by a firewall or other appropriate security device(s).
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Trainees are reminded that information obtained from the Internet is not always reliable and should be verified by a reliable source for accuracy before it is used.
//                             </p>

//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>Trainees may not use the mLab network or Internet access for any of the following:</p>
//                             <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
//                                 <li>Downloading of any software without the prior written approval of mLab management.</li>
//                                 <li>Dissemination or printing of copyrighted materials, including articles and software, in violation of copyright laws.</li>
//                                 <li>Sending, receiving, printing, or otherwise disseminating proprietary data, trade secrets, or other confidential information of mLab in violation of company policy or written agreements.</li>
//                                 <li>Operating a business, usurping business opportunities, soliciting money for personal gain or searching for jobs outside mLab’s business.</li>
//                                 <li>Offensive or harassing statements or language including ridiculing others based on their race, color, religion, national origin, disability, age, sex, or sexual orientation, etc.</li>
//                                 <li>Sending or soliciting politically oriented messages or images.</li>
//                                 <li>Sending or soliciting sexually oriented messages or images.</li>
//                                 <li>Visiting sites featuring pornography, terrorism, espionage, theft, or controlled or illegal substances.</li>
//                                 <li>Gambling or engaging in any other activity in violation of the law.</li>
//                                 <li>Unethical activities or content, or activities or content that could damage mLab’s professional reputation.</li>
//                             </ul>

//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>Trainees must abide by the following:</p>
//                             <ul style={{ margin: '0 0 12px 0', paddingLeft: '24px' }}>
//                                 <li>Files that are downloaded from the Internet must be scanned with virus detection software before installing or execution. All appropriate precautions should be taken to detect a virus and, if necessary, to prevent its spread.</li>
//                                 <li>Trainees shall not place mLab material (copyrighted software, internal correspondence, etc.) on any publicly accessible Internet computer without proper permission.</li>
//                                 <li>Unless otherwise noted, all software on the Internet should be considered copyrighted work. Therefore, trainees are prohibited from downloading software and/or modifying any such files without permission from the copyright holder.</li>
//                                 <li>The Internet does not guarantee the privacy and confidentiality of information. Sensitive material transferred over the Internet may be at risk of detection by a third party. Therefore, trainees must exercise caution and care when transferring such material in any form.</li>
//                                 <li>Others may consider infringing activities by a learner as being the responsibility of mLab. Therefore, trainees can be held liable for their actions and mLab reserves the right to inspect a Learner’s computer system for violations of this policy.</li>
//                             </ul>
//                             <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
//                                 Any trainees that are found guilty of a violation of this policy or uses the mLab network or Internet access for improper purposes, shall be subject to termination of their contract with mLab.
//                             </p>
//                         </section>

//                         {/* 5. USE OF DEVELOPER'S RESOURCES */}
//                         <section id="use-of-developers-resources" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Use of developer’s resources.
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 mLab SA possess licenses to a variety of developer’s resources. Trainees who access these resources must at all times do so in accordance with the stipulations of the relevant license agreements. Any infringement of such license agreements will lead to immediate action, including possible termination of the training contract with mLab.
//                             </p>
//                         </section>

//                         {/* 6. MAINTENANCE AND ABUSE OF MLAB COMPUTERS */}
//                         <section id="maintenance-and-abuse" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Maintenance and abuse of mLab computers
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 Maintenance of mLab computers and network is outsourced. Trainees may not change any component of a mLab computer and will be held liable for any damages incurred, if found responsible of abusing mLab computers or related information technology equipment.
//                             </p>
//                         </section>

//                         {/* 7. TRAINING ENVIRONMENT FREE OF HARASSMENT AND DISCRIMINATION */}
//                         <section id="harassment-and-discrimination" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Training environment free of harassment and discrimination
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 mLab is committed to providing a training environment that is free of discrimination and unlawful harassment. Actions, words, jokes or comments based on an individual’s gender, race, ethnicity, age, religion or any other legally protected characteristic will not be tolerated.
//                             </p>
//                             <p style={{ margin: 0 }}>
//                                 Any learner that believes that s/he had been the victim of harassment, or who know of another learner who has, should report it to mLab management immediately. Trainees can raise concerns and make reports without fear of reprisal.
//                             </p>
//                         </section>

//                         {/* 8. SMOKING */}
//                         <section id="smoking" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Smoking
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 mLab is a designated NON-SMOKING facility; however, there are smoking areas located outside the building.
//                             </p>
//                         </section>

//                         {/* 9. FIREARMS AND WEAPONS */}
//                         <section id="firearms-and-weapons" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Firearms and weapons
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 No firearms and weapons of any kind are allowed on the mLab premises.
//                             </p>
//                         </section>

//                         {/* 10. SUBSTANCE ABUSE */}
//                         <section id="substance-abuse" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Substance Abuse
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 mLab is committed to providing a safe and productive training facility for its trainees and staff. In keeping with this commitment, the following rules regarding the use of alcohol and drugs or abuse thereof have been established for all individuals, while they are on mLab premises or elsewhere on mLab related training activities:
//                             </p>
//                             <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
//                                 <li>The use of alcohol is prohibited on the mLab premises. However, alcoholic beverages may be served at special events, subject to prior approval by mLab management.</li>
//                                 <li>The manufacture, distribution, possession, sale, or purchase of controlled substances or drug paraphernalia on mLab property is prohibited.</li>
//                                 <li>Being under the influence of illegal drugs, alcohol, or other substances on mLab property is prohibited.</li>
//                                 <li>Attending classes while under the influence of prescription drugs that impair performance or judgment is prohibited.</li>
//                             </ul>
//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
//                                 So that there is no question about what these rules signify, please note the following definitions:
//                             </p>
//                             <ul style={{ margin: 0, paddingLeft: '24px' }}>
//                                 <li style={{ marginBottom: '6px' }}><strong>mLab property:</strong> All mLab owned or leased property.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Controlled substances:</strong> Any substance listed as such by the relevant authorities.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Drug:</strong> Any chemical substance that produces physical, mental, emotional or behavioural change in the user.</li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Drug paraphernalia:</strong> Equipment, products or materials that are used or intended for use in concealing an illegal drug, or otherwise introducing into the human body an illegal drug or controlled substance.</li>
//                                 <li style={{ marginBottom: '6px' }}>
//                                     <strong>Illegal drug:</strong>
//                                     <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
//                                         <li>Any drug or derivative thereof whose use, possession, sale, transfer, attempted sale or transfer, manufacture, or storage is illegal.</li>
//                                         <li>Any drug, including – but not limited to – a prescription drug, used for any reason other than that prescribed by a physician.</li>
//                                         <li>Inhalants used illegally.</li>
//                                     </ul>
//                                 </li>
//                                 <li style={{ marginBottom: '6px' }}><strong>Under the influence:</strong> A state of not having the normal use of mental or physical faculties resulting from the voluntary introduction into the body of an alcoholic beverage, drug, or substance of abuse.</li>
//                             </ul>
//                         </section>

//                         {/* 11. GAMBLING */}
//                         <section id="gambling" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Gambling
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 Gambling shall not be permitted on the mLab premises.
//                             </p>
//                         </section>

//                         {/* 12. VISITORS IN THE TRAINING FACILITY */}
//                         <section id="visitors" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Visitors in the training facility
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 To provide for the safety and security of trainees and staff using the facilities at mLab, only authorised visitors are permitted onto the premises. Restricting unauthorised visitors helps ensure security, decreases insurance liability, protects confidential information, safeguards welfare and avoids potential distractions and disturbances. Only authorised visitors will be escorted to their destination and must thereafter be always accompanied by an mLab representative.
//                             </p>
//                         </section>

//                         {/* 13. PLAGIARISM AND COPYRIGHT INFRINGEMENT */}
//                         <section id="plagiarism-and-copyright" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Plagiarism and Copyright Infringement
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 All academic work, written or otherwise, submitted by a student is expected to be the result of his/her own skill and labour. Where a student’s work is not authentically his/her own, such work does not qualify as an academic output, whether this is in relation to a project, an assignment, research, or exam, and any such transgression will be viewed as plagiarism, which is defined as the appropriation of another's work, whether intentionally or unintentionally, without proper acknowledgement.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Any form of plagiarism by stating, or implying, original authorship of someone else's written or creative work (words, images, ideas, opinions, discoveries, recordings, computer- generated work, code, etc.), and/or by incorporating such work or material, in whole or in part, into his/her own work without properly acknowledging or citing the source. Should a student be found guilty of plagiarism, this shall lead to the termination of the study contract.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Our trainees are expected to uphold high ethical standards and to give us the power to act in cases where contraventions of ethical academic standards occur. We also wish to inform our trainees of the rights of copyright holders and to provide them with guidelines for ethical research and study practices.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Plagiarism amounts to academic dishonesty, which is unethical conduct that undermines the credibility of your work and is a negation of sound academic practice. No value is added if copyright is infringed or where unethical research practices are used. Material gained through dishonesty adds nothing to existing knowledge, as there is obviously no growth in the independence of the writer’s intellectual involvement, and his/her academic integrity is compromised.
//                             </p>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 Unethical use of another person’s work for research or study purposes may, in addition to the infringement of the copyright owner’s economic rights, also infringe the author’s moral rights and constitute a criminal offence.
//                             </p>
//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
//                                 The following will amount to the infringement of an author’s moral rights, and will be copyright infringement as well:
//                             </p>
//                             <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px' }}>
//                                 <li>failure to acknowledge the author where phrases or passages are taken word-for-word from a published or unpublished text.</li>
//                                 <li>use of a summary of a work which contains the ideas of others and presents the essence of an argument in language that condenses and compresses the original language of the source without acknowledging the author of the work.</li>
//                                 <li>using the cut-and-paste method, where pieces of other persons’ work, including those taken from the internet, are blended with one’s own words and phrases without acknowledging the author of the source work.</li>
//                             </ul>
//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
//                                 Dishonest practices may also amount to criminal offences, such as fraud, theft and criminal copyright liability. Such dishonest practices include the following:
//                             </p>
//                             <ul style={{ margin: 0, paddingLeft: '24px' }}>
//                                 <li>copying information from another person (e.g., another learner’s assignment, project or exam) and submitting identical work where such work is not the result of teamwork and indicated as such by all participants.</li>
//                                 <li>asking someone else to do an assignment or project or sit for an exam on one’s behalf.</li>
//                             </ul>
//                         </section>

//                         {/* 14. ATTAINING THE ACADEMIC STANDARDS */}
//                         <section id="academic-standards" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Attaining the academic standards of the mLab CodeTribe Academy
//                             </h2>
//                             <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>These include the following:</p>
//                             <ul style={{ margin: '0 0 12px 0', paddingLeft: '24px' }}>
//                                 <li>Attend at least 90% of all classes and where this is not possible, to provide a legitimate reason and/or sick certificate to the facilitator.</li>
//                                 <li>Hand in at least 90% of all assignments on time</li>
//                                 <li>Achieve a minimum level of competence to graduate.</li>
//                             </ul>
//                             <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c' }}>
//                                 Failure to adhere to bullets 1 and 2 above, will result in forfeiture of the study support for the following quarter and may lead to termination from the Academy.
//                             </p>
//                         </section>

//                         {/* 15. TREATMENT FOR CONTAGIOUS OR INFECTIOUS DISEASES */}
//                         <section id="contagious-diseases" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Treatment for contagious or infectious diseases
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 If a learner suspects that s/he has an infectious or contagious disease they must get medical assistance immediately, must withdraw from all mLab training activities and must take all other steps to make sure that they do not infect other trainees or staff.
//                             </p>
//                         </section>

//                         {/* 16. ACTIONS THAT MAY RESULT IN TERMINATION */}
//                         <section id="termination-actions" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Actions that may result in termination of the study contract
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 While not intended to list all the forms of behaviour that are considered unacceptable in the mLab training facility, the following are examples of rule infractions or misconduct that may result in corrective action, including termination of the study contract:
//                             </p>
//                             <ul style={{ margin: 0, paddingLeft: '24px' }}>
//                                 <li style={{ marginBottom: '6px' }}>Theft or inappropriate removal or possession of property.</li>
//                                 <li style={{ marginBottom: '6px' }}>Working under the influence of alcohol or illegal drugs (See Substance Abuse).</li>
//                                 <li style={{ marginBottom: '6px' }}>Possession, distribution, sale, transfer, or use of alcohol, controlled substances or illegal drugs in the workplace (See substance abuse).</li>
//                                 <li style={{ marginBottom: '6px' }}>Fighting or threatening violence whilst on mLab property.</li>
//                                 <li style={{ marginBottom: '6px' }}>Overly boisterous or disruptive activity in the training facility.</li>
//                                 <li style={{ marginBottom: '6px' }}>Negligence or improper conduct leading to damage of mLab owned or customer-owned property.</li>
//                                 <li style={{ marginBottom: '6px' }}>Violation of safety or health rules.</li>
//                                 <li style={{ marginBottom: '6px' }}>Smoking in the facility.</li>
//                                 <li style={{ marginBottom: '6px' }}>Sexual or other unlawful or unwelcome harassment.</li>
//                                 <li style={{ marginBottom: '6px' }}>Unauthorised use of telephones, or other mLab owned equipment.</li>
//                                 <li style={{ marginBottom: '6px' }}>Unauthorised disclosure of mLab trade secrets or confidential information.</li>
//                                 <li style={{ marginBottom: '6px' }}>Acts in a dishonest manner or attempts to act in a dishonest manner, which includes any form of conduct involving deception, for example theft, unauthorised possession of property, bribery, fraud, forgery or giving false or misleading statements.</li>
//                                 <li style={{ marginBottom: '6px' }}>Accepts or attempts to obtain any benefit or information or access to information in an inappropriate manner, which may place any learner in an advantageous position academically in relation to other students in any manner whatsoever.</li>
//                                 <li style={{ marginBottom: '6px' }}>Assists or encourages another student to commit an act which constitutes misconduct.</li>
//                             </ul>
//                         </section>

//                         {/* 17. ASSIGNMENT OF INTELLECTUAL PROPERTY */}
//                         <section id="intellectual-property" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Assignment of Intellectual property to mLab
//                             </h2>
//                             <p style={{ margin: '0 0 12px 0' }}>
//                                 By signing the mLab study contract, you assign to mLab all intellectual property rights in any work you create during your training. This includes assignments, assessment scripts, personal class notes, presentations, recordings, software, hardware, data or databases or any other work created, adapted or amended by you.
//                             </p>
//                             <p style={{ margin: 0 }}>
//                                 The intellectual property in these works belong to mLab and the learner may not share or allow others to copy or distribute these works or infringe the intellectual property rights of mLab in any manner, without the express permission of mLab management.
//                             </p>
//                         </section>

//                         {/* 18. WAIVERS OF THE CODE OF CONDUCT */}
//                         <section id="waivers" className="coc-section" style={{ scrollMarginTop: '100px' }}>
//                             <h2 style={{ fontSize: '1.2rem', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                 Waivers of the Code of Conduct
//                             </h2>
//                             <p style={{ margin: 0 }}>
//                                 A waiver of any provision of this Code of Conduct will only be granted if it is deemed appropriate under the circumstances. Any waiver of provisions of this Code of Conduct for trainees will only be granted by the Board of Directors of mLab or a duly authorised committee of the Board.
//                             </p>
//                         </section>

//                         {/* 19. ACKNOWLEDGEMENT & SIGNATURE FORM */}
//                         <section id="acknowledgement-signature" className="coc-section" style={{ scrollMarginTop: '100px', marginTop: '16px', background: '#f8fafc', padding: '24px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
//                             <h2 style={{ fontSize: '1.1rem', color: '#0f172a', marginBottom: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <FileText size={18} color="var(--mlab-blue)" /> Trainee Policy Acknowledgement
//                             </h2>
//                             <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '20px' }}>
//                                 By executing this document or checking the digital PoPIA/Code of Conduct consent box in your Learner Portal setup, you acknowledge that you have read, understood, and agreed to abide by all the provisions of this Code of Conduct.
//                             </p>

//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
//                                 <div>
//                                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Full Trainee Name</label>
//                                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '4px', fontSize: '0.85rem', color: '#0f172a', minHeight: '38px' }}>
//                                         {/* Dynamic or printable placeholder */}
//                                     </div>
//                                 </div>
//                                 <div>
//                                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Date Signed</label>
//                                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '4px', fontSize: '0.85rem', color: '#0f172a', minHeight: '38px' }}>
//                                         {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
//                                     </div>
//                                 </div>
//                                 <div style={{ gridColumn: '1 / -1' }}>
//                                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>Signature</label>
//                                     <div style={{ background: 'white', border: '1px dashed #94a3b8', padding: '24px', borderRadius: '4px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
//                                         Digitally Recorded &amp; Signed via mLab QMS Ledger
//                                     </div>
//                                 </div>
//                             </div>
//                         </section>

//                     </article>
//                 </main>
//             </div>
//         </div>
//     );
// };