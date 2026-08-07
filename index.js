require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');

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
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: process.env.DISCORD_CLIENT_ID,
        username: 'LavalinkMusicBot'
    },
    defaultSearchEngine: 'youtube'
});

// music.js Cog 로드
const musicCog = require('./cogs/music.js');

client.on('ready', async () => {
    console.log(`로그인 완료: ${client.user.tag}`);
    client.lavalink.init(client.user.id);
    
    // 봇이 켜진 직후에 명령어가 등록되도록 ready 이벤트 안으로 이동
    musicCog.init(client);
});

client.on('raw', data => client.lavalink.sendRawData(data));

client.login(process.env.DISCORD_TOKEN);
