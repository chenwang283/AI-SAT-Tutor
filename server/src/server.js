const express = require("express");
const dotenv = require("dotenv");
const { randomUUID } = require("node:crypto");
const { getTutorReply } = require("./openaiClient");
const { lookupTeachingMethod } = require("./methodLookup");
const { buildTutorPrompt } = require("./promptBuilder");
const { appendExchangeLog, ensureExchangeLogDir } = require("./exchangeLogger");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const MAX_IMAGES_PER_REQUEST = 4;

app.use(express.json({ limit: process.env.REQUEST_JSON_LIMIT || "10mb" }));

function requestError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getRequestQuestion(body) {
  const question = body?.question;
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    throw requestError(
      400,
      "INVALID_REQUEST",
      "Request body must include a captured question object."
    );
  }
  if (typeof question.stem !== "string" || !question.stem.trim()) {
    throw requestError(400, "INVALID_REQUEST", "Captured question must include a stem.");
  }
  if (!["multiple_choice", "free_response"].includes(question.questionType)) {
    throw requestError(
      400,
      "UNSUPPORTED_QUESTION_TYPE",
      "Only multiple-choice and free-response questions are supported."
    );
  }
  if (question.questionType === "free_response" && !question.freeResponse) {
    throw requestError(
      400,
      "INVALID_REQUEST",
      "Captured free-response question is missing answer data."
    );
  }
  return question;
}

function isImageDataUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value);
}

function isHttpImageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function getFigureImageUrl(figure) {
  const dataUrl = typeof figure?.dataUrl === "string" ? figure.dataUrl.trim() : "";
  if (dataUrl && isImageDataUrl(dataUrl)) return dataUrl;

  const src = typeof figure?.src === "string" ? figure.src.trim() : "";
  if (src && isImageDataUrl(src)) return src;
  if (src && isHttpImageUrl(src)) return src;

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
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }

  const role = message.role;
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!["student", "assistant"].includes(role) || !content) {
    return null;
  }

  return { role, content };
}

function getRequestConversation(body) {
  if (Array.isArray(body?.conversation)) {
    const conversation = body.conversation.map(cleanConversationMessage).filter(Boolean);

    if (conversation.length && conversation.at(-1).role === "student") {
      return conversation;
    }
  }

  if (typeof body?.studentThinking === "string" && body.studentThinking.trim()) {
    return [{ role: "student", content: body.studentThinking.trim() }];
  }

  throw requestError(
    400,
    "INVALID_REQUEST",
    "Request body must include a conversation ending with a student message."
  );
}

function summarizeImages(images) {
  return images.map((image) => ({
    source: image.source,
    index: image.index,
    detail: image.detail,
  }));
}

function buildLogRecord({
  requestId,
  startedAt,
  durationMs,
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

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/teach", async (req, res) => {
  const requestId = randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let questionForLog = null;
  let conversationForLog = [];
  let methodForLog = null;
  let imagesForLog = [];

  try {
    const question = getRequestQuestion(req.body);
    const preparedQuestion = prepareQuestionForTutor(question);
    questionForLog = preparedQuestion.question;
    imagesForLog = preparedQuestion.images;

    const conversation = getRequestConversation(req.body);
    conversationForLog = conversation;

    const teachingMethod = await lookupTeachingMethod(preparedQuestion.question);
    methodForLog = {
      key: teachingMethod.key,
      title: teachingMethod.title,
    };

    const prompt = await buildTutorPrompt({
      question: preparedQuestion.question,
      conversation,
      teachingMethod: teachingMethod.content,
      method: teachingMethod,
    });

    const reply = await getTutorReply({ prompt, images: preparedQuestion.images });
    const responseBody = {
      reply,
      method: {
        key: teachingMethod.key,
        title: teachingMethod.title,
      },
    };

    await appendExchangeLog(
      buildLogRecord({
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        question: questionForLog,
        conversation: conversationForLog,
        method: methodForLog,
        images: imagesForLog,
        reply,
      })
    );

    res.json(responseBody);
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    await appendExchangeLog(
      buildLogRecord({
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        question: questionForLog,
        conversation: conversationForLog,
        method: methodForLog,
        images: imagesForLog,
        error,
      })
    );

    res.status(statusCode).json({
      error: {
        code: error.code || "TEACH_FAILED",
        message: error.message || "Unable to generate a tutor reply.",
      },
    });
  }
});

if (require.main === module) {
  ensureExchangeLogDir().catch((error) => {
    console.error("Failed to create exchange log directory:", error);
  });

  app.listen(port, () => {
    console.log("AI SAT Tutor server listening on http://localhost:" + port);
  });
}

module.exports = { app };
