#!/usr/bin/env bash
# ============================================================
# Bluetab Preventa — Aprovisionamiento Azure
# Ejecutar UNA VEZ para crear todos los recursos.
# Requiere: Azure CLI instalado y sesión iniciada (az login)
# ============================================================

set -euo pipefail

# ── Configura estos valores antes de ejecutar ───────────────
RESOURCE_GROUP="rg-bluetab-preventa"
LOCATION="eastus"                        # o "brazilsouth" si prefieres latencia Colombia
APP_NAME="bluetab-preventa-api"          # App Service nombre único
STATIC_APP="bluetab-preventa-web"        # Static Web App nombre único
DB_SERVER="bluetab-preventa-pg"          # PostgreSQL server nombre único
DB_NAME="bluetabpreventa"
DB_ADMIN="btadmin"
DB_PASSWORD="CambiaEsto!Seguro2025"      # Cambia esto
STORAGE_ACCOUNT="bluetabpropuestas"      # Solo minúsculas, sin guiones, max 24 chars
BLOB_CONTAINER="propuestas"
COMMS_SERVICE="bluetab-comms"
# ────────────────────────────────────────────────────────────

echo "🔵 1/7 Creando Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

echo "🔵 2/7 Creando PostgreSQL Flexible Server..."
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER" \
  --location "$LOCATION" \
  --admin-user "$DB_ADMIN" \
  --admin-password "$DB_PASSWORD" \
  --sku-name "Standard_B1ms" \
  --tier "Burstable" \
  --storage-size 32 \
  --version "16" \
  --public-access "0.0.0.0"  # Permite acceso desde tu IP local (ajusta luego)

echo "   Creando base de datos..."
az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$DB_SERVER" \
  --database-name "$DB_NAME"

echo "   Ejecutando schema.sql..."
PGPASSWORD="$DB_PASSWORD" psql \
  --host="${DB_SERVER}.postgres.database.azure.com" \
  --port=5432 \
  --username="${DB_ADMIN}" \
  --dbname="$DB_NAME" \
  --file="./schema.sql" \
  --set=sslmode=require

echo "🔵 3/7 Creando Storage Account y Blob Container..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "Standard_LRS" \
  --kind "StorageV2" \
  --allow-blob-public-access false

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv)

az storage container create \
  --name "$BLOB_CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --public-access "off"

echo "🔵 4/7 Creando App Service Plan y Web App (Backend)..."
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "B1" \
  --is-linux

az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:20-lts"

echo "   Configurando variables de entorno en App Service..."
DB_CONN="postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_SERVER}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"
STORAGE_CONN=$(az storage account show-connection-string \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query connectionString -o tsv)

az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV="production" \
    DATABASE_URL="$DB_CONN" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    AZURE_BLOB_CONTAINER="$BLOB_CONTAINER" \
    JWT_SECRET="$(openssl rand -base64 48)" \
    JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
    JWT_EXPIRES_IN="15m" \
    JWT_REFRESH_EXPIRES_IN="7d" \
    ALLOWED_EMAIL_DOMAIN="bluetab.net" \
    CORS_ORIGIN="https://${STATIC_APP}.azurestaticapps.net" \
    PORT="8080"

echo "🔵 5/7 Creando Azure Communication Services (email)..."
az communication create \
  --name "$COMMS_SERVICE" \
  --resource-group "$RESOURCE_GROUP" \
  --location "global" \
  --data-location "UnitedStates"

COMMS_CONN=$(az communication list-key \
  --name "$COMMS_SERVICE" \
  --resource-group "$RESOURCE_GROUP" \
  --query "primaryConnectionString" -o tsv)

az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    AZURE_COMMUNICATION_CONNECTION_STRING="$COMMS_CONN" \
    AZURE_COMMUNICATION_SENDER="noreply@bluetab.net"

echo "🔵 6/7 Creando Azure Static Web App (Frontend)..."
az staticwebapp create \
  --name "$STATIC_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "Free"

echo "🔵 7/7 Habilitando logs y diagnósticos..."
az webapp log config \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --application-logging filesystem \
  --level information \
  --web-server-logging filesystem

echo ""
echo "✅ Recursos creados exitosamente."
echo ""
echo "📋 Resumen de endpoints:"
echo "   API Backend:  https://${APP_NAME}.azurewebsites.net"
echo "   Frontend:     https://${STATIC_APP}.azurestaticapps.net"
echo "   BD PostgreSQL: ${DB_SERVER}.postgres.database.azure.com"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Copia la DATABASE_URL y demás vars al backend/.env local"
echo "   2. Configura el pipeline CI/CD en GitHub Actions"
echo "   3. Ajusta las reglas de firewall del PostgreSQL para tu IP"
