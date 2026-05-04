-- Ejecuta esto en el SQL Editor de Supabase

create table if not exists perfil (
  id              uuid primary key default gen_random_uuid(),
  rfc             text,
  razon_social    text,
  cp              text,
  regimen         text,
  uso_cfdi        text default 'G03 - Gastos en general',
  email           text,
  meta_quincena   numeric default 0,
  created_at      timestamptz default now()
);

create table if not exists tickets (
  id                      uuid primary key default gen_random_uuid(),
  quincena                text not null,          -- ej: "2026-05-1Q"
  establecimiento         text,                   -- walmart | lacomer | costco | chedraui | otro
  nombre_establecimiento  text,
  folio                   text,
  tc                      text,
  tr                      text,
  codigo_barras           text,
  fecha                   text,
  hora                    text,
  total                   numeric,
  subtotal                numeric,
  iva                     numeric,
  sucursal                text,
  tc_valido               boolean,
  img_data_url            text,                   -- base64 de la foto del ticket
  created_at              timestamptz default now()
);

-- Permite acceso sin autenticación (ajusta si quieres auth)
alter table perfil  enable row level security;
alter table tickets enable row level security;

create policy "allow all perfil"  on perfil  for all using (true) with check (true);
create policy "allow all tickets" on tickets for all using (true) with check (true);
