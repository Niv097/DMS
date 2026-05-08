# DMS DMS - Backend

Enterprise Document Management System backend powered by Fastify and Prisma.

## Tech Stack
- **Backend:** Node.js (Fastify)
- **Database:** PostgreSQL (with Prisma ORM)
- **Authentication:** JWT (JSON Web Token)
- **Security:** bcrypt (Password Hashing)
- **Validation:** Zod
- **Queue:** BullMQ + Redis (for background PDF processing)
- **PDF Processing:** PDF-lib

## Setup & Installation

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Database Migration:**
   Ensure you have a PostgreSQL instance running. Update `.env` with your `DATABASE_URL`.
   ```bash
   npx prisma db push
   ```

3. **Start the Application:**
   ```bash
   npm run dev
   ```

4. **Background Worker:**
   If you have Redis running, start the background worker:
   ```bash
   npm run worker
   ```

## Project Structure
- `src/app.js` - Main entry point
- `src/routes/` - API Route definitions
- `src/plugins/` - Fastify plugins (Auth, CORS, etc.)
- `src/schemas/` - Zod validation schemas
- `src/services/` - Business logic (PDF analysis)
- `src/utils/` - Shared utilities (Prisma client, Queue setup)
- `prisma/schema.prisma` - DB Models

## API Endpoints
- **Auth:**
  - `POST /api/auth/register` - User registration
  - `POST /api/auth/login` - User login
- **Documents:**
  - `POST /api/documents/upload` - Upload a document (Requires JWT)
  - `GET /api/documents` - List user's documents (Requires JWT)
  - `GET /api/documents/:id` - Get document details (Requires JWT)

