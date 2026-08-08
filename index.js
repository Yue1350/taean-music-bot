require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const { setupMusicEvents, handleMessage, handleInteraction, loadMusicChannels } = require('./cogs/music');

// --- 1. Web Server (Render 포트 바인딩용) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('태안 노래봇이 정상 작동 중입니다!');
});

app.listen(PORT, () => {
    console.log(`[Web] 웹 서버가 실행 중입니다. (Port: ${PORT})`);
});

// --- 1.5 MongoDB 연결 (taean_music_bot_db) ---
const MONGO_URI = process.env.MONGODB_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI, {
        dbName: 'taean_music_bot_db'
    }).then(() => {
        console.log('[DB] MongoDB (taean_music_bot_db) 연결 완료!');
        loadMusicChannels();
    }).catch(err => {
        console.error('[DB] MongoDB 연결 실패:', err);
    });
} else {
    console.warn('[DB] MONGODB_URI가 설정되지 않아 데이터베이스가 연동되지 않았습니다.');
}

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
    await client.lavalink.init(client.user);

    // 상태 메세지 설정 (Playing: ~하는 중)
    client.user.setActivity('태안 촌놈들 노래 재생 중', { type: ActivityType.Playing });
});

client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
});

client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
});

// --- 5. Bot 로그인 ---
client.login(process.env.DISCORD_TOKEN);
