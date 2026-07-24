import express, { type Express } from "express";
import { authRouter } from "./routes/auth.js";
import { collegesRouter } from "./routes/colleges.js";
import { degreesRouter } from "./routes/degrees.js";
import { departmentsRouter } from "./routes/departments.js";
import { healthRouter } from "./routes/health.js";
import { importJobsRouter } from "./routes/importJobs.js";
import { invitationsRouter } from "./routes/invitations.js";
import { meRouter } from "./routes/me.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use("/invitations", invitationsRouter);
  app.use("/colleges", collegesRouter);
  app.use("/degrees", degreesRouter);
  app.use("/departments", departmentsRouter);
  app.use("/import-jobs", importJobsRouter);
  app.use("/me", meRouter);
  return app;
}
