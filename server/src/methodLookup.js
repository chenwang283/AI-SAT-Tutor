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
  {
    key: "linear-functions",
    title: "Linear Functions",
    fileName: "linear-functions.txt",
    tagAliases: [
      "linear functions",
      "algebra linear functions",
      "algebra - linear functions",
      "algebra linear functions notation and basics",
      "algebra - linear functions - notation and basics",
      "algebra linear functions slope intercept form",
      "algebra - linear functions - slope intercept form",
      "algebra linear functions word problems",
      "algebra - linear functions - word problems",
    ],
  },
  {
    key: "linear-equations-in-two-variables",
    title: "Linear Equations in Two Variables",
    fileName: "linear-equations-in-two-variables.txt",
    tagAliases: [
      "linear equations in 2 variables",
      "linear equations in two variables",
      "algebra linear equations in 2 variables",
      "algebra linear equations in two variables",
      "algebra - linear equations in 2 variables",
      "algebra - linear equations in two variables",
      "algebra linear equations in two variables parallel and perpendicular lines",
      "algebra - linear equations in two variables - parallel and perpendicular lines",
      "algebra linear equations in two variables point slope formula",
      "algebra - linear equations in two variables - point slope formula",
      "algebra linear equations in two variables standard form",
      "algebra - linear equations in two variables - standard form",
    ],
  },
  {
    key: "algebra-systems-of-linear-inequalities-with-two-variables",
    title: "Systems of Linear Inequalities with Two Variables",
    fileName: "algebra-systems-of-linear-inequalities-with-two-variables.txt",
    tagAliases: [
      "systems of linear inequalities with 2 variables",
      "systems of linear inequalities with two variables",
      "system of linear inequalities with 2 variables",
      "system of linear inequalities with two variables",
      "systems of linear inequalities in 2 variables",
      "systems of linear inequalities in two variables",
      "algebra systems of linear inequalities with 2 variables",
      "algebra systems of linear inequalities with two variables",
      "algebra - systems of linear inequalities with 2 variables",
      "algebra - systems of linear inequalities with two variables",
    ],
  },
  {
    key: "algebra-systems-of-linear-equations-with-two-variables",
    title: "Systems of Linear Equations with Two Variables",
    fileName: "algebra-systems-of-linear-equations-with-two-variables.txt",
    tagAliases: [
      "systems of linear equations with 2 variables",
      "systems of linear equations with two variables",
      "system of linear equations with 2 variables",
      "system of linear equations with two variables",
      "systems of linear equations in 2 variables",
      "systems of linear equations in two variables",
      "system of equations with 2 variables",
      "system of equations with two variables",
      "algebra systems of linear equations with 2 variables",
      "algebra systems of linear equations with two variables",
      "algebra - systems of linear equations with 2 variables",
      "algebra - systems of linear equations with two variables",
    ],
  },
  {
    key: "reading-words-in-context",
    title: "Words in Context",
    fileName: "reading-words-in-context.txt",
    tagAliases: [
      "words in context",
      "word in context",
      "reading words in context",
      "reading - words in context",
      "craft and structure words in context",
    ],
  },
  {
    key: "reading-text-structure-and-purpose",
    title: "Text Structure and Purpose",
    fileName: "reading-text-structure-and-purpose.txt",
    tagAliases: [
      "text structure and purpose",
      "reading text structure and purpose",
      "reading - text structure and purpose",
      "craft and structure text structure and purpose",
    ],
  },
  {
    key: "reading-inferences",
    title: "Inferences",
    fileName: "reading-inferences.txt",
    tagAliases: [
      "inferences",
      "inference",
      "reading inferences",
      "reading - inferences",
      "information and ideas inferences",
    ],
  },
  {
    key: "reading-cross-text-connections",
    title: "Cross-Text Connections",
    fileName: "reading-cross-text-connections.txt",
    tagAliases: [
      "cross-text connections",
      "cross text connections",
      "cross-text connection",
      "cross text connection",
      "reading cross-text connections",
      "reading cross text connections",
      "reading - cross-text connections",
      "craft and structure cross-text connections",
      "craft and structure cross text connections",
    ],
  },
  {
    key: "reading-command-of-evidence-textual",
    title: "Command of Evidence Textual",
    fileName: "reading-command-of-evidence-textual.txt",
    tagAliases: [
      "command of evidence textual",
      "command of evidence text",
      "command of textual evidence",
      "textual command of evidence",
      "textual evidence",
      "reading command of evidence textual",
      "reading - command of evidence textual",
      "reading textual command of evidence",
      "sat reading textual command of evidence",
      "information and ideas command of evidence textual",
      "information and ideas textual command of evidence",
    ],
  },
  {
    key: "reading-command-of-evidence-quantitative",
    title: "Command of Evidence Quantitative",
    fileName: "reading-command-of-evidence-quantitative.txt",
    tagAliases: [
      "command of evidence quantitative",
      "quantitative evidence",
      "graph questions",
      "reading command of evidence quantitative",
      "reading - command of evidence quantitative",
      "information and ideas command of evidence quantitative",
    ],
  },
  {
    key: "reading-central-ideas-and-details",
    title: "Central Ideas and Details",
    fileName: "reading-central-ideas-and-details.txt",
    tagAliases: [
      "central ideas and details",
      "central ideas",
      "main idea",
      "reading central ideas and details",
      "reading - central ideas and details",
      "information and ideas central ideas and details",
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