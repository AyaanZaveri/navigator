"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieRequiresHttps } from "@/lib/cookie-policy";
import { getAuthData } from "@/lib/server/auth";
import { createSession, readSession, publicUser, SESSION_COOKIE, SESSION_SECONDS, type SessionUser } from "@/lib/server/session";
import type {
  StremioAuthData,
  StremioAddon,
} from "@/types/stremio";

const STREMIO_API = "https://api.strem.io/api";
const ADDON_COLLECTION_CACHE_TTL_MS = 60_000;
let addonCollectionGeneration = 0;

let addonCollectionCache:
  | {
      authKey: string;
      expiresAt: number;
      addons: StremioAddon[];
    }
  | null = null;
let addonCollectionRequest:
  | {
      authKey: string;
      promise: Promise<StremioAddon[]>;
    }
  | null = null;

// ─── Cookie Helpers ──────────────────────────────────────────────

async function setAuthCookie(data: StremioAuthData) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSession(data.authKey, data.user), {
    path: "/",
    maxAge: SESSION_SECONDS,
    sameSite: "lax",
    secure: cookieRequiresHttps(),
    httpOnly: true,
  });
}

// ─── Authentication ──────────────────────────────────────────────

export async function authenticateUser(
  email: string,
  password: string
): Promise<boolean> {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || email.length > 320 || !password || password.length > 4096) return false;
  try {
    const response = await fetch(`${STREMIO_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, facebook: false }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("Stremio login HTTP error:", response.status);
      return false;
    }

    const data = await response.json();

    if (data.result?.authKey && data.result?.user) {
      const authData: StremioAuthData = {
        authKey: data.result.authKey,
        user: data.result.user,
        timestamp: Date.now(),
      };
      await setAuthCookie(authData);
      return true;
    }

    console.error("Stremio rejected sign-in.");
    return false;
  } catch (error) {
    console.error("Authentication failed:", error);
    return false;
  }
}

export async function endSession() {
  const cookieStore = await cookies();

  try {
    const session = await readSession(cookieStore.get(SESSION_COOKIE)?.value);
    if (session) {
      await fetch(`${STREMIO_API}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey: session.authKey }),
        cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } catch {
    // Ignore cleanup errors
  }

  cookieStore.delete(SESSION_COOKIE);
  addonCollectionCache = null;
  addonCollectionRequest = null;
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function getUser(): Promise<SessionUser | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  return session ? publicUser(session.user) : null;
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getUser();
  return !!user;
}

// ─── Addon Collection ────────────────────────────────────────────

export async function getInstalledAddons(): Promise<StremioAddon[]> {
  try {
    const { authKey } = await getAuthData();
    const now = Date.now();

    if (
      addonCollectionCache?.authKey === authKey &&
      addonCollectionCache.expiresAt > now
    ) {
      return addonCollectionCache.addons;
    }

    if (addonCollectionRequest?.authKey === authKey) {
      return await addonCollectionRequest.promise;
    }

    const generation = addonCollectionGeneration;
    const promise = (async () => {
      const response = await fetch(`${STREMIO_API}/addonCollectionGet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "AddonCollectionGet", authKey, update: true }),
      });

      if (!response.ok) {
        console.error("Failed to fetch addons:", response.status);
        return [];
      }

      const data = await response.json();
      const addons = data.result?.addons || [];
      if (generation === addonCollectionGeneration) addonCollectionCache = {
        authKey,
        expiresAt: Date.now() + ADDON_COLLECTION_CACHE_TTL_MS,
        addons,
      };
      return addons;
    })();

    const request = { authKey, promise };
    addonCollectionRequest = request;

    try {
      return await promise;
    } finally {
      if (addonCollectionRequest === request) {
        addonCollectionRequest = null;
      }
    }
  } catch (error) {
    console.error("Failed to fetch installed addons:", error);
    return [];
  }
}

export async function invalidateAddonCollection() {
  addonCollectionGeneration += 1;
  addonCollectionCache = null;
  addonCollectionRequest = null;
}

// Server Action to clear invalid auth data
export async function clearAuthData() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  addonCollectionCache = null;
  addonCollectionRequest = null;
}
