const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder, MessageFlags, ActivityType } = require('discord.js');

const musicChannels = new Map();
const idleMessageMap = new Map();
const queueMessageMap = new Map();
const playerIntervals = new Map();
const isUpdatingMap = new Map(); // 중복 메시지 생성 방지용 Lock

function createProgressBar(current, total) {
    const size = 15;
    const progress = Math.min(Math.max(current / total, 0), 1);
    const pos = Math.round(progress * size);
    return '➖'.repeat(pos) + '🔘' + '➖'.repeat(size - pos);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function getDisabledButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(true),
        new ButtonBuilder().setCustomId('music_pause').setStyle(ButtonStyle.Secondary).setEmoji('⏸️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_loop').setStyle(ButtonStyle.Secondary).setEmoji('🔁').setDisabled(true),
        new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(true)
    );
}

async function updateIdleMessage(channel, cleanAll = false) {
    try {
        queueMessageMap.delete(channel.guild.id);

        if (cleanAll) {
            let fetched;
            do {
                fetched = await channel.messages.fetch({ limit: 100 });
                if (fetched.size > 0) {
                    await channel.bulkDelete(fetched, true).catch(async () => {
                        for (const msg of fetched.values()) {
                            await msg.delete().catch(() => {});
                        }
                    });
                }
            } while (fetched.size >= 2);
            idleMessageMap.delete(channel.guild.id);
        }

        const idleEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🎵 현재 노래가 재생 중이지 않습니다')
            .setImage('attachment://music_idle.png');

        const file = new AttachmentBuilder('./assets/music_idle.png');
        const disabledRow = getDisabledButtons();

        let qMsgId = queueMessageMap.get(channel.guild.id);
        if (qMsgId) {
            try {
                const qMsg = await channel.messages.fetch(qMsgId);
                if (qMsg) await qMsg.delete().catch(() => {});
            } catch (e) {}
            queueMessageMap.delete(channel.guild.id);
        }

        let msgId = idleMessageMap.get(channel.guild.id);
        let msg = null;
        if (msgId) {
            try { msg = await channel.messages.fetch(msgId); } catch (e) {}
        }

        if (msg) {
            await msg.edit({ embeds: [idleEmbed], components: [disabledRow], files: [file] }).catch(() => {});
        } else {
            const sentMsg = await channel.send({ embeds: [idleEmbed], components: [disabledRow], files: [file] });
            idleMessageMap.set(channel.guild.id, sentMsg.id);
        }
    } catch (e) {
        console.error(e);
    }
}

async function updatePlayerMessage(player, client) {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;

    if (isUpdatingMap.get(guild.id)) return; // 동시 업데이트 중복 방지
    isUpdatingMap.set(guild.id, true);

    try {
        const channelId = musicChannels.get(guild.id);
        if (!channelId) return;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const currentTrack = player.queue.current;
        if (!currentTrack) return;

        const queueTracks = player.queue;
        const queueEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('📜 대기열 목록');

        if (queueTracks.length > 0) {
            const list = queueTracks.slice(0, 5).map((t, i) => `${i + 1}. **[${t.info.title}](${t.info.uri || '#'})**`).join('\n');
            const remaining = queueTracks.length - 5;
            queueEmbed.setDescription(list + (remaining > 0 ? `\n\n*외 ${remaining}곡*` : ''));
        } else {
            queueEmbed.setDescription('대기열에 다음 노래가 없어!');
        }

        const position = player.position;
        const duration = currentTrack.info.duration;
        const progressBar = createProgressBar(position, duration);
        const timeText = `[${formatTime(position)} / ${formatTime(duration)}]`;

        let artwork = currentTrack.info.artworkUrl;
        if (currentTrack.info.uri) {
            const urlMatch = currentTrack.info.uri.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            if (urlMatch && urlMatch[1]) {
                artwork = `https://img.youtube.com/vi/${urlMatch[1]}/maxresdefault.jpg`;
            }
        }

        const displayVolume = Math.round(player.volume * 2);
        const trackUrl = currentTrack.info.uri || 'https://discord.com';

        const playEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎵 ${currentTrack.info.title}`)
            .setURL(trackUrl)
            .addFields(
                { name: '👤 신청자', value: `<@${currentTrack.requester.id}>`, inline: true },
                { name: '🔊 볼륨', value: `${displayVolume}%`, inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: '\u200b', value: `${progressBar} \`${timeText}\``, inline: false }
            )
            .setImage(artwork || null);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(false),
            new ButtonBuilder().setCustomId('music_pause').setStyle(player.paused ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('⏸️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_loop').setStyle(player.repeatMode === 'queue' || player.repeatMode === 'track' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji(player.repeatMode === 'track' ? '🔂' : '🔁').setDisabled(false),
            new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(false)
        );

        let msgId = idleMessageMap.get(guild.id);
        let msg = null;
        if (msgId) {
            try { msg = await channel.messages.fetch(msgId); } catch (e) {}
        }

        if (msg) {
            await msg.edit({ embeds: [playEmbed], components: [row], files: [] }).catch(() => {});
        } else {
            const sent = await channel.send({ embeds: [playEmbed], components: [row] });
            idleMessageMap.set(guild.id, sent.id);
        }

        let qMsgId = queueMessageMap.get(guild.id);
        let qMsg = null;
        if (qMsgId) {
            try { qMsg = await channel.messages.fetch(qMsgId); } catch (e) {}
        }

        if (qMsg) {
            await qMsg.edit({ content: null, embeds: [queueEmbed] }).catch(() => {});
        } else {
            const sentQueue = await channel.send({ embeds: [queueEmbed] });
            queueMessageMap.set(guild.id, sentQueue.id);
        }
    } finally {
        isUpdatingMap.set(guild.id, false);
    }
}

