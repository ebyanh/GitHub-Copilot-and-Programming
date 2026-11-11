const imageUrl = (source, width = 720) =>
  source.startsWith("/") ? source : `https://images.unsplash.com/${source}?auto=format&fit=crop&w=${width}&q=82`;

let ideas = [];

function loadLocalSavedIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem("muse-saved") || "[]");
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
}

const state = {
  category: "all",
  media: "all",
  view: "discover",
  query: "",
  saved: new Set(loadLocalSavedIdeas()),
  user: null,
  selectedIdea: null
};

const grid = document.querySelector("#masonry-grid");
const searchInput = document.querySelector("#search-input");
const statusMessage = document.querySelector("#feed-status");
const dialog = document.querySelector("#idea-dialog");
const dialogContent = document.querySelector("#dialog-content");
const toastRegion = document.querySelector("#toast-region");
const authGate = document.querySelector("#auth-gate");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
let authMode = "welcome";
let pendingEmail = sessionStorage.getItem("muse-pending-email") || "";
let verificationToken = "";
const avatarTone = (index) => `tone-${index % 4}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = null;
    }
  }
  if (!response.ok) {
    const message = result?.error || (
      response.status === 403
        ? "Muse could not process that request. Refresh the page and check that the local app server is running."
        : `Muse could not complete that request (HTTP ${response.status}). Please try again.`
    );
    const error = new Error(message);
    error.status = response.status;
    error.result = result;
    throw error;
  }
  if (!result || typeof result !== "object") {
    throw new Error("Muse received an unreadable response from the app server. Please refresh and try again.");
  }
  return result;
}

function showAuthGate(view = "welcome") {
  authMode = view;
  const options = document.querySelector("#auth-options");
  const pending = document.querySelector("#auth-pending");
  const confirm = document.querySelector("#auth-confirm");
  const account = document.querySelector("#auth-account");
  document.querySelector("#local-verification-link").hidden = true;
  options.hidden = view !== "welcome";
  authForm.hidden = view !== "signup" && view !== "login";
  pending.hidden = view !== "pending";
  confirm.hidden = view !== "verify";
  account.hidden = view !== "account";
  authMessage.textContent = "";
  authGate.hidden = false;
  if (view === "signup" || view === "login") {
    const signingUp = view === "signup";
    document.querySelector("#auth-form-title").textContent = signingUp ? "Create your account" : "Welcome back.";
    document.querySelector("#auth-form-copy").textContent = signingUp
      ? "Your email keeps your saved ideas close, wherever you sign in."
      : "Sign in to pick up where your ideas left off.";
    document.querySelector("#auth-submit").textContent = signingUp ? "Create account" : "Sign in";
    document.querySelector("#auth-password").autocomplete = signingUp ? "new-password" : "current-password";
    document.querySelector("#auth-password").minLength = signingUp ? 10 : 1;
    if (pendingEmail) document.querySelector("#auth-email").value = pendingEmail;
  } else if (view === "pending") {
    document.querySelector("#auth-pending-copy").textContent = `We sent a verification link to ${pendingEmail}. Open it to finish creating your account.`;
  } else if (view === "account" && state.user) {
    document.querySelector("#auth-account-email").textContent = `Signed in as ${state.user.email}`;
  }
}

function updateProfile() {
  const name = document.querySelector("#profile-name");
  const email = document.querySelector("#profile-email");
  const shortcut = document.querySelector("#account-shortcut");
  document.querySelector(".account-button .avatar").textContent = state.user ? state.user.email[0].toUpperCase() : "J";
  name.textContent = state.user ? state.user.email.split("@")[0] : "Welcome to Muse";
  email.textContent = state.user ? state.user.email : "Browsing as a guest";
  shortcut.textContent = state.user ? "Account" : "Sign in";
}

async function applyAuthentication(result, mergeGuestIdeas = true) {
  state.user = result.user;
  const savedIdeas = new Set((result.savedIdeas || []).map(String));
  if (state.user && mergeGuestIdeas && state.saved.size) {
    const merged = await requestJson("/api/saved", {
      method: "POST",
      body: JSON.stringify({ ideaIds: [...state.saved] })
    });
    merged.savedIdeas.forEach((ideaId) => savedIdeas.add(String(ideaId)));
  }
  state.saved = savedIdeas;
  if (state.user) localStorage.removeItem("muse-saved");
  localStorage.setItem("muse-welcomed", "1");
  updateProfile();
  updateSavedCount();
  renderIdeas();
  authGate.hidden = true;
}

function promptEmailVerification(token) {
  verificationToken = token;
  showAuthGate("verify");
}

async function verifyEmailToken() {
  try {
    const result = await requestJson("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token: verificationToken })
    });
    verificationToken = "";
    pendingEmail = "";
    sessionStorage.removeItem("muse-pending-email");
    await applyAuthentication(result);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    showToast("Your email is verified. Welcome to Muse!");
  } catch (error) {
    showAuthGate("pending");
    authMessage.textContent = error.message;
  }
}

function getVisibleIdeas() {
  return ideas.filter((idea) => {
    const matchesCategory = state.category === "all" || idea.category === state.category;
    const matchesMedia = state.media === "all" || idea.type === state.media;
    const searchable = `${idea.title} ${idea.creator} ${idea.category} ${idea.type} ${idea.tags.join(" ")}`.toLowerCase();
    const matchesSearch = !state.query || searchable.includes(state.query.toLowerCase());
    const matchesView = state.view !== "saved" || state.saved.has(String(idea.id));
    const matchesFollowing = state.view !== "following" || ["Sofia Chen", "Alex Morgan", "Nina Park"].includes(idea.creator);
    return matchesCategory && matchesMedia && matchesSearch && matchesView && matchesFollowing;
  });
}

function renderIdeas() {
  const visibleIdeas = getVisibleIdeas();
  grid.replaceChildren();
  statusMessage.textContent = state.view === "saved" ? "Your saved ideas" : state.view === "following" ? "Fresh from people you follow" : "";

  if (!visibleIdeas.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<span aria-hidden="true">✳</span><h3>${state.view === "saved" && !state.query ? "Your collection starts here" : "No ideas found just yet"}</h3><p>${state.view === "saved" && !state.query ? "Save the things you love and they’ll find a home here." : "Try another search or explore a different filter."}</p>`;
    grid.append(empty);
    return;
  }

  visibleIdeas.forEach((idea, index) => {
    const card = document.createElement("article");
    card.className = "idea-card";
    const preview = idea.type === "video" && idea.mediaUrl
      ? `<video class="card-image" src="${escapeHtml(idea.mediaUrl)}" style="height:${idea.height}px" muted autoplay loop playsinline preload="metadata"></video>`
      : `<img class="card-image" src="${imageUrl(idea.type === "gif" && idea.mediaUrl ? idea.mediaUrl : idea.image)}" alt="${escapeHtml(idea.title)}" style="height:${idea.height}px" loading="lazy" />`;
    card.innerHTML = `
      <div class="card-media" role="button" tabindex="0" aria-label="View ${escapeHtml(idea.title)}">
        ${preview}
        <div class="card-top-actions">
          <span class="media-label">${idea.type === "gif" ? "GIF" : idea.type.toUpperCase()}</span>
          <div class="card-actions">
            <button class="card-action save-action ${state.saved.has(String(idea.id)) ? "is-saved" : ""}" aria-label="${state.saved.has(String(idea.id)) ? "Remove from saved ideas" : "Save idea"}" title="Save idea">${state.saved.has(String(idea.id)) ? "♥" : "♡"}</button>
            <button class="card-action share-action" aria-label="Send this idea to someone" title="Share this idea">↗</button>
          </div>
        </div>
        ${idea.type === "video" ? '<span class="play-indicator" aria-hidden="true">▶</span>' : ""}
      </div>
      <div class="card-caption">
        <div class="card-title-row"><h3 class="card-title">${escapeHtml(idea.title)}</h3><button class="card-ellipsis" aria-label="More options">···</button></div>
        <div class="card-meta"><span class="avatar-mini ${avatarTone(index)}">${escapeHtml(idea.initial)}</span><span>${escapeHtml(idea.creator)}</span><span class="meta-dot">·</span><span>${idea.type === "gif" ? "GIF" : idea.type === "video" ? "Video" : "Idea"}</span></div>
      </div>`;
    card.querySelector(".card-media").addEventListener("click", (event) => {
      if (!event.target.closest("button")) openIdea(idea);
    });
    card.querySelector(".card-media").addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
        event.preventDefault();
        openIdea(idea);
      }
    });
    card.querySelector(".save-action").addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSaved(idea.id);
    });
    card.querySelector(".share-action").addEventListener("click", (event) => {
      event.stopPropagation();
      shareIdea(idea);
    });
    card.querySelector(".card-ellipsis").addEventListener("click", () => showToast("More ways to organize your ideas are coming soon."));
    grid.append(card);
  });
}

