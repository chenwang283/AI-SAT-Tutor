const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PROMPTS_DIR = path.join(ROOT_DIR, "prompts");

async function readPromptFile(fileName) {
  return fs.readFile(path.join(PROMPTS_DIR, fileName), "utf8");
}

function formatConversation(conversation) {
  return conversation
    .map((message) => {
      const label = message.role === "assistant" ? "Tutor" : "Student";
      return `${label}: ${message.content}`;
    })
    .join("\n\n");
}

async function buildTutorPrompt({ question, teachingMethod, conversation, method }) {
  const [baseInstructions, mistakeClassification] = await Promise.all([
    readPromptFile("base-instructions.txt"),
    readPromptFile("mistake-classification.txt"),
  ]);

  const studentTurns = conversation.filter((message) => message.role === "student").length;
  const isFirstTurn = studentTurns === 1;

  return [
    baseInstructions.trim(),
    "",
    "THE QUESTION (captured):",
    JSON.stringify(question, null, 2),
    "",
    "OUR TEACHING METHOD for this concept (use this):",
    method?.title ? `Method title: ${method.title}` : "",
    teachingMethod.trim() || "(No method provided.)",
    "",
    "CONVERSATION SO FAR:",
    formatConversation(conversation),
    "",
    isFirstTurn
      ? "This is the first tutor turn. Do this, grounded in the student's own words:"
      : "This is a follow-up turn. Answer the student's latest message directly, using the original question, prior conversation, and OUR method as context.",
    isFirstTurn
      ? "1. Pinpoint the specific place their reasoning broke. If they did not say enough, say exactly what you would ask; do not invent reasoning."
      : "1. Do not restart the full explanation unless the student asks for that.",
    isFirstTurn
      ? "2. Teach the fix using OUR method above and show how the method applies here."
      : "2. Keep the answer focused on the latest confusion or follow-up question.",
    isFirstTurn
      ? "3. Classify the mistake using this list:"
      : "3. If a mistake classification is useful, reference it briefly.",
    isFirstTurn ? mistakeClassification.trim() : "",
    "",
    isFirstTurn
      ? "4. End with one short follow-up question testing the same skill."
      : "End with one short next question only if it naturally helps the student continue.",
    "",
    "Keep it tight and conversational, like you are talking directly to the student.",
  ].join("\n");
}

module.exports = { buildTutorPrompt };
