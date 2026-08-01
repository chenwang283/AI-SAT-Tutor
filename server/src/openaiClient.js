const OpenAI = require("openai");

const DEFAULT_IMAGE_DETAIL = process.env.OPENAI_IMAGE_DETAIL || "high";

function apiError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 502;
  return error;
}

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  error.statusCode = 500;
  return error;
}

function extractText(response) {
  if (typeof response.output_text === "string") return response.output_text.trim();
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractRefusal(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .find((part) => part.type === "refusal" && typeof part.refusal === "string")
    ?.refusal;
}

function buildImagePart(image) {
  if (!image || typeof image.imageUrl !== "string" || !image.imageUrl.trim()) return null;
  return {
    type: "input_image",
    image_url: image.imageUrl.trim(),
    detail: image.detail || DEFAULT_IMAGE_DETAIL,
  };
}

function buildResponseInput(input, images = []) {
  const imageParts = images.map(buildImagePart).filter(Boolean);
  if (!imageParts.length) return input;
  return [
    {
      role: "user",
      content: [{ type: "input_text", text: input }, ...imageParts],
    },
  ];
}

function parseStructuredResponse(response) {
  if (response?.status === "incomplete") {
    throw apiError(
      "AI_INCOMPLETE_RESPONSE",
      `OpenAI stopped before completing the response (${response.incomplete_details?.reason || "unknown reason"}).`,
    );
  }
  const refusal = extractRefusal(response);
  if (refusal) throw apiError("AI_REFUSAL", refusal);
  const text = extractText(response);
  if (!text) throw apiError("AI_EMPTY_RESPONSE", "OpenAI returned an empty response.");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw apiError("AI_INVALID_RESPONSE", "OpenAI returned invalid structured data.");
  }
}

async function getStructuredResponse({
  instructions,
  input,
  format,
  images = [],
  maxOutputTokens = 500,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw configError("OPENAI_API_KEY is not set.");
  if (!model) throw configError("OPENAI_MODEL is not set.");

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    instructions,
    input: buildResponseInput(input, images),
    text: { format },
    temperature: 0,
    max_output_tokens: maxOutputTokens,
    store: false,
  });
  return parseStructuredResponse(response);
}

module.exports = {
  buildResponseInput,
  extractRefusal,
  extractText,
  getStructuredResponse,
  parseStructuredResponse,
};
