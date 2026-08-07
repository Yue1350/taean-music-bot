const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { initLavalink, musicChannels, playerIntervals, currentFilterMap } = require('./cogs/musicManager');
const { handleButtonAndSelect } = require('./cogs/musicButtons');
// 기존 music.js에 있던 메인 로직 함수들도 필요에 따라 가져오기
const { setupMusicEvents, handleMessage, updatePlayerMessage } = require('./cogs/music');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 라바링크 초기화
initLavalink(client);

// 음악 이벤트 등록
setupMusicEvents(client);

client.once('ready', () => {
    client.lavalink.init(client.user.id);
    console.log(`봇 로그인 완료: ${client.user.tag}`);
});

// 메시지(채팅 검색 및 재생) 처리
client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
});

// 인터랙션(버튼, 셀렉트 메뉴, 슬래시 명령어) 처리
client.on('interactionCreate', async (interaction) => {
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
                return interaction.editReply(`음악 채널을 새로 만들고 지정했습니다! 👉 <#${newChannel.id}>`);
            } catch (error) {
                return interaction.editReply('채널 생성 중에 오류가 발생했습니다.');
            }
        }
        if (action === '지정') {
            const targetChannel = interaction.channel;
            musicChannels.set(guild.id, targetChannel.id);
            return interaction.reply({ content: `현재 채널을 음악 채널로 지정했습니다! 👉 <#${targetChannel.id}>`, flags: [MessageFlags.Ephemeral] });
        }
        if (action === '해제') {
            musicChannels.delete(guild.id);
            return interaction.reply({ content: '음악 채널 지정을 해제했습니다!', flags: [MessageFlags.Ephemeral] });
        }
    }

    // 버튼 및 필터 셀렉트 메뉴 처리 위임
    await handleButtonAndSelect(client, interaction, updatePlayerMessage);
});

client.login(process.env.DISCORD_TOKEN);
