const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const dotenv = require("dotenv");
const { getTutorReply } = require("./openaiClient");
const { buildTutorPrompt } = require("./promptBuilder");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const fixturesDir = path.resolve(__dirname, "..", "fixtures");

app.use(express.json({ limit: "1mb" }));

async function readTextFixture(fileName) {
  return fs.readFile(path.join(fixturesDir, fileName), "utf8");
}

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
  return question;
}

function getRequestStudentThinking(body) {
  if (typeof body?.studentThinking !== "string") {
    throw requestError(
      400,
      "INVALID_REQUEST",
      "Request body must include studentThinking as a string."
    );
  }
  return body.studentThinking.trim();
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/teach", async (req, res) => {
  try {
    const question = getRequestQuestion(req.body);
    const studentThinking = getRequestStudentThinking(req.body);
    const teachingMethod = await readTextFixture("teaching-method.txt");

    const prompt = await buildTutorPrompt({
      question,
      teachingMethod,
      studentThinking,
    });

    const reply = await getTutorReply(prompt);
    res.json({ reply });
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
