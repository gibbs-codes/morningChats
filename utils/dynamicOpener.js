import { formatTime } from './formatTime.js';

export function generateDynamicOpener(events, habits) {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Time-based greetings
  const timeGreetings = {
    early: ['Time to move.', 'Let\'s go.', 'Up and at it.'], // 5-7am
    normal: ['Morning.', 'Ready?', 'What\'s first?'], // 7-9am  
    late: ['Running late?', 'Quick check.', 'Priorities.'] // 9am+
  };
  
  // Day-based variations
  const dayModifiers = {
    1: ['Monday mode.', 'Week starts now.'], // Monday
    5: ['Friday push.', 'End strong.'], // Friday
    6: ['Saturday grind.', 'Weekend work.'], // Saturday
    0: ['Sunday prep.', 'Set the week.'] // Sunday
  };
  
  let greeting;
  if (hour < 7) {
    greeting = timeGreetings.early[Math.floor(Math.random() * timeGreetings.early.length)];
  } else if (hour < 9) {
    greeting = timeGreetings.normal[Math.floor(Math.random() * timeGreetings.normal.length)];
  } else {
    greeting = timeGreetings.late[Math.floor(Math.random() * timeGreetings.late.length)];
  }
  
  // Add day modifier 20% of the time
  if (Math.random() < 0.2 && dayModifiers[day]) {
    greeting = dayModifiers[day][Math.floor(Math.random() * dayModifiers[day].length)];
  }
  
  // Quick summary style variations
  const summaryStyles = [
    generateUrgentStyle(events, habits),
    generateCountStyle(events, habits), 
    generateNextStyle(events, habits),
    generateFocusStyle(events, habits)
  ];
  
  const summary = summaryStyles[Math.floor(Math.random() * summaryStyles.length)];
  
  return `${greeting} ${summary}`;
}

function generateUrgentStyle(events, habits) {
  const nextEvent = events.find(e => new Date(e.start) > new Date());
  
  if (nextEvent) {
    const timeUntil = Math.floor((new Date(nextEvent.start) - new Date()) / 60000);
    if (timeUntil < 60) {
      return `${nextEvent.title} in ${timeUntil} minutes. What needs doing first?`;
    }
    if (timeUntil < 120) {
      return `${nextEvent.title} at ${formatTime(nextEvent.start)}. Prep time?`;
    }
  }
  
  const habitCount = habits.length;
  return habitCount > 0 ? `${habitCount} items waiting. Pick one.` : 'What\'s the priority?';
}

function generateCountStyle(events, habits) {
  const eventCount = events.length;
  const habitCount = habits.length;
  
  if (eventCount === 0 && habitCount === 0) {
    return 'Clean slate. What are you building today?';
  }
  
  if (eventCount === 0) {
    return `${habitCount} tasks. Which first?`;
  }
  
  if (habitCount === 0) {
    return `${eventCount} meetings scheduled. Prep needed?`;
  }
  
  return `${eventCount} events, ${habitCount} tasks. Start where?`;
}

function generateNextStyle(events, habits) {
  const nextEvent = events.find(e => new Date(e.start) > new Date());
  const firstHabit = habits[0];
  
  if (nextEvent && firstHabit) {
    return `Next: ${nextEvent.title} at ${formatTime(nextEvent.start)}. ${firstHabit.text} before that?`;
  }
  
  if (nextEvent) {
    return `${nextEvent.title} coming up at ${formatTime(nextEvent.start)}. Ready?`;
  }
  
  if (firstHabit) {
    return `Top item: ${firstHabit.text}. Now or later?`;
  }
  
  return 'What\'s driving today?';
}

function generateFocusStyle(events, habits) {
  // Look for workout/exercise related tasks
  const workoutHabit = habits.find(h => 
    /workout|exercise|gym|run|bike|swim/i.test(h.text)
  );
  
  if (workoutHabit) {
    return `${workoutHabit.text} scheduled. Time?`;
  }
  
  // Look for early meetings
  const earlyMeeting = events.find(e => {
    const eventHour = new Date(e.start).getHours();
    return eventHour < 10;
  });
  
  if (earlyMeeting) {
    return `${earlyMeeting.title} at ${formatTime(earlyMeeting.start)}. Prep needed?`;
  }
  
  // Default focus approach
  const priorityHabits = habits.filter(h => 
    /important|urgent|priority|critical/i.test(h.text)
  );
  
  if (priorityHabits.length > 0) {
    return `Priority item: ${priorityHabits[0].text}. When?`;
  }
  
  return habits.length > 0 ? 
    `${habits.length} items. Which moves the needle?` : 
    'What\'s the main thing today?';
}