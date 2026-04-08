"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Point {
  x: number;
  y: number;
}

interface ValidationResult {
  verdict: "VALID" | "INVALID" | "INCONCLUSIVE";
  score: number; // 0–100
  shapeScore: number; // geometry match
  structureScore: number; // topology / dot-count match
  isRetry: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT CONFIG — tune once, leave for all clients
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  // Geometry threshold — lower = stricter shape match required
  HAUSDORFF_THRESH: 0.48,

  // Trimmed-mean: drop this fraction of worst-matching dots (handles 1-2 missing)
  OUTLIER_TRIM: 0.2,

  // Soft count penalty range [min, max] — keeps score fair even with 1-2 missing dots
  // SECURITY NOTE: do NOT set min below 0.65 — too easy to spoof with fewer dots
  COUNT_PENALTY_MIN: 0.7,
  COUNT_PENALTY_MAX: 1.0,

  // Maximum allowed missing dot ratio before rejecting outright
  // e.g. 0.30 means if >30% of expected dots are missing → INCONCLUSIVE, not scored
  MAX_MISSING_RATIO: 0.3,

  // Score thresholds
  VALID_THRESHOLD: 72, // above this → VALID
  INCONCLUSIVE_THRESHOLD: 50, // between this and VALID → ask for one retry
  // below this → INVALID immediately

  // Structural check: expected dot count from your physical stamp
  // Set this to the number of dots on your stamp. Stamping with wildly different
  // count will fail even if shape is ok — prevents simple pattern spoofing.
  EXPECTED_DOT_COUNT: 8,

  // How far off the dot count can be before structural penalty kicks in hard
  DOT_COUNT_TOLERANCE: 2,
};

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM — security-balanced
// ─────────────────────────────────────────────────────────────────────────────

function normalize(pts: Point[]): Point[] {
  if (!pts.length) return [];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const centered = pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const maxD = Math.max(...centered.map((p) => Math.hypot(p.x, p.y))) || 1;
  return centered.map((p) => ({ x: p.x / maxD, y: p.y / maxD }));
}

function mirrorX(pts: Point[]): Point[] {
  return pts.map((p) => ({ x: -p.x, y: p.y }));
}
function mirrorY(pts: Point[]): Point[] {
  return pts.map((p) => ({ x: p.x, y: -p.y }));
}

// Trimmed directed distance — drops worst OUTLIER_TRIM fraction
function trimmedDirected(a: Point[], b: Point[]): number {
  const dists = a.map((p) =>
    Math.min(...b.map((q) => Math.hypot(p.x - q.x, p.y - q.y))),
  );
  dists.sort((x, y) => x - y);
  const keep = Math.ceil(dists.length * (1 - CONFIG.OUTLIER_TRIM));
  const trimmed = dists.slice(0, keep);
  return trimmed.reduce((s, d) => s + d, 0) / trimmed.length;
}

function robustHausdorff(a: Point[], b: Point[]): number {
  return Math.max(trimmedDirected(a, b), trimmedDirected(b, a));
}

// Structure score — how close is the dot count to expected
// This is a HARD security gate: random finger presses rarely match exactly
function structureScore(pts: Point[]): number {
  const diff = Math.abs(pts.length - CONFIG.EXPECTED_DOT_COUNT);
  if (diff > CONFIG.DOT_COUNT_TOLERANCE + 2) return 0; // way off — hard fail
  if (diff <= CONFIG.DOT_COUNT_TOLERANCE) return 100;
  // Graceful degradation for 1-2 extra/missing dots (screen sensitivity variance)
  return Math.max(0, 100 - (diff - CONFIG.DOT_COUNT_TOLERANCE) * 25);
}

