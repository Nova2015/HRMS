import mongoose from "mongoose";
import { registerMongoConnectionEvents } from "../utils/mongoConnectionEvents.js";
import { connectMongoDatabase } from "../utils/connectMongoDatabase.js";

registerMongoConnectionEvents(mongoose.connection);

const connectDB = async () => connectMongoDatabase({
    mongoose,
    uri: process.env.MONGODB_URI
});

export default connectDB;
