export const registerMongoConnectionEvents = (connection, logger = console) => {
    connection.on("connected", () => {
        logger.log("MongoDB connection established.");
    });

    connection.on("reconnected", () => {
        logger.log("MongoDB connection restored.");
    });

    connection.on("disconnected", () => {
        logger.error("MongoDB connection lost. Mongoose will attempt to reconnect.");
    });

    connection.on("error", (error) => {
        logger.error("MongoDB connection error:", error.message);
    });
};
