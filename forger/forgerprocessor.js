var forgerprocessor = function () {
    this.forgers = {};
}

forgerprocessor.prototype.getProcessor = function (id, cb) {
    if (cb) {
        cb(this.forgers[id]);
    } else {
        return this.forgers[id];
    }
}

module.exports = forgerprocessor;