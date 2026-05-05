import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "../lib/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=anon, obj=auth
  const [error, setError] = useState("");

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) { setUser(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("auth_token");
      setUser(false);
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("auth_token", data.token);
      setUser({ id: data.id, email: data.email, name: data.name });
      return true;
    } catch (e) { setError(formatApiError(e)); return false; }
  };

  const register = async (email, password, name) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", { email, password, name });
      localStorage.setItem("auth_token", data.token);
      setUser({ id: data.id, email: data.email, name: data.name });
      return true;
    } catch (e) { setError(formatApiError(e)); return false; }
  };

  const logout = async () => {
    localStorage.removeItem("auth_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, error, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
