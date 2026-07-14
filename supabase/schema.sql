create table if not exists produtos (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo text not null check (tipo in ('seco', 'resfriado', 'congelado')),
  quantidade integer not null check (quantidade >= 0),
  produto_novo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table produtos enable row level security;

create policy "produtos_select_public" on produtos for select using (true);
create policy "produtos_insert_public" on produtos for insert with check (true);
create policy "produtos_update_public" on produtos for update using (true);

alter publication supabase_realtime add table produtos;

create table if not exists catalogo_produtos (
  id bigint generated always as identity primary key,
  marca text,
  produto text not null,
  unidades text[] not null default '{}'
);

alter table catalogo_produtos enable row level security;

create policy "catalogo_produtos_select_public" on catalogo_produtos for select using (true);
