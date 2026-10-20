// Quiz screen: one question at a time with instant feedback.
import { h, mount } from "./dom.js";
import { LETTERS, DIFFICULTY_LABELS } from "./quiz.js";

/**
 * @param ctx     { quiz, topicsById, submit(question, chosenIndex) }
 * @param actions { onFinish(results), onExit() }
 * @returns { el, destroy() }  destroy() removes the keyboard handler.
 */
export function renderQuiz(ctx, actions) {
  const { quiz, topicsById, submit } = ctx;
  const results = [];
  let index = 0;
  let answered = false;
  let busy = false;
  let streak = 0;
  let optionButtons = [];
  let nextBtn = null;

  const root = h("section", { class: "quiz", "aria-label": "Quiz" });
  const countEl = h("span", { class: "quiz-count" });
  const streakEl = h("span", { class: "streak", "aria-live": "off" });
  const bar = h("div", { style: "width:0%" });
  const progress = h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(quiz.length) }, bar);
  const body = h("div");

  const exitBtn = h(
    "button",
    {
      class: "btn btn-secondary btn-small",
      type: "button",
      onclick: () => {
        if (results.length === 0 || confirm("Leave this quiz? The answers you have given are already saved.")) actions.onExit();
      },
    },
    "Exit quiz",
  );

  mount(root, h("div", { class: "quiz-top" }, countEl, streakEl, h("span", { class: "spacer" }), exitBtn), progress, body);

  function updateHeader() {
    countEl.textContent = `Question ${index + 1} of ${quiz.length}`;
    progress.setAttribute("aria-valuenow", String(index));
    progress.setAttribute("aria-label", `${index} of ${quiz.length} questions answered`);
    bar.style.width = `${(index / quiz.length) * 100}%`;
    streakEl.textContent = streak >= 2 ? `Streak ${streak}` : "Streak 0";
    streakEl.dataset.hot = String(streak >= 2);
  }

  function showQuestion() {
    const q = quiz[index];
    const topic = topicsById[q.topicId];
    answered = false;
    busy = false;
    updateHeader();

    const feedback = h("div", { id: "feedback", role: "status", "aria-live": "polite" });
    const errorBox = h("div", { class: "inline-error", role: "alert", hidden: true });

    optionButtons = q.options.map((opt, position) =>
      h(
        "button",
        {
          class: "option",
          type: "button",
          dataset: { index: String(opt.index) },
          "aria-describedby": "feedback",
          onclick: () => choose(position),
        },
        h("span", { class: "letter", "aria-hidden": "true" }, LETTERS[position]),
        h("span", { class: "opt-text" }, opt.text),
        h("span", { class: "mark", "aria-hidden": "true" }),
      ),
    );

    nextBtn = h(
      "button",
      { class: "btn", type: "button", hidden: true, onclick: next },
      index === quiz.length - 1 ? "See results" : "Next question",
    );

    mount(
      body,
      h(
        "div",
        { class: "q-card" },
        h(
          "div",
          { class: "chips" },
          topic && h("span", { class: "chip" }, topic.name),
          h("span", { class: "chip", "data-level": String(q.difficulty) }, DIFFICULTY_LABELS[q.difficulty] || "Medium"),
        ),
        h("h2", { class: "q-text", id: "q-text", tabindex: "-1" }, q.question),
        h("ul", { class: "answers", role: "list", "aria-labelledby": "q-text" }, optionButtons.map((b) => h("li", {}, b))),
        errorBox,
        feedback,
        h("div", { class: "quiz-actions" }, h("span", { class: "hint-keys" }, "Tip: press 1-4 or A-D to answer, Enter for next."), nextBtn),
      ),
    );
    body.querySelector("#q-text").focus({ preventScroll: true });
  }

  async function choose(position) {
    if (answered || busy) return;
    const q = quiz[index];
    const chosen = q.options[position];
    const button = optionButtons[position];
    const errorBox = body.querySelector(".inline-error");
    errorBox.hidden = true;
    busy = true;
    button.classList.add("is-pending");
    optionButtons.forEach((b) => b.setAttribute("aria-disabled", "true"));

    let outcome;
    try {
      outcome = await submit(q, chosen.index);
    } catch (err) {
      console.error(err);
      busy = false;
      button.classList.remove("is-pending");
      optionButtons.forEach((b) => b.removeAttribute("aria-disabled"));
      mount(errorBox, h("span", {}, `Could not save your answer: ${err.message}`), h("button", { class: "btn btn-small", type: "button", onclick: () => choose(position) }, "Try again"));
      errorBox.hidden = false;
      return;
    }

    busy = false;
    answered = true;
    button.classList.remove("is-pending");
    results.push({
      question: q,
      chosenIndex: chosen.index,
      correct: outcome.correct,
      correctIndex: outcome.correctIndex,
      explanation: outcome.explanation,
    });

    // Colour the options. Text marks (not just colour) show the result.
    optionButtons.forEach((b, i) => {
      const optionIndex = q.options[i].index;
      const mark = b.querySelector(".mark");
      if (optionIndex === outcome.correctIndex) {
        b.classList.add("is-correct");
        mark.textContent = "✓";
      } else if (i === position) {
        b.classList.add("is-wrong", "shake");
        mark.textContent = "✗";
      } else {
        b.classList.add("is-dim");
      }
    });

    streak = outcome.correct ? streak + 1 : 0;
    updateHeader();
    if (outcome.correct && streak >= 2) {
      streakEl.classList.remove("pop");
      void streakEl.offsetWidth; // restart the animation
      streakEl.classList.add("pop");
    }

    const topic = topicsById[q.topicId];
    const correctText = q.options.find((o) => o.index === outcome.correctIndex)?.text;
    const feedback = body.querySelector("#feedback");
    feedback.dataset.correct = String(outcome.correct);
    feedback.className = "feedback";
    mount(
      feedback,
      h("div", { class: "feedback-title" }, outcome.correct ? "Correct!" : "Not quite"),
      !outcome.correct && h("div", { class: "correct-line" }, `The correct answer is: ${correctText}`),
      h("div", { class: "why" }, outcome.explanation),
      topic?.learnUrl && h("a", { href: topic.learnUrl, target: "_blank", rel: "noopener noreferrer" }, "Read more on Microsoft Learn (opens in a new tab)"),
    );

    nextBtn.hidden = false;
    nextBtn.focus();
    nextBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function next() {
    if (!answered) return;
    index += 1;
    if (index >= quiz.length) {
      bar.style.width = "100%";
      actions.onFinish(results);
    } else {
      showQuestion();
      window.scrollTo({ top: 0 });
    }
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();
    if (!answered) {
      const position = "1234".includes(key) && key.length === 1 ? Number(key) - 1 : "abcd".includes(key) && key.length === 1 ? "abcd".indexOf(key) : -1;
      if (position >= 0 && position < optionButtons.length) choose(position);
    } else if (key === "enter" || key === "arrowright") {
      if (document.activeElement !== nextBtn) next();
    }
  }
  document.addEventListener("keydown", onKey);

  showQuestion();
  return { el: root, destroy: () => document.removeEventListener("keydown", onKey) };
}
