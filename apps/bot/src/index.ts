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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// محاولة الاتصال بقاعدة البيانات دون جعلها تعطل البوت عند الفشل
const MONGO_URI = process.env.MONGO_URI || '';
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[KRB DATABASE] Connected successfully'))
    .catch((err) => console.error('[KRB DATABASE] Connection skipped/error:', err.message));
} else {
  console.log('[KRB DATABASE] No MONGO_URI provided. Running on Safe Memory Mode.');
}

const GuildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  trustedUsers: { type: [String], default: [] },
  supportRole: { type: String, default: '' },    
  logChannelId: { type: String, default: '' },   
  antiNuke: { type: Boolean, default: true },
  antiSpam: { type: Boolean, default: true }
});
const GuildConfig = mongoose.models.GuildConfig || mongoose.model('GuildConfig', GuildSchema);

const PREFIX = '.'; 
const activeBlackjack = new Map<string, { cards: number[], dealer: number[], bet: number }>();
const spamMap = new Map<string, { count: number, lastMessage: number }>();

client.once('ready', async () => {
  console.log(`[KRB SYSTEM] ${client.user?.tag} Is Ready & Safe From Hanging.`);
  
  const commandsData: any[] = [
    { name: 'help', description: 'عرض لوحة التحكم الكاملة والفخمة لنظام KRB' },
    { name: 'status', description: 'عرض حالة الأنظمة الأمنية والوايت ليست' },
    {
      name: 'config',
      description: 'إعداد خيارات التكت والحماية المتقدمة',
      options: [
        { name: 'logs', description: 'تحديد قناة سجلات التكت', type: ApplicationCommandOptionType.Channel },
        { name: 'role', description: 'تحديد رتبة الدعم الفني للمنشن', type: ApplicationCommandOptionType.Role },
        { name: 'trust', description: 'إضافة مستخدم موثوق للوايت ليست (ID)', type: ApplicationCommandOptionType.String }
      ]
    }
  ];

  if (client.application) {
    await client.application.commands.set(commandsData).catch(() => {});
  }
});

// دالة آمنة لجلب الإعدادات دون تعليق البوت إذا كانت قاعدة البيانات مفصولة
async function getGuildConfig(guildId: string) {
  const defaultConfig = { guildId, trustedUsers: [], supportRole: '', logChannelId: '', antiNuke: true, antiSpam: true };
  if (mongoose.connection.readyState !== 1) return defaultConfig; // إذا لم تكن متصلة، خذ الافتراضي فوراً
  try {
    const config = await GuildConfig.findOne({ guildId }).maxTimeMS(1500); // حد أقصى ثانية ونصف للبحث لمنع التعليق
    return config || defaultConfig;
  } catch {
    return defaultConfig;
  }
}

// ==========================================
// [1] نظام حماية الدخول (Anti-Bot)
// ==========================================
client.on('guildMemberAdd', async (member) => {
  if (!member.user.bot) return;
  const config = await getGuildConfig(member.guild.id);
  if (!config.antiNuke) return;

  try {
    const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
    if (!fetchedLogs) return;
    const botLog = fetchedLogs.entries.first();
    
    if (botLog) {
      const { executor } = botLog;
      if (executor && executor.id !== member.guild.ownerId && !config.trustedUsers.includes(executor.id)) {
        await member.kick('KRB Security: Unauthorized bot.').catch(() => {});
        const executorMember = await member.guild.members.fetch(executor.id).catch(() => null);
        if (executorMember && executorMember.manageable) {
          await executorMember.roles.set([]).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error('[KRB] Anti-bot error bypassed:', error);
  }
});

// ==========================================
// [2] معالج الرسائل والنظام الفخم لحظر السبام (.help)
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const config = await getGuildConfig(message.guild.id);

  // نظام الـ Anti-Spam التلقائي الذكي
  if (config.antiSpam && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    const now = Date.now();
    const userData = spamMap.get(message.author.id) || { count: 0, lastMessage: now };

    if (now - userData.lastMessage < 3000) {
      userData.count++;
      if (userData.count > 4) {
        await message.delete().catch(() => {});
        await message.member?.timeout(60000, 'KRB Anti-Spam').catch(() => {});
        return;
      }
    } else {
      userData.count = 1;
      userData.lastMessage = now;
    }
    spamMap.set(message.author.id, userData);
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const serverIconUrl = message.guild.iconURL({ extension: 'png', size: 1024 }) || undefined;

  // أمر تفعيل لوحة التكت الهجينة الفخمة
  if (command === 'ticket-setup') {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
    
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${message.guild.name.toUpperCase()} | SYSTEM HUB`, iconURL: serverIconUrl })
      .setTitle('🔳 **مـركـز خـدمـات الـسـيـرفـر والـدّعـم الـفـنّـي**')
      .setColor('#000000')
      .setThumbnail(serverIconUrl || null)
      .setDescription(
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ Bond\n\n` +
        `مرحباً بك في المنصة الموحدة لـ **KRB SYSTEM**.\n` +
        `يمكنك بدء محادثة خاصة ومباشرة مع الإدارة الفنية عبر اختيار الطريقة التي تناسبك أدناه:\n\n` +
        `🔲 **الخيار الأول:** عبر القائمة المنسدلة (Menu)\n` +
        `🔲 **الخيار الثاني:** عبر الأزرار التفاعلية (Buttons)\n\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ`
      )
      .setFooter({ text: 'KRB Infrastructure • Premium Hybrid Interface' });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('tk_hybrid_menu')
      .setPlaceholder('🔲 اختر القسم المطلوب من القائمة هنا...')
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
    return;
  }

  // أمر المساعدة التقليدي للاختبار الفوري للمطورين
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('🔳 KRB SYSTEM LIVE')
      .setDescription('البوت يعمل بكفاءة مطلقة الآن واستجاب للأمر النصي بنجاح!\nاكتب `.ticket-setup` لإطلاق لوحة التحكم الفخمة بالسيرفر.')
      .setColor('#000000');
    await message.reply({ embeds: [embed] });
  }
});

