-- AulaPro AI - Esquema PostgreSQL para Supabase
-- Ejecuta este script una sola vez en Supabase -> SQL Editor -> New query

create table if not exists public.users (
  id text primary key,
  email text unique not null,
  name text not null,
  phone text not null default '',
  institution text not null default '',
  education_level text not null default '',
  program text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  password_hash text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires_at text not null,
  created_at text not null
);

create table if not exists public.catalog_services (
  id text primary key,
  category text not null,
  name text not null,
  description text not null,
  base_price integer not null,
  active integer not null default 1,
  sort_order integer not null default 0
);

create table if not exists public.rates (
  id text primary key,
  service_name text not null,
  base_price integer not null,
  is_starting_from integer not null default 0,
  notes text not null default '',
  updated_at text not null,
  sort_order integer not null default 0
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

create table if not exists public.requests (
  id text primary key,
  order_number text unique not null,
  student_id text not null references public.users(id) on delete cascade,
  education_level text not null,
  institution text not null default '',
  academic_program text not null default '',
  subject text not null,
  service_type text not null,
  service_category text not null,
  description text not null,
  pages integer not null default 0,
  exercises integer not null default 0,
  slides integer not null default 0,
  difficulty text not null default 'media',
  deadline text not null,
  requested_format text not null,
  additional_notes text not null default '',
  preliminary_quote integer not null,
  final_quote integer,
  quote_approved_by_admin integer not null default 0,
  quote_notes text not null default '',
  status text not null default 'Solicitud recibida',
  payment_status text not null default 'Pendiente de cotización',
  admin_private_notes text not null default '',
  info_request_message text not null default '',
  priority text not null default 'normal',
  created_at text not null,
  updated_at text not null
);

create table if not exists public.request_status_history (
  id text primary key,
  request_id text not null references public.requests(id) on delete cascade,
  status text not null,
  note text not null default '',
  changed_by text not null,
  created_at text not null
);

create table if not exists public.files (
  id text primary key,
  request_id text not null references public.requests(id) on delete cascade,
  owner_id text not null references public.users(id) on delete cascade,
  kind text not null,
  original_name text not null,
  stored_name text not null,
  mime_type text not null,
  format_label text not null,
  size_bytes integer not null,
  version integer not null default 1,
  is_latest integer not null default 1,
  replaced_file_id text,
  uploaded_by_role text not null,
  created_at text not null
);

create table if not exists public.payments (
  id text primary key,
  request_id text not null references public.requests(id) on delete cascade,
  student_id text not null references public.users(id) on delete cascade,
  method text not null default 'Nequi',
  nequi_destination text not null,
  amount integer not null,
  reference_code text not null default '',
  proof_file_id text,
  status text not null default 'Pago pendiente de verificación',
  admin_note text not null default '',
  verified_at text,
  created_at text not null
);

create table if not exists public.notifications (
  id text primary key,
  recipient_id text not null references public.users(id) on delete cascade,
  request_id text,
  title text not null,
  message text not null,
  type text not null,
  is_read integer not null default 0,
  created_at text not null
);

create table if not exists public.ai_messages (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  role text not null,
  context_request_id text,
  content text not null,
  created_at text not null
);

create table if not exists public.reviews (
  id text primary key,
  request_id text unique not null references public.requests(id) on delete cascade,
  student_id text not null references public.users(id) on delete cascade,
  student_display_name text not null,
  service_type text not null,
  education_level text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null,
  is_visible integer not null default 1,
  admin_reply text not null default '',
  created_at text not null
);

create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_requests_student_id on public.requests(student_id);
create index if not exists idx_history_request_id on public.request_status_history(request_id);
create index if not exists idx_files_request_id on public.files(request_id);
create index if not exists idx_payments_request_id on public.payments(request_id);
create index if not exists idx_payments_student_id on public.payments(student_id);
create index if not exists idx_notifications_recipient_id on public.notifications(recipient_id);
create index if not exists idx_ai_messages_user_id on public.ai_messages(user_id);

-- Bloqueo RLS: todo el acceso pasa exclusivamente por el servidor autenticado de AulaPro AI
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.catalog_services enable row level security;
alter table public.rates enable row level security;
alter table public.app_settings enable row level security;
alter table public.requests enable row level security;
alter table public.request_status_history enable row level security;
alter table public.files enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_messages enable row level security;
alter table public.reviews enable row level security;
