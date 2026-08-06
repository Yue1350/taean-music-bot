const { SlashCommandBuilder } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const play = require('play-dl');

// 서버별 재생 대기열 및 플레이어 관리
const queueMap = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('음악')
        .setDescription('유튜브 음악을 재생합니다.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('재생')
                .setDescription('유튜브 노래를 재생합니다.')
                .addStringOption(option =>
                    option.setName('검색어')
                        .setDescription('유튜브 링크 또는 검색어')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('일시정지')
                .setDescription('재생 중인 노래를 일시정지합니다.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('다시시작')
                .setDescription('일시정지된 노래를 다시 재생합니다.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('스킵')
                .setDescription('현재 노래를 건너뜁니다.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('정지')
                .setDescription('노래를 멈추고 봇을 음성 채널에서 내보냅니다.')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === '재생') {
            const query = interaction.options.getString('검색어');
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({ content: '먼저 음성 채널에 들어가 있어야 해!', ephemeral: true });
            }

            await interaction.deferReply();

            try {
                // 유튜브 검색 또는 링크 확인
                let searchResult = await play.search(query, { limit: 1 });
                if (!searchResult || searchResult.length === 0) {
                    return interaction.editReply('검색 결과가 없거나 올바르지 않은 링크야.');
                }

                const song = {
                    title: searchResult[0].title,
                    url: searchResult[0].url
                };

                let serverQueue = queueMap.get(guildId);

                if (!serverQueue) {
                    serverQueue = {
                        textChannel: interaction.channel,
                        voiceChannel: voiceChannel,
                        connection: null,
                        player: createAudioPlayer({
                            behaviors: {
                                noSubscriber: NoSubscriberBehavior.Pause,
                            }
                        }),
                        songs: []
                    };
                    queueMap.set(guildId, serverQueue);
                }

                serverQueue.songs.push(song);

                if (!serverQueue.connection) {
                    try {
                        const connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: guildId,
                            adapterCreator: interaction.guild.voiceAdapterCreator,
                        });
                        serverQueue.connection = connection;
                        serverQueue.connection.subscribe(serverQueue.player);

                        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
                            serverQueue.songs.shift();
                            if (serverQueue.songs.length > 0) {
                                playSong(guildId, serverQueue.songs[0]);
                            } else {
                                serverQueue.connection.destroy();
                                queueMap.delete(guildId);
                            }
                        });

                        playSong(guildId, serverQueue.songs[0]);
                        await interaction.editReply(`🎶 **${song.title}** 재생을 시작할게!`);
                    } catch (error) {
                        console.error(error);
                        queueMap.delete(guildId);
                        return interaction.editReply('음성 채널에 연결하는 중 오류가 발생했어.');
                    }
                } else {
                    await interaction.editReply(`곡이 대기열에 추가되었어: **${song.title}**`);
                }

            } catch (error) {
                console.error(error);
                await interaction.editReply('노래를 재생하는 동안 오류가 발생했어.');
            }
        } 
        else if (subcommand === '일시정지') {
            const serverQueue = queueMap.get(guildId);
            if (!serverQueue) return interaction.reply({ content: '재생 중인 노래가 없어!', ephemeral: true });
            
            serverQueue.player.pause();
            await interaction.reply('⏸️ 노래를 일시정지했어.');
        } 
        else if (subcommand === '다시시작') {
            const serverQueue = queueMap.get(guildId);
            if (!serverQueue) return interaction.reply({ content: '재생 중인 노래가 없어!', ephemeral: true });
            
            serverQueue.player.unpause();
            await interaction.reply('▶️ 노래를 다시 시작할게.');
        } 
        else if (subcommand === '스킵') {
            const serverQueue = queueMap.get(guildId);
            if (!serverQueue) return interaction.reply({ content: '스킵할 노래가 없어!', ephemeral: true });
            
            serverQueue.player.stop();
            await interaction.reply('⏭️ 노래를 건너뛰었어!');
        } 
        else if (subcommand === '정지') {
            const serverQueue = queueMap.get(guildId);
            if (!serverQueue) return interaction.reply({ content: '봇이 음성 채널에 없거나 재생 중이 아니야.', ephemeral: true });
            
            serverQueue.songs = [];
            serverQueue.player.stop();
            serverQueue.connection.destroy();
            queueMap.delete(guildId);
            
            await interaction.reply('⏹️ 노래를 멈추고 음성 채널에서 나갈게.');
        }
    }
};

async function playSong(guildId, song) {
    const serverQueue = queueMap.get(guildId);
    if (!song) {
        serverQueue.connection.destroy();
        queueMap.delete(guildId);
        return;
    }

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
    } catch (error) {
        console.error(error);
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}
