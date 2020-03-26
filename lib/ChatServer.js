class ChatServer {
    constructor(io) {
        var sockets = [];

        io.on('connect', (socket) => {
            console.log('ChatServer: got new connection from ' + socket.id + '!');
            sockets.push(socket);
            socket.on('chat', data => {
                let {name, text} = data;
                console.log('broadcasting to everyone! name = ' + name + ', message = ' + text);
                io.emit('chat', {name, text});
            });
        });
    }
}

module.exports = ChatServer;
