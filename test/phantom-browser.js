/**
 *
 @overview Helpers array tool
 * @author Crypti
 * @license BSD
 * @module PhantomBrowser
 * @title Phantom Browser
 */

var Promise = require('promise');
var phantom = require('phantom');
var chalk = require('chalk');
var EventEmitter = require("events").EventEmitter;
var extend = require('util')._extend;
var inherits = require('util').inherits;
var Url = require('url');

module.exports = Browser;
module.exports.create = function(plugins) {
    return new Browser(plugins);
};

/**
 * Phantom browser-like wrapper
 * @param {{}.<string,function>} plugins Hash of plugin factories.
 * @extends EventEmitter
 * @constructor
 * @example
 *
 * var plugins = {
 *  google : function(search){
 *      browser.googleSearch = function(selector) {
 *          // Download link or img by element selector
 *      };
 *
 *      browser.on('init', function(){
 *          // Do something on browser initialization
 *      });
 *  }
 * };
 * var browser = new Browser(plugins);
 *
 * browser.googleSearch("bitcoin").render().run();
 *
 */
function Browser(plugins) {
    EventEmitter.call(this);

    this._queue = [];
    this._tabs = {};
    this._tabSwitches = [];
    this._tabId = 0;
    this.plugins = plugins || {};
    this._actions = [];
    this._currentTabId = null;
    this.settings = {};
    this.phantom = null;
    this._macros = {};

    var self = this;
    plugins && Object.keys(plugins).forEach(function(key){
        plugins[key](self);
    });
}

inherits(Browser, EventEmitter);

/**
 * Create new tab
 * @param {string=} id Tab id. If empty then browser will set id like tab1, tab2, etc.
 * @returns {{id, id, page: null, loaded: boolean, scope: {}}} Tab object.
 * @private
 */
Browser.prototype._createTab = function(id) {
    if (id && this._tabs.hasOwnProperty(id)) return this._tabs[id];

    id = id || ('tab' + ++ this._tabId);
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
        page: null,
        loaded: false,
        scope: {}
    };

    extend(tab, EventEmitter.prototype);
    EventEmitter.call(tab);


    this._tabs[tab.id] = tab;
    return tab;
};

/**
 * Add phantom page instance when tab is ready.
 * @param {string} tabId
 * @param {Object} page Phantom page instance
 * @private
 */
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
    page.tabId = tabId;
};

/**
 * Add action in queue
 * @param {function(Browser, *)} action Action callback. Should return promise instance.
 * @returns {Browser}
 */
Browser.prototype.addAction = function(action) {
    this._actions.push(action);

    return this;
};

/**
 * Finalize action sequence in queue object.
 * @returns {Array.<function>}
 * @private
 */
Browser.prototype._finalizeActions = function() {
    var actions = this._actions.slice();
    if (! this.phantom) {
        this.phantom = true;
        actions.unshift(function(self){
            return new Promise(function(resolve, reject){
                phantom.create(function(phantom){
                    self.phantom = phantom;
                    self.emit('init', phantom);
                    resolve();
                });
            });
        });
    }

    return actions;
};

/**
 * Complete sequence and run it actions.
 * @param {function(this:Browser, Error|null, *|undefined)=} callback Result callback. Optional
 * @example
 * // Make site screenshot every 10 seconds.
 *
 * // Open page
 * browser
 *  .openTab()
 *  .goto("page")
 *  .wait()
 *  .run(function(err){
 *      if (err) return console.error(err);
 *
 *      var i = 0;
 *      setInterval(function(){
 *          i++;
 *          browser.render('snapshot-' + i + '.png).run();
 *      }, 10000);
 *  });
 *
 *  // Grab content of the same tab in second sequence
 *  browser
 *      .eval(function(){
 *          return document.innerHTML
 *      })
 *      .run(function(err, content){
 *          if (err) return console.error(err);
 *
 *          console.log(content);
 *      });
 *
 */
Browser.prototype.run = function(callback) {

    var actions = this._finalizeActions();
    this._actions = [];

    this._queue.push({actions:actions, callback:callback});

    if (this.busy) return;

    this._runQueue();
};

