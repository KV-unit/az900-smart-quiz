// End-to-end browser test.
//
// Setup (once):   npm install --no-save playwright && npx playwright install chromium
// Run:            node tests/e2e.mjs
//
// Optional: set CHROMIUM_PATH to use an existing Chromium/Chrome binary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startServer } from "./serve.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

const bank = JSON.parse(readFileSync(new URL("../data/questions.json", import.meta.url), "utf8"));
const byText = Object.fromEntries(bank.questions.map((q) => [q.question, q]));

const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

let passed = 0;
async function scenario(name, fn, { ignore = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !(ignore && ignore.test(m.text()))) problems.push(`console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  try {
    await fn(page, context);
    assert.deepEqual(problems, [], `unexpected browser problems in "${name}"`);
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

/** Click something that might sit under the fixed bottom bar by centring it first. */
async function clickCentred(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await locator.click();
}

/** Answer every question in the running quiz. wrongOn = zero-based positions to answer wrongly. */
async function playQuiz(page, wrongOn = []) {
  await page.waitForSelector(".q-text");
  for (let i = 0; ; i++) {
    const q = byText[await page.locator(".q-text").innerText()];
    assert.ok(q, "question shown in the app exists in the bank");
    const correctText = q.options[q.answer];
    const wantWrong = wrongOn.includes(i);
    const buttons = page.locator(".option");
    let target = -1;
    for (let k = 0; k < (await buttons.count()); k++) {
      const t = await buttons.nth(k).locator(".opt-text").innerText();
      if (wantWrong ? t !== correctText : t === correctText) {
        target = k;
        break;
      }
    }
    await buttons.nth(target).click();
    await page.waitForSelector(".feedback .feedback-title");
    assert.equal(await page.locator(".feedback-title").innerText(), wantWrong ? "Not quite" : "Correct!");
    assert.equal(await page.locator(".feedback .why").innerText(), q.explanation, "explanation shown");
    assert.equal(await page.locator(".option.is-correct").count(), 1, "exactly one correct option highlighted");
    const next = page.locator(".btn", { hasText: /Next question|See results/ });
    const isLast = (await next.innerText()) === "See results";
    await next.click();
    if (isLast) return;
  }
}

async function buildQuiz(page, topic, count) {
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.locator(`input[value="${topic}"]`).check();
  await page.selectOption("#count", String(count));
  await page.click("button[type=submit]");
}

console.log("Browser tests");

// ---------------------------------------------------------------------------
await scenario("builder: topics, live summary, and validation", async (page) => {
  await page.goto(base);
  await page.waitForSelector(".builder");
  assert.equal(await page.locator(".topic-card").count(), 11);
  assert.match(await page.locator(".action-summary").innerText(), /10 questions\s+from 11 topics/);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  assert.equal(await page.locator("button[type=submit]").isDisabled(), true, "cannot start with no topics");
  await page.locator('input[value="storage"]').check();
  await clickCentred(page.locator('input[name="difficulty"][value="3"]'));
  assert.equal(await page.locator("button[type=submit]").isDisabled(), false, "Hard storage questions exist");
  assert.match(await page.locator(".action-summary").innerText(), /1 question\s+from 1 topic/);
  await clickCentred(page.locator('input[name="difficulty"][value="1"]'));
  assert.match(await page.locator(".action-summary").innerText(), /2 questions\s+from 1 topic/);
});

await scenario("quiz: instant feedback, results, retry missed, saved progress", async (page) => {
  await page.goto(base);
  await page.waitForSelector(".builder");
  await buildQuiz(page, "compute-networking", 5);
  await playQuiz(page, [1, 3]); // two wrong of five
  await page.waitForSelector(".score-card");
  await page.waitForFunction(() => document.querySelector(".ring-percent")?.textContent === "60%");
  assert.equal(await page.locator(".review details").count(), 5);
  assert.equal(await page.locator(".review details[open]").count(), 2, "wrong answers open by default");

  await page.getByRole("button", { name: /Retry the 2 I missed/ }).click();
  await page.waitForSelector(".q-text");
  assert.match(await page.locator(".quiz-count").innerText(), /Question 1 of 2/);
  await playQuiz(page, []);
  await page.waitForFunction(() => document.querySelector(".ring-percent")?.textContent === "100%");
  assert.equal(await page.getByRole("button", { name: /Retry the/ }).count(), 0, "nothing left to retry");

  await page.getByRole("button", { name: "Back to quiz builder" }).click();
  await page.waitForSelector(".builder");
  const stats = await page.locator(".stats").innerText();
  assert.match(stats, /7\s+answered/);
  assert.match(stats, /0\s+weak spots/, "weak spots follow the latest answer");

  await page.reload();
  await page.waitForSelector(".builder");
  assert.match(await page.locator(".stats").innerText(), /7\s+answered/, "progress survives a reload");
});

await scenario("quiz: keyboard shortcuts work", async (page) => {
  await page.goto(base);
  await page.waitForSelector(".builder");
  await buildQuiz(page, "monitoring", 5);
  await page.waitForSelector(".q-text");
  const q = byText[await page.locator(".q-text").innerText()];
  const buttons = page.locator(".option");
  let position = 0;
  for (let k = 0; k < 4; k++) if ((await buttons.nth(k).locator(".opt-text").innerText()) === q.options[q.answer]) position = k;
  await page.keyboard.press(String(position + 1));
  await page.waitForSelector(".feedback .feedback-title");
  assert.equal(await page.locator(".feedback-title").innerText(), "Correct!");
  await page.keyboard.press("Enter");
  assert.match(await page.locator(".quiz-count").innerText(), /Question 2 of 5/);
});

await scenario("theme toggle switches and is remembered", async (page) => {
  await page.goto(base);
  await page.waitForSelector(".builder");
  await page.click("#theme-toggle");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
});

// ---------------------------------------------------------------------------
// Supabase mode, using a fake supabase-js module that behaves like the real
// database: it refuses to return the answer key and only reveals it through
// the submit_answer RPC.
const FAKE_SUPABASE_MODULE = `
const BANK = ${JSON.stringify(bank)};
const FORBIDDEN = ["correct_index", "explanation"];
const state = { answers: [], signedIn: false, selects: [] };
window.__fake = state;
function table(name) {
  const f = { cols: "*", filters: [] };
  const api = {
    select(c) { f.cols = c || "*"; return api; },
    order() { return api; },
    eq(col, val) { f.filters.push([col, val]); return api; },
    then(res, rej) {
      state.selects.push({ table: name, cols: f.cols });
      let out;
      if (name === "questions" && (f.cols === "*" || FORBIDDEN.some((c) => f.cols.includes(c)))) {
        out = { data: null, error: { message: "permission denied for table questions" } };
      } else if (name === "topics") {
        out = { data: BANK.topics, error: null };
      } else if (name === "questions") {
        out = { data: BANK.questions.map((q) => ({ id: q.id, topic_id: q.topic, question: q.question, options: q.options, difficulty: q.difficulty })), error: null };
      } else if (name === "my_topic_progress") {
        const by = {};
        for (const a of state.answers) { const t = (by[a.topic] ||= { topic_id: a.topic, answered: 0, correct: 0 }); t.answered++; if (a.ok) t.correct++; }
        out = { data: Object.values(by), error: null };
      } else if (name === "my_weak_questions") {
        const latest = new Map(); for (const a of state.answers) latest.set(a.q, a);
        out = { data: [...latest.values()].filter((a) => !a.ok).map((a) => ({ question_id: a.q, topic_id: a.topic, is_correct: false })), error: null };
      } else out = { data: [], error: null };
      return Promise.resolve(out).then(res, rej);
    },
  };
  return api;
}
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: state.signedIn ? { user: {} } : null } }),
      signInAnonymously: async () => { state.signedIn = true; return { data: {}, error: null }; },
    },
    from: table,
    rpc: async (name, args) => {
      if (name !== "submit_answer") return { data: null, error: { message: "unknown function" } };
      if (!state.signedIn) return { data: null, error: { message: "not signed in" } };
      const q = BANK.questions.find((x) => x.id === args.p_question_id);
      const ok = args.p_chosen === q.answer;
      state.answers.push({ q: q.id, topic: q.topic, ok, session: args.p_session_id });
      return { data: { correct: ok, correct_index: q.answer, explanation: q.explanation }, error: null };
    },
  };
}
`;

await scenario("supabase mode: anonymous sign-in, answer key stays server-side", async (page) => {
  await page.route("**/js/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const SUPABASE_URL = "https://example.supabase.co"; export const SUPABASE_ANON_KEY = "test-key"; export const SUPABASE_JS_CDN = "https://cdn.test/supabase.js";`,
    }),
  );
  await page.route("https://cdn.test/supabase.js", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_SUPABASE_MODULE }));
  await page.goto(base);
  await page.waitForSelector(".builder");
  assert.equal(await page.locator("#mode-pill").innerText(), "Supabase");

  await buildQuiz(page, "identity-security", 5);
  await playQuiz(page, [0]);
  await page.waitForSelector(".score-card");
  await page.waitForFunction(() => document.querySelector(".ring-percent")?.textContent === "80%");

  const fake = await page.evaluate(() => window.__fake);
  assert.equal(fake.signedIn, true, "signed in anonymously");
  assert.equal(fake.answers.length, 5, "every answer went through the submit_answer RPC");
  const qSelects = fake.selects.filter((s) => s.table === "questions");
  assert.ok(qSelects.length >= 1);
  for (const s of qSelects) {
    assert.ok(!/correct_index|explanation|\*/.test(s.cols), `question select must not request secret columns: ${s.cols}`);
  }
  // The weak-spot view comes from the database view, so retrying the missed one still works.
  await page.getByRole("button", { name: /Retry the 1 I missed/ }).click();
  await page.waitForSelector(".q-text");
  assert.match(await page.locator(".quiz-count").innerText(), /Question 1 of 1/);
});

await scenario("falls back to demo mode with a message when Supabase fails", async (page) => {
  await page.route("**/js/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const SUPABASE_URL = "https://example.supabase.co"; export const SUPABASE_ANON_KEY = "k"; export const SUPABASE_JS_CDN = "https://cdn.test/broken.js";`,
    }),
  );
  await page.route("https://cdn.test/broken.js", (route) => route.fulfill({ status: 500, body: "nope" }));
  await page.goto(base);
  await page.waitForSelector(".builder");
  assert.equal(await page.locator("#mode-pill").innerText(), "Demo mode");
  assert.match(await page.locator(".mode-note").first().innerText(), /Supabase unavailable/);
}, { ignore: /status of 500/ });

await browser.close();
server.close();
console.log(`\n${passed} scenario(s) passed${process.exitCode ? ", some FAILED" : ""}`);
