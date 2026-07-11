import React, { useEffect, useRef, useState } from "react";
import { Trash2, Plus, X, AlertCircle, Circle, Triangle, Maximize2, Minimize2 } from "lucide-react";
import { CartesianPlane } from "@zakq/axisjs";

// ---------------------------------------------------------------------------
// Design tokens mapped to mLab CSS variables
// ---------------------------------------------------------------------------
const tokens = {
    border: "var(--mlab-border)",
    borderStrong: "var(--mlab-blue)",
    panelBg: "var(--mlab-light-blue)",
    ink: "var(--mlab-blue)",
    inkMuted: "var(--mlab-grey)",
    inkFaint: "var(--mlab-grey-lt)",
    danger: "var(--mlab-red)",
    dangerBg: "#fef2f2",
    accent: "var(--mlab-blue)",
    radius: 0, // Enforcing mLab square corners
};

const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];
const SHAPE_COLORS = ["#10b981", "#6366f1", "#ec4899", "#14b8a6", "#f43f5e"];

export type PointRow = { x: string | number; y: string | number };
export type ShapeItem = { id: string; name: string; color: string; points: PointRow[] };

export interface AxisWorkspaceProps {
    value: { points?: PointRow[]; shapes?: ShapeItem[] } | undefined;
    onChange: (v: { points: PointRow[]; shapes: ShapeItem[] }) => void;
    readOnly: boolean;
}

const isValidNumber = (v: string | number | undefined | null) => {
    if (v === null || v === undefined) return false;
    const str = String(v).trim();
    return str !== "" && !isNaN(parseFloat(str));
};

