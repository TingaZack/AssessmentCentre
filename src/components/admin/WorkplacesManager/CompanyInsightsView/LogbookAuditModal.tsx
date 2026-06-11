import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import moment from "moment";
import { X, FileText, Calendar, Clock, CheckCircle, AlertTriangle, ChevronUp, ChevronDown, History, Eye, EyeOff, ExternalLink, Layers, CheckCircle2, Activity } from "lucide-react";

export const LogbookAuditModal = ({ auditLearner, workplaceLogs, onClose }: { auditLearner: any, workplaceLogs: any[], onClose: () => void }) => {
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
    const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
    const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);

    const isImageFile = (url: string) => {
        if (!url) return false;
        return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url) || url.toLowerCase().includes(".png") || url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg");
    };

    const toggleLogAccordion = (logId: string) => {
        setExpandedLogIds((prev) => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId);
            else next.add(logId);
            return next;
        });
    };

    const toggleHistoryAccordion = (logId: string) => {
        setExpandedHistoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId);
            else next.add(logId);
            return next;
        });
    };

    // 🚀 1. Filter down to only the relevant learner's logs
    const learnerLogs = useMemo(() => {
        return workplaceLogs
            .filter((l) => l.learnerId === auditLearner.learnerId || l.learnerId === auditLearner.idNumber)
            .sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());
    }, [workplaceLogs, auditLearner]);

    // 🚀 2. Extract Unique Months for the Filter Bar
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        learnerLogs.forEach(log => {
            if (log.dateString) {
                months.add(moment(log.dateString).format("MMMM YYYY"));
            }
        });
        return Array.from(months);
    }, [learnerLogs]);

    const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || "All Time");

    // 🚀 3. Apply the Month Filter
    const filteredLogs = useMemo(() => {
        if (selectedMonth === "All Time") return learnerLogs;
        return learnerLogs.filter(log => moment(log.dateString).format("MMMM YYYY") === selectedMonth);
    }, [learnerLogs, selectedMonth]);

    // 🚀 4. Generate the Quick Audit Snapshot
    const auditSnapshot = useMemo(() => {
        let approved = 0, pending = 0, rejected = 0;
        filteredLogs.forEach(log => {
            const status = String(log.status || "").trim().toLowerCase();
            const hours = Number(log.totalHours) || 0;
            if (status === "approved") approved += hours;
            else if (status === "pending_mentor_approval" || status === "pending") pending += hours;
            else if (status === "rejected") rejected += hours;
        });
        return { approved, pending, rejected, totalLogs: filteredLogs.length };
    }, [filteredLogs]);

    return createPortal(
        <div className="lfm-overlay animate-fade-in" style={{ zIndex: 100000 }} onClick={onClose}>
            <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>

                {/* ── STRICT mLab HEADER ── */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <FileText size={18} /> Deep Logbook Audit Trail
                        <span style={{ fontSize: "0.75rem", color: "var(--mlab-white)", opacity: 0.8, letterSpacing: "normal", textTransform: "none", marginLeft: "12px", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                            Executing trace for: {auditLearner.learnerName} ({auditLearner.idNumber})
                        </span>
                    </h2>
                    <button className="lfm-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="lfm-body">

                    {/* ── AUDIT SNAPSHOT WIDGET ── */}
                    <div>
                        <div className="lfm-section-hdr"><Activity size={13} /> Logbook Tally Snapshot</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                            <div className="lfm-flags-panel" style={{ borderLeftColor: "var(--mlab-green)" }}>
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Approved</span>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px" }}>
                                    <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--mlab-blue)", fontFamily: "var(--font-heading)" }}>{auditSnapshot.approved.toFixed(1)}</span>
                                    <span style={{ fontSize: "0.8rem", color: "var(--mlab-green)", fontWeight: 700 }}>Hours</span>
                                </div>
                            </div>
                            <div className="lfm-flags-panel" style={{ borderLeftColor: "#f59e0b" }}>
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending Review</span>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px" }}>
                                    <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--mlab-blue)", fontFamily: "var(--font-heading)" }}>{auditSnapshot.pending.toFixed(1)}</span>
                                    <span style={{ fontSize: "0.8rem", color: "#d97706", fontWeight: 700 }}>Hours</span>
                                </div>
                            </div>
                            <div className="lfm-flags-panel" style={{ borderLeftColor: "var(--mlab-red)" }}>
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rejected Blocks</span>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px" }}>
                                    <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--mlab-blue)", fontFamily: "var(--font-heading)" }}>{auditSnapshot.rejected.toFixed(1)}</span>
                                    <span style={{ fontSize: "0.8rem", color: "var(--mlab-red)", fontWeight: 700 }}>Hours</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── CHRONOLOGICAL MONTH FILTER BAR ── */}
                    {availableMonths.length > 0 && (
                        <div>
                            <div className="lfm-section-hdr"><Calendar size={13} /> Timeline Filter</div>
                            <div className="lfm-tabs" style={{ overflowX: "auto" }}>
                                <button className={`lfm-tab ${selectedMonth === "All Time" ? "active" : ""}`} onClick={() => setSelectedMonth("All Time")}>
                                    All Time Trace
                                </button>
                                {availableMonths.map(month => (
                                    <button key={month} className={`lfm-tab ${selectedMonth === month ? "active" : ""}`} onClick={() => setSelectedMonth(month)}>
                                        {month}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── DETAILED AUDIT RECORDS ── */}
                    <div>
                        <div className="lfm-section-hdr"><FileText size={13} /> Traceability Ledgers</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {filteredLogs.length === 0 ? (
                                <div className="lfm-error-banner" style={{ borderLeftColor: "var(--mlab-grey)", borderColor: "var(--mlab-border)", background: "var(--mlab-light-blue)", color: "var(--mlab-grey)" }}>
                                    <History size={16} /> <span>No workplace logs detected for {selectedMonth}.</span>
                                </div>
                            ) : (
                                filteredLogs.map((log) => {
                                    const logVersions = log.history && log.history.length > 0 ? [...log.history, log].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()) : [log];
                                    const isLogExpanded = expandedLogIds.has(log.id);

                                    // Dynamic strict left-border indicator
                                    const borderColor = log.status === "Approved" ? "var(--mlab-green)" : log.status === "Rejected" ? "var(--mlab-red)" : "#f59e0b";

                                    return (
                                        <div key={log.id} style={{ border: "1px solid var(--mlab-border)", borderLeft: `4px solid ${borderColor}`, background: "var(--mlab-white)" }}>

                                            {/* ACCORDION HEADER */}
                                            <div onClick={() => toggleLogAccordion(log.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", background: isLogExpanded ? "var(--mlab-light-blue)" : "var(--mlab-white)", cursor: "pointer", transition: "background 0.2s ease" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                    <div style={{ background: "var(--mlab-blue)", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mlab-white)" }}>
                                                        <Calendar size={16} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: "var(--mlab-blue)", fontSize: "0.95rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "8px" }}>
                                                            {moment(log.dateString).format("dddd, DD MMM YYYY")}
                                                            {/* 🚀 SETA MODULE TAG */}
                                                            {log.moduleCode && (
                                                                <span style={{ fontSize: "0.6rem", background: "var(--mlab-bg)", color: "var(--mlab-grey)", padding: "2px 6px", border: "1px solid var(--mlab-border)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 700, letterSpacing: "normal" }}>
                                                                    <Layers size={10} /> {log.moduleCode}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ color: "var(--mlab-grey)", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                                            <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: "var(--mlab-green)", fontWeight: 700 }}>({log.totalHours} hrs)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                    {log.status === "Approved" && <span style={{ color: "var(--mlab-green)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}><CheckCircle2 size={14} /> Approved</span>}
                                                    {log.status === "Pending_Mentor_Approval" && <span style={{ color: "#d97706", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}><Clock size={14} /> Pending Review</span>}
                                                    {log.status === "Rejected" && <span style={{ color: "var(--mlab-red)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={14} /> Rejected</span>}
                                                    {log.status === "Draft" && <span style={{ color: "var(--mlab-grey)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}><FileText size={14} /> Draft</span>}
                                                    <div style={{ color: "var(--mlab-blue)" }}>{isLogExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                                                </div>
                                            </div>

                                            {/* ACCORDION BODY (VERSIONS) */}
                                            {isLogExpanded && (
                                                <div className="animate-fade-in" style={{ padding: "1.25rem", borderTop: "1px solid var(--mlab-border)", background: "var(--mlab-white)" }}>
                                                    {log.history && log.history.length > 0 && (
                                                        <div style={{ marginBottom: "1.5rem" }}>
                                                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => toggleHistoryAccordion(log.id)} style={{ padding: "0.5rem 0.75rem", fontSize: "0.65rem" }}>
                                                                <History size={12} /> {expandedHistoryIds.has(log.id) ? "Hide Full Audit History" : `View Full Audit History Trail (${logVersions.length} Versions)`}
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                                        {(expandedHistoryIds.has(log.id) ? logVersions : [logVersions[0]]).map((version: any, idx: number) => {
                                                            const isLatest = idx === 0;
                                                            const versionNumber = logVersions.length - idx;

                                                            return (
                                                                <div key={version.updatedAt || idx} style={{ position: "relative", paddingLeft: "1.5rem", borderLeft: "2px solid var(--mlab-border)", paddingBottom: "1.5rem" }}>
                                                                    {/* Timeline dot */}
                                                                    <div style={{ position: "absolute", left: "-7px", top: "0px", width: "12px", height: "12px", background: isLatest ? "var(--mlab-blue)" : "var(--mlab-grey-lt)", border: "2px solid var(--mlab-white)" }} />

                                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", marginTop: "-4px" }}>
                                                                        <div style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-blue)", display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                                            Version {versionNumber}
                                                                            {isLatest && <span style={{ background: "var(--mlab-blue)", color: "white", padding: "2px 6px", fontSize: "0.55rem" }}>LATEST SNAPSHOT</span>}
                                                                        </div>
                                                                        <div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", fontWeight: 600 }}>{moment(version.updatedAt || version.createdAt).format("DD MMM YYYY, HH:mm")}</div>
                                                                    </div>

                                                                    <div className="lfm-flags-panel" style={{ padding: "0.85rem", borderLeft: "none", marginBottom: "1rem" }}>
                                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "block" }}>Tasks Performed</span>
                                                                        {/* 🚀 STRICT WORD-WRAP & OVERFLOW CONTAINMENT */}
                                                                        <div
                                                                            style={{
                                                                                fontSize: "0.85rem",
                                                                                color: "var(--mlab-blue)",
                                                                                fontFamily: "var(--font-body)",
                                                                                lineHeight: 1.6,
                                                                                width: "100%",
                                                                                wordBreak: "break-word",
                                                                                overflowWrap: "break-word",
                                                                                whiteSpace: "pre-wrap",
                                                                                overflowX: "auto"
                                                                            }}
                                                                            dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<span style="font-style:italic; color:var(--mlab-grey-lt)">No description provided...</span>' }}
                                                                        />
                                                                    </div>

                                                                    {/* 🚀 MENTOR REJECTION REASON RENDERING WITH WRAP */}
                                                                    {version.status === "Rejected" && version.rejectionReason && (
                                                                        <div className="lfm-error-banner" style={{ marginBottom: "1rem", wordBreak: "break-word", overflowWrap: "break-word" }}>
                                                                            <span style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
                                                                                <strong style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mentor Rejection Reason:</strong>
                                                                                <span style={{ whiteSpace: "pre-wrap" }}>{version.rejectionReason}</span>
                                                                            </span>
                                                                        </div>
                                                                    )}

                                                                    {version.evidenceUrl && (
                                                                        <div style={{ marginBottom: "0.5rem" }}>
                                                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                                                                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Attached Evidence</span>
                                                                                <button className="lfm-btn lfm-btn--ghost" onClick={() => setPreviewEvidenceId(previewEvidenceId === version.evidenceUrl ? null : version.evidenceUrl)} style={{ padding: "0.4rem 0.8rem", fontSize: "0.65rem" }}>
                                                                                    {previewEvidenceId === version.evidenceUrl ? <><EyeOff size={12} /> Close File</> : <><Eye size={12} /> Preview File</>}
                                                                                </button>
                                                                            </div>

                                                                            {previewEvidenceId === version.evidenceUrl && (
                                                                                <div className="animate-fade-in" style={{ padding: "8px", border: "1px solid var(--mlab-border)", background: "var(--mlab-bg)" }}>
                                                                                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
                                                                                        <a href={version.evidenceUrl} target="_blank" rel="noopener noreferrer" className="lfm-btn lfm-btn--ghost" style={{ padding: "0.4rem 0.8rem", fontSize: "0.65rem", textDecoration: "none" }}><ExternalLink size={12} /> Open Full Screen</a>
                                                                                    </div>
                                                                                    <div style={{ width: "100%", minHeight: "200px", background: "white", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--mlab-border)" }}>
                                                                                        {isImageFile(version.evidenceUrl) ? <img src={version.evidenceUrl} alt="Evidence Render inline" style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }} /> : <iframe src={version.evidenceUrl} title="Evidence Preview Frame" style={{ width: "100%", height: "350px", border: "none" }} />}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <div className="lfm-footer">
                    <button className="lfm-btn lfm-btn--ghost" onClick={onClose}>Close Audit Window</button>
                </div>
            </div>
        </div>,
        document.body
    );
};