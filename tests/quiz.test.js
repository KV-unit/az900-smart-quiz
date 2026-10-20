import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, filterPool, buildQuiz, summarise, scoreMessage, accuracy } from "../js/quiz.js";

const bank = [
  { id: "a1", topicId: "t1", question: "Q1", options: ["w", "x", "y", "z"], difficulty: 1 },
  { id: "a2", topicId: "t1", question: "Q2", options: ["w", "x", "y", "z"], difficulty: 2 },
  { id: "b1", topicId: "t2", question: "Q3", options: ["w", "x", "y", "z"], difficulty: 3 },
  { id: "b2", topicId: "t2", question: "Q4", options: ["w", "x", "y", "z"], difficulty: 2 },
];

// Deterministic "random" generator for repeatable tests
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

test("shuffle keeps every item and does not mutate the input", () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, seeded(7));
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

test("filterPool: null topics means all, empty array means none", () => {
  assert.equal(filterPool(bank, { topicIds: null }).length, 4);
  assert.equal(filterPool(bank, { topicIds: [] }).length, 0);
  assert.equal(filterPool(bank, { topicIds: ["t2"] }).length, 2);
});

test("filterPool: difficulty and onlyIds narrow the pool", () => {
  assert.deepEqual(filterPool(bank, { difficulty: 2 }).map((q) => q.id), ["a2", "b2"]);
  assert.deepEqual(filterPool(bank, { onlyIds: ["b1", "a1"] }).map((q) => q.id), ["a1", "b1"]);
  assert.equal(filterPool(bank, { difficulty: "3", topicIds: ["t1"] }).length, 0);
});

test("buildQuiz respects count and keeps original option indexes", () => {
  const quiz = buildQuiz(bank, { count: 3 }, seeded(3));
  assert.equal(quiz.length, 3);
  for (const q of quiz) {
    assert.equal(q.options.length, 4);
    assert.deepEqual(q.options.map((o) => o.index).sort(), [0, 1, 2, 3]);
    // the text at each original index is preserved
    for (const o of q.options) assert.equal(o.text, ["w", "x", "y", "z"][o.index]);
  }
});

test("buildQuiz returns fewer questions when the pool is small", () => {
  assert.equal(buildQuiz(bank, { count: 20, topicIds: ["t1"] }).length, 2);
  assert.equal(buildQuiz(bank, { count: 5, topicIds: [] }).length, 0);
});

test("summarise counts score, best streak, topics and missed ids", () => {
  const r = (id, topicId, correct) => ({ question: { id, topicId }, correct });
  const s = summarise([r("a", "t1", true), r("b", "t1", true), r("c", "t2", false), r("d", "t2", true), r("e", "t1", true)]);
  assert.equal(s.total, 5);
  assert.equal(s.correct, 4);
  assert.equal(s.percent, 80);
  assert.equal(s.bestStreak, 2);
  assert.deepEqual(s.byTopic, { t1: { answered: 3, correct: 3 }, t2: { answered: 2, correct: 1 } });
  assert.deepEqual(s.missedIds, ["c"]);
});

test("summarise handles an empty quiz", () => {
  const s = summarise([]);
  assert.equal(s.percent, 0);
  assert.equal(s.total, 0);
});

test("scoreMessage covers each band", () => {
  assert.equal(scoreMessage(95).title, "Outstanding");
  assert.equal(scoreMessage(75).title, "Solid work");
  assert.equal(scoreMessage(55).title, "Getting there");
  assert.equal(scoreMessage(10).title, "Keep practising");
});

test("accuracy returns null when nothing was answered", () => {
  assert.equal(accuracy(undefined), null);
  assert.equal(accuracy({ answered: 0, correct: 0 }), null);
  assert.equal(accuracy({ answered: 4, correct: 3 }), 75);
});
