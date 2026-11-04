import { notFound } from "next/navigation";
import { SettingsView } from "@/components/settings/settings-view";
import { isSettingsCategory } from "@/lib/settings-navigation";

export default async function SettingsCategoryPage({ params }: { params: Promise<{ category: string }> }) {
    const { category } = await params;
    if (!isSettingsCategory(category)) notFound();
    return <SettingsView category={category} />;
}
