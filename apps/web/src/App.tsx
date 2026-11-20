import { lazy, type ReactNode, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout, Loading } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { HOME } from "./lib/routes";
import { Account } from "./pages/Account";
import { SignIn, SignUp } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { EditRecord, NewRecord, Records } from "./pages/Records";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="main"><Loading /></div>;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to={HOME} replace /> : children;
}

// The chat UI is the heaviest page, so it loads on demand.
const Assistant = lazy(() => import("./pages/Assistant").then((m) => ({ default: m.Assistant })));

export default function App() {
  return (
    // Hash routing keeps deep links working on static hosting such as GitHub Pages.
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
          <Route path="/signup" element={<GuestOnly><SignUp /></GuestOnly>} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/assistant" element={<Suspense fallback={<Loading />}><Assistant /></Suspense>} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/records" element={<Records />} />
            <Route path="/records/new" element={<NewRecord />} />
            <Route path="/records/:id/edit" element={<EditRecord />} />
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
