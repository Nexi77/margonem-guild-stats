// index.js - główny plik aplikacji
import { JSDOM } from 'jsdom';
import cron from 'node-cron';
import fs from 'fs/promises';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const GUILD_URL = 'https://www.margonem.pl/guilds/view,nyras,47';
const DATA_PATH = path.join(__dirname, 'public', 'data.json');

// Obsługa plików statycznych
app.use(express.static(path.join(__dirname, 'public')));

// Główna trasa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint do pobierania danych
app.get('/api/guild-data', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Nie udało się załadować danych' });
  }
});

// Endpoint dla cron job
app.get('/api/cron', async (req, res) => {
  try {
    await scrapeGuildPage();
    res.status(200).send('Aktualizacja wykonana pomyślnie');
  } catch (error) {
    res.status(500).send('Błąd podczas aktualizacji danych');
  }
});

// Funkcja do parsowania strony gildii
async function scrapeGuildPage() {
  try {
    console.log('Rozpoczynam aktualizację danych gildii...');
    
    // Pobierz stronę
    const response = await fetch(GUILD_URL);
    const html = await response.text();
    
    // Parsuj HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Pobierz tabelę członków
    const memberRows = document.querySelectorAll('.guild-members-container table tbody tr');
    
    const members = [];
    
    // Iteruj przez wiersze tabeli
    memberRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      
      if (cells.length >= 3) {
        // Pobierz nick, poziom i profesję
        const nick = cells[1].textContent.trim();
        const level = parseInt(cells[2].textContent.trim(), 10);
        const profession = cells[3].textContent.trim();
        
        members.push({
          nick,
          level,
          profession
        });
      }
    });
    
    // Oblicz statystyki profesji
    const professionCounts = {};
    members.forEach(member => {
      professionCounts[member.profession] = (professionCounts[member.profession] || 0) + 1;
    });
    // Oblicz całkowitą liczbę członków
    const totalMembers = members.length;
    
    // Oblicz procenty dla każdej profesji
    const professionStats = Object.entries(professionCounts).map(([profession, count]) => {
      return {
        profession,
        count,
        percentage: Math.round((count / totalMembers) * 100)
      };
    });
    
    // Sortuj profesje według liczby graczy (malejąco)
    professionStats.sort((a, b) => b.count - a.count);
    
    // Liczenie graczy z poziomem powyżej 300
    const highLevelMembers = members.filter(member => member.level > 300);
    const highLevelCount = highLevelMembers.length;
    
    // Profesje powyżej poziomu 300
    const highLevelProfessionCounts = {};
    highLevelMembers.forEach(member => {
      highLevelProfessionCounts[member.profession] = (highLevelProfessionCounts[member.profession] || 0) + 1;
    });
    
    const highLevelProfessionStats = Object.entries(highLevelProfessionCounts).map(([profession, count]) => {
      return {
        profession,
        count,
        percentage: Math.round((count / highLevelCount) * 100)
      };
    });
    
    highLevelProfessionStats.sort((a, b) => b.count - a.count);
    
    // Generuj bardziej wymagające rekomendacje
    const recommendations = generateEnhancedRecommendations(professionStats, highLevelProfessionStats);
    
    // Przygotuj dane do zapisu
    const guildData = {
      lastUpdated: new Date().toLocaleString('pl-PL'),
      members,
      professionStats,
      highLevelProfessionStats,
      recommendations,
      totalMembers,
      highLevelCount
    };
    
    // Zapisz dane do pliku
    await fs.writeFile(DATA_PATH, JSON.stringify(guildData, null, 2));
    
    console.log('Aktualizacja danych zakończona pomyślnie!');
    return guildData;
  } catch (error) {
    console.error('Błąd podczas aktualizacji danych:', error);
    throw error;
  }
}

