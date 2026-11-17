export const connectMongoDatabase = async ({ mongoose, uri, logger = console }) => {
    const connection = await mongoose.connect(uri);

    logger.log(`MongoDB Connected: ${connection.connection.host}`);
    logger.log(`Database: ${connection.connection.name}`);

    return connection;
};
