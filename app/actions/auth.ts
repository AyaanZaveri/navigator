"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieRequiresHttps } from "@/lib/cookie-policy";
import type {
  StremioAuthData,
  StremioUser,
  StremioUserWithToken,
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
  cookieStore.set("stremio-auth", JSON.stringify(data), {
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
    secure: cookieRequiresHttps(),
    httpOnly: false,
  });
}

export async function getAuthData(): Promise<{
  authKey: string;
  user: StremioUser;
}> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("stremio-auth");

  if (!raw?.value) {
    const err = new Error("Not authenticated");
    (err as any).isAuthError = true;
    throw err;
  }

  const parsed: StremioAuthData = JSON.parse(raw.value);
  return { authKey: parsed.authKey, user: parsed.user };
}

// ─── Authentication ──────────────────────────────────────────────

export async function authenticateUser(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const response = await fetch(`${STREMIO_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, facebook: false }),
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

    console.error("Stremio login error:", data.result);
    return false;
  } catch (error) {
    console.error("Authentication failed:", error);
    return false;
  }
}

export async function logout() {
  const cookieStore = await cookies();

  try {
    const raw = cookieStore.get("stremio-auth");
    if (raw?.value) {
      const parsed: StremioAuthData = JSON.parse(raw.value);
      await fetch(`${STREMIO_API}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey: parsed.authKey }),
      }).catch(() => {});
    }
  } catch {
    // Ignore cleanup errors
  }

  cookieStore.delete("stremio-auth");
  addonCollectionCache = null;
  addonCollectionRequest = null;
  redirect("/login");
}

export async function getUser(): Promise<StremioUserWithToken | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("stremio-auth");

  if (!raw?.value) return null;

  try {
    const parsed: StremioAuthData = JSON.parse(raw.value);
    return { ...parsed.user, authKey: parsed.authKey };
  } catch {
    return null;
  }
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
  cookieStore.delete("stremio-auth");
  addonCollectionCache = null;
  addonCollectionRequest = null;
}
