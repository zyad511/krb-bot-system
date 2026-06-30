import express from 'express';
import { 
    Client, 
    GatewayIntentBits, 
    TextChannel, 
    PermissionsBitField, 
    AuditLogEvent, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ChannelType,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قوالب الذاكرة للنظام الأمني
const blacklistedUsers = new Set<string>(); 
const blacklistedGuilds = new Set<string>();
const whitelistedBots = new Set<string>();

interface IsolatedBot {
    id: string;
    tag: string;
    avatar: string;
    invitedBy: string;
    guildId: string;
    guildName: string;
}
const isolatedBots = new Map<string, IsolatedBot>();

interface TicketSession {
    step: number;
    category: string;
    image?: string;
    title?: string;
    desc?: string;
}
// ذاكرة مؤقتة لجمع بيانات إعداد التكت خطوة بخطوة
const ticketSetupSession = new Map<string, TicketSession>();

// 🔒 إعدادات الحماية الصارمة الخاصة بـ KRB
const DEVELOPER_ID = '1065985362658345040'; 
const WEB_USERNAME = 'KRB1';               
const WEB_PASSWORD = 'KRB511511';           
const PREFIX = '.';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

client.on('ready', () => {
    console.log(`=================================`);
    console.log(`🟢 KRB GLOBAL SYSTEM IS READY: ${client.user?.tag}`);
    console.log(`=================================`);
});

// ==========================================
// 🛡️ رادار رصد وعزل البوتات التلقائي
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (!member.user.bot) return;

    if (!whitelistedBots.has(member.user.id)) {
        try {
            if (member.manageable) {
                await member.roles.set([]).catch(() => {});
            }
            await member.timeout(2419200000, 'KRB Security: Unapproved bot isolated.').catch(() => {});

            let inviterTag = "غير معروف";
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.BotAdd,
                });
                const logEntry = fetchedLogs.entries.first();
                if (logEntry && logEntry.target?.id === member.id && logEntry.executor) {
                    inviterTag = `${logEntry.executor.tag} (\`${logEntry.executor.id}\`)`;
                }
            } catch (auditError) {
                console.log("تعذر قراءة سجل الـ Audit Log.");
            }

            isolatedBots.set(member.id, {
                id: member.id,
                tag: member.user.tag,
                avatar: member.user.displayAvatarURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
                invitedBy: inviterTag,
                guildId: member.guild.id,
                guildName: member.guild.name
            });

            const sysChannel = member.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(member.guild.members.me!).has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
            if (sysChannel) {
                sysChannel.send(`🚨 **[KRB SECURITY]:** تم رصد وعزل بوت غير مصرح به (\`${member.user.tag}\`). تم إرسال الطلب للموقع للموافقة.`);
            }
        } catch (err) {
            console.error('فشل في عزل البوت:', err);
        }
    }
});

