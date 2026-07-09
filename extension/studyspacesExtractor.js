(function () {
  const MAX_FIGURE_CAPTURE_DIMENSION = 1600;

  function normalizeMathUnicode(s) {
    return s.replace(/[\u{1D434}-\u{1D467}]/gu, (ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1d434 && cp <= 0x1d44d) return String.fromCharCode(65 + (cp - 0x1d434));
      if (cp >= 0x1d44e && cp <= 0x1d467) return String.fromCharCode(97 + (cp - 0x1d44e));
      return ch;
    });
  }

  function imageToDataUrl(img) {
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return null;

    try {
      const scale = Math.min(
        1,
        MAX_FIGURE_CAPTURE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight)
      );
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return null;

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.9);
    } catch (error) {
      return null;
    }
  }

  function extractFigure(img) {
    return {
      src: img.currentSrc || img.src || null,
      alt: img.getAttribute("alt") || null,
      width: img.naturalWidth || null,
      height: img.naturalHeight || null,
      dataUrl: imageToDataUrl(img),
    };
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

  function isVisibleControl(el) {
    if (!el) return false;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    const type = el.getAttribute("type")?.toLowerCase();
    if (["button", "submit", "reset", "hidden", "checkbox", "radio"].includes(type)) return false;
    return true;
  }

  function getControlSearchText(el) {
    return [
      el.id,
      el.name,
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-test-id"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isStudentAnswerControl(control) {
    const searchText = getControlSearchText(control);
    return /\b(your\s+answer|answer|response|gridin|grid-in|student)\b/.test(searchText) &&
      !/\b(correct|explanation|search)\b/.test(searchText);
  }

  function readAnswerControl(el) {
    if (!el) return null;
    if (typeof el.value === "string") return el.value.trim() || null;
    return el.getAttribute("aria-valuetext")?.trim() || el.textContent?.trim() || null;
  }

  function getAnswerControls(root = document) {
    const searchRoot = root || document;
    return [
      ...searchRoot.querySelectorAll(
        'input, textarea, [contenteditable="true"], [role="textbox"], [role="spinbutton"], math-field'
      ),
    ].filter(isVisibleControl);
  }

  function findStudentAnswerControl() {
    const controls = getAnswerControls();
    const matchingControl = controls.find(isStudentAnswerControl);
    if (matchingControl) return matchingControl;

    const nonMathControls = controls.filter((control) => !control.matches("math-field"));
    return nonMathControls.length === 1 ? nonMathControls[0] : null;
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

  function findHeading(pattern) {
    return [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].find((heading) =>
      pattern.test(heading.textContent || "")
    );
  }

  function closestAnswerSection(heading) {
    if (!heading) return null;

    const directBlock = heading.parentElement;
    if (
      directBlock?.querySelector(
        'main, .editor-content, math-field, input, textarea, [contenteditable], [role="textbox"], [role="spinbutton"]'
      )
    ) {
      return directBlock;
    }

    return heading.closest("article") || directBlock || null;
  }

  function findControlInSection(section) {
    if (!section) return null;
    return getAnswerControls(section).find((control) => !/\bbutton\b/.test(getControlSearchText(control))) || null;
  }

  function readTextFromAnswerSection(section, heading) {
    if (!section) return null;

    const mathFieldValues = [...section.querySelectorAll("math-field")].map(readMathField);
    const clone = section.cloneNode(true);
    clone.querySelectorAll("button, svg, .sr-only").forEach((node) => node.remove());
    clone.querySelectorAll("math-field").forEach((node, index) => {
      const value = mathFieldValues[index];
      if (value) node.replaceWith(document.createTextNode(`\\(${value}\\)`));
    });

    const headingText = heading?.textContent?.trim();
    if (headingText) {
      [...clone.querySelectorAll("h1, h2, h3, h4, h5, h6")].forEach((node) => {
        if (node.textContent?.trim() === headingText) node.remove();
      });
    }

    return mathAwareText(clone);
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
    const answerControls = getAnswerControls();
    const input = document.querySelector('input[aria-label="Your answer"]') || findStudentAnswerControl();
    const studentField =
      document.querySelector('[id^="gridin_student_"] math-field') ||
      answerControls.find((control) => control.matches("math-field") && isStudentAnswerControl(control));
    const correctField =
      document.querySelector('[id^="gridin_correct_"] math-field') ||
      answerControls.find((control) =>
        control.matches("math-field") && /\b(correct|correct\s+answer|correct\s+response)\b/.test(getControlSearchText(control))
      );

    const yourAnswerHeader = findHeading(/Your Answer/i);
    const correctAnswerHeader = findHeading(/Correct Answer|Correct Response/i);
    const studentSection = closestAnswerSection(yourAnswerHeader);
    const correctSection = closestAnswerSection(correctAnswerHeader);
    const sectionStudentControl = findControlInSection(studentSection);
    const sectionCorrectControl = findControlInSection(correctSection);

    if (
      !input &&
      !studentField &&
      !correctField &&
      !sectionStudentControl &&
      !sectionCorrectControl &&
      !studentSection &&
      !correctSection
    ) {
      return null;
    }

    let isCorrect = null;
    if (yourAnswerHeader?.querySelector(".text-red-500")) isCorrect = false;
    else if (yourAnswerHeader?.querySelector(".text-green-500")) isCorrect = true;

    return {
      studentAnswer:
        readAnswerControl(input) ||
        readTextFromAnswerSection(studentSection, yourAnswerHeader) ||
        readMathField(studentField) ||
        readAnswerControl(sectionStudentControl),
      correctAnswer:
        readTextFromAnswerSection(correctSection, correctAnswerHeader) ||
        readMathField(correctField) ||
        readAnswerControl(sectionCorrectControl),
      isCorrect,
    };
  }

  function detectPhase() {
    if (document.querySelector("#explanation")) return "REVIEWED";
    const answered =
      document.querySelector('[id^="options_"] ~ * .rounded-full.bg-primary') ||
      document.querySelector(".rounded-full.bg-primary") ||
      readAnswerControl(findStudentAnswerControl());
    return answered ? "ATTEMPTED" : "EMPTY";
  }

  function extractQuestion() {
    const stemEl = document.querySelector('[id^="question_text"]');
    const figures = stemEl ? [...stemEl.querySelectorAll("img")].map(extractFigure) : [];
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
