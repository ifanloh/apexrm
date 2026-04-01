const scannerUrl = (process.env.QC_SCANNER_URL ?? "https://apexrm-scanner.vercel.app").replace(/\/+$/, "");
const apiBaseUrl = (process.env.QC_API_BASE_URL ?? "https://apexrm-api.vercel.app/api").replace(/\/+$/, "");

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url, attempts = 4, timeoutMs = 20000) {
  let last = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await fetchText(url, timeoutMs);
    if (last.ok) {
      return last;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  return last ?? { ok: false, status: 0, body: "No response" };
}

async function main() {
  const scannerHtml = await fetchText(scannerUrl, 20000);
  const bundlePath = scannerHtml.body.match(/assets\/index-[^"']+\.js/)?.[0] ?? null;

  if (!scannerHtml.ok || scannerHtml.status !== 200 || !bundlePath) {
    throw new Error("Scanner HTML or bundle path unavailable.");
  }

  const bundle = await fetchWithRetry(`${scannerUrl}/${bundlePath}`, 3, 25000);
  const checkpoints = await fetchWithRetry(`${apiBaseUrl}/meta/checkpoints`, 4, 20000);

  const bundleMarkers = [
    "Crew Login",
    "Masuk ke Scanner",
    "Input BIB Manual",
    "Withdraw",
    "Scan QR",
    "Checkpoints",
    "Checkpoint locked",
    "Scanner",
    "History",
    "Logout"
  ];

  const checks = [
    { name: "scanner html", pass: scannerHtml.status === 200 },
    { name: "scanner bundle", pass: bundle.ok && bundle.status === 200 },
    ...bundleMarkers.map((marker) => ({
      name: `bundle marker: ${marker}`,
      pass: bundle.body.includes(marker)
    })),
    {
      name: "public checkpoints metadata",
      pass: checkpoints.ok && checkpoints.status === 200
    }
  ];

  const summary = {
    checkedAt: new Date().toISOString(),
    scannerUrl,
    apiBaseUrl,
    scannerBundle: bundlePath,
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
