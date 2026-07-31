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
    .map(
      (message) =>
        `${message.role === "assistant" ? "Tutor" : "Student"}: ${message.content}`,
    )
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
    2,
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
  const { explanation, ...questionWithoutExplanation } = question;
  const answerExplanation =
    typeof explanation === "string" && explanation.trim()
      ? explanation.trim()
      : "(No StudySpaces answer explanation was captured.)";

  return [
    baseInstructions.trim(),
    "",
    "THE QUESTION (captured):",
    JSON.stringify(questionWithoutExplanation, null, 2),
    "",
    "THE STUDYSPACES ANSWER EXPLANATION (captured):",
    answerExplanation,
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
      ? "This is the first response after the student completed the mistake log. Give a hyper-personalized skill explanation, not a lesson transcript."
      : "This is a follow-up teaching turn.",
    isFirstTurn
      ? "Do not ask for the student's prior thought process. Do not rediagnose or classify the student; treat their self-review as the evidence for what they need."
      : "Answer the student's latest message directly without restarting diagnosis or the full solution.",
    isFirstTurn
      ? "Treat the self-review as the starting point. If it concretely contradicts the captured answer, question, or its own rule, ask exactly one short clarification about that contradiction and stop. Do not conduct a diagnostic interview."
      : "The one-time contradiction clarification is no longer available. Continue teaching from the saved self-review and this conversation.",
    isFirstTurn
      ? "If there is no concrete contradiction, compare the question, official answer explanation, our method, and the self-review to name the smallest transferable skill gap that actually caused this miss. Do not merely repeat the mistake tag."
      : "Keep the response on the smallest missing piece the student needs now.",
    isFirstTurn
      ? "Distinguish recognition from knowledge. If the student knew a required concept but did not notice that it was needed, focus on recognizing every required concept or method: point out the specific cue in this question and give one repeatable recognition check. Do not reteach a concept they say they know."
      : "Use the teaching method privately. Help the student identify the next move before asking them to execute it.",
    isFirstTurn
      ? "If the student did not know a required concept, briefly teach that exact concept using our method, then connect it directly to the missed question and the official explanation. If the gap was interpretation, execution, or efficiency instead, target that exact skill rather than forcing a concept lesson."
      : "Usually write 1-4 short sentences, introduce at most one new fact, ask exactly one clear question, and stop.",
    isFirstTurn
      ? "Name one main skill. Add a secondary skill only when the self-review and solution both show that it materially contributed. Explain the question-specific evidence and give one concrete action for next time."
      : "Do not repeat material the student has already demonstrated.",
    isFirstTurn
      ? "STRICT FIRST-RESPONSE FORMAT (unless asking the contradiction clarification): at most 80 words and no more than 4 short sentences. Start with 'The skill to work on is'. In order, state the skill, cite the question-specific evidence, give the brief repair, and give one concrete next-time action. Note: the repair and concrete action should be generalizable to problems of the same type (skill/subskill). Do not give repairs and actions that only apply to this one question; combine sentences when possible. Use plain prose with no headings, bullets, numbered steps, generic praise, or full solution. Do not ask a closing question. If clarification is required, ignore this format and ask only the one short question described above."
      : "Keep the response concise and focused on the student's latest need.",
    "Never reveal a multi-step solution or ask multiple future-step questions in one turn.",
    "When the student reaches the answer, verify that it matches the exact task before briefly summarizing the concept, efficient method, and general SAT pattern.",
  ].join("\n");
}

module.exports = { buildTutorPrompt, formatStudentReview };
