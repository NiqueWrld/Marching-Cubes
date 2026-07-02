import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const DEFAULT_PACKAGE_NAME = "com.niquewrld.studenthub";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ALLOWED_STATUSES = new Set(["draft", "completed", "halted", "inProgress"]);

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getRequiredArg(name, value) {
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }

  return value;
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

async function loadConfigFile(configPath, { explicit }) {
  const resolvedPath = path.resolve(configPath);

  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Config file must contain a JSON object.");
    }

    return parsed;
  } catch (error) {
    if (!explicit && error && error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Failed to load config file '${resolvedPath}': ${error.message}`);
  }
}

async function createPublisherAuth({ serviceAccountPath }) {
  return new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: [PUBLISHER_SCOPE],
  });
}

async function loadReleaseNotes(notesFilePath) {
  if (!notesFilePath) {
    return undefined;
  }

  const raw = await readFile(notesFilePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("releaseNotesFile must contain a JSON array.");
  }

  return parsed;
}

function parseStatus(statusValue) {
  const status = (statusValue || "completed").trim();
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(
      `Invalid status '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).join(", ")}.`,
    );
  }

  return status;
}

function parseRollout(rolloutValue) {
  if (rolloutValue === undefined || rolloutValue === null || rolloutValue === "") {
    return undefined;
  }

  const rollout = Number(rolloutValue);
  if (!Number.isFinite(rollout) || rollout <= 0 || rollout >= 1) {
    throw new Error("--rollout must be a decimal between 0 and 1, for example 0.2.");
  }

  return rollout;
}

function usage(track) {
  const command = track
    ? `pnpm play:upload:${track}`
    : "pnpm play:upload:track -- --track <track-name>";

  return [
    `Usage: ${command} -- --aab <path-to-aab> [options]`,
    "",
    "Required:",
    "  --aab <path>                         Path to the .aab file.",
    "  --config <path>                      Optional config JSON file (default: ./playscript.json).",
    "",
    "Auth (required):",
    "  --serviceAccount <path>              Service account JSON key file path.",
    "",
    "Optional:",
    "  --packageName <application-id>       Defaults to com.niquewrld.studenthub.",
    "  --status <draft|completed|halted|inProgress>",
    "  --rollout <0..1>                     Required when status=inProgress.",
    "  --releaseName <name>                 Human-readable release name.",
    "  --releaseNotes <text>                Release notes text for one language.",
    "  --releaseNotesLang <lang>            Language code, default en-US.",
    "  --releaseNotesFile <path>            JSON array of release notes objects.",
    "  --changesNotSentForReview <bool>     Set true to defer Play review submission.",
    "",
    "Environment variable alternatives:",
    "  PLAY_CONFIG_FILE, PLAY_AAB_PATH, PLAY_SERVICE_ACCOUNT_JSON,",
    "  PLAY_PACKAGE_NAME, PLAY_RELEASE_STATUS, PLAY_ROLLOUT, PLAY_RELEASE_NAME,",
    "  PLAY_RELEASE_NOTES, PLAY_RELEASE_NOTES_LANG, PLAY_RELEASE_NOTES_FILE,",
    "  PLAY_CHANGES_NOT_SENT_FOR_REVIEW, GOOGLE_APPLICATION_CREDENTIALS",
  ].join("\n");
}

