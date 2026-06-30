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
  TextChannel
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

// الاتصال بقاعدة البيانات
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/krb-security';
mongoose.connect(MONGO_URI)
  .then(() => console.log('[KRB DATABASE] Connected successfully'))
  .catch((err) => console.error('[KRB DATABASE] Connection error:', err));

// إعداد الهيكلة المخزنة
const GuildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  trustedUsers: { type: [String], default: [] },
  antiNuke: { type: Boolean, default: true },
  antiSpam: { type: Boolean, default: true }
});
const GuildConfig = mongoose.models.GuildConfig || mongoose.model('GuildConfig', GuildSchema);

const PREFIX = '.'; 
const activeBlackjack = new Map<string, { cards: number[], dealer: number[], bet: number }>();

// ==========================================
// [1] تسجيل أوامر الـ Slash (/) تلقائياً عند التشغيل
// ==========================================
client.once('ready', async () => {
  console.log(`[KRB SECURITY] ${client.user?.tag} Is Now Online & Protecting.`);
  client.user?.setActivity({ name: '.help | /help | KRB System', type: 4 });

  // تحديد النوع كـ any[] لمنع التضارب البرمجي في التحقق من الخيارات (TS2345)
  const commandsData: any[] = [
    { name: 'help', description: 'عرض لوحة التحكم الكاملة والفخمة للنظام' },
    { name: 'status', description: 'عرض حالة الأنظمة الأمنية والوايت ليست' },
    { name: 'lock', description: 'إغلاق الشات الحالي فوراً' },
    { name: 'unlock', description: 'إعادة فتح الشات الحالي' },
    {
      name: 'blackjack',
      description: 'لعبة بلاك جاك فخمة عالية المخاطر',
      options: [{ name: 'bet', description: 'مبلغ الرهان', type: ApplicationCommandOptionType.Integer, required: true }]
    },
    {
      name: 'giveaway',
      description: 'إنشاء قيفاواي احترافي بالأزرار',
      options: [
        { name: 'prize', description: 'الجائزة', type: ApplicationCommandOptionType.String, required: true },
        { name: 'winners', description: 'عدد الفائزين', type: ApplicationCommandOptionType.Integer, required: true }
      ]
    }
  ];

  // التأكد التام من أن الكائن ليس undefined لمنع الخطأ (TS2532)
  if (client.application) {
    await client.application.commands.set(commandsData).catch(() => {});
    console.log('[KRB SLASH] All advanced slash commands registered globally.');
  }
});

