const http = require('http');

function keepAlive() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot is running!');
    });

    const PORT = 8080;
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`웹 서버가 포트 8080번에서 실행 중이야!`);
    });
}

module.exports = keepAlive;
