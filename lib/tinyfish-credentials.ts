import "server-only";
import { cookies } from "next/headers";

export const TINYFISH_KEY_COOKIE = "navigator-tinyfish-key";
export const WEB_SEARCH_COOKIE = "navigator-web-search";

export async function getTinyfishConfig() {
    const jar = await cookies();
    return {
        apiKey: jar.get(TINYFISH_KEY_COOKIE)?.value.trim() || process.env.TINYFISH_API_KEY?.trim() || undefined,
        enabled: jar.get(WEB_SEARCH_COOKIE)?.value !== "0",
        personal: !!jar.get(TINYFISH_KEY_COOKIE)?.value,
    };
}
