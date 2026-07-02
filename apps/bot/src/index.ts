import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  ChannelType,
  TextChannel,
  AuditLogEvent
} from 'discord.js';
import mongoose from 'mongoose';
import http from 'http';
import querystring from 'querystring';

// 🔑 الـ export هنا ضروري عشان يقرأه الملف الثاني وما يفشل الـ Build
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

export const SUPREME_OWNER_ID = '1065985362658345040'; 
export const whitelistedBots = new Set<string>(); 

const PREFIX = '.';
const nukeTracker = new Map<string, { count: number; lastAction: number }>();
const spamTracker = new Map<string, { count: number; lastMessage: number }>();

const MONGO_URI = process.env.MONGO_URI || '';
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).catch(() => console.log('[KRB] Secure Memory Mode.'));
}

// 🌐 لوحة التحكم (Dashboard) لـ Render
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  const url = req.url || '';
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      const postData = querystring.parse(body);
      if (url === '/api/broadcast' && postData.message) {
        client.guilds.cache.forEach(guild => {
          const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me!).has(PermissionFlagsBits.SendMessages)) as TextChannel;
          if (ch) ch.send({ embeds: [new EmbedBuilder().setDescription(postData.message as string).setColor('#000000')] }).catch(() => {});
        });
      }
      if (url === '/api/whitelist' && postData.botId) {
        whitelistedBots.add(postData.botId as string);
      }
      res.writeHead(302, { 'Location': '/' });
      res.end();
    });
    return;
  }
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>KRB PANEL</title></head><body style="background:#000;color:#fff;padding:30px;"><h1>🔳 لوحة تحكم KRB النشطة</h1></body></html>`);
  }
}).listen(PORT);

// ⚡ حماية البوتات الدخيلة (عزل تلقائي)
client.on('guildMemberAdd', async (member) => {
  if (!member.user.bot) return;
  if (!whitelistedBots.has(member.user.id)) {
    if (member.manageable) await member.roles.set([]).catch(() => {});
    await member.timeout(2419200000, 'KRB Security Bot Isolation').catch(() => {});
  }
});

// 🔥 أنتي نيوك (Anti-Nuke) الرومات والرولات
async function handleNuke(guildId: string, execId: string) {
  if (execId === client.user?.id || execId === SUPREME_OWNER_ID) return;
  const now = Date.now();
  const data = nukeTracker.get(execId) || { count: 0, lastAction: now };
  if (now - data.lastAction < 5000) {
    data.count++;
    if (data.count > 2) {
      const guild = client.guilds.cache.get(guildId);
      if (guild && execId !== guild.ownerId) {
        await guild.members.ban(execId, { reason: 'KRB Anti-Nuke Triggered' }).catch(() => {});
      }
    }
  } else { data.count = 1; data.lastAction = now; }
  nukeTracker.set(execId, data);
}

client.on('channelDelete', async (c) => {
  if ('guild' in c && c.guild) {
    const logs = await c.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    if (logs?.entries.first()?.executor) await handleNuke(c.guild.id, logs.entries.first()!.executor!.id);
  }
});

// 💬 الأنتي سبام + أمر الـ help والـ ticket-setup
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // نظام الـ Anti-Spam الشغال تلقائياً
  const now = Date.now();
  const userData = spamTracker.get(message.author.id) || { count: 0, lastMessage: now };
  if (now - userData.lastMessage < 3000) {
    userData.count++;
    if (userData.count > 4) {
      if (message.member?.manageable) {
        await message.delete().catch(() => {});
        await message.member.timeout(60000, 'KRB Anti-Spam').catch(() => {});
        await message.channel.send(`⚠️ **[KRB ANTI-SPAM]:** تم عزل ${message.author} مؤقتاً لحماية الشات.`);
      }
      userData.count = 0;
    }
  } else { userData.count = 1; userData.lastMessage = now; }
  spamTracker.set(message.author.id, userData);

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const icon = message.guild.iconURL({ extension: 'png' }) || '';

  if (command === 'help') {
    return message.reply('🔳 **KRB SYSTEM ONLINE**\n• `.ticket-setup` : لتشغيل نظام التذاكر.');
  }

  if (command === 'ticket-setup') {
    const embed = new EmbedBuilder()
      .setAuthor({ name: `KRB SYSTEM`, iconURL: icon })
      .setTitle('🔳 **مـركـز الـدّعـم الـفـنّـي والـخـدمـات**')
      .setColor('#000000')
      .setDescription('اختر القسم المطلوب من الأسفل لفتح تذكرة جديدة للتواصل مع الإدارة:');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('tk_hybrid_menu')
      .setPlaceholder('🔲 اضغط هنا للاختيار من القائمة...')
      .addOptions([
        { label: 'قسم الدعم الفني', value: 'tech', emoji: '🛠️' },
        { label: 'قسم الشكاوى', value: 'report', emoji: '🛡️' }
      ]);

    const rowMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tk_general_btn').setLabel('الدعم التقني 🛠️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tk_report_btn').setLabel('تقديم بلاغ 🛡️').setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [rowMenu, rowButtons] });
    await message.delete().catch(() => {});
  }
});

import './events/interactionCreate';
