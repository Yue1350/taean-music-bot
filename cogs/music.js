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

// ... (updateIdleMessage, updatePlayerMessage, setupMusicEvents, handleMessage 함수는 동일하게 유지)

async function handleInteraction(client, interaction) {
    // ... (기존 음악채널 명령어 및 버튼 처리 로직은 동일)

    if (interaction.isStringSelectMenu() && interaction.customId === 'filter_select_menu') {
        const player = client.lavalink.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', flags: [MessageFlags.Ephemeral] });

        const selectedFilter = interaction.values[0];
        await interaction.deferUpdate();

        try {
            // 필터 리셋
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

    // ... (나머지 버튼 처리 로직 동일)
}

module.exports = { setupMusicEvents, handleMessage, handleInteraction, musicChannels };
