const assert = require("node:assert/strict");
const { selectTeachingNotes } = require("./methodLookup");

const content = [
  "Circle area uses the radius.",
  "For a no solution equation, the variable terms match but the constants do not.",
  "For a no solution equation, the variable terms match but the constants do not.",
  "A system can be solved by substitution.",
  "Check the no solution condition after simplifying both sides.",
].join("\n");
const question = {
  stem: "The equation has no solution. Find the constant.",
  explanation: "The variable terms must be equal while the constants are different.",
  tags: [{ label: "Number of solutions" }],
};

const notes = selectTeachingNotes(content, question, 240);
assert.match(notes, /no solution equation/i);
assert.match(notes, /no solution condition/i);
assert.doesNotMatch(notes, /Circle area/);
assert.equal((notes.match(/variable terms match/g) || []).length, 1);
assert.ok(notes.length <= 240);

const fallback = selectTeachingNotes("First unique note.\nFirst unique note.\nSecond note.", {}, 100);
assert.equal(fallback, "First unique note.\n\nSecond note.");

console.log("method lookup tests passed");
