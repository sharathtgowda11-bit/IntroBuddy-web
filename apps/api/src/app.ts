import express, { type Express } from "express";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { invitationsRouter } from "./routes/invitations.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use("/invitations", invitationsRouter);
  return app;
}
