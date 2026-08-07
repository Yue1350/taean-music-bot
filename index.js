const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, ChannelType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { initLavalink, musicChannels } = require('./cogs/musicManager');
const { handleButtonAndSelect } = require('./cogs/musicButtons');
const { setupMusicEvents, handleMessage, updatePlayerMessage } = require('./cogs/music');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    // 봇 로그인 후에 라바링크 초기화 및 시작
    initLavalink(client);
    client.lavalink.init(client.user.id);
    
    // 음악 이벤트 등록
    setupMusicEvents(client);
    
    console.log(`봇 로그인 완료: ${client.user.tag}`);
});

// 슬래시 명령어 등록 (음악채널)
const commands = [
    new SlashCommandBuilder()
        .setName('음악채널')
        .setDescription('음악 봇 전용 채널을 관리합니다.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option.setName('작업')
                .setDescription('생성, 지정, 해제 중 선택하세요.')
                .setRequired(true)
                .addChoices(
                    { name: '생성', value: '생성' },
                    { name: '지정', value: '지정' },
                    { name: '해제', value: '해제' }
                ))
];

client.once('ready', async () => {
    try {
        if (client.user?.id) {
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('슬러시 명령어(음악채널) 등록 완료!');
        }
    } catch (error) {
        console.error('슬래시 명령어 등록 실패:', error);
    }
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
