var EventEmitter = require('events').EventEmitter;
var util = require('util');
var spawn = require('child_process').spawn;
var usage = require('usage');

module.exports = Sandbox;

/**
 * Javascript executable sandbox.
 * Options object could have `memoryLimit`, `timeLimit`, `stdio`, `timeout` and `sandboxScript` properties. If stdio is
 * not passed then subprocess output will be omitted.
 * @param {object} options Options object.
 * @constructor
 */
function Sandbox(options) {
    EventEmitter.call(this);
    options = extend({}, this.defaultOptions, options);

    this.cwd = options.cwd;
    this.memoryLimit = options.memoryLimit;
    this.timeLimit = options.timeLimit;
    this.cpuLimit = options.cpuLimit;
    this.maxActivityDelay = options.maxActivityDelay;
    this.stdio = options.stdio;
    this.timeout = options.timeout;
    this.sandboxScript = options.sandboxScript;
}

util.inherits(Sandbox, EventEmitter);

/**
 * Sandbox options defaults
 * @type {object}
 */
Sandbox.prototype.defaultOptions = {
    /**
     * Memory limit
     * @type {number}
     */
    memoryLimit : 20,
    /**
     * CPU usage limit in percents
     * @type {number}
     */
    cpuLimit : 20,
    /**
     * Time limit
     * @type {number}
     */
    timeLimit : Infinity,
    /**
     * Set maximum activity delay in milliseconds
     */
    maxActivityDelay : 100,
    /**
     * Sandbox stdio redirect. See `stdio` param of child_process.spawn method's options argument.
     * Explanation of stdio param http://nodejs.org/api/child_process.html#child_process_options_stdio
     * @type {string|null|string[]|null[]}
     */
    stdio : null,
    /**
     * Sandbox start up timeout in milliseconds
     * @type {number}
     */
    timeout : 1000,
    /**
     * Sandbox executable script
     * @type {string}
     */
    sandboxScript : __dirname + '/sandbox-vm.js'
};

/**
 * Run callback inside sandbox
 * @param {string} code Sandbox executable code.
 * @param {function} callback Result callback.
 */
 // TODO identify code with id or script name
Sandbox.prototype.run = function(code, callback) {
    var self = this;
    var proc = this._createProcess();
    var isReady = false;
    var hasCaughtError = false;
    var isFinished = false;
    // Statistic metrics list
    var stat = [];
    var cpuStatPeriod = 10;
    // Time marks
    var startedAt, lastActivityAt;
    // Timers
    var activityTimer;

    var exit = function() {
        clearInterval(activityTimer);
        proc.removeAllListeners();
        proc.kill('SIGINT');
    };

    proc.on('error', callback);

    proc.on('exit', function(code){
        if ((! hasCaughtError) && code) {
            return callback(new Error('Unexpected exit with code ' + code));
        }
    });

    proc.on('message', function(message){
        if (! isObject(message)) return;
        switch (message.type) {
            case 'handshake':
                isReady = true;
                startedAt = lastActivityAt = Date.now();
                proc.send({
                    type : 'execute',
                    code : code
                });
                // Set execution timeout if it's value is between null and Infinity
                if (self.timeLimit > 0 && self.timeLimit < Infinity) {
                    setTimeout(function(){
                        if (! isFinished) {
                            exit();
                            callback(new Error('Max execution timeout reached'));
                        }
                    }, self.timeLimit);
                }

                // Set activity timer
                activityTimer = setInterval(function(){
                    if (Date.now() - self.maxActivityDelay > lastActivityAt) {
                        callback(new Error('Max activity timeout reached'));
                        hasCaughtError = true;
                        exit();
                    }

                    // Collect subprocess cpu and memory usage
                    usage.lookup(proc.pid, function(err, result){
                        if (err) {
                            // TODO Decide what to do
                        }

                        result.time = Date.now();
                        stat.push(result);

                        if (stat.length < cpuStatPeriod) return;

                        var avg = stat.slice(-cpuStatPeriod).map(function(stat){
                            return stat.cpu;
                        }).reduce(function(result, value){
                            return result + value;
                        }, 0)/cpuStatPeriod;

                        if (avg > self.cpuLimit) {
                            callback(new Error('Max cpu usage limit reached'));
                            hasCaughtError = true;
                            exit();
                        }
                    });
                }, self.maxActivityDelay - 10);
                break;
            case 'ping':
                lastActivityAt = Date.now();
                break;
            case 'result':
                callback(null, message.result);
                self.emit('result', message.result, code);
                exit();
                break;
            case 'error':
                callback(message.error);
                hasCaughtError = true;
                exit();
                break;
        }
    });

    // Catch uninitialized script error
    setTimeout(function(){
        if (! hasCaughtError && isReady === false) {

            exit();
            callback(new Error('Initialization timed out'));
        }
    }, this.timeout);


    this.emit('started', proc, code);
};

/**
 * Create node process with sandbox script to run executable inside it.
 * @returns {*}
 */
Sandbox.prototype._createProcess = function() {
    var proc, options, stdio, args;

    stdio = this.stdio;
    // Force use IPC channel to communicate with process
    if (typeof stdio === 'string' || stdio === null) {
        stdio = [stdio, stdio, stdio, 'ipc'];
    } else {
        stdio = stdio.slice(0,3).concat('ipc');
    }

    options = {
        cwd : this.cwd,
        stdio : stdio
    };

    args = [
        // subprocess memory limit
        '--max-old-space-size=' + this.memoryLimit,
        // sandbox executable script filepath
        this.sandboxScript
    ];

    proc = spawn('node', args, options);
    return proc;
};

// Extend target element with multiple source objects
function extend(target, source) {
    if (! isPlainObject(target)) target = {};
    Array.prototype.slice.call(arguments, 1).forEach(util._extend.bind(null, target));
    return target;
}

// Check if argument is an Object (but not null).
function isObject(target) {
    return target && typeof target === 'object';
}

// Check if object is PlainObject
function isPlainObject(target) {
    return typeof target === 'object' && target.constructor === Object;
}