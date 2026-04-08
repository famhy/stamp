"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type DiagMode = "raw" | "heatmap" | "diff";

interface Point {
  x: number;
  y: number;
}

interface RawTouch {
  id: number;
  x: number;
  y: number;
  phase: "active" | "lost";
}

interface HeatmapCluster {
  cx: number;
  cy: number;
  count: number; // unique presses that contributed
  points: Point[];
}

interface DiagPress {
  id: number;
  rawTouches: number;
  snappedDots: number;
  expectedDots: number;
  missingDots: number;
  pressDuration: number;
  verdict: "perfect" | "partial" | "failed";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 10;
const TOTAL_HEAT = 10;
const CLUSTER_R = 40; // px — within this = same physical dot
const DIFF_MATCH_R = 35; // px — within this = matched dot in diff

// ── Helpers ───────────────────────────────────────────────────────────────────
function clusterSessions(
  sessions: { pressNum: number; points: Point[] }[],
): HeatmapCluster[] {
  const clusters: HeatmapCluster[] = [];

  sessions.forEach(({ points }) => {
    points.forEach((pt) => {
      let bestIdx = -1;
      let bestDist = CLUSTER_R;
      clusters.forEach((c, i) => {
        const d = Math.hypot(c.cx - pt.x, c.cy - pt.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0) {
        const cluster = clusters[bestIdx];
        cluster.points.push(pt);
        cluster.cx =
          cluster.points.reduce((s, p) => s + p.x, 0) / cluster.points.length;
        cluster.cy =
          cluster.points.reduce((s, p) => s + p.y, 0) / cluster.points.length;
      } else {
        clusters.push({ cx: pt.x, cy: pt.y, count: 0, points: [pt] });
      }
    });
  });

  // Count how many distinct presses contributed to each cluster
  clusters.forEach((c) => {
    c.count = sessions.filter((s) =>
      s.points.some(
        (p) => Math.hypot(c.cx - p.x, c.cy - p.y) < CLUSTER_R * 1.5,
      ),
    ).length;
  });

  return clusters;
}

function matchDiff(expected: Point[], actual: Point[]) {
  const used = new Set<number>();
  let matched = 0;
  expected.forEach((e) => {
    let bestIdx = -1,
      bestDist = DIFF_MATCH_R;
    actual.forEach((a, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(a.x - e.x, a.y - e.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      matched++;
      used.add(bestIdx);
    }
  });
  return {
    matched,
    missing: expected.length - matched,
    extra: actual.length - matched,
  };
}

function snapCount(
  points: Point[],
  ref: { current: HTMLDivElement | null },
): number {
  const rect = ref.current?.getBoundingClientRect();
  if (!rect || rect.width === 0) return points.length;
  const keys = new Set<string>();
  points.forEach((p) => {
    const c = Math.floor((p.x / rect.width) * COLS);
    const r = Math.floor((p.y / rect.height) * ROWS);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) keys.add(`${c},${r}`);
  });
  return keys.size;
}

function getCoords(
  t: { clientX: number; clientY: number },
  ref: { current: HTMLDivElement | null },
): Point {
  const rect = ref.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

// ── Pad: shared touch area ─────────────────────────────────────────────────────
function Pad({
  innerRef,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onClick,
  compact,
  children,
}: {
  innerRef: { current: HTMLDivElement | null };
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      ref={innerRef as React.RefObject<HTMLDivElement>}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: compact ? 260 : 520,
        aspectRatio: "1",
        background: "#0d1120",
        borderRadius: 14,
        border: "1.5px solid rgba(255,255,255,0.08)",
        touchAction: "none",
        overflow: "hidden",
        cursor: "crosshair",
        userSelect: "none",
      }}
    >
      {/* Grid lines */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: COLS + 1 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={`${i * 10}%`}
            y1="0"
            x2={`${i * 10}%`}
            y2="100%"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: ROWS + 1 }, (_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={`${i * 10}%`}
            x2="100%"
            y2={`${i * 10}%`}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}
      </svg>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StampDiagnostic() {
  const [mode, setMode] = useState<DiagMode>("raw");
  const [expectedDots, setExpectedDots] = useState(5);
  const [isMobile, setIsMobile] = useState(false);
  const [pressLog, setPressLog] = useState<DiagPress[]>([]);
  const pressIdRef = useRef(0);
  const pressStartRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── Mode 1: Raw ──────────────────────────────────────────────────────────────
  const rawRef = useRef<HTMLDivElement>(null);
  const [activeTouches, setActiveTouches] = useState<Map<number, RawTouch>>(
    new Map(),
  );
  const [frozenTouches, setFrozenTouches] = useState<RawTouch[]>([]);
  const [pressActive, setPressActive] = useState(false);

  // ── Mode 2: Heatmap ──────────────────────────────────────────────────────────
  const heatRef = useRef<HTMLDivElement>(null);
  const [heatSessions, setHeatSessions] = useState<
    { pressNum: number; points: Point[] }[]
  >([]);
  const [clusters, setClusters] = useState<HeatmapCluster[]>([]);
  const currentHeatPoints = useRef<Point[]>([]);

  // ── Mode 3: Diff ─────────────────────────────────────────────────────────────
  const diffExpRef = useRef<HTMLDivElement>(null);
  const diffActRef = useRef<HTMLDivElement>(null);
  const [expectedPattern, setExpectedPattern] = useState<Point[]>([]);
  const [actualDots, setActualDots] = useState<Point[]>([]);
  const [diffResult, setDiffResult] = useState<{
    matched: number;
    missing: number;
    extra: number;
  } | null>(null);

  // ── Press log helper ─────────────────────────────────────────────────────────
  const logPress = useCallback(
    (raw: number, snapped: number, duration: number, exp: number) => {
      const missing = Math.max(0, exp - snapped);
      const verdict: DiagPress["verdict"] =
        missing === 0 ? "perfect" : missing <= 1 ? "partial" : "failed";
      setPressLog((prev) =>
        [
          {
            id: ++pressIdRef.current,
            rawTouches: raw,
            snappedDots: snapped,
            expectedDots: exp,
            missingDots: missing,
            pressDuration: duration,
            verdict,
          },
          ...prev,
        ].slice(0, 20),
      );
    },
    [],
  );

  // ── Raw handlers ─────────────────────────────────────────────────────────────
  const onRawStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    pressStartRef.current = Date.now();
    setPressActive(true);
    setFrozenTouches([]);
    const m = new Map<number, RawTouch>();
    Array.from(e.touches).forEach((t) => {
      const { x, y } = getCoords(t, rawRef);
      m.set(t.identifier, { id: t.identifier, x, y, phase: "active" });
    });
    setActiveTouches(m);
  }, []);

  const onRawMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const activeIds = new Set(Array.from(e.touches).map((t) => t.identifier));
    setActiveTouches((prev) => {
      const next = new Map(prev);
      // Mark disappeared touches as lost
      prev.forEach((touch, id) => {
        if (!activeIds.has(id)) next.set(id, { ...touch, phase: "lost" });
      });
      // Update active positions
      Array.from(e.touches).forEach((t) => {
        const { x, y } = getCoords(t, rawRef);
        next.set(t.identifier, { id: t.identifier, x, y, phase: "active" });
      });
      return next;
    });
  }, []);

  const onRawEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        setPressActive(false);
        const duration = Date.now() - pressStartRef.current;
        setActiveTouches((current) => {
          const touches = Array.from(current.values());
          setFrozenTouches(touches);
          const rawCount = touches.length;
          const snapped = snapCount(
            touches.map((t) => ({ x: t.x, y: t.y })),
            rawRef,
          );
          logPress(rawCount, snapped, duration, expectedDots);
          return current;
        });
      }
    },
    [expectedDots, logPress],
  );

  // ── Heatmap handlers ─────────────────────────────────────────────────────────
  const onHeatStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    pressStartRef.current = Date.now();
    const points = Array.from(e.touches).map((t) => getCoords(t, heatRef));
    currentHeatPoints.current = points;
    setHeatSessions((prev) => {
      if (prev.length >= TOTAL_HEAT) return prev;
      const next = [...prev, { pressNum: prev.length + 1, points }];
      setClusters(clusterSessions(next));
      return next;
    });
  }, []);

  const onHeatEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        const duration = Date.now() - pressStartRef.current;
        const points = currentHeatPoints.current;
        const snapped = snapCount(points, heatRef);
        logPress(points.length, snapped, duration, expectedDots);
      }
    },
    [expectedDots, logPress],
  );

  // ── Diff handlers ─────────────────────────────────────────────────────────────
  const onDiffExpClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = diffExpRef.current?.getBoundingClientRect();
    if (!rect) return;
    setExpectedPattern((prev) => [
      ...prev,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
    setDiffResult(null);
  }, []);

  const onDiffExpTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const rect = diffExpRef.current?.getBoundingClientRect();
    if (!rect) return;
    Array.from(e.changedTouches).forEach((t) => {
      setExpectedPattern((prev) => [
        ...prev,
        { x: t.clientX - rect.left, y: t.clientY - rect.top },
      ]);
    });
    setDiffResult(null);
  }, []);

  const onDiffActStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    pressStartRef.current = Date.now();
    const points = Array.from(e.touches).map((t) => getCoords(t, diffActRef));
    setActualDots(points);
    setDiffResult(null);
  }, []);

  const onDiffActMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setActualDots(Array.from(e.touches).map((t) => getCoords(t, diffActRef)));
  }, []);

  const onDiffActEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        const duration = Date.now() - pressStartRef.current;
        setActualDots((actual) => {
          if (expectedPattern.length > 0)
            setDiffResult(matchDiff(expectedPattern, actual));
          const snapped = snapCount(actual, diffActRef);
          logPress(actual.length, snapped, duration, expectedDots);
          return actual;
        });
      }
    },
    [expectedPattern, expectedDots, logPress],
  );

  // ── Shared rendering helpers ──────────────────────────────────────────────────
  const dotMarkers = (
    dots: {
      x: number;
      y: number;
      label?: string | number;
      fill: string;
      stroke: string;
    }[],
  ) =>
    dots.map((d, i) => (
      <g key={i}>
        <circle
          cx={d.x}
          cy={d.y}
          r={20}
          fill={d.fill}
          stroke={d.stroke}
          strokeWidth={2}
        />
        {d.label !== undefined && (
          <text
            x={d.x}
            y={d.y + 4}
            textAnchor="middle"
            fill="white"
            fontSize={11}
            fontFamily="monospace"
            fontWeight={700}
          >
            {d.label}
          </text>
        )}
      </g>
    ));

  const emptyHint = (lines: string[]) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: "rgba(255,255,255,0.12)",
        fontSize: 12,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 28 }}>⬡</div>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );

  // Derived display state
  const rawTouches = pressActive
    ? Array.from(activeTouches.values())
    : frozenTouches;
  const activeCount = rawTouches.filter((t) => t.phase === "active").length;
  const lostCount = rawTouches.filter((t) => t.phase === "lost").length;
  const heatTotal = Math.max(heatSessions.length, 1);
  const diffMatch = diffResult
    ? Math.round(
        (diffResult.matched / Math.max(expectedPattern.length, 1)) * 100,
      )
    : null;

  const clusterColor = (count: number, total: number) => {
    const r = count / total;
    return r >= 0.7 ? "#34d399" : r >= 0.4 ? "#fbbf24" : "#ef4444";
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: `1px solid ${active ? "rgba(232,121,249,0.5)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(232,121,249,0.12)" : "transparent",
    color: active ? "#e879f9" : "#64748b",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: 0.5,
  });

  const ghostBtn: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "#475569",
    fontFamily: "inherit",
    fontSize: 11,
    cursor: "pointer",
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      {/* ── LEFT: canvas area ── */}
      <div
        style={{
          flex: 1,
          padding: isMobile ? 14 : 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minWidth: 0,
          overflowY: "auto",
        }}
      >
        {/* Mode selector */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(["raw", "heatmap", "diff"] as DiagMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={btnStyle(mode === m)}
            >
              {m === "raw" ? "RAW TOUCH" : m === "heatmap" ? "HEATMAP" : "DIFF"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {mode === "heatmap" && (
            <button
              onClick={() => {
                setHeatSessions([]);
                setClusters([]);
              }}
              style={ghostBtn}
            >
              Reset
            </button>
          )}
          {mode === "diff" && (
            <>
              <button
                onClick={() => {
                  setExpectedPattern([]);
                  setDiffResult(null);
                }}
                style={ghostBtn}
              >
                Clear expected
              </button>
              <button
                onClick={() => {
                  setActualDots([]);
                  setDiffResult(null);
                }}
                style={ghostBtn}
              >
                Clear actual
              </button>
            </>
          )}
        </div>

        {/* ── Mode 1: Raw Touch ── */}
        {mode === "raw" && (
          <>
            <Pad
              innerRef={rawRef}
              onTouchStart={onRawStart}
              onTouchMove={onRawMove}
              onTouchEnd={onRawEnd}
            >
              <svg
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                {dotMarkers(
                  rawTouches.map((t) => ({
                    x: t.x,
                    y: t.y,
                    label: t.id,
                    fill:
                      t.phase === "active"
                        ? "rgba(52,211,153,0.25)"
                        : "rgba(239,68,68,0.25)",
                    stroke: t.phase === "active" ? "#34d399" : "#ef4444",
                  })),
                )}
              </svg>
              {rawTouches.length === 0 &&
                emptyHint([
                  "Press your stamp here",
                  "raw coordinates — no snapping",
                ])}
            </Pad>

            {/* Live counter */}
            <div
              style={{
                display: "flex",
                gap: 20,
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#34d399" }}>
                Detected: <strong>{activeCount}</strong>
              </span>
              <span style={{ color: "#64748b" }}>
                Expected: <strong>{expectedDots}</strong>
              </span>
              {lostCount > 0 && (
                <span style={{ color: "#ef4444" }}>
                  Lost mid-press: <strong>{lostCount}</strong>
                </span>
              )}
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 16,
                fontSize: 11,
                color: "#475569",
              }}
            >
              {[
                { stroke: "#34d399", label: "Active" },
                { stroke: "#ef4444", label: "Lost mid-press" },
              ].map(({ stroke, label }) => (
                <span
                  key={label}
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: `2px solid ${stroke}`,
                      display: "inline-block",
                    }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}

        {/* ── Mode 2: Heatmap ── */}
        {mode === "heatmap" && (
          <>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Presses:{" "}
              <strong
                style={{
                  color:
                    heatSessions.length >= TOTAL_HEAT ? "#34d399" : "#f1f5f9",
                }}
              >
                {heatSessions.length}/{TOTAL_HEAT}
              </strong>
              {heatSessions.length < TOTAL_HEAT && (
                <span style={{ marginLeft: 8 }}>
                  — {TOTAL_HEAT - heatSessions.length} more to complete heatmap
                </span>
              )}
            </div>

            <Pad
              innerRef={heatRef}
              onTouchStart={onHeatStart}
              onTouchEnd={onHeatEnd}
            >
              <svg
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                {/* Historical dot scatter */}
                {heatSessions.flatMap((s) => {
                  return s.points.map((p, i) => (
                    <circle
                      key={`${s.pressNum}-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill="rgba(148,163,184,0.12)"
                    />
                  ));
                })}
                {/* Cluster overlays */}
                {clusters.map((c, i) => {
                  const color = clusterColor(c.count, heatTotal);
                  const pct = Math.round((c.count / heatTotal) * 100);
                  return (
                    <g key={i}>
                      <circle
                        cx={c.cx}
                        cy={c.cy}
                        r={24}
                        fill={`${color}1a`}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={
                          heatSessions.length < TOTAL_HEAT ? "4 3" : undefined
                        }
                      />
                      <text
                        x={c.cx}
                        y={c.cy - 4}
                        textAnchor="middle"
                        fill={color}
                        fontSize={10}
                        fontWeight={700}
                        fontFamily="monospace"
                      >
                        {pct}%
                      </text>
                      <text
                        x={c.cx}
                        y={c.cy + 9}
                        textAnchor="middle"
                        fill={color}
                        fontSize={9}
                        fontFamily="monospace"
                      >
                        {c.count}/{heatSessions.length}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {heatSessions.length === 0 &&
                emptyHint([
                  `Stamp ${TOTAL_HEAT} times`,
                  "to build reliability heatmap",
                ])}
            </Pad>

            {/* Reliability bars */}
            {clusters.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#475569",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  Dot Reliability
                </div>
                {clusters.map((c, i) => {
                  const pct = Math.round((c.count / heatTotal) * 100);
                  const color = clusterColor(c.count, heatTotal);
                  return (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          width: 42,
                          flexShrink: 0,
                        }}
                      >
                        Dot {i + 1}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 3,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: color,
                            borderRadius: 3,
                            transition: "width 0.4s",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color,
                          width: 36,
                          textAlign: "right",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {pct}%
                      </span>
                      {pct < 70 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#ef4444",
                            flexShrink: 0,
                          }}
                        >
                          PROBLEM
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Mode 3: Diff ── */}
        {mode === "diff" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Expected */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#475569",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Expected — tap to place
                </div>
                <Pad
                  innerRef={diffExpRef}
                  onClick={onDiffExpClick}
                  onTouchStart={onDiffExpTouch}
                >
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                      pointerEvents: "none",
                    }}
                  >
                    {dotMarkers(
                      expectedPattern.map((p, i) => ({
                        x: p.x,
                        y: p.y,
                        label: i + 1,
                        fill: "rgba(59,130,246,0.25)",
                        stroke: "#3b82f6",
                      })),
                    )}
                  </svg>
                  {expectedPattern.length === 0 &&
                    emptyHint(["Tap to place", "expected dots"])}
                </Pad>
                <div style={{ fontSize: 12, color: "#3b82f6" }}>
                  {expectedPattern.length} dot
                  {expectedPattern.length !== 1 ? "s" : ""} placed
                </div>
              </div>

              {/* Actual */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#475569",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Actual — stamp here
                </div>
                <Pad
                  innerRef={diffActRef}
                  onTouchStart={onDiffActStart}
                  onTouchMove={onDiffActMove}
                  onTouchEnd={onDiffActEnd}
                >
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      overflow: "visible",
                      pointerEvents: "none",
                    }}
                  >
                    {dotMarkers(
                      actualDots.map((p, i) => ({
                        x: p.x,
                        y: p.y,
                        label: i + 1,
                        fill: "rgba(232,121,249,0.25)",
                        stroke: "#e879f9",
                      })),
                    )}
                  </svg>
                  {actualDots.length === 0 && emptyHint(["Press your stamp"])}
                </Pad>
                <div style={{ fontSize: 12, color: "#e879f9" }}>
                  {actualDots.length} dot{actualDots.length !== 1 ? "s" : ""}{" "}
                  detected
                </div>
              </div>
            </div>

            {/* Diff result */}
            {diffResult && (
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  gap: 20,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color:
                      diffMatch! >= 80
                        ? "#34d399"
                        : diffMatch! >= 50
                          ? "#fbbf24"
                          : "#ef4444",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {diffMatch}%
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#34d399" }}>
                    Matched: {diffResult.matched}
                  </span>
                  <span style={{ color: "#ef4444" }}>
                    Missing: {diffResult.missing}
                  </span>
                  {diffResult.extra > 0 && (
                    <span style={{ color: "#fbbf24" }}>
                      Extra: {diffResult.extra}
                    </span>
                  )}
                </div>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}
                >
                  {diffResult.missing === 0
                    ? "Perfect match"
                    : diffResult.missing === 1
                      ? "1 dot dropping out"
                      : `${diffResult.missing} dots missing — hardware problem`}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: controls + press log ── */}
      <div
        style={{
          width: isMobile ? "100%" : 290,
          borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
          borderTop: isMobile ? "1px solid rgba(255,255,255,0.07)" : "none",
          background: "rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Expected dots config */}
        <div
          style={{
            padding: "14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b" }}>Expected dots:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={expectedDots}
            onChange={(e) =>
              setExpectedDots(Math.max(1, parseInt(e.target.value) || 1))
            }
            style={{
              width: 50,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "4px 8px",
              color: "#f1f5f9",
              fontFamily: "inherit",
              fontSize: 13,
              textAlign: "center",
              outline: "none",
            }}
          />
        </div>

        {/* Root cause guide */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#475569",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Root Cause Guide
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              fontSize: 11,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            <div>
              <span style={{ color: "#ef4444" }}>Raw = 0</span> → Material not
              conductive
            </div>
            <div>
              <span style={{ color: "#fbbf24" }}>Raw &lt; Expected</span> →
              Screen sensitivity / dot size too small
            </div>
            <div>
              <span style={{ color: "#3b82f6" }}>Raw ok, Snapped &lt; Raw</span>{" "}
              → Grid merging nearby dots
            </div>
          </div>
        </div>

        {/* Press log */}
        <div
          style={{
            fontSize: 11,
            color: "#475569",
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "10px 14px 4px",
          }}
        >
          Press Log ({pressLog.length})
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {pressLog.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                fontSize: 12,
                color: "#334155",
                textAlign: "center",
              }}
            >
              No presses yet
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              >
                <thead>
                  <tr
                    style={{
                      color: "#475569",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {["#", "Raw", "Snap", "Miss", "ms", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "4px 6px",
                          textAlign: h === "#" ? "left" : "center",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pressLog.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <td style={{ padding: "5px 6px", color: "#475569" }}>
                        {p.id}
                      </td>
                      <td
                        style={{
                          padding: "5px 6px",
                          textAlign: "center",
                          color:
                            p.rawTouches < p.expectedDots
                              ? "#ef4444"
                              : "#f1f5f9",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p.rawTouches}
                      </td>
                      <td
                        style={{
                          padding: "5px 6px",
                          textAlign: "center",
                          color:
                            p.snappedDots < p.rawTouches
                              ? "#fbbf24"
                              : "#f1f5f9",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p.snappedDots}
                      </td>
                      <td
                        style={{
                          padding: "5px 6px",
                          textAlign: "center",
                          color: p.missingDots > 0 ? "#ef4444" : "#475569",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p.missingDots}
                      </td>
                      <td
                        style={{
                          padding: "5px 6px",
                          textAlign: "center",
                          color: "#64748b",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p.pressDuration}
                      </td>
                      <td style={{ padding: "5px 6px", textAlign: "center" }}>
                        <span
                          style={{
                            color:
                              p.verdict === "perfect"
                                ? "#34d399"
                                : p.verdict === "partial"
                                  ? "#fbbf24"
                                  : "#ef4444",
                          }}
                        >
                          {p.verdict === "perfect"
                            ? "✓"
                            : p.verdict === "partial"
                              ? "△"
                              : "✗"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pressLog.length > 0 && (
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <button
              onClick={() => setPressLog([])}
              style={{ ...ghostBtn, width: "100%", padding: "6px 0" }}
            >
              Clear log
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
