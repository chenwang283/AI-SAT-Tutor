const express = require("express");
const dotenv = require("dotenv");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { getTutorReply } = require("./openaiClient");
const { lookupTeachingMethod } = require("./methodLookup");
const { buildTutorPrompt } = require("./promptBuilder");
const { appendExchangeLog, ensureExchangeLogDir } = require("./exchangeLogger");
const { REVIEW_CONFIG } = require("./reviewConfig");
const { requireAuthenticatedUser, getBearerToken } = require("./supabaseClient");
const authService = require("./authService");
const {
  createReview,
  getOwnedReview,
  updateReview,
  getDueReviews,
  completeRedo,
  serializeReview,
  getQuestionKey,
} = require("./reviewService");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const MAX_IMAGES_PER_REQUEST = 4;
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

app.use(express.json({ limit: process.env.REQUEST_JSON_LIMIT || "10mb" }));
app.use(express.static(PUBLIC_DIR));

function requestError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function getRequestQuestion(body) {
  const question = body?.question;
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    throw requestError(400, "INVALID_REQUEST", "Request body must include a captured question object.");
  }
  if (typeof question.stem !== "string" || !question.stem.trim()) {
    throw requestError(400, "INVALID_REQUEST", "Captured question must include a stem.");
  }
  if (!["multiple_choice", "free_response"].includes(question.questionType)) {
    throw requestError(400, "UNSUPPORTED_QUESTION_TYPE", "Only multiple-choice and free-response questions are supported.");
  }
  if (question.questionType === "free_response" && !question.freeResponse) {
    throw requestError(400, "INVALID_REQUEST", "Captured free-response question is missing answer data.");
  }
  return question;
}

function isImageDataUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value);
}

function isHttpImageUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch (error) {
    return false;
  }
}

function getFigureImageUrl(figure) {
  const dataUrl = typeof figure?.dataUrl === "string" ? figure.dataUrl.trim() : "";
  if (dataUrl && isImageDataUrl(dataUrl)) return dataUrl;
  const src = typeof figure?.src === "string" ? figure.src.trim() : "";
  if (src && (isImageDataUrl(src) || isHttpImageUrl(src))) return src;
  return null;
}

function cleanFigureForPrompt(figure) {
  if (!figure || typeof figure !== "object" || Array.isArray(figure)) return null;
  const src = typeof figure.src === "string" && isHttpImageUrl(figure.src.trim()) ? figure.src.trim() : null;
  return {
    src,
    alt: typeof figure.alt === "string" && figure.alt.trim() ? figure.alt.trim() : null,
    width: Number.isFinite(figure.width) ? figure.width : null,
    height: Number.isFinite(figure.height) ? figure.height : null,
    capturedImage: Boolean(getFigureImageUrl(figure)),
  };
}

function prepareQuestionForTutor(question) {
  const figures = Array.isArray(question.figures) ? question.figures : [];
  const cleanedFigures = figures.map(cleanFigureForPrompt).filter(Boolean);
  const images = figures
    .map((figure, index) => {
      const imageUrl = getFigureImageUrl(figure);
      if (!imageUrl) return null;
      return {
        imageUrl,
        detail: "high",
        source: isImageDataUrl(imageUrl) ? "data_url" : "url",
        index,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGES_PER_REQUEST);

  return {
    question: {
      ...question,
      figures: cleanedFigures,
      hasFigure: Boolean(question.hasFigure || cleanedFigures.length),
    },
    images,
  };
}

function cleanConversationMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const role = message.role;
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!["student", "assistant"].includes(role) || !content) return null;
  return { role, content };
}

function getRequestConversation(body, { allowAssistantTail = false } = {}) {
  if (!Array.isArray(body?.conversation)) {
    throw requestError(400, "INVALID_REQUEST", "Request body must include a conversation array.");
  }
  const conversation = body.conversation.map(cleanConversationMessage).filter(Boolean);
  if (conversation.length && conversation.at(-1).role !== "student" && !allowAssistantTail) {
    throw requestError(400, "INVALID_REQUEST", "A follow-up conversation must end with a student message.");
  }
  return conversation;
}

function getRequestReviewChange(body) {
  if (body?.reviewChange == null) return null;
  const value = body.reviewChange;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw requestError(400, "INVALID_REQUEST", "reviewChange must be an object.");
  }

  const allowedFields = new Set(["whereWrong", "myRule", "tag"]);
  const changedFields = Array.isArray(value.changedFields)
    ? [...new Set(value.changedFields.filter((field) => allowedFields.has(field)))]
    : [];
  if (!changedFields.length) {
    throw requestError(400, "INVALID_REQUEST", "reviewChange must name at least one changed field.");
  }

  const before = {};
  const after = {};
  for (const field of changedFields) {
    for (const [source, target] of [[value.before, before], [value.after, after]]) {
      const text = typeof source?.[field] === "string" ? source[field].trim() : "";
      if (!text || text.length > 4000) {
        throw requestError(400, "INVALID_REQUEST", `reviewChange ${field} is missing or too long.`);
      }
      target[field] = text;
    }
  }

  return { changedFields, before, after };
}

function summarizeImages(images) {
  return images.map((image) => ({ source: image.source, index: image.index, detail: image.detail }));
}

