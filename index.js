const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const fs = require('fs');
const patrolSummaryPath = './patrolSummary.json';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ==== KONFIG ==== //
const token = process.env.token;
const clientId = process.env.id;
const guildId = '1255139201570050069';

const patrolLogChannelId = '1389305663775309844';
const patrolLogThumbnail = 'https://static.wikia.nocookie.net/gtawiki/images/a/ad/LSPD-GTAV-Logo.png/revision/latest?cb=20150425201508';
const startThumbnail = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Eo_circle_green_checkmark.svg/800px-Eo_circle_green_checkmark.svg.png';
const stopThumbnail = 'https://cdn-icons-png.flaticon.com/512/668/668087.png';
const commandThumbnail = 'https://iili.io/Hg0h0Ux.png'; // thumbnail pro embed s tlacitky

const rankRoles = [
  '★★★★│Chief of Police',
  '★★★│Assistant of Chief',
  '★★│Deputy Chief',
  '★│Commander',
  '❚❚│Captain',
  '❚│Lieutenant',
  '⟨⟩⟩⟩│Sergeant II.',
  '⟩⟩⟩│Sergeant I.',
  '⋆⟩⟩│Police Officer III+1',
  '⟩⟩│Police Officer III',
  'Police Officer II',
  'Police Officer I',
  'Police Officer I Zk.doba',
];

const shiftRoles = [
  '1️⃣ | Směna',
  '2️⃣ | Směna',
  '3️⃣ | Směna',
  '4️⃣ | Směna',
  '5️⃣ | Směna',
];

// ==== DATA ==== //
const patrolTimers = new Collection();
let patrolSummary = new Collection();

function loadSummary() {
  if (fs.existsSync(patrolSummaryPath)) {
    try {
      const raw = fs.readFileSync(patrolSummaryPath);
      const obj = JSON.parse(raw);
      patrolSummary = new Collection();
      for (const [shift, users] of Object.entries(obj)) {
        const shiftData = new Collection();
        for (const [userId, data] of Object.entries(users)) {
          shiftData.set(userId, data);
        }
        patrolSummary.set(shift, shiftData);
      }
      console.log('📂 Data načtena.');
    } catch (e) {
      console.error('❗ Chyba při načítání dat:', e);
    }
  }
}

function saveSummary() {
  const obj = {};
  for (const [shift, users] of patrolSummary.entries()) {
    obj[shift] = {};
    for (const [userId, data] of users.entries()) {
      obj[shift][userId] = data;
    }
  }
  fs.writeFileSync(patrolSummaryPath, JSON.stringify(obj, null, 2));
  console.log('💾 Data uložena.');
}

loadSummary();

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}min ${seconds}s`;
}

function getUserRank(member) {
  for (const rank of rankRoles) {
    if (member.roles.cache.some(role => role.name === rank)) {
      return rank;
    }
  }
  return 'Bez hodnosti';
}

function getUserShift(member) {
  for (const shiftRole of shiftRoles) {
    if (member.roles.cache.some(role => role.name === shiftRole)) {
      const match = shiftRole.match(/^(\d)️⃣/);
      return match ? match[1] : 'Neznámá';
    }
  }
  return 'Neznámá';
}

function createStatusEmbed(type, userId, timestamp) {
  const isStart = type === 'start';

  return new EmbedBuilder()
    .setColor(isStart ? 0x2ECC71 : 0xE74C3C)
    .setTitle(isStart ? '🟢 Patrola zahájena' : '🔴 Patrola ukončena')
    .setThumbnail(isStart ? startThumbnail : stopThumbnail)
    .setDescription([
      `👮‍♂️ **Officer:** <@${userId}>`,
      `${isStart ? '🕒 **Čas zahájení:**' : '🕓 **Čas ukončení:**'} <t:${Math.floor(timestamp / 1000)}:F>`,
    ].join('\n'))
    .setTimestamp();
}

function createLogEmbed(userId, startTime, endTime, rankName = null, shiftNumber = null, reason = '') {
  const durationMs = endTime - startTime;
  const durationStr = formatDuration(durationMs);

  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setThumbnail(patrolLogThumbnail)
    .setDescription([
      '**📋 ZÁZNAM PATROLY**',
      '',
      `👮‍♂️ **Officer:** <@${userId}>`,
      rankName ? `🎖️ **Hodnost:** ${rankName}` : '',
      shiftNumber ? `🕒 **Směna:** ${shiftNumber}` : '',
      `🟢 **Start:** <t:${Math.floor(startTime / 1000)}:F>`,
      `🔴 **Konec:** <t:${Math.floor(endTime / 1000)}:F>`,
      `⏱️ **Trvání:** \`${durationStr}\``,
      reason ? `📌 **Důvod:** ${reason}` : '',
    ].filter(Boolean).join('\n'))
    .setTimestamp();
}

