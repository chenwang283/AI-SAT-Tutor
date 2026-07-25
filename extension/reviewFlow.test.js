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

console.log("review flow tests passed");
