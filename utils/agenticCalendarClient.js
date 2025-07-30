// utils/agenticCalendarClient.js
// Agentic Calendar Client with full CRUD operations for MorningChats

import fetch from 'node-fetch';

class AgenticCalendarClient {
  constructor() {
    this.baseUrl = process.env.CALENDAR_SERVICE_URL || 'http://cal.local:3000';
    this.timeout = 15000; // 15 second timeout for agentic operations
  }

  // ===== READ OPERATIONS =====

  /**
   * Get today's events
   */
  async getTodaysEvents() {
    try {
      console.log('📅 [AGENT] Fetching today\'s events...');
      const response = await this.makeRequest('GET', '/events/today');
      const events = this.transformEvents(response.events || []);
      console.log(`✅ [AGENT] Retrieved ${events.length} events`);
      return events;
    } catch (error) {
      console.error('❌ [AGENT] Failed to get today\'s events:', error.message);
      return [];
    }
  }

  /**
   * Get events for specific date
   */
  async getEventsForDate(date) {
    try {
      console.log(`📅 [AGENT] Fetching events for ${date}...`);
      const response = await this.makeRequest('GET', `/events/${date}`);
      const events = this.transformEvents(response.events || []);
      console.log(`✅ [AGENT] Retrieved ${events.length} events for ${date}`);
      return events;
    } catch (error) {
      console.error(`❌ [AGENT] Failed to get events for ${date}:`, error.message);
      return [];
    }
  }

  /**
   * Search events by title/description (agentic capability)
   */
  async searchEvents(query) {
    try {
      console.log(`🔍 [AGENT] Searching events for: "${query}"`);
      const todaysEvents = await this.getTodaysEvents();
      
      const matches = todaysEvents.filter(event => 
        (event.title && event.title.toLowerCase().includes(query.toLowerCase())) ||
        (event.description && event.description.toLowerCase().includes(query.toLowerCase()))
      );
      
      console.log(`✅ [AGENT] Found ${matches.length} matching events`);
      return matches;
    } catch (error) {
      console.error('❌ [AGENT] Search failed:', error.message);
      return [];
    }
  }

  // ===== CREATE OPERATIONS =====

  /**
   * Create new event (enhanced with smart parsing)
   */
  async createEvent(eventData) {
    try {
      console.log('➕ [AGENT] Creating event:', eventData);

      // Smart time parsing and validation
      const parsedEvent = this.parseEventData(eventData);
      
      const response = await this.makeRequest('POST', '/events', parsedEvent);
      
      console.log('✅ [AGENT] Event created:', response.eventId);
      return {
        success: true,
        eventId: response.eventId,
        event: response.event,
        message: `Created "${parsedEvent.summary}" for ${this.formatDateTime(parsedEvent.start)}`
      };
    } catch (error) {
      console.error('❌ [AGENT] Failed to create event:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to create event: ${error.message}`
      };
    }
  }

  /**
   * Quick event creation from natural language
   */
  async createQuickEvent(naturalLanguage) {
    try {
      console.log(`🤖 [AGENT] Creating quick event from: "${naturalLanguage}"`);
      
      const parsed = this.parseNaturalLanguage(naturalLanguage);
      return await this.createEvent(parsed);
    } catch (error) {
      console.error('❌ [AGENT] Quick event failed:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Couldn't understand: "${naturalLanguage}"`
      };
    }
  }

  // ===== UPDATE OPERATIONS =====

  /**
   * Update existing event
   */
  async updateEvent(eventId, updates) {
    try {
      console.log(`✏️ [AGENT] Updating event ${eventId}:`, updates);
      
      const parsedUpdates = this.parseEventData(updates);
      const response = await this.makeRequest('PUT', `/events/${eventId}`, parsedUpdates);
      
      console.log('✅ [AGENT] Event updated:', eventId);
      return {
        success: true,
        eventId: eventId,
        event: response.event,
        message: `Updated event successfully`
      };
    } catch (error) {
      console.error('❌ [AGENT] Failed to update event:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to update event: ${error.message}`
      };
    }
  }

