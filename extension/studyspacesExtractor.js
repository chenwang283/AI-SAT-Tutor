(function () {
  function normalizeMathUnicode(s) {
    return s.replace(/[\u{1D434}-\u{1D467}]/gu, (ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1d434 && cp <= 0x1d44d) return String.fromCharCode(65 + (cp - 0x1d434));
      if (cp >= 0x1d44e && cp <= 0x1d467) return String.fromCharCode(97 + (cp - 0x1d44e));
      return ch;
    });
  }

  function mathAwareText(root, { normalizeUnicode = true } = {}) {
    if (!root) return null;
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".Tiptap-mathematics-editor").forEach((node) => node.remove());
    clone.querySelectorAll(".Tiptap-mathematics-render").forEach((span) => {
      let tex = span.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || "";
      if (normalizeUnicode) tex = normalizeMathUnicode(tex);
      span.replaceWith(document.createTextNode(tex ? `\\(${tex}\\)` : ""));
    });
    return clone.textContent.replace(/\s+/g, " ").trim() || null;
  }

  function readMathField(el) {
    if (!el) return null;
    if (typeof el.value === "string" && el.value.length) return el.value;
    return el.textContent?.trim() || null;
  }

  function getQuestionId() {
    const question = document.querySelector('[id^="question_text"]');
    if (question) {
      const match = question.id.match(/^question_text_(.+)$/);
      if (match) return match[1];
    }

    const gridIn = document.querySelector('[id^="gridin_correct_"], [id^="gridin_student_"]');
    if (gridIn) return gridIn.id.replace(/^gridin_(correct|student)_/, "");
    return null;
  }

  const TAG_LEVEL_BY_COLOR = {
    blue: "section",
    green: "domain",
    purple: "subskill",
    indigo: "topic",
    rose: "difficulty",
  };

  function extractTags() {
    const header = [...document.querySelectorAll("h3")].find((h) => h.textContent.trim() === "Tags");
    if (!header) return null;

    const card = header.closest("div")?.parentElement;
    const section = card?.querySelector("section");
    if (!section) return null;

    const tags = [...section.querySelectorAll("div[title]")].map((tag) => {
      const color = (tag.className.match(/bg-(\w+)-100/) || [])[1];
      return {
        label: tag.getAttribute("title") || tag.textContent.trim(),
        level: TAG_LEVEL_BY_COLOR[color] || "unknown",
      };
    });

    return tags.length ? tags : null;
  }

  function extractMCQ() {
    const optionEls = [...document.querySelectorAll('[id^="options_"]')];
    if (!optionEls.length) return null;

    const options = optionEls.map((contentEl, index) => {
      const row = contentEl.closest("section.items-center");
      const selected = !!row?.querySelector(".rounded-full.bg-primary");
      const marker = row?.querySelector("svg.lucide-check")
        ? "correct"
        : row?.querySelector("svg.lucide-x")
          ? "incorrect"
          : null;

      return {
        letter: String.fromCharCode(65 + index),
        optionId: contentEl.id.replace(/^options_/, ""),
        value: mathAwareText(contentEl),
        selected,
        reviewMarker: marker,
      };
    });

    return {
      options,
      selectedLetter: options.find((option) => option.selected)?.letter || null,
      correctLetter: options.find((option) => option.reviewMarker === "correct")?.letter || null,
    };
  }

  function extractFreeResponse() {
    const input = document.querySelector('input[aria-label="Your answer"]');
    const studentField = document.querySelector('[id^="gridin_student_"] math-field');
    const correctField = document.querySelector('[id^="gridin_correct_"] math-field');
    if (!input && !studentField && !correctField) return null;

    const yourAnswerHeader = [...document.querySelectorAll("h2")].find((h) =>
      h.textContent.includes("Your Answer")
    );
    let isCorrect = null;
    if (yourAnswerHeader?.querySelector(".text-red-500")) isCorrect = false;
    else if (yourAnswerHeader?.querySelector(".text-green-500")) isCorrect = true;

    return {
      studentAnswer: input ? input.value : readMathField(studentField),
      correctAnswer: readMathField(correctField),
      isCorrect,
    };
  }

  function detectPhase() {
    if (document.querySelector("#explanation")) return "REVIEWED";
    const answered =
      document.querySelector('[id^="options_"] ~ * .rounded-full.bg-primary') ||
      document.querySelector(".rounded-full.bg-primary") ||
      document.querySelector('input[aria-label="Your answer"]')?.value;
    return answered ? "ATTEMPTED" : "EMPTY";
  }

  function extractQuestion() {
    const stemEl = document.querySelector('[id^="question_text"]');
    const figures = stemEl ? [...stemEl.querySelectorAll("img")].map((img) => ({ src: img.src })) : [];
    const mcq = extractMCQ();
    const freeResponse = mcq ? null : extractFreeResponse();
    const submitButton = document.querySelector('button[type="submit"] span');

    return {
      questionId: getQuestionId(),
      phase: detectPhase(),
      questionType: mcq ? "multiple_choice" : "free_response",
      stem: mathAwareText(stemEl),
      figures,
      hasFigure: figures.length > 0,
      options: mcq?.options || null,
      selectedLetter: mcq?.selectedLetter || null,
      correctLetter: mcq?.correctLetter || null,
      freeResponse,
      tags: extractTags(),
      explanation: mathAwareText(document.querySelector("#explanation")),
      submitButtonLabel: submitButton ? submitButton.textContent.trim() : null,
    };
  }

  globalThis.aiSatTutorExtractQuestion = extractQuestion;
})();
