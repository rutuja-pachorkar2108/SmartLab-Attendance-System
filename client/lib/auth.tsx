"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "./api";

export type Role = "student" | "incharge" | "ta" | "admin";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  roll_no: string | null;
  employee_id: string | null;
  department: string | null;
  class_name: string | null;
  div: string | null;
  prn_no: string | null;
  incharge_courses: string[] | null;
  created_at?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

export type UpdateProfileInput = {
  name?: string;
  email?: string;
  className?: string;
  div?: string;
  rollNo?: string;
  currentPassword?: string;
  newPassword?: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  rollNo?: string;
  employeeId?: string;
  department?: string;
  className?: string;
  div?: string;
  prnNo?: string;
  courses?: string[];
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: User }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
  }, []);

  // Registration intentionally does NOT log the user in. After creating the
  // account the user is sent to the login page to sign in, which then routes
  // them to their role's dashboard. We ignore the token the API returns here.
  const register = useCallback(async (input: RegisterInput) => {
    await api<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }, []);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const data = await api<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, loading, login, register, updateProfile, logout, refresh }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
