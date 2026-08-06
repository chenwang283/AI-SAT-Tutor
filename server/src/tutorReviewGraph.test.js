const assert = require("node:assert/strict");
const { ACTIONS, STATES } = require("./tutorWorkflow");
const { runTutorReviewGraph } = require("./tutorReviewGraph");

const baseReview = {
  whereWrong: "I wrote 5kx instead of 2kx.",
  myRule: "When I distribute, I will multiply each term separately.",
  tag: "1",
};

const question = {
  questionType: "free_response",
  stem: "Solve for k.",
  freeResponse: { correctAnswer: "2", studentAnswer: "4/5" },
  explanation: "Distribute before comparing both sides.",
  tags: [{ label: "Algebra" }],
};

function workflow(state, turnType, editedField = null, shownAuditNotices = {}) {
  return {
    state,
    turnType,
    editedField,
    shownAuditNotices: {
      whereWrong: false,
      myRule: false,
      ...shownAuditNotices,
    },
  };
}

function request({
  studentReview = baseReview,
  workflowState = workflow(STATES.EVALUATE, "start"),
  reviewChange = null,
  conversation = [],
} = {}) {
  return {
    question,
    images: [],
    studentReview,
    reviewStage: "initial",
    workflow: workflowState,
    reviewChange,
    conversation,
  };
}

function concreteDiagnosis() {
  return {
    status: "concrete_causal_root",
    causalRootEvidence: "I wrote 5kx instead of 2kx.",
    unknownKnowledgeEvidence: null,
    teachingTarget: null,
    auditFocus: "none",
  };
}

function acceptedRule() {
  return {
    status: "acceptable",
    triggerEvidence: "When I distribute",
    newBehaviorEvidence: "multiply each term separately",
    missingRequirement: "none",
  };
}

function mockServices(outputs) {
  const calls = [];
  return {
    calls,
    getStructuredResponse: async (input) => {
      calls.push(input);
      return outputs.shift();
    },
    lookupTeachingMethod: async () => ({
      key: "linear-equations-in-one-variable",
      title: "Linear Equations",
      content: "Distribute the outside factor to every term.",
    }),
  };
}

