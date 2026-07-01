import express from 'express';
import { 
    Client, 
    GatewayIntentBits, 
    TextChannel, 
    PermissionsBitField, 
    AuditLogEvent, 
    EmbedBuilder, 
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Interaction
} from 'discord.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔒 بنية الذاكرة التخزينية لنظام KRB
const blacklistedUsers = new Set<string>(); 
const blacklistedGuilds = new Set<string>();
const whitelistedBots = new Set<string>();

interface GuildConfiguration {
    logChannelId: string;
    allowedUsers: string[];
    allowAdminsToWeb: boolean;
}
const guildConfigs = new Map<string, GuildConfiguration>();

interface IsolatedBot {
    id: string;
    tag: string;
    avatar: string;
    invitedBy: string;
    guildId: string;
    guildName: string;
}
const isolatedBots = new Map<string, IsolatedBot>();

// ⚙️ إعدادات الهوية والاتصال
const DEVELOPER_ID = '1065985362658345040'; 
const PREFIX = '.';

const CLIENT_ID = process.env.CLIENT_ID || ''; 
const CLIENT_SECRET = process.env.CLIENT_SECRET || ''; 
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://krb-security-system.onrender.com/auth/callback';

interface UserSession {
    userId: string;
    username: string;
    avatar: string;
    guilds: any[];
}
const webSessions = new Map<string, UserSession>();

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
    console.log(`🟢 KRB PROTECTION ONLINE`);
    console.log(`=================================`);
});

