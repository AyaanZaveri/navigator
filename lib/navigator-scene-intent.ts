/** Parse only the explicit "play/go to <scene> in/from <title>" command form. */
export function parseScenePlaybackCommand(text: string) {
    const match = /^(?:(?:please|can you|could you|would you)\s+)*(?:go\s+to|jump\s+to|skip(?:\s+to)?|take\s+me\s+to|play|start)\s+(.+?\b(?:scene|moment)\b.*?)\s+(?:in|from)\s+(.+?)\s*[.!?]?$/i.exec(text.trim());
    if (!match || /\b(?:season|episode|s\d+e\d+)\b/i.test(text)) return null;
    const unquote = (value: string) => /^(["'“]).*(["'”])$/.test(value) ? value.slice(1, -1) : value;
    const userDescription = unquote(match[1].trim());
    const mediaQuery = unquote(match[2].trim());
    // Multiple connectors, compound requests and deictic titles need language understanding.
    if (!mediaQuery || mediaQuery.length > 300 || userDescription.length > 600
        || /\b(?:in|from|and|then|but|unless)\b/i.test(mediaQuery)
        || /^(?:(?:this|that|current)\s+(?:movie|film|show)|this|that|it)$/i.test(mediaQuery)) return null;
    return { mediaQuery, userDescription, seasonNumber: null, episodeNumber: null };
}
