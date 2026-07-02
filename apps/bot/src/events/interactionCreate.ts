import { Interaction, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { client, whitelistedBots } from '../index';

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.guild || !interaction.isRepliable()) return;

  // فتح التذاكر (مفتوح للجميع وبدون شروط منعاً لأي تعليق للأعضاء)
  const isTicket = (interaction.isButton() && ['tk_general_btn', 'tk_report_btn'].includes(interaction.customId)) ||
                   (interaction.isStringSelectMenu() && interaction.customId === 'tk_hybrid_menu');

  if (isTicket) {
    await interaction.deferReply({ ephemeral: true });
    let type = 'دعم-عام';
    if (interaction.isButton() && interaction.customId === 'tk_report_btn') type = 'بلاغ-سري';
    if (interaction.isStringSelectMenu() && interaction.values[0] === 'report') type = 'بلاغ-سري';

    try {
      const ch = await interaction.guild.channels.create({
        name: `ticket-${type}-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
          { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });

      const emb = new EmbedBuilder()
        .setTitle('🔳 **تم إنشاء التذكرة بنجاح**')
        .setDescription(`مرحباً بك ${interaction.user}، اطرح طلبك هنا وسيتم الرد عليك قريباً.`)
        .setColor('#000000');

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('close_hybrid_ticket').setLabel('إغلاق التذكرة 🔒').setStyle(ButtonStyle.Danger)
      );

      await ch.send({ embeds: [emb], components: [row] });
      await interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ch}` });
    } catch {
      await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء الغرفة، تحقق من صلاحيات رتبة البوت.' });
    }
    return;
  }

  // زر الحذف والتطهير داخل التذكرة (مفتوح للجميع)
  if (interaction.isButton() && interaction.customId === 'close_hybrid_ticket') {
    const channel = interaction.channel as TextChannel;
    await interaction.reply({ content: '🔳 جاري حذف وتطهير الغرفة نهائياً...' }).catch(() => {});
    setTimeout(() => channel.delete().catch(() => {}), 1000);
    return;
  }

  // أزرار لوحة حماية البوتات المعزولة
  if (interaction.isButton()) {
    const [action, botId, guildId] = interaction.customId.split('_');
    if (action !== 'approve' && action !== 'reject') return;

    await interaction.deferUpdate();
    try {
      const targetBot = await interaction.guild.members.fetch(botId).catch(() => null);
      if (action === 'approve') {
        if (targetBot) {
          whitelistedBots.add(botId);
          await targetBot.timeout(null).catch(() => {});
          await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('✅ تم قبول البوت وإلغاء العزل عنه').setColor('#000000')], components: [] });
        }
      } else {
        if (targetBot && targetBot.kickable) await targetBot.kick().catch(() => {});
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('❌ تم رفض وطرد البوت بنجاح').setColor('#000000')], components: [] });
      }
    } catch {}
  }
});
