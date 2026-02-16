import { getInstalledAddons } from "@/app/actions/auth";
import { SearchBar } from "@/components/search-component";
import { AuroraBackground } from "@/components/aurora-background";
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
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function AddonsPage() {
  const addons = await getInstalledAddons();

  const getResourceIcons = (resources: (string | { name: string })[]) => {
    const names = resources.map((r) => (typeof r === "string" ? r : r.name));
    return (
      <div className="flex gap-1.5 flex-wrap">
        {names.includes("catalog") && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Package className="h-3 w-3" />
            Catalog
          </Badge>
        )}
        {names.includes("meta") && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Film className="h-3 w-3" />
            Meta
          </Badge>
        )}
        {names.includes("stream") && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            Streams
          </Badge>
        )}
        {names.includes("subtitles") && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Subtitles className="h-3 w-3" />
            Subtitles
          </Badge>
        )}
      </div>
    );
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
          {type}
        </Badge>
      ))}
    </div>
  );

  return (
    <div className="relative px-4 py-6 max-w-full overflow-hidden">
      <AuroraBackground
        colorStops={["#8b5cf6", "#6366f1", "#a855f7"]}
        amplitude={0.5}
        className="fixed inset-0 z-0 pointer-events-none opacity-40"
      />

      <div className="relative z-[9999] mb-8">
        <div className="mb-6">
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </div>

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

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {addons.map((addon) => (
          <Card
            key={addon.transportUrl}
            className="bg-background/80 backdrop-blur-sm hover:bg-background/95 transition-colors"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                {addon.manifest.logo ? (
                  <Image
                    src={addon.manifest.logo}
                    alt={addon.manifest.name}
                    width={40}
                    height={40}
                    className="rounded-lg flex-shrink-0"
                    unoptimized
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Puzzle className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="text-lg truncate">
                    {addon.manifest.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    v{addon.manifest.version}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {addon.manifest.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {addon.manifest.description}
                </p>
              )}
              <div className="space-y-2">
                {getResourceIcons(addon.manifest.resources)}
                {getTypeIcons(addon.manifest.types)}
              </div>
              {addon.manifest.catalogs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {addon.manifest.catalogs.length} catalog
                  {addon.manifest.catalogs.length !== 1 ? "s" : ""}
                </p>
              )}
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
