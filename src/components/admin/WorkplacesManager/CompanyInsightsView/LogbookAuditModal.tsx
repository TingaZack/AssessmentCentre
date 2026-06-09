import React, { useState } from "react";
import { createPortal } from "react-dom";
import moment from "moment";
import { X, FileText, Calendar, Clock, CheckCircle, AlertTriangle, ChevronUp, ChevronDown, History, Eye, EyeOff, ExternalLink } from "lucide-react";

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

    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, padding: "1.5rem", background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)" }}>
            <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "800px", height: "90vh", display: "flex", flexDirection: "column", background: "white", borderRadius: "12px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
                <div className="lfm-header" style={{ flex: "0 0 auto", padding: "1.25rem 1.5rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>
                        <FileText size={18} /> Workplace Log Audits - {auditLearner.learnerName}
                    </h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="lfm-body" style={{ flex: "1 1 auto", overflowY: "auto", padding: "1.5rem", background: "#f8fafc" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        {workplaceLogs
                            .filter((l) => l.learnerId === auditLearner.learnerId || l.learnerId === auditLearner.idNumber)
                            .sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime())
                            .map((log) => {
                                const logVersions = log.history && log.history.length > 0 ? [...log.history, log].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()) : [log];
                                const isLogExpanded = expandedLogIds.has(log.id);

                                return (
                                    <div key={log.id} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                                        <div onClick={() => toggleLogAccordion(log.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem", background: isLogExpanded ? "#f8fafc" : "white", borderBottom: isLogExpanded ? "1px solid #f1f5f9" : "none", cursor: "pointer", transition: "background 0.2s ease" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                <div style={{ background: "var(--mlab-midnight)", width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                                                    <Calendar size={16} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: "var(--mlab-midnight)", fontSize: "1rem" }}>{moment(log.dateString).format("dddd, DD MMM YYYY")}</div>
                                                    <div style={{ color: "var(--mlab-grey)", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                                                        <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: "#ea580c" }}>({log.totalHours} hrs)</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                {log.status === "Approved" && <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", border: "1px solid #bbf7d0" }}><CheckCircle size={12} style={{ display: "inline", marginBottom: "-2px" }} /> Approved</span>}
                                                {log.status === "Pending_Mentor_Approval" && <span style={{ background: "#fef3c7", color: "#b45309", padding: "4px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", border: "1px solid #fde68a" }}>Pending Review</span>}
                                                {log.status === "Rejected" && <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", border: "1px solid #fecaca" }}>Rejected</span>}
                                                {log.status === "Draft" && <span style={{ background: "#f1f5f9", color: "#475569", padding: "4px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", border: "1px solid #cbd5e1" }}>Draft</span>}
                                                <div style={{ color: "#94a3b8", display: "flex", alignItems: "center" }}>{isLogExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                                            </div>
                                        </div>

                                        {isLogExpanded && (
                                            <div className="animate-fade-in" style={{ padding: "1.25rem" }}>
                                                {log.history && log.history.length > 0 && (
                                                    <div style={{ marginBottom: "16px" }}>
                                                        <button type="button" onClick={() => toggleHistoryAccordion(log.id)} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                                                            <History size={12} /> {expandedHistoryIds.has(log.id) ? "Hide Full Audit History" : `View Full Audit History Trail (${logVersions.length} Versions)`}
                                                        </button>
                                                    </div>
                                                )}

                                                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                                    {(expandedHistoryIds.has(log.id) ? logVersions : [logVersions[0]]).map((version: any, idx: number) => {
                                                        const isLatest = idx === 0;
                                                        const versionNumber = logVersions.length - idx;

                                                        return (
                                                            <div key={version.updatedAt || idx} style={{ position: "relative", paddingLeft: "20px", borderLeft: "2px solid var(--mlab-border)" }}>
                                                                <div style={{ position: "absolute", left: "-8px", top: "0px", width: "14px", height: "14px", borderRadius: "50%", background: isLatest ? "var(--mlab-blue)" : "#cbd5e1", border: "3px solid white" }} />
                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                                                    <div style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "var(--mlab-midnight)", display: "flex", alignItems: "center", gap: "8px" }}>
                                                                        Version {versionNumber}
                                                                        {isLatest && <span style={{ fontSize: "0.65rem", background: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: "12px", textTransform: "uppercase" }}>Latest</span>}
                                                                    </div>
                                                                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{moment(version.updatedAt).format("DD MMM YYYY, HH:mm")}</div>
                                                                </div>

                                                                <div style={{ marginBottom: "1rem" }}>
                                                                    <h4 style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--mlab-grey)", margin: "0 0 6px 0", letterSpacing: "0.05em" }}>Tasks Performed</h4>
                                                                    <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", color: "#334155", fontSize: "0.85rem", lineHeight: 1.6 }} className="quill-content-display" dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }} />
                                                                </div>

                                                                {version.evidenceUrl && (
                                                                    <div style={{ marginBottom: "1rem" }}>
                                                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                                                            <h4 style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--mlab-grey)", margin: 0, letterSpacing: "0.05em" }}>Attached Evidence</h4>
                                                                            <button onClick={() => setPreviewEvidenceId(previewEvidenceId === version.evidenceUrl ? null : version.evidenceUrl)} style={{ background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                                                                                {previewEvidenceId === version.evidenceUrl ? <EyeOff size={12} /> : <Eye size={12} />} {previewEvidenceId === version.evidenceUrl ? "Close File" : "Preview File"}
                                                                            </button>
                                                                        </div>

                                                                        {previewEvidenceId === version.evidenceUrl && (
                                                                            <div className="animate-fade-in" style={{ padding: "8px", border: "1px solid var(--mlab-border)", borderRadius: "8px", background: "#f1f5f9" }}>
                                                                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
                                                                                    <a href={version.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 600, color: "#475569", background: "white", padding: "4px 10px", borderRadius: "4px", textDecoration: "none", border: "1px solid #cbd5e1" }}><ExternalLink size={12} /> Open Full Screen</a>
                                                                                </div>
                                                                                <div style={{ width: "100%", minHeight: "200px", background: "white", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
                            })}
                    </div>
                </div>
                <div className="lfm-footer" style={{ flex: "0 0 auto", display: "flex", justifyContent: "flex-end", padding: "1rem 1.5rem", background: "white", borderTop: "1px solid #e2e8f0" }}>
                    <button className="mlab-btn mlab-btn--ghost" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}>Close Audit Window</button>
                </div>
            </div>
        </div>,
        document.body
    );
};