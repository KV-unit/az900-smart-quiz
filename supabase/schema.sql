-- =====================================================================
-- AZ-900 Smart Quiz (Unofficial) - database schema for Supabase
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query
-- Re-runnable for development: it DROPS and recreates the quiz tables, so any
-- saved answers are wiped. Do not re-run it once real learners have used the app.
-- =====================================================================

-- ---------- clean slate (so the script can be re-run) ----------------
drop view     if exists public.my_weak_questions;
drop view     if exists public.my_topic_progress;
drop function if exists public.submit_answer(text, integer, uuid);
drop table    if exists public.answers;
drop table    if exists public.questions;
drop table    if exists public.topics;

-- ---------- topics: one row per AZ-900 skills-outline area -----------
create table public.topics (
  id            text primary key,                 -- slug, e.g. 'storage'
  domain        smallint not null check (domain between 1 and 3),
  domain_name   text not null,
  domain_weight text not null,                    -- e.g. '35-40%'
  name          text not null,
  sort_order    smallint not null,
  learn_url     text
);

-- ---------- questions: original questions, answers kept server-side --
create table public.questions (
  id            text primary key,                 -- stable id, e.g. 'sg-03'
  topic_id      text not null references public.topics(id) on delete cascade,
  question      text not null,
  options       jsonb not null,                   -- array of exactly 4 strings
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation   text not null,
  difficulty    smallint not null default 2 check (difficulty between 1 and 3),
  constraint options_is_array_of_four
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4)
);
create index questions_topic_idx on public.questions(topic_id);

-- ---------- answers: every answer a learner gives --------------------
create table public.answers (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  session_id  uuid not null,                      -- groups answers of one quiz run
  question_id text not null references public.questions(id) on delete cascade,
  topic_id    text not null references public.topics(id) on delete cascade,
  chosen      smallint not null check (chosen between 0 and 3),
  is_correct  boolean not null,
  answered_at timestamptz not null default now()
);
create index answers_user_time_idx on public.answers(user_id, answered_at desc);
create index answers_user_question_idx on public.answers(user_id, question_id);

-- ---------- Row Level Security ---------------------------------------
alter table public.topics    enable row level security;
alter table public.questions enable row level security;
alter table public.answers   enable row level security;

create policy "topics are readable by everyone"
  on public.topics for select to anon, authenticated using (true);

create policy "questions are readable by everyone"
  on public.questions for select to anon, authenticated using (true);

create policy "learners can read only their own answers"
  on public.answers for select to authenticated
  using (user_id = auth.uid());
-- Note: there is deliberately NO insert/update/delete policy on answers.
-- Answers can only be written through the submit_answer() function below.

-- ---------- Column-level privileges: hide the answer key -------------
-- The browser may read the question text and options, but NOT the
-- correct answer or explanation, until it has submitted an answer.
revoke all on public.topics    from anon, authenticated;
revoke all on public.questions from anon, authenticated;
revoke all on public.answers   from anon, authenticated;

grant select on public.topics to anon, authenticated;
grant select (id, topic_id, question, options, difficulty)
  on public.questions to anon, authenticated;
grant select on public.answers to authenticated;

-- ---------- submit_answer(): the only way to record an answer --------
create function public.submit_answer(
  p_question_id text,
  p_chosen      integer,
  p_session_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.questions%rowtype;
  v_correct boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit an answer' using errcode = '28000';
  end if;

  select * into q from public.questions where id = p_question_id;
  if not found then
    raise exception 'Unknown question: %', p_question_id using errcode = 'P0002';
  end if;

  if p_chosen is null or p_chosen < 0 or p_chosen > 3 then
    raise exception 'Chosen option must be between 0 and 3' using errcode = '22023';
  end if;

  v_correct := (p_chosen = q.correct_index);

  insert into public.answers (user_id, session_id, question_id, topic_id, chosen, is_correct)
  values (auth.uid(), p_session_id, q.id, q.topic_id, p_chosen, v_correct);

  return jsonb_build_object(
    'correct',       v_correct,
    'correct_index', q.correct_index,
    'explanation',   q.explanation
  );
end;
$$;

revoke all on function public.submit_answer(text, integer, uuid) from public, anon;
grant execute on function public.submit_answer(text, integer, uuid) to authenticated;

-- ---------- views: per-user progress (respect RLS) -------------------
-- Accuracy per topic, based on the learner's own answers only.
create view public.my_topic_progress
with (security_invoker = true) as
select
  topic_id,
  count(*)::int                                   as answered,
  count(*) filter (where is_correct)::int         as correct,
  round(100.0 * count(*) filter (where is_correct) / count(*), 0)::int as accuracy_pct
from public.answers
group by topic_id;

-- The most recent result for each question the learner has attempted.
-- Filter it with is_correct = false to get "weak spots".
create view public.my_weak_questions
with (security_invoker = true) as
select distinct on (question_id)
  question_id, topic_id, is_correct, answered_at
from public.answers
order by question_id, answered_at desc, id desc;

grant select on public.my_topic_progress, public.my_weak_questions to authenticated;
