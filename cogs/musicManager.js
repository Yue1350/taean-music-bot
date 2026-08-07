const { LavalinkManager } = require('lavalink-client');

const musicChannels = new Map();
const idleMessageMap = new Map();
const queueMessageMap = new Map();
const playerIntervals = new Map();
const isUpdatingMap = new Map();
const currentFilterMap = new Map();

function initLavalink(client) {
    client.lavalink = new LavalinkManager({
        nodes: [
            {
                host: process.env.LAVA_HOST || 'localhost',
                port: Number(process.env.LAVA_PORT) || 2333,
                authorization: process.env.LAVA_PASSWORD || 'yuedayo',
                secure: process.env.LAVA_SECURE === 'true'
            }
        ],
        sendToShard: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        client: {
            id: client.user?.id,
            username: client.user?.username
        }
    });
}

module.exports = {
    musicChannels,
    idleMessageMap,
    queueMessageMap,
    playerIntervals,
    isUpdatingMap,
    currentFilterMap,
    initLavalink
};
