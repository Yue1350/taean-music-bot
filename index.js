require("dotenv").config();
const keepAlive = require("./keep_alive.js");

const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");

keepAlive();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`${client.user.tag} 봇이 준비되었어요!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "play") {
    const url = args[0];
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
      return message.reply("음성 채널에 먼저 들어와 주세요!");
    }
    if (!url || !ytdl.validateURL(url)) {
      return message.reply("올바른 유튜브 URL을 입력해 주세요!");
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      // 쿠키 설정으로 유튜브 IP 차단 우회
      const agentOptions = process.env.YOUTUBE_COOKIE
        ? {
            requestOptions: {
              headers: {
                cookie: process.env.YOUTUBE_COOKIE,
              },
            },
          }
        : {};

      const stream = ytdl(url, {
        filter: "audioonly",
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
        ...agentOptions,
      });

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });
      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      message.reply("🎵 노래 재생을 시작할게요!");

      // 안전한 연결 종료 처리 함수
      const safeDestroy = () => {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      };

      player.on(AudioPlayerStatus.Idle, () => {
        safeDestroy();
      });

      player.on("error", (error) => {
        console.error("재생 중 에러 발생:", error);
        message.channel.send("노래 재생 중 오류가 발생했어요.");
        safeDestroy();
      });
    } catch (error) {
      console.error(error);
      message.reply("노래를 불러오는 중에 문제가 발생했어요.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
