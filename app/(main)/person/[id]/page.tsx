import { SearchBar } from "@/components/search-component";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { redirect } from "next/navigation";
import { Suspense } from "react";

// Stremio doesn't have a person/actor API.
// This page shows a basic message with a link back.
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen overflow-hidden md:pr-1 pb-16">
      <VibrantAuroraBackground
        className="fixed inset-0 z-0 pointer-events-none opacity-30"
      />

      <div className="relative">
        <div className="absolute top-8 left-0 right-0 z-20 px-6">
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </div>

      <div className="relative z-10 mt-32 px-8 text-center">
        <h1 className="text-4xl font-semibold font-poppins text-foreground mb-4">
          Person Details
        </h1>
        <p className="text-muted-foreground">
          Person information is not available with Stremio addons.
        </p>
      </div>
    </div>
  );
}
