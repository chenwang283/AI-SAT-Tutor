const fs = require("node:fs/promises");
const path = require("node:path");

const METHODS_DIR = path.resolve(__dirname, "..", "methods");
const SPECIAL_RIGHT_TRIANGLES = {
  key: "special-right-triangles",
  title: "Special Right Triangles",
  fileName: "special-right-triangles.txt",
};

async function lookupTeachingMethod(question) {
  const content = await fs.readFile(
    path.join(METHODS_DIR, SPECIAL_RIGHT_TRIANGLES.fileName),
    "utf8"
  );

  return {
    key: SPECIAL_RIGHT_TRIANGLES.key,
    title: SPECIAL_RIGHT_TRIANGLES.title,
    content,
  };
}

module.exports = { lookupTeachingMethod };
