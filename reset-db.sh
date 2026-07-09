#!/bin/bash
# MobPae DB reset + reseed
# Run from mobpae-backend/: bash reset-db.sh

set -e
cd "$(dirname "$0")"

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
