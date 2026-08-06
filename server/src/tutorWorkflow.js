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
const VALID_TURN_TYPES = new Set([
  "start",
  "chat",
  "field_edit",
  "manual_edit",
]);
const DIAGNOSIS_AUDIT_FOCUSES = new Set([
  "deepen_label",
  "identify_unknown_part",
  "explain_wording_effect",
  "identify_concrete_cause",
]);
const RULE_MISSING_REQUIREMENTS = new Set(["trigger", "new_behavior"]);

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
  return (
    diagnosis?.status === "concrete_causal_root" &&
    evidenceAppears(studentReview?.whereWrong, diagnosis.causalRootEvidence)
  );
}

function unknownKnowledgeGap(assessment, studentReview) {
  const diagnosis = assessment?.diagnosis;
  return (
    diagnosis?.status === "unknown_knowledge" &&
    evidenceAppears(
      studentReview?.whereWrong,
      diagnosis.unknownKnowledgeEvidence,
    ) &&
    typeof diagnosis.teachingTarget === "string" &&
    diagnosis.teachingTarget.trim().length > 0
  );
}

function ruleAccepted(assessment, studentReview) {
  const rule = assessment?.rule;
  return (
    rule?.status === "acceptable" &&
    evidenceAppears(studentReview?.myRule, rule.triggerEvidence) &&
    evidenceAppears(studentReview?.myRule, rule.newBehaviorEvidence)
  );
}

function decideReviewAction({ assessment, studentReview, ruleOnly = false }) {
  if (!ruleOnly) {
    if (unknownKnowledgeGap(assessment, studentReview)) {
      return { action: ACTIONS.TEACH, reasonCode: "unknown_knowledge" };
    }
    if (!diagnosisAccepted(assessment, studentReview)) {
      return {
        action: ACTIONS.DIAGNOSIS,
        reasonCode:
          assessment?.diagnosis?.auditFocus || "identify_concrete_cause",
      };
    }
  }
  if (!ruleAccepted(assessment, studentReview)) {
    return {
      action: ACTIONS.RULE,
      reasonCode: assessment?.rule?.missingRequirement || "new_behavior",
    };
  }
  return { action: ACTIONS.CONCLUDE, reasonCode: "review_accepted" };
}

