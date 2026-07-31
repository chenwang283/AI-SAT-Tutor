const API_BASE_URL = "http://localhost:3000";
const AUTH_STORAGE_KEY = "aiSatTutorAuth";
const STATE_STORAGE_KEY = "aiSatTutorReviewState";
const SUPPORTED_QUESTION_TYPES = new Set(["multiple_choice", "free_response"]);

const reviewFlow = globalThis.aiSatTutorReviewFlow;
const rendering = globalThis.aiSatTutorRendering;

const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const authMessage = document.querySelector("#auth-message");
const signinTab = document.querySelector("#signin-tab");
const signupTab = document.querySelector("#signup-tab");
const forgotPasswordButton = document.querySelector("#forgot-password");
const accountEmail = document.querySelector("#account-email");
const signoutButton = document.querySelector("#signout-button");
const statusText = document.querySelector("#status");
const resetButton = document.querySelector("#reset-button");
const dueRegion = document.querySelector("#due-region");
const dueSummaryButton = document.querySelector("#due-summary");
const dueSummaryText = document.querySelector("#due-summary-text");
const dueList = document.querySelector("#due-list");
const messages = document.querySelector("#messages");
const reviewEntry = document.querySelector("#review-entry");
const reviewButton = document.querySelector("#review-button");
const reviewControls = document.querySelector("#review-controls");
const reviewEditRegion = document.querySelector("#review-edit-region");
const reviewEditButton = document.querySelector("#review-edit-button");
const reviewEditControls = document.querySelector("#review-edit-controls");
const redoControls = document.querySelector("#redo-controls");
const checkRedoButton = document.querySelector("#check-redo-button");
const tutorForm = document.querySelector("#tutor-form");
const messageInput = document.querySelector("#student-message");
const explainButton = document.querySelector("#explain-button");

let authMode = "signin";
let authSession = null;
let reviewConfig = null;
let dueState = { count: 0, overdueCount: 0, dueTodayCount: 0, items: [] };
let appState = createEmptyState();
let currentLiveQuestion = null;
let isBusy = false;

function createEmptyState() {
  return {
    mode: "idle",
    questionKey: null,
    question: null,
    messages: [],
    tutorContextStartIndex: 0,
    method: null,
    reviewId: null,
    reviewStage: null,
    draft: null,
    savedReview: null,
    editingReview: false,
    pendingReviewChange: null,
    redo: null,
  };
}

function setStatus(message, type = "normal") {
  statusText.textContent = message;
  statusText.classList.toggle("error", type === "error");
}

function setAuthMessage(message, type = "normal") {
  authMessage.textContent = message;
  authMessage.className = ["auth-message", type].filter((value) => value !== "normal").join(" ");
}

function setBusy(busy) {
  isBusy = busy;
  document.querySelectorAll("button, input, textarea, select").forEach((control) => {
    control.disabled = busy;
  });
  if (!busy) {
    signinTab.disabled = false;
    signupTab.disabled = false;
    forgotPasswordButton.disabled = false;
  }
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((message) => {
      const role = message?.role;
      const content = typeof message?.content === "string" ? message.content.trim() : "";
      return ["student", "assistant"].includes(role) && content ? { role, content } : null;
    })
    .filter(Boolean);
}

function stripCapturedFigureData(question) {
  if (!question || typeof question !== "object") return question;
  return {
    ...question,
    figures: Array.isArray(question.figures)
      ? question.figures.map((figure) => ({
          src: typeof figure?.src === "string" && !figure.src.startsWith("data:") ? figure.src : null,
          alt: figure?.alt || null,
          width: figure?.width || null,
          height: figure?.height || null,
          capturedImage: Boolean(figure?.dataUrl || figure?.src || figure?.capturedImage),
        }))
      : [],
  };
}

async function loadAppState() {
  const result = await chrome.storage.session.get(STATE_STORAGE_KEY);
  const stored = result[STATE_STORAGE_KEY];
  if (!stored || typeof stored !== "object") return;
  const storedMessages = cleanMessages(stored.messages);
  const storedContextStartIndex = Number.isInteger(stored.tutorContextStartIndex)
    ? stored.tutorContextStartIndex
    : 0;
  appState = {
    mode: ["idle", "review", "teaching", "redo"].includes(stored.mode) ? stored.mode : "idle",
    questionKey: typeof stored.questionKey === "string" ? stored.questionKey : null,
    question: stored.question && typeof stored.question === "object" ? stripCapturedFigureData(stored.question) : null,
    messages: storedMessages,
    tutorContextStartIndex: Math.max(
      0,
      Math.min(storedContextStartIndex, storedMessages.length),
    ),
    method: stored.method && typeof stored.method === "object" ? stored.method : null,
    reviewId: typeof stored.reviewId === "string" ? stored.reviewId : null,
    reviewStage: [3, 14].includes(Number(stored.reviewStage)) ? Number(stored.reviewStage) : null,
    draft: stored.draft && typeof stored.draft === "object" ? stored.draft : null,
    savedReview: stored.savedReview && typeof stored.savedReview === "object" ? stored.savedReview : null,
    editingReview: Boolean(stored.editingReview),
    pendingReviewChange:
      stored.pendingReviewChange && typeof stored.pendingReviewChange === "object"
        ? stored.pendingReviewChange
        : null,
    redo: stored.redo && typeof stored.redo === "object" ? stored.redo : null,
  };
}

