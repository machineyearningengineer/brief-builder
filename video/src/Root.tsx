import { Composition } from "remotion"
import { Launch, TOTAL } from "./Launch.tsx"

// Launch is the submission cut. LaunchPublic leaves out the screenshot of someone else's story.
export function Root() {
  return (
    <>
      <Composition id="Launch" component={Launch} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ publicSafe: false }} />
      <Composition id="LaunchPublic" component={Launch} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{ publicSafe: true }} />
    </>
  )
}
