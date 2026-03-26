import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const config = {
  apiBaseUrl: (process.env.QC_API_BASE_URL ?? "https://apexrm-api.vercel.app/api").replace(/\/+$/, ""),
  dashboardUrl: (process.env.QC_DASHBOARD_URL ?? "https://apexrm-dashboard.vercel.app").replace(/\/+$/, ""),
  scannerUrl: (process.env.QC_SCANNER_URL ?? "https://apexrm-scanner.vercel.app").replace(/\/+$/, ""),
  supabaseUrl: process.env.QC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  supabaseAnonKey: process.env.QC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  adminEmail: process.env.QC_ADMIN_EMAIL,
  adminPassword: process.env.QC_ADMIN_PASSWORD
};

function assertConfig() {
  const missing = Object.entries({
    QC_SUPABASE_URL: config.supabaseUrl,
    QC_SUPABASE_ANON_KEY: config.supabaseAnonKey,
    QC_ADMIN_EMAIL: config.adminEmail,
    QC_ADMIN_PASSWORD: config.adminPassword
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body
          });
        });
      })
      .on("error", reject);
  });
}

async function fetchJson(url, headers = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      body: text
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - startedAt,
      body: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function toPass(result, maxMs) {
  return result.ok && result.ms <= maxMs;
}

async function main() {
  assertConfig();

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const login = await supabase.auth.signInWithPassword({
    email: config.adminEmail,
    password: config.adminPassword
  });

  if (login.error || !login.data.session?.access_token) {
    throw new Error(`Admin login failed: ${login.error?.message ?? "missing token"}`);
  }

  const token = login.data.session.access_token;

  const [health, me, checkpoints, overall, summary, cp10, recentPassings, duplicates, notifications, dashboardHtml, scannerHtml] =
    await Promise.all([
      fetchJson(`${config.apiBaseUrl.replace(/\/api$/, "")}/health`, {}, 10000),
      fetchJson(`${config.apiBaseUrl}/me`, { Authorization: `Bearer ${token}` }, 10000),
      fetchJson(`${config.apiBaseUrl}/meta/checkpoints`, {}, 10000),
      fetchJson(`${config.apiBaseUrl}/leaderboard/overall`, { Authorization: `Bearer ${token}` }, 12000),
      fetchJson(`${config.apiBaseUrl}/leaderboard/live`, { Authorization: `Bearer ${token}` }, 12000),
      fetchJson(`${config.apiBaseUrl}/leaderboard/live/cp-10`, { Authorization: `Bearer ${token}` }, 15000),
      fetchJson(`${config.apiBaseUrl}/passings/recent`, { Authorization: `Bearer ${token}` }, 12000),
      fetchJson(`${config.apiBaseUrl}/audit/duplicates`, { Authorization: `Bearer ${token}` }, 12000),
      fetchJson(`${config.apiBaseUrl}/notifications`, { Authorization: `Bearer ${token}` }, 12000),
      get(config.dashboardUrl),
      get(config.scannerUrl)
    ]);

  const overallPayload = overall.ok ? JSON.parse(overall.body) : null;
  const topBib = overallPayload?.topEntries?.[0]?.bib ?? null;
  const [runnerSearch, runnerDetail] = await Promise.all([
    fetchJson(`${config.apiBaseUrl}/runners/search?q=T0`, { Authorization: `Bearer ${token}` }, 12000),
    topBib
      ? fetchJson(`${config.apiBaseUrl}/runners/detail?bib=${encodeURIComponent(topBib)}`, { Authorization: `Bearer ${token}` }, 12000)
      : Promise.resolve({ ok: false, status: 0, ms: 0, body: "missing top bib" })
  ]);

  const dashboardBundle = dashboardHtml.body.match(/assets\/index-[^"']+\.js/)?.[0] ?? null;
  const scannerBundle = scannerHtml.body.match(/assets\/index-[^"']+\.js/)?.[0] ?? null;

  const checks = [
    { name: "health", pass: toPass(health, 5000), result: health },
    { name: "auth me", pass: toPass(me, 5000), result: me },
    { name: "meta checkpoints", pass: toPass(checkpoints, 7000), result: checkpoints },
    { name: "overall leaderboard", pass: toPass(overall, 8000), result: overall },
    { name: "checkpoint summary", pass: toPass(summary, 8000), result: summary },
    { name: "cp10 detail", pass: toPass(cp10, 12000), result: cp10 },
    { name: "recent passings", pass: toPass(recentPassings, 8000), result: recentPassings },
    { name: "runner search", pass: toPass(runnerSearch, 8000), result: runnerSearch },
    { name: "runner detail", pass: toPass(runnerDetail, 8000), result: runnerDetail },
    { name: "duplicates feed", pass: toPass(duplicates, 8000), result: duplicates },
    { name: "notifications feed", pass: toPass(notifications, 8000), result: notifications },
    { name: "dashboard html", pass: dashboardHtml.status === 200 && Boolean(dashboardBundle), result: { ...dashboardHtml, bundle: dashboardBundle } },
    { name: "scanner html", pass: scannerHtml.status === 200 && Boolean(scannerBundle), result: { ...scannerHtml, bundle: scannerBundle } }
  ];

  const summaryPayload = {
    checkedAt: new Date().toISOString(),
    apiBaseUrl: config.apiBaseUrl,
    dashboardUrl: config.dashboardUrl,
    scannerUrl: config.scannerUrl,
    dashboardBundle,
    scannerBundle,
    checks: checks.map((check) => ({
      name: check.name,
      pass: check.pass,
      status: check.result.status,
      ms: "ms" in check.result ? check.result.ms : undefined
    }))
  };

  console.log(JSON.stringify(summaryPayload, null, 2));

  if (checks.some((check) => !check.pass)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
