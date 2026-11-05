import { tool } from "ai";
import { z } from "zod";
import { selectMediaResults, type MediaResult } from "@/lib/navigator-selection";
export { seedMediaResults } from "@/lib/navigator-selection";

export function createPresentMediaResults(store: Map<string, MediaResult>) {
    return tool({
        description: "Publish an explicitly agent-selected ordered subset of successful media search or filmography results from this request (including accessible prior conversation history). Use for recommendation/known-for/follow-up lists. IDs only; titles and details cannot be invented. This is presentation only and never navigates or plays.",
        inputSchema: z.object({ ids: z.array(z.string().min(1)).min(1).max(40).describe("Copy presentationId from successful media results (or id if no presentationId was returned). Typed presentation IDs distinguish Movie and Series with the same numeric TMDB ID."), heading: z.string().trim().min(1).max(100).optional() }),
        execute: async ({ ids, heading }) => selectMediaResults(ids, store, heading),
    });
}
