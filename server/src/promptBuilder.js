const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_INSTRUCTIONS_PATH = path.resolve(
  __dirname,
  "..",
  "prompts",
  "base-instructions.txt",
);
let baseInstructionsPromise;

function readBaseInstructions() {
  if (!baseInstructionsPromise) {
    baseInstructionsPromise = fs.readFile(BASE_INSTRUCTIONS_PATH, "utf8");
  }
  return baseInstructionsPromise;
}

function compactValue(value) {
  if (Array.isArray(value)) {
    const values = value.map(compactValue).filter((item) => item !== undefined);
    return values.length ? values : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactValue(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text || undefined;
  }
  return value == null ? undefined : value;
}

function selectQuestionContext(question) {
  const tagLabels = Array.isArray(question.tags)
    ? question.tags
        .map((tag) => (typeof tag === "string" ? tag : tag?.label))
        .filter((tag) => typeof tag === "string" && tag.trim())
    : [];
  const figureDetails = Array.isArray(question.figures)
    ? question.figures.map((figure) => ({
        alt: figure?.alt,
        width: figure?.width,
        height: figure?.height,
        capturedImage: figure?.capturedImage,
      }))
    : [];

  return (
    compactValue({
      questionType: question.questionType,
      stem: question.stem,
      options: question.options,
      selectedLetter: question.selectedLetter,
      correctLetter: question.correctLetter,
      freeResponse: question.freeResponse,
      tags: tagLabels,
      hasFigure: question.hasFigure,
      figures: figureDetails,
    }) || {}
  );
}

function formatConversation(conversation) {
  if (!conversation.length)
    return "(No messages in the current review context.)";
  return conversation
    .map(
      (message) =>
        (message.role === "assistant" ? "Tutor" : "Student") +
        ": " +
        message.content,
    )
    .join("\n\n");
}

function formatStudentReview(review, reviewStage) {
  return JSON.stringify(
    compactValue({
      reviewStage: reviewStage || "initial",
      section: review.section,
      difficulty: review.difficulty,
      clockMode: review.clockMode,
      whereWrong: review.whereWrong,
      preventionRule: review.myRule,
      mistakeTag: review.tag,
      mistakeTagDefinition: review.tagDefinition,
    }),
    null,
    2,
  );
}

function buildTurnContext({ conversation, reviewChange }) {
  if (reviewChange) {
    return [
      "EDIT TURN: The student just saved changes to the review.",
      "Briefly recognize the changed field or idea. Treat the edited saved review as the source of truth.",
      "The active conversation starts after the save; do not revive an earlier audit.",
    ].join("\n");
  }
  if (!conversation.length) {
    return "FIRST TURN: Audit the saved diagnosis, then the saved rule.";
  }
  return [
    "FOLLOW-UP TURN: Use only the active conversation below.",
    "If it supplies a better diagnosis or rule than the saved review, ask the student to save that field with Edit answers.",
    "If the review process already ended and the student asks a normal tutoring question, answer it briefly without restarting the audit.",
  ].join("\n");
}

const TUTOR_POLICY = [
  "DECISION FLOW (use the first matching branch):",
  "1. Check the saved diagnosis. It passes if it names the relevant step, question detail, or missing concept and states the specific wrong action, interpretation, or result. A clear wrong-versus-correct comparison passes. Slang, spelling, and grammar do not make a clear diagnosis fail.",
  "2. If the saved diagnosis says a concept or method was unknown, teach only that gap from the method notes. Use at most 4 short sentences and 70 words. End with the general Next time reminder from step 7.",
  "3. If the saved diagnosis is vague, check all student messages in the active conversation together. If they now meet step 1, say only: 'You found the mistake. Update \"Where I went wrong\" in Edit answers.' Do not ask why, what happened before or after, or for a fuller process.",
  "4. If the diagnosis is still vague, ask for only the next missing detail. A feeling or label needs the action it caused. A wording complaint needs the exact words or feature and what the student did because of it. A named step needs the specific wrong action or result.",
  "5. After the saved diagnosis passes, check the saved rule. It passes if it names one action at or before the mistake and clearly shows how that action prevents the same mistake on similar questions.",
  "6. If the saved rule is vague, check the active conversation. If it now meets step 5, say only: 'Your rule is now clear. Update \"My rule\" in Edit answers.' Otherwise ask for one action at the mistake point or how the stated action prevents the mistake.",
  "7. When both saved fields pass, output one sentence beginning 'Next time,' with one action that applies to the same skill or question type. Use at most 25 words. Do not include values, variables, expressions, answer choices, equation sides, or wording unique to this question.",
  "",
  "AUDIT RESPONSE CONTRACT:",
  "- The first time a field needs work, use its notice, then one question: 'Your \"Where I went wrong\" answer needs more detail.' or 'Your rule needs more detail.'",
  "- Show each field notice once in the active conversation. Later replies about that field contain only the question.",
  "- Ask exactly one 7-to-14-word question. Request one detail and use one short anchor from the student's words or the broad task.",
  "- Start the question with What, Where, Which, or How. Do not use 'and' or 'or', parentheses, em dashes, answer choices, suggested causes, or solution hints.",
  "- Never repeat a prior tutor question. If the requested detail was not answered, ask for the same detail in shorter words.",
  "- Never write, rewrite, suggest, quote, or paraphrase text for the student to paste into either field.",
  "- Use plain prose with no headings, bullets, numbered steps, generic praise, or full solution in the student-facing response.",
].join("\n");

async function buildTutorPrompt({
  question,
  teachingMethod,
  conversation,
  method,
  studentReview,
  reviewStage,
  reviewChange,
}) {
  const baseInstructions = await readBaseInstructions();
  const explanation =
    typeof question.explanation === "string" && question.explanation.trim()
      ? question.explanation.trim()
      : "(No StudySpaces answer explanation was captured.)";
  const sections = [
    baseInstructions.trim(),
    "",
    "TURN:",
    buildTurnContext({ conversation, reviewChange }),
    "",
    "QUESTION:",
    JSON.stringify(selectQuestionContext(question), null, 2),
    "",
    "OFFICIAL ANSWER EXPLANATION:",
    explanation,
    "",
    "SAVED STUDENT REVIEW:",
    formatStudentReview(studentReview, reviewStage),
  ];

  if (reviewChange) {
    sections.push(
      "",
      "SAVED REVIEW CHANGE:",
      JSON.stringify(reviewChange, null, 2),
    );
  }

  sections.push(
    "",
    "SELECTED TEACHING NOTES:",
    method?.title ? "Method: " + method.title : "",
    teachingMethod.trim() ||
      "(No matching teaching notes were found. Give conservative help only if a concept must be taught.)",
    "",
    "ACTIVE CONVERSATION:",
    formatConversation(conversation),
    "",
    TUTOR_POLICY,
  );

  return sections.filter((section) => section !== "").join("\n");
}

module.exports = {
  buildTutorPrompt,
  compactValue,
  formatStudentReview,
  selectQuestionContext,
};