const AxisWorkspace: React.FC<AxisWorkspaceProps> = ({ value, onChange, readOnly }) => {
    const workspaceRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const planeRef = useRef<CartesianPlane | null>(null);
    const pointRefs = useRef<Record<number, HTMLInputElement | null>>({});

    const isFirstLoadRef = useRef<boolean>(true);
    const [activeSection, setActiveSection] = useState<"points" | "shapes">("points");
    const [pendingPointFocus, setPendingPointFocus] = useState<number | null>(null);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    const points = value?.points || [];
    const shapes = value?.shapes || [];

    // -------------------------------------------------------------------
    // 1. Core Lifecycle Setup & Fullscreen Event Tracking
    // -------------------------------------------------------------------
    useEffect(() => {
        if (!canvasRef.current) return;

        const plane = new CartesianPlane(canvasRef.current, {
            stepSequences: [1, 2, 5],
            autoFit: false,
        });
        planeRef.current = plane;

        const ro = new ResizeObserver(() => {
            plane.resize();
        });

        if (containerRef.current) {
            ro.observe(containerRef.current);
        }

        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === workspaceRef.current);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            ro.disconnect();
            plane.destroy();
            planeRef.current = null;
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    // -------------------------------------------------------------------
    // 2. Live State Data Synchronization Engine (Inside AxisWorkspace.tsx)
    // -------------------------------------------------------------------
    useEffect(() => {
        const plane = planeRef.current;
        if (!plane) return;

        plane.clear();
        const allValidBounds: { x: number; y: number }[] = [];

        // Track 1: Standalone Points
        points.forEach((p, i) => {
            const px = parseFloat(String(p.x));
            const py = parseFloat(String(p.y));
            if (!isNaN(px) && !isNaN(py)) {
                allValidBounds.push({ x: px, y: py });
                const color = POINT_COLORS[i % POINT_COLORS.length];
                plane.addPoint(px, py, color, `(${px}, ${py})`, true);
            }
        });

        // Track 2: Connected Shapes
        shapes.forEach((shape) => {
            const shapeCoords: { x: number; y: number }[] = [];
            shape.points.forEach((p) => {
                const px = parseFloat(String(p.x));
                const py = parseFloat(String(p.y));
                if (!isNaN(px) && !isNaN(py)) {
                    shapeCoords.push({ x: px, y: py });
                    allValidBounds.push({ x: px, y: py });
                }
            });

            if (shapeCoords.length > 0) {
                plane.addPolygon(shapeCoords, `${shape.color}1f`, shape.color, 2);
                shapeCoords.forEach((coord) => {
                    // 🚀 FIXED: Swap out the empty string "" for the dynamic coordinate template literal!
                    plane.addPoint(coord.x, coord.y, shape.color, `(${coord.x}, ${coord.y})`, false);
                });
            }
        });

        if (isFirstLoadRef.current && allValidBounds.length > 0) {
            isFirstLoadRef.current = false;
            setTimeout(() => {
                planeRef.current?.animateToFit(allValidBounds);
            }, 600);
        }
    }, [points, shapes]);

    useEffect(() => {
        if (pendingPointFocus !== null) {
            pointRefs.current[pendingPointFocus]?.focus();
            setPendingPointFocus(null);
        }
    }, [pendingPointFocus, points.length]);

    // -------------------------------------------------------------------
    // Fullscreen View Mode Toggle Action
    // -------------------------------------------------------------------
    const toggleFullscreenMode = async () => {
        if (!workspaceRef.current) return;

        try {
            if (!document.fullscreenElement) {
                await workspaceRef.current.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error("Fullscreen mode request rejected:", err);
        }
    };

    // -------------------------------------------------------------------
    // Track 1: Standalone Points Mutators
    // -------------------------------------------------------------------
    const updateDiscretePoint = (index: number, axis: "x" | "y", val: string) => {
        const updated = [...points];
        updated[index] = { ...updated[index], [axis]: val };
        onChange({ points: updated, shapes });
    };

    const removeDiscretePoint = (index: number) => {
        const updated = points.filter((_, i) => i !== index);
        onChange({ points: updated, shapes });
    };

    const addDiscretePointRow = () => {
        const updated = [...points, { x: "", y: "" }];
        onChange({ points: updated, shapes });
        setPendingPointFocus(updated.length - 1);
        triggerCameraAnimation();
    };

    // -------------------------------------------------------------------
    // Track 2: Isolated Geometric Shapes Mutators
    // -------------------------------------------------------------------
    const addNewShapeTrack = () => {
        const nextColor = SHAPE_COLORS[shapes.length % SHAPE_COLORS.length];
        const newShape: ShapeItem = {
            id: crypto.randomUUID(),
            name: `Shape ${shapes.length + 1}`,
            color: nextColor,
            points: [{ x: "", y: "" }, { x: "", y: "" }, { x: "", y: "" }]
        };
        onChange({ points, shapes: [...shapes, newShape] });
        triggerCameraAnimation();
    };

    const updateShapeVertex = (shapeIndex: number, vertexIndex: number, axis: "x" | "y", val: string) => {
        const updatedShapes = [...shapes];
        const targetShape = { ...updatedShapes[shapeIndex] };
        const updatedPoints = [...targetShape.points];

        updatedPoints[vertexIndex] = { ...updatedPoints[vertexIndex], [axis]: val };
        targetShape.points = updatedPoints;
        updatedShapes[shapeIndex] = targetShape;

        onChange({ points, shapes: updatedShapes });
    };

    const addVertexToShape = (shapeIndex: number) => {
        const updatedShapes = [...shapes];
        const targetShape = { ...updatedShapes[shapeIndex] };
        targetShape.points = [...targetShape.points, { x: "", y: "" }];
        updatedShapes[shapeIndex] = targetShape;
        onChange({ points, shapes: updatedShapes });
    };

    const removeVertexFromShape = (shapeIndex: number, vertexIndex: number) => {
        const updatedShapes = [...shapes];
        const targetShape = { ...updatedShapes[shapeIndex] };
        targetShape.points = targetShape.points.filter((_, i) => i !== vertexIndex);
        updatedShapes[shapeIndex] = targetShape;
        onChange({ points, shapes: updatedShapes });
    };

    const deleteWholeShape = (shapeIndex: number) => {
        const updatedShapes = shapes.filter((_, i) => i !== shapeIndex);
        onChange({ points, shapes: updatedShapes });
    };

    // -------------------------------------------------------------------
    // Global Context Helpers
    // -------------------------------------------------------------------
    const triggerCameraAnimation = () => {
        const targets: { x: number; y: number }[] = [];
        points.forEach(p => { if (isValidNumber(p.x) && isValidNumber(p.y)) targets.push({ x: parseFloat(String(p.x)), y: parseFloat(String(p.y)) }); });
        shapes.forEach(s => s.points.forEach(p => { if (isValidNumber(p.x) && isValidNumber(p.y)) targets.push({ x: parseFloat(String(p.x)), y: parseFloat(String(p.y)) }); }));

        if (targets.length > 0) {
            setTimeout(() => planeRef.current?.animateToFit(targets), 50);
        }
    };

    const handleWipeEntireWorkspace = () => {
        if (points.length === 0 && shapes.length === 0) return;
        if (!window.confirm("Permanently wipe all discrete coordinates and shape sets?")) return;
        onChange({ points: [], shapes: [] });
    };

    return (
        <div
            ref={workspaceRef}
            style={{
                ...styles.wrapper,
                ...(isFullscreen ? styles.wrapperFullscreen : {})
            }}
        >
            {!readOnly && (
                <div style={{ ...styles.panel, ...(isFullscreen ? styles.panelFullscreen : {}) }}>
                    <div style={styles.panelHeader}>
                        <span style={styles.panelTitle}>Workspace Elements</span>
                        <button
                            onClick={handleWipeEntireWorkspace}
                            disabled={points.length === 0 && shapes.length === 0}
                            style={{
                                ...styles.textButton,
                                ...((points.length === 0 && shapes.length === 0) ? styles.textButtonDisabled : {}),
                            }}
                        >
                            <Trash2 size={13} />
                            Reset All
                        </button>
                    </div>

                    <div style={styles.tabContainer}>
                        <button
                            type="button"
                            onClick={() => setActiveSection("points")}
                            style={{ ...styles.tab, ...(activeSection === "points" ? styles.tabActive : {}) }}
                        >
                            <Circle size={12} style={{ marginRight: 6 }} />
                            Discrete Points ({points.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSection("shapes")}
                            style={{ ...styles.tab, ...(activeSection === "shapes" ? styles.tabActive : {}) }}
                        >
                            <Triangle size={12} style={{ marginRight: 6 }} />
                            Connected Shapes ({shapes.length})
                        </button>
                    </div>

                    {activeSection === "points" && (
                        <div style={styles.scrollColumn}>
                            <div style={{ ...styles.rowList, ...(isFullscreen ? styles.rowListFullscreen : {}) }}>
                                {points.map((p, i) => {
                                    const xValid = p.x === "" || isValidNumber(p.x);
                                    const yValid = p.y === "" || isValidNumber(p.y);
                                    const color = POINT_COLORS[i % POINT_COLORS.length];

                                    return (
                                        <div key={i} style={styles.row}>
                                            <span style={{ ...styles.colorDot, background: color }} />
                                            <label style={styles.fieldGroup}>
                                                <span style={styles.fieldPrefix}>X</span>
                                                <input
                                                    ref={el => { pointRefs.current[i] = el; }}
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={p.x ?? ""}
                                                    onChange={e => updateDiscretePoint(i, "x", e.target.value)}
                                                    placeholder="0"
                                                    style={{ ...styles.fieldInput, ...(xValid ? {} : styles.fieldInputInvalid) }}
                                                />
                                            </label>
                                            <label style={styles.fieldGroup}>
                                                <span style={styles.fieldPrefix}>Y</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={p.y ?? ""}
                                                    onChange={e => updateDiscretePoint(i, "y", e.target.value)}
                                                    placeholder="0"
                                                    style={{ ...styles.fieldInput, ...(yValid ? {} : styles.fieldInputInvalid) }}
                                                />
                                            </label>
                                            <button onClick={() => removeDiscretePoint(i)} style={styles.removeButton}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {points.length === 0 && (
                                    <div style={styles.emptyState}>No discrete standalone points mapped yet.</div>
                                )}
                            </div>
                            <button onClick={addDiscretePointRow} style={styles.addButton}>
                                <Plus size={14} /> Add Loose Point
                            </button>
                        </div>
                    )}

                    {activeSection === "shapes" && (
                        <div style={styles.scrollColumn}>
                            <div style={{ ...styles.rowList, ...(isFullscreen ? styles.rowListFullscreen : {}) }}>
                                {shapes.map((shape, sIdx) => (
                                    <div key={shape.id} style={styles.shapeContainer}>
                                        <div style={styles.shapeHeader}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ ...styles.colorDot, background: shape.color }} />
                                                <span style={styles.shapeLabel}>{shape.name}</span>
                                            </div>
                                            <button onClick={() => deleteWholeShape(sIdx)} style={styles.shapeDeleteBtn}>
                                                Delete Shape
                                            </button>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                                            {shape.points.map((pt, pIdx) => {
                                                const xValid = pt.x === "" || isValidNumber(pt.x);
                                                const yValid = pt.y === "" || isValidNumber(pt.y);
                                                return (
                                                    <div key={pIdx} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                        <label style={styles.miniFieldGroup}>
                                                            <span style={styles.miniFieldPrefix}>X</span>
                                                            <input
                                                                type="number"
                                                                value={pt.x ?? ""}
                                                                onChange={e => updateShapeVertex(sIdx, pIdx, "x", e.target.value)}
                                                                placeholder="0"
                                                                style={{ ...styles.miniFieldInput, ...(xValid ? {} : styles.fieldInputInvalid) }}
                                                            />
                                                        </label>
                                                        <label style={styles.miniFieldGroup}>
                                                            <span style={styles.miniFieldPrefix}>Y</span>
                                                            <input
                                                                type="number"
                                                                value={pt.y ?? ""}
                                                                onChange={e => updateShapeVertex(sIdx, pIdx, "y", e.target.value)}
                                                                placeholder="0"
                                                                style={{ ...styles.miniFieldInput, ...(yValid ? {} : styles.fieldInputInvalid) }}
                                                            />
                                                        </label>
                                                        {shape.points.length > 3 && (
                                                            <button onClick={() => removeVertexFromShape(sIdx, pIdx)} style={styles.miniRemoveButton}>
                                                                <X size={10} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button onClick={() => addVertexToShape(sIdx)} style={styles.miniAddButton}>
                                            <Plus size={10} /> Add Polygon Corner
                                        </button>
                                    </div>
                                ))}
                                {shapes.length === 0 && (
                                    <div style={styles.emptyState}>No connected geometric shapes constructed yet.</div>
                                )}
                            </div>
                            <button onClick={addNewShapeTrack} style={styles.addButton}>
                                <Plus size={14} /> Build Connected Shape
                            </button>
                        </div>
                    )}

                    {([...points, ...shapes.flatMap(s => s.points)].some(p => p.x !== "" && !isValidNumber(p.x) || p.y !== "" && !isValidNumber(p.y))) && (
                        <div style={styles.warning}>
                            <AlertCircle size={13} style={{ flexShrink: 0 }} />
                            <span>Invalid coordinate sets will be skipped from rendering layers.</span>
                        </div>
                    )}
                </div>
            )}

            <div style={{ ...styles.canvasColumn, ...(isFullscreen ? styles.canvasColumnFullscreen : {}) }}>
                <div
                    ref={containerRef}
                    style={{
                        ...styles.canvasContainer,
                        ...(isFullscreen ? styles.canvasContainerFullscreen : {})
                    }}
                >
                    <canvas ref={canvasRef} style={styles.canvas} />

                    <button
                        type="button"
                        onClick={toggleFullscreenMode}
                        style={styles.fullscreenFloatingButton}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 color="var(--mlab-blue)" size={14} /> : <Maximize2 color="var(--mlab-blue)" size={14} />}
                        <Minimize2 color="var(--mlab-blue)" size={14} />
                    </button>
                </div>
                <span style={styles.hint}>Drag grid layout to pan · Use scroll interaction wheel to zoom viewport limits</span>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Unified CSS-in-JS UI Layout Specifications
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        display: "flex",
        gap: 16,
        flexDirection: "row",
        flexWrap: "wrap",
        background: "transparent",
        height: "100%",
    },

    wrapperFullscreen: {
        width: "100vw",
        height: "100vh",
        padding: "16px",
        boxSizing: "border-box",
        background: "var(--mlab-bg, #f8fafc)",
        overflow: "hidden",
        flexWrap: "nowrap",
        alignItems: "stretch"
    },
    panel: {
        width: 320,
        flex: "0 0 320px",
        maxWidth: 340,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: tokens.panelBg,
        padding: "1rem",
        border: `1px solid ${tokens.border}`,
        borderLeft: `4px solid ${tokens.borderStrong}`,
        borderRadius: tokens.radius,
    },
    panelFullscreen: {
        height: "100%",
        maxHeight: "100%",
        boxSizing: "border-box"
    },
    panelHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `2px solid ${tokens.borderStrong}`,
        paddingBottom: "0.5rem",
    },
    panelTitle: {
        fontFamily: "var(--font-heading)",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: tokens.ink,
    },
    tabContainer: { display: "flex", borderBottom: `1px solid ${tokens.border}`, gap: 4, paddingBottom: 2 },
    tab: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        padding: "6px 2px",
        fontFamily: "var(--font-heading)",
        fontSize: "0.68rem",
        fontWeight: 600,
        color: tokens.inkMuted,
        cursor: "pointer",
        outline: "none",
        borderBottom: "2px solid transparent",
    },
    tabActive: {
        color: tokens.ink,
        borderBottom: `2px solid ${tokens.borderStrong}`,
        fontWeight: 700,
    },
    scrollColumn: { display: "flex", flexDirection: "column", gap: 10 },
    rowList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto", paddingRight: 4 },
    rowListFullscreen: {
        maxHeight: "calc(100vh - 180px)"
    },
    row: {
        display: "flex",
        gap: 6,
        alignItems: "center",
        background: "var(--mlab-white)",
        padding: "6px 8px",
        border: `1px solid ${tokens.border}`,
    },
    shapeContainer: {
        display: "flex",
        flexDirection: "column",
        background: "var(--mlab-white)",
        padding: "8px",
        border: `1px solid ${tokens.border}`,
        gap: 6,
    },
    shapeHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px dashed ${tokens.border}`, paddingBottom: 4 },
    shapeLabel: { fontFamily: "var(--font-heading)", fontSize: "0.7rem", fontWeight: 700, color: tokens.ink },
    shapeDeleteBtn: { background: "transparent", border: "none", fontSize: "0.65rem", color: tokens.danger, cursor: "pointer", fontWeight: 600 },
    colorDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
    fieldGroup: { display: "flex", alignItems: "center", border: `1px solid ${tokens.border}`, overflow: "hidden" },
    fieldPrefix: { padding: "4px 6px", fontFamily: "var(--font-heading)", fontSize: "0.65rem", fontWeight: 600, color: tokens.inkMuted, background: "var(--mlab-bg)", borderRight: `1px solid ${tokens.border}` },
    fieldInput: { width: 55, border: "none", background: "transparent", padding: "4px", fontFamily: "var(--font-body)", fontSize: "0.8rem", color: tokens.ink, outline: "none" },
    miniFieldGroup: { display: "flex", alignItems: "center", border: `1px solid ${tokens.border}`, flex: 1, overflow: "hidden" },
    miniFieldPrefix: { padding: "2px 4px", fontFamily: "var(--font-heading)", fontSize: "0.65rem", fontWeight: 600, color: tokens.inkMuted, background: "var(--mlab-bg)", borderRight: `1px solid ${tokens.border}` },
    miniFieldInput: { width: "100%", minWidth: 20, border: "none", background: "transparent", padding: "2px 4px", fontFamily: "var(--font-body)", fontSize: "0.75rem", color: tokens.ink, outline: "none" },
    fieldInputInvalid: { background: tokens.dangerBg, color: tokens.danger },
    removeButton: { background: "transparent", border: "none", color: tokens.inkFaint, cursor: "pointer", padding: 2, marginLeft: "auto" },
    miniRemoveButton: { background: "transparent", border: "none", color: tokens.inkFaint, cursor: "pointer", padding: 1 },
    miniAddButton: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "var(--mlab-bg)", border: `1px dashed ${tokens.border}`, color: tokens.ink, fontSize: "0.65rem", fontWeight: 600, padding: "3px", cursor: "pointer", marginTop: 2 },
    addButton: { display: "flex", justifyContent: "center", alignItems: "center", gap: 6, width: "100%", padding: "0.5rem", background: tokens.accent, color: "var(--mlab-white)", border: "none", fontFamily: "var(--font-heading)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" },
    textButton: { display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", fontFamily: "var(--font-body)", fontSize: "0.7rem", fontWeight: 600, color: tokens.danger, cursor: "pointer" },
    textButtonDisabled: { color: tokens.inkFaint, cursor: "not-allowed" },
    emptyState: { textAlign: "center", padding: "1rem 0.5rem", color: tokens.inkMuted, fontFamily: "var(--font-body)", fontSize: "0.75rem" },
    warning: { display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 8px" },
    canvasColumn: {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
    },

    canvasColumnFullscreen: {
        height: "100%"
    },
    canvasContainer: {
        position: "relative",
        width: "100%",
        flex: 1,
        minHeight: 400,
        overflow: "hidden",
        border: `2px solid ${tokens.borderStrong}`,
        background: "var(--mlab-white)",
    },
    canvasContainerFullscreen: {
        flex: 1,
        height: "auto"
    },
    canvas: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" },
    hint: { fontFamily: "var(--font-body)", fontSize: "0.75rem", color: tokens.inkMuted },
    fullscreenFloatingButton: {
        position: "absolute",
        top: 12,
        right: 12,
        // zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // width: 28,
        // height: 28,
        background: "var(--mlab-white)",
        border: `1px solid ${tokens.border}`,
        color: tokens.ink,
        cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
        transition: "all 0.1s ease",
    }
};

export default AxisWorkspace;