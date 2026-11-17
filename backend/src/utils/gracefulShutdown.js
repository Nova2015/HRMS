export const createGracefulShutdown = ({
    server,
    disconnect,
    exit = (code) => process.exit(code),
    logger = console,
    timeoutMs = 10000
}) => {
    let shuttingDown = false;
    let finished = false;
    let timeout;

    const finish = async (exitCode) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        let finalExitCode = exitCode;
        try {
            await disconnect();
            logger.log("MongoDB connection closed.");
        } catch (error) {
            finalExitCode = 1;
            logger.error("MongoDB disconnect failed:", error.message);
        }

        exit(finalExitCode);
    };

    return (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;

        logger.log(`${signal} received. Graceful shutdown started.`);

        timeout = setTimeout(() => {
            logger.error("Graceful shutdown timed out. Closing active HTTP connections.");
            server.closeAllConnections?.();
            void finish(1);
        }, timeoutMs);
        timeout.unref?.();

        server.close((error) => {
            if (error) {
                logger.error("HTTP server shutdown failed:", error.message);
                void finish(1);
                return;
            }
            logger.log("HTTP server closed.");
            void finish(0);
        });
    };
};
