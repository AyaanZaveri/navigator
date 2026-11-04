import "server-only";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/server/session";

/** Never export bearer credentials from a `use server` module: those exports become public actions. */
export async function getAuthData() {
    const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
    if (!session) throw new Error("Not authenticated");
    return session;
}
