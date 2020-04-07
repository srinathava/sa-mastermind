var ChatServer = require('./ChatServer');
var logger = require('./Logger');
var uuid_ = require('uuid');
const genuuid = uuid_.v4;

function log(msg) {
    logger.log({
        level: 'info',
        label: 'Mastermind',
        message: msg
    });
}

class Player {
    constructor(name, uuid, socket) {
        this.name = name;
        this.uuid = uuid;

        this.status = undefined;
        this.socket = undefined;

        this.cbFcns = [];
        this.setSocket(socket);
    }

    setSocket(socket) {
        this.socket = socket;
        this.status = 'alive';

        this.socket.once('disconnect', () => {
            log('socket disconnected!');
            this.status = 'dead';
        });

        for (let { msgId, cbFcn } of this.cbFcns) {
            this.socket.once(msgId, (...args) => {
                cbFcn(...args);
            });
        }
    }

    on(msgId, cbFcn) {
        this.cbFcns.push({msgId, cbFcn});

        this.socket.once(msgId, (...args) => {
            cbFcn(...args);
        });
    }

    emit(...args) {
        this.socket.emit(...args);
    }

    async sendCmd(msgId, ...args) {
        let numAttempts = 0;
        const MAX_ATTEMPTS = 10;

        return new Promise((resolve, reject) => {

            this.socket.emit(msgId, ...args);

            let retry = setInterval(() => {
                if (numAttempts < MAX_ATTEMPTS) {
                    this.socket.emit(msgId, ...args);
                    numAttempts += 1;
                } else {
                    clearInterval(retry);
                    log('No acknowledgement for ' + msgId);
                    reject(new Error('Too many attempts'));
                }
            }, 100);

            this.on('ack_' + msgId, () => {
                log('Received acknowldgement for ' + msgId);
                clearInterval(retry);
                resolve();
            });
        });
    }

    async getReply(msgId, ...args) {
        await this.sendCmd(msgId, ...args);
        return new Promise((resolve) => {
            this.on(msgId, (...data) => {
                resolve(...data);
            });
        });
    }
}

class PlayerRegistry {
    constructor(io, cbFcn) {
        let uuidToPlayerMap = {};

        io.on('connection', (socket) => {
            log('new socket connection');
            socket.emit('hello', genuuid());

            socket.on('hello', (name, uuid) => {
                let player = uuidToPlayerMap[uuid];
                if (player === undefined) {
                    log('Got new player');
                    player = new Player(name, uuid, socket);
                    uuidToPlayerMap[uuid] = player;
                    cbFcn(player);
                } else {
                    log('Fixing up player socket');
                    player.setSocket(socket);
                }
            });
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

    iscorrect(setup_, guess_, score) {
        let setup = setup_.slice(0);
        let guess = guess_.slice(0);
        log('iscorrect: setup = ' + setup + ', guess = ' + guess + ', score = ' + score);

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
        log('Starting new game');

        log('sending role guesser to ' + this.player1.socket.id);
        await this.player1.sendCmd('role', 'guesser');

        log('sending role scorer to ' + this.player2.socket.id);
        await this.player2.sendCmd('role', 'scorer');

        log('asking player2 to setup');
        let setup = await this.player2.getReply('setup');
        log('player2 setup ' + setup);

        let score = '';
        while(this.turns < 10) {
            log('asking player1 to guess');
            let guess = await this.player1.getReply('guess', score);
            log('player1 guessed with ' + guess);

            while (1) {
                log('asking player2 to score');
                score = await this.player2.getReply('score', guess);
                log('player2 scored with ' + score);

                let ok = this.iscorrect(setup, guess, score);
                await this.player2.sendCmd('scoreok', ok);
                if (ok) {
                    break;
                } else {
                    log('player made a mistake! Asking to re-score!')
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
                log('immediately resolving player request');
                resolve(player);
                return;
            }

            log('queueing player request');
            this.pendingNewPlayerResolvers.push(resolve);
        });
    }

    async play() {
        /* eslint-disable no-new */
        new PlayerRegistry(this.io, (player) => {
            log('new player ' + player.name + ' : ' + player.uuid);

            log('current pending request len = ' + this.pendingNewPlayerResolvers.length);
            if (this.pendingNewPlayerResolvers.length > 0) {
                log('resolving pending request');
                let resolver = this.pendingNewPlayerResolvers.splice(0, 1)[0];
                resolver(player);
            } else {
                log('queueing player');
                this.pendingPlayers.push(player);
            }
        }); 

        let players = [];
        while(1) {
            log('waiting for players');
            players.push(await this.newplayer());

            players = players.filter(player => player.status == 'alive');
            log('player length after filtering = ' + players.length);

            if (players.length >= 2) {
                let [player1, player2] = players.splice(0, 2);
                let game = new Game(this.io, player1, player2);
                game.play();
            }
        }
    }

}

module.exports = MasterMind;

