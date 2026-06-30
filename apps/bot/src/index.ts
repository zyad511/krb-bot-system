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
  ApplicationCommandOptionType,
  Interaction,
  TextChannel,
  AttachmentBuilder,
  AuditLogEvent
} from 'discord.js';
import mongoose from 'mongoose';
import http from 'http';
import querystring from 'querystring';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

// ==========================================
// 🛡️ الإعدادات الأمنية العليا لـ KRB
// ==========================================
const SUPREME_OWNER_ID = '1065985362658345040'; // هويتك المحمية
const PREFIX = '.';

const whitelistedBots = new Set<string>(); 
const nukeTracker = new Map<string, { count: number; lastAction: number }>();

// الاتصال الاختياري بالمونقو
const MONGO_URI = process.env.MONGO_URI || '';
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).catch(() => console.log('[KRB] Running in Secure Memory Mode.'));
}

// ==========================================
// 🌐 لوحة التحكم (KRB Dashboard) مع ميزة فك العزل تلقائياً
// ==========================================
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = req.url || '';
  
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      const postData = querystring.parse(body);

      // أ) أمر البث الإعلاني
      if (url === '/api/broadcast') {
        const messageContent = postData.message as string;
        if (messageContent) {
          client.guilds.cache.forEach(guild => {
            const targetChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me!).has(PermissionFlagsBits.SendMessages)) as TextChannel;
            if (targetChannel) {
              const bEmbed = new EmbedBuilder()
                .setAuthor({ name: 'KRB SYSTEM | BROADCAST' })
                .setDescription(messageContent)
                .setColor('#000000')
                .setTimestamp();
              targetChannel.send({ embeds: [bEmbed] }).catch(() => {});
            }
          });
        }
      }

      // ب) أمر مغادرة السيرفرات
      if (url === '/api/leave') {
        const guildId = postData.guildId as string;
        if (guildId) {
          const targetGuild = client.guilds.cache.get(guildId);
          if (targetGuild) await targetGuild.leave().catch(() => {});
        }
      }

      // ج) قبول البوت وإلغاء العزل (Timeout) عنه تلقائياً في السيرفر
      if (url === '/api/whitelist') {
        const botId = postData.botId as string;
        if (botId) {
          whitelistedBots.add(botId);
          
          // البحث عن البوت في السيرفرات وفك العزل والـ Timeout عنه فوراً
          client.guilds.cache.forEach(async (guild) => {
            const isolatedBot = await guild.members.fetch(botId).catch(() => null);
            if (isolatedBot && isolatedBot.communicationDisabledUntilTimestamp) {
              await isolatedBot.timeout(null, 'KRB Web: Approved and activated by owner.').catch(() => {});
              
              // إرسال رسالة ترحيب للبوت بعد تفعيله
              const sysChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel;
              if (sysChannel) {
                sysChannel.send(`✅ **[KRB SECURITY]:** تم تفعيل البوت <@${botId}> بنجاح من لوحة التحكم وإلغاء العزل عنه.`);
              }
            }
          });
        }
      }

      res.writeHead(302, { 'Location': '/' });
      res.end();
    });
    return;
  }

  // الواجهة الرسومية الفخمة باللون الأسود والأبيض (AirFlow Style)
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

    let guildsHtml = '';
    client.guilds.cache.forEach(guild => {
      guildsHtml += `
        <tr>
          <td>${guild.name}</td>
          <td>\`${guild.id}\`</td>
          <td>${guild.memberCount} عضو</td>
          <td>
            <form action="/api/leave" method="POST" style="margin:0;">
              <input type="hidden" name="guildId" value="${guild.id}">
              <button type="submit" class="btn-danger">طرد البوت ❌</button>
            </form>
          </td>
        </tr>
      `;
    });

    res.end(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>KRB ULTIMATE PANEL</title>
        <style>
          body { background-color: #000000; color: #ffffff; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 40px; }
          .container { max-width: 1100px; margin: 0 auto; }
          h1 { font-size: 28px; font-weight: 700; border-bottom: 2px solid #ffffff; padding-bottom: 15px; letter-spacing: 2px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
          .card { background: #0a0a0a; border: 1px solid #222222; padding: 25px; }
          .card h2 { font-size: 18px; margin-top: 0; margin-bottom: 20px; border-left: 3px solid #fff; padding-left: 10px; }
          textarea { width: 100%; background: #111; border: 1px solid #333; color: #fff; padding: 12px; height: 120px; resize: none; box-sizing: border-box; }
          input[type="text"] { width: 100%; background: #111; border: 1px solid #333; color: #fff; padding: 12px; box-sizing: border-box; }
          button { background: #ffffff; color: #000000; border: none; padding: 12px 25px; font-weight: bold; cursor: pointer; margin-top: 15px; }
          button:hover { background: #cccccc; }
          .btn-danger { background: #ff3333; color: #fff; padding: 6px 12px; font-size: 12px; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #0a0a0a; }
          th, td { border: 1px solid #222222; padding: 12px; text-align: right; font-size: 14px; }
          th { background: #111111; }
          .status { color: #00ff00; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔳 KRB SYSTEM | CONTROL INTERFACE</h1>
          <p>مرحباً بك يا أبو عتب. حالة النظام الأمني: <span class="status">نشط وجدار العزل مستقر ●</span></p>

          <div class="grid">
            <div class="card">
              <h2>📢 إرسال بث موحد لجميع السيرفرات</h2>
              <form action="/api/broadcast" method="POST">
                <textarea name="message" placeholder="اكتب نص الإعلان هنا..."></textarea>
                <button type="submit">إطلاق البث الآن 🚀</button>
              </form>
            </div>

            <div class="card">
              <h2>🛡️ الموافقة وتفعيل بوت معزول</h2>
              <form action="/api/whitelist" method="POST">
                <input type="text" name="botId" placeholder="ضع الرقم التعريفي (ID) للبوت المعزول...">
                <button type="submit">فك العزل والتوثيق فوراً ✅</button>
              </form>
              <p style="font-size:12px; color:#666; margin-top:10px;">* بمجرد وضع الـ ID هنا، سيقوم البوت بإلغاء الميوت والعزل عن البوت المستهدف داخل السيرفر تلقائياً.</p>
            </div>
          </div>

          <div style="margin-top: 40px;">
            <h2>📦 قائمة السيرفرات المتصلة بالشبكة (${client.guilds.cache.size})</h2>
            <table>
              <thead>
                <tr>
                  <th>اسم السيرفر</th>
                  <th>ID السيرفر</th>
                  <th>عدد الأعضاء</th>
                  <th>الإجراءات المتاحة</th>
                </tr>
              </thead>
              <tbody>
                ${guildsHtml || '<tr><td colspan="4" style="text-align:center; color:#555;">لا توجد سيرفرات متصلة حالياً.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  res.writeHead(404);
  res.end();
}).listen(PORT, () => console.log(`[KRB INTERFACE] Dynamic Dashboard Running Perfect.`));

// ==========================================
// ⚡ خوارزمية العزل التام للبوتات غير المصرحة (سوح + Timeout)
// ==========================================
client.on('guildMemberAdd', async (member) => {
  if (!member.user.bot) return; // البشر يدخلون بشكل طبيعي

  // إذا كان بوت غير موثق من الموقع
  if (!whitelistedBots.has(member.user.id)) {
    try {
      // 1. تجريد كامل وسحب كافة الرتب (يخليه سوح)
      if (member.manageable) {
        await member.roles.set([]).catch(() => {});
      }

      // 2. تطبيق عزل تام وميوت شامل (Timeout) لأقصى مدة مسموحة بالديسكورد (28 يوم) لمنعه من إرسال أي رسالة أو رؤية قنوات
      await member.timeout(2419200000, 'KRB Security: Unapproved bot isolated completely.').catch(() => {});

      // 3. إرسال تنبيه في قنوات الشات للإدارة
      const systemChannel = member.guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel;
      if (systemChannel) {
        const alert = new EmbedBuilder()
          .setTitle('🚨 **[KRB SECURITY] تم رصد وعزل بوت غير مصرح**')
          .setDescription(`دخل البوت \`${member.user.tag}\` إلى السيرفر.\n\n🛡️ **الإجراء المتخذ تلقائياً:**\n- تم سحب كافة صلاحياته ورتبه بالكامل.\n- تم إدخاله في عزل تام وميوت شامل (Timeout).\n\n*البوت الآن مشلول تماماً ولن يعمل حتى توافق عليه من موقع الويب.*`)
          .setColor('#000000');
        systemChannel.send({ embeds: [alert] }).catch(() => {});
      }
    } catch (err) {
      console.error('[KRB ISO ERROR] Failed to fully isolate bot:', err);
    }
  }
});

// ==========================================
// 🔥 مكافحة التخريب السريع (Anti-Nuke Systems)
// ==========================================
async function handleNukeDetection(guildId: string, executorId: string, actionType: string) {
  if (executorId === client.user?.id || executorId === SUPREME_OWNER_ID) return;

  const now = Date.now();
  const trackingData = nukeTracker.get(executorId) || { count: 0, lastAction: now };

  if (now - trackingData.lastAction < 4000) {
    trackingData.count++;
    if (trackingData.count > 2) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      await guild.members.ban(executorId, { reason: `KRB Anti-Nuke: Rapid channel ${actionType} detected.` }).catch(() => {});
      trackingData.count = 0;
    }
  } else {
    trackingData.count = 1;
    trackingData.lastAction = now;
  }
  nukeTracker.set(executorId, trackingData);
}

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry?.executor) await handleNukeDetection(channel.guild.id, entry.executor.id, 'deletion');
  } catch {}
});

client.on('channelCreate', async (channel) => {
  if (!channel.guild) return;
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry?.executor) await handleNukeDetection(channel.guild.id, entry.executor.id, 'creation');
  } catch {}
});

// ==========================================
// 🛠️ لوحة التكت الهجينة الأساسية (.ticket-setup)
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const serverIconUrl = message.guild.iconURL({ extension: 'png', size: 1024 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  if (command === 'ticket-setup') {
    if (message.author.id !== SUPREME_OWNER_ID) {
      return message.reply('❌ **[KRB SECURITY]:** الصلاحية محصورة لمالك النظام الأعلى فقط.');
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `KRB SYSTEM | HUB`, iconURL: serverIconUrl })
      .setTitle('🔳 **مـركـز خـدمـات الـسـيـرفـر والـدّعـم الـفـنّـي**')
      .setColor('#000000')
      .setThumbnail(serverIconUrl)
      .setDescription(
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ\n\n` +
        `مرحباً بك في منصة تذاكر الدعم الفني الرسمية لنظام **KRB**.\n` +
        `فضلاً اختر الطريقة الأنسب لك لبدء محادثة مشفرة مع الإدارة قريباً:\n\n` +
        `🔲 **الخيار الأول:** القائمة المنسدلة الذكية\n` +
        `🔲 **الخيار الثاني:** الأزرار التفاعلية المباشرة\n\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ`
      );

    const menu = new StringSelectMenuBuilder()
      .setCustomId('tk_hybrid_menu')
      .setPlaceholder('🔲 اضغط هنا للاختيار من القائمة...')
      .addOptions([
        { label: 'قسم الدعم الفني والتقني', value: 'tech', emoji: '🛠️' },
        { label: 'قسم الشكاوى والبلاغات السرية', value: 'report', emoji: '🛡️' }
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

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.guild || !interaction.isRepliable()) return;

  if (interaction.isButton() && interaction.customId === 'close_hybrid_ticket') {
    const channel = interaction.channel as TextChannel;
    await interaction.reply({ content: '🔳 **[KRB SYSTEM]:** جاري تدمير القناة نهائياً...' }).catch(() => {});
    setTimeout(() => channel.delete().catch(() => {}), 1500);
  }
});

process.on('unhandledRejection', () => {});
client.login(process.env.DISCORD_TOKEN);
