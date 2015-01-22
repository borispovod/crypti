var extend = require('util')._extend;

module.exports = function(done, scope, options) {

    var cid = 0;
    var stack = {};

    options = extend({
        transport : 'process',
        bindings : {},
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

    //if (typeof options.bindings === 'object') {
    //
    //}

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

    function addBindings(target, bindings) {
        Object.keys(bindings).forEach(function(name){
            var value = bindings[name];
            if (value === true) {
                target[name] = createMethod(name);
            } else if (typeof value === 'object') {
                if (typeof target[name] !== 'object') {
                    target[name] = {};
                }
                addBindings(target[name], value)
            }
        });
    }

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