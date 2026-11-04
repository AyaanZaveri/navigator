// Locally vendored country-flag-icons 1.6.20 (MIT), always in 3:2 aspect ratio.
// Language flags are decorative representatives, not inferred regional dialects.
const languageCountries: Record<string, string> = {
  "en": "GB",
  "ar": "SA",
  "bn": "BD",
  "bs": "BA",
  "bg": "BG",
  "ca": "ES-CT",
  "zh": "CN",
  "hr": "HR",
  "cs": "CZ",
  "da": "DK",
  "nl": "NL",
  "et": "EE",
  "fi": "FI",
  "fr": "FR",
  "de": "DE",
  "el": "GR",
  "he": "IL",
  "hi": "IN",
  "hu": "HU",
  "is": "IS",
  "id": "ID",
  "it": "IT",
  "ja": "JP",
  "ko": "KR",
  "lv": "LV",
  "lt": "LT",
  "ms": "MY",
  "no": "NO",
  "nb": "NO",
  "nn": "NO",
  "fa": "IR",
  "pl": "PL",
  "pt": "PT",
  "ro": "RO",
  "ru": "RU",
  "sr": "RS",
  "sk": "SK",
  "sl": "SI",
  "es": "ES",
  "sv": "SE",
  "tl": "PH",
  "fil": "PH",
  "ta": "IN",
  "te": "IN",
  "th": "TH",
  "tr": "TR",
  "uk": "UA",
  "ur": "PK",
  "vi": "VN"
};
const countries = new Set("AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BQ-BO BQ-SA BQ-SE BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ES-CT ET EU FI FJ FK FM FO FR GA GB GB-ENG GB-NIR GB-SCT GB-WLS GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XA XC XK XO YE YT ZA ZM ZW".split(" "));

export function trackFlagPath(canonicalLanguage: string): string | undefined {
  try {
    const locale = new Intl.Locale(canonicalLanguage);
    if (locale.region && countries.has(locale.region)) return `/flags/3x2/${locale.region}.svg`;
    if (languageCountries[locale.language]) return `/flags/3x2/language/${locale.language}.svg`;
  } catch { /* Unknown or malformed languages retain their text label and generic icon. */ }
}
