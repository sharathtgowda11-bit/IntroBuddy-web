import { getPool } from "@introbuddy/db";
import type { NextFunction, Request, Response } from "express";
import { recordHit } from "../db/rateLimits.js";

export interface RateLimitOptions {
  /** Identifies the bucket to count against -- e.g. `login:<ip>`. Keep it per-route so limits don't bleed across endpoints. */
  keyFn: (req: Request) => string;
  limit: number;
  windowSeconds: number;
}

/** Spec 14.1 #14: rate limiting on login, reset, and activation endpoints. */
export function rateLimit({ keyFn, limit, windowSeconds }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bucket = keyFn(req);
    const hitCount = await recordHit(getPool(), bucket, windowSeconds);
    if (hitCount > limit) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    next();
  };
}