function updateSavedCount() {
  const count = document.querySelector("#saved-count");
  count.textContent = state.saved.size;
  count.classList.toggle("visible", state.saved.size > 0);
}

async function toggleSaved(id) {
  const ideaId = String(id);
  const wasSaved = state.saved.has(ideaId);
  if (wasSaved) {
    state.saved.delete(ideaId);
    showToast("Removed from your saved ideas");
  } else {
    state.saved.add(ideaId);
    showToast("Saved to your ideas");
  }
  if (!state.user) localStorage.setItem("muse-saved", JSON.stringify([...state.saved]));
  updateSavedCount();
  renderIdeas();
  if (state.user) {
    try {
      const result = wasSaved
        ? await requestJson(`/api/saved/${encodeURIComponent(ideaId)}`, { method: "DELETE" })
        : await requestJson("/api/saved", { method: "POST", body: JSON.stringify({ ideaIds: [ideaId] }) });
      state.saved = new Set(result.savedIdeas.map(String));
      updateSavedCount();
      renderIdeas();
    } catch (error) {
      if (wasSaved) state.saved.add(ideaId);
      else state.saved.delete(ideaId);
      showToast(error.message);
      updateSavedCount();
      renderIdeas();
    }
  }
}

async function shareIdea(idea) {
  const url = new URL(location.pathname, location.origin);
  url.hash = `idea-${idea.id}`;
  const shareData = { title: idea.title, text: `${idea.title} — found on muse`, url: url.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch (error) {
    if (error.name === "AbortError") return;
  }
  await copyLink(url.href);
}

async function copyLink(url) {
  try {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied — send it to a friend!");
        return;
      } catch {
        // Fall back to the browser's copy command when clipboard permissions are unavailable.
      }
    }
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    let copied = false;
    try {
      input.select();
      copied = document.execCommand("copy");
    } finally {
      input.remove();
    }
    if (!copied) throw new Error("Clipboard access is unavailable.");
    showToast("Link copied — send it to a friend!");
  } catch {
    showToast("Couldn’t copy the link. Try sharing again.");
  }
}

