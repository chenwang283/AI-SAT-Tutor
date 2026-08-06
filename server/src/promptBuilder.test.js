const assert = require("node:assert/strict");
const {
  REVIEW_INSTRUCTIONS,
  buildResponseRequest,
  buildReviewRequest,
  selectAuditQuestionContext,
  selectChatQuestionContext,
} = require("./promptBuilder");

const question = {
  questionType: "free_response",
  stem: "A linear equation has no solution. Find k.",
  freeResponse: {
    correctAnswer: "2",
    studentAnswer: "4/5",
    isCorrect: false,
  },
  explanation: "Distribute first, then compare the coefficients.",
  tags: [{ label: "Algebra" }, { label: "Linear equations in one variable" }],
  selectedLetter: "A",
  correctLetter: "B",
};

const studentReview = {
  section: "math",
  difficulty: "hard",
  clockMode: "untimed",
  whereWrong: "I wrote 5kx instead of 2kx.",
  myRule: "Be careful.",
  tag: "1",
  tagDefinition: "Calculation error",
};

const auditQuestion = selectAuditQuestionContext(question);
assert.equal(auditQuestion.freeResponse, undefined);
assert.equal(auditQuestion.tags, undefined);
assert.equal(auditQuestion.correctFreeResponse, "2");
assert.doesNotMatch(JSON.stringify(auditQuestion), /4\/5/);

const chatQuestion = selectChatQuestionContext(question);
assert.equal(chatQuestion.freeResponse.studentAnswer, "4/5");
assert.deepEqual(chatQuestion.tags, question.tags);

const fullReview = buildReviewRequest({
  question,
  studentReview,
  reviewStage: "initial",
  workflowState: "evaluate_review",
  priorAuditQuestions: ["What did rushing make you do?"],
});
assert.equal(fullReview.format.type, "json_schema");
assert.equal(fullReview.format.name, "full_review_response");
assert.equal(fullReview.format.strict, true);
assert.equal(fullReview.format.schema.properties.content.type.includes("null"), true);
assert.match(REVIEW_INSTRUCTIONS, /Do not require a separate step/i);
assert.match(REVIEW_INSTRUCTIONS, /5-14 simple words/i);
assert.match(REVIEW_INSTRUCTIONS, /Do not use topic tags as an anchor/i);
const fullInput = JSON.parse(fullReview.input);
assert.equal(fullInput.savedReview.whereWrong, studentReview.whereWrong);
assert.deepEqual(fullInput.priorAuditQuestions, ["What did rushing make you do?"]);
assert.doesNotMatch(fullReview.input, /4\/5/);

const ruleReview = buildReviewRequest({
  question,
  studentReview,
  workflowState: "awaiting_rule_edit",
  ruleOnly: true,
});
assert.equal(ruleReview.format.name, "rule_review_response");
assert.equal(Object.hasOwn(ruleReview.format.schema.properties, "diagnosis"), false);
assert.equal(JSON.parse(ruleReview.input).acceptedDiagnosis, studentReview.whereWrong);

const teachingResponse = buildResponseRequest({
  action: "teach_concept",
  question,
  studentReview: {
    ...studentReview,
    whereWrong: "I did not know the distributive property.",
  },
  assessment: {
    diagnosis: { teachingTarget: "the distributive property" },
  },
  teachingMethod: "Multiply the outside factor by every term.",
  method: { title: "Linear equations" },
});
const teachingInput = JSON.parse(teachingResponse.input);
assert.equal(teachingInput.teachingTarget, "the distributive property");
assert.equal(teachingInput.selectedTeachingMethod, "Linear equations");

console.log("prompt builder tests passed");