// ==========================================
// ⚔️ نظام الأوامر المحمي والمخصص
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // جدار حماية البلاك ليست
    if (blacklistedUsers.has(message.author.id) || blacklistedGuilds.has(message.guild.id)) {
        if (message.content.startsWith(PREFIX)) {
            await message.reply(`❌ **تواصل مع المطور عليك بلاك ليست**\n⚠️ للحصول على تصريح تواصل مع: <@${DEVELOPER_ID}>`).catch(() => {});
        }
        return;
    }

    // نظام جمع معلومات الـ Embed خطوة بخطوة للتذاكر
    if (ticketSetupSession.has(message.author.id)) {
        const session = ticketSetupSession.get(message.author.id)!;
        
        // الخطوة 1: استقبال رابط الصورة
        if (session.step === 1) {
            session.image = message.content;
            session.step = 2;
            await message.reply('📝 الحين أرسل **عنوان الـ Embed** الذي تريده أن يظهر للتذكرة:');
            return;
        }
        // الخطوة 2: استقبال العنوان
        if (session.step === 2) {
            session.title = message.content;
            session.step = 3;
            await message.reply('🖊️ خطوة أخيرة، أرسل **الوصف أو الكلام المكتوب** داخل التذكرة:');
            return;
        }
        // الخطوة 3: التنفيذ وصنع التذكرة بناءً على كلامه وصورته
        if (session.step === 3) {
            session.desc = message.content;
            ticketSetupSession.delete(message.author.id); // إنهاء الجلسة

            await message.reply('⏳ جاري إنشاء وتجهيز الغرفة الفخمة بالـ Embed الخاص بك...');

            const channelName = `${session.category}-${message.author.username}`;
            try {
                const ticketChannel = await message.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: message.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                        { id: client.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                    ]
                });

                if (ticketChannel) {
                    const customEmbed = new EmbedBuilder()
                        .setTitle(session.title || 'تذكرة جديدة')
                        .setDescription(`${session.desc || ''}\n\n صاحب التذكرة: <@${message.author.id}>`)
                        .setColor('#000000');

                    // حماية وتجنب الـ undefined لتخطي أخطاء الـ TypeScript الصارمة
                    if (session.image && session.image.startsWith('http')) {
                        customEmbed.setImage(session.image);
                    }

                    const closeBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId('close_krb_ticket').setLabel('إغلاق التذكرة 🔒').setStyle(ButtonStyle.Danger)
                    );

                    await ticketChannel.send({ embeds: [customEmbed], components: [closeBtn] });
                }
            } catch (err) {
                await message.reply('❌ فشل إنشاء التذكرة، يرجى التأكد من صلاحيات البوت.');
            }
            return;
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // أمر المساعدة العام للجميع
    if (command === 'help') {
        const isOwner = message.author.id === DEVELOPER_ID;
        const helpEmbed = new EmbedBuilder()
            .setTitle('🔳 **لوحة أوامر نظام KRB العالمي**')
            .setDescription(isOwner ? 'مرحباً يا أبو عتب، الأوامر متاحة لك بالكامل:' : 'مرحباً بك في نظام المساعدة العام لـ KRB:')
            .setColor('#000000');

        if (isOwner) {
            helpEmbed.addFields(
                { name: '🛡️ الحماية والإدارة الحصرية', value: '`.security` - حالة النظام الأمني الحالي\n`.lock` - قفل الشات\n`.unlock` - فتح الشات\n`.clear [العدد]` - تنظيف الشات بسرعة' },
                { name: '⚙️ الرقابة والعقوبات', value: '`.ban [@عضو]` - حظر\n`.kick [@عضو]` - طرد\n`.mute [@عضو]` - كتم\n`.unmute [@عضو]` - فك الكتم' },
                { name: '🎫 نظام التذاكر', value: '`.ticket-setup` - نشر لوحة فتح التذاكر' }
            );
        } else {
            helpEmbed.addFields(
                { name: 'ℹ️ المساعدة العامة', value: 'أنت لا تملك صلاحيات المطور لرؤية أدوات التحكم الخاصة بـ KRB Security. تواصل مع الإدارة لأي استفسار.' }
            );
        }
        return message.channel.send({ embeds: [helpEmbed] });
    }

    // 🔒 جدار التحقق الفوري لجميع الأوامر التالية (المطور فقط)
    if (message.author.id !== DEVELOPER_ID) {
        return message.reply('❌ **منت صاحب البوت!** هذا الأمر مخصص للإدارة العليا فقط.').catch(() => {});
    }

    // أمر نشر لوحة التذاكر المنسدلة
    if (command === 'ticket-setup') {
        const setupEmbed = new EmbedBuilder()
            .setTitle('KRB TICKET 🎟️')
            .setDescription('اضغط على القائمة المنسدلة بالأسفل وافتح تذكرتك المخصصة بالـ Embed التفاعلي فوراً.')
            .setColor('#000000');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('krb_ticket_select')
            .setPlaceholder('إضغط لفتح التذكرة')
            .addOptions([
                { label: 'ل الدعم', value: 'tk_support', description: 'تذكرة الدعم الفني بالـ Embed المخصص', emoji: '⚙️' },
                { label: 'ل الهاكات', value: 'tk_exploits', description: 'تذكرة قسم الهاكات بالـ Embed المخصص', emoji: '💻' },
                { label: 'ل الشراء', value: 'tk_buy', description: 'تذكرة الشراء والاشتراكات بالـ Embed المخصص', emoji: '💰' },
                { label: 'Refresh', value: 'tk_refresh', description: 'تحديث حالة نظام التذاكر', emoji: '🔄' }
            ]);

        const rowMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
        await message.channel.send({ embeds: [setupEmbed], components: [rowMenu] });
        await message.delete().catch(() => {});
    }

    if (command === 'security') {
        const secEmbed = new EmbedBuilder()
            .setTitle('🛡️ تقرير حالة KRB SECURITY')
            .setDescription(`● **جدار الحماية الموحد:** نشط ونظيف 🟢\n● **عدد البوتات المعزولة حالياً:** \`${isolatedBots.size}\`\n● **المستخدمين في البلاك ليست:** \`${blacklistedUsers.size}\``)
            .setColor('#000000');
        await message.channel.send({ embeds: [secEmbed] });
    }

    if (command === 'lock') {
        await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        await message.channel.send('🔒 **تم إغلاق القناء النصية بنجاح بأمر من صاحب البوت.**');
    }

    if (command === 'unlock') {
        await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        await message.channel.send('🔓 **تم إعادة فتح القناة النصية للجميع.**');
    }

    if (command === 'clear') {
        const amount = parseInt(args[0]) || 50;
        await (message.channel as TextChannel).bulkDelete(amount, true);
        const replyMsg = await message.channel.send(`🧹 تم تنظيف \`${amount}\` رسالة بنجاح.`);
        setTimeout(() => replyMsg.delete().catch(() => {}), 3000);
    }

    if (command === 'ban') {
        const target = message.mentions.members?.first(); 
        if (!target || !target.bannable) return message.reply('❌ تعذّر العثور على العضو أو لا يمكن حظره.');
        await target.ban({ reason: 'KRB Admin Command Action.' });
        await message.channel.send(`✅ تم حظر العضو \`${target.user.tag}\` بنجاح.`);
    }

    if (command === 'kick') {
        const target = message.mentions.members?.first();
        if (!target || !target.kickable) return message.reply('❌ تعذّر العثور على العضو أو لا يمكن طرده.');
        await target.kick('KRB Admin Command Action.');
        await message.channel.send(`✅ تم طرد العضو \`${target.user.tag}\` بنجاح.`);
    }

    if (command === 'mute') {
        const target = message.mentions.members?.first();
        if (!target || !target.manageable) return message.reply('❌ تعذّر كتم العضو.');
        await target.timeout(3600000, 'Muted via KRB Command.'); 
        await message.channel.send(`🤐 تم كتم العضو \`${target.user.tag}\` لمدة ساعة كاملة.`);
    }

    if (command === 'unmute') {
        const target = message.mentions.members?.first();
        if (!target) return message.reply('❌ اذكر العضو لإلغاء الكتم.');
        await target.timeout(null).catch(() => {});
        await message.channel.send(`🔊 تم فك الكتم والعزل عن \`${target.user.tag}\`.`);
    }
});

