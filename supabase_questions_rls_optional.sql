-- Optional: allow public insert/update for questions (if you want app to manage questions later)
-- Only run if you understand the security implications.

-- create policy if not exists pattern:
-- drop policy if exists "Public manage questions" on questions;
-- create policy "Public manage questions" on questions for all using (true) with check (true);
