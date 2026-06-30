const loadStatus = document.querySelector("#load-status");

if (loadStatus) {
  loadStatus.textContent = "Side panel loaded at " + new Date().toLocaleTimeString() + ".";
}