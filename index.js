const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const keepAlive = require('./keep_alive.js');

// 1. Keep-Alive 웹 서버 실행
keepAlive();

// 2. play-dl 쿠키 미사용 회피 세팅
play.setToken({
  youtube: {
    cookie: ""
  }
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = '!';

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === '재생' || command === 'play') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('먼저 음성 채널에 입장해 주세요!');
    }

    const query = args.join(' ');
    if (!query) {
      return message.reply('재생할 노래 제목이나 유튜브 링크를 입력해 주세요.');
    }

    try {
      let ytInfo = await play.search(query, { limit: 1 });
      if (!ytInfo || ytInfo.length === 0) {
        return message.reply('검색 결과가 없어요.');
      }

      let stream = await play.stream(ytInfo[0].url, {
        discordPlayerCompatibility: true
      });

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      message.reply(`🎵 **${ytInfo[0].title}** 곡을 재생해요!`);

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

    } catch (error) {
      console.error(error);
      message.reply('유튜브 스트리밍을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }
});

// DISCORD_TOKEN 환경 변수로 로그인
client.login(process.env.DISCORD_TOKEN);
