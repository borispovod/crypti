var util = require('util');
var EventEmitter = require('events').EventEmitter;
var toposort = require('toposort');
var Stack = require('./stack');

module.exports = Sandbox;

var plugins = {
    api : require('./plugins/api'),
    tcp : require('./plugins/tcp'),
    process : require('./plugins/process'),
    timer : require('./plugins/timer')
};

// Helpers

// Wrap func call to prevent argument passing
function noar(func) {
    return function(){
        func();
    };
}

// No-operation
function noop(){}

// Extend object with another
function extend(target, source) {
    return util._extend(target, source);
}

// uppercase first character
function ucfirst(str) {
    str = String(str);
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// Sandbox implementation

function Sandbox(options) {
    EventEmitter.call(this);

    options = this._options = extend({}, options);
    this._pluginNames = [];

    var name, value, plugin, plugins;

    plugins = extend({
        process: true
    }, options.plugins);

    for (name in plugins) {
        if (! plugins.hasOwnProperty(name)) continue;
        value = plugins[name];
        if (typeof value !== 'object') value = {};

        plugin = this[name] = this.initPlugin(name, value||{});
        if (plugin.events) {
            this.bindListeners(plugin.events, plugin);
        }
        this._pluginNames.push(name);
    }

    // Plugin order
    this._order = this.resolveOrder();

    // TODO (rumkin) Autoload required plugins like a `process` or `tcp`.
}

util.inherits(Sandbox, EventEmitter);

Sandbox.prototype.initPlugin = function(name, options) {
    if (! this._plugins.hasOwnProperty(name))
        throw new Error('Plugin "' + name + "' not found");

    var instance = this._plugins[name].call(null, this, options);
    if (typeof plugin === 'object') {
        instance.__proto__ = this._pluginPrototype;
    }
    return instance;
};

Sandbox.prototype.bindListeners = function(events, plugin) {
    var self = this;
    Object.keys(events).forEach(function(event){
        self.on(event, plugin[events[event]].bind(plugin));
    });
};

Sandbox.plugins = Sandbox.prototype._plugins = plugins;

Sandbox.prototype.resolveOrder = function() {
    var self = this;

    var graph = this._pluginNames.map(function(name){
        var plugin = self[name];
        if (! plugin.require) return [[name, null]];

        var requires = plugin.require;
        if (typeof requires === 'string') {
            requires = [requires];
        }

        return requires.map(function(required){
            return [name, required];
        });
    }).reduce(function(order, requires){
        return order.concat(requires);
    }, []);

    return toposort(graph).filter(function(name){
        return name !== null;
    }).reverse();
};

Sandbox.prototype.run = function(script, callback) {
    if (typeof script === 'string') {
        script = {
            filename : '@vm',
            source : script
        };
    }

    if (this.running) throw new Error('Already running');

    var self = this;
    var order = this._order;
    var stack = new Stack();

    [
        'start',
        'ready',
        function(){
            var stopped = false;

            return {
                name : 'run',
                _ : function(next) {
                    // Do not run script if there is a error
                    if (self.hasError) return next();

                    // Run script
                    self._state = 'run';
                    self.intercept = noar(next);

                    self.process.exec('vm.exec', [script], function(err, result){
                        if (stopped) return;

                        if (err) return next(err);

                        self.hasResult = true;
                        self.result = result;
                        next();
                    });
                },
                x : function() {
                    stopped = true;
                }
            };
        },
        'stop'
    ].forEach(function(point){
            if (typeof point === 'object') {
                stack.push(point);
                return;
            }

            if (typeof point === 'function') {
                stack.push(point());
                return;
            }

            stack.push({
                name : 'state.' + point,
                type : 'state',
                _ : function() {
                    self.state = point;
                    self.emit('state', point);
                }
            });

            var method = 'on' + ucfirst(point);
            order.forEach(function(name){
                var plugin = self[name];
                if (typeof plugin[method] !== 'function') return;

                stack.push({
                    name : name + '.' + method + '()',
                    type : 'callback',
                    _ : function(next){
                        var call = plugin[method];
                        plugin[method](next);

                        if (! call.length) next();
                    }
                })
            });
        });

    stack.push({
        type : 'shutdown',
        _ : noop
    });

    stack.push({
        name : 'final',
        type : 'exit',
        _ : function(){
            if (self.hasError) {
                order.forEach(function(name){
                    var plugin = self[name];
                    if (typeof plugin.onError === 'function') {
                        plugin.onError(noop, _error);
                    }
                });

                callback = callback.bind(null, _error);
            } else if (! self.hasResult) {
                callback = callback.bind(null, new Error('No result passed'));
            }  else {
                callback = callback.bind(null, null, self.result);
            }

            //console.log(self._stack.trace);

            callback();
        }
    });

    // Last call clear sandbox object
    stack.push({
        _ : function(){
            self._state = null;
            self._stack = null;
        }
    });

    var _error;

    stack.on('error', function(error){
        self.hasError = true;
        _error = error;

        // GOTO Shutdown
        var i = stack.search('shutdown');
        if (i !== null) stack.slice(i);

        if (stack.search('exit') !== null)
            stack.run();

        //console.log(error, self._state);

        // TODO (rumkin) Decide what to do with errors called after final state reached
    });

    this.hasError = false;
    this.hasResult = false;
    this.result = null;

    this._state = null;
    this._stack = stack;

    stack.run();
};

Sandbox.prototype.error = function(err) {
    if (! this._stack) return;

    this.hasError = true;

    this._stack.unshift({
        name : 'error',
        _ : function(done){
            done(err);
        }
    });

    this.intercept();
};

Sandbox.prototype.intercept = function(){
    this._stack.intercept();
};