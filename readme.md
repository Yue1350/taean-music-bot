# 🎵 태안 음악 봇 (Taean Music Bot)

Discord.js v14 및 Lavalink client를 기반으로 동작하는 고성능 디스코드 음악 봇 프로젝트입니다.  
전용 음악 채널을 통해 실시간 재생 상태 UI, 임베드 메시지 기반 UI 컨트롤, 대기열 관리 및 데이터베이스(MongoDB) 연동 기능을 제공합니다.

---

## 📌 주요 기능

- **🎵 전용 음악 채널 시스템**: 명령어 및 전용 채널 내 메시지 입력만으로 음악을 검색하고 재생할 수 있습니다.
- **🎛️ 실시간 인터랙티브 UI**:
  - 재생 정보, 진척도(Progress Bar), 현재 볼륨, 반복 모드 등을 디스코드 임베드로 시각화합니다.
  - 이전 곡, 일시정지/재생, 다음 곡, 반복 모드, 정지, 볼륨 조절, 대기열 초기화 버튼 제공.
- **📜 대기열(Queue) 페이징 관리**: 대기열 곡 목록을 페이지별로 탐색할 수 있습니다.
  - 정지(`⏹️`) 및 대기열 청소(`🗑️`) 버튼은 관리자 권한을 가진 사용자만 실행 가능합니다.
- **💾 Mongoose (MongoDB) 연동**: 길드별 음악 전용 채널 설정 및 UI 메시지 ID 정보를 데이터베이스에 안전하게 저장/로드합니다.
- **🌐 Web Keep-Alive 서버**: Render 등 클라우드 호스팅 환경을 고려한 Express 기반 포트 바인딩 및 Keep-Alive HTTP 서버 탑재.

---

## 🛠️ 기술 스택

- **Runtime**: Node.js
- **Framework & Libraries**:
  - `discord.js` v14
  - `lavalink-client`
  - `mongoose` (MongoDB ORM)
  - `express` & `http`
  - `dotenv`
LAVA_PORT=2333
LAVA_PASSWORD=youshallnotpass
LAVA_SECURE=false
