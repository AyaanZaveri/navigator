/** Provider metadata uses both numeric years and strings such as "2018–".
 * Keep the original release label elsewhere; UI/query records use a start year. */
export function releaseYear(value: unknown, releaseInfo?: string): number | undefined {
    const input = typeof value === "string"
        ? /^\s*(\d{4})(?:\s*[-–—]\s*(?:\d{4})?)?\s*$/.exec(value)?.[1] : value;
    const year = Number(input);
    if (Number.isInteger(year) && year >= 1888 && year <= new Date().getFullYear() + 1) return year;
    if (releaseInfo) return releaseYear(/^\s*(\d{4})\b/.exec(releaseInfo)?.[1]);
    return undefined;
}
