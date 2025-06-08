import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();

const db = client.db('local_coaches');
export const log = db.collection('logs');