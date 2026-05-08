import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import prisma from '../utils/prisma.js';
import { documentSchema } from '../schemas/documentSchema.js';
import { addDocumentToQueue } from '../utils/queue.js';

async function documentRoutes(app) {
  // Add authentication hook to all routes in this plugin
  app.addHook('onRequest', app.authenticate);

  // Upload Document
  app.post('/upload', async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const uniqueFilename = `${Date.now()}-${data.filename}`;
    const filePath = path.join(uploadDir, uniqueFilename);

    await pipeline(data.file, fs.createWriteStream(filePath));

    // Get metadata from fields (if any)
    const title = data.fields.title?.value || data.filename;
    const description = data.fields.description?.value || '';

    try {
      const document = await prisma.document.create({
        data: {
          title,
          description,
          filePath: uniqueFilename,
          fileType: data.mimetype,
          userId: request.user.id,
        },
      });

      // Add to background processing queue
      await addDocumentToQueue(document.id, uniqueFilename);

      return { message: 'File uploaded successfully and processing started', document };
    } catch (error) {
      return reply.status(500).send({ error: 'Database error' });
    }
  });

  // List Documents
  app.get('/', async (request, reply) => {
    const documents = await prisma.document.findMany({
      where: { userId: request.user.id },
      include: { user: { select: { name: true, email: true } } },
    });
    return documents;
  });

  // Get single Document
  app.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        reviews: { include: { user: { select: { name: true } } } },
      },
    });

    if (!document) {
      return reply.status(404).send({ error: 'Document not found' });
    }

    return document;
  });
}

export default documentRoutes;
