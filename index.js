require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const { setupMusicEvents, handleMessage, handleInteraction } = require('./cogs/music');

// --- 1. Web Server (Render 포트 바인딩용) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('태안 노래봇이 정상 작동 중입니다!');
});

app.listen(PORT, () => {
    console.log(`[Web] 웹 서버가 실행 중입니다. (Port: ${PORT})`);
});

// --- 2. Discord Client 설정 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- 3. Lavalink 매니저 설정 ---
client.lavalink = new LavalinkManager({
    nodes: [
        {
            authorization: process.env.LAVA_PASSWORD || 'youshallnotpass',
            host: process.env.LAVA_HOST || 'localhost',
            port: parseInt(process.env.LAVA_PORT) || 2333,
            secure: process.env.LAVA_SECURE === 'true',
            id: 'node-1'
        }
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
    autoPlay: true
});

// --- 4. 이벤트 및 모듈 등록 ---
setupMusicEvents(client);

client.on("raw", (d) => client.lavalink.sendRawData(d));

client.once('ready', async () => {
    console.log(`[Bot] ${client.user.tag} 로 로그인 완료!`);

    // 💡 [핵심] 봇이 켜질 때 '음악채널' 슬래시 명령어를 디스코드에 강제 등록합니다.
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

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('[Bot] 슬래시 명령어 등록 중...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('[Bot] 슬래시 명령어 등록 완료!');
    } catch (error) {
        console.error('슬래시 명령어 등록 실패:', error);
    }

    await client.lavalink.init(client.user);
});

client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
});

client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
});

// --- 5. Bot 로그인 ---
client.login(process.env.DISCORD_TOKEN);
