import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

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

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

async function createAuditFiles() {
  const prefix = `trailnesia-organizer-${Date.now()}`;
  const csvPath = path.join(os.tmpdir(), `${prefix}.csv`);
  const gpxPath = path.join(os.tmpdir(), `${prefix}.gpx`);
  const csv = [
    "bib,name,gender,country,club",
    "M001,Runner One,men,id,Club Alpha",
    "W001,Runner Two,women,sg,Club Beta"
  ].join("\n");
  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Trailnesia UAT">',
    '  <trk><name>QA Route</name><trkseg>',
    '    <trkpt lat="-7.9000" lon="112.9500"></trkpt>',
    '    <trkpt lat="-7.9100" lon="112.9700"></trkpt>',
    "  </trkseg></trk>",
    "</gpx>"
  ].join("\n");

  await fs.writeFile(csvPath, csv, "utf8");
  await fs.writeFile(gpxPath, gpx, "utf8");

  return {
    csvPath,
    gpxPath,
    logoPath: path.resolve("C:/ARM/apps/dashboard/src/assets/trailnesia.png")
  };
}

async function withDownload(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const suggested = download.suggestedFilename();
  await download.cancel().catch(() => {});
  return suggested;
}

async function loginOrganizer(page) {
  await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator("header").getByRole("button", { name: "Login", exact: true }).click();
  const dialog = page.locator(".auth-modal");
  await dialog.getByLabel("Username").fill(organizerEmail);
  await dialog.getByLabel("Password").fill(organizerPassword);
  await dialog.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByText("Organizer Home").waitFor({ timeout: 15000 });
}

async function createFirstEventDraft(page, titleSeed) {
  await page.getByRole("button", { name: "Create your first event" }).click();
  await page.getByLabel("Organizer name").fill("UAT Organizer");
  await page.getByLabel("Event brand").fill(titleSeed);
  await page.getByLabel("Edition label").fill("Edition UAT");
  if (await page.getByLabel("Event date & time").count()) {
    await page.getByLabel("Event date & time").fill("2026-11-01T05:00");
  } else {
    await page.getByLabel("Date ribbon").fill("Nov 2026");
  }
  await page.getByRole("button", { name: "Continue to branding" }).click();
  await page.getByLabel("Home title").fill(`${titleSeed} Home`);
  await page.getByLabel("Home subtitle").fill("Deep organizer browser audit draft.");
  await page.getByLabel("Banner tagline").fill("UAT Trailnesia");
  await page.getByLabel("Location ribbon").fill("QA Valley");
  await page.getByRole("button", { name: "Continue to first race" }).click();
  await page.getByLabel("Race title").fill("UAT 50K");
  await page.getByLabel("Distance (km)").fill("50");
  await page.getByLabel("Ascent (m+)").fill("2000");
  await page.getByLabel("Start town").fill("Basecamp");
  if (await page.getByLabel("Race start date & time").count()) {
    await page.getByLabel("Race start date & time").fill("2026-11-01T05:00");
  } else {
    await page.getByLabel("Schedule label").fill("Sat 04:00");
  }
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create event draft" }).click();
  await page.getByText("Event Setup Console").waitFor({ timeout: 15000 });
}

function visibleConsolePanel(page) {
  return page.locator("article.organizer-console-panel:visible").first();
}

