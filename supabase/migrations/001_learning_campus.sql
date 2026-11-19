begin;

create table public.campus_lerntage (
  user_id uuid not null references auth.users(id),
  lerntag date not null,
  lektion text not null check (lektion ~ '^(1[0-9]|2[0-4]|[1-9])$'),
  eintrag jsonb not null check (jsonb_typeof(eintrag) = 'object'),
  erkenntnisse jsonb generated always as (eintrag -> 'insights') stored,
  offene_frage text generated always as (eintrag ->> 'openQuestion') stored,
  naechster_schritt text generated always as (eintrag ->> 'nextStep') stored,
  notion_url text generated always as (
    case when eintrag ->> 'notionStatus' = 'saved' then eintrag -> 'notionPage' ->> 'url' end
  ) stored,
  primary key (user_id, lerntag, lektion)
);
alter table public.campus_lerntage enable row level security;
revoke all on public.campus_lerntage from public, anon, authenticated;
grant select (lerntag, lektion, erkenntnisse, offene_frage, naechster_schritt, notion_url)
  on public.campus_lerntage to authenticated;
grant select, insert, update on public.campus_lerntage to service_role;
create policy "Eigene Lerntage lesen" on public.campus_lerntage
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.campus_browser_notizen (
  user_id uuid not null default auth.uid() references auth.users(id),
  lerntag date not null,
  lektion text not null check (lektion ~ '^(1[0-9]|2[0-4]|[1-9])$'),
  zusammenfassung text not null check (char_length(zusammenfassung) between 1 and 50000),
  primary key (user_id, lerntag, lektion)
);
alter table public.campus_browser_notizen enable row level security;
revoke all on public.campus_browser_notizen from public, anon, authenticated;
grant select, insert, update, delete on public.campus_browser_notizen to authenticated;
create policy "Eigene Browser-Notizen verwalten" on public.campus_browser_notizen
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
