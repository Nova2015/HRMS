const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const buckets = new Map();

const getClientKey = (req) => req.ip || req.socket?.remoteAddress || "unknown";

export const loginRateLimit = (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req);
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + WINDOW_MS };
        buckets.set(key, bucket);
    }

    if (bucket.count >= MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
            success: false,
            message: "Too many login attempts. Please try again later."
        });
    }

    bucket.count += 1;

    // Bound memory use and remove expired entries during incoming login traffic.
    if (buckets.size > 10000) {
        for (const [entryKey, entry] of buckets) {
            if (now >= entry.resetAt) buckets.delete(entryKey);
        }
    }

    return next();
};