async function runDeepOrganizerAudit() {
  const playwright = await loadPlaywright();
  if (!playwright) {
    skipStep("deep organizer browser audit", "Playwright package is not installed in this workspace");
    return;
  }

  if (!organizerEmail || !organizerPassword) {
    skipStep("deep organizer browser audit", "UAT_ORGANIZER_EMAIL or UAT_ORGANIZER_PASSWORD is missing");
    return;
  }

  const files = await createAuditFiles();
  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1280 }, acceptDownloads: true });
  const page = await context.newPage();
  const titleSeed = `UAT ${Date.now()}`;

  try {
    await runStep("organizer home first-time state and event wizard", async () => {
      await loginOrganizer(page);
      await page.screenshot({ path: "C:/ARM/tmp-organizer-home-audit.png", fullPage: true });
      await createFirstEventDraft(page, titleSeed);
      await page.screenshot({ path: "C:/ARM/tmp-organizer-console-audit.png", fullPage: true });
      return "Created a first-event draft through Organizer Home";
    });

    await runStep("organizer save draft and branding uploads", async () => {
      await page.getByRole("button", { name: "Save draft" }).click();
      await page.getByText(/Draft saved/i).waitFor({ timeout: 10000 });

      await page.locator('label:has-text("Upload event logo") input[type="file"]').setInputFiles(files.logoPath);
      await page.locator('label:has-text("Upload hero background") input[type="file"]').setInputFiles(files.logoPath);
      await page.getByAltText("Event logo preview").waitFor({ timeout: 10000 });
      await page.getByAltText("Hero background preview").waitFor({ timeout: 10000 });
      return "Draft save feedback and branding uploads work";
    });

    await runStep("organizer races and checkpoints controls", async () => {
      await page.locator(".organizer-console-nav").getByRole("button", { name: /Races/ }).click();
      const racesPanel = visibleConsolePanel(page);
      const raceSelect = racesPanel.locator(".organizer-race-selector select");
      const optionCountBefore = await raceSelect.locator("option").count();
      const checkpointCountBefore = await racesPanel.locator(".organizer-checkpoint-row").count();
      const optionValuesBefore = await raceSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
      const primaryRaceSlug = optionValuesBefore[0];

      await page.getByRole("button", { name: "Add race category" }).click();
      await raceSelect.waitFor();
      const optionCountAfterAdd = await raceSelect.locator("option").count();
      assert(optionCountAfterAdd === optionCountBefore + 1, "add race category did not increase selector options");

      const optionValues = await raceSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
      const newestRaceSlug = optionValues[optionValues.length - 1];
      await raceSelect.selectOption(newestRaceSlug);
      await racesPanel.getByLabel("Race title").fill("UAT 20K");
      await racesPanel.getByLabel("Course description").fill("UAT route over ridges with technical sections and a long final descent.");
      await racesPanel.getByLabel("Course highlights").fill("Ridgeline, Technical forest, Night section");
      await racesPanel.locator('label:has-text("Upload GPX for selected race") input[type="file"]').setInputFiles(files.gpxPath);
      await racesPanel.getByText(/tmp-organizer-test|trailnesia-organizer-|\.gpx/i).first().waitFor({ timeout: 10000 });
      await racesPanel.getByRole("button", { name: "Add checkpoint" }).click();
      const checkpointCountAfterAdd = await racesPanel.locator(".organizer-checkpoint-row").count();
      assert(checkpointCountAfterAdd === checkpointCountBefore + 1, "add checkpoint did not increase visible checkpoint rows");
      await racesPanel.getByRole("button", { name: "Remove" }).nth(checkpointCountAfterAdd - 3).click();
      const checkpointCountAfterRemove = await racesPanel.locator(".organizer-checkpoint-row").count();
      assert(checkpointCountAfterRemove === checkpointCountBefore, "remove checkpoint did not restore checkpoint count");
      await racesPanel.getByRole("button", { name: "Remove race" }).click();
      const optionCountAfterRemoveRace = await raceSelect.locator("option").count();
      assert(optionCountAfterRemoveRace === optionCountBefore, "remove race did not restore race count");
      await raceSelect.selectOption(primaryRaceSlug);
      await racesPanel.getByLabel("Course description").fill("UAT route over ridges with technical sections and a long final descent.");
      await racesPanel.getByLabel("Course highlights").fill("Ridgeline, Technical forest, Night section");
      await racesPanel.locator('label:has-text("Upload GPX for selected race") input[type="file"]').setInputFiles(files.gpxPath);
      return "Add/remove race and checkpoint plus GPX upload behave correctly";
    });

    await runStep("organizer participant templates and import", async () => {
      await page.locator(".organizer-console-nav").getByRole("button", { name: /Participants/ }).click();
      const participantsPanel = visibleConsolePanel(page);

      const csvFileName = await withDownload(page, async () => {
        await participantsPanel.getByRole("button", { name: "Download CSV template" }).click();
      });
      assert(csvFileName.toLowerCase().endsWith(".csv"), "CSV template download did not start");

      const xlsxFileName = await withDownload(page, async () => {
        await participantsPanel.getByRole("button", { name: "Download Excel template" }).click();
      });
      assert(xlsxFileName.toLowerCase().endsWith(".xlsx"), "Excel template download did not start");

      await participantsPanel.locator('label:has-text("Upload CSV / Excel") input[type="file"]').setInputFiles(files.csvPath);
      await participantsPanel.getByText(path.basename(files.csvPath)).waitFor({ timeout: 10000 });
      await participantsPanel.getByRole("button", { name: /Apply .*selected race|Update existing participants|Replace selected race roster/ }).click();
      await participantsPanel.getByText("Current roster").waitFor({ timeout: 10000 });
      await participantsPanel.getByRole("button", { name: "Clear draft" }).click();
      return `Template downloads started (${csvFileName}, ${xlsxFileName}) and participant import applied`;
    });

    await runStep("organizer crew account actions", async () => {
      await page.locator(".organizer-console-nav").getByRole("button", { name: /Crew/ }).click();
      const crewPanel = visibleConsolePanel(page);
      await crewPanel.getByRole("button", { name: "Add crew" }).click();

      const lastCrewRow = crewPanel.locator(".organizer-crew-row").last();
      await lastCrewRow.getByLabel("Name").fill("Crew UAT");
      await lastCrewRow.getByLabel("Email").fill(`crew-${Date.now()}@arm.local`);
      await lastCrewRow.getByLabel("Device label").fill("Scanner QA 1");

      const inviteCodeBefore = await lastCrewRow.locator(".organizer-crew-invite strong").innerText();
      await lastCrewRow.getByRole("button", { name: "Regenerate invite" }).click();
      await page.waitForTimeout(300);
      const inviteCodeAfter = await lastCrewRow.locator(".organizer-crew-invite strong").innerText();
      assert(inviteCodeBefore !== inviteCodeAfter, "regenerate invite did not change the invite code");

      await lastCrewRow.getByRole("button", { name: "Mark accepted" }).click();
      await lastCrewRow.getByRole("button", { name: "Activate device" }).click();
      await lastCrewRow.getByRole("button", { name: "Set standby" }).click();
      await lastCrewRow.getByRole("button", { name: "Reactivate" }).click();
      return "Crew invite, accept, activate, standby, and reactivate actions work";
    });

    await runStep("organizer review publish logic", async () => {
      await page.locator(".organizer-console-nav").getByRole("button", { name: /Review/ }).click();
      const publishButton = page.locator('button:visible').filter({ hasText: /^Publish$/ }).first();
      assert(!(await publishButton.isDisabled()), "publish button should be enabled after readiness inputs are complete");
      await publishButton.click();
      const unpublishButton = page.locator('button:visible').filter({ hasText: /^Unpublish$/ }).first();
      await unpublishButton.waitFor({ timeout: 10000 });
      await unpublishButton.click();
      await publishButton.waitFor({ timeout: 10000 });
      return "Publish and unpublish toggle work after readiness is satisfied";
    });

    await runStep("organizer race-day ops controls", async () => {
      await page.getByRole("button", { name: "Race Day Ops" }).click();
      const opsPanel = page.locator('article.organizer-console-panel:visible').filter({ hasText: "Live operations snapshot" }).first();
      await opsPanel.getByRole("button", { name: "Load sample scenario" }).waitFor({ timeout: 10000 });
      await opsPanel.getByRole("button", { name: "Load sample scenario" }).click();
      await opsPanel.getByLabel("BIB input").fill("M001");
      await opsPanel.getByRole("button", { name: "Record trial scan" }).click();
      const simulateWave = opsPanel.getByRole("button", { name: "Simulate checkpoint wave" });
      if (!(await simulateWave.isDisabled())) {
        await simulateWave.click();
      }
      const injectDuplicate = opsPanel.getByRole("button", { name: "Inject duplicate" });
      if (!(await injectDuplicate.isDisabled())) {
        await injectDuplicate.click();
      }
      await opsPanel.getByRole("button", { name: /Clear all trial scans|Reset demo event/ }).click();
      return "Sample scenario, record scan, duplicate, and reset controls are interactive";
    });

    await runStep("organizer home duplicate archive restore flow", async () => {
      await page.getByRole("button", { name: "Organizer Home" }).click();
      await page.getByText("Organizer Home").waitFor({ timeout: 10000 });
      const eventList = page.locator(".organizer-event-list");
      await eventList.getByRole("button", { name: "Duplicate" }).first().click();
      await page.getByText(/Copy · Draft|Copy 2 · Draft|Copy 3 · Draft/).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Organizer Home" }).click();
      await eventList.waitFor({ timeout: 10000 });
      await eventList.getByRole("button", { name: "Archive" }).first().click();
      await page.getByRole("button", { name: "Archived" }).click();
      await eventList.getByRole("button", { name: "Restore" }).first().click();
      return "Duplicate, archive, archived filter, and restore actions work";
    });
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await Promise.all([
      fs.unlink(files.csvPath).catch(() => {}),
      fs.unlink(files.gpxPath).catch(() => {})
    ]);
  }
}

console.log("Trailnesia Organizer Deep UAT");
console.log(`Dashboard URL: ${dashboardUrl}`);
console.log("");

await runDeepOrganizerAudit();

console.log("");
console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  process.exitCode = 1;
}
