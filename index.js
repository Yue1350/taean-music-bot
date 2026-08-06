const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// DisTube 플레이어 설정 (yt-dlp 플러그인 연결)
client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    leaveOnFinish: true,
    plugins: [new YtDlpPlugin()]
});

client.commands = new Collection();

const cogsPath = path.join(__dirname, 'cogs');
const commandFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(cogsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

client.once('ready', async () => {
    console.log(`로그인 완료: ${client.user.tag}`);
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commands);
    console.log('슬래시 명령어 등록 완료!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '명령어 실행 중 오류가 발생했어!', ephemeral: true });
        } else {
            await interaction.reply({ content: '명령어 실행 중 오류가 발생했어!', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
