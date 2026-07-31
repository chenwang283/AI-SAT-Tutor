const assert = require("node:assert/strict");
const {
  buildTutorPrompt,
  formatStudentReview,
  selectQuestionContext,
} = require("./promptBuilder");

const options = {
  question: {
    questionType: "multiple_choice",
    stem: "If y = 2x and x = 4, what is y?",
    options: [{ letter: "A", text: "6" }, { letter: "B", text: "8" }],
    selectedLetter: "A",
    correctLetter: "B",
    explanation: "Substitute 4 for x in y = 2x, so y = 8.",
    tags: [{ label: "Linear equations", level: "skill" }],
    figures: [{ src: "https://example.com/figure.png", alt: "A line graph", capturedImage: true }],
    hasFigure: true,
    pageUrl: "https://example.com/private-page",
    pageTitle: "StudySpaces",
    phase: "REVIEWED",
    source: "Set 2B",
    questionNumber: "14",
    submitButtonLabel: "Check",
  },
  teachingMethod: "Identify the requested value before calculating.",
  method: { title: "Target-first" },
  studentReview: {
    section: "math",
    difficulty: "medium",
    source: "Set 2B",
    questionNumber: "14",
    clockMode: "untimed",
    whereWrong: "I used an intermediate value as my answer.",
    myRule: "I will compare my value with the requested target.",
    tag: "1",
    tagDefinition: "Did not understand the final target.",
    originalOutcome: "incorrect",
  },
  reviewStage: null,
};

(async () => {
  const questionContext = selectQuestionContext(options.question);
  assert.equal(questionContext.stem, options.question.stem);
  assert.equal(questionContext.figures[0].alt, "A line graph");
  assert.equal("src" in questionContext.figures[0], false);
  assert.equal("pageUrl" in questionContext, false);
  assert.equal("pageTitle" in questionContext, false);
  assert.equal("phase" in questionContext, false);
  assert.equal("source" in questionContext, false);
  assert.equal("questionNumber" in questionContext, false);
  assert.equal("submitButtonLabel" in questionContext, false);

  const reviewContext = formatStudentReview(options.studentReview, null);
  assert.match(reviewContext, /"whereWrong"/);
  assert.match(reviewContext, /"preventionRule"/);
  assert.doesNotMatch(reviewContext, /Set 2B/);
  assert.doesNotMatch(reviewContext, /questionNumber/);
  assert.doesNotMatch(reviewContext, /originalOutcome/);

  const first = await buildTutorPrompt({ ...options, conversation: [] });
  assert.match(first, /FIRST TURN/);
  assert.match(first, /DECISION FLOW/);
  assert.match(first, /AUDIT RESPONSE CONTRACT/);
  assert.match(first, /wrong-versus-correct comparison passes/);
  assert.match(first, /exactly one 7-to-14-word question/);
  assert.match(first, /Use at most 25 words/);
  assert.match(first, /No messages in the current review context/);
  assert.doesNotMatch(first, /MOST RECENT EDIT/);
  assert.doesNotMatch(first, /k\/5\(10x\)|5kx|distribut/);
  assert.equal((first.match(/Update "Where I went wrong"/g) || []).length, 1);
  assert.equal((first.match(/Next time/g) || []).length, 2);

  const followup = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I was careless.",
      myRule: "I will be careful.",
    },
    conversation: [
      { role: "assistant", content: "Which part of your work first went wrong?" },
      { role: "student", content: "I copied the wrong value into the equation." },
    ],
  });
  assert.match(followup, /FOLLOW-UP TURN/);
  assert.match(followup, /Student: I copied the wrong value into the equation/);
  assert.match(followup, /check all student messages in the active conversation together/i);
  assert.match(followup, /Update "Where I went wrong" in Edit answers/);

  const editTurn = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I copied the wrong value into the equation.",
    },
    conversation: [],
    reviewChange: {
      changedFields: ["whereWrong"],
      before: { whereWrong: "I was careless." },
      after: { whereWrong: "I copied the wrong value into the equation." },
    },
  });
  assert.match(editTurn, /EDIT TURN/);
  assert.match(editTurn, /SAVED REVIEW CHANGE/);
  assert.match(editTurn, /active conversation starts after the save/i);
  assert.match(editTurn, /I copied the wrong value into the equation/);

  const conceptGap = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I did not know how substitution works.",
    },
    conversation: [],
  });
  assert.match(conceptGap, /teach only that gap from the method notes/i);
  assert.match(conceptGap, /at most 4 short sentences and 70 words/i);

  const genericRule = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      myRule: "I will be more careful.",
    },
    conversation: [],
  });
  assert.match(genericRule, /After the saved diagnosis passes, check the saved rule/);
  assert.match(genericRule, /Your rule needs more detail/);
  assert.match(genericRule, /how the stated action prevents the mistake/);

  const missingExplanation = await buildTutorPrompt({
    ...options,
    question: { ...options.question, explanation: null },
    conversation: [],
  });
  assert.match(missingExplanation, /No StudySpaces answer explanation was captured/);

  assert.ok(first.length < 8500, "Expected a compact prompt, received " + first.length + " characters");
  console.log("prompt builder tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
