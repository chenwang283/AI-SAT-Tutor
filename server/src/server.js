const express = require("express");
const dotenv = require("dotenv");
const { getTutorReply } = require("./openaiClient");
const { lookupTeachingMethod } = require("./methodLookup");
const { buildTutorPrompt } = require("./promptBuilder");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "1mb" }));

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

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/teach", async (req, res) => {
  try {
    const question = getRequestQuestion(req.body);
    const conversation = getRequestConversation(req.body);
    const teachingMethod = await lookupTeachingMethod(question);

    const prompt = await buildTutorPrompt({
      question,
      conversation,
      teachingMethod: teachingMethod.content,
      method: teachingMethod,
    });

    const reply = await getTutorReply(prompt);
    res.json({
      reply,
      method: {
        key: teachingMethod.key,
        title: teachingMethod.title,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json({
      error: {
        code: error.code || "TEACH_FAILED",
        message: error.message || "Unable to generate a tutor reply.",
      },
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log("AI SAT Tutor server listening on http://localhost:" + port);
  });
}

module.exports = { app };
