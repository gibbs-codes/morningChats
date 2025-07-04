import express from 'express';
import { handleStartCall } from './routes/startCall.js';
import { handleVoice, handleStatus } from './routes/voice.js';
import { handleGather } from './routes/gather.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Main routes
app.post('/start-call', handleStartCall);
app.post('/voice', handleVoice);
app.post('/gather', handleGather);

// Status callback route for Twilio
app.post('/status', handleStatus);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Morning Coach is ready', timestamp: new Date() });
});

export default app;