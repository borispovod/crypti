var sandbox = require('./main.js');

var fs = require('fs');
var path = require('path');

// Add API methods
sb.api.module({
    readdir : function(done, dir) {
        fs.readdir(path.resolve(__dirname, dir), done);
    }
});

// Run API method: list git dir
sb.run('readdir("../..", done)', function(err, result){
    if (err) {
        console.error(err.stack || err);
    } else {
        console.log(result);
    }
});

