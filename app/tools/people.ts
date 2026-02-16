import { tool } from "ai";
import { z } from "zod";
import { searchPeople } from "@/app/actions/search";

export const getPeople = tool({
  description:
    "Search for people (e.g., directors, actors) related to media",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search term or person name to look for"),
  }),
  execute: async ({ query }) => {
    console.log("[getPeople] Tool called with query:", query);
    try {
      const results = await searchPeople(query);

      const people = results.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
      }));

      return {
        success: true,
        people: people.slice(0, 10),
        count: people.length,
        note: "Stremio does not have a dedicated people search. Results are limited.",
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to search people",
        people: [],
      };
    }
  },
});

export const getPersonDetails = tool({
  description:
    "Get detailed information about a specific person (actor, director, etc.)",
  inputSchema: z.object({
    personId: z.string().describe("The unique ID of the person"),
  }),
  execute: async ({ personId }) => {
    console.log("[getPersonDetails] Tool called with personId:", personId);
    return {
      success: false,
      error:
        "Person details are not available in Stremio. Person data is embedded in media metadata (cast, director fields).",
    };
  },
});

export const getPersonFilmography = tool({
  description:
    "Get filmography (movies and TV shows) for a specific person",
  inputSchema: z.object({
    personId: z.string().describe("The unique ID of the person"),
    limit: z
      .number()
      .optional()
      .describe("Number of items to retrieve (default: 20)"),
  }),
  execute: async ({ personId, limit = 20 }) => {
    console.log("[getPersonFilmography] Tool called with:", {
      personId,
      limit,
    });
    return {
      success: false,
      error:
        "Person filmography is not available in Stremio. Use searchMedia to find content instead.",
      filmography: [],
    };
  },
});
