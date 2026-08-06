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
            // 이미 만료되었거나 응답할 수 없는 상태인 경우 무시
            console.error('추가 에러 응답 전송 실패:', err);
        }
    }
});
