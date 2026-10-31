"use server";

import { revalidatePath } from "next/cache";
import { getAuthData, invalidateAddonCollection } from "@/app/actions/auth";
import { addonLinks, findInstalledAddon, readAddonCollection, removeInstalledAddon } from "@/lib/addon-management";

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
