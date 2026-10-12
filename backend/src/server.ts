import "dotenv/config";
import app from "./app";
import { setupSocketIO } from "./services/presence.service";
import { backfillStoredImages } from "./services/imageStore.service";

const PORT = Number(process.env.PORT) || 3001;
const HOST = "0.0.0.0";

// Keep the process alive on stray async failures instead of crashing.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Morven Backend running on http://${HOST}:${PORT}`);
});

// Socket.IO live presence
setupSocketIO(server);

// Mirror avatar/group images that already exist on disk into the durable store
// so historical avatars survive the next container restart/redeploy. Best
// effort and non-destructive (never moves, deletes or rewrites files).
void backfillStoredImages();

server.on("error", (err) => {
  console.error("Morven Backend failed to start:", err);
  process.exit(1);
});
