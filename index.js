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
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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
    .setDescription('Send a styled embed message')
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
    .setDescription('Clear messages (Admin only)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the support ticket panel')

].map(command => command.toJSON());

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

client.on('interactionCreate', async interaction => {

  // Slash commands
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'ping') {
      return interaction.reply('Pong!');
    }

    if (interaction.commandName === 'say') {
      const text = interaction.options.getString('text');
      return interaction.reply(text);
    }

    if (interaction.commandName === 'embed') {
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x5865F2);

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'clear') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Admin only command.', ephemeral: true });
      }

      const amount = interaction.options.getInteger('amount');

      if (amount < 1 || amount > 100) {
        return interaction.reply({ content: 'Choose between 1-100.', ephemeral: true });
      }

      await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
    }

    if (interaction.commandName === 'ticketpanel') {

      const embed = new EmbedBuilder()
        .setTitle('Support Tickets')
        .setDescription('Click the button below to open a ticket.')
        .setColor(0x5865F2);

      const button = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      return interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // Button interactions
  if (interaction.isButton()) {

    if (interaction.customId === 'create_ticket') {

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: ['ViewChannel']
          },
          {
            id: interaction.user.id,
            allow: ['ViewChannel', 'SendMessages']
          }
        ]
      });

      const closeButton = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      await channel.send({
        content: `Welcome ${interaction.user}`,
        components: [row]
      });

      return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.channel.delete();
    }
  }
});

// Message listener
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === 'hello') {
    message.reply('Hello there 👋');
  }
});

// Welcome message
client.on('guildMemberAdd', member => {
  const channel = member.guild.systemChannel;
  if (!channel) return;

  channel.send(`Welcome ${member} 🎉`);
});

client.login(process.env.DISCORD_TOKEN);
