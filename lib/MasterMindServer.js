
var ChatServer = require('./ChatServer');

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        return new Promise((resolve) => {
            player.socket.on(messageId, (data) => {
                resolve(data);
            });
        });
    }

    iscorrect(setup_, guess_, score) {
        let setup = setup_.slice(0);
        let guess = guess_.slice(0);
        console.log('iscorrect: setup = ' + setup + ', guess = ' + guess + ', score = ' + score);

        let nBlackCorrect = 0;
        let nWhiteCorrect = 0;
        guess.forEach((g, idx) => {
            if (setup[idx] == g) {
                nBlackCorrect += 1;
                setup[idx] = -1;
                guess[idx] = -2;
            }
        });

        guess.forEach((g, idx) => {
            let sidx = setup.indexOf(g);
            if (sidx >= 0) {
                nWhiteCorrect += 1;
                setup[sidx] = -1;
                guess[idx] = -2;
            }
        });

        let nWhite = 0;
        let nBlack = 0;
        score.forEach(s => {
            if (s == 1) {
                nWhite += 1;
            } else if (s == 2) {
                nBlack += 1;
            }
        });

        return (nWhite == nWhiteCorrect) && (nBlack == nBlackCorrect);
    }

    async play() {
        console.log('Starting new game');

        // hopefully this makes it a bit more robust.
        await sleep(500);

        console.log('sending role guesser to ' + this.player1.socket.id);
        this.ack(this.player1, 'role', 'guesser');

        console.log('sending role scorer to ' + this.player2.socket.id);
        this.ack(this.player2, 'role', 'scorer');

        console.log('asking player2 to setup');
        let setup = await this.ack(this.player2, 'setup');
        console.log('player2 setup ' + setup);

        let score = '';
        while(this.turns < 10) {
            console.log('asking player1 to guess');
            let guess = await this.ack(this.player1, 'guess', score);
            console.log('player1 guessed with ' + guess);

            while (1) {
                console.log('asking player2 to score');
                score = await this.ack(this.player2, 'score', guess);
                console.log('player2 scored with ' + score);

                let ok = this.iscorrect(setup, guess, score);
                this.ack(this.player2, 'scoreok', ok);
                if (ok) {
                    break;
                } else {
                    console.log('player made a mistake! Asking to re-score!')
                }
            }
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
        this.chat = new ChatServer(this.io, 'Player1');
    }

    newplayer() {
        return new Promise((resolve) => {
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

