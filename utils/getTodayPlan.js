// utils/getTodayPlan.js - Enhanced with agentic calendar capabilities
import fetch from 'node-fetch';
import { analyzeDayStructure } from './llmReply.js';
import { formatTime } from './formatTime.js';
import { agenticCalendarClient } from './agenticCalendarClient.js';

export async function getTodayPlan() {
  console.log('📋 Fetching today\'s plan with agentic calendar intelligence...');
  
  try {
    const [events, habitsRes] = await Promise.all([
      // AGENTIC: Use enhanced calendar client
      agenticCalendarClient.getTodaysEvents().catch(err => {
        console.log('⚠️ Agentic calendar fetch failed:', err.message);
        return [];
      }),
      
      // Keep Habitica fetch as-is
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
  console.log('🧠 Getting agentic plan with enhanced calendar intelligence...');
  
  try {
    // Get the raw data
    const { events, habits } = await getTodayPlan();
    
    // AGENTIC: Get enhanced calendar analysis
    const calendarAnalysis = await agenticCalendarClient.analyzeSchedule();
    const availableSlots = await agenticCalendarClient.findAvailableSlots(60);
    
    if (habits.length === 0 && events.length === 0) {
      return {
        events,
        habits,
        analysis: null,
        calendarInsights: calendarAnalysis,
        availableSlots,
        opener: "Morning. Clear calendar today - perfect for deep work. What's your main focus?"
      };
    }

    // Enhanced analysis with calendar intelligence
    let analysis = null;
    if (habits.length > 0 || events.length > 0) {
      try {
        analysis = await analyzeDayStructure(habits, events);
        console.log('✅ Day analysis complete:', analysis);
      } catch (analysisError) {
        console.log('⚠️ Analysis failed, using fallback:', analysisError.message);
        analysis = null;
      }
    }
    
    // Generate agentic opener with calendar intelligence
    const opener = generateAgenticOpener(habits, events, analysis, calendarAnalysis);
    
    console.log('✅ Agentic plan with calendar insights complete');
    
    return {
      events,
      habits,
      analysis,
      calendarInsights: calendarAnalysis,
      availableSlots,
      opener
    };
    
  } catch (error) {
    console.error('❌ Error in agentic plan analysis:', error);
    const { events, habits } = await getTodayPlan();
    
    return {
      events,
      habits,
      analysis: null,
      calendarInsights: null,
      availableSlots: [],
      opener: `Morning. ${habits.length} tasks and ${events.length} events today. What's first?`
    };
  }
}

function generateAgenticOpener(habits, events, analysis, calendarInsights) {
  const now = new Date();
  const hour = now.getHours();
  
  // Time-based greeting with intelligence
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
  
  // AGENTIC: Add intelligent calendar insights
  if (calendarInsights) {
    if (calendarInsights.timeUntilNext && calendarInsights.timeUntilNext < 60) {
      details.push(`Next event in ${calendarInsights.timeUntilNext} minutes`);
    } else if (calendarInsights.upcomingEvents === 0) {
      details.push('Clear calendar ahead');
    } else if (calendarInsights.upcomingEvents > 3) {
      details.push('Busy day scheduled');
    }
  }
  
  // Add urgent events with intelligent context
  if (urgentEvents.length > 0) {
    const nextEvent = urgentEvents[0];
    const timeUntil = Math.floor((new Date(nextEvent.start) - now) / 60000);
    
    if (timeUntil < 90) {
      details.push(`${nextEvent.title} in ${timeUntil} minutes`);
    } else {
      details.push(`${nextEvent.title} coming up`);
    }
  }
  
  // Add top habits with priority awareness
  if (topHabits.length > 0) {
    const habitNames = topHabits.slice(0, 2).map(h => {
      // Truncate long habit names for voice
      return h.text.length > 25 ? h.text.substring(0, 25) : h.text;
    });
    
    if (habitNames.length === 1) {
      details.push(`${habitNames[0]} to tackle`);
    } else {
      details.push(`${habitNames[0]} and ${habitNames[1]} to do`);
    }
  }
  
  // AGENTIC: Add calendar recommendations
  if (calendarInsights?.recommendations?.length > 0) {
    const rec = calendarInsights.recommendations[0];
    if (rec.includes('focus')) {
      details.push('good time for deep work');
    } else if (rec.includes('busy')) {
      details.push('busy day ahead');
    }
  }
  
  // Construct the intelligent opener
  if (details.length === 0) {
    return `${greeting} Quiet day scheduled. What's your main focus?`;
  }
  
  if (details.length === 1) {
    return `${greeting} ${details[0]}. Ready?`;
  }
  
  // Multiple items with agentic intelligence
  return `${greeting} ${details.slice(0, 2).join(', ')}. What's first?`;
}

// AGENTIC: Export enhanced calendar client for use in other modules
export { agenticCalendarClient };