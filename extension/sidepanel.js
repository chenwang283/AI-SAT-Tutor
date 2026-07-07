const API_URL = "http://localhost:3000/teach";

const form = document.querySelector("#tutor-form");
const messages = document.querySelector("#messages");
const statusText = document.querySelector("#status");
const thinkingInput = document.querySelector("#student-thinking");
const explainButton = document.querySelector("#explain-button");

let isSubmitting = false;

function setStatus(message, type = "normal") {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("error", type === "error");
}

function setBusy(busy) {
  isSubmitting = busy;
  if (explainButton) {
    explainButton.disabled = busy;
    explainButton.textContent = busy ? "Thinking..." : "Explain my mistake";
  }
  if (thinkingInput) {
    thinkingInput.disabled = busy;
  }
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

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Open a StudySpaces question tab first.");
  }
  return tab;
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
  if (!question?.stem) {
    throw new Error("I could not find a StudySpaces question on the active tab.");
  }
  if (question.questionType !== "multiple_choice") {
    throw new Error("Week 1 only supports multiple-choice questions.");
  }
  return question;
}

async function getTutorReply(question, studentThinking) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, studentThinking }),
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
  return data.reply.trim();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const studentThinking = thinkingInput.value.trim();
  if (!studentThinking) {
    setStatus("Add your thinking first.", "error");
    thinkingInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Reading the question...");
  addMessage("student", studentThinking);
  const pendingMessage = addMessage("assistant", "Thinking...", "pending");

  try {
    const question = await extractQuestionFromActiveTab();
    setStatus("Asking the tutor...");
    const reply = await getTutorReply(question, studentThinking);
    updateMessage(pendingMessage, reply);
    thinkingInput.value = "";
    setStatus("Ready.");
  } catch (error) {
    const message = error?.message || "Something went wrong.";
    updateMessage(pendingMessage, message);
    setStatus(message, "error");
  } finally {
    setBusy(false);
  }
});

if (thinkingInput) {
  thinkingInput.focus();
}
