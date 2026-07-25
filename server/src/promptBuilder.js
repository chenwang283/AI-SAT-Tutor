const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PROMPTS_DIR = path.join(ROOT_DIR, "prompts");

async function readPromptFile(fileName) {
  return fs.readFile(path.join(PROMPTS_DIR, fileName), "utf8");
}

function formatConversation(conversation) {
  if (!conversation.length) return "(Tutoring has not started yet.)";
  return conversation
    .map((message) => `${message.role === "assistant" ? "Tutor" : "Student"}: ${message.content}`)
    .join("\n\n");
}

function formatStudentReview(review, reviewStage) {
  return JSON.stringify(
    {
      reviewStage: reviewStage || "initial",
      section: review.section,
      difficulty: review.difficulty,
      source: review.source,
      questionNumber: review.questionNumber,
      clockMode: review.clockMode,
      whereWrong: review.whereWrong,
      preventionRule: review.myRule,
      mistakeTag: review.tag,
      mistakeTagDefinition: review.tagDefinition,
      originalOutcome: review.originalOutcome,
    },
    null,
    2
  );
}

async function buildTutorPrompt({
  question,
  teachingMethod,
  conversation,
  method,
  studentReview,
  reviewStage,
}) {
  const baseInstructions = await readPromptFile("base-instructions.txt");
  const isFirstTurn = conversation.length === 0;

  return [
    baseInstructions.trim(),
    "",
    "THE QUESTION (captured):",
    JSON.stringify(question, null, 2),
    "",
    "THE STUDENT'S COMPLETED SELF-REVIEW:",
    formatStudentReview(studentReview, reviewStage),
    "",
    "OUR TEACHING METHOD for this concept (use this as a private roadmap):",
    method?.title ? `Method title: ${method.title}` : "",
    teachingMethod.trim() ||
      "(No saved method fits this topic. Say that plainly and give conservative help from the captured question without pretending it is OUR method.)",
    "",
    "TUTORING CONVERSATION:",
    formatConversation(conversation),
    "",
    isFirstTurn
      ? "This is the first teaching turn after the student completed the mistake log."
      : "This is a follow-up teaching turn.",
    isFirstTurn
      ? "Do not ask for the student's prior thought process. Do not diagnose, classify, or restate the mistake as an AI conclusion."
      : "Answer the student's latest message directly without restarting diagnosis or the full solution.",
    isFirstTurn
      ? "Treat the self-review as the starting point. If it concretely contradicts the captured answer, question, or its own rule, ask exactly one short clarification about that contradiction and stop. Do not conduct a diagnostic interview."
      : "The one-time contradiction clarification is no longer available. Continue teaching from the saved self-review and this conversation.",
    isFirstTurn
      ? "If there is no concrete contradiction, begin teaching immediately at the smallest missing piece indicated by the saved tag, explanation, and rule."
      : "Keep the response on the smallest missing piece the student needs now.",
    "Use the teaching method privately. Help the student identify the next move before asking them to execute it.",
    "Usually write 1-4 short sentences, introduce at most one new fact, ask exactly one clear question, and stop.",
    "Never reveal a multi-step solution or ask multiple future-step questions in one turn.",
    "When the student reaches the answer, verify that it matches the exact task before briefly summarizing the concept, efficient method, and general SAT pattern.",
  ].join("\n");
}

module.exports = { buildTutorPrompt, formatStudentReview };
