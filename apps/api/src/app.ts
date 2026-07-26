import express, { type Express } from "express";
import { alumniRouter } from "./routes/alumni.js";
import { alumniDirectoryRouter } from "./routes/alumniDirectory.js";
import { auditLogRouter } from "./routes/auditLog.js";
import { authRouter } from "./routes/auth.js";
import { collegesRouter } from "./routes/colleges.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { degreesRouter } from "./routes/degrees.js";
import { departmentsRouter } from "./routes/departments.js";
import { healthRouter } from "./routes/health.js";
import { importJobsRouter } from "./routes/importJobs.js";
import { invitationsRouter } from "./routes/invitations.js";
import { meRouter } from "./routes/me.js";
import { opportunitiesRouter } from "./routes/opportunities.js";
import { requestsRouter } from "./routes/requests.js";
import { studentsRouter } from "./routes/students.js";

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
  app.use("/students", studentsRouter);
  app.use("/alumni", alumniRouter);
  app.use("/alumni-directory", alumniDirectoryRouter);
  app.use("/opportunities", opportunitiesRouter);
  app.use("/requests", requestsRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/audit-log", auditLogRouter);
  return app;
}
