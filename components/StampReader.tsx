"use client";
import { useState, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Point {
  x: number;
  y: number;
}

export interface HeatCluster {
  cx: number;
  cy: number;
  count: number;
  points: Point[];
}

export interface SavedShape {
  id: number;
  name: string;
  points: Point[];
}

export interface MatchResult {
  shape: SavedShape;
  /** 0–100 similarity score */
  score: number;
  /** cluster centers from the current press */
  pointMap: Point[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 10;
const CLUSTER_R = 40;
const DEV = process.env.NODE_ENV !== "production";
// const DEV = false;
// ── Geometry helpers ──────────────────────────────────────────────────────────
function getPadCoords(
  t: { clientX: number; clientY: number },
  ref: { current: HTMLDivElement | null },
): Point {
  const rect = ref.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

function clusterSessions(
  sessions: { pressNum: number; points: Point[] }[],
): HeatCluster[] {
  const clusters: HeatCluster[] = [];
  sessions.forEach(({ points }) => {
    points.forEach((pt) => {
      let bestIdx = -1,
        bestDist = CLUSTER_R;
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
  clusters.forEach((c) => {
    c.count = sessions.filter((s) =>
      s.points.some(
        (p) => Math.hypot(c.cx - p.x, c.cy - p.y) < CLUSTER_R * 1.5,
      ),
    ).length;
  });
  return clusters;
}

// ── Comparison algorithm ───────────────────────────────────────────────────────
function normalize(pts: Point[]): Point[] {
  if (!pts.length) return [];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const centered = pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const maxD = Math.max(...centered.map((p) => Math.hypot(p.x, p.y))) || 1;
  return centered.map((p) => ({ x: p.x / maxD, y: p.y / maxD }));
}

function hausdorff(a: Point[], b: Point[]): number {
  const minDist = (p: Point, set: Point[]) =>
    Math.min(...set.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  const ab = a.reduce((s, p) => s + minDist(p, b), 0) / a.length;
  const ba = b.reduce((s, p) => s + minDist(p, a), 0) / b.length;
  return Math.max(ab, ba);
}

export function compareShapes(ptsA: Point[], ptsB: Point[]): number {
  if (!ptsA.length || !ptsB.length) return 0;
  const na = normalize(ptsA);
  const nb = normalize(ptsB);
  const mirX = (pts: Point[]) => pts.map((p) => ({ x: -p.x, y: p.y }));
  const mirY = (pts: Point[]) => pts.map((p) => ({ x: p.x, y: -p.y }));
  const variants = [nb, mirX(nb), mirY(nb), mirX(mirY(nb))];
  const THRESH = 0.52;
  const best = Math.min(...variants.map((v) => hausdorff(na, v)));
  const countRatio =
    Math.min(ptsA.length, ptsB.length) / Math.max(ptsA.length, ptsB.length);
  const shape = Math.max(0, 1 - best / THRESH);
  return Math.round(shape * countRatio * 100);
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface StampReaderProps {
  /** Shapes to compare against */
  shapes: SavedShape[];
  /**
   * Called after every stamp lift.
   * `results` is sorted best-first; each entry has `.score` (0–100)
   * and `.pointMap` (cluster centres used for comparison).
   */
  onResult?: (results: MatchResult[]) => void;
  /** Called whenever the cluster map changes (live, on every touch) */
  onClustersChange?: (clusters: HeatCluster[]) => void;
  /** Reset the pad to empty */
  onClearRef?: React.MutableRefObject<(() => void) | null>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StampReader({
  shapes,
  onResult,
  onClustersChange,
  onClearRef,
}: StampReaderProps) {
  const padRef = useRef<HTMLDivElement>(null);

  const [sessions, setSessions] = useState<
    { pressNum: number; points: Point[] }[]
  >([]);
  const [clusters, setClusters] = useState<HeatCluster[]>([]);
  const [flash, setFlash] = useState(false);

  const sessionCount = sessions.length;

  // Expose a clear handle to the parent if requested
  const clearPad = useCallback(() => {
    setSessions([]);
    setClusters([]);
    onClustersChange?.([]);
  }, [onClustersChange]);

  if (onClearRef) onClearRef.current = clearPad;

  // ── Compare and emit ────────────────────────────────────────────────────────
  const triggerCompare = useCallback(
    (currentClusters: HeatCluster[]) => {
      if (currentClusters.length < 1 || !shapes.length) return;
      const pointMap = currentClusters.map((c) => ({ x: c.cx, y: c.cy }));
      const results: MatchResult[] = shapes
        .map((s) => ({
          shape: s,
          score: compareShapes(pointMap, s.points),
          pointMap,
        }))
        .sort((a, b) => b.score - a.score);
      onResult?.(results);
      setFlash(true);
      setTimeout(() => setFlash(false), 500);
    },
    [shapes, onResult],
  );

  // ── Touch handlers ───────────────────────────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const points = Array.from(e.touches).map((t) => getPadCoords(t, padRef));
      setSessions((prev) => {
        const next = [...prev, { pressNum: prev.length + 1, points }];
        const newClusters = clusterSessions(next);
        setClusters(newClusters);
        onClustersChange?.(newClusters);
        return next;
      });
    },
    [onClustersChange],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        setClusters((current) => {
          triggerCompare(current);
          return current;
        });
      }
    },
    [triggerCompare],
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={padRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1",
        background: "#0d1120",
        borderRadius: 14,
        border: `1.5px solid ${flash ? "rgba(232,121,249,0.6)" : "rgba(255,255,255,0.08)"}`,
        touchAction: "none",
        overflow: "hidden",
        cursor: "crosshair",
        userSelect: "none",
        transition: "border-color 0.3s, box-shadow 0.3s",
        boxShadow: flash
          ? "0 0 40px rgba(232,121,249,0.2)"
          : "0 0 40px rgba(0,0,0,0.4)",
      }}
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
        {/* Grid lines */}
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

        {/* Historical scatter — dev only */}
        {DEV &&
          sessions.flatMap((s) =>
            s.points.map((p, i) => (
              <circle
                key={`${s.pressNum}-${i}`}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="rgba(232,121,249,0.1)"
              />
            )),
          )}

        {/* Cluster overlays — dev only */}
        {DEV &&
          clusters.map((c, i) => {
            const pct = Math.round((c.count / Math.max(sessionCount, 1)) * 100);
            const color =
              sessionCount <= 1
                ? "#e879f9"
                : pct >= 70
                  ? "#34d399"
                  : pct >= 40
                    ? "#fbbf24"
                    : "#ef4444";
            return (
              <g key={i}>
                <circle cx={c.cx} cy={c.cy} r={28} fill={`${color}12`} />
                <circle
                  cx={c.cx}
                  cy={c.cy}
                  r={18}
                  fill={`${color}20`}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={
                    sessionCount > 1 && pct < 100 ? "4 3" : undefined
                  }
                />
                {/* center dot = actual comparison point */}
                <circle cx={c.cx} cy={c.cy} r={6} fill={color} />
                <circle
                  cx={c.cx - 2}
                  cy={c.cy - 2}
                  r={2}
                  fill="rgba(255,255,255,0.4)"
                />
                {sessionCount > 1 && (
                  <text
                    x={c.cx}
                    y={c.cy - 26}
                    textAnchor="middle"
                    fill={color}
                    fontSize={9}
                    fontFamily="monospace"
                    fontWeight={700}
                  >
                    {pct}%
                  </text>
                )}
              </g>
            );
          })}

        {/* Press counter badge — dev only */}
        {DEV && sessionCount > 0 && (
          <text
            x="99%"
            y="99%"
            textAnchor="end"
            dominantBaseline="auto"
            fill="rgba(255,255,255,0.18)"
            fontSize={10}
            fontFamily="monospace"
          >
            {clusters.length}dot · {sessionCount}press
          </text>
        )}
      </svg>

      {clusters.length === 0 && (
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
            raw coordinates — no grid snapping
          </div>
        </div>
      )}
    </div>
  );
}
