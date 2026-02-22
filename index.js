const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

let config = {};
if (fs.existsSync('./config.json')) {
  config = JSON.parse(fs.readFileSync('./config.json'));
}

function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

// =====================
// SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Setup the ticket system in this channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Send the ticket panel')

].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// =====================
// INTERACTIONS
// =====================
client.on('interactionCreate', async interaction => {

  if (!interaction.guild) return;

  // ===== SLASH COMMANDS =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'ping')
      return interaction.reply('Pong! 🏓');

    // =====================
    // TICKET SETUP
    // =====================
    if (interaction.commandName === 'ticketsetup') {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Admin only.', ephemeral: true });
      }

      let logChannel = interaction.guild.channels.cache.find(c => c.name === 'ticket-logs');

      if (!logChannel) {
        logChannel = await interaction.guild.channels.create({
          name: 'ticket-logs',
          type: ChannelType.GuildText
        });
      }

      config[interaction.guild.id] = {
        logChannel: logChannel.id,
        ticketChannel: interaction.channel.id
      };

      saveConfig();

      return interaction.reply({
        content: `Ticket system configured.\nTicket Channel: ${interaction.channel}\nLogs: ${logChannel}`,
        ephemeral: true
      });
    }

    // =====================
    // TICKET COMMAND
    // =====================
    if (interaction.commandName === 'ticket') {

      const guildConfig = config[interaction.guild.id];

      if (!guildConfig)
        return interaction.reply({ content: "Run /ticketsetup first.", ephemeral: true });

      if (interaction.channel.id !== guildConfig.ticketChannel)
        return interaction.reply({ content: "Use this command in the ticket channel only.", ephemeral: true });

      // Cooldown (10 seconds)
      if (!client.ticketCooldowns) client.ticketCooldowns = new Map();

      const now = Date.now();
      const cooldown = 10000;

      if (client.ticketCooldowns.has(interaction.user.id)) {
        const expiration = client.ticketCooldowns.get(interaction.user.id) + cooldown;
        if (now < expiration) {
          return interaction.reply({ content: "Please wait before using this again.", ephemeral: true });
        }
      }

      client.ticketCooldowns.set(interaction.user.id, now);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Open Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      const reply = await interaction.reply({
        content: "Need help? Click below to open a ticket.",
        components: [row],
        fetchReply: true
      });

      // Auto delete panel after 15s
      setTimeout(() => reply.delete().catch(() => {}), 15000);
    }
  }

  // =====================
  // BUTTON HANDLER
  // =====================
  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

    const guildConfig = config[guild.id];
    if (!guildConfig) return;

    const logChannel = guild.channels.cache.get(guildConfig.logChannel);

    // CREATE TICKET
    if (customId === 'create_ticket') {

      const existing = guild.channels.cache.find(c => c.name === `ticket-${user.id}`);
      if (existing)
        return interaction.reply({ content: `You already have a ticket: ${existing}`, ephemeral: true });

      const ticketChannel = await guild.channels.create({
        name: `ticket-${user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `Welcome <@${user.id}> 👋`, components: [row] });

      return interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    // CLOSE TICKET
    if (customId === 'close_ticket') {

      await interaction.update({ content: "Generating transcript...", components: [] });

      let allMessages = [];
      let lastId;

      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        allMessages.push(...messages.values());
        lastId = messages.last().id;
      }

      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let transcript = `Ticket: ${channel.name}\nClosed by: ${user.tag}\n\n`;

      const participants = new Map();
      for (const msg of allMessages) {
        if (!msg.author.bot) {
          participants.set(msg.author.tag, (participants.get(msg.author.tag) || 0) + 1);
        }
      }

      transcript += "Participants:\n";
      participants.forEach((count, tag) => {
        transcript += `- ${tag} (${count} messages)\n`;
      });

      transcript += "\n============================\n\n";

      for (const msg of allMessages) {
        transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
      }

      if (logChannel) {
        await logChannel.send({
          content: `Transcript for ${channel.name}`,
          files: [{ attachment: Buffer.from(transcript), name: `transcript-${channel.name}.txt` }]
        });
      }

      setTimeout(() => channel.delete().catch(() => {}), 5000);
    }
  }
});

// =====================
// MESSAGE DELETE LOG
// =====================
client.on('messageDelete', message => {
  if (!message.guild) return;
  const guildConfig = config[message.guild.id];
  if (!guildConfig) return;

  const logChannel = message.guild.channels.cache.get(guildConfig.logChannel);
  if (!logChannel) return;

  logChannel.send(`🗑 ${message.author?.tag} deleted message in #${message.channel.name}: ${message.content}`);
});

// =====================
// VOICE LOG
// =====================
client.on('voiceStateUpdate', (oldState, newState) => {
  if (!newState.guild) return;
  const guildConfig = config[newState.guild.id];
  if (!guildConfig) return;

  const logChannel = newState.guild.channels.cache.get(guildConfig.logChannel);
  if (!logChannel) return;

  const member = newState.member;

  if (!oldState.channel && newState.channel)
    logChannel.send(`🎤 ${member.user.tag} joined ${newState.channel.name}`);

  if (oldState.channel && !newState.channel)
    logChannel.send(`📤 ${member.user.tag} left ${oldState.channel.name}`);

  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id)
    logChannel.send(`🔁 ${member.user.tag} moved ${oldState.channel.name} → ${newState.channel.name}`);
});

client.login(process.env.DISCORD_TOKEN);