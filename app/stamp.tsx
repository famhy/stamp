"use client";

import { useState, useRef, useCallback } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────
const GRID_COLS = 10;
const GRID_ROWS = 10;
const CELL_SIZE = 30; // px per cell
const DOT_RADIUS = 18; // px
const CLUSTER_THRESHOLD = 40; // px – max distance to merge touch points into one dot
const MIN_TOUCHES = 2; // ignore single-finger taps

type Dot = { col: number; row: number; key: string; x: number; y: number };
type PatternDef = { label: string; dots: string[] };

function gridKey(col: number, row: number) {
  return `${col},${row}`;
}

function touchesToDots(touches: { x: number; y: number }[]): Dot[] {
  // Convert raw touch positions (relative to canvas) → grid cells
  const dots: Dot[] = [];
  for (const t of touches) {
    const col = Math.round(t.x / CELL_SIZE);
    const row = Math.round(t.y / CELL_SIZE);
    if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
      const key = gridKey(col, row);
      if (!dots.find((d) => d.key === key))
        dots.push({ col, row, key, x: t.x, y: t.y });
    }
  }
  return dots;
}

// Known patterns → labels  (col,row pairs, 0-indexed, top-left origin)
const KNOWN_PATTERNS: PatternDef[] = [
  {
    label: "Pattern A",
    dots: ["1,1", "2,0", "3,1", "1,3", "3,3"],
  },
  {
    label: "Pattern B",
    dots: ["0,0", "2,0", "4,0", "0,4", "2,4", "4,4"],
  },
  {
    label: "Image Pattern",
    dots: ["1,1", "7,2", "3,5", "1,6", "8,7"],
  },
];

function matchPattern(activeDots: Dot[]): string | null {
  const keys = new Set(activeDots.map((d) => d.key));
  for (const p of KNOWN_PATTERNS) {
    const pSet = new Set<string>(p.dots);
    if (keys.size === pSet.size) {
      let matches = true;
      keys.forEach((k) => {
        if (!pSet.has(k)) matches = false;
      });
      if (matches) return p.label;
    }
  }
  return null;
}

// ── sub-components ────────────────────────────────────────────────────────────

