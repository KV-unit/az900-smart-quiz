// Home screen: the "quiz builder".
import { h, plural } from "./dom.js";
import { filterPool, accuracy } from "./quiz.js";

const COUNT_CHOICES = [5, 10, 15, 20];

/**
 * @param ctx { topics, questions, progress, weakIds, backend }
 * @param actions { onStart(options), onReset() }
 */
export function renderHome(ctx, actions) {
  const { topics, questions, progress, weakIds, backend } = ctx;

  // ---- builder state (kept in closures; re-rendered pieces read from here) ----
  const selected = new Set(topics.map((t) => t.id));
  const state = { count: 10, difficulty: "any", onlyWeak: false };

  const perTopic = Object.fromEntries(topics.map((t) => [t.id, questions.filter((q) => q.topicId === t.id).length]));
  const totalAnswered = Object.values(progress).reduce((n, p) => n + p.answered, 0);
  const totalCorrect = Object.values(progress).reduce((n, p) => n + p.correct, 0);
  const overall = accuracy({ answered: totalAnswered, correct: totalCorrect });

  // ---- live summary -------------------------------------------------------
  const summaryMain = h("strong");
  const summarySub = h("span", { class: "sub" });
  const startBtn = h("button", { class: "btn", type: "submit" }, "Start quiz");

  const options = () => ({
    topicIds: [...selected],
    count: state.count,
    difficulty: state.difficulty,
    onlyIds: state.onlyWeak ? weakIds : null,
  });

  function refresh() {
    const available = filterPool(questions, options()).length;
    const n = Math.min(state.count, available);
    summaryMain.textContent = available === 0 ? "No questions match" : plural(n, "question");
    summarySub.textContent =
      available === 0
        ? "Pick at least one topic, or relax the difficulty."
        : `from ${plural(selected.size, "topic")}${available < state.count ? ` (only ${available} available)` : ""}`;
    startBtn.disabled = available === 0;
  }

  // ---- topic cards --------------------------------------------------------
  const checkboxes = new Map();
  function topicCard(t) {
    const stat = progress[t.id];
    const acc = accuracy(stat);
    const input = h("input", {
      type: "checkbox",
      checked: true,
      name: "topic",
      value: t.id,
      onchange: (e) => {
        e.target.checked ? selected.add(t.id) : selected.delete(t.id);
        refresh();
      },
    });
    checkboxes.set(t.id, input);
    return h(
      "label",
      { class: "topic-card" },
      input,
      h(
        "span",
        { class: "topic-body" },
        h("span", { class: "topic-top" }, h("span", { class: "topic-name" }, t.name), h("span", { class: "check", "aria-hidden": "true" }, "✓")),
        h(
          "span",
          { class: "topic-meta" },
          plural(perTopic[t.id], "question"),
          acc === null ? " · not attempted yet" : ` · ${acc}% correct so far`,
        ),
        acc !== null &&
          h("span", { class: "meter", role: "img", "aria-label": `${acc}% correct so far` }, h("span", { style: `width:${acc}%` })),
      ),
    );
  }

  const domains = [];
  for (const d of [1, 2, 3]) {
    const inDomain = topics.filter((t) => t.domain === d);
    if (!inDomain.length) continue;
    domains.push(
      h(
        "fieldset",
        { class: "domain" },
        h(
          "legend",
          { class: "domain-head" },
          h("h2", {}, inDomain[0].domainName),
          h("span", { class: "weight", title: "Approximate share of the exam" }, `${inDomain[0].domainWeight} of exam`),
        ),
        h("div", { class: "topic-grid" }, inDomain.map(topicCard)),
      ),
    );
  }

  function setAll(on) {
    for (const t of topics) {
      on ? selected.add(t.id) : selected.delete(t.id);
      checkboxes.get(t.id).checked = on;
    }
    refresh();
  }

  // ---- quiz options ---------------------------------------------------------
  const countSelect = h(
    "select",
    { id: "count", onchange: (e) => ((state.count = Number(e.target.value)), refresh()) },
    COUNT_CHOICES.map((n) => h("option", { value: n, selected: n === state.count }, `${n} questions`)),
  );

  const difficultyChoices = [
    ["any", "Any"],
    ["1", "Easy"],
    ["2", "Medium"],
    ["3", "Hard"],
  ];
  const segmented = h(
    "div",
    { class: "segmented" },
    difficultyChoices.map(([value, label]) =>
      h(
        "label",
        {},
        h("input", {
          type: "radio",
          name: "difficulty",
          value,
          checked: value === "any",
          onchange: () => ((state.difficulty = value), refresh()),
        }),
        h("span", {}, label),
      ),
    ),
  );

  const weakBox = h("input", {
    type: "checkbox",
    id: "weak",
    disabled: weakIds.length === 0,
    onchange: (e) => ((state.onlyWeak = e.target.checked), refresh()),
  });

  const optionsBox = h(
    "div",
    { class: "options" },
    h(
      "div",
      { class: "options-row" },
      h("div", { class: "field" }, h("label", { class: "field-label", for: "count" }, "Number of questions"), countSelect),
      h("fieldset", { class: "field" }, h("legend", {}, "Difficulty"), segmented),
    ),
    h(
      "div",
      { class: "check-row" },
      weakBox,
      h(
        "label",
        { for: "weak" },
        "Only questions I got wrong last time ",
        h("span", { class: "hint" }, weakIds.length ? `(${plural(weakIds.length, "weak spot")})` : "(none yet, answer some questions first)"),
      ),
    ),
  );

  // ---- assemble ---------------------------------------------------------------
  const form = h(
    "form",
    {
      class: "builder",
      onsubmit: (e) => {
        e.preventDefault();
        actions.onStart(options());
      },
    },
    h(
      "div",
      { class: "select-actions" },
      h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => setAll(true) }, "Select all topics"),
      h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => setAll(false) }, "Clear"),
    ),
    domains,
    optionsBox,
    h("div", { class: "action-bar" }, h("div", { class: "wrap action-inner" }, h("div", { class: "action-summary" }, summaryMain, summarySub), startBtn)),
  );

  const root = h(
    "div",
    {},
    h(
      "section",
      { class: "hero" },
      h("h1", {}, "Build your AZ-900 practice quiz"),
      h("p", {}, "Choose your topics, pick how many questions you want, and get instant feedback with a clear explanation for every answer."),
      h("p", { class: "mode-note" }, backend.note),
    ),
    h(
      "section",
      { class: "stats", "aria-label": "Your progress" },
      stat(String(totalAnswered), "answered"),
      stat(overall === null ? "–" : `${overall}%`, "correct overall"),
      stat(String(weakIds.length), "weak spots"),
    ),
    form,
    backend.canReset &&
      totalAnswered > 0 &&
      h(
        "p",
        { class: "mode-note", style: "margin-top:18px" },
        "Progress is stored in this browser. ",
        h(
          "button",
          {
            class: "btn-link",
            type: "button",
            onclick: () => {
              if (confirm("Clear all saved progress on this device?")) actions.onReset();
            },
          },
          "Reset my progress",
        ),
      ),
  );

  refresh();
  return root;
}

function stat(value, label) {
  return h("div", { class: "stat" }, h("div", { class: "stat-value" }, value), h("div", { class: "stat-label" }, label));
}
