import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { PublicUser, Role } from "@pcos/shared";
import { config } from "./config.ts";
import type { Database } from "./db.ts";
import { toPublicUser } from "./db.ts";
import { forbidden, HttpError } from "./http.ts";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

const secret = new TextEncoder().encode(config.jwtSecret);
const ISSUER = "pcos-health-ledger";

export async function issueToken(user: PublicUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(config.jwtTtl)
    .sign(secret);
}

/** Resolves the bearer token to the current user, re-reading the user so revoked/changed data applies at once. */
export function authenticate(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Please sign in.");
    try {
      const { payload } = await jwtVerify(header.slice(7), secret, { issuer: ISSUER, algorithms: ["HS256"] });
      const user = payload.sub ? db.userById(payload.sub) : undefined;
      if (!user) throw new Error("unknown user");
      req.user = toPublicUser(user);
    } catch {
      throw new HttpError(401, "Your session has expired. Please sign in again.");
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** For handlers mounted behind `authenticate`. */
export function currentUser(req: Request): PublicUser {
  if (!req.user) throw new HttpError(401, "Please sign in.");
  return req.user;
}
