import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_API_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  try {
    const guildData = await scrapeGuildPage();
    const { error } = await supabase
      .from('guild_data')
      .upsert([{
        id: 'current',
        json: guildData,
        updated_at: new Date().toISOString()
      }]);

    if (error) throw error;

    res.status(200).json({ message: '✅ Guild data updated successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to scrape and store data.' });
  }
}

// 🔍 Guild scraper logic
async function scrapeGuildPage() {
  const GUILD_URL = 'https://www.margonem.pl/guilds/view,nyras,47';
  const response = await fetch(GUILD_URL);
  const html = await response.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const memberRows = document.querySelectorAll('.guild-members-container table tbody tr');
  const members = [];

  memberRows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 3) {
      const nick = cells[1].textContent.trim();
      const level = parseInt(cells[2].textContent.trim(), 10);
      const profession = cells[3].textContent.trim();
      members.push({ nick, level, profession });
    }
  });

  const totalMembers = members.length;
  const highLevelMembers = members.filter(member => member.level > 300);
  const highLevelCount = highLevelMembers.length;

  const professionStats = aggregateStats(members, totalMembers);
  const highLevelProfessionStats = aggregateStats(highLevelMembers, highLevelCount);
  const recommendations = generateRecommendations(professionStats, highLevelProfessionStats);

  return {
    lastUpdated: new Date().toLocaleString('pl-PL'),
    members,
    professionStats,
    highLevelProfessionStats,
    recommendations,
    totalMembers,
    highLevelCount,
  };
}

function aggregateStats(members, total) {
  const counts = {};
  members.forEach(({ profession }) => {
    counts[profession] = (counts[profession] || 0) + 1;
  });

  return Object.entries(counts).map(([profession, count]) => ({
    profession,
    count,
    percentage: Math.round((count / total) * 100),
  })).sort((a, b) => b.count - a.count);
}

function generateRecommendations(stats, highStats) {
  const recommendations = [];
  const idealPercentage = 100 / stats.length;

  const most = stats[0];
  const least = stats[stats.length - 1];
  const ratio = most.count / least.count;

  stats.forEach(stat => {
    const dev = stat.percentage - idealPercentage;
    if (dev > 5) recommendations.push(`Uwaga! Mamy znaczną przewagę klasy ${stat.profession} (${stat.percentage}%).`);
    if (dev < -5) recommendations.push(`Uwaga! Mamy niedobór klasy ${stat.profession} (${stat.percentage}%).`);
  });

  if (highStats.length) {
    const hlMost = highStats[0];
    const hlLeast = highStats[highStats.length - 1];
    if (hlMost.percentage > 25) recommendations.push(`Wśród graczy 300+ dominuje klasa ${hlMost.profession} (${hlMost.percentage}%).`);
    if (hlLeast.percentage < 10) recommendations.push(`Niska reprezentacja klasy ${hlLeast.profession} wśród 300+ (${hlLeast.percentage}%).`);
  }

  if (ratio > 1.5) recommendations.push(`${most.profession} występuje ${ratio.toFixed(1)}x częściej niż ${least.profession}.`);
  if (recommendations.length === 0) recommendations.push(`Rozkład profesji wydaje się zrównoważony.`);

  return recommendations;
}
