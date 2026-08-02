// ════════════════════════════════════════════════════════════════════════════
// 🥂 GLASSMORPHISM GAMIFICATION POPUP — MOOD-AWARE ELEGANCE
// ════════════════════════════════════════════════════════════════════════════

import {
    Award,
    Zap,
    Sparkles,
    TrendingUp,
    TrendingDown,
    Bell,
    AlertTriangle,
    ShieldAlert,
    Target,
    ArrowRight,
    Diamond
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

// ─── Types ─────────────────────────────────────────────────────────────────
interface WelcomeGamificationPopupProps {
    userName: string;
    score: number;
    pendingCount: number;
    onDismiss: () => void;
    targetRef?: React.RefObject<HTMLElement | null>;
}

interface Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    size: number;
    opacity: number;
    shape: "circle" | "square" | "triangle";
}

type Mood = "success" | "warning" | "danger";

interface MoodConfig {
    mood: Mood;
    primary: string;
    primaryGlow: string;
    ambientGlow: string;
    glassTint: string;
    icon: React.ElementType;
    badgeIcon: React.ElementType;
    badgeText: string;
    scoreLabel: string;
    titleLine1: string;
    titleLine2: string;
    messageTone: "celebration" | "concern" | "urgent";
    btnText: string;
    showConfetti: boolean;
    entranceAnim: string;
}

