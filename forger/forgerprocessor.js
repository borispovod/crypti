var forgerprocessor = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.logger = this.app.logger;
    this.forgers = {};
    this.db = app.db;
    this.addressprocessor = this.app.addressprocessor;
    this.lastBlocks = {};
    this.hits = {};
    this.timers = {};
    this.sendingTimers = {};
}

forgerprocessor.prototype.getForgers = function (id) {
    return this.forgers[id];
}

forgerprocessor.prototype.startForger = function (forger) {
    if (this.forgers[forger.accountId]) {
        return false;
    }

    this.forgers[forger.accountId] = forger;
    forger.startForge();

    this.timers[forger.accountId] = setInterval(function () {
        forger.startForge();
    }, 1000);

    this.sendingTimers[forger.accountId] = setInterval(function () {
        forger.sendRequest();
    }, 1000 * 10);

    return true;
}

forgerprocessor.prototype.stopForger = function (accountId) {
    if (this.forgers[accountId]) {
        clearInterval(this.timers[accountId]);
        clearInterval(this.sendingTimers[accountId]);

        delete this.timers[accountId];
        delete this.forgers[accountId];
        delete this.sendingTimers[accountId];
        return true;
    } else {
        return false;
    }
}


module.exports.init = function (app) {
    return new forgerprocessor(app);
}