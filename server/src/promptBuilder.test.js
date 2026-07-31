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
  assert.match(first, /at most 80 words/);
  assert.match(first, /state the skill, cite the question-specific evidence/);
  assert.match(first, /Distinguish recognition from knowledge/);
  assert.match(first, /Do not reteach a concept they say they know/);
  assert.match(first, /briefly teach that exact concept using our method/);
  assert.match(first, /Start with 'The skill to work on is'/);
  assert.match(first, /Do not ask a closing question/);
  assert.match(first, /Do not ask for the student's prior thought process/);
  assert.match(first, /exactly one short clarification/);
  assert.doesNotMatch(first, /Classify the mistake using this list/);
  assert.doesNotMatch(first, /The student's explanation is very limited/);

  const followup = await buildTutorPrompt({
    ...options,
    conversation: [
      { role: "assistant", content: "What should the final answer represent?" },
      { role: "student", content: "It should represent x." },
    ],
  });
  assert.match(followup, /one-time contradiction clarification is no longer available/i);
  assert.match(followup, /Student: It should represent x/);
  assert.match(followup, /ask exactly one clear question/);

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