async function sendEmbedToChannels(embed) {
  const targets = [patrolLogChannelId];
  for (const id of targets) {
    try {
      const ch = await client.channels.fetch(id);
      if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
    } catch (err) {
      console.warn(`❗ Chyba při posílání do kanálu ${id}`, err);
    }
  }
}

function addPatrolTime(userId, rank, shift, durationMs) {
  if (!patrolSummary.has(shift)) {
    patrolSummary.set(shift, new Collection());
  }
  const shiftData = patrolSummary.get(shift);

  if (!shiftData.has(userId)) {
    shiftData.set(userId, { rank, duration: 0 });
  }

  const userData = shiftData.get(userId);
  userData.duration += durationMs;

  saveSummary();
}

function canUseSummary(member) {
  const sergeantIndex = rankRoles.findIndex(r => r === '⟩⟩⟩│Sergeant I.');
  if (sergeantIndex === -1) return false;

  const userRanks = rankRoles
    .map((rank, idx) => member.roles.cache.some(role => role.name === rank) ? idx : -1)
    .filter(idx => idx >= 0);

  if (userRanks.length === 0) return false;

  const highestRankIndex = Math.min(...userRanks);

  return highestRankIndex <= sergeantIndex;
}

function isChief(member) {
  return member.roles.cache.some(role => role.name === '★★★★│Chief of Police');
}

function canUseActiveList(member) {
  return canUseSummary(member); // stejné oprávnění jako souhrn
}

function getRankIndex(rankName) {
  const idx = rankRoles.indexOf(rankName);
  return idx === -1 ? 999 : idx; // Pokud neznámá hodnost, dej na konec
}

// ==== NOVÉ PRO PING KONTROLU ==== //

const PATROL_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hodina
const PATROL_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minut

function createContinueCheckEmbed(userId) {
  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('⏳ Kontrola neaktivity')
    .setDescription(`<@${userId}>, patrola běží už 1 hodinu. Chceš pokračovat?`)
    .setTimestamp();
}

function createContinueButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('patrol_continue_yes')
      .setLabel('Ano')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('patrol_continue_no')
      .setLabel('Ne')
      .setStyle(ButtonStyle.Danger),
  );
}

async function checkActivePatrols() {
  const now = Date.now();

  for (const [userId, patrolData] of patrolTimers.entries()) {
    const elapsed = now - patrolData.startTime;

    if (!patrolData.pingSent && elapsed >= PATROL_CHECK_INTERVAL_MS) {
      try {
        const channel = await client.channels.fetch(patrolData.channelId);
        if (!channel.isTextBased()) continue;

        const embed = createContinueCheckEmbed(userId);
        const buttons = createContinueButtons();

        const message = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [buttons] });

        patrolData.pingSent = true;
        patrolData.pingMessageId = message.id;
        patrolData.pingTimestamp = now;
        patrolTimers.set(userId, patrolData);
        saveSummary();

        // Timeout pro odpověď
        setTimeout(async () => {
          const updatedData = patrolTimers.get(userId);
          if (updatedData && updatedData.pingSent && updatedData.pingMessageId === message.id) {
            // Ukončíme patrolu kvůli neodpovědění
            patrolTimers.delete(userId);
            saveSummary();

            await channel.send(`<@${userId}> Patrola byla automaticky ukončena, protože jsi neodpověděl na kontrolu pokračování.`);
            // TODO: můžeš přidat logování ukončení, pokud chceš
          }
        }, PATROL_RESPONSE_TIMEOUT_MS);

      } catch (error) {
        console.error('Chyba při odesílání pingu:', error);
      }
    }
  }
}

// --- Spuštění intervalové kontroly ---
setInterval(checkActivePatrols, 30 * 1000); // každých 30 sekund

// ==== INTERAKCE ==== //

