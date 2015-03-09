var Promise = require('promise');
var phantom = require('phantom');
var chalk = require('chalk');
var EventEmitter = require("events").EventEmitter;
var extend = require('util')._extend;


module.exports = Browser;

function Browser(plugins) {
    this._queue = [];
    this._tabs = {};
    this._tabId = 0;
    this.plugins = plugins || {};
    this._actions = [];
    this._currentTabId = null;
    this.settings = {};
    this.phantom = null;
    this._macros = {};
}

Browser.prototype._createTab = function(id) {
    id = id || ++ this._tabId;
    var self = this;
    var tab = {
        set id (newId) {
            if (! id) throw new Error("Invalid tab id");

            delete self._tabs[id];
            self._tabs[newId] = this;
            id = newId;
        },
        get id() {
            return id;
        },
        page : null,
        loaded : false,
        scope : {}
    };

    extend(tab, EventEmitter.prototype);
    EventEmitter.call(tab);


    this._tabs[tab.id] = tab;
    return tab;
};

Browser.prototype._initializeTab = function(tabId, page) {
    var tab = this._tabs[tabId];
    tab.page = page;

    page.set('onConsoleMessage', function(message){
        console.log(chalk.yellow(message));
        tab.emit('onConsoleMessage', message);
    });

    page.set('onLoadFinished', function(status){
        tab.loaded = true;
        tab.emit('onLoadFinished', status);
        page.evaluate(function(scope){
            window.PHSESSION = {};
            for(var name in scope) {
                window.PHSESSION[name] = scope[name];
            }
            return scope;
        }, function(scope){
            if (typeof tab.onReady === "function") {
                tab.onReady();
                tab.onReady = null;
                tab.emit('onReady', tab);
            }
        }, tab.scope);
    });

    [
        'onResourceRequested',
        'onResourceReceived',
        'onUrlChanged',
        'onLoadStarted'
    ].forEach(function(event){
            page.set(event, function(){
                var args = Array.prototype.slice.call(arguments);
                args.push(event);
                tab.emit.apply(tab, args);
            });
        });
};

Browser.prototype.addAction = function(action) {
    this._actions.push(action);

    return this;
};

Browser.prototype._finalizeActions = function() {
    var actions = this._actions.slice();
    if (! this.phantom) {
        this.phantom = true;
        actions.unshift(function(self){
            return new Promise(function(resolve, reject){
                phantom.create(function(phantom){
                    self.phantom = phantom;
                    resolve();
                });
            });
        });
    }

    return actions;
};

Browser.prototype.run = function(callback) {

    var actions = this._finalizeActions();
    this._actions = [];

    this._queue.push({actions:actions, callback:callback});

    if (this.busy) return;

    this.runQueue();
};

Browser.prototype.runQueue = function() {
    var queue = this._queue.shift();
    var actions = queue.actions;
    var callback = queue.callback;
    var self = this;

    this.activeQueue = queue;
    function finish(err, result) {
        self.activeQueue = null;

        setImmediate(function(){
            callback(err, result);
        });

        if (self._queue.length) {
            setImmediate(self.runQueue.bind(self));
        } else {
            self.busy = false;
        }
    }

    function loop(err, result) {
        if (err) return finish(err);
        if (! actions.length) return finish(null, result);

        try {
            var action = actions.shift();
            action(self, result).then(loop.bind(null, null), loop).catch(finish);
        } catch (err){
            finish(err);
            return;
        }
    }

    self.busy = true;
    loop();
};


// ----------------------------------------------------------------------------------------

Browser.prototype.currentTab = function() {
    return this._tabs[this._currentTabId];
};

Browser.prototype.openTab = function(url) {
    var tab = this._createTab();
    this._currentTabId = tab.id;

    this.addAction(function(self){
        return new Promise(function(resolve, reject){
            self.phantom.createPage(function(page){
                self._initializeTab(tab.id, page);

                if (! url) return resolve();

                page.open(url, function(status){
                    status !== "failed" ? resolve() : reject("Page not loaded");
                })
            });
        });
    });

    return this;
};

Browser.prototype.closeTab = function() {
    var  tab = this.currentTab();

    this.addAction(function(){
        return new Promise(function(resolve, reject){
            tab.scope = {};
            tab.page.close();

            resolve();
        });
    });
    return this;
};

Browser.prototype.goto =
    function(url) {
    var tab = this.currentTab();
    this.addAction(function(self){
        tab.loaded = false;
        return new Promise(function(resolve, reject){
            tab.page.open(url, function(status){
                if (status === "failed") return reject("Page not loaded");

                tab.onReady = resolve;

                setTimeout(function(){
                    reject();
                }, 1000);
            });
        });
    });
    return this;
};

Browser.prototype.eval = function(code) {
    var tab = this.currentTab();
    var args = Array.prototype.slice.call(arguments);
    code = args.pop();

    this.addAction(function(self) {
        return new Promise(function(resolve, reject){
            tab.page.evaluate.apply(tab.page, [code, resolve].concat(args));
        });
    });

    return this;
};

