var spawn     = require('child_process').spawn;
var children  = [];

process.on('exit', function() {
    console.log('killing', children.length, 'child processes');
    children.forEach(function(child) {
        child.kill();
    });
});

children.push(spawn('node', [ 'app.js' ]));