// src/components/admin/WorkplacesManager/UnclaimedEtiBanner.tsx

import React, { useState } from "react";
import { Coins, ArrowRight, ShieldAlert, Sparkles, FileText, ChevronDown, ChevronUp, Landmark, Calculator } from "lucide-react";
import type { EnrichedPlacement } from "./CompanyInsightsView";

interface UnclaimedEtiBannerProps {
    placements: EnrichedPlacement[];
    companyName: string;
    isSarsCompliant?: boolean;
    isClaimingEti?: boolean;
    onFixComplianceClick?: () => void;
}

export const UnclaimedEtiBanner: React.FC<UnclaimedEtiBannerProps> = ({
    placements,
    companyName,
    isSarsCompliant = false,
    isClaimingEti = false,
    onFixComplianceClick,
}) => {
    const [showBreakdown, setShowBreakdown] = useState(false);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(val || 0);

    // ── 1. Active Placements Pool ──
    const activePlacements = placements.filter((p) => {
        const s = p.status.toLowerCase();
        return s.includes("active") || s.includes("pending") || s.includes("interview");
    });

    // ── 2. ETI Calculation (PAYE Rebates) ──
    const eligibleEtiLearners = activePlacements.filter((p) => p.isEtiEligible && (Number(p.stipendAmount) || 0) > 0);
    const monthlyPotentialEti = eligibleEtiLearners.reduce((sum, p) => sum + (p.etiMonthlyValue || 0), 0);
    const annualizedEti = monthlyPotentialEti * 12;

    // ── 3. Section 12H Allowance Calculation (Income Tax Deductions) ──
    // Standard Learner = R80,000 | Disability Learner = R120,000 (S12H Income Tax Act)
    const totalS12hAllowance = placements.reduce((sum, p) => sum + (p.s12hAllowanceTotal || 0), 0);
    const disabledLearnersCount = placements.filter((p) => p.hasDisability).length;

    // ── 4. Total Potential Tax Value ──
    const totalPotentialTaxBenefit = annualizedEti + totalS12hAllowance;

    if (placements.length === 0) return null;

    return (
        <div
            style={{
                background: "linear-gradient(135deg, #073f4e 0%, #052e3a 100%)",
                borderLeft: "6px solid var(--mlab-green)",
                padding: "1.25rem 1.5rem",
                color: "white",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginBottom: "1.5rem",
                boxShadow: "0 4px 12px rgba(7, 63, 78, 0.15)",
            }}
            className="animate-fade-in"
        >
            {/* TOP BAR */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ background: "rgba(148, 199, 61, 0.2)", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Coins size={24} color="var(--mlab-green)" />
                    </div>
                    <div>
                        <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mlab-green)", fontWeight: 700 }}>
                            SARS Tax Incentive Opportunity Engine
                        </div>
                        <h3 style={{ margin: 0, fontSize: "1.15rem", fontFamily: "var(--font-heading)", letterSpacing: "0.05em", color: "white" }}>
                            UNCLAIMED REBATES & SECTION 12H ALLOWANCES
                        </h3>
                    </div>
                </div>

                <div style={{ textAlign: "right", background: "rgba(255, 255, 255, 0.05)", padding: "8px 16px", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>
                        Total Potential Tax Savings
                    </div>
                    <div style={{ fontSize: "1.8rem", fontFamily: "var(--font-heading)", fontWeight: 800, color: "var(--mlab-green)", lineHeight: 1 }}>
                        {formatCurrency(totalPotentialTaxBenefit)}
                    </div>
                </div>
            </div>

            {/* MESSAGING */}
            <div style={{ fontSize: "0.85rem", color: "#e2e8f0", lineHeight: 1.5 }}>
                Based on active placement records, <strong style={{ color: "white" }}>{companyName}</strong> is eligible for two major SARS tax relief incentives under South African tax law:
            </div>

            {/* METRICS SPLIT: ETI VS SECTION 12H */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>

                {/* CARD 1: ETI PAYE REBATE */}
                <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--mlab-green)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Sparkles size={12} /> ETI Monthly PAYE Incentive
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{eligibleEtiLearners.length} Youth Interns</span>
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 800, fontFamily: "var(--font-heading)", color: "white" }}>
                        {formatCurrency(annualizedEti)} <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 400 }}>/year</span>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "0.72rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                        Reduces monthly PAYE taxes by up to <strong>{formatCurrency(monthlyPotentialEti)}/mo</strong> for qualifying youth learners (Ages 18–29).
                    </p>
                </div>

                {/* CARD 2: SECTION 12H TAX ALLOWANCE */}
                <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Landmark size={12} /> Section 12H Tax Deduction
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{placements.length} Placements</span>
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 800, fontFamily: "var(--font-heading)", color: "white" }}>
                        {formatCurrency(totalS12hAllowance)} <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 400 }}>deduction</span>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "0.72rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                        Claim <strong>R80,000</strong> (able-bodied) or <strong>R120,000</strong> (disability) per learner in corporate tax deductions upon commencement & completion.
                    </p>
                </div>

            </div>

            {/* ACTION BAR */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.85rem", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.75rem", color: "#94a3b8" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <ShieldAlert size={13} color="#f59e0b" />
                        {!isSarsCompliant ? "SARS Tax Compliance Action Required" : "ETI & S12H Active"}
                    </span>
                    <span>•</span>
                    <span>{disabledLearnersCount} Learners with Disability (R120k Rate)</span>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        type="button"
                        onClick={() => setShowBreakdown(!showBreakdown)}
                        style={{
                            background: "rgba(255,255,255,0.1)",
                            color: "white",
                            border: "1px solid rgba(255,255,255,0.2)",
                            padding: "6px 12px",
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-heading)",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                        }}
                    >
                        <Calculator size={13} /> {showBreakdown ? "Hide Formula" : "How It's Calculated"} {showBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    <button
                        type="button"
                        onClick={onFixComplianceClick}
                        style={{
                            background: "var(--mlab-green)",
                            border: "none",
                            padding: "6px 14px",
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-heading)",
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        <FileText size={13} /> View Tax Guide <ArrowRight size={13} />
                    </button>
                </div>
            </div>

            {/* EXPANDABLE MATHEMATICAL AUDIT BREAKDOWN */}
            {showBreakdown && (
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "1rem", border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.75rem", color: "#cbd5e1" }} className="animate-fade-in">
                    <div style={{ fontWeight: 700, color: "var(--mlab-green)", marginBottom: "6px", textTransform: "uppercase" }}>
                        Official SARS Formula Check for {companyName}:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <li>
                            <strong>ETI PAYE Reduction:</strong> {eligibleEtiLearners.length} eligible youth intern(s) × average monthly claim = <strong>{formatCurrency(monthlyPotentialEti)}/month</strong> (R{formatCurrency(annualizedEti)} per annum).
                        </li>
                        <li>
                            <strong>Section 12H Commencement Allowance:</strong> R40,000 (standard) or R60,000 (disability) tax deduction registered on SARS IT14 return upon signing agreement.
                        </li>
                        <li>
                            <strong>Section 12H Completion Allowance:</strong> R40,000 (standard) or R60,000 (disability) tax deduction registered on SARS IT14 return upon successful completion.
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};