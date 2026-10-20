# Connect the app to Supabase

The app runs without any setup in **demo mode** (progress is saved in your browser only).
Follow these steps to switch on the **Supabase backend**, where questions, answers and progress live in a real database.

You will need a free account at <https://supabase.com>.

## 1. Create a project

1. Sign in to Supabase and choose **New project**.
2. Give it a name (for example `az900-quiz`), set a database password (save it somewhere safe), and pick the region closest to you.
3. Wait a minute or two for the project to finish setting up.

## 2. Create the tables and security rules

1. In the left menu open **SQL Editor** and choose **New query**.
2. Open `supabase/schema.sql` from this repository, copy **all** of it, paste it into the editor, and press **Run**.
3. You should see "Success. No rows returned".

## 3. Load the questions

1. Open another **New query**.
2. Copy all of `supabase/seed.sql`, paste it, and press **Run**.
3. Check it worked: open **Table Editor**, choose the `questions` table, and you should see 72 rows.

## 4. Allow anonymous sign-ins

Learners are given an anonymous account automatically, so there is no sign-up form.

1. Open **Authentication** and go to the **Sign In / Providers** settings (the Auth providers page).
2. Switch **Allow anonymous sign-ins** to **on** and save.

> Anonymous users are real rows in your database. For a public launch, also turn on CAPTCHA protection
> in the Auth settings, and occasionally delete old anonymous users.

## 5. Copy your project URL and public key

1. Open **Project Settings** and then **API Keys** (or use the **Connect** button at the top of the dashboard).
2. Copy the **Project URL** (it looks like `https://abcdxyz.supabase.co`).
3. Copy the **publishable** key (`sb_publishable_...`), or the legacy **anon** key if your project still shows one.

> **Never** use the `service_role` or `secret` key in this app. Those keys bypass all security and must stay private.
> The publishable / anon key is designed to be public. Row Level Security protects your data.

## 6. Put them in `js/config.js`

Open `js/config.js` and fill in the two values:

```js
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLISHABLE-OR-ANON-KEY";
```

## 7. Test it

Run the app locally (`npm start`, then open <http://127.0.0.1:8080>) and look at the pill at the top right.

- It says **Supabase**: you are connected. Answer a question, then open **Table Editor > answers** in Supabase to see your answer saved.
- It says **Demo mode**: hover the pill, or read the note under the page heading, to see why it fell back.

## Troubleshooting

| Message or symptom | What to check |
| --- | --- |
| "Supabase unavailable (Anonymous sign-ins are disabled)" | Step 4: switch on **Allow anonymous sign-ins**. |
| "Could not load topics" or "relation does not exist" | Step 2: run `schema.sql` in the **same** project whose URL you copied. |
| "Could not load questions: permission denied" | Run the complete `schema.sql` again, then `seed.sql`. The question table only allows selected columns on purpose. |
| Questions list is empty | Step 3: run `seed.sql`. |
| "Invalid API key" or 401 | Re-copy the URL and key (no spaces, no quotes inside the string). Use the publishable/anon key, not a secret key. |
| Pill says Demo mode and the note mentions a network error | Check your internet connection and that the CDN is not blocked on your network. |

## How the answer key is kept private

The browser is only allowed to read the question text and the four options. The correct answer and the
explanation are stored in columns the browser cannot read. They are returned only after an answer is
sent to the `submit_answer` database function, which also records the answer for that learner.
See [ARCHITECTURE.md](ARCHITECTURE.md).
