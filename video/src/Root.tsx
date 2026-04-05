import { Composition } from "remotion";
import { MMPMVideo, VIDEO_FPS, VIDEO_DURATION_FRAMES, VIDEO_WIDTH, VIDEO_HEIGHT } from "./MMPMVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MMPMVideo"
      component={MMPMVideo}
      durationInFrames={VIDEO_DURATION_FRAMES}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
    />
  );
};
