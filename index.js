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
  StringSelectMenuBuilder,
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
      o.setName('reason').setDescription('Reason')
    ),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get user info')
    .addUserOption(o =>
      o.setName('user').setDescription('Select user')
    ),

  // EMBED STUDIO
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed')
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
    .addStringOption(o => o.setName('image').setDescription('Image URL'))
    .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL'))
    .addStringOption(o => o.setName('author').setDescription('Author name'))
    .addStringOption(o => o.setName('authoricon').setDescription('Author icon URL'))
    .addStringOption(o => o.setName('footer').setDescription('Footer text'))

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

  /* ================= EMBED STUDIO ================= */

  if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: 'You need Manage Messages permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(interaction.options.getString('title'))
      .setDescription(interaction.options.getString('description'))
      .setColor(0x5865F2)
      .setTimestamp();

    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    const author = interaction.options.getString('author');
    const authorIcon = interaction.options.getString('authoricon');
    const footer = interaction.options.getString('footer');

    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (author) embed.setAuthor({ name: author, iconURL: authorIcon || null });
    if (footer) embed.setFooter({ text: footer });

    client.embedCache = client.embedCache || {};
    client.embedCache[interaction.user.id] = embed;

    const colorMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('embed_color')
        .setPlaceholder('Select embed color')
        .addOptions([
          { label: 'Blue', value: '5865F2' },
          { label: 'Red', value: 'ED4245' },
          { label: 'Green', value: '57F287' },
          { label: 'Yellow', value: 'FEE75C' },
          { label: 'Purple', value: '9B59B6' }
        ])
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed_confirm').setLabel('Send').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('embed_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('embed_save').setLabel('Save Template').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      content: 'Embed Preview:',
      embeds: [embed],
      components: [colorMenu, buttons],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'embed_color') {
    const embed = client.embedCache?.[interaction.user.id];
    if (!embed) return;

    embed.setColor(parseInt(interaction.values[0], 16));

    return interaction.update({
      embeds: [embed],
      components: interaction.message.components
    });
  }

  if (interaction.isButton()) {

    const embed = client.embedCache?.[interaction.user.id];

    if (interaction.customId === 'embed_confirm') {
      if (!embed) return;

      await interaction.channel.send({ embeds: [embed] });
      delete client.embedCache[interaction.user.id];

      return interaction.update({
        content: 'Embed sent successfully.',
        embeds: [],
        components: []
      });
    }

    if (interaction.customId === 'embed_cancel') {
      delete client.embedCache[interaction.user.id];

      return interaction.update({
        content: 'Embed cancelled.',
        embeds: [],
        components: []
      });
    }

    if (interaction.customId === 'embed_save') {
      if (!embed) return;

      client.savedEmbeds = client.savedEmbeds || {};
      client.savedEmbeds[interaction.user.id] = embed;

      return interaction.reply({
        content: 'Template saved for this session.',
        ephemeral: true
      });
    }
  }
});

/* ================= LOGIN ================= */

client.login(process.env.DISCORD_TOKEN);