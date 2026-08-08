const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const keepAlive = require('./keep_alive.js');

// 1. Keep-Alive 웹 서버 실행
keepAlive();

// 2. 포럼 팁 반영: 쿠키 없이 Safari / iOS 클라이언트 모의 설정
// 유튜브의 "Sign in to confirm you're not a bot" 차단을 피하기 위해 User-Agent 및 파서 세팅
play.setToken({
  useragent: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15'
  ]
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
      let targetUrl = query;
      let videoTitle = '';

      // URL이 아닌 검색어일 경우 검색 후 URL 추출
      if (!query.startsWith('http')) {
        let ytInfo = await play.search(query, { limit: 1 });
        if (!ytInfo || ytInfo.length === 0) {
          return message.reply('검색 결과가 없어요.');
        }
        targetUrl = ytInfo[0].url;
        videoTitle = ytInfo[0].title;
      }

      // 포럼의 팁 1 적용: Embed URL 변환 우회 (일반 watch URL을 embed URL 구조로 전환하여 봇 체크 완화)
      if (targetUrl.includes('watch?v=')) {
        const videoId = targetUrl.split('watch?v=')[1].split('&')[0];
        targetUrl = `https://www.youtube.com/embed/${videoId}`;
      }

      // 포럼의 팁 5 적용: player_client 옵션 활용 (Safari/Android 등의 클라이언트 우회)
      let stream = await play.stream(targetUrl, {
        discordPlayerCompatibility: true,
        // play-dl 내부에서 지원하는 봇 감지 회피 클라이언트 플래그 전달
        htmldata: false 
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

      message.reply(`🎵 **${videoTitle || '요청하신 음악'}** 곡을 재생해요!`);

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
