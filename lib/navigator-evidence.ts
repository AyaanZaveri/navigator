import type { WebEvidence } from "./tinyfish";

export interface EvidencePassage { id: string; text: string }
export interface IndexedEvidence { id: string; title: string; passages: EvidencePassage[] }

/** Models select immutable passage IDs; the server, not the model, supplies quotations. */
export function indexEvidence(sources: WebEvidence[]): IndexedEvidence[] {
    return sources.map(source => {
        const chunks: string[] = [];
        // Keep every character, including late clues. Small, contiguous passages reduce output copying.
        for (const paragraph of source.text.split(/\n\s*\n/).filter(text => text.trim())) {
            for (let offset = 0; offset < paragraph.length; offset += 1200) {
                const piece = paragraph.slice(offset, offset + 1200);
                if (chunks.length && chunks.at(-1)!.length + piece.length + 2 <= 1200) chunks[chunks.length - 1] += `\n\n${piece}`;
                else chunks.push(piece);
            }
        }
        return { id: source.id, title: source.title,
            passages: chunks.map((text, index) => ({ id: `${source.id}:p${index + 1}`, text })) };
    });
}

export function resolveEvidencePassage(sources: WebEvidence[], indexed: IndexedEvidence[], passageId: string) {
    for (const document of indexed) {
        const passage = document.passages.find(passage => passage.id === passageId);
        const source = sources.find(source => source.id === document.id);
        if (passage && source) return { sourceId: source.id, quote: passage.text, url: source.url, title: source.title };
    }
    return null;
}
