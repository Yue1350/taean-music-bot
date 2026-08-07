const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const musicChannels = new Map();
const idleMessageMap = new Map(); // 채널별 대기 메시지 ID 저장
const playerIntervals = new Map(); // 5초마다 실시간 재생바 업데이트용 인터벌 저장

// 15칸짜리 프로그레스바 생성 함수
function createProgressBar(current, total) {
    const size = 15;
    const progress = Math.min(Math.max(current / total, 0), 1);
    const pos = Math.round(progress * size);
    const bar = '▬'.repeat(pos) + '🔘' + '▬'.repeat(size - pos);
    return bar;
}

// 시간 포맷 함수 (밀리초 -> mm:ss)
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// 대기 상태(Idle) 임베드 전송 함수
async function updateIdleMessage(channel) {
    try {
        // 이전 메시지 전부 삭제
        const fetchedMessages = await channel.messages.fetch({ limit: 100 });
        if (fetchedMessages.size > 0) {
            await channel.bulkDelete(fetchedMessages, true).catch(() => {});
        }

        const idleEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🎵 음악이 재생 중이지 않습니다')
            .setDescription('노래의 제목이나 링크를 채팅에 보내주세요!')
            .setImage('attachment://music_idle.png');

        const { AttachmentBuilder } = require('discord.js');
        const file = new AttachmentBuilder('./assets/music_idle.png');

        const sentMsg = await channel.send({ embeds: [idleEmbed], files: [file] });
        idleMessageMap.set(channel.guild.id, sentMsg.id);
    } catch (e) {
        console.error(e);
    }
}

