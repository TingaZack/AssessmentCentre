import React, { useRef, useState } from "react";
import "./LearnerContentHub.css";

const ICONS: Record<string, string> = {
    play: "M8 5v14l11-7z",
    quiz: "M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.1-1.5 2.4M12 18h.01",
    exam: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
    lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
};

export interface Stage {
    key: string;
    label: string;
    hint: string;
    icon: "play" | "quiz" | "exam";
    from: string;
    to: string;
    title: string;
    body: string;
    cta: string;
    isLocked?: boolean;
}

export type StageStatus = "todo" | "done" | "failed" | "pending";

export const DEFAULT_STAGES: Stage[] = [
    {
        key: "watch",
        label: "Watch",
        hint: "Video & lesson content",
        icon: "play",
        from: "#0284c7",
        to: "#6366f1",
        title: "Learn the lesson material",
        body: "Watch the lesson and follow the material at your own pace. Rewind, skip ahead, or come back any time.",
        cta: "Resume lesson",
        isLocked: false
    },
    {
        key: "quiz",
        label: "Knowledge check",
        hint: "AI audio check",
        icon: "quiz",
        from: "#4f46e5",
        to: "#ec4899",
        title: "In-lesson verification check",
        body: "Answer the verification prompt. It is a quick check on what you just learned, and you can retry if needed.",
        cta: "Start knowledge check",
        isLocked: true
    },
    {
        key: "exam",
        label: "Assessment",
        hint: "SETA / QCTO exam",
        icon: "exam",
        from: "#7c3aed",
        to: "#f59e0b",
        title: "Formal examination module",
        body: "The accredited examination module. Review the pre-flight overview so you know what to expect before you submit.",
        cta: "Open exam overview",
        isLocked: true
    }
];

