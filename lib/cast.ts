export interface CastMember {
    id: string;
    name: string;
    role?: string;
    image?: string;
}

export interface TMDBCastCredit {
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
    roles?: { character: string; episode_count?: number }[];
}

export function normalizeCast(credits: TMDBCastCredit[]): CastMember[] {
    const seen = new Set<number>();
    return credits.flatMap((credit) => {
        if (!Number.isInteger(credit.id) || !credit.name?.trim() || seen.has(credit.id)) return [];
        seen.add(credit.id);
        const roles = credit.roles
            ? [...credit.roles].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0)).map((role) => role.character)
            : [credit.character];
        return [{
            id: String(credit.id),
            name: credit.name.trim(),
            role: [...new Set(roles.filter(Boolean))].join(" / ") || undefined,
            image: credit.profile_path?.startsWith("/") ? `https://image.tmdb.org/t/p/w185${credit.profile_path}` : undefined,
        }];
    }).slice(0, 30);
}
