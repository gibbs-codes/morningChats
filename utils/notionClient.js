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
  // Enhanced logMorningSession method with better error handling and validation
async logMorningSession(databaseId, sessionData) {
  try {
    console.log('📝 Preparing Notion session log...');
    console.log('Database ID:', databaseId);
    console.log('Session Data:', sessionData);
    
    // Validate required data
    if (!databaseId) {
      throw new Error('Database ID is required');
    }
    
    if (!this.apiKey) {
      throw new Error('Notion API key is not configured');
    }
    
    // Prepare the payload with safe defaults
    const payload = {
      parent: { database_id: databaseId },
      properties: {
        'Date': {
          date: { start: new Date().toISOString().split('T')[0] }
        },
        'Session Summary': {
          rich_text: [{ 
            text: { 
              content: sessionData.summary || 'Morning coaching session completed' 
            } 
          }]
        },
        'Key Goals': {
          rich_text: [{ 
            text: { 
              content: sessionData.goals || 'Goals discussed during session' 
            } 
          }]
        },
        'Mood': {
          select: { name: sessionData.mood || 'Neutral' }
        },
        'Duration': {
          number: sessionData.duration || 0
        }
      }
    };
    
    console.log('📤 Sending to Notion API...');
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(`${this.baseURL}/pages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload)
    });
    
    console.log('📥 Notion API Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Notion API Error Response:', errorText);
      throw new Error(`Notion API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Notion API Success:', result.id);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error logging to Notion:', error);
    
    // Log more details for debugging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    
    // Return null but don't throw - we don't want to break the session ending
    return null;
  }
}

// Add a method to test Notion connection
async testNotionConnection(databaseId) {
  try {
    console.log('🔍 Testing Notion connection...');
    
    const response = await fetch(`${this.baseURL}/databases/${databaseId}`, {
      method: 'GET',
      headers: this.headers
    });
    
    if (response.ok) {
      const dbInfo = await response.json();
      console.log('✅ Notion connection successful:', dbInfo.title?.[0]?.text?.content || 'Database');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ Notion connection failed:', response.status, errorText);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Notion connection test error:', error);
    return false;
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