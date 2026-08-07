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
                // LavaDSPX Echo
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({
                    echo: { echoLength: 0.3, decay: 0.5 }
                });
                currentFilterMap.set(interaction.guild.id, '📻 에코/울림');
            } else if (selectedFilter === 'lowpass') { 
                // LavaDSPX Low-Pass
                await player.filterManager.resetFilters();
                await player.filterManager.setPluginFilters({
                    'low-pass': { cutoffFrequency: 500, boostFactor: 1.0 }
                });
                currentFilterMap.set(interaction.guild.id, '🔇 로우패스 (먹먹한 오디오)');
            } else if (selectedFilter === 'highpass') { 
                // LavaDSPX High-Pass
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
