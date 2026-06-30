const OpenAI = require("openai");

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  error.statusCode = 500;
  return error;
}

function extractText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function getTutorReply(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey) {
    throw configError("OPENAI_API_KEY is not set.");
  }

  if (!model) {
    throw configError("OPENAI_MODEL is not set.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    input: prompt,
    temperature: 0.3,
    max_output_tokens: 1200,
  });

  const reply = extractText(response);
  if (!reply) {
    const error = new Error("OpenAI returned an empty response.");
    error.code = "AI_EMPTY_RESPONSE";
    error.statusCode = 502;
    throw error;
  }

  return reply;
}

module.exports = { getTutorReply };