const Icon: React.FC<{ name: string; size?: number }> = ({ name, size = 20 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={name === "play" || name === "exam" ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[name] || ICONS.play} />
    </svg>
);

export interface LearningFlowProps {
    stages?: Stage[];
    statuses?: Record<string, StageStatus>;
    selected?: number;
    onSelect?: (index: number, stage: Stage) => void;
    onAction?: (stage: Stage) => void;
}

export default function LearningFlow({ stages = DEFAULT_STAGES, statuses = {}, selected, onSelect, onAction }: LearningFlowProps) {
    const [inner, setInner] = useState(0);
    const sel = selected ?? inner;
    const prev = useRef(sel);
    const dir = sel >= prev.current ? "fwd" : "back";

    const pick = (i: number) => {
        // 🔒 Block selection if stage is locked
        if (stages[i]?.isLocked) return;
        prev.current = sel;
        setInner(i);
        onSelect?.(i, stages[i]);
    };

    const cur = stages[sel] || stages[0];
    const n = stages.length;
    const doneCount = stages.filter((s) => statuses[s.key] === "done").length;

    return (
        <section className="lf" style={{ "--from": cur.from, "--to": cur.to } as React.CSSProperties}>
            <div className="lf-aurora" />

            <div className="lf-row" role="tablist">
                {stages.map((s, i) => {
                    const st = statuses[s.key] || "todo";
                    const on = i === sel;
                    const locked = Boolean(s.isLocked);

                    return (
                        <button
                            key={s.key}
                            role="tab"
                            aria-selected={on}
                            aria-disabled={locked}
                            className={`lf-chev ${on ? "on" : ""} ${st} ${locked ? "locked" : ""} ${i === 0 ? "first" : ""}`}
                            style={{ "--f": s.from, "--t": s.to, zIndex: on ? 5 : n - i } as React.CSSProperties}
                            onClick={() => pick(i)}
                        >
                            <span className="lf-edge"><span className="lf-face">
                                <span className="lf-ico">
                                    <Icon name={locked ? "lock" : s.icon} />
                                </span>
                                <span className="lf-txt">
                                    <b>{s.label}</b>
                                    <small>{locked ? "Complete previous step" : s.hint}</small>
                                </span>
                                <span className={`lf-chip ${st}`}>
                                    {st === "done" ? "✓" : st === "failed" ? "!" : st === "pending" ? "⏳" : locked ? "🔒" : i + 1}
                                </span>
                            </span></span>
                        </button>
                    );
                })}
            </div>

            {/* Beam line track */}
            <div className="lf-beam">
                <div className="lf-beam-fill" style={{ width: `${((sel + 0.5) / n) * 100}%` }} />
                <div className="lf-comet" style={{ left: `${((sel + 0.5) / n) * 100}%` }} />
            </div>

            {/* Action panel below */}
            <div key={sel} className={`lf-panel ${dir}`}>
                <div>
                    <p className="lf-meta">{doneCount} of {n} requirements completed</p>
                    <h3>{cur.title}</h3>
                    <p className="lf-body">{cur.body}</p>
                </div>
                <button
                    className="lf-cta"
                    onClick={() => onAction?.(cur)}
                    disabled={cur.isLocked}
                    style={{ opacity: cur.isLocked ? 0.5 : 1, cursor: cur.isLocked ? 'not-allowed' : 'pointer' }}
                >
                    {statuses[cur.key] === "failed" ? "Retry check" : cur.cta}
                </button>
            </div>
        </section>
    );
}





// import React, { useRef, useState } from "react";
// import "./LearnerContentHub.css";

// const ICONS: Record<string, string> = {
//     play: "M8 5v14l11-7z",
//     quiz: "M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.1-1.5 2.4M12 18h.01",
//     exam: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
//     badge: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4",
// };

// export interface Stage {
//     key: string;
//     label: string;
//     hint: string;
//     icon: "play" | "quiz" | "exam" | "badge";
//     from: string;
//     to: string;
//     title: string;
//     body: string;
//     cta: string;
// }

// export type StageStatus = "todo" | "done" | "failed";

// export const DEFAULT_STAGES: Stage[] = [
//     {
//         key: "watch", label: "Watch", hint: "Video & lesson content", icon: "play", from: "#22d3ee", to: "#6366f1",
//         title: "Learn it first", body: "Watch the lesson and follow the material at your own pace. Rewind, skip ahead, or come back any time.", cta: "Resume lesson"
//     },
//     {
//         key: "quiz", label: "Knowledge check", hint: "AI audio check", icon: "quiz", from: "#a78bfa", to: "#ec4899",
//         title: "Prove you understood", body: "Answer a few questions out loud. It is a quick check on what you just learned, and you can retry as often as you like.", cta: "Start knowledge check"
//     },
//     {
//         key: "exam", label: "Assessment", hint: "SETA / QCTO exam", icon: "exam", from: "#fb7185", to: "#f59e0b",
//         title: "Formal assessment", body: "The accredited examination module. Review the pre-flight overview so you know what to expect before you submit.", cta: "Open exam overview"
//     },
//     {
//         key: "done", label: "Competent", hint: "Certificate & credit", icon: "badge", from: "#34d399", to: "#a3e635",
//         title: "Your result", body: "Once your assessment is marked, your credit and certificate show up here.", cta: "View my progress"
//     },
// ];

// const Icon: React.FC<{ name: string; size?: number }> = ({ name, size = 24 }) => (
//     <svg viewBox="0 0 24 24" width={size} height={size} fill={name === "play" || name === "exam" ? "currentColor" : "none"}
//         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
//         <path d={ICONS[name] || ICONS.play} />
//     </svg>
// );

// export interface LearningFlowProps {
//     stages?: Stage[];
//     statuses?: Record<string, StageStatus>;
//     selected?: number;
//     onSelect?: (index: number, stage: Stage) => void;
//     onAction?: (stage: Stage) => void;
// }

// export default function LearningFlow({ stages = DEFAULT_STAGES, statuses = {}, selected, onSelect, onAction }: LearningFlowProps) {
//     const [inner, setInner] = useState(0);
//     const sel = selected ?? inner;
//     const prev = useRef(sel);
//     const dir = sel >= prev.current ? "fwd" : "back";
//     const [pulse, setPulse] = useState(0);

//     const pick = (i: number) => {
//         prev.current = sel;
//         setInner(i);
//         setPulse((p) => p + 1);
//         onSelect?.(i, stages[i]);
//     };

//     const cur = stages[sel] || stages[0];
//     const n = stages.length;
//     const doneCount = stages.filter((s) => statuses[s.key] === "done").length;

//     return (
//         <section className="lf" style={{ "--from": cur.from, "--to": cur.to } as React.CSSProperties}>
//             <div className="lf-aurora" />

//             <div className="lf-row" role="tablist">
//                 {stages.map((s, i) => {
//                     const st = statuses[s.key] || "todo";
//                     const on = i === sel;
//                     return (
//                         <button
//                             key={s.key} role="tab" aria-selected={on}
//                             className={`lf-chev ${on ? "on" : ""} ${st} ${i === 0 ? "first" : ""}`}
//                             style={{ "--f": s.from, "--t": s.to, zIndex: on ? 5 : n - i } as React.CSSProperties}
//                             onClick={() => pick(i)}
//                         >
//                             <span className="lf-edge"><span className="lf-face">
//                                 <span className="lf-ico"><Icon name={s.icon} /></span>
//                                 <span className="lf-txt">
//                                     <b>{s.label}</b>
//                                     <small>{s.hint}</small>
//                                 </span>
//                                 <span className={`lf-chip ${st}`}>
//                                     {st === "done" ? "✓" : st === "failed" ? "!" : i + 1}
//                                 </span>
//                             </span></span>
//                             {on && (
//                                 <span key={pulse} className="lf-burst" aria-hidden="true">
//                                     <i className="ring" /><i className="ring r2" />
//                                     {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => <i key={k} className="dot" style={{ "--a": `${k * 45}deg` } as React.CSSProperties} />)}
//                                 </span>
//                             )}
//                         </button>
//                     );
//                 })}
//             </div>

//             {/* beam: glowing comet travels to whichever step is selected */}
//             <div className="lf-beam">
//                 <div className="lf-beam-fill" style={{ width: `${((sel + 0.5) / n) * 100}%` }} />
//                 <div className="lf-comet" style={{ left: `${((sel + 0.5) / n) * 100}%` }} />
//                 {stages.map((s, i) => (
//                     <span key={s.key} className={`lf-tick ${statuses[s.key] === "done" ? "done" : ""} ${i <= sel ? "lit" : ""}`}
//                         style={{ left: `${((i + 0.5) / n) * 100}%`, "--f": s.from } as React.CSSProperties} />
//                 ))}
//             </div>

//             <div key={sel} className={`lf-panel ${dir}`}>
//                 <div>
//                     <p className="lf-meta">{doneCount} of {n} steps complete</p>
//                     <h3>{cur.title}</h3>
//                     <p className="lf-body">{cur.body}</p>
//                 </div>
//                 <button className="lf-cta" onClick={() => onAction?.(cur)}>{statuses[cur.key] === "failed" ? "Retry now" : cur.cta}</button>
//             </div>
//         </section>
//     );
// }