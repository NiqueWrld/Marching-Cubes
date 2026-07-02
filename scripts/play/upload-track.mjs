import { uploadBundleToTrack } from "./lib/playPublisher.mjs";

const args = process.argv.slice(2);
const trackFlagIndex = args.findIndex((arg) => arg === "--track");

if (trackFlagIndex < 0 || !args[trackFlagIndex + 1]) {
  throw new Error("Missing required argument: --track <track-name>");
}

const track = args[trackFlagIndex + 1];
const forwardedArgs = args.filter((_, index) => index !== trackFlagIndex && index !== trackFlagIndex + 1);

await uploadBundleToTrack(track, forwardedArgs);