// ════════════════════════════════════════════════════════════════════════════
export const WelcomeGamificationPopup = ({
    userName,
    score,
    pendingCount,
    onDismiss,
    targetRef
}: WelcomeGamificationPopupProps) => {
    const [phase, setPhase] = useState<"entering" | "idle" | "flying" | "exiting">("entering");
    const [displayScore, setDisplayScore] = useState(0);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [shake, setShake] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number>(0);
    const particleIdRef = useRef(0);

    const firstName = userName.split(" ")[0];

    // ─── Mood Configuration ──────────────────────────────────────────────────
    const config: MoodConfig = useMemo(() => {
        if (score < 0) {
            return {
                mood: "danger",
                primary: "#f87171",
                primaryGlow: "0 0 60px rgba(248,113,113,0.35)",
                ambientGlow: "radial-gradient(circle at 20% 30%, rgba(248,113,113,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(220,38,38,0.15) 0%, transparent 50%)",
                glassTint: "rgba(248,113,113,0.06)",
                icon: ShieldAlert,
                badgeIcon: TrendingDown,
                badgeText: "Critical",
                scoreLabel: "Immediate Action Required",
                titleLine1: "Attention needed,",
                titleLine2: `${firstName}`,
                messageTone: "urgent",
                btnText: "Resolve Now",
                showConfetti: false,
                entranceAnim: "wgGlassDangerIn",
            };
        }
        if (score < 50) {
            return {
                mood: "warning",
                primary: "#fbbf24",
                primaryGlow: "0 0 50px rgba(251,191,36,0.3)",
                ambientGlow: "radial-gradient(circle at 20% 30%, rgba(251,191,36,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(245,158,11,0.1) 0%, transparent 50%)",
                glassTint: "rgba(251,191,36,0.05)",
                icon: AlertTriangle,
                badgeIcon: TrendingDown,
                badgeText: "Falling Behind",
                scoreLabel: "Below Target",
                titleLine1: "Keep pushing,",
                titleLine2: `${firstName}`,
                messageTone: "concern",
                btnText: "Catch Up",
                showConfetti: false,
                entranceAnim: "wgGlassWarningIn",
            };
        }
        return {
            mood: "success",
            primary: "#a3e635",
            primaryGlow: "0 0 50px rgba(163,230,53,0.3)",
            ambientGlow: "radial-gradient(circle at 20% 30%, rgba(163,230,53,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.12) 0%, transparent 50%)",
            glassTint: "rgba(163,230,53,0.04)",
            icon: Award,
            badgeIcon: Sparkles,
            badgeText: `+${Math.round(score * 0.1)} pts today`,
            scoreLabel: score >= 80 ? "Exceptional" : "On Track",
            titleLine1: "Welcome back,",
            titleLine2: `${firstName}`,
            messageTone: "celebration",
            btnText: "Let's Go",
            showConfetti: true,
            entranceAnim: "wgGlassSuccessIn",
        };
    }, [score, firstName]);

    const MoodIcon = config.icon;
    const BadgeIcon = config.badgeIcon;

    // ─── Confetti ──────────────────────────────────────────────────────────
    const spawnConfetti = useCallback((count = 60) => {
        if (!config.showConfetti) return;
        const newParticles: Particle[] = [];
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const palette = config.mood === "success"
            ? ["#a3e635", "#60a5fa", "#fbbf24", "#c084fc", "#22d3ee"]
            : ["#f87171", "#fbbf24"];

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
            const velocity = 8 + Math.random() * 12;
            newParticles.push({
                id: particleIdRef.current++,
                x: cx, y: cy,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity - 4,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 20,
                color: palette[Math.floor(Math.random() * palette.length)],
                size: 4 + Math.random() * 8,
                opacity: 1,
                shape: ["circle", "square", "triangle"][Math.floor(Math.random() * 3)] as Particle["shape"],
            });
        }
        setParticles((prev) => [...prev, ...newParticles]);
    }, [config]);

    // ─── Particle Loop ───────────────────────────────────────────────────────
    useEffect(() => {
        const animate = () => {
            setParticles((prev) =>
                prev
                    .map((p) => ({
                        ...p,
                        x: p.x + p.vx,
                        y: p.y + p.vy,
                        vy: p.vy + 0.4,
                        vx: p.vx * 0.98,
                        rotation: p.rotation + p.rotationSpeed,
                        opacity: p.opacity - 0.008,
                    }))
                    .filter((p) => p.opacity > 0)
            );
            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, []);

    // ─── Entrance ────────────────────────────────────────────────────────────
    useEffect(() => {
        const t1 = setTimeout(() => setPhase("idle"), 700);
        const t2 = setTimeout(() => {
            spawnConfetti(config.showConfetti ? 80 : 0);
            if (config.mood === "danger") setShake(true);
        }, 400);
        const t3 = config.mood === "danger" ? setTimeout(() => setShake(false), 900) : undefined;
        return () => { clearTimeout(t1); clearTimeout(t2); if (t3) clearTimeout(t3); };
    }, [config, spawnConfetti]);

    // ─── Score Counter ───────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== "idle") return;
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / 1200, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayScore(Math.round(score * eased));
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [phase, score]);

    // ─── Parallax ──────────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 20,
                y: (e.clientY / window.innerHeight - 0.5) * 20,
            });
        };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, []);

    // ─── Fly Out ─────────────────────────────────────────────────────────────
    const handleFlyOut = () => {
        setPhase("flying");
        if (targetRef?.current && cardRef.current) {
            const t = targetRef.current.getBoundingClientRect();
            const c = cardRef.current.getBoundingClientRect();
            cardRef.current.style.setProperty("--fly-x", `${t.left + t.width / 2 - (c.left + c.width / 2)}px`);
            cardRef.current.style.setProperty("--fly-y", `${t.top + t.height / 2 - (c.top + c.height / 2)}px`);
        }
        setTimeout(() => { setPhase("exiting"); setTimeout(onDismiss, 300); }, 900);
    };

    // ─── Ring Math ───────────────────────────────────────────────────────────
    const circ = 2 * Math.PI * 52;
    const normalized = Math.max(0, Math.min(100, score));
    const offset = circ - (normalized / 100) * circ;

    // ─── Message ─────────────────────────────────────────────────────────────
    const getMessage = () => {
        if (config.messageTone === "urgent") {
            return (
                <>
                    Your professionalism score has been heavily penalized due to overdue tasks or missed sessions.
                    You currently have <strong className="wg-glass-highlight" style={{ color: config.primary }}>{pendingCount} pending action{pendingCount !== 1 ? "s" : ""}</strong>.
                    Clear your Action Inbox immediately to stop further point deductions and begin restoring your compliance standing.
                </>
            );
        }
        if (config.messageTone === "concern") {
            return (
                <>
                    Your compliance standing is slipping below our recommended targets.
                    You have <strong className="wg-glass-highlight" style={{ color: config.primary }}>{pendingCount} unacknowledged action{pendingCount !== 1 ? "s" : ""}</strong> waiting.
                    Review your Action Inbox now to protect your streak and recover your momentum before dropping tiers.
                </>
            );
        }
        return (
            <>
                You're demonstrating excellent commitment to your learning journey!
                To protect your high score and keep your fire streak alive, make sure to clear the <strong className="wg-glass-highlight" style={{ color: config.primary }}>{pendingCount} new action{pendingCount !== 1 ? "s" : ""}</strong> currently waiting in your Action Inbox.
            </>
        );
    };

    return createPortal(
        <div
            ref={overlayRef}
            className={`wg-glass-overlay wg-phase-${phase} wg-mood-${config.mood} ${shake ? "wg-glass-shake" : ""}`}
            onClick={(e) => e.target === overlayRef.current && handleFlyOut()}
        >
            {/* Deep ambient glow orbs */}
            <div className="wg-glass-ambient" style={{ background: config.ambientGlow }} />
            <div className="wg-glass-noise" />

            {/* Confetti */}
            {config.showConfetti && (
                <svg className="wg-glass-confetti">
                    {particles.map((p) => (
                        <g key={p.id} transform={`translate(${p.x},${p.y}) rotate(${p.rotation})`} opacity={p.opacity}>
                            {p.shape === "circle" && <circle r={p.size / 2} fill={p.color} />}
                            {p.shape === "square" && <rect x={-p.size / 2} y={-p.size / 2} width={p.size} height={p.size} fill={p.color} rx={2} />}
                            {p.shape === "triangle" && <polygon points={`0,${-p.size / 2} ${p.size / 2},${p.size / 2} ${-p.size / 2},${p.size / 2}`} fill={p.color} />}
                        </g>
                    ))}
                </svg>
            )}

            {/* Main Glass Card */}
            <div
                ref={cardRef}
                className="wg-glass-card"
                style={{
                    transform: phase === "idle"
                        ? `perspective(1000px) rotateX(${-mousePos.y * 0.04}deg) rotateY(${mousePos.x * 0.04}deg) translateZ(0)`
                        : undefined,
                }}
            >
                {/* Refraction layers */}
                <div className="wg-glass-sheen" />
                <div className="wg-glass-edge" style={{ background: `linear-gradient(180deg, ${config.primary}40 0%, transparent 60%)` }} />
                <div className="wg-glass-glow" style={{ background: config.primaryGlow }} />

                {/* Top accent */}
                <div className="wg-glass-accent" style={{ background: config.primary }} />

                {/* Icon */}
                <div className="wg-glass-icon-wrap">
                    <div className="wg-glass-icon-ring" style={{ borderColor: `${config.primary}25` }}>
                        <div className="wg-glass-icon-bg" style={{ background: `${config.primary}12` }}>
                            <MoodIcon size={36} color={config.primary} strokeWidth={1.5} />
                        </div>
                    </div>
                    <div className="wg-glass-badge" style={{ background: `${config.primary}20`, color: config.primary, borderColor: `${config.primary}30` }}>
                        <BadgeIcon size={11} strokeWidth={2.5} />
                        <span>{config.badgeText}</span>
                    </div>
                </div>

                {/* Title */}
                <h2 className="wg-glass-title">
                    <span className="wg-glass-title-sub">{config.titleLine1}</span>
                    <span className="wg-glass-title-main" style={{ textShadow: `0 0 40px ${config.primary}40` }}>
                        {config.titleLine2}
                    </span>
                </h2>

                {/* Score Ring */}
                <div className="wg-glass-score-wrap">
                    <div className="wg-glass-score-glass">
                        <svg className="wg-glass-ring" viewBox="0 0 120 120">
                            <circle className="wg-glass-track" cx="60" cy="60" r="52" />
                            <circle
                                className="wg-glass-progress"
                                cx="60" cy="60" r="52"
                                stroke={config.primary}
                                strokeDasharray={circ}
                                strokeDashoffset={offset}
                            />
                        </svg>
                        <div className="wg-glass-score-inner">
                            <span className="wg-glass-score-num" style={{ color: config.primary }}>{displayScore}</span>
                            <span className="wg-glass-score-denom">/ 100</span>
                        </div>
                    </div>
                    <div className="wg-glass-score-label" style={{ color: config.primary }}>
                        <Diamond size={10} strokeWidth={2.5} />
                        {config.scoreLabel}
                    </div>
                </div>

                {/* Message */}
                <div className="wg-glass-message">
                    <div className="wg-glass-message-icon" style={{ color: config.primary }}>
                        <Bell size={15} strokeWidth={2} />
                    </div>
                    <p className="wg-glass-message-text">{getMessage()}</p>
                </div>

                {/* CTA Button */}
                <button className="wg-glass-btn" onClick={handleFlyOut}>
                    <span className="wg-glass-btn-glow" style={{ background: config.primary }} />
                    <span className="wg-glass-btn-shimmer" />
                    {config.mood === "danger" ? <ShieldAlert size={17} /> : <Zap size={17} />}
                    <span className="wg-glass-btn-text">{config.btnText}</span>
                    <ArrowRight size={15} className="wg-glass-btn-arrow" />
                </button>

                {/* Corner prisms */}
                <div className="wg-glass-prism wg-glass-prism-tl" />
                <div className="wg-glass-prism wg-glass-prism-br" />
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                GLASSMORPHISM STYLES
            ═══════════════════════════════════════════════════════════════ */}
            <style>{`
                /* ─── Overlay ─────────────────────────────────────────────── */
                .wg-glass-overlay {
                    position: fixed; inset: 0; z-index: 9999999;
                    display: flex; align-items: center; justify-content: center;
                    overflow: hidden;
                    background: rgba(2, 6, 23, 0.75);
                    backdrop-filter: blur(12px) saturate(0.8);
                    transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .wg-phase-exiting { opacity: 0; pointer-events: none; }

                /* ─── Shake ───────────────────────────────────────────────── */
                .wg-glass-shake { animation: wgGlassShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
                @keyframes wgGlassShake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }

                /* ─── Ambient ─────────────────────────────────────────────── */
                .wg-glass-ambient {
                    position: absolute; inset: -30%;
                    pointer-events: none;
                    filter: blur(80px);
                    opacity: 0.8;
                    animation: wgGlassDrift 18s ease-in-out infinite alternate;
                }
                .wg-glass-noise {
                    position: absolute; inset: 0; opacity: 0.03; pointer-events: none;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
                    background-repeat: repeat;
                    background-size: 128px;
                }

                /* ─── Confetti ──────────────────────────────────────────── */
                .wg-glass-confetti {
                    position: absolute; inset: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 1;
                }

                /* ─── Card ──────────────────────────────────────────────────── */
                .wg-glass-card {
                    position: relative; width: 400px;
                    background: rgba(15, 23, 42, 0.45);
                    background-blend-mode: luminosity;
                    backdrop-filter: blur(28px) saturate(160%);
                    -webkit-backdrop-filter: blur(28px) saturate(160%);
                    border-radius: 0px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow:
                        0 32px 64px -12px rgba(0, 0, 0, 0.5),
                        0 0 0 1px rgba(255, 255, 255, 0.05) inset,
                        0 0 120px -20px rgba(0, 0, 0, 0.3);
                    padding: 2.5rem 2rem 2rem;
                    display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
                    z-index: 2; transform-style: preserve-3d;
                    transition: transform 0.15s ease-out;
                    overflow: hidden;
                }

                /* Entrance */
                .wg-phase-entering .wg-glass-card {
                    animation: ${config.entranceAnim} 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards;
                }

                @keyframes wgGlassSuccessIn {
                    0% { transform: perspective(1000px) rotateX(-12deg) rotateY(8deg) scale(0.6) translateY(50px); opacity: 0; filter: blur(12px); }
                    60% { transform: perspective(1000px) rotateX(1deg) rotateY(-1deg) scale(1.02) translateY(-4px); opacity: 1; filter: blur(0); }
                    100% { transform: perspective(1000px) rotateX(0) rotateY(0) scale(1) translateY(0); opacity: 1; }
                }
                @keyframes wgGlassWarningIn {
                    0% { transform: perspective(1000px) rotateX(-8deg) scale(0.75) translateY(35px); opacity: 0; filter: blur(8px); }
                    100% { transform: perspective(1000px) rotateX(0) scale(1) translateY(0); opacity: 1; filter: blur(0); }
                }
                @keyframes wgGlassDangerIn {
                    0% { transform: scale(0.85) translateY(25px); opacity: 0; filter: blur(10px); }
                    40% { transform: scale(1.02) translateY(-4px); opacity: 1; }
                    100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
                }

                /* Fly Out */
                .wg-phase-flying .wg-glass-card {
                    animation: wgGlassFly 0.9s cubic-bezier(0.5, -0.3, 0.2, 1.3) forwards;
                }
                @keyframes wgGlassFly {
                    0% { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 1; }
                    15% { transform: scale(1.06) translate(0, -12px) rotate(-1deg); opacity: 1; }
                    60% { transform: scale(0.55) translate(calc(var(--fly-x, 35vw) * 0.5), calc(var(--fly-y, -40vh) * 0.5)) rotate(4deg); opacity: 0.75; }
                    100% { transform: scale(0) translate(var(--fly-x, 35vw), var(--fly-y, -40vh)) rotate(8deg); opacity: 0; }
                }

                /* Refraction layers */
                .wg-glass-sheen {
                    position: absolute; inset: 0; pointer-events: none; z-index: 0;
                    background: linear-gradient(105deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0) 70%);
                }
                .wg-glass-edge {
                    position: absolute; top: 0; left: 20px; right: 20px; height: 1px; pointer-events: none;
                }
                .wg-glass-glow {
                    position: absolute; inset: -1px; border-radius: 0px; z-index: -1;
                    opacity: 0.5; filter: blur(24px); pointer-events: none;
                    transition: opacity 0.4s;
                }
                .wg-glass-card:hover .wg-glass-glow { opacity: 0.8; }

                .wg-glass-accent {
                    position: absolute; top: 0; left: 50%; transform: translateX(-50%);
                    width: 48px; height: 3px; border-radius: 0px;
                    opacity: 0.7; filter: blur(0.5px);
                }

                /* ─── Icon ────────────────────────────────────────────────── */
                .wg-glass-icon-wrap { position: relative; margin-bottom: 0.25rem; z-index: 1; }
                .wg-glass-icon-ring {
                    width: 88px; height: 88px; border-radius: 50%; border: 1.5px dashed;
                    display: flex; align-items: center; justify-content: center;
                    animation: wgGlassSpin 24s linear infinite;
                }
                .wg-glass-icon-bg {
                    width: 64px; height: 64px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255,255,255,0.06);
                    box-shadow: 0 8px 32px -8px rgba(0,0,0,0.3);
                }
                .wg-glass-badge {
                    position: absolute; bottom: -2px; right: -18px;
                    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em;
                    padding: 4px 10px; border-radius: 0px;
                    display: flex; align-items: center; gap: 4px;
                    border: 1px solid;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 4px 12px -4px rgba(0,0,0,0.3);
                    animation: wgGlassBadgePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.6s both;
                    white-space: nowrap;
                }

                /* ─── Title ───────────────────────────────────────────────── */
                .wg-glass-title {
                    display: flex; flex-direction: column; gap: 4px; margin: 0;
                    line-height: 1.15; z-index: 1;
                }
                .wg-glass-title-sub {
                    font-family: var(--font-body, system-ui); font-size: 0.85rem;
                    color: rgba(255,255,255,0.5); font-weight: 400; letter-spacing: 0.02em;
                    opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.3s forwards;
                }
                .wg-glass-title-main {
                    font-family: var(--font-heading, system-ui); font-size: 1.6rem;
                    font-weight: 700; color: #f8fafc; letter-spacing: -0.01em;
                    opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.42s forwards;
                }

                /* ─── Score ───────────────────────────────────────────────── */
                .wg-glass-score-wrap {
                    position: relative; display: flex; flex-direction: column;
                    align-items: center; gap: 0.75rem; z-index: 1;
                }
                .wg-glass-score-glass {
                    position: relative; width: 150px; height: 150px;
                    background: rgba(255,255,255,0.03);
                    backdrop-filter: blur(12px);
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.06);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.05), 0 16px 40px -12px rgba(0,0,0,0.3);
                    display: flex; align-items: center; justify-content: center;
                }
                .wg-glass-ring {
                    position: absolute; width: 130px; height: 130px;
                    transform: rotate(-90deg); overflow: visible;
                }
                .wg-glass-track {
                    fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 7; stroke-linecap: round;
                }
                .wg-glass-progress {
                    fill: none; stroke-width: 7; stroke-linecap: round;
                    transition: stroke-dashoffset 0.1s linear;
                    filter: drop-shadow(0 0 6px currentColor);
                }
                .wg-glass-score-inner {
                    position: absolute; display: flex; flex-direction: column;
                    align-items: center; justify-content: center; line-height: 1;
                }
                .wg-glass-score-num {
                    font-family: var(--font-heading, system-ui); font-size: 2.5rem;
                    font-weight: 800; line-height: 1; transition: color 0.3s;
                    text-shadow: 0 0 30px currentColor;
                }
                .wg-glass-score-denom {
                    font-family: var(--font-heading, system-ui); font-size: 0.7rem;
                    color: rgba(255,255,255,0.3); font-weight: 600; margin-top: 2px;
                }
                .wg-glass-score-label {
                    font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em;
                    text-transform: uppercase;
                    display: flex; align-items: center; gap: 5px;
                    padding: 4px 12px; border-radius: 0px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.06);
                    backdrop-filter: blur(8px);
                }

                /* ─── Message ─────────────────────────────────────────────── */
                .wg-glass-message {
                    width: 100%; display: flex; align-items: flex-start; gap: 0.875rem;
                    background: rgba(255,255,255,0.03);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 0px; padding: 1rem 1.25rem;
                    text-align: left; z-index: 1;
                    opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.55s forwards;
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.03);
                }
                .wg-glass-message-icon {
                    flex-shrink: 0; width: 30px; height: 30px; border-radius: 0px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.06);
                    display: flex; align-items: center; justify-content: center;
                    margin-top: 1px;
                }
                .wg-glass-message-text {
                    font-family: var(--font-body, system-ui); font-size: 0.9rem;
                    color: rgba(255,255,255,0.65); line-height: 1.6; margin: 0;
                }
                .wg-glass-highlight {
                    color: rgba(255,255,255,0.9); font-weight: 600;
                    border-bottom: 1px solid currentColor;
                    padding-bottom: 1px;
                }

                /* ─── Button ──────────────────────────────────────────────── */
                .wg-glass-btn {
                    position: relative; width: 100%; padding: 1rem 1.5rem;
                    border-radius: 0px; border: none; color: #fff;
                    font-family: var(--font-heading, system-ui); font-size: 0.95rem;
                    font-weight: 600; letter-spacing: 0.02em;
                    display: flex; align-items: center; justify-content: center; gap: 10px;
                    cursor: pointer; overflow: hidden; z-index: 1;
                    background: rgba(255, 255, 255, 0.07);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 4px 24px -6px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.65s forwards;
                }
                .wg-glass-btn:hover {
                    transform: translateY(-2px);
                    background: rgba(255, 255, 255, 0.11);
                    border-color: rgba(255, 255, 255, 0.18);
                    box-shadow: 0 8px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.12);
                }
                .wg-glass-btn:active { transform: translateY(0) scale(0.985); }

                .wg-glass-btn-glow {
                    position: absolute; inset: -2px; border-radius: 0px; z-index: -1;
                    opacity: 0; filter: blur(16px); transition: opacity 0.4s;
                }
                .wg-glass-btn:hover .wg-glass-btn-glow { opacity: 0.35; }

                .wg-glass-btn-shimmer {
                    position: absolute; inset: 0;
                    background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.07) 55%, transparent 62%);
                    transform: translateX(-100%);
                }
                .wg-glass-btn:hover .wg-glass-btn-shimmer { animation: wgGlassShimmer 1.4s ease; }

                .wg-glass-btn-arrow {
                    margin-left: auto; opacity: 0.4; transition: all 0.3s ease;
                }
                .wg-glass-btn:hover .wg-glass-btn-arrow { opacity: 0.9; transform: translateX(3px); }

                /* ─── Prisms ──────────────────────────────────────────────── */
                .wg-glass-prism {
                    position: absolute; width: 80px; height: 80px; border-radius: 50%;
                    pointer-events: none; filter: blur(40px); z-index: 0; opacity: 0.4;
                }
                .wg-glass-prism-tl { top: -20px; left: -20px; background: ${config.primary}; }
                .wg-glass-prism-br { bottom: -20px; right: -20px; background: ${config.primary}; animation-delay: -2s; }

                /* ─── Keyframes ───────────────────────────────────────────── */
                @keyframes wgGlassDrift {
                    0% { transform: translate(0,0) scale(1); }
                    100% { transform: translate(-40px,-30px) scale(1.1); }
                }
                @keyframes wgGlassSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes wgGlassBadgePop { 0% { transform: scale(0) rotate(-8deg); opacity: 0; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
                @keyframes wgGlassFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes wgGlassShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

                /* ─── Responsive ──────────────────────────────────────────── */
                @media (max-width: 480px) {
                    .wg-glass-card { width: 90vw; max-width: 360px; padding: 2rem 1.5rem 1.5rem; }
                    .wg-glass-title-main { font-size: 1.4rem; }
                    .wg-glass-score-num { font-size: 2.1rem; }
                }
            `}</style>
        </div>,
        document.body
    );
};


