// utils/storage.js
// Simple in-memory storage for conversation context during calls

class ContextStorage {
  constructor() {
    this.storage = new Map();
  }

  // Get conversation history for a call
  get(callSid) {
    return this.storage.get(callSid) || [];
  }

  // Set conversation history for a call
  set(callSid, history) {
    this.storage.set(callSid, history);
  }

  // Clear conversation history for a call
  clear(callSid) {
    this.storage.delete(callSid);
  }

  // Clear all stored conversations (cleanup)
  clearAll() {
    this.storage.clear();
  }

  // Get info about stored sessions (for debugging)
  getInfo() {
    return {
      activeSessions: this.storage.size,
      sessionIds: Array.from(this.storage.keys())
    };
  }
}

// Export singleton instance
export const ctx = new ContextStorage();