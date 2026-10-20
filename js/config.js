// ---------------------------------------------------------------------
// App configuration
//
// Leave SUPABASE_URL and SUPABASE_ANON_KEY empty to run in DEMO MODE
// (questions come from data/questions.json and progress is saved in this
// browser only). Fill them in to use the Supabase backend.
//
// The anon / publishable key is a PUBLIC key by design: it is safe to
// commit. What protects the data is Row Level Security in supabase/schema.sql.
// NEVER put a "service_role" or "secret" key in this file.
// ---------------------------------------------------------------------
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// supabase-js is loaded from a CDN only when Supabase is configured.
// "@2" follows the latest 2.x release, which supports both the legacy anon
// key and the newer publishable key (sb_publishable_...).
export const SUPABASE_JS_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
