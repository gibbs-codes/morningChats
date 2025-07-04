import fetch from 'node-fetch';

class NotionClient {
  constructor() {
    this.apiKey = process.env.NOTION_API_KEY;
    this.baseURL = 'https://api.notion.com/v1';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
  }

  // Get today's habits/tasks from a Notion database
  async getTodayHabits(databaseId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await fetch(`${this.baseURL}/databases/${databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: {
            and: [
              {
                property: 'Date',
                date: { equals: today }
              },
              {
                property: 'Completed',
                checkbox: { equals: false }
              }
            ]
          }
        })
      });

      const data = await response.json();
      return data.results.map(page => ({
        id: page.id,
        title: page.properties.Name?.title?.[0]?.text?.content || 'Untitled',
        completed: page.properties.Completed?.checkbox || false,
        priority: page.properties.Priority?.select?.name || 'Medium'
      }));
    } catch (error) {
      console.error('Error fetching Notion habits:', error);
      return [];
    }
  }

  // Log morning chat session to Notion
  async logMorningSession(databaseId, sessionData) {
    try {
      const response = await fetch(`${this.baseURL}/pages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: {
            'Date': {
              date: { start: new Date().toISOString().split('T')[0] }
            },
            'Session Summary': {
              rich_text: [{ text: { content: sessionData.summary || 'Morning coaching session completed' } }]
            },
            'Key Goals': {
              rich_text: [{ text: { content: sessionData.goals || 'Goals discussed during session' } }]
            },
            'Mood': {
              select: { name: sessionData.mood || 'Neutral' }
            },
            'Duration': {
              number: sessionData.duration || 0
            }
          }
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error logging to Notion:', error);
      return null;
    }
  }

  // Add a new task/goal - simplified, no completion needed
  async addTask(databaseId, taskData) {
    try {
      const response = await fetch(`${this.baseURL}/pages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: {
            'Name': {
              title: [{ text: { content: taskData.title } }]
            },
            'Date': {
              date: { start: taskData.date || new Date().toISOString().split('T')[0] }
            },
            'Priority': {
              select: { name: taskData.priority || 'Medium' }
            },
            'Source': {
              rich_text: [{ text: { content: 'Morning Coach' } }]
            },
            'Completed': {
              checkbox: false
            }
          }
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error adding task to Notion:', error);
      return null;
    }
  }

  // Remove the completeHabit method since we're not auto-completing

  // Get reflection entries for context
  async getRecentReflections(databaseId, days = 7) {
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      
      const response = await fetch(`${this.baseURL}/databases/${databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: {
            property: 'Date',
            date: { after: pastDate.toISOString().split('T')[0] }
          },
          sorts: [
            {
              property: 'Date',
              direction: 'descending'
            }
          ]
        })
      });

      const data = await response.json();
      return data.results.map(page => ({
        date: page.properties.Date?.date?.start,
        reflection: page.properties.Reflection?.rich_text?.[0]?.text?.content || '',
        mood: page.properties.Mood?.select?.name || 'Unknown'
      }));
    } catch (error) {
      console.error('Error fetching reflections:', error);
      return [];
    }
  }
}

export const notionClient = new NotionClient();