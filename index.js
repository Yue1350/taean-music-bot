const { Client, GatewayIntentBits } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const { setupMusicEvents, handleMessage, handleInteraction } = require('./cogs/music.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Lavalink 클라이언트 설정
client.lavalink = new LavalinkManager({
    nodes: [
        {
            host: process.env.LAVALINK_HOST || 'localhost',
            port: Number(process.env.LAVALINK_PORT) || 2333,
            authorization: process.env.LAVALINK_SERVER_PASSWORD || 'yuedayo',
            secure: false
        }
    ],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
});

// 음악 이벤트 및 명령어 세팅 연동
setupMusicEvents(client);

client.once('ready', () => {
    client.lavalink.init(client.user.id);
    console.log(`봇 로그인 성공: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
});

client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
});

client.login(process.env.DISCORD_TOKEN);
