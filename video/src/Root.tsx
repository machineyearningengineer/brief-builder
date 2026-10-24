import { Composition } from "remotion"
import { Launch, REAL_FRAMES, RealApp, TOTAL } from "./Launch.tsx"
import { Mobile } from "./Mobile.tsx"
import { STORY_FRAMES, Vertical } from "./Vertical.tsx"

// Launch is the submission cut. LaunchPublic leaves out the screenshot of someone else's story.
export function Root() {
  return (
    <>
      <Composition id="Launch" component={Launch} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ publicSafe: false }} />
      {/* Real footage of the live app on its own, for when the room wants proof it runs. */}
      <Composition id="LiveFootage" component={RealApp} durationInFrames={REAL_FRAMES} fps={30} width={1920} height={1080} />
      {/* The story cut, upright and under a minute, for social posts. */}
      {/* The whole film upright, for phones. */}
      <Composition id="Mobile" component={Mobile} durationInFrames={TOTAL} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="Story" component={Vertical} durationInFrames={STORY_FRAMES} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="LaunchPublic" component={Launch} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ publicSafe: true }} />
    </>
  )
}
