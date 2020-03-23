const NROWS = 10;
const NCOLS = 4;
const NCOLORS = 6;
const DUPLICATES = true;
const COLORS = ['red', 'green', 'yellow', 'brown', 'lightgray', 'purple'];

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

    drawBoard() {
        for (var i=0; i < NROWS; i++) {
            var rowDiv = $('<div class="row">');
            $('#board').append(rowDiv);

            let colorPegsRow = [];
            for (var j=0; j < NCOLS; j++) {
                let colDiv = $('<div class="color-peg">')
                rowDiv.append(colDiv);
            }

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
        for (var i=0; i < NCOLORS; i++) {
            var pegDiv = $('<div class="color-peg">');
            pegDiv.css({
                'background-color': COLORS[i]
            });
            $("#color-pegs").append(pegDiv);
            this.makeDraggable(pegDiv);
        }
    }

    drawScoreDraggables() {
        const SCORE_COLORS = ['lightgray', 'black'];
        for (var i=0; i < 2; i++) {
            var scoreDiv = $('<div class="score-peg">');
            scoreDiv.css({
                'background-color': SCORE_COLORS[i]
            });
            this.makeDraggable(scoreDiv);
            $("#score-pegs").append(scoreDiv);
        }
    }

    drawSetupRow() {
        var rowDiv = $('<div class="row">');
        $('#setup').append(rowDiv);

        for (var i=0; i < NCOLS; i++) {
            var guessDiv = $('<div class="color-peg">');
            $(rowDiv).append(guessDiv);
        }
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
                    });
                }
            });
        });
    }

    drawColors(rowIdx, childClass, colors) {
        let rowDiv = $('#board').children()[rowIdx];
        $(childClass, rowDiv).each((i, div) => {
            $(div).css({
                'background-color': colors[i]
            })
        });
    
    }

    drawScore(rowIdx, colors) {
        this.drawColors(rowIdx, 'div.score-peg', colors);
    }

    drawGuess(rowIdx, colors) {
        this.drawColors(rowIdx, 'div.color-peg', colors);
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
    }

    getColors(containerId, rowIdx, childClass) {
        return new Promise((resolve, reject) => {
            $('#go').click(() => {
                let row = $(containerId).children()[rowIdx]
                let colors = [];
                $(childClass, row).each((i, div) => {
                    colors.push($(div).css('background-color'));
                });
                resolve(colors);
            });
        });
    }

    async command(messageId) {
        return new Promise((resolve, reject) => {
            this.io.on(messageId, (data) => {
                return resolve(data);
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
        this.game.drawColorDraggables();
        $('#go').show();
        this.io.emit('ready');

        while(this.turn < NROWS) {
            this.status('Wait for other player to setup/score');
            let prevScore = await this.command('guess');
            if (this.turn > 0) {
                this.game.drawScore(this.turn-1, prevScore);
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
        this.io.emit('ready');

        await this.command('setup');
        this.game.activateSetupRow();
        this.status('Setup the challenge!');
        let setup = await this.getSetup();
        this.io.emit('setup', setup);

        while(this.turn < NROWS) {
            this.status('Wait for other player to guess');
            let guess = await this.command('score');
            this.game.drawGuess(this.turn, guess);
            this.game.activateScorePegsRow(this.turn);

            this.status('Your turn: Score the guess. Be careful!');
            let score = await this.getScore();
            this.io.emit('score', score);

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
        await this.command('hello');
        this.io.emit('hello', 'player1');

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
    let io_ = io('/mastermind');
    let game = new Game();
    let player = new Player(io_, game);
    player.play();
});
