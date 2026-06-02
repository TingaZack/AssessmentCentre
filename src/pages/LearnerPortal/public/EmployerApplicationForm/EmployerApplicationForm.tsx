// src/pages/Public/EmployerApplicationForm/EmployerApplicationForm.tsx

import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import Autocomplete from "react-google-autocomplete";
import { Building2, MapPin, User, ShieldAlert, Loader2, CheckCircle2, Briefcase, ListPlus, Info, Target, Laptop, CreditCard, MonitorPlay, FileBadge, X } from 'lucide-react';
import { db } from '../../../../lib/firebase';

import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import { StatusModal, type StatusModalProps } from '../../../../components/common/StatusModal/StatusModal';

const COMPANY_TYPES = [
    "Private Company (Pty Ltd)",
    "Non-Profit Organisation (NPO / NGO)",
    "Close Corporation (CC)",
    "Sole Proprietorship",
    "Public Company (Ltd)",
    "Partnership",
    "Government / Public Sector",
    "Other"
];

const INDUSTRY_SECTORS = [
    "ICT / Software Development",
    "Data Science & Analytics",
    "Design / UI / UX",
    "Business / Operations",
    "Agriculture / AgriTech",
    "Healthcare / HealthTech",
    "Finance / FinTech",
    "Education / EdTech",
    "Manufacturing & Logistics",
    "Retail / E-commerce",
    "Media & Communications",
    "Other"
];

const REVENUE_BANDS = [
    "Pre-Revenue / Startup",
    "Under R1 Million",
    "R1 Million - R5 Million",
    "R5 Million - R10 Million",
    "R10 Million - R50 Million",
    "Over R50 Million"
];

const FUNDING_MODELS = [
    "We require fully funded placements (SETA / mLab funded)",
    "We can co-fund / top-up the stipend",
    "We can fully fund the placement ourselves"
];

const HEAR_ABOUT_US = [
    "LinkedIn",
    "Facebook / Twitter",
    "mLab Website",
    "Referred by an mLab Partner",
    "Referred by a Colleague / Friend",
    "Other"
];

// PREDEFINED SEARCHABLE ROLES
const STANDARD_ROLES = [
    "Software Developer (Front-end)",
    "Software Developer (Back-end)",
    "Software Developer (Full-stack)",
    "Mobile App Developer (iOS/Android)",
    "UI / UX Designer",
    "Data Analyst / Scientist",
    "Cloud Engineer / Architect",
    "DevOps Engineer",
    "QA Tester / Automation Engineer",
    "Systems / Business Analyst",
    "Cybersecurity Specialist",
    "IT Support / Helpdesk",
    "Digital Marketer / Social Media",
    "Project / Product Manager",
    "Game Developer",
    "Other (Type your own)"
];

