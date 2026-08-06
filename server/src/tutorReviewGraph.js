const { END, START, StateGraph, StateSchema } = require("@langchain/langgraph");
const { z } = require("zod");
const { getStructuredResponse } = require("./openaiClient");
const { lookupTeachingMethod } = require("./methodLookup");
const { buildResponseRequest, buildReviewRequest } = require("./promptBuilder");
const {
  ACTIONS,
  STATES,
  decideReviewAction,
  formatTutorReply,
  getPriorAuditQuestions,
  nextStateForAction,
  requestedFieldForAction,
  shouldLoadMethodForChat,
  validateReviewOutput,
  validateTutorContent,
  validateWorkflowTurn,
} = require("./tutorWorkflow");

const TutorReviewState = new StateSchema({
  request: z.any(),
  route: z.string().optional(),
  assessmentMode: z.enum(["full", "rule_only"]).optional(),
  attempt: z.number().optional(),
  validationError: z.string().nullable().optional(),
  modelOutput: z.any().nullable().optional(),
  modelError: z.string().nullable().optional(),
  verificationError: z.string().nullable().optional(),
  assessment: z.any().nullable().optional(),
  action: z.string().nullable().optional(),
  reasonCode: z.string().nullable().optional(),
  requestedEditField: z.string().nullable().optional(),
  noticeField: z.string().nullable().optional(),
  nextWorkflowState: z.string().nullable().optional(),
  manualEdit: z.boolean().optional(),
  teachingMethod: z.any().nullable().optional(),
  method: z.any().nullable().optional(),
  content: z.string().nullable().optional(),
  finalResponse: z.any().nullable().optional(),
});

function tutorError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isRetryableStructuredError(error) {
  return [
    "AI_INVALID_RESPONSE",
    "AI_EMPTY_RESPONSE",
    "AI_INCOMPLETE_RESPONSE",
  ].includes(error?.code);
}

function lastStudentMessage(conversation) {
  return [...(conversation || [])]
    .reverse()
    .find((message) => message.role === "student")?.content;
}

function publicMethod(method) {
  if (!method) return null;
  return { key: method.key || null, title: method.title || null };
}

function isTagOnlyEdit(reviewChange) {
  return (
    Array.isArray(reviewChange?.changedFields) &&
    reviewChange.changedFields.length > 0 &&
    reviewChange.changedFields.every((field) => field === "tag")
  );
}

function reviewRouteForRequest(request) {
  const { workflow, reviewChange } = request;
  if (workflow.turnType === "manual_edit" && isTagOnlyEdit(reviewChange)) {
    return "acknowledge";
  }
  if (workflow.turnType === "chat") return "chat";
  if (workflow.turnType === "field_edit" && workflow.state === STATES.RULE) {
    return "rule_only";
  }
  return "full";
}

async function generateMessage({
  services,
  action,
  request,
  assessment,
  teachingMethod,
  method,
}) {
  let validationError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const modelRequest = buildResponseRequest({
      action,
      question: request.question,
      studentReview: request.studentReview,
      reviewStage: request.reviewStage,
      assessment,
      conversation: request.conversation,
      teachingMethod: teachingMethod?.content || "",
      method,
      validationError,
    });
    try {
      const output = await services.getStructuredResponse({
        ...modelRequest,
        images: [ACTIONS.TEACH, ACTIONS.ANSWER].includes(action)
          ? request.images
          : [],
        maxOutputTokens: action === ACTIONS.ANSWER ? 500 : 300,
      });
      validationError = validateTutorContent({ content: output?.content });
      if (!validationError) return output.content.trim();
    } catch (error) {
      if (!isRetryableStructuredError(error)) throw error;
      validationError = error.message || "The tutor response was malformed.";
    }
  }
  throw tutorError(
    502,
    "AI_RESPONSE_CONTRACT",
    validationError || "The tutor response did not match its required format.",
  );
}