function nextStateForAction(action, currentState) {
  if (action === ACTIONS.DIAGNOSIS) return STATES.DIAGNOSIS;
  if (action === ACTIONS.RULE) return STATES.RULE;
  if ([ACTIONS.CONCLUDE, ACTIONS.TEACH].includes(action))
    return STATES.COMPLETE;
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

function reviewChangeValidationError(reviewChange, studentReview) {
  if (!reviewChange) return null;
  if (
    !Array.isArray(reviewChange.changedFields) ||
    !reviewChange.changedFields.length
  ) {
    return "A saved review change is required.";
  }

  for (const field of reviewChange.changedFields) {
    const before = reviewChange.before?.[field];
    const after = reviewChange.after?.[field];
    if (
      typeof before !== "string" ||
      typeof after !== "string" ||
      !before ||
      !after
    ) {
      return "Every saved review change must include non-empty before and after values.";
    }
    if (before === after)
      return "A saved review change must contain a new value.";
    if (after !== studentReview?.[field]) {
      return "The saved review change does not match the current mistake log.";
    }
  }
  return null;
}

function validateWorkflowTurn(
  workflow,
  reviewChange,
  { conversation = [], studentReview = {} } = {},
) {
  if (workflow.editedField && workflow.turnType !== "field_edit") {
    return "Only a field-edit turn may name an edited field.";
  }

  const changeError = reviewChangeValidationError(reviewChange, studentReview);
  if (changeError) return changeError;

  if (workflow.turnType === "start") {
    if (workflow.state !== STATES.EVALUATE) {
      return "A start turn must begin in evaluate_review.";
    }
    if (reviewChange)
      return "A start turn cannot include a saved review change.";
    return null;
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
    return null;
  }

  if (workflow.turnType === "manual_edit") {
    if (!reviewChange)
      return "A manual-edit turn requires a saved review change.";
    return null;
  }

  if (workflow.turnType === "chat") {
    if (workflow.state === STATES.EVALUATE) {
      return "The saved review must be evaluated before normal chat.";
    }
    if (reviewChange)
      return "A chat turn cannot include a saved review change.";
    if (conversation.at(-1)?.role !== "student") {
      return "A chat turn must end with a student message.";
    }
  }
  return null;
}

function getPriorAuditQuestions(conversation) {
  return (conversation || [])
    .filter((message) => message.role === "assistant")
    .flatMap(
      (message) => String(message.content || "").match(/[^?\n]+\?/g) || [],
    )
    .map((question) => question.trim());
}

function validateDiagnosis(diagnosis, studentReview) {
  if (!diagnosis || typeof diagnosis !== "object")
    return "Diagnosis is missing.";
  if (
    !["concrete_causal_root", "unknown_knowledge", "insufficient"].includes(
      diagnosis.status,
    )
  ) {
    return "Diagnosis status is invalid.";
  }

  const hasCausalEvidence = evidenceAppears(
    studentReview?.whereWrong,
    diagnosis.causalRootEvidence,
  );
  const hasUnknownEvidence = evidenceAppears(
    studentReview?.whereWrong,
    diagnosis.unknownKnowledgeEvidence,
  );

  if (diagnosis.status === "concrete_causal_root") {
    if (!hasCausalEvidence)
      return "Concrete-root evidence is not in the saved diagnosis.";
    if (diagnosis.unknownKnowledgeEvidence !== null) {
      return "A concrete-root diagnosis cannot include unknown-knowledge evidence.";
    }
    if (diagnosis.teachingTarget !== null) {
      return "A concrete-root diagnosis cannot include a teaching target.";
    }
    if (diagnosis.auditFocus !== "none") {
      return "A concrete-root diagnosis cannot request an audit focus.";
    }
    return null;
  }

  if (diagnosis.status === "unknown_knowledge") {
    if (!hasUnknownEvidence)
      return "Unknown-knowledge evidence is not in the saved diagnosis.";
    if (diagnosis.causalRootEvidence !== null) {
      return "An unknown-knowledge diagnosis cannot include causal-root evidence.";
    }
    if (
      typeof diagnosis.teachingTarget !== "string" ||
      !diagnosis.teachingTarget.trim()
    ) {
      return "Unknown knowledge requires a teaching target.";
    }
    if (diagnosis.auditFocus !== "none") {
      return "Unknown knowledge cannot request an audit focus.";
    }
    return null;
  }

  if (
    diagnosis.causalRootEvidence !== null ||
    diagnosis.unknownKnowledgeEvidence !== null ||
    diagnosis.teachingTarget !== null
  ) {
    return "An insufficient diagnosis cannot include accepted-path evidence.";
  }
  if (!DIAGNOSIS_AUDIT_FOCUSES.has(diagnosis.auditFocus)) {
    return "An insufficient diagnosis needs a valid audit focus.";
  }
  return null;
}

function validateRule(rule, studentReview) {
  if (!rule || typeof rule !== "object") return "Rule assessment is missing.";
  if (!["acceptable", "insufficient"].includes(rule.status)) {
    return "Rule status is invalid.";
  }

  const hasTrigger = evidenceAppears(
    studentReview?.myRule,
    rule.triggerEvidence,
  );
  const hasNewBehavior = evidenceAppears(
    studentReview?.myRule,
    rule.newBehaviorEvidence,
  );

  if (rule.status === "acceptable") {
    if (!hasTrigger || !hasNewBehavior) {
      return "An acceptable rule needs exact trigger and new-behavior evidence.";
    }
    if (rule.missingRequirement !== "none") {
      return "An acceptable rule cannot name a missing requirement.";
    }
    return null;
  }

  if (!RULE_MISSING_REQUIREMENTS.has(rule.missingRequirement)) {
    return "An insufficient rule needs a valid missing requirement.";
  }
  if (rule.missingRequirement === "new_behavior") {
    if (rule.newBehaviorEvidence !== null) {
      return "A missing new behavior must not include new-behavior evidence.";
    }
    if (rule.triggerEvidence !== null && !hasTrigger) {
      return "Rule trigger evidence is not in the saved rule.";
    }
    return null;
  }
  if (rule.triggerEvidence !== null) {
    return "A missing trigger must not include trigger evidence.";
  }
  if (!hasNewBehavior) {
    return "A missing trigger needs exact new-behavior evidence.";
  }
  return null;
}

function expectedResponseShape(action) {
  if (action === ACTIONS.DIAGNOSIS) {
    return {
      targetField: "whereWrong",
      responseType: "audit_question",
      content: "string",
    };
  }
  if (action === ACTIONS.RULE) {
    return {
      targetField: "myRule",
      responseType: "audit_question",
      content: "string",
    };
  }
  if (action === ACTIONS.CONCLUDE) {
    return { targetField: null, responseType: "conclusion", content: "string" };
  }
  return {
    targetField: null,
    responseType: "teaching_handoff",
    content: "null",
  };
}

function validateReviewOutput({ output, studentReview, ruleOnly = false }) {
  if (!output || typeof output !== "object") return "Review output is missing.";
  if (ruleOnly) {
    if (Object.hasOwn(output, "diagnosis")) {
      return "A rule-only response cannot include a diagnosis assessment.";
    }
  } else {
    const diagnosisError = validateDiagnosis(output.diagnosis, studentReview);
    if (diagnosisError) return diagnosisError;
  }

  const ruleError = validateRule(output.rule, studentReview);
  if (ruleError) return ruleError;

  const decision = decideReviewAction({
    assessment: output,
    studentReview,
    ruleOnly,
  });
  if (output.proposedAction !== decision.action) {
    return "The proposed action does not match the deterministic review gate.";
  }

  const expected = expectedResponseShape(decision.action);
  if (output.targetField !== expected.targetField) {
    return "The response target field does not match the selected action.";
  }
  if (output.responseType !== expected.responseType) {
    return "The response type does not match the selected action.";
  }
  if (expected.content === "null") {
    if (output.content !== null)
      return "Teaching handoff content must be null.";
  } else if (typeof output.content !== "string" || !output.content.trim()) {
    return "The selected response needs non-empty content.";
  }
  return null;
}

function validateTutorContent({ content }) {
  return typeof content === "string" && content.trim()
    ? null
    : "Content is empty.";
}

function shouldLoadMethodForChat(message) {
  return /\b(teach|explain|why|how do|how does|show me|walk me through|work through|help me understand|concept|method)\b/i.test(
    String(message || ""),
  );
}

function formatTutorReply({
  action,
  content,
  noticeField,
  manualEdit = false,
}) {
  const parts = [];
  if (manualEdit) parts.push("I noticed your saved answers changed.");
  if (noticeField === "whereWrong") {
    parts.push('Your "Where I went wrong" answer needs more detail.');
  } else if (noticeField === "myRule") {
    parts.push("Your rule needs more detail.");
  }
  if (action !== ACTIONS.ACKNOWLEDGE && content)
    parts.push(String(content).trim());
  return parts.join(" ");
}

module.exports = {
  ACTIONS,
  STATES,
  decideReviewAction,
  diagnosisAccepted,
  evidenceAppears,
  expectedResponseShape,
  formatTutorReply,
  getPriorAuditQuestions,
  nextStateForAction,
  normalizeText,
  normalizeWorkflow,
  requestedFieldForAction,
  reviewChangeValidationError,
  ruleAccepted,
  shouldLoadMethodForChat,
  unknownKnowledgeGap,
  validateReviewOutput,
  validateTutorContent,
  validateWorkflowTurn,
};
