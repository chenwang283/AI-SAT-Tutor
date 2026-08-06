const assert = require("node:assert/strict");
const {
  ACTIONS,
  STATES,
  decideReviewAction,
  diagnosisAccepted,
  formatTutorReply,
  nextStateForAction,
  ruleAccepted,
  unknownKnowledgeGap,
  validateReviewOutput,
  validateTutorContent,
  validateWorkflowTurn,
} = require("./tutorWorkflow");

const review = {
  whereWrong: "I wrote 5kx instead of 2kx.",
  myRule: "When I distribute, I will multiply each term separately.",
  tag: "1",
};

const concreteAssessment = {
  diagnosis: {
    status: "concrete_causal_root",
    causalRootEvidence: "I wrote 5kx instead of 2kx.",
    unknownKnowledgeEvidence: null,
    teachingTarget: null,
    auditFocus: "none",
  },
  rule: {
    status: "acceptable",
    triggerEvidence: "When I distribute",
    newBehaviorEvidence: "multiply each term separately",
    missingRequirement: "none",
  },
  proposedAction: ACTIONS.CONCLUDE,
  targetField: null,
  responseType: "conclusion",
  content: "Next time, multiply each part before you move on.",
};

assert.equal(diagnosisAccepted(concreteAssessment, review), true);
assert.equal(ruleAccepted(concreteAssessment, review), true);
assert.equal(
  decideReviewAction({ assessment: concreteAssessment, studentReview: review }).action,
  ACTIONS.CONCLUDE,
);
assert.equal(validateReviewOutput({ output: concreteAssessment, studentReview: review }), null);
assert.equal(nextStateForAction(ACTIONS.CONCLUDE, STATES.EVALUATE), STATES.COMPLETE);

const conceptAssessment = {
  ...concreteAssessment,
  diagnosis: {
    status: "unknown_knowledge",
    causalRootEvidence: null,
    unknownKnowledgeEvidence: "I did not know the distributive property.",
    teachingTarget: "the distributive property",
    auditFocus: "none",
  },
  proposedAction: ACTIONS.TEACH,
  responseType: "teaching_handoff",
  content: null,
};
const conceptReview = {
  ...review,
  whereWrong: "I did not know the distributive property.",
};
assert.equal(unknownKnowledgeGap(conceptAssessment, conceptReview), true);
assert.equal(
  decideReviewAction({
    assessment: conceptAssessment,
    studentReview: conceptReview,
  }).action,
  ACTIONS.TEACH,
);

const ruleOnly = {
  rule: {
    status: "insufficient",
    triggerEvidence: null,
    newBehaviorEvidence: null,
    missingRequirement: "new_behavior",
  },
  proposedAction: ACTIONS.RULE,
  targetField: "myRule",
  responseType: "audit_question",
  content: "What will you do at that step?",
};
assert.equal(
  validateReviewOutput({
    output: ruleOnly,
    studentReview: { ...review, myRule: "Be careful." },
    ruleOnly: true,
  }),
  null,
);
assert.match(
  validateReviewOutput({
    output: { ...ruleOnly, diagnosis: concreteAssessment.diagnosis },
    studentReview: review,
    ruleOnly: true,
  }),
  /cannot include a diagnosis/i,
);

const workflow = {
  state: STATES.DIAGNOSIS,
  turnType: "field_edit",
  editedField: "whereWrong",
  shownAuditNotices: { whereWrong: false, myRule: false },
};
const reviewChange = {
  changedFields: ["whereWrong"],
  before: { whereWrong: "I rushed." },
  after: { whereWrong: review.whereWrong },
};
assert.equal(
  validateWorkflowTurn(workflow, reviewChange, { studentReview: review }),
  null,
);
assert.match(
  validateWorkflowTurn(
    workflow,
    {
      ...reviewChange,
      after: { whereWrong: "Different saved value." },
    },
    { studentReview: review },
  ),
  /does not match/i,
);
assert.match(
  validateWorkflowTurn(
    {
      state: STATES.RULE,
      turnType: "chat",
      editedField: null,
      shownAuditNotices: {},
    },
    null,
    { conversation: [{ role: "assistant", content: "Question?" }], studentReview: review },
  ),
  /must end with a student message/i,
);

assert.equal(
  formatTutorReply({
    action: ACTIONS.DIAGNOSIS,
    content: "What did rushing make you do?",
    noticeField: "whereWrong",
  }),
  'Your "Where I went wrong" answer needs more detail. What did rushing make you do?',
);
assert.equal(validateTutorContent({ content: "This is long, but valid." }), null);
assert.equal(validateTutorContent({ content: "" }), "Content is empty.");

console.log("tutor workflow tests passed");