async function saveAppState() {
  await chrome.storage.session.set({ [STATE_STORAGE_KEY]: appState });
}

async function clearAppState() {
  appState = createEmptyState();
  currentLiveQuestion = null;
  await chrome.storage.session.remove(STATE_STORAGE_KEY);
}

async function loadAuthSession() {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  const stored = result[AUTH_STORAGE_KEY];
  if (stored?.accessToken && stored?.refreshToken) authSession = stored;
}

async function saveAuthSession(session) {
  authSession = session;
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: session });
}

async function clearAuthSession() {
  authSession = null;
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || "The server could not complete the request.");
    error.status = response.status;
    error.code = data?.error?.code || "REQUEST_FAILED";
    throw error;
  }
  return data;
}

async function refreshAuthSession() {
  if (!authSession?.refreshToken) throw new Error("Sign in to continue.");
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: authSession.refreshToken }),
  });
  const data = await readJsonResponse(response);
  await saveAuthSession(data.session);
  return data.session;
}

async function apiRequest(path, { method = "GET", body, authenticated = true, retry = true } = {}) {
  if (authenticated && authSession?.expiresAt && authSession.expiresAt * 1000 < Date.now() + 30_000) {
    await refreshAuthSession();
  }
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated) headers.Authorization = `Bearer ${authSession?.accessToken || ""}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error("I could not reach the local server at localhost:3000.");
  }

  if (authenticated && response.status === 401 && retry) {
    await refreshAuthSession();
    return apiRequest(path, { method, body, authenticated, retry: false });
  }
  return readJsonResponse(response);
}

function setAuthMode(mode) {
  authMode = mode;
  signinTab.classList.toggle("active", mode === "signin");
  signupTab.classList.toggle("active", mode === "signup");
  authSubmit.textContent = mode === "signin" ? "Sign in" : "Create account";
  authPassword.autocomplete = mode === "signin" ? "current-password" : "new-password";
  setAuthMessage("");
}

function showAuthView() {
  authView.hidden = false;
  appView.hidden = true;
  setAuthMode("signin");
  authEmail.focus();
}

async function showAppView() {
  authView.hidden = true;
  appView.hidden = false;
  accountEmail.textContent = authSession?.user?.email || "Signed in";
  if (!reviewConfig) reviewConfig = await apiRequest("/review-config", { authenticated: false });
  await loadDueReviews();
  renderApp();
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getQuestionKey(question) {
  if (question?.questionId) return `studyspaces:${question.questionId}`;
  return [question?.questionType, question?.stem].filter(Boolean).join(":");
}

function getQuestionTag(question, level) {
  return Array.isArray(question?.tags)
    ? question.tags.find((tag) => tag?.level === level)?.label || null
    : null;
}

function normalizeDetectedSection(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("math")) return "math";
  if (normalized.includes("reading") || normalized.includes("writing")) return "reading_writing";
  return "";
}

function normalizeDetectedDifficulty(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.startsWith("e")) return "easy";
  if (normalized.startsWith("m")) return "medium";
  if (normalized.startsWith("h")) return "hard";
  return "";
}

function buildDetectedMetadata(question, tab) {
  return {
    dateLogged: localDateString(),
    timezone: localTimezone(),
    source: question.source || question.pageTitle || "",
    questionNumber: question.questionNumber || "",
    section: normalizeDetectedSection(getQuestionTag(question, "section")),
    difficulty: normalizeDetectedDifficulty(getQuestionTag(question, "difficulty")),
    pageUrl: question.pageUrl || tab?.url || null,
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open a StudySpaces question tab first.");
  return tab;
}

function isSupportedQuestionHost(url) {
  if (!url) return true;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "studyspaces.com" ||
      hostname.endsWith(".studyspaces.com") ||
      hostname === "portal.nextstepsatcoaching.com" ||
      hostname.endsWith(".portal.nextstepsatcoaching.com")
    );
  } catch (error) {
    return false;
  }
}

function isPageAccessError(error) {
  return /Cannot access contents of the page|Extension manifest must request permission|Cannot access a chrome:/i.test(
    error?.message || ""
  );
}

function validateExtractedQuestion(question) {
  if (!question?.stem) throw new Error("I could not find a StudySpaces question on the active tab.");
  if (!SUPPORTED_QUESTION_TYPES.has(question.questionType)) throw new Error("This question type is not supported yet.");
  if (question.questionType === "free_response" && !question.freeResponse) {
    throw new Error("I found a free-response question, but not its answer fields.");
  }
}

async function extractQuestionFromActiveTab() {
  const tab = await getActiveTab();
  if (!isSupportedQuestionHost(tab.url)) {
    throw new Error("Open a StudySpaces question tab first. This extension only has access to StudySpaces pages.");
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", files: ["studyspacesExtractor.js"] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        const extractQuestion = globalThis.aiSatTutorExtractQuestion;
        try {
          return extractQuestion?.();
        } finally {
          delete globalThis.aiSatTutorExtractQuestion;
        }
      },
    });
    validateExtractedQuestion(result?.result);
    return { question: result.result, tab };
  } catch (error) {
    if (isPageAccessError(error)) {
      throw new Error("Open a StudySpaces question tab first. This extension only has access to StudySpaces pages.");
    }
    throw error;
  }
}

function ensureReviewedResult(question) {
  if (question.questionType === "multiple_choice" && (!question.selectedLetter || !question.correctLetter)) {
    throw new Error("Reveal your selected answer and the correct answer in StudySpaces first.");
  }
  if (question.questionType === "free_response" && typeof question.freeResponse?.isCorrect !== "boolean") {
    throw new Error("Reveal the correct response in StudySpaces first.");
  }
}

function promptForStep(step) {
  const prompts = {
    metadata: "I found the question details below. Check them and fix anything that is missing or incorrect.",
    whereWrong: "Where did you go wrong? Describe the specific mistake in your own words.",
    myRule: "What rule will you use next time so you do not repeat this mistake?",
    clock: "Was this question timed or untimed?",
    tag: "Which tag best describes your mistake?",
    confirm: "Review your mistake log. Save it when every detail looks right.",
  };
  return prompts[step] || "";
}

function metadataSummary(metadata) {
  const section = reviewConfig?.sectionOptions?.find((option) => option.value === metadata.section)?.label || metadata.section;
  const difficulty = reviewConfig?.difficultyOptions?.find((option) => option.value === metadata.difficulty)?.label || metadata.difficulty;
  return `Date: ${metadata.dateLogged}\nSource: ${metadata.source}\nQuestion: ${metadata.questionNumber}\nSection: ${section}\nDifficulty: ${difficulty}`;
}

function renderReviewTranscript() {
  const draft = appState.draft;
  const currentIndex = reviewFlow.REVIEW_STEPS.indexOf(draft.step);
  rendering.addMessage(messages, "assistant", "Let's log this question before we start tutoring.");

  if (currentIndex === 0) {
    rendering.addMessage(messages, "assistant", promptForStep("metadata"));
    return;
  }
  rendering.addMessage(messages, "student", metadataSummary(draft.metadata));

  const manualSteps = [
    ["whereWrong", draft.diagnosis.whereWrong],
    ["myRule", draft.diagnosis.myRule],
    ["clock", draft.diagnosis.clockMode ? draft.diagnosis.clockMode[0].toUpperCase() + draft.diagnosis.clockMode.slice(1) : ""],
    ["tag", draft.diagnosis.tag],
  ];
  manualSteps.forEach(([step, answer]) => {
    const stepIndex = reviewFlow.REVIEW_STEPS.indexOf(step);
    if (currentIndex >= stepIndex) rendering.addMessage(messages, "assistant", promptForStep(step));
    if (currentIndex > stepIndex && answer) rendering.addMessage(messages, "student", answer);
  });
  if (draft.step === "confirm") rendering.addMessage(messages, "assistant", promptForStep("confirm"));
}

function renderMessages(scrollMode = "bottom") {
  messages.textContent = "";
  if (appState.mode === "review" && appState.draft) {
    renderReviewTranscript();
  } else if (appState.mode === "redo") {
    rendering.addMessage(
      messages,
      "assistant",
      `Reattempt ${appState.redo?.source || "the saved source"} question ${appState.redo?.questionNumber || ""}. Reveal the result, then check it here.`
    );
  } else if (appState.mode === "teaching") {
    if (!appState.messages.length) {
      rendering.addMessage(messages, "assistant", "Your mistake log is saved. Start tutoring when the question is open.");
    } else {
      appState.messages.forEach((message) => rendering.addMessage(messages, message.role, message.content));
    }
  } else {
    rendering.addMessage(
      messages,
      "assistant",
      "Open a reviewed StudySpaces question, then log where you went wrong before we work through the fix."
    );
  }
  requestAnimationFrame(() => {
    if (scrollMode === "top") {
      messages.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    messages.scrollTop = messages.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

function showControlError(message) {
  let error = reviewControls.querySelector(".field-error");
  if (!error) {
    error = document.createElement("p");
    error.className = "field-error";
    reviewControls.append(error);
  }
  error.textContent = message;
}

async function advanceCurrentReview() {
  const result = reviewFlow.advanceReviewDraft(appState.draft, reviewConfig);
  if (result.error) {
    showControlError(result.error);
    return;
  }
  appState.draft = result.draft;
  await saveAppState();
  renderApp();
}

async function goBackOneReviewStep() {
  const previous = reviewFlow.previousReviewStep(appState.draft.step);
  if (!previous) return;
  appState.draft.step = previous;
  await saveAppState();
  renderApp();
}

function addSelectOptions(select, options, placeholder) {
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = placeholder;
  select.append(blank);
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  });
}

function makeActions({ back = true, primaryLabel = "Continue", onPrimary }) {
  const actions = document.createElement("div");
  actions.className = "form-actions";
  if (back) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary-button";
    backButton.textContent = "Back";
    backButton.addEventListener("click", goBackOneReviewStep);
    actions.append(backButton);
  }
  const primary = document.createElement("button");
  primary.type = "submit";
  primary.textContent = primaryLabel;
  if (onPrimary) primary.addEventListener("click", onPrimary);
  actions.append(primary);
  return actions;
}

function renderMetadataStep() {
  const draft = appState.draft;
  const form = document.createElement("form");
  form.className = "review-form";
  const grid = document.createElement("div");
  grid.className = "metadata-grid";

  function addField(labelText, control, wide = false) {
    const wrapper = document.createElement("div");
    if (wide) wrapper.className = "wide";
    const label = document.createElement("label");
    label.textContent = labelText;
    label.htmlFor = control.id;
    wrapper.append(label, control);
    grid.append(wrapper);
  }

  const date = document.createElement("input");
  date.id = "review-date";
  date.type = "date";
  date.required = true;
  date.value = draft.metadata.dateLogged;
  addField("Date", date);

  const questionNumber = document.createElement("input");
  questionNumber.id = "review-question-number";
  questionNumber.required = true;
  questionNumber.value = draft.metadata.questionNumber;
  addField("Question #", questionNumber);

  const source = document.createElement("input");
  source.id = "review-source";
  source.required = true;
  source.value = draft.metadata.source;
  addField("Source", source, true);

  const section = document.createElement("select");
  section.id = "review-section";
  addSelectOptions(section, reviewConfig.sectionOptions, "Select section");
  section.value = draft.metadata.section;
  addField("Section", section);

  const difficulty = document.createElement("select");
  difficulty.id = "review-difficulty";
  addSelectOptions(difficulty, reviewConfig.difficultyOptions, "Select difficulty");
  difficulty.value = draft.metadata.difficulty;
  addField("Difficulty", difficulty);

  form.append(grid, makeActions({ back: false }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    draft.metadata.dateLogged = date.value;
    draft.metadata.source = source.value.trim();
    draft.metadata.questionNumber = questionNumber.value.trim();
    draft.metadata.section = section.value;
    draft.metadata.difficulty = difficulty.value;
    const allowedTags = reviewFlow.getAllowedTags(reviewConfig, section.value).map((option) => option.value);
    if (!allowedTags.includes(draft.diagnosis.tag)) draft.diagnosis.tag = "";
    await advanceCurrentReview();
  });
  reviewControls.append(form);
}

function renderTextStep(field, placeholder) {
  const form = document.createElement("form");
  form.className = "review-form";
  const textarea = document.createElement("textarea");
  textarea.placeholder = placeholder;
  textarea.value = appState.draft.diagnosis[field] || "";
  textarea.required = true;
  form.append(textarea, makeActions({}));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    appState.draft.diagnosis[field] = textarea.value.trim();
    await advanceCurrentReview();
  });
  reviewControls.append(form);
  textarea.focus();
}

function renderClockStep() {
  const wrapper = document.createElement("div");
  wrapper.className = "review-form";
  const choices = document.createElement("div");
  choices.className = "choice-grid";
  reviewConfig.clockOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = option.label;
    button.addEventListener("click", async () => {
      appState.draft.diagnosis.clockMode = option.value;
      await advanceCurrentReview();
    });
    choices.append(button);
  });
  wrapper.append(choices, makeActions({ primaryLabel: "Continue" }));
  wrapper.querySelector("button[type='submit']").remove();
  reviewControls.append(wrapper);
}

function renderTagStep() {
  const form = document.createElement("form");
  form.className = "review-form";
  const tagList = document.createElement("div");
  tagList.className = "tag-list";
  reviewFlow.getAllowedTags(reviewConfig, appState.draft.metadata.section).forEach((option) => {
    const label = document.createElement("label");
    label.className = "tag-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "mistake-tag";
    input.value = option.value;
    input.checked = appState.draft.diagnosis.tag === option.value;
    const card = document.createElement("span");
    card.className = "tag-card";
    const code = document.createElement("span");
    code.className = "tag-code";
    code.textContent = option.label;
    const description = document.createElement("span");
    description.className = "tag-description";
    description.textContent = option.description;
    card.append(code, description);
    label.append(input, card);
    tagList.append(label);
  });
  form.append(tagList, makeActions({}));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    appState.draft.diagnosis.tag = form.elements["mistake-tag"]?.value || "";
    await advanceCurrentReview();
  });
  reviewControls.append(form);
}

function appendSummaryRow(list, labelText, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "summary-row";
  const label = document.createElement("dt");
  label.textContent = labelText;
  const content = document.createElement("dd");
  content.textContent = value || "";
  wrapper.append(label, content);
  list.append(wrapper);
}

function renderConfirmStep() {
  const draft = appState.draft;
  const wrapper = document.createElement("div");
  wrapper.className = "review-form";
  const summary = document.createElement("dl");
  summary.className = "review-summary";
  appendSummaryRow(summary, "Question details", metadataSummary(draft.metadata));
  appendSummaryRow(summary, "Where I went wrong", draft.diagnosis.whereWrong);
  appendSummaryRow(summary, "My rule", draft.diagnosis.myRule);
  appendSummaryRow(summary, "Clock", draft.diagnosis.clockMode === "timed" ? "Timed" : "Untimed");
  const tagDefinition = reviewFlow
    .getAllowedTags(reviewConfig, draft.metadata.section)
    .find((option) => option.value === draft.diagnosis.tag);
  appendSummaryRow(summary, "Tag", `${draft.diagnosis.tag}: ${tagDefinition?.description || ""}`);

  const actions = makeActions({ primaryLabel: "Save and start tutoring" });
  actions.querySelector("button[type='submit']").type = "button";
  actions.querySelector("button:last-child").addEventListener("click", saveCompletedReview);
  wrapper.append(summary, actions);
  reviewControls.append(wrapper);
}

function renderReviewControls() {
  reviewControls.textContent = "";
  reviewControls.hidden = appState.mode !== "review" || !appState.draft;
  if (reviewControls.hidden) return;
  switch (appState.draft.step) {
    case "metadata":
      renderMetadataStep();
      break;
    case "whereWrong":
      renderTextStep("whereWrong", "Example: I found the side length, but I treated it as the requested height.");
      break;
    case "myRule":
      renderTextStep("myRule", "Example: Before submitting, I will write what my answer represents and compare it with the target.");
      break;
    case "clock":
      renderClockStep();
      break;
    case "tag":
      renderTagStep();
      break;
    case "confirm":
      renderConfirmStep();
      break;
  }
}

function editableReviewValues(review) {
  return {
    whereWrong: typeof review?.whereWrong === "string" ? review.whereWrong : "",
    myRule: typeof review?.myRule === "string" ? review.myRule : "",
    tag: typeof review?.tag === "string" ? review.tag : "",
  };
}

function buildReviewChange(before, after) {
  const changedFields = ["whereWrong", "myRule", "tag"].filter(
    (field) => before[field] !== after[field]
  );
  return {
    changedFields,
    before: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
    after: Object.fromEntries(changedFields.map((field) => [field, after[field]])),
  };
}

function showReviewEditError(message) {
  let error = reviewEditControls.querySelector(".field-error");
  if (!error) {
    error = document.createElement("p");
    error.className = "field-error";
    reviewEditControls.append(error);
  }
  error.textContent = message;
}

async function respondToPendingReviewChange() {
  let pending;
  try {
    const question = await getLiveQuestionForCurrentState();
    pending = rendering.addMessage(messages, "assistant", "Updating my response...", "pending");
    setStatus("Updating the tutor with your revised mistake log...");
    const data = await requestTutorReply(question);
    appState.method = data.method || appState.method;
    appState.messages = [...appState.messages, { role: "assistant", content: data.reply }];
    appState.pendingReviewChange = null;
    await saveAppState();
    renderApp();
    setStatus(appState.method?.title ? `Ready. Method: ${appState.method.title}.` : "Ready.");
  } catch (error) {
    const message = error.message || "The review was saved, but the tutor could not respond yet.";
    if (pending) rendering.updateMessage(pending, message);
    else rendering.addMessage(messages, "assistant", message);
    setStatus(`${message} Your changes will be included in the next tutor response.`, "error");
  }
}

async function saveReviewEdits(form) {
  const before = editableReviewValues(appState.savedReview);
  const after = {
    whereWrong: form.elements.whereWrong.value.trim(),
    myRule: form.elements.myRule.value.trim(),
    tag: form.elements.tag.value,
  };
  if (!after.whereWrong || !after.myRule || !after.tag) {
    showReviewEditError("Complete the diagnosis, rule, and tag before saving.");
    return;
  }

  const reviewChange = buildReviewChange(before, after);
  if (!reviewChange.changedFields.length) {
    appState.editingReview = false;
    await saveAppState();
    renderApp();
    setStatus("No changes to save.");
    return;
  }

  setBusy(true);
  setStatus("Saving your updated mistake log...");
  try {
    const data = await apiRequest(`/reviews/${encodeURIComponent(appState.reviewId)}`, {
      method: "PATCH",
      body: { diagnosis: after },
    });
    const hasTutorResponse = appState.messages.some((message) => message.role === "assistant");
    appState.savedReview = data.review;
    appState.editingReview = false;
    if (hasTutorResponse) appState.tutorContextStartIndex = appState.messages.length;
    appState.pendingReviewChange = hasTutorResponse ? reviewChange : null;
    await saveAppState();
    renderApp();

    if (hasTutorResponse) await respondToPendingReviewChange();
    else setStatus("Mistake log updated. The tutor will use it in the first response.");
  } catch (error) {
    setStatus(error.message || "Unable to update the mistake log.", "error");
    showReviewEditError(error.message || "Unable to update the mistake log.");
  } finally {
    setBusy(false);
    renderModeControls();
  }
}

function renderReviewEditControls() {
  reviewEditControls.textContent = "";
  const isOpen = appState.mode === "teaching" && appState.editingReview;
  reviewEditControls.hidden = !isOpen;
  reviewEditButton.textContent = isOpen ? "Close editor" : "Edit answers";
  if (!isOpen || !appState.savedReview) return;

  const values = editableReviewValues(appState.savedReview);
  const form = document.createElement("form");
  form.className = "review-form";

  const diagnosisLabel = document.createElement("label");
  diagnosisLabel.htmlFor = "edit-where-wrong";
  diagnosisLabel.textContent = "Where I went wrong";
  const diagnosis = document.createElement("textarea");
  diagnosis.id = "edit-where-wrong";
  diagnosis.name = "whereWrong";
  diagnosis.required = true;
  diagnosis.value = values.whereWrong;

  const ruleLabel = document.createElement("label");
  ruleLabel.htmlFor = "edit-my-rule";
  ruleLabel.textContent = "My rule for next time";
  const rule = document.createElement("textarea");
  rule.id = "edit-my-rule";
  rule.name = "myRule";
  rule.required = true;
  rule.value = values.myRule;

  const tagLabel = document.createElement("label");
  tagLabel.htmlFor = "edit-mistake-tag";
  tagLabel.textContent = "Mistake tag";
  const tag = document.createElement("select");
  tag.id = "edit-mistake-tag";
  tag.name = "tag";
  tag.required = true;
  reviewFlow.getAllowedTags(reviewConfig, appState.savedReview.section).forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = `${option.label}: ${option.description}`;
    tag.append(element);
  });
  tag.value = values.tag;

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", async () => {
    appState.editingReview = false;
    await saveAppState();
    renderApp();
  });
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save changes";
  actions.append(cancel, save);

  form.append(diagnosisLabel, diagnosis, ruleLabel, rule, tagLabel, tag, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveReviewEdits(form);
  });
  reviewEditControls.append(form);
}

async function toggleReviewEditor() {
  if (appState.editingReview) {
    appState.editingReview = false;
    await saveAppState();
    renderApp();
    return;
  }

  setBusy(true);
  try {
    if (!appState.savedReview) {
      const data = await apiRequest(`/reviews/${encodeURIComponent(appState.reviewId)}`);
      appState.savedReview = data.review;
    }
    appState.editingReview = true;
    await saveAppState();
    renderApp({ scrollMode: "top" });
    reviewEditControls.querySelector("textarea")?.focus({ preventScroll: true });
  } catch (error) {
    setStatus(error.message || "Unable to load the saved mistake log.", "error");
  } finally {
    setBusy(false);
  }
}

function renderDueReviews() {
  dueSummaryText.textContent = dueState.count
    ? `${dueState.count} review${dueState.count === 1 ? "" : "s"} due · ${dueState.overdueCount} overdue`
    : "No reviews due";
  dueList.textContent = "";
  dueState.items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "due-card";
    const title = document.createElement("strong");
    title.textContent = `${item.source} · Q${item.questionNumber}`;
    const detail = document.createElement("p");
    detail.textContent = `${item.overdue ? "Overdue" : "Due today"}: +${item.stage} day redo (${item.dueOn})`;
    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start redo";
    start.addEventListener("click", () => startDueRedo(item));
    card.append(title, detail, start);
    dueList.append(card);
  });
  dueRegion.classList.toggle("empty", dueState.count === 0);
}

async function loadDueReviews() {
  dueState = await apiRequest(`/reviews/due?today=${encodeURIComponent(localDateString())}`);
  renderDueReviews();
}

function renderModeControls() {
  const needsTutorStart = appState.mode === "teaching" && !appState.messages.length;
  reviewEntry.hidden = !(appState.mode === "idle" || needsTutorStart);
  reviewButton.textContent = needsTutorStart ? "Start tutoring" : "Review this question";
  reviewEditRegion.hidden = !(appState.mode === "teaching" && appState.reviewId);
  redoControls.hidden = appState.mode !== "redo";
  tutorForm.hidden = !(appState.mode === "teaching" && appState.messages.length > 0);
  explainButton.textContent = "Send follow-up";
}

function renderApp({ scrollMode = "bottom" } = {}) {
  renderMessages(scrollMode);
  renderReviewControls();
  renderReviewEditControls();
  renderModeControls();
  renderDueReviews();
  if (isBusy) setBusy(true);
}

function ensureQuestionMatchesState(question) {
  const currentKey = getQuestionKey(question);
  if (
    appState.questionKey?.startsWith("studyspaces:") &&
    currentKey.startsWith("studyspaces:") &&
    currentKey !== appState.questionKey
  ) {
    throw new Error("Open the question saved with this review before continuing.");
  }
}

async function beginQuestionReview() {
  if (appState.mode === "teaching" && !appState.messages.length && appState.reviewId) {
    const { question } = await extractQuestionFromActiveTab();
    ensureQuestionMatchesState(question);
    currentLiveQuestion = question;
    await startTutor(question);
    return;
  }

  if (appState.mode !== "idle") {
    const replace = window.confirm("Start a new review and discard the current unsaved or active question state?");
    if (!replace) return;
  }

  setBusy(true);
  setStatus("Reading the question…");
  try {
    const { question, tab } = await extractQuestionFromActiveTab();
    ensureReviewedResult(question);
    currentLiveQuestion = question;
    appState = {
      ...createEmptyState(),
      mode: "review",
      questionKey: getQuestionKey(question),
      question: stripCapturedFigureData(question),
      draft: reviewFlow.createReviewDraft(buildDetectedMetadata(question, tab)),
    };
    await saveAppState();
    setStatus("Complete every mistake-log field before tutoring starts.");
    renderApp();
  } catch (error) {
    setStatus(error.message || "Unable to start the review.", "error");
    rendering.addMessage(messages, "assistant", error.message || "Unable to start the review.");
  } finally {
    setBusy(false);
  }
}

async function getLiveQuestionForCurrentState() {
  const { question } = await extractQuestionFromActiveTab();
  ensureQuestionMatchesState(question);
  currentLiveQuestion = question;
  return question;
}

async function saveCompletedReview() {
  const finalError = reviewFlow.validateReviewStep(appState.draft, reviewConfig);
  if (finalError) {
    showControlError(finalError);
    return;
  }

  setBusy(true);
  setStatus("Saving your mistake log…");
  try {
    const question = await getLiveQuestionForCurrentState();
    ensureReviewedResult(question);
    const data = await apiRequest("/reviews", {
      method: "POST",
      body: {
        question,
        metadata: appState.draft.metadata,
        diagnosis: appState.draft.diagnosis,
      },
    });
    appState = {
      ...createEmptyState(),
      mode: "teaching",
      questionKey: data.review.questionKey,
      question: stripCapturedFigureData(question),
      reviewId: data.review.id,
      savedReview: data.review,
    };
    await saveAppState();
    await loadDueReviews();
    renderApp();
    setStatus("Mistake log saved. Starting the lesson…");
    await startTutor(question);
  } catch (error) {
    setStatus(error.message || "Unable to save the mistake log.", "error");
    showControlError(error.message || "Unable to save the mistake log.");
  } finally {
    setBusy(false);
  }
}

async function requestTutorReply(question) {
  const conversation = reviewFlow.getTutorConversation(
    appState.messages,
    appState.tutorContextStartIndex,
  );
  return apiRequest("/teach", {
    method: "POST",
    body: {
      reviewId: appState.reviewId,
      reviewStage: appState.reviewStage,
      question,
      conversation,
      reviewChange: appState.pendingReviewChange || undefined,
    },
  });
}

async function startTutor(question) {
  setBusy(true);
  renderApp();
  const pending = rendering.addMessage(messages, "assistant", "Thinking…", "pending");
  setStatus("Using your mistake log to start the lesson…");
  try {
    const data = await requestTutorReply(question);
    appState.method = data.method || null;
    appState.messages = [...appState.messages, { role: "assistant", content: data.reply }];
    appState.pendingReviewChange = null;
    await saveAppState();
    renderApp();
    setStatus(data.method?.title ? `Ready. Method: ${data.method.title}.` : "Ready.");
    messageInput.focus();
  } catch (error) {
    rendering.updateMessage(pending, error.message || "Unable to start tutoring.");
    setStatus(error.message || "Unable to start tutoring.", "error");
  } finally {
    setBusy(false);
    renderModeControls();
  }
}

async function sendTutorFollowup(studentMessage) {
  setBusy(true);
  setStatus("Reading the question…");
  let pending;
  try {
    const question = await getLiveQuestionForCurrentState();
    appState.messages = [...appState.messages, { role: "student", content: studentMessage }];
    await saveAppState();
    renderApp();
    pending = rendering.addMessage(messages, "assistant", "Thinking…", "pending");
    setStatus("Asking the tutor…");

    const data = await requestTutorReply(question);
    appState.method = data.method || appState.method;
    appState.messages = [...appState.messages, { role: "assistant", content: data.reply }];
    appState.pendingReviewChange = null;
    await saveAppState();
    messageInput.value = "";
    renderApp();
    setStatus(appState.method?.title ? `Ready. Method: ${appState.method.title}.` : "Ready.");
  } catch (error) {
    if (pending) rendering.updateMessage(pending, error.message || "Unable to continue tutoring.");
    else rendering.addMessage(messages, "assistant", error.message || "Unable to continue tutoring.");
    setStatus(error.message || "Unable to continue tutoring.", "error");
  } finally {
    setBusy(false);
  }
}

async function startDueRedo(item) {
  if (appState.mode === "review") {
    const replace = window.confirm("Discard the unfinished mistake log and start this scheduled redo?");
    if (!replace) return;
  }

  setBusy(true);
  try {
    const reviewData = await apiRequest(`/reviews/${encodeURIComponent(item.reviewId)}`);
    appState = {
      ...createEmptyState(),
      mode: "redo",
      reviewId: item.reviewId,
      reviewStage: item.stage,
      questionKey: item.questionKey,
      question: reviewData.review.question,
      redo: item,
    };
    currentLiveQuestion = null;
    await saveAppState();
    renderApp();

    const tab = await getActiveTab();
    if (item.pageUrl && tab.url !== item.pageUrl) {
      await chrome.tabs.update(tab.id, { url: item.pageUrl });
      setStatus(`Opening ${item.source}. Navigate to question ${item.questionNumber}, reattempt it, and reveal the result.`);
    } else {
      setStatus(`Reattempt question ${item.questionNumber}, reveal the result, then check it here.`);
    }
  } catch (error) {
    setStatus(error.message || "Unable to start the redo.", "error");
  } finally {
    setBusy(false);
  }
}

async function checkRedoResult() {
  setBusy(true);
  setStatus("Checking the redo result…");
  try {
    const { question } = await extractQuestionFromActiveTab();
    ensureReviewedResult(question);
    const data = await apiRequest(
      `/reviews/${encodeURIComponent(appState.reviewId)}/redos/${appState.reviewStage}/complete`,
      {
        method: "POST",
        body: { question, today: localDateString() },
      }
    );
    currentLiveQuestion = question;
    if (data.result === "wrong") {
      appState = {
        ...createEmptyState(),
        mode: "teaching",
        questionKey: data.review.questionKey,
        question: stripCapturedFigureData(question),
        reviewId: data.review.id,
        reviewStage: Number(appState.reviewStage),
        savedReview: data.review,
      };
      await saveAppState();
      await loadDueReviews();
      renderApp();
      setStatus("Redo recorded as wrong. Restarting the lesson from your saved diagnosis…");
      await startTutor(question);
    } else {
      await clearAppState();
      await loadDueReviews();
      renderApp();
      setStatus("Redo recorded as correct.");
    }
  } catch (error) {
    setStatus(error.message || "Unable to check the redo.", "error");
    rendering.addMessage(messages, "assistant", error.message || "Unable to check the redo.");
  } finally {
    setBusy(false);
  }
}

async function resetQuestionState() {
  if (appState.mode === "review") {
    const confirmed = window.confirm("Discard this unfinished mistake log?");
    if (!confirmed) return;
  }
  await clearAppState();
  renderApp();
  setStatus("Ready for a new question.");
}

signinTab.addEventListener("click", () => setAuthMode("signin"));
signupTab.addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setAuthMessage(authMode === "signin" ? "Signing in…" : "Creating your account…");
  try {
    const path = authMode === "signin" ? "/auth/login" : "/auth/signup";
    const data = await apiRequest(path, {
      method: "POST",
      authenticated: false,
      body: { email: authEmail.value, password: authPassword.value },
    });
    const session = authMode === "signin" ? data.session : data.session;
    if (session) {
      await saveAuthSession(session);
      authPassword.value = "";
      await showAppView();
      return;
    }
    setAuthMode("signin");
    setAuthMessage("Check your email to confirm the account, then return here and sign in.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Unable to authenticate.", "error");
  } finally {
    setBusy(false);
  }
});

forgotPasswordButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage("Enter your email address first.", "error");
    authEmail.focus();
    return;
  }
  setBusy(true);
  try {
    await apiRequest("/auth/password-reset", { method: "POST", authenticated: false, body: { email } });
    setAuthMessage("Check your email for a password-reset link.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Unable to send the reset email.", "error");
  } finally {
    setBusy(false);
  }
});

signoutButton.addEventListener("click", async () => {
  const session = authSession;
  setBusy(true);
  try {
    if (session) {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
      }).catch(() => null);
    }
  } finally {
    await clearAuthSession();
    await clearAppState();
    setBusy(false);
    showAuthView();
  }
});

dueSummaryButton.addEventListener("click", () => {
  const expanded = dueSummaryButton.getAttribute("aria-expanded") === "true";
  dueSummaryButton.setAttribute("aria-expanded", String(!expanded));
  dueList.hidden = expanded;
});

reviewButton.addEventListener("click", beginQuestionReview);
reviewEditButton.addEventListener("click", toggleReviewEditor);
checkRedoButton.addEventListener("click", checkRedoResult);
resetButton.addEventListener("click", resetQuestionState);

tutorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isBusy) return;
  const studentMessage = messageInput.value.trim();
  if (!studentMessage) {
    setStatus("Add a message first.", "error");
    messageInput.focus();
    return;
  }
  await sendTutorFollowup(studentMessage);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && authSession) loadDueReviews().catch(() => null);
});

(async function init() {
  try {
    await Promise.all([loadAuthSession(), loadAppState()]);
    if (!authSession) {
      showAuthView();
      return;
    }
    if (authSession.expiresAt && authSession.expiresAt * 1000 < Date.now() + 30_000) {
      await refreshAuthSession();
    }
    await showAppView();
    setStatus(appState.mode === "review" ? "Mistake log restored." : "Ready.");
  } catch (error) {
    await clearAuthSession();
    showAuthView();
    setAuthMessage(error.message || "Your session could not be restored. Sign in again.", "error");
  }
})();
