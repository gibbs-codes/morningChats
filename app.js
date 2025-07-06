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

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'morning-chats',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Status endpoint for monitoring
app.get('/status', (req, res) => {
  res.json({
    service: 'morning-chats',
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    twilio: {
      configured: !!process.env.TWILIO_ACCOUNT_SID
    },
    openai: {
      configured: !!process.env.OPENAI_API_KEY
    },
    notion: {
      configured: !!process.env.NOTION_API_KEY
    }
  });
});
export default app;