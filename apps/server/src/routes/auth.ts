import { Router } from "express";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { z } from "zod";
import type { AuthResponse } from "@pcos/shared";
import { authenticate, currentUser, issueToken } from "../auth.ts";
import { hashPassword, randomId, randomToken, verifyPassword } from "../crypto.ts";
import type { Database, UserRow } from "../db.ts";
import { toPublicUser } from "../db.ts";
import { badRequest, HttpError, parseBody, rateLimit } from "../http.ts";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.email("Please enter a valid email address.").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  role: z.enum(["patient", "doctor", "researcher"]),
});

const signInSchema = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string(),
});

const walletSchema = z.object({
  address: z.string().refine(isAddress, "Not a valid wallet address."),
  signature: z.string().min(1),
});

const NONCE_TTL_MS = 5 * 60_000;
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
      researchConsent: input.role === "patient" ? false : undefined,
      createdAt: new Date().toISOString(),
    };
    db.transact(
      { type: "USER_REGISTERED", actorId: user.id, subjectId: user.id, payload: { id: user.id, email: user.email, role: user.role } },
      () => db.insertUser(user),
    );
    res.status(201).json(await respond(user));
  });

  router.post("/signin", limiter, async (req, res) => {
    const { email, password } = parseBody(signInSchema, req.body);
    const user = db.userByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
    res.json(await respond(user));
  });

  /** Step 1 of wallet sign-in/linking: get a one-time message to sign. */
  router.get("/wallet/nonce", limiter, (req, res) => {
    const address = String(req.query.address ?? "");
    if (!isAddress(address)) throw badRequest("Not a valid wallet address.");
    const message = [
      "PCOS Health Ledger wants you to sign in with your Ethereum account:",
      getAddress(address),
      "",
      `Nonce: ${randomToken()}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
    db.saveNonce(address, message, NONCE_TTL_MS);
    res.json({ message });
  });

  const verifyWallet = (body: unknown) => {
    const { address, signature } = parseBody(walletSchema, body);
    const message = db.takeNonce(address);
    if (!message) throw badRequest("Sign-in request expired. Please try again.");
    let signer: string;
    try {
      signer = verifyMessage(message, signature);
    } catch {
      throw new HttpError(401, "Signature could not be verified.");
    }
    if (signer.toLowerCase() !== address.toLowerCase()) throw new HttpError(401, "Signature does not match this wallet.");
    return address.toLowerCase();
  };

  /** Step 2: sign in with a wallet that is already linked to an account. */
  router.post("/wallet", limiter, async (req, res) => {
    const address = verifyWallet(req.body);
    const user = db.userByWallet(address);
    if (!user) throw new HttpError(404, "No account is linked to this wallet yet. Sign in with email first, then link it.");
    res.json(await respond(user));
  });

  /** Link a wallet to the signed-in account. */
  router.post("/wallet/link", authenticate(db), limiter, (req, res) => {
    const user = currentUser(req);
    const address = verifyWallet(req.body);
    const owner = db.userByWallet(address);
    if (owner && owner.id !== user.id) throw new HttpError(409, "This wallet is already linked to another account.");
    db.transact({ type: "WALLET_LINKED", actorId: user.id, subjectId: user.id, payload: { userId: user.id, address } }, () =>
      db.setWallet(user.id, address),
    );
    res.json({ user: toPublicUser(db.userById(user.id)!) });
  });

  router.get("/me", authenticate(db), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return router;
}
