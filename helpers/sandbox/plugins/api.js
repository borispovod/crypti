var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({
        /**
         * Transport plugin name.
         * @type {string}
         */
        transport : 'process',
        /**
         * Sandbox vm bindings
         * @type {object}
         */
        bindings : {},
        /**
         * Log all api calls in session
         */
        log : false
    }, options);

    // Listen custom transport event
    var events = {};
    events['message'] = '_gotMessage';

    var bindings = extend({}, options.bindings);

    return {
        require : options.transport,
        events : events,
        /**
         * All API bindings
         * @type {{}}
         * @private
         */
        _bindings : bindings,
        onStart : function(done){
            var transport = this.transport = sandbox[options.transport];

            transport.exec('require', [__dirname + '/api-vm.js', {
                transport : options.transport,
                bindings : prepareBindings(this._bindings)
            }], done);

            if (options.log) {
                this.session.apiLog = [];
            }
        },
        onStop : function(){
            this.transport = null;
        },
        /**
         * Transport response message handler
         * @param {{}} message Received message object
         * @private
         */
        _gotMessage : function(message) {
            if (! message || message.type !== 'api.call') return;

            if (! message.id) return;

            var self = this;

            function done(err) {
                var args = Array.prototype.slice.call(arguments);

                // TODO Wrap error to hide internal traces
                if (err instanceof Error) {
                    args[0] = {
                        message: err.message,
                        stack : err.stack
                    };
                }

                self.transport.send({
                    id : message.id,
                    type : 'result',
                    args :  args
                });
            }

            // Resolve mthod location
            var bindings = this._bindings;
            var path = message.method.slice();
            var segment;
            while (path.length > 1) {
                segment = path.shift();
                if (typeof bindings[segment] !== 'object') {
                    done({
                        message : "Method '" + message.method.join('.') + "' not found."
                    });
                    return;
                }
                bindings = bindings[segment];
            }

            segment = path.shift();
            if (typeof bindings[segment] !== 'function') {
                done({
                    message : "Method '" + message.method.join('.') + "' not found."
                });
                return;
            }

            var call = {
                method: message.method,
                args: message.args
            };

            sandbox.emit('api.call', call);
            if (options.log) {
                this.session.apiLog.push(call);
            }

            try {
                bindings[segment].apply(bindings, [done].concat(message.args));
            } catch (err) {
                done(err);
            }
        },
        /**
         * Register module as object where key is method name and property is a method function.
         *
         * @param {string=} path Path as string. Path separator is "."
         * @param {object} bindings Bind API object
         * @example
         *
         * sandbox.api.register({
         *  echo : function(done, message) {
         *      done(null, message);
         *  },
         *  print : function(done, message) {
         *      console.log(message);
         *      done();
         *  }
         * })
         */
        register : function(path, bindings){
            if (arguments.length === 1) {
                bindings = path;
                path = null;
            }

            var target, segment, segments;
            target = this._bindings;
            segments = path ? path.split(".") : [];

            while (segments.length) {
                segment = segments.shift();
                if (typeof target[segment] !== 'object') {
                    target[segment] = {};
                }
                target = target[segment];
            }

            extend(target, bindings);
            return this;
        },
        /**
         * Register single api item
         * @param {string} name API Name
         * @param {object|function} binding Value. Could be function or object with methods.
         */
        bind : function(name, binding) {
            this._bindings[name] = binding;
            // TODO (rumkin) Skip or register if running
            return this;
        }
    };
};

/**
 * convert object to map of provided methods and values
 * @param {object} api
 * @returns {[]}
 */
function prepareBindings(api) {
    var result = [];

    Object.keys(api).map(function(name){
        var binding = api[name];
        if (typeof binding === 'object') {
            result.push({
                name  : name,
                type  : 'object',
                items : prepareBindings(binding)
            });

        } else if (typeof binding === 'function') {
            result.push({
                name : name,
                type : 'function'
            });
        } else {
            result.push({
                name : name,
                type : 'value',
                value : binding
            });
        }
    });

    return result;
}
