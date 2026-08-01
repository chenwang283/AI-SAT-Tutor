const TUTOR_BASE_INSTRUCTIONS = [
  "You are an SAT tutor helping one student review a missed question.",
  "Use short, common words at or below a sixth-grade reading level.",
  "Do not write or suggest a diagnosis or prevention rule for the student.",
  "Do not reveal the full solution unless the current task is concept teaching or the student directly asks for it.",
  "Follow the supplied output schema exactly. Return no text outside it.",
].join("\n");

const ASSESSMENT_INSTRUCTIONS = [
  TUTOR_BASE_INSTRUCTIONS,
  "Assess only the saved fields in the JSON input. Return evidence, not a tutor message.",
  "Copy every evidence value exactly from its saved field. Use null when the words are not present.",
  "A diagnosis is specific when it names the step, detail, or trigger and the exact wrong action, belief, interpretation, or result.",
  "A clear wrong-versus-correct comparison is complete. Do not demand why the slip happened or how it later produced the final answer.",
  "A named concept gap passes only when the student clearly says a specific concept or method was not known.",
  "A feeling or label alone is insufficient. A wording complaint needs the exact wording feature and what it caused the student to do.",
  "A rule is acceptable when it gives a specific trigger and a new action at or before the mistake that can prevent it on similar questions.",
  "If the task is rule_only, do not reassess the diagnosis.",
].join("\n");

const NULLABLE_STRING = { type: ["string", "null"] };

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["specific_root_cause", "named_concept_gap", "insufficient"],
    },
    stepOrTrigger: NULLABLE_STRING,
    wrongActionOrResult: NULLABLE_STRING,
    correctContrast: NULLABLE_STRING,
    namedConcept: NULLABLE_STRING,
    missingDetail: {
      type: "string",
      enum: [
        "none",
        "step_or_trigger",
        "wrong_action_or_result",
        "causal_root",
        "wording_effect",
        "named_concept",
      ],
    },
  },
  required: [
    "status",
    "stepOrTrigger",
    "wrongActionOrResult",
    "correctContrast",
    "namedConcept",
    "missingDetail",
  ],
  additionalProperties: false,
};

const RULE_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["acceptable", "insufficient", "not_evaluated"],
    },
    trigger: NULLABLE_STRING,
    newBehavior: NULLABLE_STRING,
    preventionLink: NULLABLE_STRING,
    missingDetail: {
      type: "string",
      enum: ["none", "trigger", "new_behavior", "root_prevention"],
    },
  },
  required: [
    "status",
    "trigger",
    "newBehavior",
    "preventionLink",
    "missingDetail",
  ],
  additionalProperties: false,
};

function compactValue(value) {
  if (Array.isArray(value)) {
    const values = value.map(compactValue).filter((item) => item !== undefined);
    return values.length ? values : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactValue(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text || undefined;
  }
  return value == null ? undefined : value;
}

function tagLabels(question) {
  return Array.isArray(question?.tags)
    ? question.tags
        .map((tag) => (typeof tag === "string" ? tag : tag?.label))
        .filter((tag) => typeof tag === "string" && tag.trim())
    : [];
}

function figureDetails(question) {
  return Array.isArray(question?.figures)
    ? question.figures.map((figure) => ({
        alt: figure?.alt,
        width: figure?.width,
        height: figure?.height,
        capturedImage: figure?.capturedImage,
      }))
    : [];
}

function selectAuditQuestionContext(question) {
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => ({
        letter: option?.letter,
        value: option?.value,
        text: option?.text,
      }))
    : undefined;
  return (
    compactValue({
      questionType: question?.questionType,
      stem: question?.stem,
      options,
      correctLetter: question?.correctLetter,
      correctFreeResponse: question?.freeResponse?.correctAnswer,
      tags: tagLabels(question),
      hasFigure: question?.hasFigure,
      figures: figureDetails(question),
    }) || {}
  );
}

function selectChatQuestionContext(question) {
  return (
    compactValue({
      ...selectAuditQuestionContext(question),
      selectedLetter: question?.selectedLetter,
      freeResponse: question?.freeResponse,
    }) || {}
  );
}

function selectStudentReview(review, reviewStage) {
  return (
    compactValue({
      reviewStage: reviewStage || "initial",
      section: review?.section,
      difficulty: review?.difficulty,
      clockMode: review?.clockMode,
      whereWrong: review?.whereWrong,
      preventionRule: review?.myRule,
      mistakeTag: review?.tag,
      mistakeTagDefinition: review?.tagDefinition,
    }) || {}
  );
}

