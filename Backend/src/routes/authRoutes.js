import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import { registerSchema, loginSchema } from '../schemas/userSchema.js';

async function authRoutes(app) {
  // Register Route
  app.post('/register', async (request, reply) => {
    try {
      const { email, password, name, role } = registerSchema.parse(request.body);

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
        },
      });

      return { message: 'User registered successfully', userId: user.id };
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors });
      }
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Login Route
  app.post('/login', async (request, reply) => {
    try {
      const { email, password } = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: error.errors });
      }
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}

export default authRoutes;
