import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function fix() {
  const passwordHash = await bcrypt.hash('demo123', 10);
  await prisma.user.updateMany({
    data: { password_hash: passwordHash }
  });
  console.log("All passwords reset to demo123");
  process.exit(0);
}

fix();
