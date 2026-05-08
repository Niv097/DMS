import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({ select: { name: true, email: true, password_hash: true } });
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

check();
