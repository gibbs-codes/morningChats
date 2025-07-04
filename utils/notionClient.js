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

  // Get database schema for debugging
  async getDatabaseSchema(databaseId) {
    try {
      console.log('🔍 Fetching database schema...');
      
      const response = await fetch(`${this.baseURL}/databases/${databaseId}`, {
        method: 'GET',
        headers: this.headers
      });
      
      if (response.ok) {
        const dbInfo = await response.json();
        console.log('📊 Database properties:');
        
        // Log each property with its type for debugging
        Object.entries(dbInfo.properties).forEach(([name, prop]) => {
          console.log(`  - ${name}: ${prop.type}`);
        });
        
        return dbInfo.properties;
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to get database schema:', response.status, errorText);
        return null;
      }
      
    } catch (error) {
      console.error('❌ Database schema fetch error:', error);
      return null;
    }
  }

  // FIXED: Log morning session matching your exact schema
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
      
      // Create a unique session title with date and time
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // 2025-07-04
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }); // 09:30
      
      // Build payload matching your EXACT schema
      const payload = {
        parent: { database_id: databaseId },
        properties: {
          // Date is your title field
          "Date": {
            title: [{ 
              text: { 
                content: `${dateStr} - ${timeStr} Morning Session`
              } 
            }]
          },
          
          // Priorities as text (extract key commitments)
          "Priorities": {
            rich_text: [{ 
              text: { 
                content: this.extractPriorities(sessionData)
              } 
            }]
          },
          
          // Mood as text (extract from mood_energy)
          "Mood": {
            rich_text: [{ 
              text: { 
                content: this.extractMood(sessionData.mood || 'Neutral')
              } 
            }]
          },
          
          // Energy Level as text
          "Energy Level": {
            rich_text: [{ 
              text: { 
                content: this.extractEnergyLevel(sessionData.mood || 'Medium')
              } 
            }]
          },
          
          // Notes as text (comprehensive session summary)
          "Notes": {
            rich_text: [{ 
              text: { 
                content: this.generateComprehensiveNotes(sessionData)
              } 
            }]
          }
        }
      };

      // Add optional fields if you've added them to your database
      // (These won't cause errors if the fields don't exist)
      
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
      return null;
    }
  }

  // Helper: Extract priorities from session data
  extractPriorities(sessionData) {
    const priorities = [];
    
    // Extract from goals if available
    if (sessionData.goals && sessionData.goals !== 'No specific goals set') {
      priorities.push(sessionData.goals);
    }
    
    // Extract from summary if it contains specific tasks
    if (sessionData.summary) {
      const taskMatches = sessionData.summary.match(/\b(DTT|Office Attendance|workout|meeting|call)\b/gi);
      if (taskMatches) {
        priorities.push(...taskMatches.slice(0, 3));
      }
    }
    
    // Default if nothing found
    if (priorities.length === 0) {
      priorities.push('Daily planning and check-in');
    }
    
    return [...new Set(priorities)].join(', '); // Remove duplicates
  }

  // Helper: Extract mood from mood_energy string
  extractMood(moodData) {
    if (!moodData) return 'Neutral';
    
    const moodText = moodData.toLowerCase();
    
    if (moodText.includes('positive') || moodText.includes('excited') || moodText.includes('great')) {
      return 'Positive';
    } else if (moodText.includes('low') || moodText.includes('tired') || moodText.includes('difficult')) {
      return 'Low';
    } else if (moodText.includes('focused') || moodText.includes('engaged') || moodText.includes('ready')) {
      return 'Focused';
    } else if (moodText.includes('neutral') || moodText.includes('normal')) {
      return 'Neutral';
    } else {
      return 'Mixed';
    }
  }

  // Helper: Extract energy level
  extractEnergyLevel(moodData) {
    if (!moodData) return 'Medium';
    
    const energyText = moodData.toLowerCase();
    
    if (energyText.includes('high') || energyText.includes('energetic') || energyText.includes('excited')) {
      return 'High';
    } else if (energyText.includes('low') || energyText.includes('tired') || energyText.includes('sluggish')) {
      return 'Low';
    } else {
      return 'Medium';
    }
  }

  // Helper: Generate comprehensive notes
  generateComprehensiveNotes(sessionData) {
    const notes = [];
    
    // Add session summary
    if (sessionData.summary) {
      notes.push(`Session: ${sessionData.summary}`);
    }
    
    // Add duration
    if (sessionData.duration) {
      notes.push(`Duration: ${sessionData.duration} minutes`);
    }
    
    // Add specific goals/commitments
    if (sessionData.goals && sessionData.goals !== 'No specific goals set') {
      notes.push(`Goals: ${sessionData.goals}`);
    }
    
    // Add any additional context
    const additionalNotes = [];
    
    // Check if this was a planning vs execution session
    if (sessionData.summary && sessionData.summary.includes('planning')) {
      additionalNotes.push('Planning-focused session');
    } else if (sessionData.summary && sessionData.summary.includes('commitments')) {
      additionalNotes.push('Action-oriented session');
    }
    
    if (additionalNotes.length > 0) {
      notes.push(`Notes: ${additionalNotes.join(', ')}`);
    }
    
    return notes.join(' | ') || 'Morning coaching session completed successfully';
  }

  // Test connection method
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

  // Add a new task/goal
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

  // Get recent reflections for context
  async getRecentReflections(databaseId, days = 7) {
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      
      const response = await fetch(`${this.baseURL}/databases/${databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          sorts: [
            {
              property: 'Date',
              direction: 'descending'
            }
          ]
        })
      });

      const data = await response.json();
      return data.results.slice(0, days).map(page => ({
        date: page.properties.Date?.title?.[0]?.text?.content || 'Unknown',
        mood: page.properties.Mood?.rich_text?.[0]?.text?.content || 'Unknown',
        energy: page.properties['Energy Level']?.rich_text?.[0]?.text?.content || 'Unknown',
        notes: page.properties.Notes?.rich_text?.[0]?.text?.content || ''
      }));
    } catch (error) {
      console.error('Error fetching reflections:', error);
      return [];
    }
  }
}

export const notionClient = new NotionClient();