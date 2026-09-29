import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as auth from "../services/auth";
import { LOGOUT_EVENT, tokenStore } from "../services/api";

interface AuthState {
  isAuthenticated: boolean;
  user: auth.Me | null;
  isAdmin: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthed] = useState(() => tokenStore.get() !== null);
  const [user, setUser] = useState<auth.Me | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await auth.fetchMe());
    } catch {
      /* a 401 already triggers the logout event */
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refreshUser();
    else setUser(null);
  }, [isAuthenticated, refreshUser]);

  // Expired session (refresh failed): drop to the login screen.
  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  const signIn = async (username: string, password: string) => {
    await auth.login(username, password);
    setAuthed(true);
  };
  const signOut = () => {
    auth.logout();
    setAuthed(false);
  };

  return <AuthContext value={{ isAuthenticated, user, isAdmin: user?.user_type === "ADMIN", signIn, signOut, refreshUser }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
