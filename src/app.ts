import cors from "cors";
import express from "express";
import helmet from "helmet";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import { env } from "./config/env.js";

import { errorMiddleware } from "./middlewares/error.middleware.js";
import { agreementPortalRouter } from "./routes/agreementPortal.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { internalJobsRouter } from "./routes/internalJobs.routes.js";
import { organizationRouter } from "./routes/organization.routes.js";
import { publicPortalRouter } from "./routes/publicPortal.routes.js";

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/organizations", organizationRouter);
app.use("/api/internal/jobs", internalJobsRouter);
app.use("/api/auth", authRouter);
app.use("/api/public", publicPortalRouter);
app.use("/api/public/agreements", agreementPortalRouter);

if (env.NODE_ENV !== "production" && env.NODE_ENV !== "test") {
  try {
    const specPath = resolve(process.cwd(), "docs/internal-chat.openapi.yaml");
    const raw = readFileSync(specPath, "utf8");
    const doc = YAML.parse(raw) as Record<string, unknown>;
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(doc));
  } catch {
    /* optional */
  }
}

app.use(errorMiddleware);
