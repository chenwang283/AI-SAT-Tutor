const assert = require("node:assert/strict");
const flow = require("./reviewFlow");

const config = {
  tagsBySection: {
    math: [{ value: "V" }, { value: "1" }],
    reading_writing: [{ value: "V" }, { value: "A" }],
  },
};

let draft = flow.createReviewDraft({
  dateLogged: "2026-07-24",
  timezone: "America/Chicago",
  source: "Set 2B",
  questionNumber: "14",
  section: "math",
  difficulty: "medium",
});
assert.equal(draft.step, "metadata");
assert.equal(flow.validateReviewStep(draft, config), null);

draft = flow.advanceReviewDraft(draft, config).draft;
assert.equal(draft.step, "whereWrong");
assert.match(flow.validateReviewStep(draft, config), /where you went wrong/i);
draft.diagnosis.whereWrong = "I stopped at an intermediate value.";

draft = flow.advanceReviewDraft(draft, config).draft;
assert.equal(draft.step, "myRule");
draft.diagnosis.myRule = "I will compare my result with the target.";

draft = flow.advanceReviewDraft(draft, config).draft;
assert.equal(draft.step, "clock");
draft.diagnosis.clockMode = "untimed";

draft = flow.advanceReviewDraft(draft, config).draft;
assert.equal(draft.step, "tag");
draft.diagnosis.tag = "A";
assert.match(flow.validateReviewStep(draft, config), /one tag/i);
draft.diagnosis.tag = "1";

draft = flow.advanceReviewDraft(draft, config).draft;
assert.equal(draft.step, "confirm");
assert.deepEqual(flow.REVIEW_STEPS, ["metadata", "whereWrong", "myRule", "clock", "tag", "confirm"]);
assert.deepEqual(flow.getAllowedTags(config, "math").map((tag) => tag.value), ["V", "1"]);
assert.equal(flow.previousReviewStep("tag"), "clock");

const visibleMessages = [
  { role: "assistant", content: "Old audit question" },
  { role: "student", content: "Old answer" },
  { role: "notice", content: "Mistake log updated." },
  { role: "assistant", content: "Response after the saved edit" },
  { role: "student", content: "New answer" },
];
assert.deepEqual(flow.getTutorConversation(visibleMessages, 2), [
  { role: "assistant", content: "Response after the saved edit" },
  { role: "student", content: "New answer" },
]);
assert.deepEqual(flow.getTutorConversation(visibleMessages, 99), []);
assert.deepEqual(
  flow.getTutorConversation(visibleMessages, -4),
  visibleMessages.filter((message) => message.role !== "notice"),
);

const tutorWorkflow = flow.createTutorWorkflowState();
assert.equal(tutorWorkflow.state, flow.TUTOR_STATES.EVALUATE);
assert.equal(tutorWorkflow.composerMode, "chat");
assert.equal(
  flow.requestedFieldForState(flow.TUTOR_STATES.DIAGNOSIS),
  "whereWrong",
);
assert.equal(flow.requestedFieldForState(flow.TUTOR_STATES.RULE), "myRule");
assert.equal(flow.composerModeForField("whereWrong"), "edit_where_wrong");
assert.equal(flow.fieldForComposerMode("edit_my_rule"), "myRule");
assert.deepEqual(
  flow.normalizeTutorWorkflowState({
    state: flow.TUTOR_STATES.RULE,
    composerMode: "edit_my_rule",
    shownAuditNotices: { whereWrong: true },
  }),
  {
    state: flow.TUTOR_STATES.RULE,
    composerMode: "edit_my_rule",
    shownAuditNotices: { whereWrong: true, myRule: false },
  },
);

console.log("review flow tests passed");