// // ════════════════════════════════════════════════════════════════════════════
// // 🥂 GLASSMORPHISM GAMIFICATION POPUP — MOOD-AWARE ELEGANCE
// // ════════════════════════════════════════════════════════════════════════════

// import {
//     Award,
//     Zap,
//     Sparkles,
//     TrendingUp,
//     TrendingDown,
//     Bell,
//     AlertTriangle,
//     ShieldAlert,
//     Target,
//     ArrowRight,
//     Diamond
// } from "lucide-react";
// import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// import { createPortal } from "react-dom";

// // ─── Types ─────────────────────────────────────────────────────────────────
// interface WelcomeGamificationPopupProps {
//     userName: string;
//     score: number;
//     pendingCount: number;
//     onDismiss: () => void;
//     targetRef?: React.RefObject<HTMLElement | null>;
// }

// interface Particle {
//     id: number;
//     x: number;
//     y: number;
//     vx: number;
//     vy: number;
//     rotation: number;
//     rotationSpeed: number;
//     color: string;
//     size: number;
//     opacity: number;
//     shape: "circle" | "square" | "triangle";
// }

// type Mood = "success" | "warning" | "danger";

// interface MoodConfig {
//     mood: Mood;
//     primary: string;
//     primaryGlow: string;
//     ambientGlow: string;
//     glassTint: string;
//     icon: React.ElementType;
//     badgeIcon: React.ElementType;
//     badgeText: string;
//     scoreLabel: string;
//     titleLine1: string;
//     titleLine2: string;
//     messageTone: "celebration" | "concern" | "urgent";
//     btnText: string;
//     showConfetti: boolean;
//     entranceAnim: string;
// }

