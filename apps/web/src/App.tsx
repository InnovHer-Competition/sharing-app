import { lazy, type ReactNode, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "@pcos/shared";
import { Layout, Loading } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { Account } from "./pages/Account";
import { SignIn, SignUp } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Ledger } from "./pages/Ledger";
import { EditRecord, NewRecord, Records } from "./pages/Records";
import { Sharing } from "./pages/Sharing";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="main"><Loading /></div>;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? children : <Navigate to="/dashboard" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

// The chat UI is the heaviest page, so it loads on demand.
const Assistant = lazy(() => import("./pages/Assistant").then((m) => ({ default: m.Assistant })));

const clinical: Role[] = ["patient", "doctor"];

export default function App() {
  return (
    // Hash routing keeps deep links working on static hosting such as GitHub Pages.
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
          <Route path="/signup" element={<GuestOnly><SignUp /></GuestOnly>} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/records" element={<RequireRole roles={clinical}><Records /></RequireRole>} />
            <Route path="/records/new" element={<RequireRole roles={clinical}><NewRecord /></RequireRole>} />
            <Route path="/records/:id/edit" element={<RequireRole roles={clinical}><EditRecord /></RequireRole>} />
            <Route path="/sharing" element={<RequireRole roles={clinical}><Sharing /></RequireRole>} />
            <Route path="/assistant" element={<Suspense fallback={<Loading />}><Assistant /></Suspense>} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
