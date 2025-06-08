// mongoClient.js
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();

const db = client.db('local_coaches');
const memory = db.collection('memory');
const log = db.collection('log');

export { client, db, memory, log };