import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CacheManager } from './database/CacheManager';
import { AntiNukeEngine } from './engines/AntiNukeEngine';
import { AntiSpamEngine } from './engines/AntiSpamEngine';
import { onGuildMemberAdd } from './events/guildMemberAdd';
import { onInteractionCreate } from './events/interactionCreate';

// تحميل المتغيرات البيئية من ملف .env
dotenv.config();

// إنشاء نسخة العميل للبوت مع تفعيل الصلاحيات (Intents) والـ Partials اللازمة للحماية
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// تهيئة محركات الفحص الأمني
const antiNuke = new AntiNukeEngine();
const antiSpam = new AntiSpamEngine();

// حدث جاهزية البوت والاتصال بقاعدة البيانات والكاش
client.once(Events.ClientReady, async (c) => {
  console.log(`[KRB SYSTEM] Active and logged in as ${c.user.tag}`);
  
  try {
    // الاتصال بـ MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/securitybot');
    console.log('[DATABASE] Successfully connected to MongoDB.');
    
    // تهيئة واستدعاء نسخة كاش Redis تلقائياً للتأكد من سلامة الاتصال
    CacheManager.getInstance();
  } catch (error) {
    console.error('[CRITICAL INIT ERROR] Failed to initialize core systems:', error);
  }
});

// [ANTI-NUKE] مراقبة حدث حذف القنوات وتفعيل عقوبات الحماية اللحظية
client.on(Events.ChannelDelete, async (channel) => {
  if (channel.isDMC()) return; // تجاهل الخاص
  await antiNuke.handleChannelDelete(channel.guild, channel);
});

// [ANTI-SPAM / WORD FILTER] فحص محتوى الرسائل ضد السبام والروابط والكلمات الممنوعة
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  await antiSpam.handleIncomingMessage(message);
});

// [BOT PROTECTION] مراقبة دخول الأعضاء والتعامل مع البوتات الجديدة وعزلها
client.on(Events.GuildMemberAdd, async (member) => {
  await onGuildMemberAdd(member);
});

// [BUTTON INTERACTION] استقبال وإدارة ضغطات أزرار الموافقة والرفض للبوتات
client.on(Events.InteractionCreate, async (interaction) => {
  await onInteractionCreate(interaction);
});

// حماية البوت من التوقف المفاجئ عند حدوث أخطاء غير متوقعة في الـ API (Anti-Crash)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ANTI-CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[ANTI-CRASH] Uncaught Exception caught:', err);
});

// تسجيل دخول البوت للمشروع
client.login(process.env.DISCORD_TOKEN);
