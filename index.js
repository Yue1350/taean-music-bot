require('dotenv').config();

const http = require('http');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const fs = require('fs');
const path = require('path');

// 1. 웹 서버 실행 (Render 등에서 안 꺼지게 유지)
const keepAlive = require('./keep_alive');
keepAlive();

// 2. 디스코드 클라이언트 생성
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 3. DisTube 플레이어 설정
client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    leaveOnFinish: true,
    plugins: [new YtDlpPlugin()]
});

client.commands = new Collection();

// 4. cogs 폴더에서 명령어 불러오기
const cogsPath = path.join(__dirname, 'cogs');
const commandFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(cogsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// 5. 봇 준비 완료 이벤트
client.once('ready', async () => {
    console.log(`로그인 완료: ${client.user.tag}`);
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commands);
    console.log('슬래시 명령어 등록 완료!');
});

// 6. 인터랙션(명령어) 실행 이벤트
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '명령어 실행 중 오류가 발생했어!', flags: 64 });
            } else {
                await interaction.reply({ content: '명령어 실행 중 오류가 발생했어!', flags: 64 });
            }
        } catch (err) {
            console.error('추가 에러 응답 전송 실패:', err);
        }
    }
});

// 7. 봇 로그인
client.login(process.env.DISCORD_TOKEN);
