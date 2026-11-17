export const googleFetch = async (url, options = {}, timeoutMs = 10_000, fetchImpl = fetch) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError" || error?.name === "TimeoutError") {
            const timeoutError = new Error("Google service request timed out; try again");
            timeoutError.status = 504;
            throw timeoutError;
        }
        const networkError = new Error("Could not reach Google services; try again");
        networkError.status = 502;
        throw networkError;
    } finally {
        clearTimeout(timeout);
    }
};
