const API_URL = "http://localhost:3000/teach";
const STORAGE_KEY = "aiSatTutorChat";
const SUPPORTED_QUESTION_TYPES = new Set(["multiple_choice", "free_response"]);
const ALLOWED_MARKDOWN_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);
const DANGEROUS_MARKDOWN_TAGS = new Set(["embed", "iframe", "object", "script", "style"]);
const MATH_TOKEN_PATTERN = /(AISATTUTORMATH\d+TOKEN)/g;

const form = document.querySelector("#tutor-form");
const messages = document.querySelector("#messages");
const statusText = document.querySelector("#status");
const messageInput = document.querySelector("#student-message");
const explainButton = document.querySelector("#explain-button");
const resetButton = document.querySelector("#reset-button");

let isSubmitting = false;
let chatState = createEmptyState();

function createEmptyState() {
  return {
    questionKey: null,
    question: null,
    messages: [],
    method: null,
  };
}

function getSubmitLabel() {
  return chatState.messages.length ? "Send follow-up" : "Explain my mistake";
}

function setStatus(message, type = "normal") {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("error", type === "error");
}

function setBusy(busy) {
  isSubmitting = busy;
  if (explainButton) {
    explainButton.disabled = busy;
    explainButton.textContent = busy ? "Thinking..." : getSubmitLabel();
  }
  if (messageInput) {
    messageInput.disabled = busy;
  }
  if (resetButton) {
    resetButton.disabled = busy;
  }
}

function readyStatus() {
  if (!chatState.method) return "Ready.";
  if (chatState.method.title) return `Ready. Method: ${chatState.method.title}.`;
  return "Ready. No saved method for this topic yet.";
}

function cleanStoredMessages(storedMessages) {
  if (!Array.isArray(storedMessages)) return [];

  return storedMessages
    .map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return null;
      const role = message.role;
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!["student", "assistant"].includes(role) || !content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

async function loadState() {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  const storedState = result[STORAGE_KEY];
  if (!storedState || typeof storedState !== "object") {
    chatState = createEmptyState();
    return;
  }

  chatState = {
    questionKey: typeof storedState.questionKey === "string" ? storedState.questionKey : null,
    question: storedState.question && typeof storedState.question === "object" ? stripCapturedFigureData(storedState.question) : null,
    messages: cleanStoredMessages(storedState.messages),
    method: storedState.method && typeof storedState.method === "object" ? storedState.method : null,
  };

  await saveState();
}

async function saveState() {
  await chrome.storage.session.set({ [STORAGE_KEY]: chatState });
}

async function clearState() {
  chatState = createEmptyState();
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isSafeLinkUrl(value) {
  try {
    const url = new URL(value, "https://extension.invalid");
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch (error) {
    return false;
  }
}

function sanitizeMarkdownHtml(template) {
  template.content.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (!ALLOWED_MARKDOWN_TAGS.has(tagName)) {
      if (DANGEROUS_MARKDOWN_TAGS.has(tagName)) {
        element.remove();
      } else {
        element.replaceWith(...element.childNodes);
      }
      return;
    }

    for (const attribute of [...element.attributes]) {
      if (tagName === "a" && attribute.name === "href" && isSafeLinkUrl(attribute.value)) continue;
      element.removeAttribute(attribute.name);
    }

    if (tagName === "a" && element.hasAttribute("href")) {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  });
}

function protectMath(markdown) {
  const expressions = [];
  const addExpression = (expression, displayMode) => {
    const token = `AISATTUTORMATH${expressions.length}TOKEN`;
    expressions.push({ expression: expression.trim(), displayMode, token });
    return token;
  };

  let protectedMarkdown = markdown
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression) => addExpression(expression, true))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression) => addExpression(expression, true))
    .replace(
      /(^|\n)[ \t]*\[\s*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g,
      (_, prefix, expression) => `${prefix}${addExpression(expression, true)}`
    )
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression) => addExpression(expression, false))
    .replace(
      /\(([^()\n]*(?:\\[a-zA-Z]+|[=_^])[^()\n]*)\)/g,
      (_, expression) => addExpression(expression, false)
    )
    .replace(
      /\(([A-Z]{1,2}|[a-z](?:\d+)?|\d+[a-zA-Z]?)\)/g,
      (_, expression) => addExpression(expression, false)
    )
    .replace(/(?<!\\)\$([^\n$]+?)\$/g, (_, expression) => addExpression(expression, false));

  return { expressions, markdown: protectedMarkdown };
}

