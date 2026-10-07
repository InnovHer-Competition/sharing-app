import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AuthResponse, Role } from "@pcos/shared";
import { ErrorAlert } from "../components/Layout";
import { Icon } from "../components/Icon";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasWallet, signWalletChallenge } from "../lib/wallet";

const DEMO_ACCOUNTS = [
  { email: "anna@demo.health", label: "Patient" },
  { email: "dr.le@demo.health", label: "Doctor" },
  { email: "research@demo.health", label: "Researcher" },
];
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== "false";

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="brand" style={{ color: "#fff", padding: 0 }}>
          <span className="brand-mark" style={{ background: "#fff", color: "#5b2a7a" }}>
            PH
          </span>
          PCOS Health Ledger
        </div>
        <div>
          <h1>Your PCOS health record, shared only on your terms.</h1>
          <ul>
            <li>Patients own their records and choose which doctors can see them.</li>
            <li>Doctors add visits and follow trends for the patients who granted access.</li>
            <li>Researchers study de-identified data from patients who opted in.</li>
            <li>Every change is fingerprinted on a tamper-evident ledger.</li>
          </ul>
        </div>
        <small style={{ opacity: 0.75 }}>Decision support only. Not a substitute for medical advice.</small>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}

function useFinishAuth() {
  const { accept } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  return (auth: AuthResponse) => {
    accept(auth);
    navigate(from, { replace: true });
  };
}

export function SignIn() {
  const finish = useFinishAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<AuthResponse>) {
    setBusy(true);
    setError(undefined);
    try {
      finish(await action());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.signIn(email, password));
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} aria-labelledby="signin-title">
        <div>
          <h1 id="signin-title">Sign in</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </div>
        <ErrorAlert message={error} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="divider">or</div>
        <button
          className="btn btn-block"
          type="button"
          disabled={busy || !hasWallet()}
          title={hasWallet() ? undefined : "Install MetaMask to sign in with a wallet"}
          onClick={() =>
            run(async () => {
              const { address, signature } = await signWalletChallenge();
              return api.walletSignIn(address, signature);
            })
          }
        >
          <Icon name="wallet" /> Sign in with wallet
        </button>
        {SHOW_DEMO && (
          <p className="demo-accounts">
            Demo accounts (password <code>Demo1234!</code>):{" "}
            {DEMO_ACCOUNTS.map((a, i) => (
              <span key={a.email}>
                {i > 0 && " · "}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("Demo1234!");
                  }}
                >
                  {a.label}
                </button>
              </span>
            ))}
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

const ROLES: { value: Role; label: string }[] = [
  { value: "patient", label: "Patient" },
  { value: "doctor", label: "Doctor" },
  { value: "researcher", label: "Researcher" },
];

export function SignUp() {
  const finish = useFinishAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", role: "patient" as Role });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      finish(await api.signUp({ name: form.name, email: form.email, password: form.password, role: form.role }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} aria-labelledby="signup-title">
        <div>
          <h1 id="signup-title">Create your account</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Already registered? <Link to="/signin">Sign in</Link>
          </p>
        </div>
        <ErrorAlert message={error} />
        <div className="field">
          <span className="label" id="role-label">
            I am a
          </span>
          <div className="role-picker" role="radiogroup" aria-labelledby="role-label">
            {ROLES.map((r) => (
              <label key={r.value} className="role-option">
                <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={set("role")} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" required value={form.name} onChange={set("name")} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.password}
            onChange={set("password")}
          />
          <span className="hint">At least 8 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
          You can link a crypto wallet from your account page after signing up.
        </p>
      </form>
    </AuthLayout>
  );
}
