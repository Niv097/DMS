import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import path from 'path';
import { analyzePdf } from './services/pdfService.js';
import prisma from './utils/prisma.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6337');

const worker = new Worker('document-processing', async (job) => {
  const { documentId, filePath } = job.data;
  console.log(`Processing document: ${documentId} at ${filePath}`);

  try {
    const fullPath = path.join(process.cwd(), 'uploads', filePath);
    const analysis = await analyzePdf(fullPath);

    console.log('Analysis result:', analysis);

    // Update document status or store analysis
    await prisma.document.update({
      where: { id: documentId },
      data: {
        description: `Analyzed: ${analysis.pageCount} pages. ${job.data.description || ''}`,
        status: 'ANALYZED'
      }
    });

  } catch (error) {
    console.error(`Failed to process document ${documentId}:`, error);
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`${job.id} has failed with ${err.message}`);
});

console.log('Worker started...');
export default worker;
