"use strict";

var EventEmitter = require('events').EventEmitter;
var util = require('util');

module.exports = Stack;

function Stack(stack) {
    EventEmitter.call(this);
    this._running = null;
    this._stack = stack||[];
    this._trace = [];
}

util.inherits(Stack, EventEmitter);

function normalizeCall(call) {
    if (typeof call == 'function') {
        call = {
            type : null,
            name:'-',
            _:call
        };
    }

    if (typeof call !== 'object') {
        throw new Error('Argument #1 should be an object');
    }

    if (typeof call._ !== 'function') {
        throw new Error('Call param `_` should be a function');
    }

    if (! call.name) {
        call.name = '-';
    }

    if (! call.x) {
        call.x = Function;
    }

    if (call._.length) {
        call.async = true;
    }

    call.defers = [];

    return call;
}

Object.defineProperty(Stack.prototype, 'trace', {
    get : function(){
        return this._trace.slice();
    }
});

Stack.prototype.push = function(call) {
    call = normalizeCall(call);

    this._stack.push(call);
};

Stack.prototype.append = function(calls) {
    var self = this;
    calls.forEach(function(call){
        self.unshift(call);
    });
};

Stack.prototype.prepend = function(calls) {
    var self = this;
    calls.forEach(function(call){
        self.push(call);
    });
};

Stack.prototype.unshift = function(call) {
    call = normalizeCall(call);

    this._stack.unshift(call);
};

Stack.prototype.pop = function() {
    this._stack.pop();
};

Stack.prototype.shift = function() {
    return this._stack.shift();
};

Stack.prototype.filter = function(filter) {
    this._stack = this._stack.filter(filter);
};

Stack.prototype.search = function(search) {
    var i, l, s;
    s = this._stack;
    i = -1;
    l = s.length;

    if (typeof search === 'string') {
        search = function(need, item) {
            return item.type == need;
        }.bind(null, search);
    }

    while (++i < l) {
        if (search(s[i])) return i;
    }

    return null;
};

Stack.prototype.find = function(search) {
    var i = this.search(search);
    if (i !== null) {
        return this._stack[i];
    }
    return null;
};

Stack.prototype.flush = function() {
    this._stack.length = 0;
};

Stack.prototype.slice = function(start, end) {
    this._stack = this._stack.slice(start, end);
};

Stack.prototype.intercept = function() {
    if (! this._running) return;

    this._running.x();
    this._end(this._running);
    this._running = null;

    if (this._stack.length) this.run();
};

Stack.prototype._end = function(call){
    call.defers.forEach(function(defer){
        defer();
    });
    call.defers = null;
    this.emit('leave', this.call);
};

Stack.prototype.getNext = function() {
    var self = this;
    var called = false;
    var _call;

    function next (err){
        if (called) return;
        called = true;

        if (err) {
            self.emit('error', err, _call);
            return;
        }

        if (self._running) {
            stack._end(self._running);
        }

        self._running = null;
        if (! self._stack.length) return;

        var call = self.shift();
        var _next = self.getNext();

        self.emit('enter', call);
        _call = call;

        try {
            self._running = call;
            self._trace.push(call);
            call._(self.getNext());
            if (! call.async) {
                setImmediate(_next);
            }
        } catch (err) {
            self.emit('error', err, call);
        }
    }

    next.defer = function(cb) {
        self._running.defers.push(cb);
    };

    return next;
};

Stack.prototype.run = function() {
    if (! this._running);
    this.getNext()();
};

var stack = new Stack();