/**
 * Iterate over async queue.
 * @private
 */
Browser.prototype._runQueue = function() {
    var queue = this._queue.shift();
    var actions = queue.actions;
    var callback = queue.callback;
    var self = this;

    this.activeQueue = queue;
    function finish(err, result) {
        self.activeQueue = null;

        setImmediate(function(){
            if (err) self.emit('error', err);
            callback && callback.call(self, err, result);
        });

        if (self._queue.length) {
            setImmediate(self._runQueue.bind(self));
        } else {
            self.busy = false;
        }
    }

    function loop(err, value) {
        if (err) return finish(err);
        if (! actions.length) return finish(null, value);

        var result;
        try {
            var action = actions.shift();
            result = action(self, value);
        } catch (err){
            finish(err);
        }

        if (result instanceof Promise) {
            result
                .then(loop.bind(null, null), loop)
                .catch(finish);
        } else {
            setImmediate(loop, null, result);
        }
    }

    self.busy = true;
    loop();
};

/**
 * Add macros call to action sequence.
 *
 * @param {string} name Macros name
 * @param {*} arg Argument(s) to pass into macros
 * @returns {Browser}
 */
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

/**
 * Get macros by name.
 * @param {string} name Macros name
 * @returns {*}
 */
Browser.prototype.getMacros = function(name) {
    var macros = this._macros[name];
    if (! macros) throw new Error("Macros \"" + name + "\" not found");

    return macros;
};

/**
 * Add new macros to browser instance.
 * @param {string} name Macros name
 * @param {function(this:Browser, Browser, *)} macros Macros function
 * @example
 *
 * browser.addMacros("login-in", function(browser, login, password){
 *  browser
 *      .select("#sign-in .login")
 *      .fill(login)
 *      .select("#sign-in .password)
 *      .fill(password)
 *      .click("#sign-in .success")
 * });
 */
Browser.prototype.addMacros = function (name, macros) {
    this._macros[name] = macros;
};

/**
 * Close browser and phantom session
 */
Browser.prototype.exit = function() {
    this.phantom.exit();
    this._actions = [];
    this._queue = [];
};

// ----------------------------------------------------------------------------------------

/**
 * Return active tab
 * @returns {*} Tab object
 */
Browser.prototype.currentTab = function() {
    return this._tabs[this._currentTabId];
};

/**
 * Open new tab action.
 * @param {string=} id New tab id. Optional. Default is `tab1`, `tab2`, etc.
 * @returns {Browser}
 */
Browser.prototype.openTab = function(id) {
    // TODO Trigger error on duplicate tab Id
    var tab = this._createTab(id);
    this._currentTabId = tab.id;

    this.addAction(function(self){
        return new Promise(function(resolve, reject){
            self.phantom.createPage(function(page){
                self._initializeTab(tab.id, page);
                self.emit('tabReady', tab);

                resolve();
            });
        });
    });

    return this;
};

/**
 * Close tab action.
 * @returns {Browser}
 */
Browser.prototype.closeTab = function(tabId) {
    var self = this;
    var tab;

    if (tabId) {
        if (! tabId in this._tabs) return this;

        tab = this._tabs[tabId];
    } else {
        tabId = this._currentTabId;
        tab = this.currentTab();
    }


    var openTabs = Object.keys(this._tabs).filter(function(tabId){
        return ! self._tabs[tabId].isClosing;
    });

    var nextTabId, index;

    if (openTabs.length > 1) {
        index = openTabs.indexOf(tabId);
        if (index === openTabs.length - 1) {
            nextTabId = openTabs[index - 1];
        } else {
            nextTabId = openTabs[index + 1];
        }
    }

    tab.isClosing = true;


    this.addAction(function(){
        return new Promise(function(resolve){
            tab.scope = {};
            tab.page.close();

            delete self._tabs[tabId];

            resolve();
        });
    });

    if (nextTabId) {
        this.switchTab(nextTabId);
    }

    return this;
};

/**
 * Switch current tab.
 * @param {string} tabId Tab id.
 * @returns {Browser}
 */
