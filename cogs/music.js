const { SlashCommandBuilder, REST, Routes } = require('discord.js');

module.exports = {
    name: 'music',
    description: '음악 재생 관련 명령어',
    
    // 봇이 켜질 때 슬러시 명령어를 등록하는 함수
    async init(client) {
        const commands = [
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('노래를 재생합니다.')
                .addStringOption(option => 
                    option.setName('query').setDescription('재생할 노래 제목 또는 URL').setRequired(true)),
            new SlashCommandBuilder()
                .setName('skip')
                .setDescription('현재 노래를 스킵합니다.')
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('음악 슬러시 명령어 등록 완료!');
        } catch (error) {
            console.error(error);
        }

        // 인터랙션 이벤트 처리 연결
        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName, options, guild, member } = interaction;
            if (!guild) return;

            if (commandName === 'play') {
                const query = options.getString('query');
                const voiceChannel = member.voice.channel;

                if (!voiceChannel) {
                    return interaction.reply({ content: '먼저 음성 채널에 들어가주세요!', ephemeral: true });
                }

                await interaction.deferReply();

                let player = client.lavalink.getPlayer(guild.id);
                if (!player) {
                    player = client.lavalink.createPlayer({
                        guildId: guild.id,
                        voiceChannel: voiceChannel.id,
                        textChannel: interaction.channel.id,
                        selfDeaf: true
                    });
                }

                if (!player.connected) player.connect();

                const res = await player.search({ query, requester: member.user }, interaction.user);
                if (!res.tracks.length) {
                    return interaction.editReply('검색 결과가 없습니다.');
                }

                player.queue.add(res.tracks[0]);
                if (!player.playing && !player.paused) player.play();

                await interaction.editReply(`재생 대기중: **${res.tracks[0].info.title}**`);
            }

            if (commandName === 'skip') {
                const player = client.lavalink.getPlayer(guild.id);
                if (!player || !player.queue.current) {
                    return interaction.reply({ content: '재생중인 노래가 없습니다.', ephemeral: true });
                }

                player.stop();
                await interaction.reply('노래를 스킵했습니다!');
            }
        });
    }
};
