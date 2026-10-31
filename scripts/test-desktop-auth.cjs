const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(fs.readFileSync("app/actions/auth.ts", "utf8"), {
    fileName: "app/actions/auth.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function authenticate(env) {
    const written = [];
    const policy = { exports: {}, process: { env } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/cookie-policy.ts", "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, policy);
    const context = {
        exports: {}, process: { env }, console, Date,
        require(name) {
            if (name === "@/lib/cookie-policy") return policy.exports;
            if (name === "next/headers") return { cookies: async () => ({ set: (...args) => written.push(args) }) };
            if (name === "next/navigation") return { redirect() { throw new Error("Unexpected redirect"); } };
            throw new Error(`Unexpected dependency: ${name}`);
        },
        async fetch(url, options) {
            assert.equal(url, "https://api.strem.io/api/login");
            assert.equal(JSON.parse(options.body).email, "desktop-fixture@example.invalid");
            return { ok: true, json: async () => ({ result: {
                authKey: "desktop-fixture-token",
                user: { _id: "fixture", email: "desktop-fixture@example.invalid" },
            } }) };
        },
    };
    vm.runInNewContext(compiled, context);
    assert.equal(await context.exports.authenticateUser("desktop-fixture@example.invalid", "fixture-password"), true);
    assert.equal(written.length, 1);
    assert.equal(written[0][0], "stremio-auth");
    assert.equal(JSON.parse(written[0][1]).authKey, "desktop-fixture-token");
    return written[0][2];
}

async function run() {
    const desktop = await authenticate({ NODE_ENV: "production", NAVIGATOR_DESKTOP: "1", HOSTNAME: "127.0.0.1" });
    assert.equal(desktop.secure, false, "The desktop's HTTP loopback session cookie must not require HTTPS");
    assert.equal(desktop.sameSite, "lax");
    assert.equal(desktop.path, "/");
    assert.equal(desktop.maxAge, 30 * 24 * 60 * 60);
    const hosted = await authenticate({ NODE_ENV: "production" });
    assert.equal(hosted.secure, true, "Hosted production must keep HTTPS-only cookies");
    const dev = await authenticate({ NODE_ENV: "development" });
    assert.equal(dev.secure, false);
    const wrongFlag = await authenticate({ NODE_ENV: "production", NAVIGATOR_DESKTOP: "true" });
    assert.equal(wrongFlag.secure, true, "Only the native server's explicit flag changes transport policy");
    const publicHost = await authenticate({ NODE_ENV: "production", NAVIGATOR_DESKTOP: "1", HOSTNAME: "0.0.0.0" });
    assert.equal(publicHost.secure, true, "The desktop exception is restricted to the loopback-bound server");
    console.log("Desktop and hosted authentication cookie tests passed.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