function createMathElement(expression, displayMode) {
  const math = document.createElement("span");
  math.className = displayMode ? "math-display" : "math-inline";
  globalThis.katex.render(expression, math, {
    displayMode,
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });
  return math;
}

function renderMath(container, expressions) {
  if (!expressions.length || typeof globalThis.katex?.render !== "function") return;

  const expressionsByToken = new Map(expressions.map((expression) => [expression.token, expression]));
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("code, pre, a")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  let textNode;

  while ((textNode = walker.nextNode())) {
    if (MATH_TOKEN_PATTERN.test(textNode.nodeValue)) textNodes.push(textNode);
    MATH_TOKEN_PATTERN.lastIndex = 0;
  }

  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment();

    node.nodeValue.split(MATH_TOKEN_PATTERN).forEach((part) => {
      const expression = expressionsByToken.get(part);
      fragment.append(expression ? createMathElement(expression.expression, expression.displayMode) : part);
    });

    node.replaceWith(fragment);
  });
}
function renderTutorMessage(body, markdown) {
  if (typeof globalThis.marked?.parse !== "function") {
    body.textContent = markdown;
    return;
  }

  const { expressions, markdown: markdownWithMathTokens } = protectMath(markdown);
  const template = document.createElement("template");
  template.innerHTML = globalThis.marked.parse(markdownWithMathTokens, { breaks: true, gfm: true });
  sanitizeMarkdownHtml(template);
  body.replaceChildren(template.content);
  renderMath(body, expressions);
}

function setMessageContent(body, role, text) {
  if (role === "assistant") {
    renderTutorMessage(body, text);
  } else {
    body.textContent = text;
  }
}

function getScrollPosition() {
  return {
    documentTop: document.scrollingElement?.scrollTop || 0,
    messagesTop: messages.scrollTop,
  };
}

function restoreScrollPosition(position) {
  messages.scrollTop = position.messagesTop;
  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = position.documentTop;
  }
}

function addMessage(role, text, extraClass = "") {
  const message = document.createElement("article");
  message.className = ["message", role, extraClass].filter(Boolean).join(" ");

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = role === "student" ? "You" : "Tutor";

  const body = document.createElement(role === "assistant" ? "div" : "p");
  body.className = "message-body";
  setMessageContent(body, role, text);

  message.append(label, body);
  messages.append(message);
  return message;
}

function updateMessage(message, text, extraClass = "") {
  const body = message.querySelector(".message-body");
  if (body) setMessageContent(body, "assistant", text);
  message.className = ["message", "assistant", extraClass].filter(Boolean).join(" ");
}

function renderMessages() {
  const scrollPosition = getScrollPosition();
  messages.textContent = "";

  if (!chatState.messages.length) {
    addMessage("assistant", "Ready when you are. Type what you tried, or ask for help on the current question.");
  } else {
    chatState.messages.forEach((message) => addMessage(message.role, message.content));
  }

  if (explainButton && !isSubmitting) {
    explainButton.textContent = getSubmitLabel();
  }

  restoreScrollPosition(scrollPosition);
  requestAnimationFrame(() => restoreScrollPosition(scrollPosition));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Open a StudySpaces question tab first.");
  }
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

function unsupportedQuestionTabError() {
  return new Error("Open a StudySpaces question tab first. This extension only has access to StudySpaces pages.");
}

function isPageAccessError(error) {
  const message = error?.message || String(error || "");
  return /Cannot access contents of the page|Extension manifest must request permission|Cannot access a chrome:|Cannot access a chrome-extension:/i.test(
    message
  );
}

