import { getInstalledAddons } from "@/app/actions/auth";
import { AddonsList } from "@/components/addons-list";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { toAddonListItem } from "@/lib/addons";

export const dynamic = "force-dynamic";

export default async function AddonsPage() {
    const addons = await getInstalledAddons();

    return (
        <div className="relative px-[var(--page-gutter)] py-6">
            <HomeGradientBackground />
            <div className="relative z-10 flex w-full max-w-6xl flex-col gap-8 pb-10">
                <header className="flex flex-col gap-2">
                    <h1 className="font-poppins text-3xl font-medium tracking-tight">Addons</h1>
                </header>
                <AddonsList addons={addons.map(toAddonListItem)} />
            </div>
        </div>
    );
}
