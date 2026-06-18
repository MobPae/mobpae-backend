import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@mobpae.com';
  const existingAdmin = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingAdmin) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const password = await bcrypt.hash('Admin@1234', 10);

  await prisma.user.create({
    data: {
      email,
      password,
      role: 'ADMIN',
      isActive: true,
      passwordChanged: true,
    },
  });

  console.log(`Admin user seeded: ${email}`);
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