Browser.prototype.evalAsync = function(code) {
    var tab = this.currentTab();
    this.addAction(function(self){
        return new Promise(function (resolve, reject) {
            var async = (function() {
                var fn = code;
                fn(function(){
                    window.callPhantom({args : Array.prototype.slice.call(arguments)});
                });
            }).toString().replace('= code', '= ' + code.toString());

            tab.page.set('onCallback', function(result){
                tab.page.set('onCallback', null);
                if (result.args[0]) {
                    reject(result.args[0]);
                } else {
                    resolve(result.args[1]);
                }
            });

            tab.page.evaluate(async, function(){
                // DONE
                console.log("DONE");
            });
        });
    });
    return this;
};

Browser.prototype.set = function(name, value) {
    var tab = this.currentTab();

    this.exec(function(result, done){
        tab.scope[name] = value;
        done();
    }).eval(name, value, function(name, value){
        if (! window.PHSESSION) window.PHSESSION = {};
        window.PHSESSION[name] = value;
    });
    return this;
};

Browser.prototype.get = function(name) {
    this.eval(name, function(name){
        return window.PHSESSION[name];
    });
    return this;
};

Browser.prototype.dump = function(prefix) {
    this.addAction(function(self, value){
        console.log(prefix||"", require('util').inspect(value));
        return Promise.resolve(value);
    });
    return this;
};



Browser.prototype.exec = function(callback){
    var tab = this.currentTab();

    this.addAction(function(self, value){
        return new Promise(function(resolve, reject){
            var B = Object.create(self);

            B._currentTabId = tab.id;
            B._actions = [];

            callback.call(B, value, function(err, value){
                err ? reject(err) : resolve(value);
            });

            if (B._actions.length) {
                B._actions.reverse().forEach(function(fn){
                    self.activeQueue.actions.unshift(fn);
                });
                resolve();
            }
        });
    });
    return this;
};

Browser.prototype.resize = function(size){
    var tab = this.currentTab();
    this.addAction(function(self){
        return new Promise(function(resolve, reject){
            tab.page.set('viewportSize', size, function(){
                resolve();
            });
        });
    });
    return this;
};

Browser.prototype.render = function(file) {
    var tab = this.currentTab();
    this.addAction(function(self, value){
        return new Promise(function(resolve, reject){
            tab.page.render(file, function(err){
                if (err) return reject();

                resolve(value);
            });
        });
    });
    return this;
};

// UI Interactions

Browser.prototype.select = function(query) {
    this.eval(query, function(query){
        var target = document.querySelector(query);
        if (target) target.focus();
        PHSESSION.$target = target;
    });
    return this;
};

Browser.prototype.fill = function(query, values) {
    if (arguments.length === 1) {
        values = query;
        query = null;
    }

    this.eval(query, values, function(q, v){
        var target;
        if (q) {
            target = document.querySelector(q);
        } else {
            target = PHSESSION.$target;
        }

        if (! target) return false;
        var fireEvent = function() {
            if ("createEvent" in document) {
                var evt = document.createEvent("HTMLEvents");
                evt.initEvent("change", false, true);
                target.dispatchEvent(evt);
            }
            else
                target.fireEvent("onchange");
        };

        if (target.tagName === 'INPUT') {
            if (target.type === 'checkbox' || target.type === 'radio') {
                if (value) {
                    target.setAttribute('checked', 'checked');
                } else {
                    target.removeAttribute('checked');
                }
            } else {
                target.value = v;
            }
            fireEvent();
        } else if (target.tagName === 'TEXTAREA') {
            target.innerText = v;
            fireEvent();
        }

        return true;
    });

    return this;
};



Browser.prototype.wait = function(timeout) {
    var tab = this.currentTab();
    this.addAction(function(){
        return new Promise(function(resolve, reject){
            if (timeout) {
                setTimeout(resolve, timeout);
            } else {
                tab.once('onLoadFinished', resolve);
            }
        });
    });
    return this;
};

Browser.prototype.click = function(query) {
    this.eval(query, function(query){
        var target = query ? document.querySelector(query) : PHSESSION.$target;

        target.click();
    });
    return this;
};

Browser.prototype.submit = function(query) {
    this.eval(query, function(query){
        var form = query ? document.querySelector(query) : PHSESSION.$target;

        form.submit();
    });
    return this;
};

Browser.prototype.macros = function(name, arg) {
    var args = Array.prototype.slice.call(arguments, 1);
    this.exec(function(v, done){
        var macros = this.getMacros(name);
        args.unshift(this);
        macros.apply(this, args);
        done();
    });

    return this;
};

Browser.prototype.getMacros = function(name) {
    var macros = this._macros[name];
    if (! macros) throw new Error("Macros \"name\" not found");

    return macros;
};

Browser.prototype.addMacros = function (name, macros) {
    this._macros[name] = macros;
};

Browser.prototype.exit = function() {
    this.phantom.exit();
};
