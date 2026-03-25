import { rm } from "node:fs/promises";

const targets = [
  "apps/api/dist",
  "apps/dashboard/dist",
  "apps/scanner/dist",
  "packages/contracts/dist"
];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
}

console.log("Cleaned build artifacts.");
