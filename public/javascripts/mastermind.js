import { Chat } from './chat.js';

const NROWS = 10;
const NCOLS = 4;
const COLORS = ['red', 'green', 'yellow', 'lightblue', 'lightgray', 'purple'];
const SCORE_COLORS = ['white', 'lightgray', 'black'];

class Game {
    constructor() {
        this.role = 'none';
    }

    makeDraggable(div) {
        $(div).draggable({
            'helper' : 'clone',
            'appendTo' : $('body')
        });
    }

    appendColorPegsRow(parent) {
        var rowDiv = $('<div class="row">');
        $(parent).append(rowDiv);

        for (var j=0; j < NCOLS; j++) {
            let colDiv = $('<div class="color-peg">')
            rowDiv.append(colDiv);
        }

        return rowDiv;
    }

    drawBoard() {
        for (var i=0; i < NROWS; i++) {
            var rowDiv = this.appendColorPegsRow('#board');

            var rowScoreDiv = $('<div class="rowScore">');
            rowDiv.append(rowScoreDiv);

            let scorePegsRow = [];
            for (var j=0; j < NCOLS; j++) {
                let scoreDiv = $('<div class="score-peg">')
                scorePegsRow.push(scoreDiv);
                rowScoreDiv.append(scoreDiv);
            }
        }
    }

    drawColorDraggables() {
        for (var i=0; i < COLORS.length; i++) {
            var pegDiv = $('<div class="color-peg">').data('color', i);
            pegDiv.css({
                'background-color': COLORS[i]
            });
            $("#color-pegs").append(pegDiv);
            this.makeDraggable(pegDiv);
        }
    }

    drawScoreDraggables() {
        for (var i=0; i < SCORE_COLORS.length; i++) {
            var scoreDiv = $('<div class="score-peg">').data('color', i);
            scoreDiv.css({
                'background-color': SCORE_COLORS[i]
            });
            this.makeDraggable(scoreDiv);
            $("#score-pegs").append(scoreDiv);
        }
    }

    drawSetupRow() {
        this.appendColorPegsRow('#setup');
    }

    activateRow(containerId, idx, klass) {
        let rowDiv = $(containerId).children()[idx];
        $(klass, rowDiv).each((i, div) => {
            $(div).css({
                'box-shadow': 'inset 0 0 5px red'
            });
            $(div).droppable({
                accept: klass,
                drop: (event, ui) => {
                    $(div).css({
                        'box-shadow': 'none',
                        'background-color' : ui.draggable.css('background-color')
                    }).data('color', ui.draggable.data('color'));
                }
            });
        });
    }

    drawColors(rowIdx, parentId, childClass, colorIdxs, colorMap) {
        let rowDiv = $(parentId).children()[rowIdx];
        $(childClass, rowDiv).each((i, div) => {
            $(div).css({
                'background-color': colorMap[colorIdxs[i]]
            })
        });
    
    }

    revealSetup(colors) {
        this.drawColors(0, "#setup", 'div.color-peg', colors, COLORS);
    }

    drawScore(rowIdx, colors) {
        this.drawColors(rowIdx, "#board", 'div.score-peg', colors, SCORE_COLORS);
    }

    drawGuess(rowIdx, colors) {
        this.drawColors(rowIdx, "#board", 'div.color-peg', colors, COLORS);
    }

    activateSetupRow() {
        this.activateRow('#setup', 0, 'div.color-peg');
    }

    activateColorPegsRow(idx) {
        this.activateRow('#board', idx, 'div.color-peg');
    }

    activateScorePegsRow(idx) {
        this.activateRow('#board', idx, 'div.score-peg');
    }

    status(message) {
        $('#message').text(message);
    }
}

class Base {
    constructor(io, game) {
        this.io = io;
        this.game = game;
        this.turn = 0;

        this.io.on('disconnect', () => {
            console.log('disconnected!');
        });
    }

    getColors(containerId, rowIdx, childClass) {
        return new Promise((resolve) => {
            $('#go').click(() => {
                let row = $(containerId).children()[rowIdx]
                let colors = [];
                $(childClass, row).each((i, div) => {
                    colors.push($(div).data('color'));
                });
                resolve(colors);
            });
        });
    }

    async command(messageId) {
        return new Promise((resolve) => {
            this.io.on(messageId, (...args) => {
                console.log('sending acknowledgement for ' + messageId);
                this.io.emit('ack_' + messageId);
                return resolve(...args);
            });
        });
    }

    status(message) {
        this.game.status(message);
    }
}

class Guesser extends Base {
    constructor(io, game) {
        super(io, game);
    }

    async getGuess() {
        return await this.getColors('#board', this.turn, 'div.color-peg');
    }

    async go() {
        this.game.drawSetupRow();
        this.game.drawColorDraggables();
        $('#go').show();

        while (1) {
            this.status('Wait for other player to setup/score');
            let {score, setup, won, gameover} = await this.command('guess');
            if (this.turn > 0) {
                this.game.drawScore(this.turn-1, score);
            }

            if (gameover) {
                this.game.revealSetup(setup);
                if (won) {
                    this.status('<Happy Drum Beat> You won!');
                } else {
                    this.status('<Sad Trombone Music> You lost!');
                }
                break;
            }

            this.game.activateColorPegsRow(this.turn);
            this.status('Your turn: Guess the colors!');
            let guess = await this.getGuess();

            this.io.emit('guess', guess);

            this.turn += 1;
        }

    }
}

class Scorer extends Base {
    constructor(io, game) {
        super(io, game);
    }

    async getSetup() {
        return await this.getColors('#setup', 0, 'div.color-peg');
    }

    async getScore() {
        return await this.getColors('#board', this.turn, 'div.score-peg');
    }

    async go() {
        this.game.drawSetupRow();
        this.game.drawColorDraggables();
        this.game.drawScoreDraggables();
        $('#go').show();

        await this.command('setup');
        this.game.activateSetupRow();
        this.status('Setup the challenge!');

        let setup = await this.getSetup();
        this.io.emit('setup', setup);

        while (1) {
            this.status('Wait for other player to guess');

            let {guess, won, gameover} = await this.command('score');
            if (gameover) {
                if (won) {
                    this.status('Game over! The other player won!');
                } else {
                    this.status('Game over! The other player lost!');
                }
                break;
            }

            this.game.drawGuess(this.turn, guess);
            this.game.activateScorePegsRow(this.turn);

            this.status('Your turn: Score the guess. Be careful!');
            while (1) {
                let score = await this.getScore();
                this.io.emit('score', score);

                let scoreok = await this.command('scoreok');
                if (scoreok) {
                    break;
                } else {
                    this.status('Oops! You did a booboo! Try to score again!!');
                }
            }

            this.turn += 1;
        }
    }
}

class Player extends Base {
    constructor(io, game) {
        super(io, game);
        this.game.drawBoard();
        this.strategy = undefined;
    }

    async play() {
        let uuid = await this.command('hello');
        this.io.emit('hello', 'player1', uuid);

        this.io.on('reconnect', () => {
            console.log('Reconnected!');
            this.io.emit('hello', 'player1', uuid);
        });

        this.status('Waiting for other player!');
        let role = await this.command('role');
        if (role == 'guesser') {
            this.status('You are the guesser!');
            this.strategy = new Guesser(this.io, this.game);
        } else {
            this.status('You are the scorer!');
            this.strategy = new Scorer(this.io, this.game);
        }
        this.strategy.go();
    }
}

$(function() {
    /* global io */
    let io_ = io('/mastermind');
    let game = new Game();
    let player = new Player(io_, game);
    player.play();

    /* eslint-disable no-new */
    new Chat(io_);
});