// // ════════════════════════════════════════════════════════════════════════════
// export const WelcomeGamificationPopup = ({
//     userName,
//     score,
//     pendingCount,
//     onDismiss,
//     targetRef
// }: WelcomeGamificationPopupProps) => {
//     const [phase, setPhase] = useState<"entering" | "idle" | "flying" | "exiting">("entering");
//     const [displayScore, setDisplayScore] = useState(0);
//     const [particles, setParticles] = useState<Particle[]>([]);
//     const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
//     const [shake, setShake] = useState(false);
//     const cardRef = useRef<HTMLDivElement>(null);
//     const overlayRef = useRef<HTMLDivElement>(null);
//     const animFrameRef = useRef<number>(0);
//     const particleIdRef = useRef(0);

//     const firstName = userName.split(" ")[0];

//     // ─── Mood Configuration ──────────────────────────────────────────────────
//     const config: MoodConfig = useMemo(() => {
//         if (score < 0) {
//             return {
//                 mood: "danger",
//                 primary: "#f87171",
//                 primaryGlow: "0 0 60px rgba(248,113,113,0.35)",
//                 ambientGlow: "radial-gradient(circle at 20% 30%, rgba(248,113,113,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(220,38,38,0.15) 0%, transparent 50%)",
//                 glassTint: "rgba(248,113,113,0.06)",
//                 icon: ShieldAlert,
//                 badgeIcon: TrendingDown,
//                 badgeText: "Critical",
//                 scoreLabel: "Immediate Action Required",
//                 titleLine1: "Attention needed,",
//                 titleLine2: `${firstName}`,
//                 messageTone: "urgent",
//                 btnText: "Resolve Now",
//                 showConfetti: false,
//                 entranceAnim: "wgGlassDangerIn",
//             };
//         }
//         if (score < 50) {
//             return {
//                 mood: "warning",
//                 primary: "#fbbf24",
//                 primaryGlow: "0 0 50px rgba(251,191,36,0.3)",
//                 ambientGlow: "radial-gradient(circle at 20% 30%, rgba(251,191,36,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(245,158,11,0.1) 0%, transparent 50%)",
//                 glassTint: "rgba(251,191,36,0.05)",
//                 icon: AlertTriangle,
//                 badgeIcon: TrendingDown,
//                 badgeText: "Falling Behind",
//                 scoreLabel: "Below Target",
//                 titleLine1: "Keep pushing,",
//                 titleLine2: `${firstName}`,
//                 messageTone: "concern",
//                 btnText: "Catch Up",
//                 showConfetti: false,
//                 entranceAnim: "wgGlassWarningIn",
//             };
//         }
//         return {
//             mood: "success",
//             primary: "#a3e635",
//             primaryGlow: "0 0 50px rgba(163,230,53,0.3)",
//             ambientGlow: "radial-gradient(circle at 20% 30%, rgba(163,230,53,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.12) 0%, transparent 50%)",
//             glassTint: "rgba(163,230,53,0.04)",
//             icon: Award,
//             badgeIcon: Sparkles,
//             badgeText: `+${Math.round(score * 0.1)} pts today`,
//             scoreLabel: score >= 80 ? "Exceptional" : "On Track",
//             titleLine1: "Welcome back,",
//             titleLine2: `${firstName}`,
//             messageTone: "celebration",
//             btnText: "Let's Go",
//             showConfetti: true,
//             entranceAnim: "wgGlassSuccessIn",
//         };
//     }, [score, firstName]);

