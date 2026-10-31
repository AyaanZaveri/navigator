import { getInstalledAddons } from "@/app/actions/auth";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Puzzle, Package, Film, Tv, Subtitles, Globe } from "lucide-react";
import Image from "next/image";

export const dynamic = "force-dynamic";

function toTitleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type CapabilityBadge = {
  label: string;
  icon: typeof Package;
};

export default async function AddonsPage() {
  const addons = await getInstalledAddons();

  const getPrimaryCapability = (
    resources: (string | { name: string })[]
  ): CapabilityBadge => {
    const names = resources.map((r) =>
      (typeof r === "string" ? r : r.name).toLowerCase()
    );

    if (names.includes("subtitles")) {
      return { label: "Subtitles", icon: Subtitles };
    }
    if (names.includes("catalog")) {
      return { label: "Catalog", icon: Package };
    }
    if (names.includes("meta")) {
      return { label: "Meta", icon: Film };
    }
    if (names.includes("stream") || names.includes("streams")) {
      return { label: "Streams", icon: Globe };
    }

    return { label: "Addon", icon: Puzzle };
  };

  const getTypeIcons = (types: string[]) => (
    <div className="flex gap-1.5 flex-wrap">
      {types.map((type) => (
        <Badge key={type} variant="outline" className="text-xs gap-1">
          {type === "movie" ? (
            <Film className="h-3 w-3" />
          ) : type === "series" ? (
            <Tv className="h-3 w-3" />
          ) : (
            <Package className="h-3 w-3" />
          )}
          {toTitleCase(type)}
        </Badge>
      ))}
    </div>
  );

  return (
    <div className="relative px-[var(--page-gutter)] py-6 max-w-full overflow-hidden">
      <HomeGradientBackground />

      <div className="relative z-10 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Puzzle className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-semibold text-foreground font-poppins">
            Installed Addons
          </h2>
        </div>
        <p className="text-muted-foreground mb-6">
          {addons.length} addon{addons.length !== 1 ? "s" : ""} installed
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {addons.map((addon) => (
          <Card
            key={addon.transportUrl}
            className="self-start gap-2 bg-background/80 backdrop-blur-sm hover:bg-background/95 transition-colors"
          >
            <CardHeader className="pb-0">
              <div className="flex items-center gap-3">
                {addon.manifest.logo ? (
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <Image
                      src={addon.manifest.logo}
                      alt={addon.manifest.name}
                      width={40}
                      height={40}
                      className="w-full h-full rounded-md object-contain p-1"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Puzzle className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="text-lg truncate">
                    {addon.manifest.name}
                  </CardTitle>
                  <CardDescription className="text-xs font-mono">
                    v{addon.manifest.version}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {addon.manifest.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {addon.manifest.description}
                </p>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(() => {
                    const capability = getPrimaryCapability(
                      addon.manifest.resources
                    );
                    const CapabilityIcon = capability.icon;

                    return (
                      <>
                        <Badge variant="secondary" className="text-xs gap-1">
                          <CapabilityIcon className="h-3 w-3" />
                          {capability.label}
                        </Badge>
                        {addon.manifest.catalogs.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {addon.manifest.catalogs.length} Catalog
                            {addon.manifest.catalogs.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>
                {getTypeIcons(addon.manifest.types)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {addons.length === 0 && (
        <div className="relative z-10 text-center py-16">
          <Puzzle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            No Addons Installed
          </h3>
          <p className="text-muted-foreground">
            Install addons through Stremio to get started
          </p>
        </div>
      )}
    </div>
  );
}
