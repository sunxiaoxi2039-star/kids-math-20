import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { IntroSequence } from "./IntroSequence";
import { EventSequence } from "./EventSequence";
import { WordHighlight } from "../components/WordHighlight";

export type TimelineEvent = {
  id: number;
  category: string;
  dotColor: string;
  era: string;
  time: string;
  timeYears: number;
  name: string;
  icon: string;
  desc: string;
  triggerWords: string[];
};

export type WhisperWord = {
  word: string;
  start: number;
  end: number;
};

export type WhisperSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WhisperWord[];
};

export type WhisperTranscript = {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
};

export type FullVideoProps = {
  events: TimelineEvent[];
  transcript: WhisperTranscript;
  fps: number;
};

// Find the first frame where any trigger word is spoken
function findTriggerFrame(
  triggerWords: string[],
  allWords: WhisperWord[],
  fps: number
): number | null {
  for (const word of allWords) {
    for (const trigger of triggerWords) {
      if (word.word.includes(trigger)) {
        return Math.floor(word.start * fps);
      }
    }
  }
  return null;
}

const BACKGROUND = "linear-gradient(135deg, #0d1117 0%, #1a1a2e 40%, #16213e 100%)";
const INTRO_FRAMES = 24 * 5; // 5 second intro

export const FullVideo: React.FC<FullVideoProps> = ({ events, transcript, fps }) => {
  const allWords = transcript.segments.flatMap((s) => s.words);

  // Pre-compute trigger frames for every event
  const eventSchedule = events.map((event) => {
    const triggerFrame = findTriggerFrame(event.triggerWords, allWords, fps);
    return { event, triggerFrame };
  });

  return (
    <AbsoluteFill style={{ background: BACKGROUND }}>
      {/* Opening title sequence */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroSequence />
      </Sequence>

      {/* Word-sync subtitle strip — runs for the entire narration */}
      <Sequence from={INTRO_FRAMES}>
        <WordHighlight
          words={allWords}
          fps={fps}
          offsetSeconds={0}
          style={{
            position: "absolute",
            bottom: 120,
            left: "50%",
            transform: "translateX(-50%)",
            width: "80%",
            maxWidth: 2800,
          }}
        />
      </Sequence>

      {/* Event cards — each appears at its trigger word timestamp */}
      {eventSchedule.map(({ event, triggerFrame }) => {
        if (triggerFrame === null) return null;
        const from = INTRO_FRAMES + triggerFrame;
        return (
          <Sequence key={event.id} from={from} durationInFrames={fps * 4}>
            <EventSequence event={event} fps={fps} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
