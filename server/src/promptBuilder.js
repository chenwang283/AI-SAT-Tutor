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
        "If the edited review passes, follow the acknowledgement with the one-sentence Next time reminder. If a field still needs work, follow the acknowledgement with that field's required notice and exactly one audit question. If it identifies a concept gap, acknowledge it, teach the concept briefly, and give the reminder.",
      ].join("\n")
    : isFirstTurn
      ? [
          "This is the first tutor response after the student saved the mistake log.",
          "Privately audit the saved diagnosis and rule, then choose exactly one workflow branch below.",
        ].join("\n")
      : [
          "This is a follow-up turn. Use the conversation to determine whether an audit is still underway, the student has reached a clearer root cause or rule, or the audit already ended.",
          "Judge the diagnosis from all student messages in the current audit together. A concrete conversational diagnosis overrides a vague saved diagnosis for choosing this response, even though the student must still save it with Edit answers.",
          "If any student message has already supplied the exact missing detail for a diagnosis or rule, direct them to update that field with Edit answers and stop. Do not ask for why it happened, what came before or after, or a fuller process. Do not draft or paraphrase text for them to paste.",
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
    "MANDATORY FOLLOW-UP DIAGNOSIS STOP CHECK (takes priority over every audit-question rule below):",
    "1. Read all student messages since the current diagnosis audit began. Treat them as one cumulative answer; do not judge only the saved diagnosis or latest message.",
    "2. The diagnosis is complete when the student identifies the step, question detail, or concept involved and gives the specific wrong action, interpretation, or result.",
    "3. A wrong-versus-correct comparison always passes. Saying what they wrote, chose, or got and what it should have been is enough. Do not require why it happened, what they did next, or their full thought process.",
    "4. Informal wording, slang, spelling, or grammar cannot make an otherwise clear diagnosis fail. An earlier qualifying message stays sufficient even if a later message is brief, unclear, or adds nothing.",
    "5. Acceptance example: 'I messed up the multiplication because I wrote k/5(10x) as 5kx and not 2kx.' This is a complete diagnosis, not Level 1. Respond exactly: 'You found the mistake. Update \"Where I went wrong\" in Edit answers.'",
    "6. Only use the diagnosis ladder when no student message meets these stop conditions.",
    "",
    "AUDIT-OR-REINFORCE WORKFLOW (follow in order):",
    "1. Audit the diagnosis privately. A usable diagnosis names the concrete event or missing knowledge at or before the first point the work diverged and fits the question and official explanation. It does not need a deeper psychological cause. A feeling or label such as 'I rushed,' 'I was careless,' or 'I got confused' is not yet a root cause. Blaming wording or structure is not specific until the student identifies the exact phrase, condition, representation, or answer-choice feature that caused the difficulty. Treat the mistake tag only as supporting context; the tag alone cannot make a vague diagnosis pass.",
    "2. If the diagnosis clearly says the student did not know a required concept or method, do not ask an audit question. Briefly teach only that missing concept from our method, connect it to the cue in this question, and finish with the transferable Next time reminder described below. Do not reveal the full solution.",
    "3. If the diagnosis is a feeling, label, unsupported wording complaint, symptom, contradiction, or otherwise too vague, tell the student that the saved diagnosis needs more detail and use the DIAGNOSIS LADDER below. Do not audit the rule yet, teach, or give a reminder in that turn.",
    "4. Once the diagnosis is usable, audit the prevention rule privately. A usable rule names one observable action, occurs at or before the root-cause point, clearly prevents that cause, and transfers to other questions of the same type.",
    "5. If the rule is generic (for example, 'read carefully' or 'check my work'), unclear, merely says it helps, has no clear link to preventing the root cause, or fixes a downstream consequence, tell the student that the saved rule needs more detail and use the RULE LADDER below.",
    "6. When any student message in the current audit supplies the exact missing detail for a diagnosis, say only: 'You found the mistake. Update \"Where I went wrong\" in Edit answers.' When they supply a clear preventive action for a rule, say only: 'Your rule is now clear. Update \"My rule\" in Edit answers.' After they save, re-audit the edited review. Never write, rewrite, suggest, model, quote, or paraphrase replacement text for either field. Never say 'something like' or give a sentence they could paste.",
    "7. If both saved fields are already usable, do not give an audit, evaluation, praise, explanation, or question. Output exactly one sentence beginning 'Next time,' with one reusable action for other questions of the same skill or subskill. Use at most 25 words. It may name the reusable skill or cue, but it must not include exact variables, numbers, expressions, equation sides, answer choices, or wording unique to this problem. Model: 'Next time, when you distribute a fraction, multiply it by each term before moving on.' On a review-edit turn only, the required brief change acknowledgement may appear before this sentence.",
    "8. On a concept-teaching branch, write at most 4 short sentences and 70 words total. End with a sentence beginning 'Next time,' that follows the same 25-word, generalizable reminder rule.",
    "",
    "AUDIT QUESTION CONTRACT (apply to every diagnosis or rule audit):",
    "- The first audit response for a field has exactly two sentences: the required field notice, then one question. On a review-edit turn only, the required brief change acknowledgement may come first.",
    "- Use exactly this diagnosis notice: 'Your \"Where I went wrong\" answer needs more detail.' Use exactly this rule notice: 'Your rule needs more detail.' Each notice is at most 10 words.",
    "- Show each field notice at most once during one continuous audit. On later questions about that same field, output only the question. A saved edit starts a new audit of that field.",
    "- The question must contain 7 to 14 words, start with What, Where, Which, or How, and end with the response's only question mark.",
    "- Ask for exactly one missing detail. Use exactly one context anchor: a short task or step already present in the student's latest message, then the saved diagnosis, or, only when neither supplies one, the broad question type.",
    "- The official explanation is private evidence. Never use it to insert a correct step or cause the student has not named. Do not list possible causes or offer answer choices.",
    "- Do not use 'and' or 'or' in the question. Do not use parentheses, em dashes, exact numbers, variables, expressions, correct-answer facts, or more than one necessary math term.",
    "- Never repeat a prior tutor question verbatim. If the requested detail was truly not answered, ask for that same detail in shorter words; do not switch to what happened before or after.",
    "- Use short, common words at or below a sixth-grade reading level. Avoid words such as 'diverged,' 'root cause,' 'coefficient,' 'constant term,' 'prevention,' and 'usable' in student-facing text when simpler words work.",
    "",
    "DIAGNOSIS LADDER (move down only one level per response):",
    "- Level 0, no step named: anchor to the student's feeling/label or the broad task and ask which part or action went wrong. Models: 'Which step in solving the equation do you think went wrong?' or 'What did rushing cause you to do wrong?'",
    "- Level 1, a step is named but the mistake is unclear: repeat only that step and ask what the student did wrong. Model: 'What did you multiply wrong when you distributed?'",
    "- Level 2, the exact wrong action or result is known: do not ask another question. A wrong-versus-correct comparison is always Level 2. Give the fixed Edit answers direction in workflow step 6.",
    "",
    "RULE LADDER (move down only one level per response):",
    "- Level 0, the rule is generic: use one anchor from the accepted diagnosis and ask for one action at that point. Model: 'What will you do while distributing to stop that mistake?'",
    "- Level 1, an action is named but its link is unclear: ask only how it stops the diagnosed mistake. Model: 'How will that step stop the distribution mistake?'",
    "- Level 2, the action clearly prevents the mistake: do not ask another question. Give the fixed Edit answers direction in workflow step 6 if the clear rule exists only in conversation.",
    "Never skip a ladder level by packing several steps, possible causes, or requested details into one question.",
    "FINAL CHECK BEFORE WRITING: if any earlier student message meets the diagnosis stop rule, the fixed Edit answers direction takes priority. Do not output another diagnosis notice or question.",
    "Use plain prose with no headings, bullets, numbered steps, generic praise, or multi-step solution in the student-facing response.",
  ].join("\n");
}

module.exports = { buildTutorPrompt, formatStudentReview };
