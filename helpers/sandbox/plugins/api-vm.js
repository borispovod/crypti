var extend = require('util')._extend;

module.exports = function(done, scope, options) {

    var cid = 0;
    var stack = {};

    options = extend({
        transport : 'process',
        bindings : []
    }, options);

    var transport = options.transport || 'process';

    if (transport in scope === false) {
        done(new Error('Transport "' + transport + '" is not defined'));
        return;
    }

    var api = scope.api = {
        setTransport : function(done, newTransport) {
            if (newTransport in scope === false) {
                return done(new Error("Transport is undefined"));
            }

            if (newTransport === transport) return;


            done();

            scope[transport].removeListener('message', onMessage);

            transport = newTransport;
            scope[transport].on('message', onMessage);
        },
        method : function(done, method) {
            var target = scope.vm.context;

            target[method] = createMethod(method);
            done();
        },
        module : function(done, module) {
            addBindings(scope.vm.context, module);
            done();
        }
    };

    /**
     * Create binding
     * @param {string|Array} method Method name/path
     * @returns {Function}
     */
    function createMethod (method) {
        return function() {
            var args = Array.prototype.slice.call(arguments);
            if (typeof args[args.length-1] !== 'function') {
                throw new Error('Callback argument not passed');
            }
            var id = ++cid;
            var cb = args.pop();

            scope[transport].send({
                id : id,
                type : 'api.call',
                method : method,
                args : args
            });


            stack[cid] = cb;
        };
    }

    /**
     * Recursively unwrap api binding object and add bindings to target object
     * @param {object} target Object for API injecting
     * @param {Array} bindings List of bindings
     * @param {Array} prefix Prefix path (used for nested calls)
     */
    function addBindings(target, bindings, prefix) {
        prefix = prefix || [];

        //console.log(prefix, bindings);

        bindings.forEach(function(binding){
            var name = binding.name;

            switch (binding.type) {
                case 'object':
                    // TODO (rumkin) Freeze API Object
                    target[name] = {};
                    addBindings(target[name], binding.items, prefix.concat(name));
                    break;
                case 'function':
                    target[name] = createMethod(prefix.concat(name));
                    break;
                case 'value':
                    // TODO (rumkin) Decide to use getter/define immutable property?
                    target[name] = binding.value;
                    break;
                default:
                    throw new Error('Invalid binding type "' + binding.type + '".');
            }
        });
    }

    /**
     * Message handler
     * @param {{}} message
     */
    function onMessage(message) {
        if (! message || message.type !== 'result') return;

        var id = message.id;
        if (! id) return;

        if (id in stack) {
            var cb = stack[id];
            delete stack[id];
            cb.apply(null, message.args);
        }
    }

    addBindings(scope.vm.context, options.bindings);
    scope[transport].on('message', onMessage);

    done();
};