const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { MessageContent, GuildMessages, Guilds, DirectMessages } = GatewayIntentBits;
const mineflayer = require('mineflayer');

const token = 'TOKEN';
const logChannelId = 'LOG_CHANNEL';
const client = new Client({ 
    intents: [Guilds, GuildMessages, MessageContent, DirectMessages],
    partials: [Partials.Channel] 
});

client.login(token);

const userSessions = {};

client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    registerCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;
    const userId = user.id;

    switch (commandName) {
        case 'settings':
            handleSettingsCommand(interaction, userId, options);
            break;
        case 'connect':
            await handleConnectCommand(interaction, userId);
            break;
        case 'disconnect':
            await handleDisconnectCommand(interaction, userId);
            break;
        case 'setcommand':
            await handleSetCommand(interaction, userId, options);
            break;
        case 'setdelay':
            await handleSetDelayCommand(interaction, userId, options);
            break;
        case 'help':
            await handleHelpCommand(interaction);
            break;
    }
});

function handleSettingsCommand(interaction, userId, options) {
    const host = options.getString('host');
    const port = options.getInteger('port');
    const username = options.getString('username');

    userSessions[userId] = {
        host,
        port,
        username,
        connect: false,
        delay: 5000  
    };

    interaction.reply(`Saved connection settings. IP: \`${host}:${port}\`, username: \`${username}\``);
}

async function handleConnectCommand(interaction, userId) {
    const session = userSessions[userId];

    if (!session || !session.host || !session.port || !session.username) {
        await interaction.reply('You need to set up the settings first with the `/settings` command.');
        return;
    }

    await interaction.reply(`Trying to connect to the server...`);

    session.connect = true;
    session.bot = createBot(session, userId);
}

async function handleDisconnectCommand(interaction, userId) {
    const session = userSessions[userId];

    if (session && session.bot) {
        session.connect = false;
        session.bot.end();
        delete session.bot;
        await interaction.reply('Disconnected from the server.');
    } else {
        await interaction.reply('I was not connected to the server.');
    }
}

async function handleSetCommand(interaction, userId, options) {
    const command = options.getString('command');

    if (!userSessions[userId]) {
        userSessions[userId] = {};
    }

    userSessions[userId].commandOnConnect = command;
    await interaction.reply({ content: `I will now execute the command \`${command}\` after each connection to the server.`, ephemeral: true });
}

async function handleSetDelayCommand(interaction, userId, options) {
    const delay = options.getInteger('delay');

    if (!userSessions[userId]) {
        userSessions[userId] = {};
    }

    userSessions[userId].delay = delay * 1000;
    await interaction.reply({ content: `I will now wait ${delay} seconds before reconnecting to the server.`});
}

async function handleHelpCommand(interaction) {
    const helpMessage = `
**Hello!**

I can stand in for you on the server while you handle your tasks.

Before you start, set up the server connection settings:
\`/settings <host> <port> <username>\`
Please note that I only connect to servers **1.18 to 1.20.4 with cracked versions**.

To connect, send \`/connect\`, and to disconnect, send \`/disconnect\`.

To log in, **I can execute a command** when I enter the server. You can set it up with this command:
\`/setcommand <command>\`.
I won't show this command to anyone, so feel free to **enter your password there**.

If the server goes for a restart and I get kicked, I will **try to reconnect after 5 seconds**. If you want to set your own delay, use:
\`/setdelay <delay_in_seconds>\`.

Everything you set up is **only for you**.
    `;
    await interaction.reply({ content: helpMessage});
}

function createBot(session, userId) {
    const bot = mineflayer.createBot({
        host: session.host,EndlesMC.aternos.me:30100
        port: session.port,30100
        username: session.BOT,
        auth: 'offline'
    });

    let errorHandled = false;

    bot.on('spawn', async () => {
        console.log(`Mineflayer bot logged in as ${bot.username}`);
        const logChannel = await client.channels.fetch(logChannelId);

        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`Connected to the server \`${session.host}:${session.port}\` as \`${session.username}\`.`);
        }

        if (session.commandOnConnect) {
            bot.chat(session.commandOnConnect);
        }
    });

    bot.on('end', async () => {
        if (!errorHandled) {
            errorHandled = true;
            await handleBotDisconnection(userId, session);
        }
    });

    bot.on('error', async error => {
        if (!errorHandled) {
            errorHandled = true;
            await handleBotError(userId, session, error);
        }
    });

    return bot;
}

async function handleBotDisconnection(userId, session) {
    console.log(`Bot disconnected from ${session.host}:${session.port}`);

    if (userSessions[userId] && userSessions[userId].connect === true) {
        const logChannel = await client.channels.fetch(logChannelId);

        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`<@${userId}>, I was disconnected from the server \`${session.host}:${session.port}\`. I will try to reconnect in ${session.delay / 1000} seconds.`);
        }

        setTimeout(() => {
            if (userSessions[userId].connect) {
                userSessions[userId].bot = createBot(session, userId, {
                    reply: async (message) => {
                        if (logChannel && logChannel.isTextBased()) {
                            await logChannel.send(message);
                        }
                    }
                });
            }
        }, session.delay);
    }
}

async function handleBotError(userId, session, error) {
    console.error('Bot error:', error);

    if (userSessions[userId] && userSessions[userId].connect === true) {
        const logChannel = await client.channels.fetch(logChannelId);

        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`<@${userId}>, I could not connect to \`${session.host}:${session.port}\`. Ending session, send \`/connect\` to try again.`);
        }
    
        userSessions[userId].connect = false;

        if (session && session.bot) {
            session.bot.removeAllListeners();
            session.bot.end();
            delete session.bot;
        }
    }
}

function registerCommands() {
    const commands = [
        {
            name: 'settings',
            description: 'Set connection settings',
            options: [
                { name: 'host', description: 'Server host', type: 3, required: true },
                { name: 'port', description: 'Server port', type: 4, required: true },
                { name: 'username', description: 'Username', type: 3, required: true }
            ]
        },
        { name: 'connect', description: 'Connect to the server' },
        { name: 'disconnect', description: 'Disconnect from the server' },
        {
            name: 'setcommand',
            description: 'Set command to execute upon connection',
            options: [{ name: 'command', description: 'Command to execute', type: 3, required: true }]
        },
        {
            name: 'setdelay',
            description: 'Set delay before reconnecting',
            options: [{ name: 'delay', description: 'Delay in seconds', type: 4, required: true }]
        },
        { name: 'help', description: 'Get command help' }
    ];

    client.application.commands.set(commands);
}
