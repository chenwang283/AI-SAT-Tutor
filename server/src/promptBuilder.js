const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PROMPTS_DIR = path.join(ROOT_DIR, "prompts");

async function readPromptFile(fileName) {
  return fs.readFile(path.join(PROMPTS_DIR, fileName), "utf8");
}

async function buildTutorPrompt({ question, teachingMethod, studentThinking }) {
  const [baseInstructions, mistakeClassification] = await Promise.all([
    readPromptFile("base-instructions.txt"),
    readPromptFile("mistake-classification.txt"),
  ]);

  return [
    baseInstructions.trim(),
    "",
    "THE QUESTION (captured):",
    JSON.stringify(question, null, 2),
    "",
    "OUR TEACHING METHOD for this concept (use this):",
    teachingMethod.trim() || "(No method provided.)",
    "",
    "WHAT THE STUDENT TYPED ABOUT THEIR THINKING:",
    studentThinking.trim() || "(The student did not explain their thinking.)",
    "",
    "Do this, grounded in the student's own words:",
    "1. Pinpoint the specific place their reasoning broke. If they did not say enough, say exactly what you would ask; do not invent reasoning.",
    "2. Teach the fix using OUR method above and show how the method applies here.",
    "3. Classify the mistake using this list:",
    mistakeClassification.trim(),
    "",
    "4. End with one short follow-up question testing the same skill.",
    "",
    "Keep it tight and conversational, like you are talking directly to the student.",
  ].join("\n");
}

module.exports = { buildTutorPrompt };
