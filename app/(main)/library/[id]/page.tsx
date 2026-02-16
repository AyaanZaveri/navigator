import { fetchLibraryItems, getLibraryById } from "@/app/actions";
import { SearchBar } from "@/components/search-component";
import { LibraryMediaList } from "@/components/library-media-list";

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [libraryDetails, initialLibraryItems] = await Promise.all([
    getLibraryById(id),
    fetchLibraryItems(id),
  ]);

  const libraryItems = await fetchLibraryItems(id, initialLibraryItems.totalRecordCount);
  const libraryName = libraryDetails?.Name || "Library";

  return (
    <div className="relative px-4 py-6 max-w-full overflow-hidden">
      <div className="relative z-10">
        <div className="relative z-[9999] mb-8">
          <div className="mb-6">
            <SearchBar />
          </div>
        </div>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-3xl font-semibold text-foreground font-poppins">
              {libraryName}
            </h2>
          </div>
          <span className="font-mono text-muted-foreground">
            {libraryItems.items.length} items
          </span>
        </div>
        <LibraryMediaList mediaItems={libraryItems.items} />
      </div>
    </div>
  );
}
