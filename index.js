require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const express = require('express');
// cogs 폴더 안의 music.js를 가져오도록 경로 수정!
const { setupMusicEvents, handleMessage, handleInteraction } = require('./cogs/music.js');

// --- 1. Render 배포 유지용 웹 서버 ---
const app = express();
app.get('/', (req, res) => res.send('Music Bot is Online!'));
app.listen(process.env.PORT || 3000, () => {
    console.log('[Web] 웹 서버가 실행 중입니다.');
});

// --- 2. 프로세스 예외 처리 (봇 강제 종료 방지) ---
process.on('unhandledRejection', (reason) => console.error('[Error] Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('[Error] Uncaught Exception:', err));

// --- 3. 디스코드 클라이언트 생성 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- 4. Lavalink 매니저 설정 ---
client.lavalink = new LavalinkManager({
    nodes: [
        {
            host: process.env.LAVALINK_HOST || 'localhost',
            port: parseInt(process.env.LAVALINK_PORT) || 2333,
            password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
            id: 'node-1'
        }
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
    autoPlay: true
});

// --- 5. 이벤트 등록 ---
client.on('ready', async () => {
    console.log(`[Bot] ${client.user.tag} 로 로그인 완료!`);
    await client.lavalink.init(client.user.id);
});

// 음악 관련 이벤트 세팅
setupMusicEvents(client);

// 메시지 입력 및 인터랙션(버튼/메뉴) 핸들러 연결
client.on('messageCreate', (message) => handleMessage(client, message));
client.on('interactionCreate', (interaction) => handleInteraction(client, interaction));

client.login(process.env.DISCORD_TOKEN);