export const EmployerApplicationForm: React.FC = () => {
    const [saving, setSaving] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [blueprint, setBlueprint] = useState<any>(null);
    const [customResponses, setCustomResponses] = useState<Record<string, any>>({});

    // Status Modal State
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    // UI State for the Roles Input
    const [roleInput, setRoleInput] = useState('');

    useEffect(() => {
        const fetchBlueprint = async () => {
            try {
                const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
                if (settingsSnap.exists() && settingsSnap.data().employerFormBlueprint) {
                    setBlueprint(settingsSnap.data().employerFormBlueprint);
                }
            } catch (err) {
                console.error("Failed to load blueprint", err);
            }
        };
        fetchBlueprint();
    }, []);

    const isVisible = (fieldId: string) => {
        if (!blueprint || !blueprint.coreFieldVisibility) return true;
        return blueprint.coreFieldVisibility[fieldId] !== false;
    };

    const [form, setForm] = useState({
        // Organisation Info
        name: '', tradingName: '', registrationNumber: '', companyType: '', vatNumber: '', bbbeeLevel: '', website: '',
        businessDescription: '', industrySector: '',
        // Contact & Capacity
        contactPerson: '', contactEmail: '', contactPhone: '',
        employeeCount: '', revenue: '',
        // Hosting Intent
        hostedBefore: 'No', internCapacity: 1, specificRoles: [] as string[], fundingModel: 'We require fully funded placements (SETA / mLab funded)', remuneration: '',
        provideLaptop: 'No', workArrangement: 'On-site', daysAtOffice: '', likelihoodToHire: 'Medium', hasDedicatedMentors: 'No', expectedStartDate: '',
        // Digital Needs
        topNeededSolutions: '', certificationsNeeded: '',
        // SETA & Compliance
        taxCompliant: 'Yes', bbbeeAwareness: 'Somewhat', interestedInBbbee: false, etiAwareness: false, requiresAdvisory: false,
        willingToSignWBL: true, hasHRPolicies: false, dataConsent: false,
        // Referrals & Consent
        partOfMlabBefore: 'No', whereDidYouHear: '', referredBy: '', interestInED: false,
        // Geo
        physicalAddress: '', province: '', lat: null as number | null, lng: null as number | null,
    });

    const handlePlaceSelected = (place: any) => {
        let newLat = form.lat;
        let newLng = form.lng;

        if (place.geometry?.location) {
            newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
        }

        const components = place.address_components;
        const provString = components?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
        setForm(p => ({ ...p, physicalAddress: place.formatted_address || "", province: provString, lat: newLat, lng: newLng }));
    };

    // Helper to add a role pill
    const handleAddRole = (roleToAdd: string) => {
        const cleaned = roleToAdd.trim();
        if (cleaned && !form.specificRoles.includes(cleaned) && cleaned !== "Other (Type your own)") {
            setForm(p => ({ ...p, specificRoles: [...p.specificRoles, cleaned] }));
        }
        setRoleInput('');
    };

    const removeRole = (roleToRemove: string) => {
        setForm(p => ({ ...p, specificRoles: p.specificRoles.filter(r => r !== roleToRemove) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Custom Validation via StatusModal
        if (!form.dataConsent) {
            setStatusModal({ type: 'warning', title: 'Data Consent Required', message: 'You must consent to data processing to submit this application.', onClose: () => setStatusModal(null) });
            return;
        }
        if (form.specificRoles.length === 0) {
            setStatusModal({ type: 'warning', title: 'Roles Required', message: 'Please specify at least one role you are looking to fill.', onClose: () => setStatusModal(null) });
            return;
        }

        setSaving(true);
        try {
            const finalForm = {
                ...form,
                industrySector: form.industrySector ? [form.industrySector] : [],
                customResponses,
                status: 'Pending Review',
                mlabTier: 'Pending Assessment',
                mlabRiskRating: 'Pending',
                matchingPriorityScore: 0,
                internalNotes: 'Applied via public EOI web form.',
            };

            const ref = doc(collection(db, 'employers'));
            await setDoc(ref, { ...finalForm, id: ref.id, createdAt: new Date().toISOString() });
            setSubmitted(true);
        } catch (err) {
            console.error(err);
            setStatusModal({ type: 'error', title: 'Submission Failed', message: 'An error occurred while submitting your application. Please verify your connection and try again.', onClose: () => setStatusModal(null) });
        } finally {
            setSaving(false);
        }
    };

    if (submitted) {
        return (
            <div className="animate-fade-in" style={{ height: '100vh', width: '100vw', background: 'var(--mlab-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box' }}>
                <div className="lfm-modal" style={{ maxWidth: '500px', transform: 'none', height: 'auto', margin: 'auto' }}>
                    <div className="lfm-header" style={{ justifyContent: 'center', padding: '2rem' }}>
                        <CheckCircle2 size={48} color="var(--mlab-green)" />
                    </div>
                    <div className="lfm-body" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                        <h2 className="lfm-section-hdr" style={{ justifyContent: 'center', fontSize: '1.2rem', border: 'none', marginBottom: '1rem' }}>Expression of Interest Received</h2>
                        <p style={{ color: 'var(--mlab-grey)', lineHeight: 1.6, marginBottom: '2.5rem', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
                            Thank you for your interest in partnering with mLab. Our placements team will review your submission and contact you shortly regarding eligibility and next steps.
                        </p>
                        <button onClick={() => window.location.reload()} className="lfm-btn lfm-btn--primary" style={{ margin: '0 auto' }}>Submit Another Request</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ height: '100vh', width: '100vw', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', boxSizing: 'border-box' }}>

            {/* Status Modal Mount Point */}
            {statusModal && (
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={statusModal.onClose}
                />
            )}

            <div className="lfm-modal" style={{ maxWidth: '850px', width: '100%', maxHeight: 'calc(100vh - 2rem)', display: 'flex', flexDirection: 'column', transform: 'none', position: 'relative', margin: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>

                {/* Brand Header */}
                <div className="lfm-header" style={{ flexDirection: 'column', alignItems: 'center', padding: '1.5rem 2rem', gap: '0.5rem', flexShrink: 0 }}>
                    <div style={{ background: 'rgba(148, 199, 61, 0.15)', padding: '0.75rem', borderRadius: '50%', border: '2px solid var(--mlab-green)' }}>
                        <Briefcase size={28} color="var(--mlab-green)" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h1 className="lfm-header__title" style={{ fontSize: '1.4rem', justifyContent: 'center' }}>Expression of Interest – Host Employers</h1>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: '0.25rem', fontFamily: 'var(--font-body)', maxWidth: '600px', marginInline: 'auto' }}>
                            Partner with us to grow young talent, build your pipeline, and digitise your operations.
                        </p>
                    </div>
                </div>

                {/* Scrollable Form Area */}
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                    <div className="lfm-body" style={{ background: '#f8fafc', padding: '2rem', overflowY: 'auto' }}>

                        {/* ABOUT MLAB CONTEXT BLOCK */}
                        <div style={{ background: 'var(--mlab-white)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', marginBottom: '2.5rem' }}>
                            <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-blue)', fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                <Info size={18} color="var(--mlab-green)" /> About mLab
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.6 }}>
                                Are you a business leader looking to grow your team? Are you in the process of, or interested in, digitising your operations? mLab is a non-profit organisation that prepares unemployed youth and entrepreneurs for opportunities within the digital economy. Established in 2011, we have a strong focus on empowering youth and driving inclusivity within the ICT sector.
                            </p>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.6 }}>
                                <strong>Your Turn:</strong> To be part of this initiative, we need to understand your needs and interest. Please fill in this short form.
                            </p>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'var(--mlab-bg)', padding: '0.75rem', borderRadius: '4px' }}>
                                <em>Note: This form serves as an expression of interest only. It helps us determine collaboration eligibility and is not a binding agreement.</em>
                            </div>
                        </div>

                        {/* SECTION 1: ORG INFO */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <div className="lfm-section-hdr"><Building2 size={16} /> Organisation Details</div>
                            <div className="lfm-grid">
                                <div className="lfm-fg">
                                    <label>Business / Organisation Name *</label>
                                    <input required type="text" className="lfm-input" placeholder="e.g. Acme Tech Solutions" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                                </div>
                                {isVisible('tradingName') && (
                                    <div className="lfm-fg">
                                        <label>Trading Name</label>
                                        <input type="text" className="lfm-input" placeholder="If different from registered name" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
                                    </div>
                                )}
                                <div className="lfm-fg">
                                    <label>Type of Business *</label>
                                    <select required className="lfm-input lfm-select" value={form.companyType} onChange={e => setForm(p => ({ ...p, companyType: e.target.value }))}>
                                        <option value="">Select Company Structure...</option>
                                        {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label>CIPC / Registration Number *</label>
                                    <input required type="text" className="lfm-input" placeholder="e.g. 2021/123456/07" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
                                </div>

                                {isVisible('vatNumber') && (
                                    <div className="lfm-fg">
                                        <label>VAT Number (If Applicable)</label>
                                        <input type="text" className="lfm-input" placeholder="e.g. 4012345678" value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} />
                                    </div>
                                )}
                                {isVisible('website') && (
                                    <div className="lfm-fg">
                                        <label>Website</label>
                                        <input type="url" className="lfm-input" placeholder="https://www.yourcompany.com" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
                                    </div>
                                )}

                                <div className="lfm-fg lfm-fg--full">
                                    <label>Primary Industry Sector *</label>
                                    <select required className="lfm-input lfm-select" value={form.industrySector} onChange={e => setForm(p => ({ ...p, industrySector: e.target.value }))}>
                                        <option value="">Select Primary Sector...</option>
                                        {INDUSTRY_SECTORS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                <div className="lfm-fg lfm-fg--full">
                                    <label>Brief Business Description *</label>
                                    <textarea required className="lfm-input" rows={2} placeholder="What does your organisation do?" value={form.businessDescription} onChange={e => setForm(p => ({ ...p, businessDescription: e.target.value }))} style={{ resize: 'vertical' }} />
                                </div>

                                <div className="lfm-fg lfm-fg--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px', marginTop: '0.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)' }}>
                                        <MapPin size={13} /> Primary Physical Office Address *
                                    </label>
                                    <Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ types: [], componentRestrictions: { country: "za" } }} className="lfm-input" placeholder="Search for your company address..." required />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2: CONTACT & CAPACITY */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <div className="lfm-section-hdr"><User size={16} /> Contact & Team Capacity</div>
                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Primary Contact Name *</label>
                                    <input required type="text" className="lfm-input" placeholder="Jane Doe" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Contact Email *</label>
                                    <input required type="email" className="lfm-input" placeholder="jane@company.com" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Contact Mobile Number *</label>
                                    <input required type="tel" className="lfm-input" placeholder="082 123 4567" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
                                </div>
                                {isVisible('employeeCount') && (
                                    <div className="lfm-fg">
                                        <label>Current Team Size</label>
                                        <input type="number" min="1" className="lfm-input" placeholder="Total current employees" value={form.employeeCount} onChange={e => setForm(p => ({ ...p, employeeCount: e.target.value }))} />
                                    </div>
                                )}
                                <div className="lfm-fg">
                                    <label>Business Annual Revenue</label>
                                    <select className="lfm-input lfm-select" value={form.revenue} onChange={e => setForm(p => ({ ...p, revenue: e.target.value }))}>
                                        <option value="">Select Bracket...</option>
                                        {REVENUE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 3: HOSTING INTEREST & LOGISTICS */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <div className="lfm-section-hdr"><Target size={16} /> Hosting Intent & Logistics</div>
                            <div className="lfm-grid">
                                <div className="lfm-fg">
                                    <label>Have you hosted placements before?</label>
                                    <select className="lfm-input lfm-select" value={form.hostedBefore} onChange={e => setForm(p => ({ ...p, hostedBefore: e.target.value }))}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label style={{ color: 'var(--mlab-blue)' }}>How many graduates can you host? *</label>
                                    <input required type="number" min="1" max="100" className="lfm-input" style={{ fontWeight: 'bold' }} value={form.internCapacity || ''} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
                                </div>

                                {/* 💡 MULTI-SELECT ROLES INPUT WITH PILLS 💡 */}
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Specific roles looking to fill? *</label>

                                    {/* Render Selected Pills */}
                                    {form.specificRoles.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                            {form.specificRoles.map(role => (
                                                <span key={role} style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid var(--mlab-border)' }}>
                                                    {role}
                                                    <X size={14} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeRole(role)} />
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Search/Type Input */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            list="roles-list"
                                            className="lfm-input"
                                            style={{ flex: 1 }}
                                            placeholder="Search roles or type your own, then click Add..."
                                            value={roleInput}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (STANDARD_ROLES.includes(val) && val !== "Other (Type your own)") {
                                                    handleAddRole(val);
                                                } else if (val === "Other (Type your own)") {
                                                    setRoleInput('');
                                                } else {
                                                    setRoleInput(val);
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddRole(roleInput);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="lfm-btn lfm-btn--ghost"
                                            style={{ padding: '0 1rem' }}
                                            onClick={() => handleAddRole(roleInput)}
                                        >
                                            Add
                                        </button>
                                    </div>

                                    {/* Datalist provides the native dropdown options */}
                                    <datalist id="roles-list">
                                        {STANDARD_ROLES.map(role => (
                                            <option key={role} value={role} />
                                        ))}
                                    </datalist>
                                </div>

                                <div className="lfm-fg lfm-fg--full" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '6px' }}>
                                    <label style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><CreditCard size={14} /> Placement Funding Model *</label>
                                    <select required className="lfm-input lfm-select" value={form.fundingModel} onChange={e => setForm(p => ({ ...p, fundingModel: e.target.value }))}>
                                        {FUNDING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <span style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '4px' }}>Preference is provided to organisations that can fully or partially fund talent placements.</span>
                                </div>

                                {form.fundingModel !== "We require fully funded placements (SETA / mLab funded)" && (
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Monthly Remuneration / Top-up able to provide (per candidate)?</label>
                                        <input type="text" className="lfm-input" placeholder="e.g. R3,000 top-up" value={form.remuneration} onChange={e => setForm(p => ({ ...p, remuneration: e.target.value }))} />
                                    </div>
                                )}

                                <div className="lfm-fg">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Laptop size={13} /> Provide a laptop to candidates?</label>
                                    <select className="lfm-input lfm-select" value={form.provideLaptop} onChange={e => setForm(p => ({ ...p, provideLaptop: e.target.value }))}>
                                        <option value="No">No, they need their own / mLab provided</option>
                                        <option value="Yes">Yes, we will provide hardware</option>
                                    </select>
                                </div>

                                {isVisible('expectedStartDate') && (
                                    <div className="lfm-fg">
                                        <label>Ideal Start Date</label>
                                        <input type="date" className="lfm-input" value={form.expectedStartDate} onChange={e => setForm(p => ({ ...p, expectedStartDate: e.target.value }))} />
                                    </div>
                                )}

                                {isVisible('workArrangement') && (
                                    <div className="lfm-fg">
                                        <label>Work Arrangement</label>
                                        <select className="lfm-input lfm-select" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
                                            <option value="On-site">On-site (Office)</option>
                                            <option value="Hybrid">Hybrid</option>
                                            <option value="Remote">100% Remote</option>
                                        </select>
                                    </div>
                                )}

                                {form.workArrangement !== 'Remote' && (
                                    <div className="lfm-fg">
                                        <label>Days per week at the office?</label>
                                        <input type="text" className="lfm-input" placeholder="e.g. 3 days" value={form.daysAtOffice} onChange={e => setForm(p => ({ ...p, daysAtOffice: e.target.value }))} />
                                    </div>
                                )}

                                <div className="lfm-fg">
                                    <label>Likelihood to offer a job post-placement?</label>
                                    <select className="lfm-input lfm-select" value={form.likelihoodToHire} onChange={e => setForm(p => ({ ...p, likelihoodToHire: e.target.value }))}>
                                        <option value="High">High - We are looking to hire permanently</option>
                                        <option value="Medium">Medium - Depends on performance/budget</option>
                                        <option value="Low">Low - Purely for skills development</option>
                                    </select>
                                </div>

                                {isVisible('hasDedicatedMentors') && (
                                    <div className="lfm-fg">
                                        <label>Dedicated Mentors Available?</label>
                                        <select className="lfm-input lfm-select" value={form.hasDedicatedMentors} onChange={e => setForm(p => ({ ...p, hasDedicatedMentors: e.target.value }))}>
                                            <option value="Yes">Yes, assigned capacity</option>
                                            <option value="Partially">Partially / Shared</option>
                                            <option value="No">No, team-based shadowing</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SECTION 4: DIGITAL NEEDS */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <div className="lfm-section-hdr"><MonitorPlay size={16} /> Business Digitisation Needs</div>
                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Top 2 Needed Digital Solutions</label>
                                    <input type="text" className="lfm-input" placeholder="e.g. A new e-commerce website, Inventory Management App" value={form.topNeededSolutions} onChange={e => setForm(p => ({ ...p, topNeededSolutions: e.target.value }))} />
                                </div>
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Preferred Certifications for Talent</label>
                                    <input type="text" className="lfm-input" placeholder="e.g. AWS Cloud Practitioner, SCRUM Master, CCNA" value={form.certificationsNeeded} onChange={e => setForm(p => ({ ...p, certificationsNeeded: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 5: SETA, B-BBEE & COMPLIANCE */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <div className="lfm-section-hdr"><FileBadge size={16} /> SETA, B-BBEE & Compliance Readiness</div>

                            <div className="lfm-flags-panel" style={{ marginBottom: '1.5rem', background: '#f8fafc' }}>
                                {isVisible('interestedInBbbee') && (
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.interestedInBbbee} onChange={e => setForm(p => ({ ...p, interestedInBbbee: e.target.checked }))} />
                                        <span>Our primary goal is to achieve B-BBEE Skills Development points or SETA compliance.</span>
                                    </label>
                                )}
                                {isVisible('etiAwareness') && (
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.etiAwareness} onChange={e => setForm(p => ({ ...p, etiAwareness: e.target.checked }))} />
                                        <span>We are aware of, or currently claiming, the Employment Tax Incentive (ETI).</span>
                                    </label>
                                )}
                                {isVisible('requiresAdvisory') && (
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.requiresAdvisory} onChange={e => setForm(p => ({ ...p, requiresAdvisory: e.target.checked }))} />
                                        <span>We would like mLab to provide advisory support regarding SETA funding and compliance benefits.</span>
                                    </label>
                                )}
                            </div>

                            <div className="lfm-grid">
                                {isVisible('taxCompliant') && (
                                    <div className="lfm-fg">
                                        <label>Tax Compliance Status</label>
                                        <select className="lfm-input lfm-select" value={form.taxCompliant} onChange={e => setForm(p => ({ ...p, taxCompliant: e.target.value }))}>
                                            <option value="Yes">Yes, fully compliant</option>
                                            <option value="No">No</option>
                                            <option value="In progress">In progress</option>
                                        </select>
                                    </div>
                                )}

                                {isVisible('bbbeeLevel') && (
                                    <div className="lfm-fg">
                                        <label>B-BBEE Level</label>
                                        <select className="lfm-input lfm-select" value={form.bbbeeLevel} onChange={e => setForm(p => ({ ...p, bbbeeLevel: e.target.value }))}>
                                            <option value="">Unknown / Pending</option>
                                            <option value="Level 1">Level 1</option>
                                            <option value="Level 2">Level 2</option>
                                            <option value="Level 3">Level 3</option>
                                            <option value="Level 4">Level 4</option>
                                            <option value="Non-Compliant">Non-Compliant</option>
                                            <option value="Exempt Micro Enterprise (EME)">Exempt Micro Enterprise (EME)</option>
                                        </select>
                                    </div>
                                )}

                                {isVisible('bbbeeAwareness') && (
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Familiarity with B-BBEE Skills Development requirements</label>
                                        <select className="lfm-input lfm-select" value={form.bbbeeAwareness} onChange={e => setForm(p => ({ ...p, bbbeeAwareness: e.target.value }))}>
                                            <option value="Somewhat">Somewhat familiar</option>
                                            <option value="Yes">Yes, highly familiar</option>
                                            <option value="No">No, require guidance</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* DYNAMIC CUSTOM FIELDS (From Form Builder) */}
                        {blueprint?.customFields && blueprint.customFields.length > 0 && (
                            <div style={{ marginBottom: '2.5rem' }}>
                                <div className="lfm-section-hdr"><ListPlus size={16} /> Additional Information</div>
                                <div className="lfm-grid" style={{ gridTemplateColumns: '1fr' }}>
                                    {blueprint.customFields.map((field: any) => (
                                        <div key={field.id} className="lfm-fg">
                                            <label>{field.label} {field.required && <span style={{ color: 'var(--mlab-red)' }}>*</span>}</label>
                                            {field.type === 'text' && <input type="text" className="lfm-input" required={field.required} value={customResponses[field.id] || ''} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))} />}
                                            {field.type === 'dropdown' && (
                                                <select className="lfm-input lfm-select" required={field.required} value={customResponses[field.id] || ''} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}>
                                                    <option value="">-- Select Option --</option>
                                                    {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            )}
                                            {field.type === 'checkbox' && (
                                                <div className="lfm-flags-panel" style={{ padding: '0.6rem 1rem', background: 'white' }}>
                                                    <label className="lfm-checkbox-row" style={{ margin: 0 }}>
                                                        <input type="checkbox" required={field.required} checked={!!customResponses[field.id]} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.checked }))} />
                                                        <span style={{ color: 'var(--mlab-midnight)' }}>Yes, confirmed</span>
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SECTION 6: REFERRAL & CONSENT */}
                        <div>
                            <div className="lfm-section-hdr"><ShieldAlert size={16} /> Referrals & Compliance</div>

                            <div className="lfm-grid" style={{ marginBottom: '1.5rem' }}>
                                <div className="lfm-fg">
                                    <label>Were you previously part of an mLab initiative?</label>
                                    <select className="lfm-input lfm-select" value={form.partOfMlabBefore} onChange={e => setForm(p => ({ ...p, partOfMlabBefore: e.target.value }))}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label>Where did you hear about us?</label>
                                    <select className="lfm-input lfm-select" value={form.whereDidYouHear} onChange={e => setForm(p => ({ ...p, whereDidYouHear: e.target.value }))}>
                                        <option value="">Select...</option>
                                        {HEAR_ABOUT_US.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label>Which organisation referred you? (Optional)</label>
                                    <input type="text" className="lfm-input" placeholder="Name of referrer" value={form.referredBy} onChange={e => setForm(p => ({ ...p, referredBy: e.target.value }))} />
                                </div>
                                <div className="lfm-fg" style={{ alignSelf: 'flex-end', paddingBottom: '8px' }}>
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.interestInED} onChange={e => setForm(p => ({ ...p, interestInED: e.target.checked }))} />
                                        <span>We are interested in the mLab Enterprise Development programme</span>
                                    </label>
                                </div>
                            </div>

                            <div className="lfm-flags-panel">
                                {isVisible('willingToSignWBL') && (
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.willingToSignWBL} onChange={e => setForm(p => ({ ...p, willingToSignWBL: e.target.checked }))} />
                                        <span>We are willing to sign formal Workplace-Based Learning Agreements</span>
                                    </label>
                                )}
                                {isVisible('hasHRPolicies') && (
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={form.hasHRPolicies} onChange={e => setForm(p => ({ ...p, hasHRPolicies: e.target.checked }))} />
                                        <span>We have basic HR policies and Code of Conduct in place</span>
                                    </label>
                                )}
                                <label className="lfm-checkbox-row" style={{ fontWeight: 700, marginTop: '0.5rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '0.5rem' }}>
                                    <input required type="checkbox" checked={form.dataConsent} onChange={e => setForm(p => ({ ...p, dataConsent: e.target.checked }))} />
                                    <span>I consent to mLab storing this data for placement matching. <span style={{ color: 'var(--mlab-red)' }}>*</span></span>
                                </label>
                            </div>
                        </div>

                    </div>

                    <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem', flexShrink: 0, borderTop: '2px solid var(--mlab-green)' }}>
                        <button type="submit" className="lfm-btn lfm-btn--primary" style={{ padding: '0.75rem 3rem', fontSize: '1rem', width: '100%', maxWidth: '300px', justifyContent: 'center' }} disabled={saving}>
                            {saving ? <><Loader2 className="lfm-spin" size={16} /> Submitting...</> : "Submit EOI"}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};


// // src/pages/Public/EmployerApplicationForm/EmployerApplicationForm.tsx

// import React, { useState, useEffect } from 'react';
// import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
// import Autocomplete from "react-google-autocomplete";
// import { Building2, MapPin, User, ShieldAlert, Loader2, CheckCircle2, Briefcase, ListPlus, Info, Target, Laptop, CreditCard, MonitorPlay, FileBadge } from 'lucide-react';
// import { db } from '../../../../lib/firebase';

// import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// const COMPANY_TYPES = [
//     "Private Company (Pty Ltd)",
//     "Non-Profit Organisation (NPO / NGO)",
//     "Close Corporation (CC)",
//     "Sole Proprietorship",
//     "Public Company (Ltd)",
//     "Partnership",
//     "Government / Public Sector",
//     "Other"
// ];

// const INDUSTRY_SECTORS = [
//     "ICT / Software Development",
//     "Data Science & Analytics",
//     "Design / UI / UX",
//     "Business / Operations",
//     "Agriculture / AgriTech",
//     "Healthcare / HealthTech",
//     "Finance / FinTech",
//     "Education / EdTech",
//     "Manufacturing & Logistics",
//     "Retail / E-commerce",
//     "Media & Communications",
//     "Other"
// ];

// const REVENUE_BANDS = [
//     "Pre-Revenue / Startup",
//     "Under R1 Million",
//     "R1 Million - R5 Million",
//     "R5 Million - R10 Million",
//     "R10 Million - R50 Million",
//     "Over R50 Million"
// ];

// const FUNDING_MODELS = [
//     "We require fully funded placements (SETA / mLab funded)",
//     "We can co-fund / top-up the stipend",
//     "We can fully fund the placement ourselves"
// ];

// const HEAR_ABOUT_US = [
//     "LinkedIn",
//     "Facebook / Twitter",
//     "mLab Website",
//     "Referred by an mLab Partner",
//     "Referred by a Colleague / Friend",
//     "Other"
// ];

// export const EmployerApplicationForm: React.FC = () => {
//     const [saving, setSaving] = useState(false);
//     const [submitted, setSubmitted] = useState(false);
//     const [blueprint, setBlueprint] = useState<any>(null);
//     const [customResponses, setCustomResponses] = useState<Record<string, any>>({});

//     useEffect(() => {
//         const fetchBlueprint = async () => {
//             try {
//                 const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
//                 if (settingsSnap.exists() && settingsSnap.data().employerFormBlueprint) {
//                     setBlueprint(settingsSnap.data().employerFormBlueprint);
//                 }
//             } catch (err) {
//                 console.error("Failed to load blueprint", err);
//             }
//         };
//         fetchBlueprint();
//     }, []);

//     const isVisible = (fieldId: string) => {
//         if (!blueprint || !blueprint.coreFieldVisibility) return true;
//         return blueprint.coreFieldVisibility[fieldId] !== false;
//     };

//     const [form, setForm] = useState({
//         // Organisation Info
//         name: '', tradingName: '', registrationNumber: '', companyType: '', vatNumber: '', bbbeeLevel: '', website: '',
//         businessDescription: '', industrySector: '',
//         // Contact & Capacity
//         contactPerson: '', contactEmail: '', contactPhone: '',
//         employeeCount: '', revenue: '',
//         // Hosting Intent
//         hostedBefore: 'No', internCapacity: 1, specificRoles: '', fundingModel: 'We require fully funded placements (SETA / mLab funded)', remuneration: '',
//         provideLaptop: 'No', workArrangement: 'On-site', daysAtOffice: '', likelihoodToHire: 'Medium', hasDedicatedMentors: 'No', expectedStartDate: '',
//         // Digital Needs
//         topNeededSolutions: '', certificationsNeeded: '',
//         // SETA & Compliance
//         taxCompliant: 'Yes', bbbeeAwareness: 'Somewhat', interestedInBbbee: false, etiAwareness: false, requiresAdvisory: false,
//         willingToSignWBL: true, hasHRPolicies: false, dataConsent: false,
//         // Referrals & Consent
//         partOfMlabBefore: 'No', whereDidYouHear: '', referredBy: '', interestInED: false,
//         // Geo
//         physicalAddress: '', province: '', lat: null as number | null, lng: null as number | null,
//     });

//     const handlePlaceSelected = (place: any) => {
//         let newLat = form.lat;
//         let newLng = form.lng;

//         if (place.geometry?.location) {
//             newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
//             newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
//         }

//         const components = place.address_components;
//         const provString = components?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
//         setForm(p => ({ ...p, physicalAddress: place.formatted_address || "", province: provString, lat: newLat, lng: newLng }));
//     };

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         if (!form.dataConsent) return alert("You must consent to data processing to submit this application.");

//         setSaving(true);
//         try {
//             const finalForm = {
//                 ...form,
//                 industrySector: form.industrySector ? [form.industrySector] : [],
//                 customResponses,
//                 status: 'Pending Review',
//                 mlabTier: 'Pending Assessment',
//                 mlabRiskRating: 'Pending',
//                 matchingPriorityScore: 0,
//                 internalNotes: 'Applied via public EOI web form.',
//             };

//             const ref = doc(collection(db, 'employers'));
//             await setDoc(ref, { ...finalForm, id: ref.id, createdAt: new Date().toISOString() });
//             setSubmitted(true);
//         } catch (err) {
//             alert("An error occurred while submitting your application. Please try again.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     if (submitted) {
//         return (
//             <div className="animate-fade-in" style={{ height: '100vh', width: '100vw', background: 'var(--mlab-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box' }}>
//                 <div className="lfm-modal" style={{ maxWidth: '500px', transform: 'none', height: 'auto', margin: 'auto' }}>
//                     <div className="lfm-header" style={{ justifyContent: 'center', padding: '2rem' }}>
//                         <CheckCircle2 size={48} color="var(--mlab-green)" />
//                     </div>
//                     <div className="lfm-body" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
//                         <h2 className="lfm-section-hdr" style={{ justifyContent: 'center', fontSize: '1.2rem', border: 'none', marginBottom: '1rem' }}>Expression of Interest Received</h2>
//                         <p style={{ color: 'var(--mlab-grey)', lineHeight: 1.6, marginBottom: '2.5rem', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
//                             Thank you for your interest in partnering with mLab. Our placements team will review your submission and contact you shortly regarding eligibility and next steps.
//                         </p>
//                         <button onClick={() => window.location.reload()} className="lfm-btn lfm-btn--primary" style={{ margin: '0 auto' }}>Submit Another Request</button>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div className="animate-fade-in" style={{ height: '100vh', width: '100vw', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', boxSizing: 'border-box' }}>

//             <div className="lfm-modal" style={{ maxWidth: '850px', width: '100%', maxHeight: 'calc(100vh - 2rem)', display: 'flex', flexDirection: 'column', transform: 'none', position: 'relative', margin: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>

//                 {/* Brand Header */}
//                 <div className="lfm-header" style={{ flexDirection: 'column', alignItems: 'center', padding: '1.5rem 2rem', gap: '0.5rem', flexShrink: 0 }}>
//                     <div style={{ background: 'rgba(148, 199, 61, 0.15)', padding: '0.75rem', borderRadius: '50%', border: '2px solid var(--mlab-green)' }}>
//                         <Briefcase size={28} color="var(--mlab-green)" />
//                     </div>
//                     <div style={{ textAlign: 'center' }}>
//                         <h1 className="lfm-header__title" style={{ fontSize: '1.4rem', justifyContent: 'center' }}>Expression of Interest – Host Employers</h1>
//                         <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: '0.25rem', fontFamily: 'var(--font-body)', maxWidth: '600px', marginInline: 'auto' }}>
//                             Partner with us to grow young talent, build your pipeline, and digitise your operations.
//                         </p>
//                     </div>
//                 </div>

//                 {/* Scrollable Form Area */}
//                 <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
//                     <div className="lfm-body" style={{ background: '#f8fafc', padding: '2rem', overflowY: 'auto' }}>

//                         {/* ABOUT MLAB CONTEXT BLOCK */}
//                         <div style={{ background: 'var(--mlab-white)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', marginBottom: '2.5rem' }}>
//                             <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-blue)', fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 <Info size={18} color="var(--mlab-green)" /> About mLab
//                             </h3>
//                             <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.6 }}>
//                                 Are you a business leader looking to grow your team? Are you in the process of, or interested in, digitising your operations? mLab is a non-profit organisation that prepares unemployed youth and entrepreneurs for opportunities within the digital economy. Established in 2011, we have a strong focus on empowering youth and driving inclusivity within the ICT sector.
//                             </p>
//                             <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.6 }}>
//                                 <strong>Your Turn:</strong> To be part of this initiative, we need to understand your needs and interest. Please fill in this short form.
//                             </p>
//                             <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'var(--mlab-bg)', padding: '0.75rem', borderRadius: '4px' }}>
//                                 <em>Note: This form serves as an expression of interest only. It helps us determine collaboration eligibility and is not a binding agreement.</em>
//                             </div>
//                         </div>

//                         {/* SECTION 1: ORG INFO */}
//                         <div style={{ marginBottom: '2.5rem' }}>
//                             <div className="lfm-section-hdr"><Building2 size={16} /> Organisation Details</div>
//                             <div className="lfm-grid">
//                                 <div className="lfm-fg">
//                                     <label>Business / Organisation Name *</label>
//                                     <input required type="text" className="lfm-input" placeholder="e.g. Acme Tech Solutions" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
//                                 </div>
//                                 {isVisible('tradingName') && (
//                                     <div className="lfm-fg">
//                                         <label>Trading Name</label>
//                                         <input type="text" className="lfm-input" placeholder="If different from registered name" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
//                                     </div>
//                                 )}
//                                 <div className="lfm-fg">
//                                     <label>Type of Business *</label>
//                                     <select required className="lfm-input lfm-select" value={form.companyType} onChange={e => setForm(p => ({ ...p, companyType: e.target.value }))}>
//                                         <option value="">Select Company Structure...</option>
//                                         {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
//                                     </select>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>CIPC / Registration Number *</label>
//                                     <input required type="text" className="lfm-input" placeholder="e.g. 2021/123456/07" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
//                                 </div>

//                                 {isVisible('vatNumber') && (
//                                     <div className="lfm-fg">
//                                         <label>VAT Number (If Applicable)</label>
//                                         <input type="text" className="lfm-input" placeholder="e.g. 4012345678" value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} />
//                                     </div>
//                                 )}
//                                 {isVisible('website') && (
//                                     <div className="lfm-fg">
//                                         <label>Website</label>
//                                         <input type="url" className="lfm-input" placeholder="https://www.yourcompany.com" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
//                                     </div>
//                                 )}

//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Primary Industry Sector *</label>
//                                     <select required className="lfm-input lfm-select" value={form.industrySector} onChange={e => setForm(p => ({ ...p, industrySector: e.target.value }))}>
//                                         <option value="">Select Primary Sector...</option>
//                                         {INDUSTRY_SECTORS.map(t => <option key={t} value={t}>{t}</option>)}
//                                     </select>
//                                 </div>

//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Brief Business Description *</label>
//                                     <textarea required className="lfm-input" rows={2} placeholder="What does your organisation do?" value={form.businessDescription} onChange={e => setForm(p => ({ ...p, businessDescription: e.target.value }))} style={{ resize: 'vertical' }} />
//                                 </div>

//                                 <div className="lfm-fg lfm-fg--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px', marginTop: '0.5rem' }}>
//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)' }}>
//                                         <MapPin size={13} /> Primary Physical Office Address *
//                                     </label>
//                                     <Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ types: [], componentRestrictions: { country: "za" } }} className="lfm-input" placeholder="Search for your company address..." required />
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 2: CONTACT & CAPACITY */}
//                         <div style={{ marginBottom: '2.5rem' }}>
//                             <div className="lfm-section-hdr"><User size={16} /> Contact & Team Capacity</div>
//                             <div className="lfm-grid">
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Primary Contact Name *</label>
//                                     <input required type="text" className="lfm-input" placeholder="Jane Doe" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Contact Email *</label>
//                                     <input required type="email" className="lfm-input" placeholder="jane@company.com" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Contact Mobile Number *</label>
//                                     <input required type="tel" className="lfm-input" placeholder="082 123 4567" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
//                                 </div>
//                                 {isVisible('employeeCount') && (
//                                     <div className="lfm-fg">
//                                         <label>Current Team Size</label>
//                                         <input type="number" min="1" className="lfm-input" placeholder="Total current employees" value={form.employeeCount} onChange={e => setForm(p => ({ ...p, employeeCount: e.target.value }))} />
//                                     </div>
//                                 )}
//                                 <div className="lfm-fg">
//                                     <label>Business Annual Revenue</label>
//                                     <select className="lfm-input lfm-select" value={form.revenue} onChange={e => setForm(p => ({ ...p, revenue: e.target.value }))}>
//                                         <option value="">Select Bracket...</option>
//                                         {REVENUE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
//                                     </select>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 3: HOSTING INTEREST & LOGISTICS */}
//                         <div style={{ marginBottom: '2.5rem' }}>
//                             <div className="lfm-section-hdr"><Target size={16} /> Hosting Intent & Logistics</div>
//                             <div className="lfm-grid">
//                                 <div className="lfm-fg">
//                                     <label>Have you hosted placements before?</label>
//                                     <select className="lfm-input lfm-select" value={form.hostedBefore} onChange={e => setForm(p => ({ ...p, hostedBefore: e.target.value }))}>
//                                         <option value="No">No</option>
//                                         <option value="Yes">Yes</option>
//                                     </select>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label style={{ color: 'var(--mlab-blue)' }}>How many graduates can you host? *</label>
//                                     <input required type="number" min="1" max="100" className="lfm-input" style={{ fontWeight: 'bold' }} value={form.internCapacity || ''} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
//                                 </div>
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Specific roles looking to fill?</label>
//                                     <input type="text" className="lfm-input" placeholder="e.g. Junior Developer, Data Analyst, UI Designer" value={form.specificRoles} onChange={e => setForm(p => ({ ...p, specificRoles: e.target.value }))} />
//                                 </div>

//                                 <div className="lfm-fg lfm-fg--full" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '6px' }}>
//                                     <label style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><CreditCard size={14} /> Placement Funding Model *</label>
//                                     <select required className="lfm-input lfm-select" value={form.fundingModel} onChange={e => setForm(p => ({ ...p, fundingModel: e.target.value }))}>
//                                         {FUNDING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
//                                     </select>
//                                     <span style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '4px' }}>Preference is provided to organisations that can fully or partially fund talent placements.</span>
//                                 </div>

//                                 {form.fundingModel !== "We require fully funded placements (SETA / mLab funded)" && (
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Monthly Remuneration / Top-up able to provide (per candidate)?</label>
//                                         <input type="text" className="lfm-input" placeholder="e.g. R3,000 top-up" value={form.remuneration} onChange={e => setForm(p => ({ ...p, remuneration: e.target.value }))} />
//                                     </div>
//                                 )}

//                                 <div className="lfm-fg">
//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Laptop size={13} /> Provide a laptop to candidates?</label>
//                                     <select className="lfm-input lfm-select" value={form.provideLaptop} onChange={e => setForm(p => ({ ...p, provideLaptop: e.target.value }))}>
//                                         <option value="No">No, they need their own / mLab provided</option>
//                                         <option value="Yes">Yes, we will provide hardware</option>
//                                     </select>
//                                 </div>

//                                 {isVisible('expectedStartDate') && (
//                                     <div className="lfm-fg">
//                                         <label>Ideal Start Date</label>
//                                         <input type="date" className="lfm-input" value={form.expectedStartDate} onChange={e => setForm(p => ({ ...p, expectedStartDate: e.target.value }))} />
//                                     </div>
//                                 )}

//                                 {isVisible('workArrangement') && (
//                                     <div className="lfm-fg">
//                                         <label>Work Arrangement</label>
//                                         <select className="lfm-input lfm-select" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
//                                             <option value="On-site">On-site (Office)</option>
//                                             <option value="Hybrid">Hybrid</option>
//                                             <option value="Remote">100% Remote</option>
//                                         </select>
//                                     </div>
//                                 )}

//                                 {form.workArrangement !== 'Remote' && (
//                                     <div className="lfm-fg">
//                                         <label>Days per week at the office?</label>
//                                         <input type="text" className="lfm-input" placeholder="e.g. 3 days" value={form.daysAtOffice} onChange={e => setForm(p => ({ ...p, daysAtOffice: e.target.value }))} />
//                                     </div>
//                                 )}

//                                 <div className="lfm-fg">
//                                     <label>Likelihood to offer a job post-placement?</label>
//                                     <select className="lfm-input lfm-select" value={form.likelihoodToHire} onChange={e => setForm(p => ({ ...p, likelihoodToHire: e.target.value }))}>
//                                         <option value="High">High - We are looking to hire permanently</option>
//                                         <option value="Medium">Medium - Depends on performance/budget</option>
//                                         <option value="Low">Low - Purely for skills development</option>
//                                     </select>
//                                 </div>

//                                 {isVisible('hasDedicatedMentors') && (
//                                     <div className="lfm-fg">
//                                         <label>Dedicated Mentors Available?</label>
//                                         <select className="lfm-input lfm-select" value={form.hasDedicatedMentors} onChange={e => setForm(p => ({ ...p, hasDedicatedMentors: e.target.value }))}>
//                                             <option value="Yes">Yes, assigned capacity</option>
//                                             <option value="Partially">Partially / Shared</option>
//                                             <option value="No">No, team-based shadowing</option>
//                                         </select>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* SECTION 4: DIGITAL NEEDS */}
//                         <div style={{ marginBottom: '2.5rem' }}>
//                             <div className="lfm-section-hdr"><MonitorPlay size={16} /> Business Digitisation Needs</div>
//                             <div className="lfm-grid">
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Top 2 Needed Digital Solutions</label>
//                                     <input type="text" className="lfm-input" placeholder="e.g. A new e-commerce website, Inventory Management App" value={form.topNeededSolutions} onChange={e => setForm(p => ({ ...p, topNeededSolutions: e.target.value }))} />
//                                 </div>
//                                 <div className="lfm-fg lfm-fg--full">
//                                     <label>Preferred Certifications for Talent</label>
//                                     <input type="text" className="lfm-input" placeholder="e.g. AWS Cloud Practitioner, SCRUM Master, CCNA" value={form.certificationsNeeded} onChange={e => setForm(p => ({ ...p, certificationsNeeded: e.target.value }))} />
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 5: SETA, B-BBEE & COMPLIANCE */}
//                         <div style={{ marginBottom: '2.5rem' }}>
//                             <div className="lfm-section-hdr"><FileBadge size={16} /> SETA, B-BBEE & Compliance Readiness</div>

//                             <div className="lfm-flags-panel" style={{ marginBottom: '1.5rem', background: '#f8fafc' }}>
//                                 {isVisible('interestedInBbbee') && (
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.interestedInBbbee} onChange={e => setForm(p => ({ ...p, interestedInBbbee: e.target.checked }))} />
//                                         <span>Our primary goal is to achieve B-BBEE Skills Development points or SETA compliance.</span>
//                                     </label>
//                                 )}
//                                 {isVisible('etiAwareness') && (
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.etiAwareness} onChange={e => setForm(p => ({ ...p, etiAwareness: e.target.checked }))} />
//                                         <span>We are aware of, or currently claiming, the Employment Tax Incentive (ETI).</span>
//                                     </label>
//                                 )}
//                                 {isVisible('requiresAdvisory') && (
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.requiresAdvisory} onChange={e => setForm(p => ({ ...p, requiresAdvisory: e.target.checked }))} />
//                                         <span>We would like mLab to provide advisory support regarding SETA funding and compliance benefits.</span>
//                                     </label>
//                                 )}
//                             </div>

//                             <div className="lfm-grid">
//                                 {isVisible('taxCompliant') && (
//                                     <div className="lfm-fg">
//                                         <label>Tax Compliance Status</label>
//                                         <select className="lfm-input lfm-select" value={form.taxCompliant} onChange={e => setForm(p => ({ ...p, taxCompliant: e.target.value }))}>
//                                             <option value="Yes">Yes, fully compliant</option>
//                                             <option value="No">No</option>
//                                             <option value="In progress">In progress</option>
//                                         </select>
//                                     </div>
//                                 )}

//                                 {isVisible('bbbeeLevel') && (
//                                     <div className="lfm-fg">
//                                         <label>B-BBEE Level</label>
//                                         <select className="lfm-input lfm-select" value={form.bbbeeLevel} onChange={e => setForm(p => ({ ...p, bbbeeLevel: e.target.value }))}>
//                                             <option value="">Unknown / Pending</option>
//                                             <option value="Level 1">Level 1</option>
//                                             <option value="Level 2">Level 2</option>
//                                             <option value="Level 3">Level 3</option>
//                                             <option value="Level 4">Level 4</option>
//                                             <option value="Non-Compliant">Non-Compliant</option>
//                                             <option value="Exempt Micro Enterprise (EME)">Exempt Micro Enterprise (EME)</option>
//                                         </select>
//                                     </div>
//                                 )}

//                                 {isVisible('bbbeeAwareness') && (
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Familiarity with B-BBEE Skills Development requirements</label>
//                                         <select className="lfm-input lfm-select" value={form.bbbeeAwareness} onChange={e => setForm(p => ({ ...p, bbbeeAwareness: e.target.value }))}>
//                                             <option value="Somewhat">Somewhat familiar</option>
//                                             <option value="Yes">Yes, highly familiar</option>
//                                             <option value="No">No, require guidance</option>
//                                         </select>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* DYNAMIC CUSTOM FIELDS (From Form Builder) */}
//                         {blueprint?.customFields && blueprint.customFields.length > 0 && (
//                             <div style={{ marginBottom: '2.5rem' }}>
//                                 <div className="lfm-section-hdr"><ListPlus size={16} /> Additional Information</div>
//                                 <div className="lfm-grid" style={{ gridTemplateColumns: '1fr' }}>
//                                     {blueprint.customFields.map((field: any) => (
//                                         <div key={field.id} className="lfm-fg">
//                                             <label>{field.label} {field.required && <span style={{ color: 'var(--mlab-red)' }}>*</span>}</label>
//                                             {field.type === 'text' && <input type="text" className="lfm-input" required={field.required} value={customResponses[field.id] || ''} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))} />}
//                                             {field.type === 'dropdown' && (
//                                                 <select className="lfm-input lfm-select" required={field.required} value={customResponses[field.id] || ''} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}>
//                                                     <option value="">-- Select Option --</option>
//                                                     {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
//                                                 </select>
//                                             )}
//                                             {field.type === 'checkbox' && (
//                                                 <div className="lfm-flags-panel" style={{ padding: '0.6rem 1rem', background: 'white' }}>
//                                                     <label className="lfm-checkbox-row" style={{ margin: 0 }}>
//                                                         <input type="checkbox" required={field.required} checked={!!customResponses[field.id]} onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.checked }))} />
//                                                         <span style={{ color: 'var(--mlab-midnight)' }}>Yes, confirmed</span>
//                                                     </label>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     ))}
//                                 </div>
//                             </div>
//                         )}

//                         {/* SECTION 6: REFERRAL & CONSENT */}
//                         <div>
//                             <div className="lfm-section-hdr"><ShieldAlert size={16} /> Referrals & Compliance</div>

//                             <div className="lfm-grid" style={{ marginBottom: '1.5rem' }}>
//                                 <div className="lfm-fg">
//                                     <label>Were you previously part of an mLab initiative?</label>
//                                     <select className="lfm-input lfm-select" value={form.partOfMlabBefore} onChange={e => setForm(p => ({ ...p, partOfMlabBefore: e.target.value }))}>
//                                         <option value="No">No</option>
//                                         <option value="Yes">Yes</option>
//                                     </select>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Where did you hear about us?</label>
//                                     <select className="lfm-input lfm-select" value={form.whereDidYouHear} onChange={e => setForm(p => ({ ...p, whereDidYouHear: e.target.value }))}>
//                                         <option value="">Select...</option>
//                                         {HEAR_ABOUT_US.map(m => <option key={m} value={m}>{m}</option>)}
//                                     </select>
//                                 </div>
//                                 <div className="lfm-fg">
//                                     <label>Which organisation referred you? (Optional)</label>
//                                     <input type="text" className="lfm-input" placeholder="Name of referrer" value={form.referredBy} onChange={e => setForm(p => ({ ...p, referredBy: e.target.value }))} />
//                                 </div>
//                                 <div className="lfm-fg" style={{ alignSelf: 'flex-end', paddingBottom: '8px' }}>
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.interestInED} onChange={e => setForm(p => ({ ...p, interestInED: e.target.checked }))} />
//                                         <span>We are interested in the mLab Enterprise Development programme</span>
//                                     </label>
//                                 </div>
//                             </div>

