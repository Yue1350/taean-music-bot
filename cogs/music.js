const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder, MessageFlags, StringSelectMenuBuilder } = require('discord.js');

const musicChannels = new Map();
const idleMessageMap = new Map();
const queueMessageMap = new Map();
const playerIntervals = new Map();
const isUpdatingMap = new Map();
const currentFilterMap = new Map();

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
        new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setEmoji('➖').setDisabled(true),
        new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(true),
        new ButtonBuilder().setCustomId('music_filter_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎛️').setDisabled(true)
    );

    return [row1, row2];
}

async function updateIdleMessage(channel, cleanAll = false) {
    if (!channel) return;

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
        .setDescription('채팅창에 노래 제목이나 유튜브 링크를 입력하면 음악을 재생할 수 있어요!');

    const disabledRows = getDisabledButtons();
    let msgId = idleMessageMap.get(channel.guild.id);
    let msg = null;

    if (msgId) {
        try {
            msg = await channel.messages.fetch(msgId);
        } catch (e) {}
    }

    if (msg) {
        await msg.edit({ embeds: [idleEmbed], components: disabledRows }).catch(() => {});
    } else {
        const sentMsg = await channel.send({ embeds: [idleEmbed], components: disabledRows });
        idleMessageMap.set(channel.guild.id, sentMsg.id);
    }
}

