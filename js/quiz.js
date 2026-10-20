// Pure quiz logic: no DOM, no network. Easy to unit-test.

export const DIFFICULTY_LABELS = { 1: "Easy", 2: "Medium", 3: "Hard" };
export const LETTERS = ["A", "B", "C", "D"];

/** Fisher-Yates shuffle that returns a new array. `rng` is injectable for tests. */
export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Filter the question bank.
 *  topicIds:   null = all topics, [] = no topics, otherwise only these topics
 *  difficulty: "any" or 1 | 2 | 3
 *  onlyIds:    null = no restriction, otherwise only these question ids
 */
export function filterPool(questions, { topicIds = null, difficulty = "any", onlyIds = null } = {}) {
  return questions.filter(
    (q) =>
      (topicIds === null || topicIds.includes(q.topicId)) &&
      (difficulty === "any" || q.difficulty === Number(difficulty)) &&
      (onlyIds === null || onlyIds.includes(q.id)),
  );
}

/**
 * Build a quiz: pick up to `count` random questions from the filtered pool
 * and shuffle each question's options. Every option keeps its original
 * `index`, which is what gets sent to the server when answering.
 */
export function buildQuiz(questions, options = {}, rng = Math.random) {
  const { count = 10 } = options;
  const pool = filterPool(questions, options);
  return shuffle(pool, rng)
    .slice(0, count)
    .map((q) => ({
      ...q,
      options: shuffle(
        q.options.map((text, index) => ({ text, index })),
        rng,
      ),
    }));
}

/**
 * Summarise a finished quiz.
 * results: [{ question, chosenIndex, correct, correctIndex, explanation }]
 */
export function summarise(results) {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  let streak = 0;
  let bestStreak = 0;
  for (const r of results) {
    streak = r.correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  const byTopic = {};
  for (const r of results) {
    const t = (byTopic[r.question.topicId] ||= { answered: 0, correct: 0 });
    t.answered += 1;
    if (r.correct) t.correct += 1;
  }
  return {
    total,
    correct,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    bestStreak,
    byTopic,
    missedIds: results.filter((r) => !r.correct).map((r) => r.question.id),
  };
}

/** Friendly feedback message for a score. Deliberately makes no promise about the real exam. */
export function scoreMessage(percent) {
  if (percent >= 90) return { title: "Outstanding", text: "You know this material well. Try a harder mix or another topic." };
  if (percent >= 70) return { title: "Solid work", text: "Review the questions you missed to lock these ideas in." };
  if (percent >= 50) return { title: "Getting there", text: "Read the explanations below, then retry the questions you missed." };
  return { title: "Keep practising", text: "Every wrong answer is a chance to learn. Start with the explanations below." };
}

/** Accuracy percent from {answered, correct}, or null if nothing answered yet. */
export function accuracy(stat) {
  if (!stat || !stat.answered) return null;
  return Math.round((stat.correct / stat.answered) * 100);
}
