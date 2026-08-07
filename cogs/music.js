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
    if (interaction.isStringSelectMenu() && interaction.customId === 'filter_select_menu') {
        const player = client.lavalink.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

        const selectedFilter = interaction.values[0];
        await interaction.deferUpdate();

        try {
            await player.filterManager.resetFilters();
            
            if (selectedFilter === 'clear') {
                currentFilterMap.set(interaction.guild.id, '일반 (OFF)');
            } else if (selectedFilter === 'echo') {
                await player.filterManager.setPluginFilters({ echo: { echoLength: 0.3, decay: 0.5 } });
                currentFilterMap.set(interaction.guild.id, '📻 에코 효과');
            } else if (selectedFilter === 'lowpass') {
                await player.filterManager.setPluginFilters({ 'low-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                currentFilterMap.set(interaction.guild.id, '🔇 로우패스 필터');
            } else if (selectedFilter === 'highpass') {
                await player.filterManager.setPluginFilters({ 'high-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                currentFilterMap.set(interaction.guild.id, '📻 하이패스 필터');
            } else if (selectedFilter === 'normalization') {
                await player.filterManager.setPluginFilters({ normalization: { maxAmplitude: 0.5, adaptive: true } });
                currentFilterMap.set(interaction.guild.id, '🎚️ 볼륨 노말라이제이션');
            }
        } catch (err) {
            console.error('필터 적용 중 오류 발생:', err);
        }

        await updatePlayerMessage(player, client);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'music_filter_menu') {
        const filterSelect = new StringSelectMenuBuilder()
            .setCustomId('filter_select_menu')
            .setPlaceholder('원하는 음향 필터를 선택해 주세요!')
            .addOptions([
                { label: '일반 (필터 해제)', value: 'clear', description: '기존 음향 효과를 모두 끕니다.', emoji: '❌' },
                { label: '에코', value: 'echo', description: '에코 효과를 부여합니다.', emoji: '📻' },
                { label: '로우패스', value: 'lowpass', description: '80Hz 이상의 주파수를 차단합니다.', emoji: '🔇' },
                { label: '하이패스', value: 'highpass', description: '80Hz 이하의 주파수를 차단합니다.', emoji: '📻' },
                { label: '노말라이제이션', value: 'normalization', description: '피크 출력을 조절합니다.', emoji: '🎚️' }
            ]);

        const selectRow = new ActionRowBuilder().addComponents(filterSelect);
        return interaction.reply({
            content: '🎛️ **음향 효과(LavaDSPX) 선택**',
            components: [selectRow],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (!interaction.isButton()) return;
    const player = client.lavalink.getPlayer(interaction.guild.id);

    if (interaction.customId === 'music_stop') {
        if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });
        if (playerIntervals.has(player.guildId)) {
            clearInterval(playerIntervals.get(player.guildId));
            playerIntervals.delete(player.guildId);
        }
        currentFilterMap.delete(interaction.guild.id);
        await player.destroy();
        await interaction.update({ content: '⏹️ 음악 재생을 중지했습니다.', embeds: [], components: getDisabledButtons() }).catch(() => {});
        const channel = interaction.guild.channels.cache.get(musicChannels.get(interaction.guild.id));
        if (channel) await updateIdleMessage(channel);
        return;
    }

    if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

    if (interaction.customId === 'music_pause') {
        await player.pause(!player.paused);
        await interaction.deferUpdate();
        await updatePlayerMessage(player, client);
    } else if (interaction.customId === 'music_next') {
        await player.skip();
        await interaction.deferUpdate();
    } else if (interaction.customId === 'music_prev') {
        const history = player.queue.previous;
        if (history && history.length > 0) {
            const lastTrack = history[history.length - 1];
            await player.queue.unshift(lastTrack);
            await player.skip();
        }
        await interaction.deferUpdate();
    } else if (interaction.customId === 'music_vol_up') {
        const newVol = Math.min(player.volume + 10, 150);
        await player.setVolume(newVol);
        await interaction.reply({ content: `🔊 볼륨을 **${newVol}%**로 설정했어요.`, flags: [MessageFlags.Ephemeral] });
    } else if (interaction.customId === 'music_vol_down') {
        const newVol = Math.max(player.volume - 10, 0);
        await player.setVolume(newVol);
        await interaction.reply({ content: `🔉 볼륨을 **${newVol}%**로 설정했어요.`, flags: [MessageFlags.Ephemeral] });
    }
}

module.exports = { setupMusicEvents, handleMessage, handleInteraction, musicChannels };
