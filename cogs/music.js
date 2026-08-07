const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { musicChannels, idleMessageMap, queueMessageMap, playerIntervals, isUpdatingMap, currentFilterMap } = require('./musicManager');
const { getDisabledButtons } = require('./musicButtons');

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
            currentFilterMap.delete(channel.guild.id);
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
            const list = queueTracks.slice(0, 5).map((t, i) => `${i + 1}. **${t.info.title}**`).join('\n');
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
        const activeFilter = currentFilterMap.get(guild.id) || '일반 (OFF)';

        const playEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎵 ${currentTrack.info.title}`)
            .setURL(trackUrl)
            .addFields(
                { name: '👤 신청자', value: `<@${currentTrack.requester.id}>`, inline: true },
                { name: '🔊 볼륨', value: `${displayVolume}%`, inline: true },
                { name: '🎛️ 필터 효과', value: activeFilter, inline: true },
                { name: '\u200b', value: `${progressBar} \`${timeText}\``, inline: false }
            )
            .setImage(artwork || null);

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(false),
            new ButtonBuilder().setCustomId('music_pause').setStyle(player.paused ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji(player.paused ? '▶️' : '⏸️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(false)
        );

        // 요청한 순서: 음량 줄이기(➖), 음량 키우기(➕), 필터(🎛️)
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setEmoji('➖').setDisabled(false),
            new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(false),
            new ButtonBuilder().setCustomId('music_filter_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎛️').setDisabled(false)
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

    client.lavalink.on('trackEnd', async (player) => {
        const queueTracks = player.queue.tracks || Array.from(player.queue) || [];
        
        if (queueTracks.length === 0) {
            if (playerIntervals.has(player.guildId)) {
                clearInterval(playerIntervals.get(player.guildId));
                playerIntervals.delete(player.guildId);
            }
            
            player.destroy();
            currentFilterMap.delete(player.guildId);
            
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

    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (oldState.member.id === client.user.id && !newState.channelId) {
            const player = client.lavalink.getPlayer(oldState.guild.id);
            if (player) {
                if (playerIntervals.has(oldState.guild.id)) {
                    clearInterval(playerIntervals.get(oldState.guild.id));
                    playerIntervals.delete(oldState.guild.id);
                }
                player.destroy();
                currentFilterMap.delete(oldState.guild.id);
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
                        currentFilterMap.delete(oldState.guild.id);
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

    if (!player.connected) player.connect();

    try {
        let res;
        if (query.startsWith('spsearch:') || query.startsWith('amsearch:') || query.startsWith('dzsearch:') || query.startsWith('ymsearch:')) {
            res = await player.search({ query, requester: message.author }, message.author);
        } else if (player.lavasearch) {
            res = await player.lavasearch.search({ query, types: ['track', 'album', 'playlist'] }, message.author);
        } else {
            res = await player.search({ query, requester: message.author }, message.author);
        }

        if (!res || !res.tracks || !res.tracks.length) return;

        if (res.loadType === 'playlist' || res.loadType === 'album') {
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
}

module.exports = {
    setupMusicEvents,
    handleMessage,
    updatePlayerMessage,
    updateIdleMessage
};