//                             <div className="lfm-flags-panel">
//                                 {isVisible('willingToSignWBL') && (
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.willingToSignWBL} onChange={e => setForm(p => ({ ...p, willingToSignWBL: e.target.checked }))} />
//                                         <span>We are willing to sign formal Workplace-Based Learning Agreements</span>
//                                     </label>
//                                 )}
//                                 {isVisible('hasHRPolicies') && (
//                                     <label className="lfm-checkbox-row">
//                                         <input type="checkbox" checked={form.hasHRPolicies} onChange={e => setForm(p => ({ ...p, hasHRPolicies: e.target.checked }))} />
//                                         <span>We have basic HR policies and Code of Conduct in place</span>
//                                     </label>
//                                 )}
//                                 <label className="lfm-checkbox-row" style={{ fontWeight: 700, marginTop: '0.5rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '0.5rem' }}>
//                                     <input required type="checkbox" checked={form.dataConsent} onChange={e => setForm(p => ({ ...p, dataConsent: e.target.checked }))} />
//                                     <span>I consent to mLab storing this data for placement matching. <span style={{ color: 'var(--mlab-red)' }}>*</span></span>
//                                 </label>
//                             </div>
//                         </div>

//                     </div>

//                     <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem', flexShrink: 0, borderTop: '2px solid var(--mlab-green)' }}>
//                         <button type="submit" className="lfm-btn lfm-btn--primary" style={{ padding: '0.75rem 3rem', fontSize: '1rem', width: '100%', maxWidth: '300px', justifyContent: 'center' }} disabled={saving}>
//                             {saving ? <><Loader2 className="lfm-spin" size={16} /> Submitting...</> : "Submit EOI"}
//                         </button>
//                     </div>

