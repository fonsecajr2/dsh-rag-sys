import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri || !dbName) {
  throw new Error("Missing MongoDB environment variables.");
}

const client = new MongoClient(uri);

try {
  await client.connect();

  await client.db("admin").command({ ping: 1 });

  console.log("MongoDB connection successful.");

  const db = client.db(dbName);
  console.log(`Configured database: ${db.databaseName}`);

  console.log("Existing collections:",
    await db.listCollections().toArray().then(
      collections => collections.map(c => c.name)
    )
  );
} catch (error) {
  console.error("MongoDB connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}