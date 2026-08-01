const STATES = Object.freeze({
  EVALUATE: "evaluate_review",
  DIAGNOSIS: "awaiting_diagnosis_edit",
  RULE: "awaiting_rule_edit",
  COMPLETE: "complete",
});

const ACTIONS = Object.freeze({
  DIAGNOSIS: "request_diagnosis_edit",
  RULE: "request_rule_edit",
  CONCLUDE: "conclude",
  TEACH: "teach_concept",
  ANSWER: "answer_question",
  ACKNOWLEDGE: "acknowledge_edit",
});

const VALID_STATES = new Set(Object.values(STATES));
const VALID_TURN_TYPES = new Set(["start", "chat", "field_edit", "manual_edit"]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'/$+\-=]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceAppears(source, evidence) {
  const field = normalizeText(source);
  const quote = normalizeText(evidence);
  return Boolean(field && quote && field.includes(quote));
}

function diagnosisAccepted(assessment, studentReview) {
  const diagnosis = assessment?.diagnosis;
  const source = studentReview?.whereWrong;
  if (diagnosis?.status !== "specific_root_cause") return false;
  const hasWrongAction = evidenceAppears(source, diagnosis.wrongActionOrResult);
  const hasStep = evidenceAppears(source, diagnosis.stepOrTrigger);
  const hasContrast = evidenceAppears(source, diagnosis.correctContrast);
  return hasWrongAction && (hasStep || hasContrast);
}

function namedConceptGap(assessment, studentReview) {
  const diagnosis = assessment?.diagnosis;
  return (
    diagnosis?.status === "named_concept_gap" &&
    evidenceAppears(studentReview?.whereWrong, diagnosis.namedConcept)
  );
}

function ruleAccepted(assessment, studentReview) {
  const rule = assessment?.rule;
  const source = studentReview?.myRule;
  return (
    rule?.status === "acceptable" &&
    evidenceAppears(source, rule.trigger) &&
    evidenceAppears(source, rule.newBehavior)
  );
}

function decideReviewAction({ assessment, studentReview, ruleOnly = false }) {
  if (!ruleOnly) {
    if (namedConceptGap(assessment, studentReview)) {
      return { action: ACTIONS.TEACH, reasonCode: "named_concept_gap" };
    }
    if (!diagnosisAccepted(assessment, studentReview)) {
      return {
        action: ACTIONS.DIAGNOSIS,
        reasonCode: assessment?.diagnosis?.missingDetail || "wrong_action_or_result",
      };
    }
  }
  if (!ruleAccepted(assessment, studentReview)) {
    return {
      action: ACTIONS.RULE,
      reasonCode: assessment?.rule?.missingDetail || "new_behavior",
    };
  }
  return { action: ACTIONS.CONCLUDE, reasonCode: "review_accepted" };
}

function nextStateForAction(action, currentState) {
  if (action === ACTIONS.DIAGNOSIS) return STATES.DIAGNOSIS;
  if (action === ACTIONS.RULE) return STATES.RULE;
  if ([ACTIONS.CONCLUDE, ACTIONS.TEACH].includes(action)) return STATES.COMPLETE;
  return currentState;
}

function requestedFieldForAction(action) {
  if (action === ACTIONS.DIAGNOSIS) return "whereWrong";
  if (action === ACTIONS.RULE) return "myRule";
  return null;
}

function normalizeWorkflow(value, { hasConversation = false } = {}) {
  const state = VALID_STATES.has(value?.state) ? value.state : STATES.EVALUATE;
  const turnType = VALID_TURN_TYPES.has(value?.turnType)
    ? value.turnType
    : hasConversation
      ? "chat"
      : "start";
  const editedField = ["whereWrong", "myRule"].includes(value?.editedField)
    ? value.editedField
    : null;
  return {
    state,
    turnType,
    editedField,
    shownAuditNotices: {
      whereWrong: Boolean(value?.shownAuditNotices?.whereWrong),
      myRule: Boolean(value?.shownAuditNotices?.myRule),
    },
  };
}