function validate(
  stamped: Point[],
  reference: Point[],
): ValidationResult | null {
  if (!stamped.length || !reference.length) return null;

  // ── GATE 1: missing dot check ──────────────────────────────────────────────
  // If too many dots are missing, the press itself is unreliable — ask to retry
  // rather than scoring a bad read. This is NOT a security gate, it's quality control.
  const missingRatio =
    1 -
    Math.min(stamped.length, reference.length) /
      Math.max(stamped.length, reference.length);
  if (missingRatio > CONFIG.MAX_MISSING_RATIO) return null; // signals INCONCLUSIVE

  // ── GATE 2: structural check ───────────────────────────────────────────────
  // Count-based score — hard to spoof because random patterns have random counts
  const strScore = structureScore(stamped);

  // ── GATE 3: geometry check ─────────────────────────────────────────────────
  const na = normalize(stamped);
  const nb = normalize(reference);
  // Test all 4 mirror variants (stamp can be pressed any orientation)
  const variants = [nb, mirrorX(nb), mirrorY(nb), mirrorX(mirrorY(nb))];
  const bestDist = Math.min(...variants.map((v) => robustHausdorff(na, v)));

  // Soft count penalty — does not collapse score for 1-2 missing dots
  // but still penalizes significant count differences
  const countRatio =
    Math.min(stamped.length, reference.length) /
    Math.max(stamped.length, reference.length);
  const countPenalty =
    CONFIG.COUNT_PENALTY_MIN +
    countRatio * (CONFIG.COUNT_PENALTY_MAX - CONFIG.COUNT_PENALTY_MIN);

  const shapeRaw = Math.max(0, 1 - bestDist / CONFIG.HAUSDORFF_THRESH);
  const shpScore = Math.round(shapeRaw * countPenalty * 100);

  // ── COMBINED SCORE ─────────────────────────────────────────────────────────
  // Shape is weighted more (70%) but structure prevents pure-shape spoofing (30%)
  // Security note: both gates must pass — a good shape with wrong dot count still fails
  const combined = Math.round(shpScore * 0.7 + strScore * 0.3);

  const verdict: ValidationResult["verdict"] =
    combined >= CONFIG.VALID_THRESHOLD
      ? "VALID"
      : combined >= CONFIG.INCONCLUSIVE_THRESHOLD
        ? "INCONCLUSIVE"
        : "INVALID";

  return {
    verdict,
    score: combined,
    shapeScore: shpScore,
    structureScore: strScore,
    isRetry: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — DPR-aware, touch + mouse
// ─────────────────────────────────────────────────────────────────────────────
const LOGICAL_SIZE = 320; // CSS px — internal drawing space

interface CanvasPadProps {
  label: string;
  onPoints: (pts: Point[]) => void;
  disabled?: boolean;
  accent?: string;
}

function CanvasPad({
  label,
  onPoints,
  disabled = false,
  accent = "#6366f1",
}: CanvasPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const dprRef = useRef(1);
  const [hasDots, setHasDots] = useState(false);

  // ── setup: DPR-correct canvas buffer ──────────────────────────────────────
  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = LOGICAL_SIZE * dpr;
    canvas.height = LOGICAL_SIZE * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    redraw(ctx, pointsRef.current);
  }, []);

  useEffect(() => {
    setup();
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  function redraw(ctx: CanvasRenderingContext2D, pts: Point[]) {
    ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const step = LOGICAL_SIZE / 8;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, LOGICAL_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(LOGICAL_SIZE, i * step);
      ctx.stroke();
    }

    // dots
    pts.forEach((p) => {
      const r = 11;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
      grd.addColorStop(0, accent + "55");
      grd.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fill();
    });
  }

  // ── coordinate mapping — always CSS pixels ─────────────────────────────────
  function toLogical(clientX: number, clientY: number): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // rect is in CSS pixels; LOGICAL_SIZE is also CSS pixels
    // scale handles non-square containers
    const scaleX = LOGICAL_SIZE / rect.width;
    const scaleY = LOGICAL_SIZE / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function snapToGrid(p: Point): Point {
    // Snap to nearest grid intersection to reduce sensitivity noise
    const step = LOGICAL_SIZE / 8;
    return {
      x: Math.round(p.x / step) * step,
      y: Math.round(p.y / step) * step,
    };
  }

  function handleTouch(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (disabled) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const pts: Point[] = Array.from(e.touches).map((t) => {
      const logical = toLogical(t.clientX, t.clientY);
      return snapToGrid(logical);
    });

    // Deduplicate — two fingers on the same grid cell = one dot
    const deduped = pts.filter(
      (p, i) =>
        !pts
          .slice(0, i)
          .some((q) => Math.hypot(p.x - q.x, p.y - q.y) < LOGICAL_SIZE / 10),
    );

    pointsRef.current = deduped;
    setHasDots(deduped.length > 0);
    redraw(ctx, deduped);
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (disabled) return;
    // All fingers lifted — commit the points
    if (e.touches.length === 0) {
      onPoints(pointsRef.current);
    }
  }

  // Mouse: click to toggle dot (for desktop testing)
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const p = snapToGrid(toLogical(e.clientX, e.clientY));
    const key = (q: Point) => `${q.x},${q.y}`;
    const existing = pointsRef.current.findIndex((q) => key(q) === key(p));
    if (existing >= 0) pointsRef.current.splice(existing, 1);
    else pointsRef.current.push(p);
    setHasDots(pointsRef.current.length > 0);
    redraw(ctx, pointsRef.current);
    onPoints(pointsRef.current);
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    pointsRef.current = [];
    setHasDots(false);
    redraw(ctx, []);
    onPoints([]);
  }

  // Expose clear to parent via imperative handle pattern
  (CanvasPad as any)._clearRef = clear;

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: 12,
            border: `1.5px solid ${hasDots ? accent + "55" : "rgba(255,255,255,0.08)"}`,
            background: "#0b0f1a",
            touchAction: "none",
            cursor: disabled ? "not-allowed" : "crosshair",
            opacity: disabled ? 0.4 : 1,
            transition: "border-color 0.3s, opacity 0.3s",
          }}
        />
        {!hasDots && !disabled && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 28, opacity: 0.12 }}>◈</div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.12)",
                letterSpacing: 0.5,
              }}
            >
              place stamp here
            </div>
          </div>
        )}
      </div>
      {hasDots && (
        <button
          onClick={clear}
          style={{
            alignSelf: "flex-end",
            fontSize: 11,
            padding: "3px 10px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          clear
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VERDICT DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function VerdictDisplay({ result }: { result: ValidationResult }) {
  const colors = {
    VALID: {
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.3)",
      text: "#34d399",
      label: "VALIDATED",
    },
    INVALID: {
      bg: "rgba(248,113,113,0.08)",
      border: "rgba(248,113,113,0.3)",
      text: "#f87171",
      label: "REJECTED",
    },
    INCONCLUSIVE: {
      bg: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.3)",
      text: "#fbbf24",
      label: "RETRY",
    },
  };
  const c = colors[result.verdict];

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* main verdict */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            VERDICT
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: c.text,
              letterSpacing: -0.5,
            }}
          >
            {c.label}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            SCORE
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: c.text,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {result.score}%
          </div>
        </div>
      </div>

      {/* breakdown bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(
          [
            ["Shape match", result.shapeScore],
            ["Structure match", result.structureScore],
          ] as [string, number][]
        ).map(([label, val]) => (
          <div key={label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {label}
              </span>
              <span style={{ fontSize: 11, color: c.text, fontWeight: 600 }}>
                {val}%
              </span>
            </div>
            <div
              style={{
                height: 3,
                background: "rgba(255,255,255,0.07)",
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${val}%`,
                  background: c.text,
                  borderRadius: 2,
                  transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {result.verdict === "INCONCLUSIVE" && (
        <div
          style={{
            fontSize: 12,
            color: "rgba(251,191,36,0.7)",
            lineHeight: 1.5,
          }}
        >
          Press firmer or clean the screen and try once more.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
type AppState = "idle" | "has_reference" | "result" | "retry";

export default function StampValidationPage() {
  const [referencePoints, setReferencePoints] = useState<Point[]>([]);
  const [stampedPoints, setStampedPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [state, setState] = useState<AppState>("idle");
  const [retryCount, setRetryCount] = useState(0);

  const refPadRef = useRef<any>(null);
  const stampPadRef = useRef<any>(null);

  // When reference points change
  const handleReferencePoints = useCallback(
    (pts: Point[]) => {
      setReferencePoints(pts);
      if (pts.length >= 2) setState("has_reference");
      else if (state === "has_reference") setState("idle");
    },
    [state],
  );

  // When client stamps — run validation immediately
  const handleStampPoints = useCallback(
    (pts: Point[]) => {
      setStampedPoints(pts);

      if (pts.length === 0) {
        setResult(null);
        return;
      }

      if (referencePoints.length < 2) return;

      const res = validate(pts, referencePoints);

      if (res === null) {
        // Gate 1 failed — too many dots missing, bad press
        setResult({
          verdict: "INCONCLUSIVE",
          score: 0,
          shapeScore: 0,
          structureScore: 0,
          isRetry: retryCount > 0,
        });
        setState("retry");
        setRetryCount((r) => r + 1);
        return;
      }

      if (res.verdict === "INCONCLUSIVE" && retryCount === 0) {
        // Borderline first attempt — allow one silent retry
        setResult({ ...res, isRetry: false });
        setState("retry");
        setRetryCount(1);
      } else {
        // Either confident result, or already retried once — commit
        setResult({ ...res, isRetry: retryCount > 0 });
        setState("result");
      }
    },
    [referencePoints, retryCount],
  );

  const resetAll = useCallback(() => {
    setReferencePoints([]);
    setStampedPoints([]);
    setResult(null);
    setState("idle");
    setRetryCount(0);
    // Clear both canvases
    if (refPadRef.current?.clearPad) refPadRef.current.clearPad();
    if (stampPadRef.current?.clearPad) stampPadRef.current.clearPad();
  }, []);

  const resetStamp = useCallback(() => {
    setStampedPoints([]);
    setResult(null);
    setState("has_reference");
    setRetryCount(0);
    if (stampPadRef.current?.clearPad) stampPadRef.current.clearPad();
  }, []);

  const stateLabel = {
    idle: { text: "Set reference stamp", color: "rgba(255,255,255,0.3)" },
    has_reference: { text: "Ready — place client stamp", color: "#6366f1" },
    result: { text: "Validation complete", color: "rgba(255,255,255,0.3)" },
    retry: { text: "Press again — one retry allowed", color: "#fbbf24" },
  }[state];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080c14",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(16px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ◈
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#f8fafc",
              letterSpacing: -0.3,
            }}
          >
            StampGuard
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: 1.5,
            }}
          >
            CONDUCTIVE STAMP VALIDATION
          </div>
        </div>

        {/* status pill */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: stateLabel.color,
            background: `${stateLabel.color}18`,
            border: `1px solid ${stateLabel.color}33`,
            padding: "5px 12px",
            borderRadius: 20,
            letterSpacing: 0.5,
            flexShrink: 0,
            maxWidth: 200,
            textAlign: "center",
          }}
        >
          {stateLabel.text}
        </div>
      </header>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: "20px 20px 32px",
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* ── Security notice ── */}
        <div
          style={{
            background: "rgba(99,102,241,0.07)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 11,
            color: "rgba(99,102,241,0.8)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#6366f1" }}>Validation mode:</strong> Shape +
          structure gates both active. Expected {CONFIG.EXPECTED_DOT_COUNT} dots
          ±{CONFIG.DOT_COUNT_TOLERANCE}. Match threshold:{" "}
          {CONFIG.VALID_THRESHOLD}%. One retry allowed for borderline reads.
        </div>

        {/* ── Two pads ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {/* Reference pad */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              01 — Reference
            </div>
            <CanvasPad
              label="Your master stamp"
              onPoints={handleReferencePoints}
              accent="#6366f1"
            />
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
                lineHeight: 1.5,
              }}
            >
              Register your physical stamp pattern here. This is the reference
              all clients are validated against.
            </div>
          </div>

          {/* Client stamp pad */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${
                state === "has_reference" || state === "retry"
                  ? "rgba(99,102,241,0.25)"
                  : "rgba(255,255,255,0.07)"
              }`,
              borderRadius: 14,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              transition: "border-color 0.3s",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              02 — Client stamp
            </div>
            <CanvasPad
              label={
                state === "retry"
                  ? "Press again — retry"
                  : "Client places stamp here"
              }
              onPoints={handleStampPoints}
              disabled={state === "idle" || state === "result"}
              accent={state === "retry" ? "#fbbf24" : "#8b5cf6"}
            />
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
                lineHeight: 1.5,
              }}
            >
              {state === "idle" && "Set the reference stamp first."}
              {state === "has_reference" &&
                "Client presses their stamp on this area."}
              {state === "retry" &&
                "Borderline read — press once more for a confident result."}
              {state === "result" &&
                "Validation complete. Reset to validate next client."}
            </div>
          </div>
        </div>

        {/* ── Result ── */}
        {result && <VerdictDisplay result={result} />}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {state === "result" && (
            <button
              onClick={resetStamp}
              style={{
                flex: 1,
                padding: "11px 20px",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.35)",
                borderRadius: 10,
                color: "#818cf8",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              Next client →
            </button>
          )}
          <button
            onClick={resetAll}
            style={{
              padding: "11px 20px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.4)",
              fontFamily: "inherit",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reset all
          </button>
        </div>

        {/* ── Config reference ── */}
        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              cursor: "pointer",
              letterSpacing: 1,
              userSelect: "none",
            }}
          >
            SECURITY CONFIG
          </summary>
          <div
            style={{
              marginTop: 10,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: 14,
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "monospace",
              lineHeight: 2,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 24px",
            }}
          >
            {Object.entries(CONFIG).map(([k, v]) => (
              <div key={k}>
                <span style={{ color: "rgba(99,102,241,0.7)" }}>{k}</span>
                {" = "}
                <span style={{ color: "rgba(255,255,255,0.5)" }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
