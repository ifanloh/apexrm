import { spawn } from "node:child_process";

const scannerUrl = process.env.UAT_SCANNER_URL ?? "https://apexrm-scanner.vercel.app";
const scannerEmail = process.env.UAT_SCANNER_EMAIL ?? process.env.UAT_ORGANIZER_EMAIL ?? "";
const scannerPassword = process.env.UAT_SCANNER_PASSWORD ?? process.env.UAT_ORGANIZER_PASSWORD ?? "";

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
  const response = await fetch(url, { cache: "no-store" });
  return { response, text: await response.text() };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

async function runBrowserChecks() {
  const playwright = await loadPlaywright();
  if (!playwright) {
    skipStep("scanner browser login flow", "Playwright package is not installed in this workspace");
    return;
  }

  if (!scannerEmail || !scannerPassword) {
    skipStep("scanner browser login flow", "UAT_SCANNER_EMAIL or UAT_SCANNER_PASSWORD is missing");
    return;
  }

  const { chromium } = playwright;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    skipStep(
      "scanner browser login flow",
      error instanceof Error ? `Chromium browser is unavailable: ${error.message}` : "Chromium browser is unavailable"
    );
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  async function enterScannerCheckpointOnce() {
    const checkpointRow = page.locator(".scanner-checkpoint-row").first();
    const isCheckpointSelectionVisible = await checkpointRow.isVisible({ timeout: 15000 }).catch(() => false);

    if (isCheckpointSelectionVisible) {
      await checkpointRow.click();
    }
  }

  async function waitForScannerWorkspace() {
    const displayCard = page.locator(".scanner-display-card");
    const inputAlreadyVisible = await displayCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!inputAlreadyVisible) {
      await enterScannerCheckpointOnce();
    }

    await displayCard.waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Checkpoint locked" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Scanner" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "History" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Logout" }).waitFor({ timeout: 20000 });
  }

  async function waitForPostLoginState() {
    const displayCard = page.locator(".scanner-display-card");
    const checkpointList = page.locator(".scanner-checkpoint-list");

    await page.getByRole("button", { name: "Logout" }).waitFor({ timeout: 20000 });

    const displayCardVisible = await displayCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (displayCardVisible) {
      return "scanner";
    }

    const checkpointListVisible = await checkpointList.isVisible({ timeout: 12000 }).catch(() => false);
    if (checkpointListVisible) {
      return "checkpoint";
    }

    throw new Error("Scanner post-login state did not appear");
  }

  try {
    await runStep("scanner browser login flow", async () => {
      await page.goto(scannerUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.getByLabel("Email").fill(scannerEmail);
      await page.getByLabel("Password").fill(scannerPassword);
      await page.getByRole("button", { name: "Login", exact: true }).click();
      const nextState = await waitForPostLoginState();
      return nextState === "checkpoint"
        ? "Checkpoint selection opened after login"
        : "Scanner workspace opened after login";
    });

    await runStep("scanner browser workspace essentials", async () => {
      await waitForScannerWorkspace();
      return "Scanner essentials are visible";
    });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

console.log("Trailnesia Scanner UAT");
console.log(`Scanner URL: ${scannerUrl}`);
console.log("");

await runStep("scanner homepage reachable", async () => {
  const { response, text } = await fetchText(scannerUrl);
  assert(response.ok, `Expected 200 HTML, got ${response.status}`);
  assert(text.includes('id="root"') || text.includes("assets/index-"), "Scanner HTML shell marker missing");
  return `HTTP ${response.status}`;
});

await runStep("scanner typecheck", async () => {
  await runCommand("npm.cmd", ["run", "typecheck", "--workspace", "@arm/scanner"]);
  return "@arm/scanner typecheck passed";
});

await runStep("scanner production build", async () => {
  await runCommand("npm.cmd", ["run", "build", "--workspace", "@arm/scanner"]);
  return "@arm/scanner build passed";
});

await runBrowserChecks();

console.log("");
console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  process.exitCode = 1;
}
