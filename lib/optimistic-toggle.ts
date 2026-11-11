/** Serializes a reversible preference while keeping the latest click visible. */
export function createOptimisticToggle(options: {
    read(): boolean;
    update(_value: boolean): void;
    save(_value: boolean): Promise<boolean>;
    failed(_error: unknown): void;
}) {
    let active = true;
    let running = false;
    let confirmed = false;
    let desired = false;
    let revision = 0;
    async function drain() {
        running = true;
        while (active) {
            const sent = desired;
            const intent = revision;
            let error: unknown;
            if (sent !== confirmed) {
                try { confirmed = await options.save(sent); }
                catch (cause) { error = cause; }
            }
            if (!active) return;
            if (revision !== intent) continue;
            running = false;
            options.update(confirmed);
            if (error) options.failed(error);
            return;
        }
    }
    return {
        isPending: () => running,
        set(value: boolean) {
            if (!active) return;
            if (!running) confirmed = options.read();
            desired = value;
            revision++;
            options.update(value);
            if (!running) void drain();
        },
        dispose() { active = false; },
    };
}
