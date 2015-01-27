var spawn = require('child_process').spawn;
var usage = require('usage');
var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({
        cwd : sandbox._options.dir,
        stdio : 'ignore',
        script : __dirname + '/../vm.js',
        timeout: 500,
        limitCpu : 25,
        limitMemory : 20,
        limitTime : 5000
    }, options);

    var stack = {};
    var cid = 0;

    return {
        process : null,
        processStat:null,
        processStatPeriod : 50,
        options: options,
        pid : null,
        onStart : function(done) {
            var self = this;
            var running = false;
            var stdio = options.stdio;

            if (typeof stdio === 'string') {
                if (stdio === 'inherit')
                    stdio = [null, 1, 2];
                 else
                    stdio = [stdio, stdio, stdio];
            }

            stdio[3] = 'ipc';

            var process = this.process = spawn('node', ['--max-old-space-size=' + options.limitMemory, options.script], {
                cwd : options.cwd,
                stdio : stdio
            });

            this.pid = process.pid;
            this.processStat = [];

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

            var i = setTimeout(function(){
                if (running) return;

                done(new Error('Process start reached timeout'));
            }, options.timeout);

            done.defer(function(){
                clearTimeout(i);
            });
        },
        onBeforeExec : function(){
            this.setTimeout(function(){
                sandbox.error(new Error("Execution time limit reached"));
            }, options.limitTime);

            var pid = this.process.pid;
            var stats = this.processStat;
            var limit = options.limitCpu;

            this.setInterval(function() {
                usage.lookup(pid, function(err, stat){
                    stats.push(stat);

                    if (stats.length < 10) return;

                    var avg = stats.slice(-10).reduce(function(result, item){
                        return result + item.cpu;
                    }, 0) / 10;

                    if (avg > limit) {
                        sandbox.error(new Error("CPU usage limit reached"));
                    }
                });
            }, this.processStatPeriod);
        },
        onStop : function() {
            if (this.process) {
                this.process.kill();
                this.process.removeAllListeners();
                this.pid = null;
                this.process = null;
            }

            this.clearTimers();
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
                        try {
                            cb.apply(null, message.args);
                        } catch (err) {
                            sandbox.error(err);
                        }
                    }
                    break;
                // Process error
                case 'error' :
                    sandbox.error(message.error);
                    break;
            }
        },
        /**
         * Send message to vm via process ipc
         * @param message
         */
        send : function(message) {
            if (this.process)
                this.process.send(message);
        },
        /**
         * Send execution message to vm via process ipc
         *
         * @param {string} method Method name/path
         * @param {Array} args Arguments. Optional
         * @param {Function(err} callback Result callback. Got multiple arguments from result call.
         */
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
        }
    }
};
