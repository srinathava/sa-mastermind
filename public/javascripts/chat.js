class Chat {

    append(name, text) {
        let newDiv = $('<div class="message">');
        let nameDiv = $('<div class="name">').text(name);
        let textDiv = $('<div class="dialog">').text(text);

        newDiv.append(nameDiv);
        newDiv.append(textDiv);

        let hist = $('#history');
        hist.append(newDiv);
        hist.scrollTop(hist.height());
    }

    constructor(io, name) {

        $("#input").keypress(function (e) {
            var code = (e.keyCode ? e.keyCode : e.which);
            if (code == 13) {
                let text = e.currentTarget.value;
                e.currentTarget.value = "";
                e.preventDefault();

                io.emit('chat', {name, text});
                return true;
            }
        });

        io.on('chat', data => {
            let {name, text} = data;
            this.append(name, text);
        });

    }
}

export { Chat };
