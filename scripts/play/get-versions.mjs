import { google } from "googleapis";

const PACKAGE = "com.niquewrld.studenthub";
const KEY = "C:/keys/play-service-account.json";

const auth = new google.auth.GoogleAuth({
  keyFile: KEY,
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});

const publisher = google.androidpublisher({ version: "v3", auth });

const { data: edit } = await publisher.edits.insert({ packageName: PACKAGE });
const editId = edit.id;

const tracks = ["production", "beta", "alpha", "internal"];
let maxCode = 0;

for (const track of tracks) {
  try {
    const { data } = await publisher.edits.tracks.get({
      packageName: PACKAGE,
      editId,
      track,
    });
    const codes = (data.releases ?? [])
      .flatMap((r) => r.versionCodes ?? [])
      .map(Number);
    const top = codes.length ? Math.max(...codes) : 0;
    if (top > maxCode) maxCode = top;
    console.log(
      `${track}: ${codes.length ? codes.join(", ") : "(no releases)"}`,
    );
  } catch (err) {
    console.log(`${track}: error - ${err.message}`);
  }
}

await publisher.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});

console.log("---");
console.log("Highest version code in use:", maxCode);
console.log("Next version code to use:", maxCode + 1);
