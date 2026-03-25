update public.participants
set bib = upper(trim(bib))
where bib <> upper(trim(bib));

update public.scans
set bib = upper(trim(bib))
where bib <> upper(trim(bib));

update public.top5_notifications
set bib = upper(trim(bib))
where bib <> upper(trim(bib));

update public.audit_logs
set bib = upper(trim(bib))
where bib is not null
  and bib <> upper(trim(bib));

create unique index if not exists participants_bib_normalized_unique
  on public.participants ((upper(trim(bib))));

create unique index if not exists scans_race_checkpoint_bib_normalized_unique
  on public.scans (race_id, checkpoint_id, (upper(trim(bib))));

create unique index if not exists top5_notifications_checkpoint_bib_position_normalized_unique
  on public.top5_notifications (checkpoint_id, (upper(trim(bib))), position);
