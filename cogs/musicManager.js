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
