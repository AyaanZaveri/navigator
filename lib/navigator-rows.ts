import type { UIMessage } from "ai";
import { record } from "./navigator-chat";
import { navigatorPartComplete } from "./navigator-timing";

export interface NavigatorTurn {
    user: UIMessage | undefined;
    userText: string;
    parts: UIMessage["parts"];
    cancelled: boolean;
    statusMessageId: string | undefined;
    messages: UIMessage[];
}
export interface NavigatorRow { message: UIMessage; turn: NavigatorTurn; previousAssistant: boolean; complete: boolean }

/** Linear transcript derivation. Cache identities are a rendering optimization,
 * never a source of truth, and contain only the immediately previous transcript. */
export function createNavigatorRowDeriver() {
    let previous: NavigatorRow[] = [];
    return (messages: UIMessage[]): NavigatorRow[] => {
        const old = new Map(previous.map(row => [row.message.id, row]));
        const result: NavigatorRow[] = [];
        let group: UIMessage[] = [];
        const finish = () => {
            if (!group.length) return;
            const cached = old.get(group[0].id)?.turn;
            if (cached && cached.messages.length === group.length && group.every((message, i) => message === cached.messages[i])) {
                for (const message of group) {
                    const row = old.get(message.id)!;
                    const previousAssistant = result.at(-1)?.message.role === "assistant";
                    result.push(row.previousAssistant === previousAssistant ? row : { ...row, previousAssistant });
                }
                group = [];
                return;
            }
            const assistants = group.filter(message => message.role === "assistant");
            const user = group[0].role === "user" ? group[0] : undefined;
            const turn: NavigatorTurn = { user, userText: user?.parts.filter(part => part.type === "text").map(part => part.text).join("") || "",
                parts: assistants.flatMap(message => message.parts), cancelled: record(user?.metadata).navigatorRequestState === "cancelled",
                statusMessageId: assistants.at(-1)?.id ?? user?.id, messages: group };
            let complete = true, hasAssistant = false;
            for (const message of group) {
                if (message.role === "assistant") hasAssistant = true;
                if (message.role !== "user") complete &&= message.parts.every(navigatorPartComplete);
                const previousAssistant = result.at(-1)?.message.role === "assistant";
                const row = old.get(message.id);
                result.push(row && row.message === message && row.turn === turn && row.previousAssistant === previousAssistant && row.complete === (complete && hasAssistant)
                    ? row : { message, turn, previousAssistant, complete: complete && hasAssistant });
            }
            group = [];
        };
        for (const message of messages) { if (message.role === "user") finish(); group.push(message); }
        finish(); previous = result; return result;
    };
}
