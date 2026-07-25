create table if not exists public.question_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_key text not null,
  studyspaces_question_id text,
  page_url text,
  question_snapshot jsonb not null,
  date_logged date not null,
  timezone text not null,
  source text not null,
  question_number text not null,
  section text not null check (section in ('math', 'reading_writing')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  original_outcome text not null check (original_outcome in ('incorrect', 'correct_guess')),
  clock_mode text not null check (clock_mode in ('timed', 'untimed')),
  where_wrong text not null,
  prevention_rule text not null,
  mistake_tag text not null,
  redo_3_due_on date not null,
  redo_3_result text check (redo_3_result in ('correct', 'wrong')),
  redo_3_completed_at timestamptz,
  redo_14_due_on date not null,
  redo_14_result text check (redo_14_result in ('correct', 'wrong')),
  redo_14_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_reviews_section_tag_check check (
    (section = 'math' and mistake_tag in ('V', '1', '2', '3', '4', '5'))
    or
    (section = 'reading_writing' and mistake_tag in ('V', 'A', 'B', 'C', 'D', 'E'))
  ),
  constraint question_reviews_redo_3_completion_check check (
    (redo_3_result is null and redo_3_completed_at is null)
    or
    (redo_3_result is not null and redo_3_completed_at is not null)
  ),
  constraint question_reviews_redo_14_completion_check check (
    (redo_14_result is null and redo_14_completed_at is null)
    or
    (redo_14_result is not null and redo_14_completed_at is not null)
  ),
  constraint question_reviews_unique_daily_question unique (student_id, question_key, date_logged)
);

create index if not exists question_reviews_student_due_3_idx
  on public.question_reviews (student_id, redo_3_due_on)
  where redo_3_result is null;

create index if not exists question_reviews_student_due_14_idx
  on public.question_reviews (student_id, redo_14_due_on)
  where redo_14_result is null;

create or replace function public.set_question_reviews_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_question_reviews_updated_at on public.question_reviews;
create trigger set_question_reviews_updated_at
before update on public.question_reviews
for each row execute function public.set_question_reviews_updated_at();

alter table public.question_reviews enable row level security;

drop policy if exists "Students can read their own reviews" on public.question_reviews;
create policy "Students can read their own reviews"
on public.question_reviews for select
to authenticated
using ((select auth.uid()) = student_id);

drop policy if exists "Students can create their own reviews" on public.question_reviews;
create policy "Students can create their own reviews"
on public.question_reviews for insert
to authenticated
with check ((select auth.uid()) = student_id);

drop policy if exists "Students can update their own reviews" on public.question_reviews;
create policy "Students can update their own reviews"
on public.question_reviews for update
to authenticated
using ((select auth.uid()) = student_id)
with check ((select auth.uid()) = student_id);

grant select, insert, update on public.question_reviews to authenticated;
