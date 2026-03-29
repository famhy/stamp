"use client";
import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 10;
const DOT_R = 14;

// ── Types ────────────────────────────────────────────────────────────────────
interface Point {
  x: number;
  y: number;
}
interface Cell {
  c: number;
  r: number;
  key: string;
}
interface Shape {
  id: number;
  name: string;
  points: Point[];
}
interface ScoreEntry extends Shape {
  score: number;
}

// ── Algorithm ────────────────────────────────────────────────────────────────
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

function minDist(p: Point, set: Point[]): number {
  return Math.min(...set.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
}

function hausdorff(a: Point[], b: Point[]): number {
  const ab = a.reduce((s, p) => s + minDist(p, b), 0) / a.length;
  const ba = b.reduce((s, p) => s + minDist(p, a), 0) / b.length;
  return Math.max(ab, ba);
}

function compareShapes(ptsA: Point[], ptsB: Point[]): number {
  if (!ptsA.length || !ptsB.length) return 0;
  const na = normalize(ptsA);
  const nb = normalize(ptsB);
  const variants = [nb, mirrorX(nb), mirrorY(nb), mirrorX(mirrorY(nb))];
  const THRESH = 0.52;
  const best = Math.min(...variants.map((v) => hausdorff(na, v)));
  const countRatio =
    Math.min(ptsA.length, ptsB.length) / Math.max(ptsA.length, ptsB.length);
  const shape = Math.max(0, 1 - best / THRESH);
  return Math.round(shape * countRatio * 100);
}

// ── Mini dot preview ──────────────────────────────────────────────────────────
function DotPreview({
  points,
  size = 52,
  color = "#e879f9",
}: {
  points: Point[];
  size?: number;
  color?: string;
}) {
  if (!points.length) return <div style={{ width: size, height: size }} />;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = 10;
  const scale = (size - pad * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2;
  const offY = (size - (maxY - minY) * scale) / 2;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={(p.x - minX) * scale + offX}
          cy={(p.y - minY) * scale + offY}
          r={4}
          fill={color}
        />
      ))}
    </svg>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({
  name,
  score,
  points,
  isTop,
}: {
  name: string;
  score: number;
  points: Point[];
  isTop: boolean;
}) {
  const color = score >= 75 ? "#34d399" : score >= 45 ? "#fbbf24" : "#94a3b8";
  const label = score >= 75 ? "Strong" : score >= 45 ? "Partial" : "Weak";
  return (
    <div
      style={{
        background: isTop ? "rgba(232,121,249,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isTop ? "rgba(232,121,249,0.3)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <DotPreview
        points={points}
        size={44}
        color={isTop ? "#e879f9" : "#64748b"}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 5,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f1f5f9",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color,
                fontWeight: 700,
                background: `${color}18`,
                padding: "1px 7px",
                borderRadius: 20,
              }}
            >
              {label}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {score}%
            </span>
          </div>
        </div>
        <div
          style={{
            height: 4,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${score}%`,
              background: color,
              borderRadius: 2,
              transition: "width 0.5s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Saved shape card ──────────────────────────────────────────────────────────
function ShapeCard({
  shape,
  onDelete,
  onLoad,
}: {
  shape: Shape;
  onDelete: () => void;
  onLoad: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onClick={onLoad}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "rgba(232,121,249,0.4)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
      }
    >
      <DotPreview points={shape.points} size={44} color="#e879f9" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#f1f5f9",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shape.name}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
          {shape.points.length} dots
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: 4,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
      >
        ×
      </button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function StampLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCellRef = useRef<string | null>(null);
  // Track actual pixel size of the canvas for coordinate mapping
  const cellSizeRef = useRef(44);

  const [dots, setDots] = useState<Map<string, Cell>>(new Map());
  const [savedShapes, setSavedShapes] = useState<Shape[]>([
    {
      id: 1,
      name: "Your stamp (photo)",
      points: [
        { x: 88, y: 44 },
        { x: 176, y: 88 },
        { x: 132, y: 132 },
        { x: 220, y: 132 },
        { x: 264, y: 132 },
        { x: 44, y: 176 },
        { x: 176, y: 220 },
        { x: 264, y: 220 },
      ],
    },
  ]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [shapeName, setShapeName] = useState("");
  const [flash, setFlash] = useState(false);
  const [activeTab, setActiveTab] = useState("saved");
  const [isMobile, setIsMobile] = useState(false);

  // Responsive
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── Compute cell size from actual rendered canvas width ─────────────────────
  // Canvas internal resolution stays COLS*CELL × ROWS*CELL.
  // We compute a "display cell size" from getBoundingClientRect for hit-testing.
  const getDisplayCellSize = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return cellSizeRef.current;
    const rect = canvas.getBoundingClientRect();
    // The canvas is rendered at width:100% so rect.width may differ from canvas.width
    const cs = rect.width / COLS;
    cellSizeRef.current = cs;
    return cs;
  }, []);

  // ── Canvas draw ─────────────────────────────────────────────────────────────
  // Always draw in internal canvas coordinates (COLS*44 × ROWS*44)
  const CELL = 44;
  const PAD_W = COLS * CELL;
  const PAD_H = ROWS * CELL;

  const draw = useCallback(
    (dotMap: Map<string, Cell>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, PAD_W, PAD_H);

      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, 0);
        ctx.lineTo(c * CELL, PAD_H);
        ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL);
        ctx.lineTo(PAD_W, r * CELL);
        ctx.stroke();
      }

      // dots
      dotMap.forEach(({ c, r }) => {
        const cx = c * CELL + CELL / 2,
          cy = r * CELL + CELL / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, DOT_R * 2);
        grad.addColorStop(0, "rgba(232,121,249,0.3)");
        grad.addColorStop(1, "rgba(232,121,249,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, DOT_R * 2, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = "#e879f9";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 3, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();
      });
    },
    [PAD_W, PAD_H, CELL],
  );

  useEffect(() => {
    draw(dots);
  }, [dots, draw]);

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  // Convert a display-space pixel (from getBoundingClientRect) → canvas cell
  const pixelToCell = useCallback(
    (displayX: number, displayY: number): Cell | null => {
      const cs = getDisplayCellSize();
      // display cell size for rows
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const csY = rect.height / ROWS;
      const c = Math.floor(displayX / cs);
      const r = Math.floor(displayY / csY);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
      return { c, r, key: `${c},${r}` };
    },
    [getDisplayCellSize],
  );

  const eventToDisplayXY = (
    e: React.MouseEvent | React.TouchEvent,
    touchIndex = 0,
  ) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[touchIndex];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  // ── Mouse handlers — click to toggle, drag to only ADD ──────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = eventToDisplayXY(e);
    const cell = pixelToCell(x, y);
    if (!cell) return;
    lastCellRef.current = cell.key;
    // Toggle on initial click
    setDots((prev) => {
      const next = new Map(prev);
      if (next.has(cell.key)) next.delete(cell.key);
      else next.set(cell.key, cell);
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return; // only while holding left button
    const { x, y } = eventToDisplayXY(e);
    const cell = pixelToCell(x, y);
    if (!cell || cell.key === lastCellRef.current) return; // skip same cell
    lastCellRef.current = cell.key;
    // Only ADD while dragging, never remove
    setDots((prev) => {
      if (prev.has(cell.key)) return prev;
      const next = new Map(prev);
      next.set(cell.key, cell);
      return next;
    });
  };

  const handleMouseUp = () => {
    lastCellRef.current = null;
    triggerCompare();
  };

  // ── Touch handlers — stamp = all fingers land at once ──────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const csX = rect.width / COLS;
    const csY = rect.height / ROWS;
    // Replace dots entirely with current touch set
    const next = new Map<string, Cell>();
    Array.from(e.touches).forEach((t) => {
      const cell = pixelToCell(t.clientX - rect.left, t.clientY - rect.top);
      if (cell) next.set(cell.key, cell);
    });
    setDots(next);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Only ADD new contacts — preserve existing dots
    setDots((prev) => {
      const next = new Map(prev);
      Array.from(e.touches).forEach((t) => {
        const cell = pixelToCell(t.clientX - rect.left, t.clientY - rect.top);
        if (cell) next.set(cell.key, cell);
      });
      return next;
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    // When ALL fingers are lifted, register the stamp
    if (e.touches.length === 0) triggerCompare();
  };

  // ── Compare ─────────────────────────────────────────────────────────────────
  const dotsToPoints = (d: Map<string, Cell>): Point[] =>
    [...d.values()].map(({ c, r }) => ({
      x: c * CELL + CELL / 2,
      y: r * CELL + CELL / 2,
    }));

  const triggerCompare = useCallback(() => {
    setDots((current) => {
      if (current.size < 2 || !savedShapes.length) return current;
      const pts = dotsToPoints(current);
      const result = savedShapes
        .map((s) => ({ ...s, score: compareShapes(pts, s.points) }))
        .sort((a, b) => b.score - a.score);
      setScores(result);
      setFlash(true);
      setTimeout(() => setFlash(false), 500);
      return current;
    });
  }, [savedShapes]);

  const saveShape = () => {
    if (dots.size < 2) return;
    const name = shapeName.trim() || `Shape ${savedShapes.length + 1}`;
    setSavedShapes((prev) => [
      ...prev,
      { id: Date.now(), name, points: dotsToPoints(dots) },
    ]);
    setShapeName("");
    setActiveTab("saved");
  };

  const clearPad = () => {
    setDots(new Map());
    setScores([]);
  };

  const loadShape = (shape: Shape) => {
    const map = new Map<string, Cell>();
    shape.points.forEach((p) => {
      const c = Math.round((p.x - CELL / 2) / CELL);
      const r = Math.round((p.y - CELL / 2) / CELL);
      const key = `${c},${r}`;
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) map.set(key, { c, r, key });
    });
    setDots(map);
    setScores([]);
  };

  const topScore = scores[0]?.score ?? null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080b14",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header */}
      <header
        style={{
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg,#a855f7,#ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          ⬡
        </div>
        <div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: "#f8fafc",
            }}
          >
            StampLab
          </div>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: 0.5 }}>
            CONDUCTIVE DOT PATTERN READER
          </div>
        </div>
        {topScore !== null && (
          <div
            style={{
              marginLeft: "auto",
              fontSize: 13,
              color:
                topScore >= 75
                  ? "#34d399"
                  : topScore >= 45
                    ? "#fbbf24"
                    : "#94a3b8",
              background:
                topScore >= 75
                  ? "rgba(52,211,153,0.1)"
                  : topScore >= 45
                    ? "rgba(251,191,36,0.1)"
                    : "rgba(148,163,184,0.1)",
              padding: "4px 14px",
              borderRadius: 20,
              fontWeight: 600,
            }}
          >
            Best: {scores[0]?.name} — {topScore}%
          </div>
        )}
      </header>

      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {/* ── LEFT: pad ── */}
        <div
          style={{
            flex: 1,
            padding: isMobile ? 14 : 28,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          {/* toolbar */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {dots.size} dot{dots.size !== 1 ? "s" : ""}
            </span>
            <div style={{ flex: 1 }} />
            <input
              value={shapeName}
              onChange={(e) => setShapeName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveShape()}
              placeholder="name this shape…"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "7px 12px",
                color: "#f1f5f9",
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
                width: 160,
              }}
            />
            <button
              onClick={saveShape}
              disabled={dots.size < 2}
              style={{
                padding: "7px 16px",
                background:
                  dots.size >= 2
                    ? "linear-gradient(135deg,#a855f7,#ec4899)"
                    : "rgba(255,255,255,0.05)",
                border: "none",
                borderRadius: 8,
                color: dots.size >= 2 ? "#fff" : "#475569",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: dots.size >= 2 ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
            <button
              onClick={clearPad}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "#64748b",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              onClick={triggerCompare}
              disabled={dots.size < 2 || !savedShapes.length}
              style={{
                padding: "7px 16px",
                background: "rgba(232,121,249,0.12)",
                border: "1px solid rgba(232,121,249,0.3)",
                borderRadius: 8,
                color: "#e879f9",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Compare ↗
            </button>
          </div>

          {/* canvas wrapper — fills available width */}
          <div
            ref={containerRef}
            style={{ position: "relative", width: "100%", maxWidth: 520 }}
          >
            <canvas
              ref={canvasRef}
              width={PAD_W}
              height={PAD_H}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                display: "block",
                width: "100%", // scales to container
                height: "auto", // preserves aspect ratio
                borderRadius: 14,
                border: `1.5px solid ${flash ? "rgba(232,121,249,0.6)" : "rgba(255,255,255,0.08)"}`,
                cursor: "crosshair",
                touchAction: "none", // critical: prevents browser scroll hijack
                background: "#0d1120",
                transition: "border-color 0.3s, box-shadow 0.3s",
                boxShadow: flash
                  ? "0 0 40px rgba(232,121,249,0.2)"
                  : "0 0 40px rgba(0,0,0,0.4)",
              }}
            />
            {dots.size === 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.12)",
                  fontSize: 13,
                  pointerEvents: "none",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 32 }}>⬡</div>
                <div>Press your stamp here</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.07)" }}>
                  or click to place dots
                </div>
              </div>
            )}
          </div>

          {/* scores */}
          {scores.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                Similarity scores
              </div>
              {scores.map((s, i) => (
                <ScoreBar
                  key={s.id}
                  name={s.name}
                  score={s.score}
                  points={s.points}
                  isTop={i === 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: sidebar ── */}
        <div
          style={{
            width: isMobile ? "100%" : 280,
            borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
            borderTop: isMobile ? "1px solid rgba(255,255,255,0.07)" : "none",
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {(["saved", "algo"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${activeTab === t ? "#e879f9" : "transparent"}`,
                  color: activeTab === t ? "#e879f9" : "#475569",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >
                {t === "saved" ? "SAVED SHAPES" : "ALGORITHM"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {activeTab === "saved" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {savedShapes.length === 0 ? (
                  <div
                    style={{
                      color: "#334155",
                      fontSize: 13,
                      textAlign: "center",
                      padding: "32px 0",
                    }}
                  >
                    No shapes saved yet
                  </div>
                ) : (
                  savedShapes.map((s) => (
                    <ShapeCard
                      key={s.id}
                      shape={s}
                      onDelete={() =>
                        setSavedShapes((prev) =>
                          prev.filter((x) => x.id !== s.id),
                        )
                      }
                      onLoad={() => loadShape(s)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.7,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {(
                  [
                    [
                      "Center",
                      "Subtracts the centroid — translation invariant.",
                    ],
                    [
                      "Scale",
                      "Divides by max distance from center — size invariant.",
                    ],
                    [
                      "Mirror",
                      "Tests 4 variants: normal, flip-X, flip-Y, both. Handles stamps pressed upside-down.",
                    ],
                    [
                      "Hausdorff",
                      "For each dot in A, finds nearest in B. Takes worst case both ways.",
                    ],
                    [
                      "Count penalty",
                      "min/max dot count — a 3-dot shape can't score high against an 8-dot one.",
                    ],
                  ] as [string, string][]
                ).map(([title, desc]) => (
                  <div key={title}>
                    <div
                      style={{
                        color: "#e879f9",
                        fontWeight: 600,
                        marginBottom: 3,
                      }}
                    >
                      {title}
                    </div>
                    <div>{desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
