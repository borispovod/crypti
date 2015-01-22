var Sandbox = require('../../helpers/sandbox');

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
var path = require('path');

// Add API methods
sb.api.module({
    readdir : function(done, dir) {
        fs.readdir(path.resolve(__dirname, dir), done);
    }
});

// Run setTimeout method
sb.run('setTimeout(done.bind(null, null, true), 500)', function(err, result){
    if (err) {
        console.error(err.stack || err);
    } else {
        console.log(result);
    }

    // Run API method: list git dir
    sb.run('readdir("../..", done)', function(err, result){
        if (err) {
            console.error(err.stack || err);
        } else {
            console.log(result);
        }
    });
});