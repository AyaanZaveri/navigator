// Only locally vendored Circle Flags assets are returned. Country variants
// take precedence; generic language codes use the project's language icons.
const languages = new Set(["aa", "ab", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "ba", "be", "bg", "bi", "bm", "bn", "bo", "br", "bs", "ca", "ce", "ceb", "ch", "chm", "ckb", "co", "cs", "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fil", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv", "ha", "haw", "he", "hi", "hmn", "ho", "hr", "ht", "hu", "hy", "ia", "id", "ie", "ig", "ilo", "io", "is", "it", "ja", "jv", "ka", "kg", "ki", "kk", "kl", "km", "kn", "ko", "kr", "kri", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "ln", "lo", "lt", "lu", "lus", "lv", "mg", "mh", "mi", "mk", "ml", "mn", "mni", "mr", "mrj", "ms", "mt", "my", "na", "nb", "nd", "ne", "nl", "nn", "no", "non", "nr", "ny", "oc", "om", "or", "os", "oto", "pa", "pap", "pl", "pms", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sc", "sd", "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "to", "tr", "tt", "ty", "udm", "ug", "uk", "ur", "uz", "vi", "vo", "xh", "xx", "yi", "yo", "yua", "zh", "zu"]);
const countries = new Set(["us", "gb", "br", "pt", "es", "mx", "ar", "ca", "fr", "de", "au", "nz", "cn", "tw", "hk", "be", "at", "ch", "ie", "rs"]);

export function trackFlagPath(canonicalLanguage: string): string | undefined {
  try {
    const locale = new Intl.Locale(canonicalLanguage);
    const region = locale.region?.toLowerCase();
    if (region && countries.has(region)) return `/flags/circle/${region}.svg`;
    if (languages.has(locale.language)) return `/flags/circle/language/${locale.language}.svg`;
  } catch { /* Unknown or malformed languages keep their text label without a flag. */ }
}
