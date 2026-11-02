import "server-only";
import { fetchTMDB, resolveTMDBId } from "@/lib/tmdb";
import type { ArtworkKind } from "@/lib/artwork";
import { getTMDBToken } from "@/lib/tmdb-credentials";

export interface TMDBImage {
  file_path: string;
  iso_639_1?: string | null;
  vote_average?: number;
  vote_count?: number;
  width?: number;
}

export function selectArtwork(images: TMDBImage[] = [], kind: ArtworkKind): string | undefined {
  const languageRank = (image: TMDBImage) => {
    const preferred = kind === "backdrop" || kind === "still" ? null : "en";
    return image.iso_639_1 === preferred ? 2
      : image.iso_639_1 == null || image.iso_639_1 === "en" ? 1 : 0;
  };
  const image = images.filter((item) => {
    const raster = /^\/[\w.-]+\.(png|jpg|jpeg|webp)$/i.test(item.file_path);
    // TMDB's preferred logo can be a vector; the upstream addon keeps it.
    return raster || (kind === "logo" && /^\/[\w.-]+\.svg$/i.test(item.file_path));
  }).sort((a, b) => {
    const language = languageRank(b) - languageRank(a);
    // Match the TMDB addon's logo behavior: prefer the language, then keep
    // TMDB's original order. Size or local ratings must not replace its choice.
    if (kind === "logo") return language;
    return language
      || (b.vote_average ?? 0) - (a.vote_average ?? 0)
      || (b.vote_count ?? 0) - (a.vote_count ?? 0)
      || (b.width ?? 0) - (a.width ?? 0);
  })[0];
  if (!image) return undefined;
  const size = kind === "backdrop" || kind === "logo" ? "original" : "w500";
  return `https://image.tmdb.org/t/p/${size}${image.file_path}`;
}

export async function getTMDBArtwork(
  id: string, type: "movie" | "series", kind: ArtworkKind,
  season?: number, episode?: number,
): Promise<string | undefined> {
  const token = await getTMDBToken();
  if (!token) return undefined;
  const tmdbId = await resolveTMDBId(id, type, token);
  if (!tmdbId) return undefined;
  const mediaType = type === "series" ? "tv" : "movie";
  if (kind === "still") {
    if (type !== "series" || typeof season !== "number" || !Number.isSafeInteger(season) || season < 0
      || typeof episode !== "number" || !Number.isSafeInteger(episode) || episode < 1) return undefined;
    // One cached season response supplies every episode card's still.
    const data = await fetchTMDB<{ episodes?: { episode_number: number; still_path?: string | null }[] }>(
      `tv/${tmdbId}/season/${season}?language=en-US`, token,
    );
    const path = data?.episodes?.find((item) => item.episode_number === episode)?.still_path;
    return path ? selectArtwork([{ file_path: path }], kind) : undefined;
  }
  const data = await fetchTMDB<{ posters?: TMDBImage[]; backdrops?: TMDBImage[]; logos?: TMDBImage[] }>(
    `${mediaType}/${tmdbId}/images?include_image_language=en,null`, token,
  );
  const images = kind === "poster" ? data?.posters : kind === "backdrop" ? data?.backdrops : data?.logos;
  return selectArtwork(images, kind);
}
