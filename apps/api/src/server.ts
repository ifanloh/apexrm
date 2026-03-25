import { closeDb } from "./db.js";
import { config } from "./config.js";
import { createServer } from "./app.js";

const server = await createServer();

const closeServer = async (signal: string) => {
  server.log.info({ signal }, "Shutting down server");
  await server.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => {
  void closeServer("SIGINT");
});

process.on("SIGTERM", () => {
  void closeServer("SIGTERM");
});

server.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
