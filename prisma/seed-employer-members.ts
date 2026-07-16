/**
 * One-time migration: seed EmployerMember rows from existing Employer.userId.
 *
 * For every Employer that has a userId, this script creates one EmployerMember
 * row with role OWNER and status ACTIVE — unless one already exists (idempotent).
 *
 * Run after the `employer-member-invite` migration:
 *   npx ts-node prisma/seed-employer-members.ts
 */

import { PrismaClient, EmployerRole, EmployerMemberStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // userId is non-nullable on Employer — every employer row has one
  const employers = await prisma.employer.findMany({
    select: { id: true, userId: true, createdAt: true, companyName: true },
  });

  console.log(`Found ${employers.length} employer(s) with a userId.`);

  let created = 0;
  let skipped = 0;

  for (const employer of employers) {
    if (!employer.userId) continue;

    const existing = await prisma.employerMember.findUnique({
      where: {
        employerId_userId: {
          employerId: employer.id,
          userId: employer.userId,
        },
      },
    });

    if (existing) {
      console.log(`  SKIP  ${employer.companyName} — member already exists`);
      skipped++;
      continue;
    }

    await prisma.employerMember.create({
      data: {
        employerId: employer.id,
        userId: employer.userId,
        role: EmployerRole.OWNER,
        status: EmployerMemberStatus.ACTIVE,
        joinedAt: employer.createdAt,
      },
    });

    console.log(`  CREATE ${employer.companyName} → OWNER`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
