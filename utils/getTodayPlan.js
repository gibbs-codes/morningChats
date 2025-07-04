import fetch from 'node-fetch';

export async function getTodayPlan() {
  console.log('📋 Fetching today\'s plan from Habitica and calendar...');
  
  try {
    const [eventsRes, habitsRes] = await Promise.all([
      fetch(process.env.EVENTS_ENDPOINT).catch(err => {
        console.log('⚠️ Events fetch failed:', err.message);
        return { json: () => [] };
      }),
      fetch('https://habitica.com/api/v3/tasks/user?type=dailys', {
        headers: {
          'x-api-user': process.env.HABITICA_USER_ID,
          'x-api-key': process.env.HABITICA_API_TOKEN
        }
      }).catch(err => {
        console.log('⚠️ Habitica fetch failed:', err.message);
        return { json: () => ({ data: [] }) };
      })
    ]);

    const events = await eventsRes.json();
    console.log('📅 Fetched events:', events?.length || 0);
    
    const habitsData = await habitsRes.json();
    const habits = (habitsData.data || [])
      .filter(task => !task.completed && task.isDue !== false)
      .map(task => ({
        id: task.id,
        text: task.text,
        priority: task.priority || 1,
        notes: task.notes || '',
        difficulty: task.difficulty || 'medium'
      }));
    
    console.log('✅ Fetched habits:', habits?.length || 0);

    return { 
      events: Array.isArray(events) ? events : [], 
      habits: Array.isArray(habits) ? habits : [] 
    };
    
  } catch (error) {
    console.error('❌ Error fetching today\'s plan:', error);
    return { events: [], habits: [] };
  }
}

export async function getTodayPlanWithAnalysis() {
  console.log('🧠 Getting today\'s plan with AI analysis...');
  
  try {
    // Get the raw data
    const { events, habits } = await getTodayPlan();
    
    if (habits.length === 0 && events.length === 0) {
      return {
        events,
        habits,
        analysis: null,
        opener: "Morning. No scheduled tasks or events today. What's your main focus?"
      };
    }

    // Analyze with LLM
    const analysis = await analyzeDayStructure(habits, events);
    
    // Generate informed opener
    const opener = generateInformedOpener(habits, events, analysis);
    
    console.log('✅ Analysis complete with opener ready');
    
    return {
      events,
      habits,
      analysis,
      opener
    };
    
  } catch (error) {
    console.error('❌ Error in plan analysis:', error);
    const { events, habits } = await getTodayPlan();
    
    return {
      events,
      habits,
      analysis: null,
      opener: `Morning. ${habits.length} tasks and ${events.length} events today. What's first?`
    };
  }
}

function generateInformedOpener(habits, events, analysis) {
  const now = new Date();
  const hour = now.getHours();
  
  // Time-based greeting
  const greeting = hour < 8 ? "Early start today." : 
                  hour < 10 ? "Morning." : "Getting started.";
  
  // Get most urgent/important items
  const urgentEvents = events
    .filter(e => new Date(e.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 2);
    
  const topHabits = habits
    .sort((a, b) => (b.priority || 1) - (a.priority || 1))
    .slice(0, 3);
  
  let details = [];
  
  // Add urgent events
  if (urgentEvents.length > 0) {
    const nextEvent = urgentEvents[0];
    const timeUntil = Math.floor((new Date(nextEvent.start) - now) / 60000);
    
    if (timeUntil < 90) {
      details.push(`${nextEvent.title} in ${timeUntil} minutes`);
    } else {
      details.push(`${nextEvent.title} at ${formatTime(nextEvent.start)}`);
    }
  }
  
  // Add top habits with actual names
  if (topHabits.length > 0) {
    const habitNames = topHabits.slice(0, 2).map(h => {
      // Truncate long habit names for voice
      return h.text.length > 25 ? h.text.substring(0, 25) + '...' : h.text;
    });
    
    if (habitNames.length === 1) {
      details.push(`${habitNames[0]} on your list`);
    } else {
      details.push(`${habitNames[0]} and ${habitNames[1]} on your list`);
    }
  }
  
  // Construct the opener
  if (details.length === 0) {
    return `${greeting} Quiet day scheduled. What's your main focus?`;
  }
  
  if (details.length === 1) {
    return `${greeting} ${details[0]}. Ready to start?`;
  }
  
  // Multiple items
  return `${greeting} ${details.join(', ')}. What's first?`;
}

// Example openers this would generate:
/*
"Morning. Team standup in 30 minutes, Morning workout and Review quarterly goals on your list. What's first?"

"Early start today. Morning workout on your list. Ready to start?"

"Getting started. Client presentation at 2 PM, Email review and Budget planning on your list. What's first?"

"Morning. Quiet day scheduled. What's your main focus?"
*/