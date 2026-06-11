import React, { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { WhisperWord } from "../compositions/FullVideo";

type Props = {
  words: WhisperWord[];
  fps: number;
  offsetSeconds?: number;
  style?: CSSProperties;
};

export const WordHighlight: React.FC<Props> = ({
  words,
  fps,
  offsetSeconds = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const currentTime = frame / fps + offsetSeconds;

  // Show only the last 20 words around the current position for readability
  const windowStart = Math.max(0, currentTime - 4);
  const windowEnd = currentTime + 8;
  const visibleWords = words.filter((w) => w.start >= windowStart && w.start <= windowEnd);

  if (visibleWords.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0 16px",
        alignItems: "baseline",
        justifyContent: "center",
        padding: "32px 48px",
        background: "rgba(0,0,0,0.55)",
        borderRadius: 24,
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        ...style,
      }}
    >
      {visibleWords.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        const isPast = currentTime > w.end;

        return (
          <span
            key={`${w.word}-${i}`}
            style={{
              fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
              fontSize: isActive ? 60 : 52,
              fontWeight: isActive ? 800 : 400,
              color: isActive
                ? "#64b4ff"
                : isPast
                ? "rgba(255,255,255,0.5)"
                : "rgba(255,255,255,0.25)",
              textShadow: isActive ? "0 0 30px #64b4ff88" : "none",
              transition: "all 0.08s ease",
              lineHeight: 1.5,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