function Grid({
  activeDots,
  highlight,
}: {
  activeDots: Dot[];
  highlight: boolean;
}) {
  const w = GRID_COLS * CELL_SIZE;
  const h = GRID_ROWS * CELL_SIZE;
  return (
    <svg
      width={w}
      height={h}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {/* grid lines */}
      {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={i * CELL_SIZE}
          y1={0}
          x2={i * CELL_SIZE}
          y2={h}
          stroke="#1e293b"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
        <line
          key={`h${i}`}
          x1={0}
          y1={i * CELL_SIZE}
          x2={w}
          y2={i * CELL_SIZE}
          stroke="#1e293b"
          strokeWidth={1}
        />
      ))}
      {/* dots */}
      {activeDots.map((d) => (
        <g key={d.key}>
          <circle
            cx={d.col * CELL_SIZE + CELL_SIZE / 2}
            cy={d.row * CELL_SIZE + CELL_SIZE / 2}
            r={DOT_RADIUS}
            fill={highlight ? "#f97316" : "#38bdf8"}
            opacity={0.9}
          />
          <circle
            cx={d.col * CELL_SIZE + CELL_SIZE / 2}
            cy={d.row * CELL_SIZE + CELL_SIZE / 2}
            r={DOT_RADIUS - 5}
            fill="white"
            opacity={0.25}
          />
          <text
            x={d.col * CELL_SIZE + CELL_SIZE / 2}
            y={d.row * CELL_SIZE + CELL_SIZE / 2 + 5}
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontFamily="monospace"
          >
            {d.col},{d.row}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── main app ──────────────────────────────────────────────────────────────────
export default function StampApp() {
  const [view, setView] = useState<"stamp" | "pattern">("stamp");
  const [activeDots, setActiveDots] = useState<Dot[]>([]);
  const [lastStamp, setLastStamp] = useState<Dot[] | null>(null); // snapshot after lift
  const [matchLabel, setMatchLabel] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [history, setHistory] = useState<
    { dots: Dot[]; label: string | null; ts: number }[]
  >([]); // [{dots, label, ts}]
  const padRef = useRef<HTMLDivElement | null>(null);

  // ── touch handling ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(
    (e: { preventDefault: () => void; touches: any }) => {
      e.preventDefault();
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const raw = [...e.touches].map((t) => ({
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      }));
      const dots = touchesToDots(raw);
      setActiveDots(dots);
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: { preventDefault: () => void; touches: any }) => {
      e.preventDefault();
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const raw = [...e.touches].map((t) => ({
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      }));
      const dots = touchesToDots(raw);
      setActiveDots(dots);
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (activeDots.length >= MIN_TOUCHES) {
        const label = matchPattern(activeDots);
        setLastStamp([...activeDots]);
        setMatchLabel(label);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
        setHistory((h) =>
          [{ dots: [...activeDots], label, ts: Date.now() }, ...h].slice(0, 10),
        );
      }
      setActiveDots([]);
    },
    [activeDots],
  );

  // ── mouse simulation (desktop testing) ────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: { button: number; clientX: number; clientY: number }) => {
      if (e.button !== 0) return;
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.round(x / CELL_SIZE);
      const row = Math.round(y / CELL_SIZE);
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
      const key = gridKey(col, row);
      setActiveDots((prev) => {
        if (prev.find((d) => d.key === key))
          return prev.filter((d) => d.key !== key);
        return [...prev, { col, row, key, x, y }];
      });
    },
    [],
  );

  const handleStampClick = useCallback(() => {
    if (activeDots.length >= 1) {
      const label = matchPattern(activeDots);
      setLastStamp([...activeDots]);
      setMatchLabel(label);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
      setHistory((h) =>
        [{ dots: [...activeDots], label, ts: Date.now() }, ...h].slice(0, 10),
      );
      setActiveDots([]);
    }
  }, [activeDots]);

  const padW = GRID_COLS * CELL_SIZE;
  const padH = GRID_ROWS * CELL_SIZE;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "#0f172a",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            Conductive Stamp Tester
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#f8fafc",
              letterSpacing: -0.5,
            }}
          >
            TouchDot Lab
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["stamp", "pattern"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: view === v ? "#38bdf8" : "#334155",
                background: view === v ? "#0ea5e9" : "transparent",
                color: view === v ? "#0f172a" : "#94a3b8",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {v === "stamp" ? "📲 Stamp Pad" : "🔍 Pattern View"}
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
        {/* ── Left: active view ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: 32,
            gap: 20,
          }}
        >
          {view === "stamp" ? (
            <>
              <div
                style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}
              >
                Touch (or click) cells to simulate stamp contact · Click{" "}
                <strong style={{ color: "#38bdf8" }}>STAMP</strong> to register
              </div>

              {/* pad */}
              <div
                ref={padRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                style={{
                  width: padW,
                  height: padH,
                  background: "#0f172a",
                  border: `2px solid ${flash ? "#f97316" : "#1e3a5f"}`,
                  borderRadius: 12,
                  cursor: "crosshair",
                  boxShadow: flash
                    ? "0 0 40px #f9731640"
                    : "0 0 40px #0ea5e920",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Grid activeDots={activeDots} highlight={false} />

                {activeDots.length === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#1e3a5f",
                      fontSize: 13,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    Place your stamp here
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "#475569",
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "6px 14px",
                  }}
                >
                  {activeDots.length} dot{activeDots.length !== 1 ? "s" : ""}{" "}
                  active
                </div>
                <button
                  onClick={handleStampClick}
                  disabled={activeDots.length === 0}
                  style={{
                    padding: "10px 28px",
                    background: activeDots.length ? "#0ea5e9" : "#1e293b",
                    color: activeDots.length ? "#0f172a" : "#334155",
                    border: "none",
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: 2,
                    cursor: activeDots.length ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                  }}
                >
                  ▼ STAMP
                </button>
                <button
                  onClick={() => setActiveDots([])}
                  style={{
                    padding: "10px 16px",
                    background: "transparent",
                    color: "#64748b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              </div>

              {/* Last stamp result */}
              {lastStamp && (
                <div
                  style={{
                    background: "#0f172a",
                    border: `1px solid ${matchLabel ? "#22c55e" : "#475569"}`,
                    borderRadius: 10,
                    padding: "12px 20px",
                    minWidth: 280,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      letterSpacing: 2,
                      marginBottom: 4,
                    }}
                  >
                    LAST STAMP
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: matchLabel ? "#22c55e" : "#94a3b8",
                    }}
                  >
                    {matchLabel ? `✅ ${matchLabel}` : "⚪ Unknown pattern"}
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                    {lastStamp.map((d: { key: any }) => d.key).join(" · ")}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── Pattern View ── */
            <>
              <div
                style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}
              >
                Registered stamp patterns — add your own in the code
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 32,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {/* Your physical stamp */}
                <PatternCard
                  label="Your Stamp (from photo)"
                  dots={["1,0", "2,1", "1,2", "3,2", "2,3", "0,3", "3,4"]}
                  note="8-dot diagonal pattern"
                />
                {KNOWN_PATTERNS.map((p) => (
                  <PatternCard
                    key={p.label}
                    label={p.label}
                    dots={p.dots}
                    note="Registered"
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: history panel ── */}
        <aside
          style={{
            width: 220,
            background: "#0a0f1e",
            borderLeft: "1px solid #1e293b",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Stamp History
          </div>
          {history.length === 0 && (
            <div style={{ fontSize: 12, color: "#334155" }}>No stamps yet…</div>
          )}
          {history.map((h, i) => (
            <div
              key={h.ts}
              style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                padding: "8px 10px",
                opacity: 1 - i * 0.08,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: h.label ? "#22c55e" : "#64748b",
                  fontWeight: 700,
                }}
              >
                {h.label ?? "Unknown"}
              </div>
              <div style={{ fontSize: 10, color: "#475569" }}>
                {h.dots.length} dots · {new Date(h.ts).toLocaleTimeString()}
              </div>
              <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>
                {h.dots.map((d) => d.key).join(" ")}
              </div>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}

function PatternCard({
  label,
  dots,
  note,
}: {
  label: string;
  dots: string[];
  note: string;
}) {
  const parsed = dots.map((k) => {
    const [colStr, rowStr] = k.split(",");
    return { col: Number(colStr), row: Number(rowStr), key: k };
  });
  const w = GRID_COLS * CELL_SIZE;
  const h = GRID_ROWS * CELL_SIZE;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e3a5f",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>
        {label}
      </div>
      <div
        style={{
          transform: "scale(0.7)",
          transformOrigin: "top center",
          height: h * 0.7,
        }}
      >
        <svg width={w} height={h}>
          {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={i * CELL_SIZE}
              y1={0}
              x2={i * CELL_SIZE}
              y2={h}
              stroke="#1e293b"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * CELL_SIZE}
              x2={w}
              y2={i * CELL_SIZE}
              stroke="#1e293b"
              strokeWidth={1}
            />
          ))}
          {parsed.map((d) => (
            <circle
              key={d.key}
              cx={d.col * CELL_SIZE + CELL_SIZE / 2}
              cy={d.row * CELL_SIZE + CELL_SIZE / 2}
              r={DOT_RADIUS}
              fill="#f97316"
              opacity={0.9}
            />
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{note}</div>
      <div style={{ fontSize: 10, color: "#334155" }}>{dots.join(" · ")}</div>
    </div>
  );
}