//     const MoodIcon = config.icon;
//     const BadgeIcon = config.badgeIcon;

//     // ─── Confetti ──────────────────────────────────────────────────────────
//     const spawnConfetti = useCallback((count = 60) => {
//         if (!config.showConfetti) return;
//         const newParticles: Particle[] = [];
//         const cx = window.innerWidth / 2;
//         const cy = window.innerHeight / 2;
//         const palette = config.mood === "success"
//             ? ["#a3e635", "#60a5fa", "#fbbf24", "#c084fc", "#22d3ee"]
//             : ["#f87171", "#fbbf24"];

//         for (let i = 0; i < count; i++) {
//             const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
//             const velocity = 8 + Math.random() * 12;
//             newParticles.push({
//                 id: particleIdRef.current++,
//                 x: cx, y: cy,
//                 vx: Math.cos(angle) * velocity,
//                 vy: Math.sin(angle) * velocity - 4,
//                 rotation: Math.random() * 360,
//                 rotationSpeed: (Math.random() - 0.5) * 20,
//                 color: palette[Math.floor(Math.random() * palette.length)],
//                 size: 4 + Math.random() * 8,
//                 opacity: 1,
//                 shape: ["circle", "square", "triangle"][Math.floor(Math.random() * 3)] as Particle["shape"],
//             });
//         }
//         setParticles((prev) => [...prev, ...newParticles]);
//     }, [config]);

//     // ─── Particle Loop ───────────────────────────────────────────────────────
//     useEffect(() => {
//         const animate = () => {
//             setParticles((prev) =>
//                 prev
//                     .map((p) => ({
//                         ...p,
//                         x: p.x + p.vx,
//                         y: p.y + p.vy,
//                         vy: p.vy + 0.4,
//                         vx: p.vx * 0.98,
//                         rotation: p.rotation + p.rotationSpeed,
//                         opacity: p.opacity - 0.008,
//                     }))
//                     .filter((p) => p.opacity > 0)
//             );
//             animFrameRef.current = requestAnimationFrame(animate);
//         };
//         animFrameRef.current = requestAnimationFrame(animate);
//         return () => cancelAnimationFrame(animFrameRef.current);
//     }, []);

//     // ─── Entrance ────────────────────────────────────────────────────────────
//     useEffect(() => {
//         const t1 = setTimeout(() => setPhase("idle"), 700);
//         const t2 = setTimeout(() => {
//             spawnConfetti(config.showConfetti ? 80 : 0);
//             if (config.mood === "danger") setShake(true);
//         }, 400);
//         const t3 = config.mood === "danger" ? setTimeout(() => setShake(false), 900) : undefined;
//         return () => { clearTimeout(t1); clearTimeout(t2); if (t3) clearTimeout(t3); };
//     }, [config, spawnConfetti]);

//     // ─── Score Counter ───────────────────────────────────────────────────────
//     useEffect(() => {
//         if (phase !== "idle") return;
//         const start = Date.now();
//         const tick = () => {
//             const elapsed = Date.now() - start;
//             const progress = Math.min(elapsed / 1200, 1);
//             const eased = 1 - Math.pow(1 - progress, 3);
//             setDisplayScore(Math.round(score * eased));
//             if (progress < 1) requestAnimationFrame(tick);
//         };
//         requestAnimationFrame(tick);
//     }, [phase, score]);

//     // ─── Parallax ──────────────────────────────────────────────────────────
//     useEffect(() => {
//         const onMove = (e: MouseEvent) => {
//             setMousePos({
//                 x: (e.clientX / window.innerWidth - 0.5) * 20,
//                 y: (e.clientY / window.innerHeight - 0.5) * 20,
//             });
//         };
//         window.addEventListener("mousemove", onMove);
//         return () => window.removeEventListener("mousemove", onMove);
//     }, []);

//     // ─── Fly Out ─────────────────────────────────────────────────────────────
//     const handleFlyOut = () => {
//         setPhase("flying");
//         if (targetRef?.current && cardRef.current) {
//             const t = targetRef.current.getBoundingClientRect();
//             const c = cardRef.current.getBoundingClientRect();
//             cardRef.current.style.setProperty("--fly-x", `${t.left + t.width / 2 - (c.left + c.width / 2)}px`);
//             cardRef.current.style.setProperty("--fly-y", `${t.top + t.height / 2 - (c.top + c.height / 2)}px`);
//         }
//         setTimeout(() => { setPhase("exiting"); setTimeout(onDismiss, 300); }, 900);
//     };

//     // ─── Ring Math ───────────────────────────────────────────────────────────
//     const circ = 2 * Math.PI * 52;
//     const normalized = Math.max(0, Math.min(100, score));
//     const offset = circ - (normalized / 100) * circ;

