var Sandbox = require('./sandbox.js');

var sb = new Sandbox({
    plugins : {
        process : {
            stdio : [null, 1, 2, 'ipc']
        },
        tcp : true,
        timer: {
            limit : 20000
        },
        api: {
            transport: 'tcp'
        }
    }
});

var fs = require('fs');

sb.api.module({
    readdir : function(done, dir) {
        fs.readdir(__dirname + '/' + dir, done);
    }
});

sb.run('setTimeout(done.bind(null, null, true), 500)', function(err, result){
    if (err) {
        console.error('<-', err.stack || err);
    } else {
        console.log('<-', result);
    }

    sb.run('readdir(".", done)', function(err, result){
        if (err) {
            console.error('<-', err.stack || err);
        } else {
            console.log('<-', result);
        }
    });
});
