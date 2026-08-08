require("dotenv").config();
const keepAlive = require("./keep_alive.js");
const fs = require("fs");
const path = require("path");

const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const play = require("play-dl");

keepAlive();

// 1. Render Secret Files 또는 로컬 쿠키 파일 경로 탐색
const secretCookiePath = "/etc/secrets/cookies.txt";
const localCookiePath = path.join(__dirname, "cookies.txt");

let finalCookiePath = null;

if (fs.existsSync(secretCookiePath)) {
  finalCookiePath = secretCookiePath;
} else if (fs.existsSync(localCookiePath)) {
  finalCookiePath = localCookiePath;
}

// 2. Netscape 포맷(cookies.txt)을 HTTP Cookie Header 형태(key=value; ...)로 변환하는 함수
function parseCookiesTxt(rawText) {
  const cookies = [];
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    // 빈 줄 및 주석(#) 제거
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // 탭(\t) 구분자로 분할 (Netscape 포맷은 7개 필드)
    const parts = trimmed.split("\t");
    if (parts.length >= 7) {
      const key = parts[5].trim();
      const value = parts[6].trim();
      if (key) {
        cookies.push(`${key}=${value}`);
      }
    }
  }

  return cookies.join("; ");
}

// 3. cookies.txt 정제 후 play-dl에 설정
if (finalCookiePath) {
  try {
    const rawCookieData = fs.readFileSync(finalCookiePath, "utf8");
    const formattedCookie = parseCookiesTxt(rawCookieData);

    if (formattedCookie) {
      play.setToken({
        youtube: {
          cookie: formattedCookie,
        },
      });
      console.log(`유튜브 cookies.txt 정제 및 적용 완료! (경로: ${finalCookiePath})`);
    } else {
      console.log("cookies.txt 파일에서 유효한 쿠키를 파싱하지 못했어요.");
    }
  } catch (err) {
    console.error("쿠키 파일 처리 중 오류 발생:", err);
  }
} else {
  console.log("cookies.txt 파일을 찾을 수 없어 쿠키 없이 실행합니다.");
}

// (이하 client 및 messageCreate 이벤트 로직은 동일)

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
    const query = args.join(" ");
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) return message.reply("음성 채널에 먼저 들어와 주세요!");
    if (!query) return message.reply("검색어나 링크를 입력해 주세요!");

    try {
      let stream;
      const ytValidate = await play.validate(query);

      if (ytValidate === "yt_video") {
        stream = await play.stream(query);
      } else {
        const searchResults = await play.search(query, { limit: 1 });
        if (!searchResults.length) return message.reply("검색 결과가 없어요!");
        stream = await play.stream(searchResults[0].url);
      }

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });
      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      message.reply("🎵 노래 재생을 시작할게요!");

      const safeDestroy = () => {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      };

      player.on(AudioPlayerStatus.Idle, () => safeDestroy());
      player.on("error", (error) => {
        console.error("재생 중 에러 발생:", error);
        safeDestroy();
      });
    } catch (error) {
      console.error(error);
      message.reply("노래를 불러오는 중에 문제가 발생했어요.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
