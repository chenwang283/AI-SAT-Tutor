const TUTOR_BASE_INSTRUCTIONS = [
  "You are an SAT tutor helping one student review a missed question.",
  "Use short, common words at or below a sixth-grade reading level.",
  "Do not write or suggest a diagnosis or prevention rule for the student.",
  "Do not reveal the full solution unless the current task is concept teaching or the student directly asks for it.",
  "Follow the supplied output schema exactly. Return no text outside it.",
].join("\n");

const REVIEW_INSTRUCTIONS = [
  TUTOR_BASE_INSTRUCTIONS,
  "Assess only the saved diagnosis and prevention rule in the input.",
  "Every evidence value must copy exact words from its saved field. Use null when those words are not present.",
  "A concrete causal root is one exact action, choice, missed detail, or misunderstanding that produced the mistake. Do not require a separate step, trigger, correct comparison, or explanation of why it happened.",
  "Unknown knowledge passes when the student names an unknown concept or method, or names a specific unknown part of the question, answer, or explanation. Infer a short teaching target for a specific unknown part.",
  "If both paths appear, use unknown_knowledge so the tutor teaches it.",
  "A surface label, feeling, vague outcome, or unsupported wording blame is insufficient.",
  "For an insufficient diagnosis, choose exactly one audit focus: deepen_label for rushed, guessed, careless, or similar labels; identify_unknown_part for a vague knowledge gap; explain_wording_effect for wording blame; identify_concrete_cause otherwise.",
  "A prevention rule passes only when it gives a specific trigger and a specific new behavior that helps prevent the diagnosed mistake.",
  "For an insufficient rule, use new_behavior when that behavior is missing, including when both parts are missing. Use trigger only when the new behavior is already specific.",
  "Choose the proposed action in this order: teach unknown knowledge; audit an insufficient diagnosis; audit an insufficient rule; otherwise conclude.",
  "For an audit, write one short question with 5-14 simple words that asks for only the selected missing piece. Do not give an answer, a suggested edit, a cause, a concept name, or a rule. Do not use topic tags as an anchor, problem values not in the audited field, or a prior audit question.",
  "For a rule trigger, ask when or where the student will use the rule. For a rule behavior, ask what they will do at that point.",
  "For a conclusion, begin with 'Next time,' and give one short action for similar questions. Do not use values, variables, answer choices, or wording unique to this question.",
  "For teaching handoff, content must be null.",
].join("\n");

const NULLABLE_STRING = { type: ["string", "null"] };

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["concrete_causal_root", "unknown_knowledge", "insufficient"],
    },
    causalRootEvidence: NULLABLE_STRING,
    unknownKnowledgeEvidence: NULLABLE_STRING,
    teachingTarget: NULLABLE_STRING,
    auditFocus: {
      type: "string",
      enum: [
        "none",
        "deepen_label",
        "identify_unknown_part",
        "explain_wording_effect",
        "identify_concrete_cause",
      ],
    },
  },
  required: [
    "status",
    "causalRootEvidence",
    "unknownKnowledgeEvidence",
    "teachingTarget",
    "auditFocus",
  ],
  additionalProperties: false,
};

const RULE_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["acceptable", "insufficient"] },
    triggerEvidence: NULLABLE_STRING,
    newBehaviorEvidence: NULLABLE_STRING,
    missingRequirement: {
      type: "string",
      enum: ["none", "trigger", "new_behavior"],
    },
  },
  required: [
    "status",
    "triggerEvidence",
    "newBehaviorEvidence",
    "missingRequirement",
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
      tags: Array.isArray(question?.tags) ? question.tags : undefined,
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

function reviewFormat(ruleOnly = false) {
  const properties = {
    rule: RULE_SCHEMA,
    proposedAction: {
      type: "string",
      enum: ruleOnly
        ? ["request_rule_edit", "conclude"]
        : [
            "request_diagnosis_edit",
            "request_rule_edit",
            "teach_concept",
            "conclude",
          ],
    },
    targetField: {
      type: ["string", "null"],
      enum: ["whereWrong", "myRule", null],
    },
    responseType: {
      type: "string",
      enum: ["audit_question", "conclusion", "teaching_handoff"],
    },
    content: NULLABLE_STRING,
  };
  if (!ruleOnly) properties.diagnosis = DIAGNOSIS_SCHEMA;
  return {
    type: "json_schema",
    name: ruleOnly ? "rule_review_response" : "full_review_response",
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

function buildReviewRequest({
  question,
  studentReview,
  reviewStage,
  workflowState,
  ruleOnly = false,
  priorAuditQuestions = [],
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
    acceptedDiagnosis: ruleOnly ? studentReview?.whereWrong : undefined,
    priorAuditQuestions,
    correction: validationError,
  });
  return {
    instructions: REVIEW_INSTRUCTIONS,
    input: JSON.stringify(input, null, 2),
    format: reviewFormat(ruleOnly),
  };
}

const ACTION_INSTRUCTIONS = {
  teach_concept: [
    "Teach only the selected missing concept using the teaching notes and official explanation.",
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
  teachingMethod,
  method,
  validationError,
}) {
  const review = selectStudentReview(studentReview, reviewStage);
  const input =
    action === "teach_concept"
      ? {
          action,
          teachingTarget: assessment?.diagnosis?.teachingTarget,
          question: selectAuditQuestionContext(question),
          officialAnswerExplanation: question?.explanation,
          savedDiagnosis: review.whereWrong,
          selectedTeachingMethod: method?.title,
          selectedTeachingNotes: teachingMethod,
          correction: validationError,
        }
      : {
          action: "answer_question",
          question: selectChatQuestionContext(question),
          officialAnswerExplanation: question?.explanation,
          savedReview: review,
          conversation,
          selectedTeachingMethod: method?.title,
          selectedTeachingNotes: teachingMethod,
          correction: validationError,
        };

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
  REVIEW_INSTRUCTIONS,
  TUTOR_BASE_INSTRUCTIONS,
  buildResponseRequest,
  buildReviewRequest,
  compactValue,
  responseFormat,
  reviewFormat,
  selectAuditQuestionContext,
  selectChatQuestionContext,
  selectStudentReview,
};
