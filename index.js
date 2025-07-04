// index.js - Main entry point
import app from './app.js';
import { PORT } from './config.js';

const port = PORT || 3002;

app.listen(port, () => {
  console.log(`🚀 Morning Coach listening on port ${port}`);
  console.log(`🎯 Ready for Twilio webhooks`);
});