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
  const organizerSeed = Date.now();

  async function completeFirstEventWizard() {
    await page.getByRole("button", { name: "Create your first event" }).click();
    await page.getByLabel("Organizer name").fill("UAT Organizer");
    await page.getByLabel("Event brand").fill(`UAT ${organizerSeed}`);
    await page.getByLabel("Edition label").fill("Edition UAT");
    await page.getByLabel("Date ribbon").fill("Nov 2026");
    await page.getByRole("button", { name: "Continue to branding" }).click();
    await page.getByLabel("Home title").fill(`UAT ${organizerSeed} Home`);
    await page.getByLabel("Home subtitle").fill("UAT organizer draft created from the first-event wizard.");
    await page.getByLabel("Banner tagline").fill("UAT Trailnesia");
    await page.getByLabel("Location ribbon").fill("QA Valley");
    await page.getByRole("button", { name: "Continue to first race" }).click();
    await page.getByLabel("Race title").fill("UAT 50K");
    await page.getByLabel("Distance (km)").fill("50");
    await page.getByLabel("Ascent (m+)").fill("2000");
    await page.getByLabel("Start town").fill("Basecamp");
    await page.getByLabel("Schedule label").fill("Sat 04:00");
    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByRole("button", { name: "Create event draft" }).click();
  }

  try {
    await runStep("organizer browser login flow", async () => {
      await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator("header").getByRole("button", { name: "Login", exact: true }).waitFor({ timeout: 15000 });
      await page.locator("header").getByRole("button", { name: "Login", exact: true }).click();
      const loginDialog = page.locator(".auth-modal");
      await loginDialog.waitFor({ timeout: 10000 });
      await loginDialog.getByLabel("Username").fill(organizerEmail);
      await loginDialog.getByLabel("Password").fill(organizerPassword);
      await loginDialog.getByRole("button", { name: "Login", exact: true }).click();
      const homeTitle = page.getByText("Organizer Home");
      const consoleTitle = page.getByText("Event Setup Console");
      await page.getByText(/Organizer Home|Event Setup Console/).waitFor({ timeout: 15000 });

      if (await homeTitle.isVisible().catch(() => false)) {
        const createFirstEventButton = page.getByRole("button", { name: "Create your first event" });
        if ((await createFirstEventButton.count()) > 0) {
          await completeFirstEventWizard();
        } else {
          const openEventSetupButton = page.getByRole("button", { name: "Open event setup" });
          const openEventButton = page.getByRole("button", { name: "Open" });

          if (await openEventSetupButton.count()) {
            await openEventSetupButton.click();
          } else if (await openEventButton.count()) {
            await openEventButton.first().click();
          }
        }
        await consoleTitle.waitFor({ timeout: 15000 });
      }

      const setupNav = page.locator(".organizer-console-nav").first();
      await setupNav.getByRole("button", { name: /Event/ }).waitFor();
      await setupNav.getByRole("button", { name: /Races/ }).waitFor();
      await setupNav.getByRole("button", { name: /Participants/ }).waitFor();
      await setupNav.getByRole("button", { name: /Crew/ }).waitFor();
      await setupNav.getByRole("button", { name: /Review/ }).waitFor();
      return await homeTitle.isVisible().catch(() => false)
        ? "Organizer home opened first, then event setup console"
        : "Organizer console opened after login";
    });

    await runStep("organizer browser race day ops essentials", async () => {
      await page.getByRole("button", { name: "Race Day Ops" }).click();
      await page.getByRole("button", { name: "Load sample scenario" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: /Clear all trial scans|Reset demo event/ }).waitFor();
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
