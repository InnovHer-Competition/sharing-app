import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthResponse, PublicUser } from "@pcos/shared";
import { api, setUnauthorizedHandler, tokenStore } from "./api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  /** Stores the session returned by sign-in / sign-up. */
  accept: (auth: AuthResponse) => void;
  setUser: (user: PublicUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(signOut)
      .finally(() => setLoading(false));
  }, [signOut]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      accept: ({ token, user }) => {
        tokenStore.set(token);
        setUser(user);
      },
      setUser,
      signOut,
    }),
    [user, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For pages behind <RequireAuth>, where a user is always present. */
export function useUser(): PublicUser {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}
