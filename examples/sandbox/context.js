var Sandbox = require('../../helpers/sandbox');

var sandbox = new Sandbox({
    plugins : {
        process : true,
        context : {
            async : true
        }
    }
});

sandbox.eval('done(null, typeof async);', function(err, result){
    console.log(err, result);
});