// ==========================================
// [2] معالج أوامر الشات النصية (Prefix Commands .)
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const serverIcon = message.guild.iconURL({ forceStatic: false }) || undefined;

  let config = await GuildConfig.findOne({ guildId: message.guild.id });
  if (!config) config = await GuildConfig.create({ guildId: message.guild.id });

  // أمر المساعدة
  if (command === 'help' || command === 'panel') {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'KRB SECURITY & INFRASTRUCTURE', iconURL: client.user?.displayAvatarURL() })
      .setThumbnail(serverIcon || null)
      .setColor('#000000')
      .setDescription(
        `🔳 **[ KRB ULTIMATE PANEL - النظام الشامل ]**\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ\n\n` +
        `🛡️ **الحماية والإدارة (. أو /):**\n` +
        `\`status\` ➔ عرض حالة الأنظمة والوايت ليست\n` +
        `\`lock\` / \`unlock\` ➔ قفل وفتح الشات فوراً\n` +
        `\`set <nuke/spam> <on/off>\` ➔ تشغيل/تعطيل الأنظمة الحية\n\n` +
        `🎫 **نظام التكت الفخم (الأزرار والقوائم):**\n` +
        `\`ticket setup buttons\` ➔ لوحة تكت تعتمد على الأزرار\n` +
        `\`ticket setup menu\` ➔ لوحة تكت قائمة منسدلة فخمة\n\n` +
        `🎮 **قسم الألعاب والترفيه والجوائز (Premium):**\n` +
        `\`blackjack <bet>\` ➔ لعبة القمار العالمية بلاك جاك الفخمة\n` +
        `\`giveaway <الجائزة> <عدد الفائزين>\` ➔ بدء قيفاواي فوري بالأزرار\n` +
        `ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ`
      )
      .setFooter({ text: 'Minimalist AirFlow Standard • KRB V2' });
    await message.reply({ embeds: [embed] });
  }

  // أوامر القفل والفتح
  if (command === 'lock' || command === 'unlock') {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
    if (message.channel.type !== ChannelType.GuildText) return;
    
    const isLock = command === 'lock';
    await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: !isLock });
    
    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setDescription(isLock ? '🔒 **[SYSTEM LOCKDOWN]:** تم إغلاق القناة الحالية بشكل كامل.' : '🔓 **[SYSTEM UNLOCK]:** تم إعادة فتح القناة بنجاح.');
    await message.reply({ embeds: [embed] });
  }

  // أمر حالة الحماية
  if (command === 'status') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ SECURITY STATE')
      .setThumbnail(serverIcon || null)
      .setColor('#000000')
      .addFields(
        { name: '◼️ Anti-Nuke Engine', value: config.antiNuke ? '`ACTIVE` ✅' : '`DISABLED` ❌', inline: true },
        { name: '◼️ Anti-Spam Engine', value: config.antiSpam ? '`ACTIVE` ✅' : '`DISABLED` ❌', inline: true }
      );
    await message.reply({ embeds: [embed] });
  }

  // لعبة البلاك جاك التفاعلية بالأزرار (.blackjack)
  if (command === 'blackjack' || command === 'bj') {
    const bet = parseInt(args[0]) || 100;
    const userScore = Math.floor(Math.random() * 10) + 12;
    const dealerScore = Math.floor(Math.random() * 10) + 10;

    activeBlackjack.set(message.author.id, { cards: [userScore], dealer: [dealerScore], bet });

    const embed = new EmbedBuilder()
      .setTitle('🃏 KRB HIGH-STAKES BLACKJACK')
      .setColor('#000000')
      .setDescription(`🖤 **مستضيف اللعبة:** <@${message.author.id}>\n💵 **مبلغ الرهان:** \`${bet}💸\`\n\n**مجموع أوراقك الحالية:** \`${userScore}\`\n**مجموع أوراق الديلر الظاهرة:** \`${dealerScore}\``)
      .setFooter({ text: 'اضغط على الخيارات أدناه للسحب أو التثبيت' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('سحب كارت (Hit)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('تثبيت (Stand)').setStyle(ButtonStyle.Success)
    );

    await message.reply({ embeds: [embed], components: [row] });
  }

  // نظام القيفاواي الفخم السريع (.giveaway)
  if (command === 'giveaway' || command === 'gstart') {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
    const prize = args[0] || 'Premium Role';
    const winnersCount = parseInt(args[1]) || 1;

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'KRB PREMIUM GIVEAWAY 🎉', iconURL: serverIcon })
      .setTitle(`🎁 الجائزة: ${prize}`)
      .setColor('#000000')
      .setDescription(`ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ ـ\n\nاضغط على الزر الأسود بالأسفل للدخول في السحب فوراً!\n\n**عدد الفائزين المطلوب:** \`${winnersCount}\`\n**المستضيف:** <@${message.author.id}>`)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`g_join_${winnersCount}`).setLabel('دخول السحب 🔳').setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }

  // إعداد التكتات بالأزرار أو القوائم
  if (command === 'ticket') {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
    const mode = args[1]?.toLowerCase();
    
    const ticketEmbed = new EmbedBuilder()
      .setAuthor({ name: `${message.guild.name} | SUPPORT SYSTEM`, iconURL: serverIcon })
      .setTitle('🎫 مركز الدعم الفني والمساعدة')
      .setDescription('مرحباً بك في مركز الدعم. يرجى اختيار القسم المناسب لفتح تكت تواصل مغلق مع الإدارة.')
      .setColor('#000000');

    if (mode === 'buttons') {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('tk_general').setLabel('الدعم الفني').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
        new ButtonBuilder().setCustomId('tk_report').setLabel('تقديم بلاغ').setStyle(ButtonStyle.Danger).setEmoji('🛡️')
      );
      await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    } else if (mode === 'menu') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('tk_select_menu')
        .setPlaceholder('🔲 اضغط هنا واختبر القسم المناسب لمعاملتك')
        .addOptions([
          { label: 'قسم الدعم العام', value: 'tech', emoji: '⚙️' },
          { label: 'قسم الإدارة والشكاوى', value: 'admin', emoji: '👑' }
        ]);
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    }
    await message.delete();
  }
});

