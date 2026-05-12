import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';

import { fileURLToPath } from 'url';

console.log('Core packages loaded successfully');

import prisma from '../Backend/src/utils/prisma.js';
console.log('Prisma utility loaded successfully');

import authMiddleware from '../Backend/src/middleware/auth.js';
console.log('Auth middleware loaded successfully');

import authRoutes from '../Backend/src/routes/auth.js';
console.log('Auth routes loaded successfully');

import noteRoutes from '../Backend/src/routes/notes.js';
console.log('Note routes loaded successfully');
