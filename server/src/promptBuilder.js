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
  reviewChange,
}) {
  const baseInstructions = await readPromptFile("base-instructions.txt");
  const isReviewUpdateTurn = Boolean(reviewChange);
  const isFirstTurn = conversation.length === 0 && !isReviewUpdateTurn;
  const { explanation, ...questionWithoutExplanation } = question;
  const answerExplanation =
    typeof explanation === "string" && explanation.trim()
      ? explanation.trim()
      : "(No StudySpaces answer explanation was captured.)";
  const turnInstructions = isReviewUpdateTurn
    ? [
        "This response was triggered because the student edited the saved mistake log after an earlier tutor response.",
        "Begin with one brief sentence recognizing the specific field or idea that changed. Then run the same audit-or-reinforce workflow below using the edited review as the new source of truth.",
        "If the edited review passes, follow the acknowledgement with the one-sentence Next time reminder. If it still needs work, follow the acknowledgement with exactly one neutral audit question. If it identifies a concept gap, acknowledge it, teach the concept briefly, and give the reminder.",
      ].join("\n")
    : isFirstTurn
      ? [
          "This is the first tutor response after the student saved the mistake log.",
          "Privately audit the saved diagnosis and rule, then choose exactly one workflow branch below.",
        ].join("\n")
      : [
          "This is a follow-up turn. Use the conversation to determine whether an audit is still underway, the student has reached a clearer root cause or rule, or the audit already ended.",
          "If an audit is underway, continue only that workflow. If the student has now articulated a materially better diagnosis or rule than the saved review, direct them to update it with Edit answers before giving the final reminder.",
          "If the audit already ended and the latest message is an ordinary tutoring question, answer it directly and concisely without restarting the audit.",
        ].join("\n");

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
    "MOST RECENT EDIT TO THE SELF-REVIEW:",
    reviewChange
      ? JSON.stringify(reviewChange, null, 2)
      : "(The student has not edited the saved self-review since the last tutor response.)",
    "",
    "OUR TEACHING METHOD for this concept (use this as a private roadmap):",
    method?.title ? `Method title: ${method.title}` : "",
    teachingMethod.trim() ||
      "(No saved method fits this topic. Do not invent one. Mention this limitation only if the selected branch requires teaching a missing concept, then give conservative help from the captured question.)",
    "",
    "TUTORING CONVERSATION:",
    formatConversation(conversation),
    "",
    "TURN CONTEXT:",
    turnInstructions,
    "",
    "AUDIT-OR-REINFORCE WORKFLOW (follow in order):",
    "1. Audit the diagnosis privately. A usable diagnosis names the concrete event or missing knowledge at or before the first point the work diverged, explains the miss, and fits the question and official explanation. A feeling or label such as 'I rushed,' 'I was careless,' or 'I got confused' is not yet a root cause. Blaming wording or structure is not specific until the student identifies the exact phrase, condition, representation, or answer-choice feature that caused the difficulty. Treat the mistake tag only as supporting context; the tag alone cannot make a vague diagnosis pass.",
    "2. If the diagnosis clearly says the student did not know a required concept or method, do not ask an audit question. Briefly teach only that missing concept from our method, connect it to the cue in this question, and finish with the transferable Next time reminder described below. Do not reveal the full solution.",
    "3. If the diagnosis is a feeling, label, unsupported wording complaint, symptom, contradiction, or otherwise too vague, ask exactly one short, neutral question that helps the student inspect what concretely occurred. Do not tell them what is wrong with their input, suggest the answer, list possible causes, audit the rule yet, teach, or give a reminder in that turn.",
    "4. Once the diagnosis is usable, audit the prevention rule privately. A usable rule names one observable action, occurs at or before the root-cause point, clearly prevents that cause, and transfers to other questions of the same type.",
    "5. If the rule is generic (for example, 'read carefully' or 'check my work'), unclear, merely says it helps, has no clear link to preventing the root cause, or fixes a downstream consequence, ask exactly one short, neutral question about what the student would do differently at the exact point the mistake began and how that action would stop the same error. Do not explain the weakness or propose replacement wording.",
    "6. If a follow-up answer is still vague, wandering, or only says the rule helps, ask one deeper neutral question and stop. Never ask more than one question per response.",
    "7. When the student identifies a materially better root cause or rule in conversation, briefly recognize the insight in their own terms and tell them to use Edit answers to update the saved mistake log, then stop. Do not write the replacement diagnosis or rule for them. After they save, re-audit the edited review.",
    "8. If both the saved diagnosis and saved rule are already usable, do not give an audit, evaluation, praise, explanation, or question. Output exactly one sentence beginning 'Next time,' with one concrete action tied to the cue and mistake in this question but reusable for other questions of the same skill or subskill. Use at most 35 words. On a review-edit turn only, the required brief change acknowledgement may appear before this sentence.",
    "9. On a concept-teaching branch, write at most 4 short sentences and 70 words total. End with a sentence beginning 'Next time,' that gives the transferable action.",
    "Use plain prose with no headings, bullets, numbered steps, generic praise, or multi-step solution in the student-facing response.",
  ].join("\n");
}

module.exports = { buildTutorPrompt, formatStudentReview };
