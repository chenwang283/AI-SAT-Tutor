const form = document.querySelector("#reset-form");
const message = document.querySelector("#message");
const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = form.elements.password.value;
  const confirmation = form.elements.passwordConfirm.value;
  if (password !== confirmation) {
    message.textContent = "The passwords do not match.";
    message.className = "message error";
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  message.textContent = "Updating your password…";
  message.className = "message";

  try {
    const response = await fetch("/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: hash.get("access_token"),
        refreshToken: hash.get("refresh_token"),
        password,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || "Unable to update your password.");

    form.hidden = true;
    window.history.replaceState({}, document.title, window.location.pathname);
    message.textContent = "Password updated. Return to the Chrome side panel and sign in.";
    message.className = "message success";
  } catch (error) {
    message.textContent = error.message;
    message.className = "message error";
    submitButton.disabled = false;
  }
});
