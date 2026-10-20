// Data layer. The UI talks to a "backend" object with the same methods
// whether it is backed by Supabase or by local demo data:
//
//   mode                     "supabase" | "demo"
//   note                     optional message shown to the learner
//   getTopics()              -> [{ id, domain, domainName, domainWeight, name, sortOrder, learnUrl }]
//   getQuestions()           -> [{ id, topicId, question, options[4], difficulty }]   (NO answers)
//   submitAnswer({...})      -> { correct, correctIndex, explanation }
//   getProgress()            -> { [topicId]: { answered, correct } }
//   getWeakIds()             -> [questionId]  (latest answer was wrong)
//   resetProgress()          -> demo mode only

const DEMO_KEY = "az900quiz.demo.answers.v1";

export function normaliseTopic(row) {
  return {
    id: row.id,
    domain: row.domain,
    domainName: row.domain_name,
    domainWeight: row.domain_weight,
    name: row.name,
    sortOrder: row.sort_order,
    learnUrl: row.learn_url || "",
  };
}

function fail(prefix, error) {
  const err = new Error(`${prefix}: ${error?.message || error}`);
  err.cause = error;
  return err;
}

// ---------------------------------------------------------------------
// Supabase backend. The answer key never reaches the browser until an
// answer is submitted through the submit_answer() database function.
// ---------------------------------------------------------------------
export function createSupabaseBackend(client) {
  return {
    mode: "supabase",
    note: "Connected to Supabase. Progress is saved to your anonymous account.",

    async getTopics() {
      const { data, error } = await client.from("topics").select("*").order("sort_order");
      if (error) throw fail("Could not load topics", error);
      return data.map(normaliseTopic);
    },

    async getQuestions() {
      const { data, error } = await client
        .from("questions")
        .select("id, topic_id, question, options, difficulty")
        .order("id");
      if (error) throw fail("Could not load questions", error);
      return data.map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        question: r.question,
        options: r.options,
        difficulty: r.difficulty,
      }));
    },

    async submitAnswer({ questionId, chosenIndex, sessionId }) {
      const { data, error } = await client.rpc("submit_answer", {
        p_question_id: questionId,
        p_chosen: chosenIndex,
        p_session_id: sessionId,
      });
      if (error) throw fail("Could not submit answer", error);
      return { correct: data.correct, correctIndex: data.correct_index, explanation: data.explanation };
    },

    async getProgress() {
      const { data, error } = await client.from("my_topic_progress").select("topic_id, answered, correct");
      if (error) throw fail("Could not load progress", error);
      return Object.fromEntries(data.map((r) => [r.topic_id, { answered: r.answered, correct: r.correct }]));
    },

    async getWeakIds() {
      const { data, error } = await client
        .from("my_weak_questions")
        .select("question_id")
        .eq("is_correct", false);
      if (error) throw fail("Could not load weak spots", error);
      return data.map((r) => r.question_id);
    },

    canReset: false,
  };
}

// ---------------------------------------------------------------------
// Demo backend: works with no server. Reads data/questions.json and keeps
// answers in localStorage (or in memory if storage is blocked).
// ---------------------------------------------------------------------
export function createDemoBackend({ loadData, storage = null, note = "Demo mode: progress is saved in this browser only." }) {
  let bank = null;
  let rows = [];
  try {
    rows = JSON.parse(storage?.getItem(DEMO_KEY) || "[]");
  } catch {
    rows = [];
  }
  const persist = () => {
    try {
      storage?.setItem(DEMO_KEY, JSON.stringify(rows));
    } catch {
      /* storage blocked: keep working in memory */
    }
  };
  const load = async () => (bank ||= await loadData());

  return {
    mode: "demo",
    note,
    canReset: true,

    async getTopics() {
      return (await load()).topics.map(normaliseTopic);
    },

    async getQuestions() {
      return (await load()).questions.map((q) => ({
        id: q.id,
        topicId: q.topic,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
      }));
    },

    async submitAnswer({ questionId, chosenIndex, sessionId }) {
      const q = (await load()).questions.find((x) => x.id === questionId);
      if (!q) throw new Error(`Unknown question: ${questionId}`);
      if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex > 3) {
        throw new Error("Chosen option must be between 0 and 3");
      }
      const correct = chosenIndex === q.answer;
      rows.push({ q: q.id, t: q.topic, c: correct, s: sessionId, at: Date.now() });
      persist();
      return { correct, correctIndex: q.answer, explanation: q.explanation };
    },

    async getProgress() {
      const out = {};
      for (const r of rows) {
        const t = (out[r.t] ||= { answered: 0, correct: 0 });
        t.answered += 1;
        if (r.c) t.correct += 1;
      }
      return out;
    },

    async getWeakIds() {
      const latest = new Map();
      for (const r of rows) latest.set(r.q, r.c); // later rows overwrite earlier ones
      return [...latest].filter(([, ok]) => !ok).map(([id]) => id);
    },

    async resetProgress() {
      rows = [];
      persist();
    },
  };
}

// ---------------------------------------------------------------------
// Choose a backend. If Supabase is configured and reachable we use it,
// otherwise we fall back to demo mode and say why.
// ---------------------------------------------------------------------
export async function initBackend(config, deps) {
  const demo = (note) => createDemoBackend({ loadData: deps.loadData, storage: deps.storage, note });

  if (!config.url || !config.key) {
    return demo("Demo mode: Supabase is not configured yet, so progress is saved in this browser only.");
  }
  try {
    const mod = await deps.importSupabase(config.cdn);
    const client = mod.createClient(config.url, config.key);
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    }
    const backend = createSupabaseBackend(client);
    await backend.getTopics(); // quick check that the schema is installed and reachable
    return backend;
  } catch (err) {
    console.warn("Supabase unavailable, using demo mode:", err);
    return demo(`Supabase unavailable (${err.message}). Using demo mode with progress saved in this browser.`);
  }
}