// 플레이어 패널 업데이트 및 실시간 재생바 함수
async function updatePlayerMessage(player, client) {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;
    const channelId = musicChannels.get(guild.id);
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const currentTrack = player.queue.current;
    if (!currentTrack) return;

    // 대기열 목록 정리 (최대 5개, 이후 외 몇 곡)
    const queueTracks = player.queue;
    let queueText = '대기열에 노래가 없습니다.';
    if (queueTracks.length > 0) {
        const list = queueTracks.slice(0, 5).map((t, i) => `${i + 1}. **${t.info.title}**`).join('\n');
        const remaining = queueTracks.length - 5;
        queueText = list + (remaining > 0 ? `\n외 ${remaining}곡` : '');
    }

    const position = player.position;
    const duration = currentTrack.info.duration;
    const progressBar = createProgressBar(position, duration);
    const timeText = `${formatTime(position)} / ${formatTime(duration)}`;

    const playEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(currentTrack.info.title)
        .setDescription(`요청자: <@${currentTrack.requester.id}> | 볼륨: ${player.volume}%\n\n${progressBar} \n\`${timeText}\``)
        .addFields({ name: '📜 대기열 목록', value: queueText })
        .setThumbnail(currentTrack.info.artworkUrl || currentTrack.info.uri);

    // 버튼 생성 (5개, 텍스트 없음)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_prev').setStyle(ButtonStyle.Secondary).setEmoji('⏪'),
        new ButtonBuilder().setCustomId('music_pause').setStyle(player.paused ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('⏸️'),
        new ButtonBuilder().setCustomId('music_next').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
        new ButtonBuilder().setCustomId('music_loop').setStyle(player.repeatMode === 'queue' || player.repeatMode === 'track' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji(player.repeatMode === 'track' ? '🔂' : '🔁'),
        new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
    );

    let msgId = idleMessageMap.get(guild.id);
    let msg = null;
    if (msgId) {
        try { msg = await channel.messages.fetch(msgId); } catch (e) {}
    }

    if (msg) {
        await msg.edit({ embeds: [playEmbed], components: [row], files: [] }).catch(() => {});
    } else {
        const sent = await channel.send({ embeds: [playEmbed], components: [row] });
        idleMessageMap.set(guild.id, sent.id);
    }
}

module.exports = {
    name: 'music',
    description: '음악 채널 및 시스템 관리',

    async init(client) {
        const commands = [
            new SlashCommandBuilder()
                .setName('음악채널')
                .setDescription('음악 봇 전용 채널을 관리합니다.')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
                .addSubcommand(sub => sub.setName('생성').setDescription('새로운 음악 전용 채널을 자동으로 생성합니다.'))
                .addSubcommand(sub => sub.setName('지정').setDescription('현재 채널을 음악 전용 채널로 지정합니다.').addChannelOption(o => o.setName('채널').setDescription('지정할 텍스트 채널').setRequired(false)))
                .addSubcommand(sub => sub.setName('해제').setDescription('설정된 음악 전용 채널을 해제합니다.'))
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('음악채널 슬러시 명령어 등록 완료!');
        } catch (error) {
            console.error(error);
        }

        // 명령어 처리
        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;
            if (interaction.commandName !== '음악채널') return;

            const { options, guild } = interaction;
            const subCommand = options.getSubcommand();

            if (subCommand === '생성') {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const newChannel = await guild.channels.create({
                        name: '🎵-음악-채널',
                        type: ChannelType.GuildText,
                        topic: '디스코드 음악 봇 전용 채널입니다.'
                    });
                    musicChannels.set(guild.id, newChannel.id);
                    await updateIdleMessage(newChannel);
                    return interaction.editReply(`성공적으로 음악 채널을 생성하고 지정했어! 👉 <#${newChannel.id}>`);
                } catch (error) {
                    return interaction.editReply('채널 생성 중 오류가 발생했어.');
                }
            }

            if (subCommand === '지정') {
                const targetChannel = options.getChannel('채널') || interaction.channel;
                if (targetChannel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: '텍스트 채널만 지정할 수 있어!', ephemeral: true });
                }
                musicChannels.set(guild.id, targetChannel.id);
                await updateIdleMessage(targetChannel);
                return interaction.reply({ content: `음악 채널이 지정되었어! 👉 <#${targetChannel.id}>`, ephemeral: true });
            }

            if (subCommand === '해제') {
                if (!musicChannels.has(guild.id)) {
                    return interaction.reply({ content: '지정된 음악 채널이 없어.', ephemeral: true });
                }
                musicChannels.delete(guild.id);
                return interaction.reply({ content: '음악 채널 지정을 해제했어!', ephemeral: true });
            }
        });

        // 텍스트로 링크나 제목 입력 시 처리
        client.on('messageCreate', async message => {
            if (message.author.bot || !message.guild) return;
            const registeredChannelId = musicChannels.get(message.guild.id);
            if (!registeredChannelId || message.channel.id !== registeredChannelId) return;

            const query = message.content;
            await message.delete().catch(() => {});

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                const temp = await message.channel.send('먼저 음성 채널에 들어가주세요!');
                setTimeout(() => temp.delete().catch(() => {}), 3000);
                return;
            }

            let player = client.lavalink.getPlayer(message.guild.id);
            if (!player) {
                player = client.lavalink.createPlayer({
                    guildId: message.guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: message.channel.id,
                    selfDeaf: true
                });
            }

            if (!player.connected) player.connect();

            const res = await player.search({ query, requester: message.author }, message.author);
            if (!res.tracks.length) return;

            player.queue.add(res.tracks[0]);
            if (!player.playing && !player.paused) player.play();

            await updatePlayerMessage(player, client);

            // 5초마다 재생바 최신화 인터벌 설정
            if (!playerIntervals.has(message.guild.id)) {
                const interval = setInterval(async () => {
                    if (!player.playing) return;
                    await updatePlayerMessage(player, client);
                }, 5000);
                playerIntervals.set(message.guild.id, interval);
            }
        });

        // 버튼 상호작용 처리
        client.on('interactionCreate', async interaction => {
            if (!interaction.isButton()) return;
            if (!['music_prev', 'music_pause', 'music_next', 'music_loop', 'music_stop'].includes(interaction.customId)) return;

            const player = client.lavalink.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ content: '재생 중인 플레이어가 없습니다.', ephemeral: true });

            await interaction.deferUpdate();

            if (interaction.customId === 'music_prev') {
                if (player.position <= 10000 && player.queue.previous.length > 0) {
                    player.play(player.queue.previous[0]);
                } else {
                    player.seek(0);
                }
            } else if (interaction.customId === 'music_pause') {
                player.pause(!player.paused);
            } else if (interaction.customId === 'music_next') {
                player.stop();
            } else if (interaction.customId === 'music_loop') {
                if (player.repeatMode === 'off') {
                    player.setRepeatMode('queue');
                } else if (player.repeatMode === 'queue') {
                    player.setRepeatMode('track');
                } else {
                    player.setRepeatMode('off');
                }
            } else if (interaction.customId === 'music_stop') {
                if (playerIntervals.has(interaction.guild.id)) {
                    clearInterval(playerIntervals.get(interaction.guild.id));
                    playerIntervals.delete(interaction.guild.id);
                }
                player.destroy();
                const channel = interaction.channel;
                await updateIdleMessage(channel);
                return;
            }

            await updatePlayerMessage(player, client);
        });

        // 음악 종료/넘어갈 때 처리
        client.lavalink.on('trackEnd', async (player) => {
            if (!player.queue.current) {
                if (playerIntervals.has(player.guildId)) {
                    clearInterval(playerIntervals.get(player.guildId));
                    playerIntervals.delete(player.guildId);
                }
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
    }
};
