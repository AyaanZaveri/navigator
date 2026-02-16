"use client";

import { useState, useEffect, useCallback } from "react";
import type { StremioUser, StremioAuthData } from "@/types/stremio";

interface AuthState {
  user: (StremioUser & { authKey: string }) | null;
  timestamp: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface UseAuthReturn extends AuthState {
  login: (user: StremioUser & { authKey: string }) => void;
  logout: () => void;
  refreshAuthData: () => void;
  isTokenExpired: () => boolean;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

function parseAuthData(): {
  user: (StremioUser & { authKey: string }) | null;
  timestamp: number | null;
} {
  try {
    const authCookie = getCookie("stremio-auth");
    if (!authCookie) return { user: null, timestamp: null };

    const decoded = decodeURIComponent(authCookie);
    const authData: StremioAuthData = JSON.parse(decoded);

    if (!authData.authKey || !authData.user) {
      return { user: null, timestamp: null };
    }

    return {
      user: { ...authData.user, authKey: authData.authKey },
      timestamp: authData.timestamp || null,
    };
  } catch {
    return { user: null, timestamp: null };
  }
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    timestamp: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshAuthData = useCallback(() => {
    const data = parseAuthData();
    setAuthState({
      user: data.user,
      timestamp: data.timestamp,
      isAuthenticated: !!data.user,
      isLoading: false,
    });
  }, []);

  const login = useCallback((user: StremioUser & { authKey: string }) => {
    const timestamp = Date.now();
    const authData: StremioAuthData = {
      authKey: user.authKey,
      user,
      timestamp,
    };

    const maxAge = 60 * 60 * 24 * 30;
    const cookieOptions = `path=/; max-age=${maxAge}; samesite=lax${
      process.env.NODE_ENV === "production" ? "; secure" : ""
    }`;
    document.cookie = `stremio-auth=${encodeURIComponent(
      JSON.stringify(authData)
    )}; ${cookieOptions}`;

    setAuthState({
      user,
      timestamp,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    document.cookie =
      "stremio-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";

    setAuthState({
      user: null,
      timestamp: null,
      isAuthenticated: false,
      isLoading: false,
    });

    window.location.href = "/login";
  }, []);

  const isTokenExpired = useCallback((): boolean => {
    if (!authState.timestamp) return true;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - authState.timestamp > thirtyDaysMs;
  }, [authState.timestamp]);

  useEffect(() => {
    refreshAuthData();
  }, [refreshAuthData]);

  useEffect(() => {
    const checkCookieChanges = () => {
      const currentAuth = parseAuthData();
      if (
        currentAuth.user?.email !== authState.user?.email ||
        currentAuth.timestamp !== authState.timestamp
      ) {
        refreshAuthData();
      }
    };

    const interval = setInterval(checkCookieChanges, 5000);
    return () => clearInterval(interval);
  }, [refreshAuthData, authState.user?.email, authState.timestamp]);

  return {
    ...authState,
    login,
    logout,
    refreshAuthData,
    isTokenExpired,
  };
}