module.exports = {
    name: 'music',
    description: '음악 채널 및 시스템 관리',

    async init(client) {
        client.user.setActivity('태안 촌놈들 노래', { type: ActivityType.Listening });

        const commands = [
            new SlashCommandBuilder()
                .setName('음악채널')
                .setDescription('음악 봇 전용 채널을 관리합니다.')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
                .addStringOption(option =>
                    option.setName('작업')
                        .setDescription('생성, 지정, 해제 중 선택하세요.')
                        .setRequired(true)
                        .addChoices(
                            { name: '생성', value: '생성' },
                            { name: '지정', value: '지정' },
                            { name: '해제', value: '해제' }
                        )),
            new SlashCommandBuilder()
                .setName('볼륨')
                .setDescription('음악 볼륨을 조절합니다 (1~100).')
                .addIntegerOption(option =>
                    option.setName('수치')
                        .setDescription('설정할 볼륨 크기 (1~100)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100))
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('슬러시 명령어(음악채널, 볼륨) 등록 완료!');
        } catch (error) {
            console.error(error);
        }

        client.on('voiceStateUpdate', async (oldState, newState) => {
            if (oldState.member.id === client.user.id && !newState.channelId) {
                const player = client.lavalink.getPlayer(oldState.guild.id);
                if (player) {
                    if (playerIntervals.has(oldState.guild.id)) {
                        clearInterval(playerIntervals.get(oldState.guild.id));
                        playerIntervals.delete(oldState.guild.id);
                    }
                    player.destroy();
                    const channelId = musicChannels.get(oldState.guild.id);
                    if (channelId) {
                        const channel = oldState.guild.channels.cache.get(channelId);
                        if (channel) await updateIdleMessage(channel);
                    }
                }
                return;
            }

            if (oldState.channelId && !newState.channelId) {
                const botChannelId = oldState.guild.members.me?.voice.channelId;
                if (botChannelId && oldState.channelId === botChannelId) {
                    const voiceChannel = oldState.guild.channels.cache.get(botChannelId);
                    const members = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot) : [];
                    
                    if (members.size === 0) {
                        const player = client.lavalink.getPlayer(oldState.guild.id);
                        if (player) {
                            if (playerIntervals.has(oldState.guild.id)) {
                                clearInterval(playerIntervals.get(oldState.guild.id));
                                playerIntervals.delete(oldState.guild.id);
                            }
                            player.destroy();
                            const channelId = musicChannels.get(oldState.guild.id);
                            if (channelId) {
                                const channel = oldState.guild.channels.cache.get(channelId);
                                if (channel) await updateIdleMessage(channel);
                            }
                        }
                    }
                }
            }
        });

        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            if (interaction.commandName === '음악채널') {
                const { options, guild } = interaction;
                const action = options.getString('작업');

                if (action === '생성') {
                    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                    try {
                        const newChannel = await guild.channels.create({
                            name: '🎵-음악-채널',
                            type: ChannelType.GuildText,
                            topic: '디스코드 음악 봇 전용 채널입니다.'
                        });
                        musicChannels.set(guild.id, newChannel.id);
                        await updateIdleMessage(newChannel, true);
                        return interaction.editReply(`음악 채널을 새로 만들고 지정했어! 👉 <#${newChannel.id}>`);
                    } catch (error) {
                        return interaction.editReply('채널 생성 중에 오류가 발생했어.');
                    }
                }

                if (action === '지정') {
                    const targetChannel = interaction.channel;
                    if (targetChannel.type !== ChannelType.GuildText) {
                        return interaction.reply({ content: '텍스트 채널에서만 지정할 수 있어!', flags: [MessageFlags.Ephemeral] });
                    }
                    musicChannels.set(guild.id, targetChannel.id);
                    await updateIdleMessage(targetChannel, true);
                    return interaction.reply({ content: `현재 채널을 음악 채널로 지정하고 기존 메시지를 비웠어! 👉 <#${targetChannel.id}>`, flags: [MessageFlags.Ephemeral] });
                }

                if (action === '해제') {
                    if (!musicChannels.has(guild.id)) {
                        return interaction.reply({ content: '현재 지정된 음악 채널이 없어.', flags: [MessageFlags.Ephemeral] });
                    }
                    musicChannels.delete(guild.id);
                    return interaction.reply({ content: '음악 채널 지정을 해제했어!', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.commandName === '볼륨') {
                const player = client.lavalink.getPlayer(interaction.guild.id);
                if (!player) {
                    return interaction.reply({ content: '현재 재생 중인 음악이 없어!', flags: [MessageFlags.Ephemeral] });
                }

                const inputVol = interaction.options.getInteger('수치');
                const targetVol = Math.round(inputVol / 2);

                player.setVolume(targetVol);
                await updatePlayerMessage(player, client);

                return interaction.reply({ content: `🔊 볼륨을 **${inputVol}%**로 변경했어!`, flags: [MessageFlags.Ephemeral] });
            }
        });

        client.on('messageCreate', async message => {
            if (message.author.bot || !message.guild) return;
            const registeredChannelId = musicChannels.get(message.guild.id);
            if (!registeredChannelId || message.channel.id !== registeredChannelId) return;

            const query = message.content ? message.content.trim() : '';
            await message.delete().catch(() => {});

            // 빈 메시지(공백 및 이미지 전송 등) 방지
            if (!query) return;

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                const temp = await message.channel.send('먼저 음성 채널에 들어가줘!');
                setTimeout(() => temp.delete().catch(() => {}), 3000);
                return;
            }

            let player = client.lavalink.getPlayer(message.guild.id);
            if (!player) {
                player = client.lavalink.createPlayer({
                    guildId: message.guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: message.channel.id,
                    selfDeaf: true,
                    volume: 10
                });
            }

            if (!player.connected) player.connect();

            try {
                const res = await player.search({ query, requester: message.author }, message.author);
                if (!res.tracks.length) return;

                if (res.loadType === 'playlist') {
                    player.queue.add(res.tracks);
                } else {
                    player.queue.add(res.tracks[0]);
                }

                if (!player.playing && !player.paused) player.play();

                await updatePlayerMessage(player, client);

                if (!playerIntervals.has(message.guild.id)) {
                    const interval = setInterval(async () => {
                        if (!player.playing) return;
                        await updatePlayerMessage(player, client);
                    }, 5000);
                    playerIntervals.set(message.guild.id, interval);
                }
            } catch (err) {
                console.error('검색 및 재생 오류:', err);
            }
        });

        client.on('interactionCreate', async interaction => {
            if (!interaction.isButton()) return;
            if (!['music_prev', 'music_pause', 'music_next', 'music_loop', 'music_stop'].includes(interaction.customId)) return;

            const player = client.lavalink.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없어.', flags: [MessageFlags.Ephemeral] });

            await interaction.deferUpdate();

            if (interaction.customId === 'music_prev') {
                if (player.position <= 10000 && player.queue.previous.length > 0) {
                    player.play(player.queue.previous[0]);
                } else {
                    player.seek(0);
                }
            } else if (interaction.customId === 'music_pause') {
                if (typeof player.setPaused === 'function') {
                    player.setPaused(!player.paused);
                } else {
                    player.pause(!player.paused);
                }
            } else if (interaction.customId === 'music_next') {
                player.skip();
            } else if (interaction.customId === 'music_loop') {
                if (player.repeatMode === 'off') {
                    player.setRepeatMode('queue');
                } else if (player.repeatMode === 'queue') {
                    player.setRepeatMode('track');
                } else {
                    player.setRepeatMode('off');
                }
            } else if (interaction.customId === 'music_stop') {
                if (playerIntervals.has(interaction.guild.id)) {
                    clearInterval(playerIntervals.get(interaction.guild.id));
                    playerIntervals.delete(interaction.guild.id);
                }
                player.destroy();
                const channel = interaction.channel;
                await updateIdleMessage(channel);
                return;
            }

            await updatePlayerMessage(player, client);
        });

        client.lavalink.on('trackStart', async (player) => {
            await updatePlayerMessage(player, client);
        });

        client.lavalink.on('trackAdd', async (player) => {
            await updatePlayerMessage(player, client);
        });

        client.lavalink.on('trackEnd', async (player) => {
            if (!player.queue.current) {
                if (playerIntervals.has(player.guildId)) {
                    clearInterval(playerIntervals.get(player.guildId));
                    playerIntervals.delete(player.guildId);
                }
                player.destroy();
                const guild = client.guilds.cache.get(player.guildId);
                if (guild) {
                    const channelId = musicChannels.get(guild.id);
                    if (channelId) {
                        const channel = guild.channels.cache.get(channelId);
                        if (channel) await updateIdleMessage(channel);
                    }
                }
            } else {
                await updatePlayerMessage(player, client);
            }
        });
    }
};
