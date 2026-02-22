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
    GatewayIntentBits.GuildMembers,
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
    .setName('ticket')
    .setDescription('Send ticket panel'),

  new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Set moderation log channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('undolog')
    .setDescription('Undo moderation log channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('setticketlog')
    .setDescription('Set ticket transcript log channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('undoticketlog')
    .setDescription('Undo ticket transcript log channel (Admin only)')
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

  if (!config[interaction.guild.id])
    config[interaction.guild.id] = {};

  // SET MOD LOG
  if (interaction.commandName === 'setlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].modLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({ content: `Moderation log set to ${interaction.channel}`, ephemeral: true });
  }

  // UNDO MOD LOG
  if (interaction.commandName === 'undolog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].modLogChannel;
    saveConfig();

    return interaction.reply({ content: `Moderation log removed.`, ephemeral: true });
  }

  // SET TICKET LOG
  if (interaction.commandName === 'setticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].ticketLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({ content: `Ticket transcript log set to ${interaction.channel}`, ephemeral: true });
  }

  // UNDO TICKET LOG
  if (interaction.commandName === 'undoticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].ticketLogChannel;
    saveConfig();

    return interaction.reply({ content: `Ticket transcript log removed.`, ephemeral: true });
  }

  // TICKET PANEL
  if (interaction.commandName === 'ticket') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({
      content: "Need help? Click below.",
      components: [row]
    });
  }

  // BUTTONS
  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

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

      await ticketChannel.send({ content: `Welcome <@${user.id}>`, components: [row] });

      return interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
    }

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

      for (const msg of allMessages) {
        transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
      }

      const logChannel = guild.channels.cache.get(config[guild.id]?.ticketLogChannel);
      if (logChannel) {
        await logChannel.send({
          files: [{ attachment: Buffer.from(transcript), name: `transcript-${channel.name}.txt` }]
        });
      }

      setTimeout(() => channel.delete().catch(() => {}), 5000);
    }
  }
});

// =====================
// HELPER
// =====================
function getModLogChannel(guild) {
  if (!config[guild.id]) return null;
  if (!config[guild.id].modLogChannel) return null;

  return guild.channels.cache.get(config[guild.id].modLogChannel);
}

// =====================
// MESSAGE CREATE
// =====================
client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  const logChannel = getModLogChannel(message.guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('Message Sent')
    .setColor(0x00ff00)
    .addFields(
      { name: 'User', value: message.author.tag, inline: true },
      { name: 'Channel', value: `#${message.channel.name}`, inline: true },
      { name: 'Content', value: message.content || 'None' }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

// =====================
// MESSAGE DELETE
// =====================
client.on('messageDelete', message => {
  if (!message.guild || message.author?.bot) return;

  const logChannel = getModLogChannel(message.guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor(0xff0000)
    .addFields(
      { name: 'User', value: message.author.tag, inline: true },
      { name: 'Channel', value: `#${message.channel.name}`, inline: true },
      { name: 'Content', value: message.content || 'None' }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

// =====================
// MESSAGE EDIT
// =====================
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const logChannel = getModLogChannel(oldMsg.guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('Message Edited')
    .setColor(0xffff00)
    .addFields(
      { name: 'User', value: oldMsg.author.tag, inline: true },
      { name: 'Channel', value: `#${oldMsg.channel.name}`, inline: true },
      { name: 'Before', value: oldMsg.content || 'None' },
      { name: 'After', value: newMsg.content || 'None' }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

// =====================
// MEMBER JOIN/LEAVE
// =====================
client.on('guildMemberAdd', member => {
  const logChannel = getModLogChannel(member.guild);
  if (!logChannel) return;
  logChannel.send(`Member Joined: ${member.user.tag}`);
});

client.on('guildMemberRemove', member => {
  const logChannel = getModLogChannel(member.guild);
  if (!logChannel) return;
  logChannel.send(`Member Left: ${member.user.tag}`);
});

// =====================
// ROLE UPDATE
// =====================
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const logChannel = getModLogChannel(newMember.guild);
  if (!logChannel) return;

  const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (added.size > 0)
    logChannel.send(`${newMember.user.tag} gained roles: ${added.map(r => r.name).join(', ')}`);

  if (removed.size > 0)
    logChannel.send(`${newMember.user.tag} lost roles: ${removed.map(r => r.name).join(', ')}`);
});

// =====================
// VOICE LOG
// =====================
client.on('voiceStateUpdate', (oldState, newState) => {
  const logChannel = getModLogChannel(newState.guild);
  if (!logChannel) return;

  const member = newState.member;

  if (!oldState.channel && newState.channel)
    logChannel.send(`${member.user.tag} joined VC: ${newState.channel.name}`);

  if (oldState.channel && !newState.channel)
    logChannel.send(`${member.user.tag} left VC: ${oldState.channel.name}`);

  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id)
    logChannel.send(`${member.user.tag} moved VC: ${oldState.channel.name} → ${newState.channel.name}`);
});

client.login(process.env.DISCORD_TOKEN);