Browser.prototype.switchTab = function(tabId) {
    if (tabId === this._currentTabId) return this;

    if (tabId in this._tabs === false) {
        throw new Error("Unknown tab '" + tabId + "'.");
    }

    if (this._tabs[tabId].isClosing) {
        throw new Error("Switching to closing tab '" + tabId + "'.");
    }

    this._tabSwitches.push(this._currentTabId);
    this._currentTabId = tabId;
    return this;
};

/**
 * Repeat actions till get the True.
 * @param {number} repeat Max repeat count
 * @param {function} callback
 * @returns {Browser}
 */
Browser.prototype.until = function(repeat, callback) {
    this
        .actions(callback)
        .exec(function(value, done){
            if (! value) {
                if (--repeat) {
                    this.until(repeat, callback);
                } else {
                    done(null, false);
                }
            } else {
                done(null, true);
            }
        });
    return this;
};

/**
 * Wait for event or timeout.
 * @param {string|Number=} await Timeout delay or event name. Optional. Default is `onLoadFinished`
 * @returns {Browser}
 */
Browser.prototype.wait = function(await) {
    var tab = this.currentTab();
    this.addAction(function(){
        return new Promise(function(resolve, reject){
            if (typeof await === "number") {
                return setTimeout(resolve, await);
            }

            tab.once(await || 'onLoadFinished', resolve);
            // Reject after 20 seconds
            setTimeout(reject, 20000);
        });
    });
    return this;
};

/**
 * Execute function in actions sequence.
 * @param {function(this:Browser, *, function())} callback Custom async callback to execute in actions sequence.
 * @returns {Browser}
 */
Browser.prototype.exec = function(callback){
    var tab = this.currentTab();

    this.addAction(function(self, value){
        return new Promise(function(resolve, reject){
            var B = Object.create(self);

            B._currentTabId = tab.id;
            B._actions = [];

            var result = callback.call(B, value, function(err, value){
                err ? reject(err) : resolve(value);
            });

            if (B._actions.length) {
                B._actions.reverse().forEach(function(fn){
                    self.activeQueue.actions.unshift(fn);
                });
                // Pass value to next promise
                resolve(value);
            } else if (callback.length < 2) {
                resolve(result);
            }
        });
    });
    return this;
};

/**
 * Action to add actions to sequence.
 * @param {function(this:Browser, *)} callback Actions sequence creator function.
 * @returns {Browser}
 * @example
 * browser.actions(function(value){
 *  value ? this.submit() : this.render('./invalid-form.png').goBack();
 * });
 */
Browser.prototype.actions = function(callback) {
    var tab = this.currentTab();
    this.addAction(function(self, value){
        return new Promise(function(resolve, reject){
            var B = Object.create(self);

            B._currentTabId = tab.id;
            B._actions = [];

            callback.call(B, value);

            B._actions.reverse().forEach(function(fn){
                self.activeQueue.actions.unshift(fn);
            });

            resolve(value);
        });
    });
    return this;
};

/**
 * Evaluate code action.
 * @param {*=} arg Argument to pass into browser.
 * @param {function|string} code Code to run in active tab.
 * @returns {Browser}
 */
Browser.prototype.eval = function(arg, code) {
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

/**
 * Async function evaluation
 * @param {function|string} code Code to run in active tab.
 * @returns {Browser}
 */
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
        });
    });
    return this;
};

/**
 * Load url action.
 * @param {string|object} url Location url or path. Could `url.format` object.
 * @returns {Browser}
 */
