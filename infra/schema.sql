CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('admin', 'preventa', 'comercial');

CREATE TYPE proposal_status AS ENUM (
  'pendiente',
  'en-progreso',
  'entregada-revision',
  'revision-1',
  'ajuste-1',
  'entregada-revision-2',
  'revision-2',
  'ajuste-2',
  'concluida'
);

CREATE TYPE priority_level AS ENUM ('critica', 'alta', 'media', 'baja');

CREATE TYPE document_source AS ENUM ('upload', 'drive_link', 'sharepoint_link');

CREATE TYPE revision_status AS ENUM ('abierta', 'cerrada');

CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                  VARCHAR(255) UNIQUE NOT NULL,
  password_hash          VARCHAR(255) NOT NULL,
  full_name              VARCHAR(255) NOT NULL,
  role                   user_role NOT NULL DEFAULT 'comercial',
  is_active              BOOLEAN NOT NULL DEFAULT true,
  avatar_initials        VARCHAR(3),
  avatar_bg              VARCHAR(10) DEFAULT '#E6F1FB',
  avatar_color           VARCHAR(10) DEFAULT '#0C447C',
  reset_token            VARCHAR(255),
  reset_token_expires_at TIMESTAMPTZ,
  last_login_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(20) UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  client_name     VARCHAR(255) NOT NULL,
  description     TEXT,
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  commercial_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status          proposal_status NOT NULL DEFAULT 'pendiente',
  priority        priority_level NOT NULL DEFAULT 'media',
  progress_pct    SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  iteration_count SMALLINT NOT NULL DEFAULT 0 CHECK (iteration_count <= 2),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  delivered_at    TIMESTAMPTZ,
  concluded_at    TIMESTAMPTZ,
  bant_score      SMALLINT CHECK (bant_score BETWEEN 0 AND 100),
  meddic_score    SMALLINT CHECK (meddic_score BETWEEN 0 AND 60),
  gpct_score      SMALLINT CHECK (gpct_score BETWEEN 0 AND 40),
  composite_score SMALLINT CHECK (composite_score BETWEEN 0 AND 100),
  bant_data       JSONB,
  meddic_data     JSONB,
  gpct_data       JSONB,
  estimated_value VARCHAR(100),
  proposal_type   VARCHAR(100),
  final_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_status      ON proposals(status);
CREATE INDEX idx_proposals_assigned_to ON proposals(assigned_to);
CREATE INDEX idx_proposals_commercial  ON proposals(commercial_id);
CREATE INDEX idx_proposals_priority    ON proposals(priority);

CREATE TABLE proposal_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  source        document_source NOT NULL,
  file_name     VARCHAR(500),
  blob_url      TEXT,
  external_url  TEXT,
  description   TEXT,
  file_size_kb  INTEGER,
  is_final      BOOLEAN DEFAULT false,
  iteration_ref SMALLINT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_docs_proposal ON proposal_documents(proposal_id);

CREATE TABLE proposal_revisions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id        UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  iteration          SMALLINT NOT NULL CHECK (iteration IN (1, 2)),
  requested_by       UUID NOT NULL REFERENCES users(id),
  request_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_note       TEXT NOT NULL,
  status             revision_status NOT NULL DEFAULT 'abierta',
  adjust_deadline    DATE,
  adjust_note        TEXT,
  adjust_document_id UUID REFERENCES proposal_documents(id),
  closed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_revisions_proposal ON proposal_revisions(proposal_id);

CREATE TABLE proposal_activity (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_proposal ON proposal_activity(proposal_id);
CREATE INDEX idx_activity_created  ON proposal_activity(created_at DESC);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user    ON notifications(user_id, is_read);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO users (email, password_hash, full_name, role, avatar_initials, avatar_bg, avatar_color) VALUES
  ('admin@bluetab.net',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhCanFqkH5sKMDGIsHNuGO',
   'Roberto Sanchez', 'admin', 'RS', '#EEEDFE', '#26215C'),
  ('ana.martinez@bluetab.net',
   '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC5M.kyRLv6kD3hf/kI2',
   'Ana Martinez', 'preventa', 'AM', '#E6F1FB', '#0C447C'),
  ('laura.vega@bluetab.net',
   '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC5M.kyRLv6kD3hf/kI2',
   'Laura Vega', 'preventa', 'LV', '#FAECE7', '#712B13'),
  ('carlos.rueda@bluetab.net',
   '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC5M.kyRLv6kD3hf/kI2',
   'Carlos Rueda', 'comercial', 'CR', '#EAF3DE', '#27500A'),
  ('juliana.ramos@bluetab.net',
   '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC5M.kyRLv6kD3hf/kI2',
   'Juliana Ramos', 'comercial', 'JR', '#FAEEDA', '#633806');

INSERT INTO proposals (code, name, client_name, description, commercial_id, assigned_to, status, priority, progress_pct, start_date, end_date, bant_score, composite_score)
SELECT
  'P-2025-001',
  'Migracion plataforma datos',
  'Bancolombia',
  'Migracion completa de plataforma de datos a Azure Data Factory + Synapse',
  u_com.id,
  u_pre.id,
  'en-progreso',
  'critica',
  68,
  '2025-05-01',
  '2025-07-15',
  82,
  88
FROM users u_com, users u_pre
WHERE u_com.email = 'carlos.rueda@bluetab.net'
  AND u_pre.email = 'ana.martinez@bluetab.net';

INSERT INTO proposals (code, name, client_name, description, commercial_id, assigned_to, status, priority, progress_pct, start_date, end_date, bant_score, composite_score)
SELECT
  'P-2025-002',
  'Arquitectura microservicios',
  'EPM',
  'Rediseno arquitectura hacia microservicios con Kubernetes en Azure',
  u_com.id,
  u_pre.id,
  'entregada-revision',
  'alta',
  100,
  '2025-04-28',
  '2025-06-30',
  74,
  72
FROM users u_com, users u_pre
WHERE u_com.email = 'juliana.ramos@bluetab.net'
  AND u_pre.email = 'laura.vega@bluetab.net';

INSERT INTO proposals (code, name, client_name, description, commercial_id, assigned_to, status, priority, progress_pct, start_date, end_date, bant_score, composite_score)
SELECT
  'P-2025-003',
  'Data Governance y calidad',
  'Avianca',
  'Implementacion framework de gobierno del dato con Purview',
  u_com.id,
  u_pre.id,
  'pendiente',
  'media',
  10,
  '2025-06-01',
  '2025-08-10',
  55,
  55
FROM users u_com, users u_pre
WHERE u_com.email = 'carlos.rueda@bluetab.net'
  AND u_pre.email = 'ana.martinez@bluetab.net';
