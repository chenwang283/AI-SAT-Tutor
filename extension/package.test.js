const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.permissions.includes("sidePanel"), true);
assert.equal(manifest.permissions.includes("scripting"), true);
assert.equal(manifest.permissions.includes("storage"), true);

const requiredFiles = [manifest.side_panel?.default_path, manifest.background?.service_worker].filter(Boolean);
for (const file of requiredFiles) {
  assert.equal(fs.existsSync(path.join(extensionRoot, file)), true, `Missing manifest file: ${file}`);
}

const sidePanelHtml = fs.readFileSync(path.join(extensionRoot, manifest.side_panel.default_path), "utf8");
assert.match(sidePanelHtml, /id="review-edit-region"/);
assert.match(sidePanelHtml, /id="review-edit-button"/);
assert.match(sidePanelHtml, /id="review-edit-controls"/);
const assetReferences = [...sidePanelHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
for (const asset of assetReferences) {
  assert.equal(fs.existsSync(path.join(extensionRoot, asset)), true, `Missing side-panel asset: ${asset}`);
}

const sidePanelSource = fs.readFileSync(path.join(extensionRoot, "sidepanel.js"), "utf8");
assert.match(sidePanelSource, /method:\s*"PATCH"/);
assert.match(sidePanelSource, /reviewChange:\s*appState\.pendingReviewChange/);
assert.match(sidePanelSource, /respondToPendingReviewChange/);

console.log("extension package reference tests passed");