// ==========================================
// 🛡️ رادار رصد وعزل البوتات التلقائي
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (!member.user.bot) return;

    if (!whitelistedBots.has(member.user.id)) {
        try {
            const hasAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
            let inviterTag = "غير معروف";
            
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd });
                const logEntry = fetchedLogs.entries.first();
                if (logEntry && logEntry.target?.id === member.id && logEntry.executor) {
                    inviterTag = `${logEntry.executor.tag} (\`${logEntry.executor.id}\`)`;
                }
            } catch {
                console.log("تعذر فحص الـ Audit Log.");
            }

            isolatedBots.set(member.id, {
                id: member.id,
                tag: member.user.tag,
                avatar: member.user.displayAvatarURL({ extension: 'png' }),
                invitedBy: inviterTag,
                guildId: member.guild.id,
                guildName: member.guild.name
            });

            const config = guildConfigs.get(member.guild.id);
            let logChannel = member.guild.channels.cache.get(config?.logChannelId || '') as TextChannel;

            if (!logChannel) {
                logChannel = member.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(member.guild.members.me!).has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
            }

            if (hasAdmin) {
                if (member.kickable) {
                    await member.kick('KRB Security: Unwhitelisted admin bot.');
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('🚨 تم إحباط تهديد أدمن خطير')
                            .setDescription(`حاول بوت غير مصرح به الدخول بصلاحيات مسؤول وتم طرده فوراً لحماية السيرفر.`)
                            .addFields(
                                { name: '🤖 البوت التخريبي', value: `\`${member.user.tag}\``, inline: true },
                                { name: '👤 المسؤول عن دعوته', value: `${inviterTag}`, inline: true }
                            )
                            .setColor('#ef4444');
                        logChannel.send({ embeds: [embed] });
                    }
                }
            } else {
                if (member.manageable) await member.roles.set([]).catch(() => {});
                await member.timeout(2419200000, 'KRB Isolation').catch(() => {});

                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔳 نظام الحجب والعزل التلقائي | KRB SECURITY')
                        .setDescription(`تم رصد وعزل بوت غير موثق داخل أسوار السيرفر بنجاح، بانتظار قرار الإدارة العليا.`)
                        .addFields(
                            { name: '🤖 اسم البوت المستهدف', value: `\`${member.user.tag}\``, inline: true },
                            { name: '🆔 معرف البوت', value: `\`${member.id}\``, inline: true },
                            { name: '👤 المسؤول عن الدعوة', value: `${inviterTag}`, inline: false }
                        )
                        .setColor('#000000')
                        .setThumbnail(member.user.displayAvatarURL())
                        .setTimestamp();

                    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`approve_${member.id}_${member.guild.id}`).setLabel('موافقة وتوثيق ✅').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_${member.id}_${member.guild.id}`).setLabel('رفض وطرد نهائي ❌').setStyle(ButtonStyle.Danger)
                    );

                    await logChannel.send({ embeds: [logEmbed], components: [actionRow] });
                }
            }
        } catch (err) {
            console.error(err);
        }
    }
});

client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    const [action, botId, guildId] = interaction.customId.split('_');
    if (action !== 'approve' && action !== 'reject') return;

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) return;

    const config = guildConfigs.get(guildId);
    const isDev = interaction.user.id === DEVELOPER_ID;
    const isOwner = guild.ownerId === interaction.user.id;
    const isAllowed = config?.allowedUsers.includes(interaction.user.id) || false;

    if (!isDev && !isOwner && !isAllowed) {
        return interaction.reply({ content: '❌ لا تمتلك الصلاحية الأمنية الكافية لاتخاذ القرار.', ephemeral: true });
    }

    await interaction.deferUpdate();

    try {
        const targetBotMember = await guild.members.fetch(botId).catch(() => null);

        if (action === 'approve') {
            whitelistedBots.add(botId);
            isolatedBots.delete(botId);
            if (targetBotMember) await targetBotMember.timeout(null).catch(() => {});
            
            const emb = new EmbedBuilder()
                .setTitle('✅ تم قبول وتوثيق البوت')
                .setDescription(`بناءً على أمر الصلاحيات المعتمدة، تم فك العزل عن البوت وتأكيده.`)
                .addFields({ name: '👤 الفاعل', value: `${interaction.user}` })
                .setColor('#22c55e');
            await interaction.editReply({ embeds: [emb], components: [] });
        } else {
            isolatedBots.delete(botId);
            if (targetBotMember && targetBotMember.kickable) await targetBotMember.kick('Rejected via security logs.');
            
            const emb = new EmbedBuilder()
                .setTitle('❌ تم طرد ورفض البوت')
                .setDescription(`تم ترحيل البوت خارج السيرفر نهائياً وتطهير المنطقة.`)
                .addFields({ name: '👤 الفاعل', value: `${interaction.user}` })
                .setColor('#ef4444');
            await interaction.editReply({ embeds: [emb], components: [] });
        }
    } catch (err) { console.error(err); }
});

// ==========================================
// 🌐 الـ Dashboard المطور كلياً
// ==========================================
app.get('/', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies['krb_session'];
    const session = sessionId ? webSessions.get(sessionId) : null;

    if (!session) {
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
        return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>KRB SYSTEM LOGIN</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body { background: #000; color: #fff; font-family: 'Cairo', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin:0; padding:15px; box-sizing:border-box;}
                .login-box { background: #09090b; padding: 30px; border-radius: 8px; border: 1px solid #27272a; text-align: center; width: 100%; max-width: 400px; }
                .btn-discord { display: block; text-decoration: none; padding: 14px; background: #fff; color: #000; font-weight: 700; border-radius: 6px; font-size: 14px; margin-top: 20px; transition:0.2s; }
                .btn-discord:hover { background: #e4e4e7; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>🔳 KRB INFRASTRUCTURE</h2>
                <p style="color:#a1a1aa; font-size:13px; margin-top:10px;">سجل دخولك لإدارة منظومة الحماية التلقائية وعزل التهديدات.</p>
                <a href="${discordAuthUrl}" class="btn-discord">تسجيل الدخول الذكي ⚡</a>
            </div>
        </body>
        </html>
        `);
    }

    const isGlobalOwner = session.userId === DEVELOPER_ID;
    const adminGuildIds = session.guilds.filter((g: any) => (BigInt(g.permissions) & 0x8n) === 0x8n).map((g: any) => g.id);

    const sharedGuilds = client.guilds.cache.filter(g => {
        if (isGlobalOwner) return true;
        const isServerOwner = g.ownerId === session.userId;
        const config = guildConfigs.get(g.id);
        const isAllowedAdmin = config?.allowAdminsToWeb && adminGuildIds.includes(g.id);
        return isServerOwner || isAllowedAdmin;
    });

    const activeGuildId = (req.query.guildId as string) || '';
    const currentView = (req.query.view as string) || (isGlobalOwner && !activeGuildId ? 'global' : '');

    let sidebarCirclesHtml = '';
    if (isGlobalOwner) {
        sidebarCirclesHtml += `<a href="/?view=global" class="circle-item ${currentView === 'global' ? 'active-circle' : ''}" title="الإدارة العليا والمطور">👑</a>`;
    }
    sharedGuilds.forEach((g) => {
        const iconUrl = g.iconURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        sidebarCirclesHtml += `
            <a href="/?guildId=${g.id}" class="circle-item ${activeGuildId === g.id ? 'active-circle' : ''}" title="${g.name}">
                <img src="${iconUrl}" alt="${g.name}">
            </a>
        `;
    });

    let mainContentHtml = '';

    if (currentView === 'global' && isGlobalOwner) {
        let globalStatusRows = '';
        client.guilds.cache.forEach((g) => {
            const conf = guildConfigs.get(g.id);
            globalStatusRows += `
                <tr>
                    <td>${g.name}</td>
                    <td><span class="badge-code">${g.id}</span></td>
                    <td>${g.memberCount} عضو</td>
                    <td>${conf?.logChannelId ? '🟢 مفعّل' : '⚪ غير مخصص'}</td>
                    <td><span style="color:${blacklistedGuilds.has(g.id) ? '#ef4444' : '#22c55e'}">${blacklistedGuilds.has(g.id) ? 'محظور' : 'نشط حماية'}</span></td>
                </tr>
            `;
        });

        mainContentHtml = `
            <h3 class="content-title">👑 لوحة التحكم العليا الشاملة (خاص بأبو عتب)</h3>
            
            <div class="card">
                <h4>📊 تقرير الـ Status الموحد لجميع السيرفرات (\`${client.guilds.cache.size}\` سيرفر)</h4>
                <div style="overflow-x:auto; margin-top:15px;">
                    <table>
                        <thead>
                            <tr><th>اسم السيرفر</th><th>ID السيرفر</th><th>الأعضاء</th><th>روم اللوج</th><th>حالة الحظر</th></tr>
                        </thead>
                        <tbody>
                            ${globalStatusRows || '<tr><td colspan="5" style="text-align:center;">لا توجد سيرفرات متصلة حالياً.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="grid" style="margin-top:20px;">
                <div class="card">
                    <h4>📢 إطلاق البث والإرسال الشامل عن بعد</h4>
                    <form action="/api/send-custom" method="POST" style="margin-top:15px;">
                        <label>نوع نطاق الإرسال</label>
                        <select name="sendType" id="sendTypeSelect" onchange="toggleGuildField()" style="margin-bottom:15px;">
                            <option value="all">📢 بث شامل لجميع السيرفرات بالترتيب</option>
                            <option value="single">📌 سيرفر مخصص واحد فقط عبر الـ ID</option>
                        </select>
                        <div id="singleGuildBox" style="display:none; margin-bottom:15px;">
                            <label>معرف السيرفر المستهدف (Guild ID)</label>
                            <input type="text" name="guildId">
                        </div>
                        <label>محتوى الرسالة الإدارية</label>
                        <textarea name="message" rows="3" required placeholder="اكتب نص الإعلان الإداري هنا..."></textarea>
                        <button type="submit" class="btn" style="margin-top:10px;">إرسال فوري ومضمون 🚀</button>
                    </form>
                </div>

                <div class="card">
                    <h4>🔒 جدار الحظر العالمي والبلاك ليست</h4>
                    <form action="/api/blacklist" method="POST" style="margin-top:15px;">
                        <label>نوع الهدف</label>
                        <select name="type" style="margin-bottom:15px;">
                            <option value="user">حظر مستخدم (User ID)</option>
                            <option value="guild">حظر سيرفر بالكامل (Server ID)</option>
                        </select>
                        <label>المعرف الفريد (ID)</label>
                        <input type="text" name="targetId" required placeholder="أدخل الـ ID المُراد">
                        <label>نوع الإجراء الأمني</label>
                        <select name="action" style="margin-bottom:15px;">
                            <option value="add">إدراج فوري في القائمة السوداء</option>
                            <option value="remove">إزالة وعفو أمني شامل</option>
                        </select>
                        <button type="submit" class="btn btn-danger">تحديث جدار الحظر الشامل 🛡️</button>
                    </form>
                </div>
            </div>
            <script>
                function toggleGuildField() {
                    const sel = document.getElementById('sendTypeSelect').value;
                    document.getElementById('singleGuildBox').style.display = (sel === 'single') ? 'block' : 'none';
                }
            </script>
        `;
    } else if (activeGuildId && sharedGuilds.has(activeGuildId)) {
        const guild = client.guilds.cache.get(activeGuildId)!;
        const config = guildConfigs.get(activeGuildId) || { logChannelId: '', allowedUsers: [], allowAdminsToWeb: false };

        let channelOptionsHtml = `<option value="">-- اختر الروم التلقائي من القائمة --</option>`;
        guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach((ch) => {
            channelOptionsHtml += `<option value="${ch.id}" ${config.logChannelId === ch.id ? 'selected' : ''}># ${ch.name}</option>`;
        });

        let allowedUsersTagsHtml = '';
        if (config.allowedUsers && config.allowedUsers.length > 0) {
            config.allowedUsers.forEach((uId) => {
                allowedUsersTagsHtml += `
                    <span class="user-tag">
                        \`${uId}\`
                        <a href="/api/delete-user?guildId=${guild.id}&userId=${uId}" class="remove-tag-btn" title="حذف الصلاحية">×</a>
                    </span>
                `;
            });
        } else {
            allowedUsersTagsHtml = `<p style="color:#71717a; font-size:12px;">لم يتم إضافة مسؤولين مخصصين بعد.</p>`;
        }

        mainContentHtml = `
            <h3 class="content-title">📦 خيارات التحكم بالسيرفر الفردي: ${guild.name}</h3>
            
            <!-- 📁 فورم الخيارات الأساسية المربوط بشريط الحفظ التلقائي -->
            <form id="guild-config-form" action="/api/save-config" method="POST">
                <input type="hidden" name="guildId" value="${guild.id}">
                
                <!-- الخيار الأول: تحديد الروم -->
                <div class="option-row-box">
                    <div class="option-info">
                        <h4>📋 الخيار الأول: تحديد روم استقبال اللوج المخصص</h4>
                        <p>اختر القناة النصية التي يقوم البوت بإرسال لوج الحجب التفاعلي الفخم بداخلها.</p>
                    </div>
                    <div class="option-input-area">
                        <select name="logChannelId" style="margin-bottom:8px;">
                            ${channelOptionsHtml}
                        </select>
                        <input type="text" name="manualLogChannelId" placeholder="أو ضع الـ ID هنا للتعيين اليدوي في حال لم تجده فوق">
                    </div>
                </div>

                <!-- الخيار الثاني: صلاحيات الموقع للادمن -->
                <div class="option-row-box" style="margin-top:15px;">
                    <div class="option-info">
                        <h4>🔒 الخيار الثاني: إذن التحكم للإداريين (Web Dashboard)</h4>
                        <p>إذا قمت بتفعيل هذا الخيار، سيتمكن الأشخاص الذين يملكون رتبة الأدمن داخل السيرفر من دخول هذا الموقع وتعديل الإعدادات.</p>
                    </div>
                    <div class="option-input-area inline-checkbox">
                        <input type="checkbox" name="allowAdminsToWeb" value="true" ${config.allowAdminsToWeb ? 'checked' : ''} id="allowAdmins">
                        <label for="allowAdmins" style="display:inline; cursor:pointer; font-weight:600; margin:0;">السماح للإداريين بالدخول والتعديل</label>
                    </div>
                </div>
            </form>

            <!-- الخيار الثالث: المسؤولين المعتمدين للأزرار (منفصل لأنه إرسال فوري للتاقات) -->
            <div class="option-row-box" style="margin-top:25px; border-top: 1px dashed var(--border); padding-top:20px;">
                <div class="option-info">
                    <h4>👥 الخيار الثالث: قائمة المستخدمين المصرح لهم بالموافقة والرفض</h4>
                    <p>المعرفات (IDs) المضافة هنا يملكون كامل الصلاحية للضغط على أزرار القبول والرفض مباشرة داخل الديسكورد.</p>
                </div>
                <div class="option-input-area">
                    <form action="/api/add-user" method="POST" style="display:flex; gap:10px; margin-bottom:12px;">
                        <input type="hidden" name="guildId" value="${guild.id}">
                        <input type="text" name="newUserId" required placeholder="أدخل معرف العضو الفردي (User ID) هنا" style="margin-bottom:0;">
                        <button type="submit" class="btn" style="width:auto; padding:0 20px; white-space:nowrap;">إضافة ＋</button>
                    </form>
                    <label style="font-size:11px; margin-bottom:5px;">المصرح لهم حالياً (اضغط × للإزالة):</label>
                    <div class="tags-container">
                        ${allowedUsersTagsHtml}
                    </div>
                </div>
            </div>

            <!-- ⚠️ شريط ديسكورد العائم التلقائي لحفظ الإعدادات أو الإلغاء -->
            <div id="save-changes-bar" class="discord-save-bar hidden">
                <span class="bar-msg">⚠️ انتبه — لديك تغييرات غير محفوظة في خيارات السيرفر!</span>
                <div class="bar-actions">
                    <button type="button" class="bar-btn-cancel" onclick="resetConfigForm()">إلغاء</button>
                    <button type="button" class="bar-btn-save" onclick="submitConfigForm()">حفظ الإعدادات ✅</button>
                </div>
            </div>

            <script>
                // تفعيل الاستماع لأي تغيير داخل خانات الخيارات لتشغيل الشريط فوراً
                const form = document.getElementById('guild-config-form');
                const bar = document.getElementById('save-changes-bar');
                
                if(form && bar) {
                    const showBar = () => bar.classList.remove('hidden');
                    form.querySelectorAll('input, select').forEach(element => {
                        element.addEventListener('input', showBar);
                        element.addEventListener('change', showBar);
                    });
                }

                function resetConfigForm() {
                    if(form && bar) {
                        form.reset();
                        bar.classList.add('hidden');
                    }
                }

                function submitConfigForm() {
                    if(form) form.submit();
                }
            </script>
        `;
    } else {
        mainContentHtml = `
            <div style="text-align:center; padding:50px 10px; color:#a1a1aa;">
                <h3>🔳 أهلاً بك في منصة التحصين والتحكم الموحد KRB</h3>
                <p style="font-size:13px; margin-top:10px;">الرجاء الضغط على القائمة (☰) بالأعلى واختيار السيرفر من الدوائر لضبط خياراته وحمايته بنجاح.</p>
            </div>
        `;
    }

    let quarantineListHtml = '';
    isolatedBots.forEach((bot) => {
        if (isGlobalOwner || sharedGuilds.has(bot.guildId)) {
            quarantineListHtml += `
                <div class="q-card">
                    <img src="${bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="q-avatar">
                    <div style="flex:1; font-size:12px;">
                        <strong>${bot.tag}</strong>
                        <p style="color:#a1a1aa; font-size:11px;">سيرفر: ${bot.guildName}</p>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <form action="/api/approve-bot" method="POST"><input type="hidden" name="botId" value="${bot.id}"><input type="hidden" name="guildId" value="${bot.guildId}"><button type="submit" class="q-btn btn-ok">قبول</button></form>
                        <form action="/api/reject-bot" method="POST"><input type="hidden" name="botId" value="${bot.id}"><input type="hidden" name="guildId" value="${bot.guildId}"><button type="submit" class="q-btn btn-no">طرد</button></form>
                    </div>
                </div>
            `;
        }
    });

    if (!quarantineListHtml) {
        quarantineListHtml = `<p style="text-align:center; color:#71717a; font-size:12px; padding:10px;">🛡️ المعتقل نظيف بالكامل.</p>`;
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>KRB INFRASTRUCTURE CONSOLE</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg-main: #000000; --bg-card: #09090b; --border: #27272a; --text: #ffffff; --text-sub: #a1a1aa; --red: #ef4444; --green: #22c55e; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
            body { background-color: var(--bg-main); color: var(--text); font-size: 14px; overflow-x: hidden; min-height: 100vh; padding-bottom: 90px; }
            
            header { background: var(--bg-card); border-bottom: 1px solid var(--border); padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top:0; z-index: 100; }
            .nav-right { display: flex; align-items: center; gap: 15px; }
            .menu-toggle { background: none; border: none; color: var(--text); font-size: 24px; cursor: pointer; display: block; }
            .user-info { display: flex; align-items: center; gap: 8px; font-size: 13px; }
            .user-pfp { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); }

            .main-layout { display: flex; position: relative; min-height: calc(100vh - 60px); }
            .sidebar { width: 75px; background: var(--bg-card); border-left: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 15px 0; gap: 15px; position: absolute; top:0; bottom:0; right: -80px; transition: right 0.3s ease; z-index: 90; }
            .sidebar.active { right: 0; position: relative; }
            @media (min-width: 768px) { .sidebar { right: 0; position: relative; } }

            .circle-item { width: 48px; height: 48px; border-radius: 50%; background: #18181b; border: 1px solid var(--border); display: flex; justify-content: center; align-items: center; text-decoration: none; color: var(--text); font-weight: 700; font-size: 18px; overflow: hidden; transition: 0.2s; }
            .circle-item img { width: 100%; height: 100%; object-fit: cover; }
            .circle-item:hover, .active-circle { border-color: var(--text); background: #27272a; transform: scale(1.05); }

            .workspace { flex: 1; padding: 25px; box-sizing: border-box; max-width: 100%; }
            .content-title { font-size: 16px; font-weight: 700; margin-bottom: 25px; border-right: 4px solid #fff; padding-right: 10px; }
            
            /* تصميم الخيارات المرتب والموزع في بوكسات مستقلة تمنع تداخل الكلام */
            .option-row-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
            @media (min-width: 768px) { .option-row-box { flex-direction: row; justify-content: space-between; align-items: center; } }
            .option-info { flex: 1; min-width: 250px; }
            .option-info h4 { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }
            .option-info p { font-size: 12px; color: var(--text-sub); }
            .option-input-area { min-width: 280px; display: flex; flex-direction: column; gap: 8px; }

            .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 20px; margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
            @media (min-width: 992px) { .grid { grid-template-columns: 1fr 1fr; } }

            label { display: block; font-size: 12px; color: var(--text-sub); }
            input[type="text"], textarea, select { width: 100%; background: #18181b; border: 1px solid var(--border); color: var(--text); padding: 11px; border-radius: 6px; font-size: 13px; outline: none; }
            input[type="checkbox"] { width: 18px; height: 18px; accent-color: #fff; cursor: pointer; }
            .inline-checkbox { display: flex; align-items: center; gap: 10px; flex-direction: row !important; }
            
            .btn { width: 100%; background: #fff; color: #000; border: none; padding: 11px; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 13px; transition: 0.2s; }
            .btn:hover { background: #e4e4e7; }
            .btn-danger { background: transparent; border: 1px solid var(--red); color: var(--red); }
            .btn-danger:hover { background: var(--red); color:#fff; }

            /* شريط حفظ التغييرات العائم التلقائي لأسفل الشاشة */
            .discord-save-bar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #09090b; border: 1px solid #fff; padding: 15px 25px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; gap: 20px; width: 90%; max-width: 700px; z-index: 1000; box-shadow: 0 8px 32px rgba(255,255,255,0.08); animation: fadeInUp 0.3s ease; }
            .discord-save-bar.hidden { display: none !important; }
            .bar-msg { font-size: 13px; font-weight: 600; color: #fff; }
            .bar-actions { display: flex; align-items: center; gap: 15px; }
            .bar-btn-cancel { background: transparent; color: #fff; border: none; cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: underline; }
            .bar-btn-save { background: #fff; color: #000; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 700; font-size: 12px; cursor: pointer; transition: 0.2s; }
            .bar-btn-save:hover { background: #e4e4e7; }

            @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }

            .tags-container { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .user-tag { background: #18181b; border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; font-family: monospace; }
            .remove-tag-btn { text-decoration: none; color: var(--red); font-weight: 700; font-size: 15px; cursor: pointer; }

            table { width: 100%; border-collapse: collapse; text-align: right; margin-top: 10px; font-size: 12px; }
            th, td { padding: 12px; border-bottom: 1px solid var(--border); }
            th { color: var(--text-sub); }
            .badge-code { background: #18181b; padding: 2px 6px; border-radius: 4px; font-family: monospace; }

            .quarantine-panel { width: 100%; max-width: 300px; border-top: 1px solid var(--border); background: var(--bg-card); padding: 20px; }
            @media (min-width: 768px) { .quarantine-panel { border-top: none; border-right: 1px solid var(--border); } }
            .q-card { background: #18181b; border: 1px solid var(--border); border-radius: 4px; padding: 10px; margin-top: 10px; display: flex; align-items: center; gap: 10px; }
            .q-avatar { width: 32px; height: 32px; border-radius: 50%; }
            .q-btn { border: none; padding: 3px 8px; font-size: 11px; font-weight: 700; border-radius: 3px; cursor: pointer; }
            .btn-ok { background: var(--green); color: #fff; }
            .btn-no { background: var(--red); color: #fff; }
        </style>
    </head>
    <body>
        <header>
            <div class="nav-right">
                <button class="menu-toggle" onclick="toggleSidebar()">☰</button>
                <h3 style="font-size:15px;">KRB INFRASTRUCTURE</h3>
            </div>
            <div class="user-info">
                <img src="${session.avatar}" class="user-pfp">
                <span><strong>${session.username}</strong></span>
                <a href="/logout" style="color:var(--red); text-decoration:none; margin-right:5px; font-size:11px;">[خروج]</a>
            </div>
        </header>

        <div class="main-layout">
            <div class="sidebar" id="sidebar">
                ${sidebarCirclesHtml}
            </div>

            <div class="workspace">
                ${mainContentHtml}
            </div>

            <div class="quarantine-panel">
                <h4 style="font-size:13px; padding-bottom:5px; border-bottom:1px solid var(--border);">🚨 التهديدات المعزولة حالياً</h4>
                ${quarantineListHtml}
            </div>
        </div>

        <script>
            function toggleSidebar() {
                document.getElementById('sidebar').classList.toggle('active');
            }
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// 🚀 الـ APIs الخلفية لمعالجة الحفظ والتاقات
// ==========================================
app.post('/api/save-config', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = webSessions.get(cookies['krb_session'] || '');
    if (!session) return res.status(403).send('غير مصرح.');

    const { guildId, logChannelId, manualLogChannelId, allowAdminsToWeb } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('السيرفر مفقود.');

    if (session.userId !== DEVELOPER_ID && guild.ownerId !== session.userId) {
        return res.status(403).send('غير مصرح لك بتعديل هذه الخصائص.');
    }

    const current = guildConfigs.get(guildId) || { logChannelId: '', allowedUsers: [], allowAdminsToWeb: false };
    const finalChannelId = manualLogChannelId && manualLogChannelId.trim().length > 0 ? manualLogChannelId.trim() : logChannelId;

    guildConfigs.set(guildId, {
        logChannelId: finalChannelId,
        allowedUsers: current.allowedUsers,
        allowAdminsToWeb: allowAdminsToWeb === 'true'
    });

    res.redirect(`/?guildId=${guildId}`);
});

app.post('/api/add-user', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = webSessions.get(cookies['krb_session'] || '');
    if (!session) return res.status(403).send('غير مصرح.');

    const { guildId, newUserId } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('السيرفر غير موجود.');

    if (session.userId !== DEVELOPER_ID && guild.ownerId !== session.userId) {
        return res.status(403).send('لا تملك الصلاحية.');
    }

    const current = guildConfigs.get(guildId) || { logChannelId: '', allowedUsers: [], allowAdminsToWeb: false };
    const cleanedId = newUserId.trim();
    
    if (cleanedId && !current.allowedUsers.includes(cleanedId)) {
        current.allowedUsers.push(cleanedId);
    }
    guildConfigs.set(guildId, current);

    res.redirect(`/?guildId=${guildId}`);
});

app.get('/api/delete-user', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = webSessions.get(cookies['krb_session'] || '');
    if (!session) return res.status(403).send('غير مصرح.');

    const { guildId, userId } = req.query as { guildId: string, userId: string };
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('السيرفر غير موجود.');

    if (session.userId !== DEVELOPER_ID && guild.ownerId !== session.userId) {
        return res.status(403).send('لا تملك الصلاحية.');
    }

    const current = guildConfigs.get(guildId);
    if (current) {
        current.allowedUsers = current.allowedUsers.filter(id => id !== userId);
        guildConfigs.set(guildId, current);
    }

    res.redirect(`/?guildId=${guildId}`);
});

app.post('/api/blacklist', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = webSessions.get(cookies['krb_session'] || '');
    if (!session || session.userId !== DEVELOPER_ID) return res.status(403).send('للإدارة العليا فقط.');

    const { type, targetId, action } = req.body;
    if (action === 'add') {
        if (type === 'user') blacklistedUsers.add(targetId.trim());
        if (type === 'guild') blacklistedGuilds.add(targetId.trim());
    } else {
        if (type === 'user') blacklistedUsers.delete(targetId.trim());
        if (type === 'guild') blacklistedGuilds.delete(targetId.trim());
    }
    res.send(`<script>alert("🔒 جدار الحظر العالمي تم تحديثه!"); window.location.href="/?view=global";</script>`);
});

app.post('/api/send-custom', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = webSessions.get(cookies['krb_session'] || '');
    if (!session || session.userId !== DEVELOPER_ID) return res.status(403).send('للإدارة العليا فقط.');

    const { guildId, sendType, message } = req.body;

    if (sendType === 'all') {
        let sc = 0;
        for (const g of client.guilds.cache.values()) {
            try {
                const ch = g.channels.cache.find(c => c.isTextBased() && c.permissionsFor(g.members.me!)?.has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
                if (ch) { await ch.send(message); sc++; }
            } catch {}
        }
        return res.send(`<script>alert("📢 تم البث الشامل بنجاح إلى ${sc} سيرفر!"); window.location.href="/?view=global";</script>`);
    }

    try {
        const g = await client.guilds.fetch(guildId);
        const ch = g.channels.cache.find(c => c.isTextBased() && c.permissionsFor(g.members.me!)?.has(PermissionsBitField.Flags.SendMessages)) as TextChannel;
        if (ch) await ch.send(message);
        res.send(`<script>alert("🚀 تم إرسال رسالة البث المباشر!"); window.location.href="/?view=global";</script>`);
    } catch (e: any) { res.status(500).send(e.message); }
});

app.post('/api/approve-bot', async (req, res) => {
    const { botId, guildId } = req.body;
    whitelistedBots.add(botId);
    isolatedBots.delete(botId);
    const g = client.guilds.cache.get(guildId);
    if (g) {
        const m = await g.members.fetch(botId).catch(() => null);
        if (m) await m.timeout(null).catch(() => {});
    }
    res.redirect('/');
});

app.post('/api/reject-bot', async (req, res) => {
    const { botId, guildId } = req.body;
    isolatedBots.delete(botId);
    const g = client.guilds.cache.get(guildId);
    if (g) {
        const m = await g.members.fetch(botId).catch(() => null);
        if (m && m.kickable) await m.kick('Rejected via web.');
    }
    res.redirect('/');
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');
    try {
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
        const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const userData = await userResponse.json() as any;
        const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const guildsData = await guildsResponse.json() as any;

        const sessionId = Math.random().toString(36).substring(2, 15);
        webSessions.set(sessionId, {
            userId: userData.id,
            username: userData.username,
            avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
            guilds: Array.isArray(guildsData) ? guildsData : []
        });
        res.setHeader('Set-Cookie', `krb_session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=8640000`);
        res.redirect('/');
    } catch { res.status(500).send('فشلت المصادقة.'); }
});

app.get('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['krb_session']) webSessions.delete(cookies['krb_session']);
    res.setHeader('Set-Cookie', 'krb_session=; HttpOnly; Secure; Path=/; Max-Age=0');
    res.redirect('/');
});

if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN);
app.listen(PORT);
