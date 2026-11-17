export const getDatabaseReadiness = (readyState) => ({
    ready: readyState === 1,
    database: readyState === 1 ? "connected" : "disconnected"
});
