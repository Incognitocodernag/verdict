import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
let isMock = false;

// Simple memory store in case Upstash is not configured
const memoryStore = new Map<string, string>();
const memoryTtl = new Map<string, number>();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl && redisToken && !redisUrl.includes('your-upstash')) {
  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('Upstash Serverless Redis initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Upstash Redis, falling back to in-memory mock:', error);
    isMock = true;
  }
} else {
  console.warn('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured. Running with in-memory Redis mock.');
  isMock = true;
}

export const redisClient = {
  get: async (key: string): Promise<string | null> => {
    if (isMock) {
      const val = memoryStore.get(key) || null;
      if (val && memoryTtl.has(key)) {
        const exp = memoryTtl.get(key)!;
        if (Date.now() > exp) {
          memoryStore.delete(key);
          memoryTtl.delete(key);
          return null;
        }
      }
      return val;
    }
    const result = await redis!.get(key);
    // Upstash SDK might return objects, convert to string if it is an object
    if (result && typeof result === 'object') {
      return JSON.stringify(result);
    }
    return result as string | null;
  },

  set: async (key: string, value: string, options?: { ex?: number }): Promise<'OK' | null> => {
    if (isMock) {
      memoryStore.set(key, value);
      if (options?.ex) {
        memoryTtl.set(key, Date.now() + options.ex * 1000);
      }
      return 'OK';
    }
    return redis!.set(key, value, options);
  },

  incr: async (key: string): Promise<number> => {
    if (isMock) {
      const val = memoryStore.get(key);
      const num = val ? parseInt(val, 10) + 1 : 1;
      memoryStore.set(key, num.toString());
      return num;
    }
    return redis!.incr(key);
  },

  expire: async (key: string, seconds: number): Promise<number> => {
    if (isMock) {
      memoryTtl.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return redis!.expire(key, seconds);
  },

  del: async (key: string): Promise<number> => {
    if (isMock) {
      const had = memoryStore.has(key);
      memoryStore.delete(key);
      memoryTtl.delete(key);
      return had ? 1 : 0;
    }
    return redis!.del(key);
  },

  isMock: () => isMock
};
export type RedisClientType = typeof redisClient;
