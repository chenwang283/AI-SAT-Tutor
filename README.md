# AI SAT Tutor Codebase

Sprint 0 proves the basic pipe works:

1. Chrome can load an empty extension with a side panel.
2. A local server can accept a request at /teach.
3. The server can call Anthropic with a hardcoded SAT question and return the tutor reply.

Reference material lives in ../reference files and should be treated as read-only.

## Project Layout

extension/              Chrome Manifest V3 side-panel shell
server/                 Node/Express API for AI calls
studyspaces_extractor.js Existing StudySpaces extractor, saved for Week 1 wiring

## Server Setup

From PowerShell:

cd "C:\Users\Chen\Documents\AI SAT Tutor Project\AI tutor codebase\server"
npm install
Copy-Item .env.example .env

Edit .env and set:

ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

Then start the server:

npm start

Health check:

Invoke-RestMethod -Method Get -Uri http://localhost:3000/health

AI pipe check:

Invoke-RestMethod -Method Post -Uri http://localhost:3000/teach -ContentType "application/json" -Body "{}"

Optional custom student thinking:

Invoke-RestMethod -Method Post -Uri http://localhost:3000/teach -ContentType "application/json" -Body '{"studentThinking":"I divided the perimeter by 3 and used 9, but I was not sure what the height meant."}'

## Extension Setup

1. Open Chrome.
2. Go to chrome://extensions.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select C:\Users\Chen\Documents\AI SAT Tutor Project\AI tutor codebase\extension.
6. Open the extension side panel and confirm the Sprint 0 shell appears.

The side panel is intentionally static in Sprint 0. StudySpaces extraction and panel-to-server messaging are Week 1 work.