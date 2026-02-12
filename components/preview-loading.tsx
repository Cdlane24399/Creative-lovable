"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface PreviewLoadingProps {
  isTimeout: boolean;
  isExternalLoading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Wireframe blocks — positions as % of the container.               */
/*  They form a recognisable SaaS landing page layout.                */
/* ------------------------------------------------------------------ */
const BLOCKS: ReadonlyArray<{
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
  accent?: boolean;
}> = [
  { id: "nav", x: 8, y: 5, w: 84, h: 6, delay: 0, accent: true },
  { id: "hero-h", x: 22, y: 17, w: 56, h: 3.5, delay: 0.08 },
  { id: "hero-p", x: 30, y: 23, w: 40, h: 2, delay: 0.14 },
  { id: "hero-btn", x: 38, y: 29, w: 24, h: 5, delay: 0.22, accent: true },
  { id: "card-a", x: 8, y: 40, w: 25, h: 18, delay: 0.3 },
  { id: "card-b", x: 37.5, y: 40, w: 25, h: 18, delay: 0.38 },
  { id: "card-c", x: 67, y: 40, w: 25, h: 18, delay: 0.46 },
  { id: "txt-1", x: 8, y: 64, w: 52, h: 2, delay: 0.54 },
  { id: "txt-2", x: 8, y: 69, w: 40, h: 2, delay: 0.6 },
  { id: "aside", x: 67, y: 64, w: 25, h: 12, delay: 0.66 },
  { id: "footer", x: 8, y: 84, w: 84, h: 6, delay: 0.74 },
];

/* Ambient code tokens that float upward behind the wireframe */
const TOKEN_LIST = [
  "import",
  "export",
  "const",
  "return",
  "<div>",
  "useState",
  "async",
  "=>",
  "className",
  "flex",
  "grid",
  "props",
  "fetch",
  "map()",
  "</>",
  "onClick",
  "effect",
  "style",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function PreviewLoading({
  isTimeout,
  isExternalLoading,
}: PreviewLoadingProps) {
  const shouldReduceMotion = useReducedMotion();

  /* Deterministic particle positions (no Math.random) */
  const particles = useMemo(
    () =>
      TOKEN_LIST.map((token, i) => ({
        token,
        left: ((i * 41 + 7) % 86) + 7,
        delay: (i * 1.4) % 9,
        duration: 16 + ((i * 3) % 10),
        size: 9 + (i % 3),
      })),
    [],
  );

  const accentRgb = isTimeout ? "245,158,11" : "16,185,129";

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111111] overflow-hidden">
      {/* ---- Background layers ---- */}

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 42%, rgba(${accentRgb},0.07), transparent)`,
        }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.03,
          backgroundImage:
            "radial-gradient(circle, #fff 0.7px, transparent 0.7px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Floating code particles (CSS-driven for perf) */}
      {!shouldReduceMotion && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          {particles.map((p, i) => (
            <span
              key={i}
              className="absolute font-mono preview-loading-float"
              style={{
                left: `${p.left}%`,
                bottom: "-20px",
                fontSize: p.size,
                color: `rgba(${accentRgb}, 0.12)`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            >
              {p.token}
            </span>
          ))}
        </div>
      )}

      {/* ---- Main content ---- */}
      <div className="flex flex-col items-center gap-7">
        {/* Wireframe container */}
        <div className="relative w-80 h-56 rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden shadow-2xl shadow-black/50">
          {/* Top-left sheen */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(168deg, rgba(${accentRgb},0.04), transparent 40%)`,
            }}
          />

          {/* Wireframe blocks */}
          {BLOCKS.map((b) => {
            const pos: React.CSSProperties = {
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
            };

            const fill: React.CSSProperties = {
              backgroundColor: b.accent
                ? `rgba(${accentRgb},0.2)`
                : "rgba(113,113,122,0.18)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: b.accent
                ? `rgba(${accentRgb},0.25)`
                : "rgba(113,113,122,0.12)",
            };

            /* Reduced-motion: blocks visible immediately, no animation */
            if (shouldReduceMotion) {
              return (
                <div key={b.id} className="absolute" style={pos}>
                  <div
                    className="w-full h-full rounded-[3px]"
                    style={fill}
                  />
                </div>
              );
            }

            return (
              <motion.div
                key={b.id}
                className="absolute"
                style={{ ...pos, originX: 0 }}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{
                  duration: 0.45,
                  delay: b.delay,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div
                  className="w-full h-full rounded-[3px] preview-loading-breathe"
                  style={{
                    ...fill,
                    animationDelay: `${b.delay + 0.8}s`,
                  }}
                />
              </motion.div>
            );
          })}

          {/* Horizontal sweep line */}
          {!shouldReduceMotion && (
            <motion.div
              className="absolute left-0 right-0 h-px pointer-events-none"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(${accentRgb},0.22), transparent)`,
              }}
              animate={{ top: ["0%", "100%"] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          )}
        </div>

        {/* Status indicator */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            {/* Ping dot */}
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                style={{ backgroundColor: `rgb(${accentRgb})` }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: `rgb(${accentRgb})` }}
              />
            </span>

            <span
              className="text-[13px] font-medium tracking-wide"
              style={{
                color: isTimeout
                  ? "rgb(252,211,77)" /* amber-300 */
                  : "rgb(212,212,216)" /* zinc-300 */,
              }}
            >
              {isTimeout
                ? "Still building — hang tight..."
                : isExternalLoading
                  ? "Assembling your app..."
                  : "Preparing preview..."}
            </span>
          </div>

          {isTimeout && (
            <motion.span
              className="text-xs text-zinc-500"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              The dev server may still be starting up
            </motion.span>
          )}
        </div>
      </div>
    </div>
  );
}
