-- E-mail opcional e limite comercial de até cinco dispositivos por licença.

update public.licenses set max_devices = 5 where max_devices > 5;

alter table public.licenses
  alter column email drop not null;

alter table public.licenses
  drop constraint if exists licenses_max_devices_check;

alter table public.licenses
  add constraint licenses_max_devices_check check (max_devices between 1 and 5);
