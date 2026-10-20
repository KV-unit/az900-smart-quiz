// Results screen: score ring, topic breakdown, and a full answer review.
import { h, plural } from "./dom.js";
import { LETTERS, scoreMessage, summarise } from "./quiz.js";
import { confetti, countUp } from "./effects.js";

const R = 54;
const CIRC = 2 * Math.PI * R;

/**
 * @param ctx     { results, topicsById }
 * @param actions { onRetryMissed(missedIds), onAgain(), onHome() }
 */
export function renderResults(ctx, actions) {
  const { results, topicsById } = ctx;
  const s = summarise(results);
  const msg = scoreMessage(s.percent);
  const tier = s.percent >= 80 ? "great" : s.percent < 50 ? "low" : "ok";

  // ---- score ring -------------------------------------------------------------
  const SVG_NS = "http://www.w3.org/2000/svg";
  const circle = (cls) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("class", cls);
    c.setAttribute("cx", "60");
    c.setAttribute("cy", "60");
    c.setAttribute("r", String(R));
    return c;
  };
  const trackCircle = circle("track");
  const valueCircle = circle("value");
  valueCircle.setAttribute("stroke-dasharray", String(CIRC));
  valueCircle.setAttribute("stroke-dashoffset", String(CIRC));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("aria-hidden", "true");
  svg.append(trackCircle, valueCircle);

  const percentEl = h("div", { class: "ring-percent" }, "0%");
  const ring = h("div", { class: "ring", dataset: { tier } }, svg, h("div", { class: "ring-label" }, percentEl, h("div", { class: "ring-sub" }, `${s.correct} of ${s.total}`)));

  const missed = results.filter((r) => !r.correct);

  const scoreCard = h(
    "section",
    { class: "score-card", "aria-labelledby": "result-title" },
    ring,
    h("h1", { id: "result-title", tabindex: "-1" }, msg.title),
    h("p", {}, `You answered ${s.correct} of ${plural(s.total, "question")} correctly (${s.percent}%). ${msg.text}`),
    h(
      "div",
      { class: "mini-stats" },
      miniStat(String(s.correct), "correct"),
      miniStat(String(missed.length), "to review"),
      miniStat(String(s.bestStreak), "best streak"),
    ),
    h(
      "div",
      { class: "result-actions" },
      missed.length > 0 && h("button", { class: "btn", type: "button", onclick: () => actions.onRetryMissed(s.missedIds) }, `Retry the ${missed.length} I missed`),
      h("button", { class: missed.length > 0 ? "btn btn-secondary" : "btn", type: "button", onclick: actions.onAgain }, "New quiz, same settings"),
      h("button", { class: "btn btn-secondary", type: "button", onclick: actions.onHome }, "Back to quiz builder"),
    ),
  );

  // ---- per-topic breakdown ----------------------------------------------------
  const rows = Object.entries(s.byTopic).map(([topicId, t]) => {
    const pct = Math.round((t.correct / t.answered) * 100);
    return h(
      "div",
      { class: "bd-row" },
      h("div", { class: "bd-head" }, h("span", { class: "name" }, topicsById[topicId]?.name ?? topicId), h("span", { class: "num" }, `${t.correct}/${t.answered} correct`)),
      h("div", { class: "meter", dataset: { low: String(pct < 50) }, role: "img", "aria-label": `${pct}% correct` }, h("span", { style: `width:${pct}%` })),
    );
  });

  // ---- answer review ----------------------------------------------------------
  const review = results.map((r, i) => {
    const q = r.question;
    const text = (idx) => q.options.find((o) => o.index === idx)?.text ?? "";
    const letter = (idx) => LETTERS[q.options.findIndex((o) => o.index === idx)];
    const topic = topicsById[q.topicId];
    return h(
      "details",
      { dataset: { correct: String(r.correct) }, open: !r.correct },
      h("summary", {}, h("span", { class: "rv-mark", "aria-hidden": "true" }, r.correct ? "✓" : "✗"), h("span", {}, h("span", { class: "sr-only" }, r.correct ? "Correct. " : "Incorrect. "), `${i + 1}. ${q.question}`)),
      h(
        "div",
        { class: "rv-body" },
        !r.correct && h("div", {}, h("div", { class: "label" }, "Your answer"), h("div", { class: "yours-wrong" }, `${letter(r.chosenIndex)}. ${text(r.chosenIndex)}`)),
        h("div", {}, h("div", { class: "label" }, "Correct answer"), h("div", { class: "right" }, `${letter(r.correctIndex)}. ${text(r.correctIndex)}`)),
        h("div", {}, h("div", { class: "label" }, "Why"), h("div", {}, r.explanation)),
        topic?.learnUrl && h("a", { href: topic.learnUrl, target: "_blank", rel: "noopener noreferrer" }, `Study more: ${topic.name} (Microsoft Learn, opens in a new tab)`),
      ),
    );
  });

  const root = h(
    "div",
    { class: "results" },
    scoreCard,
    h("section", {}, h("h2", { class: "section-title" }, "Score by topic"), h("div", { class: "breakdown" }, rows)),
    h("section", {}, h("h2", { class: "section-title" }, "Review your answers"), h("div", { class: "review" }, review)),
  );

  // Run the animations once the element is in the page.
  function play() {
    requestAnimationFrame(() => {
      valueCircle.setAttribute("stroke-dashoffset", String(CIRC * (1 - s.percent / 100)));
    });
    countUp(percentEl, s.percent, { suffix: "%" });
    if (s.percent >= 80) confetti();
    root.querySelector("#result-title")?.focus({ preventScroll: true });
  }

  return { el: root, play };
}

function miniStat(value, label) {
  return h("div", { class: "stat" }, h("div", { class: "stat-value" }, value), h("div", { class: "stat-label" }, label));
}
