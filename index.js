client.on('interactionCreate', async interaction => {

  // =========================
  // SLASH COMMANDS
  // =========================
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

      const button = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      return interaction.reply({
        content: "Click below to open a support ticket.",
        components: [row]
      });
    }
  }

  // =========================
  // BUTTON INTERACTIONS
  // =========================
  if (interaction.isButton()) {

    if (interaction.customId === 'create_ticket') {

      const existing = interaction.guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `You already have an open ticket: ${existing}`,
          ephemeral: true
        });
      }

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ],
          }
        ]
      });

      const closeButton = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      await channel.send({
        content: `Welcome <@${interaction.user.id}> 👋`,
        components: [row]
      });

      return interaction.reply({
        content: `Ticket created: ${channel}`,
        ephemeral: true
      });
    }

    if (interaction.customId === 'close_ticket') {

      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_close')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_close')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

      return interaction.reply({
        content: "Are you sure you want to close this ticket?",
        components: [row]
      });
    }

    if (interaction.customId === 'confirm_close') {

      await interaction.reply("Saving transcript...");

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let transcript = `Ticket Transcript - ${interaction.channel.name}\n\n`;

      sorted.forEach(msg => {
        transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] `;
        transcript += `${msg.author.tag}: ${msg.content}\n`;
      });

      const buffer = Buffer.from(transcript, 'utf-8');

      const logChannel = interaction.guild.channels.cache.find(
        c => c.name === "ticket-logs"
      );

      if (logChannel) {
        await logChannel.send({
          content: `Transcript for ${interaction.channel.name}`,
          files: [{ attachment: buffer, name: `${interaction.channel.name}.txt` }]
        });
      }

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }

    if (interaction.customId === 'cancel_close') {
      return interaction.update({
        content: "Ticket close cancelled.",
        components: []
      });
    }
  }
});