//                 </form>
//             </div>
//         </div>
//     );
// };

// // // src/pages/Public/EmployerApplicationForm/EmployerApplicationForm.tsx

// // import React, { useState, useEffect } from 'react';
// // import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
// // import Autocomplete from "react-google-autocomplete";
// // import { Building2, MapPin, User, ShieldAlert, Loader2, CheckCircle2, Briefcase, ListPlus } from 'lucide-react';
// // import { db } from '../../../../lib/firebase';

// // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // export const EmployerApplicationForm: React.FC = () => {
// //     const [saving, setSaving] = useState(false);
// //     const [submitted, setSubmitted] = useState(false);

// //     // Blueprint State (Loaded from Firebase)
// //     const [blueprint, setBlueprint] = useState<any>(null);
// //     const [customResponses, setCustomResponses] = useState<Record<string, any>>({});

// //     // Fetch the Form Blueprint from global settings so we know what to hide/show!
// //     useEffect(() => {
// //         const fetchBlueprint = async () => {
// //             try {
// //                 const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
// //                 if (settingsSnap.exists()) {
// //                     const data = settingsSnap.data();
// //                     if (data.employerFormBlueprint) {
// //                         setBlueprint(data.employerFormBlueprint);
// //                     }
// //                 }
// //             } catch (err) {
// //                 console.error("Failed to load custom form fields", err);
// //             }
// //         };
// //         fetchBlueprint();
// //     }, []);

// //     // Helper to check if a core field is toggled ON or OFF in the builder
// //     const isVisible = (fieldId: string) => {
// //         if (!blueprint || !blueprint.coreFieldVisibility) return true; // Default to true if not configured
// //         return blueprint.coreFieldVisibility[fieldId] !== false;
// //     };

// //     const [form, setForm] = useState({
// //         name: '', tradingName: '', registrationNumber: '', vatNumber: '', bbbeeLevel: '',
// //         contactPerson: '', contactEmail: '', contactPhone: '', industrySectorStr: '',
// //         techStackStr: '', employeeCount: 0, internCapacity: 1, workArrangement: 'On-site',
// //         hasDedicatedMentors: 'No', willingToSignWBL: true, taxCompliant: 'Yes',
// //         hasHRPolicies: false, etiAwareness: false, dataConsent: false,
// //         physicalAddress: '', province: '', lat: null as number | null, lng: null as number | null,
// //     });

// //     const handlePlaceSelected = (place: any) => {
// //         let newLat = form.lat;
// //         let newLng = form.lng;

// //         if (place.geometry && place.geometry.location) {
// //             newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// //             newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// //         }

// //         const addressComponents = place.address_components;
// //         const provString = addressComponents?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
// //         const formatted = place.formatted_address || "";

// //         setForm(p => ({ ...p, physicalAddress: formatted, province: provString, lat: newLat, lng: newLng }));
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();

// //         if (!form.dataConsent) {
// //             alert("You must consent to data processing to submit this application.");
// //             return;
// //         }

// //         setSaving(true);
// //         try {
// //             const finalForm = {
// //                 ...form,
// //                 industrySector: form.industrySectorStr.split(',').map(s => s.trim()).filter(Boolean),
// //                 techStack: form.techStackStr.split(',').map(s => s.trim()).filter(Boolean),
// //                 customResponses, // Append all dynamic Funder/SETA answers here
// //                 status: 'Pending Review',
// //                 mlabTier: 'Pending Assessment',
// //                 mlabRiskRating: 'Pending',
// //                 matchingPriorityScore: 0,
// //                 internalNotes: 'Applied via public web form.',
// //             };

// //             delete (finalForm as any).industrySectorStr;
// //             delete (finalForm as any).techStackStr;

// //             const ref = doc(collection(db, 'employers'));
// //             await setDoc(ref, { ...finalForm, id: ref.id, createdAt: new Date().toISOString() });

