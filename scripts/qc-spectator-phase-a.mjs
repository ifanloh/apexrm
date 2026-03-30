import https from "node:https";

const config = {
  dashboardUrl: (process.env.QC_DASHBOARD_URL ?? "https://apexrm-dashboard.vercel.app").replace(/\/+$/, ""),
  apiBaseUrl: (process.env.QC_API_BASE_URL ?? "https://apexrm-api.vercel.app/api").replace(/\/+$/, "")
};

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

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      body
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

async function main() {
  const dashboardHtml = await get(config.dashboardUrl);
  const dashboardBundlePath = dashboardHtml.body.match(/assets\/index-[^"']+\.js/)?.[0] ?? null;

  if (dashboardHtml.status !== 200 || !dashboardBundlePath) {
    throw new Error("Dashboard HTML or bundle path unavailable.");
  }

  const dashboardBundleUrl = `${config.dashboardUrl}/${dashboardBundlePath}`;
  const dashboardBundle = await fetchText(dashboardBundleUrl, 30000);

  const [overall, leaders, runnerDetail, runnerSearch] = await Promise.all([
    fetchText(`${config.apiBaseUrl}/leaderboard/overall?limit=3`, 15000),
    fetchText(`${config.apiBaseUrl}/leaderboard/live`, 20000),
    fetchText(`${config.apiBaseUrl}/runners/detail?bib=T0243`, 15000),
    fetchText(`${config.apiBaseUrl}/runners/search?q=Arif`, 15000)
  ]);

  const bundleMarkers = [
    "Race Categories",
    "Search a runner",
    "Runners list",
    "Favorites list",
    "My followed runners",
    "Ranking",
    "Race leaders",
    "Statistics",
    "Back to race page",
    "Open Race Live",
    "View Results",
    "Leading"
  ];

  const checks = [
    {
      name: "dashboard html",
      pass: dashboardHtml.status === 200
    },
    {
      name: "dashboard bundle",
      pass: dashboardBundle.ok && dashboardBundle.status === 200
    },
    ...bundleMarkers.map((marker) => ({
      name: `bundle marker: ${marker}`,
      pass: dashboardBundle.body.includes(marker)
    })),
    {
      name: "public overall leaderboard",
      pass: overall.ok && overall.status === 200
    },
    {
      name: "public live leaders",
      pass: leaders.ok && leaders.status === 200
    },
    {
      name: "public runner detail",
      pass: runnerDetail.ok && runnerDetail.status === 200
    },
    {
      name: "public runner search",
      pass: runnerSearch.ok && runnerSearch.status === 200
    }
  ];

  const summary = {
    checkedAt: new Date().toISOString(),
    dashboardUrl: config.dashboardUrl,
    apiBaseUrl: config.apiBaseUrl,
    dashboardBundle: dashboardBundlePath,
    checks
  };

  console.log(JSON.stringify(summary, null, 2));

  if (checks.some((check) => !check.pass)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
