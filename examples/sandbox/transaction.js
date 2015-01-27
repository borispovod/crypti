var Sandbox = require('../../helpers/sandbox');
require('colors');

var sandbox = new Sandbox({
    plugins : {
        process : {
            stdio : 'inherit'
        },
        api: true,
        transaction : true
    }
});

var transaction = {
    assets : {
        script : {
            input : {},
            code : "(function(done, input){ done(null, 'TRUE'); })"
        }
    }
};

sandbox.transaction.exec(transaction, function(err, result){
    console.log(err, result);
});
