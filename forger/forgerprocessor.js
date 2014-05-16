var forgerprocessor = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.logger = this.app.logger;
    this.forgers = {};
    this.lastBlocks = {};
    this.hits = {};
    this.timers = {};
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

    return true;
}

forgerprocessor.prototype.stopForger = function (accountId) {
    if (this.forgers[accountId]) {
        clearInterval(this.timers[accountId]);

        delete this.timers[accountId];
        delete this.forgers[accountId];
        return true;
    } else {
        return false;
    }
}


module.exports.init = function (app) {
    return new forgerprocessor(app);
}