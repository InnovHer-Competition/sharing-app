import { Router } from "express";
import { z } from "zod";
import type { AuthResponse } from "@pcos/shared";
import { authenticate, currentUser, issueToken } from "../auth.ts";
import { hashPassword, randomId, randomToken, verifyPassword } from "../crypto.ts";
import type { Database, UserRow } from "../db.ts";
import { toPublicUser } from "../db.ts";
import { HttpError, parseBody, rateLimit } from "../http.ts";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.email("Please enter a valid email address.").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  role: z.enum(["patient", "doctor"]),
});

const signInSchema = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string(),
});

// Used when the email is unknown, so sign-in takes the same time either way.
const DUMMY_HASH = await hashPassword(randomToken());

export function authRouter(db: Database) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 30 });

  const respond = async (user: UserRow): Promise<AuthResponse> => {
    const publicUser = toPublicUser(user);
    return { token: await issueToken(publicUser), user: publicUser };
  };

  router.post("/signup", limiter, async (req, res) => {
    const input = parseBody(signUpSchema, req.body);
    if (db.userByEmail(input.email)) throw new HttpError(409, "An account with this email already exists.");
    const user: UserRow = {
      id: randomId(),
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };
    db.insertUser(user);
    res.status(201).json(await respond(user));
  });

  router.post("/signin", limiter, async (req, res) => {
    const { email, password } = parseBody(signInSchema, req.body);
    const user = db.userByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
    res.json(await respond(user));
  });

  router.get("/me", authenticate(db), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return router;
}
