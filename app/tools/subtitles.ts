import { google } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";
import { getSubtitleContent } from "@/app/actions/subtitles";
import { convertTimestampToSeconds } from "@/lib/utils";

export interface SkipToSubtitleContent {
  success: boolean;
  action: "skipTo";
  timestamp: number;
  timestampFormatted: string;
  text: string;
  message: string;
  error?: string;
}

export const skipToSubtitleContent = (currentMedia: any) =>
  tool({
    description:
      "Analyze subtitles and find the best timestamp to skip to based on the user's description. Only works when media is currently playing.",
    inputSchema: z.object({
      userDescription: z
        .string()
        .describe(
          "The user's description of what scene/moment they want to skip to"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({ userDescription, subtitleIndex = 0 }) => {
      console.log("⏩ [skipToSubtitleContent] Tool called with:", {
        userDescription,
        subtitleIndex,
        currentMedia,
      });

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to use subtitle search.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        console.log("[skipToSubtitleContent] Subtitle fetch result:", result);

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Let Gemini analyze the subtitles to find the best match
        // Format subtitle data for analysis - create a more structured prompt
        const subtitleText = result.subtitles
          .map(
            (sub, index) =>
              `${index + 1}. [${sub.timestampFormatted}] ${sub.text}`
          )
          .join("\n");

        // Create a prompt for Gemini to analyze
        const analysisPrompt = `You are analyzing subtitles from "${currentMedia.name}" to help a user skip to a specific scene.

User wants to skip to: "${userDescription}"

Subtitle entries (format: [HH:MM:SS] text):
${subtitleText}

Task: Find the most relevant timestamp that matches the user's description.

Consider:
- Semantic meaning and emotional context
- Scene transitions and narrative flow  
- Character dialogue and actions
- Plot developments that match the description

Return ONLY the timestamp in HH:MM:SS format (e.g., 02:25.6 or 1:23:45.2):`;

        // Use Gemini to analyze the subtitles
        const analysisResult = streamText({
          model: google("gemini-flash-lite-latest"),
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 100,
        });

        let analysisText = "";
        for await (const chunk of analysisResult.textStream) {
          console.log("[skipToSubtitleContent] Analysis chunk:", chunk);
          analysisText += chunk;
        }

        console.log("[skipToSubtitleContent] Analysis result:", analysisText);

        // Extract timestamp from Gemini's response (looking for HH:MM:SS format)
        // Order is important: match HH:MM:SS first, then MM:SS
        const timestampMatch = analysisText.match(
          /\d{1,2}:\d{2}:\d{2}(?:\.\d+)?|\d{1,2}:\d{2}(?:\.\d+)?/
        );
        if (!timestampMatch) {
          return {
            success: false,
            error:
              "Could not determine the best timestamp for your request. Please try being more specific.",
          };
        }

        // Convert timestamp to seconds using our utility function
        console.log(
          "[skipToSubtitleContent] Extracted timestamp:",
          timestampMatch[0]
        );
        const bestTimestamp = convertTimestampToSeconds(timestampMatch[0]);
        console.log(
          "[skipToSubtitleContent] Converted to seconds:",
          bestTimestamp
        );

        // Find the corresponding subtitle entry for context
        const correspondingSubtitle =
          result.subtitles.find(
            (sub) => Math.abs(sub.timestamp - bestTimestamp) < 2 // Within 2 seconds
          ) ||
          result.subtitles.reduce((closest, current) =>
            Math.abs(current.timestamp - bestTimestamp) <
            Math.abs(closest.timestamp - bestTimestamp)
              ? current
              : closest
          );

        return {
          success: true,
          action: "skipTo",
          timestamp: bestTimestamp,
          timestampFormatted: correspondingSubtitle.timestampFormatted,
          text: correspondingSubtitle.text,
          message: `Found the scene you described in ${currentMedia.name} at ${correspondingSubtitle.timestampFormatted}. Skipping there now...`,
        };
      } catch (error) {
        console.error("[skipToSubtitleContent] Error:", error);
        return {
          success: false,
          error: "Failed to analyze subtitle content",
        };
      }
    },
  });

export const createExplainScene = (currentMedia: any) =>
  tool({
    description:
      "Analyze subtitles around the current timestamp to explain what's happening in the movie or show. Works when media is currently playing.",
    inputSchema: z.object({
      currentTimestamp: z
        .number()
        .describe(
          "The current playback timestamp in seconds (where the user is in the video)"
        ),
      contextWindow: z
        .number()
        .optional()
        .describe(
          "Number of seconds before and after current timestamp to analyze (default: 30)"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({
      currentTimestamp,
      contextWindow = 30,
      subtitleIndex = 0,
    }) => {
      console.log("📖 [explainScene] Tool called with:", {
        currentTimestamp,
        contextWindow,
        subtitleIndex,
        currentMedia,
      });

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to get scene explanations.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Filter subtitles to get context around current timestamp
        const startTime = Math.max(0, currentTimestamp - contextWindow);
        const endTime = currentTimestamp + contextWindow;

        const relevantSubtitles = result.subtitles.filter(
          (sub) => sub.timestamp >= startTime && sub.timestamp <= endTime
        );

        if (relevantSubtitles.length === 0) {
          return {
            success: false,
            error:
              "No subtitles found around the current timestamp. The scene might be silent or you may need to adjust the time window.",
          };
        }

        // Format subtitle context for analysis
        const subtitleContext = relevantSubtitles
          .map(
            (sub) =>
              `[${sub.timestampFormatted}] ${sub.text}${
                Math.abs(sub.timestamp - currentTimestamp) <= 2
                  ? " ← CURRENT POSITION"
                  : ""
              }`
          )
          .join("\n");

        // Create analysis prompt for Gemini
        const analysisPrompt = `You are analyzing a scene from "${currentMedia.name}" to explain what's happening to the viewer.\n\nSubtitle context:\n${subtitleContext}\n\nProvide a natural 1-2 sentence explanation of what's happening in this scene. Focus on the key action and who's involved. Don't mention timestamps - just explain the scene naturally.`;

        // Use Gemini to analyze the scene
        const analysisResult = streamText({
          model: google("gemini-flash-lite-latest"),
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 300,
        });

        let explanation = "";
        for await (const chunk of analysisResult.textStream) {
          explanation += chunk;
        }

        console.log("[explainScene] Generated explanation:", explanation);

        // Find the closest subtitle to current timestamp for reference
        const closestSubtitle = relevantSubtitles.reduce((closest, current) =>
          Math.abs(current.timestamp - currentTimestamp) <
          Math.abs(closest.timestamp - currentTimestamp)
            ? current
            : closest
        );

        return {
          success: true,
          explanation: explanation.trim(),
          currentTime: {
            timestamp: currentTimestamp,
            formatted: `${Math.floor(currentTimestamp / 60)}:${String(
              Math.floor(currentTimestamp % 60)
            ).padStart(2, "0")}`,
          },
          contextSubtitles: relevantSubtitles.length,
          closestDialogue: {
            text: closestSubtitle.text,
            timestamp: closestSubtitle.timestampFormatted,
          },
          mediaName: currentMedia.name,
        };
      } catch (error) {
        console.error("[explainScene] Error:", error);
        return {
          success: false,
          error: "Failed to analyze scene content",
        };
      }
    },
  });

export const createAnalyzeMedia = (currentMedia: any) =>
  tool({
    description:
      "Analyze the entire movie or episode using subtitles to answer questions about the plot, characters, themes, or any aspect of the content. Works when media is currently playing.",
    inputSchema: z.object({
      userQuestion: z
        .string()
        .describe(
          "The user's question about the movie/episode (e.g., 'What is this about?', 'Who are the main characters?', 'What happened at the end?')"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({ userQuestion, subtitleIndex = 0 }) => {
      console.log("🎬 [analyzeMedia] Tool called with:", {
        userQuestion,
        subtitleIndex,
        currentMedia,
      });

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to analyze the content.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Format all subtitles for analysis
        const allSubtitles = result.subtitles
          .map((sub) => `[${sub.timestampFormatted}] ${sub.text}`)
          .join("\n");

        // Create analysis prompt for Gemini
        const analysisPrompt = `You are analyzing "${currentMedia.name}" to answer a user's question about the content.\n\nUser's question: "${userQuestion}"\n\nComplete subtitle content:\n${allSubtitles}\n\nProvide a helpful and accurate answer to the user's question in a natural and conversational style. Focus on the plot, characters, themes, or relevant details. Keep your response informative but concise.`;

        // Use Gemini to analyze the media
        const analysisResult = streamText({
          model: google("gemini-flash-lite-latest"),
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 500,
        });

        let answer = "";
        for await (const chunk of analysisResult.textStream) {
          answer += chunk;
        }

        console.log("[analyzeMedia] Generated answer:", answer);

        return {
          success: true,
          answer: answer.trim(),
          question: userQuestion,
          mediaName: currentMedia.name,
          subtitleCount: result.subtitles.length,
        };
      } catch (error) {
        console.error("[analyzeMedia] Error:", error);
        return {
          success: false,
          error: "Failed to analyze media content",
        };
      }
    },
  });
