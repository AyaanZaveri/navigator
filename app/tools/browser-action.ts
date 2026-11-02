import { tool } from "ai";
import { z } from "zod";

export const completeAction = tool({
    description: "Execute a prepared navigation, playback, subtitle seek, or theme action in the user's app and report the actual outcome. Call after a successful action preparation; use its preparedToolCallId exactly. Never claim playback started until this tool confirms it.",
    inputSchema: z.object({ preparedToolCallId: z.string() }),
    outputSchema: z.object({
        preparedToolCallId: z.string(), success: z.boolean(),
        status: z.enum(["completed", "requested", "failed", "cancelled"]), message: z.string(),
    }),
});
