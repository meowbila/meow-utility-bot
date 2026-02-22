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

if (!config.globalAFK) config.globalAFK = {};

function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

// =====================
// SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName('ticket').setDescription('Send ticket panel'),

  new SlashCommandBuilder().setName('setlog').setDescription('Set moderation log channel (Admin only)'),
  new SlashCommandBuilder().setName('undolog').setDescription('Undo moderation log channel (Admin only)'),

  new SlashCommandBuilder().setName('setticketlog').setDescription('Set ticket transcript log channel (Admin only)'),
  new SlashCommandBuilder().setName('undoticketlog').setDescription('Undo ticket transcript log channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set global AFK')
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Get user banner')
    .addUserOption(o =>
      o.setName('user').setDescription('Select user').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get user info')
    .addUserOption(o =>
      o.setName('user').setDescription('Select user').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get server info')

].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// =====================
// INTERACTION HANDLER
// =====================
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  if (!config[interaction.guild.id])
    config[interaction.guild.id] = {};

  // ---------------------
  // SET MOD LOG
  // ---------------------
  if (interaction.commandName === 'setlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].modLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({ content: `Moderation log set to ${interaction.channel}`, ephemeral: true });
  }

  // ---------------------
  // UNDO MOD LOG
  // ---------------------
  if (interaction.commandName === 'undolog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].modLogChannel;
    saveConfig();

    return interaction.reply({ content: `Moderation log removed.`, ephemeral: true });
  }

  // ---------------------
  // SET TICKET LOG
  // ---------------------
  if (interaction.commandName === 'setticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].ticketLogChannel = interaction.channel.id;
    saveConfig();

    return interaction.reply({ content: `Ticket log set to ${interaction.channel}`, ephemeral: true });
  }

  // ---------------------
  // UNDO TICKET LOG
  // ---------------------
  if (interaction.commandName === 'undoticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].ticketLogChannel;
    saveConfig();

    return interaction.reply({ content: `Ticket log removed.`, ephemeral: true });
  }

  // ---------------------
  // AFK
  // ---------------------
  if (interaction.commandName === 'afk') {
    const reason = interaction.options.getString('reason') || 'AFK';

    config.globalAFK[interaction.user.id] = {
      reason,
      time: Date.now()
    };

    saveConfig();

    return interaction.reply({ content: `You are now globally AFK: ${reason}`, ephemeral: true });
  }

  // ---------------------
  // BANNER
  // ---------------------
  if (interaction.commandName === 'banner') {
    const user = interaction.options.getUser('user') || interaction.user;
    const fetched = await client.users.fetch(user.id, { force: true });

    if (!fetched.banner)
      return interaction.reply({ content: 'User has no banner.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}'s Banner`)
      .setImage(fetched.bannerURL({ size: 1024, dynamic: true }))
      .setColor(0x5865F2);

    return interaction.reply({ embeds: [embed] });
  }

  // ---------------------
  // USER INFO
  // ---------------------
  if (interaction.commandName === 'userinfo') {
    const member = interaction.options.getMember('user') || interaction.member;

    const embed = new EmbedBuilder()
      .setTitle(member.user.tag)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'User ID', value: member.user.id, inline: true },
        { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: true },
        { name: 'Roles', value: member.roles.cache.map(r => r.name).join(', ').slice(0, 1024) }
      )
      .setColor(0x5865F2);

    return interaction.reply({ embeds: [embed] });
  }

  // ---------------------
  // SERVER INFO
  // ---------------------
  if (interaction.commandName === 'serverinfo') {
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>` }
      )
      .setColor(0x5865F2);

    return interaction.reply({ embeds: [embed] });
  }

  // ---------------------
  // TICKET PANEL
  // ---------------------
  if (interaction.commandName === 'ticket') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ content: "Need help? Click below.", components: [row] });
  }

  // ---------------------
  // BUTTON HANDLER
  // ---------------------
  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

    if (customId === 'create_ticket') {
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

      let messages = await channel.messages.fetch({ limit: 100 });
      messages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let transcript = `Ticket: ${channel.name}\nClosed by: ${user.tag}\n\n`;

      messages.forEach(msg => {
        transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
      });

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
// AFK MESSAGE HANDLER
// =====================
client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  if (config.globalAFK[message.author.id]) {
    delete config.globalAFK[message.author.id];
    saveConfig();
    message.reply("Welcome back! Your AFK has been removed.");
  }

  message.mentions.users.forEach(user => {
    if (config.globalAFK[user.id]) {
      message.reply(`${user.tag} is AFK: ${config.globalAFK[user.id].reason}`);
    }
  });
});

// =====================
// MODERATION LOGS
// =====================
function getModLogChannel(guild) {
  if (!config[guild.id]?.modLogChannel) return null;
  return guild.channels.cache.get(config[guild.id].modLogChannel);
}

client.on('messageDelete', message => {
  if (!message.guild || message.author?.bot) return;
  const log = getModLogChannel(message.guild);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor(0xff0000)
    .addFields(
      { name: 'User', value: message.author.tag, inline: true },
      { name: 'Channel', value: `#${message.channel.name}`, inline: true },
      { name: 'Content', value: message.content || 'None' }
    )
    .setTimestamp();

  log.send({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);