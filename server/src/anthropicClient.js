const Anthropic = require("@anthropic-ai/sdk");

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  error.statusCode = 500;
  return error;
}

function extractText(message) {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function getTutorReply(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) {
    throw configError("ANTHROPIC_API_KEY is not set.");
  }

  if (!model) {
    throw configError("ANTHROPIC_MODEL is not set.");
  }

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const reply = extractText(message);
  if (!reply) {
    const error = new Error("Anthropic returned an empty response.");
    error.code = "AI_EMPTY_RESPONSE";
    error.statusCode = 502;
    throw error;
  }

  return reply;
}

module.exports = { getTutorReply };