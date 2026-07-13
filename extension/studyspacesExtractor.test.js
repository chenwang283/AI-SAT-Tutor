const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extractorPath = path.join(__dirname, "studyspacesExtractor.js");
const sidepanelPath = path.join(__dirname, "sidepanel.js");
const exportMarker = "globalThis.aiSatTutorExtractQuestion = extractQuestion;";
const source = fs.readFileSync(extractorPath, "utf8");

assert.ok(source.includes(exportMarker), "Unable to expose extractor test hooks.");

const instrumentedSource = source.replace(
  exportMarker,
  `globalThis.__extractorTestHooks = {
    normalizeMathUnicode,
    readRenderedMath,
    formatMathForText,
    replaceMathNodes,
  };
  ${exportMarker}`
);
const sandbox = {
  document: {
    createTextNode(textContent) {
      return { textContent };
    },
  },
  globalThis: {},
};
vm.runInNewContext(instrumentedSource, sandbox, { filename: extractorPath });

const { normalizeMathUnicode, readRenderedMath, formatMathForText, replaceMathNodes } =
  sandbox.globalThis.__extractorTestHooks;

function makeElement({
  attributes = {},
  className,
  queryResults = {},
  queryAllResults = {},
  textContent = "",
  value,
} = {}) {
  return {
    attributes,
    classList: {
      contains(name) {
        return className?.split(/\s+/).includes(name) || false;
      },
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    parentElement: null,
    querySelector(selector) {
      return queryResults[selector] ?? null;
    },
    querySelectorAll(selector) {
      return queryAllResults[selector] ?? [];
    },
    textContent,
    value,
  };
}

const equation = "0.75t - 0.58 = 5(t - 0.04) + 0.96";
const renderer = makeElement();
const editor = makeElement({
  className: "Tiptap-mathematics-editor",
  textContent: equation,
});
const wrapper = makeElement();
wrapper.children = [renderer, editor];
renderer.parentElement = wrapper;
editor.parentElement = wrapper;

assert.equal(readRenderedMath(renderer), equation);
assert.equal(formatMathForText(readRenderedMath(renderer), true), `\\(${equation}\\)`);

const attributeRenderer = makeElement({
  attributes: { "data-latex": "x^2 + 1" },
  textContent: "duplicated rendered text",
});
assert.equal(readRenderedMath(attributeRenderer), "x^2 + 1");

const mathMl = makeElement({ textContent: "0.75𝑡−0.58=5(𝑡−0.04)+0.96" });
const mathMlRenderer = makeElement({ queryResults: { math: mathMl } });
assert.equal(readRenderedMath(mathMlRenderer), mathMl.textContent);
assert.equal(normalizeMathUnicode(mathMl.textContent), "0.75t−0.58=5(t−0.04)+0.96");

const mathField = makeElement({ value: equation });
assert.equal(readRenderedMath(mathField), equation);

const replacements = [];
const clonedMathFields = [makeElement(), makeElement()];
clonedMathFields.forEach((node) => {
  node.replaceWith = (replacement) => replacements.push(replacement.textContent);
});
const clonedStem = {
  contains(node) {
    return clonedMathFields.includes(node);
  },
  querySelectorAll(selector) {
    return selector === "math-field" ? clonedMathFields : [];
  },
};
replaceMathNodes(clonedStem, "math-field", ["t", equation], true);
assert.deepEqual(replacements, ["\\(t\\)", `\\(${equation}\\)`]);

assert.equal(formatMathForText("", true), "[math expression unavailable]");

const sidepanelSource = fs.readFileSync(sidepanelPath, "utf8");
assert.equal(
  sidepanelSource.match(/world:\s*"MAIN"/g)?.length,
  2,
  "The extractor file and invocation must both run in the page's MAIN world."
);

console.log("studyspacesExtractor math regression tests passed");
