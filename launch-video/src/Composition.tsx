import { Series, Audio, staticFile, useCurrentFrame, interpolate } from "remotion";
import React from "react";
import { Scene01_Hero } from "./scenes/Scene01_Hero";
import { Scene02_Problem } from "./scenes/Scene02_Problem";
import { Scene03_Onboarding } from "./scenes/Scene03_Onboarding";
import { Scene03C_CustomEndpoint } from "./scenes/Scene03C_CustomEndpoint";
import { Scene03B_SpaceCustomizer } from "./scenes/Scene03B_SpaceCustomizer";
import { Scene04_Dashboard } from "./scenes/Scene04_Dashboard";
import { Scene05_KnowledgeBase } from "./scenes/Scene05_KnowledgeBase";
import { Scene06_Agents } from "./scenes/Scene06_Agents";
import { Scene07_CustomerChat } from "./scenes/Scene07_CustomerChat";
import { Scene08_Inbox } from "./scenes/Scene08_Inbox";
import { Scene09_Analytics } from "./scenes/Scene09_Analytics";
import { Scene10_Embed } from "./scenes/Scene10_Embed";
import { Scene10B_Integrations } from "./scenes/Scene10B_Integrations";
import { Scene11_Features } from "./scenes/Scene11_Features";
import { Scene12_CTA } from "./scenes/Scene12_CTA";

/**
 * DarkSaaSLaunchVideo — Snappy, high-tempo 15-scene launch video.
 * Timings scaled down by 40% to make it faster and highly engaging.
 * Total: 1764 frames @ 30fps = ~58.8 seconds.
 */
export const DarkSaaSLaunchVideo: React.FC = () => {
  const frame = useCurrentFrame();

  // Dynamic volume controller matching the visual narrative pacing to remove monotony:
  // - Hero (0-108): 0.15 (pleasant intro)
  // - Problem (108-234): 0.08 (quieter, tense context)
  // - Walkthrough & Ingestion (234-1548): 0.18 (steady product walkthrough)
  // - Outro/CTA Climax (1548-1730): 0.24 (peak energy)
  // - Outro Fade-out (1730-1764): 0.24 to 0.00 (smooth ending)
  const volume = interpolate(
    frame,
    [0, 108, 109, 234, 235, 1548, 1549, 1730, 1731, 1764],
    [0.15, 0.15, 0.08, 0.08, 0.18, 0.18, 0.24, 0.24, 0.24, 0.00],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <>
      <Audio src={staticFile("music.mp3")} volume={volume} />

      <Series>
      <Series.Sequence durationInFrames={108}>
        <Scene01_Hero />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene02_Problem />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene03_Onboarding />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene03C_CustomEndpoint />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene03B_SpaceCustomizer />
      </Series.Sequence>
      <Series.Sequence durationInFrames={108}>
        <Scene04_Dashboard />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene05_KnowledgeBase />
      </Series.Sequence>
      <Series.Sequence durationInFrames={108}>
        <Scene06_Agents />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene07_CustomerChat />
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={126}
        style={{
          translate: "0px 15.9px",
        }}
      >
        <Scene08_Inbox />
      </Series.Sequence>
      <Series.Sequence durationInFrames={108}>
        <Scene09_Analytics />
      </Series.Sequence>
      <Series.Sequence durationInFrames={108}>
        <Scene10_Embed />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene10B_Integrations />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <Scene11_Features />
      </Series.Sequence>
      <Series.Sequence durationInFrames={126}>
        <Scene12_CTA />
      </Series.Sequence>
    </Series>
    </>
  );
};
