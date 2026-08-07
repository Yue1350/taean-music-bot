const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder, MessageFlags, StringSelectMenuBuilder } = require('discord.js');

const musicChannels = new Map();
const idleMessageMap = new Map();
const queueMessageMap = new Map();
const playerIntervals = new Map();
const isUpdatingMap = new Map();
const currentFilterMap = new Map();
const activeLyricsUsersMap = new Map();

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
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(true),
        new ButtonBuilder().setCustomId('music_pause').setStyle(ButtonStyle.Secondary).setEmoji('⏸️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(true)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_filter_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎛️').setDisabled(true),
        new ButtonBuilder().setCustomId('music_lyrics_toggle').setStyle(ButtonStyle.Secondary).setEmoji('📜').setDisabled(true),
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

async function fetchTrackLyrics(player, client) {
    const node = client.lavalink.nodeManager.nodes.first();
    if (!node) return null;

    // Lyrics.kt (v4/lyrics) REST API 호출
    try {
        const currentTrack = player.queue.current;
        if (currentTrack?.info?.title) {
            const encodedTitle = encodeURIComponent(currentTrack.info.title);
            const res = await node.rest.get(`v4/lyrics/search?query=${encodedTitle}`).catch(() => null);
            if (res) {
                if (Array.isArray(res) && res.length > 0) return res[0];
                if (res.text || res.lines) return res;
            }
        }
    } catch (e) {}

    return null;
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

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪').setDisabled(false),
            new ButtonBuilder().setCustomId('music_pause').setStyle(player.paused ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji(player.paused ? '▶️' : '⏸️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(false)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_filter_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎛️').setDisabled(false),
            new ButtonBuilder().setCustomId('music_lyrics_toggle').setStyle(ButtonStyle.Secondary).setEmoji('📜').setDisabled(false),
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

async function handleInteraction(client, interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === '음악채널') {
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
                return interaction.editReply(`음악 채널을 새로 만들고 지정했습니다! 👉 <#${newChannel.id}>`);
            } catch (error) {
                return interaction.editReply('채널 생성 중에 오류가 발생했습니다.');
            }
        }

        if (action === '지정') {
            const targetChannel = interaction.channel;
            if (targetChannel.type !== ChannelType.GuildText) {
                return interaction.reply({ content: '텍스트 채널에서만 지정할 수 있습니다.', flags: [MessageFlags.Ephemeral] });
            }
            musicChannels.set(guild.id, targetChannel.id);
            await updateIdleMessage(targetChannel, true);
            return interaction.reply({ content: `현재 채널을 음악 채널로 지정했습니다! 👉 <#${targetChannel.id}>`, flags: [MessageFlags.Ephemeral] });
        }

        if (action === '해제') {
            if (!musicChannels.has(guild.id)) {
                return interaction.reply({ content: '현재 지정된 음악 채널이 없습니다.', flags: [MessageFlags.Ephemeral] });
            }
            musicChannels.delete(guild.id);
            return interaction.reply({ content: '음악 채널 지정을 해제했습니다!', flags: [MessageFlags.Ephemeral] });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'filter_select_menu') {
        const player = client.lavalink.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

        const selectedFilter = interaction.values[0];
        await interaction.deferUpdate();

        try {
            if (selectedFilter === 'clear') {
                await player.filterManager.resetFilters();
                currentFilterMap.set(interaction.guild.id, '일반 (OFF)');
            } else if (selectedFilter === 'bassboost') {
                await player.filterManager.resetFilters();
                await player.filterManager.setEqualizer([
                    { band: 0, gain: 0.25 },
                    { band: 1, gain: 0.20 },
                    { band: 2, gain: 0.15 },
                    { band: 3, gain: 0.10 }
                ]);
                currentFilterMap.set(interaction.guild.id, '🔊 베이스 보스트');
            } else if (selectedFilter === 'nightcore') {
                await player.filterManager.resetFilters();
                await player.filterManager.setTimescale({ speed: 1.25, pitch: 1.25, rate: 1.0 });
                currentFilterMap.set(interaction.guild.id, '⚡ 나이트코어');
            } else if (selectedFilter === 'vaporwave') {
                await player.filterManager.resetFilters();
                await player.filterManager.setTimescale({ speed: 0.85, pitch: 0.8, rate: 1.0 });
                currentFilterMap.set(interaction.guild.id, '🌊 바포웨이브');
            } else if (selectedFilter === 'rotation') {
                await player.filterManager.resetFilters();
                await player.filterManager.setRotation({ rotationHz: 0.2 });
                currentFilterMap.set(interaction.guild.id, '🎧 3D 회전 오디오');
            } else if (selectedFilter === 'echo') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({
                    echo: { echoLength: 0.3, decay: 0.5 }
                });
                currentFilterMap.set(interaction.guild.id, '📻 에코/울림');
            } else if (selectedFilter === 'lowpass') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({
                    'low-pass': { cutoffFrequency: 500, boostFactor: 1.0 }
                });
                currentFilterMap.set(interaction.guild.id, '🔇 로우패스 (먹먹한 오디오)');
            } else if (selectedFilter === 'highpass') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({
                    'high-pass': { cutoffFrequency: 2000, boostFactor: 1.0 }
                });
                currentFilterMap.set(interaction.guild.id, '📻 하이패스 (라디오 오디오)');
            }
        } catch (err) {
            console.error('필터 적용 중 오류 발생:', err);
        }

        await updatePlayerMessage(player, client);
        return;
    }

    if (!interaction.isButton()) return;
    const validButtons = [
        'music_prev', 'music_pause', 'music_next', 'music_stop',
        'music_vol_down', 'music_vol_up', 'music_filter_menu', 'music_lyrics_toggle'
    ];
    if (!validButtons.includes(interaction.customId)) return;

    const player = client.lavalink.getPlayer(interaction.guild.id);
    if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

    if (interaction.customId === 'music_lyrics_toggle') {
        const userKey = `${interaction.guild.id}_${interaction.user.id}`;
        const isLyricsActive = activeLyricsUsersMap.get(userKey) || false;

        if (isLyricsActive) {
            activeLyricsUsersMap.set(userKey, false);
            return interaction.reply({ content: '📜 가사 보기를 껐습니다.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const currentTrack = player.queue.current;

        if (!currentTrack) {
            return interaction.editReply('현재 재생 중인 노래가 없어요!');
        }

        const lyricsData = await fetchTrackLyrics(player, client);

        if (lyricsData && (lyricsData.text || lyricsData.lines)) {
            let fullText = lyricsData.text;
            if (!fullText && lyricsData.lines) {
                fullText = lyricsData.lines.map(l => l.line || l.text).join('\n');
            }

            if (fullText) {
                activeLyricsUsersMap.set(userKey, true);
                const lyricsEmbed = new EmbedBuilder()
                    .setColor('#00FF7F')
                    .setTitle(`📜 ${currentTrack.info.title} - 가사`)
                    .setDescription(fullText.length > 3900 ? fullText.substring(0, 3900) + '...' : fullText)
                    .setFooter({ text: '다시 📜 버튼을 누르면 가사 보기가 꺼집니다.' });

                return interaction.editReply({ embeds: [lyricsEmbed] });
            }
        }

        return interaction.editReply('해당 곡의 가사를 찾을 수 없어요 😢');
    }

    if (interaction.customId === 'music_filter_menu') {
        const filterSelect = new StringSelectMenuBuilder()
            .setCustomId('filter_select_menu')
            .setPlaceholder('원하는 음향 필터를 선택해 주세요!')
            .addOptions([
                { label: '일반 (필터 해제)', value: 'clear', description: '기존 음향 효과를 모두 끕니다.', emoji: '❌' },
                { label: '베이스 보스트', value: 'bassboost', description: '저음(Bass)을 더욱 강하고 묵직하게 만듭니다.', emoji: '🔊' },
                { label: '나이트코어', value: 'nightcore', description: '재생 속도와 피치를 높여 신나게 만듭니다.', emoji: '⚡' },
                { label: '바포웨이브', value: 'vaporwave', description: '재생 속도를 낮추고 감성적인 느낌을 줍니다.', emoji: '🌊' },
                { label: '3D 회전 오디오', value: 'rotation', description: '소리가 입체적으로 회전하는 효과를 줍니다.', emoji: '🎧' },
                { label: '에코/울림 (LavaDSPX)', value: 'echo', description: '소리에 은은한 에코 효과를 넣습니다.', emoji: '📻' },
                { label: '로우패스 (LavaDSPX)', value: 'lowpass', description: '고음을 깎아 먹먹한 지하철/벽너머 소리를 만듭니다.', emoji: '🔇' },
                { label: '하이패스 (LavaDSPX)', value: 'highpass', description: '저음을 깎아 오래된 라디오/스피커 소리를 만듭니다.', emoji: '📻' }
            ]);

        const selectRow = new ActionRowBuilder().addComponents(filterSelect);

        return interaction.reply({
            content: '🎛️ **음향 효과(이퀄라이저 및 LavaDSPX) 선택**\n적용하고 싶은 필터를 아래 목록에서 골라주세요!',
            components: [selectRow],
            flags: [MessageFlags.Ephemeral]
        });
    }

    await interaction.deferUpdate();

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
    } else if (interaction.customId === 'music_stop') {
        if (playerIntervals.has(interaction.guild.id)) {
            clearInterval(playerIntervals.get(interaction.guild.id));
            playerIntervals.delete(interaction.guild.id);
        }
        player.destroy();
        currentFilterMap.delete(interaction.guild.id);
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
