var net = require('net');
var fs = require('fs');
var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({
        /**
         * Socket files directory
         * @type {string}
         */
        dir : '/tmp/'
    });

    var cid = 0;
    var stack = {};

    return {
        require : ['process'],
        onStart : function(done) {
            var self = this;
            var socket = this.socket = options.dir + '/' + sandbox.process.pid + '.sock';

            sandbox.process.exec('require', [__dirname + '/tcp-vm.js'], function(err){
                if (err) return done(err);


                sandbox.process.exec('tcpServer', [socket], function(err){
                    if (err) return done(err);

                    var connection = self.connection = net.connect(socket);

                    connection.on('connect', done);
                    connection.on('error', function(err){
                        sandbox.error(err);
                    });

                    var buffer = '';

                    connection.on('data', function(chunk){
                        buffer += chunk;
                        var pos, slice, message;
                        while (~(pos = buffer.indexOf('\r\n'))) {
                            slice = buffer.slice(0, pos);
                            buffer = buffer.slice(pos + 2);

                            // TODO (rumkin) capture parsing options
                            message = JSON.parse(slice);

                            if (message && typeof message === 'object') {
                                self._gotMessage(message);
                            }
                        }
                    });

                    connection.on('end', function(){
                        sandbox.error(new Error("Unexpected disconnect"));
                    });
                });
            });
        },
        onStop : function() {
            if (this.connection) {
                this.connection.removeAllListeners();
                this.connection.end();
                this.connection = null;
                this.socket = null;
            }
        },
        /**
         * Process TCP channel message handler
         * @param {Object} message
         * @private
         */
        _gotMessage : function(message) {
            sandbox.emit('message', message, this);

            if (message.type === "result") {
                var id = message.id;
                if (id in stack) {
                    var call = stack[id];
                    delete stack[id];
                    try {
                        call.apply(null, message.args);
                    } catch (err) {
                        sandbox.error(err);
                    }
                }
            }
        },
        /**
         * Send message to sandbox via TCP
         * @param {{}} message
         */
        send : function(message) {
            // TODO Add message validators
            this.connection.write(JSON.stringify(message) + '\r\n');
            return this;
        },
        /**
         * Send execution message to sandbox via process TCP
         *
         * @param {string} method Method name/path
         * @param {Array} args Arguments. Optional
         * @param {function(this:null,err)} callback Result callback. Got multiple arguments from result call.
         */
        exec : function(method, args, callback) {
            if (! this.connection) return;
            var id = cid++;
            stack[id] = callback;

            this.send({
                id : id,
                type : 'call',
                method : method,
                args : args
            });

            return this;
        }
    }
};
