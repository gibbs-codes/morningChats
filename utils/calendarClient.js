import fetch from 'node-fetch';

class CalendarClient {
  constructor() {
    // You'll need to set up Google Calendar API credentials
    this.accessToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  }

  // Add event to calendar - simplified for coach use
  async addEvent(eventData) {
    try {
      // Parse time intelligently
      const startTime = this.parseTimeFromCoach(eventData.time);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

      const event = {
        summary: eventData.title,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Chicago' // Update to your timezone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Chicago'
        },
        description: 'Added by Morning Coach'
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );

      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding calendar event:', error);
      return null;
    }
  }

  // Smart time parsing for coach commands
  parseTimeFromCoach(timeString) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Handle common patterns
    if (timeString.includes('tomorrow')) {
      today.setDate(today.getDate() + 1);
    }
    
    // Simple time parsing
    const timeMatch = timeString.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      // If no am/pm specified and hour is small, assume PM for afternoon scheduling
      if (!ampm && hours < 8) hours += 12;
      
      today.setHours(hours, minutes, 0, 0);
      return today;
    }
    
    // Relative times
    if (timeString.includes('in') && timeString.includes('hour')) {
      const hoursMatch = timeString.match(/in (\d+) hours?/);
      if (hoursMatch) {
        const hoursFromNow = parseInt(hoursMatch[1]);
        return new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
      }
    }
    
    // Default to 1 hour from now if can't parse
    return new Date(now.getTime() + 60 * 60 * 1000);
  }
}

export const calendarClient = new CalendarClient();