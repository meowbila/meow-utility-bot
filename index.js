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
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get user info')
    .addUserOption(o =>
      o.setName('user').setDescription('Select user')
    )

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

  /* ===== LOG SETUP ===== */

  if (interaction.commandName === 'setlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].modLogChannel = interaction.channel.id;
    saveConfig();
    return interaction.reply({ content: `Log set to ${interaction.channel}`, ephemeral: true });
  }

  if (interaction.commandName === 'undolog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].modLogChannel;
    saveConfig();
    return interaction.reply({ content: 'Log removed.', ephemeral: true });
  }

  if (interaction.commandName === 'setticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    config[interaction.guild.id].ticketLogChannel = interaction.channel.id;
    saveConfig();
    return interaction.reply({ content: `Ticket log set to ${interaction.channel}`, ephemeral: true });
  }

  if (interaction.commandName === 'undoticketlog') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    delete config[interaction.guild.id].ticketLogChannel;
    saveConfig();
    return interaction.reply({ content: 'Ticket log removed.', ephemeral: true });
  }

  /* ===== AFK ===== */

  if (interaction.commandName === 'afk') {
    const reason = interaction.options.getString('reason') || 'AFK';
    config.globalAFK[interaction.user.id] = { reason };
    saveConfig();
    return interaction.reply({ content: `You are now AFK: ${reason}`, ephemeral: true });
  }

  /* ===== USERINFO ===== */

  if (interaction.commandName === 'userinfo') {

    const member = interaction.options.getMember('user') || interaction.member;
    const user = member.user;

    const embed = new EmbedBuilder()
      .setColor(member.displayHexColor === '#000000' ? 0x2b2d31 : member.displayHexColor)
      .setAuthor({
        name: user.tag,
        iconURL: user.displayAvatarURL({ dynamic: true })
      })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setImage(user.bannerURL({ size: 1024 }) || null)
      .addFields(
        {
          name: 'User',
          value: `ID: \`${user.id}\`\nCreated: <t:${Math.floor(user.createdTimestamp/1000)}:R>`
        },
        {
          name: 'Server',
          value: `Joined: <t:${Math.floor(member.joinedTimestamp/1000)}:R>\nHighest Role: ${member.roles.highest}`
        }
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

  /* ===== PERMISSION TOGGLE ===== */

  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

    if (customId.startsWith('view_perms_')) {

      const userId = customId.split('_')[2];
      const member = guild.members.cache.get(userId);
      if (!member) return;

      const perms = member.permissions.toArray().join('\n') || 'No permissions';

      const embed = new EmbedBuilder()
        .setColor(member.displayHexColor === '#000000' ? 0x2b2d31 : member.displayHexColor)
        .setAuthor({
          name: `${member.user.tag} — Permissions`,
          iconURL: member.user.displayAvatarURL({ dynamic: true })
        })
        .setDescription('```' + perms + '```')
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`back_profile_${member.id}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId.startsWith('back_profile_')) {

      const userId = customId.split('_')[2];
      const member = guild.members.cache.get(userId);
      if (!member) return;

      const userObj = member.user;

      const embed = new EmbedBuilder()
        .setColor(member.displayHexColor === '#000000' ? 0x2b2d31 : member.displayHexColor)
        .setAuthor({
          name: userObj.tag,
          iconURL: userObj.displayAvatarURL({ dynamic: true })
        })
        .setThumbnail(userObj.displayAvatarURL({ dynamic: true }))
        .setImage(userObj.bannerURL({ size: 1024 }) || null)
        .addFields(
          {
            name: 'User',
            value: `ID: \`${userObj.id}\`\nCreated: <t:${Math.floor(userObj.createdTimestamp/1000)}:R>`
          },
          {
            name: 'Server',
            value: `Joined: <t:${Math.floor(member.joinedTimestamp/1000)}:R>\nHighest Role: ${member.roles.highest}`
          }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`view_perms_${member.id}`)
          .setLabel('View Permissions')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.update({ embeds: [embed], components: [row] });
    }

    /* ===== TICKET SYSTEM ===== */

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

      await interaction.update({ content: 'Generating transcript...', components: [] });

      const messages = await channel.messages.fetch({ limit: 100 });
      const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let transcript = `Ticket: ${channel.name}\nClosed by: ${user.tag}\n\n`;

      sorted.forEach(msg => {
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

/* ================= AFK CHECK ================= */

client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  if (config.globalAFK[message.author.id]) {
    delete config.globalAFK[message.author.id];
    saveConfig();
    message.reply('Welcome back! AFK removed.');
  }

  message.mentions.users.forEach(user => {
    if (config.globalAFK[user.id]) {
      message.reply(`${user.tag} is AFK: ${config.globalAFK[user.id].reason}`);
    }
  });
});

/* ================= LOG EVENTS ================= */

// Message Delete
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

// Message Edit
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

// Voice Logs
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