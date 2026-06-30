import { Guild, AuditLogEvent, Channel } from 'discord.js';
import { CacheManager } from '../database/CacheManager';
import { GuildConfig } from '../database/GuildConfig';

export class AntiNukeEngine {
  private cache = CacheManager.getInstance();

  async handleChannelDelete(guild: Guild, channel: Channel): Promise<void> {
    let config = await this.cache.getGuildConfig(guild.id);
    if (!config) {
      config = await GuildConfig.findOne({ guildId: guild.id });
      if (!config) return;
      await this.cache.setGuildConfig(guild.id, config);
    }

    const rule = config.antiNuke.channelDelete;
    if (!rule || !rule.enabled) return;

    // تم التعديل هنا: استخدام AuditLogEvent.ChannelDelete بدلاً من الرقم 65
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (!entry || !entry.executor || entry.executor.id === guild.client.user?.id) return;

    const executorId = entry.executor.id;

    if (config.trustedUsers.includes(executorId) || guild.ownerId === executorId) return;

    const rateLimitKey = `antinuke:${guild.id}:${executorId}:channelDelete`;
    const check = await this.cache.checkRateLimit(rateLimitKey, rule.maxActions, rule.windowSeconds);

    if (!check.allowed) {
      await this.executePunishment(guild, executorId, rule.punishment);
    }
  }

  public async executePunishment(guild: Guild, targetId: string, punishment: any): Promise<void> {
    const member = await guild.members.fetch(targetId).catch(() => null);
    if (!member) return;

    for (const type of punishment.type) {
      try {
        switch (type) {
          case 'BAN':
            if (member.bannable) await member.ban({ reason: `[Anti-Nuke] ${punishment.reason}` });
            break;
          case 'KICK':
            if (member.kickable) await member.kick(`[Anti-Nuke] ${punishment.reason}`);
            break;
          case 'TIMEOUT':
            if (member.moderatable) await member.timeout(punishment.duration * 60 * 1000, `[Anti-Nuke] ${punishment.reason}`);
            break;
          case 'REMOVE_ROLES':
            const rolesToRemove = member.roles.cache.filter(role => role.managed === false && role.id !== guild.id);
            await member.roles.remove(rolesToRemove, `[Anti-Nuke] ${punishment.reason}`);
            break;
        }
      } catch (error) {
        console.error(`Failed to execute punishment ${type} on ${targetId}:`, error);
      }
    }
  }
}