// Funkcja generująca bardziej wymagające rekomendacje
function generateEnhancedRecommendations(professionStats, highLevelProfessionStats) {
  const recommendations = [];
  
  // 1. Sprawdź ogólną dystrybucję profesji
  const totalProfessions = professionStats.length;
  const idealPercentage = 100 / totalProfessions; // Idealna równowaga
  
  // Znajdź profesje z największą i najmniejszą liczbą graczy
  const mostCommonProfession = professionStats[0];
  const leastCommonProfession = professionStats[professionStats.length - 1];
  
  // Porównaj stosunek najbardziej do najmniej popularnej profesji
  const ratio = mostCommonProfession.count / leastCommonProfession.count;
  
  // 2. Szukaj profesji, które znacznie odbiegają od średniej (próg ustawiony niżej)
  professionStats.forEach(stat => {
    const deviation = stat.percentage - idealPercentage;
    
    if (deviation > 5) {
      recommendations.push(`Uwaga! Mamy znaczną przewagę klasy ${stat.profession} (${stat.percentage}% gildii). To o ${Math.round(deviation)}% więcej niż przy idealnym rozkładzie.`);
    } else if (deviation < -5) {
      recommendations.push(`Uwaga! Mamy niedobór klasy ${stat.profession} (${stat.percentage}% gildii). To o ${Math.round(Math.abs(deviation))}% mniej niż przy idealnym rozkładzie.`);
    }
  });
  
  // 3. Analizuj dystrybucję profesji wśród graczy wysokiego poziomu (>300)
  if (highLevelProfessionStats.length > 0) {
    const hlMostCommon = highLevelProfessionStats[0];
    const hlLeastCommon = highLevelProfessionStats[highLevelProfessionStats.length - 1];
    
    if (hlMostCommon.percentage > 25) {
      recommendations.push(`Wśród graczy 300+ dominuje klasa ${hlMostCommon.profession} (${hlMostCommon.percentage}% wysokopoziomowych postaci).`);
    }
    
    if (hlLeastCommon.percentage < 10) {
      recommendations.push(`Wśród graczy 300+ najmniej popularna jest klasa ${hlLeastCommon.profession} (tylko ${hlLeastCommon.percentage}% wysokopoziomowych postaci).`);
    }
  }
  
  // 4. Porównaj stosunek najmniej do najbardziej popularnej profesji
  if (ratio > 1.5) {
    recommendations.push(`Występuje znaczna dysproporcja między klasami. ${mostCommonProfession.profession} (${mostCommonProfession.count}) występuje ${ratio.toFixed(1)} razy częściej niż ${leastCommonProfession.profession} (${leastCommonProfession.count}).`);
  }
  
  // 5. Znajdź profesje, których jest mniej niż 10% całkowitej liczby graczy
  professionStats.forEach(stat => {
    if (stat.percentage < 10) {
      recommendations.push(`Krytycznie niski poziom klasy ${stat.profession} (${stat.percentage}%). Warto rozważyć aktywne rekrutowanie tej klasy.`);
    }
  });
  
  // 6. Znajdź profesje, których jest więcej niż 20% całkowitej liczby graczy
  professionStats.forEach(stat => {
    if (stat.percentage > 20) {
      recommendations.push(`Wysoka koncentracja klasy ${stat.profession} (${stat.percentage}%). Można rozważyć większą dywersyfikację.`);
    }
  });
  
  // 7. Zawsze dodaj przynajmniej jedną rekomendację nawet jeśli rozkład jest zrównoważony
  if (recommendations.length === 0) {
    // Znajdź najmniej popularną profesję
    recommendations.push(`Mimo względnej równowagi, można rozważyć rekrutację większej liczby postaci klasy ${leastCommonProfession.profession} (${leastCommonProfession.count}).`);
  }
  
  return recommendations;
}

async function logCronExecution() {
    const logPath = path.join(__dirname, 'public', 'cron-log.txt');
    const timestamp = new Date().toLocaleString('pl-PL');
    await fs.appendFile(logPath, `Cron executed at: ${timestamp}\n`);
}

// Uruchom początkową aktualizację danych
(async () => {
  try {
    // Sprawdź, czy folder public istnieje
    try {
      await fs.access(path.join(__dirname, 'public'));
    } catch {
      await fs.mkdir(path.join(__dirname, 'public'));
    }
    
    // Pobierz dane po raz pierwszy
    await scrapeGuildPage();
    
    // Uruchom serwer
    app.listen(PORT, () => {
      console.log(`Serwer uruchomiony na porcie ${PORT}`);
    });
    
    // Zaplanuj codzienną aktualizację o 6:00 rano
    cron.schedule('0 6 * * *', async () => {
      try {
        await scrapeGuildPage();
        console.log('Zaplanowana aktualizacja wykonana o 6:00');
      } catch (error) {
        console.error('Błąd podczas zaplanowanej aktualizacji:', error);
      }
    });
  } catch (error) {
    console.error('Błąd podczas inicjalizacji aplikacji:', error);
  }
})();