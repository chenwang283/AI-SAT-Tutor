const fs = require("node:fs/promises");
const path = require("node:path");

const METHODS_DIR = path.resolve(__dirname, "..", "methods");

const METHOD_REGISTRY = [
  {
    key: "geometry-right-triangles",
    title: "Right Triangles",
    fileName: "geometry-right-triangles.txt",
    tagAliases: [
      "right triangles",
      "right triangles and trigonometry",
      "right triangles and pythagorean theorem",
      "pythagorean theorem",
      "sohcahtoa",
      "sohcahtoa complementary rule",
      "complementary trigonometric ratios",
      "special right triangles",
    ],
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
      "command of evidence qualitative",
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
  {
    key: "advanced-math-area-and-distance-formula",
    title: "Area and Distance Formula",
    fileName: "advanced-math-area-and-distance-formula.txt",
    tagAliases: ["area and distance formula", "area formulas", "distance formula", "midpoint formula"],
  },
  {
    key: "advanced-math-core-strategies",
    title: "Advanced Math Core Strategies",
    fileName: "advanced-math-core-strategies.txt",
    tagAliases: ["advanced math core strategies", "core strategies"],
  },
  {
    key: "advanced-math-equivalent-expressions",
    title: "Equivalent Expressions",
    fileName: "advanced-math-equivalent-expressions.txt",
    tagAliases: [
      "equivalent expressions",
      "adding different denominators",
      "adding rational expressions with different denominators",
      "difference of squares",
      "exponent rules",
      "factoring",
      "greatest common factor",
      "gcf",
      "perfect square trinomials",
      "polynomial long division",
    ],
  },
  {
    key: "advanced-math-foundations",
    title: "Advanced Math Foundations",
    fileName: "advanced-math-foundations.txt",
    tagAliases: [
      "advanced math foundations",
      "absolute value",
      "common denominators",
      "completing the square",
      "difference of squares",
      "exponent rules",
      "factoring",
      "foil",
      "like terms",
      "order of operations",
      "pemdas",
      "perfect square trinomials",
      "vieta's formula",
      "sum and product of roots",
    ],
  },
  {
    key: "advanced-math-nonlinear-equations-in-one-variable",
    title: "Nonlinear Equations in One Variable",
    fileName: "advanced-math-nonlinear-equations-in-one-variable.txt",
    tagAliases: [
      "nonlinear equations in 1 variable",
      "nonlinear equations in one variable",
      "quadratic discriminant",
      "discriminant",
      "solutions with 1 equation",
      "solutions with one equation",
      "sum and product of roots",
      "vieta's formula",
    ],
  },
  {
    key: "advanced-math-nonlinear-equations-in-two-variables",
    title: "Nonlinear Equations in Two Variables",
    fileName: "advanced-math-nonlinear-equations-in-two-variables.txt",
    tagAliases: [
      "nonlinear equations in 2 variables",
      "nonlinear equations in two variables",
      "solutions with 2 equations",
      "solutions with two equations",
      "expressing one variable in terms of another",
      "x in terms of variables",
    ],
  },
  {
    key: "advanced-math-nonlinear-functions",
    title: "Nonlinear Functions",
    fileName: "advanced-math-nonlinear-functions.txt",
    tagAliases: [
      "nonlinear functions",
      "axis of symmetry",
      "exponential growth",
      "factored to standard form",
      "factored form",
      "increasing and decreasing intervals",
      "interpreting the vertex",
      "polynomial properties",
      "quadratic formula",
      "quadratic word problems",
      "solving nonlinear functions",
      "standard vertex and factored forms",
      "standard to factored form",
      "standard to vertex form",
      "vertex form word problems",
      "vertex form",
      "vertical and horizontal shifts",
      "x and y intercepts",
    ],
  },
  {
    key: "geometry-area-and-volume",
    title: "Area and Volume",
    fileName: "geometry-area-and-volume.txt",
    tagAliases: [
      "area and volume",
      "cones and pyramids",
      "cubes and spheres",
      "perimeter and circumference",
      "scale factor",
      "surface area",
      "volume of prisms and irregular solids",
      "prism and irregular 3d volume",
    ],
  },
  {
    key: "geometry-circles",
    title: "Circles",
    fileName: "geometry-circles.txt",
    tagAliases: [
      "circles",
      "circle standard form equation",
      "circle foundations",
      "radians to degrees conversion",
      "circle tangents and external points",
      "tangents and external point",
      "unit circle",
    ],
  },
  {
    key: "geometry-lines-angles-and-triangles",
    title: "Lines, Angles, and Triangles",
    fileName: "geometry-lines-angles-and-triangles.txt",
    tagAliases: [
      "lines angles and triangles",
      "triangle angle sum",
      "polygon angle sum",
      "altitude to the hypotenuse",
      "similarity altitude",
      "straight angles",
      "transversals and parallel lines",
      "triangle congruence",
      "similar triangles",
      "vertical angles",
    ],
  },
  {
    key: "psda-one-variable-data",
    title: "One-Variable Data",
    fileName: "psda-one-variable-data.txt",
    tagAliases: [
      "1 variable data",
      "one variable data",
      "box plot interpretation",
      "histogram and dot plot interpretation",
      "mean median mode and range",
      "bar graph interpretation",
      "comparing multiple data sets",
      "frequency",
      "standard deviation",
      "one variable data substitution strategy",
    ],
  },
  {
    key: "psda-two-variable-data",
    title: "Two-Variable Data",
    fileName: "psda-two-variable-data.txt",
    tagAliases: [
      "2 variable data",
      "two variable data",
      "exponential equations and graphs",
      "graph interpretation and prediction",
      "linear equations and graphs",
      "quadratic equations and graphs",
      "rate of change",
    ],
  },
  {
    key: "psda-evaluating-statistical-claims",
    title: "Evaluating Statistical Claims",
    fileName: "psda-evaluating-statistical-claims.txt",
    tagAliases: [
      "evaluating statistical claims",
      "nature of random samples",
      "random samples",
      "sample generalization conceptual",
      "generalizing from a sample",
    ],
  },
  {
    key: "psda-inference",
    title: "Statistical Inference",
    fileName: "psda-inference.txt",
    tagAliases: ["statistical inference", "inference", "margin of error", "moe", "sample generalization calculations"],
  },
  {
    key: "psda-probability",
    title: "Probability and Percentages",
    fileName: "psda-probability.txt",
    tagAliases: [
      "probability",
      "probability and percentages",
      "arithmetic with percentages",
      "basic percentages",
      "basic probability",
      "chaining percentages",
      "decimals to percents",
      "percentage change between two values",
      "percentage increase and decrease",
      "missing probability elements",
      "table probability",
      "work with 100",
    ],
  },
  {
    key: "psda-ratios-rates-proportions-and-units",
    title: "Ratios, Rates, Proportions, and Units",
    fileName: "psda-ratios-rates-proportions-and-units.txt",
    tagAliases: [
      "ratios rates proportions and units",
      "proportional relationships",
      "rates",
      "unit rates",
      "ratios",
      "units",
      "unit conversion",
    ],
  },
  {
    key: "writing-rhetorical-synthesis",
    title: "Rhetorical Synthesis",
    fileName: "writing-rhetorical-synthesis.txt",
    tagAliases: ["rhetorical synthesis", "expression of ideas rhetorical synthesis", "writing rhetorical synthesis"],
  },
  {
    key: "writing-transitions",
    title: "Transitions",
    fileName: "writing-transitions.txt",
    tagAliases: ["transitions", "transition words", "expression of ideas transitions", "writing transitions"],
  },
  {
    key: "writing-boundaries",
    title: "Boundaries",
    fileName: "writing-boundaries.txt",
    tagAliases: [
      "boundaries",
      "apostrophes",
      "appositives",
      "essential vs nonessential clauses",
      "sentence structure and punctuation part 2",
      "sentence structure part 1",
      "statements vs questions",
      "statement vs question",
    ],
  },
  {
    key: "writing-form-structure-and-sense",
    title: "Form, Structure, and Sense",
    fileName: "writing-form-structure-and-sense.txt",
    tagAliases: [
      "form structure and sense",
      "subject verb agreement",
      "verb tenses",
      "word pairs",
      "pronoun usage",
      "subject modifier placement",
      "modifier placement",
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

  let bestMethod;
  let bestScore = 0;

  for (const method of METHOD_REGISTRY) {
    const normalizedAliases = new Set(method.tagAliases.map(normalizeTag));
    const score = [...normalizedTags].filter((tag) => normalizedAliases.has(tag)).length;

    if (score > bestScore) {
      bestMethod = method;
      bestScore = score;
    }
  }

  return bestMethod;
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