// //             setSubmitted(true);
// //             window.scrollTo({ top: 0, behavior: 'smooth' });
// //         } catch (err) {
// //             alert("An error occurred while submitting your application. Please try again.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     if (submitted) {
// //         return (
// //             <div className="animate-fade-in" style={{ minHeight: '100vh', background: 'var(--mlab-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
// //                 <div className="lfm-modal" style={{ maxWidth: '500px', transform: 'none', height: 'auto' }}>
// //                     <div className="lfm-header" style={{ justifyContent: 'center', padding: '2rem' }}>
// //                         <CheckCircle2 size={48} color="var(--mlab-green)" />
// //                     </div>
// //                     <div className="lfm-body" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
// //                         <h2 className="lfm-section-hdr" style={{ justifyContent: 'center', fontSize: '1.2rem', border: 'none', marginBottom: '1rem' }}>Application Received</h2>
// //                         <p style={{ color: 'var(--mlab-grey)', lineHeight: 1.6, marginBottom: '2.5rem', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
// //                             Thank you for applying to become a Host Employer Partner. Our placements team will review your application and contact you shortly regarding the next steps and capacity matching.
// //                         </p>
// //                         <button onClick={() => window.location.reload()} className="lfm-btn lfm-btn--primary" style={{ margin: '0 auto' }}>
// //                             Submit Another Request
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="animate-fade-in" style={{ minHeight: '100vh', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'center', padding: '2rem 1rem' }}>

// //             {/* The Main Application Card, utilizing the Modal CSS for aesthetic consistency */}
// //             <div className="lfm-modal" style={{ maxWidth: '850px', width: '100%', height: 'auto', transform: 'none', position: 'relative' }}>

// //                 {/* Brand Header */}
// //                 <div className="lfm-header" style={{ flexDirection: 'column', alignItems: 'center', padding: '2.5rem 2rem', gap: '1rem' }}>
// //                     <div style={{ background: 'rgba(148, 199, 61, 0.15)', padding: '1rem', borderRadius: '50%', border: '2px solid var(--mlab-green)' }}>
// //                         <Briefcase size={32} color="var(--mlab-green)" />
// //                     </div>
// //                     <div style={{ textAlign: 'center' }}>
// //                         <h1 className="lfm-header__title" style={{ fontSize: '1.6rem', justifyContent: 'center' }}>Host an Intern</h1>
// //                         <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginTop: '0.5rem', fontFamily: 'var(--font-body)', maxWidth: '600px', marginInline: 'auto' }}>
// //                             Partner with us to grow young talent, build your pipeline, and earn B-BBEE Skills Development recognition.
// //                         </p>
// //                     </div>
// //                 </div>

// //                 <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
// //                     <div className="lfm-body" style={{ background: '#f8fafc', padding: '2rem' }}>

// //                         {/* SECTION 1: ORG INFO */}
// //                         <div style={{ marginBottom: '2.5rem' }}>
// //                             <div className="lfm-section-hdr">
// //                                 <Building2 size={16} /> Organisation Details
// //                             </div>
// //                             <div className="lfm-grid">
// //                                 {/* MANDATORY CORE FIELDS */}
// //                                 <div className="lfm-fg">
// //                                     <label>Registered Company Name *</label>
// //                                     <input required type="text" className="lfm-input" placeholder="e.g. Acme Tech Solutions" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
// //                                 </div>
// //                                 <div className="lfm-fg">
// //                                     <label>CIPC Registration Number *</label>
// //                                     <input required type="text" className="lfm-input" placeholder="2021/123456/07" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
// //                                 </div>

// //                                 {/* TOGGLEABLE CORE FIELDS */}
// //                                 {isVisible('tradingName') && (
// //                                     <div className="lfm-fg">
// //                                         <label>Trading Name</label>
// //                                         <input type="text" className="lfm-input" placeholder="If different from registered name" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
// //                                     </div>
// //                                 )}

// //                                 {isVisible('bbbeeLevel') && (
// //                                     <div className="lfm-fg">
// //                                         <label>B-BBEE Level</label>
// //                                         <select className="lfm-input lfm-select" value={form.bbbeeLevel} onChange={e => setForm(p => ({ ...p, bbbeeLevel: e.target.value }))}>
// //                                             <option value="">Unknown / Pending</option>
// //                                             <option value="Level 1">Level 1</option>
// //                                             <option value="Level 2">Level 2</option>
// //                                             <option value="Level 3">Level 3</option>
// //                                             <option value="Level 4">Level 4</option>
// //                                             <option value="Non-Compliant">Non-Compliant</option>
// //                                             <option value="Exempt Micro Enterprise (EME)">Exempt Micro Enterprise (EME)</option>
// //                                         </select>
// //                                     </div>
// //                                 )}

// //                                 {isVisible('industrySector') && (
// //                                     <div className="lfm-fg lfm-fg--full">
// //                                         <label>Industry Sectors (Comma separated)</label>
// //                                         <input type="text" className="lfm-input" placeholder="e.g. Fintech, Software Development, EdTech" value={form.industrySectorStr} onChange={e => setForm(p => ({ ...p, industrySectorStr: e.target.value }))} />
// //                                     </div>
// //                                 )}

// //                                 {/* MANDATORY MAPS FIELD */}
// //                                 <div className="lfm-fg lfm-fg--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px', marginTop: '0.5rem' }}>
// //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)' }}>
// //                                         <MapPin size={13} /> Physical Address *
// //                                     </label>
// //                                     <Autocomplete
// //                                         apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// //                                         onPlaceSelected={handlePlaceSelected}
// //                                         options={{ types: [], componentRestrictions: { country: "za" } }}
// //                                         className="lfm-input"
// //                                         placeholder="Search for your company address to auto-verify..."
// //                                         required
// //                                     />
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {/* SECTION 2: CONTACT & LOGISTICS */}
// //                         <div style={{ marginBottom: '2.5rem' }}>
// //                             <div className="lfm-section-hdr">
// //                                 <User size={16} /> Point of Contact & Logistics
// //                             </div>
// //                             <div className="lfm-grid">
// //                                 {/* MANDATORY CONTACT */}
// //                                 <div className="lfm-fg lfm-fg--full">
// //                                     <label>Contact Person Name *</label>
// //                                     <input required type="text" className="lfm-input" placeholder="Jane Doe" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
// //                                 </div>
// //                                 <div className="lfm-fg">
// //                                     <label>Contact Email *</label>
// //                                     <input required type="email" className="lfm-input" placeholder="jane@company.com" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
// //                                 </div>
// //                                 <div className="lfm-fg">
// //                                     <label>Contact Phone Number *</label>
// //                                     <input required type="tel" className="lfm-input" placeholder="082 123 4567" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
// //                                 </div>
// //                                 <div className="lfm-fg lfm-fg--full" style={{ background: 'var(--mlab-bg)', padding: '1rem', border: '1px solid var(--mlab-border)', borderRadius: '6px', marginTop: '0.5rem' }}>
// //                                     <label style={{ color: 'var(--mlab-blue)' }}>How many learners can you host? *</label>
// //                                     <input required type="number" min="1" max="100" className="lfm-input" style={{ fontWeight: 'bold' }} value={form.internCapacity || ''} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
// //                                 </div>

// //                                 {/* TOGGLEABLE WORK ENVIRONMENT */}
// //                                 {isVisible('workArrangement') && (
// //                                     <div className="lfm-fg">
// //                                         <label>Work Arrangement</label>
// //                                         <select className="lfm-input lfm-select" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
// //                                             <option value="On-site">On-site (Office)</option>
// //                                             <option value="Hybrid">Hybrid</option>
// //                                             <option value="Remote">100% Remote</option>
// //                                         </select>
// //                                     </div>
// //                                 )}

// //                                 {isVisible('hasDedicatedMentors') && (
// //                                     <div className="lfm-fg">
// //                                         <label>Do you have dedicated mentors?</label>
// //                                         <select className="lfm-input lfm-select" value={form.hasDedicatedMentors} onChange={e => setForm(p => ({ ...p, hasDedicatedMentors: e.target.value }))}>
// //                                             <option value="Yes">Yes, assigned capacity</option>
// //                                             <option value="Partially">Partially / Shared</option>
// //                                             <option value="No">No, team-based shadowing</option>
// //                                         </select>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>

// //                         {/* DYNAMIC CUSTOM FIELDS (From Form Builder) */}
// //                         {blueprint?.customFields && blueprint.customFields.length > 0 && (
// //                             <div style={{ marginBottom: '2.5rem' }}>
// //                                 <div className="lfm-section-hdr">
// //                                     <ListPlus size={16} /> Additional Information
// //                                 </div>
// //                                 <div className="lfm-grid" style={{ gridTemplateColumns: '1fr' }}>
// //                                     {blueprint.customFields.map((field: any) => (
// //                                         <div key={field.id} className="lfm-fg">
// //                                             <label>
// //                                                 {field.label} {field.required && <span style={{ color: 'var(--mlab-red)' }}>*</span>}
// //                                             </label>

// //                                             {field.type === 'text' && (
// //                                                 <input
// //                                                     type="text"
// //                                                     className="lfm-input"
// //                                                     required={field.required}
// //                                                     value={customResponses[field.id] || ''}
// //                                                     onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}
// //                                                 />
// //                                             )}

// //                                             {field.type === 'dropdown' && (
// //                                                 <select
// //                                                     className="lfm-input lfm-select"
// //                                                     required={field.required}
// //                                                     value={customResponses[field.id] || ''}
// //                                                     onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}
// //                                                 >
// //                                                     <option value="">-- Select Option --</option>
// //                                                     {field.options?.map((opt: string) => (
// //                                                         <option key={opt} value={opt}>{opt}</option>
// //                                                     ))}
// //                                                 </select>
// //                                             )}

// //                                             {field.type === 'checkbox' && (
// //                                                 <div className="lfm-flags-panel" style={{ padding: '0.6rem 1rem', background: 'white' }}>
// //                                                     <label className="lfm-checkbox-row" style={{ margin: 0 }}>
// //                                                         <input
// //                                                             type="checkbox"
// //                                                             required={field.required}
// //                                                             checked={!!customResponses[field.id]}
// //                                                             onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.checked }))}
// //                                                         />
// //                                                         <span style={{ color: 'var(--mlab-midnight)' }}>Yes, confirmed</span>
// //                                                     </label>
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>
// //                         )}

// //                         {/* CORE FIELDS: COMPLIANCE & CONSENT */}
// //                         <div>
// //                             <div className="lfm-section-hdr">
// //                                 <ShieldAlert size={16} /> Compliance & Agreements
// //                             </div>
// //                             <div className="lfm-flags-panel">
// //                                 {isVisible('willingToSignWBL') && (
// //                                     <label className="lfm-checkbox-row">
// //                                         <input type="checkbox" checked={form.willingToSignWBL} onChange={e => setForm(p => ({ ...p, willingToSignWBL: e.target.checked }))} />
// //                                         <span>We are willing to sign formal Workplace-Based Learning (WBL) Tripartite Agreements</span>
// //                                     </label>
// //                                 )}

// //                                 {isVisible('hasHRPolicies') && (
// //                                     <label className="lfm-checkbox-row">
// //                                         <input type="checkbox" checked={form.hasHRPolicies} onChange={e => setForm(p => ({ ...p, hasHRPolicies: e.target.checked }))} />
// //                                         <span>We have basic HR and Code of Conduct policies in place</span>
// //                                     </label>
// //                                 )}

// //                                 <hr style={{ border: 'none', borderBottom: '1px solid var(--mlab-border)', margin: '0.5rem 0' }} />

// //                                 <label className="lfm-checkbox-row" style={{ fontWeight: 700 }}>
// //                                     <input required type="checkbox" checked={form.dataConsent} onChange={e => setForm(p => ({ ...p, dataConsent: e.target.checked }))} />
// //                                     <span>I consent to mLab collecting and storing this data for the purpose of placement matching and SETA reporting. <span style={{ color: 'var(--mlab-red)' }}>*</span></span>
// //                                 </label>
// //                             </div>
// //                         </div>

// //                     </div>

// //                     <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1.5rem' }}>
// //                         <button type="submit" className="lfm-btn lfm-btn--primary" style={{ padding: '0.8rem 3rem', fontSize: '1rem' }} disabled={saving}>
// //                             {saving ? <><Loader2 className="lfm-spin" size={16} /> Submitting...</> : "Submit Application"}
// //                         </button>
// //                     </div>

// //                 </form>
// //             </div>
// //         </div>
// //     );
// // };


// // // // src/pages/Public/EmployerApplicationForm/EmployerApplicationForm.tsx

// // // import React, { useState, useEffect } from 'react';
// // // import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
// // // import Autocomplete from "react-google-autocomplete";
// // // import { Building2, MapPin, User, ShieldAlert, Loader2, CheckCircle2, Briefcase, ListPlus } from 'lucide-react';
// // // import { db } from '../../../../lib/firebase';

// // // export const EmployerApplicationForm: React.FC = () => {
// // //     const [saving, setSaving] = useState(false);
// // //     const [submitted, setSubmitted] = useState(false);

// // //     // Blueprint State (Loaded from Firebase)
// // //     const [blueprint, setBlueprint] = useState<any>(null);
// // //     const [customResponses, setCustomResponses] = useState<Record<string, any>>({});

// // //     // Fetch the Form Blueprint from global settings so we know what to hide/show!
// // //     useEffect(() => {
// // //         const fetchBlueprint = async () => {
// // //             try {
// // //                 const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
// // //                 if (settingsSnap.exists()) {
// // //                     const data = settingsSnap.data();
// // //                     if (data.employerFormBlueprint) {
// // //                         setBlueprint(data.employerFormBlueprint);
// // //                     }
// // //                 }
// // //             } catch (err) {
// // //                 console.error("Failed to load custom form fields", err);
// // //             }
// // //         };
// // //         fetchBlueprint();
// // //     }, []);

// // //     // Helper to check if a core field is toggled ON or OFF in the builder
// // //     const isVisible = (fieldId: string) => {
// // //         if (!blueprint || !blueprint.coreFieldVisibility) return true; // Default to true if not configured
// // //         return blueprint.coreFieldVisibility[fieldId] !== false;
// // //     };

// // //     const [form, setForm] = useState({
// // //         name: '', tradingName: '', registrationNumber: '', vatNumber: '', bbbeeLevel: '',
// // //         contactPerson: '', contactEmail: '', contactPhone: '', industrySectorStr: '',
// // //         techStackStr: '', employeeCount: 0, internCapacity: 1, workArrangement: 'On-site',
// // //         hasDedicatedMentors: 'No', willingToSignWBL: true, taxCompliant: 'Yes',
// // //         hasHRPolicies: false, etiAwareness: false, dataConsent: false,
// // //         physicalAddress: '', province: '', lat: null as number | null, lng: null as number | null,
// // //     });

