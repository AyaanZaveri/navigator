import { tool } from "ai";
import { z } from "zod";

export interface ThemeToggle {
  success: boolean;
  action: string;
  theme: string;
  message: string;
}

export const themeToggle = tool({
  description:
    "Toggle or set the application theme between light, dark, or system mode",
  inputSchema: z.object({
    action: z
      .enum(["toggle", "light", "dark", "system"])
      .describe(
        "The theme action to perform: 'toggle' switches between light/dark, 'light' sets light mode, 'dark' sets dark mode, 'system' follows system preference"
      ),
  }),
  execute: async ({ action }) => {
    console.log("🌓 [themeToggle] Tool called with action:", action);

    try {
      // Return an action for the client to handle since theme management is client-side
      let targetTheme: string;
      let message: string;

      switch (action) {
        case "toggle":
          targetTheme = "toggle";
          message = "Toggling theme between light and dark mode...";
          break;
        case "light":
          targetTheme = "light";
          message = "Switching to light mode...";
          break;
        case "dark":
          targetTheme = "dark";
          message = "Switching to dark mode...";
          break;
        case "system":
          targetTheme = "system";
          message =
            "Switching to system theme (follows your device preference)...";
          break;
        default:
          return {
            success: false,
            error: "Invalid theme action",
          };
      }

      return {
        success: true,
        action: "setTheme",
        theme: targetTheme,
        message,
      };
    } catch (error) {
      console.error("[themeToggle] Error:", error);
      return {
        success: false,
        error: "Failed to toggle theme",
      };
    }
  },
});
