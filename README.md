# AI SAT Tutor

The Chrome side panel now uses a student-led mistake-review workflow:

1. The student signs in with a verified email account.
2. The extension reads a reviewed StudySpaces question.
3. Date, source, question number, section, and difficulty are detected and shown in an editable card.
4. A deterministic chat stepper asks where the student went wrong, their prevention rule, whether the question was timed, and one section-compatible mistake tag.
5. The completed review is saved to Supabase before tutoring starts.
6. The AI teaches from the student's self-diagnosis and never asks for their prior thought process or creates a replacement diagnosis.
7. +3-day and +14-day redos appear in the side-panel reminder area. Redo results are read from StudySpaces; a wrong redo restarts tutoring from the saved review.

The Week field, same-day scheduled redo, Google Sheet synchronization, native Chrome notifications, and coach dashboard are not part of this build.

## Project layout

```text
extension/                  Manifest V3 side-panel UI and StudySpaces extractor
server/src/                 Express API, Supabase access, review logic, and OpenAI prompt
server/supabase/migrations/ Database schema and row-level security
server/public/              Email confirmation and password-recovery pages
server/methods/             Teaching methods selected from StudySpaces tags
```

## Requirements

- Node.js 22 or newer
- A Supabase project
- An OpenAI API key and model
- Chrome with Developer mode enabled

## Supabase setup

1. Create a Supabase project.
2. Run `server/supabase/migrations/202607250001_question_reviews.sql` in the Supabase SQL editor.
3. In Supabase Auth URL configuration, set:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/confirmed`
   - Redirect URL: `http://localhost:3000/auth/reset`
4. Keep email confirmation enabled. The student signs up in the extension, confirms by email, and then signs in.
5. Copy the project URL and publishable key. Do not place a service-role key in the extension or server configuration for this workflow.

## Server setup

From `server/`:

```powershell
npm install
Copy-Item .env.example .env
```

Set these values in `.env`:

```dotenv
PORT=3000
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.5
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
PUBLIC_APP_URL=http://localhost:3000
```

Start the local API:

```powershell
npm start
```

Health check:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/health
```

The local server must be running when a signup confirmation or password-recovery link opens.

## Extension setup

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select the `extension/` directory.
4. Start the local server.
5. Open a reviewed StudySpaces multiple-choice or free-response question.
6. Open the AI SAT Tutor side panel and sign in.
7. Choose **Review this question** and complete every prompted field.

If Source or Question # cannot be detected from the page, enter it in the editable metadata card. Section and difficulty are prefilled from StudySpaces tags when available.

## Scheduled redos

- Redo 1 is due three calendar days after the logged date.
- Redo 2 is due fourteen calendar days after the logged date, even when Redo 1 was correct.
- Dates use the student's browser-local calendar date and store its IANA timezone.
- If both are overdue, Redo 1 must be completed first.
- The panel shows due items when it is open; it does not create operating-system notifications.

## Verification

Run all server, prompt, state-machine, math-rendering, and extractor checks:

```powershell
cd server
npm run check
```

The SQL migration must also be applied to a Supabase project before authenticated review API calls can succeed.
