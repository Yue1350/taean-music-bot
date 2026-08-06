const { SlashCommandBuilder } = require('discord.js');

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
        const voiceChannel = interaction.member.voice.channel;
        const distube = interaction.client.distube;

        if (subcommand === '재생') {
            const query = interaction.options.getString('검색어');

            if (!voiceChannel) {
                return interaction.reply({ content: '먼저 음성 채널에 들어가 있어야 해!', ephemeral: true });
            }

            await interaction.deferReply();

            try {
                await distube.play(voiceChannel, query, {
                    textChannel: interaction.channel,
                    member: interaction.member,
                });
                
                const queue = distube.getQueue(interaction.guild.id);
                const song = queue ? queue.songs[queue.songs.length - 1] : null;
                
                if (song) {
                    await interaction.editReply(`🎶 **${song.name}** 재생을 시작할게!`);
                } else {
                    await interaction.editReply(`곡을 대기열에 추가했어!`);
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply('노래를 재생하는 동안 오류가 발생했어. (봇 IP 차단 혹은 잘못된 링크일 수 있어)');
            }
        } 
        else {
            const queue = distube.getQueue(interaction.guild.id);
            if (!queue) {
                return interaction.reply({ content: '현재 재생 중인 음악이 없어!', ephemeral: true });
            }

            if (subcommand === '일시정지') {
                queue.pause();
                await interaction.reply('⏸️ 노래를 일시정지했어.');
            } 
            else if (subcommand === '다시시작') {
                queue.resume();
                await interaction.reply('▶️ 노래를 다시 시작할게.');
            } 
            else if (subcommand === '스킵') {
                try {
                    await queue.skip();
                    await interaction.reply('⏭️ 노래를 건너뛰었어!');
                } catch {
                    await interaction.reply({ content: '다음 곡이 없어서 스킵할 수 없어!', ephemeral: true });
                }
            } 
            else if (subcommand === '정지') {
                queue.stop();
                await interaction.reply('⏹️ 노래를 멈추고 음성 채널에서 나갈게.');
            }
        }
    }
};
