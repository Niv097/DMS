import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const source = path.join(root, 'prisma', 'schema.prisma');
const target = path.join(root, 'schema.prisma');

const sourceContents = await fs.readFile(source, 'utf8');
await fs.writeFile(target, sourceContents, 'utf8');

console.log('Synced prisma/schema.prisma -> schema.prisma');
