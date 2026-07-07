# AI SAT Tutor Codebase

Week 1 proves the first real tutoring loop works:

1. Chrome can load the extension side panel.
2. The panel can read a StudySpaces multiple-choice question.
3. The panel can send the captured question and typed student thinking to /teach.
4. The server can call OpenAI and return the tutor reply.

Reference material lives in ../reference files and should be treated as read-only.

## Project Layout

extension/              Chrome Manifest V3 side-panel chat UI
server/                 Node/Express API for AI calls
studyspaces_extractor.js Existing StudySpaces extractor reference

## Server Setup

From PowerShell:

cd "C:\Users\Chen\Documents\AI SAT Tutor Project\AI tutor codebase\server"
npm install
Copy-Item .env.example .env

Edit .env and set:

OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.5

Then start the server:

npm start

Health check:

Invoke-RestMethod -Method Get -Uri http://localhost:3000/health

AI pipe check with the sample fixture question:

$question = Get-Content -Raw -LiteralPath ".\fixtures\question.json" | ConvertFrom-Json
$body = @{
  question = $question
  studentThinking = "I divided the perimeter by 3 and used 9, but I was not sure what the height meant."
} | ConvertTo-Json -Depth 20
Invoke-RestMethod -Method Post -Uri http://localhost:3000/teach -ContentType "application/json" -Body $body

## Extension Setup

1. Open Chrome.
2. Go to chrome://extensions.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select C:\Users\Chen\Documents\AI SAT Tutor Project\AI tutor codebase\extension.
6. Open a StudySpaces multiple-choice question.
7. Click the extension toolbar icon to open the side panel.
8. Type your thinking and click Explain my mistake.

Keep the local server running while using the extension.
