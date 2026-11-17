const pendingOperations = new Map();

export const runSingleFlight = (key, operation) => {
    if (pendingOperations.has(key)) return pendingOperations.get(key);

    const promise = Promise.resolve().then(operation);
    pendingOperations.set(key, promise);
    const cleanup = () => {
        if (pendingOperations.get(key) === promise) pendingOperations.delete(key);
    };
    promise.then(cleanup, cleanup);
    return promise;
};
