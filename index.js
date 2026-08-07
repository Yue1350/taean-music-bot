require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
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

// 디스코드 음성 연결 상태 패킷을 라바링크로 보류 없이 전달해 주는 필수 이벤트
client.on("raw", (d) => client.lavalink.sendRawData(d));

client.once('ready', async () => {
    console.log(`[Bot] ${client.user.tag} 로 로그인 완료!`);

    // Lavalink 매니저 초기화 시 client.user 객체 전달
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