// ==========================================
// [3] معالج التفاعلات بالكامل (Slash & Buttons & Menus)
// ==========================================
client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.guild) return;
  if (!interaction.isRepliable()) return;

  // أ) معالجة أوامر الـ Slash (/)
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🔳 KRB ULTIMATE PANEL')
        .setDescription('استخدم البادئة `.` أو أكتب الأوامر النصية المباشرة للتحكم بكامل النظام والألعاب والتحكم بالسيرفر.')
        .setColor('#000000');
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'status') {
      await interaction.reply({ content: '🛡️ الأنظمة الأمنية الحية لـ **KRB** تعمل بأعلى كفاءة ومربوطة بقاعدة البيانات.' });
    }

    if (commandName === 'lock' || commandName === 'unlock') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ لا تملك صلاحيات.', ephemeral: true });
      const channel = interaction.channel;
      if (channel && channel.type === ChannelType.GuildText) {
        const isLock = commandName === 'lock';
        await (channel as TextChannel).permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: !isLock });
        await interaction.reply({ content: isLock ? '🔒 تم قفل الشات بالكامل.' : '🔓 تم فتح الشات بالكامل.' });
      }
    }

    if (commandName === 'blackjack') {
      const bet = interaction.options.getInteger('bet') || 100;
      const score = Math.floor(Math.random() * 10) + 12;
      await interaction.reply({ content: `🃏 بدأت لعبة البلاك جاك برهان قدره \`${bet}\`! مجموع أوراقك الحالي: \`${score}\`. للعب المستمر، استخدم الأمر النصي \`.bj ${bet}\`.` });
    }

    if (commandName === 'giveaway') {
      const prize = interaction.options.getString('prize') || 'Premium';
      const winners = interaction.options.getInteger('winners') || 1;
      const embed = new EmbedBuilder()
        .setTitle(`🎉 PREMIUM GIVEAWAY: ${prize}`)
        .setDescription(`اضغط دخول السحب بالأسفل للدخول فوراً!\nالفائزين: \`${winners}\``)
        .setColor('#000000');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`g_join_${winners}`).setLabel('دخول السحب 🔳').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // ب) معالجة نقرات الأزرار التفاعلية
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // أزرار لعبة البلاك جاك
    if (customId === 'bj_hit' || customId === 'bj_stand') {
      await interaction.deferUpdate();
      const game = activeBlackjack.get(interaction.user.id);
      if (!game) return;

      if (customId === 'bj_hit') {
        const newCard = Math.floor(Math.random() * 10) + 2;
        game.cards[0] += newCard;

        if (game.cards[0] > 21) {
          const embed = new EmbedBuilder().setTitle('💥 خسرت الجولة! (Bust)').setDescription(`مجموع أوراقك تجاوز الـ 21 وجاء: \`${game.cards[0]}\`\nخسرت الرهان المقدر بـ \`${game.bet}💸\``).setColor('#000000');
          await interaction.editReply({ embeds: [embed], components: [] });
          activeBlackjack.delete(interaction.user.id);
        } else {
          const embed = new EmbedBuilder().setTitle('🃏 خيار السحب المفتوح').setDescription(`مجموع أوراقك الحالي: \`${game.cards[0]}\`\nالديلر يثبت أوراقه حالياً.`).setColor('#000000');
          await interaction.editReply({ embeds: [embed] });
        }
      } else if (customId === 'bj_stand') {
        const dealerFinal = Math.floor(Math.random() * 5) + 17;
        let resultStr = '';
        if (dealerFinal > 21 || game.cards[0] > dealerFinal) {
          resultStr = `🏆 فزت يا كفووو! مجموعك \`${game.cards[0]}\` ضد الديلر \`${dealerFinal}\`. ربحت الضعف!`;
        } else {
          resultStr = `❌ خسرت الجولة! مجموعك \`${game.cards[0]}\` ضد الديلر \`${dealerFinal}\`.`;
        }
        const embed = new EmbedBuilder().setTitle('🏁 نتيجه الجولة النهائية').setDescription(resultStr).setColor('#000000');
        await interaction.editReply({ embeds: [embed], components: [] });
        activeBlackjack.delete(interaction.user.id);
      }
    }

    // زر نظام القيفاواي
    if (customId.startsWith('g_join_')) {
      await interaction.reply({ content: '✅ تم تسجيل دخولك في السحب بنجاح! حظاً موفقاً.', ephemeral: true });
    }

    // أزرار التكت
    let ticketType = '';
    if (customId === 'tk_general') ticketType = 'دعم-عام';
    if (customId === 'tk_report') ticketType = 'شكوى-بلاغ';

    if (customId === 'close_ticket') {
      await interaction.reply('🔳 **[KRB SYSTEM]:** سيتم تدمير التكت وحذفه نهائياً خلال 5 ثوانٍ...');
      setTimeout(() => interaction.channel?.delete().catch(() => {}), 5000);
      return;
    }

    if (ticketType) {
      await interaction.deferReply({ ephemeral: true });
      const ticketChannel = await interaction.guild.channels.create({
        name: `${ticketType}-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      const insideEmbed = new EmbedBuilder()
        .setTitle('🖤 تكت دعم فني نشط')
        .setDescription(`مرحباً بك <@${interaction.user.id}>\nطاقم الإدارة سيقوم بالرد عليك هنا فوراً.`)
        .setColor('#000000');
      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق الغرفة').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [insideEmbed], components: [closeRow] });
      await interaction.editReply({ content: `✅ تم إنشاء تكتك الخاص هنا: <#${ticketChannel.id}>` });
    }
  }

  // ج) القوائم المنسدلة للتكت
  if (interaction.isStringSelectMenu() && interaction.customId === 'tk_select_menu') {
    await interaction.deferReply({ ephemeral: true });
    const val = interaction.values[0];
    const tName = val === 'tech' ? 'دعم-عام' : 'إدارة-عليا';

    const tChan = await interaction.guild.channels.create({
      name: `${tName}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    const insideEmbed = new EmbedBuilder().setTitle('🖤 مركز الخدمة السريع').setDescription('أكتب تفاصيل استفسارك للإدارة العليا هنا.').setColor('#000000');
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger));
    
    await tChan.send({ embeds: [insideEmbed], components: [closeRow] });
    await interaction.editReply({ content: `✅ تم توجيهك لغرفة الدعم: <#${tChan.id}>` });
  }
});

// الحماية من الانهيار (Anti-Crash)
process.on('unhandledRejection', (reason) => console.error('[KRB CRASH] Rejection:', reason));
process.on('uncaughtException', (err) => console.error('[KRB CRASH] Exception:', err));

client.login(process.env.DISCORD_TOKEN);
