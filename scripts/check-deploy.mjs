const requiredRenderEnv = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CORS_ORIGIN"
];

const optionalRenderEnv = [
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

const missingRender = requiredRenderEnv.filter((key) => !process.env[key]);
const missingVercel = requiredVercelEnv.filter((key) => !process.env[key]);

printGroup("Render required env", requiredRenderEnv.map((key) => `${key}=${process.env[key] ? "SET" : "MISSING"}`));
printGroup("Render optional env", optionalRenderEnv.map((key) => `${key}=${process.env[key] ? "SET" : "EMPTY"}`));
printGroup("Vercel env", requiredVercelEnv.map((key) => `${key}=${process.env[key] ? "SET" : "MISSING"}`));

if (missingRender.length > 0 || missingVercel.length > 0) {
  console.error("\nDeploy check failed.");
  if (missingRender.length > 0) {
    console.error(`Missing Render env: ${missingRender.join(", ")}`);
  }
  if (missingVercel.length > 0) {
    console.error(`Missing Vercel env: ${missingVercel.join(", ")}`);
  }
  process.exit(1);
}

console.log("\nDeploy check passed.");