function openIdea(idea) {
  state.selectedIdea = idea;
  const visual = idea.type === "video"
    ? `<div class="dialog-visual"><video controls playsinline poster="${escapeHtml(imageUrl(idea.image, 900))}"><source src="${escapeHtml(idea.mediaUrl || "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4")}" />Your browser does not support video playback.</video></div>`
    : `<div class="dialog-visual"><img src="${escapeHtml(idea.type === "gif" && idea.mediaUrl ? idea.mediaUrl : imageUrl(idea.image, 900))}" alt="${escapeHtml(idea.title)}" /></div>`;
  dialogContent.innerHTML = `
    <div class="dialog-layout">${visual}
      <div class="dialog-details">
        <p class="dialog-type">${escapeHtml(idea.type === "gif" ? "GIF" : idea.type)} · ${escapeHtml(idea.category)}</p>
        <h3>${escapeHtml(idea.title)}</h3><p>${escapeHtml(idea.description)}</p>
        <div class="dialog-creator"><span class="avatar-mini">${escapeHtml(idea.initial)}</span>Shared by <strong>${escapeHtml(idea.creator)}</strong></div>
        <div class="dialog-buttons"><button id="dialog-save">${state.saved.has(String(idea.id)) ? "♥ Saved" : "♡ Save idea"}</button><button id="dialog-share">↗ Send to a friend</button><button id="dialog-copy">Copy link</button></div>
      </div>
    </div>`;
  dialog.showModal();
  dialog.querySelector("#dialog-save").addEventListener("click", () => {
    toggleSaved(idea.id);
    if (dialog.open) dialog.querySelector("#dialog-save").textContent = state.saved.has(String(idea.id)) ? "♥ Saved" : "♡ Save idea";
  });
  dialog.querySelector("#dialog-share").addEventListener("click", () => shareIdea(idea));
  dialog.querySelector("#dialog-copy").addEventListener("click", () => {
    const url = new URL(location.pathname, location.origin);
    url.hash = `idea-${idea.id}`;
    copyLink(url.href);
  });
}

function openIdeaFromLocation() {
  if (!location.hash.startsWith("#idea-")) return;
  const sharedIdeaId = location.hash.slice("#idea-".length);
  const sharedIdea = ideas.find((idea) => String(idea.id) === sharedIdeaId);
  if (sharedIdea && (!dialog.open || state.selectedIdea?.id !== sharedIdea.id)) openIdea(sharedIdea);
}

function setView(view) {
  state.view = view;
  state.category = "all";
  state.media = "all";
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.category === "all"));
  document.querySelectorAll(".media-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.media === "all"));
  document.querySelector("#feed-title").textContent = view === "saved" ? "Your saved ideas" : view === "following" ? "From your people" : "Made for your mood";
  renderIdeas();
}

document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
  state.category = button.dataset.category;
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip === button));
  renderIdeas();
}));
document.querySelectorAll(".media-chip").forEach((button) => button.addEventListener("click", () => {
  state.media = button.dataset.media;
  document.querySelectorAll(".media-chip").forEach((chip) => chip.classList.toggle("selected", chip === button));
  renderIdeas();
}));
searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim();
  renderIdeas();
});
document.querySelectorAll(".trend-chip").forEach((button) => button.addEventListener("click", () => {
  searchInput.value = button.dataset.search;
  state.query = button.dataset.search;
  setView("discover");
  renderIdeas();
}));
document.querySelectorAll(".collection-link").forEach((button) => button.addEventListener("click", () => {
  setView("saved");
  showToast(`Showing ideas saved from ${button.dataset.collection}`);
}));

document.querySelector("#open-signup").addEventListener("click", () => showAuthGate("signup"));
document.querySelector("#open-login").addEventListener("click", () => showAuthGate("login"));
document.querySelector("#auth-back").addEventListener("click", () => showAuthGate("welcome"));
document.querySelector("#browse-first").addEventListener("click", () => {
  localStorage.setItem("muse-welcomed", "1");
  authGate.hidden = true;
});
document.querySelectorAll(".account-button, #account-shortcut").forEach((button) => {
  button.addEventListener("click", () => showAuthGate(state.user ? "account" : "welcome"));
});
document.querySelector("#account-done").addEventListener("click", () => { authGate.hidden = true; });
document.querySelector("#signout-button").addEventListener("click", async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.saved = new Set();
    localStorage.removeItem("muse-saved");
    updateProfile();
    updateSavedCount();
    renderIdeas();
    authGate.hidden = true;
    showToast("You’re signed out. You can keep browsing as a guest.");
  } catch (error) {
    authMessage.textContent = error.message;
  }
});
document.querySelector("#pending-back").addEventListener("click", () => showAuthGate("login"));
document.querySelector("#resend-verification").addEventListener("click", async () => {
  try {
    const result = await requestJson("/api/auth/resend", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail })
    });
    authMessage.textContent = result.message;
  } catch (error) {
    authMessage.textContent = error.message;
  }
});
document.querySelector("#confirm-email").addEventListener("click", verifyEmailToken);
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = document.querySelector("#auth-submit");
  const email = document.querySelector("#auth-email").value.trim().toLowerCase();
  const password = document.querySelector("#auth-password").value;
  const signingUp = authMode === "signup";
  submit.disabled = true;
  authMessage.textContent = "";
  try {
    const result = await requestJson(signingUp ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (signingUp) {
      pendingEmail = result.email || email;
      sessionStorage.setItem("muse-pending-email", pendingEmail);
      showAuthGate("pending");
      if (result.verificationUrl) {
        const verificationLink = document.querySelector("#local-verification-link");
        verificationLink.href = result.verificationUrl;
        verificationLink.hidden = false;
      }
      authMessage.textContent = result.message;
    } else {
      pendingEmail = "";
      sessionStorage.removeItem("muse-pending-email");
      await applyAuthentication(result);
      showToast(`Welcome back to Muse, ${state.user.email}`);
    }
  } catch (error) {
    if (error.result?.email && signingUp) {
      pendingEmail = error.result.email;
      sessionStorage.setItem("muse-pending-email", pendingEmail);
      showAuthGate("pending");
    }
    if (error.status === 403 && error.result?.email) {
      pendingEmail = error.result.email;
      sessionStorage.setItem("muse-pending-email", pendingEmail);
      showAuthGate("pending");
    }
    authMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#upload-button").addEventListener("click", () => document.querySelector("#file-input").click());
document.querySelector("#file-input").addEventListener("change", (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  fetch("/api/uploads", { method: "POST", body: formData })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The upload could not be completed.");
      ideas.unshift(...result.ideas);
      state.view = "discover";
      state.category = "all";
      state.media = "all";
      document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === "discover"));
      document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.category === "all"));
      document.querySelectorAll(".media-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.media === "all"));
      renderIdeas();
      showToast(`${result.ideas.length} ${result.ideas.length === 1 ? "idea" : "ideas"} added to your feed`);
    })
    .catch((error) => showToast(error.message))
    .finally(() => { event.target.value = ""; });
});

document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
document.querySelector("#new-collection").addEventListener("click", () => showToast("Collection creation is coming soon."));
document.querySelector("#invite-button").addEventListener("click", async () => {
  const url = new URL(location.pathname, location.origin);
  copyLink(url.href);
});
document.querySelector("#notifications-button").addEventListener("click", () => showToast("You’re all caught up!"));
document.querySelector("#sort-button").addEventListener("click", () => showToast("You’re seeing a mix picked just for you."));
document.querySelector("#load-more").addEventListener("click", () => showToast("You’re all caught up for now."));
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

window.addEventListener("hashchange", () => {
  const verification = location.hash.match(/^#verify-(.+)$/);
  if (verification) promptEmailVerification(verification[1]);
  else openIdeaFromLocation();
});
updateProfile();
updateSavedCount();
async function initializeApp() {
  try {
    const response = await fetch("/api/ideas");
    if (!response.ok) throw new Error("Could not load the idea feed.");
    ideas = await response.json();
    renderIdeas();
    openIdeaFromLocation();
  } catch (error) {
    statusMessage.textContent = error.message;
    showToast(error.message);
    return;
  }

  const verification = location.hash.match(/^#verify-(.+)$/);
  if (verification) {
    promptEmailVerification(verification[1]);
    return;
  }

  try {
    const result = await requestJson("/api/auth/me");
    if (result.user) {
      await applyAuthentication(result);
    } else {
      state.saved = new Set(loadLocalSavedIdeas());
      updateSavedCount();
      renderIdeas();
      if (localStorage.getItem("muse-welcomed") !== "1") showAuthGate("welcome");
    }
  } catch (error) {
    showToast(error.message);
    if (localStorage.getItem("muse-welcomed") !== "1") showAuthGate("welcome");
  }
}
initializeApp();
