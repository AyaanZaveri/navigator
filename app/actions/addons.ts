"use server";

import { revalidatePath } from "next/cache";
import { getAuthData } from "@/lib/server/auth";
import { invalidateAddonCollection } from "@/app/actions/auth";
import { addInstalledAddon, addonLinks, findInstalledAddon, readAddonCollection, removeInstalledAddon } from "@/lib/addon-management";
import { loadAddonForInstall } from "@/lib/addon-install";
import { toAddonListItem } from "@/lib/addons";

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function getInstalledAddonLinks(key: string) {
    try {
        const { authKey } = await getAuthData();
        const addon = findInstalledAddon(await readAddonCollection(authKey), key);
        return { ...addonLinks(addon), error: null };
    } catch (error) {
        return { shareUrl: null, configureUrl: null, error: errorMessage(error) };
    }
}

export async function uninstallAddon(key: string) {
    try {
        const { authKey } = await getAuthData();
        await removeInstalledAddon(authKey, key);
        await invalidateAddonCollection();
        revalidatePath("/", "layout");
        return { error: null };
    } catch (error) {
        return { error: errorMessage(error) };
    }
}

export async function previewAddon(link: string) {
    try {
        const { authKey } = await getAuthData();
        const addon = await loadAddonForInstall(link);
        const installed = await readAddonCollection(authKey);
        if (installed.some(item => item.transportUrl === addon.transportUrl)) {
            throw new Error("This addon configuration is already installed.");
        }
        return {
            addon: toAddonListItem(addon, 0),
            configurationRequired: !!addon.manifest.behaviorHints?.configurationRequired,
            configureUrl: addonLinks(addon).configureUrl,
            error: null,
        };
    } catch (error) {
        return { addon: null, configurationRequired: false, configureUrl: null, error: errorMessage(error) };
    }
}

export async function installAddon(link: string, expectedId: string) {
    try {
        const { authKey } = await getAuthData();
        // Fetch again on install. Never trust a manifest sent back by the browser.
        const addon = await loadAddonForInstall(link);
        if (`${addon.manifest.id}:0` !== expectedId) throw new Error("This addon changed. Review the link again before installing.");
        if (addon.manifest.behaviorHints?.configurationRequired) throw new Error("Configure this addon first, then paste its configured link.");
        await addInstalledAddon(authKey, addon);
        await invalidateAddonCollection();
        revalidatePath("/", "layout");
        return { error: null };
    } catch (error) {
        return { error: errorMessage(error) };
    }
}
