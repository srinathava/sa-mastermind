console.log("hello world");
var socket = io('/rps');

socket.on('hello', () => {
    console.log('got hello message');
});

socket.on('move', () => {
    console.log('got move command');
});

socket.on('done', (outcome) => {
    console.log('done! ' + outcome);
});
