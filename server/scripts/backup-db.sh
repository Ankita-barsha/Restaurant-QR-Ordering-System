#!/bin/bash
# ==============================================================================
# Restaurant QR Ordering System - Database Backup Script (#33)
# ==============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/restaurant_db_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "📦 Starting database backup at ${TIMESTAMP}..."

if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "${BACKUP_FILE}"
else
  PGPASSWORD="${DB_PASSWORD:-restaurant123}" pg_dump \
    -h "${DB_HOST:-localhost}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER:-restaurant}" \
    -d "${DB_NAME:-restaurant_db}" | gzip > "${BACKUP_FILE}"
fi

echo "✅ Backup successfully created at: ${BACKUP_FILE}"

# Retention: Remove backups older than 30 days
find "${BACKUP_DIR}" -type f -name "restaurant_db_*.sql.gz" -mtime +30 -exec rm -f {} \;
echo "🧹 Cleaned backups older than 30 days."
