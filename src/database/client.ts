import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Retries a database operation on transient connection errors (P1001, P1002, P1017, P2024).
 * Backs off exponentially: 1s, 2s, 4s between retries.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  const RETRYABLE_CODES = ['P1001', 'P1002', 'P1017', 'P2024'];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        RETRYABLE_CODES.includes(error.code);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = 1000 * Math.pow(2, attempt);
      console.warn(
        `⚠️ Database connection error (${(error as Prisma.PrismaClientKnownRequestError).code}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}

export default prisma;
