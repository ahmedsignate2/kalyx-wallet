import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";
import { TOTAL_FRAMES } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="KalyxWalletPromo"
    component={PromoVideo}
    width={1080}
    height={1920}
    fps={60}
    durationInFrames={TOTAL_FRAMES}
  />
);
