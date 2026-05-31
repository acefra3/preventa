# Bluetab Preventa Platform

Plataforma de gestión de propuestas técnicas para el equipo comercial y preventa de Bluetab.

## Stack tecnológico

| Capa | Tecnología | Hosting |
|------|-----------|---------|
| Frontend | React 18 + Vite + Tailwind CSS | Azure Static Web Apps |
| Backend | Node.js 20 + Express 5 | Azure App Service (Linux) |
| Base de datos | PostgreSQL 16 | Azure Database for PostgreSQL Flexible Server |
| Almacenamiento archivos | Azure Blob Storage | Storage Account |
| Correos | Azure Communication Services | — |
| Autenticación | JWT (access + refresh tokens) | — |

## Inicio rápido local

```bash
# 1. Clonar y configurar .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. PostgreSQL local con Docker
docker-compose up -d postgres

# 3. Migrar esquema y seed
cd backend && npm install && npm run db:migrate && npm run db:seed

# 4. Iniciar backend (puerto 3001)
npm run dev

# 5. Iniciar frontend (puerto 5173)
cd ../frontend && npm install && npm run dev
```

O usa VS Code → Run and Debug → **"Full Stack"**
