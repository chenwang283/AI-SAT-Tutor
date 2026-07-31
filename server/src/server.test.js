const assert = require("node:assert/strict");
const { app, getRequestConversation, getRequestReviewChange } = require("./server");

const reviewChange = getRequestReviewChange({
  reviewChange: {
    changedFields: ["myRule"],
    before: { myRule: "Be careful." },
    after: { myRule: "Write the target before solving." },
  },
});
assert.deepEqual(reviewChange.changedFields, ["myRule"]);
assert.throws(
  () => getRequestConversation({ conversation: [{ role: "assistant", content: "Previous reply" }] }),
  /must end with a student message/
);
assert.deepEqual(
  getRequestConversation(
    { conversation: [{ role: "assistant", content: "Previous reply" }] },
    { allowAssistantTail: true }
  ),
  [{ role: "assistant", content: "Previous reply" }]
);

async function run() {
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    const configResponse = await fetch(`${baseUrl}/review-config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.deepEqual(
      config.clockOptions.map(({ value }) => value),
      ["untimed", "timed"]
    );
    assert.deepEqual(
      config.difficultyOptions.map(({ value }) => value),
      ["easy", "medium", "hard"]
    );
    assert.deepEqual(
      config.tagsBySection.math.map(({ value }) => value),
      ["V", "1", "2", "3", "4", "5"]
    );
    assert.deepEqual(
      config.tagsBySection.reading_writing.map(({ value }) => value),
      ["V", "A", "B", "C", "D", "E"]
    );

    console.log("Server public route tests passed.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