function createTutorReviewGraph(services = {}) {
  const dependencies = {
    getStructuredResponse:
      services.getStructuredResponse || getStructuredResponse,
    lookupTeachingMethod: services.lookupTeachingMethod || lookupTeachingMethod,
  };

  const routeTurn = (state) => {
    const { request } = state;
    const error = validateWorkflowTurn(request.workflow, request.reviewChange, {
      conversation: request.conversation,
      studentReview: request.studentReview,
    });
    if (error) throw tutorError(400, "INVALID_TUTOR_WORKFLOW", error);

    const route = reviewRouteForRequest(request);
    return {
      route,
      assessmentMode: route === "rule_only" ? "rule_only" : "full",
      attempt: 0,
      validationError: null,
      manualEdit: request.workflow.turnType === "manual_edit",
    };
  };

  const assessReview = (ruleOnly) => async (state) => {
    const { request } = state;
    const modelRequest = buildReviewRequest({
      question: request.question,
      studentReview: request.studentReview,
      reviewStage: request.reviewStage,
      workflowState: request.workflow.state,
      ruleOnly,
      priorAuditQuestions: getPriorAuditQuestions(request.conversation),
      validationError: state.validationError,
    });
    try {
      const modelOutput = await dependencies.getStructuredResponse({
        ...modelRequest,
        images: request.images,
        maxOutputTokens: 650,
      });
      return { modelOutput, modelError: null };
    } catch (error) {
      if (!isRetryableStructuredError(error)) throw error;
      return {
        modelOutput: null,
        modelError: error.message || "The review response was malformed.",
      };
    }
  };

  const verifyReview = (state) => {
    const { request } = state;
    const validationError =
      state.modelError ||
      validateReviewOutput({
        output: state.modelOutput,
        studentReview: request.studentReview,
        ruleOnly: state.assessmentMode === "rule_only",
      });
    if (validationError) return { verificationError: validationError };

    const decision = decideReviewAction({
      assessment: state.modelOutput,
      studentReview: request.studentReview,
      ruleOnly: state.assessmentMode === "rule_only",
    });
    return {
      verificationError: null,
      assessment: state.modelOutput,
      action: decision.action,
      reasonCode: decision.reasonCode,
      content: state.modelOutput.content,
    };
  };

  const retryReview = (state) => ({
    attempt: (state.attempt || 0) + 1,
    validationError: state.verificationError,
    modelOutput: null,
    modelError: null,
    verificationError: null,
  });

  const responseMetadata = (state, action) => {
    const { workflow } = state.request;
    const requestedEditField = requestedFieldForAction(action);
    const noticeField =
      requestedEditField && !workflow.shownAuditNotices[requestedEditField]
        ? requestedEditField
        : null;
    return {
      nextWorkflowState: nextStateForAction(action, workflow.state),
      requestedEditField,
      noticeField,
    };
  };

  const prepareDiagnosisAudit = (state) =>
    responseMetadata(state, ACTIONS.DIAGNOSIS);
  const prepareRuleAudit = (state) => responseMetadata(state, ACTIONS.RULE);
  const prepareConclusion = (state) =>
    responseMetadata(state, ACTIONS.CONCLUDE);

  const loadTeachingMethod = async (state) => {
    const teachingMethod = await dependencies.lookupTeachingMethod(
      state.request.question,
    );
    return { teachingMethod, method: publicMethod(teachingMethod) };
  };

  const teachConcept = async (state) => {
    const content = await generateMessage({
      services: dependencies,
      action: ACTIONS.TEACH,
      request: state.request,
      assessment: state.assessment,
      teachingMethod: state.teachingMethod,
      method: state.method,
    });
    return {
      content,
      ...responseMetadata(state, ACTIONS.TEACH),
    };
  };

  const answerChat = async (state) => {
    const { request } = state;
    const message = lastStudentMessage(request.conversation);
    const teachingMethod = shouldLoadMethodForChat(message)
      ? await dependencies.lookupTeachingMethod(request.question)
      : null;
    const method = publicMethod(teachingMethod);
    const content = await generateMessage({
      services: dependencies,
      action: ACTIONS.ANSWER,
      request,
      assessment: null,
      teachingMethod,
      method,
    });
    return {
      action: ACTIONS.ANSWER,
      reasonCode: "student_question",
      content,
      teachingMethod,
      method,
      nextWorkflowState: request.workflow.state,
      requestedEditField: null,
      noticeField: null,
    };
  };

  const acknowledgeEdit = (state) => ({
    action: ACTIONS.ACKNOWLEDGE,
    reasonCode: "tag_updated",
    content: null,
    method: null,
    nextWorkflowState: state.request.workflow.state,
    requestedEditField: null,
    noticeField: null,
  });

  const formatResponse = (state) => {
    const reply = formatTutorReply({
      action: state.action,
      content: state.content,
      noticeField: state.noticeField,
      manualEdit: state.manualEdit,
    });
    return {
      finalResponse: {
        reply,
        action: state.action,
        reasonCode: state.reasonCode,
        nextWorkflowState: state.nextWorkflowState,
        requestedEditField: state.requestedEditField,
        noticeField: state.noticeField,
        method: state.method,
      },
    };
  };

  const graph = new StateGraph(TutorReviewState)
    .addNode("route_turn", routeTurn)
    .addNode("assess_full_review", assessReview(false))
    .addNode("assess_rule_only", assessReview(true))
    .addNode("verify_review", verifyReview)
    .addNode("retry_review", retryReview)
    .addNode("contract_error", (state) => {
      throw tutorError(
        502,
        "AI_RESPONSE_CONTRACT",
        state.verificationError ||
          "The tutor review did not match its required format.",
      );
    })
    .addNode("prepare_diagnosis_audit", prepareDiagnosisAudit)
    .addNode("prepare_rule_audit", prepareRuleAudit)
    .addNode("prepare_conclusion", prepareConclusion)
    .addNode("load_teaching_method", loadTeachingMethod)
    .addNode("teach_concept", teachConcept)
    .addNode("answer_chat", answerChat)
    .addNode("acknowledge_edit", acknowledgeEdit)
    .addNode("format_response", formatResponse)
    .addEdge(START, "route_turn")
    .addConditionalEdges("route_turn", (state) => state.route, {
      full: "assess_full_review",
      rule_only: "assess_rule_only",
      chat: "answer_chat",
      acknowledge: "acknowledge_edit",
    })
    .addEdge("assess_full_review", "verify_review")
    .addEdge("assess_rule_only", "verify_review")
    .addConditionalEdges(
      "verify_review",
      (state) => {
        if (state.verificationError) {
          return (state.attempt || 0) < 1 ? "retry" : "error";
        }
        return state.action;
      },
      {
        retry: "retry_review",
        error: "contract_error",
        [ACTIONS.DIAGNOSIS]: "prepare_diagnosis_audit",
        [ACTIONS.RULE]: "prepare_rule_audit",
        [ACTIONS.CONCLUDE]: "prepare_conclusion",
        [ACTIONS.TEACH]: "load_teaching_method",
      },
    )
    .addConditionalEdges("retry_review", (state) => state.assessmentMode, {
      full: "assess_full_review",
      rule_only: "assess_rule_only",
    })
    .addEdge("prepare_diagnosis_audit", "format_response")
    .addEdge("prepare_rule_audit", "format_response")
    .addEdge("prepare_conclusion", "format_response")
    .addEdge("load_teaching_method", "teach_concept")
    .addEdge("teach_concept", "format_response")
    .addEdge("answer_chat", "format_response")
    .addEdge("acknowledge_edit", "format_response")
    .addEdge("format_response", END)
    .compile();

  return graph;
}

const defaultGraph = createTutorReviewGraph();

async function runTutorReviewGraph(request, services) {
  const graph = services ? createTutorReviewGraph(services) : defaultGraph;
  const result = await graph.invoke({ request });
  return {
    response: result.finalResponse,
    assessment: result.assessment || null,
  };
}

module.exports = {
  createTutorReviewGraph,
  runTutorReviewGraph,
  tutorError,
};