// --- SAFE INTERACTION HELPERS (globálně dostupné) ---
async function safeReplyOrUpdate(interaction, fn) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await fn();
  } catch (err) {
    if (err?.rawError?.code === 10062 || err?.code === 10062 || (err?.message && err.message.includes('Unknown interaction'))) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Tato interakce už není platná (vypršela nebo byla zpracována). Zkuste to znovu.', flags: 64 });
        }
      } catch {}
    } else {
      // Pokud je to update, zkus fallback na reply
      if (err?.message && err.message.includes('update') && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'Tato interakce už není platná (vypršela nebo byla zpracována). Zkuste to znovu.', flags: 64 });
        } catch {}
      } else {
        console.error('Chyba při zpracování interakce:', err);
      }
    }
  }
}

async function safeShowModal(interaction, modal) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.showModal(modal);
  } catch (err) {
    if (err?.rawError?.code === 10062 || err?.code === 10062 || (err?.message && err.message.includes('Unknown interaction'))) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Tato interakce už není platná (vypršela nebo byla zpracována). Zkuste to znovu.', ephemeral: true });
        }
      } catch {}
    } else {
      console.error('Chyba při showModal:', err);
    }
  }
}


// Automatické ukončení patroly při přechodu do offline
client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
  const userId = newPresence.userId;

  if ((newPresence.status === 'offline' || newPresence.status === 'invisible') && patrolTimers.has(userId)) {
    const { startTime, channelId } = patrolTimers.get(userId);
    patrolTimers.delete(userId);

    const now = Date.now();

    const guild = newPresence.guild;
    const member = guild.members.cache.get(userId);
    const rankName = member ? getUserRank(member) : null;
    const shiftNumber = member ? getUserShift(member) : null;

    addPatrolTime(userId, rankName || 'Bez hodnosti', shiftNumber || 'Neznámá', now - startTime);

    const logEmbed = createLogEmbed(userId, startTime, now, rankName, shiftNumber, 'Uživatel přešel do offline režimu.');
    await sendEmbedToChannels(logEmbed, channelId);
  }
});

// Nastavení HTTP serveru pro uptime keeper

const express = require('express');
const app = express();
const path = require('path');

// API router pro webportal
app.use('/webportal/api', require('./webportal/api'));

// Statické soubory pro webportal
app.use('/webportal', express.static(path.join(__dirname, 'webportal')));

