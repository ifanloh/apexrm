insert into public.checkpoints (id, code, name, km_marker, order_index)
values
  ('cp-start', 'START', 'Start Line', 0, 0),
  ('cp-10', 'CP1', 'Checkpoint 1', 10, 1),
  ('cp-21', 'CP2', 'Checkpoint 2', 21, 2),
  ('cp-30', 'CP3', 'Checkpoint 3', 30, 3),
  ('finish', 'FIN', 'Finish', 42, 4)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  km_marker = excluded.km_marker,
  order_index = excluded.order_index;