//     // ─── Message ─────────────────────────────────────────────────────────────
//     const getMessage = () => {
//         if (config.messageTone === "urgent") {
//             return <>Your performance score is critically low. You have <strong className="wg-glass-highlight">{pendingCount} pending action{pendingCount !== 1 ? "s" : ""}</strong> requiring immediate attention.</>;
//         }
//         if (config.messageTone === "concern") {
//             return <>You're below target. You have <strong className="wg-glass-highlight">{pendingCount} action{pendingCount !== 1 ? "s" : ""}</strong> waiting — address them to recover momentum.</>;
//         }
//         return <>You're performing well. You have <strong className="wg-glass-highlight" style={{ color: "#f87171" }}>{pendingCount} action{pendingCount !== 1 ? "s" : ""}</strong> waiting in your queue.</>;
//     };

//     return createPortal(
//         <div
//             ref={overlayRef}
//             className={`wg-glass-overlay wg-phase-${phase} wg-mood-${config.mood} ${shake ? "wg-glass-shake" : ""}`}
//             onClick={(e) => e.target === overlayRef.current && handleFlyOut()}
//         >
//             {/* Deep ambient glow orbs */}
//             <div className="wg-glass-ambient" style={{ background: config.ambientGlow }} />
//             <div className="wg-glass-noise" />

//             {/* Confetti */}
//             {config.showConfetti && (
//                 <svg className="wg-glass-confetti">
//                     {particles.map((p) => (
//                         <g key={p.id} transform={`translate(${p.x},${p.y}) rotate(${p.rotation})`} opacity={p.opacity}>
//                             {p.shape === "circle" && <circle r={p.size / 2} fill={p.color} />}
//                             {p.shape === "square" && <rect x={-p.size / 2} y={-p.size / 2} width={p.size} height={p.size} fill={p.color} rx={2} />}
//                             {p.shape === "triangle" && <polygon points={`0,${-p.size / 2} ${p.size / 2},${p.size / 2} ${-p.size / 2},${p.size / 2}`} fill={p.color} />}
//                         </g>
//                     ))}
//                 </svg>
//             )}

//             {/* Main Glass Card */}
//             <div
//                 ref={cardRef}
//                 className="wg-glass-card"
//                 style={{
//                     transform: phase === "idle"
//                         ? `perspective(1000px) rotateX(${-mousePos.y * 0.04}deg) rotateY(${mousePos.x * 0.04}deg) translateZ(0)`
//                         : undefined,
//                 }}
//             >
//                 {/* Refraction layers */}
//                 <div className="wg-glass-sheen" />
//                 <div className="wg-glass-edge" style={{ background: `linear-gradient(180deg, ${config.primary}40 0%, transparent 60%)` }} />
//                 <div className="wg-glass-glow" style={{ background: config.primaryGlow }} />

//                 {/* Top accent */}
//                 <div className="wg-glass-accent" style={{ background: config.primary }} />

//                 {/* Icon */}
//                 <div className="wg-glass-icon-wrap">
//                     <div className="wg-glass-icon-ring" style={{ borderColor: `${config.primary}25` }}>
//                         <div className="wg-glass-icon-bg" style={{ background: `${config.primary}12` }}>
//                             <MoodIcon size={36} color={config.primary} strokeWidth={1.5} />
//                         </div>
//                     </div>
//                     <div className="wg-glass-badge" style={{ background: `${config.primary}20`, color: config.primary, borderColor: `${config.primary}30` }}>
//                         <BadgeIcon size={11} strokeWidth={2.5} />
//                         <span>{config.badgeText}</span>
//                     </div>
//                 </div>

//                 {/* Title */}
//                 <h2 className="wg-glass-title">
//                     <span className="wg-glass-title-sub">{config.titleLine1}</span>
//                     <span className="wg-glass-title-main" style={{ textShadow: `0 0 40px ${config.primary}40` }}>
//                         {config.titleLine2}
//                     </span>
//                 </h2>

//                 {/* Score Ring */}
//                 <div className="wg-glass-score-wrap">
//                     <div className="wg-glass-score-glass">
//                         <svg className="wg-glass-ring" viewBox="0 0 120 120">
//                             <circle className="wg-glass-track" cx="60" cy="60" r="52" />
//                             <circle
//                                 className="wg-glass-progress"
//                                 cx="60" cy="60" r="52"
//                                 stroke={config.primary}
//                                 strokeDasharray={circ}
//                                 strokeDashoffset={offset}
//                             />
//                         </svg>
//                         <div className="wg-glass-score-inner">
//                             <span className="wg-glass-score-num" style={{ color: config.primary }}>{displayScore}</span>
//                             <span className="wg-glass-score-denom">/ 100</span>
//                         </div>
//                     </div>
//                     <div className="wg-glass-score-label" style={{ color: config.primary }}>
//                         <Diamond size={10} strokeWidth={2.5} />
//                         {config.scoreLabel}
//                     </div>
//                 </div>

//                 {/* Message */}
//                 <div className="wg-glass-message">
//                     <div className="wg-glass-message-icon" style={{ color: config.primary }}>
//                         <Bell size={15} strokeWidth={2} />
//                     </div>
//                     <p className="wg-glass-message-text">{getMessage()}</p>
//                 </div>

//                 {/* CTA Button */}
//                 <button className="wg-glass-btn" onClick={handleFlyOut}>
//                     <span className="wg-glass-btn-glow" style={{ background: config.primary }} />
//                     <span className="wg-glass-btn-shimmer" />
//                     {config.mood === "danger" ? <ShieldAlert size={17} /> : <Zap size={17} />}
//                     <span className="wg-glass-btn-text">{config.btnText}</span>
//                     <ArrowRight size={15} className="wg-glass-btn-arrow" />
//                 </button>

//                 {/* Corner prisms */}
//                 <div className="wg-glass-prism wg-glass-prism-tl" />
//                 <div className="wg-glass-prism wg-glass-prism-br" />
//             </div>

//             {/* ═══════════════════════════════════════════════════════════════
//                 GLASSMORPHISM STYLES
//             ═══════════════════════════════════════════════════════════════ */}
//             <style>{`
//                 /* ─── Overlay ─────────────────────────────────────────────── */
//                 .wg-glass-overlay {
//                     position: fixed; inset: 0; z-index: 9999999;
//                     display: flex; align-items: center; justify-content: center;
//                     overflow: hidden;
//                     background: rgba(2, 6, 23, 0.75);
//                     backdrop-filter: blur(12px) saturate(0.8);
//                     transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
//                 }
//                 .wg-phase-exiting { opacity: 0; pointer-events: none; }

//                 /* ─── Shake ───────────────────────────────────────────────── */
//                 .wg-glass-shake { animation: wgGlassShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
//                 @keyframes wgGlassShake {
//                     10%, 90% { transform: translate3d(-1px, 0, 0); }
//                     20%, 80% { transform: translate3d(2px, 0, 0); }
//                     30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
//                     40%, 60% { transform: translate3d(4px, 0, 0); }
//                 }

