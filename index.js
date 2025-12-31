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
    const path = './patrolSummary.json';

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
const guildId = '1163922563278307338';

const patrolLogChannelId = '1182806618757406760';
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
      if (fs.existsSync(path)) {
        try {
          const raw = fs.readFileSync(path);
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
      fs.writeFileSync(path, JSON.stringify(obj, null, 2));
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
                // Ukončíme patrolu kvůli neodpovězení
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

    client.on(Events.InteractionCreate, async interaction => {
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

          await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: false });
        }

          else if (interaction.commandName === 'souhrn') {
            const member = interaction.member;
            if (!canUseSummary(member)) {
              return interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Potřebuješ hodnost Sergeant I. nebo vyšší.', ephemeral: true });
            }

            if (patrolSummary.size === 0) {
              return interaction.reply({ content: '📊 Žádná data o patrolách nejsou k dispozici.', ephemeral: true });
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

            await interaction.reply({ embeds: [embed] });
          }

        else if (interaction.commandName === 'clear') {
          const member = interaction.member;
          if (!isChief(member)) {
            return interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Pouze Chief of Police může čistit data.', ephemeral: true });
          }

          patrolSummary.clear();
          saveSummary();

          return interaction.reply({ content: '🗑️ Všechna data o patrolách byla úspěšně vymazána.', ephemeral: true });
        }

        else if (interaction.commandName === 'aktivni') {
          const member = interaction.member;
          if (!canUseActiveList(member)) {
            return interaction.reply({ content: '❌ Nemáš oprávnění použít tento příkaz. Potřebuješ hodnost Sergeant I. nebo vyšší.', ephemeral: true });
          }

          if (patrolTimers.size === 0) {
            return interaction.reply({ content: '📋 Nikdo momentálně neprobíhá patrolu.', ephemeral: true });
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
            return interaction.reply({ content: '📋 Momentálně není aktivní žádný officer se hodností Sergeant I. nebo vyšší.', ephemeral: true });
          }

          filtered.sort((a, b) => a.rankIndex - b.rankIndex);

          const lines = filtered.map(u => `👮 ${u.mention} | ${u.rank}`);

          const embed = new EmbedBuilder()
            .setTitle('🟢 Aktuálně aktivní patroly')
            .setDescription(lines.join('\n'))
            .setColor(0x2ECC71)
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }

      else if (interaction.isButton()) {
        const userId = interaction.user.id;
        const now = Date.now();

        if (interaction.customId === 'start_patrol') {
          if (patrolTimers.has(userId)) {
            return interaction.reply({ content: '❗ Patrola už běží.', ephemeral: true });
          }

          patrolTimers.set(userId, { startTime: now, channelId: interaction.channelId, pingSent: false });
          const embed = createStatusEmbed('start', userId, now);

          await interaction.update({ embeds: [embed], components: interaction.message.components });
        }

        else if (interaction.customId === 'stop_patrol') {
          if (!patrolTimers.has(userId)) {
            return interaction.reply({ content: '❗ Nemáš aktivní patrolu.', ephemeral: true });
          }

          const { startTime, channelId } = patrolTimers.get(userId);
          patrolTimers.delete(userId);

          const guild = interaction.guild;
          const member = guild.members.cache.get(userId);
          const rankName = member ? getUserRank(member) : null;
          const shiftNumber = member ? getUserShift(member) : null;

          addPatrolTime(userId, rankName || 'Bez hodnosti', shiftNumber || 'Neznámá', now - startTime);

          const logEmbed = createLogEmbed(userId, startTime, now, rankName, shiftNumber);

          await interaction.update({ embeds: [logEmbed], components: [] });

          await sendEmbedToChannels(logEmbed, channelId);
        }

        // NOVÉ BUTTONY pro pokračování v patrolování
        else if (interaction.customId === 'patrol_continue_yes') {
          if (!patrolTimers.has(userId)) {
            return interaction.reply({ content: '❗ Nemáš aktivní patrolu.', ephemeral: true });
          }

          const patrolData = patrolTimers.get(userId);
          if (!patrolData.pingSent) {
            return interaction.reply({ content: '❗ Tento ping již není aktivní.', ephemeral: true });
          }

          // Resetujeme ping flag a smažeme pingMessageId
          patrolData.pingSent = false;
          patrolData.pingMessageId = null;
          patrolData.pingTimestamp = null;
          patrolTimers.set(userId, patrolData);

          await interaction.update({ content: '✅ Patrola pokračuje', embeds: [], components: [] });
        }

        else if (interaction.customId === 'patrol_continue_no') {
          if (!patrolTimers.has(userId)) {
            return interaction.reply({ content: '❗ Nemáš aktivní patrolu.', ephemeral: true });
          }

          const { startTime, channelId } = patrolTimers.get(userId);
          patrolTimers.delete(userId);

          const guild = interaction.guild;
          const member = guild.members.cache.get(userId);
          const rankName = member ? getUserRank(member) : null;
          const shiftNumber = member ? getUserShift(member) : null;

          addPatrolTime(userId, rankName || 'Bez hodnosti', shiftNumber || 'Neznámá', now - startTime);

          const logEmbed = createLogEmbed(userId, startTime, now, rankName, shiftNumber, 'Uživatel odmítl pokračovat v patrolování.');

          await interaction.update({ content: '🛑 Patrola ukončena dle tvého přání.', embeds: [logEmbed], components: [] });

          await sendEmbedToChannels(logEmbed, channelId);
        }
      }
    });

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

app.get('/', (req, res) => {
  res.send('Bot je online a připraven!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Uptime server běží na portu ${port}`);
});

    client.login(token);
