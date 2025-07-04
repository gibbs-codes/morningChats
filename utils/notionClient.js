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

  // Log missed call for accountability tracking
  async logMissedCall(databaseId, phoneNumber, reason = 'no-answer') {
    try {
      console.log('📞💥 Logging missed call for accountability...');
      
      if (!databaseId || !this.apiKey) {
        throw new Error('Database ID or API key missing');
      }
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      // Create a missed call entry with ACCOUNTABILITY ENERGY
      const payload = {
        parent: { database_id: databaseId },
        properties: {
          "Date": {
            title: [{ 
              text: { 
                content: `${dateStr} - ${timeStr} MISSED CHECK-IN`
              } 
            }]
          },
          "Priorities": {
            rich_text: [{ 
              text: { 
                content: "ACCOUNTABILITY FAILURE - No check-in completed"
              } 
            }]
          },
          "Mood": {
            rich_text: [{ 
              text: { 
                content: "Avoidance"
              } 
            }]
          },
          "Energy Level": {
            rich_text: [{ 
              text: { 
                content: "Unknown - Didn't Show"
              } 
            }]
          },
          "Notes": {
            rich_text: [{ 
              text: { 
                content: `MISSED CALL: ${this.getMissedCallReason(reason)}. No accountability check completed. This is a pattern that needs addressing.`
              } 
            }]
          },
          "Session Type": {
            select: { 
              name: "Quick Check-in"
            }
          },
          "Duration": {
            number: 0
          },
          "Commitments Made": {
            rich_text: [{ 
              text: { 
                content: "NONE - Avoided accountability call"
              } 
            }]
          },
          "Key Decisions": {
            rich_text: [{ 
              text: { 
                content: `DECISION: Chose to avoid morning accountability. Reason: ${reason}. This counts as a missed commitment.`
              } 
            }]
          }
        }
      };
      
      console.log('📤 Logging missed call to Notion...');
      
      const response = await fetch(`${this.baseURL}/pages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to log missed call:', errorText);
        return null;
      }
      
      const result = await response.json();
      console.log('✅ Missed call logged for accountability:', result.id);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error logging missed call:', error);
      return null;
    }
  }

  // Helper: Get reason for missed call with ACCOUNTABILITY LANGUAGE
  getMissedCallReason(reason) {
    const reasons = {
      'no-answer': 'Phone rang but you chose not to answer. Classic avoidance behavior.',
      'busy': 'Line was busy - were you avoiding the call or actually unavailable?',
      'failed': 'Call failed to connect - technical issue or excuse?',
      'canceled': 'Call was canceled - you actively chose to avoid accountability.',
      'timeout': 'No answer within timeout period - you saw it ring and ignored it.',
      'voicemail-answered': 'Voicemail picked up instead of you. Still counts as avoiding direct accountability.'
    };
    
    return reasons[reason] || `Unknown reason: ${reason}. Still counts as avoidance.`;
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
          },
          
          // Only add Session Type if it exists in the database
          ...(await this.fieldExists(databaseId, 'Session Type') ? {
            "Session Type": {
              select: { 
                name: this.determineSessionType(sessionData)
              }
            }
          } : {}),
          
          // Duration as number (minutes)
          "Duration": {
            number: sessionData.duration || 0
          },
          
          // Commitments Made as text
          "Commitments Made": {
            rich_text: [{ 
              text: { 
                content: this.extractCommitments(sessionData)
              } 
            }]
          },
          
          // Key Decisions as text
          "Key Decisions": {
            rich_text: [{ 
              text: { 
                content: this.extractKeyDecisions(sessionData)
              } 
            }]
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
      return null;
    }
  }

  // Helper: Extract priorities from session data
  extractPriorities(sessionData) {
    const priorities = [];
    
    // Extract from goals if available and meaningful
    if (sessionData.goals && 
        sessionData.goals !== 'No specific goals set' && 
        sessionData.goals !== 'No meaningful commitments made' &&
        sessionData.goals !== 'Quick morning check-in') {
      priorities.push(sessionData.goals);
    }
    
    // Extract from summary if it contains specific tasks
    if (sessionData.summary) {
      const taskMatches = sessionData.summary.match(/\b(DTT|Office Attendance|workout|meeting|call)\b/gi);
      if (taskMatches) {
        priorities.push(...taskMatches.slice(0, 3));
      }
    }
    
    // Check if this was likely a voicemail/minimal interaction
    if (sessionData.goals === 'No meaningful commitments made' || 
        sessionData.summary?.includes('likely voicemail')) {
      return 'VOICEMAIL/MINIMAL INTERACTION - No real priorities discussed';
    }
    
    // Default if nothing meaningful found
    if (priorities.length === 0) {
      return 'Brief check-in - minimal engagement';
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

  // Helper: Check if a field exists in the database
  async fieldExists(databaseId, fieldName) {
    try {
      const schema = await this.getDatabaseSchema(databaseId);
      return schema && schema[fieldName];
    } catch (error) {
      console.log(`⚠️ Could not check if field "${fieldName}" exists, skipping...`);
      return false;
    }
  }

  // Helper: Determine session type based on content
  determineSessionType(sessionData) {
    const summary = (sessionData.summary || '').toLowerCase();
    const goals = (sessionData.goals || '').toLowerCase();
    const combinedText = `${summary} ${goals}`;
    
    // Look for planning keywords
    if (combinedText.includes('planning') || combinedText.includes('schedule') || combinedText.includes('organize')) {
      return 'Planning Session';
    }
    
    // Look for problem-solving keywords
    if (combinedText.includes('problem') || combinedText.includes('difficult') || combinedText.includes('struggle') || combinedText.includes('issue')) {
      return 'Problem Solving';
    }
    
    // Look for goal-setting keywords
    if (combinedText.includes('goal') || combinedText.includes('target') || combinedText.includes('commit') || combinedText.includes('focus')) {
      return 'Goal Setting';
    }
    
    // Default to quick check-in for brief sessions
    if (sessionData.duration && sessionData.duration < 3) {
      return 'Quick Check-in';
    }
    
    // Default case
    return 'Quick Check-in';
  }

  // Helper: Extract specific commitments made
  extractCommitments(sessionData) {
    const commitments = [];
    
    // Check for voicemail/minimal interaction first
    if (sessionData.goals === 'No meaningful commitments made' || 
        sessionData.summary?.includes('likely voicemail')) {
      return 'NONE - Voicemail or minimal interaction detected';
    }
    
    // Extract from sessionData.goals if it contains specific commitments
    if (sessionData.goals && 
        sessionData.goals !== 'No specific goals set' && 
        sessionData.goals !== 'Morning check-in completed' &&
        sessionData.goals !== 'Quick morning check-in') {
      commitments.push(sessionData.goals);
    }
    
    // Look for time commitments in the summary
    const summary = sessionData.summary || '';
    const timeCommitments = summary.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/gi);
    if (timeCommitments) {
      timeCommitments.forEach(commitment => {
        commitments.push(`Time commitment: ${commitment}`);
      });
    }
    
    // Look for action words that indicate commitments
    const actionMatches = summary.match(/\b(will|going to|plan to|start with|focus on)\s+([^.!?]*)/gi);
    if (actionMatches) {
      actionMatches.slice(0, 2).forEach(match => {
        commitments.push(match.trim());
      });
    }
    
    // Default if no specific commitments found
    if (commitments.length === 0) {
      return 'Brief interaction - minimal commitments made';
    }
    
    return [...new Set(commitments)].join(' | '); // Remove duplicates and join
  }

  // Helper: Extract key decisions made during session
  extractKeyDecisions(sessionData) {
    const decisions = [];
    
    // Extract from summary if it contains decision language
    const summary = sessionData.summary || '';
    const decisionWords = ['decided', 'choosing', 'prioritizing', 'focusing on', 'starting with'];
    
    decisionWords.forEach(word => {
      if (summary.toLowerCase().includes(word)) {
        const regex = new RegExp(`${word}\\s+([^.!?]*)`,'gi');
        const matches = summary.match(regex);
        if (matches) {
          decisions.push(...matches.slice(0, 2));
        }
      }
    });
    
    // Look for specific task prioritization
    if (summary.includes('DTT') || summary.includes('Office Attendance')) {
      decisions.push('Prioritized daily tasks: DTT and Office Attendance');
    }
    
    // Look for time allocation decisions
    const timeDecisions = summary.match(/(\w+)\s+for\s+(\d+)\s*(minutes?|mins?|hours?)/gi);
    if (timeDecisions) {
      timeDecisions.forEach(decision => {
        decisions.push(`Time allocation: ${decision}`);
      });
    }
    
    // Default if no decisions detected
    if (decisions.length === 0) {
      return 'Engaged in morning planning and task organization';
    }
    
    return [...new Set(decisions)].join(' | '); // Remove duplicates and join
  }
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