const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const { submitQueuedQotd } = require('../handlers/qotdHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('qotd')
    .setDescription('manage the question of the day queue')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) => (
      subcommand
        .setName('submit')
        .setDescription('add a question to the daily QOTD queue')
        .addStringOption((option) => (
          option
            .setName('question')
            .setDescription('question to send as a future QOTD')
            .setMaxLength(180)
            .setRequired(true)
        ))
    )),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'submit') {
      const question = interaction.options.getString('question', true);
      await submitQueuedQotd(interaction, question);
    }
  },
};
