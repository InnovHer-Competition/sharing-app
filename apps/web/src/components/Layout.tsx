import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { Role } from "@pcos/shared";
import { useAuth, useUser } from "../lib/auth";
import { Icon, type IconName } from "./Icon";

export const APP_NAME = "Sharing App PCOS";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/assistant", label: "Smart assistant", icon: "chat" },
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/records", label: "Health records", icon: "records" },
  { to: "/account", label: "Account", icon: "account" },
];

export const ROLE_LABEL: Record<Role, string> = { patient: "Patient", doctor: "Doctor" };

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
        <NavLink to="/assistant" className="brand">
          <span className="brand-mark">PC</span>
          {APP_NAME}
        </NavLink>
        {NAV.map((n) => (
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
          <strong>{APP_NAME}</strong>
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
