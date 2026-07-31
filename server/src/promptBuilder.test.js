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
  assert.match(first, /exactly one sentence beginning 'Next time,'/);
  assert.match(first, /Use at most 25 words/);
  assert.match(first, /must not include exact variables, numbers, expressions, equation sides/);
  assert.match(first, /MANDATORY FOLLOW-UP DIAGNOSIS STOP CHECK/);
  assert.match(first, /A wrong-versus-correct comparison always passes/);
  assert.match(first, /An earlier qualifying message stays sufficient/);
  assert.match(first, /Only use the diagnosis ladder when no student message meets these stop conditions/);
  assert.match(first, /AUDIT QUESTION CONTRACT/);
  assert.match(first, /first audit response for a field has exactly two sentences/);
  assert.match(first, /question must contain 7 to 14 words/);
  assert.match(first, /Use exactly this diagnosis notice: 'Your "Where I went wrong" answer needs more detail.'/);
  assert.match(first, /Use exactly this rule notice: 'Your rule needs more detail.'/);
  assert.match(first, /Use exactly one context anchor/);
  assert.match(first, /Show each field notice at most once during one continuous audit/);
  assert.match(first, /Never repeat a prior tutor question verbatim/);
  assert.match(first, /Do not use 'and' or 'or' in the question/);
  assert.match(first, /at or below a sixth-grade reading level/);
  assert.match(first, /DIAGNOSIS LADDER/);
  assert.match(first, /RULE LADDER/);
  assert.match(first, /Never skip a ladder level/);
  assert.match(first, /Never write, rewrite, suggest, model, quote, or paraphrase replacement text/);
  assert.match(first, /Next time, when you distribute a fraction, multiply it by each term before moving on/);
  assert.doesNotMatch(first, /Use at most 35 words/);
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
  assert.match(followup, /Judge the diagnosis from all student messages in the current audit together/);
  assert.match(followup, /Student: It should represent x/);
  assert.match(followup, /move down only one level per response/);
  assert.match(followup, /direct them to update that field with Edit answers and stop/);

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
  assert.match(vagueDiagnosis, /tell the student that the saved diagnosis needs more detail/);
  assert.match(vagueDiagnosis, /Which step in solving the equation do you think went wrong/);

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
  assert.match(afterEdit, /If a field still needs work.*required notice and exactly one audit question/);

  const vagueDistributionFollowup = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I will be more careful.",
      myRule: "I will be more careful.",
    },
    conversation: [
      { role: "assistant", content: "Where do you think your work went wrong?" },
      { role: "student", content: "My distribution math was wrong." },
    ],
  });
  assert.match(vagueDistributionFollowup, /Student: My distribution math was wrong/);
  assert.match(vagueDistributionFollowup, /Level 1, a step is named but the mistake is unclear/);
  assert.match(vagueDistributionFollowup, /What did you multiply wrong when you distributed/);

  const concreteDistributionFollowup = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I will be more careful.",
      myRule: "I will be more careful.",
    },
    conversation: [
      {
        role: "assistant",
        content:
          'Your "Where I went wrong" answer needs more detail. What exact step did you do when you used the distributive step on the left side?',
      },
      {
        role: "student",
        content: "Oh I messed up the multiplication because I wrote k/5(10x) as 5kx and not 2kx.",
      },
      {
        role: "assistant",
        content: "What did you multiply the fraction by before you got the wrong product?",
      },
      { role: "student", content: "I just multiplied it by 10x." },
      {
        role: "assistant",
        content: "What did you do right after multiplying by 10x when you got the wrong product?",
      },
      { role: "student", content: "I moved on." },
    ],
  });
  assert.match(
    concreteDistributionFollowup,
    /Student: Oh I messed up the multiplication because I wrote k\/5\(10x\) as 5kx and not 2kx/,
  );
  assert.match(concreteDistributionFollowup, /Student: I moved on/);
  assert.match(
    concreteDistributionFollowup,
    /Acceptance example: 'I messed up the multiplication because I wrote k\/5\(10x\) as 5kx and not 2kx\.' This is a complete diagnosis, not Level 1/,
  );
  assert.match(
    concreteDistributionFollowup,
    /You found the mistake\. Update "Where I went wrong" in Edit answers\./,
  );
  assert.match(
    concreteDistributionFollowup,
    /if any earlier student message meets the diagnosis stop rule, the fixed Edit answers direction takes priority/i,
  );

  const genericRule = await buildTutorPrompt({
    ...options,
    studentReview: {
      ...options.studentReview,
      whereWrong: "I multiplied the fraction and first term incorrectly.",
      myRule: "I will be more careful.",
    },
    conversation: [],
  });
  assert.match(genericRule, /tell the student that the saved rule needs more detail/);
  assert.match(genericRule, /What will you do while distributing to stop that mistake/);

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
