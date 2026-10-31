import { getAuthData } from "@/app/actions/auth";
import { addonLinks, findInstalledAddon, readAddonCollection } from "@/lib/addon-management";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
    try {
        const { authKey } = await getAuthData();
        const { key } = await params;
        const addon = findInstalledAddon(await readAddonCollection(authKey), key);
        const { configureUrl } = addonLinks(addon);
        if (!configureUrl) return new Response("This addon does not provide a settings page.", { status: 404 });
        return new Response(null, {
            status: 303,
            headers: { Location: configureUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
        });
    } catch {
        return new Response("Could not open addon settings. Return to Addons, refresh the page, and try again.", { status: 400 });
    }
}