//                 /* ─── Ambient ─────────────────────────────────────────────── */
//                 .wg-glass-ambient {
//                     position: absolute; inset: -30%;
//                     pointer-events: none;
//                     filter: blur(80px);
//                     opacity: 0.8;
//                     animation: wgGlassDrift 18s ease-in-out infinite alternate;
//                 }
//                 .wg-glass-noise {
//                     position: absolute; inset: 0; opacity: 0.03; pointer-events: none;
//                     background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
//                     background-repeat: repeat;
//                     background-size: 128px;
//                 }

//                 /* ─── Confetti ──────────────────────────────────────────── */
//                 .wg-glass-confetti {
//                     position: absolute; inset: 0; width: 100%; height: 100%;
//                     pointer-events: none; z-index: 1;
//                 }

//                 /* ─── Card ──────────────────────────────────────────────────── */
//                 .wg-glass-card {
//                     position: relative; width: 400px;
//                     background: rgba(15, 23, 42, 0.45);
//                     background-blend-mode: luminosity;
//                     backdrop-filter: blur(28px) saturate(160%);
//                     -webkit-backdrop-filter: blur(28px) saturate(160%);
//                     border-radius: 0px;
//                     border: 1px solid rgba(255, 255, 255, 0.08);
//                     box-shadow:
//                         0 32px 64px -12px rgba(0, 0, 0, 0.5),
//                         0 0 0 1px rgba(255, 255, 255, 0.05) inset,
//                         0 0 120px -20px rgba(0, 0, 0, 0.3);
//                     padding: 2.5rem 2rem 2rem;
//                     display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
//                     z-index: 2; transform-style: preserve-3d;
//                     transition: transform 0.15s ease-out;
//                     overflow: hidden;
//                 }

//                 /* Entrance */
//                 .wg-phase-entering .wg-glass-card {
//                     animation: ${config.entranceAnim} 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards;
//                 }

//                 @keyframes wgGlassSuccessIn {
//                     0% { transform: perspective(1000px) rotateX(-12deg) rotateY(8deg) scale(0.6) translateY(50px); opacity: 0; filter: blur(12px); }
//                     60% { transform: perspective(1000px) rotateX(1deg) rotateY(-1deg) scale(1.02) translateY(-4px); opacity: 1; filter: blur(0); }
//                     100% { transform: perspective(1000px) rotateX(0) rotateY(0) scale(1) translateY(0); opacity: 1; }
//                 }
//                 @keyframes wgGlassWarningIn {
//                     0% { transform: perspective(1000px) rotateX(-8deg) scale(0.75) translateY(35px); opacity: 0; filter: blur(8px); }
//                     100% { transform: perspective(1000px) rotateX(0) scale(1) translateY(0); opacity: 1; filter: blur(0); }
//                 }
//                 @keyframes wgGlassDangerIn {
//                     0% { transform: scale(0.85) translateY(25px); opacity: 0; filter: blur(10px); }
//                     40% { transform: scale(1.02) translateY(-4px); opacity: 1; }
//                     100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
//                 }

//                 /* Fly Out */
//                 .wg-phase-flying .wg-glass-card {
//                     animation: wgGlassFly 0.9s cubic-bezier(0.5, -0.3, 0.2, 1.3) forwards;
//                 }
//                 @keyframes wgGlassFly {
//                     0% { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 1; }
//                     15% { transform: scale(1.06) translate(0, -12px) rotate(-1deg); opacity: 1; }
//                     60% { transform: scale(0.55) translate(calc(var(--fly-x, 35vw) * 0.5), calc(var(--fly-y, -40vh) * 0.5)) rotate(4deg); opacity: 0.75; }
//                     100% { transform: scale(0) translate(var(--fly-x, 35vw), var(--fly-y, -40vh)) rotate(8deg); opacity: 0; }
//                 }

//                 /* Refraction layers */
//                 .wg-glass-sheen {
//                     position: absolute; inset: 0; pointer-events: none; z-index: 0;
//                     background: linear-gradient(105deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0) 70%);
//                 }
//                 .wg-glass-edge {
//                     position: absolute; top: 0; left: 20px; right: 20px; height: 1px; pointer-events: none;
//                 }
//                 .wg-glass-glow {
//                     position: absolute; inset: -1px; border-radius: 0px; z-index: -1;
//                     opacity: 0.5; filter: blur(24px); pointer-events: none;
//                     transition: opacity 0.4s;
//                 }
//                 .wg-glass-card:hover .wg-glass-glow { opacity: 0.8; }

//                 .wg-glass-accent {
//                     position: absolute; top: 0; left: 50%; transform: translateX(-50%);
//                     width: 48px; height: 3px; border-radius: 0px;
//                     opacity: 0.7; filter: blur(0.5px);
//                 }

//                 /* ─── Icon ────────────────────────────────────────────────── */
//                 .wg-glass-icon-wrap { position: relative; margin-bottom: 0.25rem; z-index: 1; }
//                 .wg-glass-icon-ring {
//                     width: 88px; height: 88px; border-radius: 50%; border: 1.5px dashed;
//                     display: flex; align-items: center; justify-content: center;
//                     animation: wgGlassSpin 24s linear infinite;
//                 }
//                 .wg-glass-icon-bg {
//                     width: 64px; height: 64px; border-radius: 50%;
//                     display: flex; align-items: center; justify-content: center;
//                     backdrop-filter: blur(8px);
//                     border: 1px solid rgba(255,255,255,0.06);
//                     box-shadow: 0 8px 32px -8px rgba(0,0,0,0.3);
//                 }
//                 .wg-glass-badge {
//                     position: absolute; bottom: -2px; right: -18px;
//                     font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em;
//                     padding: 4px 10px; border-radius: 0px;
//                     display: flex; align-items: center; gap: 4px;
//                     border: 1px solid;
//                     backdrop-filter: blur(12px);
//                     box-shadow: 0 4px 12px -4px rgba(0,0,0,0.3);
//                     animation: wgGlassBadgePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.6s both;
//                     white-space: nowrap;
//                 }

//                 /* ─── Title ───────────────────────────────────────────────── */
//                 .wg-glass-title {
//                     display: flex; flex-direction: column; gap: 4px; margin: 0;
//                     line-height: 1.15; z-index: 1;
//                 }
//                 .wg-glass-title-sub {
//                     font-family: var(--font-body, system-ui); font-size: 0.85rem;
//                     color: rgba(255,255,255,0.5); font-weight: 400; letter-spacing: 0.02em;
//                     opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.3s forwards;
//                 }
//                 .wg-glass-title-main {
//                     font-family: var(--font-heading, system-ui); font-size: 1.6rem;
//                     font-weight: 700; color: #f8fafc; letter-spacing: -0.01em;
//                     opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.42s forwards;
//                 }