Browser.prototype.goto = function(url) {
    var tab = this.currentTab();
    this.addAction(function(self){
        tab.loaded = false;
        return new Promise(function(resolve, reject){
            if (typeof url === "object") {
                url = Url.format(url);
            }
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

/**
 * Reload current tab action.
 * @returns {Browser}
 */
Browser.prototype.reload = function() {
    var tab = this.currentTab();
    this.addAction(function(self, value){
        return new Promise(function(resolve, reject){
            tab.page.reload();
            resolve(value);
        });
    });
    return this;
};


/**
 * Define internal variable action. This value will be passed to each tab page. All values accessible from window.PHSESSION.
 * @param {string} name Internal variable name.
 * @param {*|!function} value Any value to pass into the browser scope.
 * @returns {Browser}
 */
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

/**
 * Get internal variable action. Get value from tab scope.
 * @param {string} name Variable name.
 * @returns {Browser}
 */
Browser.prototype.get = function(name) {
    this.eval(name, function(name){
        return window.PHSESSION[name];
    });
    return this;
};

/**
 * Dump previous action value to console.
 * @param {string=} format Format/prefix string.
 * @returns {Browser}
 */
Browser.prototype.dump = function(format) {
    this.addAction(function(self, value){
        console.log(format||"", require('util').inspect(value));
        return Promise.resolve(value);
    });
    return this;
};


/**
 * Resize action.
 * @param {string|number|{width:Number,height:Number}} width Viewport width.
 * @param {number} height Viewport height.
 * @returns {Browser}
 */
Browser.prototype.resize = function(width, height){
    var tab = this.currentTab();
    var size;
    if (arguments.length < 2) {
        if (typeof width === "string") {
            if (! /^\d+(x\d+)?$/.test(width)) {
                throw new Error("Size format is")
            }
            var parts = size.split('x');
            if (parts.length < 2) {
                parts[1] = parts[0];
            }

            size = {
                width : parts[0],
                width : parts[1]
            }
        } else if (typeof width === "object"){
            size = width;
        } else {
            size = {
                width : width,
                height : width
            };
        }
    } else {
        size = {
            width : width,
            height : height
        };
    }



    this.addAction(function(self){
        return new Promise(function(resolve, reject){
            tab.page.set('viewportSize', size, function(){
                resolve();
            });
        });
    });
    return this;
};

/**
 * Render action. Make tab screenshot.
 * @param {string} file Screenshot filename.
 * @returns {Browser}
 */
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

/**
 * Select HTML element and trigger focus event.
 * @param {string} query CSS selector of target element
 * @returns {Browser}
 */
Browser.prototype.select = function(query) {
    this.eval(query, function(query){
        var target = document.querySelector(query);
        if (! target) return false;

        target.focus();
        PHSESSION.$target = target;
        return true;
    });
    return this;
};

/**
 * Fill form or input with values.
 * @param {string=} query CSS selector of target element.
 * @param {*} values Value to set.
 * @returns {Browser}
 * @example
 *
 * browser
 *  .select("#login-input")
 *  .fill("admin");
 */
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
            var evt = document.createEvent("HTMLEvents");
            evt.initEvent("change", false, true);
            target.dispatchEvent(evt);
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

/**
 * Emit click event on element
 * @param {string=} query CSS selector of target element. Optional. If not set use current selected element.
 * @returns {Browser}
 */
Browser.prototype.click = function(query) {
    this.eval(query, function(query){

        var target = query ? document.querySelector(query) : PHSESSION.$target;

        if (! target) return false;

        var evt = document.createEvent("HTMLEvents");
        evt.initEvent("click", false, true);
        target.dispatchEvent(evt);

        return true;
    });
    return this;
};

/**
 * Submit action.
 * @param {string=} query CSS selector of target element. Optional. If not set use current select element.
 * @returns {Browser}
 */
Browser.prototype.submit = function(query) {
    this.eval(query, function(query){
        var form = query ? document.querySelector(query) : PHSESSION.$target;

        form.submit();
    });
    return this;
};

/**
 * Get element text content action. Get text content of node matched css selector.
 * @param {string=} query CSS selector of target element. Optional. If not set use current select elemnet.
 * @returns {Browser}
 */
Browser.prototype.text = function(query) {
    this.eval(query, function(query){
        var target = query ? document.querySelector(query) : PHSESSION.$target;

        if (! target) return null;

        return target.textContent;
    });

    return this;
};

/**
 * Get element html action. Get html of node matched css selector.
 * @param {string=} query CSS selector of target element. Optional. If not set use current select elemnet.
 * @returns {Browser}
 */
Browser.prototype.html = function(query) {
    this.eval(query, function(query){
        var target = query ? document.querySelector(query) : PHSESSION.$target;

        if (! target) return null;

        return target.innerHTML;
    });

    return this;
};