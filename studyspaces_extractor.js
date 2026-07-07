// StudySpaces question extractor (content-script side) — v2
//
// Reads the LIVE DOM (not a saved HTML string). Several fields below ONLY
// exist on the live element, not in serialized outerHTML — see math-field.
//
// Confirmed against real StudySpaces DOM:
//  - React SPA, light DOM (no shadow DOM on the question card).
//  - TipTap editor + KaTeX math; LaTeX lives in <annotation encoding="application/x-tex">.
//  - Figures are base64-PNG <img> -> vision model.
//  - MCQ options: <div id="options_<ULID>">. Selected = container has border-primary
//    / letter circle has bg-primary. Correct (review) = preceded by svg.lucide-check.
//  - Free response (solve): <input aria-label="Your answer">.
//  - Free response (review): <math-field> web components -> read .value LIVE (empty in HTML!).
//  - Tags: <div title="..."> color-coded by level. Explanation: <div id="explanation">.
//  - Unique question id: the UUID suffix on question_text_<UUID> / gridin_*_<UUID>.

// ---------- math text ----------

// KaTeX renders each equation ~3x and TipTap adds a hidden $$..$$ copy, so a
// naive textContent duplicates every token. Strip duplicates, substitute LaTeX.
function mathAwareText(root, { normalizeUnicode = true } = {}) {
  if (!root) return null;
  const clone = root.cloneNode(true);
  clone.querySelectorAll('.Tiptap-mathematics-editor').forEach((n) => n.remove()); // hidden $$..$$
  clone.querySelectorAll('.Tiptap-mathematics-render').forEach((span) => {
    let tex = span.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? '';
    if (normalizeUnicode) tex = normalizeMathUnicode(tex);
    span.replaceWith(document.createTextNode(tex ? `\\(${tex}\\)` : ''));
  });
  return clone.textContent.replace(/\s+/g, ' ').trim() || null;
}

// Best-effort: map Mathematical Italic letters (𝑑, 𝑣, 𝑎, A–Z) back to ASCII.
function normalizeMathUnicode(s) {
  return s.replace(/[\u{1D434}-\u{1D467}]/gu, (ch) => {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1d434 && cp <= 0x1d44d) return String.fromCharCode(65 + (cp - 0x1d434)); // A-Z
    if (cp >= 0x1d44e && cp <= 0x1d467) return String.fromCharCode(97 + (cp - 0x1d44e)); // a-z
    return ch;
  });
}

// MathLive <math-field>: value is on the element, NOT in textContent/outerHTML.
function readMathField(el) {
  if (!el) return null;
  if (typeof el.value === 'string' && el.value.length) return el.value; // LaTeX, live only
  const txt = el.textContent?.trim();
  return txt || null; // fallback (will be empty for an un-hydrated math-field)
}

// ---------- identity ----------

function getQuestionId() {
  const q = document.querySelector('[id^="question_text"]');
  if (q) {
    const m = q.id.match(/^question_text_(.+)$/);
    if (m) return m[1];
  }
  const g = document.querySelector('[id^="gridin_correct_"], [id^="gridin_student_"]');
  if (g) return g.id.replace(/^gridin_(correct|student)_/, '');
  return null; // NOTE: may be null during solve phase — confirm where the UUID lives then.
}

// ---------- tags ----------

const TAG_LEVEL_BY_COLOR = {
  blue: 'section', green: 'domain', purple: 'subskill', indigo: 'topic', rose: 'difficulty',
};

function extractTags() {
  const header = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Tags');
  if (!header) return null;
  // The <h3>Tags</h3> sits in a small bg-accent box; the tag list is a <section>
  // that is a SIBLING of that box (both inside the card), not a child of it.
  const card = header.closest('div')?.parentElement;
  const section = card?.querySelector('section');
  if (!section) return null;
  const tags = [...section.querySelectorAll('div[title]')].map((d) => {
    const color = (d.className.match(/bg-(\w+)-100/) || [])[1];
    return { label: d.getAttribute('title') || d.textContent.trim(), level: TAG_LEVEL_BY_COLOR[color] || 'unknown' };
  });
  return tags.length ? tags : null;
}

