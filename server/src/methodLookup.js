const fs = require("node:fs/promises");
const path = require("node:path");

const METHODS_DIR = path.resolve(__dirname, "..", "methods");

const METHOD_REGISTRY = [
  {
    key: "special-right-triangles",
    title: "Special Right Triangles",
    fileName: "special-right-triangles.txt",
    tagAliases: ["special right triangles"],
  },
  {
    key: "linear-equations-in-one-variable",
    title: "Linear Equations in One Variable",
    fileName: "linear-equations-in-one-variable.txt",
    tagAliases: [
      "linear equations in one variable",
      "algebra linear equations in one variable",
      "algebra - linear equations in one variable",
    ],
  },
];

function normalizeTag(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getQuestionTagLabels(question) {
  if (!Array.isArray(question?.tags)) {
    return [];
  }

  return question.tags
    .map((tag) => {
      if (typeof tag === "string") return tag;
      if (tag && typeof tag.label === "string") return tag.label;
      return null;
    })
    .filter(Boolean);
}

function findMethodForQuestion(question) {
  const normalizedTags = new Set(getQuestionTagLabels(question).map(normalizeTag));

  return METHOD_REGISTRY.find((method) =>
    method.tagAliases.some((alias) => normalizedTags.has(normalizeTag(alias)))
  );
}

async function lookupTeachingMethod(question) {
  const method = findMethodForQuestion(question);

  if (!method) {
    return {
      key: null,
      title: null,
      content: "",
    };
  }

  const content = await fs.readFile(path.join(METHODS_DIR, method.fileName), "utf8");

  return {
    key: method.key,
    title: method.title,
    content,
  };
}

module.exports = { lookupTeachingMethod };