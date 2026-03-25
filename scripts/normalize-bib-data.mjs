import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  prepare: false
});

function normalizeBib(value) {
  return value.trim().toUpperCase();
}

function groupBy(items, getKey) {
  const groups = new Map();

  for (const item of items) {
    const key = getKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return groups;
}

try {
  await sql.begin(async (tx) => {
    const participants = await tx`
      select id, bib, name, created_at
      from public.participants
      order by created_at asc
    `;

    const participantGroups = groupBy(participants, (item) => normalizeBib(item.bib));

    for (const [normalizedBib, group] of participantGroups.entries()) {
      const sorted = [...group].sort((left, right) => {
        const leftPriority = left.bib === normalizedBib ? 0 : 1;
        const rightPriority = right.bib === normalizedBib ? 0 : 1;
        return leftPriority - rightPriority || new Date(left.created_at) - new Date(right.created_at);
      });

      const canonical = sorted[0];
      const duplicateIds = sorted.slice(1).map((item) => item.id);

      for (const participant of sorted) {
        await tx`
          update public.scans
          set participant_id = ${canonical.id}
          where participant_id = ${participant.id}
        `;

        await tx`
          update public.top5_notifications
          set participant_id = ${canonical.id}
          where participant_id = ${participant.id}
        `;
      }

      if (duplicateIds.length > 0) {
        for (const duplicateId of duplicateIds) {
          await tx`
            delete from public.participants
            where id = ${duplicateId}
          `;
        }
      }
    }

    const scans = await tx`
      select id, client_scan_id, race_id, checkpoint_id, bib, scanned_at, server_received_at, position
      from public.scans
      order by race_id asc, checkpoint_id asc, scanned_at asc, server_received_at asc
    `;

    const scanGroups = groupBy(
      scans,
      (item) => `${item.race_id}::${item.checkpoint_id}::${normalizeBib(item.bib)}`
    );

    for (const [groupKey, group] of scanGroups.entries()) {
      if (group.length <= 1) {
        continue;
      }

      const [raceId, checkpointId, normalizedBib] = groupKey.split("::");
      const [canonical, ...duplicates] = group;

      await tx`
        update public.scans
        set bib = ${normalizedBib}
        where id = ${canonical.id}
      `;

      for (const duplicate of duplicates) {
        await tx`
          insert into public.audit_logs (type, race_id, checkpoint_id, bib, payload)
          values (
            'duplicate_scan_case_normalized',
            ${raceId},
            ${checkpointId},
            ${normalizedBib},
            ${tx.json({
              removedScanId: duplicate.id,
              removedClientScanId: duplicate.client_scan_id,
              keptScanId: canonical.id,
              keptClientScanId: canonical.client_scan_id
            })}
          )
        `;
      }

      const duplicateIds = duplicates.map((item) => item.id);

      if (duplicateIds.length > 0) {
        for (const duplicateId of duplicateIds) {
          await tx`
            delete from public.scans
            where id = ${duplicateId}
          `;
        }
      }
    }

    const notifications = await tx`
      select id, checkpoint_id, bib, position, created_at
      from public.top5_notifications
      order by checkpoint_id asc, position asc, created_at asc
    `;

    const notificationGroups = groupBy(
      notifications,
      (item) => `${item.checkpoint_id}::${normalizeBib(item.bib)}::${item.position}`
    );

    for (const [groupKey, group] of notificationGroups.entries()) {
      const [, normalizedBib] = groupKey.split("::");
      const [canonical, ...duplicates] = group;

      await tx`
        update public.top5_notifications
        set bib = ${normalizedBib}
        where id = ${canonical.id}
      `;

      const duplicateIds = duplicates.map((item) => item.id);

      if (duplicateIds.length > 0) {
        for (const duplicateId of duplicateIds) {
          await tx`
            delete from public.top5_notifications
            where id = ${duplicateId}
          `;
        }
      }
    }

    await tx`
      update public.participants
      set bib = upper(trim(bib)),
          name = case
            when name ilike 'Runner %' then concat('Runner ', upper(trim(bib)))
            else name
          end
      where bib <> upper(trim(bib))
    `;

    await tx`
      update public.scans
      set bib = upper(trim(bib))
      where bib <> upper(trim(bib))
    `;

    await tx`
      update public.top5_notifications
      set bib = upper(trim(bib))
      where bib <> upper(trim(bib))
    `;

    await tx`
      delete from public.top5_notifications notification
      where not exists (
        select 1
        from public.scans scan
        where scan.checkpoint_id = notification.checkpoint_id
          and upper(trim(scan.bib)) = upper(trim(notification.bib))
          and scan.position = notification.position
      )
    `;

    await tx`
      update public.audit_logs
      set bib = upper(trim(bib))
      where bib is not null
        and bib <> upper(trim(bib))
    `;

    await tx`
      create unique index if not exists participants_bib_normalized_unique
      on public.participants ((upper(trim(bib))))
    `;

    await tx`
      create unique index if not exists scans_race_checkpoint_bib_normalized_unique
      on public.scans (race_id, checkpoint_id, (upper(trim(bib))))
    `;

    await tx`
      create unique index if not exists top5_notifications_checkpoint_bib_position_normalized_unique
      on public.top5_notifications (checkpoint_id, (upper(trim(bib))), position)
    `;
  });

  console.log("BIB normalization complete.");
} finally {
  await sql.end({ timeout: 5 });
}
