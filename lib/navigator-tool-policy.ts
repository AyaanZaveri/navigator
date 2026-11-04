import type { UIMessage } from "ai";

/** Narrow only unambiguous task families; ordinary conversation keeps optional tools. */
export function navigatorToolPolicy(messages: UIMessage[]) {
    const lastUser = messages.findLast(message => message.role === "user");
    const text = lastUser?.parts.filter(part => part.type === "text").map(part => part.text).join(" ").trim() || "";
    const theme = /^(?:(?:please|can you|could you)\s+)*(?:switch|change|set|toggle)\b/i.test(text)
        && /\b(?:theme|(?:light|dark|system)\s+mode)\b/i.test(text)
        && !/\b(?:and|then|also)\b/i.test(text);
    const metadata = !/\b(?:you|yourself)\b/i.test(text) && /\b(?:who\s+(?:directed|wrote|created|stars|starred)|(?:cast|director|runtime|rating|synopsis|release date)\s+(?:of|for))\b/i.test(text);
    const playback = /^(?:(?:please|can you|could you)\s+)*(?:play|watch|start)\b/i.test(text)
        && !/\b(?:and|then|also|but)\b/i.test(text);
    return {
        initialTools: theme ? ["themeToggle"] : undefined,
        playback,
        requireInitialTool: theme || playback,
        evidenceTools: metadata ? ["getMediaDetails", "getPersonDetails", "getFilmography"] : [],
        // Search results identify a title/person but cannot substantiate a director, cast, or runtime.
        evidenceLookupTools: ["searchMedia", "searchPeople", "getMediaDetails", "getPersonDetails", "getFilmography"],
    };
}
