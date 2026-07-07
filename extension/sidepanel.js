const API_URL = "http://localhost:3000/teach";
const STORAGE_KEY = "aiSatTutorChat";
const SUPPORTED_QUESTION_TYPES = new Set(["multiple_choice", "free_response"]);

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
  return chatState.method?.title ? `Ready. Method: ${chatState.method.title}.` : "Ready.";
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
    question: storedState.question && typeof storedState.question === "object" ? storedState.question : null,
    messages: cleanStoredMessages(storedState.messages),
    method: storedState.method && typeof storedState.method === "object" ? storedState.method : null,
  };
}

async function saveState() {
  await chrome.storage.session.set({ [STORAGE_KEY]: chatState });
}

async function clearState() {
  chatState = createEmptyState();
  await chrome.storage.session.remove(STORAGE_KEY);
}

function addMessage(role, text, extraClass = "") {
  const message = document.createElement("article");
  message.className = ["message", role, extraClass].filter(Boolean).join(" ");

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = role === "student" ? "You" : "Tutor";

  const body = document.createElement("p");
  body.textContent = text;

  message.append(label, body);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function updateMessage(message, text, extraClass = "") {
  const body = message.querySelector("p");
  if (body) body.textContent = text;
  message.className = ["message", "assistant", extraClass].filter(Boolean).join(" ");
  messages.scrollTop = messages.scrollHeight;
}

function renderMessages() {
  messages.textContent = "";

  if (!chatState.messages.length) {
    addMessage("assistant", "Ready when you are. Type what you tried, or ask for help on the current question.");
  } else {
    chatState.messages.forEach((message) => addMessage(message.role, message.content));
  }

  if (explainButton && !isSubmitting) {
    explainButton.textContent = getSubmitLabel();
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Open a StudySpaces question tab first.");
  }
  return tab;
}

function getQuestionKey(question) {
  if (question.questionId) return String(question.questionId);
  return [question.questionType, question.stem].filter(Boolean).join(":");
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
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["studyspacesExtractor.js"],
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.aiSatTutorExtractQuestion?.(),
  });

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
    chatState.question = question;
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