async function updatePlayerMessage(player, client) {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild || isUpdatingMap.get(guild.id)) return;

    isUpdatingMap.set(guild.id, true);

    try {
        const channelId = musicChannels.get(guild.id);
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const currentTrack = player.queue.current;
        if (!currentTrack) {
            await updateIdleMessage(channel);
            return;
        }

        const position = player.position;
        const duration = currentTrack.info.duration;
        const progressBar = createProgressBar(position, duration);
        const activeFilter = currentFilterMap.get(guild.id) || '일반 (OFF)';

        const playEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎵 ${currentTrack.info.title}`)
            .setURL(currentTrack.info.uri)
            .addFields(
                { name: '👤 아티스트', value: currentTrack.info.author || '알 수 없음', inline: true },
                { name: '⏱️ 재생 시간', value: `${formatTime(position)} / ${formatTime(duration)}`, inline: true },
                { name: '🎛️ 필터', value: activeFilter, inline: true },
                { name: '\u200b', value: `${progressBar}`, inline: false }
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪'),
            new ButtonBuilder().setCustomId('music_pause').setStyle(ButtonStyle.Secondary).setEmoji(player.paused ? '▶️' : '⏸️'),
            new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
            new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
            new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
            new ButtonBuilder().setCustomId('music_filter_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎛️')
        );

        let msgId = idleMessageMap.get(guild.id);
        let msg = null;

        if (msgId) {
            try {
                msg = await channel.messages.fetch(msgId);
            } catch (e) {}
        }

        if (msg) {
            await msg.edit({ embeds: [playEmbed], components: [row1, row2] }).catch(() => {});
        } else {
            const sent = await channel.send({ embeds: [playEmbed], components: [row1, row2] });
            idleMessageMap.set(guild.id, sent.id);
        }
    } finally {
        isUpdatingMap.set(guild.id, false);
    }
}

function setupMusicEvents(client) {
    client.lavalink.on('trackStart', async (player) => {
        await updatePlayerMessage(player, client);
        if (playerIntervals.has(player.guildId)) clearInterval(playerIntervals.get(player.guildId));
        const interval = setInterval(async () => {
            const p = client.lavalink.getPlayer(player.guildId);
            if (!p || !p.queue.current) {
                clearInterval(interval);
                playerIntervals.delete(player.guildId);
                return;
            }
            await updatePlayerMessage(p, client);
        }, 5000);
        playerIntervals.set(player.guildId, interval);
    });

    client.lavalink.on('trackEnd', async (player) => {
        if (!player.queue.current && playerIntervals.has(player.guildId)) {
            clearInterval(playerIntervals.get(player.guildId));
            playerIntervals.delete(player.guildId);
        }
    });

    client.lavalink.on('queueEnd', async (player) => {
        if (playerIntervals.has(player.guildId)) {
            clearInterval(playerIntervals.get(player.guildId));
            playerIntervals.delete(player.guildId);
        }
        const guild = client.guilds.cache.get(player.guildId);
        if (guild) {
            const channelId = musicChannels.get(guild.id);
            const channel = guild.channels.cache.get(channelId);
            if (channel) await updateIdleMessage(channel);
        }
    });
}

async function handleMessage(client, message) {
    if (message.author.bot || !message.guild) return;
    const channelId = musicChannels.get(message.guild.id);
    if (!channelId || message.channel.id !== channelId) return;

    await message.delete().catch(() => {});

    const query = message.content.trim();
    if (!query) return;

    const member = message.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        const warn = await message.channel.send('❌ 음성 채널에 먼저 입장해 주세요!');
        setTimeout(() => warn.delete().catch(() => {}), 4000);
        return;
    }

    let player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
        player = client.lavalink.createPlayer({
            guildId: message.guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: message.channel.id,
            selfDeaf: true,
            selfMute: false,
        });
        await player.connect();
    }

    try {
        const res = await client.lavalink.search(query, message.author);
        if (!res || res.loadType === 'empty' || res.loadType === 'error') {
            const warn = await message.channel.send('❌ 검색 결과를 찾지 못했어요.');
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
        }

        if (res.loadType === 'playlist') {
            for (const track of res.tracks) {
                player.queue.add(track);
            }
            const infoMsg = await message.channel.send(`✅ 플레이리스트 **${res.playlist.name}** (${res.tracks.length}곡)을 대기열에 추가했어요!`);
            setTimeout(() => infoMsg.delete().catch(() => {}), 4000);
        } else if (res.loadType === 'search' || res.loadType === 'track') {
            const track = res.tracks[0];
            player.queue.add(track);
            const infoMsg = await message.channel.send(`✅ 대기열에 추가됨: **${track.info.title}**`);
            setTimeout(() => infoMsg.delete().catch(() => {}), 4000);
        }

        if (!player.playing && !player.paused) {
            await player.play();
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleInteraction(client, interaction) {
    try {
        // 1. 슬래시 명령어 처리
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === '음악채널') {
                // 슬래시 명령어는 반드시 deferReply를 먼저 호출해야 함
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                
                const action = interaction.options.getString('작업');
                const guild = interaction.guild;

                if (action === '생성') {
                    const newChannel = await guild.channels.create({
                        name: '🎵-음악-채널',
                        type: ChannelType.GuildText,
                        topic: '디스코드 음악 봇 전용 채널입니다.'
                    });
                    musicChannels.set(guild.id, newChannel.id);
                    await updateIdleMessage(newChannel, true);
                    return interaction.editReply(`✅ 음악 채널을 생성했습니다: <#${newChannel.id}>`);
                } else if (action === '지정') {
                    musicChannels.set(guild.id, interaction.channel.id);
                    await updateIdleMessage(interaction.channel, true);
                    return interaction.editReply(`✅ 이 채널을 음악 채널로 지정했습니다.`);
                } else if (action === '해제') {
                    musicChannels.delete(guild.id);
                    return interaction.editReply(`✅ 음악 채널 지정을 해제했습니다.`);
                }
            }
            return;
        }

        // 2. 셀렉트 메뉴 처리 (필터)
        if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate(); // 버튼/메뉴는 무조건 이거 먼저
            
            const player = client.lavalink.getPlayer(interaction.guild.id);
            if (!player) return;

            const selectedFilter = interaction.values[0];
            await player.filterManager.resetFilters();
            
            if (selectedFilter !== 'clear') {
                if (selectedFilter === 'echo') await player.filterManager.setPluginFilters({ echo: { echoLength: 0.3, decay: 0.5 } });
                else if (selectedFilter === 'lowpass') await player.filterManager.setPluginFilters({ 'low-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                else if (selectedFilter === 'highpass') await player.filterManager.setPluginFilters({ 'high-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                else if (selectedFilter === 'normalization') await player.filterManager.setPluginFilters({ normalization: { maxAmplitude: 0.5, adaptive: true } });
                currentFilterMap.set(interaction.guild.id, `✅ ${selectedFilter}`);
            } else {
                currentFilterMap.set(interaction.guild.id, '일반 (OFF)');
            }
            await updatePlayerMessage(player, client);
            return;
        }

        // 3. 버튼 처리
        if (interaction.isButton()) {
            if (interaction.customId === 'music_filter_menu') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const filterSelect = new StringSelectMenuBuilder()
                    .setCustomId('filter_select_menu')
                    .addOptions([
                        { label: '필터 해제', value: 'clear', emoji: '❌' },
                        { label: '에코', value: 'echo', emoji: '📻' },
                        { label: '로우패스', value: 'lowpass', emoji: '🔇' },
                        { label: '하이패스', value: 'highpass', emoji: '📻' },
                        { label: '노말라이제이션', value: 'normalization', emoji: '🎚️' }
                    ]);
                return interaction.editReply({ content: '필터를 선택하세요:', components: [new ActionRowBuilder().addComponents(filterSelect)] });
            }

            await interaction.deferUpdate(); // 다른 버튼은 즉시 응답
            const player = client.lavalink.getPlayer(interaction.guild.id);
            if (!player) return;

            if (interaction.customId === 'music_stop') {
                await player.destroy();
                await updateIdleMessage(interaction.channel);
            } else if (interaction.customId === 'music_pause') {
                await player.pause(!player.paused);
                await updatePlayerMessage(player, client);
            } else if (interaction.customId === 'music_next') {
                await player.skip();
            } else if (interaction.customId === 'music_vol_up') {
                await player.setVolume(Math.min(player.volume + 10, 150));
            } else if (interaction.customId === 'music_vol_down') {
                await player.setVolume(Math.max(player.volume - 10, 0));
            }
        }
    } catch (err) {
        console.error('인터랙션 오류:', err);
    }
}

module.exports = { setupMusicEvents, handleMessage, handleInteraction, musicChannels };
