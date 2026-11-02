import type { UIMessage } from "ai";
import { actionToolNames, record } from "./navigator-chat";

/** A generated reply does not confirm a pending or merely requested action. */
export function isNavigatorRequestComplete(messages: UIMessage[]): boolean {
    const turn = messages.slice(messages.findLastIndex(message => message.role === "user") + 1);
    return turn.some(message => message.role === "assistant") && turn.every(message => message.parts.every(raw => {
        const part = record(raw);
        if (part.type !== "dynamic-tool" && !String(part.type).startsWith("tool-")) return true;
        const output = record(part.output);
        if (part.state === "output-error" || part.state === "output-denied" || output.success === false) return false;
        const name = part.type === "dynamic-tool" ? part.toolName : String(part.type).slice(5);
        if (!actionToolNames.has(name)) return true;
        return part.state === "output-available" && output.status !== "requested"
            && (!output.preparedToolCallId || output.execution === "completed");
    }));
}

/** Place the duration once, under the last assistant message for each request. */
export function navigatorResponseDurations(messages: UIMessage[], durationsMs: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    let userId: string | undefined;
    let lastAssistant: string | undefined;
    const finishTurn = () => {
        if (userId && lastAssistant && durationsMs[userId] !== undefined) result[lastAssistant] = durationsMs[userId] / 1000;
    };
    messages.forEach((message, index) => {
        if (message.role === "user") {
            finishTurn();
            userId = message.id || `user-${index}`;
            lastAssistant = undefined;
        } else if (message.role === "assistant") {
            lastAssistant = message.id;
        }
    });
    finishTurn();
    return result;
}
