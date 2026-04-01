import { createServer } from "vite";
import * as XLSX from "xlsx";

const checks = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCheck(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function clone(value) {
  return structuredClone(value);
}

const server = await createServer({
  configFile: "apps/dashboard/vite.config.ts",
  root: "apps/dashboard",
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] }
});

try {
  const organizerSetup = await server.ssrLoadModule("/src/organizerSetup.ts");
  const organizerSimulation = await server.ssrLoadModule("/src/organizerSimulation.ts");
  const organizerWorkflow = await server.ssrLoadModule("/src/organizerWorkflow.ts");

  const {
    createDefaultOrganizerSetup,
    createDemoOrganizerSetup,
    createParticipantImportTemplateCsv,
    createParticipantImportTemplateWorkbook,
    createOrganizerInviteCode,
    parseParticipantImportFile,
    parseParticipantImportRows,
    parseParticipantImportText
  } = organizerSetup;
  const {
    buildOrganizerRaceSimulationSnapshot,
    buildOrganizerTrialScenario,
    seedOrganizerTrialSetup,
    shouldAutoSeedOrganizerTrial
  } = organizerSimulation;
  const {
    appendOrganizerSimulatedScan,
    applyParticipantImportMode,
    calculateParticipantImportImpact
  } = organizerWorkflow;

  const baseSetup = createDefaultOrganizerSetup();
  const demoSetup = createDemoOrganizerSetup();
  const seededSetup = seedOrganizerTrialSetup(clone(demoSetup));
  const liveRace = seededSetup.races.find((race) => race.editionLabel.toLowerCase() === "live") ?? seededSetup.races[0];
  const finishedRace = seededSetup.races.find((race) => race.editionLabel.toLowerCase() === "finished") ?? seededSetup.races[1];

  await runCheck("default organizer setup starts empty", () => {
    assert(baseSetup.races.length === 0, "expected first-time organizer setup to start without races");
  });

  await runCheck("empty organizer setup does not auto-seed", () => {
    assert(shouldAutoSeedOrganizerTrial(baseSetup) === false, "blank organizer setup should stay empty");
  });

  await runCheck("demo organizer setup contains seeded demo races", () => {
    assert(demoSetup.races.length >= 3, "expected at least 3 organizer demo races");
    assert(demoSetup.races.every((race) => race.checkpoints.length >= 3), "every demo race should have 3+ checkpoints");
  });

  await runCheck("demo organizer workspace is eligible for trial seeding", () => {
    assert(shouldAutoSeedOrganizerTrial(demoSetup) === true, "demo organizer setup should be eligible for trial seeding");
  });

  await runCheck("auto-seed populates participants, crew, and simulated scans", () => {
    assert(shouldAutoSeedOrganizerTrial(seededSetup) === false, "seeded setup should no longer be blank");
    seededSetup.races.forEach((race) => {
      assert(race.participants.length >= 8, `race ${race.slug} should have sample participants`);
      assert(race.crewAssignments.length === race.checkpoints.length, `race ${race.slug} should have one crew per checkpoint`);
      assert(race.crewAssignments.every((crew) => crew.role === "scan"), `race ${race.slug} should only use scan crew`);
      assert(race.simulatedScans.length > 0, `race ${race.slug} should have simulated scans`);
    });
  });

  await runCheck("trial scenario for live race includes accepted and duplicate scans", () => {
    const scenario = buildOrganizerTrialScenario(liveRace);
    assert(scenario.some((scan) => scan.status === "accepted"), "live trial scenario should contain accepted scans");
    assert(scenario.some((scan) => scan.status === "duplicate"), "live trial scenario should contain a duplicate scan");
  });

  await runCheck("trial scenario for finished race includes finish scans", () => {
    const scenario = buildOrganizerTrialScenario(finishedRace);
    assert(
      scenario.some((scan) => scan.status === "accepted" && scan.checkpointId === "finish"),
      "finished trial scenario should include accepted finish scans"
    );
  });

  await runCheck("simulation snapshot produces leaderboard, duplicates, and checkpoint boards", () => {
    const snapshot = buildOrganizerRaceSimulationSnapshot(liveRace);
    assert(snapshot.overallLeaderboard.totalRankedRunners >= 3, "snapshot should rank at least 3 runners");
    assert(snapshot.duplicateCount >= 1, "snapshot should expose duplicate scans");
    assert(snapshot.checkpointLeaderboards.length === liveRace.checkpoints.length, "snapshot should build a board per checkpoint");
    assert(snapshot.notifications.length >= 1, "snapshot should generate notifications");
  });

  await runCheck("participant import CSV template uses required headers", () => {
    const headerLine = createParticipantImportTemplateCsv().split(/\r?\n/)[0];
    assert(headerLine === "bib,name,gender,country,club", "CSV template header mismatch");
  });

  await runCheck("participant import workbook can be generated", async () => {
    const workbook = await createParticipantImportTemplateWorkbook();
    assert(workbook.SheetNames.includes("Participants"), "workbook should include Participants sheet");
  });

  await runCheck("CSV import preview catches duplicates and parses valid rows", () => {
    const csv = [
      "bib,name,gender,country,club",
      "A01,Runner One,men,id,Club Alpha",
      "A02,Runner Two,women,sg,Club Beta",
      "A02,Runner Two,women,sg,Club Beta"
    ].join("\n");
    const preview = parseParticipantImportText(csv);
    assert(preview.totalRows === 3, "preview should count 3 uploaded rows");
    assert(preview.validRows === 2, "preview should keep 2 valid rows");
    assert(preview.duplicateBibs === 1, "preview should count 1 duplicate bib");
    assert(preview.sampleErrors.some((line) => line.includes("duplicate bib A02")), "duplicate error should be reported");
  });

  await runCheck("CSV import rows normalize gender and country", () => {
    const csv = [
      "bib,name,gender,country,club",
      "A01,Runner One,men,id,Club Alpha",
      "A02,Runner Two,female,sg,Club Beta"
    ].join("\n");
    const participants = parseParticipantImportRows(csv);
    assert(participants.length === 2, "should parse 2 participants");
    assert(participants[0].countryCode === "ID", "country should normalize to uppercase");
    assert(participants[1].gender === "women", "female should normalize to women");
  });

  await runCheck("import parser rejects missing required columns", () => {
    const csv = ["number,runner", "1,Someone"].join("\n");
    const preview = parseParticipantImportText(csv);
    assert(preview.validRows === 0, "missing headers should not create valid rows");
    assert(preview.sampleErrors.length >= 1, "missing headers should raise an error");
  });

  await runCheck("participant import file parser supports CSV uploads", async () => {
    const file = new File(
      [["bib,name,gender,country,club", "B01,Runner File,men,id,Club File"].join("\n")],
      "participants.csv",
      { type: "text/csv" }
    );
    const parsed = await parseParticipantImportFile(file);
    assert(parsed?.fileName === "participants.csv", "CSV parser should preserve file name");
    assert(parsed?.text.includes("Runner File"), "CSV parser should return file text");
  });

  await runCheck("participant import file parser supports Excel uploads", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["bib", "name", "gender", "country", "club"],
      ["X01", "Runner Excel", "women", "MY", "Club Workbook"]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Participants");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const file = new File([buffer], "participants.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const parsed = await parseParticipantImportFile(file);
    assert(parsed?.fileName === "participants.xlsx", "Excel parser should preserve file name");
    assert(parsed?.text.includes("Runner Excel"), "Excel parser should convert first sheet to CSV text");
  });

  await runCheck("import impact summary counts new, updated, and unchanged rows", () => {
    const existing = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" },
      { bib: "A02", name: "Runner Two", gender: "women", countryCode: "SG", club: "Club B" }
    ];
    const incoming = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" },
      { bib: "A02", name: "Runner Two Updated", gender: "women", countryCode: "SG", club: "Club B" },
      { bib: "A03", name: "Runner Three", gender: "men", countryCode: "MY", club: "Club C" }
    ];
    const impact = calculateParticipantImportImpact(existing, incoming);
    assert(impact.newRows === 1, "impact should count one new row");
    assert(impact.updatedRows === 1, "impact should count one updated row");
    assert(impact.unchangedRows === 1, "impact should count one unchanged row");
  });

  await runCheck("import mode add only appends missing BIBs", () => {
    const existing = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" },
      { bib: "A02", name: "Runner Two", gender: "women", countryCode: "SG", club: "Club B" }
    ];
    const incoming = [
      { bib: "A02", name: "Changed Name", gender: "women", countryCode: "SG", club: "Club B" },
      { bib: "A03", name: "Runner Three", gender: "men", countryCode: "MY", club: "Club C" }
    ];
    const result = applyParticipantImportMode(existing, incoming, "add");
    assert(result.length === 3, "add mode should append only missing BIBs");
    assert(result.find((item) => item.bib === "A02")?.name === "Runner Two", "add mode should not update existing BIB");
  });

  await runCheck("import mode update only modifies existing BIBs", () => {
    const existing = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" },
      { bib: "A02", name: "Runner Two", gender: "women", countryCode: "SG", club: "Club B" }
    ];
    const incoming = [
      { bib: "A02", name: "Changed Name", gender: "women", countryCode: "SG", club: "Club B" },
      { bib: "A03", name: "Runner Three", gender: "men", countryCode: "MY", club: "Club C" }
    ];
    const result = applyParticipantImportMode(existing, incoming, "update");
    assert(result.length === 2, "update mode should not append new BIBs");
    assert(result.find((item) => item.bib === "A02")?.name === "Changed Name", "update mode should overwrite existing BIB");
  });

  await runCheck("import mode merge adds new BIBs and updates existing ones", () => {
    const existing = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" },
      { bib: "A02", name: "Runner Two", gender: "women", countryCode: "SG", club: "Club B" }
    ];
    const incoming = [
      { bib: "A02", name: "Changed Name", gender: "women", countryCode: "SG", club: "Club B" },
      { bib: "A03", name: "Runner Three", gender: "men", countryCode: "MY", club: "Club C" }
    ];
    const result = applyParticipantImportMode(existing, incoming, "merge");
    assert(result.length === 3, "merge mode should keep existing and append new BIBs");
    assert(result.find((item) => item.bib === "A02")?.name === "Changed Name", "merge mode should update existing BIB");
  });

  await runCheck("import mode replace swaps the full race roster", () => {
    const existing = [
      { bib: "A01", name: "Runner One", gender: "men", countryCode: "ID", club: "Club A" }
    ];
    const incoming = [
      { bib: "B01", name: "Runner Two", gender: "women", countryCode: "SG", club: "Club B" }
    ];
    const result = applyParticipantImportMode(existing, incoming, "replace");
    assert(result.length === 1 && result[0].bib === "B01", "replace mode should use incoming roster only");
  });

  await runCheck("appendOrganizerSimulatedScan blocks unknown participants", () => {
    const nextRace = appendOrganizerSimulatedScan(liveRace, {
      bib: "UNKNOWN",
      checkpointId: liveRace.checkpoints[0].id,
      crewAssignmentId: liveRace.crewAssignments[0].id,
      id: "invalid-bib"
    });
    assert(nextRace.simulatedScans.length === liveRace.simulatedScans.length, "unknown BIB should not create a scan");
  });

  await runCheck("appendOrganizerSimulatedScan blocks crew assigned to another checkpoint", () => {
    const firstCheckpoint = liveRace.checkpoints[0];
    const mismatchedCrew = liveRace.crewAssignments.find((crew) => crew.checkpointId !== firstCheckpoint.id);
    assert(mismatchedCrew, "test needs a mismatched crew");
    const nextRace = appendOrganizerSimulatedScan(liveRace, {
      bib: liveRace.participants[0].bib,
      checkpointId: firstCheckpoint.id,
      crewAssignmentId: mismatchedCrew.id,
      id: "mismatch"
    });
    assert(nextRace.simulatedScans.length === liveRace.simulatedScans.length, "crew mismatch should not create a scan");
  });

  await runCheck("appendOrganizerSimulatedScan creates accepted scan then duplicate", () => {
    const race = {
      ...liveRace,
      simulatedScans: []
    };
    const checkpointId = race.checkpoints[1]?.id ?? race.checkpoints[0].id;
    const crewAssignmentId = race.crewAssignments.find((crew) => crew.checkpointId === checkpointId)?.id;
    assert(crewAssignmentId, "test needs crew assigned to selected checkpoint");
    const first = appendOrganizerSimulatedScan(race, {
      bib: race.participants[0].bib,
      checkpointId,
      crewAssignmentId,
      id: "accepted-1",
      scannedAt: "2026-01-01T00:00:00.000Z"
    });
    assert(first.simulatedScans.length === 1, "first scan should be recorded");
    assert(first.simulatedScans[0].status === "accepted", "first scan should be accepted");
    const second = appendOrganizerSimulatedScan(first, {
      bib: race.participants[0].bib,
      checkpointId,
      crewAssignmentId,
      id: "duplicate-1",
      scannedAt: "2026-01-01T00:01:00.000Z"
    });
    assert(second.simulatedScans.length === 2, "second scan should also be recorded");
    assert(second.simulatedScans[1].status === "duplicate", "second scan should be marked duplicate");
    assert(second.simulatedScans[1].firstAcceptedId === "accepted-1", "duplicate should reference first accepted scan");
  });

  await runCheck("invite code generator yields race-scoped token", () => {
    const code = createOrganizerInviteCode("mantra-116-ultra", 123);
    assert(code.startsWith("MAN116ULT-"), "invite code should include a race-scoped prefix");
  });
} finally {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await server.close();
}

const passed = checks.filter((check) => check.ok).length;
const failed = checks.filter((check) => !check.ok);

console.log(`Organizer trial QA: ${passed}/${checks.length} checks passed.`);
checks.forEach((check) => {
  if (check.ok) {
    console.log(`PASS ${check.name}`);
  } else {
    console.log(`FAIL ${check.name}: ${check.error}`);
  }
});

if (failed.length > 0) {
  process.exitCode = 1;
}