// // //     const handlePlaceSelected = (place: any) => {
// // //         let newLat = form.lat;
// // //         let newLng = form.lng;

// // //         if (place.geometry && place.geometry.location) {
// // //             newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// // //             newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// // //         }

// // //         const addressComponents = place.address_components;
// // //         const provString = addressComponents?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
// // //         const formatted = place.formatted_address || "";

// // //         setForm(p => ({ ...p, physicalAddress: formatted, province: provString, lat: newLat, lng: newLng }));
// // //     };

// // //     const handleSubmit = async (e: React.FormEvent) => {
// // //         e.preventDefault();

// // //         if (!form.dataConsent) {
// // //             alert("You must consent to data processing to submit this application.");
// // //             return;
// // //         }

// // //         setSaving(true);
// // //         try {
// // //             const finalForm = {
// // //                 ...form,
// // //                 industrySector: form.industrySectorStr.split(',').map(s => s.trim()).filter(Boolean),
// // //                 techStack: form.techStackStr.split(',').map(s => s.trim()).filter(Boolean),
// // //                 customResponses, // Append all dynamic Funder/SETA answers here
// // //                 status: 'Pending Review',
// // //                 mlabTier: 'Pending Assessment',
// // //                 mlabRiskRating: 'Pending',
// // //                 matchingPriorityScore: 0,
// // //                 internalNotes: 'Applied via public web form.',
// // //             };

// // //             delete (finalForm as any).industrySectorStr;
// // //             delete (finalForm as any).techStackStr;

// // //             const ref = doc(collection(db, 'employers'));
// // //             await setDoc(ref, { ...finalForm, id: ref.id, createdAt: new Date().toISOString() });

// // //             setSubmitted(true);
// // //             window.scrollTo({ top: 0, behavior: 'smooth' });
// // //         } catch (err) {
// // //             alert("An error occurred while submitting your application. Please try again.");
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     if (submitted) {
// // //         return (
// // //             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' }}>
// // //                 <div style={{ background: 'white', padding: '4rem 2rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '500px' }}>
// // //                     <CheckCircle2 size={64} color="#16a34a" style={{ margin: '0 auto 1.5rem' }} />
// // //                     <h2 style={{ fontFamily: 'var(--font-heading)', color: '#0f172a', marginBottom: '1rem', textTransform: 'uppercase' }}>Application Received</h2>
// // //                     <p style={{ color: '#64748b', lineHeight: 1.6, marginBottom: '2rem' }}>
// // //                         Thank you for applying to become a Host Employer Partner. Our placements team will review your application and contact you shortly regarding the next steps and capacity matching.
// // //                     </p>
// // //                     <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#0f172a' }}>Submit Another Request</button>
// // //                 </div>
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '3rem 1rem', fontFamily: 'Arial, sans-serif' }}>
// // //             <div style={{ maxWidth: '800px', margin: '0 auto', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>

// // //                 {/* Header Graphic */}
// // //                 <div style={{ background: '#073f4e', padding: '3rem 2rem', color: 'white', textAlign: 'center' }}>
// // //                     <div style={{ width: '64px', height: '64px', background: 'rgba(148, 199, 61, 0.2)', border: '2px solid #94c73d', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
// // //                         <Briefcase size={32} color="#94c73d" />
// // //                     </div>
// // //                     <h1 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '2.2rem', margin: '0 0 0.5rem', textTransform: 'uppercase' }}>Host an Intern</h1>
// // //                     <p style={{ margin: 0, color: '#bae6fd', fontSize: '1.1rem', maxWidth: '600px', marginInline: 'auto' }}>Partner with us to grow young talent, build your pipeline, and earn B-BBEE Skills Development recognition.</p>
// // //                 </div>

// // //                 <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>

// // //                     {/* SECTION 1: ORG INFO */}
// // //                     <div style={{ marginBottom: '2.5rem' }}>
// // //                         <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#073f4e', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
// // //                             <Building2 size={18} /> Organisation Details
// // //                         </h3>
// // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
// // //                             {/* MANDATORY CORE FIELDS */}
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Registered Company Name *</label>
// // //                                 <input required type="text" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
// // //                             </div>
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>CIPC Registration Number *</label>
// // //                                 <input required type="text" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
// // //                             </div>

// // //                             {/* TOGGLEABLE CORE FIELDS */}
// // //                             {isVisible('tradingName') && (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Trading Name</label>
// // //                                     <input type="text" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
// // //                                 </div>
// // //                             )}

// // //                             {isVisible('bbbeeLevel') && (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>B-BBEE Level</label>
// // //                                     <select style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }} value={form.bbbeeLevel} onChange={e => setForm(p => ({ ...p, bbbeeLevel: e.target.value }))}>
// // //                                         <option value="">Unknown / Pending</option>
// // //                                         <option value="Level 1">Level 1</option>
// // //                                         <option value="Level 2">Level 2</option>
// // //                                         <option value="Level 3">Level 3</option>
// // //                                         <option value="Level 4">Level 4</option>
// // //                                         <option value="Non-Compliant">Non-Compliant</option>
// // //                                         <option value="Exempt Micro Enterprise (EME)">Exempt Micro Enterprise (EME)</option>
// // //                                     </select>
// // //                                 </div>
// // //                             )}

// // //                             {isVisible('industrySector') && (
// // //                                 <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Industry Sectors (Comma separated)</label>
// // //                                     <input type="text" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} placeholder="e.g. Fintech, Software Development" value={form.industrySectorStr} onChange={e => setForm(p => ({ ...p, industrySectorStr: e.target.value }))} />
// // //                                 </div>
// // //                             )}

// // //                             {/* MANDATORY MAPS FIELD */}
// // //                             <div style={{ gridColumn: '1 / -1', padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
// // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#073f4e', marginBottom: '6px' }}>
// // //                                     <MapPin size={13} /> Physical Address *
// // //                                 </label>
// // //                                 <Autocomplete
// // //                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// // //                                     onPlaceSelected={handlePlaceSelected}
// // //                                     options={{ types: [], componentRestrictions: { country: "za" } }}
// // //                                     style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
// // //                                     placeholder="Search for your company address..."
// // //                                     required
// // //                                 />
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     {/* SECTION 2: CONTACT & LOGISTICS */}
// // //                     <div style={{ marginBottom: '2.5rem' }}>
// // //                         <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#073f4e', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
// // //                             <User size={18} /> Point of Contact & Logistics
// // //                         </h3>
// // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
// // //                             {/* MANDATORY CONTACT */}
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Contact Person Name *</label>
// // //                                 <input required type="text" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
// // //                             </div>
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Contact Email *</label>
// // //                                 <input required type="email" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
// // //                             </div>
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>How many learners can you host? *</label>
// // //                                 <input required type="number" min="1" max="100" style={{ padding: '10px', border: '1px solid #bae6fd', borderRadius: '6px', background: '#f0f9ff', fontWeight: 'bold' }} value={form.internCapacity || ''} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
// // //                             </div>

// // //                             {/* TOGGLEABLE WORK ENVIRONMENT */}
// // //                             {isVisible('workArrangement') && (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Work Arrangement</label>
// // //                                     <select style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }} value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
// // //                                         <option value="On-site">On-site (Office)</option>
// // //                                         <option value="Hybrid">Hybrid</option>
// // //                                         <option value="Remote">100% Remote</option>
// // //                                     </select>
// // //                                 </div>
// // //                             )}

// // //                             {isVisible('hasDedicatedMentors') && (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Do you have dedicated mentors?</label>
// // //                                     <select style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }} value={form.hasDedicatedMentors} onChange={e => setForm(p => ({ ...p, hasDedicatedMentors: e.target.value }))}>
// // //                                         <option value="Yes">Yes</option>
// // //                                         <option value="Partially">Partially / Shared</option>
// // //                                         <option value="No">No</option>
// // //                                     </select>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     {/* DYNAMIC CUSTOM FIELDS (From Form Builder) */}
// // //                     {blueprint?.customFields && blueprint.customFields.length > 0 && (
// // //                         <div style={{ marginBottom: '2.5rem' }}>
// // //                             <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#073f4e', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
// // //                                 <ListPlus size={18} /> Additional Information
// // //                             </h3>
// // //                             <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
// // //                                 {blueprint.customFields.map((field: any) => (
// // //                                     <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                         <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
// // //                                             {field.label} {field.required && <span style={{ color: 'red' }}>*</span>}
// // //                                         </label>

// // //                                         {field.type === 'text' && (
// // //                                             <input
// // //                                                 type="text"
// // //                                                 required={field.required}
// // //                                                 style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
// // //                                                 value={customResponses[field.id] || ''}
// // //                                                 onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}
// // //                                             />
// // //                                         )}

// // //                                         {field.type === 'dropdown' && (
// // //                                             <select
// // //                                                 required={field.required}
// // //                                                 style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }}
// // //                                                 value={customResponses[field.id] || ''}
// // //                                                 onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.value }))}
// // //                                             >
// // //                                                 <option value="">-- Select Option --</option>
// // //                                                 {field.options?.map((opt: string) => (
// // //                                                     <option key={opt} value={opt}>{opt}</option>
// // //                                                 ))}
// // //                                             </select>
// // //                                         )}

// // //                                         {field.type === 'checkbox' && (
// // //                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
// // //                                                 <input
// // //                                                     type="checkbox"
// // //                                                     required={field.required}
// // //                                                     checked={!!customResponses[field.id]}
// // //                                                     onChange={(e) => setCustomResponses(p => ({ ...p, [field.id]: e.target.checked }))}
// // //                                                     style={{ width: '16px', height: '16px', accentColor: '#073f4e' }}
// // //                                                 />
// // //                                                 Yes
// // //                                             </label>
// // //                                         )}
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* CORE FIELDS: COMPLIANCE & CONSENT */}
// // //                     <div style={{ marginBottom: '2.5rem' }}>
// // //                         <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#073f4e', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
// // //                             <ShieldAlert size={18} /> Compliance & Agreements
// // //                         </h3>
// // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>

// // //                             {isVisible('willingToSignWBL') && (
// // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: '#0f172a', fontWeight: 500, cursor: 'pointer' }}>
// // //                                     <input type="checkbox" checked={form.willingToSignWBL} onChange={e => setForm(p => ({ ...p, willingToSignWBL: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#073f4e' }} />
// // //                                     We are willing to sign formal Workplace-Based Learning (WBL) Tripartite Agreements
// // //                                 </label>
// // //                             )}

// // //                             {isVisible('hasHRPolicies') && (
// // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: '#0f172a', fontWeight: 500, cursor: 'pointer' }}>
// // //                                     <input type="checkbox" checked={form.hasHRPolicies} onChange={e => setForm(p => ({ ...p, hasHRPolicies: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#073f4e' }} />
// // //                                     We have basic HR and Code of Conduct policies in place
// // //                                 </label>
// // //                             )}

// // //                             <hr style={{ border: 'none', borderBottom: '1px solid #cbd5e1', margin: '1rem 0' }} />

// // //                             <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>
// // //                                 <input required type="checkbox" checked={form.dataConsent} onChange={e => setForm(p => ({ ...p, dataConsent: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#94c73d' }} />
// // //                                 I consent to mLab collecting and storing this data for the purpose of placement matching and SETA reporting. *
// // //                             </label>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.5rem', borderTop: '2px solid #e2e8f0' }}>
// // //                         <button type="submit" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', background: '#94c73d', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }} disabled={saving}>
// // //                             {saving ? <><Loader2 className="spin" size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Submitting...</> : "Submit Application"}
// // //                         </button>
// // //                     </div>

// // //                 </form>
// // //             </div>
// // //         </div>
// // //     );
// // // };


// // // // // src/components/admin/WorkplacesManager/EmployerFormBuilderPage.tsx

// // // // import React, { useState, useEffect } from "react";
// // // // import { Save, Loader2, ListPlus, Plus, Trash2, LayoutTemplate, ToggleLeft, ShieldAlert, ArrowLeft, X } from "lucide-react";

// // // // // Ensure the LearnerFormModal CSS is imported so we can reuse its perfect styling
// // // // // import "../../admin/LearnerFormModal/LearnerFormModal.css";
// // // // import "../../../../components/admin/LearnerFormModal/LearnerFormModal.css";
// // // // import { useToast } from "../../../../components/common/Toast/Toast";
// // // // import { useStore } from "../../../../store/useStore";

// // // // // Blueprint for custom questions
// // // // export interface CustomFieldBlueprint {
// // // //     id: string;
// // // //     label: string;
// // // //     type: "text" | "dropdown" | "checkbox";
// // // //     required: boolean;
// // // //     options?: string[];
// // // // }

// // // // // Master Schema of your Application Form Defaults
// // // // export const DEFAULT_CORE_FIELDS = [
// // // //     { id: "tradingName", label: "Trading Name", section: "Organisation Information" },
// // // //     { id: "taxNumber", label: "Tax Number", section: "Organisation Information" },
// // // //     { id: "vatNumber", label: "VAT Number", section: "Organisation Information" },
// // // //     { id: "bbbeeLevel", label: "B-BBEE Level", section: "Organisation Information" },
// // // //     { id: "industrySector", label: "Industry Sector", section: "Organisation Information" },
// // // //     { id: "website", label: "Website / Online Presence", section: "Organisation Information" },
// // // //     { id: "yearEstablished", label: "Year Established", section: "Organisation Information" },

// // // //     { id: "alternativeContact", label: "Alternative Contact", section: "Primary Contact Person" },

// // // //     { id: "employeeCount", label: "Number of Employees", section: "Organisation Capacity & Work Environment" },
// // // //     { id: "workArrangement", label: "Work Arrangement (On-site/Remote)", section: "Organisation Capacity & Work Environment" },
// // // //     { id: "hasDedicatedMentors", label: "Do you have dedicated mentors?", section: "Organisation Capacity & Work Environment" },
// // // //     { id: "workEnvironmentDesc", label: "Describe work environment", section: "Organisation Capacity & Work Environment" },
// // // //     { id: "techStack", label: "Tools / Technologies used", section: "Organisation Capacity & Work Environment" },

// // // //     { id: "hostingMotivations", label: "Why do you want to host learners?", section: "Learner Hosting Intent" },
// // // //     { id: "preferredLearnerLevel", label: "Preferred learner level", section: "Learner Hosting Intent" },
// // // //     { id: "preferredDisciplines", label: "Preferred disciplines", section: "Learner Hosting Intent" },
// // // //     { id: "expectedStartDate", label: "Expected start date", section: "Learner Hosting Intent" },
// // // //     { id: "expectedDuration", label: "Expected duration", section: "Learner Hosting Intent" },