// ---------- multiple choice ----------

function extractMCQ() {
  const optionEls = [...document.querySelectorAll('[id^="options_"]')];
  if (!optionEls.length) return null;

  const options = optionEls.map((contentEl, i) => {
    const row = contentEl.closest('section.items-center'); // the option row <section>
    const selected = !!row?.querySelector('.rounded-full.bg-primary'); // left circle highlighted
    // Review marker sits in the row's leading <div> (sibling-before the option container):
    const marker = row?.querySelector('svg.lucide-check') ? 'correct'
      : row?.querySelector('svg.lucide-x') ? 'incorrect' // INFERRED — confirm with a wrong-answer sample
      : null;
    return {
      letter: String.fromCharCode(65 + i),
      optionId: contentEl.id.replace(/^options_/, ''),
      value: mathAwareText(contentEl),
      selected,
      reviewMarker: marker, // 'correct' | 'incorrect' | null
    };
  });

  return {
    options,
    selectedLetter: options.find((o) => o.selected)?.letter ?? null,
    correctLetter: options.find((o) => o.reviewMarker === 'correct')?.letter ?? null,
  };
}

// ---------- free response ----------

function extractFreeResponse() {
  // Solve phase: a plain decimal input.
  const input = document.querySelector('input[aria-label="Your answer"]');
  // Review phase: MathLive fields keyed by question UUID.
  const studentField = document.querySelector('[id^="gridin_student_"] math-field');
  const correctField = document.querySelector('[id^="gridin_correct_"] math-field');
  if (!input && !studentField && !correctField) return null;

  // Correctness from the "Your Answer (Incorrect)" / "(Correct)" header.
  const yourAnsHeader = [...document.querySelectorAll('h2')]
    .find((h) => h.textContent.includes('Your Answer'));
  let isCorrect = null;
  if (yourAnsHeader) {
    if (yourAnsHeader.querySelector('.text-red-500')) isCorrect = false;
    else if (yourAnsHeader.querySelector('.text-green-500')) isCorrect = true;
  }

  return {
    studentAnswer: input ? input.value : readMathField(studentField), // input(solve) or math-field(review)
    correctAnswer: readMathField(correctField),                       // review only
    isCorrect,
  };
}

// ---------- phase + figures + orchestration ----------

function detectPhase() {
  if (document.querySelector('#explanation')) return 'REVIEWED';
  const answered = document.querySelector('[id^="options_"] ~ * .rounded-full.bg-primary')
    || document.querySelector('.rounded-full.bg-primary')
    || (document.querySelector('input[aria-label="Your answer"]')?.value);
  return answered ? 'ATTEMPTED' : 'EMPTY';
}

function extractQuestion() {
  const stemEl = document.querySelector('[id^="question_text"]');
  const figures = stemEl
    ? [...stemEl.querySelectorAll('img')].map((img) => ({ src: img.src }))
    : [];
  const mcq = extractMCQ();
  const fr = mcq ? null : extractFreeResponse();
  const submitBtn = document.querySelector('button[type="submit"] span');

  return {
    questionId: getQuestionId(),
    phase: detectPhase(),
    questionType: mcq ? 'multiple_choice' : 'free_response',
    stem: mathAwareText(stemEl),
    figures,
    hasFigure: figures.length > 0,
    // MCQ
    options: mcq?.options ?? null,
    selectedLetter: mcq?.selectedLetter ?? null,
    correctLetter: mcq?.correctLetter ?? null,
    // free response
    freeResponse: fr,
    // truth (review)
    tags: extractTags(),
    explanation: mathAwareText(document.querySelector('#explanation')),
    // button label: "Submit Answer" (solve, disabled until answered) -> "Next Question" (after submit)
    submitButtonLabel: submitBtn ? submitBtn.textContent.trim() : null,
  };
}

/*


REMEMBER:
  - math-field values are live-only; if you test by pasting saved HTML they'll look empty.
  - questionId may be null during solve (bare id="question_text"); confirm the solve-phase id source.
*/

export { mathAwareText, normalizeMathUnicode, readMathField, extractQuestion };