function buildLogRecord({
  requestId,
  startedAt,
  durationMs,
  reviewId,
  reviewStage,
  question,
  conversation,
  method,
  images,
  reply,
  error,
}) {
  return {
    requestId,
    timestamp: startedAt,
    durationMs,
    reviewId: reviewId || null,
    reviewStage: reviewStage || "initial",
    question: question || null,
    conversation: conversation || [],
    method: method || null,
    images: summarizeImages(images || []),
    reply: reply || null,
    error: error
      ? {
          code: error.code || "TEACH_FAILED",
          message: error.message || "Unable to generate a tutor reply.",
          statusCode: error.statusCode || error.status || 500,
        }
      : null,
  };
}

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/review-config", (req, res) => res.json(REVIEW_CONFIG));
app.get("/auth/confirmed", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "auth-confirmed.html")));
app.get("/auth/reset", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "auth-reset.html")));

app.post(
  "/auth/signup",
  asyncRoute(async (req, res) => res.status(201).json(await authService.signUp(req.body || {})))
);
app.post(
  "/auth/login",
  asyncRoute(async (req, res) => res.json({ session: await authService.signIn(req.body || {}) }))
);
app.post(
  "/auth/refresh",
  asyncRoute(async (req, res) => res.json({ session: await authService.refreshSession(req.body || {}) }))
);
app.post(
  "/auth/logout",
  asyncRoute(async (req, res) => {
    await authService.signOut({
      accessToken: getBearerToken(req),
      refreshToken: req.body?.refreshToken,
    });
    res.status(204).end();
  })
);
app.post(
  "/auth/password-reset",
  asyncRoute(async (req, res) => {
    await authService.requestPasswordReset(req.body || {});
    res.json({ ok: true });
  })
);
app.post(
  "/auth/update-password",
  asyncRoute(async (req, res) => {
    await authService.updatePassword(req.body || {});
    res.json({ ok: true });
  })
);

app.post(
  "/reviews",
  requireAuthenticatedUser,
  asyncRoute(async (req, res) => {
    const review = await createReview(req.auth.supabase, req.auth.user.id, req.body);
    res.status(201).json({ review });
  })
);
app.get(
  "/reviews/due",
  requireAuthenticatedUser,
  asyncRoute(async (req, res) => res.json(await getDueReviews(req.auth.supabase, req.query.today)))
);
app.get(
  "/reviews/:id",
  requireAuthenticatedUser,
  asyncRoute(async (req, res) => {
    const row = await getOwnedReview(req.auth.supabase, req.params.id);
    res.json({ review: serializeReview(row) });
  })
);
app.patch(
  "/reviews/:id",
  requireAuthenticatedUser,
  asyncRoute(async (req, res) => {
    const review = await updateReview(req.auth.supabase, req.params.id, req.body);
    res.json({ review });
  })
);
app.post(
  "/reviews/:id/redos/:stage/complete",
  requireAuthenticatedUser,
  asyncRoute(async (req, res) => {
    res.json(await completeRedo(req.auth.supabase, req.params.id, req.params.stage, req.body));
  })
);

app.post("/teach", requireAuthenticatedUser, async (req, res) => {
  const requestId = randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const reviewId = typeof req.body?.reviewId === "string" ? req.body.reviewId : null;
  const reviewStage = [3, 14].includes(Number(req.body?.reviewStage))
    ? `redo_${Number(req.body.reviewStage)}`
    : "initial";
  let questionForLog = null;
  let conversationForLog = [];
  let methodForLog = null;
  let imagesForLog = [];

  try {
    if (!reviewId) throw requestError(400, "INVALID_REQUEST", "reviewId is required.");
    const reviewRow = await getOwnedReview(req.auth.supabase, reviewId);
    const studentReview = serializeReview(reviewRow);
    const question = getRequestQuestion(req.body);
    if (getQuestionKey(question) !== reviewRow.question_key) {
      throw requestError(409, "QUESTION_MISMATCH", "Open the question saved with this review before tutoring.");
    }

    const preparedQuestion = prepareQuestionForTutor(question);
    questionForLog = preparedQuestion.question;
    imagesForLog = preparedQuestion.images;
    const reviewChange = getRequestReviewChange(req.body);
    const conversation = getRequestConversation(req.body, {
      allowAssistantTail: Boolean(reviewChange),
    });
    conversationForLog = conversation;

    const teachingMethod = await lookupTeachingMethod(preparedQuestion.question);
    methodForLog = { key: teachingMethod.key, title: teachingMethod.title };
    const prompt = await buildTutorPrompt({
      question: preparedQuestion.question,
      conversation,
      teachingMethod: teachingMethod.content,
      method: teachingMethod,
      studentReview,
      reviewStage,
      reviewChange,
    });
    const reply = await getTutorReply({ prompt, images: preparedQuestion.images });

    await appendExchangeLog(
      buildLogRecord({
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        reviewId,
        reviewStage,
        question: questionForLog,
        conversation: conversationForLog,
        method: methodForLog,
        images: imagesForLog,
        reply,
      })
    );

    res.json({ reply, method: methodForLog });
  } catch (error) {
    await appendExchangeLog(
      buildLogRecord({
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        reviewId,
        reviewStage,
        question: questionForLog,
        conversation: conversationForLog,
        method: methodForLog,
        images: imagesForLog,
        error,
      })
    );
    res.status(error.statusCode || error.status || 500).json({
      error: { code: error.code || "TEACH_FAILED", message: error.message || "Unable to generate a tutor reply." },
    });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const statusCode = error.statusCode || error.status || 500;
  res.status(statusCode).json({
    error: {
      code: error.code || "REQUEST_FAILED",
      message: error.message || "Something went wrong.",
    },
  });
});

if (require.main === module) {
  ensureExchangeLogDir().catch((error) => console.error("Failed to create exchange log directory:", error));
  app.listen(port, () => console.log("AI SAT Tutor server listening on http://localhost:" + port));
}

module.exports = {
  app,
  prepareQuestionForTutor,
  getRequestConversation,
  getRequestReviewChange,
};
