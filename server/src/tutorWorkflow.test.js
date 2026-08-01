const assert = require("node:assert/strict");
const {
  ACTIONS,
  STATES,
  decideReviewAction,
  diagnosisAccepted,
  formatTutorReply,
  nextStateForAction,
  normalizeWorkflow,
  requestedFieldForAction,
  ruleAccepted,
  shouldLoadMethodForChat,
  validateTutorContent,
  validateWorkflowTurn,
} = require("./tutorWorkflow");

const review = {
  whereWrong: "I wrote 5kx when I distributed instead of 2kx.",
  myRule: "Be careful.",
};
const diagnosisPass = {
  diagnosis: {
    status: "specific_root_cause",
    stepOrTrigger: "when I distributed",
    wrongActionOrResult: "wrote 5kx",
    correctContrast: "instead of 2kx",
    namedConcept: null,
    missingDetail: "none",
  },
  rule: {
    status: "insufficient",
    trigger: null,
    newBehavior: null,
    preventionLink: null,
    missingDetail: "trigger",
  },
};

assert.equal(diagnosisAccepted(diagnosisPass, review), true);
assert.deepEqual(decideReviewAction({ assessment: diagnosisPass, studentReview: review }), {
  action: ACTIONS.RULE,
  reasonCode: "trigger",
});
assert.equal(
  nextStateForAction(ACTIONS.RULE, STATES.DIAGNOSIS),
  STATES.RULE,
);
assert.equal(requestedFieldForAction(ACTIONS.RULE), "myRule");

const acceptedReview = {
  ...review,
  myRule:
    "When I distribute a fraction, I will multiply each term separately before moving on.",
};
const bothPass = {
  ...diagnosisPass,
  rule: {
    status: "acceptable",
    trigger: "When I distribute a fraction",
    newBehavior: "multiply each term separately",
    preventionLink: "before moving on",
    missingDetail: "none",
  },
};
assert.equal(ruleAccepted(bothPass, acceptedReview), true);
assert.equal(
  decideReviewAction({ assessment: bothPass, studentReview: acceptedReview }).action,
  ACTIONS.CONCLUDE,
);

const conceptReview = {
  whereWrong: "I did not know the distributive property.",
  myRule: "Be careful.",
};
const conceptAssessment = {
  diagnosis: {
    status: "named_concept_gap",
    stepOrTrigger: null,
    wrongActionOrResult: null,
    correctContrast: null,
    namedConcept: "the distributive property",
    missingDetail: "none",
  },
  rule: diagnosisPass.rule,
};
assert.equal(
  decideReviewAction({
    assessment: conceptAssessment,
    studentReview: conceptReview,
  }).action,
  ACTIONS.TEACH,
);
assert.equal(nextStateForAction(ACTIONS.TEACH, STATES.EVALUATE), STATES.COMPLETE);

const workflow = normalizeWorkflow({
  state: STATES.DIAGNOSIS,
  turnType: "field_edit",
  editedField: "whereWrong",
});
assert.equal(
  validateWorkflowTurn(workflow, {
    changedFields: ["whereWrong"],
    before: { whereWrong: "I was careless." },
    after: { whereWrong: review.whereWrong },
  }),
  null,
);
assert.match(
  validateWorkflowTurn(
    { ...workflow, editedField: "myRule" },
    { changedFields: ["myRule"] },
  ),
  /does not match/i,
);

assert.equal(
  validateTutorContent({
    action: ACTIONS.DIAGNOSIS,
    content: "What detail is still missing about how you got 4/5?",
    conversation: [],
    studentReview: review,
    question: { freeResponse: { studentAnswer: "4/5" } },
  }),
  "The audit question introduced the student's final answer instead of auditing the saved field.",
);
assert.match(
  validateTutorContent({
    action: ACTIONS.DIAGNOSIS,
    content: "What exact step in your work first went wrong?",
    conversation: [
      {
        role: "assistant",
        content: "What exact step in your work first went wrong?",
      },
    ],
    studentReview: review,
    question: {},
  }),
  /repeats/i,
);
assert.equal(
  validateTutorContent({
    action: ACTIONS.RULE,
    content: "What will trigger you to use this rule?",
    conversation: [],
    studentReview: acceptedReview,
    question: {},
  }),
  null,
);
assert.equal(
  formatTutorReply({
    action: ACTIONS.DIAGNOSIS,
    content: "What part of the step did you do wrong?",
    noticeField: "whereWrong",
  }),
  'Your "Where I went wrong" answer needs more detail. What part of the step did you do wrong?',
);
assert.equal(shouldLoadMethodForChat("Can you explain this method?"), true);
assert.equal(shouldLoadMethodForChat("Can I ask something else?"), false);

console.log("tutor workflow tests passed");
