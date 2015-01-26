var util = require('util');
var vm = require('vm');
var EventEmitter = require('events').EventEmitter;

function Scope(values) {
    EventEmitter.call(this);
    util._extend(this, values);
}

util.inherits(Scope, EventEmitter);

Scope.prototype.$new = function(values) {
    return new Scope(values);
};

// TODO Create Scope object with EventEmitter
var scope = new Scope({
    // Process transport
    process : process,
    exec : exec,
    echo : function(done, value) {
        console.log('->', value);
        done(null, value);
    },
    require : function(done, filepath, options) {
        try {
            require(filepath)(done, scope, options);
        } catch (err) {
            return done(err);
        }
    },
    vm : {
        context : {
            setTimeout : setTimeout
        },
        eval : function(done, script) {
            var context = util._extend(this.context);
            var source = "(function(done){ " + script.source + '\n});';
            var call;
            try {
                call = vm.runInNewContext(source, context, script.filename);
            } catch (err) {
                // TODO Get exact syntax error
                done(err);
            }

            try {
                call(done);
            } catch (err) {
                done(err);
            }
        }
    }
});

scope.on('message', function(message){
    if (! message || typeof message !== 'object') {
        return;
    }
    if (message.type !== 'call') return;

    exec(message, function(result){
        scope.process.send(result);
    });
});

process.on('uncaughtException', function(err){
    // TODO Detect vm errors
    scope.process.send({
        type : 'error',
        error : {
            message: err.message,
            stack : err.stack
        }
    });
    process.exit(1);
});

process.on('message', function(message){
    scope.emit('message', message);
});

function exec(call, callback) {
    var sent = false;

    function done (err) {
        if (sent) return;

        sent = true;

        var args = Array.prototype.slice.call(arguments);
        if (err && (err instanceof Error || ~String(err.name).indexOf('Error'))) {
            args[0] = {
                name : err.name,
                message : err.message,
                stack : err.stack
            }
        }

        callback({
            id : call.id,
            type : 'result',
            args : args
        });
    }

    var method = call.method.split('.');
    var target = scope;
    var cur;

    while (method.length > 1) {
        cur = method.shift();
        if (typeof target[cur] !== "object") {
            return done({message:"Method '" + call.method + "' not found"});
        }

        target = target[cur];
    }

    cur = method.shift();
    if (typeof target[cur] !== "function") {
        return done({message:"Method '" + call.method + "' not found"});
    }

    try {
        target[cur].apply(target, [done].concat(call.args));
    } catch (err) {
        done(err);
    }
}

scope.process.send('run');