app.get('/', (req, res) => {
  res.send('Bot je online a připraven!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Uptime server běží na portu ${port}`);
  console.log(`🌐 REDAT portál: http://localhost:${port}/webportal`);
});



// ==== REDAT SYSTÉM ==== //
const redatChannelId = '1390070501791236147'; // <-- ZDE nastav ID kanálu pro redat žádosti
const redatRequests = new Collection();
const redatRequestsPath = './redatRequests.json';

// Načtení REDAT žádostí ze souboru při startu
function loadRedatRequests() {
  if (fs.existsSync(redatRequestsPath)) {
    try {
      const raw = fs.readFileSync(redatRequestsPath);
      if (raw.length) {
        const obj = JSON.parse(raw);
        for (const [msgId, req] of Object.entries(obj)) {
          redatRequests.set(msgId, req);
        }
        console.log('📂 REDAT žádosti načteny ze souboru.');
      }
    } catch (e) {
      console.error('❗ Chyba při načítání redatRequests.json:', e);
    }
  }
}

// Uložení REDAT žádostí do souboru
function saveRedatRequests() {
  const obj = {};
  for (const [msgId, req] of redatRequests.entries()) {
    obj[msgId] = req;
  }
  fs.writeFileSync(redatRequestsPath, JSON.stringify(obj, null, 2));
  // Volitelně: console.log('💾 REDAT žádosti uloženy.');
}

loadRedatRequests();

function createRedatEmbed({ userId, nickname, rank, shift, availability, claimedBy, claimedRank, claimedShift, status, feedback, passed, cancelReason }) {
  let desc = [
    `👤 **Nick:** ${nickname}`,
    `🎖️ **Hodnost:** ${rank}`,
    `🕒 **Směna:** ${shift}`,
    `🗓️ **Dostupnost:** ${availability}`,
    `⏰ **Čas žádosti:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ];
  if (claimedBy) {
    desc.push(`\n✅ **Claimnuto:** <@${claimedBy}> (${claimedRank}, směna ${claimedShift})`);
  }
  if (status === 'cancelled') {
    desc.push('\n❌ **Žádost byla zrušena.**');
    if (cancelReason) desc.push(`> **Důvod zrušení:** ${cancelReason}`);
  }
  if (status === 'done') {
    desc.push('\n📝 **Hodnocení:**');
    desc.push(feedback ? `> ${feedback}` : '> _Žádné hodnocení_');
    desc.push(`\n${passed ? '✅ Officer **prošel**.' : '❌ Officer **neprošel**.'}`);
  }
  return new EmbedBuilder()
    .setColor(status === 'cancelled' ? 0xe74c3c : status === 'done' ? 0x2ecc71 : claimedBy ? 0xf1c40f : 0x3498db)
    .setTitle('📝 Žádost o REDAT')
    .setDescription(desc.join('\n'))
    .setTimestamp();
}

function createRedatButtons({ claimedBy, status }) {
  if (status === 'cancelled' || status === 'done') return [];
  if (!claimedBy) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('redat_claim')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Success)
      )
    ];
  } else {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('redat_unclaim')
          .setLabel('Unclaim')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('redat_done')
          .setLabel('Dokončit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('redat_cancel')
          .setLabel('Zrušit')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }
}

// ==== INTERAKCE ==== //
client.on(Events.InteractionCreate, async interaction => {
  // --- PATROLA BUTTONS ---
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const now = Date.now();

    if (interaction.customId === 'start_patrol') {
      if (patrolTimers.has(userId)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Patrola už běží.', flags: 64 }));
      }

      patrolTimers.set(userId, { startTime: now, channelId: interaction.channelId, pingSent: false });
      const embed = createStatusEmbed('start', userId, now);

      await safeReplyOrUpdate(interaction, () => interaction.update({ embeds: [embed], components: interaction.message.components }));
    }

    else if (interaction.customId === 'stop_patrol') {
      if (!patrolTimers.has(userId)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Nemáš aktivní patrolu.', flags: 64 }));
      }

      const { startTime, channelId } = patrolTimers.get(userId);
      patrolTimers.delete(userId);

      const guild = interaction.guild;
      const member = guild.members.cache.get(userId);
      const rankName = member ? getUserRank(member) : null;
      const shiftNumber = member ? getUserShift(member) : null;

      addPatrolTime(userId, rankName || 'Bez hodnosti', shiftNumber || 'Neznámá', now - startTime);

      const logEmbed = createLogEmbed(userId, startTime, now, rankName, shiftNumber);

      await safeReplyOrUpdate(interaction, () => interaction.update({ embeds: [logEmbed], components: [] }));

      await sendEmbedToChannels(logEmbed, channelId);
    }

    // NOVÉ BUTTONY pro pokračování v patrolování
    else if (interaction.customId === 'patrol_continue_yes') {
      if (!patrolTimers.has(userId)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Nemáš aktivní patrolu.', flags: 64 }));
      }

      const patrolData = patrolTimers.get(userId);
      if (!patrolData.pingSent) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Tento ping již není aktivní.', flags: 64 }));
      }

      // Resetujeme ping flag a smažeme pingMessageId
      patrolData.pingSent = false;
      patrolData.pingMessageId = null;
      patrolData.pingTimestamp = null;
      patrolTimers.set(userId, patrolData);

      await safeReplyOrUpdate(interaction, () => interaction.update({ content: '✅ Patrola pokračuje', embeds: [], components: [] }));
    }

    else if (interaction.customId === 'patrol_continue_no') {
      if (!patrolTimers.has(userId)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Nemáš aktivní patrolu.', ephemeral: true }));
      }

      const { startTime, channelId } = patrolTimers.get(userId);
      patrolTimers.delete(userId);

      const guild = interaction.guild;
      const member = guild.members.cache.get(userId);
      const rankName = member ? getUserRank(member) : null;
      const shiftNumber = member ? getUserShift(member) : null;

      addPatrolTime(userId, rankName || 'Bez hodnosti', shiftNumber || 'Neznámá', now - startTime);

      const logEmbed = createLogEmbed(userId, startTime, now, rankName, shiftNumber, 'Uživatel odmítl pokračovat v patrolování.');

      await safeReplyOrUpdate(interaction, () => interaction.update({ content: '🛑 Patrola ukončena dle tvého přání.', embeds: [logEmbed], components: [] }));

      await sendEmbedToChannels(logEmbed, channelId);
    }
  }

  // --- SLASH COMMANDS ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'patrola') {
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🚓 Patrola')
        .setThumbnail(commandThumbnail)
        .setDescription([
          '**Zahaj svoji patrolu kliknutím na tlačítko níže.**',
          '',
          '➡️ Klikni na **🟢 Zahájit Patrolu** pro zahájení hlídky.',
          '⬅️ Klikni na **🔴 Ukončit Patrolu** pro její ukončení.',
          '',
          '> 💤 Patrola bude **automaticky ukončena**, pokud tvůj stav na aplikaci bude offline.'
        ].join('\n'))
        .setFooter({ text: 'LSPD Patrol System', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('start_patrol')
          .setLabel('🟢 Zahájit Patrolu')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('stop_patrol')
          .setLabel('🔴 Ukončit Patrolu')
          .setStyle(ButtonStyle.Danger)
      );

      await safeReplyOrUpdate(interaction, () => interaction.reply({ embeds: [embed], components: [buttons] }));
    }
    else if (interaction.commandName === 'souhrn') {
      const member = interaction.member;
      if (!canUseSummary(member)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Potřebuješ hodnost Sergeant I. nebo vyšší.', flags: 64 }));
      }

      if (patrolSummary.size === 0) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '📊 Žádná data o patrolách nejsou k dispozici.', flags: 64 }));
      }

      // Spočítáme celkový čas podle směn
      const totalByShift = new Map();
      for (const [shift, users] of patrolSummary.entries()) {
        let shiftTotal = 0;
        for (const data of users.values()) {
          shiftTotal += data.duration;
        }
        totalByShift.set(shift, shiftTotal);
      }

      // Najdeme nejlepší směnu (nejvyšší odsloužený čas)
      const bestShiftEntry = [...totalByShift.entries()].reduce((a, b) => (a[1] > b[1] ? a : b));
      const bestShift = bestShiftEntry[0];

      // Najdeme nejlepšího uživatele celkově (napříč směnami)
      const totalByUser = new Map();
      for (const users of patrolSummary.values()) {
        for (const [userId, data] of users.entries()) {
          totalByUser.set(userId, (totalByUser.get(userId) || 0) + data.duration);
        }
      }
      const bestUserEntry = [...totalByUser.entries()].reduce((a, b) => (a[1] > b[1] ? a : b));
      const bestUserId = bestUserEntry[0];
      const bestUserDuration = bestUserEntry[1];

      // Barvy podle směn (můžeš upravit)
      const shiftColors = {
        '1': 0x1abc9c, // tyrkysová
        '2': 0x3498db, // modrá
        '3': 0x9b59b6, // fialová
        '4': 0xe67e22, // oranžová
        '5': 0xe74c3c, // červená
      };

      const lines = [];

      const sortedShifts = [...patrolSummary.keys()]
        .sort((a, b) => parseInt(a) - parseInt(b));

      for (const shift of sortedShifts) {
        const users = patrolSummary.get(shift);
        const shiftTotalTime = totalByShift.get(shift);
        const shiftColor = shiftColors[shift] || 0x95a5a6; // šedá pokud neznámá

        // Zvýraznění nejlepší směny
        const shiftTitle = shift === bestShift ? `🌟 Směna ${shift} (nejaktivnější)` : `Směna ${shift}`;

        lines.push(`\n__**${shiftTitle} — Celkem: ${formatDuration(shiftTotalTime)}**__`);

        const sortedUsers = [...users.entries()]
          .sort((a, b) => b[1].duration - a[1].duration);

        for (const [userId, data] of sortedUsers) {
          const timeStr = formatDuration(data.duration);
          const isBestUser = userId === bestUserId;
          // Zvýraznění nejlepšího člověka (tučně + emoji)
          lines.push(`${isBestUser ? '🌟 **' : ''}👮 <@${userId}> | ${data.rank} — ⏱️ ${timeStr}${isBestUser ? '**' : ''}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Týdenní souhrn')
        .setDescription(lines.join('\n'))
        .setColor(0x2ecc71) // zelená základní barva
        .setFooter({ text: `Nejaktivnější officer: <@${bestUserId}> — ${formatDuration(bestUserDuration)}` })
        .setTimestamp();

      await safeReplyOrUpdate(interaction, () => interaction.reply({ embeds: [embed] }));
    }
    else if (interaction.commandName === 'clear') {
      const member = interaction.member;
      if (!isChief(member)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Pouze Chief of Police může čistit data.', flags: 64 }));
      }

      patrolSummary.clear();
      saveSummary();

      return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '🗑️ Všechna data o patrolách byla úspěšně vymazána.', flags: 64 }));
    }
    else if (interaction.commandName === 'aktivni') {
      const member = interaction.member;
      if (!canUseActiveList(member)) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Potřebuješ hodnost Sergeant I. nebo vyšší.', flags: 64 }));
      }

      if (patrolTimers.size === 0) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '📋 Nikdo momentálně neprobíhá patrolu.', flags: 64 }));
      }

      const guild = interaction.guild;
      await guild.members.fetch();

      const activeUsers = [];

      for (const [userId] of patrolTimers.entries()) {
        const mem = guild.members.cache.get(userId);
        if (!mem) continue;

        const rank = getUserRank(mem);
        const rankIndex = getRankIndex(rank);

        activeUsers.push({
          userId,
          mention: `<@${userId}>`,
          rank,
          rankIndex,
        });
      }

      const sergeantIndex = rankRoles.indexOf('⟩⟩⟩│Sergeant I.');
      const filtered = activeUsers.filter(u => u.rankIndex <= sergeantIndex);

      if (filtered.length === 0) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '📋 Momentálně není aktivní žádný officer se hodností Sergeant I. nebo vyšší.', flags: 64 }));
      }

      filtered.sort((a, b) => a.rankIndex - b.rankIndex);

      const lines = filtered.map(u => `👮 ${u.mention} | ${u.rank}`);

      const embed = new EmbedBuilder()
        .setTitle('🟢 Aktuálně aktivní patroly')
        .setDescription(lines.join('\n'))
        .setColor(0x2ECC71)
        .setTimestamp();

      await safeReplyOrUpdate(interaction, () => interaction.reply({ embeds: [embed], flags: 64 }));
    }
    else if (interaction.commandName === 'redat') {
      // MODAL na dostupnost
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('redat_availability_modal')
        .setTitle('Žádost o REDAT');

      const availabilityInput = new TextInputBuilder()
        .setCustomId('availability')
        .setLabel('Dostupnost (např. 3.7 20:00-22:00)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(availabilityInput)
      );

      await safeShowModal(interaction, modal);
    }
    return;
  }

  // --- REDAT AVAILABILITY MODAL SUBMIT ---
  if (interaction.isModalSubmit() && interaction.customId === 'redat_availability_modal') {
    // OPRAVA: Pokud už byla interakce odpovědena, nevolat znovu reply
    if (interaction.replied || interaction.deferred) return;

    const availability = interaction.fields.getTextInputValue('availability');
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const nickname = member ? (member.nickname || member.user.username) : interaction.user.username;
    const rank = member ? getUserRank(member) : 'Bez hodnosti';
    const shift = member ? getUserShift(member) : 'Neznámá';

    // Embed a tlačítka
    const embed = createRedatEmbed({
      userId: interaction.user.id,
      nickname,
      rank,
      shift,
      availability
    });
    const buttons = createRedatButtons({});

    // --- PING SUPERVISORY ---
    // Ping supervisor roli (ID: 1390274413265555467)
    const supervisorPing = '<@&1390274413265555467>';
    const redatChannel = await client.channels.fetch(redatChannelId);
    const msg = await redatChannel.send({
      content: supervisorPing,
      embeds: [embed],
      components: buttons
    });

    redatRequests.set(msg.id, {
      userId: interaction.user.id,
      nickname,
      rank,
      shift,
      availability,
      status: 'open',
      messageId: msg.id,
      channelId: redatChannelId,
      lastPing: Date.now()
    });

    await safeReplyOrUpdate(interaction, () => interaction.reply({ content: 'Tvoje žádost o redat byla odeslána!', flags: 64 }));
    return;
  }

  // --- REDAT BUTTONS ---
  if (interaction.isButton() && interaction.message.embeds?.[0]?.title?.includes('Žádost o REDAT')) {
    const req = redatRequests.get(interaction.message.id);
    if (!req) return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Tato žádost už není aktivní.', flags: 64 }));

    // CLAIM
    if (interaction.customId === 'redat_claim') {
      // Supervisor info
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const supNickname = member ? (member.nickname || member.user.username) : interaction.user.username;
      const supRank = member ? getUserRank(member) : 'Bez hodnosti';
      const supShift = member ? getUserShift(member) : 'Neznámá';

      req.claimedBy = interaction.user.id;
      req.claimedRank = supRank;
      req.claimedShift = supShift;
      req.status = 'claimed';

      // Update embed/buttons
      const embed = createRedatEmbed({ ...req, claimedBy: req.claimedBy, claimedRank: supRank, claimedShift: supShift });
      const buttons = createRedatButtons({ claimedBy: req.claimedBy });

      await interaction.update({ embeds: [embed], components: buttons });
      redatRequests.set(interaction.message.id, req);
      saveRedatRequests();

      // Pingni původního uživatele do DM
      try {
        const guild = interaction.guild;
        const user = await guild.members.fetch(req.userId);
        await user.send(
          `Tvoje žádost o REDAT byla claimnuta supervisorem: **${supNickname}** (${supRank}, směna ${supShift}).`
        );
      } catch (e) {
        // Pokud DM nejde poslat, ignoruj
      }
      return;
    }

    // UNCLAIM
    if (interaction.customId === 'redat_unclaim') {
      req.claimedBy = null;
      req.claimedRank = null;
      req.claimedShift = null;
      req.status = 'open';
      req.lastPing = Date.now(); // reset ping timer

      const embed = createRedatEmbed(req);
      const buttons = createRedatButtons({});

      await interaction.update({ embeds: [embed], components: buttons });
      redatRequests.set(interaction.message.id, req);
      saveRedatRequests();
      return;
    }

    // CANCEL - NYNÍ OTEVŘE MODAL NA DŮVOD
    if (interaction.customId === 'redat_cancel') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('redat_cancel_reason_modal')
        .setTitle('Důvod zrušení žádosti');

      const reasonInput = new TextInputBuilder()
        .setCustomId('cancel_reason')
        .setLabel('Důvod zrušení žádosti')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await safeShowModal(interaction, modal);

      // Ulož info o žádosti pro modal
      req._modalUser = interaction.user.id;
      redatRequests.set(interaction.message.id, req);
      saveRedatRequests();
      return;
    }

    // DONE (formulář na hodnocení)
    if (interaction.customId === 'redat_done') {
      // Jen supervisor co claimnul může dokončit
      if (req.claimedBy !== interaction.user.id) {
        return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Jen supervisor, který claimnul tuto žádost, ji může dokončit.', flags: 64 }));
      }
      // Modal na hodnocení
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('redat_feedback_modal')
        .setTitle('Hodnocení patrolly');

      const feedbackInput = new TextInputBuilder()
        .setCustomId('feedback')
        .setLabel('Slovní hodnocení')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const passedInput = new TextInputBuilder()
        .setCustomId('passed')
        .setLabel('Prošel? (ano/ne)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(feedbackInput),
        new ActionRowBuilder().addComponents(passedInput)
      );

      await safeShowModal(interaction, modal);

      // Ulož info o žádosti pro modal
      req._modalUser = interaction.user.id;
      redatRequests.set(interaction.message.id, req);
      saveRedatRequests();
      return;
    }
  }

  // --- REDAT CANCEL REASON MODAL ---
  if (interaction.isModalSubmit() && interaction.customId === 'redat_cancel_reason_modal') {
    // Najdi žádost podle messageId (z interaction.message.id není, musíme najít podle _modalUser)
    const reqEntry = [...redatRequests.entries()].find(([_, v]) => v._modalUser === interaction.user.id && v.status !== 'done');
    if (!reqEntry) return safeReplyOrUpdate(interaction, () => interaction.reply({ content: '❗ Žádná aktivní žádost ke zrušení.', flags: 64 }));
    const [messageId, req] = reqEntry;

    const cancelReason = interaction.fields.getTextInputValue('cancel_reason');
    req.status = 'cancelled';
    req.cancelReason = cancelReason;

    // Update embed
    const embed = createRedatEmbed(req);

    // Edit message v redat kanálu
    const channel = await client.channels.fetch(req.channelId);
    const msg = await channel.messages.fetch(req.messageId);
    await msg.edit({ embeds: [embed], components: [] });

    // DM původnímu uživateli o zrušení s důvodem
    try {
      const guild = channel.guild || interaction.guild;
      const user = await guild.members.fetch(req.userId);
      await user.send(`Tvoje žádost o REDAT byla zrušena supervisorem.\n**Důvod:** ${cancelReason}`);
    } catch (e) {
      // Pokud DM nejde poslat, ignoruj
    }
    // NEMAŽEME záznam, pouze aktualizujeme status a důvod
    redatRequests.set(messageId, req);
    saveRedatRequests();
    await interaction.reply({ content: 'Žádost byla zrušena a důvod odeslán.', flags: 64 });
    return;
  }

  // --- REDAT FEEDBACK MODAL ---
  if (interaction.isModalSubmit() && interaction.customId === 'redat_feedback_modal') {
    // Najdi žádost podle messageId (z interaction.message.id není, musíme najít podle _modalUser)
    const reqEntry = [...redatRequests.entries()].find(([_, v]) => v._modalUser === interaction.user.id && v.status === 'claimed');
    if (!reqEntry) return interaction.reply({ content: '❗ Žádná aktivní žádost k dokončení.', flags: 64 });
    const [messageId, req] = reqEntry;

    const feedback = interaction.fields.getTextInputValue('feedback');
    const passedRaw = interaction.fields.getTextInputValue('passed');
    // Uzná "ano", "prošel", s diakritikou, tečkou, čárkou, atd.
    const passed = /^(ano|prosel|prošel)/i.test(
      passedRaw.trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // odstraní diakritiku
        .replace(/[^a-zA-Z]/g, '') // odstraní speciální znaky
    );

    req.status = 'done';
    req.feedback = feedback;
    req.passed = passed;

    // Update embed
    const embed = createRedatEmbed(req);

    // Edit message v redat kanálu
    const channel = await client.channels.fetch(req.channelId);
    const msg = await channel.messages.fetch(req.messageId);
    await msg.edit({ embeds: [embed], components: [] });

    await interaction.reply({ content: 'Hodnocení bylo uloženo a žádost uzavřena.', flags: 64 });
    // NEMAŽEME záznam, pouze aktualizujeme status a hodnocení
    redatRequests.set(messageId, req);
    saveRedatRequests();
    return;
  }
});

