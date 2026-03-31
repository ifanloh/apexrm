import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const dashboardUrl = process.env.UAT_DASHBOARD_URL ?? "https://apexrm-dashboard.vercel.app";
const organizerEmail = process.env.UAT_ORGANIZER_EMAIL ?? "";
const organizerPassword = process.env.UAT_ORGANIZER_PASSWORD ?? "";

let passed = 0;
let failed = 0;
let skipped = 0;

function log(status, message, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${message}${suffix}`);
}

async function runStep(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    log("PASS", name, typeof detail === "string" ? detail : "");
  } catch (error) {
    failed += 1;
    log("FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

function skipStep(name, reason) {
  skipped += 1;
  log("SKIP", name, reason);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runCommand(command, args, cwd = "C:\\ARM") {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const escapedArgs = args.map((arg) => (/[\s"]/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg));
    const child = spawn(isWindows ? "cmd.exe" : command, isWindows ? ["/d", "/s", "/c", [command, ...escapedArgs].join(" ")] : args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error((stderr || stdout || `Command failed with exit code ${code}`).trim()));
    });
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

async function runOrganizerBrowserChecks() {
  const playwright = await loadPlaywright();
  if (!playwright) {
    skipStep("organizer browser login flow", "Playwright package is not installed in this workspace");
    return;
  }

  if (!organizerEmail || !organizerPassword) {
    skipStep("organizer browser login flow", "UAT_ORGANIZER_EMAIL or UAT_ORGANIZER_PASSWORD is missing");
    return;
  }

  const { chromium } = playwright;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    skipStep(
      "organizer browser login flow",
      error instanceof Error ? `Chromium browser is unavailable: ${error.message}` : "Chromium browser is unavailable"
    );
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await runStep("organizer browser login flow", async () => {
      await page.goto(dashboardUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Login" }).click();
      await page.getByLabel("Username").fill(organizerEmail);
      await page.getByLabel("Password").fill(organizerPassword);
      await page.getByRole("button", { name: "Login" }).click();
      await page.getByText("Event Setup Console").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Branding" }).waitFor();
      await page.getByRole("button", { name: "Races" }).waitFor();
      await page.getByRole("button", { name: "Participants" }).waitFor();
      await page.getByRole("button", { name: "Crew" }).waitFor();
      await page.getByRole("button", { name: "Review" }).waitFor();
      return "Organizer console opened after login";
    });

    await runStep("organizer browser race day ops essentials", async () => {
      await page.getByRole("button", { name: "Race Day Ops" }).click();
      await page.getByRole("button", { name: "Load sample scenario" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Reset demo event" }).waitFor();
      return "Race Day Ops tools are visible";
    });

    await runStep("organizer browser participant template actions", async () => {
      await page.getByRole("button", { name: "Participants" }).click();
      await page.getByRole("button", { name: "Download CSV template" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Download Excel template" }).waitFor();
      return "Participant import template actions are visible";
    });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

console.log("Trailnesia Final UAT");
console.log(`Dashboard URL: ${dashboardUrl}`);
console.log("");

await runStep("dashboard homepage reachable", async () => {
  const { response, text } = await fetchText(dashboardUrl);
  assert(response.ok, `Expected 200 HTML, got ${response.status}`);
  assert(text.includes('id="root"') || text.includes("assets/index-"), "Dashboard HTML shell marker missing");
  return `HTTP ${response.status}`;
});

await runStep("spectator smoke check", async () => {
  let stdout = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      ({ stdout } = await runCommand("npm.cmd", ["run", "qc:spectator"]));
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await delay(1500);
    }
  }

  assert(/pass/i.test(stdout), "Spectator QC output did not report pass");
  return "qc:spectator passed";
});

await runStep("organizer smoke check", async () => {
  const { stdout } = await runCommand("npm.cmd", ["run", "qc:organizer"]);
  assert(/checks passed/i.test(stdout), "Organizer QC output did not report passing checks");
  return "qc:organizer passed";
});

await runStep("dashboard typecheck", async () => {
  await runCommand("npm.cmd", ["run", "typecheck", "--workspace", "@arm/dashboard"]);
  return "@arm/dashboard typecheck passed";
});

await runStep("dashboard production build", async () => {
  const { stdout } = await runCommand("npm.cmd", ["run", "build", "--workspace", "@arm/dashboard"]);
  const match = stdout.match(/assets[\\/](index-[^\\s]+\\.js)/);
  return match ? `Built ${match[1]}` : "@arm/dashboard build passed";
});

await runStep("dashboard initial html remains organizer-light", async () => {
  const { response, text } = await fetchText(dashboardUrl);
  assert(response.ok, `Expected 200 HTML, got ${response.status}`);
  assert(!text.includes("xlsx"), "Initial dashboard HTML unexpectedly exposes xlsx bundle marker");
  return "No direct xlsx marker found in HTML shell";
});

await delay(100);
await runOrganizerBrowserChecks();

console.log("");
console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  process.exitCode = 1;
}
