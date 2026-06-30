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
const ticketSetupSession = new Map<string, TicketSession>();

// 🔒 إعدادات الهوية والأمان لـ KRB
const DEVELOPER_ID = '1065985362658345040'; // حساب أبو عتب المطور الرئيسي
const PREFIX = '.';

// إعدادات الـ OAuth2 من البيئة لسهولة النشر والتحكم
const CLIENT_ID = process.env.CLIENT_ID || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const REDIRECT_URI = process.env.REDIRECT_URI || '';

// ذاكرة الجلسات المؤقتة لتسجيل الدخول بدون مكاتب خارجية معقدة
interface UserSession {
    userId: string;
    username: string;
    avatar: string;
    guilds: any[];
}
const webSessions = new Map<string, UserSession>();

// دالة مساعدة لقراءة الكوكيز يدويًا بأمان
const parseCookies = (rc: string | undefined) => {
    const list: { [key: string]: string } = {};
    if (!rc) return list;
    rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        list[parts.shift()!.trim()] = decodeURI(parts.join('='));
    });
    return list;
};

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

    if (blacklistedUsers.has(message.author.id) || blacklistedGuilds.has(message.guild.id)) {
        if (message.content.startsWith(PREFIX)) {
            await message.reply(`❌ **تواصل مع المطور عليك بلاك ليست**\n⚠️ للحصول على تصريح تواصل مع: <@${DEVELOPER_ID}>`).catch(() => {});
        }
        return;
    }

    if (ticketSetupSession.has(message.author.id)) {
        const session = ticketSetupSession.get(message.author.id)!;
        if (session.step === 1) {
            session.image = message.content;
            session.step = 2;
            await message.reply('📝 الحين أرسل **عنوان الـ Embed** الذي تريده أن يظهر للتذكرة:');
            return;
        }
        if (session.step === 2) {
            session.title = message.content;
            session.step = 3;
            await message.reply('🖊️ خطوة أخيرة، أرسل **الوصف أو الكلام المكتوب** داخل التذكرة:');
            return;
        }
        if (session.step === 3) {
            session.desc = message.content;
            ticketSetupSession.delete(message.author.id);

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

    if (command === 'help') {
        const isOwner = message.author.id === DEVELOPER_ID;
        const helpEmbed = new EmbedBuilder()
            .setTitle('🔳 **لوحة أوامر نظام KRB العالمي**')
            .setDescription(isOwner ? 'مرحباً يا أبو عتب، الأوامر متاحة لك بالكامل:' : 'مرحباً بك في نظام المساعدة العام لـ KRB:')
            .setColor('#000000');

        if (isOwner) {
            helpEmbed.addFields(
                { name: '🛡️ الحماية والإدارة الحصرية', value: '`.security` - حالة النظام الأمني\n`.lock` - قفل الشات\n`.unlock` - فتح الشات\n`.clear [العدد]` - تنظيف الشات' },
                { name: '⚙️ الرقابة والعقوبات', value: '`.ban [@عضو]` - حظر\n`.kick [@عضو]` - طرد\n`.mute [@عضو]` - كتم\n`.unmute [@عضو]` - فك الكتم' },
                { name: '🎫 نظام التذاكر', value: '`.ticket-setup` - نشر لوحة فتح التذاكر' }
            );
        } else {
            helpEmbed.addFields(
                { name: 'ℹ️ المساعدة العامة', value: 'نظام حماية وتذاكر متكامل. تحكم بالسيرفر الخاص بك عبر لوحة التحكم بالموقع.' }
            );
        }
        return message.channel.send({ embeds: [helpEmbed] });
    }

    if (message.author.id !== DEVELOPER_ID) return;

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
            .setDescription(`● **جدار الحماية الموحد:** نشط ونظيف 🟢\n● **عدد البوتات المعزولة حالياً:** \`${isolatedBots.size}\``)
            .setColor('#000000');
        await message.channel.send({ embeds: [secEmbed] });
    }

    if (command === 'lock') {
        await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        await message.channel.send('🔒 **تم إغلاق القناة النصية بنجاح.**');
    }

    if (command === 'unlock') {
        await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        await message.channel.send('🔓 **تم إعادة فتح القناة النصية للجميع.**');
    }

    if (command === 'clear') {
        const amount = parseInt(args[0]) || 50;
        await (message.channel as TextChannel).bulkDelete(amount, true);
        const replyMsg = await message.channel.send(`🧹 تم تنظيف \`${amount}\` رسالة.`);
        setTimeout(() => replyMsg.delete().catch(() => {}), 3000);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (blacklistedUsers.has(interaction.user.id) || (interaction.guildId && blacklistedGuilds.has(interaction.guildId))) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'krb_ticket_select') {
        const selectedValue = interaction.values[0];
        if (selectedValue === 'tk_refresh') {
            await interaction.reply({ content: '🔄 تم تحديث نظام الاستجابة بنجاح!', ephemeral: true });
            return;
        }

        let categoryName = 'دعم';
        if (selectedValue === 'tk_exploits') categoryName = 'هاكات';
        if (selectedValue === 'tk_buy') categoryName = 'شراء';

        ticketSetupSession.set(interaction.user.id, { step: 1, category: categoryName });
        await interaction.reply({ 
            content: `🖼️ **قسم [${categoryName.toUpperCase()}]**\n\nيرجى إرسال **رابط الصورة (URL)** أو اكتب 'لا يوجد' لتخطي الصورة:`, 
            ephemeral: true 
        });
    }

    if (interaction.isButton() && interaction.customId === 'close_krb_ticket') {
        await interaction.reply({ content: '🔳 جاري أرشفة وتدمير الغرفة النصية خلال لحظات...' });
        setTimeout(() => interaction.channel?.delete().catch(() => {}), 2000);
    }
});

