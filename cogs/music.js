const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder, MessageFlags, escapeMarkdown } = require('discord.js');

const musicChannels = new Map();
const idleMessageMap = new Map();
const queueMessageMap = new Map();
const playerIntervals = new Map();
const isUpdatingMap = new Map();

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

function getLoopStatusText(player) {
    const mode = player.repeatMode || player.loop || (player.trackRepeat ? 'track' : player.queueRepeat ? 'queue' : 'off');
    
    if (mode === 'track' || mode === 'song' || mode === 1) {
        return '한 곡 반복';
    } else if (mode === 'queue' || mode === 'all' || mode === 2) {
        return '대기열 반복';
    }
    return '끔';
}

function getDisabledButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(true),
        new ButtonBuilder().setCustomId('music_pause').setStyle(ButtonStyle.Secondary).setEmoji('⏸️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_loop').setStyle(ButtonStyle.Secondary).setEmoji('🔁').setDisabled(true),
        new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(true)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setEmoji('➖').setDisabled(true),
        new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(true)
    );

    return [row1, row2];
}

async function updateIdleMessage(channel, cleanAll = false) {
    try {
        if (cleanAll) {
            let fetched;
            do {
                fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (fetched && fetched.size > 0) {
                    await channel.bulkDelete(fetched, true).catch(async () => {
                        for (const msg of fetched.values()) {
                            await msg.delete().catch(() => {});
                        }
                    });
                }
            } while (fetched && fetched.size >= 2);
            idleMessageMap.delete(channel.guild.id);
            queueMessageMap.delete(channel.guild.id);
        }

        let qMsgId = queueMessageMap.get(channel.guild.id);
        if (qMsgId) {
            try {
                const qMsg = await channel.messages.fetch(qMsgId);
                if (qMsg) await qMsg.delete().catch(() => {});
            } catch (e) {}
            queueMessageMap.delete(channel.guild.id);
        }

        const idleEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🎵 현재 노래가 재생 중이지 않습니다')
            .setImage('attachment://music_idle.png');

        const file = new AttachmentBuilder('./assets/music_idle.png');
        const disabledRows = getDisabledButtons();

        let msgId = idleMessageMap.get(channel.guild.id);
        let msg = null;
        if (msgId) {
            try { msg = await channel.messages.fetch(msgId); } catch (e) {}
        }

        if (msg) {
            await msg.edit({ embeds: [idleEmbed], components: disabledRows, files: [file] }).catch(() => {});
        } else {
            const sentMsg = await channel.send({ embeds: [idleEmbed], components: disabledRows, files: [file] });
            idleMessageMap.set(channel.guild.id, sentMsg.id);
        }
    } catch (e) {
        console.error(e);
    }
}

