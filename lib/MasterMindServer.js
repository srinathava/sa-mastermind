class Player {
    constructor(name, socket) {
        this.name = name;
        this.socket = socket;
        this.status = 'alive';
        this.socket.on('disconnect', () => {
            console.log('socket disconnected!');
            this.status = 'dead';
        });
        this.socket.on('reconnect', () => {
            console.log('socket reconnecting!');
        });
    }
}

class Game {
    constructor(io, player1, player2) {
        this.io = io;
        this.player1 = player1;
        this.player2 = player2;
        this.turns = 0;
    }

    send(player, messageId, data) {
        player.socket.emit(messageId, data);
    }

    ack(player, messageId, data) {
        player.socket.emit(messageId, data);
        return new Promise((resolve, reject) => {
            player.socket.on(messageId, (data) => {
                resolve(data);
            });
        });
    }

    async play() {
        console.log('Starting new game');

        console.log('sending role guesser to ' + this.player1.socket.id);
        this.ack(this.player1, 'role', 'guesser');

        console.log('sending role scorer to ' + this.player2.socket.id);
        this.ack(this.player2, 'role', 'scorer');

        this.ack(this.player1, 'ready');
        this.ack(this.player2, 'ready');

        console.log('asking player2 to setup');
        let setup = await this.ack(this.player2, 'setup');

        let score = '';
        while(this.turns < 10) {
            console.log('asking player1 to guess');
            let guess = await this.ack(this.player1, 'guess', score);

            console.log('asking player2 to score');
            score = await this.ack(this.player2, 'score', guess);

            this.io.emit('update_score', {guess, score});
        }
    }
}

class MasterMind {

    constructor(io) {
        this.io = io.of('/mastermind');

        this.pendingPlayers = [];
        this.pendingNewPlayerResolvers = [];

        this.play();
    }

    newplayer() {
        return new Promise((resolve, reject) => {
            if (this.pendingPlayers.length > 0) {
                let player = this.pendingPlayers.splice(0, 1)[0]; 
                console.log('immediately resolving player request');
                resolve(player);
                return;
            }

            console.log('queueing player request');
            this.pendingNewPlayerResolvers.push(resolve);
        });
    }

    async play() {
        this.io.on('connection', (socket) => {
            console.log('new socket connection');
            socket.emit('hello');
            socket.on('hello', (name) => {
                let player = new Player(name, socket);
                console.log('new player ' + player.name + ' at ' + player.socket.id);

                console.log('current pending request len = ' + this.pendingNewPlayerResolvers.length);
                if (this.pendingNewPlayerResolvers.length > 0) {
                    console.log('resolving pending request');
                    let resolver = this.pendingNewPlayerResolvers.splice(0, 1)[0];
                    resolver(player);
                } else {
                    console.log('queueing player');
                    this.pendingPlayers.push(player);
                }
            });
        });

        let players = [];
        while(1) {
            console.log('waiting for players');
            players.push(await this.newplayer());

            for (let player of players) {
                console.log('player : ' + player.name + 
                            ', status = ' + player.status + 
                            ', socket.id = ' + player.socket.id);
            }

            players = players.filter(player => player.status == 'alive');
            console.log('player length after filtering = ' + players.length);

            if (players.length >= 2) {
                let [player1, player2] = players.splice(0, 2);
                let game = new Game(this.io, player1, player2);
                game.play();
            }
        }
    }

}

module.exports = MasterMind;