function assessmentFormat(ruleOnly = false) {
  const properties = ruleOnly
    ? { rule: RULE_SCHEMA }
    : { diagnosis: DIAGNOSIS_SCHEMA, rule: RULE_SCHEMA };
  return {
    type: "json_schema",
    name: ruleOnly ? "rule_assessment" : "review_assessment",
    strict: true,
    schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

function responseFormat() {
  return {
    type: "json_schema",
    name: "tutor_message",
    strict: true,
    schema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
      additionalProperties: false,
    },
  };
}

function buildAssessmentRequest({
  question,
  studentReview,
  reviewStage,
  workflowState,
  ruleOnly = false,
  validationError,
}) {
  const input = compactValue({
    task: ruleOnly ? "rule_only" : "diagnosis_then_rule",
    workflowState,
    question: selectAuditQuestionContext(question),
    officialAnswerExplanation:
      typeof question?.explanation === "string" && question.explanation.trim()
        ? question.explanation.trim()
        : "No StudySpaces answer explanation was captured.",
    savedReview: selectStudentReview(studentReview, reviewStage),
    correction: validationError,
  });
  return {
    instructions: ASSESSMENT_INSTRUCTIONS,
    input: JSON.stringify(input, null, 2),
    format: assessmentFormat(ruleOnly),
  };
}

const ACTION_INSTRUCTIONS = {
  request_diagnosis_edit: [
    "Write exactly one question that helps the student replace their full diagnosis.",
    "Use 7 to 14 words. Start with What, Where, Which, or How.",
    "Ask for exactly one missing detail. Use one short anchor only from fieldText or broadTask.",
    "Do not use and, or, parentheses, an em dash, answer choices, suggested causes, or suggested wording.",
    "Return only the question in content. Do not include the field warning.",
  ],
  request_rule_edit: [
    "Write exactly one question that helps the student replace their full prevention rule.",
    "Use 7 to 14 words. Start with What, Where, Which, or How.",
    "Ask for exactly one missing trigger, new action, or prevention link.",
    "Do not use and, or, parentheses, an em dash, suggested actions, or suggested wording.",
    "Return only the question in content. Do not include the field warning.",
  ],
  conclude: [
    "Write one sentence beginning exactly with 'Next time,'.",
    "Use at most 25 words and give one action that generalizes to the same question type.",
    "Do not include values, variables, expressions, answer choices, equation sides, or wording unique to this question.",
  ],
  teach_concept: [
    "Teach only the named concept gap using the selected teaching notes and official explanation.",
    "Use at most 4 short sentences and 70 words. Relate it to the missed question without giving a full worked solution.",
    "End by inviting the student to ask a follow-up question. Do not audit the rule or add a Next time sentence.",
  ],
  answer_question: [
    "Answer the student's latest question briefly and directly.",
    "Do not restart or advance a paused review audit.",
    "Use the selected teaching notes only when they are present.",
  ],
};

function buildResponseRequest({
  action,
  question,
  studentReview,
  reviewStage,
  assessment,
  conversation,
  priorAuditQuestions,
  teachingMethod,
  method,
  validationError,
}) {
  const review = selectStudentReview(studentReview, reviewStage);
  let input;
  if (action === "request_diagnosis_edit") {
    input = {
      action,
      fieldText: review.whereWrong,
      broadTask: tagLabels(question),
      missingDetail: assessment?.diagnosis?.missingDetail,
      priorAuditQuestions,
      correction: validationError,
    };
  } else if (action === "request_rule_edit") {
    input = {
      action,
      acceptedDiagnosis: review.whereWrong,
      fieldText: review.preventionRule,
      broadTask: tagLabels(question),
      missingDetail: assessment?.rule?.missingDetail,
      priorAuditQuestions,
      correction: validationError,
    };
  } else if (action === "conclude") {
    input = {
      action,
      questionType: question?.questionType,
      skills: tagLabels(question),
      acceptedDiagnosis: review.whereWrong,
      acceptedRule: review.preventionRule,
      correction: validationError,
    };
  } else if (action === "teach_concept") {
    input = {
      action,
      namedConcept: assessment?.diagnosis?.namedConcept,
      question: selectAuditQuestionContext(question),
      officialAnswerExplanation: question?.explanation,
      savedDiagnosis: review.whereWrong,
      selectedTeachingMethod: method?.title,
      selectedTeachingNotes: teachingMethod,
      correction: validationError,
    };
  } else {
    input = {
      action: "answer_question",
      question: selectChatQuestionContext(question),
      officialAnswerExplanation: question?.explanation,
      savedReview: review,
      conversation,
      selectedTeachingMethod: method?.title,
      selectedTeachingNotes: teachingMethod,
      correction: validationError,
    };
  }

  return {
    instructions: [
      TUTOR_BASE_INSTRUCTIONS,
      ...(ACTION_INSTRUCTIONS[action] || ACTION_INSTRUCTIONS.answer_question),
    ].join("\n"),
    input: JSON.stringify(compactValue(input) || {}, null, 2),
    format: responseFormat(),
  };
}

module.exports = {
  TUTOR_BASE_INSTRUCTIONS,
  ASSESSMENT_INSTRUCTIONS,
  assessmentFormat,
  buildAssessmentRequest,
  buildResponseRequest,
  compactValue,
  responseFormat,
  selectAuditQuestionContext,
  selectChatQuestionContext,
  selectStudentReview,
};
