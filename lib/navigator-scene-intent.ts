/** Parse only the explicit "play/go to <scene> in/from <title>" command form. */
export function parseScenePlaybackCommand(text: string) {
    const match = /^(?:(?:please|can you|could you|would you)\s+)*(?:go\s+to|jump\s+to|skip(?:\s+to)?|take\s+me\s+to|play|start)\s+(.+?\b(?:scene|moment|confession|fight|fights|battle|kiss|kisses)\b.*?)\s+(?:in|from)\s+(.+?)\s*[.!?]?$/i.exec(text.trim());
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

/** Episode coordinates are user input, never facts inferred by the planning model. */
export function explicitSceneCoordinates(text: string): { seasonNumber?: number; episodeNumber?: number } {
    const compact = /\bs(\d+)\s*e(\d+)\b/i.exec(text);
    if (compact) return { seasonNumber: Number(compact[1]), episodeNumber: Number(compact[2]) };
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const ordinals = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const coordinate = (kind: string) => {
        const after = new RegExp(`\\b${kind}\\s+(\\d+|${words.join('|')}|${ordinals.join('|')})\\b`, 'i').exec(text);
        const before = new RegExp(`\\b(${ordinals.join('|')})\\s+${kind}\\b`, 'i').exec(text);
        const value = (after?.[1] || before?.[1])?.toLowerCase();
        if (!value) return undefined;
        return /^\d+$/.test(value) ? Number(value) : Math.max(words.indexOf(value), ordinals.indexOf(value));
    };
    const seasonNumber = coordinate('season');
    const episodeNumber = coordinate('episode');
    return { ...(seasonNumber !== undefined ? { seasonNumber } : episodeNumber === 1 && /\bfirst episode\b/i.test(text) ? { seasonNumber: 1 } : {}),
        ...(episodeNumber !== undefined ? { episodeNumber } : {}) };
}
