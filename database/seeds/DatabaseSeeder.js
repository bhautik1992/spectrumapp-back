import connectDB from "../../config/database.js";
import dotenv from "dotenv";
import { usersTable } from "./UsersTable.js";

dotenv.config();

const seedDatabase = async () => {
  try {
    await connectDB();

    await usersTable();

    console.log("Seeder executed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedDatabase();