// ==========================================
// 💡 معالجة تفاعلات القائمة المنسدلة للتذاكر والـ Embed المخصص
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (blacklistedUsers.has(interaction.user.id) || (interaction.guildId && blacklistedGuilds.has(interaction.guildId))) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'krb_ticket_select') {
        const selectedValue = interaction.values[0];

        if (selectedValue === 'tk_refresh') {
            await interaction.reply({ content: '🔄 تم تحديث حالة الاتصال بالخادم ونظام الاستجابة بنجاح!', ephemeral: true });
            return;
        }

        let categoryName = 'دعم';
        if (selectedValue === 'tk_exploits') categoryName = 'هاكات';
        if (selectedValue === 'tk_buy') categoryName = 'شراء';

        // بدء جلسة تجميع بيانات الـ Embed التفاعلي للعضو بشكل سري وخاص به
        ticketSetupSession.set(interaction.user.id, {
            step: 1,
            category: categoryName
        });

        await interaction.reply({ 
            content: `🖼️ **أهلاً بك في معالج إنشاء تذكرتك المخصصة لقسم [${categoryName.toUpperCase()}]**\n\nيرجى إرسال **رابط الصورة (URL)** التي تريد وضعها داخل الـ Embed (أو اكتب 'لا يوجد' لتخطي الصورة):`, 
            ephemeral: true 
        });
    }

    if (interaction.isButton() && interaction.customId === 'close_krb_ticket') {
        await interaction.reply({ content: '🔳 جاري أرشفة وتدمير الغرفة النصية خلال لحظات...' });
        setTimeout(() => interaction.channel?.delete().catch(() => {}), 2000);
    }
});

