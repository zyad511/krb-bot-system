import { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import mongoose from 'mongoose';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// الاتصال بقاعدة البيانات
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/krb-security';
mongoose.connect(MONGO_URI)
  .then(() => console.log('[KRB DATABASE] Connected successfully'))
  .catch((err) => console.error('[KRB DATABASE] Connection error:', err));

// تعريف الهيكلة لبيانات السيرفر محلياً لضمان عدم حدوث أخطاء استدعاء
const GuildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  trustedUsers: { type: [String], default: [] },
  antiNuke: { type: Boolean, default: true },
  antiSpam: { type: Boolean, default: true }
});
const GuildConfig = mongoose.models.GuildConfig || mongoose.model('GuildConfig', GuildSchema);

const PREFIX = '.'; // البادئة السريعة للجوال

client.once('ready', () => {
  console.log(`[KRB SECURITY] ${client.user?.tag} Is Now Online & Protecting.`);
  client.user?.setActivity({ name: '.help | KRB System', type: 4 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

  // التحقق من صلاحيات الإدارة العليا لاستخدام أوامر السيستم
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // جلب أو إنشاء إعدادات السيرفر من القاعدة
  let config = await GuildConfig.findOne({ guildId: message.guild.id });
  if (!config) {
    config = await GuildConfig.create({ guildId: message.guild.id });
  }

  // 1. أمر المساعدة وعرض اللوحة الفخمة
  if (command === 'help' || command === 'panel') {
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'KRB SECURITY INFRASTRUCTURE', iconURL: client.user?.displayAvatarURL() })
      .setColor('#000000')
      .setDescription(
        `🖤 **[ KRB SYSTEM CONTROL PANEL ]**\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ\n\n` +
        `🎤 **أوامر التحكم المباشر من السيرفر:**\n` +
        `\`${PREFIX}status\` ➔ لعرض حالة الحماية الحالية بالسيرفر\n` +
        `\`${PREFIX}set <nuke/spam> <on/off>\` ➔ تشغيل أو إطفاء الأنظمة الحامية\n` +
        `\`${PREFIX}wl add <@user>\` ➔ إضافة عضو ميكانيكي موثوق للوايت ليست\n` +
        `\`${PREFIX}wl remove <@user>\` ➔ إزالة عضو من الوايت ليست\n` +
        `\`${PREFIX}wl list\` ➔ استعراض قائمة الموثوقين بالكامل\n\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ`
      )
      .setFooter({ text: 'Minimalist AirFlow Standard • KRB V1' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  // 2. أمر عرض الحالة الحالية
  if (command === 'status') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ SECURITY STATE')
      .setColor('#000000')
      .addFields(
        { name: '◼️ Anti-Nuke Engine', value: config.antiNuke ? '`ACTIVE / SECURED` ✅' : '`DISABLED` ❌', inline: true },
        { name: '◼️ Anti-Spam Engine', value: config.antiSpam ? '`ACTIVE / MONITORING` ✅' : '`DISABLED` ❌', inline: true },
        { name: '◼️ Whitelisted Users', value: `\`${config.trustedUsers.length}\` Users Trusted`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  // 3. أمر التحكم والتشغيل/الإطفاء
  if (command === 'set') {
    const target = args[0]?.toLowerCase();
    const status = args[1]?.toLowerCase();

    if (!['nuke', 'spam'].includes(target) || !['on', 'off'].includes(status)) {
      return message.reply(`❌ **خطأ:** الاستخدام الصحيح: \`${PREFIX}set <nuke/spam> <on/off>\``);
    }

    const val = status === 'on';
    if (target === 'nuke') config.antiNuke = val;
    if (target === 'spam') config.antiSpam = val;

    await config.save();
    
    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setDescription(`🔳 **[SYSTEM UPDATE]:** تم تحديث نظام \`${target.toUpperCase()}\` إلى حالة: **${status.toUpperCase()}** بنجاح.`);
    await message.reply({ embeds: [embed] });
  }

  // 4. أمر إدارة الوايت ليست (تتحكم بالسيرفر كامل)
  if (command === 'wl') {
    const sub = args[0]?.toLowerCase();

    if (sub === 'list') {
      const list = config.trustedUsers.map((id: string) => `<@${id}>`).join('\n') || 'لا يوجد أي أعضاء موثوقين حالياً.';
      const embed = new EmbedBuilder()
        .setTitle('💎 KRB TRUSTED WHITELIST')
        .setColor('#000000')
        .setDescription(list);
      return message.reply({ embeds: [embed] });
    }

    const targetUser = message.mentions.members?.first() || message.guild.members.cache.get(args[1]);
    if (!targetUser) {
      return message.reply(`❌ **خطأ:** من فضشتك منشن العضو المستهدف. مثال: \`${PREFIX}wl add @user\``);
    }

    if (sub === 'add') {
      if (config.trustedUsers.includes(targetUser.id)) {
        return message.reply('❌ العضو موجود بالفعل في قائمة الوايت ليست.');
      }
      config.trustedUsers.push(targetUser.id);
      await config.save();
      return message.reply(`✅ تم إضافة ${targetUser.user.tag} إلى قائمة الموثوقين بنجاح.`);
    }

    if (sub === 'remove') {
      if (!config.trustedUsers.includes(targetUser.id)) {
        return message.reply('❌ العضو غير موجود في الوايت ليست أصلاً.');
      }
      config.trustedUsers = config.trustedUsers.filter((id: string) => id !== targetUser.id);
      await config.save();
      return message.reply(`⚠️ تم إزالة ${targetUser.user.tag} من قائمة الموثوقين.`);
    }
  }
});

// حماية البوت من الانهيار التلقائي (Anti-Crash Engine)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[KRB CRASH PROTECTION] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err, origin) => {
  console.error('[KRB CRASH PROTECTION] Uncaught Exception:', err);
});

client.login(process.env.DISCORD_TOKEN);
