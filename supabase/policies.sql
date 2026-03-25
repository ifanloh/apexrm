alter table public.crews enable row level security;
alter table public.participants enable row level security;
alter table public.checkpoints enable row level security;
alter table public.scans enable row level security;
alter table public.audit_logs enable row level security;
alter table public.top5_notifications enable row level security;

create policy "checkpoints readable for authenticated users"
on public.checkpoints
for select
to authenticated
using (true);

create policy "participants readable for authenticated users"
on public.participants
for select
to authenticated
using (true);

create policy "scans readable for authenticated users"
on public.scans
for select
to authenticated
using (true);

create policy "notifications readable for authenticated users"
on public.top5_notifications
for select
to authenticated
using (true);

create policy "audit logs readable for authenticated users"
on public.audit_logs
for select
to authenticated
using (true);
