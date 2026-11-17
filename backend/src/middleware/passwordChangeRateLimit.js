const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_BUCKETS = 10000;
const buckets = new Map();

export const passwordChangeRateLimit = (req, res, next) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const now = Date.now();
    let bucket = buckets.get(userId);

    if (!bucket || now >= bucket.resetAt) {
        if (!bucket && buckets.size >= MAX_BUCKETS) {
            for (const [key, entry] of buckets) {
                if (now >= entry.resetAt) buckets.delete(key);
            }
            if (buckets.size >= MAX_BUCKETS) {
                buckets.delete(buckets.keys().next().value);
            }
        }
        bucket = { count: 0, resetAt: now + WINDOW_MS };
        buckets.set(userId, bucket);
    }

    if (bucket.count >= MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
            success: false,
            message: "Too many password change attempts. Please try again later."
        });
    }

    bucket.count += 1;
    return next();
};
