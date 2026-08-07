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

// Lavalink 클라이언트 설정 (sendToShard 및 client 속성 추가 필수!)
client.lavalink = new LavalinkManager({
    nodes: [
        {
            host: process.env.LAVALINK_HOST || 'localhost',
            port: Number(process.env.LAVALINK_PORT) || 2333,
            authorization: process.env.LAVALINK_SERVER_PASSWORD || 'yuedayo',
            secure: false
        }
    ],
    // 💡 이 부분이 필수로 들어가야 에러가 해결됩니다!
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: process.env.CLIENT_ID, // 봇의 디스코드 Application ID (숫자)
        username: "MusicBot"
    }
});

// 디스코드 Raw 이벤트 전달 필수
client.on("raw", d => client.lavalink.sendRawData(d));

// 음악 이벤트 및 명령어 세팅 연동
setupMusicEvents(client);

client.once('ready', async () => {
    await client.lavalink.init({ ...client.user });
    console.log(`봇 로그인 성공: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
});

client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
});

client.login(process.env.DISCORD_TOKEN);
