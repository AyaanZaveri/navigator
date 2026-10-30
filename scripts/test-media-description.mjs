import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/media-description.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { completeMediaDescription, needsCompleteDescription } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

assert.equal(
  needsCompleteDescription("A climber must face her fears to su..."),
  true,
);
assert.equal(needsCompleteDescription("A climber must face her fears…"), true);
assert.equal(needsCompleteDescription("  "), true);
assert.equal(needsCompleteDescription("A complete story."), false);

const full = {
  id: "movie-1",
  description: "A complete story.",
  poster: "chosen.jpg",
};
let calls = 0;
assert.equal(
  await completeMediaDescription(full, [], async () => {
    calls++;
    return "Alternative.";
  }),
  full,
);
assert.equal(calls, 0, "Complete synopses must not trigger extra lookups");

const shortened = { ...full, description: "A shortened sto..." };
const repaired = await completeMediaDescription(shortened, [
  Promise.resolve({ ...full, poster: "other.jpg" }),
]);
assert.equal(repaired.description, full.description);
assert.equal(
  repaired.poster,
  shortened.poster,
  "Synopsis repair must preserve the selected artwork",
);
assert.equal(repaired.id, shortened.id);

const fallback = await completeMediaDescription(
  shortened,
  [Promise.resolve(shortened)],
  async () => "A complete fallback story.",
);
assert.equal(fallback.description, "A complete fallback story.");
assert.equal(fallback.poster, shortened.poster);

const missing = await completeMediaDescription(
  { id: "movie-1" },
  [],
  async () => "The missing synopsis.",
);
assert.equal(missing.description, "The missing synopsis.");

const unavailable = await completeMediaDescription(
  shortened,
  [Promise.reject(new Error("Addon unavailable"))],
  async () => {
    throw new Error("Fallback unavailable");
  },
);
assert.equal(
  unavailable,
  shortened,
  "Lookup failure must preserve the existing description",
);
const stillShort = await completeMediaDescription(
  shortened,
  [],
  async () => "Another shortened sto...",
);
assert.equal(
  stillShort,
  shortened,
  "Never replace one truncated description with another",
);

let finishAddon;
const pending = new Promise((resolve) => {
  finishAddon = resolve;
});
const firstComplete = completeMediaDescription(
  shortened,
  [pending],
  () => new Promise(() => {}),
);
finishAddon(full);
assert.equal(
  (await firstComplete).description,
  full.description,
  "A stalled fallback must not block a complete addon result",
);
console.log("Media description regression checks passed.");
