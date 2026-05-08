import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6337');

export const documentQueue = new Queue('document-processing', { connection });

export const addDocumentToQueue = async (documentId, filePath) => {
  await documentQueue.add('process-pdf', { documentId, filePath });
};
