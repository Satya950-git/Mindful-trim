const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const ALLOWED_PLATFORMS = new Set(["ios", "android"]);
const TIMESTAMP_RE = /^\d+-\d+$/;
const SAFE_FILENAME_RE = /^[\w.\-@]+$/;
const BUILD_BASE = path.resolve("static-build");

function validatePlatform(platform) {
  if (!ALLOWED_PLATFORMS.has(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  return platform;
}

function validateTimestamp(timestamp) {
  if (!TIMESTAMP_RE.test(timestamp)) {
    throw new Error(`Invalid timestamp format: ${timestamp}`);
  }
  return timestamp;
}

function safeJoin(base, ...parts) {
  const resolved = path.resolve(base, ...parts); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const baseResolved = path.resolve(base); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    throw new Error(`Path traversal detected: ${resolved}`);
  }
  return resolved;
}

function safeFilename(filename) {
  const basename = path.basename(filename);
  if (!SAFE_FILENAME_RE.test(basename)) {
    throw new Error(`Unsafe filename: ${basename}`);
  }
  return basename;
}

let metroProcess = null;

function exitWithError(message) {
  console.error(message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
}

function setupSignalHandlers() {
  const cleanup = () => {
    if (metroProcess) {
      console.log("Cleaning up Metro process...");
      metroProcess.kill();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
}

function stripProtocol(domain) {
  let urlString = domain.trim();

  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  return new URL(urlString).host;
}

function getDeploymentDomain() {
  // Check Replit deployment environment variables first
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }

  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }

  console.error(
    "ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN",
  );
  process.exit(1);
}

function prepareDirectories(timestamp) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  console.log("Preparing build directories...");
  validateTimestamp(timestamp);

  if (fs.existsSync("static-build")) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    fs.rmSync("static-build", { recursive: true }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  }

  const dirs = [
    safeJoin(BUILD_BASE, timestamp, "_expo", "static", "js", "ios"), // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    safeJoin(BUILD_BASE, timestamp, "_expo", "static", "js", "android"), // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    safeJoin(BUILD_BASE, "ios"),
    safeJoin(BUILD_BASE, "android"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  }

  console.log("Build:", timestamp);
}

function clearMetroCache() {
  console.log("Clearing Metro cache...");

  const cacheDirs = [
    ...fs.globSync(".metro-cache"), // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    ...fs.globSync("node_modules/.cache/metro"), // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  ];

  for (const dir of cacheDirs) {
    fs.rmSync(dir, { recursive: true, force: true }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  }

  console.log("Cache cleared");
}

async function checkMetroHealth() {
  try {
    const response = await fetch("http://localhost:8081/status", {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startMetro(expoPublicDomain) {
  const isRunning = await checkMetroHealth();
  if (isRunning) {
    console.log("Metro already running");
    return;
  }

  console.log("Starting Metro...");
  console.log(`Setting EXPO_PUBLIC_DOMAIN=${expoPublicDomain}`);
  const env = {
    ...process.env,
    EXPO_PUBLIC_DOMAIN: expoPublicDomain,
  };
  metroProcess = spawn("npm", ["run", "expo:start:static:build"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env,
  });

  if (metroProcess.stdout) {
    metroProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.log(`[Metro] ${output}`);
    });
  }
  if (metroProcess.stderr) {
    metroProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) console.error(`[Metro Error] ${output}`);
    });
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const healthy = await checkMetroHealth();
    if (healthy) {
      console.log("Metro ready");
      return;
    }
  }

  console.error("Metro timeout");
  process.exit(1);
}

// nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
async function downloadFile(url, outputPath) {
  const controller = new AbortController();
  const fiveMinMS = 5 * 60 * 1_000;
  const timeoutId = setTimeout(() => controller.abort(), fiveMinMS);

  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const file = fs.createWriteStream(outputPath); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    await pipeline(Readable.fromWeb(response.body), file);

    const fileSize = fs.statSync(outputPath).size; // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename

    if (fileSize === 0) {
      fs.unlinkSync(outputPath); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      throw new Error("Downloaded file is empty");
    }
  } catch (error) {
    if (fs.existsSync(outputPath)) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      fs.unlinkSync(outputPath); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    }

    if (error.name === "AbortError") {
      throw new Error(`Download timeout after 5m: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundle(platform, timestamp) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  validatePlatform(platform);
  validateTimestamp(timestamp);

  // For expo-router apps, the entry is node_modules/expo-router/entry
  const url = new URL("http://localhost:8081/node_modules/expo-router/entry.bundle");
  url.searchParams.set("platform", platform);
  url.searchParams.set("dev", "false");
  url.searchParams.set("hot", "false");
  url.searchParams.set("lazy", "false");
  url.searchParams.set("minify", "true");

  const output = safeJoin(
    BUILD_BASE,
    timestamp,
    "_expo",
    "static",
    "js",
    platform,
    "bundle.js",
  );

  console.log(`Fetching ${platform} bundle...`);
  await downloadFile(url.toString(), output); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  console.log(`${platform} bundle ready`);
}

async function downloadManifest(platform) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  try {
    console.log(`Fetching ${platform} manifest...`);
    const response = await fetch("http://localhost:8081/manifest", {
      headers: { "expo-platform": platform },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    console.log(`${platform} manifest ready`);
    return manifest;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Manifest download timeout after 5m for platform: ${platform}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBundlesAndManifests(timestamp) {
  console.log("Downloading bundles and manifests...");
  console.log("This may take several minutes for production builds...");

  try {
    const results = await Promise.allSettled([
      downloadBundle("ios", timestamp),
      downloadBundle("android", timestamp),
      downloadManifest("ios"),
      downloadManifest("android"),
    ]);

    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected");

    if (failures.length > 0) {
      const errorMessages = failures.map(({ result, index }) => {
        const names = [
          "iOS bundle",
          "Android bundle",
          "iOS manifest",
          "Android manifest",
        ];
        return `  - ${names[index]}: ${result.reason?.message || result.reason}`;
      });

      exitWithError(`Download failed:\n${errorMessages.join("\n")}`);
    }

    const iosManifest =
      results[2].status === "fulfilled" ? results[2].value : null;
    const androidManifest =
      results[3].status === "fulfilled" ? results[3].value : null;

    console.log("All downloads completed successfully");
    return { ios: iosManifest, android: androidManifest };
  } catch (error) {
    exitWithError(`Unexpected download error: ${error.message}`);
  }
}

function extractAssets(timestamp) {
  validateTimestamp(timestamp);
  const bundles = {
    ios: fs.readFileSync( // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      safeJoin(BUILD_BASE, timestamp, "_expo", "static", "js", "ios", "bundle.js"),
      "utf-8",
    ),
    android: fs.readFileSync( // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      safeJoin(BUILD_BASE, timestamp, "_expo", "static", "js", "android", "bundle.js"),
      "utf-8",
    ),
  };

  const assetsMap = new Map();
  const assetPattern =
    /httpServerLocation:"([^"]+)"[^}]*hash:"([^"]+)"[^}]*name:"([^"]+)"[^}]*type:"([^"]+)"/g;

  const extractFromBundle = (bundle, platform) => {
    for (const match of bundle.matchAll(assetPattern)) {
      const originalPath = match[1];
      const filename = match[3] + "." + match[4];

      const tempUrl = new URL(`http://localhost:8081${originalPath}`);
      const unstablePath = tempUrl.searchParams.get("unstable_path");

      if (!unstablePath) {
        throw new Error(`Asset missing unstable_path: ${originalPath}`);
      }

      const decodedPath = decodeURIComponent(unstablePath);
      const key = path.posix.join(decodedPath, filename);

      if (!assetsMap.has(key)) {
        const asset = {
          url: path.posix.join("/", decodedPath, filename),
          originalPath: originalPath,
          filename: filename,
          relativePath: decodedPath,
          hash: match[2],
          platforms: new Set(),
        };

        assetsMap.set(key, asset);
      }
      assetsMap.get(key).platforms.add(platform);
    }
  };

  extractFromBundle(bundles.ios, "ios");
  extractFromBundle(bundles.android, "android");

  return Array.from(assetsMap.values());
}

// nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
async function downloadAssets(assets, timestamp) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  if (assets.length === 0) {
    return 0;
  }

  console.log("Downloading assets...");
  let successCount = 0;
  const failures = [];

  const downloadPromises = assets.map(async (asset) => {
    const platform = Array.from(asset.platforms)[0];

    const tempUrl = new URL(`http://localhost:8081${asset.originalPath}`);
    const unstablePath = tempUrl.searchParams.get("unstable_path");

    if (!unstablePath) {
      throw new Error(`Asset missing unstable_path: ${asset.originalPath}`);
    }

    const decodedPath = decodeURIComponent(unstablePath);
    const metroUrl = new URL(
      `http://localhost:8081${path.posix.join("/assets", decodedPath, asset.filename)}`,
    );
    metroUrl.searchParams.set("platform", platform);
    metroUrl.searchParams.set("hash", asset.hash);

    const safeRel = path.normalize(asset.relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const safeName = safeFilename(asset.filename);
    const outputDir = safeJoin(BUILD_BASE, timestamp, "_expo", "static", "js", safeRel); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    fs.mkdirSync(outputDir, { recursive: true }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    const output = safeJoin(outputDir, safeName); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename

    try {
      await downloadFile(metroUrl.toString(), output); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      successCount++;
    } catch (error) {
      failures.push({
        filename: asset.filename,
        error: error.message,
        url: metroUrl.toString(),
      });
    }
  });

  await Promise.all(downloadPromises);

  if (failures.length > 0) {
    const errorMsg =
      `Failed to download ${failures.length} asset(s):\n` +
      failures
        .map((f) => `  - ${f.filename}: ${f.error} (${f.url})`)
        .join("\n");
    exitWithError(errorMsg);
  }

  console.log(`Downloaded ${successCount} assets`);
  return successCount;
}

function updateBundleUrls(timestamp, baseUrl) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  validateTimestamp(timestamp);
  const updateForPlatform = (platform) => {
    validatePlatform(platform);
    const bundlePath = safeJoin( // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      BUILD_BASE,
      timestamp,
      "_expo",
      "static",
      "js",
      platform,
      "bundle.js",
    );
    let bundle = fs.readFileSync(bundlePath, "utf-8"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename

    bundle = bundle.replace(
      /httpServerLocation:"(\/[^"]+)"/g,
      (_match, capturedPath) => {
        const tempUrl = new URL(`http://localhost:8081${capturedPath}`);
        const unstablePath = tempUrl.searchParams.get("unstable_path");

        if (!unstablePath) {
          throw new Error(
            `Asset missing unstable_path in bundle: ${capturedPath}`,
          );
        }

        const decodedPath = decodeURIComponent(unstablePath);
        return `httpServerLocation:"${baseUrl}/${timestamp}/_expo/static/js/${decodedPath}"`;
      },
    );

    fs.writeFileSync(bundlePath, bundle); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  };

  updateForPlatform("ios");
  updateForPlatform("android");
  console.log("Updated bundle URLs");
}

function updateManifests(manifests, timestamp, baseUrl, assetsByHash) {
  validateTimestamp(timestamp);
  const updateForPlatform = (platform, manifest) => {
    validatePlatform(platform);
    if (!manifest.launchAsset || !manifest.extra) {
      exitWithError(`Malformed manifest for ${platform}`);
    }

    manifest.launchAsset.url = `${baseUrl}/${timestamp}/_expo/static/js/${platform}/bundle.js`;
    manifest.launchAsset.key = `bundle-${timestamp}`;
    manifest.createdAt = new Date(
      Number(timestamp.split("-")[0]),
    ).toISOString();
    manifest.extra.expoClient.hostUri =
      baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.debuggerHost =
      baseUrl.replace("https://", "") + "/" + platform;
    manifest.extra.expoGo.packagerOpts.dev = false;

    if (manifest.assets && manifest.assets.length > 0) {
      manifest.assets.forEach((asset) => {
        if (!asset.url) return;

        const hash = asset.hash;
        if (!hash) return;

        const assetInfo = assetsByHash.get(hash);
        if (!assetInfo) return;

        asset.url = `${baseUrl}/${timestamp}/_expo/static/js/${assetInfo.relativePath}/${assetInfo.filename}`;
      });
    }

    fs.writeFileSync( // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      safeJoin(BUILD_BASE, platform, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  };

  updateForPlatform("ios", manifests.ios);
  updateForPlatform("android", manifests.android);
  console.log("Manifests updated");
}

async function main() {
  console.log("Building static Expo Go deployment...");

  setupSignalHandlers();

  const domain = getDeploymentDomain();
  const baseUrl = `https://${domain}`;
  const timestamp = `${Date.now()}-${process.pid}`;

  prepareDirectories(timestamp);
  clearMetroCache();

  await startMetro(domain);

  const downloadTimeout = 300000;
  const downloadPromise = downloadBundlesAndManifests(timestamp);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Overall download timeout after ${downloadTimeout / 1000} seconds. ` +
            "Metro may be struggling to generate bundles. Check Metro logs above.",
        ),
      );
    }, downloadTimeout);
  });

  const manifests = await Promise.race([downloadPromise, timeoutPromise]);

  console.log("Processing assets...");
  const assets = extractAssets(timestamp);
  console.log("Found", assets.length, "unique asset(s)");

  const assetsByHash = new Map();
  for (const asset of assets) {
    assetsByHash.set(asset.hash, {
      relativePath: asset.relativePath,
      filename: asset.filename,
    });
  }

  const assetCount = await downloadAssets(assets, timestamp);

  if (assetCount > 0) {
    updateBundleUrls(timestamp, baseUrl);
  }

  console.log("Updating manifests and creating landing page...");
  updateManifests(manifests, timestamp, baseUrl, assetsByHash);

  console.log("Build complete! Deploy to:", baseUrl);

  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Build failed:", error.message);
  if (metroProcess) {
    metroProcess.kill();
  }
  process.exit(1);
});
