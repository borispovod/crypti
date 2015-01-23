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

/**
 * Extend target object with source properties and return it. If source is not an object do nothing.
 *
 * @param {object} target
 * @param {object} source
 * @returns {*} Target object.
 */
function extend(target, source) {
    return util._extend(target, source);
}

/**
 * Uppercase first char of string.
 *
 * @param {string} str Any string
 * @returns {string}
 */
function ucfirst(str) {
    str = String(str);
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// Sandbox implementation

/**
 * Create sandbox object.
 *
 * @param {object} options Sandbox options.
 * @param {object} plugins Custom plugins object where key is plugin name and value is factory.
 * @constructor
 */
function Sandbox(options, plugins) {
    EventEmitter.call(this);
    extend(this._plugins, plugins);

    options = this._options = extend({
        dir : process.cwd(),
        plugins : {}
    }, options);
    this._pluginNames = [];
    this._queue = [];

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

/**
 * Inititalize plugin
 *
 * @param {string} name Plugin name
 * @param {object} options Plugin factory options
 * @returns {object}
 */
Sandbox.prototype.initPlugin = function(name, options) {
    if (! this._plugins.hasOwnProperty(name))
        throw new Error('Plugin "' + name + "' not found");

    var instance = this._plugins[name].call(null, this, options);
    instance.__proto__ = this._pluginPrototype;
    return instance;
};

/**
 * Bind listeners from `events` object where key is event and property is method. Use `plugin` as this object and methods owner.
 * @param {object} events Binding map
 * @param {object} plugin Plugin instance
 */
Sandbox.prototype.bindListeners = function(events, plugin) {
    var self = this;
    Object.keys(events).forEach(function(event){
        self.on(event, plugin[events[event]].bind(plugin));
    });
};

Sandbox.plugins = Sandbox.prototype._plugins = plugins;

/**
 * Plugin prototype object added as plugin instance __proto__.
 * @type {object}
 * @private
 */
Sandbox.prototype._pluginPrototype = {
    /**
     * Add timeout and remember it's id for further batch delete.
     * @param {function} call Timeout function
     * @param {number} timeout Timeout milliseconds
     * @returns {function(this:null)} Function to clear timeout
     */
    setTimeout : function(call, timeout) {
        this._timeouts = this._timeouts||[];
        var id = setTimeout(call, timeout);
        this._timeouts.push(id);

        return clearTimeout.bind(null, id);
    },
    /**
     * Add interval and remember it's id for further batch delete.
     *
     * @param {function} call Interval function
     * @param {number} interval Interval in milliseconds
     * @returns {function(this:null)} Function to clear interval
     */
    setInterval : function(call, interval) {
        this._intervals = this._intervals||[];
        var id = setInterval(call, interval);
        this._intervals.push(id);

        return clearInterval.bind(null, id);
    },
    /**
     * Clear all intervals
     */
    clearIntervals : function() {
        if (this._intervals) {
            this._intervals.forEach(clearInterval);
            this._intervals = [];
        }
    },
    /**
     * Clear all timeouts
     */
    clearTimeouts : function() {
        if (this._timeouts) {
            this._timeouts.forEach(clearTimeout);
            this._timeouts = [];
        }
    },
    /**
     * Clear all intervals and timeouts
     */
    clearTimers : function() {
        this.clearTimeouts();
        this.clearIntervals();
    }
};

/**
 * Resolve plugin initialization order based on plugins `require` property.
 *
 * @returns {String[]} List of plugin names
 */
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

/**
 * Execute script in virtual machine. Script should be a string or object with properties `source` and `filename`.
 *
 * @param {object,string} script Script object
 * @param {function(error,result,session)} callback
 */
Sandbox.prototype.run = function(script, callback) {
    if (typeof script === 'string') {
        script = {
            filename : '@vm',
            source : script
        };
    }

    if (this.running) {
        this._queue.push([script, callback]);
        return this;
    }

    var self = this;
    var order = this._order;
    var stack = new Stack();

    // Session object is pure EventEmitter instance
    var session = new EventEmitter;

    order.forEach(function(name){
        var plugin = self[name];
        plugin.session = session;
    });

    [
        'start',
        'beforeExec',
        function(){
            var stopped = false;

            return {
                name : 'exec',
                _ : function(next) {
                    // Do not run script if there is a error
                    if (self.hasError) return next();

                    // Run script
                    self._state = 'exec';
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
        'afterExec'
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
        name : 'final',
        type : 'shutdown',
        _ : function(){
            try {
                order.forEach(function(name){
                    var plugin = self[name];
                    if (typeof plugin.onStop === 'function') {
                        plugin.onStop(_error);
                    }
                });

                if (self.hasError) {
                    order.forEach(function(name){
                        var plugin = self[name];
                        if (typeof plugin.onError === 'function') {
                            plugin.onError(_error);
                        }
                    });

                    callback = callback.bind(null, _error, null, session);
                } else if (! self.hasResult) {
                    callback = callback.bind(null, new Error('No result passed'), null, session);
                }  else {
                    callback = callback.bind(null, null, self.result, session);
                }
            } catch (err) {
                callback = callback.bind(null, err);
            }

            self._state = null;
            self._stack = null;
            self.running = false;

            self.emit('end', script, session);
            setImmediate(callback);


            if (self._queue.length) {
                var call = self._queue.shift();
                setImmediate(self.run.bind(self, call[0], call[1]));
            }
        }
    });

    var _error;

    stack.on('error', function(error){
        self.hasError = true;
        _error = error;

        // GOTO Shutdown
        var i = stack.search('shutdown');
        if (i !== null) {
            stack.slice(i);
            stack.run();
        }

        if (self._options.verbose)
            console.log(error);

        // TODO (rumkin) Decide what to do with errors called after final state reached
    });

    this.running = true;
    this.hasError = false;
    this.hasResult = false;
    this.result = null;

    this._state = null;
    this._stack = stack;
    this._session = session;

    self.emit('start', script, session);
    stack.run();
    return this;
};

/**
 * Emit sandbox error and intercept current async call
 * @param {Error} err Error object
 */
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

/**
 * Intercept current call in stacks
 */
Sandbox.prototype.intercept = function(){
    this._stack.intercept();
};