export async function uploadBundleToTrack(track, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help === "true") {
    console.log(usage(track));
    return;
  }

  const configPath = pick(args.config, process.env.PLAY_CONFIG_FILE, "playscript.json");
  const config = await loadConfigFile(configPath, { explicit: Boolean(args.config || process.env.PLAY_CONFIG_FILE) });

  const packageName =
    pick(args.packageName, config.packageName, config.PLAY_PACKAGE_NAME, process.env.PLAY_PACKAGE_NAME) ||
    DEFAULT_PACKAGE_NAME;
  const aabPath = getRequiredArg(
    "aab",
    pick(args.aab, config.aabPath, config.PLAY_AAB_PATH, process.env.PLAY_AAB_PATH),
  );
  const serviceAccountPath = pick(
    args.serviceAccount,
    config.serviceAccount,
    config.serviceAccountPath,
    config.PLAY_SERVICE_ACCOUNT_JSON,
    config.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.PLAY_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );

  if (!serviceAccountPath) {
    throw new Error(
      "No Play service account key file found. Provide --serviceAccount, PLAY_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  const status = parseStatus(pick(args.status, config.status, config.PLAY_RELEASE_STATUS, process.env.PLAY_RELEASE_STATUS));
  const rollout = parseRollout(pick(args.rollout, config.rollout, config.PLAY_ROLLOUT, process.env.PLAY_ROLLOUT));
  const releaseName = pick(args.releaseName, config.releaseName, config.PLAY_RELEASE_NAME, process.env.PLAY_RELEASE_NAME);
  const releaseNotesText = pick(
    args.releaseNotes,
    config.releaseNotes,
    config.PLAY_RELEASE_NOTES,
    process.env.PLAY_RELEASE_NOTES,
  );
  const releaseNotesLang =
    pick(args.releaseNotesLang, config.releaseNotesLang, config.PLAY_RELEASE_NOTES_LANG, process.env.PLAY_RELEASE_NOTES_LANG) ||
    "en-US";
  const releaseNotesFile = pick(
    args.releaseNotesFile,
    config.releaseNotesFile,
    config.PLAY_RELEASE_NOTES_FILE,
    process.env.PLAY_RELEASE_NOTES_FILE,
  );
  const changesNotSentForReview = toBoolean(
    pick(
      args.changesNotSentForReview,
      config.changesNotSentForReview,
      config.PLAY_CHANGES_NOT_SENT_FOR_REVIEW,
      process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW,
    ),
    false,
  );

  const release = {
    status,
  };

  if (status === "inProgress") {
    if (rollout === undefined) {
      throw new Error("--rollout is required when --status inProgress is used.");
    }

    release.userFraction = rollout;
  }

  if (releaseName) {
    release.name = releaseName;
  }

  const notesFromFile = await loadReleaseNotes(releaseNotesFile);
  if (notesFromFile && notesFromFile.length > 0) {
    release.releaseNotes = notesFromFile;
  } else if (releaseNotesText) {
    release.releaseNotes = [
      {
        language: releaseNotesLang,
        text: releaseNotesText,
      },
    ];
  }

  const auth = await createPublisherAuth({ serviceAccountPath });
  const androidpublisher = google.androidpublisher({ version: "v3", auth });

  const edit = await androidpublisher.edits.insert({
    packageName,
    requestBody: {},
  });

  const editId = edit.data.id;
  if (!editId) {
    throw new Error("Failed to create an edit in Google Play.");
  }

  const resolvedAabPath = path.resolve(aabPath);
  console.log(`Uploading ${resolvedAabPath} to ${track} track for ${packageName}...`);

  try {
    const bundleUpload = await androidpublisher.edits.bundles.upload({
      packageName,
      editId,
      media: {
        mimeType: "application/octet-stream",
        body: createReadStream(resolvedAabPath),
      },
    });

    const versionCode = bundleUpload.data.versionCode;
    if (!versionCode) {
      throw new Error("Upload did not return a versionCode.");
    }

    release.versionCodes = [String(versionCode)];

    await androidpublisher.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        releases: [release],
      },
    });

    await androidpublisher.edits.commit({
      packageName,
      editId,
      changesNotSentForReview,
    });

    console.log(`Release committed. Track: ${track}. Version code: ${versionCode}.`);
  } catch (error) {
    try {
      await androidpublisher.edits.delete({ packageName, editId });
    } catch {
      // Ignore cleanup failures.
    }

    throw error;
  }
}
