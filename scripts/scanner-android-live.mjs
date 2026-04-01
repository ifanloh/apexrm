import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = "C:\\ARM";
const scannerDir = path.join(repoRoot, "apps", "scanner");
const androidDir = path.join(scannerDir, "android");
const generatedCapConfigPath = path.join(androidDir, "app", "src", "main", "assets", "capacitor.config.json");
const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;

if (!sdkRoot) {
  console.error("ANDROID_SDK_ROOT or ANDROID_HOME is not set.");
  process.exit(1);
}

const adbPath = path.join(sdkRoot, "platform-tools", "adb.exe");
const emulatorPath = path.join(sdkRoot, "emulator", "emulator.exe");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    shell: false,
  });
}

function listDevices() {
  const result = run(adbPath, ["devices"]);
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to list adb devices.");
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);
}

function listAvds() {
  const result = run(emulatorPath, ["-list-avds"]);
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to list Android AVDs.");
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function waitForHttp(url, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureTarget() {
  let devices = listDevices();
  if (devices.length > 0) return devices[0];

  const avds = listAvds();
  const preferredAvd = avds[0];
  if (!preferredAvd) {
    throw new Error("No Android emulator/device found.");
  }

  console.log(`Starting Android emulator: ${preferredAvd}`);
  spawn(emulatorPath, ["-avd", preferredAvd], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    shell: false,
  }).unref();

  run(adbPath, ["wait-for-device"]);
  await delay(4000);
  devices = listDevices();
  if (devices.length === 0) {
    throw new Error("No Android target available after emulator start.");
  }
  return devices[0];
}

async function ensureDevServer() {
  try {
    await waitForHttp("http://127.0.0.1:5173", 2500);
    console.log("Using existing scanner dev server at http://127.0.0.1:5173");
    return;
  } catch {
    console.log("Starting scanner Vite dev server...");
    spawn(
      "cmd.exe",
      ["/d", "/s", "/c", "npm.cmd run dev --workspace @arm/scanner -- --host 0.0.0.0 --port 5173"],
      {
        cwd: repoRoot,
        detached: true,
        stdio: "ignore",
        shell: false,
      },
    ).unref();
  }

  await waitForHttp("http://127.0.0.1:5173");
  console.log("Dev server is ready at http://127.0.0.1:5173");
}

function ensureGeneratedCapacitorConfig(host) {
  if (!existsSync(generatedCapConfigPath)) {
    console.error(`Generated Capacitor config not found at ${generatedCapConfigPath}. Run a scanner Android build first.`);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(generatedCapConfigPath, "utf8"));
  config.server = {
    url: `http://${host}:5173`,
    cleartext: true,
  };
  writeFileSync(generatedCapConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

const target = await ensureTarget();
console.log(`Using Android target: ${target}`);

await ensureDevServer();

const host = target.startsWith("emulator-") ? "10.0.2.2" : "127.0.0.1";
if (!target.startsWith("emulator-")) {
  console.log("Forwarding local dev server port to connected device...");
  run(adbPath, ["-s", target, "reverse", "tcp:5173", "tcp:5173"], { stdio: "inherit" });
}

ensureGeneratedCapacitorConfig(host);
console.log(`Configured Android app to use live server at http://${host}:5173`);

const installResult = run("cmd.exe", ["/d", "/s", "/c", "gradlew.bat installDebug"], {
  cwd: androidDir,
  stdio: "inherit",
});

if (installResult.status !== 0) {
  process.exit(installResult.status ?? 1);
}

const launchResult = run(adbPath, ["-s", target, "shell", "monkey", "-p", "com.trailnesia.scanner", "-c", "android.intent.category.LAUNCHER", "1"], {
  stdio: "inherit",
});

if (launchResult.status !== 0) {
  process.exit(launchResult.status ?? 1);
}

console.log("");
console.log("Trailnesia Scanner live preview is running on the Android target.");
console.log("Keep the Vite dev server running. UI updates will hot-reload in the app.");
