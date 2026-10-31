import { CastScrollArea } from "@/components/cast-scrollarea";
import { getMediaCast } from "@/lib/tmdb-cast";

export async function CastSection({ id, type, names }: { id: string; type: "movie" | "series"; names?: string[] }) {
    const { members } = await getMediaCast(id, type, names);
    if (!members.length) return null;

    return (
        <div className="mt-8 px-4 md:px-10">
            <CastScrollArea cast={members} />
        </div>
    );
}
