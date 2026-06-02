import http from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { startChatRetentionScheduler } from "./jobs/chatRetentionScheduler.js";
import { startReminderScheduler } from "./jobs/reminderScheduler.js";
import { attachInternalChatSockets } from "./sockets/internalChat.socket.js";

const server = http.createServer(app);
attachInternalChatSockets(server);

server.listen(env.PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Mudhro backend listening on port ${env.PORT}`);
  startReminderScheduler();
  startChatRetentionScheduler();
});