function validateWorkflowTurn(workflow, reviewChange) {
  if (workflow.turnType === "start" && workflow.state !== STATES.EVALUATE) {
    return "A start turn must begin in evaluate_review.";
  }
  if (workflow.turnType === "field_edit") {
    const expectedField =
      workflow.state === STATES.DIAGNOSIS
        ? "whereWrong"
        : workflow.state === STATES.RULE
          ? "myRule"
          : null;
    if (!expectedField || workflow.editedField !== expectedField) {
      return "The edited field does not match the current tutor state.";
    }
    if (
      !reviewChange ||
      reviewChange.changedFields.length !== 1 ||
      reviewChange.changedFields[0] !== expectedField
    ) {
      return "A field-edit turn must include only the requested saved-field change.";
    }
  }
  if (workflow.turnType === "manual_edit" && !reviewChange) {
    return "A manual-edit turn requires a saved review change.";
  }
  if (workflow.turnType === "chat" && workflow.state === STATES.EVALUATE) {
    return "The saved review must be evaluated before normal chat.";
  }
  return null;
}

function getPriorAuditQuestions(conversation) {
  return (conversation || [])
    .filter((message) => message.role === "assistant")
    .flatMap((message) => String(message.content || "").match(/[^?\n]+\?/g) || [])
    .map((question) => question.trim());
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizedQuestionTokens(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function questionsAreSimilar(left, right) {
  const a = normalizedQuestionTokens(left);
  const b = normalizedQuestionTokens(right);
  if (!a.size || !b.size) return false;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size) >= 0.8;
}

function countSentences(value) {
  return (String(value || "").match(/[.!?]+(?=\s|$)/g) || []).length || 1;
}

function validateTutorContent({
  action,
  content,
  conversation,
  studentReview,
  question,
}) {
  const text = String(content || "").trim();
  if (!text) return "Content is empty.";
  if ([ACTIONS.DIAGNOSIS, ACTIONS.RULE].includes(action)) {
    const words = wordCount(text);
    if (words < 7 || words > 14) return "The audit question must use 7 to 14 words.";
    if (!/^(What|Where|Which|How)\b/.test(text)) {
      return "The audit question must start with What, Where, Which, or How.";
    }
    if ((text.match(/\?/g) || []).length !== 1 || !text.endsWith("?")) {
      return "The audit response must contain exactly one question.";
    }
    if (/\b(and|or)\b/i.test(text) || /[()\u2014]/.test(text)) {
      return "The audit question must request only one detail with simple wording.";
    }
    const prior = getPriorAuditQuestions(conversation);
    if (prior.some((questionText) => questionsAreSimilar(questionText, text))) {
      return "The audit question repeats a prior question.";
    }
    const fieldText =
      action === ACTIONS.DIAGNOSIS ? studentReview?.whereWrong : studentReview?.myRule;
    const wrongAnswer = question?.freeResponse?.studentAnswer;
    if (
      wrongAnswer &&
      normalizeText(text).includes(normalizeText(wrongAnswer)) &&
      !normalizeText(fieldText).includes(normalizeText(wrongAnswer))
    ) {
      return "The audit question introduced the student's final answer instead of auditing the saved field.";
    }
  }
  if (action === ACTIONS.CONCLUDE) {
    if (!text.startsWith("Next time,")) return "The conclusion must begin with Next time,.";
    if (wordCount(text) > 25) return "The conclusion must use at most 25 words.";
    if (countSentences(text) !== 1) return "The conclusion must be one sentence.";
  }
  if (action === ACTIONS.TEACH) {
    if (wordCount(text) > 70 || countSentences(text) > 4) {
      return "The concept lesson must use at most 70 words and 4 sentences.";
    }
    if (!/\b(ask|want|would|try)\b/i.test(text) || !text.includes("?")) {
      return "The concept lesson must end with a follow-up invitation.";
    }
  }
  return null;
}

function shouldLoadMethodForChat(message) {
  return /\b(teach|explain|why|how do|how does|show me|walk me through|work through|help me understand|concept|method)\b/i.test(
    String(message || ""),
  );
}

function formatTutorReply({ action, content, noticeField, manualEdit = false }) {
  const parts = [];
  if (manualEdit) parts.push("I noticed your saved answers changed.");
  if (noticeField === "whereWrong") {
    parts.push('Your "Where I went wrong" answer needs more detail.');
  } else if (noticeField === "myRule") {
    parts.push("Your rule needs more detail.");
  }
  if (action !== ACTIONS.ACKNOWLEDGE && content) parts.push(String(content).trim());
  return parts.join(" ");
}

module.exports = {
  ACTIONS,
  STATES,
  decideReviewAction,
  diagnosisAccepted,
  evidenceAppears,
  formatTutorReply,
  getPriorAuditQuestions,
  namedConceptGap,
  nextStateForAction,
  normalizeWorkflow,
  questionsAreSimilar,
  requestedFieldForAction,
  ruleAccepted,
  shouldLoadMethodForChat,
  validateTutorContent,
  validateWorkflowTurn,
  wordCount,
};