// // // //     { id: "supervisorName", label: "Who will supervise learners?", section: "Mentorship & Supervision" },
// // // //     { id: "mentorExperienceLevel", label: "Mentor experience level", section: "Mentorship & Supervision" },
// // // //     { id: "weeklyCheckIns", label: "Available for weekly check-ins?", section: "Mentorship & Supervision" },
// // // //     { id: "mentorshipStructureDesc", label: "Describe mentorship structure", section: "Mentorship & Supervision" },

// // // //     { id: "projectTypesDesc", label: "Describe projects learners will work on", section: "Projects & Work Exposure" },
// // // //     { id: "productionAccess", label: "Access to real production systems?", section: "Projects & Work Exposure" },
// // // //     { id: "contributionAreas", label: "Will learners contribute to live projects?", section: "Projects & Work Exposure" },

// // // //     { id: "willingToSignWBL", label: "Willing to sign WBL Agreement?", section: "Compliance & Readiness" },
// // // //     { id: "taxCompliant", label: "Compliant with tax requirements?", section: "Compliance & Readiness" },
// // // //     { id: "hasHRPolicies", label: "HR policies in place?", section: "Compliance & Readiness" },
// // // //     { id: "bbbeeAwareness", label: "Familiar with B-BBEE requirements?", section: "Compliance & Readiness" },

// // // //     { id: "interestedInBbbee", label: "Interested in B-BBEE recognition?", section: "B-BBEE & Incentives Awareness" },
// // // //     { id: "etiAwareness", label: "Aware of ETI (Employment Tax Incentive)?", section: "B-BBEE & Incentives Awareness" },
// // // //     { id: "requiresAdvisory", label: "Would you like advisory support?", section: "B-BBEE & Incentives Awareness" },

// // // //     { id: "additionalComments", label: "Additional comments or requirements", section: "Additional Information" }
// // // // ];

// // // // export const EmployerFormBuilderPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
// // // //     const toast = useToast();
// // // //     const { settings, updateSettings } = useStore();
// // // //     const [isSaving, setIsSaving] = useState(false);
// // // //     const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');

// // // //     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
// // // //     const [coreVisibility, setCoreVisibility] = useState<Record<string, boolean>>({});

// // // //     // Load existing blueprint from global settings on mount
// // // //     useEffect(() => {
// // // //         if (settings) {
// // // //             setCustomFields((settings as any)?.employerFormBlueprint?.customFields || []);

// // // //             const savedVisibility = (settings as any)?.employerFormBlueprint?.coreFieldVisibility || {};
// // // //             const initialVisibility: Record<string, boolean> = {};
// // // //             DEFAULT_CORE_FIELDS.forEach(f => {
// // // //                 initialVisibility[f.id] = savedVisibility[f.id] !== undefined ? savedVisibility[f.id] : true;
// // // //             });
// // // //             setCoreVisibility(initialVisibility);
// // // //         }
// // // //     }, [settings]);

// // // //     const toggleCoreField = (id: string) => {
// // // //         setCoreVisibility(prev => ({ ...prev, [id]: !prev[id] }));
// // // //     };

// // // //     const addCustomField = () => {
// // // //         const newField: CustomFieldBlueprint = {
// // // //             id: `emp_field_${Date.now()}`,
// // // //             label: "",
// // // //             type: "text",
// // // //             required: false,
// // // //             options: []
// // // //         };
// // // //         setCustomFields([...customFields, newField]);
// // // //     };

// // // //     const updateCustomField = (id: string, key: keyof CustomFieldBlueprint, value: any) => {
// // // //         setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
// // // //     };

// // // //     const removeCustomField = (id: string) => {
// // // //         setCustomFields(prev => prev.filter(f => f.id !== id));
// // // //     };

// // // //     const handleSave = async (e: React.FormEvent) => {
// // // //         e.preventDefault();

// // // //         const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.length === 0));
// // // //         if (invalidDropdown) {
// // // //             toast.error(`Please provide comma-separated options for the dropdown: "${invalidDropdown.label || 'Untitled'}"`);
// // // //             return;
// // // //         }

// // // //         setIsSaving(true);
// // // //         try {
// // // //             const cleanedCustomFields = customFields
// // // //                 .filter(f => f.label.trim() !== "")
// // // //                 .map(f => ({
// // // //                     ...f,
// // // //                     options: f.type === 'dropdown' && f.options ? f.options.map(opt => opt.trim()).filter(Boolean) : []
// // // //                 }));

// // // //             await updateSettings({
// // // //                 ...settings,
// // // //                 employerFormBlueprint: {
// // // //                     coreFieldVisibility: coreVisibility,
// // // //                     customFields: cleanedCustomFields
// // // //                 }
// // // //             });

// // // //             toast.success("Public Employer Application form configured successfully!");
// // // //             if (onBack) onBack(); // Automatically return to previous screen if passed
// // // //         } catch (error) {
// // // //             console.error(error);
// // // //             toast.error("Failed to update application form.");
// // // //         } finally {
// // // //             setIsSaving(false);
// // // //         }
// // // //     };

// // // //     // Group core fields by section for rendering
// // // //     const groupedCoreFields = DEFAULT_CORE_FIELDS.reduce((acc, field) => {
// // // //         if (!acc[field.section]) acc[field.section] = [];
// // // //         acc[field.section].push(field);
// // // //         return acc;
// // // //     }, {} as Record<string, typeof DEFAULT_CORE_FIELDS>);

// // // //     return (
// // // //         <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', padding: '2rem 1rem', height: 'calc(100vh - 80px)' }}>

// // // //             {/* Reusing the exact .lfm-modal shell, but statically positioned as a page card */}
// // // //             <div className="lfm-modal" style={{ maxWidth: '900px', height: '100%', position: 'relative', transform: 'none' }}>

// // // //                 <div className="lfm-header">
// // // //                     <h2 className="lfm-header__title">
// // // //                         <LayoutTemplate size={18} /> Application Form Builder
// // // //                     </h2>
// // // //                     {onBack && (
// // // //                         <button className="lfm-close-btn" type="button" onClick={onBack} disabled={isSaving}>
// // // //                             <X size={20} />
// // // //                         </button>
// // // //                     )}
// // // //                 </div>

// // // //                 <div className="lfm-tabs">
// // // //                     <button type="button" className={`lfm-tab ${activeTab === 'core' ? "active" : ""}`} onClick={() => setActiveTab('core')}>
// // // //                         <ToggleLeft size={13} /> Standard Sections Config
// // // //                     </button>
// // // //                     <button type="button" className={`lfm-tab ${activeTab === 'custom' ? "active" : ""}`} onClick={() => setActiveTab('custom')}>
// // // //                         <ListPlus size={13} /> Dynamic Custom Questions
// // // //                         {customFields.length > 0 && <span className={`lfm-tab__badge ${activeTab === 'custom' ? 'active' : ''}`}>{customFields.length}</span>}
// // // //                     </button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
// // // //                     <div className="lfm-body">

// // // //                         {activeTab === 'core' && (
// // // //                             <>
// // // //                                 <div className="lfm-error-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a', marginBottom: '0.5rem' }}>
// // // //                                     <ShieldAlert size={16} color="#1d4ed8" />
// // // //                                     <span><strong>MANDATORY SYSTEM FIELDS:</strong> Fields such as Company Name, Registration Number, Physical Address, Intern Capacity, Contact Person details, and Data Consent are hardcoded as mandatory for the placement engine to function.</span>
// // // //                                 </div>

// // // //                                 {Object.entries(groupedCoreFields).map(([section, fields]) => (
// // // //                                     <div key={section} style={{ marginBottom: '1rem' }}>
// // // //                                         <div className="lfm-section-hdr">{section}</div>
// // // //                                         <div className="lfm-grid">
// // // //                                             {fields.map(field => (
// // // //                                                 <label
// // // //                                                     key={field.id}
// // // //                                                     className="lfm-checkbox-row"
// // // //                                                     style={{
// // // //                                                         background: coreVisibility[field.id] ? '#f0fdf4' : 'var(--mlab-light-blue)',
// // // //                                                         padding: '0.65rem 0.85rem',
// // // //                                                         border: `1px solid ${coreVisibility[field.id] ? '#bbf7d0' : 'var(--mlab-border)'}`,
// // // //                                                         borderRadius: '4px',
// // // //                                                         margin: 0
// // // //                                                     }}
// // // //                                                 >
// // // //                                                     <input
// // // //                                                         type="checkbox"
// // // //                                                         checked={coreVisibility[field.id] || false}
// // // //                                                         onChange={() => toggleCoreField(field.id)}
// // // //                                                     />
// // // //                                                     <span style={{ fontWeight: coreVisibility[field.id] ? 600 : 400 }}>{field.label}</span>
// // // //                                                 </label>
// // // //                                             ))}
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 ))}
// // // //                             </>
// // // //                         )}

// // // //                         {activeTab === 'custom' && (
// // // //                             <>
// // // //                                 <div className="lfm-section-hdr"><ListPlus size={13} /> Additional Information Configuration</div>
// // // //                                 <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '-0.5rem 0 1rem 0' }}>
// // // //                                     These custom questions will be appended to the bottom of the public application form. Useful for capturing specific Funder or SETA requirements.
// // // //                                 </p>

// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // // //                                     {customFields.length === 0 && (
// // // //                                         <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--mlab-bg)', border: '1px dashed var(--mlab-border)', borderRadius: '4px', color: 'var(--mlab-grey)' }}>
// // // //                                             <ListPlus size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', marginInline: 'auto' }} />
// // // //                                             <span style={{ fontSize: '0.85rem' }}>No custom questions configured. Click below to add your first dynamic field.</span>
// // // //                                         </div>
// // // //                                     )}

// // // //                                     {customFields.map((field, idx) => (
// // // //                                         <div key={field.id} className="lfm-flags-panel" style={{ position: 'relative', borderLeftColor: 'var(--mlab-green)', background: 'var(--mlab-white)' }}>
// // // //                                             <button type="button" onClick={() => removeCustomField(field.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}>
// // // //                                                 <Trash2 size={16} />
// // // //                                             </button>

// // // //                                             <div className="lfm-grid">
// // // //                                                 <div className="lfm-fg lfm-fg--full" style={{ paddingRight: '2rem' }}>
// // // //                                                     <label>Question Label *</label>
// // // //                                                     <input className="lfm-input" type="text" placeholder="e.g. Do you have a dedicated intern workspace?" value={field.label} onChange={(e) => updateCustomField(field.id, 'label', e.target.value)} required />
// // // //                                                 </div>

// // // //                                                 <div className="lfm-fg">
// // // //                                                     <label>Answer Type *</label>
// // // //                                                     <select className="lfm-input lfm-select" value={field.type} onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}>
// // // //                                                         <option value="text">Short Text / Paragraph</option>
// // // //                                                         <option value="dropdown">Dropdown Options</option>
// // // //                                                         <option value="checkbox">Yes / No Checkbox</option>
// // // //                                                     </select>
// // // //                                                 </div>

// // // //                                                 <div className="lfm-fg" style={{ justifyContent: 'flex-end', paddingBottom: '0.4rem' }}>
// // // //                                                     <label className="lfm-checkbox-row" style={{ background: field.required ? '#fef2f2' : 'transparent', padding: field.required ? '0.4rem' : '0', border: field.required ? '1px solid #fecaca' : '1px solid transparent', borderRadius: '4px', width: 'fit-content' }}>
// // // //                                                         <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)} />
// // // //                                                         <span style={{ color: field.required ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Required Answer</span>
// // // //                                                     </label>
// // // //                                                 </div>

// // // //                                                 {field.type === 'dropdown' && (
// // // //                                                     <div className="lfm-fg lfm-fg--full" style={{ marginTop: '0.5rem', background: 'var(--mlab-light-blue)', padding: '0.75rem', border: '1px solid var(--mlab-border)' }}>
// // // //                                                         <label>Dropdown Options (Comma Separated) *</label>
// // // //                                                         <input className="lfm-input" type="text" placeholder="e.g. Desk, Lab, Open Plan, Remote" value={field.options?.join(",") || ""} onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))} required />
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     ))}

// // // //                                     <button type="button" onClick={addCustomField} className="lfm-btn lfm-btn--ghost" style={{ alignSelf: 'center', marginTop: '0.5rem' }}>
// // // //                                         <Plus size={14} /> Add New Question
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </>
// // // //                         )}
// // // //                     </div>

// // // //                     <div className="lfm-footer">
// // // //                         {onBack && (
// // // //                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onBack} disabled={isSaving}>
// // // //                                 Cancel / Back
// // // //                             </button>
// // // //                         )}
// // // //                         <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
// // // //                             {isSaving ? <><Loader2 className="lfm-spin" size={13} /> Saving Blueprint…</> : <><Save size={13} /> Save Form Configuration</>}
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };


// // // // // // src/components/admin/WorkplacesManager/EmployerFormBuilderPage.tsx

// // // // // import React, { useState, useEffect } from "react";
// // // // // import { Save, Loader2, ListPlus, Plus, Trash2, LayoutTemplate, ToggleLeft, ShieldAlert, ArrowLeft } from "lucide-react";
// // // // // import { useToast } from "../../../../components/common/Toast/Toast";
// // // // // import { useStore } from "../../../../store/useStore";
// // // // // // Blueprint for custom questions
// // // // // export interface CustomFieldBlueprint {
// // // // //     id: string;
// // // // //     label: string;
// // // // //     type: "text" | "dropdown" | "checkbox";
// // // // //     required: boolean;
// // // // //     options?: string[];
// // // // // }

// // // // // // Master Schema of your Application Form Defaults
// // // // // export const DEFAULT_CORE_FIELDS = [
// // // // //     { id: "tradingName", label: "Trading Name", section: "Organisation Information" },
// // // // //     { id: "taxNumber", label: "Tax Number", section: "Organisation Information" },
// // // // //     { id: "vatNumber", label: "VAT Number", section: "Organisation Information" },
// // // // //     { id: "bbbeeLevel", label: "B-BBEE Level", section: "Organisation Information" },
// // // // //     { id: "industrySector", label: "Industry Sector", section: "Organisation Information" },
// // // // //     { id: "website", label: "Website / Online Presence", section: "Organisation Information" },
// // // // //     { id: "yearEstablished", label: "Year Established", section: "Organisation Information" },

