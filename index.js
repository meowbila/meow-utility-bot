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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// SLASH COMMANDS SETUP
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('What should I say?')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a styled embed')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Embed title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Embed description')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear messages (Manage Messages required)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('1-100 messages')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the support ticket panel')

].map(command => command.toJSON());

// =====================
// REGISTER COMMANDS
// =====================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Slash commands registered');
  } catch (error) {
    console.error(error);
  }
});

// =====================
// INTERACTION HANDLER
// =====================
client.on('interactionCreate', async interaction => {

  // ===== SLASH COMMANDS =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'ping')
      return interaction.reply('Pong! 🏓');

    if (interaction.commandName === 'say')
      return interaction.reply(interaction.options.getString('text'));

    if (interaction.commandName === 'embed') {
      const embed = new EmbedBuilder()
        .setTitle(interaction.options.getString('title'))
        .setDescription(interaction.options.getString('description'))
        .setColor(0x5865F2);

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'clear') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ content: 'You lack permissions.', ephemeral: true });
      }

      const amount = interaction.options.getInteger('amount');
      if (amount < 1 || amount > 100) {
        return interaction.reply({ content: '1-100 only.', ephemeral: true });
      }

      await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
    }

    if (interaction.commandName === 'ticketpanel') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Open Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        content: "Need help? Click below to open a ticket.",
        components: [row]
      });
    }
  }

  // ===== BUTTON HANDLER =====
  if (interaction.isButton()) {

    const { customId, guild, user, channel } = interaction;

    // CREATE TICKET
    if (customId === 'create_ticket') {

      const existing = guild.channels.cache.find(
        c => c.name === `ticket-${user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `You already have a ticket: ${existing}`,
          ephemeral: true
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          }
        ]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `Welcome <@${user.id}> 👋`,
        components: [row]
      });

      return interaction.reply({
        content: `Ticket created: ${ticketChannel}`,
        ephemeral: true
      });
    }

    // CLOSE REQUEST
    if (customId === 'close_ticket') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_close')
          .setLabel('Yes, Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_close')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "Are you sure you want to close this ticket?",
        components: [row]
      });
    }

    // CONFIRM CLOSE + TRANSCRIPT
    if (customId === 'confirm_close') {

      await interaction.update({
        content: "Saving transcript and closing ticket...",
        components: []
      });

      const messages = await channel.messages.fetch({ limit: 100 });

      const transcript = messages
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m =>
          `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`
        )
        .join('\n');

      const logChannel = guild.channels.cache.find(
        c => c.name === "ticket-logs"
      );

      if (logChannel) {
        await logChannel.send({
          content: `Transcript for **${channel.name}**`,
          files: [{
            attachment: Buffer.from(transcript, 'utf-8'),
            name: `transcript-${channel.name}.txt`
          }]
        });
      }

      setTimeout(() => channel.delete().catch(() => {}), 5000);
    }

    // CANCEL CLOSE
    if (customId === 'cancel_close') {
      return interaction.update({
        content: "Ticket close cancelled.",
        components: []
      });
    }
  }
});

// =====================
client.login(process.env.DISCORD_TOKEN);