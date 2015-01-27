var sandbox = require('./main.js');



// Run strict
sandbox.eval('done(null, true)', function(err, result){
    if (err) {
        console.log(err.stack||err.message);
    } else {
        console.log('Done', result);
    }
});

// Run delayed
sandbox.eval('setTimeout(function(){ done(null, true); }, 300)', function(err, result){
    if (err) {
        console.log(err.stack||err.message);
    } else {
        console.log('Done', result);
    }
});