// // // // //     { id: "alternativeContact", label: "Alternative Contact", section: "Primary Contact Person" },

// // // // //     { id: "employeeCount", label: "Number of Employees", section: "Organisation Capacity & Work Environment" },
// // // // //     { id: "workArrangement", label: "Work Arrangement (On-site/Remote)", section: "Organisation Capacity & Work Environment" },
// // // // //     { id: "hasDedicatedMentors", label: "Do you have dedicated mentors?", section: "Organisation Capacity & Work Environment" },
// // // // //     { id: "workEnvironmentDesc", label: "Describe work environment", section: "Organisation Capacity & Work Environment" },
// // // // //     { id: "techStack", label: "Tools / Technologies used", section: "Organisation Capacity & Work Environment" },

// // // // //     { id: "hostingMotivations", label: "Why do you want to host learners?", section: "Learner Hosting Intent" },
// // // // //     { id: "preferredLearnerLevel", label: "Preferred learner level", section: "Learner Hosting Intent" },
// // // // //     { id: "preferredDisciplines", label: "Preferred disciplines", section: "Learner Hosting Intent" },
// // // // //     { id: "expectedStartDate", label: "Expected start date", section: "Learner Hosting Intent" },
// // // // //     { id: "expectedDuration", label: "Expected duration", section: "Learner Hosting Intent" },

// // // // //     { id: "supervisorName", label: "Who will supervise learners?", section: "Mentorship & Supervision" },
// // // // //     { id: "mentorExperienceLevel", label: "Mentor experience level", section: "Mentorship & Supervision" },
// // // // //     { id: "weeklyCheckIns", label: "Available for weekly check-ins?", section: "Mentorship & Supervision" },
// // // // //     { id: "mentorshipStructureDesc", label: "Describe mentorship structure", section: "Mentorship & Supervision" },

// // // // //     { id: "projectTypesDesc", label: "Describe projects learners will work on", section: "Projects & Work Exposure" },
// // // // //     { id: "productionAccess", label: "Access to real production systems?", section: "Projects & Work Exposure" },
// // // // //     { id: "contributionAreas", label: "Will learners contribute to live projects?", section: "Projects & Work Exposure" },

// // // // //     { id: "willingToSignWBL", label: "Willing to sign WBL Agreement?", section: "Compliance & Readiness" },
// // // // //     { id: "taxCompliant", label: "Compliant with tax requirements?", section: "Compliance & Readiness" },
// // // // //     { id: "hasHRPolicies", label: "HR policies in place?", section: "Compliance & Readiness" },
// // // // //     { id: "bbbeeAwareness", label: "Familiar with B-BBEE requirements?", section: "Compliance & Readiness" },

// // // // //     { id: "interestedInBbbee", label: "Interested in B-BBEE recognition?", section: "B-BBEE & Incentives Awareness" },
// // // // //     { id: "etiAwareness", label: "Aware of ETI (Employment Tax Incentive)?", section: "B-BBEE & Incentives Awareness" },
// // // // //     { id: "requiresAdvisory", label: "Would you like advisory support?", section: "B-BBEE & Incentives Awareness" },

// // // // //     { id: "additionalComments", label: "Additional comments or requirements", section: "Additional Information" }
// // // // // ];

// // // // // export const EmployerFormBuilderPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
// // // // //     const toast = useToast();
// // // // //     const { settings, updateSettings } = useStore();
// // // // //     const [isSaving, setIsSaving] = useState(false);
// // // // //     const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');

// // // // //     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
// // // // //     const [coreVisibility, setCoreVisibility] = useState<Record<string, boolean>>({});

// // // // //     // Load existing blueprint from global settings on mount
// // // // //     useEffect(() => {
// // // // //         if (settings) {
// // // // //             setCustomFields((settings as any)?.employerFormBlueprint?.customFields || []);

// // // // //             const savedVisibility = (settings as any)?.employerFormBlueprint?.coreFieldVisibility || {};
// // // // //             const initialVisibility: Record<string, boolean> = {};
// // // // //             DEFAULT_CORE_FIELDS.forEach(f => {
// // // // //                 initialVisibility[f.id] = savedVisibility[f.id] !== undefined ? savedVisibility[f.id] : true;
// // // // //             });
// // // // //             setCoreVisibility(initialVisibility);
// // // // //         }
// // // // //     }, [settings]);

// // // // //     const toggleCoreField = (id: string) => {
// // // // //         setCoreVisibility(prev => ({ ...prev, [id]: !prev[id] }));
// // // // //     };

// // // // //     const addCustomField = () => {
// // // // //         const newField: CustomFieldBlueprint = {
// // // // //             id: `emp_field_${Date.now()}`,
// // // // //             label: "",
// // // // //             type: "text",
// // // // //             required: false,
// // // // //             options: []
// // // // //         };
// // // // //         setCustomFields([...customFields, newField]);
// // // // //     };

// // // // //     const updateCustomField = (id: string, key: keyof CustomFieldBlueprint, value: any) => {
// // // // //         setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
// // // // //     };

// // // // //     const removeCustomField = (id: string) => {
// // // // //         setCustomFields(prev => prev.filter(f => f.id !== id));
// // // // //     };

// // // // //     const handleSave = async (e: React.FormEvent) => {
// // // // //         e.preventDefault();

// // // // //         const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.length === 0));
// // // // //         if (invalidDropdown) {
// // // // //             toast.error(`Please provide comma-separated options for the dropdown: "${invalidDropdown.label || 'Untitled'}"`);
// // // // //             return;
// // // // //         }

// // // // //         setIsSaving(true);
// // // // //         try {
// // // // //             const cleanedCustomFields = customFields
// // // // //                 .filter(f => f.label.trim() !== "")
// // // // //                 .map(f => ({
// // // // //                     ...f,
// // // // //                     options: f.type === 'dropdown' && f.options ? f.options.map(opt => opt.trim()).filter(Boolean) : []
// // // // //                 }));

// // // // //             await updateSettings({
// // // // //                 ...settings,
// // // // //                 employerFormBlueprint: {
// // // // //                     coreFieldVisibility: coreVisibility,
// // // // //                     customFields: cleanedCustomFields
// // // // //                 }
// // // // //             });

// // // // //             toast.success("Public Employer Application form configured successfully!");
// // // // //             if (onBack) onBack(); // Automatically return to previous screen if passed
// // // // //         } catch (error) {
// // // // //             console.error(error);
// // // // //             toast.error("Failed to update application form.");
// // // // //         } finally {
// // // // //             setIsSaving(false);
// // // // //         }
// // // // //     };

// // // // //     // Group core fields by section for rendering
// // // // //     const groupedCoreFields = DEFAULT_CORE_FIELDS.reduce((acc, field) => {
// // // // //         if (!acc[field.section]) acc[field.section] = [];
// // // // //         acc[field.section].push(field);
// // // // //         return acc;
// // // // //     }, {} as Record<string, typeof DEFAULT_CORE_FIELDS>);

// // // // //     return (
// // // // //         <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>

// // // // //             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
// // // // //                 {onBack && (
// // // // //                     <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid var(--mlab-border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
// // // // //                         <ArrowLeft size={16} /> Back
// // // // //                     </button>
// // // // //                 )}
// // // // //                 <div>
// // // // //                     <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', margin: 0, textTransform: 'uppercase' }}>
// // // // //                         <LayoutTemplate size={28} color="var(--mlab-blue)" /> Application Form Builder
// // // // //                     </h1>
// // // // //                     <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0', fontSize: '0.9rem' }}>Customize the exact fields and questions displayed on your public Employer Application page.</p>
// // // // //                 </div>

// // // // //                 <div style={{ marginLeft: 'auto' }}>
// // // // //                     <button type="button" onClick={handleSave} disabled={isSaving} className="mlab-btn mlab-btn--primary">
// // // // //                         {isSaving ? <><Loader2 className="spin" size={16} /> Saving Blueprint…</> : <><Save size={16} /> Save Configuration</>}
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>

// // // // //             <div style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
// // // // //                 <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid var(--mlab-border)' }}>
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         onClick={() => setActiveTab('core')}
// // // // //                         style={{ flex: 1, padding: '1rem', background: activeTab === 'core' ? 'white' : 'transparent', border: 'none', borderBottom: activeTab === 'core' ? '3px solid var(--mlab-blue)' : '3px solid transparent', color: activeTab === 'core' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'core' ? 700 : 500, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
// // // // //                     >
// // // // //                         <ToggleLeft size={18} /> Standard Sections Config
// // // // //                     </button>
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         onClick={() => setActiveTab('custom')}
// // // // //                         style={{ flex: 1, padding: '1rem', background: activeTab === 'custom' ? 'white' : 'transparent', border: 'none', borderBottom: activeTab === 'custom' ? '3px solid var(--mlab-blue)' : '3px solid transparent', color: activeTab === 'custom' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'custom' ? 700 : 500, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
// // // // //                     >
// // // // //                         <ListPlus size={18} /> Dynamic Custom Questions
// // // // //                     </button>
// // // // //                 </div>

// // // // //                 <div style={{ padding: '2rem', background: '#f8fafc' }}>
// // // // //                     {activeTab === 'core' && (
// // // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // // // //                             <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', gap: '12px' }}>
// // // // //                                 <ShieldAlert size={24} color="#1d4ed8" style={{ flexShrink: 0 }} />
// // // // //                                 <div>
// // // // //                                     <h4 style={{ margin: '0 0 4px', color: '#1e3a8a', fontSize: '0.95rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>Mandatory System Fields</h4>
// // // // //                                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af', lineHeight: 1.5 }}>
// // // // //                                         Fields such as <strong>Company Name, Registration Number, Physical Address, Intern Capacity, Contact Person details, and Data Consent</strong> are hardcoded as mandatory. They cannot be turned off because the platform's mapping and matching engine relies on them to function.
// // // // //                                     </p>
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             {Object.entries(groupedCoreFields).map(([section, fields]) => (
// // // // //                                 <div key={section} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
// // // // //                                     <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>
// // // // //                                         {section}
// // // // //                                     </h3>
// // // // //                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
// // // // //                                         {fields.map(field => (
// // // // //                                             <label key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--mlab-midnight)', cursor: 'pointer', padding: '10px 12px', background: coreVisibility[field.id] ? '#f0fdf4' : '#f8fafc', border: `1px solid ${coreVisibility[field.id] ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '6px', transition: 'all 0.2s', boxShadow: coreVisibility[field.id] ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
// // // // //                                                 <input
// // // // //                                                     type="checkbox"
// // // // //                                                     checked={coreVisibility[field.id] || false}
// // // // //                                                     onChange={() => toggleCoreField(field.id)}
// // // // //                                                     style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-green)' }}
// // // // //                                                 />
// // // // //                                                 <span style={{ fontWeight: coreVisibility[field.id] ? 600 : 400 }}>{field.label}</span>
// // // // //                                             </label>
// // // // //                                         ))}
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             ))}
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {activeTab === 'custom' && (
// // // // //                         <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// // // // //                             <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
// // // // //                                 <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                     <ListPlus size={18} /> Additional Information Configuration
// // // // //                                 </h3>
// // // // //                                 <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// // // // //                                     These custom questions will be appended to the bottom of the public application form. Useful for specific Funder or SETA requirements.
// // // // //                                 </p>
// // // // //                             </div>

// // // // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// // // // //                                 {customFields.length === 0 && (
// // // // //                                     <div style={{ padding: '3rem 2rem', textAlign: 'center', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
// // // // //                                         <ListPlus size={32} style={{ opacity: 0.3, marginBottom: '1rem', marginInline: 'auto' }} />
// // // // //                                         <h4 style={{ margin: '0 0 4px', color: '#334155' }}>No Custom Questions Added</h4>
// // // // //                                         <p style={{ margin: 0, fontSize: '0.85rem' }}>Click the button below to add your first dynamic field.</p>
// // // // //                                     </div>
// // // // //                                 )}

// // // // //                                 {customFields.map((field, idx) => (
// // // // //                                     <div key={field.id} style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', padding: '1.5rem', position: 'relative', borderRadius: '6px' }}>
// // // // //                                         <button type="button" onClick={() => removeCustomField(field.id)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'white', border: '1px solid #fecaca', color: 'var(--mlab-red)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Remove Question">
// // // // //                                             <Trash2 size={16} />
// // // // //                                         </button>

// // // // //                                         <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
// // // // //                                             <div>
// // // // //                                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Question Label</label>
// // // // //                                                 <input style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }} type="text" placeholder="e.g. Do you have a dedicated intern workspace?" value={field.label} onChange={(e) => updateCustomField(field.id, 'label', e.target.value)} required />
// // // // //                                             </div>

// // // // //                                             <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'end' }}>
// // // // //                                                 <div>
// // // // //                                                     <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Answer Type</label>
// // // // //                                                     <select style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', background: 'white' }} value={field.type} onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}>
// // // // //                                                         <option value="text">Short Text / Paragraph</option>
// // // // //                                                         <option value="dropdown">Dropdown Options</option>
// // // // //                                                         <option value="checkbox">Yes / No Checkbox</option>
// // // // //                                                     </select>
// // // // //                                                 </div>
// // // // //                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', paddingBottom: '10px', cursor: 'pointer', background: field.required ? '#fef2f2' : 'transparent', padding: field.required ? '6px 12px' : '6px', borderRadius: '4px', border: field.required ? '1px solid #fecaca' : '1px solid transparent' }}>
// // // // //                                                     <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-red)' }} /> Required Answer
// // // // //                                                 </label>
// // // // //                                             </div>

// // // // //                                             {field.type === 'dropdown' && (
// // // // //                                                 <div style={{ marginTop: '0.5rem', background: '#eff6ff', padding: '1rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
// // // // //                                                     <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: '6px' }}>Dropdown Options (Comma Separated) *</label>
// // // // //                                                     <input style={{ width: '100%', padding: '10px', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '0.9rem' }} type="text" placeholder="e.g. Desk, Lab, Open Plan, Remote" value={field.options?.join(",") || ""} onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))} required />
// // // // //                                                 </div>
// // // // //                                             )}
// // // // //                                         </div>
// // // // //                                     </div>
// // // // //                                 ))}

// // // // //                                 <button type="button" onClick={addCustomField} style={{ alignSelf: 'center', marginTop: '1rem', background: 'white', border: '1px dashed var(--mlab-blue)', color: 'var(--mlab-blue)', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                     <Plus size={16} /> Add New Question
// // // // //                                 </button>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     )}
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };