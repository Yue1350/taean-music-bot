require("dotenv").config(); // .env 파일의 환경변수를 process.env로 로드해요

const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");

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
      return message.reply("올바른 유튜브 URL을 입력해 주세요! (예: !play https://www.youtube.com/watch?v=...)");
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const stream = ytdl(url, {
        filter: "audioonly",
        highWaterMark: 1 << 25,
      });

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });
      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      message.reply("🎵 노래 재생을 시작할게요!");

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      player.on("error", (error) => {
        console.error("재생 중 에러 발생:", error);
        message.channel.send("노래 재생 중 오류가 발생했어요.");
        connection.destroy();
      });
    } catch (error) {
      console.error(error);
      message.reply("노래를 불러오는 중에 문제가 발생했어요.");
    }
  }
});

// 환경변수 DISCORD_TOKEN을 사용해 로그인해요
client.login(process.env.DISCORD_TOKEN);
