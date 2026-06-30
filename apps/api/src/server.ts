import express from 'express';
import path from 'path';
import { Client, GatewayIntentBits, TextChannel, PermissionsBitField } from 'discord.js';

const app = express();
const PORT = process.env.PORT || 10000;

// إعداد معالجة البيانات القادمة من لوحة التحكم
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل الملفات الثابتة لواجهة الموقع
app.use(express.static(path.join(__dirname, '../public')));

// قواعد البيانات المصغرة في الذاكرة لحفظ الحظر (Blacklist) أثناء تشغيل السيرفر
const blacklistedUsers = new Set<string>();
const blacklistedGuilds = new Set<string>();

// معرف المطور الخاص بك ليتم منشنته تلقائياً
const DEVELOPER_ID = '1065985362658345040';

// تهيئة بوت الديسكورد بكامل الصلاحيات المطلوبة داخل نفس العملية لعدم تعارض المنافذ
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// حدث تشغيل البوت بنجاح
client.on('ready', () => {
    console.log(`=== KRB SYSTEM ONLINE ===`);
    console.log(`✅ تم ربط البوت بنجاح: ${client.user?.tag}`);
    console.log(`=========================`);
});

// معالج التفاعلات والأوامر مع نظام الحظر (Blacklist Protection) وحماية الـ deferReply
client.on('interactionCreate', async (interaction) => {
    // التحقق الفوري إذا كان السيرفر أو المستخدم مدرج في البلاك ليست
    const isUserBlacklisted = blacklistedUsers.has(interaction.user.id);
    const isGuildBlacklisted = interaction.guildId ? blacklistedGuilds.has(interaction.guildId) : false;

    if (isUserBlacklisted || isGuildBlacklisted) {
        if (interaction.isRepliable()) {
            await interaction.reply({
                content: `❌ **تواصل مع المطور عليك بلاك ليست**\n⚠️ لا يمكنك استخدام النظام حالياً، يرجى مراجعة المطور الأساسي: <@${DEVELOPER_ID}>`,
                ephemeral: true
            });
        }
        return; // إيقاف تنفيذ الأمر فوراً وعزل المستخدم
    }

    // التأكد من أن التفاعل هو أمر سلاش (Slash Command) لتفادي أخطاء البناء والـ Build
    if (!interaction.isChatInputCommand()) return;

    // حماية الأوامر من التنفيذ في الخاص (DMs) لضمان استقرار قنوات السيرفرات
    if (!interaction.inGuild() || !interaction.guild) {
        return interaction.reply({ content: "❌ هذا الأمر متاح فقط داخل السيرفرات المحمية!", ephemeral: true });
    }

    // مكان تنفيذ الأوامر الخاصة بك (مثال لأمر help الآمن)
    try {
        if (interaction.commandName === 'help') {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({ content: '⚡ أهلاً بك! نظام الحماية والأوامر لـ KRB يعمل بأقصى طاقة استيعابية حالياً.' });
        }
    } catch (error) {
        console.error('حدث خطأ أثناء معالجة الأمر داخل الديسكورد:', error);
    }
});

// [API] endpoint: إرسال رسالة مخصصة لسيرفر محدد عن طريق الـ ID
app.post('/api/send-custom', async (req, res) => {
    const { guildId, channelId, message } = req.body;

    if (!guildId || !message) {
        return res.status(400).send('❌ خطأ: يجب إدخال معرف السيرفر ونص الرسالة بالكامل!');
    }

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return res.status(404).send('❌ خطأ: لم يتم العثور على هذا السيرفر في شبكة البوت!');

        let targetChannel: TextChannel | null = null;

        if (channelId) {
            targetChannel = (await guild.channels.fetch(channelId)) as TextChannel;
        } else {
            // إذا لم يحدد قناة، يبحث تلقائياً عن أول قناة نصية يمتلك البوت فيها صلاحية إرسال الرسائل
            targetChannel = guild.channels.cache.find(
                (ch) => ch.isTextBased() && ch.permissionsFor(guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)
            ) as TextChannel;
        }

        if (!targetChannel) {
            return res.status(400).send('❌ خطأ: لم يتم العثور على قناة نصية صالحة للإرسال داخل السيرفر!');
        }

        await targetChannel.send(message);
        res.send('<script>alert("🚀 تم إطلاق وإرسال الرسالة إلى السيرفر بنجاح!"); window.location.href="/";</script>');
    } catch (error: any) {
        console.error(error);
        res.status(500).send(`❌ فشل في إرسال الرسالة: ${error.message}`);
    }
});

// [API] endpoint: إدارة القائمة السوداء (إضافة / إزالة)
app.post('/api/blacklist', (req, res) => {
    const { type, targetId, action } = req.body;

    if (!targetId) return res.status(400).send('❌ خطأ: يجب كتابة الـ ID المراد اتخاذ إجراء ضده!');

    if (action === 'add') {
        if (type === 'user') blacklistedUsers.add(targetId);
        if (type === 'guild') blacklistedGuilds.add(targetId);
    } else if (action === 'remove') {
        if (type === 'user') blacklistedUsers.delete(targetId);
        if (type === 'guild') blacklistedGuilds.delete(targetId);
    }

    res.send('<script>alert("🔒 تم تحديث سجلات القائمة السوداء (Blacklist) بنجاح!"); window.location.href="/";</script>');
});

// [API] endpoint: جلب قائمة السيرفرات الحية لعرضها في لوحة التحكم
app.get('/api/servers', (req, res) => {
    try {
        const list = client.guilds.cache.map(g => ({
            name: g.name,
            id: g.id,
            memberCount: g.memberCount,
            isBlacklisted: blacklistedGuilds.has(g.id)
        }));
        res.json(list);
    } catch (error) {
        res.status(500).json({ error: 'فشل في جلب السيرفرات' });
    }
});

// تشغيل خادم الويب الموحد وربطه بالبوت تلقائياً
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 خادم الويب يعمل بنجاح على الرابط الحصري للمنفذ: http://localhost:${PORT}`);
    console.log(`=================================================`);
    
    // تسجيل دخول البوت باستخدام الـ Token المشفر في متغيرات البيئة بـ Render
    if (process.env.DISCORD_TOKEN) {
        client.login(process.env.DISCORD_TOKEN);
    } else {
        console.error('❌ كراش أمني: لم يتم العثور على متغير البيئة DISCORD_TOKEN في موقع Render!');
    }
});
