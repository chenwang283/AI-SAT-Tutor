const assert = require("node:assert/strict");
const {
  buildResponseInput,
  parseStructuredResponse,
} = require("./openaiClient");

assert.deepEqual(
  parseStructuredResponse({
    status: "completed",
    output_text: '{"content":"Next time, check the target before solving."}',
  }),
  { content: "Next time, check the target before solving." },
);
assert.throws(
  () =>
    parseStructuredResponse({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "I cannot do that." }],
        },
      ],
    }),
  /cannot do that/i,
);
assert.throws(
  () =>
    parseStructuredResponse({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    }),
  /stopped before completing/i,
);
const imageInput = buildResponseInput('{"task":"audit"}', [
  { imageUrl: "data:image/png;base64,abc", detail: "high" },
]);
assert.equal(imageInput[0].role, "user");
assert.equal(imageInput[0].content[0].text, '{"task":"audit"}');
assert.equal(imageInput[0].content[1].type, "input_image");

console.log("openai client tests passed");
