const assert = require("node:assert/strict");
const {
  ASSESSMENT_INSTRUCTIONS,
  buildAssessmentRequest,
  buildResponseRequest,
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
  tags: [
    { label: "Algebra" },
    { label: "Linear equations in one variable" },
  ],
  selectedLetter: "A",
  correctLetter: "B",
  pageUrl: "https://example.com/private",
};

const studentReview = {
  section: "math",
  difficulty: "hard",
  clockMode: "untimed",
  whereWrong: "I wrote 5kx when I distributed instead of 2kx.",
  myRule: "Be careful.",
  tag: "1",
  tagDefinition: "Calculation error",
};

const auditQuestion = selectAuditQuestionContext(question);
assert.equal(auditQuestion.freeResponse, undefined);
assert.equal(auditQuestion.correctFreeResponse, "2");
assert.equal(auditQuestion.selectedLetter, undefined);
assert.equal(auditQuestion.pageUrl, undefined);
assert.doesNotMatch(JSON.stringify(auditQuestion), /4\/5/);

const chatQuestion = selectChatQuestionContext(question);
assert.equal(chatQuestion.freeResponse.studentAnswer, "4/5");

const fullAssessment = buildAssessmentRequest({
  question,
  studentReview,
  reviewStage: "initial",
  workflowState: "evaluate_review",
});
assert.match(ASSESSMENT_INSTRUCTIONS, /wrong-versus-correct comparison is complete/i);
assert.match(ASSESSMENT_INSTRUCTIONS, /Do not demand why the slip happened/i);
assert.equal(fullAssessment.format.type, "json_schema");
assert.equal(fullAssessment.format.strict, true);
const assessmentInput = JSON.parse(fullAssessment.input);
assert.equal(assessmentInput.task, "diagnosis_then_rule");
assert.equal(assessmentInput.savedReview.whereWrong, studentReview.whereWrong);
assert.doesNotMatch(fullAssessment.input, /4\/5/);

const ruleAssessment = buildAssessmentRequest({
  question,
  studentReview,
  workflowState: "awaiting_rule_edit",
  ruleOnly: true,
});
assert.deepEqual(ruleAssessment.format.schema.required, ["rule"]);
assert.equal(JSON.parse(ruleAssessment.input).task, "rule_only");

const diagnosisResponse = buildResponseRequest({
  action: "request_diagnosis_edit",
  question,
  studentReview,
  assessment: {
    diagnosis: { missingDetail: "wrong_action_or_result" },
  },
  conversation: [],
  priorAuditQuestions: ["Where did your work first change?"],
});
const diagnosisInput = JSON.parse(diagnosisResponse.input);
assert.equal(diagnosisInput.fieldText, studentReview.whereWrong);
assert.deepEqual(diagnosisInput.priorAuditQuestions, [
  "Where did your work first change?",
]);
assert.doesNotMatch(diagnosisResponse.input, /4\/5/);
assert.match(diagnosisResponse.instructions, /7 to 14 words/);

const teachingResponse = buildResponseRequest({
  action: "teach_concept",
  question,
  studentReview: {
    ...studentReview,
    whereWrong: "I did not know the distributive property.",
  },
  assessment: {
    diagnosis: { namedConcept: "the distributive property" },
  },
  conversation: [],
  priorAuditQuestions: [],
  teachingMethod: "Multiply the outside factor by every term.",
  method: { title: "Linear equations" },
});
const teachingInput = JSON.parse(teachingResponse.input);
assert.equal(teachingInput.selectedTeachingMethod, "Linear equations");
assert.match(teachingInput.selectedTeachingNotes, /every term/);
assert.match(teachingResponse.instructions, /follow-up question/i);
assert.match(teachingResponse.instructions, /Do not audit the rule/i);

const chatResponse = buildResponseRequest({
  action: "answer_question",
  question,
  studentReview,
  conversation: [{ role: "student", content: "Why does that work?" }],
  teachingMethod: "",
});
assert.equal(
  JSON.parse(chatResponse.input).question.freeResponse.studentAnswer,
  "4/5",
);

console.log("prompt builder tests passed");
