import { notFound, redirect } from "next/navigation";
import { loadLibraryPage, LibraryNotFound } from "@/lib/server/library-page";
import { INITIAL_LIBRARY_QUERY } from "@/lib/library-page";
import { getLibraryById } from "@/app/actions";
import { LibraryMediaList } from "@/components/library-media-list";

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [libraryDetails, libraryItems] = await Promise.all([
    getLibraryById(id),
    loadLibraryPage(id, INITIAL_LIBRARY_QUERY).catch(error => {
      if (error instanceof LibraryNotFound) notFound();
      if (error instanceof Error && "isAuthError" in error && error.isAuthError) redirect("/login");
      throw error;
    }),
  ]);

  const libraryName = libraryDetails?.Name || "Library";

  return (
    <div className="relative px-[var(--page-gutter)] py-6 max-w-full overflow-hidden">
      <div className="relative z-10">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-3xl font-semibold text-foreground font-poppins">
              {libraryName}
            </h2>
          </div>
          <span className="font-mono text-muted-foreground">
            {libraryItems.totalLibraryCount} items
          </span>
        </div>
        <LibraryMediaList key={id} initialPage={libraryItems} addonUrl={id} />
      </div>
    </div>
  );
}