  /**
   * Reschedule event to new time
   */
  async rescheduleEvent(eventId, newTime) {
    try {
      console.log(`🔄 [AGENT] Rescheduling event ${eventId} to ${newTime}`);
      
      const startTime = this.parseTimeFromCoach(newTime);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
      
      return await this.updateEvent(eventId, {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      });
    } catch (error) {
      console.error('❌ [AGENT] Failed to reschedule:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to reschedule: ${error.message}`
      };
    }
  }

  // ===== DELETE OPERATIONS =====

  /**
   * Delete event by ID
   */
  async deleteEvent(eventId) {
    try {
      console.log(`🗑️ [AGENT] Deleting event ${eventId}`);
      
      await this.makeRequest('DELETE', `/events/${eventId}`);
      
      console.log('✅ [AGENT] Event deleted:', eventId);
      return {
        success: true,
        eventId: eventId,
        message: `Event deleted successfully`
      };
    } catch (error) {
      console.error('❌ [AGENT] Failed to delete event:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to delete event: ${error.message}`
      };
    }
  }

  /**
   * Cancel event by title/search
   */
  async cancelEventByTitle(title) {
    try {
      console.log(`🚫 [AGENT] Canceling event with title: "${title}"`);
      
      const matches = await this.searchEvents(title);
      
      if (matches.length === 0) {
        return {
          success: false,
          message: `No events found matching "${title}"`
        };
      }
      
      if (matches.length > 1) {
        return {
          success: false,
          message: `Multiple events found matching "${title}". Please be more specific.`,
          matches: matches.map(e => ({ id: e.id, title: e.title, start: e.start }))
        };
      }
      
      // Delete the single match
      return await this.deleteEvent(matches[0].id);
    } catch (error) {
      console.error('❌ [AGENT] Failed to cancel event:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to cancel event: ${error.message}`
      };
    }
  }

  // ===== AGENTIC INTELLIGENCE =====