// === PERIODICKÝ PING SUPERVISORŮ NA NECLAIMNUTÉ ŽÁDOSTI ===
setInterval(async () => {
  const supervisorPing = '<@&1390274413265555467>';
  const now = Date.now();
  for (const [msgId, req] of redatRequests.entries()) {
    if (
      req.status === 'open' &&
      (!req.lastPing || now - req.lastPing >= 5 * 60 * 60 * 1000)
    ) {
      try {
        // Kontrola existence kanálu a messageId
        if (!req.channelId || !req.messageId) continue;
        const channel = await client.channels.fetch(req.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        // Ověř, že zpráva stále existuje (nebyla smazána)
        const msg = await channel.messages.fetch(req.messageId).catch(() => null);
        if (!msg) {
          // Pokud zpráva neexistuje, smaž žádost z paměti
          redatRequests.delete(msgId);
          continue;
        }

        await channel.send({
          content: supervisorPing + ` (čeká na claim žádosti <https://discord.com/channels/${guildId}/${req.channelId}/${req.messageId}>)`
        });
        req.lastPing = now;
        redatRequests.set(msgId, req);
      } catch (e) {
        console.error('Chyba při periodickém pingování supervisorů:', e);
      }
    }
  }
}, 60 * 1000); // kontrola každou minutu

// === REGISTRACE / SLASH COMMANDŮ do Discordu (při startu) ===
client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      {
        body: [
          new SlashCommandBuilder()
            .setName('patrola')
            .setDescription('Zobrazí panel pro zahájení/ukončení patrolly')
            .toJSON(),
          new SlashCommandBuilder()
            .setName('souhrn')
            .setDescription('Zobrazí týdenní souhrn patrol')
            .toJSON(),
          new SlashCommandBuilder()
            .setName('clear')
            .setDescription('Vymaže všechna data o patrolách (pouze Chief)')
            .toJSON(),
          new SlashCommandBuilder()
            .setName('aktivni')
            .setDescription('Zobrazí aktuálně aktivní patroly (Sergeant I. a výš)')
            .toJSON(),
          new SlashCommandBuilder()
            .setName('redat')
            .setDescription('Zažádej o redat patrolu')
            .toJSON()
        ]
      }
    );
    console.log('✅ Slash příkazy registrovány.');
  } catch (e) {
    console.error('❗ Chyba při registraci slash příkazů:', e);
  }
});

client.login(token);


