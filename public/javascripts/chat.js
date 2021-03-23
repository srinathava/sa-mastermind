class Chat {

    append(name, text) {
        let newDiv = $('<div class="message">');
        let nameDiv = $('<div class="name">').text(name + ' :');
        let textDiv = $('<div class="dialog">').text(text);

        newDiv.append(nameDiv);
        newDiv.append(textDiv);

        let hist = $('#history');
        hist.append(newDiv);
        hist.scrollTop(hist[0].scrollHeight);
    }

    constructor(io) {

        $("#input").keypress(function (e) {
            var code = (e.keyCode ? e.keyCode : e.which);
            if (code == 13) {
                let text = e.currentTarget.value;
                e.currentTarget.value = "";
                e.preventDefault();

                let name = $("#name").val();
                io.emit('chat', {name, text});
            }
        });

        io.on('chat', ({name, text}) => {
            this.append(name, text);
        });

        io.on('ping', () => {
            io.emit('pong');
        });

    }
}

export { Chat };
