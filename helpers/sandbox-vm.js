var vm = require('vm');

if (! process.send) {
    console.error('IPC mode only');
    process.exit(1);
}

// Process bindings

process.on('uncaughtError', function(err){
    onError(err);
});

process.on('message', function(message){
    if (!message || typeof message !== 'object') return;

    if (message.type === 'execute') {

        execute(message.code, function(err, result) {
            if (err) onError(err);
            else onResult(result);
        });
    }
});

process.send({
    type : 'handshake'
});

function execute(code, callback) {
    var fn;
    var wrapped = '(function(){'+code+'\n});';
    try {
        fn = vm.runInNewContext(wrapped, createContext(callback), 'sandbox');
    } catch (err) {
        // TODO Mark as parse error
        return onError(err);
    }

    // Call time error
    try {
        fn();
    } catch (err) {
        // TODO Mark as calltime error
        onError(err);
    }
}


// Helper function
function onError(error) {
    process.send({
        type : 'error',
        error : {
            message : error.message,
            stack : error.stack
        }
    });

    process.exit(1);
}

function onResult(result) {
    // TODO Filter result value to be a primitive value or object with primitives
    process.send({
        type : 'result',
        result : result
    });
}

function createContext(callback) {
    var Domain = require('domain').Domain;
    return {
        done : callback,
        setTimeout : setTimeout.bind(null),
        Domain : Domain
    };
}