async function updatePlayerMessage(player, client) {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;

    if (isUpdatingMap.get(guild.id)) return;
    isUpdatingMap.set(guild.id, true);

    try {
        const channelId = musicChannels.get(guild.id);
        if (!channelId) return;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const currentTrack = player.queue.current;
        if (!currentTrack) return;

        const queueTracks = player.queue.tracks || Array.from(player.queue) || [];

        const queueEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('📜 대기열 목록');

        if (queueTracks.length > 0) {
            const list = queueTracks.slice(0, 5).map((t, i) => {
                const reqId = t.requester?.id || t.requester;
                const requesterText = reqId ? ` (신청자: <@${reqId}>)` : '';
                const cleanTitle = escapeMarkdown(t.info.title);
                return `**${i + 1}.** ${cleanTitle}${requesterText}`;
            }).join('\n\n');

            const remaining = queueTracks.length - 5;
            
            queueEmbed.setDescription(list);
            if (remaining > 0) {
                queueEmbed.setFooter({ text: `외 ${remaining}곡` });
            }
        } else {
            queueEmbed.setDescription('대기열에 다음 노래가 없습니다.');
        }

        const position = player.position;
        const duration = currentTrack.info.duration;
        const progressBar = createProgressBar(position, duration);
        const timeText = `[${formatTime(position)} / ${formatTime(duration)}]`;

        let artwork = currentTrack.info.artworkUrl;
        if (!artwork && currentTrack.info.uri) {
            const urlMatch = currentTrack.info.uri.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            if (urlMatch && urlMatch[1]) {
                artwork = `https://img.youtube.com/vi/${urlMatch[1]}/maxresdefault.jpg`;
            }
        }

        const displayVolume = Math.round(player.volume * 2);
        const trackUrl = currentTrack.info.uri || 'https://discord.com';
        const currentReqId = currentTrack.requester?.id || currentTrack.requester;

        const playEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎵 ${currentTrack.info.title}`)
            .setURL(trackUrl)
            .addFields(
                { name: '👤 신청자', value: currentReqId ? `<@${currentReqId}>` : '알 수 없음', inline: true },
                { name: '🔊 볼륨', value: `${displayVolume}%`, inline: true },
                { name: '🔄 반복 모드', value: getLoopStatusText(player), inline: true },
                { name: '\u200b', value: `${progressBar} \`${timeText}\``, inline: false }
            )
            .setImage(artwork || null);

        const mode = player.repeatMode || player.loop || (player.trackRepeat ? 'track' : player.queueRepeat ? 'queue' : 'off');
        const isTrackLoop = mode === 'track' || mode === 'song' || mode === 1;
        const isQueueLoop = mode === 'queue' || mode === 'all' || mode === 2;

        const loopStyle = (isTrackLoop || isQueueLoop) ? ButtonStyle.Primary : ButtonStyle.Secondary;
        const loopEmoji = isTrackLoop ? '🔂' : '🔁';

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(false),
            new ButtonBuilder().setCustomId('music_pause').setStyle(player.paused ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji(player.paused ? '▶️' : '⏸️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_loop').setStyle(loopStyle).setEmoji(loopEmoji).setDisabled(false),
            new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(false)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setEmoji('➖').setDisabled(false),
            new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(false)
        );

        let msgId = idleMessageMap.get(guild.id);
        let msg = null;
        if (msgId) {
            try { msg = await channel.messages.fetch(msgId); } catch (e) {}
        }

        if (msg) {
            await msg.edit({ embeds: [playEmbed], components: [row1, row2], files: [] }).catch(() => {});
        } else {
            const sent = await channel.send({ embeds: [playEmbed], components: [row1, row2] });
            idleMessageMap.set(guild.id, sent.id);
        }

        let qMsgId = queueMessageMap.get(guild.id);
        let qMsg = null;
        if (qMsgId) {
            try { qMsg = await channel.messages.fetch(qMsgId); } catch (e) {}
        }

        if (qMsg) {
            await qMsg.edit({ embeds: [queueEmbed] }).catch(() => {});
        } else {
            const sentQueue = await channel.send({ embeds: [queueEmbed] });
            queueMessageMap.set(guild.id, sentQueue.id);
        }
    } finally {
        isUpdatingMap.set(guild.id, false);
    }
}

function setupMusicEvents(client) {
    client.lavalink.on('trackStart', async (player) => {
        await updatePlayerMessage(player, client);
    });

    client.lavalink.on('trackAdd', async (player) => {
        await updatePlayerMessage(player, client);
    });

    client.lavalink.on('queueEnd', async (player) => {
        setTimeout(async () => {
            if (!player.playing && player.queue.tracks.length === 0) {
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
            }
        }, 1000);
    });

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
                    ))
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    client.once('ready', async () => {
        try {
            if (client.user?.id) {
                await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
                console.log('슬러시 명령어(음악채널) 등록 완료!');
            }
        } catch (error) {
            console.error('슬래시 명령어 등록 실패:', error);
        }
    });
}

