const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sidepanelPath = path.join(__dirname, "sidepanel.js");
const source = fs.readFileSync(sidepanelPath, "utf8");
const functionStart = source.indexOf("function protectMath");
const functionEnd = source.indexOf("function createMathElement", functionStart);

assert.notEqual(functionStart, -1, "Unable to find protectMath.");
assert.notEqual(functionEnd, -1, "Unable to isolate protectMath.");

const sandbox = { globalThis: {} };
vm.runInNewContext(
  source.slice(functionStart, functionEnd) + "\nglobalThis.__protectMath = protectMath;",
  sandbox,
  { filename: sidepanelPath }
);

const protectMath = sandbox.globalThis.__protectMath;
const proseHeading = "### Fix (OUR method: One-Variable Data -> Mean = sum / number)";
const protectedHeading = protectMath(proseHeading);

assert.equal(protectedHeading.markdown, proseHeading);
assert.equal(protectedHeading.expressions.length, 0);

const parenthesizedProse = protectMath("Use dataset (A) and compare (mean = sum divided by count).");
assert.equal(parenthesizedProse.markdown, "Use dataset (A) and compare (mean = sum divided by count).");
assert.equal(parenthesizedProse.expressions.length, 0);

const explicitMath = protectMath(
  "Inline \\(x = 2\\), display \\[y = 3\\], dollar $z = 4$, and block $$w = 5$$."
);
assert.equal(explicitMath.expressions.length, 4);
assert.deepEqual(
  Array.from(explicitMath.expressions, ({ expression, displayMode }) => ({ expression, displayMode })),
  [
    { expression: "y = 3", displayMode: true },
    { expression: "w = 5", displayMode: true },
    { expression: "x = 2", displayMode: false },
    { expression: "z = 4", displayMode: false },
  ]
);

console.log("sidepanel math detector regression tests passed");
