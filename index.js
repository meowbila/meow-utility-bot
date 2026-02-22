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

/* ================= CONFIG ================= */

let config = {};
if (fs.existsSync('./config.json')) {
  config = JSON.parse(fs.readFileSync('./config.json'));
}

if (!config.globalAFK) config.globalAFK = {};

function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

function getModLogChannel(guild) {
  if (!config[guild.id]?.modLogChannel) return null;
  return guild.channels.cache.get(config[guild.id].modLogChannel);
}

/* ================= SLASH COMMANDS ================= */

const commands = [

  new SlashCommandBuilder().setName('ticket').setDescription('Open ticket panel'),

  new SlashCommandBuilder().setName('setlog').setDescription('Set moderation log channel'),
  new SlashCommandBuilder().setName('undolog').setDescription('Remove moderation log channel'),

  new SlashCommandBuilder().setName('setticketlog').setDescription('Set ticket transcript log channel'),
  new SlashCommandBuilder().setName('undoticketlog').setDescription('Remove ticket transcript log channel'),

  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set global AFK')
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get user info')
    .addUserOption(o => o.setName('user').setDescription('Select user')),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create embed')
    .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))

].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= INTERACTION ================= */

client.on('interactionCreate', async interaction => {

  if (!interaction.guild) return;

  if (!config[interaction.guild.id])
    config[interaction.guild.id] = {};

  /* ===== SLASH COMMANDS ===== */

  if (interaction.isChatInputCommand()) {

    /* TICKET PANEL */
    if (interaction.commandName === 'ticket') {

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Open Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        content: 'Need help? Click below.',
        components: [row]
      });
    }

    /* SET MOD LOG */
    if (interaction.commandName === 'setlog') {
      config[interaction.guild.id].modLogChannel = interaction.channel.id;
      saveConfig();
      return interaction.reply({ content: `Mod log set to ${interaction.channel}`, ephemeral: true });
    }

    if (interaction.commandName === 'undolog') {
      delete config[interaction.guild.id].modLogChannel;
      saveConfig();
      return interaction.reply({ content: 'Mod log removed.', ephemeral: true });
    }

    /* SET TICKET LOG */
    if (interaction.commandName === 'setticketlog') {
      config[interaction.guild.id].ticketLogChannel = interaction.channel.id;
      saveConfig();
      return interaction.reply({ content: `Ticket log set to ${interaction.channel}`, ephemeral: true });
    }

    if (interaction.commandName === 'undoticketlog') {
      delete config[interaction.guild.id].ticketLogChannel;
      saveConfig();
      return interaction.reply({ content: 'Ticket log removed.', ephemeral: true });
    }

    /* AFK */
    if (interaction.commandName === 'afk') {
      const reason = interaction.options.getString('reason') || 'AFK';
      config.globalAFK[interaction.user.id] = { reason };
      saveConfig();
      return interaction.reply({ content: `You are now AFK: ${reason}`, ephemeral: true });
    }

    /* USERINFO */
    if (interaction.commandName === 'userinfo') {

      const member = interaction.options.getMember('user') || interaction.member;

      const embed = new EmbedBuilder()
        .setColor(member.displayHexColor === '#000000' ? 0x2b2d31 : member.displayHexColor)
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: 'User ID', value: member.user.id },
          { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`view_perms_${member.id}`)
          .setLabel('View Permissions')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    /* EMBED */
    if (interaction.commandName === 'embed') {

      const embed = new EmbedBuilder()
        .setTitle(interaction.options.getString('title'))
        .setDescription(interaction.options.getString('description'))
        .setColor(0x5865F2)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

  }

  /* ===== BUTTONS ===== */

  if (interaction.isButton()) {

    /* CREATE TICKET */
    if (interaction.customId === 'create_ticket') {

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      await ticketChannel.send(`Welcome <@${interaction.user.id}>`);

      return interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    /* VIEW PERMISSIONS */
    if (interaction.customId.startsWith('view_perms_')) {

      const userId = interaction.customId.split('_')[2];
      const member = interaction.guild.members.cache.get(userId);
      if (!member) return;

      const perms = member.permissions.toArray().join('\n') || 'No permissions';

      const embed = new EmbedBuilder()
        .setTitle(`${member.user.tag} Permissions`)
        .setDescription('```' + perms + '```')
        .setColor(0x5865F2);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

});

/* ================= AFK MESSAGE CHECK ================= */

client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  if (config.globalAFK[message.author.id]) {
    delete config.globalAFK[message.author.id];
    saveConfig();
    message.reply('Welcome back. AFK removed.');
  }

  message.mentions.users.forEach(user => {
    if (config.globalAFK[user.id]) {
      message.reply(`${user.tag} is AFK: ${config.globalAFK[user.id].reason}`);
    }
  });
});

/* ================= LOG EVENTS ================= */

// MESSAGE DELETE
client.on('messageDelete', message => {
  if (!message.guild || message.author?.bot) return;
  const log = getModLogChannel(message.guild);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Message Deleted')
    .addFields(
      { name: 'User', value: message.author.tag, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Content', value: message.content || 'None' }
    )
    .setTimestamp();

  log.send({ embeds: [embed] });
});

// MESSAGE EDIT
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const log = getModLogChannel(oldMsg.guild);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('Message Edited')
    .addFields(
      { name: 'User', value: oldMsg.author.tag, inline: true },
      { name: 'Channel', value: `${oldMsg.channel}`, inline: true },
      { name: 'Before', value: oldMsg.content || 'None' },
      { name: 'After', value: newMsg.content || 'None' }
    )
    .setTimestamp();

  log.send({ embeds: [embed] });
});

// VOICE LOG
client.on('voiceStateUpdate', (oldState, newState) => {
  const log = getModLogChannel(newState.guild);
  if (!log) return;

  const member = newState.member;
  if (!member) return;

  const embed = new EmbedBuilder().setColor(0x5865F2).setTimestamp();

  if (!oldState.channel && newState.channel)
    embed.setTitle('Joined Voice').setDescription(`${member.user.tag} joined ${newState.channel.name}`);

  if (oldState.channel && !newState.channel)
    embed.setTitle('Left Voice').setDescription(`${member.user.tag} left ${oldState.channel.name}`);

  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id)
    embed.setTitle('Switched Voice')
      .setDescription(`${member.user.tag} moved ${oldState.channel.name} → ${newState.channel.name}`);

  log.send({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);