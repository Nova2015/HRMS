import mongoose from "mongoose";
import { registerMongoConnectionEvents } from "../utils/mongoConnectionEvents.js";

registerMongoConnectionEvents(mongoose.connection);

const connectDB = async () => {
    try {
        const connection = await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(`MongoDB Connected: ${connection.connection.host}`);
        console.log(`Database: ${connection.connection.name}`);

    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};

export default connectDB;
