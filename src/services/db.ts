import { MongoClient, Db, MongoClientOptions } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'study_companion';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const options: MongoClientOptions = {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    tls: uri.includes('mongodb+srv') || uri.includes('tls=true') || uri.includes('ssl=true'),
    tlsAllowInvalidCertificates: true,
  };

  const client = new MongoClient(uri, options);
  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
