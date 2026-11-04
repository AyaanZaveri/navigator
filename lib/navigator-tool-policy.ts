import type { UIMessage } from "ai";
import { actionToolNames, record } from "@/lib/navigator-chat";

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
    const userIndex = messages.findLastIndex(message => message.role === "user");
    const actionHandled = messages.slice(userIndex + 1).some(message => message.parts.some(part => {
        const item = record(part);
        return actionToolNames.has(String(item.type).replace(/^tool-/, ""))
            && (item.state === "output-available" || item.state === "output-error");
    }));
    return {
        initialTools: theme && !actionHandled ? ["themeToggle"] : undefined,
        playback,
        actionHandled: (theme || playback) && actionHandled,
        requireInitialTool: (theme || playback) && !actionHandled,
        evidenceTools: metadata ? ["getMediaDetails", "getPersonDetails", "getFilmography"] : [],
        // Search results identify a title/person but cannot substantiate a director, cast, or runtime.
        evidenceLookupTools: ["searchMedia", "searchPeople", "getMediaDetails", "getPersonDetails", "getFilmography"],
    };
}
