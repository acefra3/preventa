# Guía de infraestructura Azure — Bluetab Preventa

## Servicios a crear en Azure Portal

### 1. Azure Database for PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --name bluetab-preventa-db \
  --resource-group bluetab-rg \
  --location eastus \
  --admin-user bluetab_admin \
  --admin-password <PASSWORD_SEGURA> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 15 \
  --storage-size 32

# Crear la base de datos
az postgres flexible-server db create \
  --server-name bluetab-preventa-db \
  --resource-group bluetab-rg \
  --database-name bluetab_preventa

# Abrir firewall para Azure services
az postgres flexible-server firewall-rule create \
  --name AllowAzureServices \
  --server-name bluetab-preventa-db \
  --resource-group bluetab-rg \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

**Connection string para .env de producción:**
```
DATABASE_URL=postgresql://bluetab_admin:<PASSWORD>@bluetab-preventa-db.postgres.database.azure.com:5432/bluetab_preventa?sslmode=require
```

---

### 2. Azure Blob Storage

```bash
# Crear storage account
az storage account create \
  --name bluetabpreventa \
  --resource-group bluetab-rg \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2

# Crear contenedor privado para documentos
az storage container create \
  --name propuestas-docs \
  --account-name bluetabpreventa \
  --public-access off

# Obtener connection string
az storage account show-connection-string \
  --name bluetabpreventa \
  --resource-group bluetab-rg
```

Copiar el `connectionString` al `.env` como `AZURE_STORAGE_CONNECTION_STRING`.

---

### 3. Azure App Service (Backend)

```bash
# Crear App Service Plan
az appservice plan create \
  --name bluetab-preventa-plan \
  --resource-group bluetab-rg \
  --sku B1 \
  --is-linux

# Crear Web App
az webapp create \
  --name bluetab-preventa-api \
  --resource-group bluetab-rg \
  --plan bluetab-preventa-plan \
  --runtime "NODE:20-lts"

# Configurar variables de entorno (reemplazar valores)
az webapp config appsettings set \
  --name bluetab-preventa-api \
  --resource-group bluetab-rg \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    DATABASE_URL="<CONNECTION_STRING_POSTGRES>" \
    JWT_SECRET="<SECRET_64_CHARS>" \
    JWT_EXPIRES_IN="8h" \
    ALLOWED_ORIGINS="https://<tu-static-web-app>.azurestaticapps.net" \
    ALLOWED_EMAIL_DOMAIN="bluetab.net" \
    AZURE_STORAGE_CONNECTION_STRING="<STORAGE_CONN_STR>" \
    AZURE_STORAGE_CONTAINER_NAME="propuestas-docs" \
    SMTP_HOST="smtp.office365.com" \
    SMTP_PORT="587" \
    SMTP_USER="noreply@bluetab.net" \
    SMTP_PASS="<PASSWORD>" \
    FRONTEND_URL="https://<tu-static-web-app>.azurestaticapps.net"

# Habilitar logs
az webapp log config \
  --name bluetab-preventa-api \
  --resource-group bluetab-rg \
  --web-server-logging filesystem
```

---

### 4. Azure Static Web Apps (Frontend)

```bash
az staticwebapp create \
  --name bluetab-preventa-web \
  --resource-group bluetab-rg \
  --location eastus2 \
  --source https://github.com/<tu-org>/bluetab-preventa \
  --branch main \
  --app-location frontend \
  --output-location dist \
  --login-with-github
```

---

### 5. Secrets para GitHub Actions

En tu repositorio GitHub → Settings → Secrets → Actions:

| Secret | Valor |
|--------|-------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Descargar desde App Service → Get Publish Profile |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Aparece al crear el Static Web App |

---

## Ejecutar migraciones en producción

```bash
# Una sola vez al crear la BD en Azure
DATABASE_URL="postgresql://..." npm run migrate --prefix backend
DATABASE_URL="postgresql://..." npm run seed   --prefix backend
```

## Verificar deploy

```bash
# Backend health check
curl https://bluetab-preventa-api.azurewebsites.net/api/health

# Logs en tiempo real
az webapp log tail \
  --name bluetab-preventa-api \
  --resource-group bluetab-rg
```
