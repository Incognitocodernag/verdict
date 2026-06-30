import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';

/**
 * Express middleware to enforce a strict rate limit of 14 uncached LLM requests 
 * per IP per minute using Upstash Redis.
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Extract client IP address, handling proxy headers (Vercel, Cloudflare, etc.)
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  
  // Create a Redis rate limit key specific to the IP address
  const limitKey = `rate_limit:${ip}`;

  try {
    const current = await redisClient.get(limitKey);
    const count = current ? parseInt(current, 10) : 0;

    // Check if the rate limit has been exceeded
    if (count >= 14) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Verdict daily engine capacity reached or IP rate-limit exceeded (Max 14 uncached LLM requests/min). Please try again shortly.',
        retryAfterSeconds: 60
      });
    }

    // Increment request count
    const newCount = await redisClient.incr(limitKey);
    
    // Set 60-second expiration if this is the first request in the window
    if (newCount === 1) {
      await redisClient.expire(limitKey, 60);
    }

    next();
  } catch (error) {
    console.error('Rate limiting middleware processing error:', error);
    // Fail-open for user experience if Redis is briefly unreachable, but log warning
    next();
  }
}
