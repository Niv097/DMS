import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const main = async () => {
    try {
        console.log('Testing DB con with Adapter...');
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        const adapter = new PrismaPg(pool);
        const prisma = new PrismaClient({ adapter });
        const users = await prisma.user.findMany();
        console.log('Success! Users found:', users.length);
        await prisma.$disconnect();
    } catch (err) {
        console.error('Connection failed:', err);
    }
};

main();
