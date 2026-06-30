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

async function readJsonFixture(fileName) {
  return JSON.parse(await readTextFixture(fileName));
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/teach", async (req, res) => {
  try {
    const [question, defaultStudentThinking, teachingMethod] = await Promise.all([
      readJsonFixture("question.json"),
      readTextFixture("student-thinking.txt"),
      readTextFixture("teaching-method.txt"),
    ]);

    const providedThinking = typeof req.body?.studentThinking === "string"
      ? req.body.studentThinking.trim()
      : "";

    const prompt = await buildTutorPrompt({
      question,
      teachingMethod,
      studentThinking: providedThinking || defaultStudentThinking,
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