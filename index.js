require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
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

// Lavalink 매니저 설정 (send -> sendToShard 수정 완료)
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

// music.js Cog 로드 및 연결
const musicCog = require('./cogs/music.js');
musicCog.init(client);

client.on('ready', async () => {
    console.log(`로그인 완료: ${client.user.tag}`);
    client.lavalink.init(client.user.id);
});

client.on('raw', data => client.lavalink.sendRawData(data));

client.login(process.env.DISCORD_TOKEN);
