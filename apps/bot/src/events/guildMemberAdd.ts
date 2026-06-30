import { GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GuildConfig } from '../database/GuildConfig';
import { CacheManager } from '../database/CacheManager';

export async function onGuildMemberAdd(member: GuildMember) {
  if (!member.user.bot) return; // الحسابات البشرية يتم تجاهلها هنا

  const cache = CacheManager.getInstance();
  let config = await cache.getGuildConfig(member.guild.id);
  if (!config) {
    config = await GuildConfig.findOne({ guildId: member.guild.id });
    if (!config || !config.botProtection.enabled) return;
    await cache.setGuildConfig(member.guild.id, config);
  }

  const bp = config.botProtection;
  if (!bp.enabled) return;

  // جلب الـ Audit Logs لمعرفة من قام بدعوة البوت للسيرفر
  const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 28 }).catch(() => null); // 28 = BOT_ADD
  const entry = auditLogs?.entries.first();
  const inviter = entry?.executor;

  const channel = member.guild.channels.cache.get(bp.verificationChannel);
  if (!channel || !channel.isTextBased()) return;

  // إرسال طلب التحقق إلى الغرفة المحددة بالإعدادات
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Bot Authorization Request')
    .setDescription(`A new bot has joined the server and is currently isolated.`)
    .setColor(0x000000)
    .addFields(
      { name: 'Bot Name', value: `${member.user.tag}`, inline: true },
      { name: 'Bot ID', value: `${member.id}`, inline: true },
      { name: 'Invited By', value: inviter ? `<@${inviter.id}>` : 'Unknown', inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bp:approve:${member.id}`).setLabel('Approve Bot').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bp:reject:${member.id}`).setLabel('Kick Bot').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
}
