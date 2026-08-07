const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { currentFilterMap, playerIntervals, idleMessageMap } = require('./musicManager');

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

async function handleButtonAndSelect(client, interaction, updatePlayerMessage, updateIdleMessage) {
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
                await player.filterManager.setPluginFilters({ echo: { echoLength: 0.3, decay: 0.5 } });
                currentFilterMap.set(interaction.guild.id, '📻 에코 효과');
            } else if (selectedFilter === 'lowpass') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({ 'low-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                currentFilterMap.set(interaction.guild.id, '🔇 로우패스 필터');
            } else if (selectedFilter === 'highpass') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({ 'high-pass': { cutoffFrequency: 80, boostFactor: 1.0 } });
                currentFilterMap.set(interaction.guild.id, '📻 하이패스 필터');
            } else if (selectedFilter === 'normalization') {
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({ normalization: { maxAmplitude: 0.5, adaptive: true } });
                currentFilterMap.set(interaction.guild.id, '🎚️ 볼륨 노말라이제이션');
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
        'music_vol_down', 'music_vol_up', 'music_filter_menu'
    ];
    if (!validButtons.includes(interaction.customId)) return;

    const player = client.lavalink.getPlayer(interaction.guild.id);
    if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

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
                { label: '에코 (LavaDSPX)', value: 'echo', description: '에코 효과를 부여합니다.', emoji: '📻' },
                { label: '로우패스 (LavaDSPX)', value: 'lowpass', description: '지정한 주파수보다 높은 대역을 차단합니다.', emoji: '🔇' },
                { label: '하이패스 (LavaDSPX)', value: 'highpass', description: '지정한 주파수보다 낮은 대역을 차단합니다.', emoji: '📻' },
                { label: '노말라이제이션 (LavaDSPX)', value: 'normalization', description: '피크 출력을 조절하여 음량을 평탄화합니다.', emoji: '🎚️' }
            ]);

        const selectRow = new ActionRowBuilder().addComponents(filterSelect);

        return interaction.reply({
            content: '🎛️ **음향 효과(LavaDSPX 플러그인) 선택**\n적용하고 싶은 필터를 아래 목록에서 골라주세요!',
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
        await updateIdleMessage(interaction.channel);
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
    getDisabledButtons,
    handleButtonAndSelect
};
