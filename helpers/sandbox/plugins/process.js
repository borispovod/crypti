var spawn = require('child_process').spawn;
var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({
        cwd : process.cwd(),
        //stdio : 'inherit',
        stdio : [null, 1, 2, 'ipc'],
        script : __dirname + '/../vm.js',
        timeout: 500
    }, options);

    var stack = {};
    var cid = 0;

    return {
        process : null,
        onStart : function(done) {
            var self = this;
            var running = false;

            var process = this.process = spawn('node', [options.script], {
                cwd : options.cwd,
                stdio : options.stdio
            });

            process.on('error', function(err){
                sandbox.error(err);
            });

            process.once('message', function(message){
                running = true;

                if (message !== 'run') {
                    done(new Error('Invalid initial message'));
                    return;
                }
                process.on('message', function(message){
                    if (!message || typeof message !== 'object') return;

                    self._gotMessage(message);
                });

                done();
            });

            process.once('exit', function(){
                if (sandbox._state === 'stop') return;

                sandbox.error(new Error('Unexpected exit'));
            });

            // TODO (rumkin) Clear timeout to prevent redundant timer call
            var i = setTimeout(function(){
                if (running) return;

                done(new Error('Process start reached timeout'));
            }, options.timeout);

            done.defer(function(){
                clearTimeout(i);
            });
        },
        onStop : function() {
            this._stop();
        },
        onError : function() {
            // Capture error
            if (sandbox._state === 'stop') return;

            this._stop();
        },
        _stop : function() {
            if (! this.process) return;

            this.process.kill();
            this.process.removeAllListeners();
            this.process = null;
        },
        _gotMessage : function(message) {
            sandbox.emit('process.message', message);

            switch (message.type) {
                // Exec result
                case 'result' :
                    if (message.id in stack) {
                        var cb = stack[message.id];
                        delete stack[message.id];
                        // TODO Cast error
                        cb.apply(null, message.args);
                    }
                    break;
                // Process error
                case 'error' :
                    sandbox.error(message.error);
                    break;
            }
        },
        exec : function(method, args, callback) {
            if (! this.process) return;

            if (arguments.length < 3) {
                callback = args;
                args = [];
            }

            var id = ++cid;
            stack[cid] = callback;

            this.process.send({
                type : 'call',
                id   : id,
                method : method,
                args: args
            });
        },
        send : function(message) {
            if (this.process)
                this.process.send(message);
        }
    }
};