async function handleMessage(client, message) {
    if (message.author.bot || !message.guild) return;
    const registeredChannelId = musicChannels.get(message.guild.id);
    if (!registeredChannelId || message.channel.id !== registeredChannelId) return;

    let query = message.content ? message.content.trim() : '';
    await message.delete().catch(() => {});

    if (!query) return;

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        const temp = await message.channel.send('먼저 음성 채널에 입장해 주세요!');
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

    if (!player.connected) await player.connect();

    try {
        const res = await player.search({ query }, message.author);

        if (!res || !res.tracks || !res.tracks.length) return;

        if (res.loadType === 'playlist' || res.loadType === 'album') {
            player.queue.add(res.tracks);
        } else {
            player.queue.add(res.tracks[0]);
        }

        if (!player.playing && !player.paused) await player.play();

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
}

async function handleInteraction(client, interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === '음악채널') {
        const { options, guild } = interaction;
        const action = options.getString('작업');

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        }

        if (action === '생성') {
            try {
                const newChannel = await guild.channels.create({
                    name: '🎵-음악-채널',
                    type: ChannelType.GuildText,
                    topic: '디스코드 음악 봇 전용 채널입니다.'
                });
                musicChannels.set(guild.id, newChannel.id);
                await updateIdleMessage(newChannel, true);
                return interaction.editReply(`음악 채널을 새로 만들고 지정했습니다! 👉 <#${newChannel.id}>`);
            } catch (error) {
                return interaction.editReply('채널 생성 중에 오류가 발생했습니다.');
            }
        }

        if (action === '지정') {
            const targetChannel = interaction.channel;
            if (targetChannel.type !== ChannelType.GuildText) {
                return interaction.editReply('텍스트 채널에서만 지정할 수 있습니다.');
            }
            musicChannels.set(guild.id, targetChannel.id);
            await updateIdleMessage(targetChannel, true);
            return interaction.editReply(`현재 채널을 음악 채널로 지정했습니다! 👉 <#${targetChannel.id}>`);
        }

        if (action === '해제') {
            if (!musicChannels.has(guild.id)) {
                return interaction.editReply('현재 지정된 음악 채널이 없습니다.');
            }
            musicChannels.delete(guild.id);
            return interaction.editReply('음악 채널 지정을 해제했습니다!');
        }
    }

    if (!interaction.isButton()) return;
    const validButtons = [
        'music_prev', 'music_pause', 'music_next', 'music_loop', 'music_stop',
        'music_vol_down', 'music_vol_up'
    ];
    if (!validButtons.includes(interaction.customId)) return;

    const player = client.lavalink.getPlayer(interaction.guild.id);
    if (!player) {
        if (!interaction.deferred && !interaction.replied) {
            return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    if (interaction.customId === 'music_prev') {
        if (player.position <= 10000 && player.queue.previous && player.queue.previous.length > 0) {
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
        const currentMode = player.repeatMode || player.loop || (player.trackRepeat ? 'track' : player.queueRepeat ? 'queue' : 'off');
        let nextMode = 'queue';
        
        if (currentMode === 'queue' || currentMode === 'all' || currentMode === 2) {
            nextMode = 'track';
        } else if (currentMode === 'track' || currentMode === 'song' || currentMode === 1) {
            nextMode = 'off';
        }

        if (typeof player.setRepeatMode === 'function') {
            player.setRepeatMode(nextMode);
        } else if (typeof player.setLoop === 'function') {
            player.setLoop(nextMode);
        } else {
            player.repeatMode = nextMode;
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
    } else if (interaction.customId === 'music_vol_down') {
        const currentDisplayVol = Math.round(player.volume * 2);
        const newDisplayVol = Math.max(0, currentDisplayVol - 10);
        player.setVolume(Math.round(newDisplayVol / 2));
    } else if (interaction.customId === 'music_vol_up') {
        const currentDisplayVol = Math.round(player.volume * 2);
        const newDisplayVol = Math.min(100, currentDisplayVol + 10);
        player.setVolume(Math.round(newDisplayVol / 2));
    }

    await updatePlayerMessage(player, client);
}

module.exports = {
    setupMusicEvents,
    handleMessage,
    handleInteraction,
    musicChannels
};