//                 /* ─── Score ───────────────────────────────────────────────── */
//                 .wg-glass-score-wrap {
//                     position: relative; display: flex; flex-direction: column;
//                     align-items: center; gap: 0.75rem; z-index: 1;
//                 }
//                 .wg-glass-score-glass {
//                     position: relative; width: 150px; height: 150px;
//                     background: rgba(255,255,255,0.03);
//                     backdrop-filter: blur(12px);
//                     border-radius: 50%;
//                     border: 1px solid rgba(255,255,255,0.06);
//                     box-shadow: inset 0 1px 1px rgba(255,255,255,0.05), 0 16px 40px -12px rgba(0,0,0,0.3);
//                     display: flex; align-items: center; justify-content: center;
//                 }
//                 .wg-glass-ring {
//                     position: absolute; width: 130px; height: 130px;
//                     transform: rotate(-90deg); overflow: visible;
//                 }
//                 .wg-glass-track {
//                     fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 7; stroke-linecap: round;
//                 }
//                 .wg-glass-progress {
//                     fill: none; stroke-width: 7; stroke-linecap: round;
//                     transition: stroke-dashoffset 0.1s linear;
//                     filter: drop-shadow(0 0 6px currentColor);
//                 }
//                 .wg-glass-score-inner {
//                     position: absolute; display: flex; flex-direction: column;
//                     align-items: center; justify-content: center; line-height: 1;
//                 }
//                 .wg-glass-score-num {
//                     font-family: var(--font-heading, system-ui); font-size: 2.5rem;
//                     font-weight: 800; line-height: 1; transition: color 0.3s;
//                     text-shadow: 0 0 30px currentColor;
//                 }
//                 .wg-glass-score-denom {
//                     font-family: var(--font-heading, system-ui); font-size: 0.7rem;
//                     color: rgba(255,255,255,0.3); font-weight: 600; margin-top: 2px;
//                 }
//                 .wg-glass-score-label {
//                     font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em;
//                     text-transform: uppercase;
//                     display: flex; align-items: center; gap: 5px;
//                     padding: 4px 12px; border-radius: 0px;
//                     background: rgba(255,255,255,0.04);
//                     border: 1px solid rgba(255,255,255,0.06);
//                     backdrop-filter: blur(8px);
//                 }

//                 /* ─── Message ─────────────────────────────────────────────── */
//                 .wg-glass-message {
//                     width: 100%; display: flex; align-items: flex-start; gap: 0.875rem;
//                     background: rgba(255,255,255,0.03);
//                     backdrop-filter: blur(16px);
//                     border: 1px solid rgba(255,255,255,0.06);
//                     border-ra0px; padding: 1rem 1.25rem;
//                     text-align: left; z-index: 1;
//                     opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.55s forwards;
//                     box-shadow: inset 0 1px 1px rgba(255,255,255,0.03);
//                 }
//                 .wg-glass-message-icon {
//                     flex-shrink: 0; width: 30px; height: 30px; border-radius: 0px;
//                     background: rgba(255,255,255,0.04);
//                     border: 1px solid rgba(255,255,255,0.06);
//                     display: flex; align-items: center; justify-content: center;
//                     margin-top: 1px;
//                 }
//                 .wg-glass-message-text {
//                     font-family: var(--font-body, system-ui); font-size: 0.9rem;
//                     color: rgba(255,255,255,0.65); line-height: 1.6; margin: 0;
//                 }
//                 .wg-glass-highlight {
//                     color: rgba(255,255,255,0.9); font-weight: 600;
//                     border-bottom: 1px solid currentColor;
//                     padding-bottom: 1px;
//                 }

//                 /* ─── Button ──────────────────────────────────────────────── */
//                 .wg-glass-btn {
//                     position: relative; width: 100%; padding: 1rem 1.5rem;
//                     border-radius: 0px; border: none; color: #fff;
//                     font-family: var(--font-heading, system-ui); font-size: 0.95rem;
//                     font-weight: 600; letter-spacing: 0.02em;
//                     display: flex; align-items: center; justify-content: center; gap: 10px;
//                     cursor: pointer; overflow: hidden; z-index: 1;
//                     background: rgba(255, 255, 255, 0.07);
//                     backdrop-filter: blur(16px);
//                     border: 1px solid rgba(255, 255, 255, 0.1);
//                     box-shadow: 0 4px 24px -6px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08);
//                     transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
//                     opacity: 0; animation: wgGlassFadeUp 0.5s ease 0.65s forwards;
//                 }
//                 .wg-glass-btn:hover {
//                     transform: translateY(-2px);
//                     background: rgba(255, 255, 255, 0.11);
//                     border-color: rgba(255, 255, 255, 0.18);
//                     box-shadow: 0 8px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.12);
//                 }
//                 .wg-glass-btn:active { transform: translateY(0) scale(0.985); }

//                 .wg-glass-btn-glow {
//                     position: absolute; inset: -2px; border-radius: 0px; z-index: -1;
//                     opacity: 0; filter: blur(16px); transition: opacity 0.4s;
//                 }
//                 .wg-glass-btn:hover .wg-glass-btn-glow { opacity: 0.35; }

//                 .wg-glass-btn-shimmer {
//                     position: absolute; inset: 0;
//                     background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.07) 55%, transparent 62%);
//                     transform: translateX(-100%);
//                 }
//                 .wg-glass-btn:hover .wg-glass-btn-shimmer { animation: wgGlassShimmer 1.4s ease; }

//                 .wg-glass-btn-arrow {
//                     margin-left: auto; opacity: 0.4; transition: all 0.3s ease;
//                 }
//                 .wg-glass-btn:hover .wg-glass-btn-arrow { opacity: 0.9; transform: translateX(3px); }

//                 /* ─── Prisms ──────────────────────────────────────────────── */
//                 .wg-glass-prism {
//                     position: absolute; width: 80px; height: 80px; border-radius: 50%;
//                     pointer-events: none; filter: blur(40px); z-index: 0; opacity: 0.4;
//                 }
//                 .wg-glass-prism-tl { top: -20px; left: -20px; background: ${config.primary}; }
//                 .wg-glass-prism-br { bottom: -20px; right: -20px; background: ${config.primary}; animation-delay: -2s; }

//                 /* ─── Keyframes ───────────────────────────────────────────── */
//                 @keyframes wgGlassDrift {
//                     0% { transform: translate(0,0) scale(1); }
//                     100% { transform: translate(-40px,-30px) scale(1.1); }
//                 }
//                 @keyframes wgGlassSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
//                 @keyframes wgGlassBadgePop { 0% { transform: scale(0) rotate(-8deg); opacity: 0; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
//                 @keyframes wgGlassFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
//                 @keyframes wgGlassShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

//                 /* ─── Responsive ──────────────────────────────────────────── */
//                 @media (max-width: 480px) {
//                     .wg-glass-card { width: 90vw; max-width: 360px; padding: 2rem 1.5rem 1.5rem; }
//                     .wg-glass-title-main { font-size: 1.4rem; }
//                     .wg-glass-score-num { font-size: 2.1rem; }
//                 }
//             `}</style>
//         </div>,
//         document.body
//     );
// };

// // ════════════════════════════════════════════════════════════════════════════
// // USAGE:
// // ════════════════════════════════════════════════════════════════════════════
// //
// // <WelcomeGamificationPopup
// //   userName="Alexandra Chen"
// //   score={92}
// //   pendingCount={2}
// //   onDismiss={() => setShowPopup(false)}
// // />
// //
// // <WelcomeGamificationPopup
// //   userName="Alexandra Chen"
// //   score={-12}
// //   pendingCount={8}
// //   onDismiss={() => setShowPopup(false)}
// // />