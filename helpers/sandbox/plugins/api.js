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
        bindings : {}
    }, options);

    // Listen custom transport event
    var events = {};
    events[options.transport +'.message'] = '_gotMessage';

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

            if (typeof this._bindings[message.method] !== "function") {
                done({
                    message : "Method not found"
                });
                return;
            }

            try {
                this._bindings[message.method].apply(null, [done].concat(message.args));
            } catch (err) {
                done(err);
            }
        },
        /**
         * Register module as object where key is method name and property is a method function.
         *
         * @param {object} bindings
         * @example
         *
         * sandbox.api.module({
         *  echo : function(done, message) {
         *      done(null, message);
         *  },
         *  print : function(done, message) {
         *      console.log(message);
         *      done();
         *  }
         * })
         */
        module : function(bindings){
            extend(this._bindings, bindings);
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
 * @returns {{}}
 */
function prepareBindings(api) {
    var result = {};

    Object.keys(api).map(function(name){
        var binding = api[name];
        if (typeof binding === 'object') {
            result[name] = prepareBindings(value);
        } else if (typeof binding === 'function') {
            result[name] = true;
        }
    });

    return result;
}
