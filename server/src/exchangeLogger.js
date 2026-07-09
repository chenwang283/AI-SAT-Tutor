const fs = require("node:fs/promises");
const path = require("node:path");

const LOG_DIR = path.resolve(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "exchanges.jsonl");

async function ensureExchangeLogDir() {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function appendExchangeLog(record) {
  try {
    await ensureExchangeLogDir();
    await fs.appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (error) {
    console.error("Failed to write exchange log:", error);
  }
}

module.exports = { appendExchangeLog, ensureExchangeLogDir, LOG_DIR, LOG_FILE };