// ==========================================
// [3] معالج التفاعلات الآمن والمؤمن ضد الـ Timeout (Slash & UI)
// ==========================================
client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.guild || !interaction.isRepliable()) return;

  const config = await getGuildConfig(interaction.guild.id);
  const serverIconUrl = interaction.guild.iconURL({ extension: 'png', size: 1024 }) || undefined;

  // حل مشكلة "The application did not respond" عبر عمل deferReply فوراً لكل أوامر الـ Slash
  if (interaction.isChatInputCommand()) {
    await interaction.deferReply().catch(() => {});
    const { commandName } = interaction;

    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🔳 KRB ULTIMATE PANEL')
        .setDescription('النظام يعمل بالكامل. استخدم البادئة النصية `.` واكتب `.ticket-setup` لإنشاء روم الدعم الفني الفخم.')
        .setColor('#000000');
      await interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'status') {
      await interaction.editReply({ content: `🛡️ **[KRB SECURITY]:** أنظمة الحماية الحية والوايت ليست تعمل حالياً في الذاكرة الآمنة.` });
    }

    if (commandName === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({ content: '❌ لا تملك صلاحيات كافية.' });
      }
      const logChannel = interaction.options.getChannel('logs');
      const role = interaction.options.getRole('role');
      const trustUser = interaction.options.getString('trust');

      if (mongoose.connection.readyState === 1) {
        const dbConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (dbConfig) {
          if (logChannel) dbConfig.logChannelId = logChannel.id;
          if (role) dbConfig.supportRole = role.id;
          if (trustUser) dbConfig.trustedUsers.push(trustUser);
          await dbConfig.save();
        }
        await interaction.editReply({ content: '✅ **[KRB CONFIG]:** تم تحديث الإعدادات الفخمة بنجاح في قاعدة البيانات.' });
      } else {
        await interaction.editReply({ content: '⚠️ قاعدة البيانات غير متصلة حالياً (تأكد من إعداد بيئة المونقو في Render)، البوت يعتمد الإعدادات الافتراضية حالياً لتجنب التعليق.' });
      }
    }
    return;
  }

  // دالة إنشاء غرف التكت التفاعلية
  const createTicket = async (typeLabel: string) => {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const ticketChannel = await interaction.guild!.channels.create({
      name: `${typeLabel}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild!.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
        { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
      ]
    });

    const mentionRole = config.supportRole ? `<@&${config.supportRole}>` : '@here';

    const insideEmbed = new EmbedBuilder()
      .setAuthor({ name: 'KRB MANAGEMENT SYSTEM', iconURL: serverIconUrl })
      .setTitle('🔳 **غرفة تواصل مغلقة ونشطة**')
      .setColor('#000000')
      .setDescription(`مرحباً بك <@${interaction.user.id}> في قسم الـ **${typeLabel.replace('-', ' ')}**.\nيرجى كتابة طلبك بوضوح وسيرد عليك الكادر الإداري فوراً.`);

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('close_hybrid_ticket').setLabel('إغلاق وحفظ التكت 🔒').setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({ 
      content: `👤 **مفتوح بواسطة:** <@${interaction.user.id}> | 🔔 **إلى:** ${mentionRole}`, 
      embeds: [insideEmbed], 
      components: [closeRow] 
    });

    await interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح: <#${ticketChannel.id}>` });
  };

  if (interaction.isStringSelectMenu() && interaction.customId === 'tk_hybrid_menu') {
    const selected = interaction.values[0];
    await createTicket(selected === 'tech' ? 'دعم-عام' : 'بلاغ-سري');
  }

  if (interaction.isButton()) {
    const cid = interaction.customId;
    if (cid === 'tk_general_btn') await createTicket('دعم-عام');
    if (cid === 'tk_report_btn') await createTicket('بلاغ-سري');

    if (cid === 'close_hybrid_ticket') {
      await interaction.deferReply().catch(() => {});
      const channel = interaction.channel as TextChannel;

      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      let transcriptText = `KRB TICKET LOG\n----------------------------------------\n\n`;

      if (messages) {
        Array.from(messages.values()).reverse().forEach(msg => {
          transcriptText += `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
        });
      }

      const buffer = Buffer.from(transcriptText, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });

      if (config.logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(config.logChannelId) as TextChannel;
        if (logChannel) {
          await logChannel.send({ content: `🔒 تم غلق تكت \`${channel.name}\``, files: [attachment] }).catch(() => {});
        }
      }

      await interaction.editReply('🔳 **[KRB SYSTEM]:** تم حفظ السجل. سيتم تدمير الغرفة الآن...');
      setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
  }
});

process.on('unhandledRejection', (reason) => console.error('[KRB CRASH] Caught:', reason));
process.on('uncaughtException', (err) => console.error('[KRB CRASH] Caught:', err));

client.login(process.env.DISCORD_TOKEN);
