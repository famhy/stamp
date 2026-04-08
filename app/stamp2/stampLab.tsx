"use client";
import { useState, useRef, useEffect } from "react";
import StampDiagnostic from "@/components/StampDiagnostic";
import StampReader, {
  type MatchResult,
  type HeatCluster,
  type SavedShape,
  type Point,
} from "@/components/StampReader";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScoreEntry {
  id: number;
  name: string;
  score: number;
  points: Point[];
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

// ── Shape card ────────────────────────────────────────────────────────────────
function ShapeCard({
  shape,
  onDelete,
  onLoad,
}: {
  shape: SavedShape;
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
  const clearRef = useRef<(() => void) | null>(null);

  const [savedShapes, setSavedShapes] = useState<SavedShape[]>([
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
  const [latestPointMap, setLatestPointMap] = useState<Point[]>([]);
  const [latestClusters, setLatestClusters] = useState<HeatCluster[]>([]);
  const [shapeName, setShapeName] = useState("");
  const [activeTab, setActiveTab] = useState("saved");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── Callbacks from StampReader ────────────────────────────────────────────────
  const handleResult = (results: MatchResult[]) => {
    setScores(
      results.map((r) => ({
        id: r.shape.id,
        name: r.shape.name,
        score: r.score,
        points: r.shape.points,
      })),
    );
    alert(JSON.stringify(results));
    console.log("results", results);

    if (results[0]) setLatestPointMap(results[0].pointMap);
  };

  const handleClustersChange = (clusters: HeatCluster[]) => {
    setLatestClusters(clusters);
  };

  // ── Actions ───────────────────────────────────────────────────────────────────
  const saveShape = () => {
    if (latestClusters.length < 2) return;
    const name = shapeName.trim() || `Shape ${savedShapes.length + 1}`;
    setSavedShapes((prev) => [
      ...prev,
      {
        id: Date.now(),
        name,
        points: latestClusters.map((c) => ({ x: c.cx, y: c.cy })),
      },
    ]);
    setShapeName("");
    setActiveTab("saved");
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
          flexDirection: "column",
        }}
      >
        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(0,0,0,0.2)",
            flexShrink: 0,
          }}
        >
          {(["saved", "algo", "diag"] as const).map((t) => (
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
              {t === "saved"
                ? "SAVED SHAPES"
                : t === "algo"
                  ? "ALGORITHM"
                  : "DIAGNOSTIC"}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {activeTab === "diag" ? (
          <StampDiagnostic />
        ) : (
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
                padding: isMobile ? 10 : 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
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
                  {latestClusters.length} dot
                  {latestClusters.length !== 1 ? "s" : ""}
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
                  disabled={latestClusters.length < 2}
                  style={{
                    padding: "7px 16px",
                    background:
                      latestClusters.length >= 2
                        ? "linear-gradient(135deg,#a855f7,#ec4899)"
                        : "rgba(255,255,255,0.05)",
                    border: "none",
                    borderRadius: 8,
                    color: latestClusters.length >= 2 ? "#fff" : "#475569",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      latestClusters.length >= 2 ? "pointer" : "not-allowed",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    clearRef.current?.();
                    setScores([]);
                    setLatestPointMap([]);
                    setLatestClusters([]);
                  }}
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
              </div>

              {/* ── StampReader ── */}
              <StampReader
                shapes={savedShapes}
                onResult={handleResult}
                onClustersChange={handleClustersChange}
                onClearRef={clearRef}
              />

              {/* scores */}
              {scores.length > 0 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
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
                borderLeft: isMobile
                  ? "none"
                  : "1px solid rgba(255,255,255,0.07)",
                borderTop: isMobile
                  ? "1px solid rgba(255,255,255,0.07)"
                  : "none",
                background: "rgba(0,0,0,0.25)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                {activeTab === "saved" ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
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
                          onLoad={() => {
                            clearRef.current?.();
                            setScores([]);
                            setLatestPointMap([]);
                            setLatestClusters([]);
                          }}
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
        )}
      </div>
    </div>
  );
}
