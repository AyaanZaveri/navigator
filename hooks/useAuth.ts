"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { StremioUser } from "@/types/stremio";

interface AuthState {
    user: StremioUser | null;
    timestamp: number | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

/** The browser receives a public profile, never the Stremio bearer credential. */
export function useAuth() {
    const [authState, setAuthState] = useState<AuthState>({ user: null, timestamp: null, isAuthenticated: false, isLoading: true });
    const pending = useRef<AbortController | null>(null);
    const refreshAuthData = useCallback(async () => {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        try {
            const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
            if (!response.ok && response.status !== 401) throw new Error("Session unavailable");
            const { user, timestamp } = await response.json();
            if (!controller.signal.aborted) setAuthState({ user, timestamp, isAuthenticated: !!user, isLoading: false });
        } catch {
            if (!controller.signal.aborted) setAuthState(previous => ({ ...previous, isLoading: false }));
        }
    }, []);
    // Login is performed on the server; this compatibility callback refreshes only the profile.
    const login = useCallback((_user?: StremioUser) => { void refreshAuthData(); }, [refreshAuthData]);
    const logout = useCallback(async () => {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        if (!response.ok) throw new Error("Could not sign out. Try again.");
        pending.current?.abort();
        setAuthState({ user: null, timestamp: null, isAuthenticated: false, isLoading: false });
        // A full navigation drops retained account/RSC state after the API clears its HttpOnly cookie.
        window.location.replace(new URL("/", window.location.origin).href);
    }, []);
    const isTokenExpired = useCallback(() => !authState.timestamp || Date.now() - authState.timestamp > 30 * 24 * 60 * 60 * 1000, [authState.timestamp]);
    useEffect(() => {
        let disposed = false;
        queueMicrotask(() => { if (!disposed) void refreshAuthData(); });
        const refresh = () => { void refreshAuthData(); };
        const interval = window.setInterval(refresh, 60_000);
        window.addEventListener("focus", refresh);
        return () => { disposed = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); pending.current?.abort(); };
    }, [refreshAuthData]);
    return { ...authState, login, logout, refreshAuthData, isTokenExpired };
}
