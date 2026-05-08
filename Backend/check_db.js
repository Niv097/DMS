import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    try {
        const users = await prisma.user.findMany();
        console.log('Users:', users.map(u => u.name));
        
        const notes = await prisma.note.findMany();
        console.log('Notes:', notes.length);
        
        const logs = await prisma.auditLog.findMany({ include: { user: true } });
        console.log('Audit Logs:', logs.length);
        if (logs.length > 0) {
            console.log('Sample Log User:', logs[0].user?.name);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
