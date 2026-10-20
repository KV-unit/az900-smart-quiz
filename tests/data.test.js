import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoBackend, createSupabaseBackend, initBackend, normaliseTopic } from "../js/data.js";

const bank = JSON.parse(readFileSync(new URL("../data/questions.json", import.meta.url), "utf8"));
const loadData = async () => structuredClone(bank);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

// ---- the question bank itself ----------------------------------------
test("question bank is well-formed", () => {
  const topicIds = new Set(bank.topics.map((t) => t.id));
  const ids = new Set();
  for (const q of bank.questions) {
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    assert.ok(topicIds.has(q.topic), `${q.id} has unknown topic`);
    assert.equal(q.options.length, 4, `${q.id} needs 4 options`);
    assert.equal(new Set(q.options).size, 4, `${q.id} has duplicate options`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${q.id} bad answer index`);
    assert.ok([1, 2, 3].includes(q.difficulty), `${q.id} bad difficulty`);
    assert.ok(q.question.length > 10 && q.explanation.length > 20, `${q.id} too short`);
  }
  for (const t of topicIds) {
    assert.ok(bank.questions.some((q) => q.topic === t), `topic ${t} has no questions`);
  }
});

// ---- demo backend ------------------------------------------------------
test("demo backend never exposes the answer key in getQuestions()", async () => {
  const b = createDemoBackend({ loadData, storage: memoryStorage() });
  const qs = await b.getQuestions();
  assert.equal(qs.length, bank.questions.length);
  for (const q of qs) {
    assert.equal("answer" in q, false);
    assert.equal("explanation" in q, false);
  }
});

test("demo backend scores answers and reports explanation", async () => {
  const b = createDemoBackend({ loadData, storage: memoryStorage() });
  const q = bank.questions[0];
  const wrong = (q.answer + 1) % 4;
  const bad = await b.submitAnswer({ questionId: q.id, chosenIndex: wrong, sessionId: "s1" });
  assert.equal(bad.correct, false);
  assert.equal(bad.correctIndex, q.answer);
  assert.equal(bad.explanation, q.explanation);
  const good = await b.submitAnswer({ questionId: q.id, chosenIndex: q.answer, sessionId: "s1" });
  assert.equal(good.correct, true);
});

test("demo backend rejects bad input", async () => {
  const b = createDemoBackend({ loadData, storage: memoryStorage() });
  await assert.rejects(b.submitAnswer({ questionId: "nope", chosenIndex: 1, sessionId: "s" }), /Unknown question/);
  await assert.rejects(b.submitAnswer({ questionId: bank.questions[0].id, chosenIndex: 9, sessionId: "s" }), /between 0 and 3/);
});

test("demo progress and weak spots follow the LATEST answer", async () => {
  const b = createDemoBackend({ loadData, storage: memoryStorage() });
  const [q1, q2] = bank.questions;
  await b.submitAnswer({ questionId: q1.id, chosenIndex: (q1.answer + 1) % 4, sessionId: "s" }); // wrong
  await b.submitAnswer({ questionId: q2.id, chosenIndex: (q2.answer + 1) % 4, sessionId: "s" }); // wrong
  assert.deepEqual((await b.getWeakIds()).sort(), [q1.id, q2.id].sort());
  await b.submitAnswer({ questionId: q1.id, chosenIndex: q1.answer, sessionId: "s2" }); // now right
  assert.deepEqual(await b.getWeakIds(), [q2.id]);
  const progress = await b.getProgress();
  assert.equal(progress[q1.topic].answered >= 2, true);
});

test("demo progress survives a reload through storage and can be reset", async () => {
  const storage = memoryStorage();
  const a = createDemoBackend({ loadData, storage });
  const q = bank.questions[3];
  await a.submitAnswer({ questionId: q.id, chosenIndex: q.answer, sessionId: "s" });
  const reloaded = createDemoBackend({ loadData, storage });
  assert.equal((await reloaded.getProgress())[q.topic].correct, 1);
  await reloaded.resetProgress();
  assert.deepEqual(await reloaded.getProgress(), {});
});

test("demo backend keeps working when storage throws", async () => {
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const b = createDemoBackend({ loadData, storage: broken });
  const q = bank.questions[0];
  const res = await b.submitAnswer({ questionId: q.id, chosenIndex: q.answer, sessionId: "s" });
  assert.equal(res.correct, true);
});

// ---- supabase backend (against a fake client) -------------------------
function fakeClient(responses) {
  const calls = [];
  const builder = (table) => {
    const state = { table, filters: [] };
    const api = {
      select(cols) { state.cols = cols; return api; },
      order(col) { state.order = col; return api; },
      eq(col, val) { state.filters.push([col, val]); return api; },
      then(resolve, reject) {
        calls.push({ type: "from", ...state });
        return Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return {
    calls,
    from: builder,
    rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      return Promise.resolve(responses.rpc ?? { data: null, error: null });
    },
  };
}

test("supabase backend asks only for non-secret question columns", async () => {
  const client = fakeClient({
    questions: { data: [{ id: "x", topic_id: "t", question: "Q", options: ["a", "b", "c", "d"], difficulty: 2 }], error: null },
  });
  const qs = await createSupabaseBackend(client).getQuestions();
  assert.deepEqual(qs, [{ id: "x", topicId: "t", question: "Q", options: ["a", "b", "c", "d"], difficulty: 2 }]);
  const call = client.calls[0];
  assert.equal(call.table, "questions");
  assert.ok(!call.cols.includes("correct_index"));
  assert.ok(!call.cols.includes("explanation"));
  assert.ok(!call.cols.includes("*"));
});

test("supabase submitAnswer calls the RPC and maps the result", async () => {
  const client = fakeClient({ rpc: { data: { correct: true, correct_index: 2, explanation: "Because." }, error: null } });
  const res = await createSupabaseBackend(client).submitAnswer({ questionId: "q1", chosenIndex: 2, sessionId: "sess" });
  assert.deepEqual(res, { correct: true, correctIndex: 2, explanation: "Because." });
  assert.deepEqual(client.calls[0], { type: "rpc", name: "submit_answer", args: { p_question_id: "q1", p_chosen: 2, p_session_id: "sess" } });
});

test("supabase errors become readable exceptions", async () => {
  const client = fakeClient({ rpc: { data: null, error: { message: "permission denied" } } });
  await assert.rejects(createSupabaseBackend(client).submitAnswer({ questionId: "q", chosenIndex: 0, sessionId: "s" }), /Could not submit answer: permission denied/);
});

test("supabase progress and weak ids use the per-user views", async () => {
  const client = fakeClient({
    my_topic_progress: { data: [{ topic_id: "storage", answered: 4, correct: 3 }], error: null },
    my_weak_questions: { data: [{ question_id: "sg-03" }], error: null },
  });
  const b = createSupabaseBackend(client);
  assert.deepEqual(await b.getProgress(), { storage: { answered: 4, correct: 3 } });
  assert.deepEqual(await b.getWeakIds(), ["sg-03"]);
  const weak = client.calls.find((c) => c.table === "my_weak_questions");
  assert.deepEqual(weak.filters, [["is_correct", false]]);
});

test("normaliseTopic maps snake_case columns", () => {
  const t = normaliseTopic({ id: "i", domain: 2, domain_name: "D", domain_weight: "35-40%", name: "N", sort_order: 4, learn_url: "u" });
  assert.deepEqual(t, { id: "i", domain: 2, domainName: "D", domainWeight: "35-40%", name: "N", sortOrder: 4, learnUrl: "u" });
});

// ---- backend selection -------------------------------------------------
test("initBackend uses demo mode when Supabase is not configured", async () => {
  const b = await initBackend({ url: "", key: "" }, { loadData, storage: memoryStorage() });
  assert.equal(b.mode, "demo");
  assert.match(b.note, /not configured/);
});

test("initBackend signs in anonymously and returns supabase mode", async () => {
  let signedIn = false;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => { signedIn = true; return { error: null }; },
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  };
  const b = await initBackend(
    { url: "https://x.supabase.co", key: "k", cdn: "cdn" },
    { loadData, storage: memoryStorage(), importSupabase: async () => ({ createClient: () => client }) },
  );
  assert.equal(b.mode, "supabase");
  assert.equal(signedIn, true);
});

test("initBackend falls back to demo mode with a reason when Supabase fails", async () => {
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const b = await initBackend(
      { url: "https://x.supabase.co", key: "k", cdn: "cdn" },
      { loadData, storage: memoryStorage(), importSupabase: async () => { throw new Error("network down"); } },
    );
    assert.equal(b.mode, "demo");
    assert.match(b.note, /network down/);
  } finally {
    console.warn = origWarn;
  }
});
