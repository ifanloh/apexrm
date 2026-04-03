import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { User } from "@/organizer-prototype/api";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, user, logout }: { children: ReactNode; user: User | null; logout: () => void }) {
  return <AuthContext.Provider value={{ user, isLoading: false, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}

export function ProtectedRoute({ component: Component, ...rest }: { component: ComponentType<any> }) {
  const { user } = useAuth();
  if (!user) return null;
  return <Component {...rest} />;
}
