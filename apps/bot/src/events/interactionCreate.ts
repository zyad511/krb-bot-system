import { Interaction, UserFlagsBitField, EmbedBuilder, TextChannel } from 'discord.js';

// 🔗 ربط وسحب المتغيرات الحية من ملف السيرفر الرئيسي لحل مشكلة الـ Compiler
import { client, db, saveDB, isolatedBots, DEVELOPER_ID } from '../../../api/src/server';


// معالجة أزرار التفاعل داخل ديسكورد مع منح الحصانة للمالك والديف
client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    const [action, botId, guildId] = interaction.customId.split('_');
    if (action !== 'approve' && action !== 'reject') return;

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) return;

    const isDev = interaction.user.id === DEVELOPER_ID;
    const isOwner = guild.ownerId === interaction.user.id;
    
    const config = db.guildConfigs[guildId] || { logChannelId: '', allowedUsers: [], allowAdminsToWeb: false, serverBlacklistedUsers: [] };
    const isAllowed = config.allowedUsers?.includes(interaction.user.id) || false;

    // 1. صد الأشخاص العاديين فوراً بـ رد مخفي وبدون أي استهلاك لموارد البوت
    if (!isDev && !isOwner && !isAllowed) {
        return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة العليا فقط، العب بعيد يا شاطر.', ephemeral: true });
    }

    // 2. فحص البلاك ليست المحلي للمشرفين (لا ينطبق على المالك أو الديف)
    if (config.serverBlacklistedUsers?.includes(interaction.user.id) && !isOwner && !isDev) {
        return interaction.reply({ content: '❌ تم حظرك من إدارة السيرفر بواسطة المالك سابقاً لخيانة القوانين!', ephemeral: true });
    }

    // 3. فحص البلاك ليست العالمي للبوت
    if (db.blacklistedUsers.includes(interaction.user.id) && !isDev) {
        return interaction.reply({ content: '❌ أنت مدرج في القائمة السوداء العالمية للمنظومة.', ephemeral: true });
    }

    // إذا مر من الفلاتر (يعني المالك أو الديف أو مشرف مصرح له) يتم قبول التفاعل
    await interaction.deferUpdate();

    try {
        const targetBotMember = await guild.members.fetch(botId).catch(() => null);

        if (action === 'approve') {
            if (!targetBotMember) return;

            // فحص شارة التوثيق الرسمية من ديسكورد
            const isOfficiallyVerified = targetBotMember.user.flags?.has(UserFlagsBitField.Flags.VerifiedBot) || false;

            // 👑 الحصانة الملكية: إذا المشرف (Allowed User) هو اللي ضغط والبوت مو موثق -> يطرد البوت ويعاقب المشرف
            // أما لو (أنت صاحب السيرفر) أو (الديف) ضغطتوا -> يتخطى هذا الشرط تماماً ويقبل البوت فوراً
            if (!isOfficiallyVerified && !isOwner && !isDev) {
                if (!config.serverBlacklistedUsers) config.serverBlacklistedUsers = [];
                if (!config.serverBlacklistedUsers.includes(interaction.user.id)) {
                    config.serverBlacklistedUsers.push(interaction.user.id);
                    db.guildConfigs[guildId] = config;
                    await saveDB();
                }

                isolatedBots.delete(botId);
                if (targetBotMember.kickable) await targetBotMember.kick('KRB Protection: Illegal acceptance of an unverified bot.');

                const alertEmbed = new EmbedBuilder()
                    .setTitle('🚨 خرق أمني خطير ومحاولة توثيق غير شرعية!')
                    .setDescription(`قام مسؤول بمحاولة قبول وتوثيق بوت عشوائي **غير معتمد رسميًا**. تم طرد البوت تلقائياً ومعاقبة المسؤول وحظره من اللوحة.`)
                    .addFields(
                        { name: '👤 المسؤول المخالف', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                        { name: '🤖 البوت المطرود', value: `\`${targetBotMember.user.tag}\`` },
                        { name: '⚙️ الإجراء الأمني المطبق', value: 'تم طرد البوت + وضع الإداري في البلاك ليست المحلي للسيرفر بشكل فوري وبلوك من لوحة الويب.' }
                    )
                    .setColor('#ef4444');

                const logChannel = guild.channels.cache.get(config.logChannelId) as TextChannel;
                if (logChannel) await logChannel.send({ embeds: [alertEmbed] });
                
                await interaction.editReply({ content: '⚠️ خرق أمني! البوت ليس موثقاً رسمياً من ديسكورد. تم طرده وإدراجك في البلاك ليست المحلي لخرق القوانين.', embeds: [], components: [] });
                return;
            }

            // توثيق البوت بنجاح (سواء كان موثق رسمي أو تم قبوله بواسطة المالك/الديف)
            if (!db.whitelistedBots.includes(botId)) db.whitelistedBots.push(botId);
            await saveDB();
            isolatedBots.delete(botId);
            await targetBotMember.timeout(null).catch(() => {});
            
            const emb = new EmbedBuilder()
                .setTitle('✅ تم قبول وتوثيق البوت بنجاح')
                .setDescription(`تم فك العزل عن البوت وتأكيده داخل السيرفر بأمر من الإدارة العليا الحاكمة.`)
                .addFields({ name: '👤 المسؤول التنفيذي', value: `${interaction.user}` })
                .setColor('#22c55e');
            await interaction.editReply({ embeds: [emb], components: [] });
        } else {
            // رفض وطرد البوت مباشرة
            isolatedBots.delete(botId);
            if (targetBotMember && targetBotMember.kickable) await targetBotMember.kick('Rejected via security logs.');
            
            const emb = new EmbedBuilder()
                .setTitle('❌ تم طرد ورفض البوت بنجاح')
                .setDescription(`تم ترحيل البوت خارج حدود السيرفر نهائياً وتطهير المنطقة بسلام.`)
                .addFields({ name: '👤 المسؤول التنفيذي', value: `${interaction.user}` })
                .setColor('#ef4444');
            await interaction.editReply({ embeds: [emb], components: [] });
        }
    } catch (err) { console.error(err); }
});