// ==========================================
// 🌐 واجهة الموقع المحمية المحدثة بالكامل بالاسم والباسورد
// ==========================================
app.get('/', (req, res) => {
    const username = req.query.username;
    const password = req.query.password;

    // جدار الحماية الجديد: التحقق من اسم المستخدم وكلمة المرور معاً
    if (username !== WEB_USERNAME || password !== WEB_PASSWORD) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>KRB SECURITY - AUTHENTICATION</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body { background: #000; color: #fff; font-family: 'Cairo', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin:0; }
                .login-box { background: #09090b; padding: 30px; border-radius: 8px; border: 1px solid #27272a; text-align: center; width: 90%; max-width: 400px; }
                h2 { font-size: 18px; margin-bottom: 25px; font-weight: 700; color: #fff; }
                .input-group { text-align: right; margin-bottom: 15px; }
                label { display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 5px; font-weight: 600; }
                input { width: 100%; padding: 12px; background: #18181b; border: 1px solid #27272a; color: #fff; border-radius: 6px; font-size: 14px; box-sizing: border-box; transition: 0.2s; }
                input:focus { border-color: #fff; outline: none; }
                button { width: 100%; padding: 12px; background: #fff; color: #000; font-weight:700; border: none; border-radius:6px; cursor: pointer; font-size: 14px; margin-top: 10px; }
                button:hover { background: #e4e4e7; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>🔒 جدار حماية لوحة تحكم KRB</h2>
                <form method="GET" action="/">
                    <div class="input-group">
                        <label>اسم المستخدم</label>
                        <input type="text" name="username" placeholder="أدخل اسم المستخدم المعين..." required>
                    </div>
                    <div class="input-group">
                        <label>كلمة المرور السرية</label>
                        <input type="password" name="password" placeholder="أدخل الرقم السري المعين..." required>
                    </div>
                    <button type="submit">تسجيل الدخول والتحقق الأمني</button>
                </form>
            </div>
        </body>
        </html>
        `);
    }

    // إذا كانت البيانات صحيحة 100%، يتم فتح لوحة التحكم
    let quarantineCards = '';
    isolatedBots.forEach((bot) => {
        quarantineCards += `
        <div class="card quarantine-card">
            <img class="bot-avatar" src="${bot.avatar}">
            <div class="bot-details">
                <h3>${bot.tag}</h3>
                <p><strong>السيرفر:</strong> ${bot.guildName}</p>
                <p><strong>الداعي الفعلي:</strong> ${bot.invitedBy}</p>
            </div>
            <div class="card-actions">
                <form action="/api/approve-bot?username=${WEB_USERNAME}&password=${WEB_PASSWORD}" method="POST" style="width:100%;">
                    <input type="hidden" name="botId" value="${bot.id}">
                    <input type="hidden" name="guildId" value="${bot.guildId}">
                    <button type="submit" class="btn btn-approve">توثيق وموافقة كـ KRB ✅</button>
                </form>
            </div>
        </div>
        `;
    });

    if (!quarantineCards) {
        quarantineCards = `<p style="color:#a1a1aa; text-align:center; padding: 20px; font-size:14px;">🛡️ المعتقل نظيف. لا توجد قضايا اختراق حالياً.</p>`;
    }

    const serversTable = client.guilds.cache.map(g => `
        <tr>
            <td>${g.name}</td>
            <td><span class="code-style">${g.id}</span></td>
            <td>${g.memberCount} عضو</td>
            <td><span style="color: ${blacklistedGuilds.has(g.id) ? '#ef4444' : '#22c55e'}">${blacklistedGuilds.has(g.id) ? '⛔ محظور' : '🟢 محمي'}</span></td>
        </tr>
    `).join('');

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KRB ULTIMATE PANEL</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg-main: #000000; --bg-card: #09090b; --border-color: #27272a; --text-primary: #ffffff; --text-secondary: #a1a1aa; --accent-red: #ef4444; --accent-green: #22c55e; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
            body { background-color: var(--bg-main); color: var(--text-primary); padding: 15px; max-width: 1200px; margin: 0 auto; }
            header { border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
            .section-title { font-size: 15px; font-weight: 700; margin: 25px 0 15px 0; border-right: 4px solid #fff; padding-right: 10px; }
            .grid { display: grid; grid-template-columns: 1fr; gap: 15px; }
            @media (min-width: 768px) { .grid { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); } }
            .card { background-color: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: 8px; }
            .quarantine-card { display: flex; align-items: center; gap: 15px; background: var(--bg-card); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid var(--accent-red); }
            .bot-avatar { width: 50px; height: 50px; border-radius: 50%; }
            .bot-details { flex: 1; }
            label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
            input, textarea, select { width: 100%; background: #18181b; border: 1px solid var(--border-color); color: #fff; padding: 12px; border-radius: 6px; margin-bottom: 12px; }
            .btn { width: 100%; background: #fff; color: #000; border: none; padding: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; }
            .btn-danger { background: transparent; border: 1px solid var(--accent-red); color: var(--accent-red); }
            table { width: 100%; border-collapse: collapse; text-align: right; }
            th, td { padding: 12px; border-bottom: 1px solid var(--border-color); font-size: 13px; }
            .code-style { background: #18181b; padding: 3px 6px; border-radius: 4px; font-family: monospace; }
        </style>
    </head>
    <body>
        <header>
            <h2>KRB CONTROL INFRASTRUCTURE</h2>
            <span style="color:var(--accent-green)">🔒 مصرح ومحمي بالكامل</span>
        </header>

        <h3 class="section-title">🤖 رادار طلبات توثيق وفك عزل البوتات</h3>
        <div>${quarantineCards}</div>

        <h3 class="section-title">⚙️ أدوات النطاق والتحكم عن بعد</h3>
        <div class="grid">
            <div class="card">
                <form action="/api/send-custom?username=${WEB_USERNAME}&password=${WEB_PASSWORD}" method="POST">
                    <label>معرف السيرفر المستهدف (Guild ID) *</label>
                    <input type="text" name="guildId" required>
                    <label>نص الرسالة</label>
                    <textarea name="message" rows="3" required></textarea>
                    <button type="submit" class="btn">إطلق الإرسال الفوري 🚀</button>
                </form>
            </div>

            <div class="card">
                <form action="/api/blacklist?username=${WEB_USERNAME}&password=${WEB_PASSWORD}" method="POST">
                    <label>نوع الحظر</label>
                    <select name="type">
                        <option value="user">حظر مستخدم (User ID)</option>
                        <option value="guild">حظر سيرفر كامل (Server ID)</option>
                    </select>
                    <label>المعرف الفريد (ID) *</label>
                    <input type="text" name="targetId" required>
                    <label>الإجراء</label>
                    <select name="action">
                        <option value="add">إدراج في البلاك ليست</option>
                        <option value="remove">إزالة من البلاك ليست</option>
                    </select>
                    <button type="submit" class="btn btn-danger">تحديث الحظر الأمني 🛡️</button>
                </form>
            </div>
        </div>

        <h3 class="section-title">📦 خريطة السيرفرات المتصلة بالشبكة</h3>
        <div class="card" style="overflow-x:auto;">
            <table>
                <thead>
                    <tr><th>اسم السيرفر</th><th>ID</th><th>الأعضاء</th><th>الحالة</th></tr>
                </thead>
                <tbody>${serversTable}</tbody>
            </table>
        </div>
    </body>
    </html>
    `);
});

// ==========================================
// 🚀 حماية الـ APIs ببيانات الاعتماد الكاملة لضمان عدم الاختراق من الخلفية
// ==========================================
app.post('/api/approve-bot', async (req, res) => {
    if (req.query.username !== WEB_USERNAME || req.query.password !== WEB_PASSWORD) return res.status(403).send('غير مصرح لك.');
    const { botId, guildId } = req.body;
    try {
        whitelistedBots.add(botId);
        isolatedBots.delete(botId);
        const guild = await client.guilds.fetch(guildId);
        const targetBotMember = await guild.members.fetch(botId).catch(() => null);
        if (targetBotMember) {
            await targetBotMember.timeout(null).catch(() => {});
            const sysChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel;
            if (sysChannel) sysChannel.send(`✅ **[KRB SECURITY]:** تم توثيق البوت وفك العزل عنه.`);
        }
        res.send(`<script>alert("✅ تم توثيق البوت!"); window.location.href="/?username=${WEB_USERNAME}&password=${WEB_PASSWORD}";</script>`);
    } catch (error: any) { res.status(500).send(error.message); }
});

app.post('/api/send-custom', async (req, res) => {
    if (req.query.username !== WEB_USERNAME || req.query.password !== WEB_PASSWORD) return res.status(403).send('غير مصرح لك.');
    const { guildId, message } = req.body;
    try {
        const guild = await client.guilds.fetch(guildId);
        const targetChannel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
        if (!targetChannel) return res.status(400).send('قناة غير صالحة.');
        await targetChannel.send(message);
        res.send(`<script>alert("🚀 تم الإرسال!"); window.location.href="/?username=${WEB_USERNAME}&password=${WEB_PASSWORD}";</script>`);
    } catch (error: any) { res.status(500).send(error.message); }
});

app.post('/api/blacklist', (req, res) => {
    if (req.query.username !== WEB_USERNAME || req.query.password !== WEB_PASSWORD) return res.status(403).send('غير مصرح لك.');
    const { type, targetId, action } = req.body;
    if (action === 'add') {
        if (type === 'user') blacklistedUsers.add(targetId);
        if (type === 'guild') blacklistedGuilds.add(targetId);
    } else {
        if (type === 'user') blacklistedUsers.delete(targetId);
        if (type === 'guild') blacklistedGuilds.delete(targetId);
    }
    res.send(`<script>alert("🔒 تم تحديث البلاك ليست!"); window.location.href="/?username=${WEB_USERNAME}&password=${WEB_PASSWORD}";</script>`);
});

app.listen(PORT, () => {
    if (process.env.DISCORD_TOKEN) {
        client.login(process.env.DISCORD_TOKEN);
    } else {
        console.error('❌ DISCORD_TOKEN مفقود في إعدادات البيئة!');
    }
});
