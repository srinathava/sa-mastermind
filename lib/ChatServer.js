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

        io.on('disconnect', (socket) => {
            console.log('Chatserver: got disconnect from ' + socket.id);
        })

        setTimeout(() => {
            io.emit('ping');
        }, 1000);
    }
}

module.exports = ChatServer;
