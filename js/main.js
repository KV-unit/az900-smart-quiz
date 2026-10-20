// App entry point: quiz builder, quiz screen with instant feedback, and results.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS_CDN } from "./config.js";
import { initBackend } from "./data.js";
import { renderHome } from "./home.js";
import { renderQuiz } from "./quizview.js";
import { renderResults } from "./results.js";
import { h, mount } from "./dom.js";
import { buildQuiz } from "./quiz.js";

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

function newSessionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
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
let bank = { topics: [], questions: [] };
let activeQuiz = null; // { destroy() } for the quiz screen currently shown

function leaveQuiz() {
  activeQuiz?.destroy();
  activeQuiz = null;
}

async function showHome() {
  leaveQuiz();
  mount(app, h("p", { class: "loading", role: "status" }, "Loading…"));
  try {
    const [topics, questions, progress, weakIds] = await Promise.all([
      backend.getTopics(),
      backend.getQuestions(),
      backend.getProgress(),
      backend.getWeakIds(),
    ]);
    bank = { topics, questions };
    mount(
      app,
      renderHome(
        { topics, questions, progress, weakIds, backend },
        {
          onStart: (options) => startQuiz(options),
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

let lastOptions = null; // so "same settings" can start another quiz

function startQuiz(options, remember = true) {
  leaveQuiz();
  if (remember) lastOptions = options;
  const quiz = buildQuiz(bank.questions, options);
  if (quiz.length === 0) return showHome();
  const sessionId = newSessionId();
  const topicsById = Object.fromEntries(bank.topics.map((t) => [t.id, t]));

  const view = renderQuiz(
    {
      quiz,
      topicsById,
      submit: (question, chosenIndex) => backend.submitAnswer({ questionId: question.id, chosenIndex, sessionId }),
    },
    {
      onFinish: (results) => showResults(results),
      onExit: showHome,
    },
  );
  activeQuiz = view;
  mount(app, view.el);
  window.scrollTo({ top: 0 });
}

function showResults(results) {
  leaveQuiz();
  const topicsById = Object.fromEntries(bank.topics.map((t) => [t.id, t]));
  const view = renderResults(
    { results, topicsById },
    {
      onRetryMissed: (missedIds) =>
        startQuiz({ topicIds: null, difficulty: "any", onlyIds: missedIds, count: missedIds.length }, false),
      onAgain: () => startQuiz({ ...lastOptions }),
      onHome: showHome,
    },
  );
  mount(app, view.el);
  window.scrollTo({ top: 0 });
  view.play();
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
