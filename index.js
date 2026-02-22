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
  PermissionsBitField,
  AuditLogEvent
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
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
    .setName('setticketlog')
    .setDescription('Set ticket transcript log channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Set moderation log channel (Admin only)')
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

  // =====================
  // SET TICKET LOG
  // =====================
  if (interaction.commandName === 'setticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].ticketLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({
      content: `Ticket transcript log set to ${interaction.channel}`,
      ephemeral: true
    });
  }

  // =====================
  // SET MOD LOG
  // =====================
  if (interaction.commandName === 'setlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].modLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({
      content: `Moderation log set to ${interaction.channel}`,
      ephemeral: true
    });
  }

  // =====================
  // TICKET PANEL
  // =====================
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

  // =====================
  // BUTTONS
  // =====================
  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

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

      await ticketChannel.send({ content: `Welcome <@${user.id}>`, components: [row] });

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

      for (const msg of allMessages) {
        transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
      }

      const logChannel = guild.channels.cache.get(config[guild.id].ticketLogChannel);

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
// AUTO CREATE MOD LOG IF NOT SET
// =====================
async function getModLogChannel(guild) {
  if (!config[guild.id]) config[guild.id] = {};

  if (!config[guild.id].modLogChannel) {
    let logChannel = guild.channels.cache.find(c => c.name === 'mod-logs');
    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: 'mod-logs',
        type: ChannelType.GuildText
      });
    }
    config[guild.id].modLogChannel = logChannel.id;
    saveConfig();
  }

  return guild.channels.cache.get(config[guild.id].modLogChannel);
}

// =====================
// MESSAGE DELETE
// =====================
client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;

  const logChannel = await getModLogChannel(message.guild);

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
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const logChannel = await getModLogChannel(oldMsg.guild);

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
client.on('guildMemberAdd', async member => {
  const logChannel = await getModLogChannel(member.guild);
  logChannel.send(`Member Joined: ${member.user.tag}`);
});

client.on('guildMemberRemove', async member => {
  const logChannel = await getModLogChannel(member.guild);
  logChannel.send(`Member Left: ${member.user.tag}`);
});

// =====================
// BAN LOG
// =====================
client.on('guildBanAdd', async ban => {
  const logChannel = await getModLogChannel(ban.guild);
  logChannel.send(`User Banned: ${ban.user.tag}`);
});

// =====================
// ROLE UPDATE
// =====================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const logChannel = await getModLogChannel(newMember.guild);

  const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

  if (addedRoles.size > 0)
    logChannel.send(`${newMember.user.tag} gained roles: ${addedRoles.map(r => r.name).join(', ')}`);

  if (removedRoles.size > 0)
    logChannel.send(`${newMember.user.tag} lost roles: ${removedRoles.map(r => r.name).join(', ')}`);
});

// =====================
// VOICE LOG
// =====================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const logChannel = await getModLogChannel(newState.guild);
  const member = newState.member;

  if (!oldState.channel && newState.channel)
    logChannel.send(`${member.user.tag} joined VC: ${newState.channel.name}`);

  if (oldState.channel && !newState.channel)
    logChannel.send(`${member.user.tag} left VC: ${oldState.channel.name}`);

  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id)
    logChannel.send(`${member.user.tag} moved VC: ${oldState.channel.name} → ${newState.channel.name}`);
});

client.login(process.env.DISCORD_TOKEN);