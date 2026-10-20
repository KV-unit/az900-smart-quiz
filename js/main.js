// App entry point (step 6: quiz builder home screen).
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS_CDN } from "./config.js";
import { initBackend } from "./data.js";
import { renderHome } from "./home.js";
import { h, mount } from "./dom.js";
import { filterPool } from "./quiz.js";

const app = document.getElementById("app");
const modePill = document.getElementById("mode-pill");
const themeToggle = document.getElementById("theme-toggle");

// ---- small helpers ---------------------------------------------------------
function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem("az900quiz.probe");
    return s;
  } catch {
    return null;
  }
}
const storage = safeStorage();

async function loadData() {
  const res = await fetch("data/questions.json");
  if (!res.ok) throw new Error(`Could not load data/questions.json (${res.status})`);
  return res.json();
}

function setupTheme() {
  themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const current =
      root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      storage?.setItem("az900quiz.theme", next);
    } catch {
      /* ignore */
    }
  });
}

function showError(message, retry) {
  mount(
    app,
    h(
      "div",
      { class: "error-box", role: "alert" },
      h("strong", {}, "Something went wrong"),
      h("p", {}, message),
      h("button", { class: "btn", type: "button", onclick: retry }, "Try again"),
    ),
  );
}

// ---- app --------------------------------------------------------------------
let backend;

async function showHome() {
  mount(app, h("p", { class: "loading", role: "status" }, "Loading…"));
  try {
    const [topics, questions, progress, weakIds] = await Promise.all([
      backend.getTopics(),
      backend.getQuestions(),
      backend.getProgress(),
      backend.getWeakIds(),
    ]);
    mount(
      app,
      renderHome(
        { topics, questions, progress, weakIds, backend },
        {
          onStart: (options) => showPlaceholder(questions, options),
          onReset: async () => {
            await backend.resetProgress();
            showHome();
          },
        },
      ),
    );
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    showError(err.message, showHome);
  }
}

// The quiz screen is built in the next step. Until then, show what was built.
function showPlaceholder(questions, options) {
  const available = filterPool(questions, options).length;
  mount(
    app,
    h(
      "section",
      { class: "hero" },
      h("h1", {}, "Quiz built"),
      h("p", {}, `${Math.min(options.count, available)} questions are ready. The quiz screen arrives in the next step.`),
      h("button", { class: "btn", type: "button", onclick: showHome }, "Back"),
    ),
  );
}

async function boot() {
  setupTheme();
  try {
    backend = await initBackend(
      { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, cdn: SUPABASE_JS_CDN },
      { loadData, storage, importSupabase: (cdn) => import(cdn) },
    );
    modePill.hidden = false;
    modePill.dataset.mode = backend.mode;
    modePill.textContent = backend.mode === "supabase" ? "Supabase" : "Demo mode";
    modePill.title = backend.note;
    await showHome();
  } catch (err) {
    console.error(err);
    showError(err.message, boot);
  }
}

boot();
