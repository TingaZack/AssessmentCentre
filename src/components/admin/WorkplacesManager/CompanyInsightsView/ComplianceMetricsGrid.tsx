import React, { useState } from "react";
import { Activity, X, Calculator, Info, Wallet, Receipt } from "lucide-react";

export const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string; currentValue: string; actionSteps: React.ReactNode[]; onClose: () => void; }) => (
    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "8px", background: "white", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "1rem", width: "360px", zIndex: 100, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }} className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--mlab-midnight)", fontWeight: 800, fontSize: "0.85rem" }}>
                <Activity size={16} color="#d97706" /> {title}
            </div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 0 }}>
                <X size={14} />
            </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {actionSteps.map((step, i) => (
                <div key={i} style={{ fontSize: "0.75rem", color: "#475569", lineHeight: 1.4 }}>{step}</div>
            ))}
        </div>
    </div>
);

export const RingGauge = ({ percentage, color }: { percentage: number; color: string; }) => {
    const size = 52;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circum = radius * 2 * Math.PI;
    const offset = circum - (Math.min(percentage, 100) / 100) * circum;

    return (
        <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circum} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
            </svg>
            <div style={{ position: "absolute", fontSize: "0.7rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{percentage}%</div>
        </div>
    );
};

export const ComplianceMetricsGrid = ({ complianceMetrics, formatCurrency }: { complianceMetrics: any, formatCurrency: (v: number) => string }) => {
    const [activeInsight, setActiveInsight] = useState<string | null>(null);

    return (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#92400e", fontWeight: 800, fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <Calculator size={18} /> Strategic Employment Equity & Scorecard Auditor
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>

                {/* 1. SARS ETI Yield Framework */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <RingGauge percentage={complianceMetrics.etiYieldPercentage} color="#16a34a" />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 700, textTransform: "uppercase" }}>SARS ETI Opt. Yield</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "eti" ? null : "eti")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {formatCurrency(complianceMetrics.monthlyETITotal)}<span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}> /mo</span>
                        </div>
                        <div style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", color: "#475569", fontWeight: 700, display: "inline-block", marginTop: "4px" }}>
                            Annually: {formatCurrency(complianceMetrics.annualizedETIEstimate)}
                        </div>
                        {activeInsight === "eti" && (
                            <InsightPopup title="SARS Employment Tax Incentive" currentValue={`${complianceMetrics.etiYieldPercentage}% of Active Interns are ETI-Optimized`}
                                actionSteps={[
                                    <span key="1"><strong>Live Calculation:</strong> Value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
                                    <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to max the algorithm.</span>,
                                    <span key="3"><strong>View Math:</strong> Scroll down to the placement ledger and click on any green ETI button to view the exact math breakdown.</span>,
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 2. SECTION 12H TAX ALLOWANCE */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "50%", color: "#4338ca", height: "fit-content" }}>
                        <Receipt size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#3730a3", fontWeight: 700, textTransform: "uppercase" }}>Sec. 12H Tax Rebates</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "s12h" ? null : "s12h")} style={{ background: "none", border: "none", cursor: "pointer", color: "#4338ca", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {formatCurrency(complianceMetrics.totalS12hProjected)}
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>Projected total cycle deduction allowance.</span>
                        {activeInsight === "s12h" && (
                            <InsightPopup title="Section 12H Tax Deductions" currentValue={formatCurrency(complianceMetrics.totalS12hProjected)}
                                actionSteps={[
                                    <span key="1"><strong>Live Calculation:</strong> R80,000 (Commencement + Completion) per able-bodied learner. R120,000 per learner with an uploaded Disability Code.</span>,
                                    <span key="2"><strong>To Optimize:</strong> This allowance is claimed against taxable income. Terminated/Dropped learners do not qualify for the completion allowance portion.</span>
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 3. B-BBEE Skills Development Spend Tracker */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{ background: "#f1f5f9", padding: "12px", borderRadius: "50%", color: "#475569", height: "fit-content" }}>
                        <Wallet size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Recognized Spend</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "spend" ? null : "spend")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {formatCurrency(complianceMetrics.totalProjectedSpend)}
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>Projected stipend capital applied to training elements.</span>
                        {activeInsight === "spend" && (
                            <InsightPopup title="Skills Target Spend" currentValue={formatCurrency(complianceMetrics.totalProjectedSpend)}
                                actionSteps={[
                                    <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
                                    <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 4. RACIAL AND GENDER DEMOGRAPHICS */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <RingGauge percentage={complianceMetrics.transformationPercentage} color="#b45309" />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 700, textTransform: "uppercase" }}>Race & Gender Split</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "transformation" ? null : "transformation")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--mlab-midnight)", marginTop: "4px" }}>
                            {complianceMetrics.raceCounts.African}A | {complianceMetrics.raceCounts.Coloured}C | {complianceMetrics.raceCounts.Indian}I | {complianceMetrics.raceCounts.White}W
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                            Gender: <strong style={{ color: "var(--mlab-blue)" }}>{complianceMetrics.totalFemale} Female / {complianceMetrics.totalMale} Male</strong>
                        </span>
                        {activeInsight === "transformation" && (
                            <InsightPopup title="EEA2 Alignment Breakdown" currentValue="Total Demographics Ledger"
                                actionSteps={[
                                    <span key="1"><strong>Headcounts:</strong> African ({complianceMetrics.raceCounts.African}), Coloured ({complianceMetrics.raceCounts.Coloured}), Indian ({complianceMetrics.raceCounts.Indian}), White ({complianceMetrics.raceCounts.White}).</span>,
                                    <span key="2"><strong>B-BBEE Focus:</strong> Under Code Series 300, Skills Development sub-minimum calculations exclude White candidates from positive point matrices.</span>,
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 5. Disability Inclusion Metric */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <RingGauge percentage={complianceMetrics.disabilityPercentage} color="#7c3aed" />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#6d28d9", fontWeight: 700, textTransform: "uppercase" }}>Disability Framework</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "disability" ? null : "disability")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {complianceMetrics.disabilityCount} <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}>Learners</span>
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>Reflects a ratio of <strong>{complianceMetrics.disabilityPercentage}%</strong> of total context.</span>
                        {activeInsight === "disability" && (
                            <InsightPopup title="Disability Compliance Target" currentValue={`${complianceMetrics.disabilityCount} Headcount`}
                                actionSteps={[
                                    <span key="1"><strong>Audit Rule:</strong> Each instance listed here must maintain a verified medical certificate signed by an operating practitioner to claim Section 12H bonus deductions (R120k vs R80k).</span>,
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 6. YOUTH DEVELOPMENT PROFILES */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <RingGauge percentage={complianceMetrics.youthPercentage} color="#059669" />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#047857", fontWeight: 700, textTransform: "uppercase" }}>Youth Demographics</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "youth" ? null : "youth")} style={{ background: "none", border: "none", cursor: "pointer", color: "#047857", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {complianceMetrics.youthCount} <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}>under 35</span>
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}><strong>{complianceMetrics.youthPercentage}%</strong> match for South African Youth initiatives.</span>
                        {activeInsight === "youth" && (
                            <InsightPopup title="National Youth Framework Alignment" currentValue={`${complianceMetrics.youthPercentage}% of candidates are under 35`}
                                actionSteps={[
                                    <span key="1"><strong>Eligibility:</strong> Validates candidates under the age of 35 per the National Youth Development Agency framework.</span>,
                                    <span key="2"><strong>Impact:</strong> Drives specific reporting metrics for state-sponsored skills funding elements.</span>,
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

                {/* 7. ABSORPTION AND PERMANENT PLACEMENT */}
                <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <RingGauge percentage={complianceMetrics.absorptionRate} color="#0ea5e9" />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "#0369a1", fontWeight: 700, textTransform: "uppercase" }}>Absorption Rate</span>
                            <button type="button" onClick={() => setActiveInsight(activeInsight === "absorption" ? null : "absorption")} style={{ background: "none", border: "none", cursor: "pointer", color: "#0284c7", display: "flex" }}>
                                <Info size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
                            {complianceMetrics.absorptionRate}% Absorbed
                        </div>
                        <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>
                            Gender Split: <strong style={{ color: "var(--mlab-blue)" }}>{complianceMetrics.absorbedFemale}F / {complianceMetrics.absorbedMale}M</strong>
                        </span>
                        {activeInsight === "absorption" && (
                            <InsightPopup title="B-BBEE Scorecard Absorption" currentValue={`${complianceMetrics.absorptionRate}% Total | ${complianceMetrics.absorbedFemale}F / ${complianceMetrics.absorbedMale}M Split`}
                                actionSteps={[
                                    <span key="1"><strong>Target:</strong> 100% absorption unlocks 5 B-BBEE Bonus Points under Code Series 300.</span>,
                                    <span key="2"><strong>To Optimize:</strong> Secure key scorecard bonus allocations by confirming permanent transitions upon program completion. Ensure status is set to "Absorbed".</span>,
                                ]}
                                onClose={() => setActiveInsight(null)}
                            />
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};


// import React, { useState } from "react";
// import { Activity, X, Calculator, Landmark, Info, Wallet, Percent, Accessibility, Users } from "lucide-react";

// const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string; currentValue: string; actionSteps: React.ReactNode[]; onClose: () => void; }) => (
//     <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "8px", background: "white", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "1rem", width: "360px", zIndex: 100, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }} className="animate-fade-in">
//         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid #f1f5f9" }}>
//             <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--mlab-midnight)", fontWeight: 800, fontSize: "0.85rem" }}>
//                 <Activity size={16} color="#d97706" /> {title}
//             </div>
//             <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 0 }}>
//                 <X size={14} />
//             </button>
//         </div>
//         <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
//             {actionSteps.map((step, i) => (
//                 <div key={i} style={{ fontSize: "0.75rem", color: "#475569", lineHeight: 1.4 }}>{step}</div>
//             ))}
//         </div>
//     </div>
// );

// const RingGauge = ({ percentage, color }: { percentage: number; color: string; }) => {
//     const size = 52;
//     const stroke = 5;
//     const radius = (size - stroke) / 2;
//     const circum = radius * 2 * Math.PI;
//     const offset = circum - (Math.min(percentage, 100) / 100) * circum;

//     return (
//         <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
//             <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
//                 <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
//                 <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circum} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
//             </svg>
//             <div style={{ position: "absolute", fontSize: "0.7rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{percentage}%</div>
//         </div>
//     );
// };

// export const ComplianceMetricsGrid = ({ complianceMetrics, formatCurrency }: { complianceMetrics: any, formatCurrency: (v: number) => string }) => {
//     const [activeInsight, setActiveInsight] = useState<string | null>(null);

//     return (
//         <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)", marginBottom: "1.5rem" }}>
//             <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#92400e", fontWeight: 800, fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
//                 <Calculator size={18} /> Strategic Employment Equity & Scorecard Auditor
//             </div>

//             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
//                 {/* SARS ETI Yield Framework with Ring */}
//                 <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
//                     <RingGauge percentage={complianceMetrics.etiYieldPercentage} color="#16a34a" />
//                     <div style={{ flex: 1 }}>
//                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                             <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 700, textTransform: "uppercase" }}>SARS ETI Opt. Yield</span>
//                             <button type="button" onClick={() => setActiveInsight(activeInsight === "eti" ? null : "eti")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
//                                 <Info size={14} />
//                             </button>
//                         </div>
//                         <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
//                             {formatCurrency(complianceMetrics.monthlyETITotal)}<span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}> /mo</span>
//                         </div>
//                         <div style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", color: "#475569", fontWeight: 700, display: "inline-block", marginTop: "4px" }}>
//                             Annually: {formatCurrency(complianceMetrics.annualizedETIEstimate)}
//                         </div>
//                         {activeInsight === "eti" && (
//                             <InsightPopup title="SARS Employment Tax Incentive" currentValue={`${complianceMetrics.etiYieldPercentage}% of Active Interns are ETI-Optimized`}
//                                 actionSteps={[
//                                     <span key="1"><strong>Live Calculation:</strong> Value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
//                                     <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to max the algorithm.</span>,
//                                     <span key="3"><strong>View Math:</strong> Scroll down to the placement ledger and click on any green ETI button to view the exact math breakdown.</span>,
//                                 ]}
//                                 onClose={() => setActiveInsight(null)}
//                             />
//                         )}
//                     </div>
//                 </div>

//                 {/* B-BBEE Skills Development Spend Tracker */}
//                 <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
//                     <div style={{ background: "#f1f5f9", padding: "12px", borderRadius: "50%", color: "#475569", height: "fit-content" }}>
//                         <Wallet size={24} />
//                     </div>
//                     <div style={{ flex: 1 }}>
//                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                             <span style={{ fontSize: "0.75rem", color: "#3730a3", fontWeight: 700, textTransform: "uppercase" }}>Recognized Spend</span>
//                             <button type="button" onClick={() => setActiveInsight(activeInsight === "spend" ? null : "spend")} style={{ background: "none", border: "none", cursor: "pointer", color: "#4338ca", display: "flex" }}>
//                                 <Info size={14} />
//                             </button>
//                         </div>
//                         <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
//                             {formatCurrency(complianceMetrics.totalProjectedSpend)}
//                         </div>
//                         <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>Projected stipend capital applied to training elements.</span>
//                         {activeInsight === "spend" && (
//                             <InsightPopup title="Skills Target Spend" currentValue={formatCurrency(complianceMetrics.totalProjectedSpend)}
//                                 actionSteps={[
//                                     <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
//                                     <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
//                                 ]}
//                                 onClose={() => setActiveInsight(null)}
//                             />
//                         )}
//                     </div>
//                 </div>

//                 {/* RACIAL AND GENDER DEMOGRAPHICS */}
//                 <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
//                     <RingGauge percentage={complianceMetrics.transformationPercentage} color="#b45309" />
//                     <div style={{ flex: 1 }}>
//                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                             <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 700, textTransform: "uppercase" }}>Race & Gender Split</span>
//                             <button type="button" onClick={() => setActiveInsight(activeInsight === "transformation" ? null : "transformation")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
//                                 <Info size={14} />
//                             </button>
//                         </div>
//                         <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--mlab-midnight)", marginTop: "4px" }}>
//                             {complianceMetrics.raceCounts.African}A | {complianceMetrics.raceCounts.Coloured}C | {complianceMetrics.raceCounts.Indian}I | {complianceMetrics.raceCounts.White}W
//                         </div>
//                         <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>
//                             Gender: <strong style={{ color: "var(--mlab-blue)" }}>{complianceMetrics.totalFemale} Female / {complianceMetrics.totalMale} Male</strong>
//                         </span>
//                         {activeInsight === "transformation" && (
//                             <InsightPopup title="EEA2 Alignment Breakdown" currentValue="Total Demographics Ledger"
//                                 actionSteps={[
//                                     <span key="1"><strong>Headcounts:</strong> African ({complianceMetrics.raceCounts.African}), Coloured ({complianceMetrics.raceCounts.Coloured}), Indian ({complianceMetrics.raceCounts.Indian}), White ({complianceMetrics.raceCounts.White}).</span>,
//                                     <span key="2"><strong>B-BBEE Focus:</strong> Under Code Series 300, Skills Development sub-minimum calculations exclude White candidates from positive point matrices.</span>,
//                                 ]}
//                                 onClose={() => setActiveInsight(null)}
//                             />
//                         )}
//                     </div>
//                 </div>

//                 {/* Disability Inclusion Metric */}
//                 <div style={{ position: "relative", background: "white", padding: "1.25rem", borderRadius: "8px", border: "1px solid #fcd34d", display: "flex", gap: "1rem", alignItems: "center" }}>
//                     <RingGauge percentage={complianceMetrics.disabilityPercentage} color="#7c3aed" />
//                     <div style={{ flex: 1 }}>
//                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                             <span style={{ fontSize: "0.75rem", color: "#6d28d9", fontWeight: 700, textTransform: "uppercase" }}>Disability Framework</span>
//                             <button type="button" onClick={() => setActiveInsight(activeInsight === "disability" ? null : "disability")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", display: "flex" }}>
//                                 <Info size={14} />
//                             </button>
//                         </div>
//                         <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--mlab-midnight)", fontFamily: "var(--font-heading)", marginTop: "2px" }}>
//                             {complianceMetrics.disabilityCount} <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}>Learners</span>
//                         </div>
//                         <span style={{ fontSize: "0.65rem", color: "#64748b", display: "block", marginTop: "4px" }}>Reflects a ratio of <strong>{complianceMetrics.disabilityPercentage}%</strong> of total context.</span>
//                         {activeInsight === "disability" && (
//                             <InsightPopup title="Disability Compliance Target" currentValue={`${complianceMetrics.disabilityCount} Headcount`}
//                                 actionSteps={[
//                                     <span key="1"><strong>Audit Rule:</strong> Each instance listed here must maintain a verified medical certificate signed by an operating practitioner to claim Section 12H bonus deductions (R120k vs R80k).</span>,
//                                 ]}
//                                 onClose={() => setActiveInsight(null)}
//                             />
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };