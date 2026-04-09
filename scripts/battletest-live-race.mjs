import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBaseUrl = (process.env.BATTLETEST_API_BASE_URL ?? "https://apexrm-api.vercel.app/api").replace(/\/+$/, "");
const dashboardUrl = (process.env.BATTLETEST_DASHBOARD_URL ?? "https://apexrm-dashboard.vercel.app").replace(/\/+$/, "");
const organizerUsername = process.env.BATTLETEST_ORGANIZER_USERNAME ?? "admin";
const organizerPassword = process.env.BATTLETEST_ORGANIZER_PASSWORD ?? "admin";
const scannerUsername = process.env.BATTLETEST_SCANNER_USERNAME ?? "crew_demo";
const scannerPassword = process.env.BATTLETEST_SCANNER_PASSWORD ?? "demo123";
const eventName = process.env.BATTLETEST_EVENT_NAME ?? "Journey100 by Berandal";
const raceName = process.env.BATTLETEST_RACE_NAME ?? "Ring of Kawi 115K";
const burstCount = Math.max(3, Number(process.env.BATTLETEST_SCAN_COUNT ?? 5));
const runId = new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14);
const bibPrefix = process.env.BATTLETEST_BIB_PREFIX ?? `BT${runId.slice(-8)}`;
const organizerShot = path.join(repoRoot, `tmp-battletest-organizer-${runId}.png`);
const spectatorShot = path.join(repoRoot, `tmp-battletest-spectator-${runId}.png`);
const summaryJson = path.join(repoRoot, `tmp-battletest-summary-${runId}.json`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pageContainsText(page, needle) {
  return page.evaluate((target) => {
    function collectText(root) {
      let text = root.textContent ?? "";
      const elements = root.querySelectorAll?.("*") ?? [];
      for (const element of elements) {
        if (element.shadowRoot) {
          text += collectText(element.shadowRoot);
        }
      }
      return text;
    }

    return collectText(document.body).includes(target);
  }, needle);
}

async function requestJson(url, options = {}, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {})
        }
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new Error(payload?.detail ?? payload?.message ?? `HTTP ${response.status}`);
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loginDemoCrew() {
  return requestJson(`${apiBaseUrl}/scanner/demo-login`, {
    method: "POST",
    body: JSON.stringify({
      username: scannerUsername,
      password: scannerPassword
    })
  }, 0);
}

async function fetchPublicEvents() {
  return requestJson(`${apiBaseUrl}/organizer/public-events`, { method: "GET" }, 2);
}

async function fetchRecentPassings(limit = 40) {
  return requestJson(`${apiBaseUrl}/passings/recent?limit=${limit}`, { method: "GET" }, 2);
}

async function postSyncOffline(accessToken, scans) {
  return requestJson(`${apiBaseUrl}/sync-offline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ scans })
  }, 1);
}

async function postScan(accessToken, scan) {
  return requestJson(`${apiBaseUrl}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(scan)
  }, 0);
}

async function captureOrganizerAndSpectator(targetBib) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return {
      organizerVisible: false,
      spectatorVisible: false,
      note: "Playwright not installed"
    };
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const organizerPage = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    await organizerPage.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await organizerPage.getByRole("button", { name: "Login", exact: true }).first().click();
    await organizerPage.getByLabel(/Username|Email/i).fill(organizerUsername);
    await organizerPage.getByLabel("Password").fill(organizerPassword);
    await organizerPage.locator(".auth-modal-form button[type='submit']").click();
    await organizerPage.getByRole("button", { name: "Open Event" }).waitFor({ timeout: 30000 });
    await organizerPage.getByRole("button", { name: "Open Event" }).click();
    await organizerPage.getByText("Race Day Ops", { exact: true }).click();
    await organizerPage.getByText("Race Day Operations", { exact: true }).waitFor({ timeout: 20000 });
    await organizerPage.waitForTimeout(4000);
    const organizerVisible = await pageContainsText(organizerPage, targetBib);
    await organizerPage.screenshot({ path: organizerShot, fullPage: true });

    const spectatorPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await spectatorPage.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await spectatorPage.getByText(eventName, { exact: false }).first().click();
    await spectatorPage.getByRole("button", { name: /Open Race Live/i }).click();
    await spectatorPage.getByText("Ranking", { exact: true }).first().click();
    await spectatorPage.getByText("FOLLOW THE RACE", { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
    await spectatorPage.waitForTimeout(2000);
    const selects = spectatorPage.locator("select");
    const selectCount = await selects.count();
    if (selectCount > 0) {
      await selects.nth(selectCount - 1).selectOption("25").catch(() => {});
      await spectatorPage.waitForTimeout(1500);
    }
    const spectatorVisible = await pageContainsText(spectatorPage, targetBib);
    await spectatorPage.screenshot({ path: spectatorShot, fullPage: true });

    return {
      organizerVisible,
      spectatorVisible,
      note: null
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const publicEvents = await fetchPublicEvents();
  const matchingEvent = publicEvents.items.find((item) => item.event?.name === eventName);

  if (!matchingEvent) {
    throw new Error(`Event '${eventName}' not found in public feed.`);
  }

  const matchingRace = matchingEvent.races.find((race) => race.name === raceName) ?? matchingEvent.races[0];
  if (!matchingRace) {
    throw new Error(`Race '${raceName}' not found for '${eventName}'.`);
  }

  const login = await loginDemoCrew();
  const accessToken = login.accessToken;
  const crewId = login.profile.userId;
  const checkpointId = login.assignedCheckpointId ?? login.checkpoints[0]?.id;

  if (!checkpointId) {
    throw new Error("No checkpoint assignment available for scanner crew.");
  }

  const baseTime = Date.now();
  const offlineScans = Array.from({ length: burstCount }, (_value, index) => {
    const bib = `${bibPrefix}${String(index + 1).padStart(2, "0")}`;
    return {
      clientScanId: randomUUID(),
      raceId: login.raceId,
      checkpointId,
      bib,
      crewId,
      deviceId: `battletest-${runId}`,
      scannedAt: new Date(baseTime + index * 1000).toISOString(),
      capturedOffline: true
    };
  });

  const syncResult = await postSyncOffline(accessToken, offlineScans);
  const acceptedBib = offlineScans[offlineScans.length - 1].bib;
  const liveScan = {
    clientScanId: randomUUID(),
    raceId: login.raceId,
    checkpointId,
    bib: `${bibPrefix}LIVE`,
    crewId,
    deviceId: `battletest-${runId}`,
    scannedAt: new Date(baseTime + offlineScans.length * 1000).toISOString(),
    capturedOffline: false
  };
  const liveResult = await postScan(accessToken, liveScan);
  const duplicateResult = await postScan(accessToken, {
    ...liveScan,
    clientScanId: randomUUID(),
    scannedAt: new Date(baseTime + (offlineScans.length + 1) * 1000).toISOString()
  });

  await sleep(2500);
  const recentPassings = await fetchRecentPassings(50);
  const recentBibSet = new Set(recentPassings.items.map((item) => item.bib));
  const uiCheck = await captureOrganizerAndSpectator(liveScan.bib);

  const summary = {
    checkedAt: new Date().toISOString(),
    eventName,
    raceName: matchingRace.name,
    checkpointId,
    queueBurst: {
      total: offlineScans.length,
      accepted: syncResult.accepted,
      duplicates: syncResult.duplicates,
      bibs: offlineScans.map((scan) => scan.bib)
    },
    liveScan: {
      bib: liveScan.bib,
      status: liveResult.status,
      duplicateStatus: duplicateResult.status
    },
    recentPassingsContains: {
      liveBib: recentBibSet.has(liveScan.bib),
      offlineAcceptedBib: recentBibSet.has(acceptedBib)
    },
    ui: {
      organizerVisible: uiCheck.organizerVisible,
      spectatorVisible: uiCheck.spectatorVisible,
      organizerScreenshot: organizerShot,
      spectatorScreenshot: spectatorShot,
      note: uiCheck.note
    }
  };

  writeFileSync(summaryJson, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (
    syncResult.accepted < offlineScans.length ||
    liveResult.status !== "accepted" ||
    duplicateResult.status !== "duplicate" ||
    !recentBibSet.has(liveScan.bib) ||
    !uiCheck.organizerVisible
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
