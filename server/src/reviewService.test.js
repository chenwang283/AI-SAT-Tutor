const assert = require("node:assert/strict");
const {
  addCalendarDays,
  deriveQuestionResult,
  sanitizeQuestionSnapshot,
  normalizeReviewInput,
  normalizeReviewUpdate,
  buildDueSummary,
} = require("./reviewService");

const question = {
  questionId: "question-14",
  questionType: "multiple_choice",
  stem: "What is the value of x?",
  selectedLetter: "B",
  correctLetter: "C",
  figures: [{ src: "data:image/png;base64,abc", dataUrl: "data:image/png;base64,abc", alt: "Graph" }],
  options: [
    { letter: "B", value: "2", selected: true, reviewMarker: "incorrect" },
    { letter: "C", value: "3", selected: false, reviewMarker: "correct" },
  ],
  tags: [],
};

assert.equal(addCalendarDays("2026-01-30", 3), "2026-02-02");
assert.equal(addCalendarDays("2024-02-27", 3), "2024-03-01");
assert.equal(addCalendarDays("2026-12-25", 14), "2027-01-08");
assert.equal(deriveQuestionResult(question), "wrong");
assert.equal(
  deriveQuestionResult({
    questionType: "free_response",
    freeResponse: { isCorrect: true },
  }),
  "correct"
);

const snapshot = sanitizeQuestionSnapshot(question);
assert.equal(snapshot.figures[0].src, null);
assert.equal("dataUrl" in snapshot.figures[0], false);
assert.equal(snapshot.figures[0].capturedImage, true);

const normalized = normalizeReviewInput(
  {
    question,
    metadata: {
      dateLogged: "2026-07-24",
      timezone: "America/Chicago",
      source: "Set 2B",
      questionNumber: "14",
      section: "Math",
      difficulty: "M",
      pageUrl: "https://studyspaces.com/review/14",
    },
    diagnosis: {
      whereWrong: "I answered with an intermediate value.",
      myRule: "I will compare the value with the target.",
      clockMode: "untimed",
      tag: "1",
    },
  },
  "00000000-0000-0000-0000-000000000001"
);
assert.equal(normalized.section, "math");
assert.equal(normalized.difficulty, "medium");
assert.equal(normalized.original_outcome, "incorrect");
assert.equal(normalized.redo_3_due_on, "2026-07-27");
assert.equal(normalized.redo_14_due_on, "2026-08-07");

const normalizedUpdate = normalizeReviewUpdate(
  {
    diagnosis: {
      whereWrong: "I missed the required answer form.",
      myRule: "I will label the requested form before solving.",
      tag: "1",
    },
  },
  { section: "math" }
);
assert.deepEqual(normalizedUpdate, {
  where_wrong: "I missed the required answer form.",
  prevention_rule: "I will label the requested form before solving.",
  mistake_tag: "1",
});
assert.throws(
  () =>
    normalizeReviewUpdate(
      { diagnosis: { whereWrong: "Mistake", myRule: "Rule", tag: "A" } },
      { section: "math" }
    ),
  /does not match/
);

assert.throws(
  () =>
    normalizeReviewInput(
      {
        question,
        metadata: {
          dateLogged: "2026-07-24",
          timezone: "America/Chicago",
          source: "Set 2B",
          questionNumber: "14",
          section: "Math",
          difficulty: "M",
        },
        diagnosis: {
          whereWrong: "Mistake",
          myRule: "Rule",
          clockMode: "timed",
          tag: "A",
        },
      },
      "student"
    ),
  /does not match/
);

const due = buildDueSummary(
  [
    {
      id: "a",
      source: "Set 2B",
      question_number: "14",
      section: "math",
      page_url: "https://studyspaces.com/a",
      question_key: "studyspaces:a",
      question_snapshot: { stem: "A" },
      redo_3_due_on: "2026-07-20",
      redo_3_result: null,
      redo_14_due_on: "2026-07-31",
      redo_14_result: null,
    },
    {
      id: "b",
      source: "Set 3A",
      question_number: "2",
      section: "reading_writing",
      page_url: "https://studyspaces.com/b",
      question_key: "studyspaces:b",
      question_snapshot: { stem: "B" },
      redo_3_due_on: "2026-07-10",
      redo_3_result: "correct",
      redo_14_due_on: "2026-07-24",
      redo_14_result: null,
    },
  ],
  "2026-07-24"
);
assert.equal(due.count, 2);
assert.equal(due.overdueCount, 1);
assert.equal(due.items[0].stage, 3);
assert.equal(due.items[1].stage, 14);

console.log("review service tests passed");