function getQuestionKey(question) {
  if (question.questionId) return String(question.questionId);
  return [question.questionType, question.stem].filter(Boolean).join(":");
}

function isImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value.trim());
}

function getStoredFigureSrc(figure) {
  const src = typeof figure?.src === "string" ? figure.src.trim() : "";
  return src && !isImageDataUrl(src) ? src : null;
}

function stripCapturedFigureData(question) {
  if (!question || typeof question !== "object") return question;

  return {
    ...question,
    figures: Array.isArray(question.figures)
      ? question.figures.map((figure) => ({
          src: getStoredFigureSrc(figure),
          alt: figure?.alt || null,
          width: figure?.width || null,
          height: figure?.height || null,
          capturedImage: Boolean(figure?.dataUrl || figure?.src),
        }))
      : question.figures,
  };
}
function validateExtractedQuestion(question) {
  if (!question?.stem) {
    throw new Error("I could not find a StudySpaces question on the active tab.");
  }
  if (!SUPPORTED_QUESTION_TYPES.has(question.questionType)) {
    throw new Error("This question type is not supported yet.");
  }
  if (question.questionType === "free_response" && !question.freeResponse) {
    throw new Error("I found a free-response question, but not the answer fields yet.");
  }
}

async function extractQuestionFromActiveTab() {
  if (!chrome?.scripting?.executeScript) {
    throw new Error("Reload the extension so Chrome can apply the scripting permission.");
  }

  const tab = await getActiveTab();
  if (!isSupportedQuestionHost(tab.url)) {
    throw unsupportedQuestionTabError();
  }

  let result;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["studyspacesExtractor.js"],
    });

    [result] = await chrome.scripting.executeScript({
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
  } catch (error) {
    if (isPageAccessError(error)) {
      throw unsupportedQuestionTabError();
    }
    throw error;
  }

  const question = result?.result;
  validateExtractedQuestion(question);
  return question;
}

async function getTutorReply(question, conversation) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, conversation }),
    });
  } catch (error) {
    throw new Error("I could not reach the local server at localhost:3000.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || "The server could not generate a reply.");
  }
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("The server returned an empty tutor reply.");
  }

  return {
    reply: data.reply.trim(),
    method: data.method || null,
  };
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const studentMessage = messageInput.value.trim();
  if (!studentMessage) {
    setStatus("Add a message first.", "error");
    messageInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Reading the question...");

  let pendingMessage;
  try {
    const question = await extractQuestionFromActiveTab();
    const questionKey = getQuestionKey(question);

    if (chatState.questionKey && chatState.questionKey !== questionKey) {
      chatState = createEmptyState();
      setStatus("New question detected. Starting a fresh chat.");
    }

    chatState.questionKey = questionKey;
    chatState.question = stripCapturedFigureData(question);
    chatState.messages = [...chatState.messages, { role: "student", content: studentMessage }];
    await saveState();
    renderMessages();

    pendingMessage = addMessage("assistant", "Thinking...", "pending");
    setStatus("Asking the tutor...");

    const { reply, method } = await getTutorReply(question, chatState.messages);
    chatState.method = method;
    chatState.messages = [...chatState.messages, { role: "assistant", content: reply }];
    await saveState();

    messageInput.value = "";
    renderMessages();
    setStatus(readyStatus());
  } catch (error) {
    const message = error?.message || "Something went wrong.";
    if (pendingMessage) {
      updateMessage(pendingMessage, message);
    } else {
      addMessage("assistant", message);
    }
    setStatus(message, "error");
  } finally {
    setBusy(false);
  }
});

resetButton?.addEventListener("click", async () => {
  await clearState();
  if (messageInput) messageInput.value = "";
  renderMessages();
  setStatus("Chat reset.");
  messageInput?.focus();
});

(async function init() {
  try {
    await loadState();
    renderMessages();
    setStatus(chatState.messages.length ? "Chat restored." : readyStatus());
  } catch (error) {
    renderMessages();
    setStatus("Could not restore chat state.", "error");
  }

  messageInput?.focus();
})();
