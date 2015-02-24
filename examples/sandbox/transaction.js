var Sandbox = require('../../helpers/sandbox');
require('colors');

var sandbox = new Sandbox({
    plugins : {
        process : {
            stdio : 'inherit',
            limitCpu : 100
        },
        api: {
            log : true
        },
        transaction : true
    }
});

var transaction = {
    id : 1,
    asset : {
        input : {data:{}},
        script : {
            code : "transaction.run = function(done, input){ test(function(err){ done(null, 'TRUE'); }); };"
        }
    }
};

sandbox.api.bind("test", function(done){
    console.log('Call test');
    done();
});

sandbox.transaction.exec(transaction, function(err, result){
    console.log(err, result, this.apiLog);
});
