import express from 'express';
import { handleStartCall } from './routes/startCall.js';
import { handleVoice } from './routes/voice.js';
import { handleGather } from './routes/gather.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post('/start-call', handleStartCall);
app.post('/voice', handleVoice);
app.post('/gather', handleGather);

export default app;