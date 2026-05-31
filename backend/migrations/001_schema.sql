-- ================================================================
-- Bluetab Preventa - Schema completo
-- Ejecutar en orden: 001_schema.sql
-- ================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ────────────────────────────────────────────────────────────
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

CREATE TYPE proposal_priority AS ENUM ('critica', 'alta', 'media', 'baja');

CREATE TYPE document_type AS ENUM ('file', 'link');

CREATE TYPE revision_status AS ENUM ('abierta', 'cerrada');

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'comercial',
  active        BOOLEAN NOT NULL DEFAULT true,
  avatar_initials VARCHAR(4),
  avatar_color  VARCHAR(7),
  avatar_bg     VARCHAR(7),
  reset_token   VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- ────────────────────────────────────────────────────────────
-- PROPOSALS
-- ────────────────────────────────────────────────────────────
CREATE TABLE proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code              VARCHAR(20) UNIQUE NOT NULL,  -- P001, P002...
  name              VARCHAR(500) NOT NULL,
  client            VARCHAR(255) NOT NULL,
  description       TEXT,

  -- Relaciones de usuarios
  assigned_to       UUID REFERENCES users(id) ON DELETE SET NULL,
  commercial_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Estado y progreso
  status            proposal_status NOT NULL DEFAULT 'pendiente',
  progress_pct      SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  priority          proposal_priority NOT NULL DEFAULT 'media',

  -- Fechas
  start_date        DATE,
  end_date          DATE NOT NULL,

  -- Scoring
  bant_score        SMALLINT DEFAULT 0,
  meddic_score      SMALLINT DEFAULT 0,
  gpct_score        SMALLINT DEFAULT 0,
  composite_score   SMALLINT DEFAULT 0,

  -- BANT detalle (JSON)
  bant_data         JSONB,
  meddic_data       JSONB,
  gpct_data         JSONB,

  -- Propuesta de valor
  estimated_value   VARCHAR(100),
  proposal_type     VARCHAR(100),

  -- Control de iteraciones
  iterations_count  SMALLINT NOT NULL DEFAULT 0 CHECK (iterations_count BETWEEN 0 AND 2),
  final_note        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_status       ON proposals(status);
CREATE INDEX idx_proposals_assigned_to  ON proposals(assigned_to);
CREATE INDEX idx_proposals_commercial   ON proposals(commercial_id);
CREATE INDEX idx_proposals_priority     ON proposals(priority);

-- Secuencia para código de propuesta
CREATE SEQUENCE proposal_code_seq START 1;

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS (adjuntos y entregables)
-- ────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  name            VARCHAR(500) NOT NULL,
  doc_type        document_type NOT NULL DEFAULT 'file',

  -- Si es archivo: ruta en Azure Blob
  blob_name       VARCHAR(1000),
  blob_url        VARCHAR(2000),
  file_size_bytes BIGINT,
  mime_type       VARCHAR(100),

  -- Si es link externo (Drive, SharePoint)
  external_url    VARCHAR(2000),

  -- Metadata
  description     TEXT,
  is_deliverable  BOOLEAN NOT NULL DEFAULT false,  -- entregable final
  is_adjustment   BOOLEAN NOT NULL DEFAULT false,  -- ajuste de revisión
  revision_number SMALLINT,                        -- a qué revisión pertenece

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_docs_proposal    ON documents(proposal_id);
CREATE INDEX idx_docs_deliverable ON documents(proposal_id, is_deliverable);

-- ────────────────────────────────────────────────────────────
-- REVISIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE revisions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id       UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  iteration_number  SMALLINT NOT NULL CHECK (iteration_number BETWEEN 1 AND 2),
  requested_by      UUID NOT NULL REFERENCES users(id),
  request_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT NOT NULL,
  status            revision_status NOT NULL DEFAULT 'abierta',

  -- Respuesta del preventa
  adjust_deadline   DATE,
  preventa_note     TEXT,
  responded_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES users(id),

  -- Documento de ajuste
  adjustment_doc_id UUID REFERENCES documents(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(proposal_id, iteration_number)
);

CREATE INDEX idx_revisions_proposal ON revisions(proposal_id);

-- ────────────────────────────────────────────────────────────
-- ACTIVITY LOG (historial de cambios de estado)
-- ────────────────────────────────────────────────────────────
CREATE TABLE activity_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  from_status   proposal_status,
  to_status     proposal_status,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_proposal ON activity_log(proposal_id);
CREATE INDEX idx_activity_user     ON activity_log(user_id);

-- ────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id  UUID REFERENCES proposals(id) ON DELETE SET NULL,
  message      VARCHAR(500) NOT NULL,
  type         VARCHAR(50) NOT NULL DEFAULT 'info',  -- info, warning, success, danger
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user   ON notifications(user_id, read);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at automático
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_revisions_updated_at
  BEFORE UPDATE ON revisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
