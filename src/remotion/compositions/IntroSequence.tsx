import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const IntroSequence: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = spring({ frame, fps, from: 60, to: 0, durationInFrames: fps });

  const subtitleOpacity = interpolate(frame, [fps * 0.8, fps * 1.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineWidth = interpolate(frame, [fps * 1.4, fps * 2.8], [0, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const badgeOpacity = interpolate(frame, [fps * 2.2, fps * 3.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0d1117 0%, #1a1a2e 40%, #16213e 100%)",
      }}
    >
      {/* Radial glow behind title */}
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(100,180,255,0.12) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -65%)",
        }}
      />

      {/* Main title */}
      <h1
        style={{
          fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
          fontSize: 220,
          fontWeight: 800,
          background: "linear-gradient(90deg, #64b4ff, #a78bfa, #f472b6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "0.04em",
          margin: 0,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        人类进化时间轴
      </h1>

      {/* Accent line */}
      <div
        style={{
          marginTop: 40,
          height: 3,
          width: lineWidth,
          background: "linear-gradient(90deg, #64b4ff, #a78bfa, #f472b6)",
          borderRadius: 2,
        }}
      />

      {/* Subtitle */}
      <p
        style={{
          fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
          fontSize: 72,
          color: "#94a3b8",
          marginTop: 36,
          opacity: subtitleOpacity,
          letterSpacing: "0.05em",
        }}
      >
        从灵长类起源到人类文明 · 跨越 6500 万年
      </p>

      {/* Production badge */}
      <div
        style={{
          marginTop: 60,
          padding: "16px 48px",
          borderRadius: 999,
          border: "1.5px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.05)",
          opacity: badgeOpacity,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span style={{ fontSize: 44, color: "#64b4ff", fontFamily: "monospace", letterSpacing: "0.08em" }}>
          AI VIDEO PIPELINE
        </span>
        <span style={{ width: 2, height: 32, background: "rgba(255,255,255,0.2)" }} />
        <span style={{ fontSize: 44, color: "#94a3b8", fontFamily: "monospace" }}>
          CLAUDE CODE × REMOTION × FFMPEG
        </span>
      </div>
    </AbsoluteFill>
  );
};
