// Only locally vendored Circle Flags assets are returned. Country variants
// take precedence; generic language codes use the project's language icons.
const languages = new Set(["en", "es", "fr", "de", "it", "pt", "ru", "tr", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "no", "da", "fi", "pl", "th", "vi", "he", "cs", "hu", "ro", "bg", "hr", "sk", "sl", "uk", "id", "el", "fa", "sr"]);
const countries = new Set(["us", "gb", "br", "pt", "es", "mx", "ar", "ca", "fr", "de", "au", "nz", "cn", "tw", "hk", "be", "at", "ch", "ie", "rs"]);

export function trackFlagPath(canonicalLanguage: string): string | undefined {
  try {
    const locale = new Intl.Locale(canonicalLanguage);
    const region = locale.region?.toLowerCase();
    if (region && countries.has(region)) return `/flags/circle/${region}.svg`;
    if (languages.has(locale.language)) return `/flags/circle/language/${locale.language}.svg`;
  } catch { /* Unknown or malformed languages keep their text label without a flag. */ }
}
