require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// Lavalink 매니저 설정
client.lavalink = new LavalinkManager({
    nodes: [
        {
            id: 'MainNode',
            host: process.env.LAVA_HOST,
            port: Number(process.env.LAVA_PORT),
            authorization: process.env.LAVA_PASSWORD,
            secure: process.env.LAVA_SECURE === 'true'
        }
    ],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: process.env.DISCORD_CLIENT_ID,
        username: 'LavalinkMusicBot'
    },
    defaultSearchEngine: 'youtube'
});

// Cogs (Commands) 로드
const commandsPath = path.join(__dirname, 'cogs');
const commandFiles = fs.readdirSync(commandsPath.filter(file => file.endsWith('.js') || file)); // 폴더 구조에 맞게 조정

// 간단하게 cogs 폴더 내 music.js 로드 예시
const musicCog = require('./cogs/music.js');
musicCog.init(client); // cogs 내부에서 명령어 등록 처리 등을 수행할 수 있도록 연결

client.on('ready', async () => {
    console.log(`로그인 완료: ${client.user.tag}`);
    client.lavalink.init(client.user.id);
});

client.on('raw', data => client.lavalink.sendRawData(data));

client.login(process.env.DISCORD_TOKEN);