async function run() {
  const ruleServices = mockServices([
    {
      diagnosis: concreteDiagnosis(),
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
    },
  ]);
  const ruleResult = await runTutorReviewGraph(request(), ruleServices);
  assert.equal(ruleServices.calls.length, 1);
  assert.equal(ruleResult.response.action, ACTIONS.RULE);
  assert.equal(ruleResult.response.reasonCode, "new_behavior");
  assert.equal(ruleResult.response.requestedEditField, "myRule");
  assert.equal(ruleResult.response.nextWorkflowState, STATES.RULE);
  assert.match(ruleResult.response.reply, /^Your rule needs more detail\./);

  const repeatNoticeServices = mockServices([
    {
      diagnosis: concreteDiagnosis(),
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
    },
  ]);
  const repeatNotice = await runTutorReviewGraph(
    request({
      workflowState: workflow(STATES.EVALUATE, "start", null, {
        myRule: true,
      }),
    }),
    repeatNoticeServices,
  );
  assert.equal(
    repeatNotice.response.reply,
    "What will you do at that step?",
    "A later audit must not repeat the field warning.",
  );

  const conclusionServices = mockServices([
    {
      diagnosis: concreteDiagnosis(),
      rule: acceptedRule(),
      proposedAction: ACTIONS.CONCLUDE,
      targetField: null,
      responseType: "conclusion",
      content: "Next time, write each part before you combine it.",
    },
  ]);
  const conclusion = await runTutorReviewGraph(request(), conclusionServices);
  assert.equal(conclusionServices.calls.length, 1);
  assert.equal(conclusion.response.action, ACTIONS.CONCLUDE);
  assert.equal(conclusion.response.nextWorkflowState, STATES.COMPLETE);

  const conceptReview = {
    ...baseReview,
    whereWrong: "I did not know the distributive property.",
  };
  const conceptServices = mockServices([
    {
      diagnosis: {
        status: "unknown_knowledge",
        causalRootEvidence: null,
        unknownKnowledgeEvidence: "I did not know the distributive property.",
        teachingTarget: "the distributive property",
        auditFocus: "none",
      },
      rule: {
        status: "insufficient",
        triggerEvidence: null,
        newBehaviorEvidence: null,
        missingRequirement: "new_behavior",
      },
      proposedAction: ACTIONS.TEACH,
      targetField: null,
      responseType: "teaching_handoff",
      content: null,
    },
    { content: "The distributive property multiplies every term. Want to try one?" },
  ]);
  const concept = await runTutorReviewGraph(
    request({ studentReview: conceptReview }),
    conceptServices,
  );
  assert.equal(conceptServices.calls.length, 2);
  assert.equal(concept.response.action, ACTIONS.TEACH);
  assert.equal(concept.response.nextWorkflowState, STATES.COMPLETE);
  assert.equal(concept.response.method.title, "Linear Equations");

  const changedRule = "When I distribute, I will multiply each term separately.";
  const ruleOnlyServices = mockServices([
    {
      rule: acceptedRule(),
      proposedAction: ACTIONS.CONCLUDE,
      targetField: null,
      responseType: "conclusion",
      content: "Next time, write each part before you combine it.",
    },
  ]);
  const ruleOnly = await runTutorReviewGraph(
    request({
      workflowState: workflow(STATES.RULE, "field_edit", "myRule"),
      reviewChange: {
        changedFields: ["myRule"],
        before: { myRule: "Be careful." },
        after: { myRule: changedRule },
      },
    }),
    ruleOnlyServices,
  );
  assert.equal(ruleOnlyServices.calls.length, 1);
  assert.equal(ruleOnlyServices.calls[0].format.name, "rule_review_response");
  assert.equal(ruleOnly.response.action, ACTIONS.CONCLUDE);

  const manualEditServices = mockServices([
    {
      diagnosis: concreteDiagnosis(),
      rule: acceptedRule(),
      proposedAction: ACTIONS.CONCLUDE,
      targetField: null,
      responseType: "conclusion",
      content: "Next time, write each part before you combine it.",
    },
  ]);
  const manualEdit = await runTutorReviewGraph(
    request({
      workflowState: workflow(STATES.COMPLETE, "manual_edit"),
      reviewChange: {
        changedFields: ["whereWrong", "tag"],
        before: { whereWrong: "I rushed.", tag: "2" },
        after: { whereWrong: baseReview.whereWrong, tag: "1" },
      },
    }),
    manualEditServices,
  );
  assert.equal(manualEditServices.calls[0].format.name, "full_review_response");
  assert.match(manualEdit.response.reply, /^I noticed your saved answers changed\./);

  const tagServices = mockServices([]);
  const tagOnly = await runTutorReviewGraph(
    request({
      workflowState: workflow(STATES.DIAGNOSIS, "manual_edit"),
      reviewChange: {
        changedFields: ["tag"],
        before: { tag: "1" },
        after: { tag: "2" },
      },
      studentReview: { ...baseReview, tag: "2" },
    }),
    tagServices,
  );
  assert.equal(tagServices.calls.length, 0);
  assert.equal(tagOnly.response.action, ACTIONS.ACKNOWLEDGE);
  assert.equal(tagOnly.response.nextWorkflowState, STATES.DIAGNOSIS);

  const retryServices = mockServices([
    {
      diagnosis: concreteDiagnosis(),
      rule: acceptedRule(),
      proposedAction: ACTIONS.RULE,
      targetField: "myRule",
      responseType: "audit_question",
      content: "What will you do next time?",
    },
    {
      diagnosis: concreteDiagnosis(),
      rule: acceptedRule(),
      proposedAction: ACTIONS.CONCLUDE,
      targetField: null,
      responseType: "conclusion",
      content: "Next time, write each part before you combine it.",
    },
  ]);
  const retry = await runTutorReviewGraph(request(), retryServices);
  assert.equal(retryServices.calls.length, 2);
  assert.equal(retry.response.action, ACTIONS.CONCLUDE);

  const chatServices = mockServices([{ content: "Yes. The same step works here." }]);
  const chat = await runTutorReviewGraph(
    request({
      workflowState: workflow(STATES.DIAGNOSIS, "chat"),
      conversation: [{ role: "student", content: "Can you explain why?" }],
    }),
    chatServices,
  );
  assert.equal(chat.response.action, ACTIONS.ANSWER);
  assert.equal(chat.response.nextWorkflowState, STATES.DIAGNOSIS);

  await assert.rejects(
    runTutorReviewGraph(
      request({
        workflowState: workflow(STATES.RULE, "field_edit", "myRule"),
        reviewChange: {
          changedFields: ["myRule"],
          before: { myRule: "Be careful." },
          after: { myRule: "Wrong database value." },
        },
      }),
      mockServices([]),
    ),
    /does not match/i,
  );

  await assert.rejects(
    runTutorReviewGraph(
      request({
        workflowState: workflow(STATES.EVALUATE, "chat"),
        conversation: [{ role: "student", content: "Can you explain why?" }],
      }),
      mockServices([]),
    ),
    /must be evaluated/i,
  );

  console.log("tutor review graph tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
