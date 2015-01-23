var sandbox = require('./main.js');



// Run strict
sandbox.run('done(null, true)', function(err){
    if (err) {
        console.log(err.stack);
    } else {
        console.log('Done');
    }
});

// Run delayed
sandbox.run('setTimeout(function(){ done(null, true); }, 300)', function(err){
    if (err) {
        console.log(err.stack);
    } else {
        console.log('Done');
    }
});