import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannerDir = path.join(repoRoot, "apps", "scanner");
const androidDir = path.join(scannerDir, "android");
const appDir = path.join(androidDir, "app");
const homeDir = os.homedir();
const altixDir = path.join(homeDir, ".altix", "android");
const signingJsonPath = path.join(altixDir, "release-signing.json");
const keystorePath = path.join(altixDir, "altix-upload-keystore.jks");
const downloadsDir = path.join(homeDir, "Downloads");
const releaseApkPath = path.join(appDir, "build", "outputs", "apk", "release", "app-release.apk");
const distributedApkPath = path.join(downloadsDir, "Altix-Timing-release.apk");

function randomSecret(length = 24) {
  return randomBytes(length).toString("base64url");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout || `${command} failed with exit code ${code}`).trim()));
    });
  });
}

function loadOrCreateSigningConfig() {
  mkdirSync(altixDir, { recursive: true });

  if (existsSync(signingJsonPath)) {
    const existing = JSON.parse(readFileSync(signingJsonPath, "utf8"));
    const normalized = {
      ...existing,
      keyAlias: existing.keyAlias || "altix-upload",
      keyPassword: existing.storePassword
    };
    writeFileSync(signingJsonPath, JSON.stringify(normalized, null, 2));
    return normalized;
  }

  const config = {
    storeFile: keystorePath,
    storePassword: randomSecret(),
    keyAlias: "altix-upload",
    keyPassword: null,
    dname: "CN=Altix Timing, OU=Race Ops, O=Altix, L=Malang, S=East Java, C=ID"
  };

  config.keyPassword = config.storePassword;

  writeFileSync(signingJsonPath, JSON.stringify(config, null, 2));
  return config;
}

async function ensureKeystore(config) {
  if (existsSync(config.storeFile)) {
    return;
  }

  await run("keytool", [
    "-genkeypair",
    "-v",
    "-keystore",
    config.storeFile,
    "-storepass",
    config.storePassword,
    "-alias",
    config.keyAlias,
    "-keypass",
    config.keyPassword,
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "3650",
    "-dname",
    config.dname
  ]);
}

async function main() {
  const signing = loadOrCreateSigningConfig();
  await ensureKeystore(signing);

  await run("npm.cmd", ["run", "cap:android", "--workspace", "@arm/scanner"], {
    cwd: repoRoot,
    shell: true
  });

  const env = {
    ...process.env,
    ALTIX_UPLOAD_STORE_FILE: signing.storeFile,
    ALTIX_UPLOAD_STORE_PASSWORD: signing.storePassword,
    ALTIX_UPLOAD_KEY_ALIAS: signing.keyAlias,
    ALTIX_UPLOAD_KEY_PASSWORD: signing.keyPassword
  };

  await run(".\\gradlew.bat", ["assembleRelease"], {
    cwd: androidDir,
    env,
    shell: true
  });

  if (!existsSync(releaseApkPath)) {
    throw new Error(`Release APK not found at ${releaseApkPath}`);
  }

  mkdirSync(downloadsDir, { recursive: true });
  copyFileSync(releaseApkPath, distributedApkPath);

  const verifyResult = await run("jarsigner", ["-verify", "-verbose", "-certs", releaseApkPath], {
    cwd: androidDir
  });
  const hash = createHash("sha256").update(readFileSync(releaseApkPath)).digest("hex").toUpperCase();

  console.log("");
  console.log("Altix Timing release APK siap.");
  console.log(`APK: ${releaseApkPath}`);
  console.log(`Copied: ${distributedApkPath}`);
  console.log(`SHA-256: ${hash}`);
  console.log(`Signer verification: ${verifyResult.stdout.includes("jar verified.") ? "PASS" : "CHECK OUTPUT"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
