/**
 * Rate-limit adapter for the Tarot Card Interpreter.
 *
 * Wraps the shared engine (rateLimitEngine.js) with this project's slug and buckets.
 * Exports Express middleware for the single "reading" bucket so server.js can use
 * it directly on POST /api/reading. The engine handles X-Forwarded-For, central
 * config, event mode, the kill switch (503), and fail-open.
 */
const { createRateLimiter } = require("./rateLimitEngine");

const limiter = createRateLimiter({
  // Slug = full project folder name (canonical identifier across code + sheet).
  project: "ail-ay2526-s2-wanyu-tarot-card-interpreter",
  buckets: { reading: Number(process.env.RATE_LIMIT_READING_MAX || 5) },
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN,
  defaultWindow: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 432000),
});

module.exports = limiter("reading");
