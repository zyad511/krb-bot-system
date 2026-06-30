import { Message } from 'discord.js';
import { CacheManager } from '../database/CacheManager';
import { GuildConfig } from '../database/GuildConfig';
import { AntiNukeEngine } from './AntiNukeEngine';

export class AntiSpamEngine {
  private cache = CacheManager.getInstance();
  private antiNuke = new AntiNukeEngine();

  async handleIncomingMessage(message: Message): Promise<void> {
    const guildId = message.guildId!;
    const userId = message.author.id;

    let config = await this.cache.getGuildConfig(guildId);
    if (!config) {
      config = await GuildConfig.findOne({ guildId });
      if (!config) return;
      await this.cache.setGuildConfig(guildId, config);
    }

    // استثناء الرتب الموثوقة أو أصحاب الوايت ليست
    const memberRoles = message.member?.roles.cache.map(r => r.id) || [];
    const isTrusted = config.trustedUsers.includes(userId) || 
                      memberRoles.some((r: string) => config.trustedRoles.includes(r)) || 
                      config.whitelist.includes(userId) || 
                      message.guild?.ownerId === userId;

    if (isTrusted) return;

    // 1. فحص الكلمات الممنوعة (Advanced Word Filter)
    if (config.antiSpam.words.enabled) {
      const hasBadWord = this.checkBadWords(message.content, config.antiSpam.words.list, config.antiSpam.words.regexEnabled);
      if (hasBadWord) {
        await this.triggerPunishment(message, config.antiSpam.words.punishment, 'Forbidden Words Usage');
        return;
      }
    }

    // 2. فحص الروابط (Anti-Links)
    if (config.antiSpam.links.enabled) {
      const linkRegex = /(https?:\/\/[^\s]+)/g;
      if (linkRegex.test(message.content)) {
        const isAllowedChannel = config.antiSpam.links.allowedChannels.includes(message.channelId);
        if (!isAllowedChannel) {
          await this.triggerPunishment(message, config.antiSpam.links.punishment, 'Unauthorized Link Sharing');
          return;
        }
      }
    }

    // 3. فحص التكرار السريع (Spam Messages Rate Limit)
    if (config.antiSpam.messages.enabled) {
      const spamRule = config.antiSpam.messages;
      const rateLimitKey = `spam:${guildId}:${userId}:messages`;
      const check = await this.cache.checkRateLimit(rateLimitKey, spamRule.max, spamRule.window);

      if (!check.allowed) {
        await this.triggerPunishment(message, spamRule.punishment, 'Text Content Flooding (Spam)');
      }
    }
  }

  private checkBadWords(content: string, wordList: string[], regexEnabled: boolean): boolean {
    const lowerContent = content.toLowerCase();
    for (const word of wordList) {
      if (regexEnabled) {
        try {
          const regex = new RegExp(word, 'i');
          if (regex.test(lowerContent)) return true;
        } catch {
          if (lowerContent.includes(word.toLowerCase())) return true;
        }
      } else {
        if (lowerContent.includes(word.toLowerCase())) return true;
      }
    }
    return false;
  }

  private async triggerPunishment(message: Message, punishment: any, defaultReason: string): Promise<void> {
    try {
      if (punishment.type.includes('DELETE_MESSAGE') && message.deletable) {
        await message.delete().catch(() => null);
      }
      
      await this.antiNuke.executePunishment(message.guild!, message.author.id, {
        type: punishment.type,
        duration: punishment.duration || 10,
        reason: punishment.reason || defaultReason
      });
    } catch (err) {
      console.error('[SPAM ENGINE ERROR]', err);
    }
  }
}
