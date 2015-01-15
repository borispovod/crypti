var EventEmitter = require('events').EventEmitter;
var util = require('util');
var spawn = require('child_process').spawn;

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
     * Time limit
     * @type {number}
     */
    timeLimit : Infinity,
    /**
     * Sandbox stdio redirect. See `stdio` param of child_process.spawn method's options argument.
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

    var exit = function() {
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
                proc.send({
                    type : 'execute',
                    code : code
                });
                // Set execution timeout if it's value is between null and Infinity
                if (self.timeLimit > 0 && self.timeLimit < Infinity) {
                    setTimeout(function(){
                        if (! isFinished) {
                            exit();
                            callback(new Error('Max execution timeout riched'));
                        }
                    }, self.timeLimit);
                }

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