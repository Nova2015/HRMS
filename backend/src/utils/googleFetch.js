export const googleFetch = async (url, options = {}, timeoutMs = 10_000, fetchImpl = fetch) => {
    // Keep the timeout signal attached to the Response so body reads (json/text)
    // are also bounded, not just the wait for response headers.
    const signal = AbortSignal.timeout(timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal });
    } catch (error) {
        if (signal.aborted || error?.name === "AbortError" || error?.name === "TimeoutError") {
            const timeoutError = new Error("Google service request timed out; try again");
            timeoutError.status = 504;
            throw timeoutError;
        }
        const networkError = new Error("Could not reach Google services; try again");
        networkError.status = 502;
        throw networkError;
    }
};
