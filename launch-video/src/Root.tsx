import "./index.css";
import { Composition } from "remotion";
import { DarkSaaSLaunchVideo } from "./Composition";

/**
 * RemotionRoot — registers the composition.
 * Total frames: 1764 @ 30fps = ~58.8 seconds.
 * Resolution: 1920x1080 (16:9 full HD).
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DarkSaaSLaunch"
        component={DarkSaaSLaunchVideo}
        durationInFrames={1764}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
