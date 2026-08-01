(function () {
  const REVIEW_STEPS = ["metadata", "whereWrong", "myRule", "clock", "tag", "confirm"];
  const TUTOR_STATES = Object.freeze({
    EVALUATE: "evaluate_review",
    DIAGNOSIS: "awaiting_diagnosis_edit",
    RULE: "awaiting_rule_edit",
    COMPLETE: "complete",
  });
  const TUTOR_COMPOSER_MODES = new Set(["chat", "edit_where_wrong", "edit_my_rule"]);

  function createReviewDraft(metadata = {}) {
    return {
      step: "metadata",
      metadata: {
        dateLogged: metadata.dateLogged || "",
        timezone: metadata.timezone || "",
        source: metadata.source || "",
        questionNumber: metadata.questionNumber || "",
        section: metadata.section || "",
        difficulty: metadata.difficulty || "",
        pageUrl: metadata.pageUrl || null,
      },
      diagnosis: {
        whereWrong: "",
        myRule: "",
        clockMode: "",
        tag: "",
      },
    };
  }

  function nextReviewStep(step) {
    const index = REVIEW_STEPS.indexOf(step);
    return index >= 0 && index < REVIEW_STEPS.length - 1 ? REVIEW_STEPS[index + 1] : null;
  }

  function previousReviewStep(step) {
    const index = REVIEW_STEPS.indexOf(step);
    return index > 0 ? REVIEW_STEPS[index - 1] : null;
  }

  function getAllowedTags(config, section) {
    return Array.isArray(config?.tagsBySection?.[section]) ? config.tagsBySection[section] : [];
  }

  function validateReviewStep(draft, config) {
    if (!draft || !REVIEW_STEPS.includes(draft.step)) return "The review step is invalid.";
    const metadata = draft.metadata || {};
    const diagnosis = draft.diagnosis || {};

    if (draft.step === "metadata") {
      const required = [
        [metadata.dateLogged, "Date"],
        [metadata.timezone, "Timezone"],
        [metadata.source, "Source"],
        [metadata.questionNumber, "Question number"],
        [metadata.section, "Section"],
        [metadata.difficulty, "Difficulty"],
      ];
      const missing = required.find(([value]) => !String(value || "").trim());
      return missing ? `${missing[1]} is required.` : null;
    }
    if (draft.step === "whereWrong" && !diagnosis.whereWrong?.trim()) {
      return "Describe where you went wrong before continuing.";
    }
    if (draft.step === "myRule" && !diagnosis.myRule?.trim()) {
      return "Write the rule you will use next time before continuing.";
    }
    if (draft.step === "clock" && !["timed", "untimed"].includes(diagnosis.clockMode)) {
      return "Choose Timed or Untimed.";
    }
    if (draft.step === "tag") {
      const allowed = getAllowedTags(config, metadata.section).map((tag) => tag.value);
      if (!allowed.includes(diagnosis.tag)) return "Choose one tag for this section.";
    }
    return null;
  }

  function advanceReviewDraft(draft, config) {
    const error = validateReviewStep(draft, config);
    if (error) return { draft, error };
    const next = nextReviewStep(draft.step);
    return { draft: { ...draft, step: next || draft.step }, error: null };
  }

  function getTutorConversation(messages, startIndex = 0) {
    if (!Array.isArray(messages)) return [];
    const index = Number.isInteger(startIndex)
      ? Math.max(0, Math.min(startIndex, messages.length))
      : 0;
    return messages
      .slice(index)
      .filter((message) => ["student", "assistant"].includes(message?.role))
      .map((message) => ({ role: message.role, content: message.content }));
  }

  function createTutorWorkflowState() {
    return {
      state: TUTOR_STATES.EVALUATE,
      composerMode: "chat",
      shownAuditNotices: {
        whereWrong: false,
        myRule: false,
      },
    };
  }

  function normalizeTutorWorkflowState(value) {
    const fallback = createTutorWorkflowState();
    const state = Object.values(TUTOR_STATES).includes(value?.state)
      ? value.state
      : fallback.state;
    return {
      state,
      composerMode: TUTOR_COMPOSER_MODES.has(value?.composerMode)
        ? value.composerMode
        : "chat",
      shownAuditNotices: {
        whereWrong: Boolean(value?.shownAuditNotices?.whereWrong),
        myRule: Boolean(value?.shownAuditNotices?.myRule),
      },
    };
  }

  function requestedFieldForState(state) {
    if (state === TUTOR_STATES.DIAGNOSIS) return "whereWrong";
    if (state === TUTOR_STATES.RULE) return "myRule";
    return null;
  }

  function composerModeForField(field) {
    if (field === "whereWrong") return "edit_where_wrong";
    if (field === "myRule") return "edit_my_rule";
    return "chat";
  }

  function fieldForComposerMode(mode) {
    if (mode === "edit_where_wrong") return "whereWrong";
    if (mode === "edit_my_rule") return "myRule";
    return null;
  }

  const api = {
    REVIEW_STEPS,
    TUTOR_STATES,
    createReviewDraft,
    createTutorWorkflowState,
    nextReviewStep,
    previousReviewStep,
    getAllowedTags,
    validateReviewStep,
    advanceReviewDraft,
    getTutorConversation,
    normalizeTutorWorkflowState,
    requestedFieldForState,
    composerModeForField,
    fieldForComposerMode,
  };

  globalThis.aiSatTutorReviewFlow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
