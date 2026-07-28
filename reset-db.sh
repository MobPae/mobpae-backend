#!/bin/bash
# MobPae DB reset + reseed
# Run from mobpae-backend/: bash reset-db.sh

set -e
cd "$(dirname "$0")"

DB_URL="${DATABASE_URL:-$(grep -m1 '^DATABASE_URL=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"')}"

if [[ -z "$DB_URL" ]]; then
  echo "❌ Could not determine DATABASE_URL (checked env var and .env). Aborting."
  exit 1
fi

if [[ "$DB_URL" != *"localhost"* && "$DB_URL" != *"127.0.0.1"* ]]; then
  DB_NAME=$(echo "$DB_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  echo "⚠️  DATABASE_URL does not point to localhost:"
  echo "    $DB_URL"
  echo ""
  echo "This script DROPS EVERY TABLE and reseeds demo data. Refusing to run"
  echo "against a non-local database without explicit confirmation."
  echo ""
  read -r -p "Type the database name (\"$DB_NAME\") to confirm you want to WIPE it: " confirm
  if [[ "$confirm" != "$DB_NAME" ]]; then
    echo "Confirmation did not match. Aborting."
    exit 1
  fi
fi

echo "==> Resetting database (drop all tables + re-run all migrations)…"
npx prisma migrate reset --force

echo ""
echo "==> Running seed…"
npx tsx prisma/seed.ts

echo ""
echo "✅ Done! Login credentials:"
echo "   Admin:    admin@mobpae.com / Admin@1234"
echo "   Employer: employer@northstar.mobpae.com / Demo@1234"
echo "   Employee: emp001@northstar.mobpae.com / Demo@1234 (emp001–emp010)"
