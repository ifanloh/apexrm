const requiredApiEnv = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CORS_ORIGIN"
];

const optionalApiEnv = [
  "SUPABASE_JWT_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID"
];

const requiredVercelEnv = [
  "VITE_API_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
];

function printGroup(title, entries) {
  console.log(`\n${title}`);
  for (const entry of entries) {
    console.log(`- ${entry}`);
  }
}

const missingApi = requiredApiEnv.filter((key) => !process.env[key]);
const missingVercel = requiredVercelEnv.filter((key) => !process.env[key]);

printGroup("API required env", requiredApiEnv.map((key) => `${key}=${process.env[key] ? "SET" : "MISSING"}`));
printGroup("API optional env", optionalApiEnv.map((key) => `${key}=${process.env[key] ? "SET" : "EMPTY"}`));
printGroup("Vercel env", requiredVercelEnv.map((key) => `${key}=${process.env[key] ? "SET" : "MISSING"}`));

if (missingApi.length > 0 || missingVercel.length > 0) {
  console.error("\nDeploy check failed.");
  if (missingApi.length > 0) {
    console.error(`Missing API env: ${missingApi.join(", ")}`);
  }
  if (missingVercel.length > 0) {
    console.error(`Missing Vercel env: ${missingVercel.join(", ")}`);
  }
  process.exit(1);
}

console.log("\nDeploy check passed.");
