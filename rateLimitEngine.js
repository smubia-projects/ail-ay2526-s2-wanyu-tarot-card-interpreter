/**
 * Centralised rate-limit engine — Express (CommonJS port of the shared engine).
 * This project is CommonJS (`require`), so the shared ESM engine is ported
 * verbatim here; logic is unchanged. Add the adapter in `rateLimit.js`:
 *
 *   const { createRateLimiter } = require('./rateLimitEngine')
 *   const limiter = createRateLimiter({ project, buckets, redisUrl, redisToken, defaultWindow })
 *   app.post('/api/reading', limiter('reading'), handler)
 *
 * Requires `@upstash/redis`. Limits and switches are read from the shared Upstash
 * Redis DB at request time, cached, with the `buckets` values as the fallback.
 * See the central rate-limit config documentation for the key schema.
 */
const { Redis } = require("@upstash/redis");

const ENGINE_VERSION = "1.3.0";

function clientIp(req) {
  // Cloud Run / proxies sit in front, so req.ip can be the proxy. Prefer XFF.
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
}

function createRateLimiter({
  project,
  buckets,
  redisUrl,
  redisToken,
  defaultWindow = 432000,
  cacheTtl = 90,
}) {
  const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
  const cache = { t: 0, salt: "", killed: false, limits: { ...buckets }, window: defaultWindow };

  async function refresh() {
    const now = Date.now() / 1000;
    if (now - cache.t < cacheTtl) return;
    try {
      // One MGET covers globals + both modes (counts as a single command).
      const keys = [
        "config:kill_all",
        "config:event_mode",
        "config:ratelimit_salt",
        `config:${project}:mode_override`,
        `config:${project}:enabled`,
      ];
      for (const m of ["default", "demo"]) {
        keys.push(`config:${project}:${m}:window`);
        for (const b of Object.keys(buckets)) keys.push(`config:${project}:${m}:${b}`);
      }
      const values = await redis.mget(...keys);
      const data = {};
      keys.forEach((k, i) => { data[k] = values[i]; });

      cache.killed =
        String(data["config:kill_all"]) === "1" ||
        String(data[`config:${project}:enabled`]) === "0";

      let mode = data[`config:${project}:mode_override`] || data["config:event_mode"] || "default";
      if (mode !== "default" && mode !== "demo") mode = "default";
      cache.salt = data["config:ratelimit_salt"] || "";

      const w = data[`config:${project}:${mode}:window`];
      cache.window = w != null ? parseInt(w) : defaultWindow;

      const limits = {};
      for (const [bucket, def] of Object.entries(buckets)) {
        const v = data[`config:${project}:${mode}:${bucket}`];
        limits[bucket] = v != null ? parseInt(v) : def;
      }
      cache.limits = limits;
      cache.t = now;
    } catch {
      // Config unreachable -> keep defaults, stay live, never block.
      cache.killed = false;
      cache.limits = { ...buckets };
      cache.window = defaultWindow;
      cache.t = now;
    }
  }

  return function (bucket) {
    return async function (req, res, next) {
      if (!redis) return next(); // limiting disabled (no creds)
      await refresh();

      if (cache.killed) {
        return res.status(503).json({ message: "This demo is temporarily paused. Check back soon." });
      }

      const max = cache.limits[bucket] != null ? cache.limits[bucket] : buckets[bucket] || 0;
      if (max <= 0) return next();

      const key = `ratelimit:${cache.salt}:${project}:${bucket}:${clientIp(req)}`;
      let count;
      try {
        count = await redis.incr(key);
        if (count === 1) await redis.expire(key, cache.window);
      } catch {
        return next(); // transient Redis error -> fail open
      }
      if (count > max) {
        return res.status(429).json({ message: "Rate limit exceeded.", queries_used: max });
      }
      next();
    };
  };
}

module.exports = { createRateLimiter, ENGINE_VERSION };
