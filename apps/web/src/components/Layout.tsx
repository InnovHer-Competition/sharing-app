import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { Role } from "@pcos/shared";
import { useAuth, useUser } from "../lib/auth";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; icon: IconName; roles: Role[] }[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ["patient", "doctor", "researcher"] },
  { to: "/records", label: "Health records", icon: "records", roles: ["patient", "doctor"] },
  { to: "/sharing", label: "Sharing & consent", icon: "share", roles: ["patient", "doctor"] },
  { to: "/assistant", label: "Assistant", icon: "chat", roles: ["patient", "doctor", "researcher"] },
  { to: "/ledger", label: "Audit ledger", icon: "ledger", roles: ["patient", "doctor", "researcher"] },
  { to: "/account", label: "Account", icon: "account", roles: ["patient", "doctor", "researcher"] },
];

export const ROLE_LABEL: Record<Role, string> = { patient: "Patient", doctor: "Doctor", researcher: "Researcher" };

export function Layout() {
  const user = useUser();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        <NavLink to="/dashboard" className="brand">
          <span className="brand-mark">PH</span>
          PCOS Health Ledger
        </NavLink>
        {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
          <NavLink key={n.to} to={n.to} className="nav-link">
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          <div className="who">{user.name}</div>
          <div>{ROLE_LABEL[user.role]}</div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={signOut}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div>
        <div className="mobile-bar">
          <button className="btn btn-sm" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="menu" />
          </button>
          <strong>PCOS Health Ledger</strong>
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="muted">{label}</p>;
}
