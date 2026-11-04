import type { UIMessage } from "ai";
import { actionToolNames, record } from "@/lib/navigator-chat";

/** Server-side invariants only; task interpretation belongs to the model. */
export function navigatorToolPolicy(messages: UIMessage[]) {
    const userIndex = messages.findLastIndex(message => message.role === "user");
    const actionHandled = messages.slice(userIndex + 1).some(message => message.parts.some(part => {
        const item = record(part);
        const output = record(item.output);
        return actionToolNames.has(String(item.type).replace(/^tool-/, ""))
            && item.state === "output-available" && (output.success === true || output.execution === "completed");
    }));
    return { actionHandled };
}
