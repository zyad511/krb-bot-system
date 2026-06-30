import { Interaction, Events } from 'discord.js';
import { GuildConfig } from '../database/GuildConfig';
import { CacheManager } from '../database/CacheManager';

export async function onInteractionCreate(interaction: Interaction) {
  // التأكد من أن التفاعل ناتج عن ضغط زر (Button Click)
  if (!interaction.isButton()) return;

  const [prefix, action, botId] = interaction.customId.split(':');
  // التحقق من أن الزر تابع لنظام حماية البوتات (Bot Protection)
  if (prefix !== 'bp') return;

  const cache = CacheManager.getInstance();
  let config = await cache.getGuildConfig(interaction.guildId!);
  
  if (!config) {
    config = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (!config) return interaction.reply({ content: '❌ Server configuration not found.', ephemeral: true });
    await cache.setGuildConfig(interaction.guildId!, config);
  }

  const bp = config.botProtection;
  const userId = interaction.user.id;
  const memberRoles = (interaction.member?.roles as any).cache.map((r: any) => r.id) || [];

  // التحقق من الصلاحيات: هل المستخدم هو صاحب السيرفر، أم من الأشخاص الموثوقين، أم يملك الرتبة المسموح لها؟
  const isAllowed = bp.allowedReviewers.includes(userId) || 
                    memberRoles.some((r: string) => bp.allowedRoles.includes(r)) || 
                    interaction.guild?.ownerId === userId;

  if (!isAllowed) {
    return interaction.reply({ content: '❌ You are not authorized to review this bot application.', ephemeral: true });
  }

  // جلب عضوية البوت المعزول داخل السيرفر
  const botMember = await interaction.guild?.members.fetch(botId).catch(() => null);

  if (action === 'approve') {
    if (!botMember) {
      return interaction.update({ content: '❌ The bot has already left or been kicked from the server.', embeds: [], components: [] });
    }

    // إعطاء البوت الرتبة الموثوقة المحددة له من الـ Dashboard
    if (bp.verifiedRole) {
      await botMember.roles.add(bp.verifiedRole).catch(() => null);
    }
    
    await interaction.update({ 
      content: `✅ **Approved:** <@${botId}> has been verified and authorized by <@${userId}>.`, 
      embeds: [], 
      components: [] 
    });
    
  } else if (action === 'reject') {
    if (botMember && botMember.kickable) {
      await botMember.kick('Bot Authorization Rejected via Security Dashboard Panel.').catch(() => null);
    }
    
    await interaction.update({ 
      content: `❌ **Rejected:** <@${botId}> has been denied and kicked from the server by <@${userId}>.`, 
      embeds: [], 
      components: [] 
    });
  }
}
