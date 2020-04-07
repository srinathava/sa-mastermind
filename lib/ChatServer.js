var logger = require('./Logger');

function log(msg) {
    logger.log({
        level: 'info',
        label: 'ChatServer',
        message: msg
    });
}

class ChatServer {
    constructor(io) {
        var sockets = [];

        io.on('connect', (socket) => {
            log('got new connection from ' + socket.id + '!');
            sockets.push(socket);
            socket.on('chat', data => {
                let {name, text} = data;
                log('broadcasting to everyone! name = ' + name + ', message = ' + text);
                io.emit('chat', {name, text});
            });

            socket.on('disconnect', () => {
                log('got disconnect from ' + socket.id);
            });

        });

        setTimeout(() => {
            io.emit('ping');
        }, 1000);
    }
}

module.exports = ChatServer;
