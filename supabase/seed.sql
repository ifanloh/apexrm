insert into public.checkpoints (id, code, name, km_marker, order_index)
values
  ('cp-start', 'START', 'Millau', 0, 0),
  ('cp-10', 'CP1', 'Peyreleau', 23.3, 1),
  ('cp-21', 'CP2', 'Roquesaltes', 44.4, 2),
  ('cp-30', 'CP3', 'La Salvage', 55.9, 3),
  ('finish', 'FIN', 'Arrivee Millau', 80.6, 4)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  km_marker = excluded.km_marker,
  order_index = excluded.order_index;
