import React from "react";
import { Composition } from "remotion";
import { FullVideo, FullVideoProps } from "./compositions/FullVideo";
import { IntroSequence } from "./compositions/IntroSequence";
import { EventSequence, EventSequenceProps } from "./compositions/EventSequence";
import eventsData from "../../data/timeline-events.json";
import transcriptData from "../../data/sample-transcript.json";

const FPS = 24;
const WIDTH = 3840;
const HEIGHT = 2160;

const totalDuration = Math.ceil(transcriptData.duration * FPS) + FPS * 3;

const fullVideoProps: FullVideoProps = {
  events: eventsData as any,
  transcript: transcriptData as any,
  fps: FPS,
};

const eventSequenceProps: EventSequenceProps = {
  event: eventsData[0] as any,
  fps: FPS,
};

export const RemotionRoot: React.FC = () => (
  <>
    {/* Main composition — full narrated video with word-sync animations */}
    <Composition
      id="TimelineVideo"
      component={FullVideo}
      durationInFrames={totalDuration}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={fullVideoProps}
    />

    {/* Isolated intro for standalone renders */}
    <Composition
      id="IntroSequence"
      component={IntroSequence}
      durationInFrames={FPS * 8}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{}}
    />

    {/* Single event card — useful for testing one card at a time */}
    <Composition
      id="EventCard"
      component={EventSequence}
      durationInFrames={FPS * 6}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={eventSequenceProps}
    />
  </>
);
