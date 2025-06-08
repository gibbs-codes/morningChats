import fetch from 'node-fetch';

export async function getTodayPlan() {
  const [eventsRes, habitsRes] = await Promise.all([
    fetch(process.env.EVENTS_ENDPOINT),
    fetch('https://habitica.com/api/v3/tasks/user?type=dailys', {
      headers: {
        'x-api-user': process.env.HABITICA_USER_ID,
        'x-api-key': process.env.HABITICA_API_TOKEN
      }
    })
  ]);

  const events = await eventsRes.json();
  console.log('Fetched events:', events);
  const habits = (await habitsRes.json()).data.filter(task => !task.completed);
  console.log('Fetched habits:', habits);

  return { events, habits };
}