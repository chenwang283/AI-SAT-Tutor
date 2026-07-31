const assert = require("node:assert/strict");
const { buildTutorPrompt } = require("./promptBuilder");

(async () => {
  const options = {
    question: {
      questionType: "multiple_choice",
      stem: "If y = 2x and x = 4, what is y?",
      selectedLetter: "B",
      correctLetter: "C",
      explanation: "Substitute 4 for x in y = 2x, so y = 8.",
    },
    teachingMethod: "Ask the student to identify the target before calculating.",
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

  const first = await buildTutorPrompt({ ...options, conversation: [] });
  assert.match(first, /completed self-review/i);
  assert.match(first, /I used an intermediate value/);
  assert.match(first, /THE STUDYSPACES ANSWER EXPLANATION \(captured\):/);
  assert.match(first, /Substitute 4 for x in y = 2x/);
  assert.match(first, /AUDIT-OR-REINFORCE WORKFLOW/);
  assert.match(first, /A usable diagnosis names the concrete event or missing knowledge/);
  assert.match(first, /feeling or label such as 'I rushed,' 'I was careless,' or 'I got confused'/);
  assert.match(first, /exact phrase, condition, representation, or answer-choice feature/);
  assert.match(first, /do not ask an audit question.*Briefly teach only that missing concept/is);
  assert.match(first, /A usable rule names one observable action/);
  assert.match(first, /fixes a downstream consequence/);
  assert.match(first, /tell them to use Edit answers to update the saved mistake log/);
  assert.match(first, /exactly one sentence beginning 'Next time,'/);
  assert.match(first, /Use at most 35 words/);
  assert.doesNotMatch(first, /Start with 'The skill to work on is'/);
  assert.doesNotMatch(first, /Classify the mistake using this list/);
  assert.doesNotMatch(first, /The student's explanation is very limited/);

  const followup = await buildTutorPrompt({
    ...options,
    conversation: [
      { role: "assistant", content: "What should the final answer represent?" },
      { role: "student", content: "It should represent x." },
    ],
  });
  assert.match(followup, /If an audit is underway, continue only that workflow/);
  assert.match(followup, /Student: It should represent x/);
  assert.match(followup, /ask one deeper neutral question and stop/);
  assert.match(followup, /direct them to update it with Edit answers/);

  const vagueDiagnosis = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I got confused by the wording.",
      myRule: "I will read more carefully.",
    },
    conversation: [],
  });
  assert.match(vagueDiagnosis, /I got confused by the wording/);
  assert.match(vagueDiagnosis, /ask exactly one short, neutral question/);
  assert.match(vagueDiagnosis, /Do not tell them what is wrong with their input/);

  const conceptGap = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I did not know how substitution works.",
      myRule: "I will learn when to substitute a given value.",
      tag: "2",
    },
    conversation: [],
  });
  assert.match(conceptGap, /I did not know how substitution works/);
  assert.match(conceptGap, /write at most 4 short sentences and 70 words total/);

  const afterEdit = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      myRule: "I will write the requested answer form before solving.",
    },
    conversation: [{ role: "assistant", content: "Previous tutor response." }],
    reviewChange: {
      changedFields: ["myRule"],
      before: { myRule: options.studentReview.myRule },
      after: { myRule: "I will write the requested answer form before solving." },
    },
  });
  assert.match(afterEdit, /MOST RECENT EDIT TO THE SELF-REVIEW/);
  assert.match(afterEdit, /response was triggered because the student edited/);
  assert.match(afterEdit, /Begin with one brief sentence recognizing the specific field or idea that changed/);
  assert.match(afterEdit, /same audit-or-reinforce workflow/);
  assert.match(afterEdit, /If it still needs work.*exactly one neutral audit question/);

  const missingExplanation = await buildTutorPrompt({
    ...options,
    question: { ...options.question, explanation: null },
    conversation: [],
  });
  assert.match(missingExplanation, /No StudySpaces answer explanation was captured/);

  console.log("prompt builder tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