// ==========================================
// 🌐 نظام واجهة الـ Dashboard وبوابات الـ OAuth2
// ==========================================

// صفحة تسجيل الدخول / الواجهة الرئيسية
app.get('/', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    const session = sessionId ? webSessions.get(sessionId) : null;

    // 1. إذا كان الزائر غير مسجل الدخول، نعرض صفحة تسجيل الدخول الفخمة (B&W)
    if (!session) {
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
        return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>KRB SECURITY SYSTEM</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body { background: #000; color: #fff; font-family: 'Cairo', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin:0; }
                .login-box { background: #09090b; padding: 40px 30px; border-radius: 8px; border: 1px solid #27272a; text-align: center; width: 90%; max-width: 420px; }
                h1 { font-size: 22px; margin-bottom: 10px; font-weight: 700; letter-spacing: 1px; }
                p { color: #a1a1aa; font-size: 14px; margin-bottom: 30px; }
                .btn-discord { display: block; text-decoration: none; padding: 14px; background: #fff; color: #000; font-weight: 700; border-radius: 6px; font-size: 14px; transition: 0.2s; }
                .btn-discord:hover { background: #e4e4e7; }
                .footer { margin-top: 20px; font-size: 11px; color: #71717a; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h1>🔳 KRB GLOBAL PROTECTION</h1>
                <p>سجل دخولك عبر حساب ديسكورد للوصول إلى مركز إدارة السيرفرات المعتمدة وحمايتها.</p>
                <a href="${discordAuthUrl}" class="btn-discord">تسجيل الدخول عبر ديسكورد ⚡</a>
                <div class="footer">تطوير وإشراف البنية التحتية لـ KRB Security</div>
            </div>
        </body>
        </html>
        `);
    }

    // 2. التحقق من رتبة المستخدم (هل هو المطور الإمبراطور أم مدير سيرفر عادي)
    const isGlobalOwner = session.userId === DEVELOPER_ID;

    // استخراج سيرفرات المستخدم التي يمتلك فيها صلاحية الأدمنستريتور (ADMINISTRATOR = 0x8)
    const adminGuildIds = session.guilds
        .filter((g: any) => (BigInt(g.permissions) & 0x8n) === 0x8n)
        .map((g: any) => g.id);

    // تصفية السيرفرات التي يتواجد فيها البوت من السيرفرات التي يديرها الشخص
    const sharedGuilds = client.guilds.cache.filter(g => isGlobalOwner || adminGuildIds.includes(g.id));

    // بناء كروت البوتات المعزولة المخصصة لهذا الشخص وسيرفراته فقط
    let quarantineCards = '';
    isolatedBots.forEach((bot) => {
        // العضو العادي يشوف بوتات سيرفره فقط، أما الأونر يشوف كل شيء
        if (isGlobalOwner || adminGuildIds.includes(bot.guildId)) {
            quarantineCards += `
            <div class="card quarantine-card">
                <img class="bot-avatar" src="${bot.avatar}">
                <div class="bot-details">
                    <h3>${bot.tag}</h3>
                    <p><strong>السيرفر المستهدف:</strong> ${bot.guildName}</p>
                    <p><strong>الداعي الفعلي:</strong> ${bot.invitedBy}</p>
                </div>
                <div class="card-actions">
                    <form action="/api/approve-bot" method="POST">
                        <input type="hidden" name="botId" value="${bot.id}">
                        <input type="hidden" name="guildId" value="${bot.guildId}">
                        <button type="submit" class="btn btn-approve">توثيق وموافقة كـ KRB ✅</button>
                    </form>
                </div>
            </div>
            `;
        }
    });

    if (!quarantineCards) {
        quarantineCards = `<p style="color:#a1a1aa; text-align:center; padding: 20px; font-size:13px;">🛡️ المعتقل نظيف. لا توجد تهديدات أو محاولات اختراق حالية في نطاقك.</p>`;
    }

    // جدول السيرفرات (يظهر بالكامل للأونر، ويظهر سيرفرات الشخص فقط للأدمن العادي)
    const serversTable = sharedGuilds.map(g => `
        <tr>
            <td>${g.name}</td>
            <td><span class="code-style">${g.id}</span></td>
            <td>${g.memberCount} عضو</td>
            <td><span style="color: ${blacklistedGuilds.has(g.id) ? '#ef4444' : '#22c55e'}">${blacklistedGuilds.has(g.id) ? '⛔ محظور' : '🟢 محمي نشط'}</span></td>
        </tr>
    `).join('');

    // عرض الـ Dashboard المخصص بناءً على مستوى الدخول
    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KRB PANEL - INTERACTIVE INFRASTRUCTURE</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg-main: #000000; --bg-card: #09090b; --border-color: #27272a; --text-primary: #ffffff; --text-secondary: #a1a1aa; --accent-red: #ef4444; --accent-green: #22c55e; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
            body { background-color: var(--bg-main); color: var(--text-primary); padding: 20px; max-width: 1200px; margin: 0 auto; }
            header { border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .user-badge { display: flex; align-items: center; gap: 10px; font-size: 14px; }
            .user-avatar { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-color); }
            .btn-logout { font-size:12px; color: var(--accent-red); text-decoration:none; margin-right: 10px; }
            .section-title { font-size: 15px; font-weight: 700; margin: 30px 0 15px 0; border-right: 4px solid #fff; padding-right: 10px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
            @media (min-width: 768px) { .grid { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); } }
            .card { background-color: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: 8px; }
            .quarantine-card { display: flex; align-items: center; gap: 15px; border-left: 3px solid var(--accent-red); }
            .bot-avatar { width: 48px; height: 48px; border-radius: 50%; }
            .bot-details { flex: 1; font-size: 13px; }
            .bot-details h3 { font-size: 15px; margin-bottom: 4px; }
            .bot-details p { color: var(--text-secondary); }
            label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; font-weight:600; }
            input, textarea, select { width: 100%; background: #18181b; border: 1px solid var(--border-color); color: #fff; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; }
            input:focus, textarea:focus { border-color: #fff; outline:none; }
            .btn { width: 100%; background: #fff; color: #000; border: none; padding: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .btn:hover { background: #e4e4e7; }
            .btn-danger { background: transparent; border: 1px solid var(--accent-red); color: var(--accent-red); }
            .btn-danger:hover { background: var(--accent-red); color: #fff; }
            table { width: 100%; border-collapse: collapse; text-align: right; }
            th, td { padding: 14px; border-bottom: 1px solid var(--border-color); font-size: 13px; }
            th { color: var(--text-secondary); font-weight: 600; }
            .code-style { background: #18181b; padding: 3px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        </style>
    </head>
    <body>
        <header>
            <h2>KRB MANAGEMENT CONSOLE</h2>
            <div class="user-badge">
                <img class="user-avatar" src="${session.avatar}">
                <span>مرحباً، <strong>${session.username}</strong> ${isGlobalOwner ? '(الإدارة العليا 👑)' : '(مدير سيرفر)'}</span>
                <a href="/logout" class="btn-logout">[خروج]</a>
            </div>
        </header>

        <h3 class="section-title">🤖 رادار كشف وعزل البوتات في نطاق صلاحياتك</h3>
        <div class="grid" style="grid-template-columns: 1fr;">
            ${quarantineCards}
        </div>

        ${isGlobalOwner ? `
        <h3 class="section-title">⚙️ أدوات النطاق الشامل والتحكم عن بعد (خاص بأبو عتب)</h3>
        <div class="grid">
            <div class="card">
                <form action="/api/send-custom" method="POST">
                    <label>معرف السيرفر المستهدف (Guild ID) *</label>
                    <input type="text" name="guildId" required>
                    <label>نص الرسالة أو الإعلان الإداري</label>
                    <textarea name="message" rows="3" required placeholder="اكتب رسالة البرودكاست هنا..."></textarea>
                    <button type="submit" class="btn">إطلق الإرسال الفوري 🚀</button>
                </form>
            </div>

            <div class="card">
                <form action="/api/blacklist" method="POST">
                    <label>نوع الحظر الأمني</label>
                    <select name="type">
                        <option value="user">حظر مستخدم (User ID)</option>
                        <option value="guild">حظر سيرفر كامل (Server ID)</option>
                    </select>
                    <label>المعرف الفريد (ID) *</label>
                    <input type="text" name="targetId" required placeholder="أدخل الـ ID المستهدف لقائمتك السوداء...">
                    <label>الإجراء المراد تنفيذه</label>
                    <select name="action">
                        <option value="add">إدراج في البلاك ليست</option>
                        <option value="remove">إزالة وعفو أمني</option>
                    </select>
                    <button type="submit" class="btn btn-danger">تحديث جدار الحظر الشامل 🛡️</button>
                </form>
            </div>
        </div>
        ` : ''}

        <h3 class="section-title">📦 خارطة السيرفرات والشبكات المراقبة</h3>
        <div class="card" style="overflow-x:auto;">
            <table>
                <thead>
                    <tr><th>اسم السيرفر</th><th>ID السيرفر</th><th>تعداد الحضور</th><th>حالة الحماية</th></tr>
                </thead>
                <tbody>
                    ${serversTable || '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary);">لا توجد سيرفرات متصلة بالبورت حالياً.</td></tr>'}
                </tbody>
            </table>
        </div>
    </body>
    </html>
    `);
});

// ==========================================
// 🔗 مسارات تبادل ومعالجة بيانات الـ OAuth2 لمصادقة الديسكورد
// ==========================================
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');

    try {
        // تبادل الكود المسلم وتوليد الـ Access Token من ديسكورد
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code as string,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const tokenData = await tokenResponse.json() as any;
        if (tokenData.error) return res.send(`خطأ في مصادقة ديسكورد: ${tokenData.error_description}`);

        // سحب الملف الشخصي للمستخدم
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userResponse.json() as any;

        // سحب قائمة سيرفرات المستخدم المقترنة بحسابه
        const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const guildsData = await guildsResponse.json() as any;

        // إنشاء وتخزين جلسة عمل آمنة للمستخدم
        const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const userAvatar = userData.avatar 
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        webSessions.set(sessionId, {
            userId: userData.id,
            username: `${userData.username}`,
            avatar: userAvatar,
            guilds: Array.isArray(guildsData) ? guildsData : []
        });

        // زرع الكوكيز في المتصفح والتحويل الفوري للوحة التحكم الرئيسية
        res.cookie('krb_session', sessionId, { httpOnly: true, secure: true, maxAge: 86400000 });
        res.setHeader('Set-Cookie', `krb_session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=8640000`);
        res.redirect('/');
    } catch (error) {
        console.error('خطأ أمني أثناء معالجة تسجيل الدخول:', error);
        res.status(500).send('فشلت المصادقة الأمنية لشبكة KRB.');
    }
});

// خروج وتطهير الكوكيز والجلسة
app.get('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    if (sessionId) webSessions.delete(sessionId);
    res.setHeader('Set-Cookie', 'krb_session=; HttpOnly; Secure; Path=/; Max-Age=0');
    res.redirect('/');
});

// ==========================================
// 🚀 الـ APIs التفاعلية والمحمية بفحص الجلسات
// ==========================================
app.post('/api/approve-bot', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    const session = sessionId ? webSessions.get(sessionId) : null;
    if (!session) return res.status(403).send('غير مصرح لك.');

    const { botId, guildId } = req.body;
    const isGlobalOwner = session.userId === DEVELOPER_ID;
    const userAdminGuildIds = session.guilds.filter((g: any) => (BigInt(g.permissions) & 0x8n) === 0x8n).map((g: any) => g.id);

    // حماية: التأكد أن المستخدم له رتبة أدمن في السيرفر المطلوب أو هو المطور العام
    if (!isGlobalOwner && !userAdminGuildIds.includes(guildId)) {
        return res.status(403).send('لا تمتلك صلاحية إدارة الحماية لهذا السيرفر.');
    }

    try {
        whitelistedBots.add(botId);
        isolatedBots.delete(botId);
        const guild = await client.guilds.fetch(guildId);
        const targetBotMember = await guild.members.fetch(botId).catch(() => null);
        if (targetBotMember) {
            await targetBotMember.timeout(null).catch(() => {});
            const sysChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel;
            if (sysChannel) sysChannel.send(`✅ **[KRB SECURITY]:** تم توثيق وفك العزل عن البوت بموافقة إدارة السيرفر من خلال الموقع.`);
        }
        res.send(`<script>alert("✅ تم توثيق واعتماد البوت بنجاح!"); window.location.href="/";</script>`);
    } catch (error: any) { res.status(500).send(error.message); }
});

app.post('/api/send-custom', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    const session = sessionId ? webSessions.get(sessionId) : null;
    
    // فحص صلاحية الأونر الحصرية لأبو عتب فقط
    if (!session || session.userId !== DEVELOPER_ID) return res.status(403).send('أمر محظور للإدارة العليا لـ KRB فقط.');

    const { guildId, message } = req.body;
    try {
        const guild = await client.guilds.fetch(guildId);
        const targetChannel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
        if (!targetChannel) return res.status(400).send('تعذر العثور على قناة لإرسال الرسالة.');
        await targetChannel.send(message);
        res.send(`<script>alert("🚀 تم إطلاق وإرسال الرسالة بنجاح!"); window.location.href="/";</script>`);
    } catch (error: any) { res.status(500).send(error.message); }
});

app.post('/api/blacklist', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    const session = sessionId ? webSessions.get(sessionId) : null;
    
    if (!session || session.userId !== DEVELOPER_ID) return res.status(403).send('أمر محظور للإدارة العليا لـ KRB فقط.');

    const { type, targetId, action } = req.body;
    if (action === 'add') {
        if (type === 'user') blacklistedUsers.add(targetId);
        if (type === 'guild') blacklistedGuilds.add(targetId);
    } else {
        if (type === 'user') blacklistedUsers.delete(targetId);
        if (type === 'guild') blacklistedGuilds.delete(targetId);
    }
    res.send(`<script>alert("🔒 تم تحديث سجلات الحظر الأمني الموحد!"); window.location.href="/";</script>`);
});

app.listen(PORT, () => {
    if (process.env.DISCORD_TOKEN) {
        client.login(process.env.DISCORD_TOKEN);
    } else {
        console.error('❌ DISCORD_TOKEN مفقود في إعدادات البيئة!');
    }
});