  /**
   * Analyze schedule and provide insights
   */
  async analyzeSchedule() {
    try {
      console.log('🧠 [AGENT] Analyzing today\'s schedule...');
      
      const events = await this.getTodaysEvents();
      const now = new Date();
      
      const analysis = {
        totalEvents: events.length,
        upcomingEvents: events.filter(e => new Date(e.start) > now).length,
        timeUntilNext: this.getTimeUntilNextEvent(events, now),
        busyPeriods: this.identifyBusyPeriods(events),
        freeTime: this.calculateFreeTime(events),
        recommendations: this.generateRecommendations(events, now)
      };
      
      console.log('✅ [AGENT] Schedule analysis complete');
      return analysis;
    } catch (error) {
      console.error('❌ [AGENT] Analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Find optimal time slots for new events
   */
  async findAvailableSlots(duration = 60) {
    try {
      console.log(`🔍 [AGENT] Finding ${duration}-minute slots...`);
      
      const events = await this.getTodaysEvents();
      const slots = this.calculateAvailableSlots(events, duration);
      
      console.log(`✅ [AGENT] Found ${slots.length} available slots`);
      return slots;
    } catch (error) {
      console.error('❌ [AGENT] Slot finding failed:', error.message);
      return [];
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Make HTTP request to CalendarService
   */
  async makeRequest(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`${method} ${endpoint} failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Parse event data with smart defaults
   */
  parseEventData(eventData) {
    const startTime = eventData.start ? 
      new Date(eventData.start) : 
      this.parseTimeFromCoach(eventData.time || 'in 1 hour');
    
    const endTime = eventData.end ? 
      new Date(eventData.end) : 
      new Date(startTime.getTime() + (eventData.duration || 60) * 60 * 1000);
    
    return {
      summary: eventData.title || eventData.summary || 'New Event',
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      description: eventData.description || 'Added by Morning Coach',
      location: eventData.location || ''
    };
  }

  /**
   * Parse natural language into event data
   */
  parseNaturalLanguage(text) {
    const timeMatch = text.match(/(\d{1,2}:?\d{0,2})\s*(am|pm)|(\d{1,2})\s*(am|pm)/i);
    const durationMatch = text.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);
    
    // Extract title (everything before time/duration indicators)
    let title = text.replace(/at \d+.*$/i, '').replace(/for \d+.*$/i, '').trim();
    
    if (!title) {
      title = 'Quick Event';
    }
    
    return {
      title: title,
      time: timeMatch ? timeMatch[0] : 'in 1 hour',
      duration: durationMatch ? parseInt(durationMatch[1]) * (durationMatch[2].includes('hour') ? 60 : 1) : 60
    };
  }

  /**
   * Smart time parsing (from original calendarClient)
   */
  parseTimeFromCoach(timeString) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (timeString.includes('tomorrow')) {
      today.setDate(today.getDate() + 1);
    }
    
    const timeMatch = timeString.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      if (!ampm && hours < 8) hours += 12;
      
      today.setHours(hours, minutes, 0, 0);
      return today;
    }
    
    if (timeString.includes('in') && timeString.includes('hour')) {
      const hoursMatch = timeString.match(/in (\d+) hours?/);
      if (hoursMatch) {
        return new Date(now.getTime() + parseInt(hoursMatch[1]) * 60 * 60 * 1000);
      }
    }
    
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  /**
   * Transform CalendarService events to MorningChats format
   */
  transformEvents(events) {
    return events.map(event => ({
      id: event.id,
      title: event.summary || event.title || 'No Title',
      start: event.start?.dateTime || event.start,
      end: event.end?.dateTime || event.end,
      description: event.description || '',
      location: event.location || ''
    }));
  }

  /**
   * Calculate available time slots
   */
  calculateAvailableSlots(events, durationMinutes) {
    const slots = [];
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(18, 0, 0, 0); // Default end at 6 PM
    
    // Sort events by start time
    const sortedEvents = events
      .filter(e => new Date(e.start) > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    
    let currentTime = new Date(Math.max(now.getTime(), now.setHours(9, 0, 0, 0))); // Start at 9 AM or now
    
    for (const event of sortedEvents) {
      const eventStart = new Date(event.start);
      const gapMinutes = (eventStart - currentTime) / (1000 * 60);
      
      if (gapMinutes >= durationMinutes) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
          duration: durationMinutes
        });
      }
      
      currentTime = new Date(event.end);
    }
    
    return slots.slice(0, 3); // Return top 3 slots
  }

  /**
   * Format datetime for display
   */
  formatDateTime(datetime) {
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    });
  }

  /**
   * Generate schedule recommendations
   */
  generateRecommendations(events, now) {
    const recommendations = [];
    
    if (events.length === 0) {
      recommendations.push('Your calendar is free today - great time to focus on deep work!');
    } else if (events.length > 5) {
      recommendations.push('Busy day ahead - consider blocking focus time between meetings.');
    }
    
    const nextEvent = events.find(e => new Date(e.start) > now);
    if (nextEvent) {
      const minutesUntil = (new Date(nextEvent.start) - now) / (1000 * 60);
      if (minutesUntil < 15) {
        recommendations.push(`${nextEvent.title} starts in ${Math.round(minutesUntil)} minutes - time to wrap up!`);
      }
    }
    
    return recommendations;
  }

  getTimeUntilNextEvent(events, now) {
    const nextEvent = events.find(e => new Date(e.start) > now);
    return nextEvent ? Math.round((new Date(nextEvent.start) - now) / (1000 * 60)) : null;
  }

  identifyBusyPeriods(events) {
    // Simple implementation - could be enhanced
    return events.length > 4 ? ['Morning appears busy'] : [];
  }

  calculateFreeTime(events) {
    // Simplified calculation
    return events.length < 3 ? 'Plenty of free time' : 'Some gaps available';
  }
}

// Export singleton
export const agenticCalendarClient = new AgenticCalendarClient();