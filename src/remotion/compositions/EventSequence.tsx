import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TimelineEvent } from "./FullVideo";

export type EventSequenceProps = {
  event: TimelineEvent;
  fps: number;
};

export const EventSequence: React.FC<EventSequenceProps> = ({ event, fps }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cardOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cardY = spring({ frame, fps, from: 80, to: 0, durationInFrames: fps * 0.7 });
  const cardScale = spring({ frame, fps, from: 0.92, to: 1, durationInFrames: fps * 0.6 });

  const glowOpacity = interpolate(frame, [0, fps * 0.4, fps * 2, fps * 3], [0, 0.6, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dotScale = spring({ frame, fps, from: 0, to: 1, durationInFrames: fps * 0.5, delay: fps * 0.2 });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-start",
        padding: "0 200px 280px",
        pointerEvents: "none",
      }}
    >
      {/* Glow halo behind card */}
      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 140,
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${event.dotColor}33 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(40px)",
        }}
      />

      {/* Era dot indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 420,
          left: 155,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `3px solid ${event.dotColor}`,
          background: "#0d1117",
          boxShadow: `0 0 20px ${event.dotColor}`,
          transform: `scale(${dotScale})`,
        }}
      />

      {/* The card */}
      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${event.dotColor}44`,
          borderRadius: 32,
          padding: "56px 64px",
          maxWidth: 860,
          backdropFilter: "blur(20px)",
          boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${event.dotColor}33`,
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: 120, marginBottom: 24, lineHeight: 1 }}>
          {event.icon}
        </div>

        {/* Era label */}
        <div
          style={{
            fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: event.dotColor,
            marginBottom: 16,
          }}
        >
          {event.era}
        </div>

        {/* Time */}
        <div
          style={{
            fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 90,
            fontWeight: 800,
            color: "#f8fafc",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          {event.time}
        </div>

        {/* Name */}
        <div
          style={{
            fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 56,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 24,
          }}
        >
          {event.name}
        </div>

        {/* Description */}
        <div
          style={{
            fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 38,
            color: "#94a3b8",
            lineHeight: 1.7,
            maxWidth: 700,
          }}
        >
          {event.desc}
        </div>
      </div>
    </AbsoluteFill>
  );
};
