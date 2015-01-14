var vm = require('vm');

if (! process.connected) {
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
        var int = setInterval(function(){
            // Send ping to parent process
            sendMessage({
                type : 'ping'
            });
        }, 100);
        execute(message.code, function(err, result) {
            clearInterval(int);

            if (err) onError(err);
            else onResult(result);
        });
    }
});

process.send({
    type : 'handshake'
});

/**
 * Execute script
 * @param {string|object} script Script source
 * @param {function} callback Result callback
 * @returns {*}
 */
function execute(script, callback) {
    if (typeof script === 'string') {
        script = {
            source : script,
            filename : '@sandbox'
        };
    }
    var exec;
    var wrapped = '(function(){' + script.source + '\n});';
    try {
        exec = vm.runInNewContext(wrapped, createContext(callback), script.filename);
    } catch (err) {
        // TODO Mark as parse error
        return onError(err);
    }

    // Call time error
    try {
        exec();
    } catch (err) {
        // TODO Mark as calltime error
        onError(err);
    }
}


// Helper function
function onError(error) {
    sendMessage({
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
    sendMessage({
        type : 'result',
        result : result
    });
}

// TODO add dynamic context creation with modules or so.
function createContext(callback) {
    var Domain = require('domain').Domain;
    return {
        done : callback,
        setTimeout : setTimeout.bind(null),
        clearTimeout : clearTimeout.bind(null),
        Domain : Domain
    };
}

function sendMessage(message) {
    if (! process.connected) {
        // TODO Decide what to do
        return;
    }

    process.send(message);
}